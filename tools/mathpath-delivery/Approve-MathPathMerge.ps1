[CmdletBinding()]
param(
    [string]$RunId,
    [switch]$AutoApprove
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
        if ($attempt -eq 6) { throw 'Pull-request checks did not complete successfully.' }
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
    throw 'No MathPath CI run appeared for the merged main commit.'
}


function Wait-ExternalDeploymentChecks([string]$Sha, [string]$Repository, [int]$TimeoutMinutes) {
    $ownChecks = @(
        'repository-safety',
        'delivery-console-lint',
        'backend-tests',
        'mathpath-generator-validation',
        'frontend-typecheck',
        'frontend-build'
    )
    $deadline = (Get-Date).AddMinutes($TimeoutMinutes)
    $evidenceSeen = $false
    $noEvidenceAttempts = 0
    while ((Get-Date) -lt $deadline) {
        $checkPayload = & $script:GhExecutable api "repos/$Repository/commits/$Sha/check-runs?per_page=100" | ConvertFrom-Json
        $externalChecks = @($checkPayload.check_runs | Where-Object { $_.name -notin $ownChecks })
        if ($externalChecks.Count -gt 0) {
            $evidenceSeen = $true
            $failed = @($externalChecks | Where-Object { $_.status -eq 'completed' -and $_.conclusion -notin @('success','neutral','skipped') })
            if ($failed.Count -gt 0) {
                throw "External deployment check failed: $($failed[0].name) ($($failed[0].conclusion))"
            }
            $pending = @($externalChecks | Where-Object { $_.status -ne 'completed' })
            if ($pending.Count -eq 0) { return $true }
        }

        $statusPayload = & $script:GhExecutable api "repos/$Repository/commits/$Sha/status" | ConvertFrom-Json
        $statuses = @($statusPayload.statuses)
        if ($statuses.Count -gt 0) {
            $evidenceSeen = $true
            if ($statusPayload.state -in @('failure','error')) { throw 'An external commit status reported deployment failure.' }
            if ($statusPayload.state -eq 'success') { return $true }
        }

        if (-not $evidenceSeen) {
            $noEvidenceAttempts++
            if ($noEvidenceAttempts -ge 6) { break }
            Start-Sleep -Seconds 10
        }
        else { Start-Sleep -Seconds 20 }
    }
    if ($evidenceSeen) { throw 'External deployment checks did not finish before the timeout.' }
    Write-Warning 'No external deployment check was published for this commit; continuing with direct live smoke verification.'
    return $false
}

$root = Join-Path $env:LOCALAPPDATA 'MathPathDelivery'
$configPath = Join-Path $root 'config.json'
if (-not (Test-Path $configPath)) { throw 'MathPath Delivery Console is not configured.' }
$config = Get-Content $configPath -Raw | ConvertFrom-Json
$script:GhExecutable = Resolve-GitHubCliFromConfig -Config $config
Ensure-GitHubAuthentication -GhPath $script:GhExecutable
$runsRoot = Join-Path $root 'runs'

if ($RunId) {
    $statePath = Join-Path (Join-Path $runsRoot $RunId) 'state.json'
}
else {
    $statePath = Get-ChildItem $runsRoot -Filter state.json -Recurse |
        Sort-Object LastWriteTime -Descending |
        Where-Object { (Get-Content $_.FullName -Raw | ConvertFrom-Json).status -eq 'PR_OPEN' } |
        Select-Object -First 1 -ExpandProperty FullName
}
if (-not $statePath -or -not (Test-Path $statePath)) { throw 'No open MathPath delivery run was found.' }
$state = Get-Content $statePath -Raw | ConvertFrom-Json
$manifest = Get-Content $state.manifest_path -Raw | ConvertFrom-Json
$repo = [System.IO.Path]::GetFullPath($config.repo_path)

Invoke-Native git -C $repo fetch origin main --prune
$currentMain = (& git -C $repo rev-parse origin/main).Trim()

if ($currentMain -ne $state.base_sha) {
    Write-Host 'Main advanced after package creation. Updating and revalidating the feature branch.' -ForegroundColor Yellow
    if (-not (Test-Path $state.worktree)) { throw 'The feature worktree required for revalidation is missing.' }
    Invoke-Native git -C $state.worktree fetch origin main
    Invoke-Native git -C $state.worktree merge --no-edit origin/main
    & (Join-Path $PSScriptRoot 'Test-MathPathChange.ps1') -WorktreePath $state.worktree -Profile $manifest.validation_profile -PrimaryRepoPath $repo
    Invoke-Native git -C $state.worktree push origin $state.branch
    $state.base_sha = $currentMain
    $state.status = 'PR_OPEN'
    Save-State $state $statePath
}

Wait-PrChecks -PrNumber $state.pr_number -Repository $config.repository

Invoke-Native git -C $repo fetch origin main --prune
$latestMain = (& git -C $repo rev-parse origin/main).Trim()
if ($latestMain -ne $state.base_sha) {
    throw 'Main changed again after validation. Run approval again so the branch can be revalidated safely.'
}

if (-not $AutoApprove) {
    $answer = Read-Host "All checks passed for PR #$($state.pr_number). Type MERGE to deploy"
    if ($answer -ne 'MERGE') { throw 'Merge cancelled. The pull request remains open.' }
}

$headSha = (& git -C $state.worktree rev-parse HEAD).Trim()
$mergeSubject = $manifest.title
if (-not $manifest.deployment_required -and $mergeSubject -notmatch '\[skip render\]|\[render skip\]') { $mergeSubject = "$mergeSubject [skip render]" }
Invoke-Native $script:GhExecutable pr merge $state.pr_number --repo $config.repository --squash --delete-branch --match-head-commit $headSha --subject $mergeSubject
$pr = & $script:GhExecutable pr view $state.pr_number --repo $config.repository --json state,mergeCommit,url | ConvertFrom-Json
if ($pr.state -ne 'MERGED') { throw 'Pull request was not merged.' }
$state.status = 'MERGED'
$state.merge_sha = $pr.mergeCommit.oid
Save-State $state $statePath

Wait-MainCi -Sha $state.merge_sha -Repository $config.repository

Invoke-Native git -C $repo fetch origin main --prune

if ($manifest.deployment_required) {
    Write-Host 'Waiting for deployment evidence and propagation...' -ForegroundColor Cyan
    try {
        Wait-ExternalDeploymentChecks -Sha $state.merge_sha -Repository $config.repository -TimeoutMinutes ([int]$config.deployment_timeout_minutes) | Out-Null
    }
    catch {
        $state.status = 'DEPLOYMENT_FAILED'
        Save-State $state $statePath
        & (Join-Path $PSScriptRoot 'Rollback-MathPathChange.ps1') -RunId $state.run_id -PrepareOnly
        throw
    }
    Start-Sleep -Seconds 60
    $deadline = (Get-Date).AddMinutes([int]$config.deployment_timeout_minutes)
    $successes = 0
    while ((Get-Date) -lt $deadline -and $successes -lt 3) {
        try {
            $front = Invoke-WebRequest -Uri $config.frontend_url -UseBasicParsing -TimeoutSec 30
            $back = Invoke-RestMethod -Uri $config.backend_health_url -TimeoutSec 30
            if ($front.StatusCode -ge 200 -and $front.StatusCode -lt 400 -and $back.status -eq 'ok') {
                $successes++
            }
            else { $successes = 0 }
        }
        catch { $successes = 0 }
        if ($successes -lt 3) { Start-Sleep -Seconds 20 }
    }
    if ($successes -lt 3) {
        $state.status = 'DEPLOYMENT_FAILED'
        Save-State $state $statePath
        & (Join-Path $PSScriptRoot 'Rollback-MathPathChange.ps1') -RunId $state.run_id -PrepareOnly
        throw 'Production smoke verification failed. A rollback pull request was prepared.'
    }
}

$state.status = 'COMPLETED'
$state.completed_at = (Get-Date).ToString('o')
Save-State $state $statePath
Write-Host "MathPath delivery completed successfully. Merge: $($state.merge_sha)" -ForegroundColor Green
