"""Destructive seed/wipe must not run on a real-server APP_ENV."""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.core.config import Settings, get_settings
from app.core.db import SessionLocal
from app.db.data_guard import destructive_block_reason
from app.db.seed import clear_domain_data, seed, wipe_and_seed
from app.db.wipe_dev_data import wipe
from app.models.member import Member
from app.models.membership import MembershipPlan

_BACKEND = Path(__file__).resolve().parents[1]
_REPO = _BACKEND.parent


def test_block_reason_matrix() -> None:
    production = Settings(app_env="production", allow_destructive_seed=True, secret_key="k" * 40)
    reason = destructive_block_reason(production, action="wipe")
    assert reason is not None
    assert "Refuse wipe" in reason
    assert "even when ALLOW_DESTRUCTIVE_SEED=true" in reason

    prod_alias = Settings(app_env="prod", allow_destructive_seed=True, secret_key="k" * 40)
    assert "Refuse seed" in (destructive_block_reason(prod_alias, action="seed") or "")

    mixed_case = Settings(app_env="Production", allow_destructive_seed=False, secret_key="k" * 40)
    assert destructive_block_reason(mixed_case, action="wipe_and_seed")

    staging_off = Settings(app_env="staging", allow_destructive_seed=False, secret_key="k" * 40)
    staging_reason = destructive_block_reason(staging_off, action="seed")
    assert staging_reason is not None
    assert "Refuse seed" in staging_reason
    assert "staging" in staging_reason

    staging_on = Settings(app_env="staging", allow_destructive_seed=True, secret_key="k" * 40)
    assert destructive_block_reason(staging_on, action="wipe") is None

    development = Settings(app_env="development", allow_destructive_seed=False, secret_key="x")
    assert destructive_block_reason(development, action="wipe_and_seed") is None


def _count(db, model) -> int:
    return int(db.scalar(select(func.count()).select_from(model)) or 0)


def test_real_server_flag_does_not_delete_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    db = SessionLocal()
    try:
        clear_domain_data(db)
        db.add(
            Member(
                display_id="M-1001",
                first_name="واقعی",
                last_name="باشگاه",
                mobile="09124000009",
                status="active",
            )
        )
        db.add(
            MembershipPlan(
                name="طرح ماندگار",
                duration_days=30,
                base_price_toman=1500000,
            )
        )
        db.commit()
        assert _count(db, Member) == 1
        assert _count(db, MembershipPlan) == 1

        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("ALLOW_DESTRUCTIVE_SEED", "true")
        get_settings.cache_clear()

        for action in (wipe_and_seed, seed, wipe):
            with pytest.raises(SystemExit) as exc:
                action()
            assert "Refuse " in str(exc.value)
        with pytest.raises(SystemExit) as exc:
            clear_domain_data(db)
        assert "Refuse wipe" in str(exc.value)

        db.expire_all()
        assert _count(db, Member) == 1
        assert _count(db, MembershipPlan) == 1
        kept = db.scalar(select(Member).where(Member.mobile == "09124000009"))
        assert kept is not None
        assert kept.first_name == "واقعی"
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()
        db.close()


def test_staging_without_flag_does_not_wipe(monkeypatch: pytest.MonkeyPatch) -> None:
    db = SessionLocal()
    try:
        clear_domain_data(db)
        db.add(
            Member(
                display_id="M-1001",
                first_name="استیج",
                last_name="تست",
                mobile="09124000008",
                status="active",
            )
        )
        db.commit()
        monkeypatch.setenv("APP_ENV", "staging")
        monkeypatch.setenv("ALLOW_DESTRUCTIVE_SEED", "false")
        get_settings.cache_clear()

        with pytest.raises(SystemExit) as exc:
            wipe_and_seed()
        assert "Refuse wipe_and_seed" in str(exc.value)
        assert "staging" in str(exc.value)

        db.expire_all()
        assert _count(db, Member) == 1
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()
        db.close()


def test_deploy_examples_do_not_seed_or_wipe() -> None:
    dockerfile = (_BACKEND / "Dockerfile").read_text(encoding="utf-8")
    compose = (_REPO / "docker-compose.yml").read_text(encoding="utf-8")
    serve = (_BACKEND / "app" / "db" / "serve.py").read_text(encoding="utf-8")
    for text in (dockerfile, compose, serve):
        assert "app.db.seed" not in text
        assert "wipe_dev_data" not in text
        assert "wipe_and_seed" not in text
        assert "clear_domain_data" not in text
    assert "app.db.serve" in dockerfile
    assert 'command: ["python", "-m", "app.db.serve"]' in compose
    assert "upgrade" in serve
    assert "uvicorn" in serve
    assert '"--workers"' in serve
    assert '"1"' in serve
