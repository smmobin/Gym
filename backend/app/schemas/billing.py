"""Pydantic schemas for plans, memberships, and payments."""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class MembershipPlanOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    duration_days: Optional[int] = None
    session_count: Optional[int] = None
    base_price_toman: int
    includes_locker: bool
    is_active: bool

    model_config = {"from_attributes": True}


class MembershipPlanListResponse(BaseModel):
    items: list[MembershipPlanOut]
    total: int


class MembershipOut(BaseModel):
    id: int
    member_id: int
    plan_id: int
    plan_name: Optional[str] = None
    agreed_amount_toman: int
    start_date: date
    end_date: date
    status: str
    sessions_remaining: Optional[int] = None
    freeze_started_at: Optional[date] = None
    freeze_ends_at: Optional[date] = None
    freeze_days_used: int = 0
    remaining_freeze_days_this_year: int = 0
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class MembershipListResponse(BaseModel):
    items: list[MembershipOut]
    total: int
    debt_toman: int
    freeze_annual_cap_days: int = 14
    freeze_days_used_member: int = 0
    remaining_freeze_days_this_year: int = 0
    freeze_cap_year: Optional[int] = None


class FreezeMembershipRequest(BaseModel):
    """Provide either days (>0) or freeze_ends_at (exclusive resume date after today)."""

    days: Optional[int] = Field(default=None, ge=1, le=366)
    freeze_ends_at: Optional[date] = None


class FreezeMembershipResponse(BaseModel):
    membership: MembershipOut
    remaining_freeze_days_this_year: int


class RenewMembershipRequest(BaseModel):
    plan_id: int
    agreed_amount_toman: int = Field(ge=0)
    base_membership_id: Optional[int] = None
    notes: Optional[str] = Field(default=None, max_length=5000)

    @field_validator("notes")
    @classmethod
    def strip_notes(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class RenewMembershipResponse(BaseModel):
    membership: MembershipOut
    debt_toman: int
    base_membership_id: Optional[int] = None


class CancelMembershipResponse(BaseModel):
    membership: MembershipOut


class PaymentOut(BaseModel):
    id: int
    member_id: int
    membership_id: Optional[int] = None
    amount_toman: int
    method: str
    status: str
    receipt_number: str
    title: Optional[str] = None
    note: Optional[str] = None
    paid_at: Optional[datetime] = None
    created_by_user_id: Optional[int] = None
    created_at: datetime
    status_changed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PaymentListResponse(BaseModel):
    items: list[PaymentOut]
    total: int
    debt_toman: int


class CreatePaymentRequest(BaseModel):
    member_id: int
    amount_toman: int = Field(ge=0)
    method: str
    membership_id: Optional[int] = None
    status: str = "paid"
    title: Optional[str] = Field(default=None, max_length=200)
    note: Optional[str] = Field(default=None, max_length=5000)

    @field_validator("method", "status")
    @classmethod
    def strip_enums(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("title", "note")
    @classmethod
    def strip_optional(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class PaymentMutationResponse(BaseModel):
    payment: PaymentOut
    debt_toman: int
