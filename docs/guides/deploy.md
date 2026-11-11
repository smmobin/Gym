# راهنمای استقرار — GYM CONTROL

**هدف:** بالا آوردن محصول واقعی (`frontend/` + `backend/` + Postgres) روی هاست با **HTTPS**، بدون حدس زدن env، و بدون اجرای seed روی دادهٔ واقعی.

**GitHub Pages** (`*.github.io/Gym`) فقط ماکت HTML ریشه است — لاگین و دیتابیس واقعی ندارد.

**سیاست داده (قفل صاحب ۱۴۰۴-۰۸-۲۲):** روی سرور اصلی داده پاک/ریست نمی‌شود؛ دیپلوی فقط افزایشی است. جزئیات: [production-data-policy.md](production-data-policy.md). ساختار ریپو: [repo-structure.md](repo-structure.md). امنیت سخت‌شده: [security-hardening-status.md](security-hardening-status.md).

---

## چک‌لیست production (قبل از دادهٔ واقعی عضو)

| مورد | باید |
|------|------|
| `APP_ENV` | `production` (یا `staging`) |
| `SECRET_KEY` | رشتهٔ تصادفی ≥۳۲ کاراکتر (نه `CHANGE_ME`) |
| Cookie `Secure` | با `APP_ENV=production` خودکار روشن می‌شود — نیاز به **HTTPS** |
| `CORS_ORIGINS` | دامنهٔ واقعی HTTPS فرانت (نه localhost) |
| `DATABASE_URL` | Postgres هاست؛ رمز قوی؛ فقط در پنل هاست / `.env` سرور |
| Seed / wipe | **اجرا نشود** روی DB واقعی؛ `ALLOW_DESTRUCTIVE_SEED` همیشه `false` روی سرور اصلی |
| دیپلوی بعدی | فقط کد + `alembic upgrade head` — **بدون** wipe و بدون seed فیک حجیم |
| حساب تست | حداکثر ۱ مدیر + ۱ منشی + ۱ مربی + ۱ عضو؛ اگر از قبل هستند پاک نشوند |
| UI | صفحهٔ لاگین/لندینگ نباید حساب دمو یا رمز نمونه نشان دهد؛ اولین مدیر با `bootstrap_manager` |
| `/docs` | در production خاموش است |
| بکاپ | حداقل یک dump موفق + یک‌بار تمرین restore — [backup.md](backup.md) |
| Bind | پشت پروکسی: `uvicorn … --host 0.0.0.0`؛ مستقیم به اینترنت بدون TLS ممنوع |

تولید کلید نمونه:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

مرجع کامل متغیرها: `backend/.env.example` و `frontend/.env.example`.

---

## الف) مسیر پیشنهادی اول — PaaS ایرانی (مثلاً لیارا)

ایده: سه قطعهٔ جدا — **Postgres**، **API (Python)**، **فرانت استاتیک** (یا همان هاست استاتیک لیارا).

### ۱) دیتابیس Postgres

1. در پنل لیارا (یا معادل) یک Postgres بساز.
2. connection string را بردار و به شکل SQLAlchemy دربیاور:
   - اگر هاست `postgresql://user:pass@host:5432/db` داد → برای اپ بگذار:
   - `DATABASE_URL=postgresql+psycopg://user:pass@host:5432/db`
3. رمز را فقط در متغیرهای محیطی برنامه بگذار — **نه در گیت**.

### ۲) اپ بک‌اند

1. ریشهٔ دیپلوی را `backend/` بگذار (یا طبق UI لیارا مسیر پروژه را مشخص کن).
2. دستور اجرا (نمونه):

```bash
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

3. متغیرهای محیطی اجباری:

| کلید | مثال مفهومی |
|------|----------------|
| `APP_ENV` | `production` |
| `SECRET_KEY` | خروجی `token_urlsafe` |
| `DATABASE_URL` | `postgresql+psycopg://…` |
| `CORS_ORIGINS` | `https://YOUR-FRONTEND-DOMAIN` |
| `ALLOW_DESTRUCTIVE_SEED` | `false` |

4. بعد از بالا آمدن: `GET https://YOUR-API/api/v1/health` و `/api/v1/health/db` باید `ok` بدهند.
5. **هرگز** روی این DB دستور `python -m app.db.seed` نزن.

اگر لیارا Dockerfile می‌خواهد: از `backend/Dockerfile` همین ریپو استفاده کن (مسیر VPS و لیارا هر دو پوشش داده شده‌اند). اگر buildpack پایتون دارد، Dockerfile اجباری نیست.

### ۳) فرانت (build استاتیک)

روی لپ‌تاپ یا CI:

```powershell
cd frontend
npm ci
# اگر API و فرانت same-origin پشت یک دامنه/پروکسی‌اند، خالی بگذار:
# $env:VITE_API_BASE_URL=""
# اگر API روی ساب‌دامین جداست:
# $env:VITE_API_BASE_URL="https://api.example.com"
npm run build
```

خروجی: `frontend/dist/` — این پوشه را روی هاست استاتیک لیارا (یا nginx) آپلود کن.

**PWA:** بیلد شامل `manifest.webmanifest` و Service Worker است. هاست باید HTTPS باشد تا نصب روی گوشی کار کند؛ SW فقط UI را کش می‌کند و `/api` را NetworkOnly می‌گذارد. جزئیات تست لوکال: [getting-started.md](getting-started.md) بخش PWA.

**توصیهٔ کوکی:** فرانت و API را طوری بچین که مرورگر همان سایت را ببیند (پروکسی `/api` → بک‌اند). آن‌وقت `VITE_API_BASE_URL` خالی می‌ماند و cookie نشست بدون دردسر SameSite کار می‌کند.

### ۴) دامنه + HTTPS

- در پنل دامنه را وصل کن و گواهی TLS را روشن بگذار (معمولاً خودکار).
- تا HTTPS فعال نشده، با `APP_ENV=production` کوکی‌های `Secure` در HTTP کار نمی‌کنند.

### ۵) اولین حساب‌ها روی سرور خالی (بدون seed فیک)

Seed حجیم توسعه روی prod ممنوع است.

1. **مدیر:** از `backend/` بزن  
   `python -m app.db.bootstrap_manager --mobile 09… --name "…"`  
   (رمز را interactice وارد کن؛ اگر مدیری از قبل باشد دستور رد می‌شود — درست است.)
2. بعد با همان مدیر وارد شو و **یک منشی + یک مربی** بساز (یا اسکریپت idempotent «اطمینان از وجود» اگر سازنده اضافه کرد).
3. **یک عضو** تست از پنل بساز؛ برای OTP موبایل واقعی خودت را بگذار.
4. در دیپلوی‌های بعدی این چهار تا را **پاک نکن** و دوباره seed نزن — فقط دادهٔ واقعی اضافه می‌شود.

بدون حداقل یک حساب مدیر، پنل کارکنان باز نمی‌شود.

---

## ب) مسیر جایگزین — VPS Ubuntu + Docker

پیش‌نیاز سرور: Docker + Docker Compose، دامنهٔ DNS به IP سرور، پورت ۸۰/۴۴۳ باز.

### ۱) کلون و رمزها

```bash
git clone https://github.com/smmobin/Gym.git
cd Gym
cp backend/.env.example backend/.env
# SECRET_KEY، CORS_ORIGINS، و رمز Postgres را واقعی کن
export SECRET_KEY='…'
export POSTGRES_PASSWORD='…'
export CORS_ORIGINS='https://app.example.com'
```

### ۲) بالا آوردن API + Postgres

```bash
docker compose up -d --build
docker compose exec api alembic upgrade head
```

چک:

```bash
curl -fsS http://127.0.0.1:8000/api/v1/health
curl -fsS http://127.0.0.1:8000/api/v1/health/db
```

### ۳) فرانت + HTTPS با nginx (خلاصه)

1. `npm run build` و کپی `frontend/dist` به مثلاً `/var/www/gym`
2. nginx: دامنه → استاتیک؛ `location /api/` → `http://127.0.0.1:8000/api/`
3. Certbot (`certbot --nginx`) برای HTTPS

نمونهٔ جهت‌گیری (کپی عین‌به‌عین نیاز به تنظیم مسیر دارد):

```nginx
server {
  server_name app.example.com;
  root /var/www/gym;
  location / {
    try_files $uri /index.html;
  }
  location /api/ {
    proxy_pass http://127.0.0.1:8000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

### ۴) systemd بدون Docker (اختیاری)

اگر فقط venv می‌خواهی: Postgres سیستم + venv بک‌اند + واحد systemd برای uvicorn با `--host 127.0.0.1` و nginx به‌عنوان TLS terminator. منطق env همان جدول بالاست.

---

## Migration روی سرور

همیشه قبل از ترافیک واقعی:

```bash
# داخل کانتینر یا روی سرور با venv
alembic upgrade head
```

---

## Seed / Wipe — فقط توسعه

| محیط | Seed فیک حجیم | Wipe |
|------|----------------|------|
| لپ‌تاپ / DB خالی توسعه | OK — `python -m app.db.seed` (افزایشی) | `wipe_dev_data` فقط عمدی روی DB توسعه |
| staging با دادهٔ دورریختنی | فقط آگاهانه | فقط با `ALLOW_DESTRUCTIVE_SEED=true` |
| **production سرور اصلی** | **ممنوع** | **ممنوع** — فلگ destructive را روشن نکن |

اسکریپت‌ها در `APP_ENV=production|staging|prod` بدون آن فلگ خارج می‌شوند.  
قانون کامل صاحب: [production-data-policy.md](production-data-policy.md).

---

## بعد از استقرار

1. بکاپ هفتگی + یک‌بار restore آزمایشی — [backup.md](backup.md)
2. رمزهای پیش‌فرض توسعه را عوض کن
3. GitHub Pages را با محصول اشتباه نگیر

وضعیت نقشهٔ راه: [roadmap-status.md](../product/roadmap-status.md)
