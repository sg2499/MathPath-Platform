# Deployment Log

Last updated: 2026-06-18

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
