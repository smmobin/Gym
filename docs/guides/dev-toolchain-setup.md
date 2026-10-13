# راهنمای نصب ابزارهای توسعه (Windows)

این راهنما پشتهٔ پیشنهادی ADRها را پوشش می‌دهد:

| لایه | ابزار | وضعیت روی سیستم شما (بررسی ۲۰۲۶-۱۰-۱۳) |
|------|--------|----------------------------------------|
| فرانت | Node.js + npm + Vite + TypeScript | **نصب است** (Node v24، npm 11؛ `typescript` و `vite` سراسری هم نصب شد) |
| بک‌اند | Python 3.12 + FastAPI و وابستگی‌ها | **Python و پکیج‌ها آماده‌اند**؛ دستور `python` هنوز به خاطر alias ویندوز خراب است |
| دیتابیس | PostgreSQL 16+ | **نصب نیست** — نیاز به Administrator دارد |

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

### مشکل مهم: دستور `python` کار نمی‌کند

ویندوز یک میانبر تقلبی در Microsoft Store دارد. فعلاً همیشه از این استفاده کنید:

```powershell
py -3.12
py -3.12 -m pip ...
```

### رفع کامل (پیشنهادی — خودتان انجام دهید)

1. بروید به:  
   **Settings → Apps → Advanced app settings → App execution aliases**
2. برای **`python.exe`** و **`python3.exe`** گزینه را **Off** کنید.
3. یک ترمینال جدید باز کنید و بزنید:

```powershell
python --version
```

باید چیزی شبیه `Python 3.12.2` ببینید (چون مسیر 3.12 به User PATH اضافه شده).

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

## ۳) دیتابیس — PostgreSQL (نیاز به Admin)

نصب از این محیط Cursor به‌خاطر نبود دسترسی Administrator و کندی دانلود EnterpriseDB کامل نشد. باید **خودتان یک‌بار با Run as Administrator** نصب کنید.

### روش الف — winget (ساده‌ترین)

1. منوی استارت → **Windows PowerShell** یا **Terminal** → راست‌کلیک → **Run as administrator**
2. این دستور:

```powershell
winget install --id PostgreSQL.PostgreSQL.17 -e --accept-package-agreements --accept-source-agreements
```

3. در ویزارد نصب:
   - رمز کاربر `postgres` را یادداشت کنید (مثلاً یک رمز قوی محلی)
   - پورت پیش‌فرض: **5432**
   - نصب **Command Line Tools** و در صورت تمایل **pgAdmin 4** را فعال بگذارید
4. همهٔ ترمینال‌ها را ببندید و دوباره باز کنید.

### روش ب — Chocolatey (اگر Admin دارید)

در PowerShell با Administrator:

```powershell
choco install postgresql17 -y --params "/Password:YOUR_STRONG_PASSWORD"
```

رمز را با مقدار واقعی عوض کنید و جایی امن نگه دارید.

### روش ج — نصب‌کنندهٔ رسمی

1. از صفحهٔ رسمی دانلود کنید:  
   [https://www.enterprisedb.com/downloads/postgres-postgresql-downloads](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads)  
   نسخهٔ **Windows x86-64** برای PostgreSQL 17 (یا 16).
2. فایل `.exe` را Run as administrator اجرا کنید.
3. همان تنظیمات پورت 5432 و رمز `postgres` را انجام دهید.
4. در پایان، مسیر زیر را به PATH اضافه کنید اگر `psql` شناخته نشد:

```text
C:\Program Files\PostgreSQL\17\bin
```

(Settings → System → About → Advanced system settings → Environment Variables → Path)

### بعد از نصب — تأیید

```powershell
psql --version
Get-Service *postgres*
```

سرویس باید **Running** باشد.

ساخت دیتابیس پروژه:

```powershell
psql -U postgres -c "CREATE DATABASE gym_control;"
```

اگر رمز خواست، همان رمز نصب را بزنید.

اتصال تستی:

```powershell
psql -U postgres -d gym_control -c "SELECT version();"
```

### کلاینت گرافیکی (اختیاری)

- **pgAdmin 4** معمولاً با نصب‌کنندهٔ EDB می‌آید  
- یا: `winget install PostgreSQL.pgAdmin`  
- یا DBeaver Community

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

## ۶) اگر نصب Postgres را تمام کردید

در چت بگویید «Postgres نصب شد» تا با هم سرویس، ساخت `gym_control`، و در صورت تمایل پذیرش ADR دیتابیس را جلو ببریم.
