"""Seed must refuse production-like APP_ENV without explicit override."""

from __future__ import annotations

import pytest

from app.core import config as config_mod
from app.db import seed as seed_mod


def test_seed_main_refuses_production(monkeypatch: pytest.MonkeyPatch) -> None:
    config_mod.get_settings.cache_clear()
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("ALLOW_DESTRUCTIVE_SEED", "false")
    monkeypatch.setenv("SECRET_KEY", "x" * 40)
    config_mod.get_settings.cache_clear()

    with pytest.raises(SystemExit) as exc:
        seed_mod.main()
    assert "Refuse seed" in str(exc.value)

    config_mod.get_settings.cache_clear()
