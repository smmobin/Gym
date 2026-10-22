"""Create / revoke / idle-touch staff sessions."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import hash_session_token, new_session_token
from app.models.session import StaffSession
from app.models.user import User


def _aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _idle_delta(settings: Settings) -> timedelta:
    return timedelta(minutes=max(1, int(settings.session_idle_minutes)))


def _absolute_end(row: StaffSession, settings: Settings) -> datetime:
    return _aware(row.created_at) + timedelta(hours=max(1, int(settings.session_ttl_hours)))


def create_session(
    db: Session,
    *,
    user: User,
    settings: Settings,
    user_agent: str | None = None,
) -> tuple[StaffSession, str]:
    raw_token = new_session_token()
    now = datetime.now(tz=timezone.utc)
    expires_at = now + _idle_delta(settings)
    row = StaffSession(
        token_hash=hash_session_token(raw_token),
        user_id=user.id,
        expires_at=expires_at,
        user_agent=(user_agent or "")[:255] or None,
    )
    db.add(row)
    db.flush()
    return row, raw_token


def session_is_valid(row: StaffSession, *, settings: Settings, now: datetime | None = None) -> bool:
    current = now or datetime.now(tz=timezone.utc)
    if row.revoked_at is not None:
        return False
    if current >= _aware(row.expires_at):
        return False
    if current >= _absolute_end(row, settings):
        return False
    return True


def touch_session_by_token(db: Session, *, token: str, settings: Settings) -> bool:
    """Extend idle expiry after real user activity. Does not revive an expired session."""
    token_hash = hash_session_token(token)
    row = db.scalar(
        select(StaffSession).where(
            StaffSession.token_hash == token_hash,
            StaffSession.revoked_at.is_(None),
        )
    )
    if row is None:
        return False
    now = datetime.now(tz=timezone.utc)
    if not session_is_valid(row, settings=settings, now=now):
        return False
    absolute = _absolute_end(row, settings)
    row.expires_at = min(now + _idle_delta(settings), absolute)
    db.flush()
    return True


def revoke_session_by_token(db: Session, *, token: str) -> bool:
    token_hash = hash_session_token(token)
    row = db.scalar(
        select(StaffSession).where(
            StaffSession.token_hash == token_hash,
            StaffSession.revoked_at.is_(None),
        )
    )
    if row is None:
        return False
    row.revoked_at = datetime.now(tz=timezone.utc)
    db.flush()
    return True


def revoke_all_sessions_for_user(db: Session, *, user_id: int) -> int:
    """Invalidate every active staff session for a user (e.g. after deactivate)."""
    now = datetime.now(tz=timezone.utc)
    rows = list(
        db.scalars(
            select(StaffSession).where(
                StaffSession.user_id == user_id,
                StaffSession.revoked_at.is_(None),
            )
        ).all()
    )
    for row in rows:
        row.revoked_at = now
    if rows:
        db.flush()
    return len(rows)
