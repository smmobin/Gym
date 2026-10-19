# پرامپت مرحلهٔ بعد — برای چت سازنده (Agent)

آخرین به‌روزرسانی: ۱۴۰۴-۰۷-۲۷ (مدیر محصول — پس از تأیید استقرار/بکاپ در ریپو)  
مرحله: freeze (توقف) عضویت — صف اختیاری محصول

کل بلاک زیر را کپی کن و در یک **چت Agent جدید** (سازنده، نه مدیر محصول) بفرست.

---

```text
# نقش
تو Agent سازندهٔ پروژهٔ GYM CONTROL هستی. مدیر محصول این مرحله را تأیید کرده.
docs را خودت پیدا و بخوان (از docs/README.md شروع کن).
منبع حقیقت: docs/product/business-rules.md بخش طرح/عضویت — جملهٔ freeze.
زیرساخت موجود:
- MembershipStatus.FROZEN
- فیلدهای freeze_started_at, freeze_ends_at, freeze_days_used روی memberships
- GymSettings.freeze_annual_cap_days (پیش‌فرض ۱۴)
- cancel membership از قبل در billing هست
کار جدید فقط در frontend/ و backend/. پروتوتایپ HTML ریشه را تغییر نده.
دیپلوی واقعی روی اکانت صاحب نکن؛ پیامک/درگاه واقعی نساز.

# زبان با صاحب پروژه
فارسی، ساده، داخل <div dir="rtl">.
در پایان بگو کاملاً OK یا ناقص + نتیجهٔ تست.

# هدف این چت (فقط همین برش)
منشی/مدیر بتوانند یک عضویت فعال را برای چند روز «متوقف (freeze)» کنند تا روزهای باقی‌مانده نسوزد، با سقف سالانه از تنظیمات باشگاه؛ و بعد unfreeze کنند.

1) شروع freeze با تعداد روز (یا تاریخ پایان)
2) تمدید end_date عضویت به اندازهٔ روزهای freeze (روز نسوزد)
3) سقف freeze_annual_cap_days در سال تقویمی/شمسی — یک سیاست ساده انتخاب و مستند کن (پیشنهاد: سال میلادی UTC یا سال شمسی تهران؛ مهم یکدست باشد)
4) جلوگیری از بیش از سقف؛ جلوگیری از freeze روی عضویت منقضی/لغو‌شده
5) پایان freeze (دستی یا وقتی freeze_ends_at رسید — حداقل دستی + چک هنگام عملیات حساس)
6) حضور روی عضویت frozen: ورود ممنوع یا هشدار — پیشنهاد: check-in با آن membership ممنوع تا unfreeze
7) UI در /billing یا جزئیات عضو
8) تست سبز + audit ترجیحی

# داخل محدوده
Backend (/api/v1):

- POST /memberships/{id}/freeze
  body: days (>0) یا freeze_ends_at
  فقط manager+receptionist
  عضویت باید active باشد
  محاسبه: days مصرفی + freeze_days_used نباید از cap تنظیمات بیشتر شود
  status → frozen؛ freeze_started_at/ends_at پر شود
  end_date عضویت += تعداد روز freeze (تا اعتبار بعد از توقف بماند)
  اگر از قبل frozen است → ۴۰۹
- POST /memberships/{id}/unfreeze
  اگر زودتر از ends_at باز شد: روزهای استفاده‌نشده را از freeze_days_used کم کن و end_date را مطابق سیاست ساده تنظیم کن (مستند کن) — یا فقط status را active کن و end_date را دست نزن اگر پیچیده است؛ یکی را انتخاب و تست کن
  status → active؛ تاریخ‌های freeze جاری را پاک/ببند

خواندن:
- در پاسخ memberships فیلدهای freeze و remaining_freeze_days_this_year مفید است

نقش: trainer → ۴۰۳؛ بدون لاگین → ۴۰۱

Frontend:
- در جریان billing/عضویت: دکمهٔ توقف / پایان توقف + نمایش سقف باقی‌مانده
- RTL/فارسی؛ پیام خطای واضح وقتی سقف پر است

Docs:
- getting-started: چطور freeze را امتحان کنند
- roadmap/schema-todos به‌روز

# خارج از محدوده (نساز)
- پیامک اطلاع freeze
- پنل ورزشکار برای درخواست freeze (مگر خیلی ارزان — پیش‌فرض نه)
- رزرو کلاس ورزشکار، درگاه، دیپلوی اکانت واقعی
- تغییر HTML ریشه

# قوانین کسب‌وکار مرتبط (اجرا کن)
- freeze: منشی و مدیر؛ سقف روز در تنظیمات باشگاه (پیش‌فرض ۱۴ در سال)
- روز باقی‌مانده نسوزد (end_date جابه‌جا شود)
- مخفی کردن UI امنیت نیست

# کیفیت
- pytest: freeze OK و end_date عقب می‌رود؛ بیش از سقف رد؛ freeze تکراری رد؛ unfreeze؛ check-in روی frozen طبق سیاست؛ ۴۰۱/۴۰۳
- vitest کوچک اگر منطقی است
- .env و دادهٔ واقعی در گیت نباشد
- بعد از تست سبز: commit + push به origin/main
- گزارش: سیاست سال سقف، رفتار unfreeze زودهنگام، حضور روی frozen، چه چیز عمداً نساختی

# اگر مبهم شد
حدس نزن. business-rules freeze را اجرا کن. جزئیات فرعی را ساده بگیر و مستند کن.
```
