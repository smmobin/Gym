# وضعیت نقشهٔ راه — GYM CONTROL

**آخرین به‌روزرسانی:** ۱۴۰۴-۰۸-۲۲ (2026-11-12) — گارد production و حساب دود insert-only در کد  
**نقش:** سند زندهٔ مدیر محصول — بعد از هر مرحلهٔ انجام‌شده باید عوض شود.

## الان کجاییم؟

| برش | وضعیت |
|-----|--------|
| هستهٔ وب + لوگو + PWA | انجام‌شده |
| پیامک واقعی کاوه‌نگار | adapter + `.env` محلی |
| Logging + فعالیت مدیر + پنل سازنده | انجام‌شده |
| Slice J — also_trainer | انجام‌شده |
| بازبینی امنیت (چت بازرس + سخت‌گیری کد) | **مستند شد** — `guides/security-hardening-status.md` |
| سیاست داده روی سرور | **در کد هم قفل شد** — production حتی با فلگ destructive هم wipe/seed نمی‌زند |
| حساب دود | **انجام‌شده** — `python -m app.db.ensure_smoke_accounts` (فقط INSERT) |
| استارت Docker | **انجام‌شده** — `app.db.serve` = `alembic upgrade head` سپس uvicorn |
| آماده‌سازی نهایی دیپلوی HTTPS | **صف صاحب** — دامنه، env، بکاپ؛ کد دیپلوی افزایشی آماده است |

## مرحلهٔ بعد

1. صاحب: دامنه، HTTPS، env سرور (`APP_ENV=production`، `SECRET_KEY`، `DATABASE_URL`، `CORS_ORIGINS`، `ALLOW_DESTRUCTIVE_SEED=false`)، بکاپ  
2. اولین سرور خالی: `alembic upgrade head` (یا `docker compose up` که همین را می‌زند) سپس یک‌بار `ensure_smoke_accounts` — بدون wipe و بدون seed  
3. دیپلویهای بعدی: فقط کد جدید + `alembic upgrade head` + ری‌استارت. دادهٔ قبلی می‌ماند.

## تصمیم‌های قفل‌شدهٔ تازه (داده)

- روی سرور اصلی: **هیچ ریست/پاک‌کردن داده برای seed دوباره**  
- آپدیت‌ها فقط افزایشی (کد + migration)  
- حساب تست مجاز: ۱ مدیر + ۱ منشی + ۱ مربی + ۱ عضو — اگر از قبل هستند نپاک  
- `ALLOW_DESTRUCTIVE_SEED` روی سرور واقعی همیشه خاموش؛ روی `production`/`prod` حتی true هم wipe/seed را اجرا نمی‌کند

## حفره‌ها

- HTTPS دامنهٔ واقعی هنوز به صاحب وابسته است  
- پیوست جدول یافته‌های شدت بازرس در `security-hardening-status.md` اگر گزارش متنی داری  
- تست دود پیامک واقعی روی موبایل صاحب  
