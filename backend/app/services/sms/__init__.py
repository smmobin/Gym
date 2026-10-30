"""SMS provider adapters (fake demo / Kavenegar; swap via SMS_PROVIDER)."""

from app.services.sms.base import SmsError, SmsSendResult
from app.services.sms.factory import get_sms_gateway, public_sms_status

__all__ = [
    "SmsError",
    "SmsSendResult",
    "get_sms_gateway",
    "public_sms_status",
]
