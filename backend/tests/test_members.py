"""Members API: list/create/detail/patch/archive + role gates."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.rate_limit import login_rate_limiter
from app.db.seed import DEV_STAFF_PASSWORD, wipe_and_seed
from app.main import app
from app.models import Member
from app.services.members import next_display_id


@pytest.fixture(scope="module", autouse=True)
def _reseed_members_module() -> None:
    """Clean known seed state once for this module (archive/create mutate DB)."""
    wipe_and_seed()


@pytest.fixture(autouse=True)
def _reset_login_limiter() -> None:
    login_rate_limiter.reset()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _login(client: TestClient, mobile: str = "09120000001") -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"mobile": mobile, "password": DEV_STAFF_PASSWORD},
    )
    assert response.status_code == 200


def test_list_members_unauthorized(client: TestClient) -> None:
    assert client.get("/api/v1/members").status_code == 401


def test_list_members_as_manager_hides_archived_by_default(client: TestClient) -> None:
    _login(client, "09120000001")
    members = client.get("/api/v1/members").json()["items"]
    assert len(members) >= 8
    assert all(m.get("role") == "athlete" for m in members)
    assert "has_active_membership" in members[0]
    assert "can_receive_locker" in members[0]
    ali = next(m for m in members if m["display_id"] == "M-1001")
    assert ali["has_active_membership"] is True
    assert ali["can_receive_locker"] is False  # seed: علی بدون includes_locker
    sara = next(m for m in members if m["display_id"] == "M-1002")
    assert sara["can_receive_locker"] is True  # seed: سارا با طرح شامل‌کمد

    created = client.post(
        "/api/v1/members",
        json={
            "first_name": "آرشیو",
            "last_name": "موقت",
            "mobile": "09129999111",
        },
    )
    assert created.status_code == 201
    target_id = created.json()["id"]

    archived = client.post(f"/api/v1/members/{target_id}/archive")
    assert archived.status_code == 200
    assert archived.json()["status"] == "archived"

    listed = client.get("/api/v1/members").json()["items"]
    assert all(m["status"] != "archived" for m in listed)
    assert all(m["id"] != target_id for m in listed)

    with_archived = client.get("/api/v1/members", params={"include_archived": True}).json()[
        "items"
    ]
    assert any(m["id"] == target_id for m in with_archived)


def test_create_member_pending_and_next_display_id(client: TestClient) -> None:
    _login(client, "09120000002")
    db = SessionLocal()
    try:
        expected = next_display_id(db)
    finally:
        db.close()

    response = client.post(
        "/api/v1/members",
        json={
            "first_name": "نیما",
            "last_name": "تستی",
            "mobile": "09129999099",
            "notes": "عضو تست API",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["display_id"] == expected
    assert body["status"] == "pending"
    assert body["mobile"] == "09129999099"


def test_create_duplicate_mobile_conflict(client: TestClient) -> None:
    _login(client, "09120000001")
    response = client.post(
        "/api/v1/members",
        json={
            "first_name": "تکراری",
            "last_name": "موبایل",
            "mobile": "09121111001",  # seed Ali
        },
    )
    assert response.status_code == 409
    assert "موبایل" in response.json()["detail"]


def test_trainer_cannot_create_member(client: TestClient) -> None:
    _login(client, "09120000003")
    response = client.post(
        "/api/v1/members",
        json={
            "first_name": "ممنوع",
            "last_name": "برای مربی",
            "mobile": "09128887766",
        },
    )
    assert response.status_code == 403


def test_trainer_sees_only_assigned_trainees(client: TestClient) -> None:
    _login(client, "09120000003")
    items = client.get("/api/v1/members").json()["items"]
    # seed: trainer1 → negar (M-1004) and ali (M-1001)
    display_ids = {m["display_id"] for m in items}
    assert "M-1001" in display_ids
    assert "M-1004" in display_ids
    assert "M-1002" not in display_ids  # sara not assigned


def test_trainer_cannot_view_unassigned_detail(client: TestClient) -> None:
    _login(client, "09120000001")
    sara = next(
        m for m in client.get("/api/v1/members").json()["items"] if m["display_id"] == "M-1002"
    )
    client.post("/api/v1/auth/logout")
    _login(client, "09120000003")
    assert client.get(f"/api/v1/members/{sara['id']}").status_code == 403


def test_patch_member_as_receptionist(client: TestClient) -> None:
    _login(client, "09120000002")
    member = client.get("/api/v1/members").json()["items"][0]
    response = client.patch(
        f"/api/v1/members/{member['id']}",
        json={"notes": "یادداشت ویرایش‌شده تست"},
    )
    assert response.status_code == 200
    assert response.json()["notes"] == "یادداشت ویرایش‌شده تست"


def test_trainer_cannot_archive(client: TestClient) -> None:
    _login(client, "09120000003")
    items = client.get("/api/v1/members").json()["items"]
    assert items
    assert client.post(f"/api/v1/members/{items[0]['id']}/archive").status_code == 403


def test_get_member_detail(client: TestClient) -> None:
    _login(client, "09120000001")
    listed = client.get("/api/v1/members").json()["items"][0]
    detail = client.get(f"/api/v1/members/{listed['id']}")
    assert detail.status_code == 200
    assert detail.json()["display_id"] == listed["display_id"]


def test_next_display_id_continues_after_seed() -> None:
    db = SessionLocal()
    try:
        # After seed highest is M-1009 (may be higher if prior tests created members)
        nxt = next_display_id(db)
        assert nxt.startswith("M-")
        n = int(nxt.split("-")[1])
        assert n >= 1010
        members = db.scalars(select(Member)).all()
        assert all(m.display_id != nxt for m in members)
    finally:
        db.close()
