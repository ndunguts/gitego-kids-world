import datetime
import json
from collections import Counter
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    ActivityLog,
    Bookmark,
    ChildProfile,
    Game,
    GameScore,
    GameSession,
    Lesson,
    PlatformRule,
    Storybook,
    User,
    UserNotification,
    Video,
    VideoSession,
)
from app.security import require_roles
from app.services.child_state import is_child_online

router = APIRouter(prefix="/api/v1/analytics", tags=["Platform & Game Analytics"])


def _grade_to_cycle(grade: str) -> str:
    g = (grade or "P1").upper()
    if g.startswith("N"):
        return "materineri"
    if g.startswith("P"):
        return "primary"
    if g in {"S1", "S2", "S3"}:
        return "o_level"
    if g in {"S4", "S5", "S6"}:
        return "high_school"
    return "primary"


def _video_has_ads(v: Video) -> bool:
    if not v.ad_settings_json:
        return False
    try:
        data = json.loads(v.ad_settings_json)
        return bool(isinstance(data, dict) and data.get("enabled"))
    except Exception:
        return False


@router.get("/overview")
def get_analytics_overview(
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    total_plays = db.query(func.sum(Game.play_count)).scalar() or 0
    total_play_time_seconds = db.query(func.sum(GameSession.duration_seconds)).scalar() or 0
    total_game_sessions = db.query(GameSession).count()
    completed_sessions = db.query(GameSession).filter(GameSession.completed.is_(True)).count()
    highest_score = db.query(func.max(GameScore.score)).scalar() or 0
    game_completion_rate = (
        round((completed_sessions / total_game_sessions) * 100, 1) if total_game_sessions else 0.0
    )
    avg_game_session_sec = (
        round(total_play_time_seconds / total_game_sessions) if total_game_sessions else 0
    )

    games = db.query(Game).order_by(Game.play_count.desc()).all()
    game_metrics = []
    for g in games:
        g_top = db.query(func.max(GameScore.score)).filter(GameScore.game_id == g.id).scalar() or 0
        g_time = (
            db.query(func.sum(GameSession.duration_seconds))
            .filter(GameSession.game_id == g.id)
            .scalar()
            or 0
        )
        g_total = db.query(GameSession).filter(GameSession.game_id == g.id).count()
        g_done = (
            db.query(GameSession)
            .filter(GameSession.game_id == g.id, GameSession.completed.is_(True))
            .count()
        )
        last_s = (
            db.query(GameSession)
            .filter(GameSession.game_id == g.id)
            .order_by(GameSession.started_at.desc())
            .first()
        )
        game_metrics.append(
            {
                "game_id": g.id,
                "title": g.title,
                "category_name": g.category_name,
                "engine": g.game_engine,
                "status": g.status,
                "plays": g.play_count,
                "time_spent_seconds": g_time,
                "completed_sessions": g_done,
                "completion_rate": round((g_done / g_total) * 100) if g_total else 0,
                "highest_score": g_top,
                "last_played": last_s.started_at.isoformat() if last_s and last_s.started_at else None,
            }
        )

    # Storybooks analytics
    books = db.query(Storybook).order_by(Storybook.read_count.desc()).all()
    total_book_reads = sum(b.read_count or 0 for b in books)
    completed_book_reads = db.query(Bookmark).filter(Bookmark.completed.is_(True)).count()
    top_books = []
    for b in books[:8]:
        b_done = (
            db.query(Bookmark)
            .filter(Bookmark.storybook_id == b.id, Bookmark.completed.is_(True))
            .count()
        )
        top_books.append(
            {
                "id": b.id,
                "title": b.title,
                "language_code": b.language_code,
                "age_group": b.age_group,
                "status": b.status,
                "read_count": b.read_count or 0,
                "completed_reads": b_done,
                "page_count": len(b.pages),
            }
        )

    # Videos analytics
    videos = db.query(Video).order_by(Video.view_count.desc()).all()
    total_video_views = sum(v.view_count or 0 for v in videos)
    total_watch_seconds = db.query(func.sum(VideoSession.active_watch_seconds)).scalar() or 0.0
    videos_with_ads = sum(1 for v in videos if _video_has_ads(v))
    top_videos = []
    for v in videos[:8]:
        v_watch = (
            db.query(func.sum(VideoSession.active_watch_seconds))
            .filter(VideoSession.video_id == v.id)
            .scalar()
            or 0.0
        )
        top_videos.append(
            {
                "id": v.id,
                "title": v.title,
                "category_name": v.category_name,
                "provider": v.provider,
                "language_code": v.language_code,
                "status": v.status,
                "view_count": v.view_count or 0,
                "active_watch_seconds": round(float(v_watch), 1),
                "has_ads": _video_has_ads(v),
            }
        )

    # Learning Center analytics
    all_lessons = db.query(Lesson).all()
    lessons_only_count = sum(1 for l in all_lessons if (l.content_type or "lesson") == "lesson")
    exams_only_count = sum(1 for l in all_lessons if l.content_type == "exam")
    cycle_counts = Counter(_grade_to_cycle(l.grade_level) for l in all_lessons)

    # Users, Children, Safety & Moderation analytics
    all_users = db.query(User).all()
    role_counts = Counter(u.role_name for u in all_users)
    all_children = db.query(ChildProfile).order_by(ChildProfile.total_stars.desc()).all()
    online_children_now = sum(1 for c in all_children if is_child_online(c))
    suspended_users = sum(1 for u in all_users if u.is_suspended)
    suspended_children = sum(1 for c in all_children if c.is_suspended)
    total_warnings = sum(u.warning_count or 0 for u in all_users)
    total_stars_earned = sum(c.total_stars or 0 for c in all_children)
    unread_notifs = db.query(UserNotification).filter(UserNotification.is_read.is_(False)).count()
    active_rules = db.query(PlatformRule).filter(PlatformRule.is_active.is_(True)).count()

    age_group_counts = Counter(c.age_group for c in all_children)
    child_leaderboard = []
    children_at_limit = 0
    for c in all_children[:10]:
        limit_m = c.screen_time.daily_limit_minutes if c.screen_time else 60
        used_m = c.screen_time.used_today_minutes if c.screen_time else 0
        if used_m >= limit_m:
            children_at_limit += 1
        child_leaderboard.append(
            {
                "id": c.id,
                "display_name": c.display_name,
                "avatar": c.avatar,
                "age_group": c.age_group,
                "total_stars": c.total_stars,
                "current_level": c.current_level,
                "used_today_minutes": used_m,
                "daily_limit_minutes": limit_m,
                "is_online": is_child_online(c),
                "is_suspended": c.is_suspended,
                "current_activity": c.current_activity or "Idle",
            }
        )

    # Content status health
    def _status_counts(items):
        c = Counter((getattr(x, "status", "Draft") or "Draft") for x in items)
        return {
            "total": len(items),
            "published": c.get("Published", 0),
            "draft": c.get("Draft", 0),
            "review": c.get("Review", 0),
            "archived": c.get("Archived", 0),
        }

    # Language distribution across Books + Videos + Lessons
    lang_counter = Counter()
    for b in books:
        lang_counter[(b.language_code or "rw").upper()] += 1
    for v in videos:
        lang_counter[(v.language_code or "rw").upper()] += 1
    for l in all_lessons:
        lang_counter[(l.language_code or "rw").upper()] += 1

    # 7-day activity timeline from ActivityLog
    now = datetime.datetime.now(datetime.timezone.utc)
    today = now.date()
    day_keys = [(today - datetime.timedelta(days=i)) for i in range(6, -1, -1)]
    day_map = {d.isoformat(): 0 for d in day_keys}
    seven_days_ago = datetime.datetime.combine(day_keys[0], datetime.time.min, tzinfo=datetime.timezone.utc)
    recent_logs = (
        db.query(ActivityLog)
        .filter(ActivityLog.created_at >= seven_days_ago)
        .order_by(ActivityLog.created_at.desc())
        .all()
    )
    action_counter = Counter()
    for lg in recent_logs:
        action_counter[lg.action_type] += 1
        if lg.created_at:
            d_key = lg.created_at.date().isoformat()
            if d_key in day_map:
                day_map[d_key] += 1

    activity_timeline_7d = [
        {"date": d.isoformat(), "label": d.strftime("%b %d"), "count": day_map[d.isoformat()]}
        for d in day_keys
    ]
    top_actions = [{"action": act, "count": cnt} for act, cnt in action_counter.most_common(8)]

    return {
        "summary": {
            "total_users": len(all_users),
            "total_children": len(all_children),
            "online_children_now": online_children_now,
            "total_games": len(games),
            "total_game_plays": total_plays,
            "total_game_time_seconds": total_play_time_seconds,
            "completed_game_sessions": completed_sessions,
            "game_completion_rate_pct": game_completion_rate,
            "avg_game_session_seconds": avg_game_session_sec,
            "highest_score": highest_score,
            "total_storybooks": len(books),
            "total_book_reads": total_book_reads,
            "completed_book_reads": completed_book_reads,
            "total_videos": len(videos),
            "total_video_views": total_video_views,
            "videos_with_ads": videos_with_ads,
            "total_active_watch_seconds": round(float(total_watch_seconds), 2),
            "total_lessons": lessons_only_count,
            "total_exams": exams_only_count,
            "total_stars_earned": total_stars_earned,
            "suspended_accounts": suspended_users + suspended_children,
            "total_warnings": total_warnings,
        },
        "content_health": {
            "games": _status_counts(games),
            "books": _status_counts(books),
            "videos": {**_status_counts(videos), "with_ads": videos_with_ads},
        },
        "audience_breakdown": {
            "roles": {
                "SUPER_ADMIN": role_counts.get("SUPER_ADMIN", 0),
                "CONTENT_ADMIN": role_counts.get("CONTENT_ADMIN", 0),
                "PARENT": role_counts.get("PARENT", 0),
                "CHILD": len(all_children),
            },
            "age_groups": {
                "3-5": age_group_counts.get("3-5", 0),
                "6-8": age_group_counts.get("6-8", 0),
                "9-12": age_group_counts.get("9-12", 0),
            },
            "languages": [{"code": k, "count": v} for k, v in lang_counter.most_common(8)],
        },
        "learning_breakdown": {
            "lessons": lessons_only_count,
            "exams": exams_only_count,
            "cycles": {
                "materineri": cycle_counts.get("materineri", 0),
                "primary": cycle_counts.get("primary", 0),
                "o_level": cycle_counts.get("o_level", 0),
                "high_school": cycle_counts.get("high_school", 0),
            },
        },
        "safety_and_moderation": {
            "suspended_users": suspended_users,
            "suspended_children": suspended_children,
            "total_warnings": total_warnings,
            "unread_notifications": unread_notifs,
            "active_rules": active_rules,
            "children_at_screen_limit": children_at_limit,
        },
        "activity_timeline_7d": activity_timeline_7d,
        "top_actions": top_actions,
        "popular_games": game_metrics,
        "top_books": top_books,
        "top_videos": top_videos,
        "child_leaderboard": child_leaderboard,
    }
