"""Schemas for receptionist/manager desk dashboard summary."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class DeskActionItem(BaseModel):
    kind: str
    title: str
    body: Optional[str] = None
    href: str
    entity_id: Optional[str] = None


class DeskSummaryResponse(BaseModel):
    today_attendance_total: int
    today_open_count: int
    trial_open_count: int
    guests_today_count: int
    expiring: list[DeskActionItem]
    debt: list[DeskActionItem]
    renewals: list[DeskActionItem]
    trial_leads: list[DeskActionItem]
