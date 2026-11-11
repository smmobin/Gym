# وضعیت سخت‌گیری امنیت — GYM CONTROL

**تاریخ ثبت سند:** ۱۴۰۴-۰۸-۲۲ (2026-11-12)  
**زمینه:** صاحب اعلام کرد بازبینی توسط چت **دستیار بررسی امنیت** انجام و اصلاحات اعمال شده؛ این سند وضعیت را از روی **کد و تست‌های ریپو** قفل می‌کند تا برای دیپلوی گم نشود.

> اگر گزارش شدت کامل چت بازرس را داری، بخش «پیوست یافته‌ها» را با همان لیست تکمیل کن (بدون چسباندن secret).

## منبع حقیقت تست

فایل رگرسیون: `backend/tests/test_security_hardening.py`  
میان‌افزار: `backend/app/core/security_middleware.py`  
رد کردن کانفیگ ناامن prod: `Settings.production_config_errors()` + استارت در `app/main.py`

## اصلاحات / کنترل‌های پوشش‌داده‌شده در کد (خلاصه)

| حوزه | چه تضمین می‌شود؟ | شواهد |
|------|------------------|--------|
| پول آنلاین ورزشکار | مبلغ از کلاینت برای تمدید آنلاین ورزشکار قابل اعتماد نیست | `test_athlete_online_renew_ignores_client_amount` |
| نشست پس از تغییر نقش | نقش قدیمی باطل / رد می‌شود | `test_role_change_ends_old_session`, `test_stale_acting_role_is_rejected…` |
| ریست رمز | نشست‌های هدف باطل می‌شوند؛ مدیر رمز مدیر دیگر را عوض نمی‌کند | تست‌های password reset |
| OTP | کد ثابت `123456` فقط با opt-in صریح لوکال؛ در prod-like نه | `test_fixed_otp_requires_explicit_opt_in` |
| Rate limit | سقف ساعتی OTP per mobile؛ محدودیت IP برای پاشش موبایل | تست‌های rate limit |
| CSRF / Origin | POST بین‌سایتی به API رد می‌شود | `test_cross_site_post_is_rejected` |
| هدرها | nosniff، frame deny، CSP، no-store روی API، HSTS در prod-like | `test_security_headers_on_api_and_no_store` + middleware |
| خطای درگاه | ریدایرکت بدون متن آزاد خطرناک | `test_gateway_error_redirect_omits_free_text` |
| کانفیگ prod | SECRET ضعیف، CORS localhost، destructive seed، … جلوی استارت | `test_production_config_errors` |
| XSS فرانت | escape در مسیرهای حساس | `frontend/tests/xss-escape.test.js` |
| لاگ | redaction؛ بینندهٔ فایل فقط با توکن و خاموش در prod | `guides/logging.md` |
| داده | wipe/seed مخرب روی prod-like بدون فلگ صریح رد می‌شود | `seed.py` / `wipe_dev_data.py` |

## هنوز کار صاحب / محیط (نه فقط کد)

- [ ] دامنه + **HTTPS** واقعی
- [ ] `SECRET_KEY` بلند تصادفی روی سرور
- [ ] `CORS_ORIGINS` فقط دامنهٔ HTTPS خودت
- [ ] بکاپ + یک‌بار restore — [backup.md](backup.md)
- [ ] `ALLOW_DESTRUCTIVE_SEED=false` روی سرور
- [ ] پیامک/درگاه فقط از secrets هاست (نه گیت)
- [ ] در صورت امکان: Mozilla Observatory / SSL Labs روی دامنه
- [ ] Dependabot / `npm audit` / `pip-audit` دوره‌ای

## پیوست یافته‌های چت بازرس (اختیاری)

| # | شدت | موضوع | وضعیت |
|---|------|--------|--------|
| — | — | (صاحب بعد از گزارش بازرس پر کند) | باز / رفع‌شده |

پرامپت بازرس: [prompts/security-auditor-prompt.md](../prompts/security-auditor-prompt.md)

## قانون بعد از این سند

هر فیکس امنیتی جدید → یا تست رگرسیون در `test_security_hardening` (یا معادل) + یک ردیف در همین جدول.
