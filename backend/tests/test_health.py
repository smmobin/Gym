from fastapi.testclient import TestClient


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


def test_health_db_connected(client: TestClient) -> None:
    response = client.get("/api/v1/health/db")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "connected"
