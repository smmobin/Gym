"""Member file locks: acquire, conflict, touch, TTL expiry, unlock, soft-enforce."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.rate_limit import login_rate_limiter
from app.db.seed import DEV_STAFF_PASSWORD, seed
from app.main import app
from app.models import Member, MemberFileLock, User


@pytest.fixture(scope="module", autouse=True)
def _reseed() -> None:
    seed()


@pytest.fixture(autouse=True)
def _reset_limiter() -> None:
    login_rate_limiter.reset()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _login(client: TestClient, mobile: str) -> None:
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"mobile": mobile, "password": DEV_STAFF_PASSWORD},
        ).status_code
        == 200
    )


def _member(display_id: str = "M-1001") -> Member:
    db = SessionLocal()
    try:
        m = db.scalar(select(Member).where(Member.display_id == display_id))
        assert m is not None
        db.expunge(m)
        return m
    finally:
        db.close()


def _user_by_mobile(mobile: str) -> User:
    db = SessionLocal()
    try:
        u = db.scalar(select(User).where(User.mobile == mobile))
        assert u is not None
        db.expunge(u)
        return u
    finally:
        db.close()


def _clear_locks() -> None:
    db = SessionLocal()
    try:
        for row in db.scalars(select(MemberFileLock)).all():
            db.delete(row)
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _clean_locks() -> None:
    _clear_locks()
    yield
    _clear_locks()


def test_acquire_ok_and_status(client: TestClient) -> None:
    member = _member()
    _login(client, "09120000001")
    acquired = client.post(f"/api/v1/members/{member.id}/lock")
    assert acquired.status_code == 200
    body = acquired.json()
    assert body["locked"] is True
    assert body["held_by_me"] is True
    assert body["locked_by_name"]

    status = client.get(f"/api/v1/members/{member.id}/lock")
    assert status.status_code == 200
    assert status.json()["locked"] is True


def test_second_user_gets_409(client: TestClient) -> None:
    member = _member()
    manager = TestClient(app)
    desk = TestClient(app)
    _login(manager, "09120000001")
    _login(desk, "09120000002")

    assert manager.post(f"/api/v1/members/{member.id}/lock").status_code == 200
    conflict = desk.post(f"/api/v1/members/{member.id}/lock")
    assert conflict.status_code == 409
    detail = conflict.json()["detail"]
    assert detail["code"] == "member_file_locked"
    assert detail["locked_by_name"]
    assert "expires_at" in detail


def test_touch_extends_last_seen(client: TestClient) -> None:
    member = _member()
    _login(client, "09120000001")
    assert client.post(f"/api/v1/members/{member.id}/lock").status_code == 200

    db = SessionLocal()
    try:
        lock = db.get(MemberFileLock, member.id)
        assert lock is not None
        old = datetime.now(tz=timezone.utc) - timedelta(minutes=2)
        lock.last_seen_at = old
        db.commit()
    finally:
        db.close()

    touched = client.post(f"/api/v1/members/{member.id}/lock/touch")
    assert touched.status_code == 200
    expires = datetime.fromisoformat(touched.json()["expires_at"])
    assert expires > datetime.now(tz=timezone.utc) + timedelta(minutes=4)


def test_expired_lock_can_be_reacquired(client: TestClient) -> None:
    member = _member()
    manager = TestClient(app)
    desk = TestClient(app)
    _login(manager, "09120000001")
    _login(desk, "09120000002")

    assert manager.post(f"/api/v1/members/{member.id}/lock").status_code == 200
    ttl = get_settings().member_file_lock_ttl_seconds
    db = SessionLocal()
    try:
        lock = db.get(MemberFileLock, member.id)
        assert lock is not None
        lock.last_seen_at = datetime.now(tz=timezone.utc) - timedelta(seconds=ttl + 30)
        db.commit()
    finally:
        db.close()

    taken = desk.post(f"/api/v1/members/{member.id}/lock")
    assert taken.status_code == 200
    assert taken.json()["held_by_me"] is True
    holder = _user_by_mobile("09120000002")
    assert taken.json()["locked_by"] == holder.id


def test_unlock_by_holder_and_manager_force(client: TestClient) -> None:
    member = _member("M-1002")
    desk = TestClient(app)
    manager = TestClient(app)
    _login(desk, "09120000002")
    _login(manager, "09120000001")

    assert desk.post(f"/api/v1/members/{member.id}/lock").status_code == 200
    assert desk.post(f"/api/v1/members/{member.id}/unlock").status_code == 200
    assert desk.get(f"/api/v1/members/{member.id}/lock").json()["locked"] is False

    assert desk.post(f"/api/v1/members/{member.id}/lock").status_code == 200
    # receptionist cannot force-unlock another's lock
    other = TestClient(app)
    _login(other, "09120000002")
    # desk holds; manager force unlocks
    forced = manager.post(f"/api/v1/members/{member.id}/unlock")
    assert forced.status_code == 200
    assert forced.json()["locked"] is False


def test_payment_blocked_when_other_holds_lock(client: TestClient) -> None:
    member = _member("M-1002")
    manager = TestClient(app)
    desk = TestClient(app)
    _login(manager, "09120000001")
    _login(desk, "09120000002")

    assert manager.post(f"/api/v1/members/{member.id}/lock").status_code == 200
    blocked = desk.post(
        "/api/v1/payments",
        json={"member_id": member.id, "amount_toman": 10_000, "method": "cash", "status": "paid"},
    )
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["code"] == "member_file_locked"


def test_renew_blocked_when_other_holds_lock(client: TestClient) -> None:
    seed()
    _clear_locks()
    member = _member("M-1002")
    manager = TestClient(app)
    desk = TestClient(app)
    _login(manager, "09120000001")
    _login(desk, "09120000002")

    plans = manager.get("/api/v1/membership-plans").json()["items"]
    plan_id = plans[0]["id"]

    assert manager.post(f"/api/v1/members/{member.id}/lock").status_code == 200
    blocked = desk.post(
        f"/api/v1/members/{member.id}/memberships/renew",
        json={"plan_id": plan_id, "agreed_amount_toman": 0},
    )
    assert blocked.status_code == 409


def test_patch_member_blocked_when_other_holds_lock(client: TestClient) -> None:
    member = _member()
    manager = TestClient(app)
    desk = TestClient(app)
    _login(manager, "09120000001")
    _login(desk, "09120000002")

    assert manager.post(f"/api/v1/members/{member.id}/lock").status_code == 200
    blocked = desk.patch(
        f"/api/v1/members/{member.id}",
        json={"notes": "should fail"},
    )
    assert blocked.status_code == 409


def test_soft_enforce_allows_without_own_lock(client: TestClient) -> None:
    """No lock held → sensitive op still allowed (soft policy)."""
    member = _member("M-1003")
    _login(client, "09120000001")
    response = client.patch(
        f"/api/v1/members/{member.id}",
        json={"notes": "بدون قفل هم OK"},
    )
    assert response.status_code == 200
    assert response.json()["notes"] == "بدون قفل هم OK"


def test_holder_can_pay_while_holding_lock(client: TestClient) -> None:
    member = _member("M-1002")
    _login(client, "09120000001")
    assert client.post(f"/api/v1/members/{member.id}/lock").status_code == 200
    paid = client.post(
        "/api/v1/payments",
        json={"member_id": member.id, "amount_toman": 5_000, "method": "cash", "status": "paid"},
    )
    assert paid.status_code == 201
