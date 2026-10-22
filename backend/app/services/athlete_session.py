"""Create / revoke / idle-touch athlete (member) sessions — separate from staff."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import hash_session_token, new_session_token
from app.models.athlete_session import AthleteSession
from app.models.member import Member


def _aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _idle_delta(settings: Settings) -> timedelta:
    return timedelta(minutes=max(1, int(settings.athlete_session_idle_minutes)))


def _absolute_end(row: AthleteSession, settings: Settings) -> datetime:
    return _aware(row.created_at) + timedelta(
        hours=max(1, int(settings.athlete_session_ttl_hours))
    )


def create_athlete_session(
    db: Session,
    *,
    member: Member,
    settings: Settings,
    user_agent: str | None = None,
) -> tuple[AthleteSession, str]:
    raw_token = new_session_token()
    now = datetime.now(tz=timezone.utc)
    expires_at = now + _idle_delta(settings)
    row = AthleteSession(
        token_hash=hash_session_token(raw_token),
        member_id=member.id,
        expires_at=expires_at,
        user_agent=(user_agent or "")[:255] or None,
    )
    db.add(row)
    db.flush()
    return row, raw_token


def athlete_session_is_valid(
    row: AthleteSession, *, settings: Settings, now: datetime | None = None
) -> bool:
    current = now or datetime.now(tz=timezone.utc)
    if row.revoked_at is not None:
        return False
    if current >= _aware(row.expires_at):
        return False
    if current >= _absolute_end(row, settings):
        return False
    return True


def touch_athlete_session_by_token(db: Session, *, token: str, settings: Settings) -> bool:
    token_hash = hash_session_token(token)
    row = db.scalar(
        select(AthleteSession).where(
            AthleteSession.token_hash == token_hash,
            AthleteSession.revoked_at.is_(None),
        )
    )
    if row is None:
        return False
    now = datetime.now(tz=timezone.utc)
    if not athlete_session_is_valid(row, settings=settings, now=now):
        return False
    absolute = _absolute_end(row, settings)
    row.expires_at = min(now + _idle_delta(settings), absolute)
    db.flush()
    return True


def revoke_athlete_session_by_token(db: Session, *, token: str) -> bool:
    token_hash = hash_session_token(token)
    row = db.scalar(
        select(AthleteSession).where(
            AthleteSession.token_hash == token_hash,
            AthleteSession.revoked_at.is_(None),
        )
    )
    if row is None:
        return False
    row.revoked_at = datetime.now(tz=timezone.utc)
    db.flush()
    return True
