"""Pydantic schemas for members API."""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class MemberCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    mobile: str = Field(min_length=10, max_length=20)
    birth_date: Optional[date] = None
    notes: Optional[str] = Field(default=None, max_length=5000)

    @field_validator("first_name", "last_name", "mobile")
    @classmethod
    def strip_required(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("این فیلد الزامی است")
        return cleaned

    @field_validator("notes")
    @classmethod
    def strip_notes(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class MemberUpdate(BaseModel):
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    last_name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    mobile: Optional[str] = Field(default=None, min_length=10, max_length=20)
    birth_date: Optional[date] = None
    notes: Optional[str] = Field(default=None, max_length=5000)

    @field_validator("first_name", "last_name", "mobile")
    @classmethod
    def strip_optional(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("این فیلد نمی‌تواند خالی باشد")
        return cleaned

    @field_validator("notes")
    @classmethod
    def strip_notes(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return value.strip()


class MemberOut(BaseModel):
    id: int
    display_id: str
    first_name: str
    last_name: str
    mobile: str
    birth_date: Optional[date] = None
    notes: Optional[str] = None
    status: str
    archived_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class MemberListResponse(BaseModel):
    items: list[MemberOut]
    total: int
