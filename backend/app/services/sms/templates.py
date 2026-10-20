"""Built-in SMS templates (server is source of truth for send)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SmsTemplate:
    id: str
    title: str
    body: str


TEMPLATES: dict[str, SmsTemplate] = {
    "welcome": SmsTemplate(
        id="welcome",
        title="خوش‌آمد",
        body="سلام {{name}}، به باشگاه آذر خوش آمدید. کد عضویت شما {{display_id}} است.",
    ),
    "expiry": SmsTemplate(
        id="expiry",
        title="انقضای نزدیک",
        body="{{name}} عزیز، اشتراک شما تا {{end_date}} فعال است. برای تمدید با منشی تماس بگیرید.",
    ),
    "debt": SmsTemplate(
        id="debt",
        title="یادآوری بدهی",
        body="{{name}}، مبلغ بدهی ثبت‌شده شما {{debt}} تومان است. لطفاً پیگیری کنید.",
    ),
}


def list_templates() -> list[SmsTemplate]:
    return list(TEMPLATES.values())


def get_template(template_id: str) -> SmsTemplate | None:
    return TEMPLATES.get((template_id or "").strip())
