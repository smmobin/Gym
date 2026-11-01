"""Public + desk testimonials for landing quotes."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.rate_limit import public_testimonials_rate_limiter
from app.db.seed import wipe_and_seed
from app.main import app


@pytest.fixture(scope="module", autouse=True)
def _reseed() -> None:
    wipe_and_seed()


@pytest.fixture(autouse=True)
def _reset_limiter() -> None:
    public_testimonials_rate_limiter.reset()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _login(client: TestClient, mobile: str = "09120000001") -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"mobile": mobile, "password": "ChangeMe123"},
    )
    assert response.status_code == 200


def test_public_testimonials_without_auth(client: TestClient) -> None:
    response = client.get("/api/v1/public/testimonials")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 3
    assert len(body["items"]) == body["total"]
    for item in body["items"]:
        assert "id" in item
        assert "body" in item
        assert "author_name" in item
        assert "is_active" not in item


def test_desk_list_requires_auth(client: TestClient) -> None:
    assert client.get("/api/v1/testimonials").status_code == 401


def test_manager_crud_and_public_visibility(client: TestClient) -> None:
    _login(client)
    created = client.post(
        "/api/v1/testimonials",
        json={
            "body": "تست نظر مدیریتی برای لندینگ.",
            "author_name": "عضو تست",
            "author_meta": "عضو ماهانه",
            "sort_order": 5,
            "is_active": True,
        },
    )
    assert created.status_code == 201
    tid = created.json()["testimonial"]["id"]

    public = client.get("/api/v1/public/testimonials")
    assert public.status_code == 200
    assert any(i["id"] == tid for i in public.json()["items"])

    patched = client.patch(
        f"/api/v1/testimonials/{tid}",
        json={"is_active": False},
    )
    assert patched.status_code == 200
    assert patched.json()["testimonial"]["is_active"] is False

    public2 = client.get("/api/v1/public/testimonials")
    assert all(i["id"] != tid for i in public2.json()["items"])

    listed = client.get("/api/v1/testimonials?include_inactive=1")
    assert listed.status_code == 200
    assert any(i["id"] == tid and i["is_active"] is False for i in listed.json()["items"])


def test_trainer_forbidden(client: TestClient) -> None:
    _login(client, mobile="09120000003")
    assert client.get("/api/v1/testimonials").status_code == 403
    assert (
        client.post(
            "/api/v1/testimonials",
            json={"body": "x", "author_name": "y"},
        ).status_code
        == 403
    )
