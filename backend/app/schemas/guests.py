"""Schemas for day-guest registration."""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.models.enums import PaymentMethod
from app.schemas.members import MemberOut
from app.schemas.trial_leads import _normalize_mobile

_METHODS = {m.value for m in PaymentMethod}


class DayGuestCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    mobile: str = Field(min_length=10, max_length=20)
    agreed_amount_toman: int = Field(..., ge=0)
    payment_method: Optional[str] = Field(default=PaymentMethod.CASH.value)
    pay_now: bool = True
    notes: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("first_name", "last_name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("این فیلد الزامی است")
        return cleaned

    @field_validator("mobile")
    @classmethod
    def mobile_ok(cls, value: str) -> str:
        return _normalize_mobile(value)

    @field_validator("payment_method")
    @classmethod
    def method_ok(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return PaymentMethod.CASH.value
        if value not in _METHODS:
            raise ValueError("روش پرداخت نامعتبر است.")
        return value

    @field_validator("notes")
    @classmethod
    def strip_notes(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class DayGuestMembershipOut(BaseModel):
    id: int
    plan_id: int
    plan_name: Optional[str] = None
    agreed_amount_toman: int
    start_date: date
    end_date: date
    status: str

    model_config = {"from_attributes": True}


class DayGuestPaymentOut(BaseModel):
    id: int
    receipt_number: str
    amount_toman: int
    method: str
    status: str

    model_config = {"from_attributes": True}


class DayGuestResponse(BaseModel):
    member: MemberOut
    membership: DayGuestMembershipOut
    payment: Optional[DayGuestPaymentOut] = None
    reused_existing_member: bool
    message: str
