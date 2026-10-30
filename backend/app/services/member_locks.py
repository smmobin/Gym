"""Member file locks: acquire / touch / unlock / soft-enforce on sensitive ops.

Policy (v1 soft enforce):
- If an active lock is held by another user → reject sensitive ops with 409.
- If there is no lock, or the lock belongs to the current user → allow.
- TTL: settings.member_file_lock_ttl_seconds from last_seen_at (default 5 min).
- Expired rows are deleted lazily on acquire / status / enforce (no cron required).
- Unlock: lock holder or manager (force).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.models.enums import StaffRole
from app.models.member import Member
from app.models.member_file_lock import MemberFileLock
from app.models.member_file_lock_interest import MemberFileLockInterest
from app.models.user import User
from app.services.members import trainer_can_view_member


class MemberLockError(Exception):
    def __init__(self, status_code: int, detail: str | dict[str, Any]) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(str(detail))


@dataclass(frozen=True)
class LockSnapshot:
    locked: bool
    member_id: int
    locked_by: int | None
    locked_by_name: str | None
    locked_by_mobile: str | None
    acquired_at: datetime | None
    last_seen_at: datetime | None
    expires_at: datetime | None
    held_by_me: bool


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _ttl(settings: Settings | None = None) -> timedelta:
    cfg = settings or get_settings()
    return timedelta(seconds=cfg.member_file_lock_ttl_seconds)


def _expires_at(last_seen_at: datetime, settings: Settings | None = None) -> datetime:
    return last_seen_at + _ttl(settings)


def _is_expired(lock: MemberFileLock, *, now: datetime, settings: Settings | None = None) -> bool:
    return now >= _expires_at(lock.last_seen_at, settings)


def _ensure_can_access_member(db: Session, user: User, member: Member) -> None:
    if user.role in {StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value}:
        return
    if user.role == StaffRole.TRAINER.value and trainer_can_view_member(
        db, trainer=user, member_id=member.id
    ):
        return
    raise MemberLockError(403, "دسترسی مجاز نیست.")


def _get_member_or_404(db: Session, member_id: int) -> Member:
    member = db.get(Member, member_id)
    if member is None:
        raise MemberLockError(404, "عضو یافت نشد.")
    return member


def _conflict_detail(
    lock: MemberFileLock,
    holder: User,
    *,
    settings: Settings | None = None,
) -> dict[str, Any]:
    return {
        "code": "member_file_locked",
        "message": (
            f"پروندهٔ این عضو الان در اختیار {holder.full_name} "
            f"({holder.mobile}) است. تا آزاد شدن یا انقضای قفل صبر کنید."
        ),
        "locked_by": holder.id,
        "locked_by_name": holder.full_name,
        "locked_by_mobile": holder.mobile,
        "expires_at": _expires_at(lock.last_seen_at, settings).isoformat(),
    }


def _purge_if_expired(
    db: Session,
    lock: MemberFileLock | None,
    *,
    now: datetime,
    settings: Settings | None = None,
) -> MemberFileLock | None:
    if lock is None:
        return None
    if _is_expired(lock, now=now, settings=settings):
        db.delete(lock)
        db.flush()
        return None
    return lock


def _load_lock(db: Session, member_id: int) -> MemberFileLock | None:
    return db.get(MemberFileLock, member_id)


def _record_interest(
    db: Session,
    *,
    user: User,
    member_id: int,
    now: datetime,
) -> None:
    """Mark this user as the latest selector for the member file (waiting tip)."""
    row = db.get(MemberFileLockInterest, member_id)
    if row is None:
        db.add(
            MemberFileLockInterest(
                member_id=member_id,
                user_id=user.id,
                interested_at=now,
            )
        )
    else:
        row.user_id = user.id
        row.interested_at = now
    db.flush()


def _grant_lock_to_user(
    db: Session,
    *,
    member_id: int,
    user_id: int,
    now: datetime,
) -> MemberFileLock:
    lock = MemberFileLock(
        member_id=member_id,
        locked_by_user_id=user_id,
        acquired_at=now,
        last_seen_at=now,
    )
    db.add(lock)
    db.flush()
    return lock


def _snapshot(
    member_id: int,
    lock: MemberFileLock | None,
    holder: User | None,
    *,
    current_user: User,
    settings: Settings | None = None,
) -> LockSnapshot:
    if lock is None or holder is None:
        return LockSnapshot(
            locked=False,
            member_id=member_id,
            locked_by=None,
            locked_by_name=None,
            locked_by_mobile=None,
            acquired_at=None,
            last_seen_at=None,
            expires_at=None,
            held_by_me=False,
        )
    return LockSnapshot(
        locked=True,
        member_id=member_id,
        locked_by=holder.id,
        locked_by_name=holder.full_name,
        locked_by_mobile=holder.mobile,
        acquired_at=lock.acquired_at,
        last_seen_at=lock.last_seen_at,
        expires_at=_expires_at(lock.last_seen_at, settings),
        held_by_me=holder.id == current_user.id,
    )


def get_lock_status(
    db: Session,
    *,
    user: User,
    member_id: int,
    settings: Settings | None = None,
) -> LockSnapshot:
    member = _get_member_or_404(db, member_id)
    _ensure_can_access_member(db, user, member)
    now = _now()
    lock = _purge_if_expired(
        db, _load_lock(db, member_id), now=now, settings=settings
    )
    holder = db.get(User, lock.locked_by_user_id) if lock else None
    return _snapshot(member_id, lock, holder, current_user=user, settings=settings)


def acquire_lock(
    db: Session,
    *,
    user: User,
    member_id: int,
    settings: Settings | None = None,
) -> LockSnapshot:
    member = _get_member_or_404(db, member_id)
    _ensure_can_access_member(db, user, member)
    now = _now()
    lock = _purge_if_expired(
        db, _load_lock(db, member_id), now=now, settings=settings
    )

    if lock is not None:
        if lock.locked_by_user_id == user.id:
            # Holder refresh must not overwrite waiting tip (last other selector).
            lock.last_seen_at = now
            db.flush()
            return _snapshot(member_id, lock, user, current_user=user, settings=settings)

        holder = db.get(User, lock.locked_by_user_id)
        if holder is None:
            db.delete(lock)
            db.flush()
        else:
            # Waiting selector — become the handoff target on unlock.
            # Commit before 409 so API rollback does not wipe the tip.
            _record_interest(db, user=user, member_id=member_id, now=now)
            db.commit()
            raise MemberLockError(409, _conflict_detail(lock, holder, settings=settings))

    _record_interest(db, user=user, member_id=member_id, now=now)
    lock = _grant_lock_to_user(db, member_id=member_id, user_id=user.id, now=now)
    return _snapshot(member_id, lock, user, current_user=user, settings=settings)


def touch_lock(
    db: Session,
    *,
    user: User,
    member_id: int,
    settings: Settings | None = None,
) -> LockSnapshot:
    member = _get_member_or_404(db, member_id)
    _ensure_can_access_member(db, user, member)
    now = _now()
    lock = _purge_if_expired(
        db, _load_lock(db, member_id), now=now, settings=settings
    )
    if lock is None:
        raise MemberLockError(403, "قفل فعالی برای این عضو ندارید.")
    if lock.locked_by_user_id != user.id:
        holder = db.get(User, lock.locked_by_user_id)
        if holder is not None:
            raise MemberLockError(409, _conflict_detail(lock, holder, settings=settings))
        raise MemberLockError(403, "قفل فعالی برای این عضو ندارید.")

    lock.last_seen_at = now
    db.flush()
    return _snapshot(member_id, lock, user, current_user=user, settings=settings)


def unlock(
    db: Session,
    *,
    user: User,
    member_id: int,
    settings: Settings | None = None,
) -> LockSnapshot:
    member = _get_member_or_404(db, member_id)
    _ensure_can_access_member(db, user, member)
    now = _now()
    lock = _purge_if_expired(
        db, _load_lock(db, member_id), now=now, settings=settings
    )
    if lock is None:
        return _snapshot(member_id, None, None, current_user=user, settings=settings)

    is_holder = lock.locked_by_user_id == user.id
    is_manager = user.role == StaffRole.MANAGER.value
    if not is_holder and not is_manager:
        raise MemberLockError(
            403,
            "فقط دارندهٔ قفل یا مدیر می‌تواند قفل را آزاد کند.",
        )

    previous_holder_id = lock.locked_by_user_id
    db.delete(lock)
    db.flush()

    # Hand to the latest selector who is not the holder we just cleared.
    interest = db.get(MemberFileLockInterest, member_id)
    if interest is not None and interest.user_id != previous_holder_id:
        next_holder = db.get(User, interest.user_id)
        if next_holder is not None:
            new_lock = _grant_lock_to_user(
                db, member_id=member_id, user_id=next_holder.id, now=now
            )
            return _snapshot(
                member_id,
                new_lock,
                next_holder,
                current_user=user,
                settings=settings,
            )

    return _snapshot(member_id, None, None, current_user=user, settings=settings)


def assert_not_locked_by_other(
    db: Session,
    *,
    user: User,
    member_id: int,
    settings: Settings | None = None,
) -> None:
    """Soft enforce: block only when another user holds a fresh lock."""
    now = _now()
    lock = _purge_if_expired(
        db, _load_lock(db, member_id), now=now, settings=settings
    )
    if lock is None:
        return
    if lock.locked_by_user_id == user.id:
        return
    holder = db.get(User, lock.locked_by_user_id)
    if holder is None:
        db.delete(lock)
        db.flush()
        return
    raise MemberLockError(409, _conflict_detail(lock, holder, settings=settings))


def list_active_locks_for_cleanup(db: Session) -> list[MemberFileLock]:
    """Helper for tests / optional jobs — not required at runtime."""
    return list(db.scalars(select(MemberFileLock)).all())
