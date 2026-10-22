"""Staff CRUD, plan CRUD, bootstrap manager, price immutability on past memberships."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.core.db import SessionLocal
from app.core.rate_limit import login_rate_limiter
from app.db.bootstrap_manager import BootstrapError, bootstrap_manager, count_managers
from app.db.seed import DEV_STAFF_PASSWORD, wipe_and_seed
from app.main import app
from app.models import AuditLog, Membership, MembershipPlan, StaffSession, User
from app.models.enums import StaffRole


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


def test_bootstrap_manager_only_when_zero_managers() -> None:
    wipe_and_seed()
    db = SessionLocal()
    try:
        assert count_managers(db) >= 1
        with pytest.raises(BootstrapError) as exc:
            bootstrap_manager(
                mobile="09129999001",
                password="Bootstrap99",
                full_name="مدیر تست",
                db=db,
            )
        assert exc.value.exit_code == 2
        db.rollback()

        # Demote managers so count is zero (avoid deleting rows that audit_logs FK to)
        managers = list(
            db.scalars(select(User).where(User.role == StaffRole.MANAGER.value)).all()
        )
        for m in managers:
            db.execute(delete(StaffSession).where(StaffSession.user_id == m.id))
            m.role = StaffRole.RECEPTIONIST.value
        db.commit()
        assert count_managers(db) == 0

        row = bootstrap_manager(
            mobile="09129999001",
            password="Bootstrap99",
            full_name="مدیر بوت‌استرپ",
            db=db,
        )
        db.commit()
        assert row.role == StaffRole.MANAGER.value
        assert row.mobile == "09129999001"
        assert count_managers(db) == 1

        with pytest.raises(BootstrapError):
            bootstrap_manager(
                mobile="09129999002",
                password="Bootstrap99",
                full_name="مدیر دوم",
                db=db,
            )
        db.rollback()
    finally:
        db.close()
        wipe_and_seed()


def test_manager_creates_receptionist_and_trainer(client: TestClient) -> None:
    wipe_and_seed()
    _login(client)
    recv = client.post(
        "/api/v1/staff",
        json={
            "mobile": "09128888001",
            "password": "StaffPass1",
            "full_name": "منشی جدید",
            "role": "receptionist",
        },
    )
    assert recv.status_code == 201
    assert recv.json()["user"]["role"] == "receptionist"

    tr = client.post(
        "/api/v1/staff",
        json={
            "mobile": "09128888002",
            "password": "StaffPass1",
            "full_name": "مربی جدید",
            "role": "trainer",
        },
    )
    assert tr.status_code == 201
    trainer_id = tr.json()["user"]["id"]

    patch = client.patch(
        f"/api/v1/staff/{trainer_id}",
        json={"full_name": "مربی ویرایش‌شده", "password": "NewPass123"},
    )
    assert patch.status_code == 200
    assert patch.json()["user"]["full_name"] == "مربی ویرایش‌شده"

    deact = client.post(f"/api/v1/staff/{trainer_id}/deactivate")
    assert deact.status_code == 200
    assert deact.json()["user"]["is_active"] is False

    # Inactive trainer cannot login
    login_rate_limiter.reset()
    bad = client.post(
        "/api/v1/auth/login",
        json={"mobile": "09128888002", "password": "NewPass123"},
    )
    assert bad.status_code == 401

    act = client.post(f"/api/v1/staff/{trainer_id}/activate")
    assert act.status_code == 200
    assert act.json()["user"]["is_active"] is True

    db = SessionLocal()
    try:
        audits = list(
            db.scalars(
                select(AuditLog).where(AuditLog.entity_type == "user").order_by(AuditLog.id.desc())
            ).all()
        )
        assert any(a.action.startswith("staff.") for a in audits)
    finally:
        db.close()


def test_receptionist_creates_trainer_not_receptionist(client: TestClient) -> None:
    wipe_and_seed()
    _login(client, "09120000002")
    ok = client.post(
        "/api/v1/staff",
        json={
            "mobile": "09128888003",
            "password": "StaffPass1",
            "full_name": "مربی منشی",
            "role": "trainer",
        },
    )
    assert ok.status_code == 201

    forbidden = client.post(
        "/api/v1/staff",
        json={
            "mobile": "09128888004",
            "password": "StaffPass1",
            "full_name": "منشی غیرمجاز",
            "role": "receptionist",
        },
    )
    assert forbidden.status_code == 403

    listed = client.get("/api/v1/staff")
    assert listed.status_code == 200
    roles = {u["role"] for u in listed.json()["items"]}
    assert roles == {"trainer"}


def test_trainer_forbidden_on_staff_and_plans(client: TestClient) -> None:
    wipe_and_seed()
    _login(client, "09120000003")
    assert client.get("/api/v1/staff").status_code == 403
    assert (
        client.post(
            "/api/v1/staff",
            json={
                "mobile": "09128888005",
                "password": "StaffPass1",
                "full_name": "x",
                "role": "trainer",
            },
        ).status_code
        == 403
    )
    assert client.get("/api/v1/membership-plans").status_code == 403
    assert (
        client.post(
            "/api/v1/membership-plans",
            json={
                "name": "طرح تست",
                "duration_days": 30,
                "base_price_toman": 1000,
            },
        ).status_code
        == 403
    )


def test_plan_crud_manager_and_receptionist_price_immutable(client: TestClient) -> None:
    wipe_and_seed()
    _login(client)
    created = client.post(
        "/api/v1/membership-plans",
        json={
            "name": "طرح تست قیمت",
            "duration_days": 30,
            "base_price_toman": 500_000,
            "includes_locker": False,
        },
    )
    assert created.status_code == 201
    plan_id = created.json()["plan"]["id"]
    old_price = created.json()["plan"]["base_price_toman"]

    # Attach a membership to this plan with agreed amount
    db = SessionLocal()
    try:
        from datetime import date

        from app.models import Member
        from app.models.enums import MembershipStatus

        member = db.scalar(select(Member).where(Member.display_id == "M-1001"))
        assert member is not None
        m = Membership(
            member_id=member.id,
            plan_id=plan_id,
            agreed_amount_toman=old_price,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 31),
            status=MembershipStatus.ACTIVE.value,
        )
        db.add(m)
        db.commit()
        membership_id = m.id
    finally:
        db.close()

    patched = client.patch(
        f"/api/v1/membership-plans/{plan_id}",
        json={"base_price_toman": 900_000},
    )
    assert patched.status_code == 200
    assert patched.json()["plan"]["base_price_toman"] == 900_000

    db = SessionLocal()
    try:
        membership = db.get(Membership, membership_id)
        assert membership is not None
        assert membership.agreed_amount_toman == old_price
        plan = db.get(MembershipPlan, plan_id)
        assert plan is not None
        assert plan.base_price_toman == 900_000
    finally:
        db.close()

    # Receptionist can create/update too
    client.post("/api/v1/auth/logout")
    login_rate_limiter.reset()
    _login(client, "09120000002")
    r_create = client.post(
        "/api/v1/membership-plans",
        json={
            "name": "طرح منشی",
            "session_count": 8,
            "base_price_toman": 0,
            "includes_locker": True,
        },
    )
    assert r_create.status_code == 201
    assert r_create.json()["plan"]["includes_locker"] is True
    assert r_create.json()["plan"]["base_price_toman"] == 0


def test_inactive_plan_hidden_from_default_list(client: TestClient) -> None:
    wipe_and_seed()
    _login(client)
    created = client.post(
        "/api/v1/membership-plans",
        json={
            "name": "طرح موقت غیرفعال",
            "duration_days": 7,
            "base_price_toman": 1000,
        },
    )
    plan_id = created.json()["plan"]["id"]
    assert (
        client.patch(
            f"/api/v1/membership-plans/{plan_id}",
            json={"is_active": False},
        ).status_code
        == 200
    )

    active_only = client.get("/api/v1/membership-plans")
    assert active_only.status_code == 200
    ids = {p["id"] for p in active_only.json()["items"]}
    assert plan_id not in ids
    assert all(p["is_active"] for p in active_only.json()["items"])

    with_inactive = client.get("/api/v1/membership-plans?include_inactive=1")
    assert with_inactive.status_code == 200
    found = next(p for p in with_inactive.json()["items"] if p["id"] == plan_id)
    assert found["is_active"] is False


def test_deactivate_revokes_sessions(client: TestClient) -> None:
    wipe_and_seed()
    _login(client)
    created = client.post(
        "/api/v1/staff",
        json={
            "mobile": "09128888006",
            "password": "StaffPass1",
            "full_name": "مربی سشن",
            "role": "trainer",
        },
    )
    trainer_id = created.json()["user"]["id"]

    other = TestClient(app)
    assert (
        other.post(
            "/api/v1/auth/login",
            json={"mobile": "09128888006", "password": "StaffPass1"},
        ).status_code
        == 200
    )
    assert other.get("/api/v1/auth/me").status_code == 200

    assert client.post(f"/api/v1/staff/{trainer_id}/deactivate").status_code == 200
    assert other.get("/api/v1/auth/me").status_code == 401
