import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Bookmark,
    ChildAchievement,
    ChildProfile,
    Game,
    GameSession,
    LearningSubject,
    Storybook,
    User,
    Video,
    VideoSession,
)
from app.security import get_current_user
from app.services.child_state import check_child_suspension
from app.services.story_illustrator import (
    generate_and_save_story_illustration,
    needs_ai_illustration,
)

router = APIRouter(prefix="/api/v1/children", tags=["Child Dashboard"])


def resolve_active_child(
    child_id: Optional[int],
    user: User,
    db: Session,
) -> ChildProfile:
    token_child_id = getattr(user, "_token_child_profile_id", None)
    target_id = token_child_id or child_id
    if target_id:
        ch = db.query(ChildProfile).filter(ChildProfile.id == target_id).first()
        if ch:
            return ch
    if user.child_profile:
        return user.child_profile
    first_ch = db.query(ChildProfile).order_by(ChildProfile.id.asc()).first()
    if not first_ch:
        raise HTTPException(status_code=404, detail="No child profile available")
    return first_ch


class ChildHeartbeatRequest(BaseModel):
    activity: str = "Browsing Child World"
    device_id: Optional[str] = None
    leaving: bool = False


@router.post("/heartbeat")
def child_presence_heartbeat(
    req: ChildHeartbeatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    effective_role = getattr(user, "_token_role", user.role_name)
    if effective_role != "CHILD":
        return {"tracked": False}

    child = resolve_active_child(None, user, db)
    suspended, susp_msg = check_child_suspension(child, db)
    if suspended:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"ACCOUNT_SUSPENDED: {susp_msg}",
        )

    if req.leaving:
        child.last_seen_at = None
        child.current_activity = None
        child.active_device_id = None
    else:
        child.last_seen_at = datetime.datetime.now(datetime.timezone.utc)
        child.current_activity = (req.activity or "Browsing Child World")[:250]
        if req.device_id:
            child.active_device_id = req.device_id[:120]
    db.commit()
    return {"tracked": True, "leaving": req.leaving, "activity": child.current_activity}


@router.get("/dashboard")
def get_child_dashboard(
    child_id: Optional[int] = None,
    language: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    effective_role = getattr(user, "_token_role", user.role_name)
    is_admin_preview = effective_role in ("SUPER_ADMIN", "CONTENT_ADMIN")
    is_parent_preview = effective_role == "PARENT" and child_id is None
    is_preview = is_admin_preview or is_parent_preview

    child = None
    st = None
    restricted: set[str] = set()
    if not is_preview:
        child = resolve_active_child(child_id, user, db)
        if effective_role == "CHILD":
            suspended, susp_msg = check_child_suspension(child, db)
            if suspended:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"ACCOUNT_SUSPENDED: {susp_msg}",
                )
        st = child.screen_time
        restricted = (
            {c.strip().lower() for c in st.restricted_categories_csv.split(",") if c.strip()}
            if st and st.restricted_categories_csv
            else set()
        )

    games_q = db.query(Game).filter(Game.status == "Published").order_by(Game.play_count.desc()).all()
    games = [
        {
            "id": g.id,
            "title": g.title,
            "description": g.description,
            "instructions": g.instructions,
            "cover_image": g.cover_image,
            "category_name": g.category_name,
            "age_group": g.age_group,
            "difficulty": g.difficulty,
            "game_engine": g.game_engine,
            "play_count": g.play_count,
        }
        for g in games_q
        if g.category_name.lower() not in restricted
    ]

    books_q = db.query(Storybook).filter(Storybook.status == "Published")
    if language:
        books_q = books_q.filter(Storybook.language_code == language)
    books = []
    dirty_books = False
    for b in books_q.all():
        if b.category_name.lower() in restricted:
            continue
        cover_illus = None
        if b.pages:
            p0 = sorted(b.pages, key=lambda x: x.page_number)[0]
            if needs_ai_illustration(p0.illustration_url):
                p0.illustration_url = generate_and_save_story_illustration(
                    text=p0.text_content,
                    title=b.title,
                    page_number=p0.page_number,
                )
                dirty_books = True
            cover_illus = p0.illustration_url
        cover_is_img = bool(
            b.cover_image
            and b.cover_image.strip().startswith(("/uploads/", "http://", "https://", "data:image/"))
        )
        if cover_is_img:
            cover_illus = b.cover_image.strip()
        books.append(
            {
                "id": b.id,
                "title": b.title,
                "description": b.description,
                "cover_image": b.cover_image,
                "cover_illustration_url": cover_illus,
                "author": b.author,
                "language_code": b.language_code,
                "category_name": b.category_name,
                "age_group": b.age_group,
                "page_count": len(b.pages),
            }
        )
    if dirty_books:
        db.commit()

    from app.routers.videos import normalize_video_ad_settings

    videos_q = db.query(Video).filter(Video.status == "Published").all()
    videos = [
        {
            "id": v.id,
            "title": v.title,
            "description": v.description,
            "embed_url": v.embed_url,
            "provider": v.provider,
            "provider_supports_events": v.provider_supports_events,
            "thumbnail_url": v.thumbnail_url,
            "category_name": v.category_name,
            "language_code": v.language_code,
            "age_group": v.age_group,
            "duration_seconds": v.duration_seconds,
            "ad_settings": normalize_video_ad_settings(v.ad_settings_json),
        }
        for v in videos_q
        if v.category_name.lower() not in restricted
    ]

    subjects = db.query(LearningSubject).filter(LearningSubject.is_active.is_(True)).all()

    if is_preview or child is None:
        recent_games = []
        continue_reading = []
        continue_watching = []
        unlocked_achievements = []
        preview_name = (
            f"{user.full_name or user.username} (Parent Preview)"
            if is_parent_preview
            else "Explorer (Admin Preview)"
        )
        child_payload = {
            "id": None,
            "display_name": preview_name,
            "avatar": "🛡️" if is_parent_preview else "⚙️",
            "age": None,
            "age_group": "All",
            "preferred_language": "rw",
            "total_stars": 0,
            "current_level": 1,
            "daily_goal_target": 5,
            "is_preview": True,
            "preview_role": effective_role,
        }
    else:
        recent_games = (
            db.query(GameSession)
            .filter(GameSession.child_id == child.id)
            .order_by(GameSession.started_at.desc())
            .limit(4)
            .all()
        )
        continue_reading = (
            db.query(Bookmark)
            .filter(Bookmark.child_id == child.id)
            .order_by(Bookmark.updated_at.desc())
            .limit(4)
            .all()
        )
        continue_watching = (
            db.query(VideoSession)
            .filter(VideoSession.child_id == child.id)
            .order_by(VideoSession.updated_at.desc())
            .limit(4)
            .all()
        )
        unlocked_achievements = (
            db.query(ChildAchievement)
            .filter(ChildAchievement.child_id == child.id)
            .all()
        )
        child_payload = {
            "id": child.id,
            "display_name": child.display_name,
            "avatar": child.avatar,
            "age": child.age,
            "age_group": child.age_group,
            "preferred_language": child.preferred_language,
            "total_stars": child.total_stars,
            "current_level": child.current_level,
            "daily_goal_target": child.daily_goal_Target,
            "is_preview": False,
            "preview_role": None,
        }

    return {
        "child": child_payload,
        "screen_time": {
            "daily_limit_minutes": st.daily_limit_minutes if st else 60,
            "used_today_minutes": st.used_today_minutes if st else 0,
            "remaining_minutes": max(0, (st.daily_limit_minutes - st.used_today_minutes) if st else 60),
            "bedtime_lock_enabled": st.bedtime_lock_enabled if st else False,
        },
        "games": games,
        "storybooks": books,
        "videos": videos,
        "learning_subjects": [
            {
                "id": s.id,
                "slug": s.slug,
                "name": s.name,
                "description": s.description,
                "icon": s.icon,
                "color": s.color,
                "language_code": s.language_code,
                "lesson_count": len(s.lessons),
            }
            for s in subjects
        ],
        "recently_played": [
            {
                "game_id": gs.game_id,
                "title": gs.game.title if gs.game else "",
                "cover_image": gs.game.cover_image if gs.game else "🎮",
                "completed": gs.completed,
            }
            for gs in recent_games
        ],
        "continue_reading": [
            {
                "storybook_id": bm.storybook_id,
                "title": bm.storybook.title if bm.storybook else "",
                "cover_image": bm.storybook.cover_image if bm.storybook else "📖",
                "last_page_number": bm.last_page_number,
                "completed": bm.completed,
            }
            for bm in continue_reading
        ],
        "continue_watching": [
            {
                "video_id": vs.video_id,
                "title": vs.video.title if vs.video else "",
                "thumbnail_url": vs.video.thumbnail_url if vs.video else "🎬",
                "last_position_seconds": vs.last_position_seconds,
                "completed": vs.completed,
            }
            for vs in continue_watching
        ],
        "achievements": [
            {
                "code": ca.achievement.code,
                "title": ca.achievement.title,
                "description": ca.achievement.description,
                "badge_icon": ca.achievement.badge_icon,
                "unlocked_at": ca.unlocked_at.isoformat() if ca.unlocked_at else None,
            }
            for ca in unlocked_achievements
            if ca.achievement
        ],
    }
