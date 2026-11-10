"""Append-only audit log helpers for financial / membership / auth events."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

import app.core.db as db_mod
from app.core.request_context import get_request_id
from app.models.audit import AuditLog

logger = logging.getLogger("gym.audit")


def write_audit(
    db: Session,
    *,
    actor_user_id: int | None,
    action: str,
    entity_type: str,
    entity_id: str | int | None = None,
    summary: str | None = None,
    payload: dict[str, Any] | None = None,
) -> AuditLog:
    row = AuditLog(
        actor_user_id=actor_user_id,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        summary=summary,
        payload=payload,
        request_id=get_request_id(),
    )
    db.add(row)
    db.flush()
    return row


def write_audit_isolated(**kwargs: Any) -> None:
    """Commit an audit row in its own session.

    For events on failing requests (e.g. login failure) whose request session is
    rolled back when the HTTPException propagates. Never raises.
    """
    session = db_mod.SessionLocal()
    try:
        write_audit(session, **kwargs)
        session.commit()
    except Exception:  # pragma: no cover - audit must not break the request
        session.rollback()
        logger.exception("isolated audit write failed action=%s", kwargs.get("action"))
    finally:
        session.close()
