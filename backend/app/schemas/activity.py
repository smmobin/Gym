from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class ActivityItemOut(BaseModel):
    id: str
    source: str
    category: str
    action: str
    outcome: str
    created_at: datetime
    actor_name: str | None = None
    actor_role: str | None = None
    summary: str
    request_id: str | None = None
    method: str | None = None
    path: str | None = None
    status_code: int | None = None


class ActivityListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    items: list[ActivityItemOut]
    from_date: date = Field(serialization_alias="from")
    to_date: date = Field(serialization_alias="to")
    next_cursor: str | None = None
    categories: list[str]
