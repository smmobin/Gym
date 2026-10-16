"""Staff auth: login, session cookie, roles, logout, password rules."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.rate_limit import login_rate_limiter
from app.core.security import hash_password, verify_password
from app.db.seed import DEV_STAFF_PASSWORD
from app.main import app
from app.models import User


@pytest.fixture(autouse=True)
def _reset_login_limiter() -> None:
    login_rate_limiter.reset()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _login(
    client: TestClient,
    *,
    mobile: str = "09120000001",
    password: str = DEV_STAFF_PASSWORD,
):
    return client.post("/api/v1/auth/login", json={"mobile": mobile, "password": password})


def test_login_success_sets_httponly_cookie(client: TestClient) -> None:
    response = _login(client)
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["role"] == "manager"
    assert body["user"]["mobile"] == "09120000001"
    assert response.cookies.get("gym_session")
    set_cookie = response.headers.get("set-cookie", "")
    assert "httponly" in set_cookie.lower()
    assert "secure" not in set_cookie.lower()


def test_login_wrong_password(client: TestClient) -> None:
    response = _login(client, password="WrongPass999")
    assert response.status_code == 401


def test_login_password_too_short(client: TestClient) -> None:
    response = _login(client, password="short")
    assert response.status_code == 400


def test_me_without_session_is_401(client: TestClient) -> None:
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401


def test_me_after_login(client: TestClient) -> None:
    assert _login(client).status_code == 200
    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["full_name"] == "مدیر نمونه"


def test_staff_ping_forbidden_for_trainer(client: TestClient) -> None:
    assert _login(client, mobile="09120000003").status_code == 200
    response = client.get("/api/v1/auth/staff-ping")
    assert response.status_code == 403


def test_staff_ping_ok_for_receptionist(client: TestClient) -> None:
    assert _login(client, mobile="09120000002").status_code == 200
    response = client.get("/api/v1/auth/staff-ping")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_logout_revokes_session(client: TestClient) -> None:
    assert _login(client).status_code == 200
    assert client.get("/api/v1/auth/me").status_code == 200
    out = client.post("/api/v1/auth/logout")
    assert out.status_code == 200
    assert client.get("/api/v1/auth/me").status_code == 401


def test_manager_can_change_staff_password(client: TestClient) -> None:
    assert _login(client, mobile="09120000001").status_code == 200
    db = SessionLocal()
    try:
        trainer = db.scalar(select(User).where(User.mobile == "09120000003"))
        assert trainer is not None
        trainer_id = trainer.id
    finally:
        db.close()

    new_password = "NewDevPass1"
    change = client.post(
        f"/api/v1/auth/users/{trainer_id}/password",
        json={"new_password": new_password},
    )
    assert change.status_code == 200

    client.post("/api/v1/auth/logout")
    assert _login(client, mobile="09120000003", password=DEV_STAFF_PASSWORD).status_code == 401
    assert _login(client, mobile="09120000003", password=new_password).status_code == 200

    # restore seed password for other tests / local use
    assert _login(client, mobile="09120000001").status_code == 200
    restore = client.post(
        f"/api/v1/auth/users/{trainer_id}/password",
        json={"new_password": DEV_STAFF_PASSWORD},
    )
    assert restore.status_code == 200


def test_seed_passwords_use_bcrypt() -> None:
    db = SessionLocal()
    try:
        manager = db.scalar(select(User).where(User.mobile == "09120000001"))
        assert manager is not None
        assert manager.password_hash.startswith("$2")
        assert verify_password(DEV_STAFF_PASSWORD, manager.password_hash)
        assert not verify_password("wrong", manager.password_hash)
    finally:
        db.close()


def test_hash_password_helper_roundtrip() -> None:
    hashed = hash_password("AnotherPass1")
    assert verify_password("AnotherPass1", hashed)
