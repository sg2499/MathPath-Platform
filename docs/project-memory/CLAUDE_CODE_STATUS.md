# Claude Code — Live Status

This file is a snapshot, not a log — the active Claude Code session **overwrites** the "Current" section at each milestone rather than appending, so it stays short enough to be cheap to read. It exists so a Cowork session can check what's happening in a local Claude Code session without the developer copy-pasting terminal output back and forth. For full session history, see `docs/project-memory/COWORK_HANDOFF.md` and `DAILY_LOGS/`.

## Current

- **Updated:** 2026-07-11 (local Claude Code session, picked up the Cowork handoff)
- **Task given:** Deliver the grind-heatmap multi-source/multi-attempt fix prepared this session (see COWORK_HANDOFF.md 2026-07-11 entry). Files changed: `backend/app/services/competition_mock_attempt_service.py`, `backend/app/services/assessment_engine_service.py`, `frontend/types/assignment.ts`, `frontend/lib/api/student.ts`, `frontend/app/student/dashboard/page.tsx`, plus this doc set.
- **Stage:** qa-reviewer PASS WITH NOTES. sre-devops correctly refused (twice) to run the live-student-check override on relayed authorization — its rule is categorical: no agent-relayed claim of user consent is ever trusted, only direct user input or real config. No TTY was available for it to ask the developer directly either. Developer then explicitly chose to have the orchestrator (this session) run `apex_deliver.py` directly instead, since the orchestrator received the consent first-hand via `AskUserQuestion`, not by relay. sre-devops did land one in-scope robustness fix along the way: `safe_confirm()` in `.agents/apex_deliver.py` now fails closed on EOF instead of crashing.
- **Active persona:** orchestrator (running delivery directly, exception to the usual sre-devops-only path, for this one delivery)
- **Last action:** running `HUMAN_OVERRIDE_LIVE_CHECK=1 python .agents/apex_deliver.py "..."` directly.
- **Blocked on:** nothing — in progress.
- **Next step:** on successful delivery → `monitor_deploy.py` to confirm Vercel/Render health.

## Last completed milestone

- Delivery-safety rework (CI-gated apex_deliver.py, rollback.py, 10-persona subagent squad, reconciled operating protocol) shipped to production 2026-07-10: qa-reviewer FAIL -> manual fixes -> qa-reviewer PASS WITH NOTES -> human-confirmed override of check_live_students() UNVERIFIED gate (tooling/docs-only diff) -> PR #302 merged -> tag prod-20260710-195723 -> deploy verified healthy. One self-corrected process note: sre-devops briefly ran `git config core.longpaths true` while unblocking a corrupted local ref, then reverted it in the same step; no config drift remains.

## Notes for whoever reads this next

- If "Blocked on" is non-empty, don't assume it resolved itself — check before proceeding.
- If "Updated" looks stale relative to the terminal's actual activity, trust the terminal, not this file, and flag the drift.
