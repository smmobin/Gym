"""Public group-classes list for landing (no auth)."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.rate_limit import public_group_classes_rate_limiter
from app.db.seed import wipe_and_seed
from app.main import app
from app.models import GroupClass


@pytest.fixture(scope="module", autouse=True)
def _reseed() -> None:
    wipe_and_seed()


@pytest.fixture(autouse=True)
def _reset_limiter() -> None:
    public_group_classes_rate_limiter.reset()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_public_group_classes_without_auth(client: TestClient) -> None:
    response = client.get("/api/v1/public/group-classes")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1
    assert len(body["items"]) == body["total"]
    for item in body["items"]:
        assert "id" in item
        assert "title" in item
        assert "capacity" in item
        assert "booked_count" in item
        assert "remaining" in item
        assert "starts_at" in item
        assert "trainer_full_name" in item or item.get("trainer_full_name") is None
        assert "is_active" not in item
        assert "trainer_user_id" not in item
        assert "trainer_schedule_conflict" not in item


def test_public_group_classes_only_upcoming_active(client: TestClient) -> None:
    response = client.get("/api/v1/public/group-classes")
    assert response.status_code == 200
    titles = {item["title"] for item in response.json()["items"]}
    # Seed past class must stay hidden from landing.
    assert "کراس‌فیت صبح" not in titles
    assert "یوگا بانوان" in titles or "اسپینینگ عصر" in titles or "پیلاتس عصر" in titles


def test_public_group_classes_excludes_inactive(client: TestClient) -> None:
    db = SessionLocal()
    try:
        row = db.scalar(
            select(GroupClass).where(
                GroupClass.is_active.is_(True),
                GroupClass.starts_at >= datetime.now(tz=timezone.utc),
            )
        )
        assert row is not None
        class_id = row.id
        class_title = row.title
        row.is_active = False
        db.commit()
    finally:
        db.close()

    try:
        response = client.get("/api/v1/public/group-classes")
        assert response.status_code == 200
        titles = {item["title"] for item in response.json()["items"]}
        assert class_title not in titles
        assert all(item["id"] != class_id for item in response.json()["items"])
    finally:
        db = SessionLocal()
        try:
            restored = db.get(GroupClass, class_id)
            assert restored is not None
            restored.is_active = True
            db.commit()
        finally:
            db.close()


def test_desk_group_classes_still_require_auth(client: TestClient) -> None:
    assert client.get("/api/v1/group-classes").status_code == 401


def test_public_list_reflects_capacity(client: TestClient) -> None:
    """Spin seed is capacity 3 with 2 bookings → remaining 1 on public list."""
    response = client.get("/api/v1/public/group-classes")
    assert response.status_code == 200
    spin = next(
        (item for item in response.json()["items"] if item["title"] == "اسپینینگ عصر"),
        None,
    )
    if spin is None:
        pytest.skip("seed spin class not upcoming in this run")
    assert spin["capacity"] == 3
    assert spin["booked_count"] == 2
    assert spin["remaining"] == 1
    assert spin["trainer_full_name"]
