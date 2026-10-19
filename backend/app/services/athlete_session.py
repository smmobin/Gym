"""Create / revoke athlete (member) sessions — separate from staff."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import hash_session_token, new_session_token
from app.models.athlete_session import AthleteSession
from app.models.member import Member


def create_athlete_session(
    db: Session,
    *,
    member: Member,
    settings: Settings,
    user_agent: str | None = None,
) -> tuple[AthleteSession, str]:
    raw_token = new_session_token()
    expires_at = datetime.now(tz=timezone.utc) + timedelta(
        hours=settings.athlete_session_ttl_hours
    )
    row = AthleteSession(
        token_hash=hash_session_token(raw_token),
        member_id=member.id,
        expires_at=expires_at,
        user_agent=(user_agent or "")[:255] or None,
    )
    db.add(row)
    db.flush()
    return row, raw_token


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
