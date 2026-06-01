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

app = FastAPI(title="MathPath Backend v1", version="1.0.0")

UPLOAD_ROOT = Path("uploads")
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_ROOT)), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    from app.services.schema_migration import ensure_student_profile_columns, ensure_teacher_columns, ensure_student_teacher_id_column, ensure_user_columns, ensure_dps_publication_columns, ensure_assessment_reattempt_columns, ensure_student_level_promotions_table, ensure_assignment_attempt_chain_columns, ensure_parent_report_email_logs_table, ensure_assessment_readiness_testing_overrides_table, ensure_notifications_table
    ensure_user_columns()
    ensure_student_profile_columns()
    ensure_teacher_columns()
    ensure_student_teacher_id_column()
    ensure_dps_publication_columns()
    ensure_assessment_reattempt_columns()
    ensure_student_level_promotions_table()
    ensure_assignment_attempt_chain_columns()
    ensure_parent_report_email_logs_table()
    ensure_assessment_readiness_testing_overrides_table()
    ensure_notifications_table()
    if SEED_ON_STARTUP:
        from app.seed.seed_ylm_phase1 import seed as seed_ylm_phase1
        from app.seed.seed_ylm_l2_test import seed as seed_ylm_l2_test
        from app.seed.seed_master_module import seed as seed_master_module
        db = SessionLocal()
        try:
            seed_ylm_phase1(db)
            seed_ylm_l2_test(db)
            seed_master_module(db)
        finally:
            db.close()

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(student_router)
app.include_router(teacher_router)
app.include_router(notifications_router)
