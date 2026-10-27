from fastapi.testclient import TestClient

from app.main import FRONTEND_DIST, _frontend_dist_ready, _should_serve_frontend


def test_health_ok(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_root_exposes_docs_hint(client: TestClient) -> None:
    response = client.get("/")
    assert response.status_code == 200
    body = response.json()
    assert "docs" in body
    assert body["health"] == "/api/v1/health"


def test_pytest_never_auto_mounts_frontend() -> None:
    """Even if frontend/dist exists on disk, pytest must keep JSON GET /."""
    assert _should_serve_frontend() is False
    # helper itself stays usable for ops checks
    assert isinstance(_frontend_dist_ready(), bool)
    assert FRONTEND_DIST.name == "dist"


def test_health_db_connected(client: TestClient) -> None:
    response = client.get("/api/v1/health/db")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "connected"
