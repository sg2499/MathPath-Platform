[CmdletBinding()]
param(
    [string]$RepoPath,
    [string]$ConsoleRoot,
    [switch]$CreateDesktopShortcut
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Native {
    param([Parameter(Mandatory)][string]$FilePath, [Parameter(ValueFromRemainingArguments)][string[]]$Arguments)
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$FilePath failed with exit code $LASTEXITCODE" }
}


function Resolve-GitHubCli {
    $command = Get-Command gh -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $candidates = @()
    if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles 'GitHub CLI\gh.exe') }
    if (${env:ProgramFiles(x86)}) { $candidates += (Join-Path ${env:ProgramFiles(x86)} 'GitHub CLI\gh.exe') }
    if ($env:LOCALAPPDATA) {
        $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\GitHub CLI\gh.exe')
        $candidates += (Join-Path $env:LOCALAPPDATA 'MathPathDelivery\bin\gh.exe')
    }
    $match = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
    if ($match) {
        $directory = Split-Path $match -Parent
        if (($env:Path -split ';') -notcontains $directory) { $env:Path = "$directory;$env:Path" }
        return $match
    }
    return $null
}

function Get-GitHubAuthState {
    param([Parameter(Mandatory)][string]$GhPath)
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = @(& $GhPath auth status --hostname github.com 2>&1 | ForEach-Object { $_.ToString() })
        $exitCode = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $previousPreference }
    return [pscustomobject]@{ Authenticated = ($exitCode -eq 0); Output = ($output -join "`n") }
}

function Ensure-GitHubAuthentication {
    param([Parameter(Mandatory)][string]$GhPath)
    $state = Get-GitHubAuthState -GhPath $GhPath
    if (-not $state.Authenticated) {
        Write-Host 'A one-time GitHub browser authorization is required.' -ForegroundColor Yellow
        Invoke-Native $GhPath auth login --hostname github.com --web --git-protocol https --scopes 'repo,workflow'
        $state = Get-GitHubAuthState -GhPath $GhPath
        if (-not $state.Authenticated) { throw 'GitHub authorization did not complete successfully.' }
    }
    elseif ($state.Output -notmatch '(?i)\bworkflow\b') {
        Write-Host 'GitHub authorization needs the workflow scope. A browser approval may open.' -ForegroundColor Yellow
        Invoke-Native $GhPath auth refresh --hostname github.com --scopes workflow
    }
    Invoke-Native $GhPath auth setup-git
}


function Resolve-MathPathRepo {
    param([string]$Candidate)
    $known = @(
        $Candidate,
        (Get-Location).Path,
        'C:\Users\shail\OneDrive\Shailesh\Work\Math Path\Platform\MathPath_Platform_Live'
    ) | Where-Object { $_ }
    foreach ($item in $known) {
        $resolved = [System.IO.Path]::GetFullPath($item)
        if (Test-Path (Join-Path $resolved '.git')) { return $resolved }
    }
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = 'Select the MathPath repository folder'
    if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { throw 'Repository selection cancelled.' }
    if (-not (Test-Path (Join-Path $dialog.SelectedPath '.git'))) { throw 'Selected folder is not a Git repository.' }
    return $dialog.SelectedPath
}

$RepoPath = Resolve-MathPathRepo $RepoPath
if (-not $ConsoleRoot) { $ConsoleRoot = $PSScriptRoot }
$ConsoleRoot = [System.IO.Path]::GetFullPath($ConsoleRoot)
if (-not (Test-Path (Join-Path $ConsoleRoot 'MathPathDelivery.bat'))) {
    throw "MathPath Delivery Console files were not found at: $ConsoleRoot"
}
$origin = (& git -C $RepoPath remote get-url origin).Trim()
if ($LASTEXITCODE -ne 0 -or $origin -notmatch 'sg2499/MathPath-Platform(?:\.git)?$') {
    throw "Unexpected origin remote: $origin"
}

$stateRoot = Join-Path $env:LOCALAPPDATA 'MathPathDelivery'
New-Item -ItemType Directory -Force $stateRoot | Out-Null
New-Item -ItemType Directory -Force (Join-Path $stateRoot 'runs') | Out-Null
New-Item -ItemType Directory -Force (Join-Path $stateRoot 'worktrees') | Out-Null

$ghExecutable = Resolve-GitHubCli
if (-not $ghExecutable) { throw 'GitHub CLI could not be found. Rerun the v1.3 installer to repair the console.' }
Ensure-GitHubAuthentication -GhPath $ghExecutable

$config = [ordered]@{
    schema_version = 1
    repo_path = $RepoPath
    repository = 'sg2499/MathPath-Platform'
    base_branch = 'main'
    console_root = $ConsoleRoot
    gh_path = $ghExecutable
    frontend_url = 'https://math-path-platform.vercel.app/'
    backend_health_url = 'https://mathpath-backend.onrender.com/api/health'
    deployment_timeout_minutes = 15
}
$configPath = Join-Path $stateRoot 'config.json'
$config | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $configPath

& (Join-Path $PSScriptRoot 'Install-GitGuards.ps1') -RepoPath $RepoPath

if ($CreateDesktopShortcut) {
    $desktop = [Environment]::GetFolderPath('Desktop')
    $shortcutPath = Join-Path $desktop 'MathPath Delivery Console.lnk'
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = Join-Path $ConsoleRoot 'MathPathDelivery.bat'
    $shortcut.WorkingDirectory = $ConsoleRoot
    $shortcut.Description = 'Ship validated MathPath change packages'
    $shortcut.Save()
    Write-Host "Desktop shortcut created: $shortcutPath" -ForegroundColor Green
}

Write-Host ''
Write-Host 'MathPath Local Delivery Console configured.' -ForegroundColor Green
Write-Host "Repository: $RepoPath"
Write-Host "Console files: $ConsoleRoot"
Write-Host "Configuration: $configPath"
Write-Host 'Direct pushes to main are blocked by the local Git guard.'
