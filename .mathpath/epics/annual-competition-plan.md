# Annual Competition — Plan of Action

Full requirements live in `docs/project-memory/annual-competition/REQUIREMENTS.md`
(synthesized from the two client-provided source documents kept verbatim in
that same folder). The architecture below was written up and approved via
Claude Code's plan-mode workflow on 2026-09-04 -- see that file and
`docs/project-memory/COWORK_HANDOFF.md` for the full history. Read
REQUIREMENTS.md before touching anything in this epic.

**The one-sentence risk picture:** paper *content* fairness (identical
questions/order for everyone) is already solved by the existing Competition
Mock architecture, for free. Everything about *timing* -- independently
timed sections, genuine pause-on-disconnect, and delayed results release --
does not exist anywhere in this codebase today. That timing engine is the
real, novel, highest-risk part of this build (Phase 4 / Package 4 below)
and gets the most isolation and testing.

## Phase 1 — Data Model
New, isolated tables (parallel to, not built on top of, Competition Mock's
tables):
* CompetitionEvent
* CompetitionEventSlot
* CompetitionEventLevelPaper (+ child CompetitionEventSectionTimer)
* CompetitionEventAssignment
* CompetitionEventAttempt (+ child CompetitionEventAttemptSectionState)
* CompetitionEventResult

Also: an immutability guard in `DeleteCompetitionMockExam`
(`competition_mock_generation_service.py`) rejecting delete once a
`CompetitionMockExam` is linked to a `CompetitionEventLevelPaper` with real
attempts or a locked results date -- a schema-level correctness property,
not left to admin discipline.

**Status: COMPLETE.** Models added to `backend/app/models/models.py`;
`ensure_annual_competition_tables()` added to
`backend/app/services/schema_migration.py` and wired into `main.py`
startup (mirrors the `ensure_competition_mock_tables()` precedent, since
production deploys have not always run `alembic upgrade head` reliably);
Alembic migration `3025bba70ab3_add_annual_competition_tables.py` added on
top of the existing head. The immutability guard is live in
`DeleteCompetitionMockExam`. All verified: full existing backend test suite
(347 tests) still green, plus dedicated upgrade/downgrade DDL round-trip
and guard-logic tests run directly against a scratch SQLite DB (see
`pkg-01-data-model.md`).

## Phase 2 — Assignment Engine
An explicit mapping-table service (student's current group -> assigned
competition level), matching the client's Section 1 table verbatim -- not
a generic "invert `next_level_id`" algorithm, since `IM-L1` has two
legitimate predecessors (`PM-L4` and `BM-L1`) in the existing forward-only
progression graph. Bridge/Master Module milestone placement reuses
`lesson_progress_service.py`'s `IsLessonFullyClearedForStudent` /
`ComputeLessonProgressForStudents` -- no new progress storage. Ships with
an admin dry-run/audit view ("show who would be assigned to what, without
committing") so the mapping is verified against the client's table before
being relied on for real.

## Phase 3 — Admin Annual Competition Studio
Admin screens to: create an event, define/edit slots (mode + time window +
applicable level codes -- fully data-driven so the known IM-4/MM-2 slot
duration conflict is a data edit, never a deploy), generate or link each
level's official paper via the existing Competition Mock generation engine,
run the assignment engine, review/override individual assignments.

## Phase 4 — Section-Timer + Pause Engine (highest-risk, built in isolation)
Heartbeat mechanic: client heartbeats every ~5-10s; server persists
`remaining_seconds_at_last_heartbeat` + `last_heartbeat_at` on **every**
heartbeat (never batched, for server-restart safety); absence of
heartbeats past a grace window (30-60s) = implicit pause; resume picks up
from the exact persisted remaining time. Single-active-session guard via a
`session_token` (closes a real multi-device desync gap found during plan
review). Auto-advance between sections reuses this codebase's existing lazy
whole-exam-auto-submit pattern. A reconciliation sweep (admin-triggered or
run once post-event) finalizes any attempt whose last section expired but
was never followed by another request -- there is no scheduler/cron
anywhere in this backend, so nothing else would ever touch that row.
Built and tested with synthetic attempts before touching any student UI.

## Phase 5 — Student Live-Attempt UI
Multi-section timer, pre-section instructions screen (name, mode,
concepts, sum count, time -- per the client's own requirement), slot-gated
start ("can't begin before your scheduled time"), resume-on-reconnect UX.

## Phase 6 — Scoring + Results
Capture raw metrics (correct count, accuracy%, time, per-section times)
unconditionally regardless of which final scoring/tie-break formula is
later confirmed (REQUIREMENTS.md outstanding item 4). Release-gating via
`CompetitionEventResult.is_released` (private by default -- student sees
only their own result). Admin manual "release now" override for the 1 Nov
2026 Results & Prize Distribution event.

## Phase 7 — Teacher/Admin Monitoring
Live view during the event (started/submitted/stuck), post-event results
review.

## Phase 8 — Certificates / Leaderboard Visibility
Deliberately last and mostly deferred: data model stays extensible, but
actual certificate fields and public leaderboard scope wait on client
confirmation (REQUIREMENTS.md outstanding items 5-6).

## Phase 9 — Full Rehearsal + Regression
A dry run with test accounts simulating the real 11 Oct 2026 timeline
across all five slots, including simulated disconnects across the pause
mechanic. Full regression pass against existing DPS/Assessment/Competition
Mock suites to confirm zero collateral damage from any shared code paths
touched.

## Phase 10 — Go-Live Checklist + Rollback Plan
For 11 Oct 2026.

## Handling the seven unconfirmed client items (config/data, never hardcoded)

| Item | Default until confirmed | Where it lives |
|---|---|---|
| YLP-1 participation | Excluded (flag off) | Config flag read by the assignment engine |
| YLM paper variants | One shared paper | `CompetitionEventLevelPaper` already supports a split later -- no rebuild needed |
| Bridge "between milestones" | Floor to highest milestone reached | Assignment-engine rule, commented as a default pending confirmation |
| Final scoring/tie-break | Correct count desc, then time asc | A swappable ranking function, not inlined logic |
| Leaderboard/certificate visibility | Private -- student sees own result only | `CompetitionEventResult` release-gate defaults maximally private |
| Attempt count/retakes | 1 attempt, admin-only manual override | Enforced in the attempt-start check |
| Slot duration conflict (IM-4/MM-2 too short) | Not resolved in code at all | `CompetitionEventSlot` is admin-editable data specifically so this is a data fix, never a deploy |

## Rollout packages
See `.mathpath/packages/pkg-01-data-model.md` through `pkg-10-go-live.md`
for the checklist-level breakdown of each phase above. `.mathpath/STATE.yaml`
tracks which package is active.
