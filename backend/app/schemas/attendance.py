"""Schemas for attendance check-in / check-out."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


AttendanceTypeLiteral = Literal["gym", "class", "pt"]


class CheckInRequest(BaseModel):
    member_id: int
    attendance_type: AttendanceTypeLiteral
    confirm_second_visit: bool = False
    membership_id: Optional[int] = None


class AttendanceOut(BaseModel):
    id: int
    member_id: int
    membership_id: Optional[int] = None
    check_in_at: datetime
    check_out_at: Optional[datetime] = None
    attendance_type: str
    recorded_by_user_id: Optional[int] = None
    is_open: bool = False

    model_config = {"from_attributes": True}


class CheckInResponse(BaseModel):
    attendance: AttendanceOut
    debt_toman: int = 0
    debt_warning: Optional[str] = None
    sessions_remaining: Optional[int] = None
    auto_closed_attendance_ids: list[int] = Field(default_factory=list)


class CheckOutResponse(BaseModel):
    attendance: AttendanceOut


class TodayAttendancesResponse(BaseModel):
    items: list[AttendanceOut]
    total: int
    auto_closed_attendance_ids: list[int] = Field(default_factory=list)
