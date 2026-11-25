import datetime
import random
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    ActivityLog,
    Bookmark,
    ChildProfile,
    GameScore,
    GameSession,
    ParentChildRelationship,
    ParentProfile,
    Reward,
    ScreenTimeSetting,
    User,
    VideoSession,
)
from app.security import require_roles
from app.services.child_state import serialize_child_live_state

router = APIRouter(prefix="/api/v1/parents", tags=["Parent Portal"])


class CreateChildRequest(BaseModel):
    display_name: str
    avatar: str = "🦁"
    age: int = 7
    age_group: str = "6-8"
    pin_code: Optional[str] = None
    preferred_language: str = "rw"
    daily_limit_minutes: int = 60
    restricted_categories: list[str] = []


class SuspendChildRequest(BaseModel):
    duration_value: Optional[int] = None
    duration_unit: str = "indefinite"  # minutes, hours, days, indefinite
    reason: Optional[str] = None


def _generate_unique_pin(parent_id: int, db: Session) -> str:
    # Guarantee global uniqueness across all child profiles
    used_pins = {p for (p,) in db.query(ChildProfile.pin_code).all() if p}
    for _ in range(100):
        code = f"{random.randint(1000, 9999)}"
        if code not in used_pins:
            return code
    for _ in range(100):
        code = f"{random.randint(100000, 999999)}"
        if code not in used_pins:
            return code
    return f"{random.randint(10000000, 99999999)}"


class UpdateScreenTimeRequest(BaseModel):
    daily_limit_minutes: int
    allowed_age_group: str = "6-8"
    restricted_categories: list[str] = []
    bedtime_lock_enabled: bool = False
    parent_consent_approved: Optional[bool] = None


def _get_or_create_parent_profile(user: User, db: Session) -> ParentProfile:
    parent = db.query(ParentProfile).filter(ParentProfile.user_id == user.id).first()
    if not parent:
        parent = ParentProfile(
            user_id=user.id,
            parental_consent_given=True,
            consent_timestamp=datetime.datetime.now(datetime.timezone.utc),
        )
        db.add(parent)
        db.commit()
        db.refresh(parent)
    return parent


def _verify_parent_owns_child(user: User, child_id: int, db: Session) -> ChildProfile:
    child = db.query(ChildProfile).filter(ChildProfile.id == child_id).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child profile not found")
    if user.role_name == "SUPER_ADMIN":
        return child
    parent = _get_or_create_parent_profile(user, db)
    link = (
        db.query(ParentChildRelationship)
        .filter(
            ParentChildRelationship.parent_id == parent.id,
            ParentChildRelationship.child_id == child_id,
        )
        .first()
    )
    if not link:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not own or manage this child profile",
        )
    return child


@router.get("/children")
def list_my_children(
    user: User = Depends(require_roles(["PARENT", "SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    if user.role_name == "SUPER_ADMIN":
        children = db.query(ChildProfile).all()
    else:
        parent = _get_or_create_parent_profile(user, db)
        links = (
            db.query(ParentChildRelationship)
            .filter(ParentChildRelationship.parent_id == parent.id)
            .all()
        )
        child_ids = [lnk.child_id for lnk in links]
        children = (
            db.query(ChildProfile).filter(ChildProfile.id.in_(child_ids)).all()
            if child_ids
            else []
        )

    is_admin_viewer = user.role_name in ("SUPER_ADMIN", "CONTENT_ADMIN")
    result = []
    for ch in children:
        st = ch.screen_time
        result.append(
            {
                "id": ch.id,
                "display_name": f"Child #{ch.id} (Private)" if is_admin_viewer else ch.display_name,
                "avatar": ch.avatar,
                "age": ch.age,
                "age_group": ch.age_group,
                "pin_code": "••••" if is_admin_viewer else ch.pin_code,
                "preferred_language": ch.preferred_language,
                "total_stars": ch.total_stars,
                "current_level": ch.current_level,
                "is_private": ch.is_private,
                "parent_consent_approved": ch.parent_consent_approved,
                "live_status": serialize_child_live_state(ch, db),
                "screen_time": {
                    "daily_limit_minutes": st.daily_limit_minutes if st else 60,
                    "used_today_minutes": st.used_today_minutes if st else 0,
                    "allowed_age_group": st.allowed_age_group if st else ch.age_group,
                    "restricted_categories": (
                        [c for c in st.restricted_categories_csv.split(",") if c]
                        if st and st.restricted_categories_csv
                        else []
                    ),
                    "bedtime_lock_enabled": st.bedtime_lock_enabled if st else False,
                },
            }
        )
    return result


@router.post("/children", status_code=status.HTTP_201_CREATED)
def add_child_profile(
    req: CreateChildRequest,
    user: User = Depends(require_roles(["PARENT", "SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    parent = _get_or_create_parent_profile(user, db)
    requested_pin = (req.pin_code or "").strip()
    if requested_pin:
        pin_exists = db.query(ChildProfile).filter(ChildProfile.pin_code == requested_pin).first()
        if pin_exists:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Iyi code isanzwe ikoreshwa n'undi mwana. Hitamo indi code cyangwa uyisige ubusa sisitemu ikore iyihariye.",
            )
        chosen_pin = requested_pin
    else:
        chosen_pin = _generate_unique_pin(parent.id, db)
    child = ChildProfile(
        display_name=req.display_name,
        avatar=req.avatar,
        age=req.age,
        age_group=req.age_group,
        pin_code=chosen_pin,
        preferred_language=req.preferred_language,
        is_private=True,
        parent_consent_approved=True,
    )
    db.add(child)
    db.flush()

    db.add(ParentChildRelationship(parent_id=parent.id, child_id=child.id))
    db.add(
        ScreenTimeSetting(
            child_id=child.id,
            daily_limit_minutes=req.daily_limit_minutes,
            used_today_minutes=0,
            allowed_age_group=req.age_group,
            restricted_categories_csv=",".join(req.restricted_categories),
        )
    )
    db.add(
        ActivityLog(
            actor_user_id=user.id,
            child_id=child.id,
            action_type="CREATE_CHILD_PROFILE",
            resource_type="child_profile",
            resource_id=str(child.id),
            summary=f"Parent added child profile #{child.id} ({child.age_group})",
        )
    )
    db.commit()
    return {
        "id": child.id,
        "display_name": child.display_name,
        "avatar": child.avatar,
        "age": child.age,
        "age_group": child.age_group,
        "pin_code": child.pin_code,
        "preferred_language": child.preferred_language,
        "total_stars": child.total_stars,
        "current_level": child.current_level,
    }


@router.put("/children/{child_id}/controls")
def update_child_controls(
    child_id: int,
    req: UpdateScreenTimeRequest,
    user: User = Depends(require_roles(["PARENT", "SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    child = _verify_parent_owns_child(user, child_id, db)
    child.age_group = req.allowed_age_group
    if req.parent_consent_approved is not None:
        child.parent_consent_approved = req.parent_consent_approved

    st = db.query(ScreenTimeSetting).filter(ScreenTimeSetting.child_id == child.id).first()
    if not st:
        st = ScreenTimeSetting(child_id=child.id)
        db.add(st)

    st.daily_limit_minutes = req.daily_limit_minutes
    st.allowed_age_group = req.allowed_age_group
    st.restricted_categories_csv = ",".join(req.restricted_categories)
    st.bedtime_lock_enabled = req.bedtime_lock_enabled
    db.commit()
    return {
        "child_id": child.id,
        "daily_limit_minutes": st.daily_limit_minutes,
        "allowed_age_group": st.allowed_age_group,
        "restricted_categories": req.restricted_categories,
        "bedtime_lock_enabled": st.bedtime_lock_enabled,
        "parent_consent_approved": child.parent_consent_approved,
    }


@router.get("/children/{child_id}/report")
def get_child_activity_report(
    child_id: int,
    user: User = Depends(require_roles(["PARENT", "SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    child = _verify_parent_owns_child(user, child_id, db)
    game_sessions = (
        db.query(GameSession)
        .filter(GameSession.child_id == child.id)
        .order_by(GameSession.started_at.desc())
        .limit(20)
        .all()
    )
    scores = (
        db.query(GameScore)
        .filter(GameScore.child_id == child.id)
        .order_by(GameScore.score.desc())
        .limit(10)
        .all()
    )
    bookmarks = (
        db.query(Bookmark)
        .filter(Bookmark.child_id == child.id)
        .order_by(Bookmark.updated_at.desc())
        .all()
    )
    video_sessions = (
        db.query(VideoSession)
        .filter(VideoSession.child_id == child.id)
        .order_by(VideoSession.updated_at.desc())
        .limit(20)
        .all()
    )
    rewards = (
        db.query(Reward)
        .filter(Reward.child_id == child.id)
        .order_by(Reward.created_at.desc())
        .limit(20)
        .all()
    )

    is_admin_viewer = user.role_name in ("SUPER_ADMIN", "CONTENT_ADMIN")
    return {
        "child": {
            "id": child.id,
            "display_name": f"Child #{child.id} (Private)" if is_admin_viewer else child.display_name,
            "avatar": child.avatar,
            "age_group": child.age_group,
            "pin_code": "••••" if is_admin_viewer else child.pin_code,
            "total_stars": child.total_stars,
            "current_level": child.current_level,
        },
        "live_status": serialize_child_live_state(child, db),
        "screen_time": {
            "daily_limit_minutes": child.screen_time.daily_limit_minutes if child.screen_time else 60,
            "used_today_minutes": child.screen_time.used_today_minutes if child.screen_time else 0,
        },
        "games_played": [
            {
                "game_id": gs.game_id,
                "game_title": gs.game.title if gs.game else f"Game #{gs.game_id}",
                "duration_seconds": gs.duration_seconds,
                "completed": gs.completed,
                "started_at": gs.started_at.isoformat() if gs.started_at else None,
            }
            for gs in game_sessions
        ],
        "high_scores": [
            {
                "game_id": sc.game_id,
                "game_title": sc.game.title if sc.game else f"Game #{sc.game_id}",
                "score": sc.score,
            }
            for sc in scores
        ],
        "books_read": [
            {
                "storybook_id": bm.storybook_id,
                "title": bm.storybook.title if bm.storybook else f"Book #{bm.storybook_id}",
                "last_page_number": bm.last_page_number,
                "completed": bm.completed,
            }
            for bm in bookmarks
        ],
        "cartoons_watched": [
            {
                "video_id": vs.video_id,
                "title": vs.video.title if vs.video else f"Video #{vs.video_id}",
                "active_watch_seconds": vs.active_watch_seconds,
                "completed": vs.completed,
                "provider_reliable": vs.provider_reliable,
            }
            for vs in video_sessions
        ],
        "recent_rewards": [
            {
                "activity_type": rw.activity_type,
                "stars_earned": rw.stars_earned,
                "badge_name": rw.badge_name,
                "created_at": rw.created_at.isoformat() if rw.created_at else None,
            }
            for rw in rewards
        ],
    }


@router.delete("/children/{child_id}")
def delete_child_profile(
    child_id: int,
    user: User = Depends(require_roles(["PARENT", "SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    child = _verify_parent_owns_child(user, child_id, db)
    db.query(ActivityLog).filter(ActivityLog.child_id == child.id).update({"child_id": None})
    db.delete(child)
    db.add(
        ActivityLog(
            actor_user_id=user.id,
            action_type="DELETE_CHILD_PROFILE",
            resource_type="child_profile",
            resource_id=str(child_id),
            summary=f"Parent deleted child profile #{child_id}",
        )
    )
    db.commit()
    return {"deleted": True, "child_id": child_id}


@router.post("/children/{child_id}/suspend")
def suspend_child_profile(
    child_id: int,
    req: SuspendChildRequest,
    user: User = Depends(require_roles(["PARENT", "SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    child = _verify_parent_owns_child(user, child_id, db)
    now = datetime.datetime.now(datetime.timezone.utc)
    unit = (req.duration_unit or "indefinite").lower().strip()
    val = req.duration_value or 0

    suspended_until = None
    if unit == "minutes" and val > 0:
        suspended_until = now + datetime.timedelta(minutes=val)
    elif unit == "hours" and val > 0:
        suspended_until = now + datetime.timedelta(hours=val)
    elif unit == "days" and val > 0:
        suspended_until = now + datetime.timedelta(days=val)

    child.is_suspended = True
    child.suspended_until = suspended_until
    child.suspension_reason = (req.reason or "").strip() or None
    child.last_seen_at = None
    child.current_activity = None
    child.active_device_id = None
    db.add(
        ActivityLog(
            actor_user_id=user.id,
            child_id=child.id,
            action_type="SUSPEND_CHILD_PROFILE",
            resource_type="child_profile",
            resource_id=str(child.id),
            summary=f"Parent suspended child profile #{child.id} ({unit})",
        )
    )
    db.commit()
    return {
        "child_id": child.id,
        "live_status": serialize_child_live_state(child, db),
    }


@router.post("/children/{child_id}/unsuspend")
def unsuspend_child_profile(
    child_id: int,
    user: User = Depends(require_roles(["PARENT", "SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    child = _verify_parent_owns_child(user, child_id, db)
    child.is_suspended = False
    child.suspended_until = None
    child.suspension_reason = None
    db.add(
        ActivityLog(
            actor_user_id=user.id,
            child_id=child.id,
            action_type="UNSUSPEND_CHILD_PROFILE",
            resource_type="child_profile",
            resource_id=str(child.id),
            summary=f"Parent resumed child profile #{child.id}",
        )
    )
    db.commit()
    return {
        "child_id": child.id,
        "live_status": serialize_child_live_state(child, db),
    }
