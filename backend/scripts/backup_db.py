"""
Take a PostgreSQL dump using pg_dump and DATABASE_URL from the environment.

Usage (from backend/):
  .\\.venv\\Scripts\\python.exe scripts/backup_db.py
  .\\.venv\\Scripts\\python.exe scripts/backup_db.py --dry-run
  .\\.venv\\Scripts\\python.exe scripts/backup_db.py --out-dir D:\\GymBackups

Never commit dump files. Default output: <repo>/backups/ (gitignored).
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

# Allow `python scripts/backup_db.py` from backend/
_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from db_url import parse_database_url  # noqa: E402

# backend/ → repo root → backups/
_DEFAULT_OUT = Path(__file__).resolve().parents[2] / "backups"


def _find_pg_dump() -> str:
    env_path = os.environ.get("PG_DUMP_PATH", "").strip()
    if env_path:
        return env_path
    found = shutil.which("pg_dump")
    if found:
        return found
    # Common Windows install
    candidates = [
        Path(r"C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"),
        Path(r"C:\Program Files\PostgreSQL\16\bin\pg_dump.exe"),
        Path(r"C:\Program Files\PostgreSQL\15\bin\pg_dump.exe"),
    ]
    for c in candidates:
        if c.is_file():
            return str(c)
    raise FileNotFoundError(
        "pg_dump پیدا نشد. PATH را تنظیم کنید یا PG_DUMP_PATH را بگذارید."
    )


def build_dump_command(
    *,
    pg_dump: str,
    host: str,
    port: int,
    user: str,
    database: str,
    out_file: Path,
) -> list[str]:
    return [
        pg_dump,
        "-h",
        host,
        "-p",
        str(port),
        "-U",
        user,
        "-d",
        database,
        "-F",
        "c",
        "-f",
        str(out_file),
    ]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="بکاپ Postgres با pg_dump")
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="پوشهٔ خروجی (پیش‌فرض: <repo>/backups یا BACKUP_DIR)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="فقط URL را پارس و دستور را چاپ کند؛ dump نگیرد",
    )
    args = parser.parse_args(argv)

    backend_dir = Path(__file__).resolve().parents[1]
    load_dotenv(backend_dir / ".env")

    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        print("خطا: DATABASE_URL تنظیم نشده (backend/.env یا محیط).", file=sys.stderr)
        return 1

    try:
        info = parse_database_url(database_url)
    except ValueError as err:
        print(f"خطا: {err}", file=sys.stderr)
        return 1

    out_dir = args.out_dir
    if out_dir is None:
        env_dir = os.environ.get("BACKUP_DIR", "").strip()
        out_dir = Path(env_dir) if env_dir else _DEFAULT_OUT

    stamp = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_file = out_dir / f"gym_control_{stamp}.dump"

    try:
        pg_dump = _find_pg_dump()
    except FileNotFoundError as err:
        print(f"خطا: {err}", file=sys.stderr)
        return 1

    cmd = build_dump_command(
        pg_dump=pg_dump,
        host=info.host,
        port=info.port,
        user=info.user,
        database=info.database,
        out_file=out_file,
    )

    print(f"هدف: {info.safe_summary()}")
    print(f"خروجی: {out_file}")
    if args.dry_run:
        # Never print password
        print("dry-run OK — دستور (بدون رمز):")
        print(" ", " ".join(cmd))
        return 0

    out_dir.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["PGPASSWORD"] = info.password

    try:
        subprocess.run(cmd, check=True, env=env)
    except subprocess.CalledProcessError as err:
        print(f"خطا: pg_dump با کد {err.returncode} شکست خورد.", file=sys.stderr)
        return err.returncode or 1

    size = out_file.stat().st_size if out_file.is_file() else 0
    print(f"بکاپ OK ({size} bytes). فایل را خارج از لپ‌تاپ هم کپی کنید.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
