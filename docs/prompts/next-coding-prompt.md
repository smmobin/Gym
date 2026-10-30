# پرامپت مرحلهٔ بعد — برای چت سازنده (Agent)

آخرین به‌روزرسانی: ۱۴۰۴-۰۸-۰۹ (2026-10-31) — برش: آیکون سایدبار **هر چهار پنل** (منشی، مدیر، مربی، ورزشکار) + حذف تنظیمات منشی  
**وضعیت صف:** آمادهٔ کپی برای چت سازنده  
**صف عقب‌افتاده:** picker کمد («کمد دارد» + متن شامل کمد)؛ پیامک `SMS_PROVIDER=fake`

---

## صف فعلی — کپی از خط بعدی تا پایان بلوک:

```text
تو Agent توسعهٔ پروژهٔ GYM CONTROL هستی. docs را خودت پیدا و بخوان. لیست URL از صاحب نخواه.

## هدف
۱) برای **همهٔ پنل‌های لاگین‌شده** آیکون خطی کنار برچسب فارسی منوی سایدبار بگذار — نه فقط منشی/مدیر:
   - `/receptionist/` پنل منشی
   - `/manager/` پنل مدیر
   - `/trainer/` پنل مربی  ← الزامی؛ از قلم نینداز
   - `/athlete/` پنل ورزشکار ← الزامی؛ از قلم نینداز
۲) از پنل منشی هر اثر UI تنظیمات را بردار (مشاهده هم نه؛ فقط مدیر `#settings` دارد).

الهام بصری: outline ساده + آیتم active با رنگ accent؛ آیکون کنار متن، نه جایگزین متن؛ بدون emoji و بدون CDN آیکون پولی.

## تصمیم محصول (صاحب)
- چهار پنل باید یک سیستم آیکون مشترک و یکدست داشته باشند (stroke/viewBox/اندازه یکسان).
- مربی و ورزشکار همان کیفیت منشی/مدیر را بگیرند؛ «بعداً» یا «اختیاری» نیست.
- تنظیمات فقط در پنل مدیر؛ منشی لینک/mount تنظیمات ندارد.

## داخل محدوده

### الف) حذف تنظیمات از منشی
- `frontend/receptionist/index.html`: `data-section="settings"` / `#mount-settings` را کامل حذف (لینک nav اگر برگشته حذف).
- `frontend/assets/js/panels/receptionist.js`: import و mount مربوط `settings` حذف.
- URL قدیمی `/receptionist/#settings` → بدون throw به داشبورد/hash پیش‌فرض.
- `/manager/#settings` و `settings.js` و مجوز PATCH فقط-manager دست نخورد.
- docs: UI تنظیمات فقط مدیر (getting-started / business-rules اگر هنوز «منشی مشاهده» نوشته‌اند درست کن).

### ب) آیکون سایدبار — هر چهار HTML
فایل‌ها (همه اجباری):
- `frontend/receptionist/index.html`
- `frontend/manager/index.html`
- `frontend/trainer/index.html`
- `frontend/athlete/index.html`

ساختار: داخل هر `.nav-item` یک SVG کوچک `aria-hidden="true"` + متن فارسی موجود.
SVG: outline نازک، `currentColor`، ~18–20px؛ ماژول مشترک شبیه helperهای موجود یا inline یکدست.

نگاشت پیشنهادی:

**مشترک / میز**
- داشبورد → gauge/grid
- اعضا → users
- حضور / ثبت حضور → clock/check
- مالی / گزارش مالی / مالی عملیات / پرداخت‌ها → wallet/card
- طرح‌ها / اشتراک من → layers
- کارکنان / مربیان (حساب) / مربیان / شاگردان من → user یا user-star
- کلاس‌ها → calendar
- کمدها → lock
- واگذاری مربی → shuffle/arrows
- برنامه تمرینی / برنامه‌ها / برنامه تمرینی (ورزشکار `#plan`) → dumbbell
- مهمان روزانه / مهمان → ticket
- صف آزمایشی → hourglass
- قالب پیامک / پیامک → chat
- تنظیمات (فقط مدیر) → gear

**مربی (`/trainer/`)** — همهٔ آیتم‌های nav:
- `#dash` داشبورد
- `#trainees` شاگردان من
- `#checkin` ثبت حضور
- `#workouts` برنامه تمرینی

**ورزشکار (`/athlete/`)** — همهٔ آیتم‌های nav:
- `#dash` داشبورد
- `#sub` اشتراک من
- `#classes` کلاس‌ها
- `#pay` پرداخت‌ها
- `#plan` برنامه تمرینی
- `#notif` اعلان‌ها → bell

CSS (`ocean.css` / مسیر استایل پنل):
- `.nav-item` flex + gap؛ تراز وسط؛ RTL خوانا
- active/hover: آیکون = currentColor با `--accent`
- سایدبار موبایل و تم روشن/تاریک نشکند؛ عرض بی‌دلیل زیاد نشود

### ج) تست
- vitest سبک: receptionist بدون `#mount-settings` / `href="#settings"`
- در صورت امکان assert که trainer و athlete HTML حداقل یک `nav-item` دارای `svg` دارند (یا snapshot سبک)
- رگرسیون: مدیر هنوز تنظیمات دارد

## خارج محدوده
- کاوه‌نگار / SMS fake / Slice J / picker کمد (صف جدا)
- عوض کردن ترتیب منو یا redesign غیر از آیکون
- HTML ریشه / GitHub Pages

## تست و تحویل
- vitest مربوط سبز؛ بدون secret؛ بعد از سبز commit + push به origin/main
- به صاحب: کاملاً OK یا ناقص؛ صریح بگو مربی و ورزشکار هم آیکون دارند (نه فقط میز)

## گزارش پایانی
1) کدام چهار مسیر پنل آیکون گرفتند؟
2) منشی تنظیمات ندارد؟ `#settings` منشی چه می‌کند؟
3) تست‌ها سبز؟
```

---

## صف عقب‌افتاده (کمد) — بعد از آیکون‌ها یا چت موازی

خلاصه برای بازگردانی پرامپت کامل توسط مدیر محصول: API فیلد `has_active_locker` + `current_locker_code`؛ در `renderMemberPick` با `showLockerEligibility` badge «کمد دارد (کد)» و ردیف غیرقابل انتخاب؛ متن عضویت «واجد کمد»→«شامل کمد»؛ تست members/lockers + member-pick + lockers-ux.
