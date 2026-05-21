$ErrorActionPreference = "Stop"
Write-Host "MathPath Phase 10.7.4 final production readiness regression" -ForegroundColor Cyan
node scripts/run-production-readiness-regression.mjs @args
