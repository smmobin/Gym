"""Workout plan CRUD with structured items + exercise catalog."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.enums import StaffRole
from app.models.member import Member
from app.models.user import User
from app.models.workout import WorkoutExercise, WorkoutPlan
from app.services.members import trainer_can_view_member

UNIT_FA = {"reps": "تکرار", "seconds": "ثانیه"}


class WorkoutPlanError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def exercise_name_key(name: str) -> str:
    return " ".join(name.strip().split()).casefold()


def format_item_summary(item: dict[str, Any]) -> str:
    name = str(item.get("exercise_name") or "—").strip() or "—"
    sets = int(item.get("sets") or 0)
    amount = int(item.get("amount") or 0)
    unit = UNIT_FA.get(str(item.get("unit") or "reps"), "تکرار")
    note = str(item.get("note") or "").strip()
    base = f"{name} · {sets} ست · {amount} {unit}"
    return f"{base} · {note}" if note else base


def items_to_body(items: list[dict[str, Any]]) -> str:
    lines = [format_item_summary(it) for it in items if it]
    return "\n".join(lines) if lines else ""


def normalize_items(raw_items: list[Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for raw in raw_items:
        if hasattr(raw, "model_dump"):
            data = raw.model_dump()
        elif isinstance(raw, dict):
            data = dict(raw)
        else:
            continue
        name = str(data.get("exercise_name") or "").strip()
        if not name:
            raise WorkoutPlanError(400, "نام حرکت خالی است.")
        unit = str(data.get("unit") or "reps")
        if unit not in ("reps", "seconds"):
            raise WorkoutPlanError(400, "واحد حرکت نامعتبر است.")
        try:
            sets = int(data.get("sets"))
            amount = int(data.get("amount"))
        except (TypeError, ValueError) as err:
            raise WorkoutPlanError(400, "ست یا مقدار نامعتبر است.") from err
        if sets < 1 or sets > 99 or amount < 1 or amount > 9999:
            raise WorkoutPlanError(400, "ست یا مقدار خارج از محدوده است.")
        note = data.get("note")
        note_s = str(note).strip() if note is not None else ""
        row: dict[str, Any] = {
            "exercise_name": name,
            "exercise_id": data.get("exercise_id"),
            "sets": sets,
            "amount": amount,
            "unit": unit,
            "note": note_s or None,
        }
        out.append(row)
    return out


def _get_member_or_404(db: Session, member_id: int) -> Member:
    member = db.get(Member, member_id)
    if member is None:
        raise WorkoutPlanError(404, "عضو یافت نشد.")
    return member


def ensure_can_read_plans(db: Session, user: User, member_id: int) -> None:
    if user.role in (StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value):
        return
    if user.role == StaffRole.TRAINER.value and trainer_can_view_member(
        db, trainer=user, member_id=member_id
    ):
        return
    raise WorkoutPlanError(403, "دسترسی مجاز نیست.")


def ensure_can_write_plans(db: Session, user: User, member_id: int) -> None:
    if user.role == StaffRole.MANAGER.value:
        return
    if user.role == StaffRole.TRAINER.value and trainer_can_view_member(
        db, trainer=user, member_id=member_id
    ):
        return
    raise WorkoutPlanError(403, "دسترسی مجاز نیست.")


def ensure_can_manage_exercises(user: User) -> None:
    if user.role in (StaffRole.MANAGER.value, StaffRole.TRAINER.value):
        return
    raise WorkoutPlanError(403, "دسترسی مجاز نیست.")


def plan_out_fields(plan: WorkoutPlan) -> dict:
    trainer = plan.trainer
    raw_items = plan.items if isinstance(plan.items, list) else []
    items = []
    for it in raw_items:
        if not isinstance(it, dict):
            continue
        items.append(
            {
                "exercise_name": it.get("exercise_name") or "—",
                "exercise_id": it.get("exercise_id"),
                "sets": int(it.get("sets") or 0),
                "amount": int(it.get("amount") or 0),
                "unit": it.get("unit") if it.get("unit") in ("reps", "seconds") else "reps",
                "note": it.get("note"),
            }
        )
    return {
        "id": plan.id,
        "member_id": plan.member_id,
        "trainer_user_id": plan.trainer_user_id,
        "trainer_full_name": trainer.full_name if trainer is not None else None,
        "title": plan.title,
        "body": plan.body,
        "items": items,
        "created_at": plan.created_at,
        "updated_at": plan.updated_at,
    }


def list_plans(db: Session, *, user: User, member_id: int) -> list[WorkoutPlan]:
    _get_member_or_404(db, member_id)
    ensure_can_read_plans(db, user, member_id)
    stmt = (
        select(WorkoutPlan)
        .options(joinedload(WorkoutPlan.trainer))
        .where(WorkoutPlan.member_id == member_id)
        .order_by(WorkoutPlan.created_at.desc(), WorkoutPlan.id.desc())
    )
    return list(db.scalars(stmt).unique().all())


def get_or_create_exercise(
    db: Session, *, user: User, name: str
) -> WorkoutExercise:
    ensure_can_manage_exercises(user)
    cleaned = name.strip()
    if not cleaned:
        raise WorkoutPlanError(400, "نام حرکت خالی است.")
    key = exercise_name_key(cleaned)
    existing = db.scalar(select(WorkoutExercise).where(WorkoutExercise.name_key == key))
    if existing is not None:
        return existing
    row = WorkoutExercise(
        name=cleaned,
        name_key=key,
        created_by_user_id=user.id,
    )
    db.add(row)
    db.flush()
    db.refresh(row)
    return row


def list_exercises(db: Session, *, user: User, q: str = "") -> list[WorkoutExercise]:
    # Any staff role that can open workouts may browse the catalog.
    if user.role not in (
        StaffRole.MANAGER.value,
        StaffRole.RECEPTIONIST.value,
        StaffRole.TRAINER.value,
    ):
        raise WorkoutPlanError(403, "دسترسی مجاز نیست.")
    stmt = select(WorkoutExercise).order_by(WorkoutExercise.name.asc(), WorkoutExercise.id.asc())
    rows = list(db.scalars(stmt).all())
    query = exercise_name_key(q) if q.strip() else ""
    if not query:
        return rows
    return [r for r in rows if query in r.name_key]


def ensure_exercises_for_items(
    db: Session, *, user: User, items: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    enriched: list[dict[str, Any]] = []
    for it in items:
        ex = get_or_create_exercise(db, user=user, name=str(it["exercise_name"]))
        row = dict(it)
        row["exercise_id"] = ex.id
        row["exercise_name"] = ex.name
        enriched.append(row)
    return enriched


def create_plan(
    db: Session,
    *,
    user: User,
    member_id: int,
    title: str,
    body: Optional[str] = None,
    items: Optional[list[Any]] = None,
) -> WorkoutPlan:
    _get_member_or_404(db, member_id)
    ensure_can_write_plans(db, user, member_id)

    normalized: list[dict[str, Any]] = []
    if items:
        normalized = ensure_exercises_for_items(
            db, user=user, items=normalize_items(items)
        )
        body_text = items_to_body(normalized)
    else:
        body_text = (body or "").strip() or None

    plan = WorkoutPlan(
        member_id=member_id,
        trainer_user_id=user.id,
        title=title,
        body=body_text,
        items=normalized,
    )
    db.add(plan)
    db.flush()
    db.refresh(plan)
    _ = plan.trainer
    return plan


def update_plan(
    db: Session,
    *,
    user: User,
    plan_id: int,
    title: Optional[str] = None,
    body: Optional[str] = None,
    body_set: bool = False,
    items: Optional[list[Any]] = None,
    items_set: bool = False,
) -> WorkoutPlan:
    plan = db.get(WorkoutPlan, plan_id)
    if plan is None:
        raise WorkoutPlanError(404, "برنامه یافت نشد.")

    ensure_can_write_plans(db, user, plan.member_id)

    if title is not None:
        plan.title = title
    if items_set:
        if not items:
            raise WorkoutPlanError(400, "جدول حرکات نمی‌تواند خالی باشد.")
        normalized = ensure_exercises_for_items(
            db, user=user, items=normalize_items(items)
        )
        plan.items = normalized
        plan.body = items_to_body(normalized)
    elif body_set:
        plan.body = body
    plan.updated_at = datetime.now(timezone.utc)
    db.flush()
    db.refresh(plan)
    _ = plan.trainer
    return plan
