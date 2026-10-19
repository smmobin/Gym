"""Unit tests for backup/restore helpers (no real pg_dump required)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))

from backup_db import build_dump_command, main as backup_main  # noqa: E402
from db_url import parse_database_url  # noqa: E402
from restore_db import CONFIRM_FLAG, build_restore_command, main as restore_main  # noqa: E402


def test_parse_sqlalchemy_psycopg_url() -> None:
    info = parse_database_url(
        "postgresql+psycopg://gym_user:s%40cret@db.example:5433/gym_control"
    )
    assert info.user == "gym_user"
    assert info.password == "s@cret"
    assert info.host == "db.example"
    assert info.port == 5433
    assert info.database == "gym_control"
    assert "s@cret" not in info.safe_summary()
    assert "gym_user@db.example:5433/gym_control" == info.safe_summary()


def test_parse_rejects_empty_and_non_postgres() -> None:
    with pytest.raises(ValueError):
        parse_database_url("")
    with pytest.raises(ValueError):
        parse_database_url("mysql://u:p@h/db")


def test_build_dump_command_shape() -> None:
    cmd = build_dump_command(
        pg_dump="pg_dump",
        host="localhost",
        port=5432,
        user="postgres",
        database="gym_control",
        out_file=Path("out.dump"),
    )
    assert cmd[0] == "pg_dump"
    assert "-F" in cmd and "c" in cmd
    assert "out.dump" in cmd


def test_build_restore_command_has_clean_flags() -> None:
    cmd = build_restore_command(
        pg_restore="pg_restore",
        host="localhost",
        port=5432,
        user="postgres",
        database="gym_control",
        dump_file=Path("in.dump"),
    )
    assert "--clean" in cmd
    assert "--if-exists" in cmd


def test_backup_dry_run_without_dump(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+psycopg://postgres:x@127.0.0.1:5432/gym_control",
    )
    # Point to a fake executable name; dry-run still needs _find_pg_dump to succeed
    monkeypatch.setenv("PG_DUMP_PATH", str(tmp_path / "fake_pg_dump"))
    (tmp_path / "fake_pg_dump").write_text("", encoding="utf-8")
    code = backup_main(["--dry-run", "--out-dir", str(tmp_path)])
    assert code == 0


def test_restore_requires_confirm_flag(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    dump = tmp_path / "sample.dump"
    dump.write_bytes(b"x")
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+psycopg://postgres:x@127.0.0.1:5432/gym_control",
    )
    monkeypatch.setenv("PG_RESTORE_PATH", str(tmp_path / "fake_pg_restore"))
    (tmp_path / "fake_pg_restore").write_text("", encoding="utf-8")
    code = restore_main([str(dump)])
    assert code == 2

    code_dry = restore_main([str(dump), "--dry-run"])
    assert code_dry == 0
    assert CONFIRM_FLAG.startswith("--")
