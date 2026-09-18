import os
from fastapi import APIRouter

from app.core.deploy_info import GetDeployedCommitInfo, GetUptimeSeconds, PROCESS_STARTED_AT

router = APIRouter(tags=["health"])


def BuildHealthPayload():
    Environment = os.getenv("ENVIRONMENT", "development")
    CommitInfo = GetDeployedCommitInfo()
    return {
        "status": "ok",
        "service": "MathPath Backend",
        "version": "1.0.0",
        "environment": Environment,
        # 2026-09-18: exactly what's actually running, so "is this fix
        # actually live" is a request to this endpoint instead of an SSH
        # session -- see app/core/deploy_info.py's module docstring for why
        # this exists.
        "deployedCommit": CommitInfo["commit"],
        "deployedCommitFull": CommitInfo["commitFull"],
        "deployedCommitSubject": CommitInfo["commitSubject"],
        "deployedCommitTime": CommitInfo["commitTime"],
        "processStartedAt": PROCESS_STARTED_AT.isoformat(),
        "uptimeSeconds": round(GetUptimeSeconds(), 1),
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
