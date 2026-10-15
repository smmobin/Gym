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

## مرحلهٔ بعدی پیشنهادی برای چت جدید

1. احراز هویت کارکنان (موبایل + رمز) + نقش سمت سرور
2. برش عمودی «لیست/ثبت عضو» API + حداقل UI در `frontend/`
3. حضور ورود/خروج و سپس تمدید + پرداخت + audit

وضعیت زنده و پرامپت کپی‌کردنی: `docs/product/roadmap-status.md` و `docs/prompts/next-coding-prompt.md`.
