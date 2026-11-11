import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.dev_log_gate import dev_log_viewer_enabled
from app.core.logging_setup import setup_logging
from app.core.request_context import REQUEST_ID_HEADER
from app.core.request_middleware import RequestContextMiddleware
from app.core.security_middleware import OriginCheckMiddleware, SecurityHeadersMiddleware

settings = get_settings()
logger = logging.getLogger("gym.startup")

# repo_root/frontend/dist (backend/app/main.py → parents[2] = repo root)
FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


def _frontend_dist_ready() -> bool:
    return FRONTEND_DIST.is_dir() and (FRONTEND_DIST / "index.html").is_file()


def _should_serve_frontend() -> bool:
    """Serve built MPA from FastAPI for single-host preview/tunnel.

    - Never during pytest (keeps GET / JSON health tests stable).
    - SERVE_FRONTEND=false → never.
    - SERVE_FRONTEND=true → require dist (warn if missing).
    - default auto → only if dist is present.
    """
    if "pytest" in sys.modules:
        return False
    mode = (settings.serve_frontend or "auto").strip().lower()
    if mode in {"0", "false", "no", "off"}:
        return False
    ready = _frontend_dist_ready()
    if mode in {"1", "true", "yes", "on"}:
        if not ready:
            logger.warning(
                "SERVE_FRONTEND=true but %s is missing — run: cd frontend && npm run build",
                FRONTEND_DIST,
            )
        return ready
    return ready


def _refuse_insecure_production() -> None:
    errors = settings.production_config_errors()
    if not errors:
        return
    for err in errors:
        logger.error("Insecure production config: %s", err)
    raise RuntimeError(
        f"APP_ENV={settings.app_env} refuses to start with insecure settings: "
        + " | ".join(errors)
    )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    paths = setup_logging(settings)
    if paths:
        logger.info("File logs in %s", paths["app"].parent)
    _refuse_insecure_production()
    if settings.is_production_like and settings.dev_log_viewer:
        logger.warning(
            "DEV_LOG_VIEWER is set but ignored because APP_ENV is production-like. Read logs via SSH."
        )
    elif dev_log_viewer_enabled(settings):
        logger.info("Dev log viewer enabled (token required) at /dev-logs/")
    if _should_serve_frontend():
        logger.info("Serving frontend from %s", FRONTEND_DIST)
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url=None if settings.is_production_like else "/docs",
    redoc_url=None if settings.is_production_like else "/redoc",
    openapi_url=None if settings.is_production_like else "/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(OriginCheckMiddleware, settings=settings)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", REQUEST_ID_HEADER, "X-Dev-Log-Token"],
    expose_headers=[REQUEST_ID_HEADER, "Content-Disposition"],
)
app.add_middleware(SecurityHeadersMiddleware, settings=settings)
# Added last → outermost: every response (incl. CORS preflight) gets X-Request-ID.
app.add_middleware(RequestContextMiddleware)

app.include_router(api_router, prefix=settings.api_prefix)

_SERVE_FRONTEND = _should_serve_frontend()

if not _SERVE_FRONTEND:

    @app.get("/")
    def root() -> dict[str, str]:
        payload: dict[str, str] = {
            "name": settings.app_name,
            "health": f"{settings.api_prefix}/health",
        }
        if not settings.is_production_like:
            payload["env"] = settings.app_env
            payload["docs"] = "/docs"
        return payload

else:
    # After API routes so /api/v1/* stays on the router; MPA HTML/assets on /.
    app.mount(
        "/",
        StaticFiles(directory=str(FRONTEND_DIST), html=True),
        name="frontend",
    )
