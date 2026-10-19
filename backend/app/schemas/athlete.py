"""Pydantic schemas for athlete auth and self-service APIs."""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class AthleteLoginRequest(BaseModel):
    mobile: str = Field(min_length=10, max_length=20)
    password: str = Field(min_length=8, max_length=72)

    @field_validator("mobile")
    @classmethod
    def strip_mobile(cls, value: str) -> str:
        return value.strip()


class AthleteOut(BaseModel):
    id: int
    display_id: str
    first_name: str
    last_name: str
    mobile: str
    status: str

    model_config = {"from_attributes": True}


class AthleteLoginResponse(BaseModel):
    member: AthleteOut


class AthleteMeResponse(BaseModel):
    member: AthleteOut


class MessageResponse(BaseModel):
    detail: str


class AthletePasswordSet(BaseModel):
    password: str = Field(min_length=8, max_length=72)


class AthleteProfilePatch(BaseModel):
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    last_name: Optional[str] = Field(default=None, min_length=1, max_length=80)

    @field_validator("first_name", "last_name")
    @classmethod
    def strip_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("نام خالی نباشد.")
        return cleaned


class AthleteMembershipOut(BaseModel):
    id: int
    plan_id: int
    plan_name: Optional[str] = None
    agreed_amount_toman: int
    start_date: date
    end_date: date
    status: str
    sessions_remaining: Optional[int] = None

    model_config = {"from_attributes": True}


class AthleteMembershipsResponse(BaseModel):
    items: list[AthleteMembershipOut]
    total: int
    debt_toman: int


class AthletePaymentOut(BaseModel):
    id: int
    amount_toman: int
    method: str
    status: str
    receipt_number: Optional[str] = None
    paid_at: Optional[datetime] = None
    created_at: datetime
    membership_id: Optional[int] = None

    model_config = {"from_attributes": True}


class AthletePaymentsResponse(BaseModel):
    items: list[AthletePaymentOut]
    total: int


class AthleteWorkoutPlanOut(BaseModel):
    id: int
    title: str
    body: Optional[str] = None
    trainer_full_name: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AthleteWorkoutPlansResponse(BaseModel):
    items: list[AthleteWorkoutPlanOut]
    total: int


class AthleteNotificationOut(BaseModel):
    id: int
    kind: str
    title: str
    body: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AthleteNotificationListResponse(BaseModel):
    items: list[AthleteNotificationOut]
    total: int
    unread_count: int


class AthleteNotificationReadResponse(BaseModel):
    id: int
    is_read: bool


class RenewalRequestCreate(BaseModel):
    note: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("note")
    @classmethod
    def strip_note(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class RenewalRequestResponse(BaseModel):
    detail: str
    staff_notification_id: int


class AthleteGroupClassOut(BaseModel):
    id: int
    title: str
    trainer_user_id: Optional[int] = None
    trainer_full_name: Optional[str] = None
    capacity: int
    booked_count: int
    remaining: int
    gender_label: str
    starts_at: datetime
    ends_at: datetime
    is_active: bool
    booked_by_me: bool = False
    my_booking_id: Optional[int] = None


class AthleteGroupClassListResponse(BaseModel):
    items: list[AthleteGroupClassOut]
    total: int


class AthleteClassBookingOut(BaseModel):
    id: int
    group_class_id: int
    class_title: Optional[str] = None
    status: str
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AthleteClassBookingListResponse(BaseModel):
    items: list[AthleteClassBookingOut]
    total: int


class AthleteBookClassResponse(BaseModel):
    booking: AthleteClassBookingOut
    booked_count: int
    remaining: int


class AthleteCancelBookingResponse(BaseModel):
    booking: AthleteClassBookingOut
    booked_count: int
    remaining: int
