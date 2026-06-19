# MathPath Local Delivery Console

The console converts a validated MathPath change package into an isolated branch, tested commit, GitHub pull request, controlled merge, deployment verification, and recorded rollback point.

## Core guarantees

- The active day-to-day repository is never checked out, reset, stashed, cleaned, or overwritten.
- Every delivery runs in an isolated worktree created from current `origin/main`.
- Every package is baseline-locked, checksum-locked, and exact-file-scope locked.
- Replace/delete verification compares Git canonical blob identity, preventing false LF/CRLF mismatches while still rejecting real target changes.
- Runtime changes require explicit `MERGE` confirmation.
- Every run records state under `%LOCALAPPDATA%\MathPathDelivery\runs`.
- Every delivery creates a backup branch before the feature branch is pushed.
- Failed production smoke verification prepares a rollback pull request instead of resetting `main`.

## Validation profiles

Packages cannot inject commands. They select a fixed profile:

- `docs`
- `automation`
- `backend`
- `backend-mm`
- `frontend`
- `full`

## Repository governance

Package 1 adds `Configure-RepositoryGovernance.ps1`. It is intentionally separate from normal package shipping because repository rules are GitHub settings rather than repository files.

After Package 1 has merged, run:

```powershell
powershell -ExecutionPolicy Bypass -File tools/mathpath-delivery/Configure-RepositoryGovernance.ps1
```

The default mode is audit-only. To apply the reviewed ruleset:

```powershell
powershell -ExecutionPolicy Bypass -File tools/mathpath-delivery/Configure-RepositoryGovernance.ps1 -Apply
```

The script is idempotent, saves the previous ruleset locally, refuses to assume enforcement for a private GitHub Free repository, requires pull requests, requires the complete MathPath CI check set, blocks force pushes and deletion of `main`, permits squash merges only, and retains an owner recovery path through pull requests only.

## Redacted diagnostics

Run:

```powershell
powershell -ExecutionPolicy Bypass -File tools/mathpath-delivery/Collect-Diagnostics.ps1
```

The resulting ZIP includes repository state, tool versions, workflow metadata, ruleset metadata, and redacted delivery-run state. It excludes credentials, `.env` files, database exports, student records, and raw application data.

## CI v2

Every pull request and every merge to `main` runs:

- `governance-audit`
- `repository-safety`
- `delivery-console-lint`
- `backend-tests`
- `mathpath-generator-validation`
- `frontend-typecheck`
- `frontend-build`
- `ci-summary`

Governance evidence and test logs are uploaded as short-retention workflow artifacts. Configuration drift and repository exposure findings are report-only in Package 1; they do not change production settings or product runtime behaviour.
