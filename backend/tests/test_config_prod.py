"""Production-oriented settings helpers."""

from app.core.config import Settings, get_settings


def test_cookie_secure_off_in_development() -> None:
    s = Settings(app_env="development", secret_key="x" * 40)
    assert s.cookie_secure is False
    assert s.is_production_like is False


def test_cookie_secure_on_in_production() -> None:
    s = Settings(app_env="production", secret_key="x" * 40)
    assert s.cookie_secure is True
    assert s.is_production_like is True


def test_cookie_secure_on_in_staging() -> None:
    s = Settings(app_env="staging", secret_key="x" * 40)
    assert s.cookie_secure is True


def test_secret_key_weak_defaults() -> None:
    assert Settings(secret_key="CHANGE_ME").secret_key_is_weak is True
    assert Settings(secret_key="short").secret_key_is_weak is True
    assert Settings(secret_key="a" * 32).secret_key_is_weak is False


def test_cors_origin_list_splits() -> None:
    s = Settings(cors_origins="https://a.example, https://b.example")
    assert s.cors_origin_list == ["https://a.example", "https://b.example"]


def test_get_settings_cached_returns_settings() -> None:
    get_settings.cache_clear()
    s = get_settings()
    assert isinstance(s, Settings)
    get_settings.cache_clear()
