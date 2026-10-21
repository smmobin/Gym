"""wipe_dev_data must refuse production-like APP_ENV without destructive flag."""

from __future__ import annotations

import pytest

from app.core import config as config_mod
from app.db import wipe_dev_data as wipe_mod


def test_wipe_main_refuses_production(monkeypatch: pytest.MonkeyPatch) -> None:
    config_mod.get_settings.cache_clear()
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("ALLOW_DESTRUCTIVE_SEED", "false")
    monkeypatch.setenv("SECRET_KEY", "x" * 40)
    config_mod.get_settings.cache_clear()

    with pytest.raises(SystemExit) as exc:
        wipe_mod.wipe()
    assert "Refuse wipe" in str(exc.value)

    config_mod.get_settings.cache_clear()

