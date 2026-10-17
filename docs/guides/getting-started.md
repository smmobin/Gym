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

## مرحلهٔ بعدی پیشنهادی برای چت جدید

1. تمدید + پرداخت + audit
2. کلاس / کمد / مربی به‌ترتیب ارزش روزانه
3. پنل ورزشکار وقتی کارکنان پایدار شد

وضعیت زنده و پرامپت کپی‌کردنی: `docs/product/roadmap-status.md` و `docs/prompts/next-coding-prompt.md`.
