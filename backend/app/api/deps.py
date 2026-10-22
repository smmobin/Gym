"""FastAPI dependencies: staff user + athlete member gates (separate cookies)."""

from __future__ import annotations

from collections.abc import Callable, Sequence

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.core.security import hash_session_token
from app.models.athlete_session import AthleteSession
from app.models.enums import MemberStatus
from app.models.member import Member
from app.models.session import StaffSession
from app.models.user import User
from app.services.athlete_session import athlete_session_is_valid
from app.services.auth_session import session_is_valid


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
    stmt = (
        select(StaffSession)
        .where(
            StaffSession.token_hash == token_hash,
            StaffSession.revoked_at.is_(None),
        )
        .limit(1)
    )
    staff_session = db.scalar(stmt)
    if staff_session is None or not session_is_valid(staff_session, settings=settings):
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


def get_current_athlete(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Member:
    """Resolve athlete from gym_athlete_session only — staff cookie is ignored."""
    token = request.cookies.get(settings.athlete_session_cookie_name)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="نشست ورزشکار معتبر نیست. دوباره وارد شوید.",
        )

    token_hash = hash_session_token(token)
    stmt = (
        select(AthleteSession)
        .where(
            AthleteSession.token_hash == token_hash,
            AthleteSession.revoked_at.is_(None),
        )
        .limit(1)
    )
    athlete_session = db.scalar(stmt)
    if athlete_session is None or not athlete_session_is_valid(
        athlete_session, settings=settings
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="نشست ورزشکار معتبر نیست. دوباره وارد شوید.",
        )

    member = db.get(Member, athlete_session.member_id)
    if (
        member is None
        or member.status == MemberStatus.ARCHIVED.value
        or member.archived_at is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="حساب ورزشکار غیرفعال یا یافت نشد.",
        )
    return member

