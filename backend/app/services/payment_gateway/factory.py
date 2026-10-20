"""Build gateway adapter from Settings; expose non-sensitive public status."""

from __future__ import annotations

from typing import Any

from app.core.config import Settings
from app.services.payment_gateway.base import GatewayError, PaymentGateway
from app.services.payment_gateway.zarinpal import ZarinpalGateway


def public_gateway_status(settings: Settings) -> dict[str, Any]:
    """Safe for UI — never includes merchant id or secrets."""
    provider = (settings.payment_gateway_provider or "none").strip().lower()
    enabled = settings.payment_gateway_enabled
    sandbox = bool(settings.payment_gateway_sandbox)
    if not enabled:
        return {
            "enabled": False,
            "provider": "none",
            "sandbox": sandbox,
            "label": "درگاه آنلاین هنوز پیکربندی نشده است",
        }
    label = "درگاه آنلاین فعال (آزمایشی / sandbox)" if sandbox else "درگاه آنلاین فعال"
    return {
        "enabled": True,
        "provider": provider,
        "sandbox": sandbox,
        "label": label,
    }


def get_payment_gateway(
    settings: Settings,
    *,
    client: Any | None = None,
) -> PaymentGateway:
    if not settings.payment_gateway_enabled:
        raise GatewayError(
            403,
            "درگاه پرداخت آنلاین هنوز آماده نیست. از میز یا درخواست تمدید استفاده کنید.",
            code="gateway_disabled",
        )
    provider = (settings.payment_gateway_provider or "").strip().lower()
    merchant = (settings.payment_gateway_merchant_id or "").strip()
    if provider == "zarinpal":
        return ZarinpalGateway(
            merchant_id=merchant,
            sandbox=bool(settings.payment_gateway_sandbox),
            client=client,
        )
    raise GatewayError(
        400,
        f"ارائه‌دهندهٔ درگاه پشتیبانی نمی‌شود: {provider}",
        code="gateway_unknown",
    )
