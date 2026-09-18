"""Regression coverage for the 2026-09-18 deploy-visibility fix (Shailesh:
"do whatever will fix and make sure this never happens again").

Context: a real student went without their assigned DPS sheets and Annual
Competition practice papers visible for over a week because the fix for a
prior bug (the 2026-09-07/08 stale-cache removal, see
test_student_assignments_no_stale_cache_regression.py) had been sitting
correctly merged to `main` the whole time without ever being deployed to
the EC2 box that `mock.mathpath.in` actually resolves to -- confirmed via a
manual `git log -1` + `systemctl status` SSH session, precisely the kind of
check GET /api/health should make unnecessary going forward.

This file locks in two things: (1) app/core/deploy_info.py's git lookups
actually resolve real values against this checkout (not "unknown" --
the whole point is that a healthy environment reports its real commit),
and are defensive enough to degrade to "unknown" rather than raise when
run somewhere with no git history at all; (2) GET /api/health's payload
(via BuildHealthPayload(), called directly -- no TestClient/app needed,
this endpoint has zero DB dependency) carries every field the new deploy
workflow's post-deploy check and the admin-facing build-info widget both
rely on.
"""
from __future__ import annotations

import subprocess
from datetime import datetime, timezone
from pathlib import Path

from app.core.deploy_info import GetDeployedCommitInfo, GetUptimeSeconds, PROCESS_STARTED_AT
from app.api.routes_health import BuildHealthPayload

_BACKEND_DIR = Path(__file__).resolve().parents[1]  # backend/tests/.. -> backend/


def _RealRepoHeadShortSha() -> str:
    """Ground truth to compare against -- calls git directly, independent
    of deploy_info.py's own implementation, so this test can't pass just
    because both sides share the same bug."""
    Result = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=str(_BACKEND_DIR),
        capture_output=True,
        text=True,
        timeout=5,
        check=True,
    )
    return Result.stdout.strip()


def test_get_deployed_commit_info_resolves_the_real_checkout_sha():
    Info = GetDeployedCommitInfo()
    assert Info["commit"] == _RealRepoHeadShortSha()
    assert Info["commit"] != "unknown"
    assert len(Info["commitFull"]) == 40  # full SHA, not the short form
    assert Info["commitFull"].startswith(Info["commit"])
    assert Info["commitSubject"] != "unknown" and Info["commitSubject"]
    # ISO 8601 with a timezone offset -- must be parseable, not just non-empty.
    assert Info["commitTime"] != "unknown"
    datetime.fromisoformat(Info["commitTime"])


def test_get_deployed_commit_info_is_cached_not_reshelled_out_every_call():
    # Same object identity across two calls confirms the lru_cache is
    # actually doing its job -- a gunicorn worker never changes commits
    # without a restart, so re-shelling out to git on every /api/health hit
    # would be pure waste.
    First = GetDeployedCommitInfo()
    Second = GetDeployedCommitInfo()
    assert First is Second


def test_get_deployed_commit_info_degrades_to_unknown_without_raising(monkeypatch):
    import app.core.deploy_info as deploy_info_module

    monkeypatch.setattr(deploy_info_module, "_RepoRoot", lambda: None)
    deploy_info_module.GetDeployedCommitInfo.cache_clear()
    try:
        Info = deploy_info_module.GetDeployedCommitInfo()
        assert Info == {
            "commit": "unknown",
            "commitFull": "unknown",
            "commitSubject": "unknown",
            "commitTime": "unknown",
        }
    finally:
        deploy_info_module.GetDeployedCommitInfo.cache_clear()


def test_process_started_at_is_in_the_past_and_uptime_is_non_negative():
    assert PROCESS_STARTED_AT <= datetime.now(timezone.utc)
    assert GetUptimeSeconds() >= 0


def test_health_payload_carries_every_field_the_deploy_workflow_and_admin_widget_need():
    Payload = BuildHealthPayload()
    assert Payload["status"] == "ok"
    for Key in (
        "deployedCommit",
        "deployedCommitFull",
        "deployedCommitSubject",
        "deployedCommitTime",
        "processStartedAt",
        "uptimeSeconds",
    ):
        assert Key in Payload
    assert Payload["deployedCommit"] == _RealRepoHeadShortSha()
    # processStartedAt must itself be a real parseable timestamp, not a
    # placeholder -- the admin widget formats this directly.
    datetime.fromisoformat(Payload["processStartedAt"])
    assert Payload["uptimeSeconds"] >= 0
