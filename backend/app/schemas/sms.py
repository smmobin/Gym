"""Schemas for SMS status and desk send (no secrets)."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class SmsStatusResponse(BaseModel):
    enabled: bool
    provider: str
    label: str


class SmsTemplateOut(BaseModel):
    id: str
    title: str
    body: str


class SmsTemplateListResponse(BaseModel):
    items: list[SmsTemplateOut]
    total: int


class SmsSendRequest(BaseModel):
    template_id: str = Field(min_length=1, max_length=64)
    member_id: int = Field(gt=0)


class SmsCustomSendRequest(BaseModel):
    """Free-text SMS to a member; phone always from member row on server."""

    member_id: int = Field(gt=0)
    message: str = Field(min_length=1, max_length=700)

    def cleaned_message(self) -> str:
        return (self.message or "").strip()


class SmsSendResponse(BaseModel):
    ok: bool
    template_id: str
    member_id: int
    display_id: str
    provider: str
    message_id: Optional[str] = None
    detail: str
