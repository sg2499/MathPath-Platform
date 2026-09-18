"""Answers "what code is actually running right now" -- in seconds, without
an SSH session.

Built 2026-09-18 (Shailesh: "do whatever will fix and make sure this never
happens again," after a real student went missing assigned DPS sheets and
Annual Competition practice papers for well over a week because the fix for
a since-resolved bug (a 60s per-worker stale-response cache, removed
2026-09-07/08) had been sitting correctly merged to `main` the entire time
without ever being deployed to the EC2 box real students actually hit --
`mock.mathpath.in` resolves straight to that box, confirmed by direct DNS
lookup; a separate Render service auto-deploys on every merge but was
never the one serving real traffic, which is exactly what made this so
easy to miss. Root-caused via a manual SSH `git log -1` + `systemctl
status` check -- this module exists so that check is never needed again:
`GET /api/health` now reports the exact commit and process-start time of
whatever is actually answering the request.

Resolution is git-based, not a build-time-injected constant, because the
production deploy (`docs/project-memory/DEPLOY_PLAYBOOK.md` Step 4b, and
the new `.github/workflows/deploy-production.yml`) is a `git reset --hard`
against a real working-tree clone with its own `.git` directory -- there is
no separate build/packaging step for the backend that could stamp a
version string in some other way, so reading it straight from `.git` is
the simplest source of truth that cannot drift from what's actually
checked out. Every lookup is defensive: this must never be able to crash
`/api/health` itself (the one endpoint that should always be trustworthy),
so any failure -- `.git` missing, `git` not on PATH, a shallow clone
without full history, a sandboxed test environment -- falls back to
"unknown" rather than raising.
"""
import subprocess
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path


def _RepoRoot() -> Path | None:
    """Walk upward from this file looking for a `.git` directory. Works
    regardless of the process's current working directory (gunicorn is
    typically started from the repo root, but this must not assume that)."""
    Current = Path(__file__).resolve()
    for Candidate in [Current, *Current.parents]:
        if (Candidate / ".git").exists():
            return Candidate
    return None


def _RunGit(*Args: str) -> str | None:
    Root = _RepoRoot()
    if Root is None:
        return None
    try:
        Result = subprocess.run(
            ["git", *Args],
            cwd=str(Root),
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if Result.returncode != 0:
        return None
    Output = Result.stdout.strip()
    return Output or None


@lru_cache(maxsize=1)
def GetDeployedCommitInfo() -> dict:
    """Cached for the lifetime of the process -- a gunicorn worker never
    changes which commit it's running without a restart, so there is no
    reason to shell out to git on every single /api/health call."""
    return {
        "commit": _RunGit("rev-parse", "--short", "HEAD") or "unknown",
        "commitFull": _RunGit("rev-parse", "HEAD") or "unknown",
        "commitSubject": _RunGit("log", "-1", "--format=%s") or "unknown",
        "commitTime": _RunGit("log", "-1", "--format=%cI") or "unknown",
    }


# Process start time -- module-level, evaluated exactly once when this
# module is first imported (app startup), so it reflects when THIS
# gunicorn worker actually booted, not when the request happened to arrive.
PROCESS_STARTED_AT = datetime.now(timezone.utc)


def GetUptimeSeconds() -> float:
    return (datetime.now(timezone.utc) - PROCESS_STARTED_AT).total_seconds()
