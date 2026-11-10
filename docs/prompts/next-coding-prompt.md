# پرامپت مرحلهٔ بعد — برای چت سازنده (Agent)

آخرین به‌روزرسانی: ۱۴۰۴-۰۸-۲۰ (2026-11-10)  
**وضعیت صف:** برش **Logging + فعالیت مدیر** — اولویت جلوتر از Slice J  
**مشخصات:** `docs/guides/logging.md`

---

## پرامپت کامل — کپی در چت سازنده

```text
تو Agent توسعهٔ GYM CONTROL هستی. docs را خودت پیدا و بخوان (به‌ویژه guides/logging.md، guides/security.md، guides/project-rules.md §۷ audit، product/business-rules.md، product/roadmap-status.md، guides/testing.md، adr فرانت Ocean Dark MPA). لیست URL از صاحب نخواه.

## هدف این برش
یک سامانهٔ لاگ یکپارچهٔ پایتون + تکمیل آدیت + بخش «فعالیت سامانه» فقط در پنل مدیر (زیرمجموعهٔ خوانا) + خروجی .log بازهٔ تاریخ + تست خودکار. لاگ کامل فایل فقط برای سازنده روی دیسک — نه dump کامل در UI مدیر.

## سه لایه (قاطی نکن)

### A) لاگ سیستمی فایل (مخاطب: سازنده)
- پوشه: `backend/logs/` (از قبل در .gitignore با `logs/` و `*.log` هست؛ اگر لازم تقویت کن، ولی secrets را commit نکن).
- فایل‌ها:
  - `access.log` — هر درخواست HTTP به اپ: زمان، method، path (بدون query دارای توکن)، status، مدت ms، scheme (http/https)، client host، `request_id`
  - `app.log` — رویدادهای عمومی اپ + همان access در سطح INFO در صورت تمایل ساختاریافته
  - `error.log` — exceptionها با stack trace کامل + request_id
  - `sensitive.log` — فقط فیلدهای حساسِ مجاز دیباگ (مثلاً موبایل کامل هنگام خطای SMS). هرگز: password، SMS_API_KEY، OTP کامل ۶ رقمی، cookie/session خام، Authorization bearer
- پیکربندی متمرکز Python logging (dictConfig یا معادل تمیز در ماژول مثلاً `app/core/logging_setup.py`)؛ از startup در `main.py` / lifespan صدا زده شود.
- سطح لاگ از Settings قابل تنظیم (مثلاً LOG_LEVEL=INFO) — در `.env.example` نه مقدار واقعی محرمانه.
- Uvicorn/access پیش‌فرض را طوری یکپارچه کن که همان درخواست‌ها در فایل access هم بنشینند (نه فقط کنسول PowerShell). هدف: چیزی که الان فقط در ترمینال دیده می‌شود، در فایل هم بماند.
- Rotation ساده (مثلاً RotatingFileHandler اندازه/تعداد backup) تا دیسک پر نشود.
- Middleware FastAPI:
  - تولید یا پذیرش `X-Request-ID` (UUID)
  - قرار دادن در contextvars برای logger
  - برگرداندن هدر `X-Request-ID` در پاسخ
  - ثبت زمان پاسخ و status
- Redaction helper مرکزی: قبل از log هر dict/پیام، کلیدهای حساس را بپوشان (`password`, `password_hash`, `api_key`, `token`, `otp`, `code` وقتی OTP است، `authorization`, `cookie`, `secret`, …).

### B) آدیت دیتابیس (تکمیل)
جدول `audit_logs` و `write_audit` از قبل هست. شکاف‌ها را ببند — حداقل این actionها (نام‌گذاری پایدار نقطه‌ای مثل بقیه):
- `auth.login.success` / `auth.login.failure` (staff و athlete؛ در failure رمز ننویس؛ موبایل ماسک در summary OK)
- `auth.logout`
- `auth.otp.send` / `auth.otp.verify.success` / `auth.otp.verify.failure` (بدون کد OTP در payload)
- تغییر طرح/قیمت (اگر الان نیست کامل کن)
- تنظیمات باشگاه (الان هست — مطمئن شو قبل/بعد بدون رمز)
- تمدید/پرداخت/برگشت/نقش کارکنان — اگر از قبل هست رگرسیون نشکن؛ فقط پوشش ورود/خروج و موارد گم‌شده را اضافه کن
- در صورت امکان `request_id` را هم به ردیف آدیت وصل کن اگر ستون جدید لازم است → Alembic migration تمیز؛ وگرنه داخل payload JSONB بگذار — یکی را انتخاب کن و در docs کوتاه بگو.

### C) پنل مدیر — فقط زیرمجموعه (مخاطب: مدیر باشگاه)
- مسیر UI: `/manager/#activity` با عنوان فارسی مثل «فعالیت سامانه»
- آیکن outline مثل بقیهٔ ناوبری پنل‌ها (الگوی موجود panel-nav)
- فقط نقش **manager** (منشی این بخش را نبیند؛ API هم ۴۰۳ برای non-manager)
- نشان بده:
  1. ورود/خروج موفق و ناموفق (از آدیت)
  2. تغییرات قیمت/طرح/عضویت/پرداخت مهم/تنظیمات/نقش کارکنان (از آدیت — فیلتر actionهای مجاز)
  3. خطاهای مهم سرور: خلاصهٔ ۵xx (و در صورت صلاح‌دید تعداد محدود ۴۰۳/۴۲۹ مشکوک) با زمان + request_id + path — بدون stack کامل و بدون body محرمانه
- برای (۳): یا جدول سبک DB برای «رویدادهای قابل‌نمایش مدیر» هنگام ۵xx بنویس، یا API که از آدیت+جدول error_events بخواند — فایل خام `error.log` را مستقیم به مرورگر سرو نکن.
- ظاهر: هم‌سبک Ocean Dark MPA، شیک و خلوت، یک جدول/لیست RTL با فیلتر بازهٔ تاریخ جلالی در UI (مثل بقیهٔ پروژه)، جستجوی ساده روی خلاصه.
- خروجی: دکمه «خروجی بازه» → دانلود فایل UTF-8 با پسوند `.log` (نه xlsx) شامل همان ردیف‌های فیلترشدهٔ فعالیت مدیر؛ نام فایل مثلاً `gym-activity-YYYYMMDD-YYYYMMDD.log`.
- Seed: چند ردیف آدیت نمونهٔ واقعی‌نما (بدون PII واقعی) تا مدیر با دیتابیس خالی صفحه را خالی نبیند اگر seed خالی بود؛ اگر seed فعلی آدیت دارد، در صورت نیاز غنی‌تر کن.

## API پیشنهادی (تحت /api/v1 — نام‌ها را با سبک موجود هماهنگ کن)
- `GET /api/v1/manager/activity` — query: from, to, q?, cursor/limit — فقط manager
- `GET /api/v1/manager/activity/export` — همان فیلتر → text/plain یا attachment `.log` — فقط manager
- هر دو: بدون لاگین ۴۰۱؛ receptionist/trainer/athlete ۴۰۳

## خارج محدوده (نساز)
- Slice J (also_trainer / مدیر+مربی)
- نمایش یا API عمومی برای خواندن کل `backend/logs/*.log` از اینترنت
- Excel/CSV اجباری (فقط .log)
- تغییر HTML ریشهٔ پروتوتایپ GitHub Pages مگر ضروری نباشد
- commit کردن `.env` یا هر فایل داخل `backend/logs/`
- پنل فعالیت برای منشی
- لاگ کردن هر تغییر hash سمت کلاینت بدون درخواست سرور (عمداً خارج — فقط رویدادهای سرور)

## تست (اجباری قبل از commit)
Backend pytest حداقل:
- middleware: پاسخ دارای `X-Request-ID`؛ دو درخواست id متفاوت
- redaction: پیام شامل password/api_key لاگ نمی‌شود (caplog یا فایل temp)
- login failure/success حداقل یک مسیر آدیت می‌نویسد
- `GET manager/activity` برای manager ۲۰۰؛ برای receptionist ۴۰۳؛ بدون سشن ۴۰۱
- export بازه یک فایل متنی با content-type مناسب برمی‌گرداند
Frontend vitest در صورت ماژول JS جدید برای activity (مثل بقیهٔ desk mounts): رندر اولیه / فیلتر نقش اگر منطق کلاینت جداست.

پوشهٔ تست موقت لاگ را در tmp بگذار تا pytest دیسک پروژه را کثیف نکند.

## Docs
- `docs/guides/logging.md` را با واقعیت پیاده‌سازی هم‌خوان کن (مسیر فایل‌ها، نام API، actionهای آدیت جدید).
- `docs/guides/getting-started.md` یک پاراگراف کوتاه: کجا لاگ فایل ببینی.
- `docs/product/roadmap-status.md` را بعد از سبز شدن تست به‌روز نکن مگر صاحب/مدیر گفته — در این برش اگر سبز شد وضعیت برش Logging را انجام‌شده علامت بزن و بگو Slice J هنوز صف بعدی محصول بزرگ است.
- اگر قرارداد تست عوض شد: `docs/guides/testing.md` یک خط.

## تحویل
1. تست‌های مرتبط سبز
2. commit متمرکز + push به origin/main (طبق قانون Gym؛ بدون secrets)
3. گزارش فارسی به صاحب:
   - کاملاً OK یا ناقص
   - مسیر فولدر لاگ سازنده روی دیسک
   - آدرس UI مدیر `#activity`
   - یادآوری: لاگ کامل وب ندارد (عمدی)
```

---

## صف بعدی بعد از این برش

Slice J — مدیر/منشی هم‌زمان مربی (`also_trainer`) — از مدیر محصول پرامپت بگیر.
