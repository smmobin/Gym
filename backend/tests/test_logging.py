"""Request id middleware, redaction, rotating file logs (temp dir), 5xx error events."""

from __future__ import annotations

import logging
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.logging_setup import SENSITIVE_LOGGER, setup_logging, shutdown_file_handlers
from app.core.redaction import REDACTED, mask_mobile, redact_mapping, redact_text
from app.core.request_middleware import should_record_error_event
from app.main import app
from app.models.system_event import SystemErrorEvent
from app.services.sms.base import log_sms_failure

_BOOM_PATH = "/api/v1/__test__/boom"


def _boom() -> dict[str, str]:
    raise RuntimeError("boom with password=SuperSecret99")


if not any(getattr(r, "path", None) == _BOOM_PATH for r in app.router.routes):
    app.add_api_route(_BOOM_PATH, _boom, methods=["GET"], include_in_schema=False)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def log_files(tmp_path: Path):
    paths = setup_logging(get_settings(), log_dir=tmp_path)
    yield paths
    shutdown_file_handlers()


def _read(path: Path) -> str:
    for handler in logging.getLogger().handlers + logging.getLogger("gym.access").handlers:
        handler.flush()
    for handler in logging.getLogger(SENSITIVE_LOGGER).handlers:
        handler.flush()
    return path.read_text(encoding="utf-8") if path.exists() else ""


# --- middleware --------------------------------------------------------------


def test_response_has_request_id_and_ids_differ(client: TestClient) -> None:
    first = client.get("/api/v1/health")
    second = client.get("/api/v1/health")
    assert first.status_code == 200
    rid1 = first.headers.get("x-request-id")
    rid2 = second.headers.get("x-request-id")
    assert rid1 and rid2
    assert rid1 != rid2
    uuid.UUID(rid1)


def test_safe_incoming_request_id_is_echoed(client: TestClient) -> None:
    res = client.get("/api/v1/health", headers={"X-Request-ID": "proxy-abc-12345"})
    assert res.headers["x-request-id"] == "proxy-abc-12345"


def test_unsafe_incoming_request_id_is_replaced(client: TestClient) -> None:
    res = client.get("/api/v1/health", headers={"X-Request-ID": "bad id\nwith newline<script>"})
    rid = res.headers["x-request-id"]
    assert "script" not in rid
    uuid.UUID(rid)


def test_cors_exposes_request_id_header(client: TestClient) -> None:
    res = client.get("/api/v1/health", headers={"Origin": "http://127.0.0.1:5173"})
    exposed = res.headers.get("access-control-expose-headers", "").lower()
    assert "x-request-id" in exposed


# --- redaction ---------------------------------------------------------------


def test_redact_text_strips_secrets_and_masks_mobile() -> None:
    raw = (
        "login password=Hunter22! api_key=KAVE-KEY-XYZ token: abc.def "
        "Authorization: Bearer eyJhbGciOi mobile 09121234567"
    )
    out = redact_text(raw)
    assert "Hunter22!" not in out
    assert "KAVE-KEY-XYZ" not in out
    assert "abc.def" not in out
    assert "eyJhbGciOi" not in out
    assert "09121234567" not in out
    assert "0912***4567" in out
    assert REDACTED in out


def test_redact_text_hides_otp_in_sms_body() -> None:
    out = redact_text("FAKE SMS body=کد ورود GYM CONTROL: 482913\nاعتبار: 5 دقیقه")
    assert "482913" not in out


def test_redact_text_keeps_masked_mobile_after_kod() -> None:
    text = "کد ورود نادرست یا منقضی (0912***0003)"
    assert redact_text(text) == text


def test_redact_mapping_keeps_non_secret_keys() -> None:
    data = {
        "password": "x",
        "nested": {"api_key": "k", "code": "123456"},
        "session_count": 12,
        "base_price_toman": 1_500_000,
    }
    out = redact_mapping(data)
    assert out["password"] == REDACTED
    assert out["nested"]["api_key"] == REDACTED
    assert out["nested"]["code"] == REDACTED
    assert out["session_count"] == 12
    assert out["base_price_toman"] == 1_500_000


def test_mask_mobile_edge_cases() -> None:
    assert mask_mobile("09120000001") == "0912***0001"
    assert mask_mobile("") == "—"
    assert mask_mobile("123") == "***"


# --- file logs ---------------------------------------------------------------


def test_files_written_to_temp_dir_with_redaction(log_files, client: TestClient) -> None:
    assert set(log_files) == {"access", "app", "error", "sensitive"}
    logging.getLogger("gym.test").warning(
        "probe password=NeverLogMe1 api_key=KAVE-KEY-XYZ mobile=09121234567"
    )
    res = client.get("/api/v1/health")
    rid = res.headers["x-request-id"]

    app_log = _read(log_files["app"])
    assert "probe" in app_log
    assert "NeverLogMe1" not in app_log
    assert "KAVE-KEY-XYZ" not in app_log
    assert "09121234567" not in app_log
    assert "0912***4567" in app_log

    access = _read(log_files["access"])
    assert "path=/api/v1/health" in access
    assert "status=200" in access
    assert f"rid={rid}" in access
    assert "duration_ms=" in access


def test_access_log_drops_query_string(log_files, client: TestClient) -> None:
    client.get("/api/v1/health?token=leak-me-please")
    access = _read(log_files["access"])
    assert "leak-me-please" not in access


def test_sensitive_log_has_full_mobile_but_app_log_masks(log_files) -> None:
    log_sms_failure(
        context="test",
        provider="fake",
        mobile="09127654321",
        error_code="sms_bad_receptor",
        status_code=422,
    )
    sensitive = _read(log_files["sensitive"])
    app_log = _read(log_files["app"])
    assert "09127654321" in sensitive
    assert "09127654321" not in app_log
    assert "0912***4321" in app_log


# --- 5xx → safe response + error event ----------------------------------------


def test_unhandled_error_returns_500_with_request_id_and_records_event(
    log_files, client: TestClient
) -> None:
    res = client.get(_BOOM_PATH)
    assert res.status_code == 500
    rid = res.headers.get("x-request-id")
    assert rid
    body = res.json()
    assert body["request_id"] == rid
    assert "SuperSecret99" not in res.text

    error_log = _read(log_files["error"])
    assert "Traceback" in error_log
    assert f"rid={rid}" in error_log
    assert "SuperSecret99" not in error_log

    db = SessionLocal()
    try:
        event = db.scalar(select(SystemErrorEvent).where(SystemErrorEvent.request_id == rid))
        assert event is not None
        assert event.status_code == 500
        assert event.path == _BOOM_PATH
        assert event.error_type == "RuntimeError"
        assert "SuperSecret99" not in (event.summary or "")
    finally:
        db.close()


def test_error_event_policy() -> None:
    assert should_record_error_event(500, "/api/v1/members")
    assert should_record_error_event(503, "/")
    assert should_record_error_event(429, "/api/v1/auth/login")
    assert not should_record_error_event(429, "/api/v1/members")
    assert not should_record_error_event(403, "/api/v1/reports/profit")
    assert not should_record_error_event(404, "/api/v1/auth/login")
