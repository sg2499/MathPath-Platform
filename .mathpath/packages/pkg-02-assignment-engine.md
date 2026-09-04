# Package 2 (Phase 2): Assignment Engine

## Objective
Auto-assign every student to a competition level for a given
`CompetitionEvent`, using an explicit, auditable mapping table (not a
generic reverse-lookup of `Level.next_level_id`), plus Bridge/Master
Module lesson-milestone placement reused from `lesson_progress_service.py`.

## Status: COMPLETE (built and verified 2026-09-04, on top of the
rebased `feature/annual-competition-pkg1-data-model` branch -- not yet
pushed/merged/deployed; batched with the rest of the packages per
Shailesh's instruction to bundle push-merge-deploy rather than doing it
per package).

## What was built
- `backend/app/services/annual_competition_assignment_service.py` -- the
  full engine: `DIRECT_LEVEL_MAPPING` (the literal table below), Bridge/
  Master lesson-milestone branches, `ComputeAssignmentsForRoster` (pure,
  batched, no DB writes), `PreviewAnnualCompetitionAssignments` (dry-run),
  `RunAnnualCompetitionAssignmentEngine` (commits AUTO rows, never touches
  an `ADMIN_OVERRIDE` row), `IsRegistryBackedLevelCode` (flags a computed
  target with no `*_COMPETITION_LEVEL_REGISTRY` entry yet, e.g. MM-L2).
- `backend/app/api/routes_admin.py` -- two new endpoints:
  `GET /api/admin/annual-competition/events/{event_id}/assignments/preview`
  and `POST /api/admin/annual-competition/events/{event_id}/assignments/run`,
  following the exact thin-route/service-function pattern already used for
  Competition Mock.
- `backend/tests/test_annual_competition_assignment_service.py` -- 26 new
  tests (every mapping row, every Bridge/Master boundary including "one
  lesson short of the milestone", the YLM-L1 exclude-by-default toggle,
  upsert + admin-override preservation, no-rule-matched rows never written).
  Full backend suite: 373 passed (347 existing + 26 new), zero regressions.

## Key findings from this package's own research (not assumptions --
verified against the actual seed/model code and `PRODUCT_RULES.md`)

1. **The client's "PL-N" labels are confirmed to be "PM-LN"**, not a
   guess: `Level.level_name` for `PM-L1` is literally "Preparatory Level 1"
   (seed_preparatory_module.py). Client's "IM-N" = platform's "IM-LN"
   likewise ("Intermediate Module Level N").
2. **YLM was collapsed to a single level (YLM-L1) on 2026-08-12**
   (`PRODUCT_RULES.md` "Curriculum Progression Paths", `seed_ylm_phase1.py`
   `_delete_obsolete_levels()`). This means the engine cannot distinguish a
   "YLP-1" sub-cohort from "YLP-2/YLP-3" -- `INCLUDE_YLM_L1_STUDENTS`
   (defaulting `False` per REQUIREMENTS.md item 1) is therefore a
   whole-YLM-L1-population toggle, not YLP-1-specific. If MathPath's answer
   turns out to need finer granularity, that requires a NEW lesson-progress
   signal within YLM-L1 that doesn't exist in the requirements yet --
   flag back to MathPath rather than guessing a boundary.
3. **`Level.next_level_id` was deliberately NOT reused** for this mapping.
   Per `PRODUCT_RULES.md`, IM-L1 has two legitimate predecessors depending
   on entry path (PM-L4 via Path 1/2, BM-L1 via Path 3, which never
   touches PM). A generic reverse-lookup would misassign Bridge-path
   students at IM-L1. The explicit `DIRECT_LEVEL_MAPPING` table sidesteps
   this entirely, exactly as planned.
4. **Master Module has only one seeded curriculum level (MM-L1)** --
   there is no "MM-L2" `Level` row, and `MM_COMPETITION_LEVEL_REGISTRY`
   only has one key. This is expected, not a bug: MathPath's own internal
   dev spec already describes MM1/MM2 as two competition PAPER tiers
   carved out of the same Master Module content (mirroring Bridge's single
   level fanning out to 4 PL-tier placements). The engine correctly
   computes `MM-L2` as the target for a student who's finished the full
   Master Module; `requiresNewPaperRegistryEntry` is surfaced in the
   preview endpoint so Package 3 (paper generation) inherits a known,
   tracked gap rather than a surprise -- it will need to add an `MM-L2`
   registry entry before it can generate that paper.

## Checklist

### 1. Mapping-table service
- [x] A literal lookup table matching REQUIREMENTS.md's Section 1 table
      verbatim (current group -> assigned competition level), keyed on the
      real internal level codes (`PM-L*`, `IM-L*`, `BM-L*`, `YLM-L*`), not
      the client doc's own `PL-*`/`Level N` labels.
- [x] Bridge Module placement by lesson milestone (15/25/35/full) using
      `IsLessonFullyClearedForStudent` / `ComputeLessonProgressForStudents`.
- [x] Master Module placement by lesson-16 threshold and full completion,
      same reused functions.
- [x] "Between milestones" default: a Bridge student below lesson 15 has
      no defined target in REQUIREMENTS.md at all (only 15/25/35/full are
      given) -- rather than guess a floor below the lowest documented
      milestone, these students are flagged `no_rule_matched` /
      `BRIDGE_BELOW_LESSON_15_NO_DEFINED_TARGET` and get no row written,
      visible in the dry-run preview for admin review. Master's threshold
      IS fully covered for every case (below lesson 16 -> IM-4), so no gap
      there.
- [x] YLP-1 participation config flag, defaulting to excluded
      (REQUIREMENTS.md item 1) -- see finding #2 above for why this is a
      whole-YLM-L1 toggle rather than YLP-1-specific.

### 2. Persistence
- [x] Writes `CompetitionEventAssignment` rows with `assignment_source =
      AUTO`.
- [x] Never overwrites a row already marked `ADMIN_OVERRIDE`.

### 3. Admin dry-run/audit view
- [x] `GET .../assignments/preview` computes and displays what the mapping
      *would* produce for every student in an event, without committing
      any rows, including whether it would clobber an existing
      ADMIN_OVERRIDE (it never does) and whether the target level has no
      paper-generation registry entry yet.

### 4. Verification
- [x] Unit test every row of the client's mapping table.
- [x] Bridge/Master boundary edge cases: exactly on a milestone, one
      lesson short, one lesson over, full completion.
- [x] Re-running the engine never downgrades an `ADMIN_OVERRIDE` row
      (tested directly, plus preview confirms it would be preserved).
- [x] Full existing backend suite (373 tests total) still green.

## Not built in this package (by design -- later packages' scope)
- No slot assignment (`CompetitionEventAssignment.slot_id` stays null --
  slots don't exist until Package 3's admin studio creates them for a real
  event).
- No frontend/admin UI for the preview -- API only for now, per Package 3's
  scope ("Admin Annual Competition Studio").
- No `MM-L2` paper-generation registry entry -- Package 3's job, now a
  tracked, visible gap rather than a surprise.
