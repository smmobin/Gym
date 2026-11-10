"""Auth audit rows + manager-only activity API and .log export."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.rate_limit import (
    login_rate_limiter,
    lookup_rate_limiter,
    otp_send_rate_limiter,
    otp_verify_rate_limiter,
)
from app.db.seed import DEV_ATHLETE_PASSWORD, DEV_STAFF_PASSWORD, wipe_and_seed
from app.main import app
from app.models import AuditLog, MembershipPlan
from app.services.login_otp import DEV_FIXED_OTP

MANAGER = "09120000001"
RECEPTIONIST = "09120000002"
TRAINER = "09120000003"
ATHLETE = "09121111001"


@pytest.fixture(scope="module", autouse=True)
def _reseed() -> None:
    wipe_and_seed()
    yield
    wipe_and_seed()


@pytest.fixture(autouse=True)
def _reset_limiters_and_force_dev_otp(monkeypatch: pytest.MonkeyPatch):
    for limiter in (
        login_rate_limiter,
        lookup_rate_limiter,
        otp_send_rate_limiter,
        otp_verify_rate_limiter,
    ):
        limiter.reset()
    # Never hit a real SMS provider from a local .env during tests.
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("SMS_PROVIDER", "none")
    monkeypatch.setenv("SMS_API_KEY", "")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _login(client: TestClient, mobile: str, password: str = DEV_STAFF_PASSWORD):
    return client.post("/api/v1/auth/login", json={"mobile": mobile, "password": password})


_TRAINER_OTP = {"mobile": TRAINER, "kind": "staff", "role": "trainer"}


def _trainer_otp_login(client: TestClient):
    client.post("/api/v1/auth/otp/send", json=_TRAINER_OTP)
    return client.post("/api/v1/auth/otp/verify", json={**_TRAINER_OTP, "code": DEV_FIXED_OTP})


def _latest(action: str) -> AuditLog | None:
    db = SessionLocal()
    try:
        return db.scalar(
            select(AuditLog).where(AuditLog.action == action).order_by(AuditLog.id.desc())
        )
    finally:
        db.close()


# --- auth audit ---------------------------------------------------------------


def test_login_success_writes_audit_with_request_id(client: TestClient) -> None:
    res = _login(client, MANAGER)
    assert res.status_code == 200
    row = _latest("auth.login.success")
    assert row is not None
    assert row.payload["method"] == "password"
    assert row.payload["role"] == "manager"
    assert row.request_id == res.headers["x-request-id"]


def test_login_failure_writes_audit_without_password(client: TestClient) -> None:
    res = _login(client, MANAGER, password="WrongPass99!")
    assert res.status_code == 401
    row = _latest("auth.login.failure")
    assert row is not None
    assert row.request_id == res.headers["x-request-id"]
    blob = f"{row.summary} {row.payload}"
    assert "WrongPass99!" not in blob
    assert MANAGER not in blob
    assert "0912***0001" in blob
    assert row.payload["reason"] == "bad_credentials"


def test_athlete_login_success_is_audited(client: TestClient) -> None:
    res = _login(client, ATHLETE, password=DEV_ATHLETE_PASSWORD)
    assert res.status_code == 200
    row = _latest("auth.login.success")
    assert row is not None
    assert row.entity_type == "member"
    assert row.payload["kind"] == "athlete"


def test_logout_writes_audit(client: TestClient) -> None:
    assert _login(client, RECEPTIONIST).status_code == 200
    res = client.post("/api/v1/auth/logout")
    assert res.status_code == 200
    row = _latest("auth.logout")
    assert row is not None
    assert row.actor_user_id is not None


def test_otp_send_and_verify_never_store_code(client: TestClient) -> None:
    sent = client.post("/api/v1/auth/otp/send", json=_TRAINER_OTP)
    assert sent.status_code == 200
    bad = client.post("/api/v1/auth/otp/verify", json={**_TRAINER_OTP, "code": "000000"})
    assert bad.status_code == 401
    ok = client.post("/api/v1/auth/otp/verify", json={**_TRAINER_OTP, "code": DEV_FIXED_OTP})
    assert ok.status_code == 200

    for action in ("auth.otp.send", "auth.otp.verify.failure", "auth.otp.verify.success"):
        row = _latest(action)
        assert row is not None, action
        blob = f"{row.summary} {row.payload}"
        assert DEV_FIXED_OTP not in blob
        assert "000000" not in blob
    login = _latest("auth.login.success")
    assert login is not None and login.payload["method"] == "otp"


def test_plan_price_change_audit_keeps_before(client: TestClient) -> None:
    assert _login(client, MANAGER).status_code == 200
    db = SessionLocal()
    try:
        plan = db.scalar(select(MembershipPlan).order_by(MembershipPlan.id.asc()))
        assert plan is not None
        plan_id, old_price = plan.id, plan.base_price_toman
    finally:
        db.close()
    res = client.patch(
        f"/api/v1/membership-plans/{plan_id}",
        json={"base_price_toman": old_price + 100_000},
    )
    assert res.status_code == 200, res.text
    row = _latest("plan.update")
    assert row is not None
    assert row.payload["before"]["base_price_toman"] == old_price
    assert row.payload["base_price_toman"] == old_price + 100_000
    assert "تغییر قیمت" in (row.summary or "")


# --- activity API -------------------------------------------------------------


def test_activity_requires_session(client: TestClient) -> None:
    assert client.get("/api/v1/manager/activity").status_code == 401
    assert client.get("/api/v1/manager/activity/export").status_code == 401


@pytest.mark.parametrize("mobile", [RECEPTIONIST, TRAINER])
def test_activity_forbidden_for_non_manager_staff(client: TestClient, mobile: str) -> None:
    res = _trainer_otp_login(client) if mobile == TRAINER else _login(client, mobile)
    assert res.status_code == 200
    assert client.get("/api/v1/manager/activity").status_code == 403
    assert client.get("/api/v1/manager/activity/export").status_code == 403


def test_activity_athlete_cookie_is_not_staff(client: TestClient) -> None:
    assert _login(client, ATHLETE, password=DEV_ATHLETE_PASSWORD).status_code == 200
    # Athlete has no staff session → same gate as every manager route.
    assert client.get("/api/v1/manager/activity").status_code in (401, 403)


def test_manager_sees_seeded_and_live_activity(client: TestClient) -> None:
    assert _login(client, MANAGER).status_code == 200
    res = client.get("/api/v1/manager/activity")
    assert res.status_code == 200
    body = res.json()
    assert "from" in body and "to" in body
    assert "errors" in body["categories"]
    actions = {i["action"] for i in body["items"]}
    assert "auth.login.success" in actions
    assert "auth.login.failure" in actions
    assert "seed.run" not in actions
    assert "membership.window_sync" not in actions
    assert any(i["source"] == "error" and i["status_code"] == 500 for i in body["items"])
    dates = [i["created_at"] for i in body["items"]]
    assert dates == sorted(dates, reverse=True)
    for item in body["items"]:
        assert "payload" not in item


def test_activity_filters_category_and_search(client: TestClient) -> None:
    assert _login(client, MANAGER).status_code == 200
    errors = client.get("/api/v1/manager/activity", params={"category": "errors"}).json()
    assert errors["items"]
    assert all(i["source"] == "error" for i in errors["items"])

    plans = client.get("/api/v1/manager/activity", params={"q": "تغییر قیمت"}).json()
    assert plans["items"]
    assert all("تغییر قیمت" in i["summary"] for i in plans["items"])

    bad = client.get("/api/v1/manager/activity", params={"category": "nope"})
    assert bad.status_code == 422


def test_activity_range_validation(client: TestClient) -> None:
    assert _login(client, MANAGER).status_code == 200
    res = client.get(
        "/api/v1/manager/activity", params={"from": "2026-11-10", "to": "2026-11-01"}
    )
    assert res.status_code == 422


def test_activity_cursor_pagination(client: TestClient) -> None:
    assert _login(client, MANAGER).status_code == 200
    first = client.get("/api/v1/manager/activity", params={"limit": 3}).json()
    assert len(first["items"]) == 3
    assert first["next_cursor"]
    second = client.get(
        "/api/v1/manager/activity", params={"limit": 3, "cursor": first["next_cursor"]}
    ).json()
    first_ids = {i["id"] for i in first["items"]}
    assert second["items"]
    assert not first_ids & {i["id"] for i in second["items"]}


def test_export_returns_utf8_log_attachment(client: TestClient) -> None:
    assert _login(client, MANAGER).status_code == 200
    res = client.get(
        "/api/v1/manager/activity/export", params={"from": "2026-01-01", "to": "2026-12-31"}
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/plain")
    assert "charset=utf-8" in res.headers["content-type"]
    disposition = res.headers["content-disposition"]
    assert "attachment" in disposition
    assert 'filename="gym-activity-20260101-20261231.log"' in disposition
    text = res.content.decode("utf-8")
    assert text.startswith("# GYM CONTROL")
    assert "auth.login" in text
    assert "rid=" in text
    assert "09120000001" not in text
    assert DEV_STAFF_PASSWORD not in text
