from fastapi import APIRouter

from app.api.v1 import attendances, auth, billing, group_classes, health, members

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router)
api_router.include_router(members.router)
api_router.include_router(attendances.router)
api_router.include_router(billing.router)
api_router.include_router(group_classes.router)
