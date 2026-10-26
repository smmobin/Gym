"""Pydantic schemas for unified / staff auth."""

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.athlete import AthleteOut


class LoginRequest(BaseModel):
    mobile: str = Field(min_length=10, max_length=20)
    password: str = Field(min_length=1, max_length=72)
    kind: Optional[Literal["staff", "athlete"]] = None
    role: Optional[str] = Field(default=None, max_length=32)

    @field_validator("mobile")
    @classmethod
    def normalize_mobile(cls, value: str) -> str:
        return value.strip()

    @field_validator("role")
    @classmethod
    def normalize_role(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class LookupRequest(BaseModel):
    mobile: str = Field(min_length=10, max_length=20)

    @field_validator("mobile")
    @classmethod
    def normalize_mobile(cls, value: str) -> str:
        return value.strip()


class IdentityOut(BaseModel):
    kind: Literal["staff", "athlete"]
    role: str
    label: str
    auth_methods: list[str]
    has_password: bool


class LookupResponse(BaseModel):
    identities: list[IdentityOut]
    otp_dev_hint: bool = False


class OtpSendRequest(BaseModel):
    mobile: str = Field(min_length=10, max_length=20)
    kind: Literal["staff", "athlete"]
    role: Optional[str] = Field(default=None, max_length=32)

    @field_validator("mobile")
    @classmethod
    def normalize_mobile(cls, value: str) -> str:
        return value.strip()

    @field_validator("role")
    @classmethod
    def normalize_role(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class OtpSendResponse(BaseModel):
    detail: str
    expires_in_seconds: int
    mode: Literal["live", "dev_fixed", "unavailable"]


class OtpVerifyRequest(BaseModel):
    mobile: str = Field(min_length=10, max_length=20)
    kind: Literal["staff", "athlete"]
    role: Optional[str] = Field(default=None, max_length=32)
    code: str = Field(min_length=4, max_length=12)

    @field_validator("mobile")
    @classmethod
    def normalize_mobile(cls, value: str) -> str:
        return value.strip()

    @field_validator("role")
    @classmethod
    def normalize_role(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.strip()


class UserOut(BaseModel):
    id: int
    mobile: str
    full_name: str
    role: str
    is_active: bool

    model_config = {"from_attributes": True}


class LoginResponse(BaseModel):
    """Unified login response. Cookie matches kind (staff vs athlete)."""

    kind: Literal["staff", "athlete"]
    role: str
    user: Optional[UserOut] = None
    member: Optional[AthleteOut] = None


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
