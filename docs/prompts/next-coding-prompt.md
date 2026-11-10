# پرامپت مرحلهٔ بعد — برای چت سازنده (Agent)

آخرین به‌روزرسانی: ۱۴۰۴-۰۸-۲۰ (2026-11-10)  
**وضعیت صف:** برش **Slice J — مدیر/منشی هم‌زمان مربی (`also_trainer`)**  
**Logging:** انجام‌شده — دست نزن مگر رگرسیون دیدی

---

## پرامپت کامل — کپی در چت سازنده

```text
تو Agent توسعهٔ GYM CONTROL هستی. docs را خودت پیدا و بخوان (به‌ویژه product/business-rules.md بخش «هم‌زمانی نقش کارکنان»، product/roadmap-status.md، guides/security.md، guides/testing.md، guides/project-rules.md، adr فرانت Ocean Dark MPA). لیست URL از صاحب نخواه.

## هدف
پشتیبانی از یک حساب کارکنان که هم‌زمان **مدیر+مربی** یا **منشی+مربی** باشد — یک موبایل، بدون ساختن user دوم. ورود با انتخاب نقش (`acting_role`)؛ مجوز سرور بر اساس نقشِ جلسه‌ای؛ UI کارکنان با گزینهٔ «مربی هم هست».

## وضعیت الان (حفره)
- `users.role` فقط یک مقدار است (manager | receptionist | trainer).
- `list_identities_for_mobile` فقط یک هویت staff برمی‌گرداند.
- `staff_sessions` ستون `acting_role` ندارد.
- authorize معمولاً از `user.role` می‌خواند؛ کلاینت نمی‌تواند نقش دوم را انتخاب کند.
- UI کارکنان فقط نقش تکی می‌سازد؛ چک‌باکس «مربی هم هست» نیست.
- فهرست مربیان/واگذاری کلاس فقط `role=trainer` را می‌بیند.

## قوانین کسب‌وکار (اجباری)
- مجاز: مدیر+مربی یا منشی+مربی روی یک حساب.
- ممنوع نسخهٔ اول: مدیر+منشی هم‌زمان روی یک حساب.
- وقتی با نقش میز (manager/receptionist) وارد شده: دسترسی میز همان نقش؛ APIهای اختصاصی مربی (محدود به شاگردان خودش) باز نمی‌شوند مگر مسیرهایی که از قبل برای مدیر مجاز بود.
- وقتی با نقش trainer وارد شده: پنل `/trainer/` و محدودیت «فقط شاگردان خودش».
- ورود: اگر چند هویت → انتخاب نقش؛ بدون اولویت خودکار.
- مدیر/منشی (نقش میز): فقط رمز. مربی: OTP (+ رمز پشتیبان مثل امروز).
- موبایل کارکنان یکتاست؛ ساخت حساب دوم با همان موبایل ممنوع.
- حذف دائمی اشخاص و آرشیو از میز ممنوع (وضعیت فعلی را نشکن).

## طراحی پیشنهادی (اگر بهتر دیدی بگو ولی رفتار یکی باشد)
1. ستون بولین `users.also_trainer` (پیش‌فرض false). فقط وقتی `role` برابر manager یا receptionist است معنا دارد؛ برای `role=trainer` نادیده/false بماند.
2. ستون `staff_sessions.acting_role` (manager|receptionist|trainer) — هنگام login ست شود و در همهٔ `require_roles` / وابستگی‌های auth از **acting_role نشست** استفاده شود نه فقط `users.role`.
3. `list_identities_for_mobile`: اگر staff فعال و `also_trainer` و role میز → دو هویت staff برگردان (یکی role میز با auth password-only؛ یکی role=trainer با otp+password). اگر فقط trainer یا فقط میز بدون پرچم → مثل امروز یک هویت.
4. resolve/login: کلاینت `kind=staff` + `role` انتخابی را می‌فرستد؛ سرور چک کند آن role برای آن user واقعاً مجاز است (میز اصلی یا also_trainer).
5. UI کارکنان (manager؛ و receptionist فقط روی مربی‌ها طبق قواعد فعلی):
   - وقتی نقش انتخابی manager یا receptionist است: چک‌باکس واضح «مربی هم هست».
   - ویرایش مدیر موجود: بتواند also_trainer را روشن/خاموش کند (بدون تغییر نقش به trainer خالص مگر مسیر جداگانهٔ آگاهانه — ترجیح: role میز بماند + پرچم).
   - تبدیل اشتباه به دو user ممنوع.
6. فهرست مربیان، انتخاب مربی کلاس، وصل شاگرد: userهایی با `role=trainer` **یا** (`also_trainer` و فعال) را شامل شود.
7. Seed: حداقل یک نمونهٔ واقعی‌نما — مثلاً مدیر seed با `also_trainer=true` و یک منشی با `also_trainer=true` (موبایل ساختگی؛ رمز/OTP مطابق seed فعلی). در لاگین چندهویتی قابل انتخاب باشد.
8. Audit: `staff.update` وقتی also_trainer عوض شد before/after را بنویسد (بدون رمز).

## خارج محدوده
- مدیر+منشی روی یک حساب
- بازنویسی کل سیستم نقش‌ها / RBAC عمومی سنگین
- تغییر سامانهٔ Logging مگر رگرسیون
- commit `.env` یا secrets
- HTML ریشهٔ GitHub Pages مگر ضروری نباشد
- آرشیو/حذف اشخاص از میز

## تست (سبز قبل از commit)
Backend pytest حداقل:
- user میز + also_trainer → identities دو نقش staff برمی‌گرداند
- login با role=trainer روی همان user → session.acting_role=trainer؛ دسترسی trainer OK؛ دسترسی PATCH تنظیمات باشگاه (فقط manager) → ۴۰۳
- login با role=manager روی همان user → acting_role=manager؛ میز OK؛ endpoint فقط-شاگرد-مربی رفتار trainer-only را باز نکند
- also_trainer=false → نمی‌توان با role=trainer لاگین کرد
- receptionist نمی‌تواند manager بسازد (رگرسیون)
- لیست مربیان شامل also_trainer می‌شود
Frontend vitest: فرم کارکنان چک‌باکس؛ در صورت منطق انتخاب نقش لاگین، پوشش انتخاب دو هویت staff

Migration Alembic تمیز؛ از پوشهٔ `backend` تست را اجرا کن.

## Docs
- roadmap-status: Slice J انجام‌شده
- business-rules اگر جزئیات پیاده‌سازی نیاز به یک خط هم‌خوانی دارد
- getting-started: یک خط نحوهٔ تست لاگین مدیر+مربی seed
- next-coding-prompt را خالی/صف بعدی ننویس مگر مدیر محصول بگوید — فقط وضعیت J را در roadmap درست کن

## تحویل
تست سبز → commit/push بدون secrets → گزارش فارسی: کاملاً OK یا ناقص + موبایل‌های seed برای تست دستی انتخاب نقش.
```

---

## یادآوری Logging (انجام‌شده — برای صاحب)

- لاگ فایل: `backend/logs/` (بدون URL وب)
- UI مدیر: `/manager/#activity` + خروجی `.log`
- جزئیات: `docs/guides/logging.md`
