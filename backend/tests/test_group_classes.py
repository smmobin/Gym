"""Group class API: capacity, bookings, roles, trainer conflict warning."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.rate_limit import login_rate_limiter
from app.db.seed import DEV_STAFF_PASSWORD, wipe_and_seed
from app.main import app
from app.models import ClassBooking, Member, User
from app.models.enums import BookingStatus


@pytest.fixture(scope="module", autouse=True)
def _reseed() -> None:
    wipe_and_seed()


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


def _trainer_id(mobile: str = "09120000003") -> int:
    db = SessionLocal()
    try:
        u = db.scalar(select(User).where(User.mobile == mobile))
        assert u is not None
        return u.id
    finally:
        db.close()


def _future_range(hours_offset: int = 48, duration_hours: int = 1) -> tuple[str, str]:
    start = datetime.now(tz=timezone.utc) + timedelta(hours=hours_offset)
    end = start + timedelta(hours=duration_hours)
    return start.isoformat(), end.isoformat()


def test_list_unauthorized(client: TestClient) -> None:
    assert client.get("/api/v1/group-classes").status_code == 401


def test_list_and_create_as_manager(client: TestClient) -> None:
    _login(client)
    listed = client.get("/api/v1/group-classes")
    assert listed.status_code == 200
    assert listed.json()["total"] >= 1

    starts, ends = _future_range(100)
    created = client.post(
        "/api/v1/group-classes",
        json={
            "title": "یوگا تست",
            "capacity": 2,
            "gender_label": "women",
            "starts_at": starts,
            "ends_at": ends,
        },
    )
    assert created.status_code == 201
    body = created.json()
    assert body["group_class"]["capacity"] == 2
    assert body["group_class"]["remaining"] == 2
    assert body["group_class"]["booked_count"] == 0
    assert body["trainer_schedule_conflict"] is False


def test_receptionist_can_create(client: TestClient) -> None:
    _login(client, "09120000002")
    starts, ends = _future_range(110)
    response = client.post(
        "/api/v1/group-classes",
        json={
            "title": "کلاس منشی",
            "capacity": 5,
            "gender_label": "mixed",
            "starts_at": starts,
            "ends_at": ends,
        },
    )
    assert response.status_code == 201


def test_duplicate_active_class_409(client: TestClient) -> None:
    """BUG-007: same title+starts_at+gender_label while active → 409 Persian."""
    _login(client)
    starts, ends = _future_range(112)
    payload = {
        "title": "کلاس تکراری تست",
        "capacity": 4,
        "gender_label": "men",
        "starts_at": starts,
        "ends_at": ends,
    }
    first = client.post("/api/v1/group-classes", json=payload)
    assert first.status_code == 201
    class_id = first.json()["group_class"]["id"]

    second = client.post("/api/v1/group-classes", json=payload)
    assert second.status_code == 409
    detail = second.json()["detail"]
    assert "فعال" in detail
    assert "عنوان" in detail

    # Deactivate then recreate is allowed.
    assert (
        client.patch(f"/api/v1/group-classes/{class_id}", json={"is_active": False}).status_code
        == 200
    )
    third = client.post("/api/v1/group-classes", json=payload)
    assert third.status_code == 201
    assert third.json()["group_class"]["id"] != class_id


def test_invalid_time_range_422(client: TestClient) -> None:
    _login(client)
    starts, ends = _future_range(120)
    response = client.post(
        "/api/v1/group-classes",
        json={
            "title": "زمان بد",
            "capacity": 3,
            "gender_label": "mixed",
            "starts_at": ends,
            "ends_at": starts,
        },
    )
    assert response.status_code == 422


def test_invalid_capacity_rejected(client: TestClient) -> None:
    _login(client)
    starts, ends = _future_range(125)
    response = client.post(
        "/api/v1/group-classes",
        json={
            "title": "ظرفیت صفر",
            "capacity": 0,
            "gender_label": "mixed",
            "starts_at": starts,
            "ends_at": ends,
        },
    )
    assert response.status_code == 422


def test_book_until_full_then_block_then_cancel_frees(client: TestClient) -> None:
    _login(client)
    starts, ends = _future_range(130)
    created = client.post(
        "/api/v1/group-classes",
        json={
            "title": "ظرفیت دو نفره",
            "capacity": 2,
            "gender_label": "men",
            "starts_at": starts,
            "ends_at": ends,
        },
    )
    assert created.status_code == 201
    class_id = created.json()["group_class"]["id"]

    m1 = _member_id("M-1001")
    m2 = _member_id("M-1002")
    m3 = _member_id("M-1004")

    b1 = client.post(f"/api/v1/group-classes/{class_id}/bookings", json={"member_id": m1})
    assert b1.status_code == 201
    assert b1.json()["remaining"] == 1

    b2 = client.post(f"/api/v1/group-classes/{class_id}/bookings", json={"member_id": m2})
    assert b2.status_code == 201
    assert b2.json()["remaining"] == 0
    assert b2.json()["booked_count"] == 2

    full = client.post(f"/api/v1/group-classes/{class_id}/bookings", json={"member_id": m3})
    assert full.status_code == 409
    assert "ظرفیت" in full.json()["detail"]

    booking_id = b1.json()["booking"]["id"]
    cancelled = client.post(
        f"/api/v1/group-classes/{class_id}/bookings/{booking_id}/cancel"
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["remaining"] == 1
    assert cancelled.json()["booking"]["status"] == "cancelled"

    again = client.post(
        f"/api/v1/group-classes/{class_id}/bookings/{booking_id}/cancel"
    )
    assert again.status_code == 409

    # Slot freed — third member can book
    b3 = client.post(f"/api/v1/group-classes/{class_id}/bookings", json={"member_id": m3})
    assert b3.status_code == 201
    assert b3.json()["remaining"] == 0


def test_duplicate_booking_409(client: TestClient) -> None:
    _login(client)
    starts, ends = _future_range(140)
    created = client.post(
        "/api/v1/group-classes",
        json={
            "title": "رزرو تکراری",
            "capacity": 5,
            "gender_label": "mixed",
            "starts_at": starts,
            "ends_at": ends,
        },
    )
    class_id = created.json()["group_class"]["id"]
    member_id = _member_id("M-1001")
    assert (
        client.post(
            f"/api/v1/group-classes/{class_id}/bookings",
            json={"member_id": member_id},
        ).status_code
        == 201
    )
    dup = client.post(
        f"/api/v1/group-classes/{class_id}/bookings",
        json={"member_id": member_id},
    )
    assert dup.status_code == 409


def test_trainer_read_only_own_classes(client: TestClient) -> None:
    _login(client)  # manager creates
    trainer_id = _trainer_id()
    starts, ends = _future_range(150)
    created = client.post(
        "/api/v1/group-classes",
        json={
            "title": "کلاس مربی",
            "capacity": 4,
            "gender_label": "mixed",
            "starts_at": starts,
            "ends_at": ends,
            "trainer_user_id": trainer_id,
        },
    )
    class_id = created.json()["group_class"]["id"]

    # Login as that trainer (seed: 09120000003 is trainer1)
    client.post("/api/v1/auth/logout")
    _login(client, "09120000003")
    listed = client.get("/api/v1/group-classes")
    assert listed.status_code == 200
    ids = {item["id"] for item in listed.json()["items"]}
    assert class_id in ids

    bookings = client.get(f"/api/v1/group-classes/{class_id}/bookings")
    assert bookings.status_code == 200

    forbidden_book = client.post(
        f"/api/v1/group-classes/{class_id}/bookings",
        json={"member_id": _member_id("M-1001")},
    )
    assert forbidden_book.status_code == 403

    forbidden_create = client.post(
        "/api/v1/group-classes",
        json={
            "title": "نباید ساخته شود",
            "capacity": 3,
            "gender_label": "mixed",
            "starts_at": starts,
            "ends_at": ends,
        },
    )
    assert forbidden_create.status_code == 403


def test_trainer_schedule_conflict_warns_but_saves(client: TestClient) -> None:
    _login(client)
    trainer_id = _trainer_id()
    starts, ends = _future_range(160)
    first = client.post(
        "/api/v1/group-classes",
        json={
            "title": "کلاس اول مربی",
            "capacity": 8,
            "gender_label": "mixed",
            "starts_at": starts,
            "ends_at": ends,
            "trainer_user_id": trainer_id,
        },
    )
    assert first.status_code == 201
    assert first.json()["trainer_schedule_conflict"] is False

    second = client.post(
        "/api/v1/group-classes",
        json={
            "title": "کلاس هم‌زمان مربی",
            "capacity": 6,
            "gender_label": "mixed",
            "starts_at": starts,
            "ends_at": ends,
            "trainer_user_id": trainer_id,
        },
    )
    assert second.status_code == 201
    assert second.json()["trainer_schedule_conflict"] is True
    assert second.json()["warning"]
    assert second.json()["group_class"]["id"] != first.json()["group_class"]["id"]


def test_patch_capacity_below_booked_rejected(client: TestClient) -> None:
    _login(client)
    starts, ends = _future_range(170)
    created = client.post(
        "/api/v1/group-classes",
        json={
            "title": "کاهش ظرفیت",
            "capacity": 3,
            "gender_label": "mixed",
            "starts_at": starts,
            "ends_at": ends,
        },
    )
    class_id = created.json()["group_class"]["id"]
    client.post(
        f"/api/v1/group-classes/{class_id}/bookings",
        json={"member_id": _member_id("M-1001")},
    )
    client.post(
        f"/api/v1/group-classes/{class_id}/bookings",
        json={"member_id": _member_id("M-1002")},
    )
    patched = client.patch(
        f"/api/v1/group-classes/{class_id}",
        json={"capacity": 1},
    )
    assert patched.status_code == 400
    assert "ظرفیت" in patched.json()["detail"]


def test_gender_label_does_not_block_booking(client: TestClient) -> None:
    """Display-only: women label still accepts any member."""
    _login(client)
    starts, ends = _future_range(180)
    created = client.post(
        "/api/v1/group-classes",
        json={
            "title": "بانوان نمایشی",
            "capacity": 5,
            "gender_label": "women",
            "starts_at": starts,
            "ends_at": ends,
        },
    )
    class_id = created.json()["group_class"]["id"]
    # M-1001 is a male-sounding name in seed (علی) — still OK
    response = client.post(
        f"/api/v1/group-classes/{class_id}/bookings",
        json={"member_id": _member_id("M-1001")},
    )
    assert response.status_code == 201


def test_rebook_after_cancel(client: TestClient) -> None:
    _login(client)
    starts, ends = _future_range(190)
    created = client.post(
        "/api/v1/group-classes",
        json={
            "title": "رزرو مجدد",
            "capacity": 2,
            "gender_label": "mixed",
            "starts_at": starts,
            "ends_at": ends,
        },
    )
    class_id = created.json()["group_class"]["id"]
    member_id = _member_id("M-1008")
    booked = client.post(
        f"/api/v1/group-classes/{class_id}/bookings",
        json={"member_id": member_id},
    )
    booking_id = booked.json()["booking"]["id"]
    client.post(f"/api/v1/group-classes/{class_id}/bookings/{booking_id}/cancel")
    again = client.post(
        f"/api/v1/group-classes/{class_id}/bookings",
        json={"member_id": member_id},
    )
    assert again.status_code == 201
    assert again.json()["booking"]["status"] == "booked"

    db = SessionLocal()
    try:
        rows = db.scalars(
            select(ClassBooking).where(
                ClassBooking.group_class_id == class_id,
                ClassBooking.member_id == member_id,
            )
        ).all()
        assert len(rows) == 1
        assert rows[0].status == BookingStatus.BOOKED.value
    finally:
        db.close()
