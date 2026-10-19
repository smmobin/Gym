"""Schemas for public trial form and desk queue."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.models.enums import TrialLeadStatus

_STATUSES = {s.value for s in TrialLeadStatus}


def _normalize_mobile(value: str) -> str:
    cleaned = value.strip().replace(" ", "").replace("-", "")
    if len(cleaned) < 10 or not cleaned.isdigit():
        raise ValueError("موبایل معتبر نیست (حداقل ۱۰ رقم).")
    return cleaned


class TrialLeadPublicCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    mobile: str = Field(min_length=10, max_length=20)
    preferred_time_note: Optional[str] = Field(default=None, max_length=255)
    message: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("full_name")
    @classmethod
    def name_ok(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("نام را کامل وارد کنید.")
        return cleaned

    @field_validator("mobile")
    @classmethod
    def mobile_ok(cls, value: str) -> str:
        return _normalize_mobile(value)

    @field_validator("preferred_time_note", "message")
    @classmethod
    def optional_strip(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class TrialLeadPatch(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def status_ok(cls, value: str) -> str:
        if value not in _STATUSES:
            raise ValueError(
                "وضعیت نامعتبر است. یکی از: new, contacted, converted, closed"
            )
        return value


class TrialLeadOut(BaseModel):
    id: int
    full_name: str
    mobile: str
    preferred_time_note: Optional[str] = None
    message: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class TrialLeadListResponse(BaseModel):
    items: list[TrialLeadOut]
    total: int


class TrialLeadPublicResponse(BaseModel):
    id: int
    message: str = "درخواست ثبت شد. منشی باشگاه با شما تماس می‌گیرد."
