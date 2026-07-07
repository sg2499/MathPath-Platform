# Open Issues

Last updated: 2026-07-06

## Active

- Make `npm.cmd run typecheck` reliable on a clean checkout, or document that it must follow `npm.cmd run build`, because the pre-build 2026-07-06 run failed on missing `.next/types` references from `frontend/tsconfig.json`.
- Re-run `npm.cmd run verify:student-login-responsive` in an environment that can actually launch Playwright browsers; the 2026-07-05 local attempt hit `spawn EPERM` for all 60 cases before any page assertions ran.
- Browser-QA the student login page on live or preview after `4ecd510`, especially 320px width, phone landscape, tablet widths, tab readability, theme-toggle overlap, and zoom/scroll behavior.
- Browser-QA the student dashboard changes from `303b004` and `c6abde6`, especially Conquest Matrix date layout, slideshow behavior, and whether the new time-spent heatmap communicates the right product meaning.
- Confirm whether the current grind-heatmap heuristic in `c6abde6` should keep the minimum 2-minute credit per completed sheet.
- Address the current frontend build warnings by migrating Sentry init into `instrumentation.ts` and setting `metadataBase`.
- Verify that deployed backend auth works after schema-migration commit `7f92d7d`, and confirm the missing security columns self-heal in the target environment.
- Add deployment evidence for the pushed frontend stack from `134eeb2` through `4ecd510`.

## Watch List

- The current local environment can build the frontend but blocks Playwright browser launches with `spawn EPERM`; do not treat the 60 failing responsive-matrix cases as product regressions until they are rerun elsewhere.
- The current local verification path is order-sensitive: `npm.cmd run typecheck` may fail before a build repopulates `.next/types`, even though `npm.cmd run build` and the post-build typecheck pass.
- The recent 2026-07-04 changes are frontend-heavy and visual, so browser QA remains higher-signal than another typecheck/build pass.
- Historical MM browser confirmations are still not explicitly recorded in repo memory for:
  - the originally failing Admin Learning Path Studio preview for `MM-L1`, Lesson 1, DPS 1
  - Lesson 12 DPS 3 visual labels in browser UI after the successful live API verification

## Resolved Recently

- Student dashboard JSX compilation was repaired in `134eeb2`.
- The student dashboard hydration crash from hook ordering was repaired in `8979bfc`.
- Conquest Matrix date presentation and mock slideshow support were refined in `303b004`.
- Student login no longer forces disabled browser zoom and now has dedicated responsive regression coverage wired into CI in `4ecd510`.
- The earlier leaderboard/library premium styling sequence remains merged, synced to `origin/main`, and locally buildable.
