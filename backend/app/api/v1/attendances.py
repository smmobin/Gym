"""Attendance check-in / check-out / today list."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.db import get_db
from app.models.attendance import Attendance
from app.models.enums import StaffRole
from app.models.user import User
from app.schemas.attendance import (
    AttendanceOut,
    CheckInRequest,
    CheckInResponse,
    CheckOutResponse,
    TodayAttendancesResponse,
)
from app.services import attendance as attendance_svc
from app.services import member_locks as lock_svc

router = APIRouter(prefix="/attendances", tags=["attendances"])

_STAFF_ALL = (StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value, StaffRole.TRAINER.value)


def _to_out(row: Attendance) -> AttendanceOut:
    return AttendanceOut(
        id=row.id,
        member_id=row.member_id,
        membership_id=row.membership_id,
        check_in_at=row.check_in_at,
        check_out_at=row.check_out_at,
        attendance_type=row.attendance_type,
        recorded_by_user_id=row.recorded_by_user_id,
        is_open=row.check_out_at is None,
    )


def _raise(err: attendance_svc.AttendanceError) -> None:
    raise HTTPException(status_code=err.status_code, detail=err.detail) from err


def _raise_lock(err: lock_svc.MemberLockError) -> None:
    raise HTTPException(status_code=err.status_code, detail=err.detail) from err


@router.get("/today", response_model=TodayAttendancesResponse)
def list_today(
    member_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_STAFF_ALL)),
) -> TodayAttendancesResponse:
    try:
        rows, auto_closed = attendance_svc.list_today_attendances(
            db, user=user, member_id=member_id
        )
        db.commit()
    except attendance_svc.AttendanceError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return TodayAttendancesResponse(
        items=[_to_out(r) for r in rows],
        total=len(rows),
        auto_closed_attendance_ids=auto_closed,
    )


@router.post("/check-in", response_model=CheckInResponse, status_code=status.HTTP_201_CREATED)
def post_check_in(
    body: CheckInRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_STAFF_ALL)),
) -> CheckInResponse:
    try:
        lock_svc.assert_not_locked_by_other(db, user=user, member_id=body.member_id)
    except lock_svc.MemberLockError as err:
        _raise_lock(err)
        raise  # pragma: no cover

    try:
        result = attendance_svc.check_in(
            db,
            user=user,
            member_id=body.member_id,
            attendance_type=body.attendance_type,
            confirm_second_visit=body.confirm_second_visit,
            membership_id=body.membership_id,
        )
        db.commit()
        db.refresh(result.attendance)
    except attendance_svc.AttendanceError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover

    return CheckInResponse(
        attendance=_to_out(result.attendance),
        debt_toman=result.debt_toman,
        debt_warning=result.debt_warning,
        sessions_remaining=result.sessions_remaining,
        auto_closed_attendance_ids=result.auto_closed_ids,
    )


@router.post("/{attendance_id}/check-out", response_model=CheckOutResponse)
def post_check_out(
    attendance_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_STAFF_ALL)),
) -> CheckOutResponse:
    try:
        row = attendance_svc.check_out(db, user=user, attendance_id=attendance_id)
        db.commit()
        db.refresh(row)
    except attendance_svc.AttendanceError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return CheckOutResponse(attendance=_to_out(row))
