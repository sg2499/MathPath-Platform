param(
  [ValidateSet("preview", "backup", "reset", "restore")]
  [string]$Action = "preview",

  [ValidateSet("transaction-data-only", "students-and-transaction-data", "full-demo-reset")]
  [string]$Mode = "transaction-data-only",

  [switch]$Execute,
  [string]$Confirm = "",
  [string]$BackupFile = ""
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendRoot = Resolve-Path (Join-Path $ScriptDir "..")
Push-Location $BackendRoot
try {
  $ArgsList = @("scripts/demo_data_safety.py", $Action, "--mode", $Mode)
  if ($Execute) { $ArgsList += "--execute" }
  if ($Confirm) { $ArgsList += @("--confirm", $Confirm) }
  if ($BackupFile) { $ArgsList += @("--backup-file", $BackupFile) }
  python @ArgsList
  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
