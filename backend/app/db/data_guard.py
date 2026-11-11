"""Block wipe and fake seed on the real server.

`APP_ENV=production` or `prod` always refuses, even when
`ALLOW_DESTRUCTIVE_SEED=true`. Staging refuses unless that flag is set
(throwaway database only). Development is unchanged.

`ensure_smoke_accounts` does not use this guard: it only inserts missing rows.
"""

from __future__ import annotations

from app.core.config import Settings, get_settings

_REAL_SERVER_ENVS = frozenset({"production", "prod"})


def destructive_block_reason(settings: Settings | None = None, *, action: str) -> str | None:
    """Return a refusal message, or None when the destructive command may run."""
    current = settings if settings is not None else get_settings()
    env = (current.app_env or "").strip().lower()
    if env in _REAL_SERVER_ENVS:
        return (
            f"Refuse {action}: APP_ENV is production. "
            "wipe_dev_data, wipe_and_seed, and seed never run on the real server, "
            "even when ALLOW_DESTRUCTIVE_SEED=true. "
            "Deploy with alembic upgrade head only."
        )
    if env == "staging" and not current.allow_destructive_seed:
        return (
            f"Refuse {action}: APP_ENV is staging. "
            "For a throwaway staging database only, set ALLOW_DESTRUCTIVE_SEED=true."
        )
    return None


def refuse_if_destructive(action: str) -> None:
    reason = destructive_block_reason(action=action)
    if reason:
        raise SystemExit(reason)
