"""Class booking no-show / attended — session deduct and capacity free."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.core.db import SessionLocal
from app.core.rate_limit import login_rate_limiter
from app.db.seed import DEV_STAFF_PASSWORD, seed
from app.main import app
from app.models import (
    Attendance,
    ClassBooking,
    GroupClass,
    Member,
    Membership,
    MembershipPlan,
)
from app.models.enums import (
    AttendanceType,
    BookingStatus,
    MembershipStatus,
)


@pytest.fixture(scope="module", autouse=True)
def _reseed() -> None:
    seed()


@pytest.fixture(autouse=True)
def _reset_limiter() -> None:
    login_rate_limiter.reset()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _login(client: TestClient, mobile: str = "09120000001") -> None:
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"mobile": mobile, "password": DEV_STAFF_PASSWORD},
        ).status_code
        == 200
    )


def _member_id(display_id: str) -> int:
    db = SessionLocal()
    try:
        m = db.scalar(select(Member).where(Member.display_id == display_id))
        assert m is not None
        return m.id
    finally:
        db.close()


def _past_class_with_booking(
    *,
    member_display: str = "M-1006",
    capacity: int = 5,
    hours_ago: int = 2,
) -> tuple[int, int, int]:
    """Create a started class + booked member. Returns class_id, booking_id, member_id."""
    db = SessionLocal()
    try:
        member = db.scalar(select(Member).where(Member.display_id == member_display))
        assert member is not None
        starts = datetime.now(tz=timezone.utc) - timedelta(hours=hours_ago)
        ends = starts + timedelta(hours=1)
        gc = GroupClass(
            title="کلاس تست غیبت",
            capacity=capacity,
            gender_label="mixed",
            starts_at=starts,
            ends_at=ends,
            is_active=True,
        )
        db.add(gc)
        db.flush()
        booking = ClassBooking(
            group_class_id=gc.id,
            member_id=member.id,
            status=BookingStatus.BOOKED.value,
        )
        db.add(booking)
        db.commit()
        return gc.id, booking.id, member.id
    finally:
        db.close()


def _sessions_remaining(member_id: int) -> int | None:
    db = SessionLocal()
    try:
        rows = list(
            db.scalars(
                select(Membership)
                .options(joinedload(Membership.plan))
                .where(
                    Membership.member_id == member_id,
                    Membership.status == MembershipStatus.ACTIVE.value,
                )
            )
            .unique()
            .all()
        )
        packs = [m for m in rows if m.plan and m.plan.session_count is not None]
        if not packs:
            return None
        return packs[0].sessions_remaining
    finally:
        db.close()


def _class_pack_ids(member_id: int) -> list[int]:
    db = SessionLocal()
    try:
        rows = list(
            db.scalars(
                select(Membership)
                .options(joinedload(Membership.plan))
                .where(
                    Membership.member_id == member_id,
                    Membership.status == MembershipStatus.ACTIVE.value,
                )
            )
            .unique()
            .all()
        )
        return [
            m.id
            for m in rows
            if m.plan
            and m.plan.session_count is not None
            and (m.sessions_remaining or 0) > 0
        ]
    finally:
        db.close()


def test_no_show_unauthorized(client: TestClient) -> None:
    class_id, booking_id, _ = _past_class_with_booking(member_display="M-1008")
    assert (
        client.post(
            f"/api/v1/group-classes/{class_id}/bookings/{booking_id}/no-show",
            json={},
        ).status_code
        == 401
    )


def test_trainer_forbidden_no_show(client: TestClient) -> None:
    _login(client, "09120000003")
    class_id, booking_id, _ = _past_class_with_booking(member_display="M-1008")
    assert (
        client.post(
            f"/api/v1/group-classes/{class_id}/bookings/{booking_id}/no-show",
            json={},
        ).status_code
        == 403
    )


def test_no_show_deducts_session_and_frees_capacity(client: TestClient) -> None:
    _login(client)
    # Maryam (M-1006) has class pack with sessions_remaining=7 in seed
    class_id, booking_id, member_id = _past_class_with_booking(
        member_display="M-1006", capacity=2
    )
    before = _sessions_remaining(member_id)
    assert before is not None and before > 0

    listed = client.get(f"/api/v1/group-classes/{class_id}/bookings")
    assert listed.status_code == 200
    assert listed.json()["booked_count"] == 1
    assert listed.json()["remaining"] == 1

    response = client.post(
        f"/api/v1/group-classes/{class_id}/bookings/{booking_id}/no-show",
        json={},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["booking"]["status"] == "no_show"
    assert body["session_deducted"] is True
    assert body["sessions_remaining"] == before - 1
    assert body["booked_count"] == 0
    assert body["remaining"] == 2

    assert _sessions_remaining(member_id) == before - 1

    # Repeat must not deduct again
    again = client.post(
        f"/api/v1/group-classes/{class_id}/bookings/{booking_id}/no-show",
        json={},
    )
    assert again.status_code == 409
    assert _sessions_remaining(member_id) == before - 1


def test_no_show_before_start_rejected(client: TestClient) -> None:
    _login(client)
    db = SessionLocal()
    try:
        member = db.scalar(select(Member).where(Member.display_id == "M-1006"))
        assert member is not None
        starts = datetime.now(tz=timezone.utc) + timedelta(hours=5)
        ends = starts + timedelta(hours=1)
        gc = GroupClass(
            title="آینده",
            capacity=3,
            gender_label="mixed",
            starts_at=starts,
            ends_at=ends,
            is_active=True,
        )
        db.add(gc)
        db.flush()
        booking = ClassBooking(
            group_class_id=gc.id,
            member_id=member.id,
            status=BookingStatus.BOOKED.value,
        )
        db.add(booking)
        db.commit()
        class_id, booking_id = gc.id, booking.id
    finally:
        db.close()

    response = client.post(
        f"/api/v1/group-classes/{class_id}/bookings/{booking_id}/no-show",
        json={},
    )
    assert response.status_code == 400


def test_no_show_ambiguous_requires_membership_id(client: TestClient) -> None:
    _login(client)
    # Ali has month + PT pack — PT is session pack; give him a second class pack for ambiguity
    member_id = _member_id("M-1001")
    db = SessionLocal()
    try:
        plan_class = db.scalar(
            select(MembershipPlan).where(MembershipPlan.name == "۸ جلسه کلاس گروهی")
        )
        assert plan_class is not None
        extra = Membership(
            member_id=member_id,
            plan_id=plan_class.id,
            agreed_amount_toman=1_200_000,
            start_date=datetime.now(tz=timezone.utc).date(),
            end_date=(datetime.now(tz=timezone.utc) + timedelta(days=40)).date(),
            status=MembershipStatus.ACTIVE.value,
            sessions_remaining=5,
        )
        db.add(extra)
        db.commit()
        extra_id = extra.id
    finally:
        db.close()

    packs = _class_pack_ids(member_id)
    assert len(packs) >= 2

    class_id, booking_id, _ = _past_class_with_booking(member_display="M-1001")
    missing = client.post(
        f"/api/v1/group-classes/{class_id}/bookings/{booking_id}/no-show",
        json={},
    )
    assert missing.status_code == 400
    detail = missing.json()["detail"]
    assert isinstance(detail, dict)
    assert detail["code"] == "membership_required"
    assert len(detail["options"]) >= 2

    ok = client.post(
        f"/api/v1/group-classes/{class_id}/bookings/{booking_id}/no-show",
        json={"membership_id": extra_id},
    )
    assert ok.status_code == 200
    assert ok.json()["session_deducted"] is True
    assert ok.json()["membership_id"] == extra_id


def test_no_show_skips_deduct_if_class_checkin_exists(client: TestClient) -> None:
    _login(client)
    # Farther in the past so window does not collide with other tests.
    class_id, booking_id, member_id = _past_class_with_booking(
        member_display="M-1006", hours_ago=48
    )
    before = _sessions_remaining(member_id)
    assert before is not None

    db = SessionLocal()
    try:
        packs = _class_pack_ids(member_id)
        assert packs
        gc = db.get(GroupClass, class_id)
        assert gc is not None
        db.add(
            Attendance(
                member_id=member_id,
                membership_id=packs[0],
                check_in_at=gc.starts_at + timedelta(minutes=10),
                attendance_type=AttendanceType.CLASS.value,
            )
        )
        # Simulate check-in already deducted
        membership = db.get(Membership, packs[0])
        assert membership is not None
        membership.sessions_remaining = max((membership.sessions_remaining or 1) - 1, 0)
        db.commit()
        after_checkin = membership.sessions_remaining
    finally:
        db.close()

    response = client.post(
        f"/api/v1/group-classes/{class_id}/bookings/{booking_id}/no-show",
        json={},
    )
    assert response.status_code == 200
    assert response.json()["session_deducted"] is False
    assert response.json()["already_deducted_via_attendance"] is True
    assert response.json()["booking"]["status"] == "no_show"
    assert _sessions_remaining(member_id) == after_checkin


def test_attended_deducts_and_frees_slot(client: TestClient) -> None:
    _login(client)
    class_id, booking_id, member_id = _past_class_with_booking(
        member_display="M-1006", hours_ago=72
    )
    before = _sessions_remaining(member_id)
    assert before is not None

    response = client.post(
        f"/api/v1/group-classes/{class_id}/bookings/{booking_id}/attended",
        json={},
    )
    assert response.status_code == 200
    assert response.json()["booking"]["status"] == "attended"
    assert response.json()["session_deducted"] is True
    assert response.json()["booked_count"] == 0
    assert _sessions_remaining(member_id) == before - 1


def test_no_pack_member_requires_explicit_or_fails(client: TestClient) -> None:
    _login(client)
    # Elham has gift month plan only (no session pack)
    class_id, booking_id, _ = _past_class_with_booking(member_display="M-1008")
    response = client.post(
        f"/api/v1/group-classes/{class_id}/bookings/{booking_id}/no-show",
        json={},
    )
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert isinstance(detail, dict)
    assert detail["code"] == "membership_required"
