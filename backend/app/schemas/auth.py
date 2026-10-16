"""Pydantic schemas for staff auth."""

from pydantic import BaseModel, Field, field_validator


class LoginRequest(BaseModel):
    mobile: str = Field(min_length=10, max_length=20)
    password: str = Field(min_length=1, max_length=72)

    @field_validator("mobile")
    @classmethod
    def normalize_mobile(cls, value: str) -> str:
        return value.strip()


class UserOut(BaseModel):
    id: int
    mobile: str
    full_name: str
    role: str
    is_active: bool

    model_config = {"from_attributes": True}


class LoginResponse(BaseModel):
    user: UserOut


class MeResponse(BaseModel):
    user: UserOut


class ChangePasswordRequest(BaseModel):
    new_password: str = Field(min_length=8, max_length=72)

    @field_validator("new_password")
    @classmethod
    def password_min_length(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("رمز باید حداقل ۸ کاراکتر باشد")
        return value


class MessageResponse(BaseModel):
    detail: str
