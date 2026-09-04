# Package 6 (Phase 6): Scoring + Results

## Objective
Compute and store `CompetitionEventResult` once per attempt, with a
release gate independent of when it was computed.

## Status: NOT STARTED

## Checklist

### 1. Raw metrics
- [ ] Correct/wrong/unanswered counts, accuracy%, score, time taken, and
      per-section time breakdown are captured unconditionally at
      computation time, regardless of which final scoring/tie-break
      formula is confirmed later (REQUIREMENTS.md item 4).

### 2. Ranking
- [ ] A swappable ranking function (default: correct count desc, then
      time asc), not inlined into the computation path, so the real
      formula can be swapped in later without touching stored data.

### 3. Release gating
- [ ] `is_released` defaults to `false`; student/parent-facing endpoints
      never return a result while `false`, regardless of `status` on the
      parent `CompetitionEvent`.
- [ ] Admin can always see a result regardless of `is_released`.
- [ ] Admin manual "release now" override, for the 1 Nov 2026 Results &
      Prize Distribution event.

### 4. Verification
- [ ] A result computed but not released is invisible to the student/
      parent endpoints and visible to admin.
- [ ] Re-computation (if ever needed) does not silently flip an already
      `is_released` result back to unreleased.
