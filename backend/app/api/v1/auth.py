"""Unified authentication: staff (users) first, then athlete (members)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.core.rate_limit import login_rate_limiter
from app.core.security import hash_password, verify_password
from app.models.enums import StaffRole
from app.models.user import User
from app.schemas.athlete import AthleteOut
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    MeResponse,
    MessageResponse,
    UserOut,
)
from app.services import athlete as athlete_svc
from app.services.athlete_session import create_athlete_session
from app.services.auth_session import create_session, revoke_session_by_token

router = APIRouter(prefix="/auth", tags=["auth"])

MIN_PASSWORD_LEN = 8
ATHLETE_ROLE = "athlete"


def _set_session_cookie(response: Response, *, token: str, settings: Settings) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=settings.session_ttl_hours * 3600,
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
        max_age=settings.athlete_session_ttl_hours * 3600,
        path="/",
    )


def _clear_athlete_cookie(response: Response, *, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.athlete_session_cookie_name,
        path="/",
        samesite="lax",
        secure=settings.cookie_secure,
    )


@router.post("/login", response_model=LoginResponse)
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> LoginResponse:
    """Unified login: check staff users first; if absent, try member password.

    If the mobile exists in both tables, staff always wins (wrong staff password
    does not fall through to athlete). Rate limit key: login:{mobile}.
    """
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

    user = db.scalar(select(User).where(User.mobile == body.mobile))
    if user is not None:
        if not user.is_active or not verify_password(body.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="موبایل یا رمز نادرست است.",
            )
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

    try:
        member = athlete_svc.authenticate_athlete(
            db, mobile=body.mobile, password=body.password
        )
    except athlete_svc.AthleteError as err:
        raise HTTPException(status_code=err.status_code, detail=err.detail) from err

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
