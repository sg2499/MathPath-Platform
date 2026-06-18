# MathPath Local Delivery System v1.3

Last updated: 2026-06-18

## Decision

MathPath uses a zero-additional-cost hybrid delivery workflow when Codex quota is unavailable. AI prepares a structured change package; the local delivery console performs repository safety checks, isolated application, validation, Git operations, pull-request creation, deployment verification, and rollback preparation.

## Safety model

- The user's active MathPath folder is never used as the working directory for package application.
- Existing uncommitted work and inaccessible pytest caches are preserved and excluded.
- The console never checks out, resets, stashes, cleans, or overwrites the active folder.
- Every installation, change, revalidation, and rollback is performed in a new Git worktree created from `origin/main`.
- A backup branch is created from the exact current baseline.
- Packages are baseline-locked and checksum-locked.
- Only manifest-declared files may change.
- Packages select fixed validation profiles and cannot inject arbitrary commands.
- Runtime changes require a final human merge confirmation.
- Failed GitHub checks prevent merge.
- Failed production smoke verification prepares a rollback pull request.

## Manual effort after setup

Normal package delivery requires:

1. Download one change ZIP.
2. Open it through the MathPath Delivery Console.
3. Approve a green runtime merge.

All file replacement, branch creation, tests, commits, pushes, PR creation, deployment checks, and rollback preparation are automated.

## Local state

Machine-specific configuration and run evidence are stored outside the repository under:

`%LOCALAPPDATA%\MathPathDelivery`

No credentials or machine-specific paths are committed.

## Hosting behavior

Non-runtime changes use a Render skip marker on the final squash merge commit. Runtime changes omit the marker and require post-merge frontend and backend health verification. GitHub CI reruns on the actual `main` commit after merge.


## Dirty working-folder policy

A dirty active repository is informational, not fatal. The console reports visible changes when possible, suppresses irrelevant `.pytest_cache` permission noise, and continues only through an isolated clean worktree. Local unfinished work is never included in a package commit or pull request.


## GitHub CLI authentication

The installer treats an unauthenticated first run as expected, opens the one-time GitHub browser authorization flow, verifies the resulting session, and records the exact gh.exe path for future console operations.
