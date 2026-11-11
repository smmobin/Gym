"""Insert at most one manager, receptionist, trainer, and member.

Only runs INSERT when that role (or any member) is missing. Never updates,
deletes, wipes, or calls the fake seed. Safe on production.

From backend/:

  python -m app.db.ensure_smoke_accounts \\
    --manager-mobile 09... --manager-name "..." \\
    --receptionist-mobile 09... --receptionist-name "..." \\
    --trainer-mobile 09... --trainer-name "..." \\
    --member-mobile 09... --member-first "..." --member-last "..."

Passwords come from the matching env var, a hidden prompt, or --*-password
(the flag stays in shell history; prefer env or the prompt). The password is
never printed. Do not commit passwords.

  SMOKE_MANAGER_PASSWORD
  SMOKE_RECEPTIONIST_PASSWORD
  SMOKE_TRAINER_PASSWORD
  SMOKE_MEMBER_PASSWORD

If the manager role already exists, bootstrap_manager is not called.
A second run inserts nothing.
"""

from __future__ import annotations

import argparse
import getpass
import os
import sys
from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.db.bootstrap_manager import BootstrapError, bootstrap_manager, count_managers
from app.db.seed import DEV_ATHLETE_PASSWORD, DEV_STAFF_PASSWORD
from app.models.enums import MemberStatus, StaffRole
from app.models.member import Member
from app.models.user import User
from app.schemas.trial_leads import _normalize_mobile
from app.services.audit import write_audit
from app.services.members import next_display_id

MIN_PASSWORD_LEN = 8
_DEV_PASSWORDS = frozenset({DEV_STAFF_PASSWORD, DEV_ATHLETE_PASSWORD})

ROLE_ORDER = ("manager", "receptionist", "trainer", "member")
SLOT_FA = {
    "manager": "مدیر",
    "receptionist": "منشی",
    "trainer": "مربی",
    "member": "عضو",
}
_STAFF_ROLE = {
    "manager": StaffRole.MANAGER.value,
    "receptionist": StaffRole.RECEPTIONIST.value,
    "trainer": StaffRole.TRAINER.value,
}
_PASSWORD_ENV = {
    "manager": "SMOKE_MANAGER_PASSWORD",
    "receptionist": "SMOKE_RECEPTIONIST_PASSWORD",
    "trainer": "SMOKE_TRAINER_PASSWORD",
    "member": "SMOKE_MEMBER_PASSWORD",
}
_PASSWORD_FLAG = {
    "manager": "manager_password",
    "receptionist": "receptionist_password",
    "trainer": "trainer_password",
    "member": "member_password",
}


class SmokeError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


@dataclass
class SmokeReport:
    created: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    created_detail: dict[str, str] = field(default_factory=dict)
    skip_reason: dict[str, str] = field(default_factory=dict)


def _count_role(db: Session, role: str) -> int:
    return int(db.scalar(select(func.count()).select_from(User).where(User.role == role)) or 0)


def _count_members(db: Session) -> int:
    return int(db.scalar(select(func.count()).select_from(Member)) or 0)


def missing_slots(db: Session) -> list[str]:
    """Slots with zero rows. Member is missing only when the members table is empty."""
    missing: list[str] = []
    if count_managers(db) == 0:
        missing.append("manager")
    if _count_role(db, StaffRole.RECEPTIONIST.value) == 0:
        missing.append("receptionist")
    if _count_role(db, StaffRole.TRAINER.value) == 0:
        missing.append("trainer")
    if _count_members(db) == 0:
        missing.append("member")
    return missing


def _mobile(value: str | None, label: str) -> str:
    if not value or not str(value).strip():
        raise SmokeError(f"موبایل {label} لازم است.")
    try:
        return _normalize_mobile(str(value))
    except ValueError as err:
        raise SmokeError(f"{label}: {err}") from err


def _name(value: str | None, what: str) -> str:
    cleaned = (value or "").strip()
    if len(cleaned) < 2:
        raise SmokeError(f"{what} باید حداقل ۲ کاراکتر باشد.")
    return cleaned


def _password(value: str | None, label: str) -> str:
    if not value:
        raise SmokeError(
            f"رمز {label} لازم است. متغیر {_password_env_for_label(label)} "
            "یا پرامپت مخفی را بگذارید."
        )
    if value in _DEV_PASSWORDS:
        raise SmokeError(f"رمز {label} نباید رمز نمونهٔ seed توسعه باشد.")
    if len(value) < MIN_PASSWORD_LEN:
        raise SmokeError(f"رمز {label} باید حداقل ۸ کاراکتر باشد.")
    if len(value.encode("utf-8")) > 72:
        raise SmokeError(f"رمز {label} بیش از حد طولانی است.")
    return value


def _password_env_for_label(label: str) -> str:
    for slot, fa in SLOT_FA.items():
        if fa == label:
            return _PASSWORD_ENV[slot]
    return "SMOKE_*_PASSWORD"


def _staff_mobile_taken(db: Session, mobile: str) -> bool:
    return db.scalar(select(User.id).where(User.mobile == mobile)) is not None


def _insert_non_manager(
    db: Session,
    *,
    slot: str,
    mobile: str,
    full_name: str,
    password: str,
    actor_user_id: int | None,
) -> User:
    try:
        password_hash = hash_password(password)
    except ValueError as err:
        raise SmokeError(f"رمز {SLOT_FA[slot]} پذیرفته نشد.") from err
    row = User(
        mobile=mobile,
        password_hash=password_hash,
        full_name=full_name,
        role=_STAFF_ROLE[slot],
        also_trainer=False,
        is_active=True,
    )
    db.add(row)
    db.flush()
    write_audit(
        db,
        actor_user_id=actor_user_id,
        action="smoke.staff_create",
        entity_type="user",
        entity_id=row.id,
        summary=f"ساخت حساب دود {SLOT_FA[slot]}",
        payload={"mobile": mobile, "role": row.role},
    )
    return row


def _ensure(db: Session, fields: dict[str, str | None]) -> SmokeReport:
    report = SmokeReport()
    missing = set(missing_slots(db))
    for slot in ROLE_ORDER:
        if slot not in missing:
            report.skipped.append(slot)
            report.skip_reason[slot] = "members_exist" if slot == "member" else "role_exists"

    staff_to_create: list[tuple[str, str, str, str]] = []
    seen_mobiles: set[str] = set()
    for slot in ("manager", "receptionist", "trainer"):
        if slot not in missing:
            continue
        label = SLOT_FA[slot]
        mobile = _mobile(fields.get(f"{slot}_mobile"), label)
        name = _name(fields.get(f"{slot}_name"), f"نام {label}")
        password = _password(fields.get(f"{slot}_password"), label)
        if mobile in seen_mobiles:
            raise SmokeError("موبایل نقش‌های تازه‌ای که ساخته می‌شوند باید متفاوت باشد.")
        if _staff_mobile_taken(db, mobile):
            raise SmokeError(
                f"موبایل {label} از قبل برای یک کاربر ثبت شده؛ هیچ ردیفی عوض نشد."
            )
        seen_mobiles.add(mobile)
        staff_to_create.append((slot, mobile, name, password))

    member_plan: tuple[str, str, str, str] | None = None
    if "member" in missing:
        label = SLOT_FA["member"]
        mobile = _mobile(fields.get("member_mobile"), label)
        first = _name(fields.get("member_first"), "نام عضو")
        last = _name(fields.get("member_last"), "نام‌خانوادگی عضو")
        password = _password(fields.get("member_password"), label)
        if db.scalar(select(Member.id).where(Member.mobile == mobile)) is not None:
            raise SmokeError("این موبایل از قبل برای یک عضو ثبت شده؛ هیچ ردیفی عوض نشد.")
        member_plan = (mobile, first, last, password)

    manager_id: int | None = None
    existing_manager = db.scalar(
        select(User.id).where(User.role == StaffRole.MANAGER.value).order_by(User.id.asc()).limit(1)
    )
    if existing_manager is not None:
        manager_id = int(existing_manager)

    for slot, mobile, name, password in staff_to_create:
        if slot == "manager":
            try:
                row = bootstrap_manager(
                    mobile=mobile,
                    password=password,
                    full_name=name,
                    db=db,
                )
            except BootstrapError as err:
                raise SmokeError(err.message) from err
            manager_id = row.id
            write_audit(
                db,
                actor_user_id=manager_id,
                action="smoke.staff_create",
                entity_type="user",
                entity_id=row.id,
                summary=f"ساخت حساب دود {SLOT_FA[slot]}",
                payload={"mobile": row.mobile, "role": row.role},
            )
        else:
            row = _insert_non_manager(
                db,
                slot=slot,
                mobile=mobile,
                full_name=name,
                password=password,
                actor_user_id=manager_id,
            )
        report.created.append(slot)
        report.created_detail[slot] = f"id={row.id} mobile={row.mobile}"

    if member_plan is not None:
        mobile, first, last, password = member_plan
        try:
            password_hash = hash_password(password)
        except ValueError as err:
            raise SmokeError("رمز عضو پذیرفته نشد.") from err
        member = Member(
            display_id=next_display_id(db),
            first_name=first,
            last_name=last,
            mobile=mobile,
            password_hash=password_hash,
            status=MemberStatus.ACTIVE.value,
        )
        db.add(member)
        db.flush()
        write_audit(
            db,
            actor_user_id=manager_id,
            action="smoke.member_create",
            entity_type="member",
            entity_id=member.id,
            summary="ساخت عضو دود",
            payload={"mobile": member.mobile, "display_id": member.display_id},
        )
        report.created.append("member")
        report.created_detail["member"] = f"id={member.id} mobile={member.mobile}"

    return report


def ensure_smoke_accounts(db: Session, **fields: str | None) -> SmokeReport:
    """Insert missing smoke rows. On failure the session is rolled back.

    Does not commit. Never deletes or updates existing users or members.
    """
    try:
        return _ensure(db, fields)
    except Exception:
        db.rollback()
        raise


def format_report(report: SmokeReport) -> list[str]:
    lines: list[str] = []
    for slot in ROLE_ORDER:
        label = SLOT_FA[slot]
        if slot in report.created:
            detail = report.created_detail.get(slot, "")
            lines.append(f"{label}: ساخته شد {detail}".rstrip())
        elif slot in report.skipped:
            if report.skip_reason.get(slot) == "members_exist":
                lines.append(f"{label}: رد شد (عضو از قبل وجود دارد؛ دست نخورده)")
            else:
                lines.append(f"{label}: رد شد (این نقش از قبل وجود دارد؛ دست نخورده)")
    return lines


def _resolve_password(explicit: str | None, *, slot: str) -> str:
    if explicit:
        return explicit
    env_val = os.environ.get(_PASSWORD_ENV[slot])
    if env_val:
        return env_val
    label = SLOT_FA[slot]
    if sys.stdin.isatty():
        first = getpass.getpass(f"رمز {label}: ")
        second = getpass.getpass("تکرار رمز: ")
        if first != second:
            raise SmokeError("دو رمز یکسان نیستند.")
        return first
    raise SmokeError(
        f"رمز {label} لازم است. {_PASSWORD_ENV[slot]} را بگذارید یا در ترمینال تعاملی اجرا کنید."
    )


def _fields_from_args(args: argparse.Namespace, passwords: dict[str, str]) -> dict[str, str | None]:
    return {
        "manager_mobile": args.manager_mobile,
        "manager_name": args.manager_name,
        "manager_password": passwords.get("manager"),
        "receptionist_mobile": args.receptionist_mobile,
        "receptionist_name": args.receptionist_name,
        "receptionist_password": passwords.get("receptionist"),
        "trainer_mobile": args.trainer_mobile,
        "trainer_name": args.trainer_name,
        "trainer_password": passwords.get("trainer"),
        "member_mobile": args.member_mobile,
        "member_first": args.member_first,
        "member_last": args.member_last,
        "member_password": passwords.get("member"),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "اگر مدیر، منشی، مربی یا عضو وجود ندارد یکی می‌سازد. "
            "ردیف موجود را عوض یا پاک نمی‌کند."
        )
    )
    parser.add_argument("--manager-mobile")
    parser.add_argument("--manager-name")
    parser.add_argument("--manager-password", help="ترجیحاً نگذارید؛ env یا پرامپت مخفی.")
    parser.add_argument("--receptionist-mobile")
    parser.add_argument("--receptionist-name")
    parser.add_argument("--receptionist-password", help="ترجیحاً نگذارید؛ env یا پرامپت مخفی.")
    parser.add_argument("--trainer-mobile")
    parser.add_argument("--trainer-name")
    parser.add_argument("--trainer-password", help="ترجیحاً نگذارید؛ env یا پرامپت مخفی.")
    parser.add_argument("--member-mobile")
    parser.add_argument("--member-first")
    parser.add_argument("--member-last")
    parser.add_argument("--member-password", help="ترجیحاً نگذارید؛ env یا پرامپت مخفی.")
    args = parser.parse_args(argv)

    session = SessionLocal()
    try:
        needed = missing_slots(session)
        passwords: dict[str, str] = {}
        for slot in needed:
            passwords[slot] = _resolve_password(getattr(args, _PASSWORD_FLAG[slot]), slot=slot)
        report = ensure_smoke_accounts(session, **_fields_from_args(args, passwords))
        session.commit()
    except SmokeError as err:
        session.rollback()
        print(err.message, file=sys.stderr)
        return 1
    finally:
        session.close()

    for line in format_report(report):
        print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
