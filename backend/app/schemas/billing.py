"""Pydantic schemas for plans, memberships, and payments."""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator


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


class PublicMembershipPlanOut(BaseModel):
    """Minimal plan fields for the public landing (active plans only)."""

    id: int
    name: str
    description: Optional[str] = None
    duration_days: Optional[int] = None
    session_count: Optional[int] = None
    base_price_toman: int
    includes_locker: bool

    model_config = {"from_attributes": True}


class PublicMembershipPlanListResponse(BaseModel):
    items: list[PublicMembershipPlanOut]
    total: int


class MembershipPlanCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=5000)
    duration_days: Optional[int] = Field(default=None, ge=1)
    session_count: Optional[int] = Field(default=None, ge=1)
    base_price_toman: int = Field(ge=0)
    includes_locker: bool = False
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def name_ok(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("نام طرح اجباری است.")
        return cleaned

    @field_validator("description")
    @classmethod
    def desc_ok(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @model_validator(mode="after")
    def need_duration_or_sessions(self) -> MembershipPlanCreateRequest:
        if self.duration_days is None and self.session_count is None:
            raise ValueError("حداقل یکی از مدت (روز) یا تعداد جلسه باید >۰ باشد.")
        return self


class MembershipPlanUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=5000)
    duration_days: Optional[int] = Field(default=None, ge=1)
    session_count: Optional[int] = Field(default=None, ge=1)
    base_price_toman: Optional[int] = Field(default=None, ge=0)
    includes_locker: Optional[bool] = None
    is_active: Optional[bool] = None
    clear_duration_days: bool = False
    clear_session_count: bool = False

    @field_validator("name")
    @classmethod
    def name_ok(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("نام طرح اجباری است.")
        return cleaned

    @field_validator("description")
    @classmethod
    def desc_ok(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @model_validator(mode="after")
    def at_least_one(self) -> MembershipPlanUpdateRequest:
        if (
            self.name is None
            and self.description is None
            and self.duration_days is None
            and self.session_count is None
            and self.base_price_toman is None
            and self.includes_locker is None
            and self.is_active is None
            and not self.clear_duration_days
            and not self.clear_session_count
        ):
            raise ValueError("حداقل یک فیلد برای ویرایش لازم است.")
        return self


class MembershipPlanMutationResponse(BaseModel):
    plan: MembershipPlanOut


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
