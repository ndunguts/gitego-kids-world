import datetime
import hashlib
import time
import uuid
from collections import defaultdict
from typing import Callable, Iterable, Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    pwd_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt(rounds=10)
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except Exception:
        return False


def create_access_token(
    subject: str,
    role: str,
    user_id: int,
    child_profile_id: Optional[int] = None,
    expires_delta: Optional[datetime.timedelta] = None,
) -> str:
    now = datetime.datetime.now(datetime.timezone.utc)
    expire = now + (
        expires_delta
        or datetime.timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {
        "sub": str(subject),
        "uid": user_id,
        "role": role,
        "child_profile_id": child_profile_id,
        "type": "access",
        "jti": str(uuid.uuid4()),
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(subject: str, role: str, user_id: int) -> str:
    now = datetime.datetime.now(datetime.timezone.utc)
    expire = now + datetime.timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": str(subject),
        "uid": user_id,
        "role": role,
        "type": "refresh",
        "jti": str(uuid.uuid4()),
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(
        payload,
        settings.JWT_REFRESH_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        if payload.get("type") != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
            )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token expired",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )


def decode_refresh_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            settings.JWT_REFRESH_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token type",
            )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )


def get_current_user_payload(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict:
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    return decode_access_token(credentials.credentials)


def get_current_user(
    payload: dict = Depends(get_current_user_payload),
    db: Session = Depends(get_db),
):
    from app.models import User

    user = db.query(User).filter(User.id == payload.get("uid")).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    # Attach token context (e.g. active child_profile_id or role override for child session)
    user._token_role = payload.get("role", user.role_name)
    user._token_child_profile_id = payload.get("child_profile_id")
    return user


def require_roles(allowed_roles: Iterable[str]) -> Callable:
    allowed = set(allowed_roles)

    def _checker(user=Depends(get_current_user)):
        effective_role = getattr(user, "_token_role", user.role_name)
        if effective_role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{effective_role}' is not permitted to access this resource",
            )
        return user

    return _checker


# Simple in-memory sliding-window rate limiter per client IP
_rate_buckets: dict[str, list[float]] = defaultdict(list)


def check_rate_limit(request: Request):
    client_ip = request.client.host if request.client else "local"
    now = time.time()
    window_start = now - 60.0
    bucket = [t for t in _rate_buckets[client_ip] if t > window_start]
    if len(bucket) >= settings.RATE_LIMIT_PER_MINUTE:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please slow down.",
        )
    bucket.append(now)
    _rate_buckets[client_ip] = bucket


def compute_score_signature(game_id: int, child_id: int, score: int, session_token: str) -> str:
    raw = f"{game_id}:{child_id}:{score}:{session_token}:{settings.JWT_SECRET_KEY}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
