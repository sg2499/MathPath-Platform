[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$RunId,
    [switch]$PrepareOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Native {
    param([string]$FilePath, [Parameter(ValueFromRemainingArguments)][string[]]$Arguments)
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$FilePath failed with exit code $LASTEXITCODE" }
}


function Resolve-GitHubCliFromConfig {
    param($Config)
    if ($Config.PSObject.Properties.Name -contains 'gh_path' -and $Config.gh_path -and (Test-Path $Config.gh_path)) {
        return [System.IO.Path]::GetFullPath($Config.gh_path)
    }
    $command = Get-Command gh -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $candidate = Join-Path $env:LOCALAPPDATA 'MathPathDelivery\bin\gh.exe'
    if (Test-Path $candidate) { return $candidate }
    throw 'GitHub CLI could not be found. Run Setup/Repair from MathPath Delivery Console.'
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
        Write-Host 'GitHub authorization is required. A browser window will open.' -ForegroundColor Yellow
        Invoke-Native $GhPath auth login --hostname github.com --web --git-protocol https --scopes 'repo,workflow'
        $state = Get-GitHubAuthState -GhPath $GhPath
        if (-not $state.Authenticated) { throw 'GitHub authorization did not complete successfully.' }
        Invoke-Native $GhPath auth setup-git
    }
}

function Save-State($State, [string]$Path) {
    $State.updated_at = (Get-Date).ToString('o')
    $State | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 -Path $Path
}
function Wait-PrChecks([int]$PrNumber, [string]$Repository) {
    for ($attempt = 1; $attempt -le 6; $attempt++) {
        Start-Sleep -Seconds 10
        & $script:GhExecutable pr checks $PrNumber --repo $Repository --watch --fail-fast
        if ($LASTEXITCODE -eq 0) { return }
        if ($attempt -eq 6) { throw 'Rollback checks did not complete successfully.' }
    }
}
function Wait-MainCi([string]$Sha, [string]$Repository) {
    for ($attempt = 1; $attempt -le 18; $attempt++) {
        Start-Sleep -Seconds 10
        $runs = & $script:GhExecutable run list --repo $Repository --workflow 'MathPath CI' --commit $Sha --limit 1 --json databaseId,status,conclusion | ConvertFrom-Json
        if ($runs.Count -gt 0) {
            Invoke-Native $script:GhExecutable run watch $runs[0].databaseId --repo $Repository --exit-status
            return
        }
    }
    throw 'No MathPath CI run appeared for the rollback merge commit.'
}

$root = Join-Path $env:LOCALAPPDATA 'MathPathDelivery'
$config = Get-Content (Join-Path $root 'config.json') -Raw | ConvertFrom-Json
$script:GhExecutable = Resolve-GitHubCliFromConfig -Config $config
Ensure-GitHubAuthentication -GhPath $script:GhExecutable
$statePath = Join-Path (Join-Path (Join-Path $root 'runs') $RunId) 'state.json'
if (-not (Test-Path $statePath)) { throw "Run not found: $RunId" }
$state = Get-Content $statePath -Raw | ConvertFrom-Json
if (-not $state.merge_sha) { throw 'The selected run has no merge commit to revert.' }

$repo = [System.IO.Path]::GetFullPath($config.repo_path)
Invoke-Native git -C $repo fetch origin main --prune

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$branch = "rollback/$RunId-$stamp"
$worktree = Join-Path (Join-Path $root 'worktrees') ("rollback-$RunId-$stamp")
Invoke-Native git -C $repo worktree add -b $branch $worktree origin/main
Invoke-Native git -C $worktree revert --no-edit $state.merge_sha
& (Join-Path $PSScriptRoot 'Test-MathPathChange.ps1') -WorktreePath $worktree -Profile full -PrimaryRepoPath $repo
Invoke-Native git -C $worktree push -u origin $branch

$body = Join-Path (Split-Path $statePath -Parent) 'rollback-pr.md'
@"
## Emergency rollback
Reverts MathPath delivery run $RunId and merge $($state.merge_sha).

Full local regression validation passed before this rollback PR was opened.
"@ | Set-Content -Encoding UTF8 -Path $body
Invoke-Native $script:GhExecutable pr create --repo $config.repository --base main --head $branch --title "Rollback: $RunId" --body-file $body
$pr = & $script:GhExecutable pr view $branch --repo $config.repository --json number,url | ConvertFrom-Json
$state.rollback_pr_number = $pr.number
$state.rollback_pr_url = $pr.url
$state.status = 'ROLLBACK_PR_OPEN'
Save-State $state $statePath
Write-Host "Rollback PR prepared: $($pr.url)" -ForegroundColor Yellow

if (-not $PrepareOnly) {
    Wait-PrChecks -PrNumber $pr.number -Repository $config.repository
    $answer = Read-Host 'Rollback checks passed. Type ROLLBACK to merge'
    if ($answer -eq 'ROLLBACK') {
        $headSha = (& git -C $worktree rev-parse HEAD).Trim()
        Invoke-Native $script:GhExecutable pr merge $pr.number --repo $config.repository --squash --delete-branch --match-head-commit $headSha --subject "Rollback: $RunId"
        $merged = & $script:GhExecutable pr view $pr.number --repo $config.repository --json state,mergeCommit | ConvertFrom-Json
        if ($merged.state -ne 'MERGED') { throw 'Rollback pull request was not merged.' }
        $state.rollback_merge_sha = $merged.mergeCommit.oid
        $state.status = 'ROLLBACK_MERGED'
        Save-State $state $statePath
        Wait-MainCi -Sha $state.rollback_merge_sha -Repository $config.repository

        Invoke-Native git -C $repo fetch origin main --prune
        Start-Sleep -Seconds 60
        $front = Invoke-WebRequest -Uri $config.frontend_url -UseBasicParsing -TimeoutSec 30
        $back = Invoke-RestMethod -Uri $config.backend_health_url -TimeoutSec 30
        if ($front.StatusCode -lt 200 -or $front.StatusCode -ge 400 -or $back.status -ne 'ok') {
            throw 'Rollback merged, but live availability verification failed. Inspect Vercel and Render immediately.'
        }
        $state.status = 'ROLLED_BACK'
        Save-State $state $statePath
        Write-Host 'Rollback merged and live availability verified.' -ForegroundColor Green
    }
}
