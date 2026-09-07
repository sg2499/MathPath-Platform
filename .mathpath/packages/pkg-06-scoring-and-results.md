# Package 6 (Phase 6): Scoring + Results

## Objective
Compute and store `CompetitionEventResult` once per attempt, with a
release gate independent of when it was computed.

## Status: COMPLETE (2026-09-05)

## What was built (backend)
- `backend/app/services/annual_competition_scoring_service.py` -- the full
  engine: `_RawMetricsForAttempt` (pure computation: correct/wrong/
  unanswered counts, score/max_score/percentage, accuracy%, and per-section
  active-time -- `time_limit_seconds - remaining_seconds_at_last_heartbeat`,
  never raw wall-clock, so genuine pause time is excluded exactly as the
  Package 4 pause mechanic intends), `ComputeAndFinalizeCompetitionEventResult`
  (upserts `CompetitionEventResult`, advances the attempt to `FINALIZED`),
  `_DefaultRankingSortKey` (the confirmed formula, isolated in one
  function per the checklist's "swappable ranking function" requirement),
  `RankCompetitionEventResults` / `ReleaseCompetitionEventResults` (two
  independent admin actions -- release always re-ranks first, in the same
  transaction, so a released result is never shown without a rank),
  `GetCompetitionEventResultForStudent` (full lock-down until released --
  returns `released: false` rather than an error, since that's the expected
  common state), `ListCompetitionEventResultsForAdmin` (admin always sees
  everything, released or not).
- **Zero schema changes.** `CompetitionEventResult` was already fully built
  in Package 1 with every field this package needed (score, max_score,
  percentage, accuracy_percentage, correct/wrong/unanswered counts,
  time_taken_seconds, per_section_time_json, rank, is_released,
  released_at, released_by_user_id) -- this package is purely the service
  layer that fills it in and gates it.
- **Automatic finalize-on-submit, hooked into exactly one place.**
  `annual_competition_attempt_service.py`'s `_AdvanceOrFinalize` is the
  single function every path to a last-section close funnels through
  (manual section submit, heartbeat-driven auto-advance, and the
  admin-triggered reconciliation sweep all call it) -- Package 6's
  `ComputeAndFinalizeCompetitionEventResult` is called from inside that one
  function (via a local import, so Package 4/5's own top-level import list
  stays unchanged), meaning every attempt gets scored the same way with
  nothing left to catch later. `CompetitionEventAttempt.status` now
  actually reaches `FINALIZED`, not just `SUBMITTED`, per the lifecycle
  already documented on that column in models.py.
- **The confirmed scoring formula** (REQUIREMENTS.md item 4, resolved
  2026-09-04): unanswered questions earn zero score (tracked separately
  from wrong, never folded in); ranking is by accuracy% descending, then
  completion time ascending -- the two factors the client explicitly
  named, not raw score; a genuine tie is broken by "who made a mistake
  first, the latter wins" -- derived on demand from
  `CompetitionEventAttemptAnswer` (ordered by the joined question's
  `question_number`, identical for every student on the same level's
  shared paper) rather than stored as a new column, so Package 1's schema
  needed no reopening. A student who made no mistake at all outranks
  anyone who made one, modeled as a sentinel later than any real question
  number.
- `backend/app/api/routes_admin.py` -- 3 new endpoints:
  `GET /api/admin/annual-competition/events/{event_id}/results`,
  `POST .../results/rank`, `POST .../results/release`. **API only, no
  admin UI yet** -- the same deliberate deferral Package 2's preview/run
  endpoints already used; a results-review/monitoring screen is Package
  7's territory, not this one.
- `backend/app/api/routes_student.py` -- 1 new student route:
  `GET /api/student/annual-competition/attempts/{attempt_id}/result`.
- `backend/tests/test_annual_competition_scoring_service.py` -- 17 new
  tests: raw metrics (correct/wrong/score, unanswered-not-wrong,
  per-section active-time summed correctly), the reconciliation sweep also
  triggering scoring (not just the status transition), ranking (accuracy
  order, time tie-break, "later mistake wins" full tie, "no mistake beats
  one mistake"), release gating (student sees nothing until released even
  after ranking alone, admin always sees it, release is scoped to one
  level or all levels, release auto-ranks), and that a re-finalize (e.g.
  after a technical-issue retry) never silently un-releases or re-ranks an
  already-released/ranked result.
- **4 existing Package 4/5 tests updated**, not broken: they asserted the
  terminal status was `"SUBMITTED"`, which was correct before this package
  existed and is now `"FINALIZED"` -- the whole point of this package's
  hook. Each updated assertion carries a comment pointing at why.
- Full backend suite: 451 passed (434 existing + 17 new), zero
  regressions.

## What was built (frontend) -- deliberately minimal, and why

Package 5's own doc explicitly named the one gap this package was
responsible for closing: "No results redirect... there is nowhere to
redirect to yet -- CompetitionEventResult computation/display is Package
6." Package 6's own checklist (below) is backend-only and never mentions a
frontend surface at all -- unlike Package 2/3's admin-facing work, there
was no explicit ask for a student results *screen*, only the missing piece
Package 5 pointed at. Rather than silently deciding between "ship nothing"
and "build a full results page," this package closes exactly the named gap
and nothing more:
- `frontend/lib/api/student.ts` -- `AnnualCompetitionResult` /
  `AnnualCompetitionResultPayload` types and `getAnnualCompetitionResult()`.
- `frontend/app/student/competition/annual/attempt/[attemptId]/page.tsx`
  -- the existing "Competition Submitted" card (unchanged trigger
  condition: `status !== "IN_PROGRESS"`, which already covers `FINALIZED`
  with no logic change needed there) now queries the result once the
  attempt has left `IN_PROGRESS`, and shows accuracy/correct-count/time/
  rank inline when `released: true`; otherwise it shows the same "released
  separately once available" copy as before. No new route, no leaderboard,
  no certificate -- those stay explicitly out of scope (see below).
- Verification: `npx tsc --noEmit` clean, `npm run build` succeeds with no
  new routes needed (the existing attempt route just got a bit larger),
  zero new warnings.

No admin-facing results/release UI was built (API only, see above) -- a
deliberate, documented scope decision, not an oversight.

## Checklist

### 1. Raw metrics
- [x] Correct/wrong/unanswered counts, accuracy%, score, time taken, and
      per-section time breakdown are captured unconditionally at
      computation time, regardless of which final scoring/tie-break
      formula is confirmed later (REQUIREMENTS.md item 4) -- in practice
      the real, now-confirmed formula was implemented directly (see
      above), with the raw metrics still captured independently of the
      ranking step that consumes them.

### 2. Ranking
- [x] A swappable ranking function (`_DefaultRankingSortKey`), not inlined
      into the computation path -- computation (`ComputeAndFinalize...`)
      and ranking (`RankCompetitionEventResults`) are two entirely separate
      functions/actions.

### 3. Release gating
- [x] `is_released` defaults to `false`; student/parent-facing endpoints
      never return a result while `false`, regardless of `status` on the
      parent `CompetitionEvent`.
- [x] Admin can always see a result regardless of `is_released`
      (`ListCompetitionEventResultsForAdmin`).
- [x] Admin manual "release now" override
      (`POST .../results/release`), for the 1 Nov 2026 Results & Prize
      Distribution event -- scoped to one level or every level of the
      event at once.

### 4. Verification
- [x] A result computed but not released is invisible to the student/
      parent endpoint and visible to admin -- covered by tests.
- [x] Re-computation does not silently flip an already `is_released`
      result back to unreleased (or re-rank it) -- covered by a dedicated
      test that re-finalizes an already-released/ranked result and asserts
      both fields are untouched.

## Not built in this package (by design -- later packages' scope)
- No admin results-review/release UI -- API only, Package 7's territory.
- No leaderboard or certificate display -- Package 8's territory
  (data model stays extensible; nothing here blocks it).
- No live monitoring of an in-progress competition -- Package 7.
- The "technical issue" admin-retry-override for a genuine retake
  (REQUIREMENTS.md item 6) -- was never on this package's checklist
  either; now built as its own small addition, see
  `pkg-06b-retry-override.md` (COMPLETE, 2026-09-05).
