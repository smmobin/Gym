from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


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

    # Auth / session (cookie name + TTL documented in getting-started)
    session_cookie_name: str = "gym_session"
    session_ttl_hours: int = 12
    login_rate_limit_max: int = 20
    login_rate_limit_window_seconds: int = 60

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def cookie_secure(self) -> bool:
        """Secure cookies only in production (HTTPS). Off for local http://127.0.0.1."""
        return self.app_env.lower() in {"production", "prod", "staging"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
