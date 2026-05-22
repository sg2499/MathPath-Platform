import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./mathpath.db")
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
# Production/demo deployments must not create demo students, demo teachers,
# demo assignments, or demo attempts automatically on every redeploy.
# Enable only for intentional local curriculum seeding.
SEED_ON_STARTUP = os.getenv("SEED_ON_STARTUP", "false").lower() == "true"

# SMTP / email delivery configuration for parent progress reports.
# Supports both MathPath SMTP_* variables and common EMAIL_* aliases used by deployment dashboards.
def _env_first(*Names: str, Default: str = "") -> str:
    for Name in Names:
        Value = os.getenv(Name)
        if Value is not None and str(Value).strip():
            return str(Value).strip()
    return Default

def _env_bool(*Names: str, Default: str = "false") -> bool:
    Value = _env_first(*Names, Default=Default).lower()
    return Value in {"1", "true", "yes", "on"}

SMTP_HOST = _env_first("SMTP_HOST", "EMAIL_HOST")
SMTP_PORT = int(_env_first("SMTP_PORT", "EMAIL_PORT", Default="587") or "587")
SMTP_USERNAME = _env_first("SMTP_USERNAME", "EMAIL_USERNAME", "EMAIL_HOST_USER")
SMTP_PASSWORD = _env_first("SMTP_PASSWORD", "EMAIL_PASSWORD", "EMAIL_HOST_PASSWORD").replace(" ", "")
SMTP_FROM_EMAIL = _env_first("SMTP_FROM_EMAIL", "EMAIL_FROM_EMAIL", "DEFAULT_FROM_EMAIL", Default=SMTP_USERNAME)
SMTP_FROM_NAME = _env_first("SMTP_FROM_NAME", "EMAIL_FROM_NAME", Default="MathPath Team")
SMTP_USE_TLS = _env_bool("SMTP_USE_TLS", "EMAIL_USE_TLS", Default="true")
SMTP_USE_SSL = _env_bool("SMTP_USE_SSL", "EMAIL_USE_SSL", Default="false")
SMTP_TIMEOUT_SECONDS = int(_env_first("SMTP_TIMEOUT_SECONDS", "EMAIL_TIMEOUT_SECONDS", Default="60") or "60")
# Render/Gmail can occasionally resolve smtp.gmail.com to IPv6 first on instances without IPv6 egress.
# Force IPv4 by default for production SMTP reliability.
SMTP_FORCE_IPV4 = _env_bool("SMTP_FORCE_IPV4", "EMAIL_FORCE_IPV4", Default="true")

# Optional production email API provider fallback.
# Use this when hosting provider SMTP egress is unreliable.
EMAIL_PROVIDER = _env_first("EMAIL_PROVIDER", "MAIL_PROVIDER", Default="SMTP").upper()
RESEND_API_KEY = _env_first("RESEND_API_KEY")
RESEND_FROM_EMAIL = _env_first("RESEND_FROM_EMAIL", Default=SMTP_FROM_EMAIL)
BREVO_API_KEY = _env_first("BREVO_API_KEY", "SENDINBLUE_API_KEY")
BREVO_FROM_EMAIL = _env_first("BREVO_FROM_EMAIL", Default=SMTP_FROM_EMAIL)

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
