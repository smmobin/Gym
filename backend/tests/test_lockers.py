"""Locker assign/release rules — includes_locker only, no separate rent."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.rate_limit import login_rate_limiter
from app.db.seed import DEV_STAFF_PASSWORD, wipe_and_seed
from app.main import app
from app.models import Locker, Member, Membership, MembershipPlan
from app.models.enums import MembershipStatus


@pytest.fixture(scope="module", autouse=True)
def _reseed() -> None:
    wipe_and_seed()


@pytest.fixture(autouse=True)
def _reset_limiter() -> None:
    login_rate_limiter.reset()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _login(client: TestClient, mobile: str = "09120000001") -> None:
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"mobile": mobile, "password": DEV_STAFF_PASSWORD},
        ).status_code
        == 200
    )


def _member_id(display_id: str) -> int:
    db = SessionLocal()
    try:
        m = db.scalar(select(Member).where(Member.display_id == display_id))
        assert m is not None
        return m.id
    finally:
        db.close()


def _free_locker_id() -> int:
    db = SessionLocal()
    try:
        # Prefer a known free seed locker
        for code in ("L-02", "L-03", "L-04", "L-05"):
            locker = db.scalar(select(Locker).where(Locker.code == code))
            if locker is None:
                continue
            from app.services.lockers import active_assignment_for_locker

            if active_assignment_for_locker(db, locker.id) is None:
                return locker.id
        raise AssertionError("no free locker in seed")
    finally:
        db.close()


def _occupied_locker_id() -> int:
    db = SessionLocal()
    try:
        locker = db.scalar(select(Locker).where(Locker.code == "L-01"))
        assert locker is not None
        return locker.id
    finally:
        db.close()


def test_list_unauthorized(client: TestClient) -> None:
    assert client.get("/api/v1/lockers").status_code == 401


def test_trainer_forbidden(client: TestClient) -> None:
    _login(client, "09120000003")
    assert client.get("/api/v1/lockers").status_code == 403
    assert (
        client.post("/api/v1/lockers", json={"code": "L-X"}).status_code == 403
    )


def test_list_and_create_as_desk(client: TestClient) -> None:
    _login(client)
    listed = client.get("/api/v1/lockers")
    assert listed.status_code == 200
    assert listed.json()["total"] >= 2

    created = client.post("/api/v1/lockers", json={"code": "L-99"})
    assert created.status_code == 201
    assert created.json()["code"] == "L-99"
    assert created.json()["is_free"] is True

    dup = client.post("/api/v1/lockers", json={"code": "L-99"})
    assert dup.status_code == 409


def test_receptionist_can_create(client: TestClient) -> None:
    _login(client, "09120000002")
    response = client.post("/api/v1/lockers", json={"code": "L-88"})
    assert response.status_code == 201


def test_assign_with_includes_locker_ok(client: TestClient) -> None:
    _login(client)
    # Release L-01 first if needed so we can re-test with a free locker
    locker_id = _free_locker_id()
    # sara already has L-01 — use a member without locker who has quarter plan
    # Seed: only sara has includes_locker. Give elham a quarter membership via DB for test,
    # or assign after releasing sara's locker to someone else.
    # Simpler: create free locker and assign to sara after releasing L-01.
    occupied = _occupied_locker_id()
    release = client.post(f"/api/v1/lockers/{occupied}/release")
    assert release.status_code == 200
    assert release.json()["locker"]["is_free"] is True

    sara = _member_id("M-1002")
    assigned = client.post(
        f"/api/v1/lockers/{locker_id}/assign",
        json={"member_id": sara, "note": "تست واگذاری"},
    )
    assert assigned.status_code == 200
    body = assigned.json()
    assert body["locker"]["is_free"] is False
    assert body["assignment"]["member_id"] == sara
    assert body["assignment"]["note"] == "تست واگذاری"

    # Member locker endpoint
    mine = client.get(f"/api/v1/members/{sara}/locker")
    assert mine.status_code == 200
    assert mine.json()["locker"] is not None
    assert mine.json()["locker"]["id"] == locker_id


def test_assign_without_includes_locker_rejected(client: TestClient) -> None:
    _login(client)
    # Ensure a free locker
    locker_id = None
    listed = client.get("/api/v1/lockers").json()["items"]
    for item in listed:
        if item["is_free"] and item["is_active"]:
            locker_id = item["id"]
            break
    assert locker_id is not None

    # Ali has month plan without locker
    ali = _member_id("M-1001")
    # Free any locker ali might have from other tests
    for item in listed:
        if (
            item["current_assignment"]
            and item["current_assignment"]["member_id"] == ali
        ):
            client.post(f"/api/v1/lockers/{item['id']}/release")

    response = client.post(
        f"/api/v1/lockers/{locker_id}/assign",
        json={"member_id": ali},
    )
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert "شامل‌کمد" in detail or "اجاره" in detail
    assert "مالی" in detail or "تمدید" in detail


def test_eligible_members_includes_sara_not_ali(client: TestClient) -> None:
    _login(client)
    res = client.get("/api/v1/lockers/eligible-members")
    assert res.status_code == 200
    body = res.json()
    ids = {row["display_id"] for row in body["items"]}
    assert "M-1002" in ids  # سارا — طرح سه‌ماهه + کمد
    assert "M-1001" not in ids  # علی — بدون includes_locker
    _login(client, "09120000003")
    assert client.get("/api/v1/lockers/eligible-members").status_code == 403


def test_assign_occupied_locker_409(client: TestClient) -> None:
    _login(client)
    # Find an occupied locker; if none, assign one first
    items = client.get("/api/v1/lockers").json()["items"]
    occupied_id = next((i["id"] for i in items if not i["is_free"]), None)
    if occupied_id is None:
        # pick free + sara (has includes_locker)
        free_id = next(i["id"] for i in items if i["is_free"] and i["is_active"])
        # release any sara locker first
        sara = _member_id("M-1002")
        for i in items:
            ca = i.get("current_assignment")
            if ca and ca["member_id"] == sara:
                client.post(f"/api/v1/lockers/{i['id']}/release")
        client.post(
            f"/api/v1/lockers/{free_id}/assign",
            json={"member_id": sara},
        )
        occupied_id = free_id

    other = _member_id("M-1008")  # elham — no locker plan
    # Even with wrong member, occupied should 409 before membership check... 
    # Actually order in service: occupied check first, then member. Good.
    response = client.post(
        f"/api/v1/lockers/{occupied_id}/assign",
        json={"member_id": other},
    )
    assert response.status_code == 409
    assert "اشغال" in response.json()["detail"]


def test_member_second_locker_409(client: TestClient) -> None:
    _login(client)
    items = client.get("/api/v1/lockers").json()["items"]
    # Ensure sara has exactly one locker
    sara = _member_id("M-1002")
    sara_lockers = [
        i
        for i in items
        if i.get("current_assignment")
        and i["current_assignment"]["member_id"] == sara
    ]
    if not sara_lockers:
        free_id = next(i["id"] for i in items if i["is_free"] and i["is_active"])
        assert (
            client.post(
                f"/api/v1/lockers/{free_id}/assign",
                json={"member_id": sara},
            ).status_code
            == 200
        )
        items = client.get("/api/v1/lockers").json()["items"]

    free_id = next(
        (i["id"] for i in items if i["is_free"] and i["is_active"]),
        None,
    )
    if free_id is None:
        created = client.post("/api/v1/lockers", json={"code": "L-77"})
        free_id = created.json()["id"]

    response = client.post(
        f"/api/v1/lockers/{free_id}/assign",
        json={"member_id": sara},
    )
    assert response.status_code == 409
    assert "کمد دارد" in response.json()["detail"]


def test_release_frees_and_repeat_409(client: TestClient) -> None:
    _login(client)
    items = client.get("/api/v1/lockers").json()["items"]
    occupied = next((i for i in items if not i["is_free"]), None)
    if occupied is None:
        pytest.skip("no occupied locker")
    lid = occupied["id"]
    first = client.post(f"/api/v1/lockers/{lid}/release")
    assert first.status_code == 200
    assert first.json()["locker"]["is_free"] is True
    assert first.json()["assignment"]["released_at"] is not None

    second = client.post(f"/api/v1/lockers/{lid}/release")
    assert second.status_code == 409


def test_deactivate_occupied_rejected(client: TestClient) -> None:
    _login(client)
    # Create fresh locker, assign sara (after ensuring she is free)
    items = client.get("/api/v1/lockers").json()["items"]
    sara = _member_id("M-1002")
    for i in items:
        ca = i.get("current_assignment")
        if ca and ca["member_id"] == sara:
            client.post(f"/api/v1/lockers/{i['id']}/release")

    created = client.post("/api/v1/lockers", json={"code": "L-55"})
    lid = created.json()["id"]
    assert (
        client.post(
            f"/api/v1/lockers/{lid}/assign",
            json={"member_id": sara},
        ).status_code
        == 200
    )
    patched = client.patch(f"/api/v1/lockers/{lid}", json={"is_active": False})
    assert patched.status_code == 400
    assert "آزادسازی" in patched.json()["detail"]


def test_ambiguous_membership_requires_id(client: TestClient) -> None:
    """If member has two active includes_locker plans, membership_id required."""
    _login(client)
    db = SessionLocal()
    try:
        elham = db.scalar(select(Member).where(Member.display_id == "M-1008"))
        assert elham is not None
        plan = db.scalar(
            select(MembershipPlan).where(MembershipPlan.includes_locker.is_(True))
        )
        assert plan is not None
        from datetime import date, timedelta

        today = date.today()
        m1 = Membership(
            member_id=elham.id,
            plan_id=plan.id,
            agreed_amount_toman=1,
            start_date=today,
            end_date=today + timedelta(days=30),
            status=MembershipStatus.ACTIVE.value,
        )
        m2 = Membership(
            member_id=elham.id,
            plan_id=plan.id,
            agreed_amount_toman=1,
            start_date=today,
            end_date=today + timedelta(days=60),
            status=MembershipStatus.ACTIVE.value,
        )
        db.add_all([m1, m2])
        db.commit()
        elham_id = elham.id
        m1_id = m1.id
    finally:
        db.close()

    # Free elham locker if any
    items = client.get("/api/v1/lockers").json()["items"]
    for i in items:
        ca = i.get("current_assignment")
        if ca and ca["member_id"] == elham_id:
            client.post(f"/api/v1/lockers/{i['id']}/release")

    free_id = next(i["id"] for i in client.get("/api/v1/lockers").json()["items"] if i["is_free"])
    ambiguous = client.post(
        f"/api/v1/lockers/{free_id}/assign",
        json={"member_id": elham_id},
    )
    assert ambiguous.status_code == 400
    assert "membership_id" in ambiguous.json()["detail"]

    ok = client.post(
        f"/api/v1/lockers/{free_id}/assign",
        json={"member_id": elham_id, "membership_id": m1_id},
    )
    assert ok.status_code == 200
