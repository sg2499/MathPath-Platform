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

# Phase 8.8 final readiness gate switch. Default is live-safe strict readiness mode.
# Set true only for broad local testing where assessment workflow needs to be tested without completing all readiness criteria.
TEMPORARY_ASSESSMENT_READINESS_BYPASS = os.getenv("TEMPORARY_ASSESSMENT_READINESS_BYPASS", "false").lower() == "true"

# Phase 8.8 audit metadata. This does not change behavior; it makes the active gate mode explicit to backend/frontend callers.
ASSESSMENT_READINESS_GATE_MODE = (
    "TEMPORARY_BYPASS" if TEMPORARY_ASSESSMENT_READINESS_BYPASS else "STRICT_READINESS"
)
ASSESSMENT_READINESS_GATE_LABEL = (
    "Testing Bypass Active" if TEMPORARY_ASSESSMENT_READINESS_BYPASS else "Strict Readiness Gate Active"
)

# Controlled Admin-only assessment readiness testing override.
# Default is disabled for live safety. Enable for controlled QA/demo only.
ASSESSMENT_TESTING_OVERRIDE_ENABLED = os.getenv("ASSESSMENT_TESTING_OVERRIDE_ENABLED", "false").lower() == "true"
ASSESSMENT_TESTING_OVERRIDE_LABEL = (
    "Admin Testing Override Available" if ASSESSMENT_TESTING_OVERRIDE_ENABLED else "Admin Testing Override Disabled"
)
