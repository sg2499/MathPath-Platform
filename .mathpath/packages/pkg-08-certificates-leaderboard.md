# Package 8 (Phase 8): Certificates / Leaderboard Visibility

## Objective
Deliberately last and mostly deferred -- data model stays extensible, but
actual certificate fields and public leaderboard scope wait on client
confirmation of REQUIREMENTS.md items 5-6.

## Status: NOT STARTED -- blocked on client confirmation, not on other packages.

## Checklist

### 1. Scaffolding only, until confirmed
- [ ] Confirm leaderboard visibility scope (Top 3 / Top 10 / full,
      student-only vs. parent-visible) with the client before building any
      public-facing leaderboard UI.
- [ ] Confirm certificate fields with the client before generating any
      certificate artifact.

### 2. Once confirmed
- [ ] Leaderboard read endpoint, respecting the confirmed scope and the
      Package 6 release gate.
- [ ] Certificate generation, sourced from `CompetitionEventResult`.
