# MathPath Local Delivery Console v1.3

This console converts a validated MathPath change package into an isolated branch, tested commit, GitHub pull request, controlled merge, deployment smoke check, and recorded rollback point.

## One-time setup

Run:

```powershell
powershell -ExecutionPolicy Bypass -File tools/mathpath-delivery/Setup-MathPathDelivery.ps1 -CreateDesktopShortcut
```

The setup stores machine-local configuration and a durable console copy under `%LOCALAPPDATA%\MathPathDelivery`, installs a local Git pre-push guard, checks GitHub CLI authentication, stores the resolved portable gh.exe path, and optionally creates a desktop shortcut.

The configured MathPath working folder is treated as read-only operational context. It may contain uncommitted work or inaccessible pytest-cache folders; those are preserved and excluded from delivery operations.

## Normal use

1. Download a MathPath change package.
2. Drag the ZIP onto `MathPathDelivery.bat`, or open the desktop console and choose **Ship**.
3. The console validates the package, current Git baseline, checksums, exact file scope, tests, typecheck, and build according to the fixed validation profile.
4. It creates and pushes a feature branch and opens a pull request.
5. Runtime changes require a final `MERGE` confirmation after GitHub checks pass. Documentation, test-only, and automation packages may opt into automatic merge.

## Fail-closed guarantees

The console stops before merge when:

- `origin/main` cannot be fetched;
- the package baseline SHA is stale;
- an isolated worktree cannot be created cleanly from `origin/main`;
- a package path is unsafe;
- a create target already exists;
- a replacement or deletion checksum no longer matches;
- changed files differ from the manifest;
- validation fails;
- GitHub Actions fails;
- deployment smoke verification fails.

## Change package rules

Packages cannot supply arbitrary shell commands. They select one fixed profile:

- `docs`
- `automation`
- `backend`
- `backend-mm`
- `frontend`
- `full`

Every payload file has a SHA-256 checksum. Replacements and deletions also require the SHA-256 of the expected current repository file.

## Recovery

Every run records state under `%LOCALAPPDATA%\MathPathDelivery\runs`. A backup branch is created from the exact baseline before any feature branch is pushed. `Rollback-MathPathChange.ps1` prepares a tested revert pull request.

## Desktop console options

The single desktop shortcut provides Ship, Approve, Rollback, and Setup/Repair actions. Runtime changes can remain open after validation and be merged later through **Approve**.

## Independent CI checks

Every pull request and every merge to `main` runs:

- `repository-safety`
- `delivery-console-lint`
- `backend-tests`
- `mathpath-generator-validation`
- `frontend-typecheck`
- `frontend-build`

Non-runtime squash merges include `[skip render]` in the actual merge subject so the backend is not restarted for documentation or automation-only changes.


## Active working-folder isolation

The console never checks out, resets, stashes, cleans, or overwrites the configured day-to-day MathPath folder. All package application, validation, commits, rebases, rollback preparation, and GitHub pushes run in dedicated worktrees created from the latest `origin/main`.

This allows the active folder to retain unfinished work without contaminating or blocking controlled deliveries.
