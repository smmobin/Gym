"""
Athlete self-service for group classes.

List policy (v1): active classes with starts_at >= now (UTC) — upcoming only.
Past classes (e.g. seed کراس‌فیت) are hidden; later-today classes still appear.
Booking uses group_classes.book_member_core (same capacity guard as desk).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.enums import BookingStatus
from app.models.group_class import ClassBooking, GroupClass
from app.models.member import Member
from app.models.user import User
from app.services import group_classes as gc_svc
from app.services.athlete import AthleteError


@dataclass
class AthleteClassView:
    group_class: GroupClass
    booked_count: int
    remaining: int
    trainer_full_name: str | None
    booked_by_me: bool
    my_booking_id: int | None


def list_athlete_classes(db: Session, *, member: Member) -> list[AthleteClassView]:
    now = datetime.now(tz=timezone.utc)
    rows = list(
        db.scalars(
            select(GroupClass)
            .options(joinedload(GroupClass.trainer))
            .where(
                GroupClass.is_active.is_(True),
                GroupClass.starts_at >= now,
            )
            .order_by(GroupClass.starts_at.asc())
        )
        .unique()
        .all()
    )

    my_bookings = {
        b.group_class_id: b
        for b in db.scalars(
            select(ClassBooking).where(
                ClassBooking.member_id == member.id,
                ClassBooking.status == BookingStatus.BOOKED.value,
            )
        ).all()
    }

    out: list[AthleteClassView] = []
    for row in rows:
        snap = gc_svc.snapshot(db, row)
        mine = my_bookings.get(row.id)
        trainer_name = None
        if row.trainer is not None:
            trainer_name = row.trainer.full_name
        elif row.trainer_user_id is not None:
            trainer = db.get(User, row.trainer_user_id)
            trainer_name = trainer.full_name if trainer else None
        out.append(
            AthleteClassView(
                group_class=row,
                booked_count=snap.booked_count,
                remaining=snap.remaining,
                trainer_full_name=trainer_name,
                booked_by_me=mine is not None,
                my_booking_id=mine.id if mine else None,
            )
        )
    return out


def list_own_bookings(db: Session, *, member: Member) -> list[ClassBooking]:
    return list(
        db.scalars(
            select(ClassBooking)
            .options(joinedload(ClassBooking.group_class))
            .where(
                ClassBooking.member_id == member.id,
                ClassBooking.status == BookingStatus.BOOKED.value,
            )
            .order_by(ClassBooking.created_at.desc())
        )
        .unique()
        .all()
    )


def book_own_class(db: Session, *, member: Member, class_id: int) -> gc_svc.BookingSnapshot:
    try:
        return gc_svc.book_member_core(db, class_id=class_id, member_id=member.id)
    except gc_svc.GroupClassError as err:
        raise AthleteError(err.status_code, str(err.detail)) from err


def cancel_own_booking(
    db: Session, *, member: Member, booking_id: int
) -> gc_svc.BookingSnapshot:
    booking = db.get(ClassBooking, booking_id)
    if booking is None or booking.member_id != member.id:
        # No leak whether booking exists for another member
        raise AthleteError(404, "رزرو یافت نشد.")
    try:
        return gc_svc.cancel_booking_core(
            db, class_id=booking.group_class_id, booking_id=booking.id
        )
    except gc_svc.GroupClassError as err:
        raise AthleteError(err.status_code, str(err.detail)) from err
