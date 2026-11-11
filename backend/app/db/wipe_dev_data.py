"""
Clear fake/demo domain data for a fresh real-data start (local/dev).

Usage (from backend/):
  .\\.venv\\Scripts\\python.exe -m app.db.wipe_dev_data

Refuses APP_ENV=production/prod always, even if ALLOW_DESTRUCTIVE_SEED=true.
Staging refuses unless that flag is set. Does not drop tables or reset alembic.
"""

from __future__ import annotations

import sys

from sqlalchemy import func, select

from app.core.db import SessionLocal, engine
from app.db.data_guard import refuse_if_destructive
from app.db.seed import clear_domain_data
from app.models.member import Member
from app.models.user import User


def wipe() -> dict[str, int]:
    """Empty domain tables. Returns counts before/after wipe (best-effort)."""
    refuse_if_destructive("wipe")

    with engine.connect() as conn:
        conn.exec_driver_sql("SELECT 1")

    db = SessionLocal()
    try:
        users_before = int(db.scalar(select(func.count()).select_from(User)) or 0)
        members_before = int(db.scalar(select(func.count()).select_from(Member)) or 0)
        clear_domain_data(db)
        users_after = int(db.scalar(select(func.count()).select_from(User)) or 0)
        members_after = int(db.scalar(select(func.count()).select_from(Member)) or 0)
        return {
            "users_before": users_before,
            "members_before": members_before,
            "users_after": users_after,
            "members_after": members_after,
        }
    finally:
        db.close()


def main(argv: list[str] | None = None) -> int:
    _ = argv  # reserved for future flags; guard is APP_ENV + ALLOW_DESTRUCTIVE_SEED
    try:
        counts = wipe()
    except SystemExit as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print(
        "Wipe OK:",
        f"users {counts['users_before']}->{counts['users_after']},",
        f"members {counts['members_before']}->{counts['members_after']}",
    )
    print(
        "Next: python -m app.db.bootstrap_manager "
        "--mobile ... --password ... --name ..."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
