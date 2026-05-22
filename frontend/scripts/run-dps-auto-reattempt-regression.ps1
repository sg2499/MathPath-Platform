$ErrorActionPreference = "Stop"

$Mode = if ($env:MATHPATH_AUTO_REATTEMPT_E2E_MODE) { $env:MATHPATH_AUTO_REATTEMPT_E2E_MODE } else { "simulation" }
$env:MATHPATH_AUTO_REATTEMPT_E2E_MODE = $Mode

Write-Host "MathPath Phase 10.9.4 DPS Auto Re-Attempt Workflow Regression" -ForegroundColor Cyan
Write-Host "Mode: $Mode"
Write-Host ""

node .\scripts\run-dps-auto-reattempt-regression.mjs @args
