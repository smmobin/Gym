"""Slice J: also_trainer + session acting_role."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.db import SessionLocal
from app.core.rate_limit import login_rate_limiter, lookup_rate_limiter
from app.db.seed import DEV_STAFF_PASSWORD, wipe_and_seed
from app.main import app
from app.models import StaffSession, User
from sqlalchemy import select


@pytest.fixture(scope="module", autouse=True)
def _reseed() -> None:
    wipe_and_seed()
    yield
    wipe_and_seed()


@pytest.fixture(autouse=True)
def _reset_limiters() -> None:
    login_rate_limiter.reset()
    lookup_rate_limiter.reset()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _login_as(client: TestClient, mobile: str, role: str, password: str = DEV_STAFF_PASSWORD):
    return client.post(
        "/api/v1/auth/login",
        json={"mobile": mobile, "password": password, "kind": "staff", "role": role},
    )


def test_desk_also_trainer_lookup_returns_two_staff_identities(client: TestClient) -> None:
    res = client.post("/api/v1/auth/lookup", json={"mobile": "09120000001"})
    assert res.status_code == 200
    identities = res.json()["identities"]
    staff = [i for i in identities if i["kind"] == "staff"]
    assert len(staff) == 2
    by_role = {i["role"]: i for i in staff}
    assert by_role["manager"]["auth_methods"] == ["password"]
    assert by_role["trainer"]["auth_methods"] == ["otp", "password"]


def test_login_as_trainer_acting_role_blocks_manager_settings(client: TestClient) -> None:
    res = _login_as(client, "09120000001", "trainer")
    assert res.status_code == 200
    body = res.json()
    assert body["role"] == "trainer"
    assert body["user"]["role"] == "trainer"
    assert body["user"]["also_trainer"] is True

    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.mobile == "09120000001"))
        assert user is not None
        session = db.scalar(
            select(StaffSession)
            .where(StaffSession.user_id == user.id, StaffSession.revoked_at.is_(None))
            .order_by(StaffSession.id.desc())
        )
        assert session is not None
        assert session.acting_role == "trainer"
    finally:
        db.close()

    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["role"] == "trainer"

    # Acting as trainer: members list is allowed (scoped to own trainees)
    members = client.get("/api/v1/members")
    assert members.status_code == 200

    patch = client.patch(
        "/api/v1/gym-settings",
        json={"gym_name": "نباید عوض شود"},
    )
    assert patch.status_code == 403

    ping = client.get("/api/v1/auth/staff-ping")
    assert ping.status_code == 403


def test_login_as_manager_desk_ok_trainer_only_scope_closed(client: TestClient) -> None:
    res = _login_as(client, "09120000001", "manager")
    assert res.status_code == 200
    assert res.json()["role"] == "manager"

    ping = client.get("/api/v1/auth/staff-ping")
    assert ping.status_code == 200
    assert ping.json()["role"] == "manager"

    settings = client.get("/api/v1/gym-settings")
    assert settings.status_code == 200

    # Desk session must not use trainer-only assignment gate as if acting trainer
    # Creating workout as manager remains allowed (manager write path).
    members = client.get("/api/v1/members")
    assert members.status_code == 200


def test_also_trainer_false_cannot_login_as_trainer(client: TestClient) -> None:
    wipe_and_seed()
    login_rate_limiter.reset()
    lookup_rate_limiter.reset()
    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.mobile == "09120000001"))
        assert user is not None
        user.also_trainer = False
        db.commit()
    finally:
        db.close()

    lookup = client.post("/api/v1/auth/lookup", json={"mobile": "09120000001"})
    assert lookup.status_code == 200
    staff_roles = [i["role"] for i in lookup.json()["identities"] if i["kind"] == "staff"]
    assert staff_roles == ["manager"]

    bad = _login_as(client, "09120000001", "trainer")
    assert bad.status_code == 401

    wipe_and_seed()


def test_receptionist_cannot_create_manager(client: TestClient) -> None:
    assert _login_as(client, "09120000002", "receptionist").status_code == 200
    res = client.post(
        "/api/v1/staff",
        json={
            "full_name": "مدیر جعلی",
            "mobile": "09129999001",
            "password": "ChangeMe123",
            "role": "manager",
        },
    )
    assert res.status_code in (403, 422)


def test_trainer_list_includes_also_trainer_desk(client: TestClient) -> None:
    assert _login_as(client, "09120000001", "manager").status_code == 200
    res = client.get("/api/v1/trainers")
    assert res.status_code == 200
    items = res.json()["items"]
    mobiles = {i["mobile"] for i in items}
    assert "09120000001" in mobiles  # manager also_trainer
    assert "09120000002" in mobiles  # receptionist also_trainer
    assert "09120000003" in mobiles  # pure trainer


def test_manager_can_toggle_also_trainer_on_self(client: TestClient) -> None:
    wipe_and_seed()
    login_rate_limiter.reset()
    assert _login_as(client, "09120000001", "manager").status_code == 200
    db = SessionLocal()
    try:
        manager = db.scalar(select(User).where(User.mobile == "09120000001"))
        assert manager is not None
        mid = manager.id
    finally:
        db.close()

    off = client.patch(f"/api/v1/staff/{mid}", json={"also_trainer": False})
    assert off.status_code == 200
    assert off.json()["user"]["also_trainer"] is False

    on = client.patch(f"/api/v1/staff/{mid}", json={"also_trainer": True})
    assert on.status_code == 200
    assert on.json()["user"]["also_trainer"] is True

    wipe_and_seed()
