# Package 3 (Phase 3): Admin Annual Competition Studio

## Objective
Give admins a screen to stand up and manage a `CompetitionEvent` end to
end, before any student ever sees it.

## Status: BACKEND COMPLETE (2026-09-04) -- frontend screen NOT yet built.
Every API this package's checklist calls for is built, tested, and
committed (on top of Package 2, still unpushed -- bundled per Shailesh's
instruction). The actual admin-facing UI ("give admins a screen") is
deliberately left as a separate, explicit next step rather than silently
counted as done -- see "What's NOT built yet" below.

## What was built (backend)
- `backend/app/services/annual_competition_studio_service.py`: event
  CRUD, slot CRUD (with level-code validation and start<end validation),
  `GenerateAndLinkCompetitionEventLevelPaper` (reuses the existing
  `GenerateCompetitionMockDraft` engine) and
  `LinkExistingCompetitionEventLevelPaper`, `DEFAULT_SECTION_TIMERS_BY_LEVEL_CODE`
  (REQUIREMENTS.md Section 3.4, transcribed verbatim, auto-seeded onto a
  level paper the moment it's generated/linked), the `PENDING -> READY ->
  LOCKED` status lifecycle (`_IsLevelPaperLocked` mirrors
  `DeleteCompetitionMockExam`'s guard condition exactly -- checked live,
  not from a possibly-stale stored column), `SlotsWithInsufficientDuration`
  (turns REQUIREMENTS.md item 7 into a live computed check instead of just
  a comment), and `OverrideCompetitionEventAssignment` (the human
  ADMIN_OVERRIDE path Package 2's engine already respects).
- `backend/app/api/routes_admin.py`: 15 new endpoints under
  `/api/admin/annual-competition/...` -- events, slots, level papers
  (generate/link), section timers, and assignment override. All
  admin-only (`admin_dep`), same as every other admin route in this file.
- `backend/tests/test_annual_competition_studio_service.py`: 25 new
  tests -- event/slot CRUD and validation, the known IM-4/MM-2 slot
  -duration conflict actually gets flagged by
  `SlotsWithInsufficientDuration`, the lock guard triggers on both a real
  attempt and on `results_release_at` being set, MM-L2's "no curriculum
  Level yet" error is clean (not a crash), and every one of
  `DEFAULT_SECTION_TIMERS_BY_LEVEL_CODE`'s 11 levels sums to exactly the
  minutes REQUIREMENTS.md documents. Full backend suite: 398 passed (373
  existing + 25 new), zero regressions.
- Two real bugs caught and fixed by these tests before they ever reached
  Shailesh: (1) a missing `db.flush()` after seeding section timers meant
  a freshly-linked paper's status never advanced past PENDING; (2) the
  lock check on generate/relink was reading the *stored* status column
  instead of live-recomputing it, so a paper that became locked (e.g. a
  real attempt landed) after being linked could still be silently
  relinked. Both fixed; both now have a regression test.

## What's NOT built yet (explicitly deferred, not silently skipped)
- **The actual admin frontend screen.** Every API above exists; nothing
  in `frontend/app/admin/...` consumes them yet. This package's own
  stated objective is "give admins a screen" -- that half is still open.
- No paper-generation registry entry for MM-L2 (Package 2/3 both flag
  this; adding it is real curriculum-content work, not wiring).
- `CompetitionEventSlot.applicable_level_codes_json` is the ONLY place
  the known IM-4/MM-2 slot-length conflict (item 7) can be fixed once
  MathPath answers -- `SlotsWithInsufficientDuration` will stop flagging
  a slot the moment its window is widened or the level moved to its own
  slot; no code change needed either way.

## Checklist

### 1. Event + slots
- [x] Create/edit a `CompetitionEvent` (name, date, results-release date).
- [x] Create/edit `CompetitionEventSlot` rows (mode, time window,
      applicable level codes) -- fully data-driven, since the known
      IM-4/MM-2 slot-duration conflict (REQUIREMENTS.md item 7) must be
      fixable here without a deploy.

### 2. Papers
- [x] Generate or link each competition level's official paper via the
      existing `GenerateCompetitionMockDraft` engine, creating the
      `CompetitionEventLevelPaper` row (`mock_exam_id` FK).
- [x] Define/edit `CompetitionEventSectionTimer` rows per level paper
      (auto-seeded from REQUIREMENTS.md defaults, admin-editable after).
- [x] Surface `CompetitionEventLevelPaper.status`/`locked_at` so an admin
      can see when a paper has become immutable (Package 1's guard).

### 3. Assignments
- [x] Run the Package 2 assignment engine (dry-run first, then commit) --
      already built in Package 2 (`/assignments/preview`, `/assignments/run`).
- [x] Review/override individual student assignments
      (`assignment_source = ADMIN_OVERRIDE`) -- `OverrideCompetitionEventAssignment`.

### 4. Verification
- [x] RBAC: every write endpoint here is admin-only (`admin_dep`, same
      dependency every other admin route uses).
- [x] Attempting to edit/regenerate a locked level paper's linked mock
      exam surfaces the Package 1 guard's error clearly
      (`COMPETITION_LEVEL_PAPER_LOCKED`, tested against both trigger
      conditions).

### 5. Frontend (NOT STARTED)
- [ ] Admin screen(s) under `frontend/app/admin/annual-competition/...`
      consuming the 15 endpoints above: event creation/edit, slot editor
      (with the duration-conflict warning surfaced visually), paper
      generate/link per level, section-timer editor, assignment
      run/preview/override table.
