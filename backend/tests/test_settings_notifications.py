"""Gym settings + staff notifications: roles, trial hook, mark read."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.rate_limit import login_rate_limiter, trial_lead_rate_limiter
from app.db.seed import DEV_STAFF_PASSWORD, seed
from app.main import app
from app.models import AuditLog, StaffNotification
from app.models.enums import StaffRole


@pytest.fixture(scope="module", autouse=True)
def _reseed() -> None:
    seed()


@pytest.fixture(autouse=True)
def _reset_limiters() -> None:
    login_rate_limiter.reset()
    trial_lead_rate_limiter.reset()


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


def test_settings_unauthorized(client: TestClient) -> None:
    assert client.get("/api/v1/gym-settings").status_code == 401
    assert (
        client.patch("/api/v1/gym-settings", json={"gym_name": "X"}).status_code == 401
    )


def test_notifications_unauthorized(client: TestClient) -> None:
    assert client.get("/api/v1/notifications").status_code == 401


def test_receptionist_can_read_settings_but_not_write(client: TestClient) -> None:
    _login(client, "09120000002")
    got = client.get("/api/v1/gym-settings")
    assert got.status_code == 200
    assert got.json()["gym_name"]
    assert got.json()["expiry_warning_days"] >= 1

    patched = client.patch(
        "/api/v1/gym-settings",
        json={"expiry_warning_days": 9},
    )
    assert patched.status_code == 403


def test_manager_patches_settings_and_audit(client: TestClient) -> None:
    _login(client)
    before = client.get("/api/v1/gym-settings")
    assert before.status_code == 200
    original_days = before.json()["expiry_warning_days"]
    new_days = 11 if original_days != 11 else 12

    patched = client.patch(
        "/api/v1/gym-settings",
        json={
            "gym_name": "باشگاه آذر تست",
            "expiry_warning_days": new_days,
            "day_end_time": "22:30:00",
        },
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["gym_name"] == "باشگاه آذر تست"
    assert body["expiry_warning_days"] == new_days
    assert body["day_end_time"].startswith("22:30")

    with SessionLocal() as session:
        row = session.scalar(
            select(AuditLog)
            .where(AuditLog.action == "gym_settings.patch")
            .order_by(AuditLog.id.desc())
        )
        assert row is not None
        assert row.entity_type == "gym_settings"


def test_public_trial_creates_notification(client: TestClient) -> None:
    created = client.post(
        "/api/v1/public/trial-leads",
        json={
            "full_name": "تست اعلان",
            "mobile": "09121112233",
            "message": "برای اعلان",
        },
    )
    assert created.status_code == 201
    lead_id = created.json()["id"]

    with SessionLocal() as session:
        notif = session.scalar(
            select(StaffNotification)
            .where(
                StaffNotification.kind == "trial_lead_new",
                StaffNotification.entity_id == str(lead_id),
            )
            .order_by(StaffNotification.id.desc())
        )
        assert notif is not None
        assert "تست اعلان" in (notif.body or "")

    _login(client, "09120000002")
    listed = client.get("/api/v1/notifications")
    assert listed.status_code == 200
    data = listed.json()
    assert data["total"] >= 1
    assert any(
        i["kind"] == "trial_lead_new" and i["entity_id"] == str(lead_id)
        for i in data["items"]
    )


def test_mark_read_and_read_all(client: TestClient) -> None:
    _login(client)
    listed = client.get("/api/v1/notifications")
    assert listed.status_code == 200
    items = listed.json()["items"]
    assert items, "seed/derived should produce at least one notification"
    target = next((i for i in items if not i["is_read"]), items[0])

    marked = client.post(f"/api/v1/notifications/{target['id']}/read")
    assert marked.status_code == 200
    assert marked.json()["is_read"] is True

    again = client.get("/api/v1/notifications")
    assert again.status_code == 200
    found = next(i for i in again.json()["items"] if i["id"] == target["id"])
    assert found["is_read"] is True

    all_marked = client.post("/api/v1/notifications/read-all")
    assert all_marked.status_code == 200
    assert all_marked.json()["marked"] >= 0


def test_trainer_sees_all_staff_audience_only(client: TestClient) -> None:
    """Trainer should get list (possibly filtered); desk-only kinds may be hidden."""
    _login(client, "09120000003")
    listed = client.get("/api/v1/notifications")
    assert listed.status_code == 200
    for item in listed.json()["items"]:
        assert item["role_audience"] in {"all_staff", StaffRole.TRAINER.value}
