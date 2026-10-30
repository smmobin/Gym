# پرامپت مرحلهٔ بعد — برای چت سازنده (Agent)

آخرین به‌روزرسانی: ۱۴۰۴-۰۸-۰۸ (2026-10-30) — برش: فعال‌سازی پنل پیامک با ارائه‌دهندهٔ جعلی (fake) برای دمو بدون هزینه  
**وضعیت صف:** آمادهٔ کپی برای چت سازنده

---

کپی از خط بعدی تا پایان بلوک:

```text
تو Agent توسعهٔ پروژهٔ GYM CONTROL هستی. docs را خودت پیدا و بخوان. لیست URL از صاحب نخواه.

## هدف
صاحب باشگاه می‌خواهد **پنل قالب پیامک** (مدیر/منشی → `#sms`) واقعاً قابل استفاده باشد تا جریان انتخاب عضو → ارسال قالب → پیام موفقیت را ببیند — **بدون کاوه‌نگار واقعی و بدون هزینه**. یک ارائه‌دهندهٔ جعلی (fake API) بساز که وانمود کند پیامک ارسال شد.

## زمینهٔ فعلی (کوتاه)
- `SMS_PROVIDER` پیش‌فرض `none` است؛ `settings.sms_enabled` فقط وقتی provider واقعی + `SMS_API_KEY` پر باشد True است → UI تگ «هنوز آماده نیست» و دکمهٔ ارسال disabled؛ `POST /api/v1/sms/send` → ۴۰۳.
- Adapter فعلی: `kavenegar` در `app/services/sms/`؛ factory در `factory.py`؛ UI در `frontend/assets/js/sms-templates.js` از `GET /api/v1/sms/status` می‌خواند.
- قوانین کسب‌وکار: موبایل فقط از پروندهٔ عضو روی سرور؛ مدیر/منشی ارسال قالب؛ مربی نه؛ audit برای ارسال.

## داخل محدوده

### ۱) ارائه‌دهندهٔ `fake` (یا نام ثابت معادل مثل `console` — یکی را انتخاب و همه‌جا یکسان کن؛ ترجیح: `fake`)
- کلاس/ماژول جدید مطابق Protocol `SmsGateway` در `base.py`.
- `send_sms(...)` باید:
  - همیشه موفق برگردد (`SmsSendResult(ok=True, message_id=... یک id جعلی پایدار/یونیک، provider_status=200, message=...)`).
  - متن کامل پیام + receptor را در **لاگ سرور** بنویسد (logger.info) تا صاحب در ترمینال بک‌اند ببیند «چه چیزی فرضاً ارسال شد» — بدون نوشتن API key (اصلاً لازم نیست).
  - هیچ HTTP بیرونی نزند.
- در `get_sms_gateway`: اگر provider=`fake` این gateway را برگردان.
- در `public_sms_status`: وقتی fake فعال است `enabled: true` و label فارسی واضح مثل «پیامک فعال (حالت آزمایشی — ارسال واقعی نیست)».

### ۲) شرط `sms_enabled` در Settings
الان کلید API برای هر provider اجباری است. برای `fake`:
- بدون نیاز به `SMS_API_KEY` واقعی، `sms_enabled` باید True شود وقتی `SMS_PROVIDER=fake` (و نه production-accident: در production-like یا fake را ممنوع کن مگر `ALLOW_FAKE_SMS=true`، یا صریحاً فقط در non-production اجازه بده — امن‌ترین: **fake فقط وقتی `not is_production_like`**؛ در production-like اگر کسی fake بگذارد → disabled + پیام واضح).
- `kavenegar` مثل قبل: نیاز به API key.
- `none` مثل قبل: disabled.

### ۳) پیکربندی محلی برای صاحب
- `backend/.env.example` را با توضیح `SMS_PROVIDER=fake` برای دمو به‌روز کن.
- اگر `backend/.env` محلی وجود دارد و الان `none` است، برای دمو محلی `SMS_PROVIDER=fake` بگذار — **هرگز `.env` را commit نکن**؛ کلید واقعی نساز.
- بعد از تغییر settings، اگر کش `get_settings` هست، تست‌ها `cache_clear` کنند (الگوی موجود).

### ۴) رفتار محصول بعد از فعال شدن
- `GET /api/v1/sms/status` → enabled true + label آزمایشی.
- UI `#sms`: تگ فعال، picker عضو، دکمهٔ ارسال زنده؛ بعد از ارسال پیام موفقیت فارسی (مثل الان از `detail`).
- `POST /sms/send`: مسیر موجود (قالب + member_id + audit) حفظ شود؛ فقط gateway عوض می‌شود.
- OTP ورود مربی/ورزشکار: وقتی fake فعال است، SMS واقعاً از مسیر gateway fake می‌رود (کد تصادفی در لاگ دیده می‌شود). اگر این پیچیدگی OTP را می‌شکند، حداقل قالب‌های میز را درست کن و در گزارش بگو OTP چه شد؛ ترجیح: هر دو مسیر با fake کار کنند. کد ثابت `123456` فقط وقتی provider=`none` بماند (طبق business-rules).

### ۵) تست
- vitest/pytest: حداقل یک تست که با `SMS_PROVIDER=fake` (بدون API key) status enabled است، send موفق است، audit نوشته می‌شود، و هیچ HTTP واقعی زده نمی‌شود.
- تست‌های قبلی kavenegar/disabled نشکند.
- در production-like، fake بدون اجازه نباید enabled شود (اگر آن گارد را پیاده کردی، تستش کن).

### ۶) docs کوتاه
- `docs/guides/getting-started.md` بخش پیامک: یک پاراگراف «برای دمو بدون هزینه: SMS_PROVIDER=fake» اضافه کن.
- در صورت نیاز یک خط در `business-rules.md` که fake فقط توسعه/دمو است نه باشگاه واقعی.

## خارج محدوده
- اتصال واقعی کاوه‌نگار / خرید پنل
- قالب‌های جدید پیامک / UI redesign بزرگ
- حذف toastهای A1–A8 (صف جدا مگر قبلاً زده شده)
- Slice J (also_trainer)
- HTML ریشه / GitHub Pages
- commit کردن `.env` یا کلید واقعی

## تست و تحویل
- pytest مربوط (حداقل `test_sms.py` + هر تست OTP متأثر) و در صورت نیاز vitest سبز
- بدون secret در گیت
- طبق قانون Gym: بعد از سبز، commit و push به origin/main
- به صاحب بگو: کاملاً OK یا ناقص؛ و دقیقاً بگو در `.env` چه بگذارد و از کدام URL (`/manager/#sms` یا receptionist) با کدام کاربر seed تست کند؛ بگو متن پیامک فرضی کجا در لاگ بک‌اند دیده می‌شود.

## گزارش پایانی
1) SMS_PROVIDER=fake چطور روشن می‌شود  
2) آیا پنل دیگر «هنوز آماده نیست» نیست  
3) نمونه لاگ یک ارسال موفق  
```
