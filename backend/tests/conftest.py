"""
Pytest bootstrap: force a dedicated Postgres DB so everyday gym_control is never wiped.

Must run before any test module imports app.core.db / app.main.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from urllib.parse import urlparse, urlunparse

# ---------------------------------------------------------------------------
# 1) Resolve TEST DB URL and set DATABASE_URL before app imports
# ---------------------------------------------------------------------------

_EVERYDAY_DB_NAMES = frozenset({"gym_control"})
_DEFAULT_TEST_DB_NAME = "gym_control_test"
_BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _load_database_url_from_dotenv() -> str:
    """Read DATABASE_URL from backend/.env without importing the app (no secrets printed)."""
    env_path = _BACKEND_ROOT / ".env"
    if not env_path.is_file():
        return ""
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("DATABASE_URL="):
            return stripped.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def _database_name(url: str) -> str:
    path = urlparse(url).path or ""
    name = path.lstrip("/").split("/")[0].split("?")[0]
    return name


def _replace_database_name(url: str, new_name: str) -> str:
    parsed = urlparse(url)
    return urlunparse(parsed._replace(path=f"/{new_name}"))


def _resolve_test_database_url() -> str:
    explicit = (os.environ.get("TEST_DATABASE_URL") or "").strip()
    if explicit:
        return explicit

    everyday = (os.environ.get("DATABASE_URL") or "").strip() or _load_database_url_from_dotenv()
    if not everyday:
        # Last resort: same host defaults as Settings, dedicated DB name
        return (
            "postgresql+psycopg://postgres:CHANGE_ME@localhost:5432/"
            f"{_DEFAULT_TEST_DB_NAME}"
        )

    name = _database_name(everyday)
    if name == _DEFAULT_TEST_DB_NAME or name.endswith("_test"):
        return everyday
    return _replace_database_name(everyday, _DEFAULT_TEST_DB_NAME)


def _assert_safe_test_url(url: str) -> None:
    name = _database_name(url)
    if not name:
        raise RuntimeError("TEST_DATABASE_URL / DATABASE_URL has no database name.")
    if name in _EVERYDAY_DB_NAMES:
        raise RuntimeError(
            f"Refusing to run pytest against everyday database '{name}'. "
            f"Create '{_DEFAULT_TEST_DB_NAME}' (see docs/guides/testing.md) "
            "and set TEST_DATABASE_URL, or rely on the default name rewrite."
        )


_TEST_DB_URL = _resolve_test_database_url()
_assert_safe_test_url(_TEST_DB_URL)
os.environ["DATABASE_URL"] = _TEST_DB_URL

# ---------------------------------------------------------------------------
# 2) Clear settings cache + rebind engine if anything imported early
# ---------------------------------------------------------------------------

from app.core import config as config_mod  # noqa: E402

config_mod.get_settings.cache_clear()

from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

import app.core.db as db_mod  # noqa: E402

_settings = config_mod.get_settings()
if _database_name(_settings.database_url) in _EVERYDAY_DB_NAMES:
    raise RuntimeError(
        "Settings still point at everyday DB after TEST URL override — check conftest."
    )

db_mod.engine = create_engine(_settings.database_url, pool_pre_ping=True)
db_mod.SessionLocal = sessionmaker(bind=db_mod.engine, autoflush=False, autocommit=False)

# ---------------------------------------------------------------------------
# 3) Session fixtures
# ---------------------------------------------------------------------------

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db.seed import clear_domain_data, seed, wipe_and_seed  # noqa: E402
from app.main import app  # noqa: E402


def _psycopg_admin_url(app_url: str) -> str:
    """Connect to maintenance DB 'postgres' on the same server (for CREATE DATABASE)."""
    return _replace_database_name(app_url, "postgres")


def _ensure_test_database_exists() -> None:
    """Create gym_control_test once if missing (local Windows/dev convenience)."""
    target = _database_name(_TEST_DB_URL)
    admin_engine = create_engine(
        _psycopg_admin_url(_TEST_DB_URL),
        isolation_level="AUTOCOMMIT",
        pool_pre_ping=True,
    )
    try:
        with admin_engine.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :n"),
                {"n": target},
            ).scalar()
            if not exists:
                # Identifier only — validated as simple name
                if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", target):
                    raise RuntimeError(f"Unsafe test database name: {target!r}")
                conn.execute(text(f'CREATE DATABASE "{target}"'))
    finally:
        admin_engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def _prepare_test_database() -> None:
    """Ensure test DB exists and schema is at head before any test runs."""
    _ensure_test_database_exists()
    from alembic import command
    from alembic.config import Config

    alembic_ini = _BACKEND_ROOT / "alembic.ini"
    cfg = Config(str(alembic_ini))
    # alembic env.py reads DATABASE_URL from settings / env (already overridden)
    command.upgrade(cfg, "head")


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def reseed() -> None:
    """Wipe test DB domain tables and reload seed (safe: test DB only)."""
    wipe_and_seed()


# Re-export for tests that import helpers from conftest patterns
__all__ = [
    "client",
    "reseed",
    "wipe_and_seed",
    "seed",
    "clear_domain_data",
]
