import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router
from app.core.config import get_settings

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


def _warn_insecure_production() -> None:
    if not settings.is_production_like:
        return
    if settings.secret_key_is_weak:
        logger.warning(
            "APP_ENV=%s but SECRET_KEY is weak/default — set a long random SECRET_KEY.",
            settings.app_env,
        )
    if not settings.cors_origin_list:
        logger.warning("CORS_ORIGINS is empty in production-like env.")
    if any("localhost" in o or "127.0.0.1" in o for o in settings.cors_origin_list):
        logger.warning(
            "CORS_ORIGINS still lists localhost — use your real HTTPS domain in production."
        )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _warn_insecure_production()
    if _should_serve_frontend():
        logger.info("Serving frontend from %s", FRONTEND_DIST)
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url=None if settings.is_production_like else "/docs",
    redoc_url=None if settings.is_production_like else "/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_prefix)

_SERVE_FRONTEND = _should_serve_frontend()

if not _SERVE_FRONTEND:

    @app.get("/")
    def root() -> dict[str, str]:
        payload: dict[str, str] = {
            "name": settings.app_name,
            "health": f"{settings.api_prefix}/health",
            "env": settings.app_env,
        }
        if not settings.is_production_like:
            payload["docs"] = "/docs"
        return payload

else:
    # After API routes so /api/v1/* stays on the router; MPA HTML/assets on /.
    app.mount(
        "/",
        StaticFiles(directory=str(FRONTEND_DIST), html=True),
        name="frontend",
    )
