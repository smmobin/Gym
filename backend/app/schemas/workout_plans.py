"""Schemas for structured workout plans + exercise catalog."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

WorkoutUnit = Literal["reps", "seconds"]


class WorkoutPlanItemIn(BaseModel):
    exercise_name: str = Field(min_length=1, max_length=120)
    exercise_id: Optional[int] = None
    sets: int = Field(ge=1, le=99)
    amount: int = Field(ge=1, le=9999)
    unit: WorkoutUnit = "reps"
    note: Optional[str] = Field(default=None, max_length=240)

    @field_validator("exercise_name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("نام حرکت خالی است.")
        return cleaned

    @field_validator("note")
    @classmethod
    def strip_note(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class WorkoutPlanItemOut(BaseModel):
    exercise_name: str
    exercise_id: Optional[int] = None
    sets: int
    amount: int
    unit: WorkoutUnit = "reps"
    note: Optional[str] = None


class WorkoutPlanCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    items: list[WorkoutPlanItemIn] = Field(default_factory=list)
    # Legacy clients may still send body; ignored when items is non-empty.
    body: Optional[str] = None

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("عنوان خالی است.")
        return cleaned

    @model_validator(mode="after")
    def require_items_or_body(self) -> WorkoutPlanCreate:
        if self.items:
            return self
        if self.body and self.body.strip():
            return self
        raise ValueError("حداقل یک حرکت یا متن برنامه لازم است.")


class WorkoutPlanUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=160)
    items: Optional[list[WorkoutPlanItemIn]] = None
    body: Optional[str] = None

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("عنوان خالی است.")
        return cleaned

    @model_validator(mode="after")
    def items_not_empty_when_set(self) -> WorkoutPlanUpdate:
        if self.items is not None and len(self.items) == 0:
            raise ValueError("جدول حرکات نمی‌تواند خالی باشد.")
        return self


class WorkoutPlanOut(BaseModel):
    id: int
    member_id: int
    trainer_user_id: int
    trainer_full_name: Optional[str] = None
    title: str
    body: Optional[str] = None
    items: list[WorkoutPlanItemOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class WorkoutPlanListResponse(BaseModel):
    member_id: int
    items: list[WorkoutPlanOut]
    total: int


class WorkoutExerciseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("نام حرکت خالی است.")
        return cleaned


class WorkoutExerciseOut(BaseModel):
    id: int
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class WorkoutExerciseListResponse(BaseModel):
    items: list[WorkoutExerciseOut]
    total: int
