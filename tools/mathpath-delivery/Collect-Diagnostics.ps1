[CmdletBinding()]
param([string]$OutputDirectory)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$stateRoot = Join-Path $env:LOCALAPPDATA 'MathPathDelivery'
$configPath = Join-Path $stateRoot 'config.json'
if (-not (Test-Path $configPath)) { throw 'MathPath Delivery Console configuration was not found.' }
$config = Get-Content $configPath -Raw | ConvertFrom-Json
$repo = [System.IO.Path]::GetFullPath($config.repo_path)
if (-not (Test-Path (Join-Path $repo '.git'))) { throw 'Configured MathPath repository was not found.' }
$gh = if ($config.gh_path -and (Test-Path $config.gh_path)) { $config.gh_path } else { (Get-Command gh -ErrorAction Stop).Source }

if (-not $OutputDirectory) { $OutputDirectory = [Environment]::GetFolderPath('Desktop') }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$work = Join-Path $env:TEMP "MathPath-Diagnostics-$stamp"
$zip = Join-Path $OutputDirectory "MathPath-Diagnostics-$stamp.zip"
New-Item -ItemType Directory -Force $work | Out-Null

function Save-CommandOutput {
    param([string]$Name, [scriptblock]$Command)
    try { (& $Command 2>&1 | Out-String) | Set-Content -Encoding UTF8 (Join-Path $work $Name) }
    catch { "ERROR: $($_.Exception.Message)" | Set-Content -Encoding UTF8 (Join-Path $work $Name) }
}

$redactedConfig = [ordered]@{
    schema_version = $config.schema_version
    repository = $config.repository
    base_branch = $config.base_branch
    frontend_url = $config.frontend_url
    backend_health_url = $config.backend_health_url
    deployment_timeout_minutes = $config.deployment_timeout_minutes
    repo_path_present = (Test-Path $repo)
    gh_path_present = (Test-Path $gh)
}
$redactedConfig | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $work 'config-redacted.json')

Save-CommandOutput 'git-status.txt' { git -C $repo status --short --branch }
Save-CommandOutput 'git-latest-commit.txt' { git -C $repo log -1 --oneline --decorate }
Save-CommandOutput 'git-worktrees.txt' { git -C $repo worktree list --porcelain }
Save-CommandOutput 'tool-versions.txt' {
    "PowerShell: $($PSVersionTable.PSVersion)"
    git --version
    node --version
    npm --version
    python --version
    & $gh --version
}
Save-CommandOutput 'github-auth-redacted.txt' { & $gh auth status --hostname github.com }
Save-CommandOutput 'github-rulesets.json' { & $gh api "repos/$($config.repository)/rulesets?includes_parents=false" }
Save-CommandOutput 'github-recent-runs.json' { & $gh run list --repo $config.repository --limit 10 --json databaseId,name,headSha,status,conclusion,createdAt,url }

$runsRoot = Join-Path $stateRoot 'runs'
if (Test-Path $runsRoot) {
    Get-ChildItem $runsRoot -Filter state.json -Recurse | Sort-Object LastWriteTime -Descending | Select-Object -First 20 | ForEach-Object {
        try {
            $state = Get-Content $_.FullName -Raw | ConvertFrom-Json
            [pscustomobject]@{
                run_id = $state.run_id
                status = $state.status
                base_sha = $state.base_sha
                branch = $state.branch
                pr_number = $state.pr_number
                merge_sha = $state.merge_sha
                started_at = $state.started_at
                updated_at = $state.updated_at
            }
        } catch {}
    } | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $work 'delivery-runs-redacted.json')
}

@'
This diagnostic bundle is intentionally redacted.
It does not include GitHub tokens, passwords, environment files, database exports, student records, or raw application data.
'@ | Set-Content -Encoding UTF8 (Join-Path $work 'README.txt')

Compress-Archive -Path (Join-Path $work '*') -DestinationPath $zip -Force
Remove-Item $work -Recurse -Force
Write-Host "Redacted diagnostics created: $zip" -ForegroundColor Green
