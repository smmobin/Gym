"""Pydantic schemas for staff in-app notifications."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: int
    kind: str
    title: str
    body: Optional[str] = None
    role_audience: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    is_derived: bool
    is_read: bool
    created_at: datetime
    # Optional deep-link hint for UI (computed, not stored)
    href: Optional[str] = None

    model_config = {"from_attributes": True}


class NotificationListResponse(BaseModel):
    items: list[NotificationOut]
    total: int
    unread_count: int


class NotificationReadResponse(BaseModel):
    id: int
    is_read: bool


class NotificationReadAllResponse(BaseModel):
    marked: int
