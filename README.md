# GYM CONTROL · باشگاه آذر

سامانهٔ مدیریت باشگاه ورزشی — فرانت Ocean Dark متصل به API + بک‌اند FastAPI.

**ماکت استاتیک (بدون API):** [smmobin.github.io/Gym](https://smmobin.github.io/Gym/)  
**محصول واقعی UI:** پوشهٔ `frontend/` (Vite + HTML/CSS/JS) با بک‌اند لوکال/هاست.

---

## شروع سریع توسعه

جزئیات کامل: [docs/guides/getting-started.md](docs/guides/getting-started.md)

```powershell
# ترمینال ۱ — API
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# ترمینال ۲ — فرانت Ocean Dark
cd frontend
npm run dev
```

- فرانت: http://127.0.0.1:5173  
- ورود یکپارچه: http://127.0.0.1:5173/login/  
- API docs: http://127.0.0.1:8000/docs  

---

## ساختار ریپو

```text
Gym/
├── frontend/               # Ocean Dark MPA (HTML/CSS/JS + Vite) — UI محصول
├── backend/                # FastAPI + SQLAlchemy + Alembic + Postgres
├── docs/                   # مستندات و ADR (منبع حقیقت)
├── index.html …            # ماکت GitHub Pages (بدون API)
├── styles.css / js / images
└── alternate-themes/       # فقط محلی (gitignore)
```

---

## پشته (ADR)

| لایه | انتخاب |
|------|--------|
| فرانت | HTML/CSS/JS Ocean Dark + Vite (بدون React) — [ADR 0005](docs/adr/0005-frontend-ocean-dark-mpa.md) |
| بک‌اند | Python FastAPI |
| دیتابیس | PostgreSQL (`gym_control`) |

- [فهرست مستندات](docs/README.md)
- [راهنمای شروع](docs/guides/getting-started.md)
- [استقرار](docs/guides/deploy.md)
- [بکاپ](docs/guides/backup.md)

---

## نکات امنیتی / گیت

- `.env`، `.venv`، `node_modules`، لاگ‌ها و رمزها در `.gitignore` هستند.
- `alternate-themes/` به GitHub پوش نمی‌شود.
