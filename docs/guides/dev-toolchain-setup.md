# راهنمای نصب ابزارهای توسعه (Windows)

این راهنما پشتهٔ پیشنهادی ADRها را پوشش می‌دهد:

| لایه | ابزار | وضعیت روی سیستم شما (بررسی ۲۰۲۶-۱۰-۱۴) |
|------|--------|----------------------------------------|
| فرانت | Node.js + npm + Vite + TypeScript | **نصب است** (Node v24، npm 11؛ `typescript` و `vite` سراسری هم نصب شد) |
| بک‌اند | Python 3.12 + FastAPI و وابستگی‌ها | **آماده** — `python` به 3.12 وصل است؛ پکیج‌های FastAPI نصب‌اند |
| دیتابیس | PostgreSQL 17.11 | **آماده** — سرویس `postgresql-x64-17` در حال اجرا؛ دیتابیس `gym_control` ساخته شده |

رمز کاربر `postgres` در فایل محلی `C:\Users\tabat\.gym-dev\postgres.env` ذخیره شده (این فایل در گیت نیست).

---

## ۱) فرانت‌اند — React + TypeScript + Vite

### وضعیت
- `node` و `npm` نصب‌اند.
- برای ساخت پروژهٔ جدید کافی است:

```powershell
npm create vite@latest gym-web -- --template react-ts
cd gym-web
npm install
npm run dev
```

نیازی به نصب جداگانهٔ React نیست؛ داخل پروژه با Vite می‌آید.

### اگر Node نبود (برای مراجعهٔ بعدی)

1. از [nodejs.org](https://nodejs.org/) نسخهٔ LTS را بگیرید، یا:
2. در PowerShell (ترجیحاً Admin):

```powershell
winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
```

بعد ترمینال را ببندید و دوباره باز کنید. چک:

```powershell
node -v
npm -v
```

---

## ۲) بک‌اند — Python 3.12 + FastAPI

### وضعیت
روی سیستم شما دو نسخه هست:

- **Python 3.12.2** ← برای این پروژه از همین استفاده کنید
- Python 3.14.7

پکیج‌های زیر روی **3.12** نصب شده‌اند:

`fastapi`, `uvicorn`, `sqlalchemy`, `alembic`, `psycopg`, `pydantic`, `pydantic-settings`

چک سریع:

```powershell
py -3.12 -c "import fastapi, uvicorn, sqlalchemy, alembic, psycopg; print('OK')"
```

### دستور `python`

روی این ماشین alias استور حذف شده و `python` / `python3` به **Python 3.12.2** وصل‌اند. اگر در ترمینال قدیمی هنوز خطا دیدید، یک ترمینال جدید باز کنید:

```powershell
python --version
py -3.12 --version
```

### اگر Python اصلاً نبود

```powershell
winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements
```

سپس:

```powershell
py -3.12 -m pip install --upgrade pip
py -3.12 -m pip install "fastapi" "uvicorn[standard]" "sqlalchemy" "alembic" "psycopg[binary]" "pydantic" "pydantic-settings"
```

> در پروژهٔ واقعی بعداً به‌جای نصب سراسری، از **venv** داخل پوشهٔ بک‌اند استفاده می‌کنیم.

---

## ۳) دیتابیس — PostgreSQL

### وضعیت فعلی (نصب‌شده)

- نسخه: **PostgreSQL 17.11**
- سرویس ویندوز: `postgresql-x64-17` → Running
- پورت: `5432`
- دیتابیس پروژه: `gym_control`
- مسیر ابزار: `C:\Program Files\PostgreSQL\17\bin`
- رمز `postgres`: فایل `C:\Users\tabat\.gym-dev\postgres.env`

تأیید سریع:

```powershell
psql --version
Get-Service postgresql-x64-17
# رمز را از postgres.env بخوانید، سپس:
$env:PGPASSWORD = 'YOUR_PASSWORD'
psql -U postgres -h localhost -d gym_control -c "SELECT current_database();"
```

### اگر روی ماشین دیگری نصب می‌کنید

روش ترجیحی: دانلود نصب‌کننده از EnterpriseDB و اجرای unattended، یا:

```powershell
winget install --id PostgreSQL.PostgreSQL.17 -e --accept-package-agreements --accept-source-agreements
```

سپس:

```powershell
psql -U postgres -c "CREATE DATABASE gym_control;"
```

کلاینت گرافیکی اختیاری: pgAdmin 4 یا DBeaver.

---

## ۴) چک‌لیست نهایی (همه سبز شود)

در یک ترمینال **جدید**:

```powershell
node -v
npm -v
py -3.12 --version
py -3.12 -c "import fastapi; print(fastapi.__version__)"
psql --version
Get-Service *postgres*
```

| دستور | انتظار |
|--------|--------|
| `node -v` | v18+ (الان v24 دارید) |
| `py -3.12` | Python 3.12.x |
| import fastapi | بدون خطا |
| `psql --version` | psql (PostgreSQL) 17.x یا 16.x |
| سرویس postgres | Running |

---

## ۵) چیزهایی که عمداً هنوز نصب / ساخته نشده

- پروژهٔ React واقعی (هنوز پروتوتایپ HTML است)
- پوشهٔ بک‌اند FastAPI داخل ریپو
- جداول واقعی در Postgres  
این‌ها مرحلهٔ بعد از تأیید ADR و نصب Postgres هستند.

---

## ۶) مرحلهٔ بعد

ابزارها آماده‌اند. مرحلهٔ بعدی می‌تواند پذیرش ADRها و شروع اسکلت بک‌اند FastAPI + اتصال به `gym_control` باشد.
