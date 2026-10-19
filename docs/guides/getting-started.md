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
├── frontend/     # React + Vite + TypeScript
├── backend/      # FastAPI + SQLAlchemy + Alembic
├── docs/         # مستندات و ADR
├── index.html …  # پروتوتایپ HTML (مرجع UI / GitHub Pages)
└── alternate-themes/  # فقط محلی — در GitHub نیست
```

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

## ۲) فرانت‌اند

در ترمینال جدا:

```powershell
cd frontend
npm install
npm run dev
```

چک: http://127.0.0.1:5173 — وضعیت API/DB روی صفحهٔ خانه دیده می‌شود.  
ورود کارکنان: http://127.0.0.1:5173/login (از طریق پروکسی Vite به API؛ cookie روی همان origin می‌ماند).

## ۳) پروتوتایپ HTML

همچنان در ریشه است برای GitHub Pages و مرجع طراحی Ocean Dark.

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

## دادهٔ فیک (Seed)

اسکریپت seed داده‌های **ساختگی** می‌ریزد (حدود ۹ عضو، چند طرح، عضویت، پرداخت، حضور، کمد، کلاس، مربی، هزینه، صف آزمایشی).  
هر بار اجرا، داده‌های دامنه را پاک و دوباره پر می‌کند — فقط برای محیط توسعه.

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m app.db.seed
```

یا بدون activate:

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.db.seed
```

بعد از seed می‌توانی با `psql` یا هر کلاینت Postgres جدول‌هایی مثل `members` / `payments` را ببینی.  
پروتوتایپ HTML ریشه هنوز دادهٔ نمایشی خودش را دارد و به این seed وصل نیست.

جزئیات TODOهای باز مدل: [schema-todos.md](../product/schema-todos.md)

## ورود کارکنان (توسعه)

بعد از `alembic upgrade head` و `python -m app.db.seed`:

| موبایل | نقش | رمز (فقط توسعه) |
|--------|-----|------------------|
| `09120000001` | مدیر | `ChangeMe123` |
| `09120000002` | منشی | `ChangeMe123` |
| `09120000003` | مربی | `ChangeMe123` |
| `09120000004` | مربی | `ChangeMe123` |

**این رمزها فقط برای محیط توسعه/دمو هستند — رمز واقعی باشگاه نیستند.**

- صفحه: `/login` در فرانت، یا API: `POST /api/v1/auth/login` با JSON `{ "mobile", "password" }`
- Cookie نشست: نام `gym_session`، **HttpOnly**، **SameSite=Lax**، **Secure فقط در production**؛ TTL پیش‌فرض **۱۲ ساعت**
- خروج: `POST /api/v1/auth/logout` (نشست سمت سرور باطل می‌شود)
- «من کیستم»: `GET /api/v1/auth/me`
- نمونه نقش: `GET /api/v1/auth/staff-ping` فقط مدیر و منشی (مربی → ۴۰۳)
- مدیر می‌تواند رمز کارکنان را عوض کند: `POST /api/v1/auth/users/{id}/password`

نکته: برای cookie در مرورگر، فرانت و بک را با یک host یکسان باز کن (هر دو `127.0.0.1` یا هر دو `localhost`). پروکسی Vite روی `/api` این کار را ساده می‌کند.

## اعضا (بعد از لاگین)

1. وارد شوید: http://127.0.0.1:5173/login (مثلاً مدیر `09120000001` / `ChangeMe123`)
2. بروید به http://127.0.0.1:5173/members یا لینک «لیست اعضا» بعد از ورود
3. منشی/مدیر: لیست + ثبت عضو جدید + آرشیو؛ مربی: فقط شاگردهای خودش (بدون ثبت)

API: `GET/POST /api/v1/members` ، `GET/PATCH /api/v1/members/{id}` ، `POST /api/v1/members/{id}/archive`

## حضور و غیاب

1. لاگین کنید، سپس http://127.0.0.1:5173/attendance
2. عضو را جستجو/انتخاب کنید → نوع ورود (سالن / کلاس / جلسه مربی) → ثبت ورود یا خروج
3. اگر «ورود دوم امروز» خواست، دکمهٔ تأیید ظاهر می‌شود

API: `POST /api/v1/attendances/check-in` ، `POST /api/v1/attendances/{id}/check-out` ، `GET /api/v1/attendances/today`

**روز تقویمی:** `Asia/Tehran`.  
**انتخاب عضویت:** اگر `membership_id` ندهید — برای `gym` اولویت با بستهٔ مدت‌دار (بدون session)، برای `class`/`pt` بستهٔ جلسه‌ای با `sessions_remaining > 0`.  
**خروج خودکار:** کرون جدا نیست؛ هنگام check-in و لیست امروز، حضور باز روز قبل (یا بعد از `day_end_time` تنظیمات) بسته می‌شود.

## مالی و تمدید

1. لاگین مدیر/منشی، سپس http://127.0.0.1:5173/billing
2. عضو را جستجو کنید → بدهی و عضویت‌ها را ببینید
3. تمدید: طرح + مبلغ توافقی (صفر مجاز) → شروع از **پایان اشتراک مرجع**
4. پرداخت: مبلغ + روش (نقد/کارت/انتقال/آنلاین بدون درگاه) → رسید `R-…` → دکمهٔ چاپ
5. برگشت: فقط وضعیت `refunded`؛ مبلغ ردیف عوض نمی‌شود

**سیاست تاریخ تمدید:** اگر اشتراک مرجع هنوز تمام نشده (`end_date >= امروز تهران`)، `start_date` عضویت جدید = همان `end_date` (روز باقی‌مانده نسوزد). اگر منقضی باشد، شروع از امروز. بدون مرجع: شروع از امروز. `end_date` = `start_date + duration_days` طرح.

API: `GET /api/v1/membership-plans` ، `GET/POST …/members/{id}/memberships` (renew) ، `POST /api/v1/memberships/{id}/cancel` ، `GET …/members/{id}/payments` ، `POST /api/v1/payments` ، `POST /api/v1/payments/{id}/refund`

مربی روی این مسیرها ۴۰۳ می‌گیرد.

## قفل پروندهٔ عضو (۵ دقیقه)

دو نفر نباید هم‌زمان روی یک عضو کار حساس کنند (تمدید / پرداخت / ویرایش / ورود).

**سیاست v1 (soft enforce):** اگر قفل فعال دست کاربر **دیگر** باشد → سرور ۴۰۹ می‌دهد. اگر قفل نباشد یا مال خودت باشد → عملیات مجاز است.  
**TTL:** ۵ دقیقه از `last_seen_at` (ضربان touch هر ~۶۰ثانیه از UI). بدون کرون: هنگام acquire/status منقضی‌ها پاک می‌شوند.  
**آزادسازی:** دارندهٔ قفل یا **مدیر** (اجباری).

### امتحان با دو مرورگر / دو نقش

1. `alembic upgrade head` و در صورت نیاز seed
2. مرورگر A: لاگین مدیر `09120000001` → `/billing` → یک عضو را انتخاب کن (قفل گرفته می‌شود)
3. مرورگر B (پنجرهٔ خصوصی): لاگین منشی `09120000002` → همان عضو را در `/billing` یا `/attendance` انتخاب کن → پیام قفل (نام/موبایل holder + انقضا)
4. در B تمدید یا پرداخت یا check-in بزن → ۴۰۹
5. در A «آزادسازی قفل» بزن، یا ۵ دقیقه صبر کن / touch نکن → B می‌تواند قفل بگیرد

API: `POST/GET /api/v1/members/{id}/lock` ، `POST …/lock/touch` ، `POST …/unlock`

## گزارش هزینه و سود (فقط مدیر)

1. لاگین **مدیر** `09120000001` / `ChangeMe123`
2. بروید به http://127.0.0.1:5173/reports
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

**توجه:** محصول واقعی روی `frontend/` + `backend/` لوکال است. **GitHub Pages (HTML ریشه) ماکت است** و به API وصل نیست.

### فرم عمومی (بدون لاگین)

1. http://127.0.0.1:5173/trial
2. نام + موبایل (+ زمان/پیام اختیاری) → ارسال
3. فقط ردیف در `trial_leads` ساخته می‌شود؛ **عضو خودکار ساخته نمی‌شود**

API: `POST /api/v1/public/trial-leads` (rate-limit ساده روی IP)

### صف منشی/مدیر

1. لاگین desk → http://127.0.0.1:5173/trial-leads
2. فیلتر وضعیت؛ دکمه‌های new / contacted / converted / closed
3. برای ساخت عضو/مهمان → لینک به `/guests` (تبدیل خودکار endpoint نیست)

API: `GET /api/v1/trial-leads?status=` ، `PATCH /api/v1/trial-leads/{id}` — trainer → ۴۰۳؛ بدون لاگین → ۴۰۱

### مهمان روزانه

1. لاگین desk → http://127.0.0.1:5173/guests
2. نام + موبایل + مبلغ توافقی + روش پرداخت (+ تیک پرداخت هم‌اکنون)
3. نتیجه: عضو active + عضویت طرح «مهمان یک‌روزه» با `start_date=end_date=امروز تهران` + در صورت pay_now رسید paid

**سیاست موبایل تکراری:** عضو جدید ساخته نمی‌شود؛ همان عضو نگه داشته می‌شود و عضویت یک‌روزهٔ جدید اضافه می‌شود. عضو آرشیو → ۴۰۹.

API: `POST /api/v1/guests` — trainer → ۴۰۳

## کلاس‌های گروهی

1. لاگین مدیر/منشی (یا مربی برای فقط‌خواندن کلاس‌های خودش)، سپس http://127.0.0.1:5173/classes
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

1. لاگین مدیر/منشی، سپس http://127.0.0.1:5173/lockers
2. لیست: کد، آزاد/اشغال، نام عضو؛ دکمهٔ واگذاری یا آزادسازی
3. واگذاری فقط اگر عضو عضویت فعال با طرح `includes_locker` داشته باشد (مثلاً سارا با طرح سه‌ماهه + کمد)
4. بدون طرح شامل‌کمد → پیام خطای واضح؛ اجارهٔ جدا در v1 نیست
5. ساخت کمد با کد یکتا (مثلاً `L-06`) — منشی و مدیر هر دو

**سیاست‌ها:** desk-only (مربی ۴۰۳). یک عضو در یک زمان فقط یک کمد فعال (دوم → ۴۰۹). غیرفعال‌سازی کمد اشغال → ۴۰۰ تا اول آزاد شود. اگر چند عضویت شامل‌کمد فعال بود، `membership_id` اجباری است.

API: `GET/POST /api/v1/lockers` ، `PATCH /api/v1/lockers/{id}` ، `POST …/{id}/assign` ، `POST …/{id}/release` ، `GET /api/v1/members/{id}/locker`

## مربیان و برنامه تمرینی

1. **میز (مدیر/منشی):** لاگین سپس http://127.0.0.1:5173/trainers
2. عضو را جستجو کنید → مربیان فعال را ببینید → مربی جدید وصل یا قطع کنید
3. چند مربی هم‌زمان برای یک شاگرد مجاز است؛ وصل تکراری همان جفت فعال → ۴۰۹
4. **مربی:** با `09120000003` / `ChangeMe123` وارد شوید → http://127.0.0.1:5173/workouts
5. لیست فقط شاگردهای واگذارشده (مثلاً علی و نگار) → برنامهٔ متنی بسازید/ویرایش کنید
6. مدیر روی `/workouts` به همه دسترسی دارد و می‌تواند برنامه بگذارد؛ منشی فقط می‌خواند

**سیاست نوشتن:** trainer برای شاگرد خودش + manager برای همه؛ receptionist فقط خواندن برنامه (واگذاری مربی برای desk آزاد است). DELETE برنامه در v1 ساخته نشد.

Seed: مربی یک به علی و نگار وصل است؛ برنامهٔ نمونه روی نگار.

API واگذاری: `GET /api/v1/trainers` ، `GET/POST /api/v1/members/{id}/trainers` ، `POST …/trainers/{assignment_id}/end`  
API برنامه: `GET/POST /api/v1/members/{id}/workout-plans` ، `PATCH /api/v1/workout-plans/{id}`

## GitHub Pages در برابر محصول واقعی

| | GitHub Pages (`*.github.io/Gym`) | لوکال (`127.0.0.1:5173` + API `:8000`) |
|--|--|--|
| چیست؟ | ماکت HTML ریشه (ظاهر/جریان نمایشی) | React + FastAPI + Postgres |
| لاگین واقعی؟ | نه | بله (`/login`) |
| داده از دیتابیس؟ | نه | بله (بعد از migration/seed) |
| برای دیدن فیچرهای جدید | مناسب نیست | همین را روشن کن |

## مرحلهٔ بعدی پیشنهادی برای چت جدید

1. **تنظیمات باشگاه + اعلان داخل‌برنامه + placeholder پیامک** (پرامپت: `docs/prompts/next-coding-prompt.md`)
2. پنل ورزشکار وقتی کارکنان پایدار شد
3. HTTPS و بکاپ قبل از دادهٔ واقعی

وضعیت زنده: `docs/product/roadmap-status.md`.
