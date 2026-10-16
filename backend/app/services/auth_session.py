"""Create / revoke staff sessions."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import hash_session_token, new_session_token
from app.models.session import StaffSession
from app.models.user import User


def create_session(
    db: Session,
    *,
    user: User,
    settings: Settings,
    user_agent: str | None = None,
) -> tuple[StaffSession, str]:
    raw_token = new_session_token()
    expires_at = datetime.now(tz=timezone.utc) + timedelta(hours=settings.session_ttl_hours)
    row = StaffSession(
        token_hash=hash_session_token(raw_token),
        user_id=user.id,
        expires_at=expires_at,
        user_agent=(user_agent or "")[:255] or None,
    )
    db.add(row)
    db.flush()
    return row, raw_token


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
