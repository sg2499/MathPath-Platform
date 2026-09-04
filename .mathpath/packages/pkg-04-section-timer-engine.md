# Package 4 (Phase 4): Section-Timer + Pause Engine

## Objective
The highest-risk, most novel piece of this build. Independently timed
sections with genuine pause-on-disconnect -- nothing like this exists
anywhere in this codebase today (DPS/Assessment/Competition Mock all use
one whole-attempt wall-clock timer with no pause concept). Built and
tested in isolation with synthetic attempts before it is wired into any
student-facing screen.

## Status: COMPLETE (2026-09-04)

## What was built
- `backend/app/services/annual_competition_attempt_service.py` (new).
  See its module docstring for the full design writeup, including the
  exact reasoning behind the grace-window formula
  (`EffectiveElapsed = min(RawGap, HEARTBEAT_GRACE_SECONDS)`, 45s) --
  this was the one piece of real judgment the plan's prose left open,
  and both are documented in code, not just decided silently.
  - `StartCompetitionEventAttempt`: creates the attempt (eagerly
    creating every `CompetitionEventAttemptSectionState` row up front,
    one per the level paper's section timers, activating section 1) or
    resumes an existing `IN_PROGRESS` one -- either way reissuing a
    fresh `session_token`, which IS the "resume here" remediation.
  - `RecordCompetitionEventHeartbeat`: the heartbeat mechanic itself.
  - `SubmitCompetitionEventSection`: manual early-submit of the active
    section (the schema's `COMPLETED` vs `AUTO_SUBMITTED` distinction
    on `CompetitionEventAttemptSectionState.status` only makes sense
    with both an explicit and an automatic path to a section ending --
    built both, not just the timer-expiry one).
  - `GetCompetitionEventAttemptForStudent`: read-only, but still runs
    the lazy self-correction check, matching "any request touching an
    attempt."
  - `ReconcileExpiredCompetitionEventAttempts`: the safety-net sweep --
    finalizes every `IN_PROGRESS` attempt whose active section is
    *currently paused* (reuses the same grace-window definition, no new
    threshold invented), cascading through any remaining sections so an
    abandoned attempt ends up fully `SUBMITTED`, not half-advanced.
  - Attempts reach `SUBMITTED`, never `FINALIZED` -- per the lifecycle
    comment already on `CompetitionEventAttempt` in models.py,
    `FINALIZED` requires a computed `CompetitionEventResult`, which is
    Package 6 (Scoring + Results), not this package.
- `backend/app/api/routes_student.py`: 4 new student-facing routes under
  `/api/student/annual-competition/attempts/...` (start, get, heartbeat,
  section-submit).
- `backend/app/api/routes_admin.py`: 1 new admin route,
  `POST /api/admin/annual-competition/attempts/reconcile`.
- `backend/tests/test_annual_competition_attempt_service.py`: 18 new
  tests -- every item in the verification checklist below, plus
  ownership enforcement and reconciliation idempotency. Full backend
  suite: 416 passed (398 existing + 18 new), zero regressions.
- One real bug caught by this test suite before it ever ran against
  real data: the reconciliation sweep's cascade-through-remaining-
  sections loop infinite-looped in the test session (which runs with
  `autoflush=False`, same as Package 3's tests) because mutating a
  section's `status` in memory and then immediately re-querying
  `WHERE status == "ACTIVE"` without a flush kept returning the stale,
  pre-mutation row forever -- the exact same bug class Package 3 hit
  with its section-timer seeding. Fixed with one `db.flush()` at the end
  of the shared `_AdvanceOrFinalize` helper, which every entry point
  routes through, closing the gap for all of them at once (not just
  reconciliation -- the heartbeat/submit paths had the same latent risk
  whenever a lazy self-correction had just run).

## What's NOT built yet (explicitly out of scope, not silently skipped)
- No student-facing UI. Package 5 owns the pre-section instructions
  screen, the live multi-section timer display, and slot-gated start
  ("can't begin before your scheduled time") -- `StartCompetitionEventAttempt`
  deliberately does not enforce slot/event timing itself; see that
  function's own docstring.
- No answer capture. There is no `CompetitionEventAttemptAnswer` table
  yet and this package doesn't add one -- Package 4 is the timer/pause
  engine only. A student's actual responses are Package 5/6 territory.
- No scoring. `CompetitionEventResult` computation and the
  `SUBMITTED -> FINALIZED` transition are Package 6.

## Checklist

### 1. Heartbeat mechanic
- [x] Client sends a heartbeat every ~5-10s while a section is active.
- [x] Server persists `remaining_seconds_at_last_heartbeat` +
      `last_heartbeat_at` on the matching
      `CompetitionEventAttemptSectionState` row on **every single**
      heartbeat -- never batched, so a server restart mid-competition
      never loses more than one heartbeat interval.
- [x] A fixed grace window (30-60s; 45s) absorbs normal network jitter
      before a gap between heartbeats counts as elapsed time.
- [x] No explicit "disconnect" event -- absence of heartbeats past the
      grace window is the only pause signal, since this repo has no
      WebSocket infrastructure.

### 2. Single-active-session guard
- [x] Attempt-start issues a fresh `session_token`.
- [x] Heartbeat/submit calls carrying a stale token are rejected
      (`COMPETITION_ATTEMPT_SESSION_SUPERSEDED`), not silently accepted.

### 3. Auto-advance + finalization
- [x] Any request touching an attempt lazily checks whether the active
      section's remaining time has hit zero (same pattern as
      `EnsureCompetitionAttemptActiveOrSubmit`); if so, finalizes that
      section and opens the next one, or finalizes the whole attempt on
      the last section.
- [x] Reconciliation sweep: a lightweight endpoint (admin-triggered) that
      finalizes any attempt whose last section expired but was never
      followed by another request -- there is no scheduler/cron anywhere
      in this backend, so nothing else would ever touch that row.

### 4. Verification (highest coverage of any package)
- [x] Heartbeat gap under the grace window -> full real elapsed time
      deducted (normal ticking, no erroneous loss).
- [x] Heartbeat gap over the grace window -> deduction capped at the
      grace window on resume, never the full disconnect duration.
- [x] Stale `session_token` rejected on every mutating endpoint.
- [x] Section auto-advances at exactly zero remaining time.
- [x] Whole-attempt finalization triggers correctly on the last section
      (both the timer-expiry and manual-submit paths).
- [x] Reconciliation sweep catches an attempt nobody ever touches again
      after its last section expires, cascades through every remaining
      section, leaves a currently-live attempt alone, and is idempotent.
- [x] All of the above run against synthetic attempts only -- no student
      UI involved yet.
