from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from app.database import Base, engine, SessionLocal
from app.core.config import SEED_ON_STARTUP
from app.models import *  # noqa
from app.api.routes_health import router as health_router
from app.api.routes_auth import router as auth_router
from app.api.routes_admin import router as admin_router
from app.api.routes_student import router as student_router
from app.api.routes_teacher import router as teacher_router
from app.api.routes_notifications import router as notifications_router
import os
import sentry_sdk
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.rate_limit import limiter

SENTRY_DSN = os.getenv("SENTRY_DSN")
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
    )

app = FastAPI(title="MathPath Backend v1", version="1.0.0")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

UPLOAD_ROOT = Path("uploads")
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_ROOT)), name="uploads")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # X-New-Access-Token carries the sliding-session refresh (see
    # get_current_user() in dependencies.py) -- without explicitly exposing
    # it here, the browser's CORS policy hides ALL custom response headers
    # from frontend JS by default, so the refreshed token would be sent by
    # the server but invisible to axios and silently do nothing.
    expose_headers=["X-New-Access-Token"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Let FastAPI's HTTPException handler handle normal HTTP errors.
    from fastapi import HTTPException
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})
    return JSONResponse(status_code=500, content={"error": {"code": "INTERNAL_SERVER_ERROR", "message": str(exc), "details": {}}})

@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    from app.services.schema_migration import ensure_student_profile_columns, ensure_teacher_columns, ensure_student_teacher_id_column, ensure_user_columns, ensure_dps_publication_columns, ensure_assessment_reattempt_columns, ensure_student_level_promotions_table, ensure_assignment_attempt_chain_columns, ensure_parent_report_email_logs_table, ensure_assessment_readiness_testing_overrides_table, ensure_notifications_table, ensure_competition_mock_tables, ensure_mock_notifications_fixed, ensure_mock_gamification_tables, ensure_mock_accuracy_fixed, ensure_user_economy_columns, ensure_competition_mock_attempt_gamification_column, ensure_attempt_notification_processed_column, ensure_assessment_attempt_notification_processed_column
    ensure_user_columns()
    ensure_student_profile_columns()
    ensure_teacher_columns()
    ensure_student_teacher_id_column()
    ensure_user_economy_columns()
    ensure_competition_mock_attempt_gamification_column()
    ensure_attempt_notification_processed_column()
    ensure_assessment_attempt_notification_processed_column()
    # NOTE (2026-07-11): ensure_mock_student_notifications_retroactive() and
    # recalculate_all_gamification_stats() used to run here, unconditionally,
    # on every single backend restart. They existed because mock-completion
    # side-effects (notifications, XP/coins, badges) weren't reliably firing
    # at submission time -- two other code paths in
    # competition_mock_attempt_service.py could grade an attempt without ever
    # running those hooks, so this pair of jobs tried to paper over it by
    # retroactively creating a (differently-worded, student-only, no
    # teacher/admin) notification, and by doing a full destructive wipe of
    # every student's badge/stat tables and recomputing them from scratch on
    # every deploy. That's expensive, it never covered XP/coins at all, and
    # it silently masked the real bug instead of fixing it -- and a wipe-and-
    # rebuild of every student's badges on every deploy is itself a risk if
    # evaluate_mock_exam_submission() ever regresses.
    #
    # The real fix: side-effects now run exactly once, atomically, from
    # inside SubmitCompetitionMockAttempt() itself, guarded by
    # gamification_processed_at, regardless of which path completes the
    # attempt. Historical attempts from before this fix are caught up by a
    # deliberate one-time run of backend/scripts/backfill_mock_gamification.py
    # instead of an automatic full-platform recompute on every restart.
    ensure_dps_publication_columns()
    ensure_assessment_reattempt_columns()
    ensure_student_level_promotions_table()
    ensure_assignment_attempt_chain_columns()
    ensure_parent_report_email_logs_table()
    ensure_assessment_readiness_testing_overrides_table()
    ensure_notifications_table()
    ensure_competition_mock_tables()
    ensure_mock_notifications_fixed()
    ensure_mock_gamification_tables()
    ensure_mock_accuracy_fixed()

    # Seed gamification badges safely
    from app.services.achievements import AchievementEngine
    db = SessionLocal()
    try:
        AchievementEngine.seed_badges(db)
    finally:
        db.close()
    if SEED_ON_STARTUP:
        from app.seed.seed_ylm_phase1 import seed as seed_ylm_phase1
        from app.seed.seed_ylm_l2_test import seed as seed_ylm_l2_test
        db = SessionLocal()
        try:
            seed_ylm_phase1(db)
            seed_ylm_l2_test(db)
        finally:
            db.close()



    # Always run the Master Module curriculum sync independently from demo/legacy seed flags.
    # This is idempotent: it only creates or completes MM -> MM-L1 -> Lessons 1-30 -> DPS 1-5.
    # It does not create students, teachers, assignments, attempts, or demo records.
    from app.seed.seed_master_module import seed as seed_master_module
    db = SessionLocal()
    try:
        seed_master_module(db)
    finally:
        db.close()

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(student_router)
app.include_router(teacher_router)
app.include_router(notifications_router)
