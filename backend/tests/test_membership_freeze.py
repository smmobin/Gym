"""Membership freeze / unfreeze: cap, end_date, roles, check-in block."""

from __future__ import annotations

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.rate_limit import login_rate_limiter
from app.db.seed import DEV_STAFF_PASSWORD, wipe_and_seed
from app.main import app
from app.models import Attendance, AuditLog, Member, Membership
from app.models.enums import MembershipStatus
from app.services.billing import today_tehran
from app.services.gym_settings import get_or_create_settings


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


def _ali_active_membership() -> Membership:
    db = SessionLocal()
    try:
        member = db.scalar(select(Member).where(Member.display_id == "M-1001"))
        assert member is not None
        row = db.scalar(
            select(Membership)
            .where(
                Membership.member_id == member.id,
                Membership.status == MembershipStatus.ACTIVE.value,
            )
            .order_by(Membership.end_date.desc())
        )
        assert row is not None
        # reset freeze fields for isolation across tests in module
        row.status = MembershipStatus.ACTIVE.value
        row.freeze_started_at = None
        row.freeze_ends_at = None
        row.freeze_days_used = 0
        # ensure still covering today
        today = today_tehran()
        if row.end_date < today:
            row.end_date = today + timedelta(days=20)
        if row.start_date > today:
            row.start_date = today - timedelta(days=5)
        db.commit()
        db.refresh(row)
        db.expunge(row)
        return row
    finally:
        db.close()


def _reset_member_freeze_usage(member_id: int) -> None:
    db = SessionLocal()
    try:
        for m in db.scalars(select(Membership).where(Membership.member_id == member_id)).all():
            if m.status == MembershipStatus.FROZEN.value:
                m.status = MembershipStatus.ACTIVE.value
            m.freeze_started_at = None
            m.freeze_ends_at = None
            m.freeze_days_used = 0
        db.commit()
    finally:
        db.close()


def test_freeze_extends_end_date_and_sets_frozen(client: TestClient) -> None:
    _login(client)
    m = _ali_active_membership()
    _reset_member_freeze_usage(m.member_id)
    m = _ali_active_membership()
    before_end = m.end_date

    res = client.post(f"/api/v1/memberships/{m.id}/freeze", json={"days": 5})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["membership"]["status"] == "frozen"
    assert body["membership"]["freeze_days_used"] == 5
    assert body["remaining_freeze_days_this_year"] == 9  # cap 14 - 5
    assert body["membership"]["end_date"] == (before_end + timedelta(days=5)).isoformat()

    db = SessionLocal()
    try:
        audit = db.scalar(
            select(AuditLog)
            .where(AuditLog.action == "membership.freeze")
            .order_by(AuditLog.id.desc())
        )
        assert audit is not None
    finally:
        db.close()


def test_freeze_over_cap_rejected(client: TestClient) -> None:
    _login(client)
    m = _ali_active_membership()
    _reset_member_freeze_usage(m.member_id)
    m = _ali_active_membership()

    db = SessionLocal()
    try:
        settings = get_or_create_settings(db)
        settings.freeze_annual_cap_days = 14
        db.commit()
    finally:
        db.close()

    assert (
        client.post(f"/api/v1/memberships/{m.id}/freeze", json={"days": 10}).status_code
        == 200
    )
    # second freeze while already frozen → 409 already
    again = client.post(f"/api/v1/memberships/{m.id}/freeze", json={"days": 1})
    assert again.status_code == 409

    # Simulate a fully consumed prior freeze (keep used=10, clear window)
    db = SessionLocal()
    try:
        row = db.get(Membership, m.id)
        assert row is not None
        row.status = MembershipStatus.ACTIVE.value
        row.freeze_started_at = None
        row.freeze_ends_at = None
        row.freeze_days_used = 10
        db.commit()
    finally:
        db.close()

    over = client.post(f"/api/v1/memberships/{m.id}/freeze", json={"days": 5})
    assert over.status_code == 409
    assert "سقف" in over.json()["detail"]


def test_early_unfreeze_returns_unused_days(client: TestClient) -> None:
    _login(client)
    m = _ali_active_membership()
    _reset_member_freeze_usage(m.member_id)
    m = _ali_active_membership()
    original_end = m.end_date

    assert client.post(f"/api/v1/memberships/{m.id}/freeze", json={"days": 7}).status_code == 200

    res = client.post(f"/api/v1/memberships/{m.id}/unfreeze")
    assert res.status_code == 200
    body = res.json()["membership"]
    assert body["status"] == "active"
    # unused = 7 (same day unfreeze before any freeze day consumed past start)
    # end_date back to original; used counter 0
    assert body["end_date"] == original_end.isoformat()
    assert body["freeze_days_used"] == 0
    assert body["freeze_started_at"] is None


def test_freeze_cancelled_or_expired_rejected(client: TestClient) -> None:
    _login(client)
    m = _ali_active_membership()
    _reset_member_freeze_usage(m.member_id)

    db = SessionLocal()
    try:
        row = db.get(Membership, m.id)
        assert row is not None
        row.status = MembershipStatus.CANCELLED.value
        db.commit()
    finally:
        db.close()

    res = client.post(f"/api/v1/memberships/{m.id}/freeze", json={"days": 2})
    assert res.status_code == 409

    db = SessionLocal()
    try:
        row = db.get(Membership, m.id)
        assert row is not None
        row.status = MembershipStatus.ACTIVE.value
        row.end_date = today_tehran() - timedelta(days=1)
        db.commit()
        mid = row.id
    finally:
        db.close()

    res2 = client.post(f"/api/v1/memberships/{mid}/freeze", json={"days": 2})
    assert res2.status_code == 409


def test_checkin_blocked_on_frozen_membership(client: TestClient) -> None:
    _login(client)
    m = _ali_active_membership()
    _reset_member_freeze_usage(m.member_id)
    m = _ali_active_membership()

    assert client.post(f"/api/v1/memberships/{m.id}/freeze", json={"days": 3}).status_code == 200

    # clear any open attendance for ali
    db = SessionLocal()
    try:
        for att in db.scalars(select(Attendance).where(Attendance.member_id == m.member_id)).all():
            db.delete(att)
        db.commit()
    finally:
        db.close()

    res = client.post(
        "/api/v1/attendances/check-in",
        json={
            "member_id": m.member_id,
            "attendance_type": "gym",
            "membership_id": m.id,
        },
    )
    assert res.status_code == 409
    assert "توقف" in res.json()["detail"] or "freeze" in res.json()["detail"].lower()


def test_trainer_forbidden_freeze(client: TestClient) -> None:
    _login(client, mobile="09120000003")
    m = _ali_active_membership()
    res = client.post(f"/api/v1/memberships/{m.id}/freeze", json={"days": 1})
    assert res.status_code == 403


def test_unauthenticated_freeze_401(client: TestClient) -> None:
    m = _ali_active_membership()
    res = client.post(f"/api/v1/memberships/{m.id}/freeze", json={"days": 1})
    assert res.status_code == 401


def test_list_memberships_includes_freeze_cap(client: TestClient) -> None:
    _login(client)
    m = _ali_active_membership()
    _reset_member_freeze_usage(m.member_id)
    res = client.get(f"/api/v1/members/{m.member_id}/memberships")
    assert res.status_code == 200
    body = res.json()
    assert body["freeze_annual_cap_days"] == 14
    assert body["remaining_freeze_days_this_year"] == 14
    assert "freeze_days_used" in body["items"][0]
