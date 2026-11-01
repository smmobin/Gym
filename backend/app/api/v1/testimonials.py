"""Public + desk APIs for landing member testimonials."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.db import get_db
from app.core.rate_limit import public_testimonials_rate_limiter
from app.models.enums import StaffRole
from app.models.user import User
from app.schemas.testimonials import (
    MemberTestimonialCreateRequest,
    MemberTestimonialListResponse,
    MemberTestimonialMutationResponse,
    MemberTestimonialOut,
    MemberTestimonialUpdateRequest,
    PublicTestimonialListResponse,
    PublicTestimonialOut,
)
from app.services import testimonials as tm_svc

router = APIRouter(tags=["testimonials"])

_DESK = (StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value)


def _raise(err: tm_svc.TestimonialError) -> None:
    raise HTTPException(status_code=err.status_code, detail=err.detail) from err


@router.get(
    "/public/testimonials",
    response_model=PublicTestimonialListResponse,
)
def list_public_testimonials(
    request: Request,
    db: Session = Depends(get_db),
) -> PublicTestimonialListResponse:
    """No auth. Active quotes only — for landing `#testimonials`."""
    client = request.client.host if request.client else "unknown"
    if not public_testimonials_rate_limiter.is_allowed(client):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.",
        )
    items = tm_svc.list_active_testimonials(db)
    return PublicTestimonialListResponse(
        items=[PublicTestimonialOut.model_validate(r) for r in items],
        total=len(items),
    )


@router.get("/testimonials", response_model=MemberTestimonialListResponse)
def list_testimonials(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
    include_inactive: bool = Query(
        False,
        description="If true, include inactive quotes (management UI).",
    ),
) -> MemberTestimonialListResponse:
    tm_svc.ensure_desk_staff(user)
    items = tm_svc.list_testimonials(db, include_inactive=include_inactive)
    return MemberTestimonialListResponse(
        items=[MemberTestimonialOut.model_validate(r) for r in items],
        total=len(items),
    )


@router.post(
    "/testimonials",
    response_model=MemberTestimonialMutationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_testimonial(
    body: MemberTestimonialCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> MemberTestimonialMutationResponse:
    try:
        row = tm_svc.create_testimonial(
            db,
            user=user,
            body=body.body,
            author_name=body.author_name,
            author_meta=body.author_meta,
            sort_order=body.sort_order,
            is_active=body.is_active,
        )
        db.commit()
        db.refresh(row)
    except tm_svc.TestimonialError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return MemberTestimonialMutationResponse(
        testimonial=MemberTestimonialOut.model_validate(row)
    )


@router.patch(
    "/testimonials/{testimonial_id}",
    response_model=MemberTestimonialMutationResponse,
)
def patch_testimonial(
    testimonial_id: int,
    body: MemberTestimonialUpdateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> MemberTestimonialMutationResponse:
    data = body.model_dump(exclude_unset=True)
    clear_meta = bool(data.pop("clear_author_meta", False))
    try:
        row = tm_svc.update_testimonial(
            db,
            user=user,
            testimonial_id=testimonial_id,
            body=data.get("body"),
            author_name=data.get("author_name"),
            author_meta=data.get("author_meta"),
            sort_order=data.get("sort_order"),
            is_active=data.get("is_active"),
            clear_author_meta=clear_meta,
        )
        db.commit()
        db.refresh(row)
    except tm_svc.TestimonialError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return MemberTestimonialMutationResponse(
        testimonial=MemberTestimonialOut.model_validate(row)
    )
