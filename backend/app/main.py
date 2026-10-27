import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger("gym.startup")


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

from fastapi.staticfiles import StaticFiles
from pathlib import Path

# قرار دادن این کد در انتهای فایل main.py بعد از تمام routerها
frontend_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")