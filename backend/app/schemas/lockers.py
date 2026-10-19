"""Schemas for lockers and assignments."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class LockerCreate(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    is_active: bool = True

    @field_validator("code")
    @classmethod
    def strip_code(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("کد کمد خالی است.")
        return cleaned


class LockerUpdate(BaseModel):
    is_active: Optional[bool] = None
    code: Optional[str] = Field(default=None, min_length=1, max_length=32)

    @field_validator("code")
    @classmethod
    def strip_code(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("کد کمد خالی است.")
        return cleaned


class AssignmentOut(BaseModel):
    id: int
    member_id: int
    member_display_id: Optional[str] = None
    member_name: Optional[str] = None
    membership_id: Optional[int] = None
    assigned_at: datetime
    released_at: Optional[datetime] = None
    note: Optional[str] = None

    model_config = {"from_attributes": True}


class LockerOut(BaseModel):
    id: int
    code: str
    is_active: bool
    is_free: bool
    current_assignment: Optional[AssignmentOut] = None

    model_config = {"from_attributes": True}


class LockerListResponse(BaseModel):
    items: list[LockerOut]
    total: int


class AssignRequest(BaseModel):
    member_id: int
    membership_id: Optional[int] = None
    note: Optional[str] = Field(default=None, max_length=255)


class AssignResponse(BaseModel):
    locker: LockerOut
    assignment: AssignmentOut


class ReleaseResponse(BaseModel):
    locker: LockerOut
    assignment: AssignmentOut


class MemberLockerResponse(BaseModel):
    member_id: int
    locker: Optional[LockerOut] = None
    assignment: Optional[AssignmentOut] = None
