"""Online gateway: disabled path, happy verify, fail, duplicate callback (mocked — no network)."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.rate_limit import login_rate_limiter
from app.db.seed import DEV_ATHLETE_PASSWORD, wipe_and_seed
from app.main import app
from app.models import Member, Membership, MembershipPlan, Payment
from app.models.enums import PaymentPurpose, PaymentStatus
from app.services.payment_gateway.base import PaymentRequestResult, PaymentVerifyResult


@pytest.fixture(scope="module", autouse=True)
def _reseed() -> None:
    wipe_and_seed()
    yield
    # Leave DB as a clean seed so later modules (e.g. debt assertions) stay stable
    wipe_and_seed()


@pytest.fixture(autouse=True)
def _reset_limiter() -> None:
    login_rate_limiter.reset()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def enabled_gateway(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("PAYMENT_GATEWAY_PROVIDER", "zarinpal")
    monkeypatch.setenv(
        "PAYMENT_GATEWAY_MERCHANT_ID", "00000000-0000-0000-0000-000000000000"
    )
    monkeypatch.setenv("PAYMENT_GATEWAY_SANDBOX", "true")
    monkeypatch.setenv(
        "PAYMENT_GATEWAY_CALLBACK_URL",
        "http://testserver/api/v1/payments/gateway/callback",
    )
    monkeypatch.setenv(
        "PAYMENT_GATEWAY_FRONT_RETURN_URL",
        "http://127.0.0.1:5173/athlete/#pay",
    )
    get_settings.cache_clear()
    yield get_settings()
    get_settings.cache_clear()


@pytest.fixture
def disabled_gateway(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("PAYMENT_GATEWAY_PROVIDER", "none")
    monkeypatch.setenv("PAYMENT_GATEWAY_MERCHANT_ID", "")
    get_settings.cache_clear()
    yield get_settings()
    get_settings.cache_clear()


# Use حسین for gateway renew tests so علی's seed debt fixtures stay untouched mid-suite
_ATHLETE_MOBILE = "09121111005"


def _athlete_login(client: TestClient, mobile: str = _ATHLETE_MOBILE) -> None:
    assert (
        client.post(
            "/api/v1/athlete/auth/login",
            json={"mobile": mobile, "password": DEV_ATHLETE_PASSWORD},
        ).status_code
        == 200
    )


def _fake_gateway(
    *,
    authority: str = "STESTAUTHORITY0000000000000000001",
    verify_ok: bool = True,
    verify_code: int = 100,
    already: bool = False,
):
    gw = MagicMock()
    gw.provider_name = "zarinpal"
    gw.request_payment.return_value = PaymentRequestResult(
        authority=authority,
        payment_url=f"https://sandbox.zarinpal.com/pg/StartPay/{authority}",
        raw_code=100,
    )
    gw.verify_payment.return_value = PaymentVerifyResult(
        ok=verify_ok,
        ref_id="987654" if verify_ok else None,
        raw_code=verify_code,
        already_verified=already,
        message="ok" if verify_ok else "fail",
    )
    return gw


def _active_plan() -> MembershipPlan:
    db = SessionLocal()
    try:
        plan = db.scalar(
            select(MembershipPlan).where(
                MembershipPlan.is_active.is_(True),
                MembershipPlan.duration_days.is_not(None),
            )
        )
        assert plan is not None
        db.expunge(plan)
        return plan
    finally:
        db.close()


def test_gateway_status_disabled(client: TestClient, disabled_gateway) -> None:
    _ = disabled_gateway
    data = client.get("/api/v1/payments/gateway/status").json()
    assert data["enabled"] is False
    assert data["provider"] == "none"
    assert "آماده" in data["label"] or "پیکربندی" in data["label"]


def test_gateway_status_enabled(client: TestClient, enabled_gateway) -> None:
    _ = enabled_gateway
    data = client.get("/api/v1/payments/gateway/status").json()
    assert data["enabled"] is True
    assert data["provider"] == "zarinpal"
    assert data["sandbox"] is True
    assert "merchant" not in data
    assert "merchant_id" not in str(data).lower()


def test_start_online_when_disabled_403(client: TestClient, disabled_gateway) -> None:
    _ = disabled_gateway
    _athlete_login(client)
    plan = _active_plan()
    res = client.post(
        "/api/v1/athlete/payments/online/start",
        json={"purpose": "renew", "plan_id": plan.id, "amount_toman": 500_000},
    )
    assert res.status_code == 403
    assert "آماده" in res.json()["detail"]


def test_renewal_request_still_works_when_gateway_off(
    client: TestClient, disabled_gateway
) -> None:
    _ = disabled_gateway
    _athlete_login(client)
    res = client.post("/api/v1/athlete/renewal-requests", json={"note": "تست"})
    assert res.status_code == 200
    assert "میز" in res.json()["detail"]


def test_happy_path_renew_then_duplicate_callback(
    client: TestClient, enabled_gateway, monkeypatch: pytest.MonkeyPatch
) -> None:
    _ = enabled_gateway
    authority = "STESTAUTHORITY0000000000000000002"
    gw = _fake_gateway(authority=authority)
    monkeypatch.setattr(
        "app.services.online_payments.get_payment_gateway",
        lambda settings, client=None: gw,
    )

    _athlete_login(client)
    plan = _active_plan()

    with SessionLocal() as db:
        before = db.scalar(select(func.count()).select_from(Membership)) or 0

    start = client.post(
        "/api/v1/athlete/payments/online/start",
        json={
            "purpose": "renew",
            "plan_id": plan.id,
            "amount_toman": max(plan.base_price_toman, 100_000),
        },
    )
    assert start.status_code == 201, start.text
    body = start.json()
    assert body["authority"] == authority
    assert "StartPay" in body["payment_url"]
    assert body["payment"]["status"] == PaymentStatus.PENDING.value
    assert body["payment"]["method"] == "online"
    payment_id = body["payment"]["id"]

    cb1 = client.get(
        "/api/v1/payments/gateway/callback",
        params={"Authority": authority, "Status": "OK"},
        follow_redirects=False,
    )
    assert cb1.status_code in {302, 307}

    with SessionLocal() as db:
        payment = db.get(Payment, payment_id)
        assert payment is not None
        assert payment.status == PaymentStatus.PAID.value
        assert payment.gateway_ref_id == "987654"
        assert payment.purpose == PaymentPurpose.RENEW.value
        assert payment.renewed_membership_id is not None
        after = db.scalar(select(func.count()).select_from(Membership)) or 0
        assert after == before + 1
        renewed_id = payment.renewed_membership_id

    # Duplicate callback must not create another membership
    cb2 = client.get(
        "/api/v1/payments/gateway/callback",
        params={"Authority": authority, "Status": "OK"},
        follow_redirects=False,
    )
    assert cb2.status_code in {302, 307}

    with SessionLocal() as db:
        payment = db.get(Payment, payment_id)
        assert payment is not None
        assert payment.status == PaymentStatus.PAID.value
        assert payment.renewed_membership_id == renewed_id
        after2 = db.scalar(select(func.count()).select_from(Membership)) or 0
        assert after2 == after


def test_verify_fail_marks_failed_no_membership(
    client: TestClient, enabled_gateway, monkeypatch: pytest.MonkeyPatch
) -> None:
    _ = enabled_gateway
    authority = "STESTAUTHORITY0000000000000000003"
    gw = _fake_gateway(authority=authority, verify_ok=False, verify_code=40)
    monkeypatch.setattr(
        "app.services.online_payments.get_payment_gateway",
        lambda settings, client=None: gw,
    )

    _athlete_login(client)
    plan = _active_plan()

    with SessionLocal() as db:
        before = db.scalar(select(func.count()).select_from(Membership)) or 0

    start = client.post(
        "/api/v1/athlete/payments/online/start",
        json={"purpose": "renew", "plan_id": plan.id, "amount_toman": 200_000},
    )
    assert start.status_code == 201
    payment_id = start.json()["payment"]["id"]

    cb = client.get(
        "/api/v1/payments/gateway/callback",
        params={"Authority": authority, "Status": "OK"},
        follow_redirects=False,
    )
    assert cb.status_code in {302, 307}

    with SessionLocal() as db:
        payment = db.get(Payment, payment_id)
        assert payment is not None
        assert payment.status == PaymentStatus.FAILED.value
        assert payment.renewed_membership_id is None
        after = db.scalar(select(func.count()).select_from(Membership)) or 0
        assert after == before


def test_cancel_status_nok(
    client: TestClient, enabled_gateway, monkeypatch: pytest.MonkeyPatch
) -> None:
    _ = enabled_gateway
    authority = "STESTAUTHORITY0000000000000000004"
    gw = _fake_gateway(authority=authority)
    monkeypatch.setattr(
        "app.services.online_payments.get_payment_gateway",
        lambda settings, client=None: gw,
    )
    _athlete_login(client)
    plan = _active_plan()
    start = client.post(
        "/api/v1/athlete/payments/online/start",
        json={"purpose": "renew", "plan_id": plan.id, "amount_toman": 150_000},
    )
    assert start.status_code == 201
    payment_id = start.json()["payment"]["id"]

    cb = client.get(
        "/api/v1/payments/gateway/callback",
        params={"Authority": authority, "Status": "NOK"},
        follow_redirects=False,
    )
    assert cb.status_code in {302, 307}
    with SessionLocal() as db:
        payment = db.get(Payment, payment_id)
        assert payment is not None
        assert payment.status == PaymentStatus.CANCELLED.value
        gw.verify_payment.assert_not_called()


def test_athlete_cannot_start_for_other_member_implicit(
    client: TestClient, enabled_gateway, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Start always binds session member — no member_id in body."""
    _ = enabled_gateway
    authority = "STESTAUTHORITY0000000000000000005"
    gw = _fake_gateway(authority=authority)
    monkeypatch.setattr(
        "app.services.online_payments.get_payment_gateway",
        lambda settings, client=None: gw,
    )
    _athlete_login(client)
    plan = _active_plan()
    res = client.post(
        "/api/v1/athlete/payments/online/start",
        json={"purpose": "renew", "plan_id": plan.id, "amount_toman": 120_000},
    )
    assert res.status_code == 201
    with SessionLocal() as db:
        athlete = db.scalar(select(Member).where(Member.mobile == _ATHLETE_MOBILE))
        payment = db.get(Payment, res.json()["payment"]["id"])
        assert athlete is not None and payment is not None
        assert payment.member_id == athlete.id
