# Package 2 (Phase 2): Assignment Engine

## Objective
Auto-assign every student to a competition level for a given
`CompetitionEvent`, using an explicit, auditable mapping table (not a
generic reverse-lookup of `Level.next_level_id`), plus Bridge/Master
Module lesson-milestone placement reused from `lesson_progress_service.py`.

## Status: NOT STARTED -- next package after Package 1.

## Checklist

### 1. Mapping-table service
- [ ] A literal lookup table matching REQUIREMENTS.md's Section 1 table
      verbatim (current group -> assigned competition level), keyed on the
      real internal level codes (`PM-L*`, `IM-L*`, `BM-L*`, `YLM-L*`), not
      the client doc's own `PL-*`/`Level N` labels.
- [ ] Bridge Module placement by lesson milestone (15/25/35/full) using
      `IsLessonFullyClearedForStudent` / `ComputeLessonProgressForStudents`.
- [ ] Master Module placement by lesson-16 threshold and full completion,
      same reused functions.
- [ ] "Between milestones" default: floor to highest milestone reached,
      clearly commented as a default pending client confirmation
      (REQUIREMENTS.md item 3).
- [ ] YLP-1 participation config flag, defaulting to excluded
      (REQUIREMENTS.md item 1).

### 2. Persistence
- [ ] Writes `CompetitionEventAssignment` rows with `assignment_source =
      AUTO`.
- [ ] Never overwrites a row already marked `ADMIN_OVERRIDE`.

### 3. Admin dry-run/audit view
- [ ] An endpoint/screen that computes and displays what the mapping
      *would* produce for every student in an event, without committing
      any rows -- so the mapping can be checked against the client's own
      table before being relied on for real.

### 4. Verification
- [ ] Unit test every row of the client's mapping table.
- [ ] Bridge/Master boundary edge cases: exactly on a milestone, one
      lesson short, one lesson over.
- [ ] Re-running the engine never downgrades an `ADMIN_OVERRIDE` row.
