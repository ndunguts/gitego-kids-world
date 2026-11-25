import datetime
from typing import Optional
from sqlalchemy.orm import Session

from app.models import ChildProfile

ONLINE_THRESHOLD_SECONDS = 45


def _as_utc(dt: Optional[datetime.datetime]) -> Optional[datetime.datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=datetime.timezone.utc)
    return dt.astimezone(datetime.timezone.utc)


def check_child_suspension(child: ChildProfile, db: Session) -> tuple[bool, Optional[str]]:
    """Return (is_currently_suspended, human_readable_message). Auto-unsuspends if expired."""
    if not child.is_suspended:
        return False, None

    now = datetime.datetime.now(datetime.timezone.utc)
    until = _as_utc(child.suspended_until)
    if until is not None and until <= now:
        child.is_suspended = False
        child.suspended_until = None
        child.suspension_reason = None
        db.commit()
        return False, None

    if until is not None:
        until_str = until.strftime("%Y-%m-%d %H:%M UTC")
        reason = f" ({child.suspension_reason})" if child.suspension_reason else ""
        return True, f"Account yahagaritswe n'umubyeyi kugeza {until_str}{reason}."
    reason = f" ({child.suspension_reason})" if child.suspension_reason else ""
    return True, f"Account yahagaritswe n'umubyeyi kugeza igihe azayifungurira{reason}."


def is_child_online(child: ChildProfile, threshold_seconds: int = ONLINE_THRESHOLD_SECONDS) -> bool:
    last_seen = _as_utc(child.last_seen_at)
    if not last_seen:
        return False
    now = datetime.datetime.now(datetime.timezone.utc)
    return (now - last_seen).total_seconds() <= threshold_seconds


def serialize_child_live_state(child: ChildProfile, db: Session) -> dict:
    suspended, susp_msg = check_child_suspension(child, db)
    online = is_child_online(child) and not suspended
    last_seen = _as_utc(child.last_seen_at)
    until = _as_utc(child.suspended_until)
    return {
        "is_online": online,
        "current_activity": (child.current_activity or "Browsing Child World") if online else None,
        "last_seen_at": last_seen.isoformat() if last_seen else None,
        "is_suspended": suspended,
        "suspended_until": until.isoformat() if until else None,
        "suspension_reason": child.suspension_reason if suspended else None,
        "suspension_message": susp_msg,
    }
