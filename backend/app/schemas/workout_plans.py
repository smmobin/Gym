"""Schemas for textual workout plans."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class WorkoutPlanCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    body: Optional[str] = None

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("عنوان خالی است.")
        return cleaned

    @field_validator("body")
    @classmethod
    def strip_body(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class WorkoutPlanUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=160)
    body: Optional[str] = None

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("عنوان خالی است.")
        return cleaned

    @field_validator("body")
    @classmethod
    def strip_body(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class WorkoutPlanOut(BaseModel):
    id: int
    member_id: int
    trainer_user_id: int
    trainer_full_name: Optional[str] = None
    title: str
    body: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class WorkoutPlanListResponse(BaseModel):
    member_id: int
    items: list[WorkoutPlanOut]
    total: int
