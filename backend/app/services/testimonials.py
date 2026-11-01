"""CRUD for landing member testimonials."""

from __future__ import annotations

from typing import Any, Union

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import StaffRole
from app.models.testimonial import MemberTestimonial
from app.models.user import User
from app.services.audit import write_audit


class TestimonialError(Exception):
    def __init__(self, status_code: int, detail: Union[str, dict[str, Any]]) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(str(detail))


def ensure_desk_staff(user: User) -> None:
    if user.role not in (StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value):
        raise TestimonialError(403, "دسترسی مجاز نیست.")


def list_active_testimonials(db: Session) -> list[MemberTestimonial]:
    return list(
        db.scalars(
            select(MemberTestimonial)
            .where(MemberTestimonial.is_active.is_(True))
            .order_by(MemberTestimonial.sort_order.asc(), MemberTestimonial.id.asc())
        ).all()
    )


def list_testimonials(db: Session, *, include_inactive: bool = False) -> list[MemberTestimonial]:
    stmt = select(MemberTestimonial).order_by(
        MemberTestimonial.sort_order.asc(), MemberTestimonial.id.asc()
    )
    if not include_inactive:
        stmt = stmt.where(MemberTestimonial.is_active.is_(True))
    return list(db.scalars(stmt).all())


def create_testimonial(
    db: Session,
    *,
    user: User,
    body: str,
    author_name: str,
    author_meta: str | None,
    sort_order: int = 0,
    is_active: bool = True,
) -> MemberTestimonial:
    ensure_desk_staff(user)
    row = MemberTestimonial(
        body=body,
        author_name=author_name,
        author_meta=author_meta,
        sort_order=sort_order,
        is_active=is_active,
    )
    db.add(row)
    db.flush()
    write_audit(
        db,
        actor_user_id=user.id,
        action="testimonial.create",
        entity_type="member_testimonial",
        entity_id=row.id,
        summary=f"ساخت نظر لندینگ از {author_name}",
        payload={
            "author_name": author_name,
            "author_meta": author_meta,
            "sort_order": sort_order,
            "is_active": is_active,
        },
    )
    return row


def update_testimonial(
    db: Session,
    *,
    user: User,
    testimonial_id: int,
    body: str | None = None,
    author_name: str | None = None,
    author_meta: str | None = None,
    sort_order: int | None = None,
    is_active: bool | None = None,
    clear_author_meta: bool = False,
) -> MemberTestimonial:
    ensure_desk_staff(user)
    row = db.get(MemberTestimonial, testimonial_id)
    if row is None:
        raise TestimonialError(404, "نظر یافت نشد.")

    if body is not None:
        row.body = body
    if author_name is not None:
        row.author_name = author_name
    if clear_author_meta:
        row.author_meta = None
    elif author_meta is not None:
        row.author_meta = author_meta
    if sort_order is not None:
        row.sort_order = sort_order
    if is_active is not None:
        row.is_active = is_active

    db.flush()
    write_audit(
        db,
        actor_user_id=user.id,
        action="testimonial.update",
        entity_type="member_testimonial",
        entity_id=row.id,
        summary=f"ویرایش نظر لندینگ #{row.id}",
        payload={
            "body": body,
            "author_name": author_name,
            "author_meta": row.author_meta,
            "sort_order": row.sort_order,
            "is_active": row.is_active,
        },
    )
    return row
