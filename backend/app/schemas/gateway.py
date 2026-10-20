"""Schemas for payment gateway status and online payment start/callback."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.billing import PaymentOut


class GatewayStatusResponse(BaseModel):
    enabled: bool
    provider: str
    sandbox: bool
    label: str


class OnlinePaymentStartRequest(BaseModel):
    purpose: Literal["debt", "renew"]
    amount_toman: Optional[int] = Field(default=None, ge=0)
    plan_id: Optional[int] = None
    base_membership_id: Optional[int] = None
    note: Optional[str] = Field(default=None, max_length=5000)

    @field_validator("note")
    @classmethod
    def strip_note(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class OnlinePaymentStartResponse(BaseModel):
    payment: PaymentOut
    payment_url: str
    authority: str
    gateway: GatewayStatusResponse
    detail: str = "به صفحهٔ درگاه هدایت شوید."
