import os
from fastapi import APIRouter

router = APIRouter(tags=["health"])


def BuildHealthPayload():
    Environment = os.getenv("ENVIRONMENT", "development")
    return {
        "status": "ok",
        "service": "MathPath Backend",
        "version": "1.0.0",
        "environment": Environment,
    }


@router.get("/", summary="Backend root status")
def RootStatus():
    return BuildHealthPayload()


@router.get("/health", summary="Backend health status")
def HealthStatus():
    return BuildHealthPayload()


@router.get("/api/health", summary="Backend API health status")
def ApiHealthStatus():
    return BuildHealthPayload()
