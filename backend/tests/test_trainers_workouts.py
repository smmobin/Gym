"""Trainer assignment + workout plan access rules."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.rate_limit import login_rate_limiter
from app.db.seed import DEV_STAFF_PASSWORD, wipe_and_seed
from app.main import app
from app.models import Member, TrainerMemberAssignment, User
from app.models.enums import StaffRole


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


def _trainer_user_id(mobile: str = "09120000003") -> int:
    db = SessionLocal()
    try:
        u = db.scalar(select(User).where(User.mobile == mobile))
        assert u is not None
        return u.id
    finally:
        db.close()


def _active_assignment_id(member_id: int, trainer_user_id: int) -> int | None:
    db = SessionLocal()
    try:
        row = db.scalar(
            select(TrainerMemberAssignment).where(
                TrainerMemberAssignment.member_id == member_id,
                TrainerMemberAssignment.trainer_user_id == trainer_user_id,
                TrainerMemberAssignment.ended_at.is_(None),
            )
        )
        return row.id if row else None
    finally:
        db.close()


def test_list_trainers_unauthorized(client: TestClient) -> None:
    assert client.get("/api/v1/trainers").status_code == 401


def test_trainer_cannot_list_or_assign(client: TestClient) -> None:
    _login(client, "09120000003")
    assert client.get("/api/v1/trainers").status_code == 403
    member_id = _member_id("M-1005")
    trainer_id = _trainer_user_id("09120000004")
    assert (
        client.post(
            f"/api/v1/members/{member_id}/trainers",
            json={"trainer_user_id": trainer_id},
        ).status_code
        == 403
    )


def test_desk_lists_active_trainers(client: TestClient) -> None:
    _login(client)
    response = client.get("/api/v1/trainers")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 2
    mobiles = {t["mobile"] for t in data["items"]}
    assert "09120000003" in mobiles
    assert "09120000004" in mobiles
    for item in data["items"]:
        assert "password_hash" not in item
        assert item["is_active"] is True


def test_desk_lists_members_for_selected_trainer(client: TestClient) -> None:
    _login(client)
    trainer_id = _trainer_user_id("09120000003")
    response = client.get(f"/api/v1/trainers/{trainer_id}/members")
    assert response.status_code == 200
    data = response.json()
    assert data["trainer_user_id"] == trainer_id
    assert data["total"] >= 1
    display_ids = {m["member_display_id"] for m in data["items"]}
    # seed: trainer1 → ali (M-1001), negar (M-1004)
    assert "M-1001" in display_ids or "M-1004" in display_ids
    for item in data["items"]:
        assert item["is_active"] is True
        assert item["member_first_name"]
        assert item["member_mobile"]


def test_trainer_cannot_list_trainer_members_endpoint(client: TestClient) -> None:
    _login(client, "09120000003")
    trainer_id = _trainer_user_id("09120000003")
    assert client.get(f"/api/v1/trainers/{trainer_id}/members").status_code == 403


def test_assign_duplicate_active_409_then_end_and_reassign(client: TestClient) -> None:
    _login(client)
    member_id = _member_id("M-1006")  # maryam — no seed trainer
    trainer_id = _trainer_user_id("09120000003")

    first = client.post(
        f"/api/v1/members/{member_id}/trainers",
        json={"trainer_user_id": trainer_id},
    )
    assert first.status_code == 201
    assignment_id = first.json()["assignment"]["id"]
    assert first.json()["assignment"]["is_active"] is True

    dup = client.post(
        f"/api/v1/members/{member_id}/trainers",
        json={"trainer_user_id": trainer_id},
    )
    assert dup.status_code == 409

    # Second trainer OK (multi-trainer)
    other = client.post(
        f"/api/v1/members/{member_id}/trainers",
        json={"trainer_user_id": _trainer_user_id("09120000004")},
    )
    assert other.status_code == 201

    ended = client.post(
        f"/api/v1/members/{member_id}/trainers/{assignment_id}/end"
    )
    assert ended.status_code == 200
    assert ended.json()["assignment"]["ended_at"] is not None
    assert ended.json()["assignment"]["is_active"] is False

    again = client.post(
        f"/api/v1/members/{member_id}/trainers",
        json={"trainer_user_id": trainer_id},
    )
    assert again.status_code == 201
    assert again.json()["assignment"]["id"] != assignment_id


def test_receptionist_can_assign(client: TestClient) -> None:
    _login(client, "09120000002")
    member_id = _member_id("M-1008")  # elham
    trainer_id = _trainer_user_id("09120000004")
    # end if already active from prior tests in same DB — assign fresh
    existing = _active_assignment_id(member_id, trainer_id)
    if existing:
        client.post(f"/api/v1/members/{member_id}/trainers/{existing}/end")
    response = client.post(
        f"/api/v1/members/{member_id}/trainers",
        json={"trainer_user_id": trainer_id},
    )
    assert response.status_code == 201


def test_trainer_sees_only_own_trainees_in_members(client: TestClient) -> None:
    _login(client, "09120000003")
    response = client.get("/api/v1/members")
    assert response.status_code == 200
    ids = {m["display_id"] for m in response.json()["items"]}
    # seed: trainer1 → negar (M-1004), ali (M-1001); Maryam may be added by other tests
    assert "M-1001" in ids
    assert "M-1004" in ids
    assert "M-1009" not in ids  # guest not assigned


def test_workout_trainer_own_ok_other_403(client: TestClient) -> None:
    _login(client, "09120000003")
    negar_id = _member_id("M-1004")
    listed = client.get(f"/api/v1/members/{negar_id}/workout-plans")
    assert listed.status_code == 200
    assert listed.json()["total"] >= 1

    created = client.post(
        f"/api/v1/members/{negar_id}/workout-plans",
        json={"title": "برنامه تست", "body": "اسکات ۳×۸"},
    )
    assert created.status_code == 201
    plan_id = created.json()["id"]

    patched = client.patch(
        f"/api/v1/workout-plans/{plan_id}",
        json={"title": "برنامه تست ویرایش", "body": "اسکات ۴×۸"},
    )
    assert patched.status_code == 200
    assert patched.json()["title"] == "برنامه تست ویرایش"

    # Member without active assignment to this trainer (guest)
    guest_id = _member_id("M-1009")
    assert (
        client.get(f"/api/v1/members/{guest_id}/workout-plans").status_code == 403
    )
    assert (
        client.post(
            f"/api/v1/members/{guest_id}/workout-plans",
            json={"title": "ممنوع"},
        ).status_code
        == 403
    )


def test_manager_can_write_any_plan(client: TestClient) -> None:
    _login(client)
    guest_id = _member_id("M-1009")
    created = client.post(
        f"/api/v1/members/{guest_id}/workout-plans",
        json={"title": "برنامه مدیر", "body": "پیاده‌روی"},
    )
    assert created.status_code == 201
    db = SessionLocal()
    try:
        mgr = db.scalar(select(User).where(User.mobile == "09120000001"))
        assert mgr is not None
        assert created.json()["trainer_user_id"] == mgr.id
    finally:
        db.close()


def test_receptionist_read_ok_write_forbidden(client: TestClient) -> None:
    _login(client, "09120000002")
    negar_id = _member_id("M-1004")
    assert client.get(f"/api/v1/members/{negar_id}/workout-plans").status_code == 200
    assert (
        client.post(
            f"/api/v1/members/{negar_id}/workout-plans",
            json={"title": "منشی نباید"},
        ).status_code
        == 403
    )


def test_workout_unauthorized(client: TestClient) -> None:
    member_id = _member_id("M-1004")
    assert client.get(f"/api/v1/members/{member_id}/workout-plans").status_code == 401


def test_assign_non_trainer_user_400(client: TestClient) -> None:
    _login(client)
    member_id = _member_id("M-1007")
    db = SessionLocal()
    try:
        mgr = db.scalar(
            select(User).where(
                User.mobile == "09120000001",
                User.role == StaffRole.MANAGER.value,
            )
        )
        assert mgr is not None
        mgr_id = mgr.id
    finally:
        db.close()
    response = client.post(
        f"/api/v1/members/{member_id}/trainers",
        json={"trainer_user_id": mgr_id},
    )
    assert response.status_code == 400
