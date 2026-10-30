"""Desk SMS send: resolve member mobile on server, render template, audit."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.enums import MembershipStatus
from app.models.member import Member
from app.models.membership import Membership
from app.models.user import User
from app.services.audit import write_audit
from app.services.billing import member_debt_toman
from app.services.sms.base import SmsError, SmsGateway, SmsSendResult
from app.services.sms.factory import get_sms_gateway, public_sms_status
from app.services.sms.templates import get_template, list_templates


class SmsSendError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


@dataclass(frozen=True)
class SendOutcome:
    ok: bool
    template_id: str
    member_id: int
    display_id: str
    provider: str
    message_id: str | None
    detail: str


def sms_status(settings: Settings) -> dict[str, Any]:
    return public_sms_status(settings)


def templates_for_api() -> list[dict[str, str]]:
    return [{"id": t.id, "title": t.title, "body": t.body} for t in list_templates()]


def _render(body: str, variables: dict[str, str]) -> str:
    out = body
    for key, value in variables.items():
        out = out.replace("{{" + key + "}}", value)
    return out


def _member_name(member: Member) -> str:
    return f"{member.first_name} {member.last_name}".strip()


def _latest_end_date(db: Session, member_id: int) -> str:
    row = db.scalar(
        select(Membership)
        .where(
            Membership.member_id == member_id,
            Membership.status.in_(
                (
                    MembershipStatus.ACTIVE.value,
                    MembershipStatus.FROZEN.value,
                    MembershipStatus.EXPIRED.value,
                )
            ),
        )
        .order_by(Membership.end_date.desc(), Membership.id.desc())
        .limit(1)
    )
    if row is None:
        return "—"
    return row.end_date.isoformat()


def _build_variables(db: Session, member: Member) -> dict[str, str]:
    debt = member_debt_toman(db, member.id)
    return {
        "name": _member_name(member),
        "display_id": member.display_id,
        "end_date": _latest_end_date(db, member.id),
        "debt": f"{debt:,}",
    }


def _resolve_member_mobile(db: Session, member_id: int) -> tuple[Member, str]:
    member = db.get(Member, member_id)
    if member is None:
        raise SmsSendError(404, "عضو یافت نشد.")
    mobile = (member.mobile or "").strip()
    if len(mobile) < 10:
        raise SmsSendError(422, "موبایل عضو برای ارسال پیامک معتبر نیست.")
    return member, mobile


def _deliver_to_member(
    db: Session,
    *,
    settings: Settings,
    actor: User,
    member: Member,
    mobile: str,
    text: str,
    template_id: str,
    gateway: SmsGateway | None = None,
) -> SendOutcome:
    if not settings.sms_enabled:
        raise SmsSendError(403, "ارسال پیامک هنوز آماده نیست.")

    body = (text or "").strip()
    if not body:
        raise SmsSendError(422, "متن پیامک خالی است.")
    if len(body) > 700:
        raise SmsSendError(422, "متن پیامک بیش از حد طولانی است.")

    provider = (settings.sms_provider or "").strip().lower()
    status = public_sms_status(settings)

    try:
        gw = gateway or get_sms_gateway(settings)
        result: SmsSendResult = gw.send_sms(
            receptor=mobile,
            message=body,
            sender=(settings.sms_sender or "").strip() or None,
        )
    except SmsError as err:
        write_audit(
            db,
            actor_user_id=actor.id,
            action="sms.send_failed",
            entity_type="member",
            entity_id=member.id,
            summary=f"شکست ارسال پیامک قالب {template_id} به {member.display_id}",
            payload={
                "template_id": template_id,
                "provider": provider,
                "ok": False,
                "code": err.code,
                "status_code": err.status_code,
            },
        )
        raise SmsSendError(err.status_code, err.detail) from err

    write_audit(
        db,
        actor_user_id=actor.id,
        action="sms.send",
        entity_type="member",
        entity_id=member.id,
        summary=f"ارسال پیامک قالب {template_id} به {member.display_id}",
        payload={
            "template_id": template_id,
            "provider": provider,
            "ok": True,
            "message_id": result.message_id,
            # last 4 digits only — full mobile already on member row
            "receptor_suffix": mobile[-4:],
        },
    )

    return SendOutcome(
        ok=True,
        template_id=template_id,
        member_id=member.id,
        display_id=member.display_id,
        provider=status.get("provider") or provider,
        message_id=result.message_id,
        detail="پیامک ارسال شد.",
    )


def send_template_to_member(
    db: Session,
    *,
    settings: Settings,
    actor: User,
    template_id: str,
    member_id: int,
    gateway: SmsGateway | None = None,
) -> SendOutcome:
    """
    Send a built-in template to a member's stored mobile.
    Client must not supply an arbitrary phone number.
    """
    if not settings.sms_enabled:
        raise SmsSendError(403, "ارسال پیامک هنوز آماده نیست.")

    template = get_template(template_id)
    if template is None:
        raise SmsSendError(404, "قالب پیامک یافت نشد.")

    member, mobile = _resolve_member_mobile(db, member_id)
    variables = _build_variables(db, member)
    text = _render(template.body, variables)
    # Drop any leftover unknown placeholders rather than leaking braces
    for key in ("name", "display_id", "end_date", "debt"):
        text = text.replace("{{" + key + "}}", "—")

    return _deliver_to_member(
        db,
        settings=settings,
        actor=actor,
        member=member,
        mobile=mobile,
        text=text,
        template_id=template.id,
        gateway=gateway,
    )


def send_custom_to_member(
    db: Session,
    *,
    settings: Settings,
    actor: User,
    member_id: int,
    message: str,
    gateway: SmsGateway | None = None,
) -> SendOutcome:
    """Free-text body; receptor still only from member record."""
    if not settings.sms_enabled:
        raise SmsSendError(403, "ارسال پیامک هنوز آماده نیست.")
    member, mobile = _resolve_member_mobile(db, member_id)
    return _deliver_to_member(
        db,
        settings=settings,
        actor=actor,
        member=member,
        mobile=mobile,
        text=message,
        template_id="custom",
        gateway=gateway,
    )
