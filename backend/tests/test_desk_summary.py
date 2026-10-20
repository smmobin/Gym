"""Desk dashboard summary: receptionist + manager, trainer forbidden."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.rate_limit import login_rate_limiter
from app.db.seed import DEV_STAFF_PASSWORD, seed
from app.main import app


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


def test_desk_summary_unauthorized(client: TestClient) -> None:
    assert client.get("/api/v1/desk/summary").status_code == 401


def test_desk_summary_receptionist_ok(client: TestClient) -> None:
    _login(client, "09120000002")
    res = client.get("/api/v1/desk/summary")
    assert res.status_code == 200
    body = res.json()
    for key in (
        "today_attendance_total",
        "today_open_count",
        "trial_open_count",
        "guests_today_count",
        "expiring",
        "debt",
        "renewals",
        "trial_leads",
    ):
        assert key in body
    assert isinstance(body["expiring"], list)
    assert isinstance(body["debt"], list)
    assert body["today_attendance_total"] >= 0
    assert body["today_open_count"] <= body["today_attendance_total"]


def test_desk_summary_manager_ok(client: TestClient) -> None:
    _login(client, "09120000001")
    assert client.get("/api/v1/desk/summary").status_code == 200


def test_desk_summary_trainer_forbidden(client: TestClient) -> None:
    _login(client, "09120000003")
    assert client.get("/api/v1/desk/summary").status_code == 403
