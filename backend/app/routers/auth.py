import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    ActivityLog,
    ChildProfile,
    ParentChildRelationship,
    ParentProfile,
    Role,
    ScreenTimeSetting,
    Subscription,
    User,
)
from app.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.services.child_state import check_child_suspension, is_child_online

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


class RegisterParentRequest(BaseModel):
    email: str
    username: str
    full_name: str
    password: str = Field(min_length=6)
    phone_number: Optional[str] = None
    parental_consent_given: bool = True
    preferred_language: str = "rw"


class LoginRequest(BaseModel):
    identifier: str  # email or username
    password: str


class ChildQuickLoginRequest(BaseModel):
    child_id: int
    pin_code: str
    device_id: Optional[str] = None


class ChildParentCodeLoginRequest(BaseModel):
    parent_identifier: str  # parent's username or email
    pin_code: str
    device_id: Optional[str] = None


class RefreshTokenRequest(BaseModel):
    refresh_token: str


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_parent(req: RegisterParentRequest, db: Session = Depends(get_db)):
    if not req.parental_consent_given:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Explicit parental consent is required to register an account.",
        )
    existing = (
        db.query(User)
        .filter((User.email == req.email) | (User.username == req.username))
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email or username already registered",
        )
    parent_role = db.query(Role).filter(Role.name == "PARENT").first()
    if not parent_role:
        parent_role = Role(name="PARENT", description="Parent/Guardian")
        db.add(parent_role)
        db.flush()

    user = User(
        email=req.email,
        username=req.username,
        full_name=req.full_name,
        password_hash=hash_password(req.password),
        role_id=parent_role.id,
        role_name="PARENT",
    )
    db.add(user)
    db.flush()

    p_profile = ParentProfile(
        user_id=user.id,
        phone_number=req.phone_number,
        parental_consent_given=True,
        consent_timestamp=datetime.datetime.now(datetime.timezone.utc),
        preferred_language=req.preferred_language,
    )
    db.add(p_profile)
    db.flush()

    db.add(Subscription(parent_id=p_profile.id))
    db.add(
        ActivityLog(
            actor_user_id=user.id,
            action_type="REGISTER_PARENT",
            resource_type="user",
            resource_id=str(user.id),
            summary=f"Parent account registered: {user.email}",
        )
    )
    db.commit()

    access_token = create_access_token(subject=user.username, role=user.role_name, user_id=user.id)
    refresh_token = create_refresh_token(subject=user.username, role=user.role_name, user_id=user.id)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role_name,
        },
    }


@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = (
        db.query(User)
        .filter((User.email == req.identifier) | (User.username == req.identifier))
        .first()
    )
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username/email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )
    if user.is_suspended:
        now = datetime.datetime.now(datetime.timezone.utc)
        until = user.suspended_until
        if until is not None and until.tzinfo is None:
            until = until.replace(tzinfo=datetime.timezone.utc)
        if until is not None and until <= now:
            user.is_suspended = False
            user.suspended_until = None
            user.suspension_reason = None
            db.commit()
        else:
            until_str = f" until {until.strftime('%Y-%m-%d %H:%M UTC')}" if until else " indefinitely"
            reason_str = f" Reason: {user.suspension_reason}" if user.suspension_reason else ""
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Account suspended{until_str}.{reason_str}",
            )

    user.last_active_at = datetime.datetime.now(datetime.timezone.utc)
    user.current_activity = "Signed in"

    child_profile_id = None
    if user.role_name == "CHILD" and user.child_profile:
        suspended, susp_msg = check_child_suspension(user.child_profile, db)
        if suspended:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=susp_msg)
        child_profile_id = user.child_profile.id

    access_token = create_access_token(
        subject=user.username,
        role=user.role_name,
        user_id=user.id,
        child_profile_id=child_profile_id,
    )
    refresh_token = create_refresh_token(
        subject=user.username,
        role=user.role_name,
        user_id=user.id,
    )
    db.add(
        ActivityLog(
            actor_user_id=user.id,
            child_id=child_profile_id,
            action_type="LOGIN",
            resource_type="user",
            resource_id=str(user.id),
            summary=(
                f"Child account #{user.id} signed in"
                if user.role_name == "CHILD"
                else f"User {user.username} ({user.role_name}) signed in"
            ),
        )
    )
    db.commit()
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role_name,
            "child_profile_id": child_profile_id,
        },
    }


@router.post("/child-login")
def child_login_with_parent_code(req: ChildParentCodeLoginRequest, db: Session = Depends(get_db)):
    """Authenticate a child directly using their Parent's username/email + their personal PIN code."""
    ident = req.parent_identifier.strip()
    pin = req.pin_code.strip()
    if not ident or not pin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Parent username and child access code are required",
        )

    parent_user = (
        db.query(User)
        .filter(
            (User.username.ilike(ident)) | (User.email.ilike(ident)),
            User.role_name.in_(["PARENT", "SUPER_ADMIN"]),
        )
        .first()
    )
    if not parent_user or not parent_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid parent username or child access code",
        )

    parent_profile = db.query(ParentProfile).filter(ParentProfile.user_id == parent_user.id).first()
    if not parent_profile:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid parent username or child access code",
        )

    links = (
        db.query(ParentChildRelationship)
        .filter(ParentChildRelationship.parent_id == parent_profile.id)
        .all()
    )
    child_ids = [lnk.child_id for lnk in links]
    child = (
        db.query(ChildProfile)
        .filter(ChildProfile.id.in_(child_ids), ChildProfile.pin_code == pin)
        .first()
        if child_ids
        else None
    )
    if not child:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid parent username or child access code",
        )
    if not child.parent_consent_approved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Parental consent is required for this child profile",
        )
    suspended, susp_msg = check_child_suspension(child, db)
    if suspended:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=susp_msg)

    child.last_seen_at = datetime.datetime.now(datetime.timezone.utc)
    child.current_activity = "Browsing Child World"
    child.active_device_id = (req.device_id or "").strip() or f"child-device-{child.id}"

    access_token = create_access_token(
        subject=f"child:{child.id}",
        role="CHILD",
        user_id=child.user_id or parent_user.id,
        child_profile_id=child.id,
    )
    db.add(
        ActivityLog(
            actor_user_id=parent_user.id,
            child_id=child.id,
            action_type="CHILD_CODE_LOGIN",
            resource_type="child_profile",
            resource_id=str(child.id),
            summary=f"Child profile #{child.id} signed in with parent access code",
        )
    )
    db.commit()
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": child.user_id or parent_user.id,
            "username": parent_user.username,
            "full_name": child.display_name,
            "role": "CHILD",
            "child_profile_id": child.id,
        },
        "child": {
            "id": child.id,
            "display_name": child.display_name,
            "avatar": child.avatar,
            "age_group": child.age_group,
            "preferred_language": child.preferred_language,
            "total_stars": child.total_stars,
            "current_level": child.current_level,
            "role": "CHILD",
        },
    }


@router.post("/child-session")
def child_pin_session(
    req: ChildQuickLoginRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Switch a Parent or Child session into a strictly scoped CHILD token for the selected child profile."""
    child = db.query(ChildProfile).filter(ChildProfile.id == req.child_id).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child profile not found")

    # Verify ownership if parent
    if current_user.role_name == "PARENT":
        parent = db.query(ParentProfile).filter(ParentProfile.user_id == current_user.id).first()
        link = (
            db.query(ParentChildRelationship)
            .filter(
                ParentChildRelationship.parent_id == (parent.id if parent else -1),
                ParentChildRelationship.child_id == child.id,
            )
            .first()
        )
        if not link:
            raise HTTPException(status_code=403, detail="Not authorized for this child profile")

    if child.pin_code != req.pin_code:
        raise HTTPException(status_code=401, detail="Invalid child PIN code")
    if not child.parent_consent_approved:
        raise HTTPException(status_code=403, detail="Parental consent is required for this child profile")

    suspended, susp_msg = check_child_suspension(child, db)
    if suspended:
        raise HTTPException(status_code=403, detail=susp_msg)

    req_device = (req.device_id or "").strip()
    if is_child_online(child) and child.active_device_id and child.active_device_id != req_device:
        act = child.current_activity or "Online"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{child.display_name} arimo gukoresha iyi konti ku kindi gikoresho ({act}). Ntabwo wakwinjira mu izina rye ubu.",
        )

    child.last_seen_at = datetime.datetime.now(datetime.timezone.utc)
    child.current_activity = "Browsing Child World"
    child.active_device_id = req_device or f"parent-launch-{child.id}"
    db.commit()

    access_token = create_access_token(
        subject=f"child:{child.id}",
        role="CHILD",
        user_id=current_user.id,
        child_profile_id=child.id,
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "child": {
            "id": child.id,
            "display_name": child.display_name,
            "avatar": child.avatar,
            "age_group": child.age_group,
            "preferred_language": child.preferred_language,
            "total_stars": child.total_stars,
            "current_level": child.current_level,
            "role": "CHILD",
        },
    }


@router.post("/refresh")
def refresh_access_token(req: RefreshTokenRequest, db: Session = Depends(get_db)):
    payload = decode_refresh_token(req.refresh_token)
    user = db.query(User).filter(User.id == payload.get("uid")).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User inactive or not found")
    new_access = create_access_token(subject=user.username, role=user.role_name, user_id=user.id)
    new_refresh = create_refresh_token(subject=user.username, role=user.role_name, user_id=user.id)
    return {
        "access_token": new_access,
        "refresh_token": new_refresh,
        "token_type": "bearer",
    }


@router.get("/me")
def get_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    effective_role = getattr(user, "_token_role", user.role_name)
    child_profile_id = getattr(user, "_token_child_profile_id", None)
    child_data = None
    if child_profile_id:
        ch = db.query(ChildProfile).filter(ChildProfile.id == child_profile_id).first()
        if ch:
            child_data = {
                "id": ch.id,
                "display_name": ch.display_name,
                "avatar": ch.avatar,
                "age_group": ch.age_group,
                "preferred_language": ch.preferred_language,
                "total_stars": ch.total_stars,
                "current_level": ch.current_level,
            }
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "full_name": user.full_name,
        "role": effective_role,
        "base_role": user.role_name,
        "child_profile_id": child_profile_id,
        "child_profile": child_data,
    }
