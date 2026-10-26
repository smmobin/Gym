# شروع توسعه (فرانت + بک)

این راهنما اسکلت آمادهٔ ریپو را برای چت/کار بعدی توضیح می‌دهد.

## پیش‌نیاز (روی این ماشین آماده‌اند)

- Node.js + npm
- Python 3.12 + venv بک‌اند
- PostgreSQL 17 با دیتابیس `gym_control`
- رمز Postgres در `C:\Users\tabat\.gym-dev\postgres.env`

## ساختار

```text
Gym/
├── frontend/     # Ocean Dark MPA: HTML + CSS + JS + Vite (بدون React)
├── backend/      # FastAPI + SQLAlchemy + Alembic
├── docs/         # مستندات و ADR
├── index.html …  # ماکت استاتیک GitHub Pages (بدون API)
└── alternate-themes/  # فقط محلی — در GitHub نیست
```

تصمیم فرانت: [ADR 0005](../adr/0005-frontend-ocean-dark-mpa.md).

## ۱) بک‌اند

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
# اگر .env ندارید:
copy .env.example .env
# DATABASE_URL را با رمز واقعی پر کنید
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

چک: http://127.0.0.1:8000/api/v1/health و `/api/v1/health/db`

## ۲) فرانت‌اند (Ocean Dark — محصول واقعی UI)

در ترمینال جدا:

```powershell
cd frontend
npm install
npm run dev
```

| آدرس | کار |
|------|-----|
| http://127.0.0.1:5173/ | لندینگ + طرح‌های فعال از API + فرم جلسه آزمایشی واقعی |
| http://127.0.0.1:5173/login/ | ورود یکپارچه (موبایل → در صورت نیاز انتخاب نقش → رمز یا OTP) |
| http://127.0.0.1:5173/receptionist/ | پنل منشی (فقط نقش منشی) — داشبورد: حاضر امروز / بدون خروج / صف آزمایشی / مهمان + لیست اقدام |
| http://127.0.0.1:5173/manager/ | پنل مدیر |
| http://127.0.0.1:5173/trainer/ | پنل مربی (فقط شاگردان خودش) |
| http://127.0.0.1:5173/athlete/ | داشبورد ورزشکار |

پروکسی Vite مسیر `/api` را به بک‌اند می‌فرستد؛ cookie روی همان origin می‌ماند.

**تم UI:** پیش‌فرض همیشه **تاریک (Ocean Dark)**. سوئیچ ماه/خورشید در هدر لندینگ و لاگین، و در نوار بالای پنل‌ها (کنار تاریخ/کاربر)، تم روشن را روشن می‌کند. ترجیح در `localStorage` کلید `gym-theme` می‌ماند؛ از `prefers-color-scheme` سیستم برای پیش‌فرض استفاده نمی‌شود.

## ۳) ماکت GitHub Pages (ریشه)

HTMLهای ریشه فقط برای نمایش استاتیک روی Pages‌اند و به API وصل نیستند.  
محصول واقعی UI داخل `frontend/` است.

تم‌های جایگزین (`alternate-themes/`) فقط روی دیسک محلی می‌مانند و به گیت‌هاب پوش نمی‌شوند.

## تست قبل از GitHub

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest

cd ..\frontend
npm test
```

فقط اگر هر دو سبز بودند commit/push کن. جزئیات: [testing.md](testing.md)

## Migration (ساخت جدول‌ها)

بعد از پر کردن `backend/.env` با `DATABASE_URL` واقعی:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
alembic upgrade head
```

این دستور جدول‌های نسخهٔ اول را روی Postgres `gym_control` می‌سازد (یا به آخرین نسخه می‌رساند).

## مسیر پیش‌فرض: دیتابیس خالی + اولین مدیر (بدون seed)

UI لاگین و لندینگ **هیچ حساب دمویی نشان نمی‌دهند.** مسیر عادی محصول:

1. `alembic upgrade head`
2. اگر قبلاً seed زده‌ای و می‌خواهی خالی شود (فقط توسعه؛ در production مسدود است):

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.db.wipe_dev_data
```

3. ساخت **اولین مدیر** فقط با CLI (UI ساخت مدیر نیست؛ فقط وقتی صفر مدیر وجود دارد):

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.db.bootstrap_manager --mobile 09xxxxxxxxx --password "YourStrongPass" --name "نام مدیر"
```

رمز را در گیت یا چت عمومی نگذار. اگر از قبل مدیری باشد، دستور خطا می‌دهد (exit code 2).

4. لاگین در http://127.0.0.1:5173/login/ با همان موبایل/رمز
5. از `/manager/#staff` منشی و مربی بساز؛ از `/manager/#plans` طرح بساز
6. منشی بعد از لاگین می‌تواند از `/receptionist/#staff` فقط مربی و از `/receptionist/#plans` طرح بسازد

**حذف در UI = غیرفعال** (`is_active=false`) — ردیف از دیتابیس پاک نمی‌شود.

اگر موبایل کارمند با عضو یکی باشد، در ورود **صفحهٔ انتخاب نقش** نشان داده می‌شود (اولویت اجباری کارکنان نیست).

### Seed و wipe — دو دستور جدا

| دستور | رفتار |
|--------|--------|
| `python -m app.db.seed` | **افزایشی:** فقط ردیف‌های نمونهٔ ساختگی را اضافه/هم‌تراز می‌کند (موبایل کارکنان/اعضا، نام طرح، کد کمد، …). دادهٔ دستی شما پاک نمی‌شود و duplicate نمی‌سازد. |
| `python -m app.db.wipe_dev_data` | **عمدی:** همهٔ جدول‌های دامنه را خالی می‌کند. فقط وقتی می‌خواهی از صفر شروع کنی. |

```powershell
cd backend
# نمونهٔ ساختگی کنار دادهٔ موجود (بدون پاک کردن):
.\.venv\Scripts\python.exe -m app.db.seed

# فقط وقتی عمداً همه چیز باید خالی شود:
.\.venv\Scripts\python.exe -m app.db.wipe_dev_data
```

روی production-like هر دو بدون `ALLOW_DESTRUCTIVE_SEED=true` مسدودند. در UI ارجاع به حساب دمو نیست؛ اگر seed زدی، حساب‌های نمونه داخل اسکریپت‌اند (`DEV_STAFF_PASSWORD` و موبایل‌های `09120000…`).

**pytest هرگز به دیتابیس روزمرهٔ `gym_control` وصل نمی‌شود** — جزئیات و ساخت `gym_control_test`: [testing.md](testing.md).

جزئیات TODOهای باز مدل: [schema-todos.md](../product/schema-todos.md)

## ورود یکپارچه

بعد از bootstrap (یا seed اختیاری) فقط **یک** صفحهٔ ورود دارید:

**http://127.0.0.1:5173/login/** — قدم ۱ فقط موبایل؛ اگر چند هویت → انتخاب نقش؛ سپس رمز (مدیر/منشی) یا OTP+رمز پشتیبان (مربی/ورزشکار). بدون جدول حساب دمو.

از لندینگ: هدر «ورود به سامانه» → همان `/login/`. `/athlete/login` به همین صفحه هدایت می‌شود.

### تست OTP در توسعه

وقتی `APP_ENV=development` (یا غیر production-like) و `SMS_PROVIDER=none` است، برای مربی/ورزشکار بعد از «ادامه» روی موبایل، کد ثابت **`123456`** را در فرم OTP بزنید — بدون پنل پیامک واقعی. در پاسخ API کد برنمی‌گردد؛ فقط سرور همان ثابت را می‌پذیرد. راهنمای کوتاه UI فقط در همین حالت دیده می‌شود. در production-like بدون SMS واقعی، OTP کار نمی‌کند و کد ثابت رد می‌شود.

مثال seed: ورزشکار `09121111001` یا مربی `09120000003` → OTP `123456` (یا رمز پشتیبان `ChangeMe123`).

### رفتار سرور

- `POST /api/v1/auth/lookup` با `{ "mobile" }` → `{ identities: [{ kind, role, label, auth_methods, has_password }], otp_dev_hint }`
- `POST /api/v1/auth/login` با `{ "mobile", "password", "kind"?, "role"? }` — وقتی چند هویت است `kind` اجباری است (بدون آن ۴۰۹)
- `POST /api/v1/auth/otp/send` و `…/otp/verify` برای مربی/ورزشکار (مدیر/منشی → ۴۰۰)
- پاسخ موفق ورود: `{ kind: "staff"|"athlete", role, user?, member? }` + کوکی مناسب (`gym_session` یا `gym_athlete_session`)
- **Idle:** بعد از ۵ دقیقه بدون فعالیت، نشست منقضی می‌شود (`SESSION_IDLE_MINUTES`؛ تمدید با `POST /auth/touch`). سقف مطلق: `SESSION_TTL_HOURS` (پیش‌فرض ۱۲)
- Rate limit روی lookup / login / otp send / otp verify
- مسیر قدیمی `POST /api/v1/athlete/auth/login` برای سازگاری API باقی است؛ UI عمومی فقط `/login/` است
- خروج کارکنان: `POST /api/v1/auth/logout`؛ ورزشکار: `POST /api/v1/athlete/auth/logout`
- «من کیستم» کارکنان: `GET /api/v1/auth/me`؛ ورزشکار: `GET /api/v1/athlete/auth/me`
- نمونه نقش اداری: `GET /api/v1/auth/staff-ping` فقط مدیر و منشی (مربی → ۴۰۳)
- مدیر می‌تواند رمز کارکنان را عوض کند: `POST /api/v1/auth/users/{id}/password` یا از `/manager/#staff` (رمز اختیاری هنگام ویرایش)
- منشی فقط مربی‌هایی که می‌سازد/مدیریت می‌کند را از `/receptionist/#staff` ویرایش/رمز می‌کند
- کارکنان: `GET/POST /api/v1/staff` ، `PATCH /api/v1/staff/{id}` ، `POST …/deactivate|activate` — مدیر: منشی+مربی؛ منشی: فقط مربی؛ مربی → ۴۰۳
- طرح‌ها (عمومی لندینگ): `GET /api/v1/public/membership-plans` — بدون لاگین؛ فقط فعال
- طرح‌ها (میز): `GET /api/v1/membership-plans` (فعال؛ `?include_inactive=1` برای مدیریت) ، `POST/PATCH /api/v1/membership-plans` — منشی و مدیر؛ مربی → ۴۰۳
- UI: `/manager/#staff` ، `/manager/#plans` ، `/receptionist/#staff` ، `/receptionist/#plans`
- ست رمز ورزشکار از منشی: `/receptionist/#members` (یا مدیر از `/manager/#members`) یا `POST /api/v1/members/{id}/athlete-password`

نکته: برای cookie در مرورگر، فرانت و بک را با یک host یکسان باز کن (هر دو `127.0.0.1` یا هر دو `localhost`). پروکسی Vite روی `/api` این کار را ساده می‌کند.

### ورزشکار بعد از ورود

داشبورد: http://127.0.0.1:5173/athlete/ — اشتراک/بدهی، پرداخت، برنامه، **کلاس گروهی (رزرو/لغو)**، درخواست تمدید، اعلان‌ها.

سایر اعضا تا وقتی desk رمز نگذارد لاگین نمی‌شوند.

### رزرو کلاس توسط ورزشکار

- لیست: کلاس‌های **فعال** با `starts_at >= الان` (آینده؛ کلاس گذشتهٔ seed مثل کراس‌فیت دیده نمی‌شود؛ کلاس‌های بعدیِ امروز دیده می‌شوند).
- رزرو/لغو فقط برای `member` سشن؛ `member_id` از کلاینت پذیرفته نمی‌شود.
- ظرفیت همان منطق میز (`assert_can_book`) — پر → ۴۰۹؛ بدون waitlist.
- Seed: کلاس «پیلاتس عصر» خالی برای دمو؛ علی روی «اسپینینگ عصر» از قبل رزرو دارد.

امتحان سریع: لاگین `09121111001` / `ChangeMe123` → بخش کلاس‌ها → رزرو «پیلاتس عصر» → لغو.

API ورزشکار (همه فقط «خودش»):
- `POST /api/v1/athlete/auth/login|logout` ، `GET /api/v1/athlete/auth/me`
- `GET /api/v1/athlete/memberships` (+ `debt_toman`)
- `GET /api/v1/athlete/payments`
- `GET /api/v1/athlete/workout-plans`
- `GET /api/v1/athlete/group-classes` ، `POST …/group-classes/{id}/book` ، `GET /athlete/class-bookings` ، `POST …/class-bookings/{id}/cancel`
- `GET /api/v1/athlete/notifications` ، `POST …/notifications/{id}/read`
- `POST /api/v1/athlete/renewal-requests` → اعلان desk از نوع `renewal_request` (بدون تمدید خودکار؛ وقتی درگاه خاموش است)
- `GET /api/v1/athlete/membership-plans` ، `POST /api/v1/athlete/payments/online/start` — وقتی درگاه از env فعال باشد
- `GET /api/v1/payments/gateway/status` — فلگ غیرحساس فعال/sandbox
- `PATCH /api/v1/athlete/profile` — فقط نام/نام‌خانوادگی (موبایل عوض نمی‌شود)

## اعضا (بعد از لاگین)

1. وارد شوید: http://127.0.0.1:5173/login/ (مثلاً مدیر `09120000001` / `ChangeMe123`)
2. بروید به http://127.0.0.1:5173/receptionist/#members یا لینک «لیست اعضا» بعد از ورود
3. منشی/مدیر: لیست + ثبت عضو جدید + آرشیو؛ مربی: فقط شاگردهای خودش (بدون ثبت)

API: `GET/POST /api/v1/members` ، `GET/PATCH /api/v1/members/{id}` ، `POST /api/v1/members/{id}/archive`

## حضور و غیاب

1. لاگین کنید، سپس http://127.0.0.1:5173/receptionist/#checkin
2. عضو را جستجو/انتخاب کنید → نوع ورود (سالن / کلاس / جلسه مربی) → ثبت ورود یا خروج
3. اگر «ورود دوم امروز» خواست، دکمهٔ تأیید ظاهر می‌شود

API: `POST /api/v1/attendances/check-in` ، `POST /api/v1/attendances/{id}/check-out` ، `GET /api/v1/attendances/today`

**روز تقویمی:** `Asia/Tehran`.  
**انتخاب عضویت:** اگر `membership_id` ندهید — برای `gym` اولویت با بستهٔ مدت‌دار (بدون session)، برای `class`/`pt` بستهٔ جلسه‌ای با `sessions_remaining > 0`.  
**خروج خودکار:** کرون جدا نیست؛ هنگام check-in و لیست امروز، حضور باز روز قبل (یا بعد از `day_end_time` تنظیمات) بسته می‌شود.

## مالی و تمدید

1. لاگین منشی → http://127.0.0.1:5173/receptionist/#billing یا لاگین مدیر → http://127.0.0.1:5173/manager/#billing
2. عضو را جستجو کنید → بدهی و عضویت‌ها را ببینید
3. تمدید: طرح + مبلغ توافقی (صفر مجاز) → شروع از **پایان اشتراک مرجع**
4. پرداخت: مبلغ + روش (نقد/کارت‌خوان/انتقال/آنلاین) → رسید `R-…` → دکمهٔ چاپ
5. برگشت: فقط وضعیت `refunded`؛ مبلغ ردیف عوض نمی‌شود

**سیاست تاریخ تمدید:** اگر اشتراک مرجع هنوز تمام نشده (`end_date >= امروز تهران`)، `start_date` عضویت جدید = همان `end_date` (روز باقی‌مانده نسوزد). اگر منقضی باشد، شروع از امروز. بدون مرجع: شروع از امروز. `end_date` = `start_date + duration_days` طرح.

API: `GET /api/v1/membership-plans` (فقط فعال برای select تمدید) ، مدیریت طرح‌ها از `#plans` با `include_inactive=1` ، `GET/POST …/members/{id}/memberships` (renew) ، `POST /api/v1/memberships/{id}/cancel` ، `POST …/freeze` ، `POST …/unfreeze` ، `GET …/members/{id}/payments` ، `POST /api/v1/payments` ، `POST /api/v1/payments/{id}/refund`

مربی روی این مسیرها ۴۰۳ می‌گیرد.

## درگاه پرداخت آنلاین (sandbox زرین‌پال)

پیش‌فرض خاموش است (`PAYMENT_GATEWAY_PROVIDER=none`). بدون merchant، UI ورزشکار همان «درخواست تمدید میز» را نشان می‌دهد و API شروع پرداخت → ۴۰۳ فارسی.

### فعال‌سازی لوکال (تست)

1. در `backend/.env` (از `.env.example` کپی کن؛ **مرچنت واقعی در گیت نگذار**):

```env
PAYMENT_GATEWAY_PROVIDER=zarinpal
PAYMENT_GATEWAY_MERCHANT_ID=00000000-0000-0000-0000-000000000000
PAYMENT_GATEWAY_SANDBOX=true
PAYMENT_GATEWAY_CALLBACK_URL=http://127.0.0.1:8000/api/v1/payments/gateway/callback
PAYMENT_GATEWAY_FRONT_RETURN_URL=http://127.0.0.1:5173/athlete/#pay
```

در sandbox زرین‌پال، merchant می‌تواند یک UUID دلخواه ۳۶ کاراکتری باشد.

2. `alembic upgrade head` (ستون‌های gateway روی `payments`)
3. بک و فرانت را بالا بیاور؛ لاگین ورزشکار `09121111001` / `ChangeMe123`
4. بخش اشتراک یا پرداخت‌ها → «پرداخت آنلاین (آزمایشی)» → هدایت به StartPay سندباکس
5. پس از بازگشت، سرور verify می‌کند؛ موفق → `paid` + در صورت `purpose=renew` تمدید با همان منطق `renew_start_date` / `compute_end_date`

**امنیت:** فقط سرور verify می‌کند؛ کلاینت را برای paid/renew باور نمی‌کنیم. `GET /api/v1/payments/gateway/status` فقط `enabled/provider/sandbox/label` می‌دهد (بدون کلید).

API:
- `GET /api/v1/payments/gateway/status`
- `GET /api/v1/athlete/membership-plans`
- `POST /api/v1/athlete/payments/online/start` — `{ purpose: debt|renew, amount_toman?, plan_id?, base_membership_id? }`
- `GET /api/v1/payments/gateway/callback?Authority=&Status=` — بازگشت زرین‌پال
- اختیاری میز: `POST /api/v1/payments/online/start?member_id=`

مبالغ اپلیکیشن تومان‌اند؛ به درگاه به‌صورت ریال (`×۱۰`) فرستاده می‌شوند.

## پیامک (کاوه‌نگار)

پیش‌فرض خاموش است (`SMS_PROVIDER=none`). بدون API key، UI همان «هنوز آماده نیست» است و `POST /sms/send` → ۴۰۳ فارسی.

### فعال‌سازی لوکال (تست)

1. در `backend/.env` (از `.env.example` کپی کن؛ **کلید واقعی در گیت نگذار**):

```env
SMS_PROVIDER=kavenegar
SMS_API_KEY=
SMS_SENDER=
```

برای تست دستی با پنل واقعی، `SMS_API_KEY` را از داشبورد کاوه‌نگار بگذار. **ارسال واقعی اعتبار کم می‌کند.**

2. بک و فرانت را بالا بیاور؛ لاگین مدیر `09120000001` / `ChangeMe123` → `/manager/#sms`
3. عضو را جستجو کن → ارسال روی یکی از قالب‌ها
4. `GET /api/v1/sms/status` فقط `enabled/provider/label` می‌دهد (بدون کلید)

**تست خودکار:** `pytest backend/tests/test_sms.py` با mock HTTP — بدون شبکه و بدون کلید واقعی.

API:
- `GET /api/v1/sms/status`
- `GET /api/v1/sms/templates` — desk
- `POST /api/v1/sms/send` — `{ template_id, member_id }` (مدیر/منشی؛ مربی ۴۰۳)

OTP ورود مربی/ورزشکار در `/login/` فعال است (جزئیات: بخش «ورود یکپارچه»). فراموشی رمز مدیر/منشی با پیامک در v1 نیست.

## توقف عضویت (freeze)

منشی/مدیر می‌توانند عضویت **فعال** را چند روز متوقف کنند تا روزهای باقی‌مانده نسوزد (`end_date` به همان اندازه جلو می‌رود).

**سیاست v1 (مستند):**
- **سقف:** از `gym_settings.freeze_annual_cap_days` (پیش‌فرض ۱۴). مصرف = جمع `freeze_days_used` همهٔ عضویت‌های همان عضو. برچسب سال = **سال میلادی تاریخ امروز در Asia/Tehran**؛ ریست خودکار شمارنده در ۱ ژانویه در v1 نیست.
- **شروع:** `POST /api/v1/memberships/{id}/freeze` با `{ "days": N }` یا `{ "freeze_ends_at": "YYYY-MM-DD" }` (روز ازسرگیری؛ باید بعد از امروز باشد). وضعیت → `frozen`؛ ورود با آن عضویت ممنوع.
- **پایان دستی:** `POST …/unfreeze`. اگر زودتر از موعد: روزهای استفاده‌نشده از `freeze_days_used` کم و از `end_date` برگردانده می‌شود.
- **پایان خودکار:** اگر `today >= freeze_ends_at`، هنگام لیست عضویت‌ها یا check-in، توقف بسته و وضعیت `active` می‌شود (بدون کم کردن اضافه از end_date).

### امتحان

1. seed + لاگین مدیر → `/billing` → عضو (مثلاً علی) را انتخاب کن
2. سقف باقی‌مانده را ببین → تعداد روز → «ثبت توقف»
3. همان عضویت «توقف» می‌شود؛ «پایان توقف» بزن یا صبر کن تا موعد
4. با `membership_id` متوقف‌شده check-in بزن → ۴۰۹

## قفل پروندهٔ عضو (۵ دقیقه)

دو نفر نباید هم‌زمان روی یک عضو کار حساس کنند (تمدید / پرداخت / ویرایش / ورود).

**سیاست v1 (soft enforce):** اگر قفل فعال دست کاربر **دیگر** باشد → سرور ۴۰۹ می‌دهد. اگر قفل نباشد یا مال خودت باشد → عملیات مجاز است.  
**TTL:** ۵ دقیقه از `last_seen_at` (ضربان touch هر ~۶۰ثانیه از UI). بدون کرون: هنگام acquire/status منقضی‌ها پاک می‌شوند.  
**آزادسازی:** دارندهٔ قفل یا **مدیر** (اجباری).  
**UI:** `#billing`، `#checkin`، و ویرایش در `#members` (فرم ویرایش + ست رمز ورزشکار فقط با قفل خودت).

### امتحان با دو مرورگر / دو نقش

1. `alembic upgrade head` و در صورت نیاز seed
2. مرورگر A: لاگین مدیر `09120000001` → `/billing` یا `/members` → یک عضو را انتخاب کن (قفل گرفته می‌شود)
3. مرورگر B (پنجرهٔ خصوصی): لاگین منشی `09120000002` → همان عضو را در `#billing` یا `/attendance` یا `/members` انتخاب کن → پیام قفل (نام/موبایل holder + انقضا)
4. در B تمدید یا پرداخت یا check-in یا ذخیرهٔ ویرایش بزن → ۴۰۹
5. در A «آزادسازی قفل» بزن، یا ۵ دقیقه صبر کن / touch نکن → B می‌تواند قفل بگیرد

API: `POST/GET /api/v1/members/{id}/lock` ، `POST …/lock/touch` ، `POST …/unlock`

## گزارش هزینه و سود (فقط مدیر)

1. لاگین **مدیر** `09120000001` / `ChangeMe123`
2. بروید به http://127.0.0.1:5173/manager/#finance
3. بازه تاریخ را ببینید/عوض کنید → خلاصه: درآمد (paid) / هزینه / سود نمایشی
4. هزینه جدید: دسته + مبلغ + تاریخ + یادداشت اختیاری
5. با حساب **منشی** همان آدرس را باز کنید → پیام عدم دسترسی؛ API هم ۴۰۳ می‌دهد

**سیاست‌ها:**
- درآمد گزارش = فقط پرداخت‌های `status=paid`؛ `refunded` و `pending` داخل درآمد نیستند
- تاریخ پرداخت برای فیلتر: `COALESCE(paid_at, created_at)` در تقویم `Asia/Tehran`
- بدهی ≠ درآمد (در UI و پاسخ API صریح نوشته شده)
- PATCH/DELETE هزینه در v1 نیست (فقط ایجاد + لیست)
- فاکتور خرید / مالیات / تأمین‌کننده نیست

API: `GET/POST /api/v1/expenses?from=&to=` ، `GET /api/v1/reports/profit?from=&to=`  
پیش‌فرض بازه: ماه جاری تهران. منشی و مربی → ۴۰۳؛ بدون لاگین → ۴۰۱.

## جلسه آزمایشی و مهمان روزانه

**توجه:** محصول واقعی UI = `frontend/` (Ocean Dark) + `backend/`. **GitHub Pages (HTML ریشه) ماکت بدون API است.**

### قیمت‌های لندینگ (`#plans`)

کارت‌های عضویت روی صفحهٔ اول از طرح‌های **فعال** دیتابیس می‌آیند (نه قیمت ثابت HTML).  
مدیریت نام/قیمت/فعال‌بودن: پنل منشی یا مدیر → `#plans`. عوض کردن قیمت طرح، سوابق عضویت/پرداخت گذشته را عوض نمی‌کند.

API: `GET /api/v1/public/membership-plans` — بدون لاگین؛ فقط `is_active=true`؛ rate-limit سبک روی IP.  
endpoint میز (`GET /api/v1/membership-plans`) همچنان فقط desk است و `include_inactive` را به اینترنت باز نمی‌کند.

### فرم عمومی (بدون لاگین)

1. http://127.0.0.1:5173/#trial
2. نام + موبایل (+ زمان/پیام اختیاری) → ارسال
3. فقط ردیف در `trial_leads` ساخته می‌شود؛ **عضو خودکار ساخته نمی‌شود**

API: `POST /api/v1/public/trial-leads` (rate-limit ساده روی IP)

### صف منشی/مدیر

1. لاگین منشی → http://127.0.0.1:5173/receptionist/#trial
2. فیلتر وضعیت؛ دکمه‌های new / contacted / converted / closed
3. برای ساخت عضو/مهمان → لینک به `/guests` (تبدیل خودکار endpoint نیست)

API: `GET /api/v1/trial-leads?status=` ، `PATCH /api/v1/trial-leads/{id}` — trainer → ۴۰۳؛ بدون لاگین → ۴۰۱

### مهمان روزانه

1. لاگین منشی → http://127.0.0.1:5173/receptionist/#guests
2. نام + موبایل + مبلغ توافقی + روش پرداخت (+ تیک پرداخت هم‌اکنون)
3. نتیجه: عضو active + عضویت طرح «مهمان یک‌روزه» با `start_date=end_date=امروز تهران` + در صورت pay_now رسید paid

**سیاست موبایل تکراری:** عضو جدید ساخته نمی‌شود؛ همان عضو نگه داشته می‌شود و عضویت یک‌روزهٔ جدید اضافه می‌شود. عضو آرشیو → ۴۰۹.

API: `POST /api/v1/guests` — trainer → ۴۰۳

## تنظیمات باشگاه، اعلان، پیامک

### تنظیمات (`/settings`)

1. لاگین مدیر → http://127.0.0.1:5173/manager/#settings
2. نام / تلفن / نشانی / ساعت پایان روز / روز هشدار انقضا / سقف freeze / یادداشت ساعت کاری و قوانین تمدید را ویرایش کن
3. منشی اگر URL را باز کند → پیام عدم دسترسی UI؛ `PATCH` سرور → ۴۰۳؛ `GET /gym-settings` برای همهٔ کارکنان OK است
4. حضور از قبل `day_end_time` را از `gym_settings` می‌خواند (hardcode جدا نیست)

API: `GET /api/v1/gym-settings` (staff)، `PATCH /api/v1/gym-settings` (manager) — تغییر حساس → `audit_logs`

### اعلان داخل‌برنامه

**طراحی v1:** جدول `staff_notifications` سراسری desk (نه inbox جدا per-user) + `staff_notification_reads` برای وضعیت خوانده‌شده per-user.

| kind | منبع |
|------|------|
| `trial_lead_new` | هنگام `POST /public/trial-leads` |
| `membership_expiring` | refresh سبک روی `GET /notifications` (بر اساس `expiry_warning_days`) |
| `member_debt` | همان refresh (خلاصه + حداکثر ۱۰ نمونه؛ نه اسپم بی‌نهایت) |
| `renewal_request` | فقط seed/نمونه تا لاگین ورزشکار |

API: `GET /api/v1/notifications` ، `POST /api/v1/notifications/{id}/read` ، `POST /api/v1/notifications/read-all`  
UI: زنگوله بعد از لاگین (صفحهٔ ورود / تنظیمات / پیامک)

### قالب پیامک (`/manager/#sms` یا `/receptionist/#sms`)

پیش‌فرض خاموش است. بدون کلید، همان تگ «هنوز آماده نیست» و دکمهٔ مرده می‌ماند.

اگر `SMS_PROVIDER=kavenegar` و `SMS_API_KEY` پر باشد:

1. لاگین مدیر یا منشی → بخش پیامک
2. جستجوی عضو → انتخاب → ارسال روی قالب (خوش‌آمد / انقضا / بدهی)
3. موبایل فقط از پروندهٔ عضو روی سرور خوانده می‌شود؛ مربی → ۴۰۳

**هشدار:** کلید واقعی اعتبار پنل را مصرف می‌کند و هزینه دارد. در تست خودکار، HTTP کاوه‌نگار mock می‌شود (بدون شبکه).

API: `GET /api/v1/sms/status` ، `GET /api/v1/sms/templates` ، `POST /api/v1/sms/send` — `{ template_id, member_id }`

جزئیات env: بخش «پیامک (کاوه‌نگار)» بالاتر در همین فایل.

### درگاه آنلاین

اگر `PAYMENT_GATEWAY_PROVIDER=zarinpal` و merchant پر باشد، ورزشکار از `/athlete/` پرداخت آزمایشی می‌کند؛ میز فقط فلگ وضعیت را می‌بیند. جزئیات: بخش «درگاه پرداخت آنلاین» بالاتر در همین فایل.

## کلاس‌های گروهی

1. لاگین منشی → http://127.0.0.1:5173/receptionist/#classes یا مدیر → `/manager/#classes` (مربی کلاس‌های خودش را در `/trainer/` می‌بیند)
2. لیست کلاس‌ها با ظرفیت / رزرو / باقی‌مانده و برچسب جنسیت نمایشی (شامل کلاس‌های شروع‌شده)
3. انتخاب کلاس → جستجوی عضو → رزرو؛ اگر پر باشد سرور ۴۰۹ می‌دهد
4. لغو رزرو → جا آزاد می‌شود
5. بعد از شروع کلاس: روی رزرو `booked` دکمه‌های **حاضر شد** / **غیبت**
6. Seed: «کراس‌فیت صبح» در گذشته است با رزرو مریم — برای امتحان غیبت آماده است
7. منشی و مدیر هر دو می‌توانند کلاس بسازند/ویرایش کنند؛ مربی فقط می‌خواند

**سیاست ساخت:** desk (manager + receptionist) می‌سازند و رزرو می‌کنند؛ trainer فقط کلاس‌هایی که `trainer_user_id` اوست را می‌بیند و رزرو/ساخت برایش ۴۰۳ است.

**تداخل مربی:** اگر همان مربی کلاس هم‌پوشان داشته باشد، کلاس ذخیره می‌شود ولی پاسخ `trainer_schedule_conflict: true` و `warning` دارد — UI هشدار می‌دهد و بلاک نمی‌کند.

**غیبت / حاضر (desk-only):**
- فقط وقتی `starts_at` گذشته باشد
- وضعیت باید `booked` باشد؛ تکرار → ۴۰۹ (جلسه دوباره کم نمی‌شود)
- یک جلسه از بستهٔ جلسه‌ای کم می‌شود؛ اگر چند/هیچ بسته → انتخاب `membership_id` با هشدار
- اگر قبلاً ورود `type=class` در پنجرهٔ همان کلاس ثبت شده، جلسه دوباره کم نمی‌شود
- `attended` همان سیاست مصرف جلسه را دارد (یکسان با no-show)

API: `GET/POST /api/v1/group-classes` ، `PATCH /api/v1/group-classes/{id}` ، `GET/POST …/{id}/bookings` ، `POST …/bookings/{id}/cancel` ، `POST …/bookings/{id}/no-show` ، `POST …/bookings/{id}/attended`

## کمدها

1. لاگین منشی → http://127.0.0.1:5173/receptionist/#lockers یا مدیر → `/manager/#lockers`
2. لیست: کد، آزاد/اشغال، نام عضو؛ دکمهٔ واگذاری یا آزادسازی
3. واگذاری فقط اگر عضو عضویت فعال با طرح `includes_locker` داشته باشد (مثلاً سارا با طرح سه‌ماهه + کمد). UI لیست واجدین + برچسب عضویت‌ها را نشان می‌دهد
4. بدون طرح شامل‌کمد (مثل علی) → پیام با قدم بعد: مالی → تمدید طرح «شامل کمد»؛ اجارهٔ جدا در v1 نیست
5. در billing روی طرح‌ها برچسب «شامل کمد» دیده می‌شود
6. ساخت کمد با کد یکتا (مثلاً `L-06`) — منشی و مدیر هر دو؛ جدول بلافاصله بازخوانی می‌شود

**سیاست‌ها:** desk-only (مربی ۴۰۳). یک عضو در یک زمان فقط یک کمد فعال (دوم → ۴۰۹). غیرفعال‌سازی کمد اشغال → ۴۰۰ تا اول آزاد شود. اگر چند عضویت شامل‌کمد فعال بود، `membership_id` اجباری است.

API: `GET/POST /api/v1/lockers` ، `GET /api/v1/lockers/eligible-members` ، `PATCH /api/v1/lockers/{id}` ، `POST …/{id}/assign` ، `POST …/{id}/release` ، `GET /api/v1/members/{id}/locker`

## مربیان و برنامه تمرینی

1. **منشی:** لاگین سپس http://127.0.0.1:5173/receptionist/#trainers (مدیر از `/manager/#trainers`)
2. عضو را جستجو کنید → مربیان فعال را ببینید → مربی جدید وصل یا قطع کنید
3. چند مربی هم‌زمان برای یک شاگرد مجاز است؛ وصل تکراری همان جفت فعال → ۴۰۹
4. **مربی:** با `09120000003` / `ChangeMe123` وارد شوید → http://127.0.0.1:5173/trainer/
5. لیست فقط شاگردهای واگذارشده (مثلاً علی و نگار) → برنامهٔ متنی بسازید/ویرایش کنید
6. مدیر روی `/workouts` به همه دسترسی دارد و می‌تواند برنامه بگذارد؛ منشی فقط می‌خواند

**سیاست نوشتن:** trainer برای شاگرد خودش + manager برای همه؛ receptionist فقط خواندن برنامه (واگذاری مربی برای desk آزاد است). DELETE برنامه در v1 ساخته نشد.

Seed: مربی یک به علی و نگار وصل است؛ برنامهٔ نمونه روی نگار.

API واگذاری: `GET /api/v1/trainers` ، `GET/POST /api/v1/members/{id}/trainers` ، `POST …/trainers/{assignment_id}/end`  
API برنامه: `GET/POST /api/v1/members/{id}/workout-plans` ، `PATCH /api/v1/workout-plans/{id}`

## GitHub Pages در برابر محصول واقعی

| | GitHub Pages (`*.github.io/Gym`) | لوکال (`frontend` روی `:5173` + API `:8000`) |
|--|--|--|
| چیست؟ | ماکت HTML ریشه (بدون API) | Ocean Dark MPA + FastAPI + Postgres |
| لاگین واقعی؟ | نه | بله (`/login/`) |
| داده از دیتابیس؟ | نه | بله (بعد از migration/seed) |
| برای دیدن فیچرهای جدید | مناسب نیست | همین را روشن کن |

## استقرار و بکاپ (بعد از لوکال)

فیچر کارکنان+ورزشکار روی لوکال آماده‌اند. برای هاست واقعی:

1. راهنمای گام‌به‌گام: [deploy.md](deploy.md) (لیارا / VPS + Docker + HTTPS + env)
2. بکاپ هفتگی و تمرین restore: [backup.md](backup.md) — اسکریپت‌ها در `backend/scripts/`
3. قبل از عضو واقعی: `APP_ENV=production`، `SECRET_KEY` قوی، `CORS_ORIGINS` دامنهٔ HTTPS، seed ممنوع

```powershell
cd backend
.\.venv\Scripts\python.exe scripts/backup_db.py --dry-run
```

## مرحلهٔ بعدی

1. **برش D (کارکنان + طرح + bootstrap)** در کد انجام شده — از صفر: CLI مدیر → UI کارکنان/طرح
2. **کار دستی:** استقرار طبق [deploy.md](deploy.md) + restore در [backup.md](backup.md) + env درگاه/پیامک روی HTTPS

وضعیت زنده: `docs/product/roadmap-status.md`.

