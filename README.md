# GYM CONTROL · باشگاه آذر

سامانهٔ مدیریت باشگاه ورزشی — پروتوتایپ HTML + اسکلت فرانت/بک برای نسخهٔ عملیاتی.

**نسخهٔ زنده (پروتوتایپ):** [smmobin.github.io/Gym](https://smmobin.github.io/Gym/)

---

## شروع سریع توسعه

جزئیات کامل: [docs/guides/getting-started.md](docs/guides/getting-started.md)

```powershell
# ترمینال ۱ — API
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# ترمینال ۲ — React
cd frontend
npm run dev
```

- فرانت: http://127.0.0.1:5173  
- API docs: http://127.0.0.1:8000/docs  

---

## ساختار ریپو

```text
Gym/
├── frontend/               # React + TypeScript + Vite
├── backend/                # FastAPI + SQLAlchemy + Alembic + Postgres
├── docs/                   # مستندات و ADR (منبع حقیقت)
├── index.html              # پروتوتایپ لندینگ (GitHub Pages)
├── athlete.html            # پروتوتایپ پنل ورزشکار
├── receptionist.html       # پروتوتایپ پنل منشی
├── manager.html            # پروتوتایپ پنل مدیر
├── styles.css / js / images
└── alternate-themes/       # فقط محلی (gitignore) — روی GitHub نیست
```

---

## پشتهٔ پیشنهادی (ADR)

| لایه | انتخاب |
|------|--------|
| فرانت | React + TypeScript + Vite |
| بک‌اند | Python FastAPI |
| دیتابیس | PostgreSQL (`gym_control`) |

- [فهرست مستندات](docs/README.md)
- [راهنمای شروع](docs/guides/getting-started.md)
- [استقرار (لیارا / VPS)](docs/guides/deploy.md)
- [بکاپ Postgres](docs/guides/backup.md)
- [نصب ابزارها](docs/guides/dev-toolchain-setup.md)
- [ADRها](docs/adr/README.md)

---

## نکات امنیتی / گیت

- `.env`، `.venv`، `node_modules`، لاگ‌ها و رمزها در `.gitignore` هستند.
- `alternate-themes/` روی دستگاه می‌ماند ولی به GitHub پوش نمی‌شود.
