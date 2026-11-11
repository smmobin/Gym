"""Security regressions: payment price, session invalidation, OTP gate, rate limits, CSRF, headers."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import Settings, get_settings
from app.core.db import SessionLocal
from app.core.rate_limit import otp_send_rate_limiter
from app.core.security import hash_password
from app.db.seed import DEV_ATHLETE_PASSWORD, DEV_STAFF_PASSWORD, wipe_and_seed
from app.main import app
from app.models import Member, MembershipPlan, Payment, User
from app.services.payment_gateway.base import PaymentRequestResult

_ATHLETE_MOBILE = "09121111005"
_SEED_ROLES = {
    "09120000001": "manager",
    "09120000002": "receptionist",
    "09120000003": "trainer",
    "09120000004": "trainer",
}


def staff_login(
    client: TestClient,
    mobile: str,
    password: str = DEV_STAFF_PASSWORD,
    *,
    role: str | None = None,
):
    return client.post(
        "/api/v1/auth/login",
        json={
            "mobile": mobile,
            "password": password,
            "kind": "staff",
            "role": role or _SEED_ROLES[mobile],
        },
    )


@pytest.fixture(scope="module", autouse=True)
def _reseed() -> None:
    wipe_and_seed()
    yield
    wipe_and_seed()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def enabled_gateway(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("PAYMENT_GATEWAY_PROVIDER", "zarinpal")
    monkeypatch.setenv("PAYMENT_GATEWAY_MERCHANT_ID", "00000000-0000-0000-0000-000000000000")
    monkeypatch.setenv("PAYMENT_GATEWAY_SANDBOX", "true")
    monkeypatch.setenv(
        "PAYMENT_GATEWAY_CALLBACK_URL", "http://testserver/api/v1/payments/gateway/callback"
    )
    get_settings.cache_clear()
    yield get_settings()
    get_settings.cache_clear()


def _fake_gateway(authority: str):
    gw = MagicMock()
    gw.provider_name = "zarinpal"
    gw.request_payment.return_value = PaymentRequestResult(
        authority=authority,
        payment_url=f"https://sandbox.zarinpal.com/pg/StartPay/{authority}",
        raw_code=100,
    )
    return gw


def _plan_with_price() -> MembershipPlan:
    with SessionLocal() as db:
        plan = db.scalar(
            select(MembershipPlan).where(
                MembershipPlan.is_active.is_(True),
                MembershipPlan.base_price_toman >= 1000,
            )
        )
        assert plan is not None
        db.expunge(plan)
        return plan


def _user_id(mobile: str) -> int:
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.mobile == mobile))
        assert user is not None
        return user.id


# --- money -------------------------------------------------------------------


def test_athlete_online_renew_ignores_client_amount(
    client: TestClient, enabled_gateway, monkeypatch: pytest.MonkeyPatch
) -> None:
    _ = enabled_gateway
    gw = _fake_gateway("SSECURITYAUTHORITY000000000000001")
    monkeypatch.setattr(
        "app.services.online_payments.get_payment_gateway", lambda settings, client=None: gw
    )
    plan = _plan_with_price()
    assert (
        client.post(
            "/api/v1/athlete/auth/login",
            json={"mobile": _ATHLETE_MOBILE, "password": DEV_ATHLETE_PASSWORD},
        ).status_code
        == 200
    )
    res = client.post(
        "/api/v1/athlete/payments/online/start",
        json={"purpose": "renew", "plan_id": plan.id, "amount_toman": 100},
    )
    assert res.status_code == 201, res.text
    assert res.json()["payment"]["amount_toman"] == plan.base_price_toman
    sent = gw.request_payment.call_args.kwargs["amount_toman"]
    assert sent == plan.base_price_toman
    with SessionLocal() as db:
        payment = db.get(Payment, res.json()["payment"]["id"])
        assert payment is not None and payment.amount_toman == plan.base_price_toman


def test_desk_online_renew_may_set_agreed_amount(
    client: TestClient, enabled_gateway, monkeypatch: pytest.MonkeyPatch
) -> None:
    _ = enabled_gateway
    gw = _fake_gateway("SSECURITYAUTHORITY000000000000002")
    monkeypatch.setattr(
        "app.services.online_payments.get_payment_gateway", lambda settings, client=None: gw
    )
    plan = _plan_with_price()
    with SessionLocal() as db:
        member = db.scalar(select(Member).where(Member.mobile == _ATHLETE_MOBILE))
        assert member is not None
        member_id = member.id
    assert staff_login(client, "09120000002").status_code == 200
    res = client.post(
        f"/api/v1/payments/online/start?member_id={member_id}",
        json={"purpose": "renew", "plan_id": plan.id, "amount_toman": 500},
    )
    assert res.status_code == 201, res.text
    assert res.json()["payment"]["amount_toman"] == 500


# --- sessions ------------------------------------------------------------------


def test_role_change_ends_old_session(client: TestClient) -> None:
    manager = TestClient(app)
    assert staff_login(manager, "09120000001").status_code == 200
    created = manager.post(
        "/api/v1/staff",
        json={
            "mobile": "09127777001",
            "full_name": "منشی امنیتی",
            "role": "receptionist",
            "password": "DeskPass123",
        },
    )
    assert created.status_code == 201, created.text
    user_id = created.json()["user"]["id"]

    assert staff_login(client, "09127777001", "DeskPass123", role="receptionist").status_code == 200
    assert client.get("/api/v1/auth/staff-ping").status_code == 200

    demote = manager.patch(f"/api/v1/staff/{user_id}", json={"role": "trainer"})
    assert demote.status_code == 200, demote.text
    assert client.get("/api/v1/auth/staff-ping").status_code == 401
    assert client.get("/api/v1/auth/me").status_code == 401


def test_stale_acting_role_is_rejected_even_without_revoke(client: TestClient) -> None:
    assert staff_login(client, "09120000002").status_code == 200
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.mobile == "09120000002"))
        assert user is not None
        user.role = "trainer"
        db.commit()
    try:
        assert client.get("/api/v1/auth/me").status_code == 401
    finally:
        with SessionLocal() as db:
            user = db.scalar(select(User).where(User.mobile == "09120000002"))
            assert user is not None
            user.role = "receptionist"
            db.commit()


def test_manager_password_reset_revokes_target_sessions(client: TestClient) -> None:
    trainer_id = _user_id("09120000004")
    assert staff_login(client, "09120000004").status_code == 200
    manager = TestClient(app)
    assert staff_login(manager, "09120000001").status_code == 200
    res = manager.post(
        f"/api/v1/auth/users/{trainer_id}/password", json={"new_password": DEV_STAFF_PASSWORD}
    )
    assert res.status_code == 200
    assert client.get("/api/v1/auth/me").status_code == 401


def test_manager_cannot_reset_other_manager_password(client: TestClient) -> None:
    with SessionLocal() as db:
        other = User(
            mobile="09127777009",
            password_hash=hash_password("OtherBoss123"),
            full_name="مدیر دوم",
            role="manager",
            is_active=True,
        )
        db.add(other)
        db.commit()
        other_id = other.id
    assert staff_login(client, "09120000001").status_code == 200
    res = client.post(
        f"/api/v1/auth/users/{other_id}/password", json={"new_password": "Hijacked123"}
    )
    assert res.status_code == 403
    self_id = _user_id("09120000001")
    own = client.post(
        f"/api/v1/auth/users/{self_id}/password", json={"new_password": DEV_STAFF_PASSWORD}
    )
    assert own.status_code == 200


def test_desk_athlete_password_reset_revokes_athlete_sessions(client: TestClient) -> None:
    assert (
        client.post(
            "/api/v1/athlete/auth/login",
            json={"mobile": _ATHLETE_MOBILE, "password": DEV_ATHLETE_PASSWORD},
        ).status_code
        == 200
    )
    assert client.get("/api/v1/athlete/auth/me").status_code == 200
    with SessionLocal() as db:
        member = db.scalar(select(Member).where(Member.mobile == _ATHLETE_MOBILE))
        assert member is not None
        member_id = member.id
    desk = TestClient(app)
    assert staff_login(desk, "09120000002").status_code == 200
    res = desk.post(
        f"/api/v1/members/{member_id}/athlete-password", json={"password": DEV_ATHLETE_PASSWORD}
    )
    assert res.status_code == 200
    assert client.get("/api/v1/athlete/auth/me").status_code == 401


# --- OTP / rate limits ---------------------------------------------------------


def test_fixed_otp_requires_explicit_opt_in(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("OTP_DEV_FIXED", "false")
    get_settings.cache_clear()
    try:
        lookup = client.post("/api/v1/auth/lookup", json={"mobile": "09120000003"})
        assert lookup.status_code == 200
        assert lookup.json()["otp_dev_hint"] is False
        send = client.post(
            "/api/v1/auth/otp/send",
            json={"mobile": "09120000003", "kind": "staff", "role": "trainer"},
        )
        assert send.status_code == 403
        verify = client.post(
            "/api/v1/auth/otp/verify",
            json={"mobile": "09120000003", "kind": "staff", "role": "trainer", "code": "123456"},
        )
        assert verify.status_code == 403
        assert client.get("/api/v1/auth/me").status_code == 401
    finally:
        get_settings.cache_clear()


def test_otp_send_hourly_cap_per_mobile(client: TestClient) -> None:
    body = {"mobile": "09120000003", "kind": "staff", "role": "trainer"}
    for _ in range(10):
        otp_send_rate_limiter.reset()
        assert client.post("/api/v1/auth/otp/send", json=body).status_code == 200
    otp_send_rate_limiter.reset()
    assert client.post("/api/v1/auth/otp/send", json=body).status_code == 429


def test_auth_per_ip_limit_blocks_mobile_spraying(client: TestClient) -> None:
    codes = [
        client.post("/api/v1/auth/lookup", json={"mobile": f"0919{i:07d}"}).status_code
        for i in range(61)
    ]
    assert codes[0] == 401
    assert codes[-1] == 429


# --- CSRF / headers / production config ----------------------------------------


def test_cross_site_post_is_rejected(client: TestClient) -> None:
    assert staff_login(client, "09120000001").status_code == 200
    evil = client.post("/api/v1/auth/logout", headers={"Origin": "https://evil.example"})
    assert evil.status_code == 403
    assert client.get("/api/v1/auth/me").status_code == 200
    same = client.post("/api/v1/auth/touch", headers={"Origin": "http://testserver"})
    assert same.status_code == 200
    assert client.post("/api/v1/auth/touch", headers={"Origin": "null"}).status_code == 403


def test_gateway_error_redirect_omits_free_text(client: TestClient) -> None:
    res = client.get(
        "/api/v1/payments/gateway/callback",
        params={"Authority": "missing-authority-security", "Status": "OK"},
        follow_redirects=False,
    )
    assert res.status_code in {302, 307}
    location = res.headers["location"]
    assert "pay=error" in location
    assert "detail=" not in location


def test_frontend_csp_allows_exact_theme_boot_script() -> None:
    import base64
    import hashlib
    import re
    from pathlib import Path

    from app.core.security_middleware import FRONTEND_CSP

    html = (
        Path(__file__).resolve().parents[2] / "frontend" / "manager" / "index.html"
    ).read_text(encoding="utf-8")
    match = re.search(r"<script>(\(function\(\)\{try\{var t=localStorage.*?\}\)\(\);)</script>", html)
    assert match, "theme boot script missing from manager/index.html"
    digest = base64.b64encode(hashlib.sha256(match.group(1).encode("utf-8")).digest()).decode()
    assert f"'sha256-{digest}'" in FRONTEND_CSP
    assert "script-src" in FRONTEND_CSP
    assert "'unsafe-inline'" not in FRONTEND_CSP.split("script-src", 1)[1].split(";", 1)[0]


def test_security_headers_on_api_and_no_store(client: TestClient) -> None:
    res = client.get("/api/v1/health")
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["x-frame-options"] == "DENY"
    assert res.headers["content-security-policy"].startswith("default-src 'none'")
    assert res.headers["cache-control"] == "no-store"
    assert "referrer-policy" in res.headers


def test_production_config_errors() -> None:
    bad = Settings(
        app_env="production",
        secret_key="CHANGE_ME",
        cors_origins="http://app.example.com,http://localhost:5173",
        database_url="postgresql+psycopg://u:CHANGE_ME@h:5432/db",
        payment_gateway_provider="zarinpal",
        payment_gateway_merchant_id="x",
        payment_gateway_sandbox=True,
        payment_gateway_callback_url="http://api.example.com/cb",
        allow_destructive_seed=True,
    )
    errors = " | ".join(bad.production_config_errors())
    for needle in ("SECRET_KEY", "CHANGE_ME", "https://", "localhost", "SANDBOX", "CALLBACK", "SEED"):
        assert needle in errors

    good = Settings(
        app_env="production",
        secret_key="k" * 48,
        cors_origins="https://app.example.com",
        database_url="postgresql+psycopg://u:strong@h:5432/db",
        payment_gateway_provider="zarinpal",
        payment_gateway_merchant_id="x",
        payment_gateway_sandbox=False,
        payment_gateway_callback_url="https://app.example.com/api/v1/payments/gateway/callback",
        allow_destructive_seed=False,
    )
    assert good.production_config_errors() == []
    assert Settings(app_env="development", secret_key="x").production_config_errors() == []
