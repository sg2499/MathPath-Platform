# Open Issues

Last updated: 2026-07-11

## Active

- Browser-QA the 2026-07-11 grind-heatmap multi-source fix (practice + assessments + mock exams pooled per day, cumulative across attempts) once delivered — verify tooltip counts/accuracy/time match actual same-day activity for a student with mixed attempt types, and confirm the July 9/10 mock completions now render on the correct days.
- Known limitation left open from the 2026-07-11 heatmap fix (not blocking, flagged for a future pass): `ListStudentCompetitionMockAssignmentsForAttempt` filters mock assignments to the student's `current_level_id`, so if a student is promoted to a new level mid-week, that week's mock activity from the prior level drops out of `/student/competition/mock-assignments` entirely (and therefore out of the heatmap) even though it happened this week. Would need the endpoint to stop filtering by current level for activity-feed purposes, or a separate activity-only endpoint.
- Browser-QA the 2026-07-07 student dashboard heatmap tooltip stack from `ec9d041` through `dd9938e`, especially current-week Sunday-to-Saturday alignment, empty future-day handling, tooltip readability, and dark/light theme contrast.
- Decide whether the shipped `flowState` formula should keep estimating `5` questions per sheet when `totalQuestions` is absent, or switch to payload-backed counts before relying on tier/rank copy. (Still open — the 2026-07-11 fix reuses the same 5-question fallback for mock/assessment events for consistency, it did not resolve the underlying heuristic.)
- Re-run `npm.cmd run verify:student-login-responsive` in an environment that can actually launch Playwright browsers; the 2026-07-05 local attempt hit `spawn EPERM` for all 60 cases before any page assertions ran.
- Browser-QA the student login page on live or preview after `4ecd510`, especially 320px width, phone landscape, tablet widths, tab readability, theme-toggle overlap, and zoom/scroll behavior.
- Make `npm.cmd run typecheck` reliable on a clean checkout, or document that it must follow `npm.cmd run build`, because the pre-build 2026-07-06 run failed on missing `.next/types` references from `frontend/tsconfig.json`.
- Address the current frontend build warnings by migrating Sentry init into `instrumentation.ts` and setting `metadataBase`.
- Verify that deployed backend auth works after schema-migration commit `7f92d7d`, and confirm the missing security columns self-heal in the target environment.
- Add deployment/live-smoke evidence for the pushed frontend stack from `ec9d041` through `dd9938e`, and keep the earlier July 4 login/dashboard sequence bundled into that verification pass.

## Watch List

- The current local environment can build the frontend but blocks Playwright browser launches with `spawn EPERM`; do not treat the 60 failing responsive-matrix cases as product regressions until they are rerun elsewhere.
- The current local verification path is order-sensitive on a clean checkout: `npm.cmd run typecheck` may fail before a build repopulates `.next/types`, even though the command passed in this audit because generated types were already present.
- The new `flowState` tooltip signal is partly heuristic because the code falls back to `5` questions per sheet when `totalQuestions` is missing.
- The recent 2026-07-04 and 2026-07-07 changes are frontend-heavy and visual, so browser QA remains higher-signal than another typecheck/build pass.
- Historical MM browser confirmations are still not explicitly recorded in repo memory for:
  - the originally failing Admin Learning Path Studio preview for `MM-L1`, Lesson 1, DPS 1
  - Lesson 12 DPS 3 visual labels in browser UI after the successful live API verification

## Resolved Recently

- 2026-07-11: Grind heatmap was silently undercounting activity — it only read practice-sheet `Results`, never mock exam or assessment-engine completions, even though both were already fetched by the dashboard page. Fixed by adding an additive `attemptHistory` array (full completed-attempt history, not just latest) to the mock-assignment and assessment-assignment backend payloads, and rewriting the dashboard's `grindData` calculation to pool practice + mock + assessment events per calendar day before computing one flowState/tier per day. Not yet delivered to main — prepared in this Cowork session, pending qa-reviewer + sre-devops via local Claude Code.
- Student dashboard JSX compilation was repaired in `134eeb2`.
- The student dashboard hydration crash from hook ordering was repaired in `8979bfc`.
- Conquest Matrix date presentation and mock slideshow support were refined in `303b004`.
- Student login no longer forces disabled browser zoom and now has dedicated responsive regression coverage wired into CI in `4ecd510`.
- The student dashboard grind heatmap now exposes weekly flow-state tooltips with corrected tooltip text colors and larger containers through `ec9d041`, `7e4212b`, and `dd9938e`.
- The earlier leaderboard/library premium styling sequence remains merged, synced to `origin/main`, and locally buildable.
