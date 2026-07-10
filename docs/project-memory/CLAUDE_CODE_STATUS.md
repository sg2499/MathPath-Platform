# Claude Code — Live Status

This file is a snapshot, not a log — the active Claude Code session **overwrites** the "Current" section at each milestone rather than appending, so it stays short enough to be cheap to read. It exists so a Cowork session can check what's happening in a local Claude Code session without the developer copy-pasting terminal output back and forth. For full session history, see `docs/project-memory/COWORK_HANDOFF.md` and `DAILY_LOGS/`.

## Current

- **Updated:** 2026-07-10
- **Task given:** Deliver the uncommitted delivery/engineering-safety rework (apex_deliver.py, rollback.py, .claude/agents/*, memory docs) — qa-reviewer gate, then sre-devops push/PR/merge.
- **Stage:** qa-reviewer passed (PASS WITH NOTES), handing off to sre-devops now.
- **Active persona:** sre-devops
- **Last action:** qa-reviewer re-reviewed from scratch after manual fixes to the two originally-reported bugs (Windows UnicodeEncodeError in apex_deliver.py print() calls, /dev/null redirect bug in rollback.py); both confirmed fixed and independently reproduced. Non-blocking notes: cosmetic em-dashes remain in comments, gh pr merge --auto will dead-end into manual merge since this repo has allow_auto_merge=false and no branch protection on main, and check_live_students()'s local-vs-prod heuristic wouldn't catch a local Postgres URL (only sqlite/empty). Deleted a stray scratch_nonascii_dump.txt debug file from repo root before handoff.
- **Blocked on:** none
- **Next step:** sre-devops runs python .agents/apex_deliver.py to commit/push/PR this changeset; expect the --auto merge to leave the PR open for manual merge per the note above.

## Last completed milestone

- qa-reviewer PASS WITH NOTES on the delivery-safety rework (2026-07-10), after one FAIL round and manual bug fixes.

## Notes for whoever reads this next

- If "Blocked on" is non-empty, don't assume it resolved itself — check before proceeding.
- If "Updated" looks stale relative to the terminal's actual activity, trust the terminal, not this file, and flag the drift.
