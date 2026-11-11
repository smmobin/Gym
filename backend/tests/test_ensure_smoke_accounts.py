"""Smoke accounts are insert-only and idempotent, including on production."""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.db.bootstrap_manager import bootstrap_manager, count_managers
from app.db.ensure_smoke_accounts import (
    SmokeError,
    ensure_smoke_accounts,
    main,
    missing_slots,
)
from app.db.seed import DEV_STAFF_PASSWORD, clear_domain_data
from app.models.audit import AuditLog
from app.models.enums import StaffRole
from app.models.member import Member
from app.models.membership import MembershipPlan
from app.models.payment import Payment
from app.models.user import User

PASSWORD = "SmokePass99"
OTHER_PASSWORD = "SmokePass98"


def _fields(**overrides: str | None) -> dict[str, str | None]:
    base: dict[str, str | None] = {
        "manager_mobile": "09123000001",
        "manager_name": "مدیر دود",
        "manager_password": PASSWORD,
        "receptionist_mobile": "09123000002",
        "receptionist_name": "منشی دود",
        "receptionist_password": PASSWORD,
        "trainer_mobile": "09123000003",
        "trainer_name": "مربی دود",
        "trainer_password": PASSWORD,
        "member_mobile": "09123000004",
        "member_first": "عضو",
        "member_last": "دود",
        "member_password": PASSWORD,
    }
    base.update(overrides)
    return base


def _count(db, model) -> int:
    return int(db.scalar(select(func.count()).select_from(model)) or 0)


def _user(db, role: str) -> User:
    row = db.scalar(select(User).where(User.role == role).order_by(User.id.asc()))
    assert row is not None
    return row


def test_script_source_never_deletes() -> None:
    text = (
        Path(__file__).resolve().parents[1] / "app" / "db" / "ensure_smoke_accounts.py"
    ).read_text(encoding="utf-8")
    assert "delete(" not in text
    assert "clear_domain_data" not in text
    assert "wipe_and_seed" not in text


def test_inserts_once_on_production_and_leaves_other_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    db = SessionLocal()
    try:
        clear_domain_data(db)
        plan = MembershipPlan(name="طرح ماندگار", duration_days=30, base_price_toman=900000)
        db.add(plan)
        db.commit()
        plan_id = plan.id

        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("ALLOW_DESTRUCTIVE_SEED", "false")
        get_settings.cache_clear()

        first = ensure_smoke_accounts(db, **_fields())
        db.commit()
        assert first.created == ["manager", "receptionist", "trainer", "member"]
        assert first.skipped == []
        assert _count(db, User) == 3
        assert _count(db, Member) == 1
        assert _count(db, Payment) == 0
        assert _count(db, AuditLog) == 4
        assert db.get(MembershipPlan, plan_id) is not None

        manager = _user(db, StaffRole.MANAGER.value)
        password_hash = manager.password_hash
        full_name = manager.full_name
        audits = _count(db, AuditLog)

        second = ensure_smoke_accounts(
            db,
            **_fields(
                manager_password=OTHER_PASSWORD,
                manager_name="نام دیگر",
                manager_mobile="09129999999",
            ),
        )
        db.commit()
        assert second.created == []
        assert second.skipped == ["manager", "receptionist", "trainer", "member"]
        assert second.skip_reason["manager"] == "role_exists"
        assert second.skip_reason["member"] == "members_exist"
        db.expire_all()
        assert _count(db, User) == 3
        assert _count(db, Member) == 1
        assert _count(db, Payment) == 0
        assert _count(db, AuditLog) == audits
        again = _user(db, StaffRole.MANAGER.value)
        assert again.password_hash == password_hash
        assert again.full_name == full_name
        assert again.mobile == "09123000001"
        assert db.get(MembershipPlan, plan_id) is not None
        assert missing_slots(db) == []
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()
        db.close()


def test_dev_password_and_collision_write_nothing() -> None:
    db = SessionLocal()
    try:
        clear_domain_data(db)
        db.commit()
        with pytest.raises(SmokeError):
            ensure_smoke_accounts(db, **_fields(manager_password=DEV_STAFF_PASSWORD))
        assert _count(db, User) == 0
        assert _count(db, Member) == 0

        created = bootstrap_manager(
            mobile="09123000001",
            password=PASSWORD,
            full_name="مدیر موجود",
            db=db,
        )
        db.commit()
        manager_id = created.id
        with pytest.raises(SmokeError):
            ensure_smoke_accounts(
                db,
                **_fields(receptionist_mobile="09123000001"),
            )
        db.expire_all()
        assert _count(db, User) == 1
        kept = db.get(User, manager_id)
        assert kept is not None
        assert kept.role == StaffRole.MANAGER.value
        assert kept.full_name == "مدیر موجود"
        assert _count(db, Member) == 0
    finally:
        db.close()


def test_existing_manager_skips_bootstrap_and_keeps_real_member(monkeypatch: pytest.MonkeyPatch) -> None:
    db = SessionLocal()
    calls = {"n": 0}
    real = bootstrap_manager

    def _wrapped(**kwargs):
        calls["n"] += 1
        return real(**kwargs)

    try:
        clear_domain_data(db)
        row = bootstrap_manager(
            mobile="09123000001",
            password=PASSWORD,
            full_name="مدیر موجود",
            db=db,
        )
        member = Member(
            display_id="M-1001",
            first_name="واقعی",
            last_name="باشگاه",
            mobile="09124000009",
            status="active",
        )
        db.add(member)
        db.commit()
        member_id = member.id
        hash_before = row.password_hash

        monkeypatch.setattr("app.db.ensure_smoke_accounts.bootstrap_manager", _wrapped)
        report = ensure_smoke_accounts(db, **_fields(member_mobile="09123000004", member_first="نباید", member_last="ساختهشود"))
        db.commit()

        assert calls["n"] == 0
        assert "manager" in report.skipped
        assert "member" in report.skipped
        assert report.skip_reason["member"] == "members_exist"
        assert "receptionist" in report.created
        assert "trainer" in report.created
        assert count_managers(db) == 1
        db.expire_all()
        manager = db.get(User, row.id)
        assert manager is not None
        assert manager.mobile == "09123000001"
        assert manager.password_hash == hash_before
        kept = db.get(Member, member_id)
        assert kept is not None
        assert kept.first_name == "واقعی"
        assert _count(db, Member) == 1
    finally:
        db.close()


def test_cli_hides_password_and_second_run_needs_no_secret(capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch) -> None:
    db = SessionLocal()
    try:
        clear_domain_data(db)
        db.commit()
    finally:
        db.close()

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SMOKE_MANAGER_PASSWORD", PASSWORD)
    monkeypatch.setenv("SMOKE_RECEPTIONIST_PASSWORD", PASSWORD)
    monkeypatch.setenv("SMOKE_TRAINER_PASSWORD", PASSWORD)
    monkeypatch.setenv("SMOKE_MEMBER_PASSWORD", PASSWORD)
    get_settings.cache_clear()
    argv = [
        "--manager-mobile",
        "09123000001",
        "--manager-name",
        "مدیر دود",
        "--receptionist-mobile",
        "09123000002",
        "--receptionist-name",
        "منشی دود",
        "--trainer-mobile",
        "09123000003",
        "--trainer-name",
        "مربی دود",
        "--member-mobile",
        "09123000004",
        "--member-first",
        "عضو",
        "--member-last",
        "دود",
        "--manager-password",
        PASSWORD,
    ]
    try:
        assert main(argv) == 0
        captured = capsys.readouterr()
        assert PASSWORD not in captured.out
        assert PASSWORD not in captured.err
        assert "ساخته شد" in captured.out

        for key in (
            "SMOKE_MANAGER_PASSWORD",
            "SMOKE_RECEPTIONIST_PASSWORD",
            "SMOKE_TRAINER_PASSWORD",
            "SMOKE_MEMBER_PASSWORD",
        ):
            monkeypatch.delenv(key, raising=False)
        argv_without_password = [item for item in argv if item != "--manager-password" and item != PASSWORD]
        assert main(argv_without_password) == 0
        captured = capsys.readouterr()
        assert PASSWORD not in captured.out
        assert "رد شد" in captured.out
        assert "ساخته شد" not in captured.out

        db = SessionLocal()
        try:
            assert _count(db, User) == 3
            assert _count(db, Member) == 1
        finally:
            db.close()
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()
