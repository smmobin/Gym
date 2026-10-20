"""Athlete (and optional desk) online payment: start → gateway → server verify → paid/renew."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urlencode

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.enums import PaymentMethod, PaymentPurpose, PaymentStatus
from app.models.enums import MembershipStatus
from app.models.member import Member
from app.models.membership import Membership, MembershipPlan
from app.models.payment import Payment
from app.services import billing as billing_svc
from app.services.audit import write_audit
from app.services.payment_gateway import (
    GatewayError,
    get_payment_gateway,
    public_gateway_status,
)

_MIN_ONLINE_TOMAN = 100


class OnlinePaymentError(Exception):
    def __init__(self, status_code: int, detail: str, *, code: str | None = None) -> None:
        self.status_code = status_code
        self.detail = detail
        self.code = code
        super().__init__(detail)


@dataclass
class StartOnlineResult:
    payment: Payment
    payment_url: str
    authority: str
    gateway: dict


@dataclass
class CallbackResult:
    payment: Payment
    outcome: str  # paid | cancelled | failed | already_paid
    redirect_url: str | None


def gateway_status(settings: Settings) -> dict:
    return public_gateway_status(settings)


def _require_callback_url(settings: Settings) -> str:
    url = (settings.payment_gateway_callback_url or "").strip()
    if not url:
        raise OnlinePaymentError(
            400,
            "آدرس بازگشت درگاه (PAYMENT_GATEWAY_CALLBACK_URL) تنظیم نشده است.",
            code="callback_url_missing",
        )
    return url


def front_return_url(settings: Settings, *, query: dict[str, str]) -> str | None:
    """Browser landing after gateway callback (hash-friendly for Ocean Dark MPA)."""
    base = (settings.payment_gateway_front_return_url or "").strip()
    if not base:
        origins = settings.cors_origin_list
        if origins:
            base = origins[0].rstrip("/") + "/athlete/#pay"
        else:
            return None
    sep = "&" if "?" in base else "?"
    # Keep hash routes: if base has #, put query before hash when possible
    if "#" in base and "?" not in base.split("#", 1)[0]:
        path, frag = base.split("#", 1)
        return f"{path}?{urlencode(query)}#{frag}"
    return f"{base}{sep}{urlencode(query)}"


def start_athlete_online_payment(
    db: Session,
    *,
    settings: Settings,
    member: Member,
    purpose: str,
    amount_toman: int | None,
    plan_id: int | None = None,
    base_membership_id: int | None = None,
    note: str | None = None,
    http_client=None,
) -> StartOnlineResult:
    status = public_gateway_status(settings)
    if not status["enabled"]:
        raise OnlinePaymentError(
            403,
            "درگاه پرداخت آنلاین هنوز آماده نیست. از درخواست تمدید برای میز استفاده کنید.",
            code="gateway_disabled",
        )

    purpose_norm = (purpose or "").strip().lower()
    if purpose_norm not in {PaymentPurpose.DEBT.value, PaymentPurpose.RENEW.value}:
        raise OnlinePaymentError(422, "هدف پرداخت نامعتبر است (debt یا renew).")

    renew_plan_id: int | None = None
    renew_base_id: int | None = None
    title: str

    if purpose_norm == PaymentPurpose.RENEW.value:
        if plan_id is None:
            raise OnlinePaymentError(422, "برای تمدید، طرح (plan_id) لازم است.")
        plan = db.get(MembershipPlan, plan_id)
        if plan is None or not plan.is_active:
            raise OnlinePaymentError(404, "طرح فعال یافت نشد.")
        renew_plan_id = plan.id
        if base_membership_id is not None:
            base = db.get(Membership, base_membership_id)
            if base is None or base.member_id != member.id:
                raise OnlinePaymentError(404, "اشتراک مرجع یافت نشد.")
            if base.status == MembershipStatus.CANCELLED.value:
                raise OnlinePaymentError(409, "اشتراک لغوشده نمی‌تواند مبنای تمدید باشد.")
            renew_base_id = base_membership_id
        agreed = amount_toman if amount_toman is not None else plan.base_price_toman
        if agreed < _MIN_ONLINE_TOMAN:
            raise OnlinePaymentError(
                422,
                f"مبلغ تمدید آنلاین حداقل {_MIN_ONLINE_TOMAN} تومان است.",
            )
        amount = agreed
        title = f"تمدید آنلاین — {plan.name}"
    else:
        debt = billing_svc.member_debt_toman(db, member.id)
        if amount_toman is None:
            raise OnlinePaymentError(422, "مبلغ پرداخت بدهی لازم است.")
        if amount_toman < _MIN_ONLINE_TOMAN:
            raise OnlinePaymentError(
                422,
                f"حداقل مبلغ پرداخت آنلاین {_MIN_ONLINE_TOMAN} تومان است.",
            )
        if debt <= 0:
            raise OnlinePaymentError(409, "بدهی باز برای پرداخت نیست.")
        if amount_toman > debt:
            raise OnlinePaymentError(422, "مبلغ نمی‌تواند بیشتر از بدهی باشد.")
        amount = amount_toman
        title = "پرداخت بدهی آنلاین"

    callback_url = _require_callback_url(settings)

    try:
        gateway = get_payment_gateway(settings, client=http_client)
        req = gateway.request_payment(
            amount_toman=amount,
            callback_url=callback_url,
            description=title,
            metadata={"mobile": member.mobile, "display_id": member.display_id},
        )
    except GatewayError as err:
        raise OnlinePaymentError(err.status_code, err.detail, code=err.code) from err

    receipt = billing_svc.next_receipt_number(db)
    payment = Payment(
        member_id=member.id,
        membership_id=None,
        amount_toman=amount,
        method=PaymentMethod.ONLINE.value,
        status=PaymentStatus.PENDING.value,
        receipt_number=receipt,
        title=title,
        note=note,
        paid_at=None,
        created_by_user_id=None,
        gateway_provider=status["provider"],
        gateway_authority=req.authority,
        purpose=purpose_norm,
        renew_plan_id=renew_plan_id,
        renew_base_membership_id=renew_base_id,
    )
    db.add(payment)
    db.flush()

    write_audit(
        db,
        actor_user_id=None,
        action="payment.online_start",
        entity_type="payment",
        entity_id=payment.id,
        summary=f"شروع پرداخت آنلاین {receipt} برای {member.display_id}",
        payload={
            "member_id": member.id,
            "amount_toman": amount,
            "purpose": purpose_norm,
            "authority": req.authority,
            "provider": status["provider"],
            "sandbox": status["sandbox"],
            "renew_plan_id": renew_plan_id,
        },
    )

    return StartOnlineResult(
        payment=payment,
        payment_url=req.payment_url,
        authority=req.authority,
        gateway=status,
    )


def handle_gateway_callback(
    db: Session,
    *,
    settings: Settings,
    authority: str,
    gateway_status_param: str | None,
    http_client=None,
) -> CallbackResult:
    authority = (authority or "").strip()
    if not authority:
        raise OnlinePaymentError(400, "شناسهٔ تراکنش (Authority) نامعتبر است.")

    payment = db.scalar(select(Payment).where(Payment.gateway_authority == authority))
    if payment is None:
        raise OnlinePaymentError(404, "پرداخت متناظر یافت نشد.")

    # Idempotent success
    if payment.status == PaymentStatus.PAID.value:
        return CallbackResult(
            payment=payment,
            outcome="already_paid",
            redirect_url=front_return_url(
                settings,
                query={
                    "pay": "ok",
                    "receipt": payment.receipt_number,
                    "dup": "1",
                },
            ),
        )

    if payment.status in {
        PaymentStatus.CANCELLED.value,
        PaymentStatus.FAILED.value,
        PaymentStatus.REFUNDED.value,
    }:
        return CallbackResult(
            payment=payment,
            outcome=payment.status,
            redirect_url=front_return_url(
                settings,
                query={"pay": payment.status, "receipt": payment.receipt_number},
            ),
        )

    status_flag = (gateway_status_param or "").strip().upper()
    if status_flag != "OK":
        payment.status = PaymentStatus.CANCELLED.value
        payment.status_changed_at = datetime.now(tz=timezone.utc)
        db.flush()
        write_audit(
            db,
            actor_user_id=None,
            action="payment.online_cancelled",
            entity_type="payment",
            entity_id=payment.id,
            summary=f"انصراف/شکست درگاه برای {payment.receipt_number}",
            payload={"authority": authority, "gateway_status": status_flag},
        )
        return CallbackResult(
            payment=payment,
            outcome="cancelled",
            redirect_url=front_return_url(
                settings,
                query={"pay": "cancelled", "receipt": payment.receipt_number},
            ),
        )

    try:
        gateway = get_payment_gateway(settings, client=http_client)
        verify = gateway.verify_payment(
            amount_toman=payment.amount_toman,
            authority=authority,
        )
    except GatewayError as err:
        payment.status = PaymentStatus.FAILED.value
        payment.status_changed_at = datetime.now(tz=timezone.utc)
        db.flush()
        write_audit(
            db,
            actor_user_id=None,
            action="payment.online_verify_error",
            entity_type="payment",
            entity_id=payment.id,
            summary=f"خطای تأیید درگاه برای {payment.receipt_number}",
            payload={"authority": authority, "detail": err.detail},
        )
        raise OnlinePaymentError(err.status_code, err.detail, code=err.code) from err

    if not verify.ok:
        payment.status = PaymentStatus.FAILED.value
        payment.status_changed_at = datetime.now(tz=timezone.utc)
        db.flush()
        write_audit(
            db,
            actor_user_id=None,
            action="payment.online_failed",
            entity_type="payment",
            entity_id=payment.id,
            summary=f"تأیید ناموفق درگاه برای {payment.receipt_number}",
            payload={
                "authority": authority,
                "raw_code": verify.raw_code,
                "message": verify.message,
            },
        )
        return CallbackResult(
            payment=payment,
            outcome="failed",
            redirect_url=front_return_url(
                settings,
                query={"pay": "failed", "receipt": payment.receipt_number},
            ),
        )

    # Mark paid (idempotent renew below)
    now = datetime.now(tz=timezone.utc)
    if payment.status != PaymentStatus.PAID.value:
        payment.status = PaymentStatus.PAID.value
        payment.paid_at = now
        payment.status_changed_at = now
        if verify.ref_id:
            payment.gateway_ref_id = verify.ref_id
        db.flush()
        write_audit(
            db,
            actor_user_id=None,
            action="payment.online_paid",
            entity_type="payment",
            entity_id=payment.id,
            summary=f"پرداخت آنلاین موفق {payment.receipt_number}",
            payload={
                "authority": authority,
                "ref_id": verify.ref_id,
                "already_verified": verify.already_verified,
                "amount_toman": payment.amount_toman,
            },
        )

    if (
        payment.purpose == PaymentPurpose.RENEW.value
        and payment.renewed_membership_id is None
        and payment.renew_plan_id is not None
    ):
        try:
            result = billing_svc.renew_membership(
                db,
                user=None,
                member_id=payment.member_id,
                plan_id=payment.renew_plan_id,
                agreed_amount_toman=payment.amount_toman,
                base_membership_id=payment.renew_base_membership_id,
                notes="تمدید خودکار پس از پرداخت آنلاین موفق",
                require_desk=False,
                audit_action="membership.renew_online",
            )
            payment.renewed_membership_id = result.membership.id
            payment.membership_id = result.membership.id
            db.flush()
        except billing_svc.BillingError as err:
            # Payment stays paid; renew failure is logged for desk follow-up
            write_audit(
                db,
                actor_user_id=None,
                action="membership.renew_online_failed",
                entity_type="payment",
                entity_id=payment.id,
                summary=f"پرداخت موفق ولی تمدید خودکار ناموفق ({payment.receipt_number})",
                payload={"detail": err.detail, "status_code": err.status_code},
            )

    return CallbackResult(
        payment=payment,
        outcome="paid",
        redirect_url=front_return_url(
            settings,
            query={
                "pay": "ok",
                "receipt": payment.receipt_number,
                **(
                    {"membership": str(payment.renewed_membership_id)}
                    if payment.renewed_membership_id
                    else {}
                ),
            },
        ),
    )
