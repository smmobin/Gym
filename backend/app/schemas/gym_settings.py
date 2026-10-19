"""Pydantic schemas for club (Azar) settings."""

from __future__ import annotations

from datetime import datetime, time
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class GymSettingsOut(BaseModel):
    id: int
    gym_name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    day_end_time: time
    expiry_warning_days: int
    freeze_annual_cap_days: int
    working_hours_note: Optional[str] = None
    renewal_rules_note: Optional[str] = None
    updated_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class GymSettingsPatch(BaseModel):
    gym_name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=32)
    address: Optional[str] = Field(default=None, max_length=2000)
    day_end_time: Optional[time] = None
    expiry_warning_days: Optional[int] = Field(default=None, ge=1, le=90)
    freeze_annual_cap_days: Optional[int] = Field(default=None, ge=0, le=365)
    working_hours_note: Optional[str] = Field(default=None, max_length=2000)
    renewal_rules_note: Optional[str] = Field(default=None, max_length=4000)

    @field_validator("gym_name")
    @classmethod
    def strip_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("نام باشگاه خالی نباشد.")
        return cleaned
