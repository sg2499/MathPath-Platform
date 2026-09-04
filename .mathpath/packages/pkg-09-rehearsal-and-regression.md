# Package 9 (Phase 9): Full Rehearsal + Regression

## Objective
Prove the whole system end to end with test accounts before it ever
touches real student data, and prove it hasn't broken anything else.

## Status: NOT STARTED

## Checklist

### 1. End-to-end rehearsal
- [ ] Simulate the actual 11 Oct 2026 timeline with test accounts across
      all five slots (offline x3, online-India, online-international).
- [ ] At least one simulated disconnect-and-resume per section type,
      exercising the Package 4 pause mechanic for real.
- [ ] Simulate the reconciliation sweep catching an abandoned attempt.

### 2. Full regression
- [ ] Existing DPS, Assessment, and Competition Mock test suites stay
      green throughout -- this feature must not touch their behavior.
- [ ] `npm run build` (frontend) and the full backend pytest suite both
      pass clean.

### 3. Reuse-guard regression
- [ ] A test asserting `DeleteCompetitionMockExam` is rejected once a
      `CompetitionEventLevelPaper`/`CompetitionEventAttempt` references
      that exam (Package 1's guard, re-verified here as part of the full
      suite rather than only in isolation).
