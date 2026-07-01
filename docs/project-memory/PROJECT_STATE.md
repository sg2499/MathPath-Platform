# MathPath Project State

Last updated: 2026-07-01

## Product

MathPath is a role-based abacus and mental math learning platform for Admin, Teacher, and Student workflows. The platform currently includes:

- Admin curriculum and Learning Path Studio workflows.
- DPS practice generation and publishing.
- Student practice and result workflows.
- Assessment creation, assignment, readiness, attempts, and results.
- Competition mock generation, assignment, attempts, tracking, notifications, and results.
- Master Module and Young Learners Module support.

## Live URLs

- Frontend: https://math-path-platform.vercel.app/
- Backend: https://mathpath-backend.onrender.com
- GitHub remote: https://github.com/sg2499/MathPath-Platform.git

## Current Branch State

- `main` is at `f179099` and `origin/main` is currently at `3cdf4e8` (awaiting manual push).
- The repo has uncommitted local frontend work in:
  - `frontend/app/globals.css`
  - `frontend/app/student/assessment-readiness/page.tsx`
  - `frontend/app/student/assessments/page.tsx`
  - `frontend/app/student/dashboard/page.tsx`
  - `frontend/app/student/practice/page.tsx`
- Existing local untracked/nested items intentionally remain untouched:
  - `MathPath-Platform`
  - `copy_titles.py`
  - `old_seed.py`
  - `seed_function.py`

## Current Focus

The active product area has shifted from the 2026-06-18 MM generator fixes to broader frontend polish and auth stability:

- Student-facing typography, hero blocks, metric cards, and result surfaces are being standardized.
- Header branding is now converging on a larger image-only LogoMark treatment.
- Login flow is being streamlined and hardened across Admin, Teacher, and Student roles.
- Global responsive behavior is being normalized to avoid horizontal wobble and mobile safe-area issues.
- Recent backend auth/schema fixes still need deployment confirmation.

## Latest Implemented State

- Competition mock notifications and deep-link routing were added and then stabilized across Admin, Teacher, and Student result flows.
- Student competition mock entry now includes direct start-practice flows and a dedicated instructions screen.
- Student assessment/mock attempt pages use sticky metric bars and more uniform question block sizing.
- Teacher and student dashboards/readiness/results surfaces were moved toward a shared `math-kicker` / `math-block-header` / `math-subtitle` convention.
- Student metric cards and result summary cards were standardized around the gamified compact metric-card style.
- Login no longer waits on an artificial post-submit delay and no longer shows verbose connection-status banners.
- The app now applies global responsive safeguards including viewport controls, safe-area padding, `overflow-x-hidden`, and localized horizontal swiping for wide tables.
- Backend auth was hardened in `4502bdd`, and `7f92d7d` adds a schema migration to backfill missing user security columns.
- The header now uses the refreshed high-resolution MathPath logo with a larger image-only LogoMark and no redundant wordmark/tagline.
- The 2026-06-18 MM workbook-faithful visual-labeling and generator fixes remain the latest detailed backend curriculum verification baseline.

## Existing Brain Context

The repository already contains `.mathpath`, which remains authoritative for legacy epic/package context:

- `.mathpath/STATE.yaml`
- `.mathpath/rules/global.md`
- `.mathpath/packages/pkg-10-rollout.md`

This project-memory folder extends that system with daily continuity, deployment evidence, and handoff notes.

## Source Asset Continuity

The project now has a durable source-asset manifest:

- `docs/project-memory/SOURCE_ASSETS.md`

Local-only drop location for bulky reference files:

- `reference-assets/`

Future conversations must read the source-asset manifest before changing DPS generation, curriculum maps, mock generation, or question rendering. When the user provides new source images, workbooks, PDFs, or extracted datasets, record the exact paths and coverage in `SOURCE_ASSETS.md` during the same session.

## Verification Baseline

Recent verification evidence recorded in repo memory:

- Backend full: `PYTHONPATH=backend pytest backend\tests` on 2026-06-18, 20 passed after the MM visual curriculum mapping regressions were added.
- Live corrected MM workbook-vs-platform audit after commit `18bf3a4`: 150 DPS fetched, 102 workbook visual/fast-visualisation DPS checked, missing `0`, extra `0`.
- 2026-06-26 daily log records the teacher/student UI cleanup sequence as typechecked, built, and merged via automated PRs `#40` through `#43`.
- 2026-06-29 daily log records login UX commit `590e1dc` as typechecked, built, and merged via PR `#59`.
- 2026-06-29 daily log records responsive layout commit `fdc0aab` as compiled, tested, and merged via PR `#61`.
- 2026-06-30 and 2026-07-01 daily logs record Mock Leaderboard UI upgrades as successfully built via `npm run build` with 0 errors (commit `f179099`).

Verification gaps that still need evidence:

- No recorded local test/build output yet for commits `4502bdd`, `7f92d7d`, or `d091e7b` through `c4d2ddf`.
- No recorded browser smoke yet for the 2026-06-29 login changes, responsive layout changes, or latest header-logo behavior.
- No recorded deployed-environment confirmation yet that the backend user security-column migration in `7f92d7d` executed successfully.
