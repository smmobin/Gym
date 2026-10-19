"""
Restore a PostgreSQL dump created by backup_db.py (custom format -Fc).

DESTRUCTIVE: overwrites objects in the target database.

Usage (from backend/):
  .\\.venv\\Scripts\\python.exe scripts/restore_db.py path\\to\\file.dump --i-understand-this-destroys-data
  .\\.venv\\Scripts\\python.exe scripts/restore_db.py path\\to\\file.dump --dry-run
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from db_url import parse_database_url  # noqa: E402

CONFIRM_FLAG = "--i-understand-this-destroys-data"


def _find_pg_restore() -> str:
    env_path = os.environ.get("PG_RESTORE_PATH", "").strip()
    if env_path:
        return env_path
    found = shutil.which("pg_restore")
    if found:
        return found
    candidates = [
        Path(r"C:\Program Files\PostgreSQL\17\bin\pg_restore.exe"),
        Path(r"C:\Program Files\PostgreSQL\16\bin\pg_restore.exe"),
        Path(r"C:\Program Files\PostgreSQL\15\bin\pg_restore.exe"),
    ]
    for c in candidates:
        if c.is_file():
            return str(c)
    raise FileNotFoundError(
        "pg_restore پیدا نشد. PATH را تنظیم کنید یا PG_RESTORE_PATH را بگذارید."
    )


def build_restore_command(
    *,
    pg_restore: str,
    host: str,
    port: int,
    user: str,
    database: str,
    dump_file: Path,
) -> list[str]:
    return [
        pg_restore,
        "-h",
        host,
        "-p",
        str(port),
        "-U",
        user,
        "-d",
        database,
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-acl",
        str(dump_file),
    ]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="بازیابی مخرب dump روی DATABASE_URL فعلی",
    )
    parser.add_argument("dump_file", type=Path, help="مسیر فایل .dump")
    parser.add_argument(
        CONFIRM_FLAG,
        action="store_true",
        dest="confirmed",
        help="تأیید صریح که می‌دانید دادهٔ فعلی ممکن است پاک/جایگزین شود",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="فقط پارس و چاپ دستور؛ restore نکند",
    )
    args = parser.parse_args(argv)

    dump_file: Path = args.dump_file
    if not dump_file.is_file():
        print(f"خطا: فایل dump نیست: {dump_file}", file=sys.stderr)
        return 1

    backend_dir = Path(__file__).resolve().parents[1]
    load_dotenv(backend_dir / ".env")

    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        print("خطا: DATABASE_URL تنظیم نشده.", file=sys.stderr)
        return 1

    try:
        info = parse_database_url(database_url)
    except ValueError as err:
        print(f"خطا: {err}", file=sys.stderr)
        return 1

    try:
        pg_restore = _find_pg_restore()
    except FileNotFoundError as err:
        print(f"خطا: {err}", file=sys.stderr)
        return 1

    cmd = build_restore_command(
        pg_restore=pg_restore,
        host=info.host,
        port=info.port,
        user=info.user,
        database=info.database,
        dump_file=dump_file.resolve(),
    )

    print("هشدار: restore می‌تواند اشیاء موجود را پاک/جایگزین کند.")
    print(f"هدف: {info.safe_summary()}")
    print(f"فایل: {dump_file.resolve()}")

    if args.dry_run:
        print("dry-run OK — دستور (بدون رمز):")
        print(" ", " ".join(cmd))
        return 0

    if not args.confirmed:
        print(
            f"خطا: برای اجرای واقعی پرچم {CONFIRM_FLAG} لازم است.",
            file=sys.stderr,
        )
        return 2

    env = os.environ.copy()
    env["PGPASSWORD"] = info.password

    try:
        subprocess.run(cmd, check=True, env=env)
    except subprocess.CalledProcessError as err:
        print(f"خطا: pg_restore با کد {err.returncode} شکست خورد.", file=sys.stderr)
        return err.returncode or 1

    print("Restore OK. بعداً alembic upgrade head را در صورت نیاز اجرا کنید.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
