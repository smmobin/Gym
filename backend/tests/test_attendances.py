"""Attendance check-in/out rules."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.rate_limit import login_rate_limiter
from app.db.seed import DEV_STAFF_PASSWORD, wipe_and_seed
from app.main import app
from app.models import Attendance, Member, Membership
from app.models.enums import MembershipStatus


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


def _close_open_for(member_id: int) -> None:
    db = SessionLocal()
    try:
        for row in db.scalars(
            select(Attendance).where(
                Attendance.member_id == member_id,
                Attendance.check_out_at.is_(None),
            )
        ).all():
            from datetime import datetime, timezone

            row.check_out_at = datetime.now(tz=timezone.utc)
        db.commit()
    finally:
        db.close()


def test_check_in_unauthorized(client: TestClient) -> None:
    assert (
        client.post(
            "/api/v1/attendances/check-in",
            json={"member_id": 1, "attendance_type": "gym"},
        ).status_code
        == 401
    )


def test_check_in_success_gym(client: TestClient) -> None:
    _login(client)
    ali = _member_id("M-1001")
    _close_open_for(ali)
    # Close any today visits by using a fresh member without prior today — elham gift
    elham = _member_id("M-1008")
    _close_open_for(elham)
    response = client.post(
        "/api/v1/attendances/check-in",
        json={"member_id": elham, "attendance_type": "gym"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["attendance"]["is_open"] is True
    assert body["attendance"]["attendance_type"] == "gym"
    # checkout
    aid = body["attendance"]["id"]
    out = client.post(f"/api/v1/attendances/{aid}/check-out")
    assert out.status_code == 200
    assert out.json()["attendance"]["is_open"] is False


def test_expired_membership_blocked(client: TestClient) -> None:
    _login(client)
    mohammad = _member_id("M-1003")
    _close_open_for(mohammad)
    response = client.post(
        "/api/v1/attendances/check-in",
        json={"member_id": mohammad, "attendance_type": "gym"},
    )
    assert response.status_code == 409
    assert "معتبر" in response.json()["detail"] or "منقضی" in response.json()["detail"]


def test_debt_allows_checkin_with_warning(client: TestClient) -> None:
    _login(client)
    hosein = _member_id("M-1005")
    _close_open_for(hosein)
    response = client.post(
        "/api/v1/attendances/check-in",
        json={"member_id": hosein, "attendance_type": "gym"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["debt_toman"] > 0
    assert body["debt_warning"]
    assert "بدهی" in body["debt_warning"]
    client.post(f"/api/v1/attendances/{body['attendance']['id']}/check-out")


def test_second_visit_needs_confirm(client: TestClient) -> None:
    _login(client)
    # Sara has a duration (non-session) plan suitable for gym check-in
    sara = _member_id("M-1002")
    _close_open_for(sara)

    first = client.post(
        "/api/v1/attendances/check-in",
        json={"member_id": sara, "attendance_type": "gym"},
    )
    assert first.status_code == 201
    client.post(f"/api/v1/attendances/{first.json()['attendance']['id']}/check-out")

    second = client.post(
        "/api/v1/attendances/check-in",
        json={"member_id": sara, "attendance_type": "gym"},
    )
    assert second.status_code == 409
    assert "ورود دوم" in second.json()["detail"]

    confirmed = client.post(
        "/api/v1/attendances/check-in",
        json={
            "member_id": sara,
            "attendance_type": "gym",
            "confirm_second_visit": True,
        },
    )
    assert confirmed.status_code == 201
    client.post(f"/api/v1/attendances/{confirmed.json()['attendance']['id']}/check-out")


def test_pt_decrements_sessions(client: TestClient) -> None:
    _login(client)
    negar = _member_id("M-1004")
    _close_open_for(negar)

    db = SessionLocal()
    try:
        m = db.scalar(
            select(Membership).where(
                Membership.member_id == negar,
                Membership.status == MembershipStatus.ACTIVE.value,
            )
        )
        assert m is not None
        before = m.sessions_remaining
        assert before is not None and before > 0
        mid = m.id
    finally:
        db.close()

    response = client.post(
        "/api/v1/attendances/check-in",
        json={
            "member_id": negar,
            "attendance_type": "pt",
            "membership_id": mid,
            "confirm_second_visit": True,
        },
    )
    assert response.status_code == 201
    assert response.json()["sessions_remaining"] == before - 1

    db = SessionLocal()
    try:
        m = db.get(Membership, mid)
        assert m is not None
        assert m.sessions_remaining == before - 1
    finally:
        db.close()

    client.post(f"/api/v1/attendances/{response.json()['attendance']['id']}/check-out")


def test_trainer_forbidden_on_non_trainee(client: TestClient) -> None:
    _login(client, "09120000003")
    sara = _member_id("M-1002")
    response = client.post(
        "/api/v1/attendances/check-in",
        json={"member_id": sara, "attendance_type": "gym"},
    )
    assert response.status_code == 403


def test_trainer_can_checkin_trainee(client: TestClient) -> None:
    _login(client, "09120000003")
    ali = _member_id("M-1001")
    _close_open_for(ali)
    response = client.post(
        "/api/v1/attendances/check-in",
        json={
            "member_id": ali,
            "attendance_type": "gym",
            "confirm_second_visit": True,
        },
    )
    assert response.status_code == 201
    client.post(f"/api/v1/attendances/{response.json()['attendance']['id']}/check-out")


def test_today_list(client: TestClient) -> None:
    _login(client)
    response = client.get("/api/v1/attendances/today")
    assert response.status_code == 200
    assert "items" in response.json()
