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

RUN useradd --system --uid 10001 --home-dir /app --shell /usr/sbin/nologin gym \
    && mkdir -p /app/logs \
    && chown -R gym:gym /app/logs

ENV PYTHONUNBUFFERED=1
ENV APP_ENV=production
# Client IP for rate limits comes from X-Forwarded-For only when the peer is trusted.
# Keep the API port private (compose binds 127.0.0.1) and narrow this to the proxy IP.
ENV FORWARDED_ALLOW_IPS=127.0.0.1

USER gym

EXPOSE 8000

# Health for orchestrators (compose / k8s / Liara custom)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/api/v1/health || exit 1

# Bind 0.0.0.0 so reverse proxy / Docker network can reach the API.
# One worker: login rate limits are in-process memory.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--no-server-header", "--workers", "1"]
