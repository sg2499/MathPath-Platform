[CmdletBinding()]
param([Parameter(Mandatory)][string]$RepoPath)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$commonDirRaw = (& git -C $RepoPath rev-parse --git-common-dir).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Unable to locate the Git common directory.' }
$commonDir = if ([System.IO.Path]::IsPathRooted($commonDirRaw)) { $commonDirRaw } else { Join-Path $RepoPath $commonDirRaw }
$hooksDir = Join-Path ([System.IO.Path]::GetFullPath($commonDir)) 'hooks'
New-Item -ItemType Directory -Force $hooksDir | Out-Null
$hookPath = Join-Path $hooksDir 'pre-push'
$originalPath = Join-Path $hooksDir 'pre-push.mathpath-original'
$marker = '# MATHPATH_MAIN_GUARD_V1'

if (Test-Path $hookPath) {
    $existing = Get-Content $hookPath -Raw
    if ($existing -notmatch [regex]::Escape($marker) -and -not (Test-Path $originalPath)) {
        Move-Item $hookPath $originalPath
    }
}

$hook = @'
#!/bin/sh
# MATHPATH_MAIN_GUARD_V1
ORIGINAL="$(dirname "$0")/pre-push.mathpath-original"
if [ -f "$ORIGINAL" ]; then
  sh "$ORIGINAL" "$@" || exit $?
fi

while read local_ref local_sha remote_ref remote_sha
do
  if [ "$remote_ref" = "refs/heads/main" ] && [ "$MATHPATH_ALLOW_MAIN_PUSH" != "1" ]; then
    echo "MathPath safety guard: direct pushes to main are blocked."
    echo "Use a feature branch and pull request through MathPath Delivery Console."
    exit 1
  fi
done
exit 0
'@
Set-Content -Path $hookPath -Value $hook -Encoding Ascii
Write-Host "Installed main-branch push guard: $hookPath" -ForegroundColor Green
