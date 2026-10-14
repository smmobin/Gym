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
│   ├── models/       # SQLAlchemy models
│   ├── schemas/      # Pydantic schemas
│   ├── services/     # business logic
│   └── main.py
├── alembic/          # migrations
├── requirements.txt
└── .env.example
```
