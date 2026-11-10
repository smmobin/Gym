# سامانهٔ لاگ و فعالیت — GYM CONTROL

**تاریخ:** ۱۴۰۴-۰۸-۲۰ (2026-11-10)  
**وضعیت:** پیاده‌سازی شد (برش Logging) — این سند با کد هم‌خوان است.

## این چیست؟

سه لایهٔ جدا — قاطی نشوند:

| لایه | مخاطب | کجا؟ | چه چیزی؟ |
|------|--------|------|----------|
| **۱) لاگ سیستمی فایل** | فقط سازنده / اپراتور سرور | پوشهٔ محلی `backend/logs/` (در گیت نیست) | هر درخواست HTTP، خطا + stack، startup، شکست SMS بدون کلید |
| **۲) آدیت دیتابیس** | منبع حقیقت رویدادهای حساس | جدول `audit_logs` (+ ستون `request_id`) | ورود/خروج، OTP، پول، عضویت، طرح، تنظیمات، نقش کارکنان |
| **۳) پنل مدیر — فعالیت** | مدیر باشگاه در UI | `/manager/#activity` | **زیرمجموعه‌ای خوانا** از آدیت + خلاصهٔ خطاهای مهم (جدول `system_error_events`) — نه فایل لاگ |

## چه چیزی در پنل مدیر نیست؟

- محتوای خام `app.log` / `access.log` / `error.log` / `sensitive.log`
- stack trace یا متن exception
- کلید API، رمز عبور، OTP کامل، cookie/session خام، payload خام آدیت
- هر کلیک hash فرانت که به سرور نرسیده (مثلاً فقط عوض شدن `#settings` بدون API)

## ۱) فایل‌های سازنده (لوکال)

مسیر پیش‌فرض روی ویندوز صاحب: `D:\VibeCoding\Cursor\Gym\backend\logs\`  
(با `LOG_DIR` در `.env` قابل تغییر؛ `logs/` و `*.log` در `.gitignore` هستند.)

| فایل | نقش |
|------|-----|
| `access.log` | یک خط برای هر درخواست: `method`، `path` (بدون query)، `status`، `duration_ms`، `scheme`، `client`، `rid` |
| `app.log` | رویدادهای اپ + uvicorn (startup و…) در سطح `LOG_LEVEL` |
| `error.log` | فقط ERROR+ با stack trace کامل + `rid` |
| `sensitive.log` | فقط فیلد مجاز دیباگ: موبایل کامل هنگام شکست ارسال SMS (`gym.sensitive`) — هرگز متن پیامک/OTP/کلید |

- پیکربندی: `backend/app/core/logging_setup.py` — از `lifespan` در `app/main.py` صدا زده می‌شود.
- چرخش: `RotatingFileHandler` (پیش‌فرض ۵MB × ۵ نسخه) — `LOG_MAX_BYTES` / `LOG_BACKUP_COUNT`.
- `LOG_LEVEL` (پیش‌فرض `INFO`)، `LOG_TO_FILES=false` برای خاموش کردن فایل‌ها.
- همان خط access در ترمینال PowerShell هم چاپ می‌شود؛ خط تکراری `uvicorn.access` خاموش است تا یک منبع واحد بماند.
- **آدرس وب برای لاگ کامل تا این لحظه وجود ندارد** (عمدی بوده). صاحب درخواست پنل وب سازنده با قفل توکن داده — صف ساخت در `docs/prompts/next-coding-prompt.md` (مسیر پیشنهادی بعد از ساخت: `/dev-logs/`).
- پنل مدیر `/manager/#activity` عمداً **خلاصه** است و قرار نیست ریز همهٔ لاگ‌ها را نشان دهد.

## Request ID

- Middleware: `backend/app/core/request_middleware.py` (ASGI خالص، بیرونی‌ترین لایه).
- هر درخواست یک UUID می‌گیرد؛ اگر کلاینت/پروکسی `X-Request-ID` امن (۸–۶۴ کاراکتر `A-Z a-z 0-9 . _ -`) بفرستد همان استفاده می‌شود.
- در هدر پاسخ `X-Request-ID` برمی‌گردد (در CORS هم expose شده) و در همهٔ خطوط لاگ (`rid=`) و ردیف‌های آدیت (ستون `audit_logs.request_id`) تکرار می‌شود.
- خطای مدیریت‌نشده → پاسخ ۵۰۰ امن `{"detail": "...", "request_id": "..."}` بدون متن exception؛ stack فقط در `error.log`.

## Redaction (پوشاندن)

`backend/app/core/redaction.py`:

- `redact_text` روی **کل خط فرمت‌شده** (پیام + traceback) در همهٔ handlerهای فایل: `password=…`، `api_key=…`، `token`، `Authorization: Bearer …`، `cookie`، `otp/code=…` و OTP داخل متن پیامک («کد … 123456») → `[REDACTED]`.
- موبایل `09xxxxxxxxx` → `0912***4567` در همهٔ فایل‌ها به‌جز `sensitive.log`.
- ترمینال لوکال: رمز/کلید پاک می‌شود ولی موبایل و OTP پیامک fake خوانا می‌ماند (برای دمو با `SMS_PROVIDER=fake`).
- `redact_mapping` برای dictها (کلیدهای `password*`، `*api_key*`، `*token*`، `*secret*`، `otp*`، `code`، `session`، …) — `session_count` و مبالغ دست نمی‌خورند.

## ۲) آدیت دیتابیس — actionهای پوشش‌داده‌شده

`write_audit` خودش `request_id` درخواست جاری را می‌نویسد. برای درخواست‌های شکست‌خورده (session درخواست rollback می‌شود) `write_audit_isolated` ردیف را در session جدا commit می‌کند.

| دسته | action |
|------|--------|
| ورود/خروج | `auth.login.success`، `auth.login.failure`، `auth.logout` (staff + ورزشکار؛ هم `/auth/*` و هم `/athlete/auth/*`) |
| OTP | `auth.otp.send` (`payload.ok`)، `auth.otp.verify.success`، `auth.otp.verify.failure` — **بدون کد** |
| طرح | `plan.create`، `plan.update` / `plan.deactivate` با `payload.before` (تغییر قیمت در summary: «تغییر قیمت طرح …: قبلی ← جدید») |
| عضویت | `membership.renew`، `membership.renew_online(_failed)`، `membership.cancel`، `membership.freeze`، `membership.unfreeze` |
| پرداخت | `payment.create`، `payment.refund`، `payment.online_paid`، `payment.online_failed`، `payment.online_verify_error` |
| تنظیمات | `gym_settings.patch` (`before`/`after` بدون رمز) |
| کارکنان | `staff.create`، `staff.update` (با `before.role`)، `staff.deactivate`، `staff.password_reset` (فقط `password_changed: true`) |

در failureها: موبایل فقط ماسک (`mobile_masked`)، `reason` مثل `bad_credentials` / `ambiguous_identity` / `rate_limited`؛ رمز و کد هرگز.

## ۳) پنل مدیر — `/manager/#activity`

- فقط نقش **manager**؛ API برای منشی/مربی `403`، بدون نشست `401` (ورزشکار نشست کارکنان ندارد → `401`).
- `GET /api/v1/manager/activity?from=YYYY-MM-DD&to=YYYY-MM-DD&q=&category=&cursor=&limit=`
  - بازه به تقویم تهران؛ پیش‌فرض ۷ روز اخیر؛ حداکثر ۳۶۶ روز.
  - `category`: `auth`، `plans`، `memberships`، `payments`، `settings`، `staff`، `errors`.
  - خروجی هر ردیف: `summary`، `category`، `outcome` (`ok`/`fail`)، کاربر، `request_id`؛ برای خطا `method`/`path`/`status_code`. **payload خام برنمی‌گردد.**
  - صفحه‌بندی با `next_cursor` (زمان آخرین ردیف).
- `GET /api/v1/manager/activity/export` — همان فیلتر → `text/plain; charset=utf-8`، فایل `gym-activity-YYYYMMDD-YYYYMMDD.log` (حداکثر ۵۰۰۰ ردیف، ارقام لاتین برای grep).
- منبع خطاها: جدول `system_error_events` — middleware برای هر **۵xx** و برای **۴۲۹ روی `/api/v1/auth/*`** (احتمال brute force) یک ردیف می‌نویسد: زمان، `request_id`، method، path، status، نام کلاس exception. بدون body و بدون stack.
- Seed: چند ردیف نمونه (ورود موفق/ناموفق، OTP، تغییر قیمت، تنظیمات، برگشت پرداخت، یک ۵۰۰ و یک ۴۲۹) با موبایل ساختگی ماسک‌شده.

## قوانین محرمانگی

1. رمز عبور، `SMS_API_KEY`، OTP شش‌رقمی کامل، cookie خام → **هیچ فایلی** (حتی sensitive).
2. در لاگ اصلی: موبایل ماسک (مثلاً `0912***4567`)؛ موبایل کامل فقط در `sensitive.log` هنگام شکست SMS.
3. payload آدیت: قبل/بعد لازم بدون رمز؛ مبالغ و شناسه‌ها OK.
4. pytest هرگز در `backend/logs/` نمی‌نویسد (`LOG_DIR` → پوشهٔ temp در `conftest.py`) و هرگز SMS واقعی نمی‌فرستد (`SMS_PROVIDER=none` اجباری در تست).
