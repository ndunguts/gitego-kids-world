import json
import re
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ActivityLog, User, Video, VideoSession
from app.routers.children import resolve_active_child
from app.security import get_current_user, require_roles

router = APIRouter(prefix="/api/v1/videos", tags=["Cartoon & Video Center"])


class CreateVideoRequest(BaseModel):
    title: str
    description: str
    video_url: str
    provider: Optional[str] = None
    thumbnail_url: str = "🎬"
    category_name: str = "Animated Cartoons"
    language_code: str = "rw"
    age_group: str = "6-8"
    duration_seconds: int = 180
    status: str = "Published"
    ad_settings: Optional[dict[str, Any]] = None


class UpdateVideoRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    video_url: Optional[str] = None
    provider: Optional[str] = None
    thumbnail_url: Optional[str] = None
    category_name: Optional[str] = None
    language_code: Optional[str] = None
    age_group: Optional[str] = None
    duration_seconds: Optional[int] = None
    status: Optional[str] = None
    ad_settings: Optional[dict[str, Any]] = None


class VideoTelemetryRequest(BaseModel):
    child_id: Optional[int] = None
    session_id: Optional[int] = None
    event_type: str  # play_started, pause, resume, progress, completed
    position_seconds: float = 0.0
    active_delta_seconds: float = 0.0
    is_tab_visible: bool = True
    is_paused: bool = False


def parse_video_provider_adapter(video_url: str, explicit_provider: Optional[str] = None) -> tuple[str, str, bool]:
    """Validate and adapt external video URLs into safe embed URLs and identify event reliability."""
    url = video_url.strip()
    # YouTube watch or youtu.be or embed
    yt_match = re.search(
        r"(?:youtube\.com/(?:watch\?v=|embed/)|youtu\.be/)([A-Za-z0-9_-]{6,20})",
        url,
    )
    if yt_match:
        vid = yt_match.group(1)
        return "youtube", f"https://www.youtube.com/embed/{vid}?enablejsapi=1&rel=0", True

    # Vimeo
    vimeo_match = re.search(r"vimeo\.com/(?:video/)?(\d+)", url)
    if vimeo_match:
        vid = vimeo_match.group(1)
        return "vimeo", f"https://player.vimeo.com/video/{vid}", True

    # Self-hosted MP4/WebM
    if url.endswith((".mp4", ".webm", ".ogg")) or url.startswith("/uploads/"):
        return "self_hosted", url, True

    # Other external URL: do not assume reliable playback events
    prov = explicit_provider or "external_unverified"
    return prov, url, False


def _normalize_video_ad_slot(raw_slot: Optional[dict], default_trigger: Optional[int] = None) -> dict:
    slot = raw_slot if isinstance(raw_slot, dict) else {}
    raw_url = str(slot.get("video_url") or "").strip()
    provider, embed_url = "", ""
    if raw_url:
        provider, embed_url, _ = parse_video_provider_adapter(raw_url)
    res = {
        "enabled": bool(slot.get("enabled", False)) and bool(raw_url),
        "video_url": raw_url,
        "embed_url": embed_url,
        "provider": provider,
        "duration_seconds": max(3, min(300, int(slot.get("duration_seconds") or 10))),
        "skip_after_seconds": max(0, min(60, int(slot.get("skip_after_seconds") if slot.get("skip_after_seconds") is not None else 5))),
        "cta_text": str(slot.get("cta_text") or "").strip()[:80],
        "cta_url": str(slot.get("cta_url") or "").strip()[:500],
    }
    if default_trigger is not None:
        res["trigger_at_seconds"] = max(5, min(36000, int(slot.get("trigger_at_seconds") or default_trigger)))
    return res


def normalize_video_ad_settings(raw: Any) -> dict:
    if isinstance(raw, str):
        try:
            raw = json.loads(raw) if raw.strip() else {}
        except Exception:
            raw = {}
    data = raw if isinstance(raw, dict) else {}
    video_ads = data.get("video_ads") if isinstance(data.get("video_ads"), dict) else {}
    banner = data.get("banner") if isinstance(data.get("banner"), dict) else {}
    ticker = data.get("ticker") if isinstance(data.get("ticker"), dict) else {}
    watermark = data.get("watermark") if isinstance(data.get("watermark"), dict) else {}

    b_pos = str(banner.get("position") or "bottom")
    if b_pos not in {"top", "bottom"}:
        b_pos = "bottom"
    t_pos = str(ticker.get("position") or "bottom")
    if t_pos not in {"top", "bottom"}:
        t_pos = "bottom"
    t_speed = str(ticker.get("speed") or "normal")
    if t_speed not in {"slow", "normal", "fast"}:
        t_speed = "normal"
    w_pos = str(watermark.get("position") or "top-right")
    if w_pos not in {"top-left", "top-right", "bottom-left", "bottom-right"}:
        w_pos = "top-right"
    try:
        w_opacity = float(watermark.get("opacity") if watermark.get("opacity") is not None else 0.65)
    except Exception:
        w_opacity = 0.65
    w_opacity = max(0.1, min(1.0, round(w_opacity, 2)))

    return {
        "enabled": bool(data.get("enabled", False)),
        "video_ads": {
            "pre_roll": _normalize_video_ad_slot(video_ads.get("pre_roll")),
            "mid_roll": _normalize_video_ad_slot(video_ads.get("mid_roll"), default_trigger=30),
            "post_roll": _normalize_video_ad_slot(video_ads.get("post_roll")),
        },
        "banner": {
            "enabled": bool(banner.get("enabled", False)),
            "text": str(banner.get("text") or "").strip()[:240],
            "image_url": str(banner.get("image_url") or "").strip()[:500],
            "link_url": str(banner.get("link_url") or "").strip()[:500],
            "position": b_pos,
            "bg_color": str(banner.get("bg_color") or "#0f172a").strip()[:30],
            "text_color": str(banner.get("text_color") or "#ffffff").strip()[:30],
            "dismissible": bool(banner.get("dismissible", True)),
        },
        "ticker": {
            "enabled": bool(ticker.get("enabled", False)),
            "text": str(ticker.get("text") or "").strip()[:400],
            "position": t_pos,
            "speed": t_speed,
            "bg_color": str(ticker.get("bg_color") or "#f59e0b").strip()[:30],
            "text_color": str(ticker.get("text_color") or "#0b0d12").strip()[:30],
        },
        "watermark": {
            "enabled": bool(watermark.get("enabled", False)),
            "text": str(watermark.get("text") or "GITEGO KIDS").strip()[:60],
            "image_url": str(watermark.get("image_url") or "").strip()[:500],
            "position": w_pos,
            "opacity": w_opacity,
        },
    }


def _serialize_video(v: Video) -> dict:
    return {
        "id": v.id,
        "title": v.title,
        "description": v.description,
        "video_url": v.video_url,
        "embed_url": v.embed_url,
        "provider": v.provider,
        "provider_supports_events": v.provider_supports_events,
        "analytics_notice": (
            "Full playback telemetry enabled via official player API."
            if v.provider_supports_events
            else "External provider does not expose reliable playback telemetry."
        ),
        "thumbnail_url": v.thumbnail_url,
        "category_name": v.category_name,
        "language_code": v.language_code,
        "age_group": v.age_group,
        "duration_seconds": v.duration_seconds,
        "status": v.status,
        "view_count": v.view_count,
        "ad_settings": normalize_video_ad_settings(v.ad_settings_json),
        "created_at": v.created_at.isoformat() if v.created_at else None,
    }


@router.get("")
def list_videos(
    category: Optional[str] = None,
    language_code: Optional[str] = None,
    age_group: Optional[str] = None,
    search: Optional[str] = None,
    include_drafts: bool = False,
    db: Session = Depends(get_db),
):
    q = db.query(Video)
    if not include_drafts:
        q = q.filter(Video.status == "Published")
    if category:
        q = q.filter(Video.category_name.ilike(f"%{category}%"))
    if language_code:
        q = q.filter(Video.language_code == language_code)
    if age_group:
        q = q.filter(Video.age_group == age_group)
    if search:
        q = q.filter((Video.title.ilike(f"%{search}%")) | (Video.description.ilike(f"%{search}%")))
    videos = q.order_by(Video.id.asc()).all()
    return [_serialize_video(v) for v in videos]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_video(
    req: CreateVideoRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    provider, embed_url, supports_events = parse_video_provider_adapter(req.video_url, req.provider)
    video = Video(
        title=req.title,
        description=req.description,
        video_url=req.video_url,
        embed_url=embed_url,
        provider=provider,
        provider_supports_events=supports_events,
        thumbnail_url=req.thumbnail_url,
        category_name=req.category_name,
        language_code=req.language_code,
        age_group=req.age_group,
        duration_seconds=req.duration_seconds,
        status=req.status,
        ad_settings_json=json.dumps(normalize_video_ad_settings(req.ad_settings)) if req.ad_settings is not None else None,
    )
    db.add(video)
    db.flush()
    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="CREATE_VIDEO",
            resource_type="video",
            resource_id=str(video.id),
            summary=f"Added cartoon/video '{video.title}' ({provider})",
        )
    )
    db.commit()
    db.refresh(video)
    return _serialize_video(video)


@router.patch("/{video_id}")
def update_video(
    video_id: int,
    req: UpdateVideoRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    if req.status is not None and req.status not in {"Draft", "Review", "Published", "Archived"}:
        raise HTTPException(status_code=400, detail="Invalid video status")
    if req.duration_seconds is not None and req.duration_seconds < 1:
        raise HTTPException(status_code=400, detail="duration_seconds must be at least 1")

    for field in [
        "title",
        "description",
        "thumbnail_url",
        "category_name",
        "language_code",
        "age_group",
        "duration_seconds",
        "status",
    ]:
        val = getattr(req, field)
        if val is not None:
            setattr(video, field, val)

    if req.video_url is not None and req.video_url.strip():
        provider, embed_url, supports_events = parse_video_provider_adapter(req.video_url, req.provider)
        video.video_url = req.video_url.strip()
        video.provider = provider
        video.embed_url = embed_url
        video.provider_supports_events = supports_events

    if req.ad_settings is not None:
        video.ad_settings_json = json.dumps(normalize_video_ad_settings(req.ad_settings))

    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="UPDATE_VIDEO",
            resource_type="video",
            resource_id=str(video.id),
            summary=f"Updated video '{video.title}'",
        )
    )
    db.commit()
    db.refresh(video)
    return _serialize_video(video)


@router.post("/{video_id}/publish")
def publish_video(
    video_id: int,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    video.status = "Published"
    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="PUBLISH_VIDEO",
            resource_type="video",
            resource_id=str(video.id),
            summary=f"Published video '{video.title}'",
        )
    )
    db.commit()
    db.refresh(video)
    return _serialize_video(video)


@router.post("/{video_id}/archive")
def archive_video(
    video_id: int,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    video.status = "Archived"
    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="ARCHIVE_VIDEO",
            resource_type="video",
            resource_id=str(video.id),
            summary=f"Archived video '{video.title}'",
        )
    )
    db.commit()
    db.refresh(video)
    return _serialize_video(video)


@router.post("/{video_id}/duplicate", status_code=status.HTTP_201_CREATED)
def duplicate_video(
    video_id: int,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    src = db.query(Video).filter(Video.id == video_id).first()
    if not src:
        raise HTTPException(status_code=404, detail="Video not found")
    clone = Video(
        title=f"{src.title} (Copy)",
        description=src.description,
        video_url=src.video_url,
        embed_url=src.embed_url,
        provider=src.provider,
        provider_supports_events=src.provider_supports_events,
        thumbnail_url=src.thumbnail_url,
        category_name=src.category_name,
        language_code=src.language_code,
        age_group=src.age_group,
        duration_seconds=src.duration_seconds,
        status="Draft",
        ad_settings_json=src.ad_settings_json,
    )
    db.add(clone)
    db.flush()
    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="DUPLICATE_VIDEO",
            resource_type="video",
            resource_id=str(clone.id),
            summary=f"Duplicated video '{src.title}' as '{clone.title}'",
        )
    )
    db.commit()
    db.refresh(clone)
    return _serialize_video(clone)


@router.delete("/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_video(
    video_id: int,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    title = video.title
    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="DELETE_VIDEO",
            resource_type="video",
            resource_id=str(video.id),
            summary=f"Deleted video '{title}'",
        )
    )
    db.delete(video)
    db.commit()


@router.post("/{video_id}/sessions")
def track_video_playback_session(
    video_id: int,
    req: VideoTelemetryRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Record actual active watch time. Never counts paused playback or background tabs as active watch time."""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    child = resolve_active_child(req.child_id, user, db)
    session = None
    if req.session_id:
        session = (
            db.query(VideoSession)
            .filter(VideoSession.id == req.session_id, VideoSession.child_id == child.id)
            .first()
        )
    if not session:
        session = VideoSession(
            video_id=video.id,
            child_id=child.id,
            playback_state=req.event_type,
            last_position_seconds=req.position_seconds,
            active_watch_seconds=0.0,
            completed=False,
            provider_reliable=video.provider_supports_events,
        )
        video.view_count += 1
        db.add(session)
        db.flush()

    session.playback_state = req.event_type
    session.last_position_seconds = max(0.0, req.position_seconds)

    # Strictly credit active watch time ONLY when tab is visible, playback is not paused,
    # event is not 'pause', and the provider exposes reliable playback events
    counted_delta = 0.0
    if (
        video.provider_supports_events
        and req.is_tab_visible
        and not req.is_paused
        and req.event_type in {"play_started", "resume", "progress", "completed"}
        and req.active_delta_seconds > 0
    ):
        counted_delta = min(60.0, req.active_delta_seconds)
        session.active_watch_seconds += counted_delta
        if child.screen_time and counted_delta >= 60.0:
            child.screen_time.used_today_minutes += int(counted_delta // 60)

    if req.event_type == "completed":
        session.completed = True

    db.commit()
    db.refresh(session)
    return {
        "session_id": session.id,
        "video_id": video.id,
        "child_id": child.id,
        "playback_state": session.playback_state,
        "last_position_seconds": session.last_position_seconds,
        "active_watch_seconds": round(session.active_watch_seconds, 2),
        "counted_delta_seconds": round(counted_delta, 2),
        "completed": session.completed,
        "provider_reliable": session.provider_reliable,
    }
