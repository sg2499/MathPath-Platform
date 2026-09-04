# Package 1 (Phase 1): Data Model

## Objective
Add the new, isolated Annual Competition tables -- parallel to, not built on
top of, the existing Competition Mock tables -- plus the immutability guard
protecting a linked `CompetitionMockExam` from the practice-mock
delete/regenerate path once real competition attempts or a locked results
date exist.

## Status: COMPLETE (2026-09-04)

## Checklist

### 1. Models (`backend/app/models/models.py`)
- [x] `CompetitionEvent`
- [x] `CompetitionEventSlot`
- [x] `CompetitionEventLevelPaper` (FK to `CompetitionMockExam.id` -- the
      reuse point for frozen, identical-paper generation)
- [x] `CompetitionEventSectionTimer` (child of `CompetitionEventLevelPaper`)
- [x] `CompetitionEventAssignment`
- [x] `CompetitionEventAttempt`
- [x] `CompetitionEventAttemptSectionState` (child of `CompetitionEventAttempt`)
- [x] `CompetitionEventResult`

### 2. Production migration safety net (`backend/app/services/schema_migration.py`)
- [x] `ensure_annual_competition_tables()` added, mirroring the exact
      `ensure_competition_mock_tables()` pattern (raw `CREATE TABLE IF NOT
      EXISTS` + `CREATE INDEX IF NOT EXISTS`, idempotent, no-ops once
      tables exist) -- this is the *reliable* production path per this
      file's own documented history ("Renders/deploys don't always run
      `alembic upgrade head` reliably").
- [x] Registered in `backend/app/main.py`'s `on_startup()` import list and
      call sequence, after `ensure_mock_accuracy_fixed()`.

### 3. Alembic migration (`backend/alembic/versions/`)
- [x] `3025bba70ab3_add_annual_competition_tables.py`, chained on top of
      the existing head (`6357865120b5_add_punctuality_status_to_attempts`).
      Matches the hand-inspected style of prior new-table migrations (e.g.
      `9d8315cb5f08_add_gamification_and_economy_schemas.py`).

### 4. Immutability guard (`backend/app/services/competition_mock_generation_service.py`)
- [x] `DeleteCompetitionMockExam` rejects (`409
      COMPETITION_MOCK_LOCKED_BY_ANNUAL_EVENT`) once the exam is linked to
      a `CompetitionEventLevelPaper` whose event has `results_release_at`
      set, or once any `CompetitionEventAttempt` references that level
      paper. An unrelated mock, or one linked but with neither condition
      true, still deletes normally.

### 5. Verification
- [x] `backend/app/models/models.py` imports cleanly; all 8 new tables
      register in `Base.metadata.tables`.
- [x] `Base.metadata.create_all()` creates all 8 tables with correct
      columns on a fresh SQLite DB.
- [x] `ensure_annual_competition_tables()` run standalone (no `create_all`
      first, simulating a pre-existing DB) creates all 8 tables correctly,
      and is idempotent when run twice.
- [x] The Alembic migration's `upgrade()`/`downgrade()` DDL round-trips
      cleanly against a SQLite DB seeded with every other table via
      `create_all` (validates FK/unique-constraint/index DDL is
      syntactically correct; full `alembic upgrade head` from a truly
      empty DB is not exercised here since it's a pre-existing SQLite
      limitation in this repo's migration chain, unrelated to this change
      -- production runs Postgres, and CI never calls `alembic upgrade
      head` either, per `.github/workflows/mathpath-ci.yml`).
- [x] Guard logic exercised directly against a real SQLite-backed session
      across 4 scenarios: unrelated mock deletes normally; linked mock
      with no release date and no attempts deletes normally; linked mock
      whose event has `results_release_at` set is rejected; linked mock
      with a real `CompetitionEventAttempt` (event not yet release-locked)
      is rejected.
- [x] Full existing backend test suite (`backend/tests/`, 347 tests)
      passes unchanged -- zero regressions to DPS, Assessment, or
      Competition Mock behavior.

### Naming note carried forward from REQUIREMENTS.md
`competition_level_code` on these tables must match the internal
`*_COMPETITION_LEVEL_REGISTRY` keys (e.g. `PM-L1`, `IM-L4`, `MM-L1`,
`BM-L1`, `YLM-L1`), confirmed directly from
`pm_/bm_/ylm_/competition_mock_generation_service.py` -- **not** the
client questionnaire's own `PL-1`/`Level N` labels, which do not literally
match. Any translation between the two is a service/UI-layer concern for
Package 2 (Assignment Engine), never stored as the code itself.
