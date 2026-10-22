"""SMS provider: disabled path, happy send, role 403, missing member (mocked — no network)."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.rate_limit import login_rate_limiter
from app.db.seed import DEV_STAFF_PASSWORD, wipe_and_seed
from app.main import app
from app.models import Member
from app.models.audit import AuditLog
from app.services.sms.base import SmsSendResult


@pytest.fixture(scope="module", autouse=True)
def _reseed() -> None:
    wipe_and_seed()
    yield
    wipe_and_seed()


@pytest.fixture(autouse=True)
def _reset_limiter() -> None:
    login_rate_limiter.reset()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def enabled_sms(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SMS_PROVIDER", "kavenegar")
    monkeypatch.setenv("SMS_API_KEY", "test-api-key-not-real")
    monkeypatch.setenv("SMS_SENDER", "10008663")
    get_settings.cache_clear()
    yield get_settings()
    get_settings.cache_clear()


@pytest.fixture
def disabled_sms(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SMS_PROVIDER", "none")
    monkeypatch.setenv("SMS_API_KEY", "")
    get_settings.cache_clear()
    yield get_settings()
    get_settings.cache_clear()


def _login(client: TestClient, mobile: str) -> None:
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"mobile": mobile, "password": DEV_STAFF_PASSWORD},
        ).status_code
        == 200
    )


def _seed_member_id(mobile: str = "09121111001") -> int:
    db = SessionLocal()
    try:
        member = db.scalar(select(Member).where(Member.mobile == mobile))
        assert member is not None
        return int(member.id)
    finally:
        db.close()


def _fake_gateway(*, message_id: str = "998877"):
    gw = MagicMock()
    gw.provider_name = "kavenegar"
    gw.send_sms.return_value = SmsSendResult(
        ok=True,
        message_id=message_id,
        provider_status=200,
        message="ok",
    )
    return gw


def test_sms_status_disabled(client: TestClient, disabled_sms) -> None:
    _ = disabled_sms
    data = client.get("/api/v1/sms/status").json()
    assert data["enabled"] is False
    assert data["provider"] == "none"
    assert "آماده" in data["label"] or "پیکربندی" in data["label"]
    blob = str(data).lower()
    assert "api_key" not in blob
    assert "test-api" not in blob


def test_sms_status_enabled(client: TestClient, enabled_sms) -> None:
    _ = enabled_sms
    data = client.get("/api/v1/sms/status").json()
    assert data["enabled"] is True
    assert data["provider"] == "kavenegar"
    assert "کاوه‌نگار" in data["label"] or "فعال" in data["label"]
    blob = str(data).lower()
    assert "api_key" not in blob
    assert "test-api-key" not in blob


def test_send_when_disabled_403(client: TestClient, disabled_sms) -> None:
    _ = disabled_sms
    _login(client, "09120000001")
    member_id = _seed_member_id()
    res = client.post(
        "/api/v1/sms/send",
        json={"template_id": "welcome", "member_id": member_id},
    )
    assert res.status_code == 403
    assert "آماده" in res.json()["detail"]


def test_send_happy_path(
    client: TestClient,
    enabled_sms,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _ = enabled_sms
    fake = _fake_gateway()
    monkeypatch.setattr(
        "app.services.sms_send.get_sms_gateway",
        lambda settings, client=None: fake,
    )
    _login(client, "09120000002")  # receptionist
    member_id = _seed_member_id("09121111001")
    res = client.post(
        "/api/v1/sms/send",
        json={"template_id": "welcome", "member_id": member_id},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["template_id"] == "welcome"
    assert body["member_id"] == member_id
    assert body["message_id"] == "998877"
    assert "api_key" not in str(body).lower()
    fake.send_sms.assert_called_once()
    call_kwargs = fake.send_sms.call_args.kwargs
    assert call_kwargs["receptor"] == "09121111001"
    assert "علی" in call_kwargs["message"] or "Ali" in call_kwargs["message"] or "M-" in call_kwargs[
        "message"
    ]

    db = SessionLocal()
    try:
        audit = db.scalar(
            select(AuditLog)
            .where(AuditLog.action == "sms.send", AuditLog.entity_id == str(member_id))
            .order_by(AuditLog.id.desc())
            .limit(1)
        )
        assert audit is not None
        assert audit.payload is not None
        assert audit.payload.get("template_id") == "welcome"
        assert audit.payload.get("ok") is True
        # full message body must not be stored
        assert "message" not in audit.payload or audit.payload.get("message") in (None, "")
    finally:
        db.close()


def test_send_trainer_forbidden(
    client: TestClient,
    enabled_sms,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _ = enabled_sms
    monkeypatch.setattr(
        "app.services.sms_send.get_sms_gateway",
        lambda settings, client=None: _fake_gateway(),
    )
    _login(client, "09120000003")  # trainer
    member_id = _seed_member_id()
    res = client.post(
        "/api/v1/sms/send",
        json={"template_id": "debt", "member_id": member_id},
    )
    assert res.status_code == 403


def test_send_member_not_found(
    client: TestClient,
    enabled_sms,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _ = enabled_sms
    monkeypatch.setattr(
        "app.services.sms_send.get_sms_gateway",
        lambda settings, client=None: _fake_gateway(),
    )
    _login(client, "09120000001")
    res = client.post(
        "/api/v1/sms/send",
        json={"template_id": "welcome", "member_id": 9_999_999},
    )
    assert res.status_code == 404
    assert "عضو" in res.json()["detail"]


def test_send_unknown_template(
    client: TestClient,
    enabled_sms,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _ = enabled_sms
    monkeypatch.setattr(
        "app.services.sms_send.get_sms_gateway",
        lambda settings, client=None: _fake_gateway(),
    )
    _login(client, "09120000001")
    member_id = _seed_member_id()
    res = client.post(
        "/api/v1/sms/send",
        json={"template_id": "no-such-template", "member_id": member_id},
    )
    assert res.status_code == 404


def test_templates_list_desk_only(client: TestClient, enabled_sms) -> None:
    _ = enabled_sms
    assert client.get("/api/v1/sms/templates").status_code == 401
    _login(client, "09120000001")
    res = client.get("/api/v1/sms/templates")
    assert res.status_code == 200
    items = res.json()["items"]
    ids = {t["id"] for t in items}
    assert {"welcome", "expiry", "debt"} <= ids
