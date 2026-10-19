from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

_WEAK_SECRETS = frozenset(
    {
        "",
        "CHANGE_ME",
        "change-me",
        "secret",
        "dev",
        "development",
    }
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "GYM CONTROL API"
    app_env: str = "development"
    api_prefix: str = "/api/v1"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    database_url: str = "postgresql+psycopg://postgres:CHANGE_ME@localhost:5432/gym_control"

    # Strong random string for production (sessions are DB-backed hashes; key is for
    # future signing / ops checklist). Never commit the real value.
    secret_key: str = "CHANGE_ME"

    # Auth / session (cookie name + TTL documented in getting-started)
    session_cookie_name: str = "gym_session"
    session_ttl_hours: int = 12
    # Athlete sessions are separate cookies + table (never share staff sessions)
    athlete_session_cookie_name: str = "gym_athlete_session"
    athlete_session_ttl_hours: int = 12
    login_rate_limit_max: int = 20
    login_rate_limit_window_seconds: int = 60
    # Member file lock TTL from last_seen_at (business-rules 12.1)
    member_file_lock_ttl_seconds: int = 300
    # Destructive seed must never run on real member data without explicit override
    allow_destructive_seed: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production_like(self) -> bool:
        return self.app_env.lower() in {"production", "prod", "staging"}

    @property
    def cookie_secure(self) -> bool:
        """Secure cookies only in production-like envs (HTTPS). Off for local http."""
        return self.is_production_like

    @property
    def secret_key_is_weak(self) -> bool:
        key = (self.secret_key or "").strip()
        if key.lower() in {s.lower() for s in _WEAK_SECRETS}:
            return True
        return len(key) < 32


@lru_cache
def get_settings() -> Settings:
    return Settings()
