# تست خودکار و شرط پوش به GitHub

**تاریخ ثبت:** ۱۴۰۴-۰۷-۲۲ (2026-10-14)  
**منبع:** درخواست صاحب پروژه — برای هر قابلیت مهم تست بنویس؛ فقط اگر سبز بود commit/push کن؛ نتیجه را شفاف بگو.

---

## تست یعنی چه؟ (به زبان ساده)

**تست خودکار** یک اسکریپت کوچک است که برنامه را مثل یک ربات امتحان می‌کند:

- مثلاً می‌گوید: «به آدرس `/api/v1/health` درخواست بزن؛ باید جواب `ok` بیاید.»
- اگر آمد → تست **سبز** (pass)
- اگر نیامد → تست **قرمز** (fail)

فایده‌اش: قبل از اینکه کد به GitHub برود، می‌فهمیم چیزی نشکسته — مخصوصاً وقتی vibe coding می‌کنی و تغییرات پشت‌سرهم زیاد است.

---

## قانون پروژه

| قانون | توضیح |
|--------|--------|
| ۱ | هر قابلیت / ماژول مهم → حداقل یک تست |
| ۲ | قبل از commit/push → تست‌ها را اجرا کن |
| ۳ | فقط اگر **سبز** بودند → commit و push به GitHub |
| ۴ | به صاحب پروژه بگو: کاملاً OK بوده یا نه (و اگر نه، چه چیزی) |
| ۵ | تغییر فقط-مستندات بدون رفتار کد → تست اجباری نیست؛ ولی بگو «فقط docs» |

قانون Cursor مربوط: `.cursor/rules/testing-and-ship.mdc`

---

## بک‌اند (Python)

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pytest -q
```

تست‌ها در `backend/tests/`.

ابزار: **pytest** + **httpx** / TestClient فست‌اپ‌آی.

### دیتابیس تست جدا از دیتابیس کار روزمره

`pytest` به **`gym_control_test`** وصل می‌شود — نه به `gym_control` داخل `.env`.  
`conftest.py` قبل از import اپ، `DATABASE_URL` را به DB تست override می‌کند (یا از `TEST_DATABASE_URL` می‌خواند). روی DB روزمره wipe نمی‌زند.

#### یک‌بار راه‌اندازی (ویندوز / PowerShell)

اگر Postgres بالا است و رمز همان `.env` است، معمولاً خود pytest دیتابیس را می‌سازد. در غیر این صورت دستی:

```powershell
# گزینه ۱ — psql (مسیر bin را با نسخهٔ خودتان عوض کنید)
$env:PGPASSWORD = "YOUR_POSTGRES_PASSWORD"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -c "CREATE DATABASE gym_control_test;"

# گزینه ۲ — با SQLAlchemy URL تست (بعد از ساخت DB خالی)
cd backend
$env:DATABASE_URL = "postgresql+psycopg://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/gym_control_test"
.\.venv\Scripts\python.exe -m alembic upgrade head
```

اختیاری در `backend/.env` (یا فقط در شل قبل از pytest):

```text
TEST_DATABASE_URL=postgresql+psycopg://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/gym_control_test
```

اگر `TEST_DATABASE_URL` به نام `gym_control` اشاره کند، pytest عمداً **قطع** می‌شود تا دادهٔ کار روزمره خراب نشود.

### Seed در تست در برابر seed در توسعه

| کجا | چه می‌کند |
|------|-----------|
| `python -m app.db.seed` (توسعه) | افزایشی؛ دادهٔ دستی را پاک نمی‌کند |
| داخل pytest | روی DB تست، در صورت نیاز `wipe_and_seed()` برای state تمیز |
| `python -m app.db.wipe_dev_data` | فقط wipe عمدی دامنه (با گارد prod) |

## فرانت‌اند (Ocean Dark MPA)

```powershell
cd frontend
npm test
npm run build
```

تست‌های دود در `frontend/tests/` (Vitest + jsdom؛ mock روی `fetch`):

- `api.test.js` — happy path + 401/403
- `auth-staff.test.js` — ورود یکپارچه + `panelPathForRole` / جلوگیری از next نقش اشتباه
- `trial.test.js` — ارسال جلسه آزمایشی
- `athlete-book.test.js` — رزرو کلاس ورزشکار
- `dashboard.test.js` — خلاصه داشبورد مدیر (بازه ماه، آمار مالی، برچسب هزینه)
- `desk-dashboard.test.js` — داشبورد عملیاتی منشی (آمار امروز + لیست اقدام)
- `auto-refresh.test.js` — `createAutoRefresh`: backoff پس از خطا + توقف وقتی `[data-section]` مخفی است
- `staff-plans.test.js` — کارکنان + طرح‌ها (بدون دکمهٔ بازخوانی؛ retry خودکار پس از خطای شبکه)
- `money-input.test.js` — جداکنندهٔ هزارگان فیلدهای تومان (`data-money`) + پارس رقم فارسی/لاتین
- `live-search.test.js` / `members-live-search.test.js` — جستجوی زنده (debounce) بدون دکمهٔ جستجو/بازخوانی
- `trainers-roster.test.js` — با انتخاب مربی، لیست شاگردان همان مربی (`GET /trainers/{id}/members`)

بک‌اند (نمونهٔ مرتبط با ورود یکپارچه): `test_auth.py` — staff هر نقش، athlete، رمز غلط، اولویت staff اگر موبایل در هر دو جدول.

ابزار: **Vitest** (بدون React / Testing Library).

---

## استقرار / اسکریپت‌ها

- منطق جدید در `backend/scripts/` (پارس `DATABASE_URL`، dry-run بکاپ/restore) → تست در `backend/tests/test_backup_scripts.py`
- فلگ‌های production در `Settings` (`cookie_secure`، `secret_key_is_weak`) → `test_config_prod.py`
- مسدودسازی seed در prod → `test_seed_guard.py`
- تغییر فقط-مستندات در `docs/guides/deploy.md` / `backup.md` → تست اجباری نیست؛ در گزارش بگو docs

## گزارش به صاحب پروژه (قالب)

بعد از هر قابلیت مهم، در چت چیزی شبیه این بگو:

- **نتیجه تست:** سبز / قرمز
- **قابلیت:** کاملاً OK اجرا می‌شود / مشکل دارد (جزئیات)
- **GitHub:** پوش شد / پوش نشد چون تست قرمز بود
