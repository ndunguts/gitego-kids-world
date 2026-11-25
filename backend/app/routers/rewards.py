from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Achievement, ChildAchievement, Reward, User
from app.routers.children import resolve_active_child
from app.security import get_current_user

router = APIRouter(prefix="/api/v1/rewards", tags=["Rewards & Gamification"])


class ClaimRewardRequest(BaseModel):
    child_id: Optional[int] = None
    activity_type: str  # game_completed, book_completed, lesson_completed, quiz_passed
    reference_id: str
    claim_key: str


ALLOWED_ACTIVITY_STARS = {
    "game_completed": (5, "Game Explorer 🎮"),
    "book_completed": (5, "Story Reader 📖"),
    "lesson_completed": (4, "Lesson Finisher 📚"),
    "quiz_passed": (5, "Quiz Star 🏆"),
}


@router.get("")
def get_child_rewards_summary(
    child_id: Optional[int] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    effective_role = getattr(user, "_token_role", user.role_name)
    is_admin_viewer = effective_role in ("SUPER_ADMIN", "CONTENT_ADMIN")
    is_parent_preview = effective_role == "PARENT" and child_id is None
    is_preview = is_admin_viewer or is_parent_preview

    all_achievements = db.query(Achievement).order_by(Achievement.stars_threshold.asc()).all()
    if is_preview:
        preview_name = (
            f"{user.full_name or user.username} (Parent Preview)"
            if is_parent_preview
            else "Explorer (Admin Preview)"
        )
        return {
            "child_id": None,
            "is_preview": True,
            "display_name": preview_name,
            "total_stars": 0,
            "current_level": 1,
            "next_level_stars": 15,
            "daily_goal_target": 5,
            "daily_goal_completed": 0,
            "safety_notice": "Stars and badges are educational encouragement tokens and are never convertible to real money.",
            "rewards_history": [],
            "achievements": [
                {
                    "code": a.code,
                    "title": a.title,
                    "description": a.description,
                    "badge_icon": a.badge_icon,
                    "stars_threshold": a.stars_threshold,
                    "unlocked": False,
                }
                for a in all_achievements
            ],
        }

    child = resolve_active_child(child_id, user, db)
    rewards = (
        db.query(Reward)
        .filter(Reward.child_id == child.id)
        .order_by(Reward.created_at.desc())
        .all()
    )
    unlocked_ids = {
        ca.achievement_id
        for ca in db.query(ChildAchievement).filter(ChildAchievement.child_id == child.id).all()
    }

    return {
        "child_id": child.id,
        "is_preview": False,
        "display_name": child.display_name,
        "total_stars": child.total_stars,
        "current_level": child.current_level,
        "next_level_stars": child.current_level * 15,
        "daily_goal_target": child.daily_goal_Target,
        "daily_goal_completed": min(child.daily_goal_Target, len(rewards)),
        "safety_notice": "Stars and badges are educational encouragement tokens and are never convertible to real money.",
        "rewards_history": [
            {
                "id": r.id,
                "activity_type": r.activity_type,
                "reference_id": r.reference_id,
                "stars_earned": r.stars_earned,
                "badge_name": r.badge_name,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rewards
        ],
        "achievements": [
            {
                "id": a.id,
                "code": a.code,
                "title": a.title,
                "description": a.description,
                "badge_icon": a.badge_icon,
                "stars_threshold": a.stars_threshold,
                "unlocked": (a.id in unlocked_ids) or (child.total_stars >= a.stars_threshold),
            }
            for a in all_achievements
        ],
    }


@router.post("/claim", status_code=status.HTTP_201_CREATED)
def claim_verified_reward(
    req: ClaimRewardRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Idempotent backend-validated reward claim preventing duplicate reward claims."""
    if req.activity_type not in ALLOWED_ACTIVITY_STARS:
        raise HTTPException(status_code=400, detail="Unsupported reward activity_type")

    child = resolve_active_child(req.child_id, user, db)
    existing = (
        db.query(Reward)
        .filter(Reward.child_id == child.id, Reward.claim_key == req.claim_key)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Duplicate reward claim rejected: this activity was already rewarded.",
        )

    stars_earned, badge_name = ALLOWED_ACTIVITY_STARS[req.activity_type]
    reward = Reward(
        child_id=child.id,
        activity_type=req.activity_type,
        reference_id=req.reference_id,
        claim_key=req.claim_key,
        stars_earned=stars_earned,
        badge_name=badge_name,
    )
    child.total_stars += stars_earned
    child.current_level = 1 + (child.total_stars // 15)
    db.add(reward)

    # Auto-unlock threshold achievements
    for ach in db.query(Achievement).all():
        if child.total_stars >= ach.stars_threshold:
            already = (
                db.query(ChildAchievement)
                .filter(
                    ChildAchievement.child_id == child.id,
                    ChildAchievement.achievement_id == ach.id,
                )
                .first()
            )
            if not already:
                db.add(ChildAchievement(child_id=child.id, achievement_id=ach.id))

    db.commit()
    return {
        "claimed": True,
        "stars_earned": stars_earned,
        "badge_name": badge_name,
        "total_stars": child.total_stars,
        "current_level": child.current_level,
    }
