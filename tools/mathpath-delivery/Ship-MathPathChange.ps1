[CmdletBinding()]
param(
    [string]$PackagePath,
    [switch]$SkipOpenBrowser
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Native {
    param([Parameter(Mandatory)][string]$FilePath, [Parameter(ValueFromRemainingArguments)][string[]]$Arguments)
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

function Get-Sha256([string]$Path) { (Get-FileHash -Algorithm SHA256 -Path $Path).Hash.ToLowerInvariant() }
function Safe-RelativePath([string]$Path) {
    if ([System.IO.Path]::IsPathRooted($Path) -or $Path -match '(^|[\\/])\.\.([\\/]|$)') { throw "Unsafe relative path: $Path" }
    return $Path.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
}
function Save-State($State, [string]$Path) { $State | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 $Path }

$stateRoot = Join-Path $env:LOCALAPPDATA 'MathPathDelivery'
$configPath = Join-Path $stateRoot 'config.json'
if (-not (Test-Path $configPath)) { throw 'Delivery Console is not configured. Run Setup-MathPathDelivery.ps1 first.' }
$config = Get-Content $configPath -Raw | ConvertFrom-Json
$ghExecutable = Resolve-GitHubCliFromConfig -Config $config
Ensure-GitHubAuthentication -GhPath $ghExecutable
$repo = [System.IO.Path]::GetFullPath($config.repo_path)
if (-not (Test-Path (Join-Path $repo '.git'))) { throw "Configured repository does not exist: $repo" }

if (-not $PackagePath) {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = 'Select a MathPath change package'
    $dialog.Filter = 'MathPath change package (*.zip)|*.zip|Manifest file (manifest.json)|manifest.json'
    if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { throw 'Package selection cancelled.' }
    $PackagePath = $dialog.FileName
}
$PackagePath = [System.IO.Path]::GetFullPath($PackagePath)
if (-not (Test-Path $PackagePath)) { throw "Package not found: $PackagePath" }

$tempPackage = $null
if ((Get-Item $PackagePath).PSIsContainer) {
    $packageRoot = $PackagePath
} elseif ([System.IO.Path]::GetExtension($PackagePath) -eq '.zip') {
    $tempPackage = Join-Path $env:TEMP ("MathPathPackage-" + [guid]::NewGuid().ToString('N'))
    Expand-Archive -Path $PackagePath -DestinationPath $tempPackage -Force
    $manifestFound = Get-ChildItem $tempPackage -Filter manifest.json -Recurse | Select-Object -First 1
    if (-not $manifestFound) { throw 'manifest.json was not found in the package.' }
    $packageRoot = $manifestFound.Directory.FullName
} else {
    $packageRoot = Split-Path $PackagePath -Parent
}

try {
    $manifestPath = Join-Path $packageRoot 'manifest.json'
    if (-not (Test-Path $manifestPath)) { throw 'manifest.json was not found.' }
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.schema_version -ne 1) { throw "Unsupported manifest schema: $($manifest.schema_version)" }
    if ($manifest.repository -ne $config.repository) { throw "Package targets $($manifest.repository), not $($config.repository)." }
    if ($manifest.id -notmatch '^[a-z0-9][a-z0-9-]{2,80}$') { throw 'Manifest id is invalid.' }
    if ($manifest.baseline_sha -notmatch '^[0-9a-f]{40}$') { throw 'Manifest baseline_sha must be a full lowercase Git SHA.' }
    if ($manifest.change_type -notin @('runtime','docs','tests','automation')) { throw 'Manifest change_type is invalid.' }
    if ($manifest.merge_policy -notin @('manual','auto')) { throw 'Manifest merge_policy is invalid.' }
    if ($manifest.validation_profile -notin @('docs','automation','backend','backend-mm','frontend','full')) { throw 'Manifest validation_profile is invalid.' }
    if ($manifest.change_type -eq 'runtime' -and $manifest.merge_policy -ne 'manual') { throw 'Runtime packages must use manual merge approval.' }
    if ($manifest.change_type -eq 'runtime' -and -not $manifest.deployment_required) { throw 'Runtime packages must require deployment verification.' }
    if ($manifest.files.Count -eq 0) { throw 'Package contains no declared files.' }

    $localChanges = @(
        & git -C $repo status --porcelain=v1 --untracked-files=all -- . `
            ':(exclude).pytest_cache/**' `
            ':(exclude)backend/.pytest_cache/**' 2>$null
    )
    if ($localChanges.Count -gt 0) {
        Write-Warning 'The active MathPath folder contains uncommitted work. It will be preserved and excluded from this delivery.'
    }

    Invoke-Native git -C $repo fetch origin main --prune
    $baseSha = (& git -C $repo rev-parse origin/main).Trim()
    if ($manifest.baseline_sha -and $manifest.baseline_sha -ne $baseSha) {
        throw "Stale package. Expected baseline $($manifest.baseline_sha), current main is $baseSha. Regenerate the package."
    }

    $slug = ($manifest.id.ToLowerInvariant() -replace '[^a-z0-9-]+','-' -replace '^-|-$','')
    if (-not $slug) { throw 'Manifest id cannot be converted to a safe branch name.' }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $runId = "$slug-$stamp"
    $branch = "agent/$runId"
    $backup = "backup-before-$runId"
    $worktree = Join-Path (Join-Path $stateRoot 'worktrees') $runId
    $runDir = Join-Path (Join-Path $stateRoot 'runs') $runId
    New-Item -ItemType Directory -Force $runDir | Out-Null
    $statePath = Join-Path $runDir 'state.json'
    $logPath = Join-Path $runDir 'delivery.log'
    Start-Transcript -Path $logPath -Force | Out-Null

    $permanentManifest = Join-Path $runDir 'manifest.json'
    Copy-Item $manifestPath $permanentManifest -Force

    $state = [ordered]@{
        schema_version = 1; run_id = $runId; status = 'STARTED'; repository = $config.repository
        base_sha = $baseSha; branch = $branch; backup_branch = $backup; worktree = $worktree
        manifest_path = $permanentManifest; pr_number = $null; pr_url = $null; merge_sha = $null
        rollback_pr_number = $null; rollback_pr_url = $null; rollback_merge_sha = $null; completed_at = $null
        started_at = (Get-Date).ToString('o'); updated_at = (Get-Date).ToString('o')
    }
    Save-State $state $statePath

    Invoke-Native git -C $repo branch $backup $baseSha
    Invoke-Native git -C $repo worktree add -b $branch $worktree origin/main

    $declared = New-Object System.Collections.Generic.List[string]
    foreach ($entry in $manifest.files) {
        $rel = Safe-RelativePath $entry.path
        $normalizedPath = ($entry.path -replace '\\','/')
        if ($normalizedPath -ne '.env.example' -and $normalizedPath -notmatch '(^|/)\.env\.example$' -and $normalizedPath -match '(^|/)(\.env($|\.)|.*\.pem$|.*\.key$|id_rsa$|credentials\.json$|secrets?\.)') { throw "Secret-bearing path is not allowed: $normalizedPath" }
        $declared.Add($normalizedPath)
        $target = Join-Path $worktree $rel
        $action = $entry.action
        if ($action -in @('create','replace')) {
            $sourceRel = Safe-RelativePath $entry.source
            $source = Join-Path $packageRoot $sourceRel
            if (-not (Test-Path $source)) { throw "Payload source missing: $($entry.source)" }
            if ((Get-Sha256 $source) -ne $entry.sha256.ToLowerInvariant()) { throw "Payload checksum mismatch: $($entry.source)" }
        }
        if ($action -eq 'create') {
            if (Test-Path $target) { throw "Create target already exists: $($entry.path)" }
            New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
            Copy-Item $source $target
        } elseif ($action -eq 'replace') {
            if (-not (Test-Path $target)) { throw "Replace target does not exist: $($entry.path)" }
            if (-not $entry.expected_before_sha256) { throw "Replacement requires expected_before_sha256: $($entry.path)" }
            if ((Get-Sha256 $target) -ne $entry.expected_before_sha256.ToLowerInvariant()) { throw "Target changed since package creation: $($entry.path)" }
            Copy-Item $source $target -Force
        } elseif ($action -eq 'delete') {
            if (-not (Test-Path $target)) { throw "Delete target does not exist: $($entry.path)" }
            if (-not $entry.expected_before_sha256) { throw "Deletion requires expected_before_sha256: $($entry.path)" }
            if ((Get-Sha256 $target) -ne $entry.expected_before_sha256.ToLowerInvariant()) { throw "Delete target changed since package creation: $($entry.path)" }
            Remove-Item $target -Force
        } else { throw "Unsupported action '$action' for $($entry.path)" }
    }

    $actual = @(& git -C $worktree status --porcelain | ForEach-Object { ($_ -replace '^.. ','').Trim() -replace '\\','/' }) | Sort-Object -Unique
    $expected = @($declared) | Sort-Object -Unique
    if ($expected.Count -ne $manifest.files.Count) { throw 'Manifest contains duplicate file paths.' }
    $touchesBackend = @($expected | Where-Object { $_ -like 'backend/*' }).Count -gt 0
    $touchesFrontend = @($expected | Where-Object { $_ -like 'frontend/*' }).Count -gt 0
    if ($touchesBackend -and $manifest.validation_profile -notin @('backend','backend-mm','full')) { throw 'Backend changes require a backend-capable validation profile.' }
    if ($touchesFrontend -and $manifest.validation_profile -notin @('frontend','full')) { throw 'Frontend changes require a frontend-capable validation profile.' }
    if ($touchesBackend -and $touchesFrontend -and $manifest.validation_profile -ne 'full') { throw 'Combined backend/frontend changes require the full validation profile.' }
    if (Compare-Object $expected $actual) {
        throw "Changed-file scope mismatch.`nExpected: $($expected -join ', ')`nActual: $($actual -join ', ')"
    }

    $state.status = 'VALIDATING'; $state.updated_at = (Get-Date).ToString('o'); Save-State $state $statePath
    & (Join-Path $PSScriptRoot 'Test-MathPathChange.ps1') -WorktreePath $worktree -Profile $manifest.validation_profile -PrimaryRepoPath $repo

    foreach ($path in $expected) { Invoke-Native git -C $worktree add -- $path }
    $staged = @(& git -C $worktree diff --cached --name-only | ForEach-Object { $_ -replace '\\','/' }) | Sort-Object -Unique
    if (Compare-Object $expected $staged) { throw 'Staged-file scope does not exactly match the manifest.' }

    $commitMessage = $manifest.commit_message
    if (-not $manifest.deployment_required -and $commitMessage -notmatch '\[skip render\]|\[render skip\]') { $commitMessage = "$commitMessage [skip render]" }
    Invoke-Native git -C $worktree commit -m $commitMessage
    Invoke-Native git -C $repo push origin $backup
    Invoke-Native git -C $worktree push -u origin $branch

    $bodyPath = Join-Path $runDir 'pr-body.md'
    @"
## Objective
$($manifest.title)

$($manifest.description)

## Safety scope
- Baseline: $baseSha
- Backup branch: $backup
- Validation profile: `$($manifest.validation_profile)`
- Changed files: $($expected.Count)

## Changed files
$($expected | ForEach-Object { "- ``$_``" } | Out-String)

## Validation
Local validation completed successfully. GitHub Actions must pass before merge.

## Rollback
Revert the squash merge commit or use `Rollback-MathPathChange.ps1`.
"@ | Set-Content -Encoding UTF8 -Path $bodyPath

    $prJson = & $ghExecutable pr create --repo $config.repository --base main --head $branch --title $manifest.title --body-file $bodyPath
    if ($LASTEXITCODE -ne 0) { throw 'Unable to create pull request.' }
    $view = & $ghExecutable pr view $branch --repo $config.repository --json number,url | ConvertFrom-Json
    $state.status = 'PR_OPEN'; $state.pr_number = $view.number; $state.pr_url = $view.url; $state.updated_at = (Get-Date).ToString('o'); Save-State $state $statePath

    Write-Host "`nPull request created: $($view.url)" -ForegroundColor Green
    Write-Host "Run ID: $runId"
    if (-not $SkipOpenBrowser) { Start-Process $view.url }

    if ($manifest.merge_policy -eq 'auto' -and $manifest.change_type -in @('docs','tests','automation')) {
        & (Join-Path $PSScriptRoot 'Approve-MathPathMerge.ps1') -RunId $runId -AutoApprove
    }
    else {
        $answer = Read-Host 'Type WAIT to monitor checks and approve this runtime merge now, or press Enter to leave the PR open'
        if ($answer -eq 'WAIT') {
            & (Join-Path $PSScriptRoot 'Approve-MathPathMerge.ps1') -RunId $runId
        }
        else {
            Write-Host 'The PR remains open. Use option 2 in MathPath Delivery Console when ready.' -ForegroundColor Yellow
        }
    }
} catch {
    Write-Error $_
    throw
} finally {
    try { Stop-Transcript | Out-Null } catch {}
    if ($tempPackage -and (Test-Path $tempPackage)) { Remove-Item $tempPackage -Recurse -Force -ErrorAction SilentlyContinue }
}
