"""Resolve login identities for a mobile without guessing role on the client."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import StaffRole
from app.models.member import Member
from app.models.user import User
from app.services.athlete import member_eligible_for_login

Kind = Literal["staff", "athlete"]

ROLE_LABELS_FA = {
    StaffRole.MANAGER.value: "مدیر",
    StaffRole.RECEPTIONIST.value: "منشی",
    StaffRole.TRAINER.value: "مربی",
    "athlete": "ورزشکار",
}

PASSWORD_ONLY_ROLES = frozenset(
    {StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value}
)
OTP_ELIGIBLE_STAFF_ROLES = frozenset({StaffRole.TRAINER.value})


@dataclass(frozen=True)
class LoginIdentity:
    kind: Kind
    role: str
    label: str
    auth_methods: tuple[str, ...]
    has_password: bool


class LoginIdentityError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def member_has_password(member: Member) -> bool:
    return bool(member.password_hash)


def _staff_identity(user: User) -> LoginIdentity:
    methods: list[str] = ["password"]
    if user.role in OTP_ELIGIBLE_STAFF_ROLES:
        methods = ["otp", "password"]
    return LoginIdentity(
        kind="staff",
        role=user.role,
        label=ROLE_LABELS_FA.get(user.role, user.role),
        auth_methods=tuple(methods),
        has_password=True,
    )


def _athlete_identity(member: Member) -> LoginIdentity:
    has_pw = member_has_password(member)
    methods: list[str] = ["otp"]
    if has_pw:
        methods.append("password")
    return LoginIdentity(
        kind="athlete",
        role="athlete",
        label=ROLE_LABELS_FA["athlete"],
        auth_methods=tuple(methods),
        has_password=has_pw,
    )


def list_identities_for_mobile(db: Session, *, mobile: str) -> list[LoginIdentity]:
    mobile = mobile.strip()
    out: list[LoginIdentity] = []

    user = db.scalar(select(User).where(User.mobile == mobile))
    if user is not None and user.is_active:
        out.append(_staff_identity(user))

    member = db.scalar(select(Member).where(Member.mobile == mobile))
    if member is not None and member_eligible_for_login(member):
        out.append(_athlete_identity(member))

    return out


def resolve_identity(
    db: Session,
    *,
    mobile: str,
    kind: Kind | None,
    role: str | None,
) -> LoginIdentity:
    """Pick exactly one identity; enforce kind/role against DB (never trust client alone)."""
    identities = list_identities_for_mobile(db, mobile=mobile)
    if not identities:
        raise LoginIdentityError(401, "اطلاعات ورود نادرست است.")

    if kind is None:
        if len(identities) > 1:
            raise LoginIdentityError(
                409,
                "چند هویت برای این موبایل وجود دارد. نقش را انتخاب کنید.",
            )
        return identities[0]

    if kind == "staff":
        matches = [i for i in identities if i.kind == "staff"]
        if not matches:
            raise LoginIdentityError(401, "اطلاعات ورود نادرست است.")
        chosen = matches[0]
        if role and chosen.role != role:
            raise LoginIdentityError(401, "اطلاعات ورود نادرست است.")
        return chosen

    if kind == "athlete":
        matches = [i for i in identities if i.kind == "athlete"]
        if not matches:
            raise LoginIdentityError(401, "اطلاعات ورود نادرست است.")
        return matches[0]

    raise LoginIdentityError(400, "نوع هویت نامعتبر است.")


def identity_allows_otp(identity: LoginIdentity) -> bool:
    return "otp" in identity.auth_methods


def identity_requires_password_only(identity: LoginIdentity) -> bool:
    return identity.role in PASSWORD_ONLY_ROLES and "otp" not in identity.auth_methods
