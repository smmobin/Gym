"""Athlete auth + self-scoped data APIs (cookie: gym_athlete_session)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_athlete
from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.core.rate_limit import login_rate_limiter
from app.models.member import Member
from app.schemas.athlete import (
    AthleteBookClassResponse,
    AthleteCancelBookingResponse,
    AthleteClassBookingListResponse,
    AthleteClassBookingOut,
    AthleteGroupClassListResponse,
    AthleteGroupClassOut,
    AthleteLoginRequest,
    AthleteLoginResponse,
    AthleteMembershipOut,
    AthleteMembershipsResponse,
    AthleteMeResponse,
    AthleteNotificationListResponse,
    AthleteNotificationOut,
    AthleteNotificationReadAllResponse,
    AthleteNotificationReadResponse,
    AthleteOut,
    AthletePaymentOut,
    AthletePaymentsResponse,
    AthleteProfilePatch,
    AthleteWorkoutPlanOut,
    AthleteWorkoutPlansResponse,
    MessageResponse,
    RenewalRequestCreate,
    RenewalRequestResponse,
)
from app.services import athlete as athlete_svc
from app.services import athlete_classes as athlete_class_svc
from app.services import workout_plans as plan_svc
from app.services.athlete_session import (
    create_athlete_session,
    revoke_athlete_session_by_token,
    touch_athlete_session_by_token,
)

router = APIRouter(prefix="/athlete", tags=["athlete"])


def _raise(err: athlete_svc.AthleteError) -> None:
    raise HTTPException(status_code=err.status_code, detail=err.detail) from err


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


@router.post("/auth/login", response_model=AthleteLoginResponse)
def athlete_login(
    body: AthleteLoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AthleteLoginResponse:
    rate_key = f"athlete-login:{body.mobile}"
    if not login_rate_limiter.is_allowed(rate_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="تلاش‌های ورود زیاد است. کمی بعد دوباره امتحان کنید.",
        )
    try:
        member = athlete_svc.authenticate_athlete(
            db, mobile=body.mobile, password=body.password
        )
    except athlete_svc.AthleteError as err:
        _raise(err)
        raise  # pragma: no cover

    _, raw_token = create_athlete_session(
        db,
        member=member,
        settings=settings,
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    _set_athlete_cookie(response, token=raw_token, settings=settings)
    return AthleteLoginResponse(member=AthleteOut.model_validate(member))


@router.post("/auth/logout", response_model=MessageResponse)
def athlete_logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> MessageResponse:
    token = request.cookies.get(settings.athlete_session_cookie_name)
    if token:
        revoke_athlete_session_by_token(db, token=token)
        db.commit()
    _clear_athlete_cookie(response, settings=settings)
    return MessageResponse(detail="خروج انجام شد.")


@router.post("/auth/touch", response_model=MessageResponse)
def athlete_touch_session(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> MessageResponse:
    token = request.cookies.get(settings.athlete_session_cookie_name)
    if not token or not touch_athlete_session_by_token(db, token=token, settings=settings):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="نشست ورزشکار معتبر نیست. دوباره وارد شوید.",
        )
    db.commit()
    _set_athlete_cookie(response, token=token, settings=settings)
    return MessageResponse(detail="نشست تمدید شد.")


@router.get("/auth/me", response_model=AthleteMeResponse)
def athlete_me(member: Member = Depends(get_current_athlete)) -> AthleteMeResponse:
    return AthleteMeResponse(member=AthleteOut.model_validate(member))


@router.patch("/profile", response_model=AthleteOut)
def patch_profile(
    body: AthleteProfilePatch,
    db: Session = Depends(get_db),
    member: Member = Depends(get_current_athlete),
) -> AthleteOut:
    data = body.model_dump(exclude_unset=True)
    try:
        row = athlete_svc.patch_own_profile(
            db,
            member=member,
            first_name=data.get("first_name"),
            last_name=data.get("last_name"),
        )
        db.commit()
        db.refresh(row)
    except athlete_svc.AthleteError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return AthleteOut.model_validate(row)


@router.get("/memberships", response_model=AthleteMembershipsResponse)
def athlete_memberships(
    db: Session = Depends(get_db),
    member: Member = Depends(get_current_athlete),
) -> AthleteMembershipsResponse:
    rows, debt = athlete_svc.list_own_memberships(db, member=member)
    items = [
        AthleteMembershipOut(
            id=m.id,
            plan_id=m.plan_id,
            plan_name=athlete_svc.plan_name_for(m),
            agreed_amount_toman=m.agreed_amount_toman,
            start_date=m.start_date,
            end_date=m.end_date,
            status=m.status,
            sessions_remaining=m.sessions_remaining,
        )
        for m in rows
    ]
    return AthleteMembershipsResponse(items=items, total=len(items), debt_toman=debt)


@router.get("/payments", response_model=AthletePaymentsResponse)
def athlete_payments(
    db: Session = Depends(get_db),
    member: Member = Depends(get_current_athlete),
) -> AthletePaymentsResponse:
    rows = athlete_svc.list_own_payments(db, member=member)
    return AthletePaymentsResponse(
        items=[AthletePaymentOut.model_validate(r) for r in rows],
        total=len(rows),
    )


@router.get("/workout-plans", response_model=AthleteWorkoutPlansResponse)
def athlete_workout_plans(
    db: Session = Depends(get_db),
    member: Member = Depends(get_current_athlete),
) -> AthleteWorkoutPlansResponse:
    rows = athlete_svc.list_own_workout_plans(db, member=member)
    items = [
        AthleteWorkoutPlanOut(
            id=p.id,
            title=p.title,
            body=p.body,
            items=plan_svc.plan_out_fields(p)["items"],
            trainer_full_name=p.trainer.full_name if p.trainer else None,
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p in rows
    ]
    return AthleteWorkoutPlansResponse(items=items, total=len(items))


@router.get("/notifications", response_model=AthleteNotificationListResponse)
def athlete_notifications(
    unread_only: bool = Query(default=False),
    db: Session = Depends(get_db),
    member: Member = Depends(get_current_athlete),
) -> AthleteNotificationListResponse:
    rows, unread = athlete_svc.list_own_notifications(
        db, member=member, unread_only=unread_only
    )
    return AthleteNotificationListResponse(
        items=[AthleteNotificationOut.model_validate(r) for r in rows],
        total=len(rows),
        unread_count=unread,
    )


@router.post(
    "/notifications/read-all",
    response_model=AthleteNotificationReadAllResponse,
    status_code=status.HTTP_200_OK,
)
def athlete_mark_all_notifications_read(
    db: Session = Depends(get_db),
    member: Member = Depends(get_current_athlete),
) -> AthleteNotificationReadAllResponse:
    marked = athlete_svc.mark_own_notifications_read_all(db, member=member)
    db.commit()
    return AthleteNotificationReadAllResponse(marked=marked)


@router.post(
    "/notifications/{notification_id}/read",
    response_model=AthleteNotificationReadResponse,
)
def athlete_mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    member: Member = Depends(get_current_athlete),
) -> AthleteNotificationReadResponse:
    try:
        row = athlete_svc.mark_own_notification_read(
            db, member=member, notification_id=notification_id
        )
        db.commit()
    except athlete_svc.AthleteError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return AthleteNotificationReadResponse(id=row.id, is_read=True)


@router.post("/renewal-requests", response_model=RenewalRequestResponse)
def athlete_renewal_request(
    body: RenewalRequestCreate,
    db: Session = Depends(get_db),
    member: Member = Depends(get_current_athlete),
) -> RenewalRequestResponse:
    try:
        staff_id, _ = athlete_svc.create_renewal_request(
            db, member=member, note=body.note
        )
        db.commit()
    except athlete_svc.AthleteError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return RenewalRequestResponse(
        detail="درخواست تمدید برای میز ثبت شد. تمدید خودکار و درگاه هنوز فعال نیست.",
        staff_notification_id=staff_id,
    )


def _athlete_booking_out(booking) -> AthleteClassBookingOut:
    gc = getattr(booking, "group_class", None)
    return AthleteClassBookingOut(
        id=booking.id,
        group_class_id=booking.group_class_id,
        class_title=gc.title if gc is not None else None,
        status=booking.status,
        starts_at=gc.starts_at if gc is not None else None,
        ends_at=gc.ends_at if gc is not None else None,
        created_at=booking.created_at,
    )


@router.get("/group-classes", response_model=AthleteGroupClassListResponse)
def athlete_list_group_classes(
    db: Session = Depends(get_db),
    member: Member = Depends(get_current_athlete),
) -> AthleteGroupClassListResponse:
    """Active upcoming classes (starts_at >= now); includes my booking flag."""
    views = athlete_class_svc.list_athlete_classes(db, member=member)
    items = [
        AthleteGroupClassOut(
            id=v.group_class.id,
            title=v.group_class.title,
            trainer_user_id=v.group_class.trainer_user_id,
            trainer_full_name=v.trainer_full_name,
            capacity=v.group_class.capacity,
            booked_count=v.booked_count,
            remaining=v.remaining,
            gender_label=v.group_class.gender_label,
            starts_at=v.group_class.starts_at,
            ends_at=v.group_class.ends_at,
            is_active=v.group_class.is_active,
            booked_by_me=v.booked_by_me,
            my_booking_id=v.my_booking_id,
        )
        for v in views
    ]
    return AthleteGroupClassListResponse(items=items, total=len(items))


@router.get("/class-bookings", response_model=AthleteClassBookingListResponse)
def athlete_list_own_bookings(
    db: Session = Depends(get_db),
    member: Member = Depends(get_current_athlete),
) -> AthleteClassBookingListResponse:
    rows = athlete_class_svc.list_own_bookings(db, member=member)
    return AthleteClassBookingListResponse(
        items=[_athlete_booking_out(r) for r in rows],
        total=len(rows),
    )


@router.post(
    "/group-classes/{class_id}/book",
    response_model=AthleteBookClassResponse,
    status_code=status.HTTP_201_CREATED,
)
def athlete_book_class(
    class_id: int,
    db: Session = Depends(get_db),
    member: Member = Depends(get_current_athlete),
) -> AthleteBookClassResponse:
    """Book for the session member only — no member_id in body."""
    try:
        result = athlete_class_svc.book_own_class(db, member=member, class_id=class_id)
        db.commit()
        db.refresh(result.booking)
        _ = result.booking.group_class
    except athlete_svc.AthleteError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return AthleteBookClassResponse(
        booking=_athlete_booking_out(result.booking),
        booked_count=result.booked_count,
        remaining=result.remaining,
    )


@router.post(
    "/class-bookings/{booking_id}/cancel",
    response_model=AthleteCancelBookingResponse,
)
def athlete_cancel_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    member: Member = Depends(get_current_athlete),
) -> AthleteCancelBookingResponse:
    try:
        result = athlete_class_svc.cancel_own_booking(
            db, member=member, booking_id=booking_id
        )
        db.commit()
        db.refresh(result.booking)
        _ = result.booking.group_class
    except athlete_svc.AthleteError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return AthleteCancelBookingResponse(
        booking=_athlete_booking_out(result.booking),
        booked_count=result.booked_count,
        remaining=result.remaining,
    )
