"""Production process start: forward-only migration, then the API.

Used by the Docker image. Does not seed, wipe, or create smoke accounts.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# One worker: login rate limits are in-process memory.
UVICORN_MODULE_ARGS = [
    "-m",
    "uvicorn",
    "app.main:app",
    "--host",
    "0.0.0.0",
    "--port",
    "8000",
    "--proxy-headers",
    "--no-server-header",
    "--workers",
    "1",
]


def upgrade_head() -> None:
    """Apply pending Alembic revisions. Safe to repeat; does not delete rows."""
    from alembic import command
    from alembic.config import Config

    backend_root = Path(__file__).resolve().parents[2]
    print("alembic upgrade head", flush=True)
    command.upgrade(Config(str(backend_root / "alembic.ini")), "head")
    print("alembic upgrade head OK", flush=True)


def main() -> None:
    upgrade_head()
    os.execv(sys.executable, [sys.executable, *UVICORN_MODULE_ARGS])


if __name__ == "__main__":
    main()
