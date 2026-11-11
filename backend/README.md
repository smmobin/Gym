# Backend · GYM CONTROL API

FastAPI + SQLAlchemy + PostgreSQL (`gym_control`).

## Setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Edit `.env` and set `DATABASE_URL` with your local Postgres password  
(from `C:\Users\tabat\.gym-dev\postgres.env` on this machine).

## Migration

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
alembic upgrade head
```

Seed ساختگی (`python -m app.db.seed`) فقط برای لپ‌تاپ توسعه است و جدول‌ها را پاک نمی‌کند؛ wipe دستور جداست (`wipe_dev_data`). روی production هر دو مسدودند. سرور خالی: `ensure_smoke_accounts`. جزئیات: `docs/guides/getting-started.md` و `docs/guides/deploy.md`.

## Run

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Tests

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest
```

قبل از commit/push باید سبز باشند. جزئیات: `docs/guides/testing.md`

- API root: http://127.0.0.1:8000/
- Docs: http://127.0.0.1:8000/docs
- Health: http://127.0.0.1:8000/api/v1/health
- DB health: http://127.0.0.1:8000/api/v1/health/db

## Layout

```text
backend/
├── app/
│   ├── api/v1/       # route modules
│   ├── core/         # settings, db
│   ├── db/           # seed
│   ├── models/       # SQLAlchemy models
│   ├── schemas/      # Pydantic schemas
│   ├── services/     # debt, booking capacity, …
│   └── main.py
├── alembic/          # migrations
├── requirements.txt
└── .env.example
```
