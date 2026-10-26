"""Public membership-plans list for landing (no auth)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.rate_limit import public_plans_rate_limiter
from app.db.seed import wipe_and_seed
from app.main import app
from app.models import MembershipPlan


@pytest.fixture(scope="module", autouse=True)
def _reseed() -> None:
    wipe_and_seed()


@pytest.fixture(autouse=True)
def _reset_limiter() -> None:
    public_plans_rate_limiter.reset()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_public_plans_without_auth(client: TestClient) -> None:
    response = client.get("/api/v1/public/membership-plans")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1
    assert len(body["items"]) == body["total"]
    for item in body["items"]:
        assert "id" in item
        assert "name" in item
        assert "base_price_toman" in item
        assert "includes_locker" in item
        assert "is_active" not in item


def test_public_plans_excludes_inactive(client: TestClient) -> None:
    db = SessionLocal()
    try:
        plan = db.scalar(select(MembershipPlan).where(MembershipPlan.is_active.is_(True)))
        assert plan is not None
        plan_id = plan.id
        plan_name = plan.name
        plan.is_active = False
        db.commit()
    finally:
        db.close()

    try:
        response = client.get("/api/v1/public/membership-plans")
        assert response.status_code == 200
        names = {p["name"] for p in response.json()["items"]}
        assert plan_name not in names
        assert all(p["id"] != plan_id for p in response.json()["items"])
    finally:
        db = SessionLocal()
        try:
            restored = db.get(MembershipPlan, plan_id)
            assert restored is not None
            restored.is_active = True
            db.commit()
        finally:
            db.close()


def test_desk_plans_still_require_auth(client: TestClient) -> None:
    assert client.get("/api/v1/membership-plans").status_code == 401
