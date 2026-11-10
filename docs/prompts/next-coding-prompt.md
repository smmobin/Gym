# پرامپت مرحلهٔ بعد — برای چت سازنده (Agent)

آخرین به‌روزرسانی: ۱۴۰۴-۰۸-۲۰ (2026-11-10)  
**وضعیت صف:** فعلاً **کدنویسی لازم نیست** — صاحب پیامک واقعی را با کاوه‌نگار + `.env` روشن می‌کند.  
**راهنما:** `docs/guides/sms-real-setup.md`

---

## الان (صاحب — بدون چت سازنده)

1. ثبت‌نام [kavenegar.com](https://kavenegar.com) و کپی API KEY  
2. در `backend/.env` (لوکال، بدون commit):

```env
SMS_PROVIDER=kavenegar
SMS_API_KEY=...
# SMS_SENDER=...   # فقط اگر پنل خط اجباری خواست
```

3. ری‌استارت بک‌اند → تست `#sms` و OTP روی موبایل خودت  
4. به مدیر محصول بگو نتیجه OK یا خطا

---

## پرامپت سازنده — فقط اگر صاحب پنل غیراز کاوه‌نگار خواست

کپی در صورت نیاز (قاصدک / ملی‌پیامک / SMS.ir):

```text
تو Agent توسعهٔ GYM CONTROL هستی. docs را خودت پیدا کن.

## هدف
یک SMS gateway جدید مطابق Protocol موجود در `app/services/sms/base.py` برای provider انتخابی صاحب اضافه کن و به factory + Settings + `.env.example` + تست وصل کن — مثل الگوی `kavenegar.py` و `fake.py`.

## داخل محدوده
- کلاس gateway جدید؛ بدون لاگ کردن API key
- `SMS_PROVIDER=<name>` و کلیدهای لازم در Settings
- `sms_enabled` مثل بقیهٔ providerهای واقعی (کلید پر)
- تست pytest با httpx mock (بدون شبکه واقعی)
- docs کوتاه در `sms-real-setup.md` و getting-started

## خارج محدوده
- خرید پنل / ثبت‌نام به‌جای صاحب
- commit کردن `.env` یا کلید واقعی
- Slice J / PWA

## تحویل
pytest sms سبز؛ commit/push؛ بگو صاحب چه env بگذارد.
```

---

## صف بعدی محصول (بعد از OK پیامک)

Slice J یا سخت‌کردن دیپلوی HTTPS — از مدیر محصول پرامپت بگیر.
