# GYM CONTROL API — production-oriented image (VPS / generic Docker hosts)
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini .
COPY alembic ./alembic
COPY app ./app
COPY scripts ./scripts

ENV PYTHONUNBUFFERED=1
ENV APP_ENV=production

EXPOSE 8000

# Health for orchestrators (compose / k8s / Liara custom)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/api/v1/health || exit 1

# Bind 0.0.0.0 so reverse proxy / Docker network can reach the API
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
