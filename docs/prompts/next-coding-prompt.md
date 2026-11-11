# پرامپت مرحلهٔ بعد — برای چت سازنده (Agent)

آخرین به‌روزرسانی: ۱۴۰۴-۰۸-۲۲ (2026-11-12)  
**وضعیت صف:** آماده‌سازی پروداکشن + هم‌خوانی کد با سیاست دادهٔ سرور  
**اسناد قفل:** `guides/production-data-policy.md`، `guides/security-hardening-status.md`، `guides/repo-structure.md`، `guides/deploy.md`

---

## پرامپت کامل — کپی در چت سازنده

```text
تو Agent توسعهٔ GYM CONTROL هستی. docs را خودت پیدا و بخوان — مخصوصاً:
guides/production-data-policy.md، guides/deploy.md، guides/security-hardening-status.md،
guides/repo-structure.md، guides/backup.md، guides/security.md، product/roadmap-status.md.
لیست URL از صاحب نخواه.

## هدف
پروژه را برای دیپلوی production آماده و با سیاست دادهٔ صاحب هم‌خوان کن:
- روی سرور هیچ wipe / ریست داده / seed فیک حجیم اجرا نشود
- آپدیت‌ها فقط افزایشی (کد + alembic upgrade)
- حداکثر حساب دود: ۱ مدیر + ۱ منشی + ۱ مربی + ۱ عضو — بدون پاک کردن دادهٔ قبلی
- docs و در صورت نیاز کد گاردها را محکم کن

## کار اجباری (کد اگر حفره دیدی)

1. **گارد داده:** مطمئن شو `wipe_dev_data`، `wipe_and_seed`، و `seed` مخرب در `APP_ENV` production-like بدون `ALLOW_DESTRUCTIVE_SEED` خارج می‌شوند (الان هست — رگرسیون تست بنویس/تقویت اگر کم است).
2. **اسکریپت idempotent اختیاری ولی توصیه‌شده:** مثلاً `python -m app.db.ensure_smoke_accounts` که:
   - فقط اگر نقش/موبایل داده‌شده وجود ندارد INSERT می‌کند
   - هرگز DELETE / wipe / clear نمی‌کند
   - در production-like بدون فلگ مخرب هم مجاز است (چون مخرب نیست)
   - موبایل/رمز را از argv یا env موقت بگیرد؛ رمز را echo نکند؛ در گیت secret نگذارد
   - اگر مدیر از قبل هست، bootstrap_manager را صدا نزند (تداخل ندهد)
3. **دیپلوی:** `deploy.md` / `.env.example` را با واقعیت کد یکی کن؛ در مثال‌های docker/compose یا اسکریپت دیپلوی هیچ `wipe` یا `seed` کامل نباشد — فقط `alembic upgrade head` + uvicorn/build.
4. **استارت prod:** `production_config_errors` همچنان جلوی SECRET ضعیف / CORS نامناسب / destructive seed را بگیرد؛ تست موجود را سبز نگه دار.
5. **ساختار:** اگر چیزی در repo خلاف `repo-structure.md` است (مثلاً دستور دیپلوی که Pages را محصول فرض کند) اصلاح یا در docs هشدار بده — HTML ریشه را محصول نکن.
6. **امنیت:** تست‌های `test_security_hardening` را سبز نگه دار؛ فیکس امنیتی جدید بدون تست نگذار.

## خارج محدوده
- پاک کردن DB واقعی یا نوشتن اسکریپت «reset production»
- ریختن seed فیک هشت‌عضوی روی سرور
- خرید دامنه / ثبت‌نام لیارا به‌جای صاحب
- commit کردن `.env` یا رمز حساب‌های دود واقعی
- فیچر محصول جدید (فروشگاه، شعبه، …)

## تست
- pytest: prod-like بدون ALLOW_DESTRUCTIVE_SEED → wipe و seed کامل fail می‌شوند
- اگر ensure_smoke_accounts ساختی: دوبار اجرا → تعداد ردیف اضافه نشود (idempotent)؛ و هیچ جدول دیگری خالی نشود
- test_security_hardening و production_config_errors سبز

## Docs
- production-data-policy / deploy / roadmap را با واقعیت پیاده‌سازی هم‌خوان کن
- getting-started یک پاراگراف: «روی سرور seed نزن؛ bootstrap_manager + ۴ نقش دود»
- اگر جدول یافتهٔ بازرس را صاحب پر کرد دست نزن

## تحویل
تست سبز → commit/push بدون secret → گزارش فارسی:
- کاملاً OK یا ناقص
- صاحب برای اولین سرور خالی دقیقاً چه دستورهایی بزند (بدون wipe)
- یادآوری: دیپلوی بعدی فقط upgrade + ری‌استارت؛ داده نمی‌میرد
```

---

## یادآوری برای صاحب (عملیات، نه کد)

1. دامنه + HTTPS  
2. env سرور: `APP_ENV=production`, `SECRET_KEY`, `DATABASE_URL`, `CORS_ORIGINS`, `ALLOW_DESTRUCTIVE_SEED=false`  
3. بکاپ قبل از migration بزرگ  
4. اگر گزارش شدت بازرس متنی داری → جدول پیوست `security-hardening-status.md` را پر کن  
