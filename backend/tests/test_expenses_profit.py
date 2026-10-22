"""Manager expenses + profit report: roles, paid-only income, no refunds."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.rate_limit import login_rate_limiter
from app.db.seed import DEV_STAFF_PASSWORD, wipe_and_seed
from app.main import app
from app.models import Member, Payment
from app.models.enums import PaymentMethod, PaymentStatus
from app.services.reports import default_month_range, today_tehran


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


def test_unauthorized(client: TestClient) -> None:
    assert client.get("/api/v1/expenses").status_code == 401
    assert client.get("/api/v1/reports/profit").status_code == 401
    assert (
        client.post(
            "/api/v1/expenses",
            json={
                "category": "other",
                "amount_toman": 1000,
                "expense_date": "2026-10-01",
            },
        ).status_code
        == 401
    )


def test_receptionist_and_trainer_forbidden(client: TestClient) -> None:
    for mobile in ("09120000002", "09120000003"):
        c = TestClient(app)
        _login(c, mobile)
        assert c.get("/api/v1/expenses").status_code == 403
        assert c.get("/api/v1/reports/profit").status_code == 403
        assert (
            c.post(
                "/api/v1/expenses",
                json={
                    "category": "rent",
                    "amount_toman": 1000,
                    "expense_date": str(today_tehran()),
                },
            ).status_code
            == 403
        )


def test_manager_create_and_list(client: TestClient) -> None:
    _login(client)
    today = today_tehran()
    created = client.post(
        "/api/v1/expenses",
        json={
            "category": "other",
            "amount_toman": 77_000,
            "expense_date": str(today),
            "note": "تست گزارش",
        },
    )
    assert created.status_code == 201
    body = created.json()
    assert body["amount_toman"] == 77_000
    assert body["category"] == "other"
    assert body["created_by_user_id"] is not None

    listed = client.get("/api/v1/expenses", params={"from": str(today), "to": str(today)})
    assert listed.status_code == 200
    data = listed.json()
    assert data["from"] == str(today)
    assert any(i["id"] == body["id"] for i in data["items"])
    assert data["expenses_toman"] >= 77_000


def test_expense_categories_defaults_and_custom(client: TestClient) -> None:
    _login(client)
    cats = client.get("/api/v1/expenses/categories")
    assert cats.status_code == 200
    values = [i["value"] for i in cats.json()["items"]]
    assert values[:5] == ["rent", "salary", "purchase", "utilities", "other"]

    # Persian label for a default → stored as enum value
    fa = client.post(
        "/api/v1/expenses",
        json={
            "category": "اجاره",
            "amount_toman": 1000,
            "expense_date": str(today_tehran()),
        },
    )
    assert fa.status_code == 201
    assert fa.json()["category"] == "rent"

    # Brand-new category is accepted and appears in the list
    custom = client.post(
        "/api/v1/expenses",
        json={
            "category": "تعمیرات",
            "amount_toman": 2500,
            "expense_date": str(today_tehran()),
        },
    )
    assert custom.status_code == 201
    assert custom.json()["category"] == "تعمیرات"
    again = client.get("/api/v1/expenses/categories").json()["items"]
    assert any(i["value"] == "تعمیرات" for i in again)


def test_negative_amount_rejected(client: TestClient) -> None:
    _login(client)
    response = client.post(
        "/api/v1/expenses",
        json={
            "category": "rent",
            "amount_toman": -1,
            "expense_date": str(today_tehran()),
        },
    )
    assert response.status_code == 422


def test_profit_summary_ok(client: TestClient) -> None:
    _login(client)
    start, end = default_month_range()
    response = client.get(
        "/api/v1/reports/profit",
        params={"from": str(start), "to": str(end)},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["from"] == str(start)
    assert body["to"] == str(end)
    assert body["profit_toman"] == body["income_paid_toman"] - body["expenses_toman"]
    assert "بدهی" in body["note"]


def test_income_only_paid_excludes_refund(client: TestClient) -> None:
    wipe_and_seed()
    _login(client)
    today = today_tehran()
    start, end = today, today

    before = client.get(
        "/api/v1/reports/profit",
        params={"from": str(start), "to": str(end)},
    ).json()["income_paid_toman"]

    db = SessionLocal()
    try:
        member = db.scalar(select(Member).limit(1))
        assert member is not None
        paid = Payment(
            member_id=member.id,
            amount_toman=50_000,
            method=PaymentMethod.CASH.value,
            status=PaymentStatus.PAID.value,
            receipt_number="R-PROFIT-PAID-1",
            paid_at=datetime.now(tz=timezone.utc),
        )
        refunded = Payment(
            member_id=member.id,
            amount_toman=90_000,
            method=PaymentMethod.CASH.value,
            status=PaymentStatus.REFUNDED.value,
            receipt_number="R-PROFIT-REF-1",
            paid_at=datetime.now(tz=timezone.utc),
        )
        pending = Payment(
            member_id=member.id,
            amount_toman=40_000,
            method=PaymentMethod.ONLINE.value,
            status=PaymentStatus.PENDING.value,
            receipt_number="R-PROFIT-PEND-1",
            paid_at=None,
        )
        db.add_all([paid, refunded, pending])
        db.commit()
    finally:
        db.close()

    after = client.get(
        "/api/v1/reports/profit",
        params={"from": str(start), "to": str(end)},
    ).json()["income_paid_toman"]
    assert after == before + 50_000


def test_default_range_is_current_tehran_month(client: TestClient) -> None:
    _login(client)
    start, end = default_month_range()
    response = client.get("/api/v1/reports/profit")
    assert response.status_code == 200
    assert response.json()["from"] == str(start)
    assert response.json()["to"] == str(end)
