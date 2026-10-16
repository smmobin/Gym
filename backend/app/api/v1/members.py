"""Members list / create / detail / update / soft-archive."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.db import get_db
from app.models.enums import MemberStatus, StaffRole
from app.models.member import Member
from app.models.user import User
from app.schemas.members import MemberCreate, MemberListResponse, MemberOut, MemberUpdate
from app.services.members import (
    build_member_list_query,
    member_by_mobile,
    next_display_id,
    trainer_can_view_member,
)

router = APIRouter(prefix="/members", tags=["members"])

_STAFF_ALL = (StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value, StaffRole.TRAINER.value)
_STAFF_WRITE = (StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value)


def _ensure_can_view(db: Session, user: User, member: Member) -> None:
    if user.role in {StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value}:
        return
    if user.role == StaffRole.TRAINER.value and trainer_can_view_member(
        db, trainer=user, member_id=member.id
    ):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="دسترسی مجاز نیست.")


@router.get("", response_model=MemberListResponse)
def list_members(
    q: str | None = Query(default=None, max_length=80),
    status_filter: str | None = Query(default=None, alias="status", max_length=32),
    include_archived: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_STAFF_ALL)),
) -> MemberListResponse:
    stmt = build_member_list_query(
        db,
        user=user,
        q=q,
        status=status_filter,
        include_archived=include_archived,
    )
    items = list(db.scalars(stmt).all())
    return MemberListResponse(items=[MemberOut.model_validate(m) for m in items], total=len(items))


@router.post("", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
def create_member(
    body: MemberCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*_STAFF_WRITE)),
) -> MemberOut:
    if member_by_mobile(db, body.mobile):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="این شماره موبایل قبلاً ثبت شده است.",
        )

    member = Member(
        display_id=next_display_id(db),
        first_name=body.first_name,
        last_name=body.last_name,
        mobile=body.mobile,
        birth_date=body.birth_date,
        notes=body.notes,
        status=MemberStatus.PENDING.value,
    )
    db.add(member)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="این شماره موبایل قبلاً ثبت شده است.",
        ) from None
    db.refresh(member)
    return MemberOut.model_validate(member)


@router.get("/{member_id}", response_model=MemberOut)
def get_member(
    member_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_STAFF_ALL)),
) -> MemberOut:
    member = db.get(Member, member_id)
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="عضو یافت نشد.")
    _ensure_can_view(db, user, member)
    return MemberOut.model_validate(member)


@router.patch("/{member_id}", response_model=MemberOut)
def update_member(
    member_id: int,
    body: MemberUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*_STAFF_WRITE)),
) -> MemberOut:
    # TODO: قفل پروندهٔ ۵دقیقه‌ای هنوز برای PATCH عضو پیاده نشده (schema-todos).
    member = db.get(Member, member_id)
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="عضو یافت نشد.")
    if member.status == MemberStatus.ARCHIVED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="عضو آرشیو شده قابل ویرایش نیست.",
        )

    data = body.model_dump(exclude_unset=True)
    if "mobile" in data and data["mobile"] != member.mobile:
        existing = member_by_mobile(db, data["mobile"])
        if existing and existing.id != member.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="این شماره موبایل قبلاً ثبت شده است.",
            )

    for key, value in data.items():
        setattr(member, key, value)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="این شماره موبایل قبلاً ثبت شده است.",
        ) from None
    db.refresh(member)
    return MemberOut.model_validate(member)


@router.post("/{member_id}/archive", response_model=MemberOut)
def archive_member(
    member_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*_STAFF_WRITE)),
) -> MemberOut:
    member = db.get(Member, member_id)
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="عضو یافت نشد.")
    if member.status == MemberStatus.ARCHIVED.value:
        return MemberOut.model_validate(member)

    member.status = MemberStatus.ARCHIVED.value
    member.archived_at = datetime.now(tz=timezone.utc)
    db.commit()
    db.refresh(member)
    return MemberOut.model_validate(member)
