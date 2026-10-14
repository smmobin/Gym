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

## مرحلهٔ بعدی پیشنهادی برای چت جدید

1. مدل‌های SQLAlchemy مطابق ADR دیتابیس (`members`, `payments`, …)
2. اولین migration با Alembic
3. مهاجرت تدریجی پنل‌های HTML به `frontend/src/features/*`
4. احراز هویت واقعی + نقش‌ها
