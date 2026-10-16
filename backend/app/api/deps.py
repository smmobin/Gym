"""FastAPI dependencies: current user and role gates."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.core.security import hash_session_token
from app.models.session import StaffSession
from app.models.user import User


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="نشست معتبر نیست. دوباره وارد شوید.",
        )

    token_hash = hash_session_token(token)
    now = datetime.now(tz=timezone.utc)
    stmt = (
        select(StaffSession)
        .where(
            StaffSession.token_hash == token_hash,
            StaffSession.revoked_at.is_(None),
            StaffSession.expires_at > now,
        )
        .limit(1)
    )
    staff_session = db.scalar(stmt)
    if staff_session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="نشست معتبر نیست. دوباره وارد شوید.",
        )

    user = db.get(User, staff_session.user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="حساب غیرفعال یا یافت نشد.",
        )
    return user


def require_roles(*roles: str) -> Callable[..., User]:
    allowed: Sequence[str] = roles

    def _dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="دسترسی مجاز نیست.",
            )
        return user

    return _dependency
