# MathPath Project State

Last updated: 2026-07-07

> **⚠️ SUPERSEDED AS THE PRIMARY ENTRY POINT (2026-07-10).** This file is 93+ commits behind HEAD and is kept for historical context only. Read `docs/project-memory/COWORK_HANDOFF.md` first, then trust `git log --oneline -30` over any prose state description below.

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

- `main` and `origin/main` both point to `dd9938e`.
- The worktree was clean before this handoff refresh.
- The only current local worktree changes are the project-memory docs updated by this handoff.

## Current Focus

The active product area is currently centered on the student-facing frontend and its verification trail:

- Student dashboard polish around Conquest Matrix cards, slideshow behavior, and the grind heatmap's new weekly tooltip model.
- Shared login resiliency across phones, tablets, landscape, browser zoom, and short-screen layouts.
- Capturing durable verification/deployment evidence for the recent frontend-only stack.
- Making the frontend verification flow predictable when `tsconfig.json` depends on generated `.next/types`.
- Keeping the older backend auth/schema deployment confirmation (`7f92d7d`) on the watch list.

## Latest Implemented State

- Competition mock notifications, deep-link routing, start-practice flows, sticky attempt metrics, and leaderboard/library UI remain shipped from the late June stack.
- The student competition leaderboard keeps the premium July 1 glassmorphism/podium styling overhaul from `f179099`.
- Student dashboards now include the newer Conquest Matrix work: real assignments/results, interactive card flips, improved calendar date layout, and mock slideshow support.
- The student dashboard grind heatmap now visualizes minutes spent per day rather than raw completed-sheet count, with a minimum credit for completed work.
- The 2026-07-07 dashboard sequence adds richer grind-heatmap tooltips: derived `flowState` scoring, tier labels, accuracy/time insight text, a fixed current-week Sunday-to-Saturday window, and larger tooltip containers with corrected text colors.
- The current `flowState` implementation estimates `5` questions per sheet when `totalQuestions` is absent, so the displayed speed/tier signal is partially heuristic until the payload is confirmed.
- The student dashboard compile regression (`134eeb2`) and hydration regression (`8979bfc`) are fixed on `main`.
- The shared login surface now keeps browser zoom enabled, adds better safe-area and overflow handling, improves accessibility/test hooks, and is guarded by a dedicated 60-case Playwright responsive matrix wired into CI (`4ecd510`).
- Playwright config now includes Chromium, Firefox, and WebKit desktop projects so the responsive login matrix runs across all three engines in CI.
- Backend auth was hardened in `4502bdd`, and `7f92d7d` adds a schema migration to backfill missing user security columns.
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
- 2026-06-30 and 2026-07-01 daily logs record Mock Leaderboard UI upgrades as successfully built via `npm run build`.
- 2026-07-06 local frontend production build passed: `npm.cmd run build`.
- 2026-07-06 local frontend typecheck passed after the build regenerated `.next/types`: `npm.cmd run typecheck`.
- 2026-07-07 local frontend typecheck passed from `frontend/`: `npm.cmd run typecheck`.
- 2026-07-07 local frontend production build passed from `frontend/`: `npm.cmd run build`.

Verification gaps that still need evidence:

- `npm.cmd run typecheck` is not currently standalone-reliable on this checkout before generated `.next/types` exist; the pre-build run on 2026-07-06 failed with missing `.next/types` references from `tsconfig.json`.
- No recorded browser-executed evidence yet for the new 2026-07-07 grind-heatmap tooltip stack, especially current-week alignment, tooltip readability, and the shipped `flowState`/tier messaging.
- No recorded product confirmation yet that the fallback `5`-questions-per-sheet estimate used by `flowState` matches real expected student pacing semantics.
- No successful browser-executed evidence is recorded yet for the new responsive login matrix in `4ecd510`; the local attempt on 2026-07-05 failed before page execution because Playwright browser launches were blocked with `spawn EPERM`.
- No recorded live browser smoke yet for the 2026-07-04 student login/dashboard sequence, especially narrow-width login behavior and the updated Conquest Matrix/grind heatmap surfaces.
- Current frontend builds still emit Sentry Next.js instrumentation warnings and missing-`metadataBase` warnings.
- No recorded deployed-environment confirmation yet that the backend user security-column migration in `7f92d7d` executed successfully.
