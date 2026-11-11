# پرامپت مرحلهٔ بعد — برای چت سازنده (Agent)

آخرین به‌روزرسانی: ۱۴۰۴-۰۸-۲۲ (2026-11-12)  
**وضعیت صف:** آماده‌سازی پروداکشن در کد انجام شد. پرامپت سازندهٔ بعدی ندارد تا صاحب سرور را بالا بیاورد یا باگ دیپلوی بیاید.  
**اسناد قفل:** `guides/production-data-policy.md`، `guides/security-hardening-status.md`، `guides/repo-structure.md`، `guides/deploy.md`

---

## پرامپت سازنده

صف کدنویسی این مرحله بسته است. گارد wipe/seed، `ensure_smoke_accounts`، و استارت `app.db.serve` در ریپو هستند. تا باگ دیپلوی یا برش محصول بعدی از صاحب نیاید، پرامپت تازه‌ای اینجا نگذار. دستور اولین سرور خالی در [deploy.md](../guides/deploy.md) بخش «اولین حساب‌ها» است.

---

## یادآوری برای صاحب (عملیات، نه کد)

1. دامنه + HTTPS  
2. env سرور: `APP_ENV=production`, `SECRET_KEY`, `DATABASE_URL`, `CORS_ORIGINS`, `ALLOW_DESTRUCTIVE_SEED=false`  
3. بکاپ قبل از migration بزرگ  
4. اگر گزارش شدت بازرس متنی داری → جدول پیوست `security-hardening-status.md` را پر کن  
