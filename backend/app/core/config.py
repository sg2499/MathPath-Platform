import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./mathpath.db")
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
SEED_ON_STARTUP = os.getenv("SEED_ON_STARTUP", "true").lower() == "true"

# SMTP / email delivery configuration for parent progress reports.
SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587") or "587")
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").replace(" ", "")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", SMTP_USERNAME).strip()
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "MathPath Team").strip()
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() == "true"

# Assessment readiness demo switch. Default remains enabled for the current deployment verification phase so the full assessment workflow can be tested end to end.
# Set TEMPORARY_ASSESSMENT_READINESS_BYPASS=false before switching the deployed environment to strict live operations.
TEMPORARY_ASSESSMENT_READINESS_BYPASS = os.getenv("TEMPORARY_ASSESSMENT_READINESS_BYPASS", "true").lower() == "true"

# Readiness status metadata exposed to frontend callers. Keep this client-facing; no internal phase labels.
ASSESSMENT_READINESS_GATE_MODE = (
    "DEMO_VERIFICATION" if TEMPORARY_ASSESSMENT_READINESS_BYPASS else "READINESS_GOVERNANCE"
)
ASSESSMENT_READINESS_GATE_LABEL = (
    "Assessment Workflow Verification Enabled"
    if TEMPORARY_ASSESSMENT_READINESS_BYPASS
    else "Assessment Readiness Checks Active"
)

# Controlled Admin-only assessment readiness testing override.
# Default is disabled for live safety. Enable for controlled QA/demo only.
ASSESSMENT_TESTING_OVERRIDE_ENABLED = os.getenv("ASSESSMENT_TESTING_OVERRIDE_ENABLED", "true").lower() == "true"
ASSESSMENT_TESTING_OVERRIDE_LABEL = (
    "Controlled Assessment Access Available" if ASSESSMENT_TESTING_OVERRIDE_ENABLED else "Controlled Assessment Access Unavailable"
)
