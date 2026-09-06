# Package 9 (Phase 9): Full Rehearsal + Regression

## Objective
Prove the whole system end to end with test accounts before it ever
touches real student data, and prove it hasn't broken anything else.

## Status: COMPLETE (2026-09-06)

## What was built

### End-to-end rehearsal -- `backend/tests/test_annual_competition_full_rehearsal.py` (NEW)
One test (`test_full_rehearsal_across_five_slots_with_disconnects_and_abandonment`)
that stitches Packages 1-8 together into a single simulated slice of the
real 11 Oct 2026 day, using nothing but the same public service functions
the actual API routes call -- it does not re-test any single package's own
logic in isolation (that stays in each package's own test file):

- **All five slots**: one event with three `OFFLINE` slots, one
  `ONLINE_INDIA`, one `ONLINE_INTL` -- one offline slot deliberately still
  in the future, so the Package 5 slot gate is exercised for real
  (`COMPETITION_SLOT_NOT_OPEN_YET`, and confirmed no attempt row is ever
  created for that student) rather than assumed to work from its own
  isolated tests.
- **A genuine disconnect-and-resume**, simulated the only faithful way
  possible given how the mechanic actually works: backdating the active
  section's `last_heartbeat_at` (simulating a real gap in heartbeats
  arriving at the server) and then sending one real heartbeat, exactly as
  a reconnecting client would -- never a synthetic edit of
  `remaining_seconds_at_last_heartbeat` itself. Done twice for the same
  student, once in an `ABACUS` section and once in a `VISUAL` section
  (PM-L2's real two section types), confirming each time the deduction is
  capped at `HEARTBEAT_GRACE_SECONDS` (45s) regardless of how long the
  simulated gap was (20 min, then 15 min).
  - Checklist item 2's "per section type" is read as
    `CompetitionEventSectionTimer.mode` -- the only sense in which a
    competition section has a "type" anywhere in this codebase (confirmed
    against models.py's own comment on that column). Reading
    `RecordCompetitionEventHeartbeat` confirms the pause/grace-window math
    never branches on `mode` at all, so this is a rehearsal-realism choice
    (a student genuinely disconnecting in each of their two sections), not
    a search for mode-specific behavior that doesn't exist -- documented
    in the test file's own module docstring rather than silently picked.
- **The reconciliation sweep catching an abandoned attempt**: one student
  is started and then never touched again (closed tab, event day over);
  its section's `last_heartbeat_at` is backdated 3 hours so it reads as
  genuinely paused. `ReconcileExpiredCompetitionEventAttempts` force-closes
  it through to `FINALIZED` (with a real `CompetitionEventResult`
  computed via the same Package 6 hook every other path uses), while a
  second student who heartbeated moments earlier is confirmed untouched by
  the same sweep call -- and a second sweep run finds nothing left to do
  (`reconciledCount == 0`), confirming the documented idempotency.
- **Full results pipeline against attempts this rehearsal itself
  produced**: rank (accuracy desc, then time asc -- confirmed against four
  genuinely different outcomes: a clean 100%/0s completion, a 100%
  completion with two capped disconnects costing 90s, a 50%-accuracy
  finish, and the reconciled 0%-accuracy abandonment, landing in exactly
  that rank order), release, a student's own-result-only read, and --
  the one assertion nothing else in this repo makes -- a certificate
  downloaded for the *reconciled, never-voluntarily-submitted* attempt,
  confirming "every finalized participant is eligible" (Package 8's
  confirmed decision) holds even when FINALIZED was reached via the
  reconciliation sweep rather than a manual submit.

### Reuse-guard regression -- `backend/tests/test_annual_competition_studio_service.py`
A full-repo grep before writing anything confirmed a real, previously
uncovered gap: `_IsLevelPaperLocked` (this package's own mirrored read-side
check, used by the Studio's link/regenerate actions) was already
well-tested, but nothing anywhere had ever called
`DeleteCompetitionMockExam` itself (`competition_mock_generation_service.py`)
directly against an Annual-Competition-linked exam. Three new tests close
that gap at the actual enforcement point:
- `test_delete_competition_mock_exam_rejected_once_a_real_attempt_exists`
- `test_delete_competition_mock_exam_rejected_once_event_results_are_release_locked`
- `test_delete_competition_mock_exam_still_allowed_when_not_locked` (the
  control case -- a linked-but-never-attempted, never-release-locked mock
  exam is still a real practice mock and must still delete cleanly)

### Full regression
- Full backend suite: **489 passed** (485 after Package 8 + 1 rehearsal +
  3 reuse-guard tests), zero regressions -- includes every existing DPS,
  Assessment, and Competition Mock test file untouched and green.
- `npx tsc --noEmit`: clean.
- `npm run build` (frontend): succeeds, zero warnings, zero errors (no
  frontend files changed by this package -- this run is the "prove nothing
  else broke" confirmation the checklist itself asks for).

## Checklist

### 1. End-to-end rehearsal
- [x] Simulate the actual 11 Oct 2026 timeline with test accounts across
      all five slots (offline x3, online-India, online-international).
- [x] At least one simulated disconnect-and-resume per section type,
      exercising the Package 4 pause mechanic for real.
- [x] Simulate the reconciliation sweep catching an abandoned attempt.

### 2. Full regression
- [x] Existing DPS, Assessment, and Competition Mock test suites stay
      green throughout -- this feature must not touch their behavior.
- [x] `npm run build` (frontend) and the full backend pytest suite both
      pass clean.

### 3. Reuse-guard regression
- [x] A test asserting `DeleteCompetitionMockExam` is rejected once a
      `CompetitionEventLevelPaper`/`CompetitionEventAttempt` references
      that exam (Package 1's guard, re-verified here as part of the full
      suite rather than only in isolation).

## Not built in this package (out of scope, not requested)
- No load/performance testing (concurrent real-world traffic simulation)
  -- this rehearsal proves correctness of the mechanics, not capacity;
  revisit only if a real concern about concurrent load on 11 Oct comes up.
- No real-browser/UI rehearsal (Playwright or similar) -- everything here
  runs at the service layer, matching every other Annual Competition
  package's own test scope in this repo. The student/admin screens
  themselves were already verified per-package (tsc/build clean,
  Packages 5/7/8's own manual/visual review).
