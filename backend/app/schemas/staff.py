"""Pydantic schemas for staff user management (receptionist / trainer)."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.enums import StaffRole
from app.schemas.auth import UserOut
from app.schemas.trial_leads import _normalize_mobile

_CREATABLE_ROLES = {StaffRole.RECEPTIONIST.value, StaffRole.TRAINER.value}
MIN_PASSWORD_LEN = 8


class StaffCreateRequest(BaseModel):
    mobile: str = Field(min_length=10, max_length=20)
    password: str = Field(min_length=MIN_PASSWORD_LEN, max_length=72)
    full_name: str = Field(min_length=2, max_length=120)
    role: str

    @field_validator("mobile")
    @classmethod
    def mobile_ok(cls, value: str) -> str:
        return _normalize_mobile(value)

    @field_validator("full_name")
    @classmethod
    def name_ok(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("نام را کامل وارد کنید.")
        return cleaned

    @field_validator("role")
    @classmethod
    def role_ok(cls, value: str) -> str:
        role = value.strip().lower()
        if role not in _CREATABLE_ROLES:
            raise ValueError("نقش باید منشی یا مربی باشد.")
        return role

    @field_validator("password")
    @classmethod
    def password_ok(cls, value: str) -> str:
        if len(value) < MIN_PASSWORD_LEN:
            raise ValueError("رمز باید حداقل ۸ کاراکتر باشد.")
        return value


class StaffUpdateRequest(BaseModel):
    mobile: Optional[str] = Field(default=None, min_length=10, max_length=20)
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    role: Optional[str] = None
    password: Optional[str] = Field(default=None, min_length=MIN_PASSWORD_LEN, max_length=72)
    is_active: Optional[bool] = None

    @field_validator("mobile")
    @classmethod
    def mobile_ok(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return _normalize_mobile(value)

    @field_validator("full_name")
    @classmethod
    def name_ok(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("نام را کامل وارد کنید.")
        return cleaned

    @field_validator("role")
    @classmethod
    def role_ok(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        role = value.strip().lower()
        if role not in _CREATABLE_ROLES:
            raise ValueError("نقش باید منشی یا مربی باشد.")
        return role

    @field_validator("password")
    @classmethod
    def password_ok(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        if len(value) < MIN_PASSWORD_LEN:
            raise ValueError("رمز باید حداقل ۸ کاراکتر باشد.")
        return value

    @model_validator(mode="after")
    def at_least_one_field(self) -> StaffUpdateRequest:
        if (
            self.mobile is None
            and self.full_name is None
            and self.role is None
            and self.password is None
            and self.is_active is None
        ):
            raise ValueError("حداقل یک فیلد برای ویرایش لازم است.")
        return self


class StaffListResponse(BaseModel):
    items: list[UserOut]
    total: int


class StaffMutationResponse(BaseModel):
    user: UserOut
