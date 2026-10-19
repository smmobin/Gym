from fastapi import APIRouter

from app.api.v1 import (
    attendances,
    auth,
    billing,
    expenses,
    group_classes,
    guests,
    health,
    lockers,
    members,
    trainers,
    trial_leads,
    workout_plans,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router)
api_router.include_router(members.router)
api_router.include_router(attendances.router)
api_router.include_router(billing.router)
api_router.include_router(expenses.router)
api_router.include_router(trial_leads.router)
api_router.include_router(guests.router)
api_router.include_router(group_classes.router)
api_router.include_router(lockers.router)
api_router.include_router(trainers.router)
api_router.include_router(workout_plans.router)
