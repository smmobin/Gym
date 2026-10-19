# پرامپت مرحلهٔ بعد — برای چت سازنده (Agent)

آخرین به‌روزرسانی: ۱۴۰۴-۰۷-۲۷ (مدیر محصول — تصمیم صاحب: فرانت = پروتوتایپ Ocean Dark)  
مرحله: **جایگزینی کامل فرانت React ساده با پروتوتایپ HTML (تقسیم‌شده) + اتصال به همهٔ APIهای موجود**

متن زیر را **کامل کپی** کن و در چت Agent سازنده بفرست.

---

```text
# نقش
تو Agent سازندهٔ GYM CONTROL هستی (نه مدیر محصول).
docs را خودت از docs/README.md پیدا کن و بخوان.
منبع حقیقت رفتار: docs/product/business-rules.md و docs/guides/security.md.
صاحب پروژه صریحاً تصمیم گرفته: فرانت «اصلی» = همان ظاهر/جریان پروتوتایپ Ocean Dark (فایل‌های HTML ریشهٔ ریپو که روی GitHub Pages هم دیده می‌شود). فرانت React سادهٔ فعلی (صفحات مینیمال در frontend/src/features/*) باید کامل حذف شود و دیگر به‌عنوان UI محصول استفاده نشود.

# تصمیم معماری (اجباری — اسناد را هم به‌روز کن)
- ADR 0001 (React) را به وضعیت Superseded ببر و ADR جدید بنویس: فرانت عملیاتی = Multi-page HTML + CSS + JS وانILLA داخل `frontend/`، سرو با Vite (بدون React) یا ابزار هم‌ارز سبک؛ خروجی استاتیک قابل دیپلوی.
- docs/guides/project-rules.md و getting-started.md و roadmap-status.md را با این واقعیت هم‌خوان کن: محصول واقعی UI دیگر React کامپوننت نیست؛ همان تم پروتوتایپ است که به API وصل شده.
- از این به بعد هر فیچر UI فقط روی همین فرانت Ocean Dark ساخته می‌شود — نه صفحهٔ سادهٔ موقت.

# هدف
1) پروتوتایپ ریشه (`index.html`, `athlete.html`, `receptionist.html`, `manager.html`, `styles.css`, `js/…`) را به داخل `frontend/` منتقل/بازنویسی ساختار یافته کن.
2) HTML / CSS / JS را جدا و پوشه‌بندی تمیز کن (چند صفحه، استایل مشترک، ماژول‌های JS).
3) همهٔ قابلیت‌هایی که امروز از طریق React به بک‌اند وصل‌اند را روی این UI جدید با همان APIهای `/api/v1/...` واقعی کن (دیگر دادهٔ صرفاً نمایشی/demo-banner به‌عنوان حقیقت نباشد).
4) کل کد UI React فعلی (`frontend/src/**` کامپوننت‌ها، App.tsx مبتنی بر React، تست‌های vitest صفحات React قدیمی) را حذف کن. وابستگی‌های React را از package.json بردار مگر چیزی که واقعاً برای تست/ابزار لازم باشد (ترجیح: بدون React).
5) بک‌اند را نشکن؛ فقط در صورت نیاز endpoint کوچک کمکی (مثلاً فلگ قابلیت) اضافه کن. منطق کسب‌وکار را دوباره ننویس — از سرویس‌های موجود مصرف کن.

# ساختار پیشنهادی هدف (می‌توانی نام‌ها را کمی وفق بدهی؛ منطق همین باشد)
frontend/
  index.html                 # لندینگ عمومی + فرم جلسه آزمایشی واقعی
  receptionist/index.html    # پنل منشی/میز (یا receptionist.html)
  manager/index.html         # پنل مدیر
  athlete/index.html         # پنل ورزشکار (+ صفحه لاگین اگر جداست)
  assets/css/
    base.css / layout.css / components.css   # شکستن styles.css بزرگ
  assets/js/
    api.js          # fetch با credentials: 'include'، پایهٔ VITE_API_BASE یا پروکسی
    auth-staff.js
    auth-athlete.js
    members.js, attendance.js, billing.js, classes.js, lockers.js,
    trainers.js, workouts.js, guests.js, trial.js, reports.js,
    settings.js, notifications.js, sms-templates.js, …
  public/           # فونت/تصویر اگر لازم
  vite.config.ts    # multi-page app بدون React؛ پروکسی /api → backend :8000
  package.json
  … تست‌ها

ریشهٔ ریپو:
- یا HTMLهای قدیمی ریشه را به یک README کوتاه + لینک «محصول در frontend» تقلیل بده، یا آن‌ها را thin redirect به خروجی frontend کنند.
- GitHub Pages: تصمیم را در docs بنویس — یا Pages فقط لندینگ استاتیک قدیمی می‌ماند (بدون API)، یا از build فرانت جدید سرو می‌شود ولی صاحب بداند بدون بک‌اند لاگین واقعی کار نمی‌کند. مهم: دیگر کسی React ساده را «محصول» نداند.

# نقشهٔ اتصال قابلیت‌ها (parity اجباری با React فعلی)
هر مورد باید با API واقعی کار کند؛ seed موجود کافی است؛ PII واقعی ممنوع.

لندینگ (index):
- فرم جلسه آزمایشی → POST /api/v1/trial-leads (یا مسیر فعلی trial عمومی)
- لینک ورود به پنل‌ها به صفحات جدید داخل frontend

ورود کارکنان:
- موبایل+رمز → POST /api/v1/auth/login با کوکی gym_session
- خروج → logout
- نقش manager / receptionist / trainer مسیر درست پنل (مربی فقط شاگرد خودش — طبق API موجود)

منشی / میز (receptionist) — حداقل معادل مسیرهای قبلی:
- اعضا: لیست/ایجاد/ویرایش/آرشیو + ست رمز ورزشکار + قفل پرونده اگر در API هست
- حضور: check-in/out امروز
- مالی: طرح‌ها، عضویت/تمدید، freeze/unfreeze، پرداخت، برگشت، رسید
- کلاس گروهی: لیست/ساخت/رزرو/لغو/no-show/attended
- کمد، مربی، برنامه تمرینی
- مهمان روزانه، صف trial-leads
- اعلان‌ها (زنگوله)، قالب پیامک (هنوز placeholder مرده OK)
- تنظیمات باشگاه اگر منشی GET دارد

مدیر (manager):
- همهٔ دسترسی‌های مجاز مدیر + گزارش/هزینه/سود + تنظیمات PATCH
- منشی گزارش مالی نبیند (UI + سرور؛ سرور منبع حقیقت)

ورزشکار (athlete):
- لاگین جدا gym_athlete_session
- داشبورد: عضویت، پرداخت، برنامه، اعلان، درخواست تمدید
- رزرو/لغو کلاس خود (APIهای /athlete/group-classes… که اخیراً اضافه شد)
- بدون دیدن دادهٔ دیگران

# قوانین پیاده‌سازی UI
- ظاهر Ocean Dark / Vazirmatn / RTL را از پروتوتایپ حفظ یا بهتر کن — نه UI مینیمال فعلی React.
- بنر «داده‌های نمونه» را بردار یا فقط وقتی API قطع است نشان بده.
- هر عملی که قبلاً در React بود باید اینجا دکمه/فرم واقعی داشته باشد؛ اگر جایی در پروتوتایپ جا نبود، بخش هم‌سبک به همان HTML اضافه کن (هنوز Ocean Dark).
- خطاها فارسی و قابل فهم؛ وضعیت loading واضح.
- هرگز secrets در گیت؛ credentials فقط cookie httpOnly از سرور.

# حذف‌ها (صریح)
- حذف کامل صفحات/کامپوننت‌های React در frontend/src/features/** و پوسته‌های سادهٔ مرتبط.
- حذف وابستگی react / react-dom / react-router از محصول (مگر موقتاً اگر مهاجرت مرحله‌ای؛ هدف نهایی صفر React).
- دیگر مسیرهایی مثل /billing با UI ساده نباید «خانهٔ اصلی» باشند؛ یا حذف شوند یا redirect به پنل HTML مناسب.

# تست و DoD
- بک‌اند: pytest موجود باید سبز بماند (اگر چیزی نشکستی).
- فرانت جدید: حداقل تست دود (smoke) برای api.js / لاگین mock یا Playwright/Vitest روی DOM خالص — صاحب می‌خواهد باگ پروتوتایپ دیده شود؛ پس حداقل:
  - happy path لاگین کارکنان (mock fetch)
  - happy path ارسال trial
  - یک مسیر ورزشکار رزرو کلاس (mock)
  - یک شکست 401/403
- `npm run build` فرانت جدید موفق.
- getting-started: دستور اجرا فقط همین فرانت جدید + backend.
- بعد از سبز: commit و push به origin/main طبق قانون Gym.
- گزارش به صاحب: کاملاً OK یا ناقص + فهرست قابلیت‌های وصل‌شده و هرچه عمداً مانده.

# خارج از محدوده
- پیامک واقعی / درگاه واقعی (جدا؛ placeholder بماند).
- بازنویسی منطق کسب‌وکار بک‌اند، migration غیرضروری.
- اپ موبایل بومی، چندشعبه، فروشگاه کالا.
- نگه داشتن موازی «فرانت موقت React» برای مقایسه — ممنوع؛ یکی باید بماند: Ocean Dark متصل.

# ترتیب کار پیشنهادی
1) ساختار پوشه + انتقال CSS/JS/HTML بدون اتصال API (بیلد OK)
2) لایه api.js + auth
3) پنل‌ها یکی‌یکی با parity چک‌لیست بالا
4) حذف React
5) docs + ADR + تست + commit/push

# خروجی گزارش
درخت پوشهٔ نهایی frontend، جدول «قابلیت → API → صفحه HTML»، دستور اجرا، و وضعیت GitHub Pages.
```
