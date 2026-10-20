"""Build SMS adapter from Settings; expose non-sensitive public status."""

from __future__ import annotations

from typing import Any

from app.core.config import Settings
from app.services.sms.base import SmsError, SmsGateway
from app.services.sms.kavenegar import KavenegarGateway


def public_sms_status(settings: Settings) -> dict[str, Any]:
    """Safe for UI — never includes API key or secrets."""
    provider = (settings.sms_provider or "none").strip().lower()
    enabled = settings.sms_enabled
    if not enabled:
        return {
            "enabled": False,
            "provider": "none",
            "label": "پیامک هنوز پیکربندی نشده است",
        }
    label = "پیامک فعال"
    if provider == "kavenegar":
        label = "پیامک فعال (کاوه‌نگار)"
    return {
        "enabled": True,
        "provider": provider,
        "label": label,
    }


def get_sms_gateway(
    settings: Settings,
    *,
    client: Any | None = None,
) -> SmsGateway:
    if not settings.sms_enabled:
        raise SmsError(
            403,
            "ارسال پیامک هنوز آماده نیست.",
            code="sms_disabled",
        )
    provider = (settings.sms_provider or "").strip().lower()
    api_key = (settings.sms_api_key or "").strip()
    sender = (settings.sms_sender or "").strip()
    if provider == "kavenegar":
        return KavenegarGateway(api_key=api_key, default_sender=sender, client=client)
    raise SmsError(
        400,
        f"ارائه‌دهندهٔ پیامک پشتیبانی نمی‌شود: {provider}",
        code="sms_unknown",
    )
