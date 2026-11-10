"""Builder log viewer: closed unless flag + long token, never on production-like."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.rate_limit import login_rate_limiter
from app.db.seed import DEV_STAFF_PASSWORD, wipe_and_seed
from app.main import app

TOKEN = "dev-log-viewer-token-0123456789"
SAMPLE = (
    "2026-11-10 10:00:00,000 INFO gym.access [rid=abc12345-def] "
    "method=GET path=/api/v1/health status=200\n"
    "2026-11-10 10:00:01,000 ERROR gym.error [rid=err99999-xyz] boom\n"
)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def viewer_on(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("DEV_LOG_VIEWER", "true")
    monkeypatch.setenv("DEV_LOG_VIEWER_TOKEN", TOKEN)
    get_settings.cache_clear()
    log_dir = Path(os.environ["LOG_DIR"])
    log_dir.mkdir(parents=True, exist_ok=True)
    (log_dir / "access.log").write_text(SAMPLE, encoding="utf-8")
    yield
    get_settings.cache_clear()


def _hdr(token: str = TOKEN) -> dict[str, str]:
    return {"X-Dev-Log-Token": token}


def test_viewer_off_by_default_is_404(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("DEV_LOG_VIEWER", "false")
    monkeypatch.setenv("DEV_LOG_VIEWER_TOKEN", "")
    get_settings.cache_clear()
    try:
        assert client.get("/api/v1/dev/logs/files").status_code == 404
        assert client.get("/api/v1/dev/logs/read", params={"file": "access"}).status_code == 404
    finally:
        get_settings.cache_clear()


def test_wrong_token_is_401(client: TestClient, viewer_on: None) -> None:
    assert client.get("/api/v1/dev/logs/files").status_code == 401
    bad = client.get("/api/v1/dev/logs/files", headers=_hdr("not-the-token-but-long-enough!!"))
    assert bad.status_code == 401


def test_short_token_keeps_viewer_404(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("DEV_LOG_VIEWER", "true")
    monkeypatch.setenv("DEV_LOG_VIEWER_TOKEN", "too-short")
    get_settings.cache_clear()
    try:
        res = client.get("/api/v1/dev/logs/files", headers=_hdr("too-short"))
        assert res.status_code == 404
    finally:
        get_settings.cache_clear()


def test_production_like_ignores_flag(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DEV_LOG_VIEWER", "true")
    monkeypatch.setenv("DEV_LOG_VIEWER_TOKEN", TOKEN)
    get_settings.cache_clear()
    try:
        res = client.get("/api/v1/dev/logs/files", headers=_hdr())
        assert res.status_code == 404
    finally:
        get_settings.cache_clear()


def test_read_filter_and_tail(client: TestClient, viewer_on: None) -> None:
    listed = client.get("/api/v1/dev/logs/files", headers=_hdr())
    assert listed.status_code == 200
    access = next(i for i in listed.json()["items"] if i["file"] == "access")
    assert access["exists"] is True
    assert access["size_bytes"] > 0

    tail = client.get(
        "/api/v1/dev/logs/read",
        params={"file": "access", "limit": 1},
        headers=_hdr(),
    )
    assert tail.status_code == 200
    body = tail.json()
    assert body["total_matched"] == 2
    assert body["lines"][0]["text"].endswith("boom")
    assert body["has_older"] is True

    errors = client.get(
        "/api/v1/dev/logs/read",
        params={"file": "access", "level": "ERROR", "rid": "err99999"},
        headers=_hdr(),
    )
    assert errors.status_code == 200
    assert errors.json()["total_matched"] == 1

    health = client.get(
        "/api/v1/dev/logs/read",
        params={"file": "access", "q": "health"},
        headers=_hdr(),
    )
    assert health.json()["total_matched"] == 1
    assert "rid=abc12345-def" in health.json()["lines"][0]["text"]


def test_path_traversal_rejected(client: TestClient, viewer_on: None) -> None:
    for bad in ("../.env", "..\\..\\..\\windows\\win.ini", "access.log", "access/../../.env"):
        res = client.get(
            "/api/v1/dev/logs/read",
            params={"file": bad},
            headers=_hdr(),
        )
        assert res.status_code in {400, 422}, bad
        down = client.get(
            "/api/v1/dev/logs/download",
            params={"file": bad},
            headers=_hdr(),
        )
        assert down.status_code in {400, 422}, bad


def test_download_allowlisted_file(client: TestClient, viewer_on: None) -> None:
    res = client.get("/api/v1/dev/logs/download", params={"file": "access"}, headers=_hdr())
    assert res.status_code == 200
    assert "attachment" in res.headers.get("content-disposition", "")
    assert b"boom" in res.content
    ranged = client.get(
        "/api/v1/dev/logs/download",
        params={"file": "access", "start_line": 2, "end_line": 2},
        headers=_hdr(),
    )
    assert ranged.status_code == 200
    assert b"ERROR" in ranged.content
    assert b"health" not in ranged.content


def test_precise_activity_includes_payload(client: TestClient, viewer_on: None) -> None:
    from app.core.db import SessionLocal
    from app.models import AuditLog

    db = SessionLocal()
    try:
        row = AuditLog(
            actor_user_id=None,
            action="staff.update",
            entity_type="user",
            entity_id="9",
            summary="ویرایش کارکنان تست",
            payload={"role": "receptionist", "also_trainer": True, "password": "SecretPass99"},
            request_id="rid-precise-test-0001",
        )
        db.add(row)
        db.commit()
    finally:
        db.close()

    res = client.get(
        "/api/v1/dev/logs/activity",
        params={"q": "rid-precise-test-0001"},
        headers=_hdr(),
    )
    assert res.status_code == 200, res.text
    items = res.json()["items"]
    assert items
    hit = items[0]
    assert hit["action"] == "staff.update"
    assert hit["request_id"] == "rid-precise-test-0001"
    assert hit["entity_type"] == "user"
    assert hit["payload"]["also_trainer"] is True
    assert "SecretPass99" not in str(hit["payload"])


def test_manager_session_does_not_open_logs(client: TestClient, viewer_on: None) -> None:
    wipe_and_seed()
    login_rate_limiter.reset()
    login = client.post(
        "/api/v1/auth/login",
        json={
            "mobile": "09120000001",
            "password": DEV_STAFF_PASSWORD,
            "kind": "staff",
            "role": "manager",
        },
    )
    assert login.status_code == 200
    assert client.get("/api/v1/dev/logs/files").status_code == 401
    assert client.get("/api/v1/manager/activity").status_code == 200
