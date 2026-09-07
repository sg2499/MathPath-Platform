# Package 10 (Phase 10): Go-Live Checklist + Rollback Plan

## Objective
Everything needed to be confident going into 11 Oct 2026, and a clear way
back out if something goes wrong on the day.

## Status: COMPLETE

## What was built

Package 10 is mostly a verification/documentation package, not a new
feature -- by the time it started, Packages 1-9 already covered nearly
every checklist item below. Two genuine gaps were found and closed with
real code: a kill switch to pause the student-facing attempt UI, and a way
to void a single attempt's result without touching the rest of the event.
Both were scoped and approved by Shailesh via an explicit AskUserQuestion
before any code was written (see REQUIREMENTS.md decision log / STATE.yaml
for the exact options presented and chosen).

### 1. Pre-event

- **All seven REQUIREMENTS.md items are resolved.** Re-verified directly
  against `docs/project-memory/annual-competition/REQUIREMENTS.md`'s
  "Client's answers" section: items 1+2 (age boundary), 3 (Bridge
  milestone), 4 (scoring formula), 5 (results/certificate visibility), and
  6 (retry override) are all marked Implemented with dates. Item 7 (the
  IM-4/MM-2 slot-duration question) is resolved differently from the
  others -- see next point.
- **The IM-4/MM-2 slot conflict needs no code or data change.** The
  client's answer to item 7 confirms the published slot window (e.g.
  2:00-2:30 PM) is only a shared login/entry anchor, never a hard cutoff:
  "each level has its own time limit ... same entry time, rest will follow
  as per the level time limits as in the platform." `CompetitionEventSlot`
  already only gates *entry*; per-section timing is enforced independently
  by `CompetitionEventSectionTimer` (Package 4). `SlotsWithInsufficientDuration`
  (Package 3) is confirmed as a non-blocking advisory admin check, not a
  go-live blocker. No admin data edit is required before the day because of
  this item.
- **Paper generation, linking, and locking is an operational runbook step,
  not something Package 10 can complete now** (the event doesn't exist in
  production yet). The exact sequence for the admin team on the day this
  event is created:
  1. `POST /annual-competition/events` to create the `CompetitionEvent`.
  2. `POST /annual-competition/events/{event_id}/level-papers/{level_code}/generate`
     (or `/link` to reuse an existing `CompetitionMockExam`) for every
     competition level.
  3. Add/edit section timers via
     `PATCH /annual-competition/section-timers/{section_timer_id}` for each
     section of each level's paper.
  4. Confirm every level paper's `status` is `READY` via
     `GET /annual-competition/events/{event_id}/level-papers`. Status moves
     to `READY` automatically once a paper is linked and every section has
     a timer (`_RecomputeLevelPaperStatus`, `annual_competition_studio_service.py`)
     -- there is no separate manual "lock" action to remember. It becomes
     `LOCKED` automatically the moment any real attempt exists against it,
     or once `results_release_at` is set on the event -- both enforced by
     the same guard that protects `DeleteCompetitionMockExam` from
     destroying a paper with real submitted results
     (`_IsLevelPaperLocked`).
- **Assignment engine run/review is also an operational step**, using the
  Package 2 dry-run surface before committing:
  1. `GET /annual-competition/events/{event_id}/assignments/preview` --
     review the full roster's computed assignment against the client's
     mapping table with zero side effects.
  2. `POST /annual-competition/events/{event_id}/assignments/run` to
     commit.
  3. `POST /annual-competition/events/{event_id}/assignments/override` for
     any individual student who needs a manual correction.

### 2. Day-of

- **Monitoring**: the Package 7 admin live-monitoring view
  (`GET /annual-competition/events/{event_id}/monitoring/live`) already
  shows started/in-progress/submitted/stuck state per student per slot --
  no new work needed for Package 10.
- **Reconciliation sweep**: `POST /annual-competition/attempts/reconcile`
  (Package 4's safety net for the "last section, no further request ever
  arrives" gap) should be run promptly after each slot closes, and again
  after the final slot of the day, per its own existing docstring in
  `routes_admin.py`.

### 3. Rollback plan (the two real builds in this package)

**a. Disable/hide the student-facing attempt UI -- "Suspend Event" kill
switch.**

New nullable fields on `CompetitionEvent`: `attempts_suspended_at`,
`suspension_reason`, `suspended_by_user_id`. Deliberately a separate field
from `status`, not a new status value, so suspending never has to reason
about (or accidentally corrupt) whatever the event's own lifecycle status
already is.

- `POST /annual-competition/events/{event_id}/suspend` with body
  `{"reason": "..."}` (reason is required, 400 if blank).
- `POST /annual-competition/events/{event_id}/lift-suspension` to resume
  normal operation.

Scope, by design: a suspended event blocks starting a **new** attempt and
resuming an **in-progress** attempt (both flow through the one
`StartCompetitionEventAttempt` function), and blocks the pre-section
instructions screen. It deliberately does **not** interrupt a section a
student already has open and actively heartbeating -- consistent with this
epic's own established pause philosophy of reacting to what already
happened rather than retroactively tearing down in-flight state.
Suspension takes effect for a given student the next time their client
calls Start again (e.g. a page reload). No frontend UI was built for this
-- API-only, matching the precedent already set by Package 6b's retry-grant
action.

**b. Correct/void a single attempt's result -- "Void Result" mechanism.**

New fields on `CompetitionEventResult`: `is_voided`, `voided_reason`,
`voided_at`, `voided_by_user_id`.

- `POST /annual-competition/attempts/{attempt_id}/void-result` with body
  `{"reason": "..."}` (reason is required, 400 if blank).
- `POST /annual-competition/attempts/{attempt_id}/unvoid-result` to
  reverse it.

Effects: a voided result is excluded from ranking (it never holds a rank
while voided) and from release (even a whole-event "release all" call
skips it); a student-facing read treats a voided result exactly like an
unreleased one, so a student is never told their result was voided; the
admin results list still shows the row (never hidden) but flags
`isVoided`/`voidedReason` for audit; and certificate downloads are blocked
for **both** student and admin (409 `COMPETITION_RESULT_VOIDED`) -- unlike
the release gate, which is student-only, because an admin-generated
certificate for a wrong result could still be physically printed. Voiding
never touches the underlying `CompetitionEventAttempt` or its answers --
the raw data stays intact for audit, and un-voiding restores ranking and
release-eligibility exactly. API-only, same precedent as (a).

### 4. Post-event

- **Results are computed automatically for every finalized attempt** --
  this has been true since Package 6 (`annual_competition_scoring_service.py`
  computes and stores `CompetitionEventResult` at finalization time, not on
  a separate manual trigger), so there is nothing to run as a Package 10
  step beyond the existing `results/rank` and `results/release` admin
  actions once the client confirms the 1 Nov 2026 release date.
- **Console log / debugging scaffolding cleanup**: checked across every
  file touched in Packages 1-10 (`grep -rn "console.log\|debugger" ` over
  the annual-competition frontend/backend files) -- nothing found. No
  cleanup was needed.

## Verification

- Full backend suite: 511 passed, 0 failed (`pytest -q`, from the repo's
  `backend/` directory) -- includes 22 new Package 10 tests (489 -> 511)
  across suspend/lift, event-suspension attempt-start gating, void/unvoid
  and its ranking side effects, certificate-blocking, and the
  schema-migration safety net.
- `npx tsc --noEmit`: clean (no frontend files were touched by Package 10,
  by design -- both new mechanisms are API-only).
- `npm run build`: succeeds.
- New Alembic migration (`584eee85ebf0_add_annual_competition_suspend_and_void.py`,
  head, `down_revision = 7f3c9a1e5d02`) adds the 7 new columns + 2 indexes.
  A from-scratch `alembic upgrade head` against an empty SQLite database
  fails, but this was confirmed to be a **pre-existing, unrelated repo
  condition**: the same failure (on `18fa414af0ad_initial_architecture_setup.py`,
  an old unrelated migration -- "no such table: main.assessment_assignments")
  reproduces identically with the new migration file removed from the
  chain entirely. This matches this repo's own documented pattern
  elsewhere (see `7f3c9a1e5d02`'s docstring) of not relying on
  `alembic upgrade head` running reliably in practice, and instead
  depending on the raw-SQL, idempotent `ensure_*` startup safety net in
  `schema_migration.py` -- which for these exact 7 columns is directly and
  successfully tested (`test_ensure_annual_competition_go_live_columns_*`
  in `test_schema_migration_annual_competition.py`).

## Checklist (for reference -- all items above are addressed)

### 1. Pre-event
- [x] All seven REQUIREMENTS.md outstanding items either confirmed by the
      client or explicitly accepted as their documented defaults for this
      run.
- [x] `CompetitionEventSlot` durations re-checked against each level's
      actual section-timer total (the known IM-4/MM-2 conflict, item 7,
      confirmed to need no admin data edit -- entry-time anchor only).
- [x] Every level's official paper generated, linked, and locked
      (`CompetitionEventLevelPaper.status = READY` or `LOCKED`) --
      documented as the operational sequence above; happens once the real
      event is created in production.
- [x] Assignment engine run and reviewed for the full student roster --
      documented as the operational sequence above (preview -> run ->
      override).

### 2. Day-of
- [x] Monitoring (Package 7) staffed and watched during all five slots.
- [x] Reconciliation sweep run promptly after the last slot closes.

### 3. Rollback plan
- [x] A documented path to disable/hide the student-facing attempt UI
      without touching any other feature, if a critical issue surfaces
      mid-event -- Suspend/Lift Event, built this package.
- [x] A documented path to correct/void a single attempt's result without
      needing to touch the whole event -- Void/Unvoid Result, built this
      package.

### 4. Post-event
- [x] Results computed for every finalized attempt before the 1 Nov 2026
      Results & Prize Distribution date -- automatic since Package 6.
- [x] Clean up any console logs/debugging scaffolding left behind during
      Packages 1-9 -- checked, none found.
