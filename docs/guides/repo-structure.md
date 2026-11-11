# ساختار ریپو — GYM CONTROL

**تاریخ:** ۱۴۰۴-۰۸-۲۲ (2026-11-12)  
**هدف:** یک نگاه واحد برای دیپلوی و Agentها — چه چیزی محصول است، چه چیزی ماکت.

## درخت منطقی

| مسیر | نقش | روی سرور؟ |
|------|-----|-----------|
| `frontend/` | UI واقعی Ocean Dark MPA + Vite + PWA | بیلد → `dist/` روی هاست HTTPS |
| `backend/` | FastAPI + SQLAlchemy + Alembic | سرویس API + worker نیست (فعلاً همان uvicorn) |
| `docs/` | منبع حقیقت محصول/امنیت/دیپلوی | فقط مرجع؛ اجرا نمی‌شود |
| ریشه `*.html` / ماکت Pages | دموی استاتیک GitHub Pages | **محصول واقعی نیست** — لاگین/DB ندارد |
| `alternate-themes/` | تم محلی | معمولاً خارج گیت / غیرprod |
| `backend/logs/` | لاگ فایل سازنده | روی دیسک سرور؛ در گیت نیست |
| `backups/` | خروجی بکاپ | در گیت نیست؛ ترجیحاً خارج ریپو |
| `.env` | اسرار | فقط سرور/لوکال؛ **هرگز گیت** |

## قراردادهای پایدار

- API: فقط زیر `/api/v1`
- فرانت محصول: فقط `frontend/` (نه React، نه HTML ریشه به‌عنوان سامانه)
- نقش و پول: سرور مرجع حقیقت است
- تست: `backend/tests` (pytest) و `frontend/tests` (vitest)
- دیپلوی داده: [production-data-policy.md](production-data-policy.md)

## وضعیت ساختار (ممیزی سبک ۱۴۰۴-۰۸-۲۲)

| مورد | وضعیت |
|------|--------|
| جداسازی ماکت Pages / محصول | OK |
| Docker/`Dockerfile` بک‌اند + compose | استارت = `python -m app.db.serve` (فقط `alembic upgrade head` سپس uvicorn) |
| مسدود بودن wipe/seed روی production | OK — حتی اگر `ALLOW_DESTRUCTIVE_SEED=true` |
| `bootstrap_manager` برای اولین مدیر | OK — اگر مدیر هست خروج ۲ و بدون نوشتن |
| `ensure_smoke_accounts` | OK — حداکثر ۱+۱+۱+۱؛ فقط INSERT؛ DELETE ندارد |
| سند سیاست داده prod | [production-data-policy.md](production-data-policy.md) |

اگر پوشهٔ جدید محصولی اضافه شد، یک خط به این جدول بزن.
