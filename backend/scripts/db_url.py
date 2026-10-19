"""Parse DATABASE_URL for pg_dump / psql (no secrets printed by helpers)."""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import unquote, urlparse


@dataclass(frozen=True)
class PgConnInfo:
    user: str
    password: str
    host: str
    port: int
    database: str

    def safe_summary(self) -> str:
        """Host/db/user only — never includes password."""
        return f"{self.user}@{self.host}:{self.port}/{self.database}"


def parse_database_url(url: str) -> PgConnInfo:
    """
    Accept SQLAlchemy URLs like:
      postgresql+psycopg://user:pass@host:5432/dbname
      postgresql://user:pass@host/dbname
    """
    raw = (url or "").strip()
    if not raw:
        raise ValueError("DATABASE_URL خالی است.")

    # Strip SQLAlchemy driver suffix for urlparse
    normalized = raw
    if normalized.startswith("postgresql+"):
        # postgresql+psycopg://... → postgresql://...
        scheme, rest = normalized.split("://", 1)
        driver = scheme.split("+", 1)[0]
        normalized = f"{driver}://{rest}"

    parsed = urlparse(normalized)
    if parsed.scheme not in {"postgresql", "postgres"}:
        raise ValueError(
            f"فقط postgresql پشتیبانی می‌شود (گرفته شد: {parsed.scheme or 'empty'})."
        )

    database = (parsed.path or "").lstrip("/")
    if not database:
        raise ValueError("نام دیتابیس در DATABASE_URL نیست.")
    if "/" in database:
        database = database.split("/", 1)[0]

    user = unquote(parsed.username or "")
    password = unquote(parsed.password or "")
    host = parsed.hostname or "localhost"
    port = parsed.port or 5432

    if not user:
        raise ValueError("نام کاربری در DATABASE_URL نیست.")

    return PgConnInfo(
        user=user,
        password=password,
        host=host,
        port=port,
        database=database,
    )
