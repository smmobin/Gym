"""Pydantic schemas for member file lock API."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MemberLockOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    locked: bool
    member_id: int
    locked_by: int | None = None
    locked_by_name: str | None = None
    locked_by_mobile: str | None = None
    acquired_at: datetime | None = None
    last_seen_at: datetime | None = None
    expires_at: datetime | None = None
    held_by_me: bool = False
