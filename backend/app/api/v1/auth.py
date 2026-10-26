"""Unified authentication: mobile lookup, password, and OTP by identity."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.core.rate_limit import (
    login_rate_limiter,
    lookup_rate_limiter,
    otp_send_rate_limiter,
    otp_verify_rate_limiter,
)
from app.core.security import hash_password, verify_password
from app.models.enums import StaffRole
from app.models.member import Member
from app.models.user import User
from app.schemas.athlete import AthleteOut
from app.schemas.auth import (
    ChangePasswordRequest,
    IdentityOut,
    LoginRequest,
    LoginResponse,
    LookupRequest,
    LookupResponse,
    MeResponse,
    MessageResponse,
    OtpSendRequest,
    OtpSendResponse,
    OtpVerifyRequest,
    UserOut,
)
from app.services import athlete as athlete_svc
from app.services.athlete_session import create_athlete_session
from app.services.auth_session import create_session, revoke_session_by_token, touch_session_by_token
from app.services.login_identities import (
    LoginIdentity,
    LoginIdentityError,
    list_identities_for_mobile,
    resolve_identity,
)
from app.services.login_otp import (
    LoginOtpError,
    create_and_send_otp,
    otp_dev_hint_allowed,
    verify_otp_code,
)

router = APIRouter(prefix="/auth", tags=["auth"])

MIN_PASSWORD_LEN = 8
ATHLETE_ROLE = "athlete"
GENERIC_BAD = "اطلاعات ورود نادرست است."


def _cookie_max_age_seconds(settings: Settings) -> int:
    return max(60, int(settings.session_idle_minutes) * 60)


def _set_session_cookie(response: Response, *, token: str, settings: Settings) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=_cookie_max_age_seconds(settings),
        path="/",
    )


def _clear_session_cookie(response: Response, *, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        samesite="lax",
        secure=settings.cookie_secure,
    )


def _set_athlete_cookie(response: Response, *, token: str, settings: Settings) -> None:
    response.set_cookie(
        key=settings.athlete_session_cookie_name,
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=max(60, int(settings.athlete_session_idle_minutes) * 60),
        path="/",
    )


def _clear_athlete_cookie(response: Response, *, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.athlete_session_cookie_name,
        path="/",
        samesite="lax",
        secure=settings.cookie_secure,
    )


def _identity_out(identity: LoginIdentity) -> IdentityOut:
    return IdentityOut(
        kind=identity.kind,
        role=identity.role,
        label=identity.label,
        auth_methods=list(identity.auth_methods),
        has_password=identity.has_password,
    )


def _issue_staff_session(
    *,
    db: Session,
    request: Request,
    response: Response,
    settings: Settings,
    user: User,
) -> LoginResponse:
    _, raw_token = create_session(
        db,
        user=user,
        settings=settings,
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    _set_session_cookie(response, token=raw_token, settings=settings)
    _clear_athlete_cookie(response, settings=settings)
    return LoginResponse(
        kind="staff",
        role=user.role,
        user=UserOut.model_validate(user),
    )


def _issue_athlete_session(
    *,
    db: Session,
    request: Request,
    response: Response,
    settings: Settings,
    member: Member,
) -> LoginResponse:
    _, raw_token = create_athlete_session(
        db,
        member=member,
        settings=settings,
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    _set_athlete_cookie(response, token=raw_token, settings=settings)
    _clear_session_cookie(response, settings=settings)
    return LoginResponse(
        kind="athlete",
        role=ATHLETE_ROLE,
        member=AthleteOut.model_validate(member),
    )


def _load_staff_user(db: Session, *, mobile: str, role: str) -> User:
    user = db.scalar(select(User).where(User.mobile == mobile))
    if user is None or not user.is_active or user.role != role:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_BAD)
    return user


def _load_athlete_member(db: Session, *, mobile: str) -> Member:
    member = db.scalar(select(Member).where(Member.mobile == mobile))
    if member is None or not athlete_svc.member_eligible_for_login(member):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_BAD)
    return member


@router.post("/lookup", response_model=LookupResponse)
def lookup_mobile(
    body: LookupRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> LookupResponse:
    """Resolve active identities for a mobile. Client must not invent roles."""
    rate_key = f"lookup:{body.mobile}"
    if not lookup_rate_limiter.is_allowed(rate_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="تلاش‌های زیاد است. کمی بعد دوباره امتحان کنید.",
        )

    identities = list_identities_for_mobile(db, mobile=body.mobile)
    if not identities:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_BAD)

    return LookupResponse(
        identities=[_identity_out(i) for i in identities],
        otp_dev_hint=otp_dev_hint_allowed(settings),
    )


@router.post("/login", response_model=LoginResponse)
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> LoginResponse:
    """Password login for a resolved identity (kind/role when ambiguous)."""
    if len(body.password) < MIN_PASSWORD_LEN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="رمز باید حداقل ۸ کاراکتر باشد.",
        )

    rate_key = f"login:{body.mobile}"
    if not login_rate_limiter.is_allowed(rate_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="تلاش‌های ورود زیاد است. کمی بعد دوباره امتحان کنید.",
        )

    try:
        identity = resolve_identity(
            db, mobile=body.mobile, kind=body.kind, role=body.role
        )
    except LoginIdentityError as err:
        raise HTTPException(status_code=err.status_code, detail=err.detail) from err

    if identity.kind == "staff":
        user = _load_staff_user(db, mobile=body.mobile, role=identity.role)
        if not verify_password(body.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=GENERIC_BAD,
            )
        return _issue_staff_session(
            db=db, request=request, response=response, settings=settings, user=user
        )

    member = _load_athlete_member(db, mobile=body.mobile)
    if not member.password_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="رمز عبور برای این حساب ست نشده است. به میز پذیرش مراجعه کنید یا با کد پیامک وارد شوید.",
        )
    if not verify_password(body.password, member.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=GENERIC_BAD,
        )
    return _issue_athlete_session(
        db=db, request=request, response=response, settings=settings, member=member
    )


@router.post("/otp/send", response_model=OtpSendResponse)
def otp_send(
    body: OtpSendRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> OtpSendResponse:
    rate_key = f"otp-send:{body.mobile}"
    if not otp_send_rate_limiter.is_allowed(rate_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="درخواست کد زیاد است. کمی بعد دوباره امتحان کنید.",
        )

    try:
        identity = resolve_identity(
            db, mobile=body.mobile, kind=body.kind, role=body.role
        )
        outcome = create_and_send_otp(
            db, settings=settings, identity=identity, mobile=body.mobile
        )
        db.commit()
    except LoginIdentityError as err:
        raise HTTPException(status_code=err.status_code, detail=err.detail) from err
    except LoginOtpError as err:
        db.rollback()
        raise HTTPException(status_code=err.status_code, detail=err.detail) from err

    # Never include the OTP code in the response body.
    return OtpSendResponse(
        detail=outcome.detail,
        expires_in_seconds=outcome.expires_in_seconds,
        mode=outcome.mode,
    )


@router.post("/otp/verify", response_model=LoginResponse)
def otp_verify(
    body: OtpVerifyRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> LoginResponse:
    rate_key = f"otp-verify:{body.mobile}"
    if not otp_verify_rate_limiter.is_allowed(rate_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="تلاش‌های تأیید کد زیاد است. کمی بعد دوباره امتحان کنید.",
        )

    try:
        identity = resolve_identity(
            db, mobile=body.mobile, kind=body.kind, role=body.role
        )
        verify_otp_code(
            db,
            settings=settings,
            identity=identity,
            mobile=body.mobile,
            code=body.code,
        )
    except LoginIdentityError as err:
        raise HTTPException(status_code=err.status_code, detail=err.detail) from err
    except LoginOtpError as err:
        db.commit()  # persist attempt counters / consumed flags
        raise HTTPException(status_code=err.status_code, detail=err.detail) from err

    if identity.kind == "staff":
        user = _load_staff_user(db, mobile=body.mobile, role=identity.role)
        return _issue_staff_session(
            db=db, request=request, response=response, settings=settings, user=user
        )

    member = _load_athlete_member(db, mobile=body.mobile)
    return _issue_athlete_session(
        db=db, request=request, response=response, settings=settings, member=member
    )


@router.post("/logout", response_model=MessageResponse)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> MessageResponse:
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        revoke_session_by_token(db, token=token)
        db.commit()
    _clear_session_cookie(response, settings=settings)
    return MessageResponse(detail="خروج انجام شد.")


@router.post("/touch", response_model=MessageResponse)
def touch_session(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> MessageResponse:
    """Extend idle session after real UI activity (not background polling alone)."""
    token = request.cookies.get(settings.session_cookie_name)
    if not token or not touch_session_by_token(db, token=token, settings=settings):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="نشست معتبر نیست. دوباره وارد شوید.",
        )
    db.commit()
    _set_session_cookie(response, token=token, settings=settings)
    return MessageResponse(detail="نشست تمدید شد.")


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user)) -> MeResponse:
    return MeResponse(user=UserOut.model_validate(user))


@router.get("/staff-ping")
def staff_ping(
    user: User = Depends(
        require_roles(StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value)
    ),
) -> dict[str, str]:
    """Sample protected route: manager + receptionist only (trainer → 403)."""
    return {"status": "ok", "role": user.role, "message": "دسترسی کارکنان اداری تأیید شد."}


@router.post(
    "/users/{user_id}/password",
    response_model=MessageResponse,
)
def change_user_password(
    user_id: int,
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(StaffRole.MANAGER.value)),
) -> MessageResponse:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="کاربر یافت نشد.")
    if len(body.new_password) < MIN_PASSWORD_LEN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="رمز باید حداقل ۸ کاراکتر باشد.",
        )
    target.password_hash = hash_password(body.new_password)
    db.commit()
    return MessageResponse(detail="رمز کاربر به‌روز شد.")
