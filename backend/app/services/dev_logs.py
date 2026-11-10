"""Read allowlisted log files under LOG_DIR. Never follows path traversal."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from app.core.config import Settings
from app.core.logging_setup import resolve_log_dir

ALLOWED_FILES: dict[str, str] = {
    "access": "access.log",
    "app": "app.log",
    "error": "error.log",
    "sensitive": "sensitive.log",
}

MAX_LIMIT = 2000
DEFAULT_LIMIT = 400
MAX_READ_BYTES = 8 * 1024 * 1024
MAX_DOWNLOAD_RANGE_LINES = 5000
LEVELS = frozenset({"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"})


class DevLogError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def _log_dir(settings: Settings) -> Path:
    return resolve_log_dir(settings).resolve()


def resolve_allowed_file(settings: Settings, key: str) -> Path:
    """Map an allowlisted key to a file inside LOG_DIR. Rejects traversal."""
    cleaned = (key or "").strip()
    if (
        not cleaned
        or cleaned != key.strip()
        or cleaned not in ALLOWED_FILES
        or "/" in cleaned
        or "\\" in cleaned
        or ".." in cleaned
    ):
        raise DevLogError(400, "نام فایل مجاز نیست.")

    directory = _log_dir(settings)
    path = (directory / ALLOWED_FILES[cleaned]).resolve()
    if path.parent != directory:
        raise DevLogError(400, "نام فایل مجاز نیست.")
    return path


def list_log_files(settings: Settings) -> list[dict]:
    directory = _log_dir(settings)
    items: list[dict] = []
    for key, filename in ALLOWED_FILES.items():
        path = directory / filename
        exists = path.is_file()
        size = path.stat().st_size if exists else 0
        mtime = None
        if exists:
            mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()
        items.append(
            {
                "file": key,
                "filename": filename,
                "exists": exists,
                "size_bytes": size,
                "mtime": mtime,
            }
        )
    return items


def _read_text(path: Path) -> tuple[str, bool]:
    if not path.is_file():
        return "", False
    size = path.stat().st_size
    with path.open("rb") as handle:
        truncated = size > MAX_READ_BYTES
        if truncated:
            handle.seek(size - MAX_READ_BYTES)
        raw = handle.read()
    text = raw.decode("utf-8", errors="replace")
    if truncated:
        newline = text.find("\n")
        if newline >= 0:
            text = text[newline + 1 :]
    return text, truncated


def _line_matches(text: str, *, q: str, level: str, rid: str) -> bool:
    if level and f" {level} " not in text:
        return False
    if rid and rid not in text:
        return False
    if q and q.casefold() not in text.casefold():
        return False
    return True


def read_log_window(
    settings: Settings,
    *,
    file_key: str,
    offset: int | None,
    limit: int,
    q: str = "",
    level: str = "",
    rid: str = "",
) -> dict:
    if limit < 1 or limit > MAX_LIMIT:
        raise DevLogError(400, "limit باید بین ۱ و ۲۰۰۰ باشد.")
    level_norm = (level or "").strip().upper()
    if level_norm and level_norm not in LEVELS:
        raise DevLogError(400, "سطح لاگ نامعتبر است.")
    query = (q or "").strip()
    if len(query) > 200:
        raise DevLogError(400, "عبارت جستجو خیلی بلند است.")
    rid_norm = (rid or "").strip()
    if len(rid_norm) > 80:
        raise DevLogError(400, "request id نامعتبر است.")
    if offset is not None and offset < 0:
        raise DevLogError(400, "offset نامعتبر است.")

    path = resolve_allowed_file(settings, file_key)
    text, truncated = _read_text(path)
    raw_lines = text.splitlines()
    matched: list[tuple[int, str]] = []
    for number, line in enumerate(raw_lines, start=1):
        if _line_matches(line, q=query, level=level_norm, rid=rid_norm):
            matched.append((number, line))

    total = len(matched)
    if offset is None:
        start = max(0, total - limit)
    else:
        start = min(offset, total)
    window = matched[start : start + limit]
    return {
        "file": file_key,
        "filename": ALLOWED_FILES[file_key],
        "exists": path.is_file(),
        "size_bytes": path.stat().st_size if path.is_file() else 0,
        "truncated_to_tail": truncated,
        "total_matched": total,
        "offset": start,
        "limit": limit,
        "has_older": start > 0,
        "has_newer": start + len(window) < total,
        "lines": [{"line": number, "text": line} for number, line in window],
    }


def download_bytes(
    settings: Settings,
    *,
    file_key: str,
    start_line: int | None = None,
    end_line: int | None = None,
) -> tuple[bytes, str]:
    path = resolve_allowed_file(settings, file_key)
    filename = ALLOWED_FILES[file_key]
    if not path.is_file():
        return b"", filename

    if start_line is None and end_line is None:
        size = path.stat().st_size
        if size > MAX_READ_BYTES:
            raise DevLogError(413, "فایل از حد دانلود یک‌جا بزرگ‌تر است؛ بازهٔ خط بدهید یا از دیسک بخوانید.")
        return path.read_bytes(), filename

    if start_line is None or end_line is None or start_line < 1 or end_line < start_line:
        raise DevLogError(400, "بازهٔ خطوط نامعتبر است.")
    if end_line - start_line + 1 > MAX_DOWNLOAD_RANGE_LINES:
        raise DevLogError(400, "بازهٔ دانلود حداکثر ۵۰۰۰ خط است.")

    text, _truncated = _read_text(path)
    lines = text.splitlines()
    selected = lines[start_line - 1 : end_line]
    body = ("\n".join(selected) + ("\n" if selected else "")).encode("utf-8")
    ranged_name = f"{file_key}-{start_line}-{end_line}.log"
    return body, ranged_name
