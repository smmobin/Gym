"""Schemas for group classes and bookings."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


GenderLabelLiteral = Literal["men", "women", "mixed"]


class GroupClassCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    capacity: int = Field(gt=0)
    gender_label: GenderLabelLiteral = "mixed"
    starts_at: datetime
    ends_at: datetime
    trainer_user_id: Optional[int] = None

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("عنوان کلاس خالی است.")
        return cleaned


class GroupClassUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=160)
    capacity: Optional[int] = Field(default=None, gt=0)
    gender_label: Optional[GenderLabelLiteral] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    trainer_user_id: Optional[int] = None
    is_active: Optional[bool] = None

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("عنوان کلاس خالی است.")
        return cleaned


class GroupClassOut(BaseModel):
    id: int
    title: str
    trainer_user_id: Optional[int] = None
    capacity: int
    booked_count: int
    remaining: int
    gender_label: str
    starts_at: datetime
    ends_at: datetime
    is_active: bool
    trainer_schedule_conflict: bool = False

    model_config = {"from_attributes": True}


class GroupClassListResponse(BaseModel):
    items: list[GroupClassOut]
    total: int


class GroupClassMutationResponse(BaseModel):
    group_class: GroupClassOut
    trainer_schedule_conflict: bool = False
    warning: Optional[str] = None


class BookingCreate(BaseModel):
    member_id: int


class BookingOut(BaseModel):
    id: int
    group_class_id: int
    member_id: int
    member_display_id: Optional[str] = None
    member_name: Optional[str] = None
    status: str
    created_at: datetime
    cancelled_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class BookingListResponse(BaseModel):
    items: list[BookingOut]
    total: int
    booked_count: int
    remaining: int


class BookingMutationResponse(BaseModel):
    booking: BookingOut
    booked_count: int
    remaining: int


class BookingOutcomeRequest(BaseModel):
    membership_id: Optional[int] = None


class BookingOutcomeResponse(BaseModel):
    booking: BookingOut
    booked_count: int
    remaining: int
    session_deducted: bool
    sessions_remaining: Optional[int] = None
    membership_id: Optional[int] = None
    already_deducted_via_attendance: bool = False
