[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$WorktreePath,
    [Parameter(Mandatory)][ValidateSet('docs','automation','backend','backend-mm','frontend','full')][string]$Profile,
    [string]$PrimaryRepoPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Checked {
    param([string]$Name, [string]$WorkingDirectory, [scriptblock]$Command)
    Write-Host "`n=== $Name ===" -ForegroundColor Cyan
    Push-Location $WorkingDirectory
    try {
        & $Command
        if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE" }
    }
    finally { Pop-Location }
}

function Resolve-ValidationPython {
    param([string]$RepoPath)
    $candidates = @()
    if ($RepoPath) {
        $candidates += @(
            (Join-Path $RepoPath 'backend\.venv\Scripts\python.exe'),
            (Join-Path $RepoPath '.venv\Scripts\python.exe'),
            (Join-Path $RepoPath 'venv\Scripts\python.exe')
        )
    }
    $existing = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($existing) { return $existing }

    $launcher = Get-Command python -ErrorAction SilentlyContinue
    if (-not $launcher) { $launcher = Get-Command py -ErrorAction SilentlyContinue }
    if (-not $launcher) { throw 'Python is required but was not found.' }

    $stateRoot = Join-Path $env:LOCALAPPDATA 'MathPathDelivery'
    $venvRoot = Join-Path $stateRoot 'python-venv'
    $venvPython = Join-Path $venvRoot 'Scripts\python.exe'
    if (-not (Test-Path $venvPython)) {
        New-Item -ItemType Directory -Force -Path $stateRoot | Out-Null
        & $launcher.Source -m venv $venvRoot
        if ($LASTEXITCODE -ne 0) { throw 'Unable to create the MathPath validation virtual environment.' }
    }
    return $venvPython
}

Invoke-Checked 'Git whitespace validation' $WorktreePath { git diff --check }

$runBackend = $Profile -in @('backend','backend-mm','full')
$runFrontend = $Profile -in @('frontend','full')

if ($runBackend) {
    $python = Resolve-ValidationPython -RepoPath $PrimaryRepoPath
    $backend = Join-Path $WorktreePath 'backend'
    Invoke-Checked 'Backend dependency synchronization' $backend { & $python -m pip install --disable-pip-version-check -r requirements.txt }
    $env:DATABASE_URL = 'sqlite:///./mathpath_delivery_test.db'
    $env:SEED_ON_STARTUP = 'false'
    Invoke-Checked 'Backend pytest suite' $backend { & $python -m pytest tests -q }

    if ($Profile -eq 'backend-mm') {
        $focused = @(
            'tests/test_generator.py',
            'tests/test_mm_competition_mock_generator.py',
            'tests/test_mm_visual_curriculum_mapping.py'
        ) | Where-Object { Test-Path (Join-Path $backend $_) }
        if ($focused.Count -gt 0) {
            Invoke-Checked 'Focused MM generator validation' $backend { & $python -m pytest @focused -q }
        }
    }
}

if ($runFrontend) {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm is required but was not found.' }
    $frontend = Join-Path $WorktreePath 'frontend'
    Invoke-Checked 'Frontend clean dependency install' $frontend { npm ci --no-audit --no-fund }
    Invoke-Checked 'Frontend typecheck' $frontend { npm run typecheck }
    Invoke-Checked 'Frontend production build' $frontend { npm run build }
}

Write-Host "`nValidation profile '$Profile' passed." -ForegroundColor Green
