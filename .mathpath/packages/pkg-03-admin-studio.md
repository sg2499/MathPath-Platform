# Package 3 (Phase 3): Admin Annual Competition Studio

## Objective
Give admins a screen to stand up and manage a `CompetitionEvent` end to
end, before any student ever sees it.

## Status: NOT STARTED

## Checklist

### 1. Event + slots
- [ ] Create/edit a `CompetitionEvent` (name, date, results-release date).
- [ ] Create/edit `CompetitionEventSlot` rows (mode, time window,
      applicable level codes) -- fully data-driven, since the known
      IM-4/MM-2 slot-duration conflict (REQUIREMENTS.md item 7) must be
      fixable here without a deploy.

### 2. Papers
- [ ] Generate or link each competition level's official paper via the
      existing `GenerateCompetitionMockDraft` engine, creating the
      `CompetitionEventLevelPaper` row (`mock_exam_id` FK).
- [ ] Define/edit `CompetitionEventSectionTimer` rows per level paper.
- [ ] Surface `CompetitionEventLevelPaper.status`/`locked_at` so an admin
      can see when a paper has become immutable (Package 1's guard).

### 3. Assignments
- [ ] Run the Package 2 assignment engine (dry-run first, then commit).
- [ ] Review/override individual student assignments
      (`assignment_source = ADMIN_OVERRIDE`).

### 4. Verification
- [ ] RBAC: every write endpoint here is admin-only.
- [ ] Attempting to edit/regenerate a locked level paper's linked mock
      exam surfaces the Package 1 guard's error clearly in the UI.
