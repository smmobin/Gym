"""Audit rows for login / logout / OTP. Never stores password or OTP code."""

from __future__ import annotations

from typing import Literal

from sqlalchemy.orm import Session

from app.core.redaction import mask_mobile
from app.models.member import Member
from app.models.user import User
from app.services.audit import write_audit, write_audit_isolated

AuthMethod = Literal["password", "otp"]

_REASON_BY_STATUS = {
    400: "invalid_request",
    401: "bad_credentials",
    403: "forbidden",
    404: "unknown_identity",
    409: "ambiguous_identity",
    422: "invalid_request",
    429: "rate_limited",
}

_METHOD_FA = {"password": "رمز", "otp": "کد پیامک"}


def failure_reason(status_code: int) -> str:
    return _REASON_BY_STATUS.get(status_code, "error")


def login_success_staff(
    db: Session,
    *,
    user: User,
    method: AuthMethod,
    acting_role: str | None = None,
) -> None:
    role = acting_role or user.role
    write_audit(
        db,
        actor_user_id=user.id,
        action="auth.login.success",
        entity_type="user",
        entity_id=user.id,
        summary=f"ورود موفق {user.full_name} با {_METHOD_FA[method]}",
        payload={
            "kind": "staff",
            "role": role,
            "desk_role": user.role,
            "method": method,
        },
    )


def login_success_athlete(db: Session, *, member: Member, method: AuthMethod) -> None:
    write_audit(
        db,
        actor_user_id=None,
        action="auth.login.success",
        entity_type="member",
        entity_id=member.id,
        summary=f"ورود موفق ورزشکار {member.display_id} با {_METHOD_FA[method]}",
        payload={
            "kind": "athlete",
            "role": "athlete",
            "method": method,
            "actor_label": f"ورزشکار {member.display_id}",
        },
    )


def login_failure(
    *,
    mobile: str,
    method: AuthMethod,
    status_code: int,
    kind: str | None = None,
    role: str | None = None,
) -> None:
    masked = mask_mobile(mobile)
    write_audit_isolated(
        actor_user_id=None,
        action="auth.login.failure",
        entity_type="auth",
        entity_id=None,
        summary=f"ورود ناموفق ({masked}) با {_METHOD_FA[method]}",
        payload={
            "method": method,
            "kind": kind,
            "role": role,
            "reason": failure_reason(status_code),
            "status_code": status_code,
            "mobile_masked": masked,
        },
    )


def logout_staff(db: Session, *, user: User | None) -> None:
    write_audit(
        db,
        actor_user_id=user.id if user else None,
        action="auth.logout",
        entity_type="user",
        entity_id=user.id if user else None,
        summary=f"خروج {user.full_name}" if user else "خروج کارکنان",
        payload={"kind": "staff", "role": user.role if user else None},
    )


def logout_athlete(db: Session, *, member: Member | None) -> None:
    label = f"ورزشکار {member.display_id}" if member else "ورزشکار"
    write_audit(
        db,
        actor_user_id=None,
        action="auth.logout",
        entity_type="member",
        entity_id=member.id if member else None,
        summary=f"خروج {label}",
        payload={"kind": "athlete", "role": "athlete", "actor_label": label},
    )


def otp_send(
    *,
    db: Session | None,
    mobile: str,
    ok: bool,
    kind: str | None,
    role: str | None,
    mode: str | None = None,
    status_code: int | None = None,
) -> None:
    masked = mask_mobile(mobile)
    kwargs = dict(
        actor_user_id=None,
        action="auth.otp.send",
        entity_type="auth",
        entity_id=None,
        summary=(
            f"ارسال کد ورود به {masked}" if ok else f"ارسال کد ورود به {masked} ناموفق بود"
        ),
        payload={
            "ok": ok,
            "kind": kind,
            "role": role,
            "mode": mode,
            "status_code": status_code,
            "reason": None if ok else failure_reason(status_code or 0),
            "mobile_masked": masked,
        },
    )
    if ok and db is not None:
        write_audit(db, **kwargs)
    else:
        write_audit_isolated(**kwargs)


def otp_verify_success(
    db: Session, *, mobile: str, kind: str, role: str | None
) -> None:
    masked = mask_mobile(mobile)
    write_audit(
        db,
        actor_user_id=None,
        action="auth.otp.verify.success",
        entity_type="auth",
        entity_id=None,
        summary=f"تأیید کد ورود ({masked})",
        payload={"kind": kind, "role": role, "mobile_masked": masked},
    )


def otp_verify_failure(
    *, mobile: str, status_code: int, kind: str | None, role: str | None
) -> None:
    masked = mask_mobile(mobile)
    write_audit_isolated(
        actor_user_id=None,
        action="auth.otp.verify.failure",
        entity_type="auth",
        entity_id=None,
        summary=f"کد ورود نادرست یا منقضی ({masked})",
        payload={
            "kind": kind,
            "role": role,
            "reason": failure_reason(status_code),
            "status_code": status_code,
            "mobile_masked": masked,
        },
    )
