"""Login OTP: live SMS, fixed-dev, or unavailable in production-like without SMS."""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import hash_session_token
from app.models.login_otp import LoginOtp
from app.services.login_identities import LoginIdentity, identity_allows_otp
from app.services.sms.base import SmsError, SmsGateway
from app.services.sms.factory import get_sms_gateway

DEV_FIXED_OTP = "123456"
OTP_TTL_MINUTES = 5
OTP_MAX_ATTEMPTS = 5
OTP_CODE_DIGITS = 6

OtpMode = Literal["live", "dev_fixed", "unavailable"]


class LoginOtpError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


@dataclass(frozen=True)
class OtpSendOutcome:
    ok: bool
    detail: str
    mode: OtpMode
    expires_in_seconds: int
    # Never include the raw code unless explicitly needed for tests via mode flag.
    # API layer must not put code in JSON responses.


def otp_mode(settings: Settings) -> OtpMode:
    if settings.sms_enabled:
        return "live"
    if settings.is_production_like:
        return "unavailable"
    return "dev_fixed"


def otp_dev_hint_allowed(settings: Settings) -> bool:
    """UI may show a short non-production hint that fixed OTP works in local/dev."""
    return otp_mode(settings) == "dev_fixed"


def _aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _hash_code(code: str) -> str:
    return hash_session_token(code.strip())


def _generate_live_code() -> str:
    upper = 10**OTP_CODE_DIGITS
    return f"{secrets.randbelow(upper):0{OTP_CODE_DIGITS}d}"


def _invalidate_open_challenges(
    db: Session,
    *,
    mobile: str,
    kind: str,
    role: str | None,
) -> None:
    rows = list(
        db.scalars(
            select(LoginOtp).where(
                LoginOtp.mobile == mobile,
                LoginOtp.kind == kind,
                LoginOtp.role == role,
                LoginOtp.consumed_at.is_(None),
            )
        ).all()
    )
    now = datetime.now(tz=timezone.utc)
    for row in rows:
        row.consumed_at = now
    if rows:
        db.flush()


def create_and_send_otp(
    db: Session,
    *,
    settings: Settings,
    identity: LoginIdentity,
    mobile: str,
    gateway: SmsGateway | None = None,
) -> OtpSendOutcome:
    if not identity_allows_otp(identity):
        raise LoginOtpError(400, "این نقش فقط با رمز عبور وارد می‌شود.")

    mode = otp_mode(settings)
    if mode == "unavailable":
        raise LoginOtpError(
            403,
            "پیامک هنوز آماده نیست. اگر رمز عبور دارید، از ورود با رمز استفاده کنید.",
        )

    mobile = mobile.strip()
    kind = identity.kind
    role = identity.role if identity.kind == "staff" else "athlete"

    _invalidate_open_challenges(db, mobile=mobile, kind=kind, role=role)

    if mode == "dev_fixed":
        code = DEV_FIXED_OTP
    else:
        code = _generate_live_code()

    now = datetime.now(tz=timezone.utc)
    expires_at = now + timedelta(minutes=OTP_TTL_MINUTES)
    row = LoginOtp(
        mobile=mobile,
        kind=kind,
        role=role,
        code_hash=_hash_code(code),
        expires_at=expires_at,
        attempts=0,
    )
    db.add(row)
    db.flush()

    if mode == "live":
        message = f"کد ورود GYM CONTROL: {code}\nاعتبار: {OTP_TTL_MINUTES} دقیقه"
        try:
            gw = gateway or get_sms_gateway(settings)
            gw.send_sms(
                receptor=mobile,
                message=message,
                sender=(settings.sms_sender or "").strip() or None,
            )
        except SmsError as err:
            raise LoginOtpError(err.status_code, err.detail) from err
        detail = "کد ورود پیامک شد."
    else:
        detail = "کد ورود آماده است (حالت توسعه)."

    return OtpSendOutcome(
        ok=True,
        detail=detail,
        mode=mode,
        expires_in_seconds=OTP_TTL_MINUTES * 60,
    )


def verify_otp_code(
    db: Session,
    *,
    settings: Settings,
    identity: LoginIdentity,
    mobile: str,
    code: str,
) -> None:
    """Validate OTP for identity; consume on success. Raises LoginOtpError on failure."""
    if not identity_allows_otp(identity):
        raise LoginOtpError(400, "این نقش فقط با رمز عبور وارد می‌شود.")

    mode = otp_mode(settings)
    if mode == "unavailable":
        raise LoginOtpError(
            403,
            "پیامک هنوز آماده نیست. اگر رمز عبور دارید، از ورود با رمز استفاده کنید.",
        )

    mobile = mobile.strip()
    code = (code or "").strip()
    if len(code) < 4 or len(code) > 12:
        raise LoginOtpError(400, "کد واردشده معتبر نیست.")

    kind = identity.kind
    role = identity.role if identity.kind == "staff" else "athlete"

    row = db.scalar(
        select(LoginOtp)
        .where(
            LoginOtp.mobile == mobile,
            LoginOtp.kind == kind,
            LoginOtp.role == role,
            LoginOtp.consumed_at.is_(None),
        )
        .order_by(LoginOtp.id.desc())
    )

    # Dev fixed: allow verify even without a prior send row (owner convenience),
    # but still require a matching open challenge when one exists.
    now = datetime.now(tz=timezone.utc)

    if row is None:
        if mode == "dev_fixed" and code == DEV_FIXED_OTP:
            return
        raise LoginOtpError(401, "کد ورود نادرست یا منقضی است.")

    if now >= _aware(row.expires_at):
        row.consumed_at = now
        db.flush()
        raise LoginOtpError(401, "کد ورود منقضی شده است. دوباره درخواست کنید.")

    if row.attempts >= OTP_MAX_ATTEMPTS:
        row.consumed_at = now
        db.flush()
        raise LoginOtpError(429, "تلاش‌های تأیید کد زیاد است. دوباره کد بگیرید.")

    expected_ok = False
    if mode == "dev_fixed" and code == DEV_FIXED_OTP:
        expected_ok = True
    elif row.code_hash == _hash_code(code):
        expected_ok = True

    if not expected_ok:
        row.attempts += 1
        db.flush()
        raise LoginOtpError(401, "کد ورود نادرست است.")

    row.consumed_at = now
    db.flush()
