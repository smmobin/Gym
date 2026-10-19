"""Billing: renew dates, payments, refund, debt, roles, audit, receipts."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.rate_limit import login_rate_limiter
from app.db.seed import DEV_STAFF_PASSWORD, seed
from app.main import app
from app.models import AuditLog, Member, Membership, MembershipPlan, Payment
from app.models.enums import MembershipStatus, PaymentStatus
from app.services.billing import renew_start_date


@pytest.fixture(scope="module", autouse=True)
def _reseed() -> None:
    seed()


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


def _member(display_id: str) -> Member:
    db = SessionLocal()
    try:
        m = db.scalar(select(Member).where(Member.display_id == display_id))
        assert m is not None
        db.expunge(m)
        return m
    finally:
        db.close()


def _active_plan_id() -> int:
    db = SessionLocal()
    try:
        plan = db.scalar(
            select(MembershipPlan).where(
                MembershipPlan.is_active.is_(True),
                MembershipPlan.duration_days.is_not(None),
            )
        )
        assert plan is not None
        return plan.id
    finally:
        db.close()


def test_renew_start_date_policy() -> None:
    today = date(2026, 10, 19)
    base = Membership(
        member_id=1,
        plan_id=1,
        agreed_amount_toman=0,
        start_date=today - timedelta(days=10),
        end_date=today + timedelta(days=20),
        status=MembershipStatus.ACTIVE.value,
    )
    assert renew_start_date(base=base, today=today) == base.end_date

    expired = Membership(
        member_id=1,
        plan_id=1,
        agreed_amount_toman=0,
        start_date=today - timedelta(days=40),
        end_date=today - timedelta(days=5),
        status=MembershipStatus.EXPIRED.value,
    )
    assert renew_start_date(base=expired, today=today) == today
    assert renew_start_date(base=None, today=today) == today


def test_plans_and_finance_unauthorized(client: TestClient) -> None:
    assert client.get("/api/v1/membership-plans").status_code == 401
    assert (
        client.post(
            "/api/v1/payments",
            json={"member_id": 1, "amount_toman": 1000, "method": "cash"},
        ).status_code
        == 401
    )


def test_trainer_forbidden_on_finance(client: TestClient) -> None:
    _login(client, "09120000003")
    assert client.get("/api/v1/membership-plans").status_code == 403
    ali = _member("M-1001")
    assert client.get(f"/api/v1/members/{ali.id}/memberships").status_code == 403
    assert (
        client.post(
            "/api/v1/payments",
            json={"member_id": ali.id, "amount_toman": 1000, "method": "cash"},
        ).status_code
        == 403
    )


def test_list_active_plans(client: TestClient) -> None:
    _login(client)
    response = client.get("/api/v1/membership-plans")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1
    assert all(p["is_active"] for p in body["items"])


def test_renew_from_current_end_date(client: TestClient) -> None:
    seed()
    _login(client)
    sara = _member("M-1002")
    db = SessionLocal()
    try:
        base = db.scalar(
            select(Membership)
            .where(Membership.member_id == sara.id)
            .order_by(Membership.end_date.desc())
        )
        assert base is not None
        base_end = base.end_date
        base_id = base.id
        plan_id = base.plan_id
    finally:
        db.close()

    response = client.post(
        f"/api/v1/members/{sara.id}/memberships/renew",
        json={
            "plan_id": plan_id,
            "agreed_amount_toman": 3_500_000,
            "base_membership_id": base_id,
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["membership"]["start_date"] == base_end.isoformat()
    assert body["membership"]["agreed_amount_toman"] == 3_500_000
    assert body["base_membership_id"] == base_id

    db = SessionLocal()
    try:
        audit = db.scalar(
            select(AuditLog)
            .where(AuditLog.action == "membership.renew")
            .order_by(AuditLog.id.desc())
        )
        assert audit is not None
        assert audit.entity_type == "membership"
    finally:
        db.close()


def test_renew_rejects_negative_agreed(client: TestClient) -> None:
    _login(client)
    ali = _member("M-1001")
    plan_id = _active_plan_id()
    response = client.post(
        f"/api/v1/members/{ali.id}/memberships/renew",
        json={"plan_id": plan_id, "agreed_amount_toman": -1},
    )
    assert response.status_code == 422


def test_partial_payment_updates_debt(client: TestClient) -> None:
    seed()
    _login(client)
    hosein = _member("M-1005")
    before = client.get(f"/api/v1/members/{hosein.id}/memberships")
    assert before.status_code == 200
    debt_before = before.json()["debt_toman"]
    assert debt_before == 1_500_000

    memberships = before.json()["items"]
    mid = memberships[0]["id"]

    pay = client.post(
        "/api/v1/payments",
        json={
            "member_id": hosein.id,
            "membership_id": mid,
            "amount_toman": 500_000,
            "method": "cash",
            "status": "paid",
        },
    )
    assert pay.status_code == 201, pay.text
    body = pay.json()
    assert body["debt_toman"] == debt_before - 500_000
    assert body["payment"]["receipt_number"].startswith("R-")
    assert body["payment"]["amount_toman"] == 500_000

    after = client.get(f"/api/v1/members/{hosein.id}/payments")
    assert after.status_code == 200
    assert after.json()["debt_toman"] == debt_before - 500_000


def test_refund_keeps_amount_and_writes_audit(client: TestClient) -> None:
    seed()
    _login(client)
    maryam = _member("M-1006")
    payments = client.get(f"/api/v1/members/{maryam.id}/payments").json()["items"]
    paid = next(p for p in payments if p["status"] == "paid")
    original_amount = paid["amount_toman"]
    receipt = paid["receipt_number"]

    response = client.post(f"/api/v1/payments/{paid['id']}/refund")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["payment"]["status"] == "refunded"
    assert body["payment"]["amount_toman"] == original_amount
    assert body["payment"]["receipt_number"] == receipt

    db = SessionLocal()
    try:
        row = db.get(Payment, paid["id"])
        assert row is not None
        assert row.amount_toman == original_amount
        assert row.status == PaymentStatus.REFUNDED.value
        audit = db.scalar(
            select(AuditLog)
            .where(AuditLog.action == "payment.refund")
            .order_by(AuditLog.id.desc())
        )
        assert audit is not None
        assert audit.entity_id == str(paid["id"])
    finally:
        db.close()


def test_receipt_numbers_unique(client: TestClient) -> None:
    seed()
    _login(client)
    elham = _member("M-1008")
    r1 = client.post(
        "/api/v1/payments",
        json={"member_id": elham.id, "amount_toman": 10_000, "method": "pos"},
    )
    r2 = client.post(
        "/api/v1/payments",
        json={"member_id": elham.id, "amount_toman": 20_000, "method": "transfer"},
    )
    assert r1.status_code == 201 and r2.status_code == 201
    a = r1.json()["payment"]["receipt_number"]
    b = r2.json()["payment"]["receipt_number"]
    assert a != b
    assert a.startswith("R-") and b.startswith("R-")


def test_online_method_without_gateway(client: TestClient) -> None:
    seed()
    _login(client)
    elham = _member("M-1008")
    response = client.post(
        "/api/v1/payments",
        json={
            "member_id": elham.id,
            "amount_toman": 50_000,
            "method": "online",
            "status": "paid",
            "note": "بدون درگاه — ثبت دستی",
        },
    )
    assert response.status_code == 201
    assert response.json()["payment"]["method"] == "online"


def test_cancel_membership(client: TestClient) -> None:
    seed()
    _login(client)
    reza = _member("M-1007")
    memberships = client.get(f"/api/v1/members/{reza.id}/memberships").json()["items"]
    mid = memberships[0]["id"]
    response = client.post(f"/api/v1/memberships/{mid}/cancel")
    assert response.status_code == 200
    assert response.json()["membership"]["status"] == "cancelled"
