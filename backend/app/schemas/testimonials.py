"""Schemas for landing member testimonials."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class MemberTestimonialOut(BaseModel):
    id: int
    body: str
    author_name: str
    author_meta: Optional[str] = None
    sort_order: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class MemberTestimonialListResponse(BaseModel):
    items: list[MemberTestimonialOut]
    total: int


class PublicTestimonialOut(BaseModel):
    id: int
    body: str
    author_name: str
    author_meta: Optional[str] = None
    sort_order: int

    model_config = {"from_attributes": True}


class PublicTestimonialListResponse(BaseModel):
    items: list[PublicTestimonialOut]
    total: int


class MemberTestimonialCreateRequest(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    author_name: str = Field(min_length=1, max_length=120)
    author_meta: Optional[str] = Field(default=None, max_length=160)
    sort_order: int = Field(default=0, ge=0, le=9999)
    is_active: bool = True

    @field_validator("body", "author_name")
    @classmethod
    def strip_required(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("این فیلد خالی است.")
        return cleaned

    @field_validator("author_meta")
    @classmethod
    def strip_meta(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class MemberTestimonialUpdateRequest(BaseModel):
    body: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    author_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    author_meta: Optional[str] = Field(default=None, max_length=160)
    sort_order: Optional[int] = Field(default=None, ge=0, le=9999)
    is_active: Optional[bool] = None
    clear_author_meta: bool = False

    @field_validator("body", "author_name")
    @classmethod
    def strip_optional(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("این فیلد خالی است.")
        return cleaned

    @field_validator("author_meta")
    @classmethod
    def strip_meta(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class MemberTestimonialMutationResponse(BaseModel):
    testimonial: MemberTestimonialOut
