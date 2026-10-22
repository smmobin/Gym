"""Athlete self-booking for group classes — capacity reuse + authz boundary."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.rate_limit import login_rate_limiter
from app.db.seed import DEV_ATHLETE_PASSWORD, DEV_STAFF_PASSWORD, wipe_and_seed
from app.main import app
from app.models import ClassBooking, GroupClass, Member
from app.models.enums import BookingStatus
from app.services.class_booking import remaining_capacity


@pytest.fixture(scope="module", autouse=True)
def _reseed() -> None:
    wipe_and_seed()


@pytest.fixture(autouse=True)
def _reset_limiter() -> None:
    login_rate_limiter.reset()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _athlete_login(client: TestClient, mobile: str = "09121111001") -> None:
    assert (
        client.post(
            "/api/v1/athlete/auth/login",
            json={"mobile": mobile, "password": DEV_ATHLETE_PASSWORD},
        ).status_code
        == 200
    )


def _staff_login(client: TestClient) -> None:
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"mobile": "09120000001", "password": DEV_STAFF_PASSWORD},
        ).status_code
        == 200
    )


def _pilates_id() -> int:
    db = SessionLocal()
    try:
        row = db.scalar(select(GroupClass).where(GroupClass.title == "پیلاتس عصر"))
        assert row is not None
        return row.id
    finally:
        db.close()


def _ali_id() -> int:
    db = SessionLocal()
    try:
        m = db.scalar(select(Member).where(Member.display_id == "M-1001"))
        assert m is not None
        return m.id
    finally:
        db.close()


def _clear_ali_pilates_booking() -> None:
    db = SessionLocal()
    try:
        ali = db.scalar(select(Member).where(Member.display_id == "M-1001"))
        pilates = db.scalar(select(GroupClass).where(GroupClass.title == "پیلاتس عصر"))
        assert ali and pilates
        for b in db.scalars(
            select(ClassBooking).where(
                ClassBooking.group_class_id == pilates.id,
                ClassBooking.member_id == ali.id,
            )
        ).all():
            db.delete(b)
        db.commit()
    finally:
        db.close()


def test_athlete_list_classes_today_onward_hides_past(client: TestClient) -> None:
    _athlete_login(client)
    res = client.get("/api/v1/athlete/group-classes")
    assert res.status_code == 200
    titles = [c["title"] for c in res.json()["items"]]
    assert "پیلاتس عصر" in titles
    assert "یوگا بانوان" in titles
    assert "کراس‌فیت صبح" not in titles  # past seed class


def test_athlete_book_and_cancel_own(client: TestClient) -> None:
    _clear_ali_pilates_booking()
    _athlete_login(client)
    class_id = _pilates_id()

    book = client.post(f"/api/v1/athlete/group-classes/{class_id}/book")
    assert book.status_code == 201, book.text
    body = book.json()
    assert body["booking"]["group_class_id"] == class_id
    assert body["booking"]["status"] == "booked"
    booking_id = body["booking"]["id"]

    listed = client.get("/api/v1/athlete/group-classes")
    mine = next(c for c in listed.json()["items"] if c["id"] == class_id)
    assert mine["booked_by_me"] is True
    assert mine["my_booking_id"] == booking_id

    cancel = client.post(f"/api/v1/athlete/class-bookings/{booking_id}/cancel")
    assert cancel.status_code == 200
    assert cancel.json()["booking"]["status"] == "cancelled"

    listed2 = client.get("/api/v1/athlete/group-classes")
    mine2 = next(c for c in listed2.json()["items"] if c["id"] == class_id)
    assert mine2["booked_by_me"] is False


def test_athlete_cannot_cancel_others_booking(client: TestClient) -> None:
    _athlete_login(client)
    db = SessionLocal()
    try:
        negar = db.scalar(select(Member).where(Member.display_id == "M-1004"))
        yoga = db.scalar(select(GroupClass).where(GroupClass.title == "یوگا بانوان"))
        assert negar and yoga
        booking = db.scalar(
            select(ClassBooking).where(
                ClassBooking.group_class_id == yoga.id,
                ClassBooking.member_id == negar.id,
                ClassBooking.status == BookingStatus.BOOKED.value,
            )
        )
        assert booking is not None
        other_id = booking.id
    finally:
        db.close()

    res = client.post(f"/api/v1/athlete/class-bookings/{other_id}/cancel")
    assert res.status_code == 404


def test_athlete_capacity_full_409(client: TestClient) -> None:
    _clear_ali_pilates_booking()
    class_id = _pilates_id()
    db = SessionLocal()
    try:
        row = db.get(GroupClass, class_id)
        assert row is not None
        # Fill remaining seats with fake booked rows using other members
        others = list(
            db.scalars(
                select(Member).where(Member.display_id != "M-1001").limit(row.capacity)
            ).all()
        )
        for m in others:
            existing = db.scalar(
                select(ClassBooking).where(
                    ClassBooking.group_class_id == class_id,
                    ClassBooking.member_id == m.id,
                )
            )
            if existing:
                existing.status = BookingStatus.BOOKED.value
                existing.cancelled_at = None
            else:
                db.add(
                    ClassBooking(
                        group_class_id=class_id,
                        member_id=m.id,
                        status=BookingStatus.BOOKED.value,
                    )
                )
        db.commit()
        db.refresh(row)
        assert remaining_capacity(db, row) == 0
    finally:
        db.close()

    _athlete_login(client)
    res = client.post(f"/api/v1/athlete/group-classes/{class_id}/book")
    assert res.status_code == 409
    assert "ظرفیت" in res.json()["detail"]

    # restore for other tests
    wipe_and_seed()


def test_unauthenticated_athlete_classes_401(client: TestClient) -> None:
    assert client.get("/api/v1/athlete/group-classes").status_code == 401
    assert client.post("/api/v1/athlete/group-classes/1/book").status_code == 401


def test_staff_group_classes_still_work(client: TestClient) -> None:
    _staff_login(client)
    res = client.get("/api/v1/group-classes?upcoming=true")
    assert res.status_code == 200
    assert res.json()["total"] >= 1


def test_athlete_cookie_cannot_use_staff_book_endpoint(client: TestClient) -> None:
    _athlete_login(client)
    class_id = _pilates_id()
    res = client.post(
        f"/api/v1/group-classes/{class_id}/bookings",
        json={"member_id": _ali_id()},
    )
    assert res.status_code in {401, 403}
