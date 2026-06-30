# Deployment Log

Last updated: 2026-06-29

## 2026-06-29

### Branch audit through commit `c4d2ddf`

Observed state:

- `main` and `origin/main` both point to `c4d2ddf`.
- The 2026-06-29 pushed stack includes:
  - `590e1dc` login UX streamline
  - `fdc0aab` global responsive layout fixes
  - `4502bdd` student login hardening
  - `7f92d7d` backend user security-column schema migration
  - `d091e7b` through `bbffb96` student typography/result standardization
  - `416bf88` through `c4d2ddf` header/logo cleanup and enlarged image-only branding

Expected deployment:

- Vercel frontend redeploys for the frontend commits above.
- Render backend redeploys for `4502bdd` and `7f92d7d`.

Verification recorded in repo memory:

- `590e1dc`: daily log says the login UX changes were typechecked, built, and merged via PR `#59`.
- `fdc0aab`: daily log says the responsive-layout changes were compiled, tested, and merged via PR `#61`.

Evidence gap:

- No recorded local test/build output yet for `4502bdd`, `7f92d7d`, or the later student-page/header sequence.
- No recorded live browser smoke yet for role login, responsive student pages, or the latest logo/header behavior.
- No recorded deployed-environment confirmation yet that the schema migration in `7f92d7d` ran successfully.

Remaining:

- Run `npm.cmd run typecheck` and `npm.cmd run build` after the current local frontend edits are settled.
- Browser-QA Admin/Teacher/Student login and the latest responsive/header behavior on live or preview.
- Verify auth flows that depend on the backfilled security columns after the backend deploy.

## 2026-06-24 to 2026-06-26

### Notifications, mock entry, and UI standardization sequence

Observed pushed work:

- 2026-06-24: commits `5561d34` through `7cfb74a` added and stabilized competition mock notifications, deep links, result routing, mock submission fixes, and remaining MM visual seed cleanup.
- 2026-06-25: commits `3d59b32` through `495e821` added student mock instructions/start-practice flows and polished sticky metric bars and question block sizing.
- 2026-06-26: commits `abddcd0` through `a04ed53` standardized teacher/student metrics, tables, hero copy, typography, and explicitly triggered a Vercel production deploy.

Expected deployment:

- Vercel redeploys for the frontend-heavy UI sequence.
- Render redeploys for the notification/routing backend changes.

Verification recorded in repo memory:

- 2026-06-26 daily log says the UI styling sequence was typechecked, built, and merged via automated PRs `#40` through `#43`.

Evidence gap:

- Repo memory does not currently contain precise live smoke results for the 2026-06-24 through 2026-06-26 notification, start-practice, and table/layout fixes.
- Repo memory does not currently capture a consolidated backend test log for the 2026-06-24 routing/notification sequence.

## 2026-06-18

### Commit `18bf3a4`

Title: `Fix MM percentage visual mappings`

Pushed to:

- `main`
- GitHub remote `origin`

Expected deployment:

- Render backend redeploy.
- Vercel frontend redeploy may be triggered by the monorepo push, although this change is backend/project-memory focused.

Verification:

- Corrected local workbook audit passed:
  - 150 DPS audited.
  - 102 workbook visual/fast-visualisation DPS recognized.
  - mismatch/flag issue count: `0`
- Backend full pytest suite passed locally: `PYTHONPATH=backend pytest backend\tests` returned 20 passed.
- Live Admin Learning Path Studio MM fetch after push returned 30 lessons and 150 DPS.
- Live Lesson 12 DPS 3 returned `Add Percentage (Visual) & Less Percentage (Visual)` with matching corrected sections.
- Full live comparison against the corrected workbook audit passed:
  - missing visual labels: `0`
  - extra visual labels: `0`

Change summary:

- Fixed workbook DPS-level `VISUAL` markers that apply to percentage concept rows.
- Added missing `Add Percentage (Visual)` / `Less Percentage (Visual)` section and seed titles across affected MM DPS.
- Set workbook-visual negative-borrowing Add-Less sections to `isVisual=True`.
- Added regression coverage for percentage visual mappings and visual borrowing flags.

Remaining:

- Browser spot-check Lesson 12 DPS 3 in Learning Path Studio.

### Commit `6f96201`

Title: `Align MM visual labels with workbooks`

Pushed to:

- `main`
- GitHub remote `origin`

Expected deployment:

- Render backend redeploy.
- Vercel frontend redeploy may be triggered by the monorepo push, although this change is backend/project-memory focused.

Verification:

- Live Admin Learning Path Studio MM payload was swept before the fix: 30 lessons, 150 DPS, 84 workbook visual/fast-visualisation DPS, 50 DPS with display-only visual label mismatches.
- Strict local workbook-vs-platform audit after the fix passed:
  - missing workbook visual labels: `0`
  - extra platform visual labels: `0`
- Backend full pytest suite passed locally: `PYTHONPATH=backend pytest backend\tests` returned 17 passed.

Change summary:

- Remaining MM visual-method concepts now use `Concept Name (Visual)` in the section map.
- Seeded Learning Path Studio DPS card titles were aligned to the same workbook visual labels.
- Extra `(Visual)` labels were removed where the workbook did not classify that concept as visual.
- `Fast Visualisation` remains a separate naming convention.

Remaining:

- Live Admin Learning Path Studio MM sweep passed after push:
  - 30 lessons fetched.
  - 150 DPS fetched.
  - 84 workbook visual/fast-visualisation DPS checked.
  - missing workbook visual labels: `0`
  - extra platform visual labels: `0`
- No reseed/sync was required for the API-level verification.
- Browser UI spot-check is still recommended for visual confirmation.

### Commit `47523b5`

Title: `Fix MM visual concept mappings`

Pushed to:

- `main`
- GitHub remote `origin`

Expected deployment:

- Render backend redeploy.
- Vercel frontend redeploy may be triggered by the monorepo push, although this change is backend/project-memory focused.

Verification:

- Workbook-to-platform visual audit passed locally after the curriculum-map fix: 0 mismatches.
- Backend generator/MM tests passed locally: `PYTHONPATH=backend pytest backend\tests\test_generator.py backend\tests\test_mm_competition_mock_generator.py` returned 10 passed.
- Backend full pytest suite passed locally: `PYTHONPATH=backend pytest backend\tests` returned 17 passed.
- Live backend read-only smoke after push succeeded:
  - endpoint family: Admin module/levels API
  - module `MM`
  - levels returned `1`

Change summary:

- Master Module practice DPS visual concepts were aligned to the authoritative Level 9 workbook labels.
- Affected visual concepts now follow the display convention `Concept Name (Visual)`.
- Seeded DPS titles were updated so Learning Path Studio cards expose the corrected visual concepts.
- Visual negative-borrowing Add-Less generation now uses 4-digit operands so visual and negative-borrowing validators both pass.

Remaining:

- Verify live Learning Path Studio section titles after Render finishes redeploying.
- Reseed/sync the live backend curriculum if existing DPS rows do not update automatically from code deploy.

### Commit `5bce2ed`

Title: `Fix MM DPS preview generation`

Pushed to:

- `main`
- GitHub remote `origin`

Expected deployment:

- Render backend redeploy.

Verification:

- Backend focused generator/MM tests passed locally: 10 passed.
- Backend full pytest suite passed locally: 17 passed.
- Local DB-backed preview generation for `MM-L1`, Lesson 1, DPS 1 returned 30 questions.
- Live Render smoke for `MM-L1`, Lesson 1, DPS 1 returned 30 questions:
  - dps id `2be668be-6fca-4bc4-a9a7-0528eb188b0a`
  - first section `Decimal Number Add-Less (Visual)`
  - sample operands `1902.1, 1742.5, -7867.6`
  - sample answer `-4223`
- Live Render smoke for `MM-L1`, Lesson 10, DPS 2 returned 15 questions:
  - dps id `6f3f22bc-e677-4284-b4fe-063a24d7f215`
  - title `3 Digit Add-Less (Fast Visualisation) & BODMAS`
  - first section `3 Digit Add-Less (Fast Visualisation)`
  - sample operands `415, 416, 364, -156, -988, 933, -666`
  - sample answer `318`

Change summary:

- Negative-answer decimal visual add-less practice DPS generation now follows approved decimal visual row/digit rules.
- Fast visualisation validation now honors the section's explicit digit count.
- Regression coverage now checks the exact failed DPS and every mapped Master Module DPS plan.

### Main Branch Handoff Audit

Observed state:

- `main` and `origin/main` both point to `aae8814`.
- Late 2026-06-17 commits on `main` that were pushed but not fully captured in deployment memory are `981b2b1`, `682879b`, `d2a957b`, `9d5a268`, `8642be7`, `f6c5f6e`, and `aae8814`.

Verification:

- Backend full pytest suite passed locally on 2026-06-18: 15 passed.
- Frontend typecheck passed locally on 2026-06-18.
- Frontend production build passed locally on 2026-06-18.

Expected deployment state:

- Frontend commits on `main` should have triggered Vercel redeploys.
- Backend commits on `main` should have triggered Render redeploys.

Evidence gap:

- No explicit live Render/Vercel smoke is currently recorded in repo memory for commits `8642be7`, `f6c5f6e`, `9d5a268`, or `aae8814`.

## 2026-06-17

### Competition Mock Attempt Timer And Layout Fix

Expected deployment:

- Vercel frontend redeploy.

Verification:

- Frontend typecheck passed locally.
- Frontend production build passed locally.

Change summary:

- Student mock timers now show a red pulsing warning from 5 minutes remaining.
- Competition mock attempt was later rebuilt into a single desktop exam workspace.
- Dense vertical sums now scale down automatically instead of clipping.

### Commit `a88007a`

Title: `Scope mock assignments to eligible students`

Pushed to:

- `main`
- GitHub remote `origin`

Expected deployment:

- Render backend redeploy.
- Vercel frontend redeploy.

Verification:

- Frontend typecheck passed locally.
- Frontend production build passed locally.
- Focused backend assignment/MM generator tests passed locally.
- Full backend pytest suite passed locally: 15 passed.

Change summary:

- Admin Mock Studio assignment scope now comes from selected mock exam(s).
- Student list filters by selected mock module and level.
- Backend assignment rejects selected students outside that module+level and assign-all only targets eligible students.

### Commit `918d38c`

Title: `Improve MM mock question variety`

Pushed to:

- `main`
- GitHub remote `origin`

Expected deployment:

- Render backend redeploy.

Verification:

- Backend focused MM generator tests passed locally.
- Full backend tests passed locally: 13 passed.
- Live Render API generated and deleted a temporary 100-question MM mock:
  - mock id `4c92384b-6951-4948-8fc8-5184c274c06b`
  - write-position values: `-1,-2,0`
  - unique write-position values: `-2,-1,0`
  - trivial multiplication/division operand count: `0`
  - 100 questions deleted during cleanup

### Commit `9ede198`

Title: `Enforce MM mock question freshness`

Pushed to:

- `main`
- GitHub remote `origin`

Expected deployment:

- Render backend redeploy.
- Vercel frontend may redeploy from the same repo push, but the product change is backend-only.

Verification:

- Backend focused MM generator tests passed locally.
- Full backend tests passed locally: 11 passed.
- Live Render API generated and deleted a temporary MM mock:
  - mock id `f21af651-0964-4975-a460-d0934a8e0afb`
  - level `MM-L1`
  - 10 generated questions
  - `freshnessWindow` returned as `15`
  - `recentBlocked` returned as `100`
  - 10 questions deleted during cleanup

## 2026-06-16

### Commit `d327e84`

Title: `Fix MM competition mock generation`

Pushed to:

- `main`
- GitHub remote `origin`

Expected deployment:

- Render backend redeploy.
- Vercel frontend redeploy.

Verification:

- Backend tests passed locally.
- Frontend typecheck and build passed locally.
- Live Render API verified MM section plan:
  - 100 total questions.
  - 10 sections.
  - all sections locked.
  - 10 questions per section.
- Live Render API generated and deleted a temporary MM mock:
  - 100 generated questions.
  - 3600 seconds.
  - section-locked coverage.
- Live Vercel UI verified MM defaults after selecting MM module and level.

### Commit `861bf41`

Title: `Clean MM mock question previews`

Pushed to:

- `main`
- GitHub remote `origin`

Expected deployment:

- Vercel frontend redeploy.

Verification:

- Frontend typecheck passed locally.
- Frontend production build passed locally.
- Live Vercel exact mock detail URL loaded successfully after deploy.
- Browser smoke showed no console errors.
