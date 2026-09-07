# Package 6b: Admin "Technical Issue" Retry Override

## Objective
REQUIREMENTS.md outstanding item 6: "Only once unless there is a technical
issue from our end." The single-attempt rule itself was already enforced
unconditionally by Package 4 (`TERMINAL_ATTEMPT_STATUSES` rejects any
second `StartCompetitionEventAttempt` call once the existing attempt
reaches SUBMITTED/FINALIZED). What was missing, flagged repeatedly in both
pkg-06's and pkg-07's own "Not built in this package" sections as "a
small, self-contained addition still needed before go-live," was the
admin-only escape hatch for a genuine technical-issue retake.

Not part of the original 10-package rollout sequence (see
`.mathpath/epics/annual-competition-plan.md`) -- built as its own small,
self-contained addition per Shailesh's explicit go-ahead, in between
Package 7 (monitoring) and Package 8 (still blocked on client
confirmation of leaderboard/certificate scope).

## Status: COMPLETE (2026-09-05)

## What was built (backend)
- **`CompetitionEventAttemptRetryGrant`** (`backend/app/models/models.py`) --
  new table, deliberately mirroring the pre-existing
  `AssignmentReattemptPermission` (DPS) model's own shape and lifecycle
  (APPROVED -> USED, checked at start time, consumed the moment the
  resulting fresh attempt is created) rather than the more elaborate
  `BuildManualRetryAssignment`/`allow_assignment_reattempt_route` DPS
  precedent, which manufactures a whole new `Assignment` row -- that
  doesn't apply here, since a `CompetitionEventAssignment` is a permanent
  event enrollment, not a retryable per-attempt object. `reason` is
  required (NOT NULL), unlike the DPS precedent's nullable `reason` -- a
  retry override against a real, scored competition attempt should never
  be grantable without a stated reason on record.
- **Alembic migration** `7f3c9a1e5d02_add_annual_competition_retry_grants.py`
  (head, revises Package 1's `3025bba70ab3`) -- creates
  `competition_event_attempt_retry_grants`. Also backfills
  `competition_event_attempt_answers` (see "Discovered and fixed" below).
- **`backend/app/services/annual_competition_attempt_service.py`**:
  - `_ActiveRetryGrant(db, AssignmentId)` -- an APPROVED, unused grant for
    the assignment, if any.
  - `_BuildFreshAttempt(...)` -- the attempt-creation logic (slot gate,
    level-paper/section-timer lookup, section-state seeding) extracted out
    of `StartCompetitionEventAttempt` into its own shared function, so a
    brand-new first attempt and a retry-granted subsequent one run through
    identical logic -- a retry is just a second call to it with
    `attempt_number = previous + 1`, not a special case. `_CheckSlotGate`
    has no upper bound (only blocks starting *before* a slot opens), so it
    applies safely to a retry-granted attempt without needing to be
    bypassed.
  - `StartCompetitionEventAttempt`'s terminal-status rejection branch now
    checks `_ActiveRetryGrant` before rejecting; if found, it builds the
    new attempt, consumes the grant (status -> USED, `used_at`,
    `used_attempt_id`) in the same transaction, and returns it. No grant ->
    unchanged rejection (`COMPETITION_ATTEMPT_ALREADY_SUBMITTED`). The old,
    terminal attempt and its already-computed `CompetitionEventResult` are
    left completely untouched.
  - `GrantAnnualCompetitionAttemptRetry(db, *, AttemptId, GrantedBy,
    Reason)` -- admin-only creation. Requires a terminal (SUBMITTED/
    FINALIZED) attempt (`409 COMPETITION_ATTEMPT_NOT_TERMINAL` otherwise),
    a non-blank reason (`400 COMPETITION_RETRY_REASON_REQUIRED`), and
    rejects a second grant while one is already unused for the same
    assignment (`409 COMPETITION_RETRY_ALREADY_GRANTED`).
  - `ListAnnualCompetitionAttemptRetryGrants(db, *, EventId)` -- minimal
    admin visibility, newest first.
- **`backend/app/api/routes_admin.py`** -- two new admin-only endpoints:
  `POST /annual-competition/attempts/retry-grants` (body: `attemptId`,
  `reason`) and `GET /annual-competition/events/{event_id}/attempts/retry-grants`.
  API-only for now -- the same deliberate deferral this file's other
  Annual Competition endpoints have already used (Package 2's preview/run,
  Package 6's rank/release before Package 7 eventually gave those a UI).
- **`backend/app/services/schema_migration.py`** -- `ensure_annual_competition_tables()`
  gained a matching raw-SQL `CREATE TABLE IF NOT EXISTS` block (+ indexes)
  for `competition_event_attempt_retry_grants`, and one for the backfilled
  `competition_event_attempt_answers` (see below) -- this function, not
  Alembic, is what a real deploy has actually been relying on (this
  codebase's own comments elsewhere note `alembic upgrade head` has not
  always been run reliably here).
- Tests: 7 new cases in `backend/tests/test_annual_competition_attempt_service.py`
  (grant rejected against a non-terminal attempt, blank reason rejected,
  unknown attempt is 404, unchanged rejection with no grant, a granted
  retry produces attempt_number 2 and leaves the old FINALIZED attempt
  untouched, the grant is consumed and not reusable for a third attempt,
  a second grant is rejected while one is still unused) + 4 new cases in
  the new `backend/tests/test_schema_migration_annual_competition.py`
  (full table set present, both backfilled tables' columns match the ORM
  model exactly, idempotent re-run). Full backend suite: 477 passed
  (466 baseline after Package 7 + 11 new), zero regressions.

## Discovered and fixed (pre-existing gap, not part of this feature's own scope)
While adding the new table the same way `competition_event_attempt_answers`
(Package 5) is created, found that table had a SQLAlchemy model and live
runtime dependents (Package 5's answer-save endpoint, Package 6's "first
mistake" tie-break) but had never actually been added to either an Alembic
migration or `ensure_annual_competition_tables()`'s raw-SQL startup safety
net -- only ever created implicitly by `Base.metadata.create_all()` in
tests. A production deploy relying on the safety net (rather than
`alembic upgrade head`) would have hit "no such table" the first time a
student saved a competition answer. Backfilled via both paths (the new
Alembic migration's `upgrade()`, and a matching block in
`ensure_annual_competition_tables()`) since the same migration file was
already being touched for the same underlying reason. Flagged here
explicitly rather than silently folded in.

Separately (noted, not fixed, genuinely out of scope): confirmed via
`alembic upgrade head` against a brand-new empty SQLite database that this
repo's very first migration (`18fa414af0ad_initial_architecture_setup.py`)
fails on its own, unrelated to anything Annual Competition -- reproduced
identically when stopping at Package 1's own migration
(`3025bba70ab3`), i.e. before this feature's migration is ever reached.
Pre-dates the Annual Competition epic entirely; not touched here.

## Checklist
- [x] Single-attempt rule remains absolute by default (unchanged).
- [x] Admin-only override for a genuine technical-issue retake, requiring
      a stated reason.
- [x] A granted retry produces a new attempt on the same assignment with
      the next `attempt_number` -- not a new assignment/enrollment.
- [x] The grant is consumed exactly once; a third attempt is rejected
      exactly like the first, absent a new grant.
- [x] The original terminal attempt and its computed result are never
      mutated by a later granted retry.
- [x] `competition_event_attempt_answers` backfilled into both the
      migration chain and the startup safety net (discovered gap).

## Not built in this package (by design)
- No admin-facing "Grant Retry" UI -- API only for now, matching this
  file's own established precedent of shipping admin actions API-first
  and adding a UI in a later pass if/when needed (Package 7 did exactly
  this for Package 4's reconcile sweep and Package 6's rank/release).
- Package 8 (certificates/leaderboard visibility) remains blocked on
  client confirmation -- unrelated to and unaffected by this addition.
