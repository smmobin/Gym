"""Central Python logging for GYM CONTROL (builder-facing files under backend/logs/).

Files (rotating):
- access.log    — one line per HTTP request (method, path without query, status, ms, rid)
- app.log       — general app + uvicorn events (INFO+)
- error.log     — ERROR+ with full stack trace + request_id
- sensitive.log — allowed debug fields only (e.g. full mobile on SMS failure)

Handlers are attached programmatically (not dictConfig) so uvicorn's own console
handlers survive. Calling `setup_logging` again replaces only our handlers.
"""

from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

from app.core.config import Settings
from app.core.redaction import redact_text
from app.core.request_context import get_request_id

ACCESS_LOGGER = "gym.access"
SENSITIVE_LOGGER = "gym.sensitive"
ERROR_LOGGER = "gym.error"

DEFAULT_LOG_DIR = Path(__file__).resolve().parents[2] / "logs"

_FILE_FORMAT = "%(asctime)s %(levelname)s %(name)s [rid=%(request_id)s] %(message)s"
_CONSOLE_FORMAT = "%(levelname)s:     %(name)s [rid=%(request_id)s] %(message)s"
_MARK = "_gym_handler"


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not getattr(record, "request_id", None):
            record.request_id = get_request_id() or "-"
        return True


class RedactingFormatter(logging.Formatter):
    """Redacts the fully formatted line (message + exception text). Never mutates records."""

    def __init__(self, fmt: str, *, mask_mobiles: bool, mask_otp: bool) -> None:
        super().__init__(fmt)
        self._mask_mobiles = mask_mobiles
        self._mask_otp = mask_otp

    def format(self, record: logging.LogRecord) -> str:
        return redact_text(
            super().format(record),
            mask_mobiles=self._mask_mobiles,
            mask_otp=self._mask_otp,
        )


def resolve_log_dir(settings: Settings) -> Path:
    raw = (settings.log_dir or "").strip()
    return Path(raw) if raw else DEFAULT_LOG_DIR


def _level(settings: Settings) -> int:
    value = logging.getLevelName((settings.log_level or "INFO").strip().upper())
    return value if isinstance(value, int) else logging.INFO


def _mark(handler: logging.Handler) -> logging.Handler:
    setattr(handler, _MARK, True)
    handler.addFilter(RequestIdFilter())
    return handler


def _file_handler(
    path: Path,
    settings: Settings,
    *,
    level: int,
    mask_mobiles: bool = True,
) -> logging.Handler:
    handler = RotatingFileHandler(
        path,
        maxBytes=max(64 * 1024, int(settings.log_max_bytes)),
        backupCount=max(1, int(settings.log_backup_count)),
        encoding="utf-8",
        delay=True,
    )
    handler.setLevel(level)
    handler.setFormatter(RedactingFormatter(_FILE_FORMAT, mask_mobiles=mask_mobiles, mask_otp=True))
    return _mark(handler)


def _console_handler(level: int) -> logging.Handler:
    handler = logging.StreamHandler()
    handler.setLevel(level)
    # Local terminal keeps mobiles/fake-SMS OTP readable; secrets are still stripped.
    handler.setFormatter(RedactingFormatter(_CONSOLE_FORMAT, mask_mobiles=False, mask_otp=False))
    return _mark(handler)


def _drop_our_handlers(logger: logging.Logger) -> None:
    for handler in list(logger.handlers):
        if getattr(handler, _MARK, False):
            logger.removeHandler(handler)
            handler.close()


def setup_logging(settings: Settings, *, log_dir: Path | None = None) -> dict[str, Path]:
    """Configure gym loggers. Returns file paths (empty when LOG_TO_FILES=false)."""
    level = _level(settings)
    root = logging.getLogger()
    access = logging.getLogger(ACCESS_LOGGER)
    sensitive = logging.getLogger(SENSITIVE_LOGGER)
    uvicorn = logging.getLogger("uvicorn")
    for logger in (root, access, sensitive, uvicorn):
        _drop_our_handlers(logger)

    root.setLevel(level)
    console = _console_handler(level)
    root.addHandler(console)

    access.setLevel(logging.INFO)
    access.propagate = False
    access.addHandler(_console_handler(logging.INFO))

    sensitive.setLevel(logging.DEBUG)
    sensitive.propagate = False

    # One access line per request comes from our middleware (with request_id),
    # so silence uvicorn's duplicate console access line.
    logging.getLogger("uvicorn.access").disabled = True

    # alembic fileConfig (tests / migrations in-process) may have disabled app loggers.
    for name, obj in logging.root.manager.loggerDict.items():
        if isinstance(obj, logging.Logger) and (name == "gym" or name.startswith("gym.")):
            obj.disabled = False

    paths: dict[str, Path] = {}
    if not settings.log_to_files:
        return paths

    directory = log_dir or resolve_log_dir(settings)
    directory.mkdir(parents=True, exist_ok=True)
    paths = {
        "access": directory / "access.log",
        "app": directory / "app.log",
        "error": directory / "error.log",
        "sensitive": directory / "sensitive.log",
    }

    app_file = _file_handler(paths["app"], settings, level=level)
    error_file = _file_handler(paths["error"], settings, level=logging.ERROR)
    root.addHandler(app_file)
    root.addHandler(error_file)

    # uvicorn logs (startup, worker errors) do not propagate to root. Same handler
    # objects so a single RotatingFileHandler owns each file (safe rotation on Windows).
    uvicorn.addHandler(app_file)
    uvicorn.addHandler(error_file)

    access.addHandler(_file_handler(paths["access"], settings, level=logging.INFO))
    sensitive.addHandler(
        _file_handler(paths["sensitive"], settings, level=logging.DEBUG, mask_mobiles=False)
    )
    return paths


def shutdown_file_handlers() -> None:
    """Close our handlers (tests on Windows need released file locks)."""
    for logger in (
        logging.getLogger(),
        logging.getLogger(ACCESS_LOGGER),
        logging.getLogger(SENSITIVE_LOGGER),
        logging.getLogger("uvicorn"),
    ):
        _drop_our_handlers(logger)
