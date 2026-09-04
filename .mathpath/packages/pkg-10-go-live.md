# Package 10 (Phase 10): Go-Live Checklist + Rollback Plan

## Objective
Everything needed to be confident going into 11 Oct 2026, and a clear way
back out if something goes wrong on the day.

## Status: NOT STARTED

## Checklist

### 1. Pre-event
- [ ] All seven REQUIREMENTS.md outstanding items either confirmed by the
      client or explicitly accepted as their documented defaults for this
      run.
- [ ] `CompetitionEventSlot` durations re-checked against each level's
      actual section-timer total (the known IM-4/MM-2 conflict, item 7,
      resolved as real admin-edited data before the day).
- [ ] Every level's official paper generated, linked, and locked
      (`CompetitionEventLevelPaper.status = READY` or `LOCKED`).
- [ ] Assignment engine run and reviewed for the full student roster.

### 2. Day-of
- [ ] Monitoring (Package 7) staffed and watched during all five slots.
- [ ] Reconciliation sweep run promptly after the last slot closes.

### 3. Rollback plan
- [ ] A documented path to disable/hide the student-facing attempt UI
      without touching any other feature, if a critical issue surfaces
      mid-event.
- [ ] A documented path to correct/void a single attempt's result without
      needing to touch the whole event.

### 4. Post-event
- [ ] Results computed for every finalized attempt before the 1 Nov 2026
      Results & Prize Distribution date.
- [ ] Clean up any console logs/debugging scaffolding left behind during
      Packages 1-9 (matching the equivalent step in
      `pkg-10-rollout.md` under the Competition Mock Practice epic).
