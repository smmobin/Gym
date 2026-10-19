"""Group classes list/create/update and bookings."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.db import get_db
from app.models.enums import StaffRole
from app.models.group_class import ClassBooking
from app.models.user import User
from app.schemas.group_classes import (
    BookingCreate,
    BookingListResponse,
    BookingMutationResponse,
    BookingOut,
    BookingOutcomeRequest,
    BookingOutcomeResponse,
    GroupClassCreate,
    GroupClassListResponse,
    GroupClassMutationResponse,
    GroupClassOut,
    GroupClassUpdate,
)
from app.services import group_classes as gc_svc

router = APIRouter(prefix="/group-classes", tags=["group-classes"])

_STAFF_ALL = (StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value, StaffRole.TRAINER.value)
_DESK = (StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value)

_CONFLICT_WARNING = "تداخل ساعت مربی با کلاس دیگر — ذخیره انجام شد."


def _raise(err: gc_svc.GroupClassError) -> None:
    raise HTTPException(status_code=err.status_code, detail=err.detail) from err


def _class_out(snap: gc_svc.ClassSnapshot) -> GroupClassOut:
    row = snap.group_class
    return GroupClassOut(
        id=row.id,
        title=row.title,
        trainer_user_id=row.trainer_user_id,
        capacity=row.capacity,
        booked_count=snap.booked_count,
        remaining=snap.remaining,
        gender_label=row.gender_label,
        starts_at=row.starts_at,
        ends_at=row.ends_at,
        is_active=row.is_active,
        trainer_schedule_conflict=snap.trainer_schedule_conflict,
    )


def _booking_out(booking: ClassBooking) -> BookingOut:
    member = booking.member
    name = None
    display_id = None
    if member is not None:
        display_id = member.display_id
        name = f"{member.first_name} {member.last_name}".strip()
    return BookingOut(
        id=booking.id,
        group_class_id=booking.group_class_id,
        member_id=booking.member_id,
        member_display_id=display_id,
        member_name=name,
        status=booking.status,
        created_at=booking.created_at,
        cancelled_at=booking.cancelled_at,
    )


@router.get("", response_model=GroupClassListResponse)
def list_classes(
    starts_from: Optional[datetime] = Query(default=None, alias="from"),
    starts_to: Optional[datetime] = Query(default=None, alias="to"),
    upcoming: bool = Query(default=False),
    include_inactive: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_STAFF_ALL)),
) -> GroupClassListResponse:
    items = gc_svc.list_group_classes(
        db,
        user=user,
        starts_from=starts_from,
        starts_to=starts_to,
        upcoming=upcoming,
        include_inactive=include_inactive,
    )
    return GroupClassListResponse(
        items=[_class_out(s) for s in items],
        total=len(items),
    )


@router.post(
    "",
    response_model=GroupClassMutationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_class(
    body: GroupClassCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> GroupClassMutationResponse:
    try:
        snap = gc_svc.create_group_class(
            db,
            user=user,
            title=body.title,
            capacity=body.capacity,
            gender_label=body.gender_label,
            starts_at=body.starts_at,
            ends_at=body.ends_at,
            trainer_user_id=body.trainer_user_id,
        )
        db.commit()
        db.refresh(snap.group_class)
    except gc_svc.GroupClassError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover

    return GroupClassMutationResponse(
        group_class=_class_out(snap),
        trainer_schedule_conflict=snap.trainer_schedule_conflict,
        warning=_CONFLICT_WARNING if snap.trainer_schedule_conflict else None,
    )


@router.patch("/{class_id}", response_model=GroupClassMutationResponse)
def patch_class(
    class_id: int,
    body: GroupClassUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> GroupClassMutationResponse:
    data = body.model_dump(exclude_unset=True)
    clear_trainer = "trainer_user_id" in data and data["trainer_user_id"] is None
    try:
        snap = gc_svc.update_group_class(
            db,
            user=user,
            class_id=class_id,
            title=data.get("title"),
            capacity=data.get("capacity"),
            gender_label=data.get("gender_label"),
            starts_at=data.get("starts_at"),
            ends_at=data.get("ends_at"),
            trainer_user_id=data.get("trainer_user_id"),
            clear_trainer=clear_trainer,
            is_active=data.get("is_active"),
        )
        db.commit()
        db.refresh(snap.group_class)
    except gc_svc.GroupClassError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover

    return GroupClassMutationResponse(
        group_class=_class_out(snap),
        trainer_schedule_conflict=snap.trainer_schedule_conflict,
        warning=_CONFLICT_WARNING if snap.trainer_schedule_conflict else None,
    )


@router.get("/{class_id}/bookings", response_model=BookingListResponse)
def list_bookings(
    class_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_STAFF_ALL)),
) -> BookingListResponse:
    try:
        rows, snap = gc_svc.list_bookings(db, user=user, class_id=class_id)
    except gc_svc.GroupClassError as err:
        _raise(err)
        raise  # pragma: no cover
    return BookingListResponse(
        items=[_booking_out(r) for r in rows],
        total=len(rows),
        booked_count=snap.booked_count,
        remaining=snap.remaining,
    )


@router.post(
    "/{class_id}/bookings",
    response_model=BookingMutationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_booking(
    class_id: int,
    body: BookingCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> BookingMutationResponse:
    try:
        result = gc_svc.book_member(
            db, user=user, class_id=class_id, member_id=body.member_id
        )
        db.commit()
        db.refresh(result.booking)
        # Ensure member relationship for response labels.
        _ = result.booking.member
    except gc_svc.GroupClassError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover

    return BookingMutationResponse(
        booking=_booking_out(result.booking),
        booked_count=result.booked_count,
        remaining=result.remaining,
    )


@router.post(
    "/{class_id}/bookings/{booking_id}/cancel",
    response_model=BookingMutationResponse,
)
def cancel_booking(
    class_id: int,
    booking_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> BookingMutationResponse:
    try:
        result = gc_svc.cancel_booking(
            db, user=user, class_id=class_id, booking_id=booking_id
        )
        db.commit()
        db.refresh(result.booking)
        _ = result.booking.member
    except gc_svc.GroupClassError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover

    return BookingMutationResponse(
        booking=_booking_out(result.booking),
        booked_count=result.booked_count,
        remaining=result.remaining,
    )


@router.post(
    "/{class_id}/bookings/{booking_id}/no-show",
    response_model=BookingOutcomeResponse,
)
def mark_booking_no_show(
    class_id: int,
    booking_id: int,
    body: BookingOutcomeRequest = BookingOutcomeRequest(),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> BookingOutcomeResponse:
    try:
        result = gc_svc.mark_no_show(
            db,
            user=user,
            class_id=class_id,
            booking_id=booking_id,
            membership_id=body.membership_id,
        )
        db.commit()
        db.refresh(result.booking)
        _ = result.booking.member
    except gc_svc.GroupClassError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover

    return BookingOutcomeResponse(
        booking=_booking_out(result.booking),
        booked_count=result.booked_count,
        remaining=result.remaining,
        session_deducted=result.session_deducted,
        sessions_remaining=result.sessions_remaining,
        membership_id=result.membership_id,
        already_deducted_via_attendance=result.already_deducted_via_attendance,
    )


@router.post(
    "/{class_id}/bookings/{booking_id}/attended",
    response_model=BookingOutcomeResponse,
)
def mark_booking_attended(
    class_id: int,
    booking_id: int,
    body: BookingOutcomeRequest = BookingOutcomeRequest(),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> BookingOutcomeResponse:
    try:
        result = gc_svc.mark_attended(
            db,
            user=user,
            class_id=class_id,
            booking_id=booking_id,
            membership_id=body.membership_id,
        )
        db.commit()
        db.refresh(result.booking)
        _ = result.booking.member
    except gc_svc.GroupClassError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover

    return BookingOutcomeResponse(
        booking=_booking_out(result.booking),
        booked_count=result.booked_count,
        remaining=result.remaining,
        session_deducted=result.session_deducted,
        sessions_remaining=result.sessions_remaining,
        membership_id=result.membership_id,
        already_deducted_via_attendance=result.already_deducted_via_attendance,
    )
