import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    ActivityLog,
    ChildProfile,
    Game,
    ParentChildRelationship,
    PlatformRule,
    Role,
    Storybook,
    User,
    UserNotification,
)
from app.security import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    hash_password,
    require_roles,
)
from app.services.child_state import is_child_online

router = APIRouter(prefix="/api/v1/users", tags=["Users Management & Control Panel"])

DEFAULT_PLATFORM_RULES = [
    {
        "code": "CHILD_SAFETY",
        "title": "Child Safety & Age-Appropriate Content",
        "description": "All content, games, books, and videos must remain safe, respectful, and appropriate for children.",
        "severity": "critical",
        "default_action": "suspend_30d",
    },
    {
        "code": "ACCOUNT_SHARING",
        "title": "No Unauthorized Account Sharing",
        "description": "Parent, Creator, and Admin accounts must not be shared outside authorized family or team members.",
        "severity": "medium",
        "default_action": "warning",
    },
    {
        "code": "ABUSE_SPAM",
        "title": "No Abuse, Spam, or Score Tampering",
        "description": "Attempting to manipulate scores, spam requests, or abuse platform features is prohibited.",
        "severity": "high",
        "default_action": "suspend_7d",
    },
    {
        "code": "CREATOR_QUALITY",
        "title": "Creator Publishing Guidelines",
        "description": "Creators must validate games, books, and videos for accuracy and sandbox safety before publishing.",
        "severity": "low",
        "default_action": "warning",
    },
    {
        "code": "REPEATED_VIOLATIONS",
        "title": "3-Strike Rule (Automatic Suspension)",
        "description": "Accumulating 3 official warnings results in temporary account suspension or permanent removal.",
        "severity": "critical",
        "default_action": "delete",
    },
]


class CreateUserRequest(BaseModel):
    email: str
    username: str
    full_name: str
    password: str = Field(min_length=4)
    role_name: str = "CONTENT_ADMIN"


class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    role_name: Optional[str] = None
    is_active: Optional[bool] = None


class ResetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=4)


class ResetChildPinRequest(BaseModel):
    new_pin: str = Field(min_length=4, max_length=20)


class SuspendUserRequest(BaseModel):
    hours: Optional[int] = None  # None = indefinite/permanent until unsuspended
    reason: str = "Violation of platform rules"
    rule_violated: Optional[str] = None
    also_suspend_children: bool = False


class SendNotificationRequest(BaseModel):
    message_type: str = "message"  # message | alert | warning
    title: str
    body: str
    rule_violated: Optional[str] = None
    auto_suspend_hours: Optional[int] = None


class CreateRuleRequest(BaseModel):
    code: str
    title: str
    description: str
    severity: str = "medium"  # low, medium, high, critical
    default_action: str = "warning"  # warning, suspend_24h, suspend_7d, suspend_30d, delete


def _ensure_default_rules(db: Session):
    if db.query(PlatformRule).count() == 0:
        for r in DEFAULT_PLATFORM_RULES:
            db.add(PlatformRule(**r))
        db.commit()


def _serialize_rule(r: PlatformRule) -> dict:
    return {
        "id": r.id,
        "code": r.code,
        "title": r.title,
        "description": r.description,
        "severity": r.severity,
        "default_action": r.default_action,
        "is_active": r.is_active,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def _serialize_notification(n: UserNotification) -> dict:
    return {
        "id": n.id,
        "user_id": n.user_id,
        "message_type": n.message_type,
        "title": n.title,
        "body": n.body,
        "rule_violated": n.rule_violated,
        "is_read": n.is_read,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


def _serialize_child_for_admin(
    c: ChildProfile, parent_user: Optional[User] = None, db: Optional[Session] = None
) -> dict:
    recent_acts = []
    if db is not None:
        logs = (
            db.query(ActivityLog)
            .filter(ActivityLog.child_id == c.id)
            .order_by(ActivityLog.id.desc())
            .limit(8)
            .all()
        )
        recent_acts = [
            {
                "id": lg.id,
                "action_type": lg.action_type,
                "summary": lg.summary,
                "created_at": lg.created_at.isoformat() if lg.created_at else None,
            }
            for lg in logs
        ]
    return {
        "id": c.id,
        "display_name": c.display_name,
        "label": c.display_name or f"Child #{c.id}",
        "pin_code": c.pin_code,
        "avatar": c.avatar,
        "age": c.age,
        "age_group": c.age_group,
        "preferred_language": c.preferred_language,
        "total_stars": c.total_stars,
        "current_level": c.current_level,
        "daily_limit_minutes": c.screen_time.daily_limit_minutes if c.screen_time else 60,
        "used_today_minutes": c.screen_time.used_today_minutes if c.screen_time else 0,
        "is_online": is_child_online(c),
        "current_activity": c.current_activity or "Idle",
        "last_seen_at": c.last_seen_at.isoformat() if c.last_seen_at else None,
        "is_suspended": c.is_suspended,
        "suspended_until": c.suspended_until.isoformat() if c.suspended_until else None,
        "suspension_reason": c.suspension_reason,
        "parent_user_id": parent_user.id if parent_user else None,
        "parent_name": parent_user.full_name if parent_user else "Unlinked",
        "parent_username": parent_user.username if parent_user else "",
        "parent_email": parent_user.email if parent_user else "",
        "recent_activities": recent_acts,
    }


@router.get("")
def list_users(
    role: Optional[str] = None,
    admin: User = Depends(require_roles(["SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    q = db.query(User)
    if role:
        q = q.filter(User.role_name == role)
    users = q.order_by(User.id.asc()).all()
    return [
        {
            "id": u.id,
            "email": f"hidden_child_{u.id}@private" if u.role_name == "CHILD" else u.email,
            "username": f"child_{u.id}" if u.role_name == "CHILD" else u.username,
            "full_name": f"Child Account #{u.id} (Private)" if u.role_name == "CHILD" else u.full_name,
            "role": u.role_name,
            "is_active": u.is_active,
            "is_suspended": u.is_suspended,
            "suspended_until": u.suspended_until.isoformat() if u.suspended_until else None,
            "suspension_reason": u.suspension_reason,
            "warning_count": u.warning_count,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


@router.get("/control-panel")
def get_users_control_panel(
    admin: User = Depends(require_roles(["SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    """Full Super Admin Control Panel for Admins, Creators, Parents, Children, Activity & Discipline Rules."""
    _ensure_default_rules(db)
    all_users = db.query(User).order_by(User.id.asc()).all()
    all_children = db.query(ChildProfile).order_by(ChildProfile.id.asc()).all()
    rules = db.query(PlatformRule).filter(PlatformRule.is_active.is_(True)).order_by(PlatformRule.id.asc()).all()

    # Map child_id -> parent User
    child_to_parent: dict[int, User] = {}
    for link in db.query(ParentChildRelationship).all():
        if link.parent and link.parent.user:
            child_to_parent[link.child_id] = link.parent.user

    users_payload = []
    for u in all_users:
        if u.role_name == "CHILD":
            continue  # Children are shown in the dedicated Children section & under their Parent
        recent_logs = (
            db.query(ActivityLog)
            .filter(ActivityLog.actor_user_id == u.id)
            .order_by(ActivityLog.id.desc())
            .limit(10)
            .all()
        )
        notifs = (
            db.query(UserNotification)
            .filter(UserNotification.user_id == u.id)
            .order_by(UserNotification.id.desc())
            .limit(10)
            .all()
        )
        games_created = db.query(Game).filter(Game.created_by_id == u.id).count()
        books_created = db.query(Storybook).filter(Storybook.created_by_id == u.id).count()

        parent_children = []
        parent_meta = None
        if u.role_name == "PARENT" and u.parent_profile:
            pp = u.parent_profile
            parent_meta = {
                "phone_number": pp.phone_number or "",
                "preferred_language": pp.preferred_language,
                "parental_consent_given": pp.parental_consent_given,
            }
            for link in pp.child_links:
                if link.child:
                    parent_children.append(_serialize_child_for_admin(link.child, u, db))

        latest_act = recent_logs[0].summary if recent_logs else (u.current_activity or "No recent activity")
        users_payload.append(
            {
                "id": u.id,
                "email": u.email,
                "username": u.username,
                "full_name": u.full_name,
                "role": u.role_name,
                "is_active": u.is_active,
                "is_suspended": u.is_suspended,
                "suspended_until": u.suspended_until.isoformat() if u.suspended_until else None,
                "suspension_reason": u.suspension_reason,
                "warning_count": u.warning_count,
                "last_active_at": (
                    u.last_active_at.isoformat()
                    if u.last_active_at
                    else (recent_logs[0].created_at.isoformat() if recent_logs and recent_logs[0].created_at else None)
                ),
                "current_activity": latest_act,
                "password_status": "Protected (Hashed) — Resettable by Super Admin",
                "stats": {
                    "games_created": games_created,
                    "books_created": books_created,
                    "activity_count": db.query(ActivityLog).filter(ActivityLog.actor_user_id == u.id).count(),
                },
                "parent_profile": parent_meta,
                "children": parent_children,
                "recent_activities": [
                    {
                        "id": lg.id,
                        "action_type": lg.action_type,
                        "resource_type": lg.resource_type,
                        "summary": lg.summary,
                        "created_at": lg.created_at.isoformat() if lg.created_at else None,
                    }
                    for lg in recent_logs
                ],
                "notifications": [_serialize_notification(n) for n in notifs],
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
        )

    children_payload = [_serialize_child_for_admin(c, child_to_parent.get(c.id), db) for c in all_children]

    return {
        "summary": {
            "admins": sum(1 for u in users_payload if u["role"] == "SUPER_ADMIN"),
            "creators": sum(1 for u in users_payload if u["role"] == "CONTENT_ADMIN"),
            "parents": sum(1 for u in users_payload if u["role"] == "PARENT"),
            "children": len(children_payload),
            "suspended_accounts": sum(1 for u in users_payload if u["is_suspended"])
            + sum(1 for c in children_payload if c["is_suspended"]),
            "total_warnings": sum(u["warning_count"] for u in users_payload),
            "active_rules": len(rules),
        },
        "users": users_payload,
        "children": children_payload,
        "rules": [_serialize_rule(r) for r in rules],
    }


@router.get("/me/notifications")
def get_my_notifications(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notifs = (
        db.query(UserNotification)
        .filter(UserNotification.user_id == user.id)
        .order_by(UserNotification.id.desc())
        .limit(20)
        .all()
    )
    return [_serialize_notification(n) for n in notifs]


@router.post("/me/notifications/{notif_id}/read")
def mark_notification_read(
    notif_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    n = (
        db.query(UserNotification)
        .filter(UserNotification.id == notif_id, UserNotification.user_id == user.id)
        .first()
    )
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True
    db.commit()
    return _serialize_notification(n)


@router.get("/rules")
def list_platform_rules(
    admin: User = Depends(require_roles(["SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    _ensure_default_rules(db)
    rules = db.query(PlatformRule).filter(PlatformRule.is_active.is_(True)).order_by(PlatformRule.id.asc()).all()
    return [_serialize_rule(r) for r in rules]


@router.post("/rules", status_code=status.HTTP_201_CREATED)
def create_platform_rule(
    req: CreateRuleRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    code = req.code.strip().upper().replace(" ", "_")
    if not code or db.query(PlatformRule).filter(PlatformRule.code == code).first():
        raise HTTPException(status_code=400, detail="Rule code is empty or already exists")
    rule = PlatformRule(
        code=code,
        title=req.title.strip(),
        description=req.description.strip(),
        severity=req.severity if req.severity in {"low", "medium", "high", "critical"} else "medium",
        default_action=req.default_action
        if req.default_action in {"warning", "suspend_24h", "suspend_7d", "suspend_30d", "delete"}
        else "warning",
        is_active=True,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _serialize_rule(rule)


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_platform_rule(
    rule_id: int,
    admin: User = Depends(require_roles(["SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    rule = db.query(PlatformRule).filter(PlatformRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()


@router.post("", status_code=status.HTTP_201_CREATED)
def create_user(
    req: CreateUserRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    role_obj = db.query(Role).filter(Role.name == req.role_name).first()
    if not role_obj:
        raise HTTPException(status_code=400, detail=f"Invalid role: {req.role_name}")
    if db.query(User).filter((User.email == req.email) | (User.username == req.username)).first():
        raise HTTPException(status_code=400, detail="Email or username already exists")

    new_user = User(
        email=req.email,
        username=req.username,
        full_name=req.full_name,
        password_hash=hash_password(req.password),
        role_id=role_obj.id,
        role_name=role_obj.name,
        is_active=True,
    )
    db.add(new_user)
    db.flush()
    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="CREATE_USER",
            resource_type="user",
            resource_id=str(new_user.id),
            summary=f"Created user {new_user.username} with role {new_user.role_name}",
        )
    )
    db.commit()
    return {
        "id": new_user.id,
        "email": new_user.email,
        "username": new_user.username,
        "full_name": new_user.full_name,
        "role": new_user.role_name,
        "is_active": new_user.is_active,
    }


@router.patch("/{user_id}")
def update_user(
    user_id: int,
    req: UpdateUserRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if req.full_name is not None:
        u.full_name = req.full_name
    if req.is_active is not None:
        u.is_active = req.is_active
    if req.role_name is not None:
        role_obj = db.query(Role).filter(Role.name == req.role_name).first()
        if not role_obj:
            raise HTTPException(status_code=400, detail="Invalid role")
        u.role_id = role_obj.id
        u.role_name = role_obj.name
    db.commit()
    return {
        "id": u.id,
        "email": u.email,
        "username": u.username,
        "full_name": u.full_name,
        "role": u.role_name,
        "is_active": u.is_active,
    }


@router.post("/{user_id}/reset-password")
def reset_user_password(
    user_id: int,
    req: ResetPasswordRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u.password_hash = hash_password(req.new_password)
    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="RESET_USER_PASSWORD",
            resource_type="user",
            resource_id=str(u.id),
            summary=f"Super Admin reset password for {u.username} ({u.role_name})",
        )
    )
    db.commit()
    return {"reset": True, "user_id": u.id, "username": u.username}


@router.post("/{user_id}/suspend")
def suspend_user(
    user_id: int,
    req: SuspendUserRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot suspend your own Super Admin account")
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    until = (
        datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=req.hours)
        if req.hours and req.hours > 0
        else None
    )
    u.is_suspended = True
    u.suspended_until = until
    u.suspension_reason = req.reason.strip() or "Account suspended by Super Admin"

    if req.also_suspend_children and u.parent_profile:
        for link in u.parent_profile.child_links:
            if link.child:
                link.child.is_suspended = True
                link.child.suspended_until = until
                link.child.suspension_reason = u.suspension_reason

    db.add(
        UserNotification(
            user_id=u.id,
            sender_user_id=admin.id,
            message_type="alert",
            title="⛔ Account Suspended",
            body=f"{u.suspension_reason}" + (f" (Duration: {req.hours}h)" if req.hours else " (Indefinite)"),
            rule_violated=req.rule_violated,
        )
    )
    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="SUSPEND_USER",
            resource_type="user",
            resource_id=str(u.id),
            summary=f"Suspended {u.username} ({u.role_name}): {u.suspension_reason}",
        )
    )
    db.commit()
    return {"suspended": True, "user_id": u.id, "suspended_until": until.isoformat() if until else None}


@router.post("/{user_id}/unsuspend")
def unsuspend_user(
    user_id: int,
    admin: User = Depends(require_roles(["SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u.is_suspended = False
    u.suspended_until = None
    u.suspension_reason = None
    u.is_active = True
    if u.parent_profile:
        for link in u.parent_profile.child_links:
            if link.child:
                link.child.is_suspended = False
                link.child.suspended_until = None
                link.child.suspension_reason = None
    db.add(
        UserNotification(
            user_id=u.id,
            sender_user_id=admin.id,
            message_type="message",
            title="✅ Account Restored",
            body="Your account suspension has been lifted by Super Admin.",
        )
    )
    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="UNSUSPEND_USER",
            resource_type="user",
            resource_id=str(u.id),
            summary=f"Restored suspended account {u.username} ({u.role_name})",
        )
    )
    db.commit()
    return {"suspended": False, "user_id": u.id}


@router.post("/{user_id}/notify")
def send_user_notification(
    user_id: int,
    req: SendNotificationRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    mtype = req.message_type if req.message_type in {"message", "alert", "warning"} else "message"
    notif = UserNotification(
        user_id=u.id,
        sender_user_id=admin.id,
        message_type=mtype,
        title=req.title.strip(),
        body=req.body.strip(),
        rule_violated=req.rule_violated.strip() if req.rule_violated else None,
    )
    db.add(notif)

    auto_suspended = False
    if mtype == "warning":
        u.warning_count = (u.warning_count or 0) + 1
        if req.auto_suspend_hours and req.auto_suspend_hours > 0 and u.id != admin.id:
            u.is_suspended = True
            u.suspended_until = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(
                hours=req.auto_suspend_hours
            )
            u.suspension_reason = f"Rule violation ({req.rule_violated or 'Platform Rule'}): {req.title}"
            auto_suspended = True
        elif u.warning_count >= 3 and u.id != admin.id and not u.is_suspended:
            # 3-strike automatic 24h suspension
            u.is_suspended = True
            u.suspended_until = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=24)
            u.suspension_reason = "3-Strike Rule: Reached 3 official warnings (auto-suspended 24h)"
            auto_suspended = True

    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type=f"SEND_{mtype.upper()}",
            resource_type="user",
            resource_id=str(u.id),
            summary=f"Sent {mtype} to {u.username}: {req.title}",
        )
    )
    db.commit()
    db.refresh(notif)
    return {
        "notification": _serialize_notification(notif),
        "warning_count": u.warning_count,
        "auto_suspended": auto_suspended,
    }


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_account(
    user_id: int,
    admin: User = Depends(require_roles(["SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own Super Admin account")
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    username = u.username
    role = u.role_name
    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="DELETE_USER",
            resource_type="user",
            resource_id=str(u.id),
            summary=f"Deleted account {username} ({role})",
        )
    )
    db.delete(u)
    db.commit()


@router.post("/children/{child_id}/suspend")
def admin_suspend_child(
    child_id: int,
    req: SuspendUserRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    c = db.query(ChildProfile).filter(ChildProfile.id == child_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Child profile not found")
    until = (
        datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=req.hours)
        if req.hours and req.hours > 0
        else None
    )
    c.is_suspended = True
    c.suspended_until = until
    c.suspension_reason = req.reason.strip() or "Suspended by Super Admin"
    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            child_id=c.id,
            action_type="ADMIN_SUSPEND_CHILD",
            resource_type="child",
            resource_id=str(c.id),
            summary=f"Super Admin suspended Child #{c.id}: {c.suspension_reason}",
        )
    )
    db.commit()
    return {"suspended": True, "child_id": c.id}


@router.post("/children/{child_id}/unsuspend")
def admin_unsuspend_child(
    child_id: int,
    admin: User = Depends(require_roles(["SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    c = db.query(ChildProfile).filter(ChildProfile.id == child_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Child profile not found")
    c.is_suspended = False
    c.suspended_until = None
    c.suspension_reason = None
    db.commit()
    return {"suspended": False, "child_id": c.id}


@router.delete("/children/{child_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_child(
    child_id: int,
    admin: User = Depends(require_roles(["SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    c = db.query(ChildProfile).filter(ChildProfile.id == child_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Child profile not found")
    child_user = c.user
    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="ADMIN_DELETE_CHILD",
            resource_type="child",
            resource_id=str(c.id),
            summary=f"Super Admin deleted Child #{c.id}",
        )
    )
    db.delete(c)
    if child_user and child_user.role_name == "CHILD":
        db.delete(child_user)
    db.commit()


@router.post("/{user_id}/impersonate")
def admin_impersonate_user(
    user_id: int,
    admin: User = Depends(require_roles(["SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    """Super Admin support login into a Parent, Creator, or Admin account to assist them."""
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    access_token = create_access_token(
        subject=u.username,
        role=u.role_name,
        user_id=u.id,
        child_profile_id=u.child_profile.id if u.role_name == "CHILD" and u.child_profile else None,
    )
    refresh_token = create_refresh_token(subject=u.username, role=u.role_name, user_id=u.id)
    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="ADMIN_IMPERSONATE_USER",
            resource_type="user",
            resource_id=str(u.id),
            summary=f"Super Admin entered support session as {u.username} ({u.role_name})",
        )
    )
    db.commit()
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": u.id,
            "email": u.email,
            "username": u.username,
            "full_name": u.full_name,
            "role": u.role_name,
        },
    }


@router.post("/children/{child_id}/reset-pin")
def admin_reset_child_pin(
    child_id: int,
    req: ResetChildPinRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    c = db.query(ChildProfile).filter(ChildProfile.id == child_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Child profile not found")
    new_pin = req.new_pin.strip()
    c.pin_code = new_pin
    if c.user:
        c.user.password_hash = hash_password(new_pin)
    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            child_id=c.id,
            action_type="ADMIN_RESET_CHILD_PIN",
            resource_type="child",
            resource_id=str(c.id),
            summary=f"Super Admin reset access code/PIN for {c.display_name} (#{c.id})",
        )
    )
    db.commit()
    return {"reset": True, "child_id": c.id, "display_name": c.display_name, "pin_code": c.pin_code}


@router.post("/children/{child_id}/impersonate")
def admin_impersonate_child(
    child_id: int,
    admin: User = Depends(require_roles(["SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    """Super Admin support login directly into a Child's account to troubleshoot or assist."""
    c = db.query(ChildProfile).filter(ChildProfile.id == child_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Child profile not found")
    target_user = c.user or admin
    access_token = create_access_token(
        subject=target_user.username,
        role="CHILD",
        user_id=target_user.id,
        child_profile_id=c.id,
    )
    refresh_token = create_refresh_token(subject=target_user.username, role="CHILD", user_id=target_user.id)
    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            child_id=c.id,
            action_type="ADMIN_IMPERSONATE_CHILD",
            resource_type="child",
            resource_id=str(c.id),
            summary=f"Super Admin entered support session as child {c.display_name} (#{c.id})",
        )
    )
    db.commit()
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": target_user.id,
            "email": target_user.email,
            "username": target_user.username,
            "full_name": c.display_name,
            "role": "CHILD",
            "child_profile_id": c.id,
        },
    }
