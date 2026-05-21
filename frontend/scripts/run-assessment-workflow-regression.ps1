param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ExtraArgs
)

$ErrorActionPreference = "Stop"
Write-Host "MathPath Phase 10.7.1 assessment workflow regression" -ForegroundColor Cyan
node scripts/run-assessment-workflow-regression.mjs @ExtraArgs
