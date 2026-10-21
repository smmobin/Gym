"""
Create the first manager when none exist (empty / real-data start).

Usage (from backend/):
  .\\.venv\\Scripts\\python.exe -m app.db.bootstrap_manager --mobile 09... --password ... --name "..."

Refuses if any User with role=manager already exists. Never commit passwords to git.
"""

from __future__ import annotations

import argparse
import sys

from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models.enums import StaffRole
from app.models.user import User
from app.schemas.trial_leads import _normalize_mobile

MIN_PASSWORD_LEN = 8


class BootstrapError(Exception):
    def __init__(self, message: str, *, exit_code: int = 1) -> None:
        self.message = message
        self.exit_code = exit_code
        super().__init__(message)


def count_managers(db) -> int:
    return int(
        db.scalar(
            select(func.count()).select_from(User).where(User.role == StaffRole.MANAGER.value)
        )
        or 0
    )


def bootstrap_manager(
    *,
    mobile: str,
    password: str,
    full_name: str,
    db=None,
) -> User:
    """Insert the first manager. Raises BootstrapError if a manager already exists."""
    own = db is None
    session = db or SessionLocal()
    try:
        if count_managers(session) > 0:
            raise BootstrapError(
                "مدیر از قبل وجود دارد. ساخت مدیر دوم از CLI مجاز نیست.",
                exit_code=2,
            )
        try:
            mobile_norm = _normalize_mobile(mobile)
        except ValueError as err:
            raise BootstrapError(str(err)) from err
        name = full_name.strip()
        if len(name) < 2:
            raise BootstrapError("نام باید حداقل ۲ کاراکتر باشد.")
        if len(password) < MIN_PASSWORD_LEN:
            raise BootstrapError("رمز باید حداقل ۸ کاراکتر باشد.")

        existing = session.scalar(select(User).where(User.mobile == mobile_norm))
        if existing is not None:
            raise BootstrapError("این موبایل قبلاً برای یک کاربر ثبت شده است.")

        row = User(
            mobile=mobile_norm,
            password_hash=hash_password(password),
            full_name=name,
            role=StaffRole.MANAGER.value,
            is_active=True,
        )
        session.add(row)
        session.flush()
        if own:
            session.commit()
            session.refresh(row)
        return row
    except BootstrapError:
        if own:
            session.rollback()
        raise
    except Exception:
        if own:
            session.rollback()
        raise
    finally:
        if own:
            session.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="ساخت اولین مدیر وقتی هیچ مدیری در دیتابیس نیست."
    )
    parser.add_argument("--mobile", required=True, help="موبایل مدیر")
    parser.add_argument("--password", required=True, help="رمز (حداقل ۸؛ در گیت نگذار)")
    parser.add_argument("--name", required=True, help="نام کامل")
    args = parser.parse_args(argv)

    try:
        row = bootstrap_manager(
            mobile=args.mobile,
            password=args.password,
            full_name=args.name,
        )
    except BootstrapError as err:
        print(err.message, file=sys.stderr)
        return err.exit_code

    print(f"مدیر ساخته شد: id={row.id} mobile={row.mobile} name={row.full_name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
