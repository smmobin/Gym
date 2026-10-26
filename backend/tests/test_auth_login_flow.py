"""New unified login: lookup, role chooser, OTP (dev 123456), password by identity."""

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
from app.core.security import hash_password
from app.db.seed import DEV_ATHLETE_PASSWORD, DEV_STAFF_PASSWORD, wipe_and_seed
from app.main import app
from app.models import Member, MemberStatus
from app.services.login_otp import DEV_FIXED_OTP


@pytest.fixture(scope="module", autouse=True)
def _reseed() -> None:
    wipe_and_seed()
    yield
    wipe_and_seed()


@pytest.fixture(autouse=True)
def _reset_limiters() -> None:
    login_rate_limiter.reset()
    lookup_rate_limiter.reset()
    otp_send_rate_limiter.reset()
    otp_verify_rate_limiter.reset()
    get_settings.cache_clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_lookup_single_manager(client: TestClient) -> None:
    res = client.post("/api/v1/auth/lookup", json={"mobile": "09120000001"})
    assert res.status_code == 200
    body = res.json()
    assert len(body["identities"]) == 1
    assert body["identities"][0]["kind"] == "staff"
    assert body["identities"][0]["role"] == "manager"
    assert body["identities"][0]["auth_methods"] == ["password"]
    assert body["otp_dev_hint"] is True


def test_lookup_unknown_mobile(client: TestClient) -> None:
    res = client.post("/api/v1/auth/lookup", json={"mobile": "09129999999"})
    assert res.status_code == 401


def test_lookup_staff_athlete_conflict(client: TestClient) -> None:
    wipe_and_seed()
    lookup_rate_limiter.reset()
    db = SessionLocal()
    try:
        db.add(
            Member(
                display_id="M-9098",
                first_name="تداخل",
                last_name="نقش",
                mobile="09120000002",
                status=MemberStatus.ACTIVE.value,
                password_hash=hash_password("AthleteOnly99"),
            )
        )
        db.commit()
    finally:
        db.close()

    res = client.post("/api/v1/auth/lookup", json={"mobile": "09120000002"})
    assert res.status_code == 200
    kinds = {(i["kind"], i["role"]) for i in res.json()["identities"]}
    assert ("staff", "receptionist") in kinds
    assert ("athlete", "athlete") in kinds

    # Password without kind must not auto-pick staff
    bare = client.post(
        "/api/v1/auth/login",
        json={"mobile": "09120000002", "password": DEV_STAFF_PASSWORD},
    )
    assert bare.status_code == 409

    as_staff = client.post(
        "/api/v1/auth/login",
        json={
            "mobile": "09120000002",
            "password": DEV_STAFF_PASSWORD,
            "kind": "staff",
            "role": "receptionist",
        },
    )
    assert as_staff.status_code == 200
    assert as_staff.json()["kind"] == "staff"
    client.post("/api/v1/auth/logout")

    as_athlete = client.post(
        "/api/v1/auth/login",
        json={
            "mobile": "09120000002",
            "password": "AthleteOnly99",
            "kind": "athlete",
        },
    )
    assert as_athlete.status_code == 200
    assert as_athlete.json()["kind"] == "athlete"

    wipe_and_seed()


def test_manager_password_only_otp_rejected(client: TestClient) -> None:
    send = client.post(
        "/api/v1/auth/otp/send",
        json={"mobile": "09120000001", "kind": "staff", "role": "manager"},
    )
    assert send.status_code == 400

    ok = client.post(
        "/api/v1/auth/login",
        json={"mobile": "09120000001", "password": DEV_STAFF_PASSWORD},
    )
    assert ok.status_code == 200
    assert ok.json()["role"] == "manager"


def test_trainer_otp_dev_fixed(client: TestClient) -> None:
    send = client.post(
        "/api/v1/auth/otp/send",
        json={"mobile": "09120000003", "kind": "staff", "role": "trainer"},
    )
    assert send.status_code == 200
    body = send.json()
    assert body["mode"] == "dev_fixed"
    assert "code" not in body
    assert DEV_FIXED_OTP not in str(body)

    bad = client.post(
        "/api/v1/auth/otp/verify",
        json={
            "mobile": "09120000003",
            "kind": "staff",
            "role": "trainer",
            "code": "000000",
        },
    )
    assert bad.status_code == 401

    good = client.post(
        "/api/v1/auth/otp/verify",
        json={
            "mobile": "09120000003",
            "kind": "staff",
            "role": "trainer",
            "code": DEV_FIXED_OTP,
        },
    )
    assert good.status_code == 200
    assert good.json()["kind"] == "staff"
    assert good.json()["role"] == "trainer"
    assert good.cookies.get("gym_session")


def test_athlete_otp_and_password_switch(client: TestClient) -> None:
    send = client.post(
        "/api/v1/auth/otp/send",
        json={"mobile": "09121111001", "kind": "athlete"},
    )
    assert send.status_code == 200

    otp = client.post(
        "/api/v1/auth/otp/verify",
        json={
            "mobile": "09121111001",
            "kind": "athlete",
            "code": DEV_FIXED_OTP,
        },
    )
    assert otp.status_code == 200
    assert otp.json()["kind"] == "athlete"
    assert otp.cookies.get("gym_athlete_session")
    client.post("/api/v1/athlete/auth/logout")

    pw = client.post(
        "/api/v1/auth/login",
        json={
            "mobile": "09121111001",
            "password": DEV_ATHLETE_PASSWORD,
            "kind": "athlete",
        },
    )
    assert pw.status_code == 200
    assert pw.json()["kind"] == "athlete"


def test_trainer_password_backup(client: TestClient) -> None:
    res = client.post(
        "/api/v1/auth/login",
        json={
            "mobile": "09120000003",
            "password": DEV_STAFF_PASSWORD,
            "kind": "staff",
            "role": "trainer",
        },
    )
    assert res.status_code == 200
    assert res.json()["role"] == "trainer"


def test_wrong_kind_cannot_steal_session(client: TestClient) -> None:
    """Athlete password must not create staff session when kind=staff is forged."""
    res = client.post(
        "/api/v1/auth/login",
        json={
            "mobile": "09121111001",
            "password": DEV_ATHLETE_PASSWORD,
            "kind": "staff",
            "role": "manager",
        },
    )
    assert res.status_code == 401


def test_production_like_without_sms_rejects_fixed_otp(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SMS_PROVIDER", "none")
    monkeypatch.setenv("SMS_API_KEY", "")
    get_settings.cache_clear()

    send = client.post(
        "/api/v1/auth/otp/send",
        json={"mobile": "09121111001", "kind": "athlete"},
    )
    assert send.status_code == 403
    assert "پیامک" in send.json()["detail"]

    verify = client.post(
        "/api/v1/auth/otp/verify",
        json={
            "mobile": "09121111001",
            "kind": "athlete",
            "code": DEV_FIXED_OTP,
        },
    )
    assert verify.status_code == 403

    get_settings.cache_clear()


def test_athlete_without_password_clear_message(client: TestClient) -> None:
    wipe_and_seed()
    login_rate_limiter.reset()
    lookup_rate_limiter.reset()
    db = SessionLocal()
    try:
        member = db.scalar(select(Member).where(Member.mobile == "09121111002"))
        assert member is not None
        member.password_hash = None
        db.commit()
    finally:
        db.close()

    lookup = client.post("/api/v1/auth/lookup", json={"mobile": "09121111002"})
    assert lookup.status_code == 200
    ident = lookup.json()["identities"][0]
    assert ident["has_password"] is False
    assert "otp" in ident["auth_methods"]
    assert "password" not in ident["auth_methods"]

    pw = client.post(
        "/api/v1/auth/login",
        json={
            "mobile": "09121111002",
            "password": "Whatever1",
            "kind": "athlete",
        },
    )
    assert pw.status_code == 400
    assert "رمز" in pw.json()["detail"]

    wipe_and_seed()
