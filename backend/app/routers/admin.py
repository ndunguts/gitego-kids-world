import base64
import os
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import (
    ActivityLog,
    ChildProfile,
    Game,
    Lesson,
    MediaAsset,
    ParentProfile,
    PlatformSetting,
    Storybook,
    User,
    Video,
)
from app.security import require_roles

router = APIRouter(prefix="/api/v1/admin", tags=["Admin System, Media & Settings"])


class MediaUploadRequest(BaseModel):
    filename: str
    mime_type: str
    media_type: str = "image"  # image, audio, thumbnail
    content_base64: str


class UpdatePlatformSettingRequest(BaseModel):
    key: str
    value: str
    description: Optional[str] = None


class BulkUpdateSettingsRequest(BaseModel):
    settings: list[UpdatePlatformSettingRequest]


DEFAULT_PLATFORM_SETTINGS = [
    ("platform_name", "Gitego Kids World", "Public platform display name"),
    ("platform_tagline", "Play • Watch • Read • Learn • Explore", "Short tagline shown in header and login"),
    ("platform_logo_url", "", "Optional uploaded logo URL for topbar and login"),
    ("brand_accent_color", "#6366f1", "Primary platform accent color (hex)"),
    ("support_email", "support@gitego.kids", "Parent and educator support contact email"),
    ("default_language", "rw", "Default platform language code (rw, fr, sw, en)"),
    ("announcement_enabled", "false", "Show global announcement banner across the app"),
    ("announcement_text", "", "Global announcement banner message"),
    ("announcement_bg", "#f59e0b", "Announcement banner background color"),
    ("maintenance_mode", "false", "Display maintenance notice to non-admin users"),
    ("maintenance_message", "Gitego Kids World is receiving an exciting upgrade! We'll be right back.", "Message shown during maintenance mode"),
    ("module_games_enabled", "true", "Enable Games Arcade & Game Studio"),
    ("module_books_enabled", "true", "Enable Multilingual Storybooks"),
    ("module_videos_enabled", "true", "Enable Cartoon & Video Streaming Center"),
    ("module_learning_enabled", "true", "Enable Learning Center (N1–S6)"),
    ("module_exams_enabled", "true", "Enable Exams & Assessments"),
    ("module_rewards_enabled", "true", "Enable Stars, Badges & Trophy Cabinet"),
    ("default_child_daily_limit_minutes", "60", "Default daily screen-time limit for new child profiles"),
    ("allow_parent_self_registration", "true", "Allow new parents to register accounts"),
    ("auto_suspend_warnings_threshold", "3", "Number of official warnings before automatic 24h suspension"),
    ("strict_game_sandbox", "true", "Enforce strict iframe sandbox and CSP on all games"),
    ("stars_per_game_win", "5", "Stars awarded when a child completes a game"),
    ("stars_per_book_read", "5", "Stars awarded when a child finishes a storybook"),
    ("stars_per_exam_pass", "5", "Stars awarded when a child passes an exam or quiz"),
    ("stars_per_level_up", "15", "Total stars required per level increase"),
    ("global_video_watermark_enabled", "false", "Enable default watermark on videos without custom ad settings"),
    ("global_video_watermark_text", "GITEGO KIDS", "Default global video watermark text"),
    ("global_ad_skip_seconds", "5", "Default seconds before viewers can skip a video ad"),
]


def _ensure_default_platform_settings(db: Session):
    existing_keys = {k for (k,) in db.query(PlatformSetting.key).all()}
    added = False
    for key, val, desc in DEFAULT_PLATFORM_SETTINGS:
        if key not in existing_keys:
            db.add(PlatformSetting(key=key, value=val, description=desc))
            added = True
    if added:
        db.commit()


@router.get("/overview")
def admin_system_overview(
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    recent_logs = (
        db.query(ActivityLog)
        .order_by(ActivityLog.created_at.desc())
        .limit(25)
        .all()
    )
    # Scrub child names from activity log summaries for Admin privacy
    child_names = [
        n for (n,) in db.query(ChildProfile.display_name).all() if n and len(n.strip()) >= 2
    ] + [
        v
        for u in db.query(User).filter(User.role_name == "CHILD").all()
        for v in (u.full_name, u.username, u.email)
        if v and len(v.strip()) >= 2
    ]

    def _scrub_summary(text: str) -> str:
        out = text or ""
        for name in child_names:
            if name in out:
                out = out.replace(name, "[Private Child]")
        return out

    return {
        "counts": {
            "users": db.query(User).count(),
            "parents": db.query(ParentProfile).count(),
            "children": db.query(ChildProfile).count(),
            "games": db.query(Game).count(),
            "published_games": db.query(Game).filter(Game.status == "Published").count(),
            "storybooks": db.query(Storybook).count(),
            "videos": db.query(Video).count(),
            "lessons": db.query(Lesson).count(),
            "media_assets": db.query(MediaAsset).count(),
        },
        "recent_activity_logs": [
            {
                "id": lg.id,
                "actor_user_id": lg.actor_user_id,
                "child_id": lg.child_id,
                "action_type": lg.action_type,
                "resource_type": lg.resource_type,
                "resource_id": lg.resource_id,
                "summary": _scrub_summary(lg.summary),
                "created_at": lg.created_at.isoformat() if lg.created_at else None,
            }
            for lg in recent_logs
        ],
    }


@router.post("/media/upload", status_code=status.HTTP_201_CREATED)
def upload_media_asset(
    req: MediaUploadRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    """Validate file type & size, store in S3-compatible bucket/local storage, and record MediaAsset."""
    allowed_types = settings.ALLOWED_IMAGE_TYPES + settings.ALLOWED_AUDIO_TYPES
    if req.mime_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file MIME type '{req.mime_type}'. Allowed: {allowed_types}",
        )

    try:
        raw_bytes = base64.b64decode(req.content_base64, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 media payload")

    size_bytes = len(raw_bytes)
    if size_bytes == 0 or size_bytes > settings.MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File size ({size_bytes} bytes) violates maximum limit ({settings.MAX_UPLOAD_SIZE_BYTES} bytes)",
        )

    safe_ext = os.path.splitext(req.filename)[1].lower() or ".bin"
    if safe_ext not in {".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".mp3", ".wav", ".ogg"}:
        raise HTTPException(status_code=400, detail="Disallowed file extension")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    storage_key = f"{req.media_type}/{uuid.uuid4().hex}{safe_ext}"
    local_dir = os.path.join(settings.UPLOAD_DIR, req.media_type)
    os.makedirs(local_dir, exist_ok=True)
    file_path = os.path.join(settings.UPLOAD_DIR, storage_key)
    with open(file_path, "wb") as f:
        f.write(raw_bytes)

    public_url = f"/uploads/{storage_key}"
    asset = MediaAsset(
        filename=req.filename,
        mime_type=req.mime_type,
        size_bytes=size_bytes,
        storage_key=storage_key,
        public_url=public_url,
        media_type=req.media_type,
        uploaded_by_id=admin.id,
    )
    db.add(asset)
    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="UPLOAD_MEDIA",
            resource_type="media_asset",
            resource_id=storage_key,
            summary=f"Uploaded {req.media_type} '{req.filename}' ({size_bytes} bytes)",
        )
    )
    db.commit()
    db.refresh(asset)
    return {
        "id": asset.id,
        "filename": asset.filename,
        "mime_type": asset.mime_type,
        "size_bytes": asset.size_bytes,
        "storage_key": asset.storage_key,
        "public_url": asset.public_url,
        "s3_bucket": settings.S3_BUCKET_NAME,
    }


@router.get("/public-settings")
def get_public_platform_settings(db: Session = Depends(get_db)):
    """Publicly readable branding, announcement, accent color, and feature flags."""
    _ensure_default_platform_settings(db)
    public_keys = {
        "platform_name",
        "platform_tagline",
        "platform_logo_url",
        "brand_accent_color",
        "support_email",
        "default_language",
        "announcement_enabled",
        "announcement_text",
        "announcement_bg",
        "maintenance_mode",
        "maintenance_message",
        "module_games_enabled",
        "module_books_enabled",
        "module_videos_enabled",
        "module_learning_enabled",
        "module_exams_enabled",
        "module_rewards_enabled",
        "allow_parent_self_registration",
    }
    rows = db.query(PlatformSetting).filter(PlatformSetting.key.in_(public_keys)).all()
    return {r.key: r.value for r in rows}


@router.get("/settings")
def get_platform_settings(
    admin: User = Depends(require_roles(["SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    _ensure_default_platform_settings(db)
    rows = db.query(PlatformSetting).order_by(PlatformSetting.key.asc()).all()
    return [
        {"id": r.id, "key": r.key, "value": r.value, "description": r.description}
        for r in rows
    ]


@router.put("/settings")
def upsert_platform_setting(
    req: UpdatePlatformSettingRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    row = db.query(PlatformSetting).filter(PlatformSetting.key == req.key).first()
    if row:
        row.value = req.value
        if req.description is not None:
            row.description = req.description
    else:
        row = PlatformSetting(key=req.key, value=req.value, description=req.description)
        db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "key": row.key, "value": row.value, "description": row.description}


@router.put("/settings/bulk")
def bulk_update_platform_settings(
    req: BulkUpdateSettingsRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    updated_count = 0
    for item in req.settings:
        key = item.key.strip()
        if not key:
            continue
        row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
        if row:
            row.value = str(item.value)
            if item.description is not None:
                row.description = item.description
        else:
            db.add(PlatformSetting(key=key, value=str(item.value), description=item.description))
        updated_count += 1
    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="UPDATE_PLATFORM_SETTINGS",
            resource_type="platform_setting",
            resource_id="bulk",
            summary=f"Updated {updated_count} platform settings",
        )
    )
    db.commit()
    rows = db.query(PlatformSetting).order_by(PlatformSetting.key.asc()).all()
    return {
        "updated": updated_count,
        "settings": [{"id": r.id, "key": r.key, "value": r.value, "description": r.description} for r in rows],
    }


@router.post("/settings/reset-defaults")
def reset_platform_settings_defaults(
    admin: User = Depends(require_roles(["SUPER_ADMIN"])),
    db: Session = Depends(get_db),
):
    for key, val, desc in DEFAULT_PLATFORM_SETTINGS:
        row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
        if row:
            row.value = val
            row.description = desc
        else:
            db.add(PlatformSetting(key=key, value=val, description=desc))
    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="RESET_PLATFORM_SETTINGS",
            resource_type="platform_setting",
            resource_id="defaults",
            summary="Reset platform settings to recommended defaults",
        )
    )
    db.commit()
    rows = db.query(PlatformSetting).order_by(PlatformSetting.key.asc()).all()
    return [{"id": r.id, "key": r.key, "value": r.value, "description": r.description} for r in rows]
