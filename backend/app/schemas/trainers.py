"""Schemas for trainer list and member–trainer assignments."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class TrainerOut(BaseModel):
    id: int
    full_name: str
    mobile: str
    is_active: bool

    model_config = {"from_attributes": True}


class TrainerListResponse(BaseModel):
    items: list[TrainerOut]
    total: int


class AssignmentOut(BaseModel):
    id: int
    trainer_user_id: int
    trainer_full_name: Optional[str] = None
    trainer_mobile: Optional[str] = None
    member_id: int
    assigned_at: datetime
    ended_at: Optional[datetime] = None
    is_active: bool

    model_config = {"from_attributes": True}


class AssignmentListResponse(BaseModel):
    member_id: int
    items: list[AssignmentOut]
    total: int


class AssignTrainerRequest(BaseModel):
    trainer_user_id: int = Field(gt=0)


class AssignTrainerResponse(BaseModel):
    assignment: AssignmentOut


class EndAssignmentResponse(BaseModel):
    assignment: AssignmentOut
