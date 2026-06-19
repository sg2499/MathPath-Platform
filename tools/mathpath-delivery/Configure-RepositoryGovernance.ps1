[CmdletBinding()]
param(
    [string]$Repository = 'sg2499/MathPath-Platform',
    [string]$RulesetName = 'MathPath Main Protection',
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Resolve-GitHubCli {
    $configPath = Join-Path $env:LOCALAPPDATA 'MathPathDelivery\config.json'
    if (Test-Path $configPath) {
        $config = Get-Content $configPath -Raw | ConvertFrom-Json
        if ($config.gh_path -and (Test-Path $config.gh_path)) { return $config.gh_path }
    }
    $command = Get-Command gh -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $candidate = Join-Path $env:LOCALAPPDATA 'MathPathDelivery\bin\gh.exe'
    if (Test-Path $candidate) { return $candidate }
    throw 'GitHub CLI was not found. Run MathPath Delivery Console Setup/Repair first.'
}

function Invoke-GhJson {
    param([string[]]$Arguments)
    $output = & $script:Gh @Arguments
    if ($LASTEXITCODE -ne 0) { throw "GitHub CLI failed: gh $($Arguments -join ' ')" }
    if (-not $output) { return $null }
    return ($output | Out-String | ConvertFrom-Json)
}

$script:Gh = Resolve-GitHubCli
& $script:Gh auth status --hostname github.com | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI is not authenticated.' }

$repoInfo = Invoke-GhJson @('api', "repos/$Repository")
if ($repoInfo.full_name -ne $Repository) { throw "Unexpected repository: $($repoInfo.full_name)" }
if ($repoInfo.visibility -ne 'public') {
    throw "Repository visibility is '$($repoInfo.visibility)'. Package 1 will not assume ruleset enforcement on a private GitHub Free repository."
}

$workflow = Invoke-GhJson @('api', "repos/$Repository/contents/.github/workflows/mathpath-ci.yml?ref=main")
if (-not $workflow.sha -or -not $workflow.content) { throw 'MathPath CI workflow was not found on main.' }
$workflowText = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String(($workflow.content -replace '\s','')))
if ($workflowText -notmatch '(?m)^\s{2}governance-audit:' -or $workflowText -notmatch '(?m)^\s{2}ci-summary:') {
    throw 'MathPath CI v2 was not found on main. Merge Package 1 before applying governance.'
}

$requiredChecks = @(
    'governance-audit',
    'repository-safety',
    'delivery-console-lint',
    'backend-tests',
    'mathpath-generator-validation',
    'frontend-typecheck',
    'frontend-build',
    'ci-summary'
)

$payload = [ordered]@{
    name = $RulesetName
    target = 'branch'
    enforcement = 'active'
    bypass_actors = @(
        [ordered]@{
            actor_id = [int64]$repoInfo.owner.id
            actor_type = 'User'
            bypass_mode = 'pull_request'
        }
    )
    conditions = [ordered]@{
        ref_name = [ordered]@{
            include = @('refs/heads/main')
            exclude = @()
        }
    }
    rules = @(
        [ordered]@{ type = 'deletion' },
        [ordered]@{ type = 'non_fast_forward' },
        [ordered]@{ type = 'required_linear_history' },
        [ordered]@{
            type = 'pull_request'
            parameters = [ordered]@{
                allowed_merge_methods = @('squash')
                dismiss_stale_reviews_on_push = $false
                require_code_owner_review = $false
                require_last_push_approval = $false
                required_approving_review_count = 0
                required_review_thread_resolution = $true
            }
        },
        [ordered]@{
            type = 'required_status_checks'
            parameters = [ordered]@{
                do_not_enforce_on_create = $true
                strict_required_status_checks_policy = $true
                required_status_checks = @($requiredChecks | ForEach-Object { [ordered]@{ context = $_ } })
            }
        }
    )
}

$existing = @(Invoke-GhJson @('api', "repos/$Repository/rulesets?includes_parents=false&targets=branch", '--paginate'))
$match = @($existing | Where-Object { $_.name -eq $RulesetName }) | Select-Object -First 1

Write-Host ''
Write-Host 'MathPath repository governance plan' -ForegroundColor Cyan
Write-Host "Repository: $Repository"
Write-Host "Visibility: $($repoInfo.visibility)"
Write-Host "Target: refs/heads/main"
Write-Host "Required checks: $($requiredChecks -join ', ')"
Write-Host 'Direct updates: pull-request only'
Write-Host 'Force pushes and branch deletion: blocked'
Write-Host 'Allowed merge method: squash'
Write-Host 'Emergency owner bypass: pull-request only'

if (-not $Apply) {
    Write-Host ''
    Write-Host 'Audit completed. No GitHub setting was changed. Run with -Apply after reviewing this plan.' -ForegroundColor Yellow
    exit 0
}

$confirmation = Read-Host "Type APPLY to create or update '$RulesetName'"
if ($confirmation -ne 'APPLY') { throw 'Repository governance application cancelled.' }

$backupRoot = Join-Path $env:LOCALAPPDATA 'MathPathDelivery\governance-backups'
New-Item -ItemType Directory -Force $backupRoot | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = Join-Path $backupRoot "ruleset-before-$stamp.json"
if ($match) {
    $current = Invoke-GhJson @('api', "repos/$Repository/rulesets/$($match.id)")
    $current | ConvertTo-Json -Depth 30 | Set-Content -Encoding UTF8 $backupPath
}
else {
    '{"existing_ruleset":null}' | Set-Content -Encoding UTF8 $backupPath
}

$temp = Join-Path $env:TEMP "mathpath-ruleset-$stamp.json"
$payload | ConvertTo-Json -Depth 30 | Set-Content -Encoding UTF8 $temp
try {
    if ($match) {
        & $script:Gh api --method PUT -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2026-03-10' "repos/$Repository/rulesets/$($match.id)" --input $temp | Out-Null
    }
    else {
        & $script:Gh api --method POST -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2026-03-10' "repos/$Repository/rulesets" --input $temp | Out-Null
    }
    if ($LASTEXITCODE -ne 0) { throw 'GitHub rejected the MathPath ruleset.' }
}
finally {
    Remove-Item $temp -Force -ErrorAction SilentlyContinue
}

$activeRules = @(Invoke-GhJson @('api', "repos/$Repository/rules/branches/main"))
$activeTypes = @($activeRules | ForEach-Object { $_.type })
foreach ($requiredType in @('pull_request', 'required_status_checks', 'non_fast_forward', 'deletion')) {
    if ($requiredType -notin $activeTypes) { throw "Governance verification failed: active rule '$requiredType' was not found." }
}

Write-Host ''
Write-Host 'MathPath main-branch governance is active and verified.' -ForegroundColor Green
Write-Host "Backup: $backupPath"
