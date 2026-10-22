"""Public trial leads + desk queue + day-guest registration."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.rate_limit import login_rate_limiter, trial_lead_rate_limiter
from app.db.seed import DEV_STAFF_PASSWORD, wipe_and_seed
from app.main import app
from app.models import MembershipPlan
from app.models.enums import MembershipStatus
from app.services.billing import today_tehran
from app.services.guests import GUEST_PLAN_NAME


@pytest.fixture(scope="module", autouse=True)
def _reseed() -> None:
    wipe_and_seed()


@pytest.fixture(autouse=True)
def _reset_limiters() -> None:
    login_rate_limiter.reset()
    trial_lead_rate_limiter.reset()


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


def test_public_trial_lead_without_auth(client: TestClient) -> None:
    response = client.post(
        "/api/v1/public/trial-leads",
        json={
            "full_name": "مینا آزمایشی",
            "mobile": "09123334455",
            "preferred_time_note": "عصر",
            "message": "برای جلسه آزمایشی",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["id"] > 0
    assert "منشی" in body["message"]


def test_public_trial_invalid_mobile(client: TestClient) -> None:
    response = client.post(
        "/api/v1/public/trial-leads",
        json={"full_name": "تست", "mobile": "123"},
    )
    assert response.status_code == 422


def test_queue_requires_auth(client: TestClient) -> None:
    assert client.get("/api/v1/trial-leads").status_code == 401


def test_trainer_forbidden_on_queue_and_guest(client: TestClient) -> None:
    _login(client, "09120000003")
    assert client.get("/api/v1/trial-leads").status_code == 403
    assert (
        client.post(
            "/api/v1/guests",
            json={
                "first_name": "الف",
                "last_name": "ب",
                "mobile": "09129990001",
                "agreed_amount_toman": 1000,
            },
        ).status_code
        == 403
    )


def test_desk_list_and_patch_status(client: TestClient) -> None:
    created = client.post(
        "/api/v1/public/trial-leads",
        json={"full_name": "صف تست", "mobile": "09124445566"},
    )
    assert created.status_code == 201
    lead_id = created.json()["id"]

    _login(client, "09120000002")
    listed = client.get("/api/v1/trial-leads")
    assert listed.status_code == 200
    assert any(i["id"] == lead_id for i in listed.json()["items"])

    patched = client.patch(
        f"/api/v1/trial-leads/{lead_id}",
        json={"status": "contacted"},
    )
    assert patched.status_code == 200
    assert patched.json()["status"] == "contacted"

    filtered = client.get("/api/v1/trial-leads", params={"status": "contacted"})
    assert filtered.status_code == 200
    assert any(i["id"] == lead_id for i in filtered.json()["items"])


def test_day_guest_creates_one_day_membership(client: TestClient) -> None:
    _login(client, "09120000001")
    today = today_tehran()
    response = client.post(
        "/api/v1/guests",
        json={
            "first_name": "مهمان",
            "last_name": "جدید",
            "mobile": "09125556677",
            "agreed_amount_toman": 250_000,
            "payment_method": "cash",
            "pay_now": True,
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["reused_existing_member"] is False
    assert body["membership"]["start_date"] == str(today)
    assert body["membership"]["end_date"] == str(today)
    assert body["membership"]["status"] == MembershipStatus.ACTIVE.value
    assert body["payment"] is not None
    assert body["payment"]["receipt_number"].startswith("R-")
    assert body["member"]["status"] == "active"

    db = SessionLocal()
    try:
        plan = db.scalar(
            select(MembershipPlan).where(MembershipPlan.name == GUEST_PLAN_NAME)
        )
        assert plan is not None
        assert body["membership"]["plan_id"] == plan.id
    finally:
        db.close()


def test_day_guest_reuses_existing_mobile(client: TestClient) -> None:
    _login(client, "09120000002")
    # Seed guest M-1009
    first = client.post(
        "/api/v1/guests",
        json={
            "first_name": "مهمان",
            "last_name": "روزانه",
            "mobile": "09121111009",
            "agreed_amount_toman": 250_000,
            "pay_now": True,
        },
    )
    assert first.status_code == 201
    assert first.json()["reused_existing_member"] is True
    member_id = first.json()["member"]["id"]
    membership_id = first.json()["membership"]["id"]

    second = client.post(
        "/api/v1/guests",
        json={
            "first_name": "دیگر",
            "last_name": "نام",
            "mobile": "09121111009",
            "agreed_amount_toman": 0,
            "pay_now": False,
        },
    )
    assert second.status_code == 201
    assert second.json()["reused_existing_member"] is True
    assert second.json()["member"]["id"] == member_id
    assert second.json()["membership"]["id"] != membership_id
    assert second.json()["payment"] is None


def test_guest_without_auth_401(client: TestClient) -> None:
    assert (
        client.post(
            "/api/v1/guests",
            json={
                "first_name": "الف",
                "last_name": "ب",
                "mobile": "09129998877",
                "agreed_amount_toman": 0,
            },
        ).status_code
        == 401
    )
