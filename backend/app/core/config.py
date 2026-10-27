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

    # Auth / session (cookie name + idle TTL documented in getting-started)
    session_cookie_name: str = "gym_session"
    # Idle timeout: logout after this many minutes without user activity (touch).
    session_idle_minutes: int = 25
    # Hard cap from login even if the user stays active.
    session_ttl_hours: int = 12
    # Athlete sessions are separate cookies + table (never share staff sessions)
    athlete_session_cookie_name: str = "gym_athlete_session"
    athlete_session_idle_minutes: int = 25
    athlete_session_ttl_hours: int = 12
    login_rate_limit_max: int = 20
    login_rate_limit_window_seconds: int = 60
    # Member file lock TTL from last_seen_at (business-rules 12.1)
    member_file_lock_ttl_seconds: int = 300
    # Destructive seed must never run on real member data without explicit override
    allow_destructive_seed: bool = False

    # Serve frontend/dist from this API process (single-host preview / tunnel).
    # auto (default) = only if dist exists; true = require build; false = API JSON / only.
    # Pytest never mounts the SPA (see app.main).
    serve_frontend: str = "auto"

    # Online payment gateway (secrets only via env — never commit real merchant ids)
    # provider: none | zarinpal (extensible via adapter factory)
    payment_gateway_provider: str = "none"
    payment_gateway_merchant_id: str = ""
    payment_gateway_sandbox: bool = True
    # Server callback that Zarinpal redirects to after pay (must be reachable; HTTPS in prod)
    payment_gateway_callback_url: str = ""
    # Optional browser return after our callback (e.g. http://127.0.0.1:5173/athlete/#pay)
    payment_gateway_front_return_url: str = ""

    # SMS provider (secrets only via env — never commit real API keys)
    # provider: none | kavenegar (extensible via adapter factory)
    sms_provider: str = "none"
    sms_api_key: str = ""
    sms_sender: str = ""

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

    @property
    def payment_gateway_enabled(self) -> bool:
        """True only when a real provider is named and merchant id is present."""
        provider = (self.payment_gateway_provider or "").strip().lower()
        if provider in {"", "none", "off", "disabled"}:
            return False
        return bool((self.payment_gateway_merchant_id or "").strip())

    @property
    def sms_enabled(self) -> bool:
        """True only when a real SMS provider is named and API key is present."""
        provider = (self.sms_provider or "").strip().lower()
        if provider in {"", "none", "off", "disabled"}:
            return False
        return bool((self.sms_api_key or "").strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
