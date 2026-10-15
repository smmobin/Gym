"""Group class capacity helper — no overbook."""

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

import pytest

from app.core.db import SessionLocal
from app.models import BookingStatus, ClassBooking, GenderLabel, GroupClass, Member, MemberStatus
from app.services.class_booking import ClassFullError, assert_can_book, remaining_capacity


@pytest.fixture
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def test_assert_can_book_blocks_when_full(db: Session) -> None:
    now = datetime.now(tz=timezone.utc)
    gc = GroupClass(
        title="کلاس تست ظرفیت",
        capacity=1,
        gender_label=GenderLabel.MIXED.value,
        starts_at=now + timedelta(hours=1),
        ends_at=now + timedelta(hours=2),
        is_active=True,
    )
    member = Member(
        display_id="M-T910",
        first_name="تست",
        last_name="ظرفیت",
        mobile="09128888010",
        status=MemberStatus.ACTIVE.value,
    )
    db.add_all([gc, member])
    db.flush()
    db.add(
        ClassBooking(
            group_class_id=gc.id,
            member_id=member.id,
            status=BookingStatus.BOOKED.value,
        )
    )
    db.flush()

    assert remaining_capacity(db, gc) == 0
    with pytest.raises(ClassFullError):
        assert_can_book(db, gc)
    db.rollback()
