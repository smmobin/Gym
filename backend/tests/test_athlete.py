"""Athlete login + self-scoped APIs: hard boundary between members and staff cookies."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.rate_limit import login_rate_limiter
from app.db.seed import DEV_ATHLETE_PASSWORD, DEV_STAFF_PASSWORD, wipe_and_seed
from app.main import app
from app.models import Member, StaffNotification, WorkoutPlan
from app.models.enums import MemberStatus


@pytest.fixture(scope="module", autouse=True)
def _reseed() -> None:
    wipe_and_seed()


@pytest.fixture(autouse=True)
def _reset_limiter() -> None:
    login_rate_limiter.reset()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _athlete_login(
    client: TestClient, mobile: str = "09121111001", password: str = DEV_ATHLETE_PASSWORD
) -> None:
    assert (
        client.post(
            "/api/v1/athlete/auth/login",
            json={"mobile": mobile, "password": password},
        ).status_code
        == 200
    )


def _staff_login(client: TestClient, mobile: str = "09120000001") -> None:
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"mobile": mobile, "password": DEV_STAFF_PASSWORD},
        ).status_code
        == 200
    )


def test_unauthorized_athlete_routes(client: TestClient) -> None:
    assert client.get("/api/v1/athlete/auth/me").status_code == 401
    assert client.get("/api/v1/athlete/memberships").status_code == 401
    assert client.get("/api/v1/athlete/payments").status_code == 401
    assert client.get("/api/v1/athlete/workout-plans").status_code == 401
    assert client.get("/api/v1/athlete/notifications").status_code == 401
    assert client.get("/api/v1/athlete/group-classes").status_code == 401
    assert client.post("/api/v1/athlete/renewal-requests", json={}).status_code == 401


def test_athlete_login_ok_and_me(client: TestClient) -> None:
    response = client.post(
        "/api/v1/athlete/auth/login",
        json={"mobile": "09121111001", "password": DEV_ATHLETE_PASSWORD},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["member"]["mobile"] == "09121111001"
    assert body["member"]["display_id"] == "M-1001"
    assert "gym_athlete_session" in response.cookies

    me = client.get("/api/v1/athlete/auth/me")
    assert me.status_code == 200
    assert me.json()["member"]["first_name"] == "علی"


def test_wrong_password_401(client: TestClient) -> None:
    response = client.post(
        "/api/v1/athlete/auth/login",
        json={"mobile": "09121111001", "password": "WrongPass9"},
    )
    assert response.status_code == 401


def test_member_without_password_clear_error(client: TestClient) -> None:
    # Sara has no password_hash in seed — password path asks to use OTP / desk
    response = client.post(
        "/api/v1/athlete/auth/login",
        json={"mobile": "09121111002", "password": DEV_ATHLETE_PASSWORD},
    )
    assert response.status_code == 400
    assert "رمز" in response.json()["detail"]



def test_staff_cookie_not_enough_for_athlete(client: TestClient) -> None:
    _staff_login(client)
    assert client.get("/api/v1/athlete/auth/me").status_code == 401
    assert client.get("/api/v1/athlete/memberships").status_code == 401


def test_athlete_cookie_not_enough_for_staff(client: TestClient) -> None:
    _athlete_login(client)
    assert client.get("/api/v1/auth/me").status_code == 401
    assert client.get("/api/v1/members").status_code == 401
    assert client.get("/api/v1/gym-settings").status_code == 401


def test_athlete_sees_only_own_memberships_and_debt(client: TestClient) -> None:
    _athlete_login(client, "09121111001")
    data = client.get("/api/v1/athlete/memberships").json()
    assert data["total"] >= 1
    with SessionLocal() as session:
        ali = session.scalar(select(Member).where(Member.mobile == "09121111001"))
        assert ali is not None
        for item in data["items"]:
            # Membership ids belong to Ali — verified via DB
            from app.models import Membership

            row = session.get(Membership, item["id"])
            assert row is not None
            assert row.member_id == ali.id
    assert "debt_toman" in data
    assert data["debt_toman"] >= 0


def test_athlete_a_cannot_read_b_notification(client: TestClient) -> None:
    # Hosein notification id must 404 for Ali
    with SessionLocal() as session:
        hosein = session.scalar(select(Member).where(Member.mobile == "09121111005"))
        assert hosein is not None
        from app.models import AthleteNotification

        other = session.scalar(
            select(AthleteNotification).where(
                AthleteNotification.member_id == hosein.id
            )
        )
        assert other is not None
        other_id = other.id

    _athlete_login(client, "09121111001")
    assert (
        client.post(f"/api/v1/athlete/notifications/{other_id}/read").status_code
        == 404
    )


def test_athlete_read_all_only_own(client: TestClient) -> None:
    from app.models import AthleteNotification

    with SessionLocal() as session:
        hosein = session.scalar(select(Member).where(Member.mobile == "09121111005"))
        ali = session.scalar(select(Member).where(Member.mobile == "09121111001"))
        assert hosein is not None and ali is not None
        hosein_unread_before = session.scalar(
            select(AthleteNotification)
            .where(
                AthleteNotification.member_id == hosein.id,
                AthleteNotification.is_read.is_(False),
            )
            .limit(1)
        )
        assert hosein_unread_before is not None
        hosein_id = hosein_unread_before.id

        # Ensure Ali has at least one unread
        ali_unread = session.scalar(
            select(AthleteNotification).where(
                AthleteNotification.member_id == ali.id,
                AthleteNotification.is_read.is_(False),
            )
        )
        if ali_unread is None:
            session.add(
                AthleteNotification(
                    member_id=ali.id,
                    kind="test_unread",
                    title="نمونه خوانده‌نشده",
                    body="برای تست read-all",
                    is_read=False,
                )
            )
            session.commit()

    _athlete_login(client, "09121111001")
    before = client.get("/api/v1/athlete/notifications").json()
    assert before["unread_count"] >= 1

    marked = client.post("/api/v1/athlete/notifications/read-all")
    assert marked.status_code == 200
    assert marked.json()["marked"] >= 1

    after = client.get("/api/v1/athlete/notifications").json()
    assert after["unread_count"] == 0
    assert all(n["is_read"] for n in after["items"])

    with SessionLocal() as session:
        hosein_row = session.get(AthleteNotification, hosein_id)
        assert hosein_row is not None
        assert hosein_row.is_read is False


def test_workout_plans_only_own(client: TestClient) -> None:
    _athlete_login(client, "09121111001")
    data = client.get("/api/v1/athlete/workout-plans").json()
    with SessionLocal() as session:
        ali = session.scalar(select(Member).where(Member.mobile == "09121111001"))
        assert ali is not None
        own_ids = set(
            session.scalars(
                select(WorkoutPlan.id).where(WorkoutPlan.member_id == ali.id)
            ).all()
        )
        for item in data["items"]:
            assert item["id"] in own_ids
        # Hosein plans must not appear
        hosein = session.scalar(select(Member).where(Member.mobile == "09121111005"))
        assert hosein is not None
        hosein_ids = set(
            session.scalars(
                select(WorkoutPlan.id).where(WorkoutPlan.member_id == hosein.id)
            ).all()
        )
        returned = {i["id"] for i in data["items"]}
        assert returned.isdisjoint(hosein_ids)


def test_renewal_creates_staff_notification(client: TestClient) -> None:
    _athlete_login(client, "09121111001")
    created = client.post(
        "/api/v1/athlete/renewal-requests",
        json={"note": "لطفاً ماهانه تمدید شود"},
    )
    assert created.status_code == 200
    staff_id = created.json()["staff_notification_id"]
    with SessionLocal() as session:
        row = session.get(StaffNotification, staff_id)
        assert row is not None
        assert row.kind == "renewal_request"
        assert row.role_audience == "desk"
        assert "علی" in row.title or "رضایی" in (row.body or "")


def test_desk_sets_athlete_password(client: TestClient) -> None:
    _staff_login(client, "09120000002")  # receptionist
    with SessionLocal() as session:
        sara = session.scalar(select(Member).where(Member.mobile == "09121111002"))
        assert sara is not None
        member_id = sara.id

    set_pw = client.post(
        f"/api/v1/members/{member_id}/athlete-password",
        json={"password": "SaraPass99"},
    )
    assert set_pw.status_code == 200

    athlete = TestClient(app)
    login = athlete.post(
        "/api/v1/athlete/auth/login",
        json={"mobile": "09121111002", "password": "SaraPass99"},
    )
    assert login.status_code == 200


def test_trainer_cannot_set_athlete_password(client: TestClient) -> None:
    _staff_login(client, "09120000003")
    with SessionLocal() as session:
        ali = session.scalar(select(Member).where(Member.mobile == "09121111001"))
        assert ali is not None
        member_id = ali.id
    assert (
        client.post(
            f"/api/v1/members/{member_id}/athlete-password",
            json={"password": "TrainerNo1"},
        ).status_code
        == 403
    )


def test_archived_cannot_login(client: TestClient) -> None:
    with SessionLocal() as session:
        ali = session.scalar(select(Member).where(Member.mobile == "09121111001"))
        assert ali is not None
        ali.status = MemberStatus.ARCHIVED.value
        session.commit()
    try:
        response = client.post(
            "/api/v1/athlete/auth/login",
            json={"mobile": "09121111001", "password": DEV_ATHLETE_PASSWORD},
        )
        assert response.status_code == 401
    finally:
        with SessionLocal() as session:
            ali = session.scalar(select(Member).where(Member.mobile == "09121111001"))
            assert ali is not None
            ali.status = MemberStatus.ACTIVE.value
            ali.archived_at = None
            session.commit()


def test_mark_own_notification_read(client: TestClient) -> None:
    _athlete_login(client, "09121111001")
    listed = client.get("/api/v1/athlete/notifications")
    assert listed.status_code == 200
    items = listed.json()["items"]
    assert items
    target = items[0]
    marked = client.post(f"/api/v1/athlete/notifications/{target['id']}/read")
    assert marked.status_code == 200
    assert marked.json()["is_read"] is True
