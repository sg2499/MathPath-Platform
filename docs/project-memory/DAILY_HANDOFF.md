# Daily Handoff

Last updated: 2026-06-18

## Resume First

Read:

1. `CURRENT_STATUS.md`
2. `.mathpath/STATE.yaml`
3. `.mathpath/rules/global.md`
4. `docs/project-memory/PROJECT_STATE.md`
5. `docs/project-memory/SOURCE_ASSETS.md`
6. Latest daily log under `docs/project-memory/DAILY_LOGS/`

## Latest Completed Work

After the current push, `main` and `origin/main` should point to commit `6f96201`.

On 2026-06-18, Admin Learning Path Studio preview generation for MM practice DPS was fixed locally after the live screenshot showed a generic server error for `MM-L1`, Lesson 1, DPS 1:

- Negative-answer decimal visual add-less now generates stacks that satisfy the approved decimal visual row/digit rules.
- Fast visualisation validation now respects the section's explicit digit count, so both 2-digit and 3-digit fast visualisation sheets can generate.
- Regression coverage now checks the exact failing `MM-L1` Lesson 1 / DPS 1 plan and sweeps every mapped Master Module DPS plan.
- Backend full pytest suite passed locally: 17 passed.
- Local database-backed preview generation for the selected DPS returned 30 questions successfully.
- Commit `5bce2ed` was pushed to `main`.
- Live Render smoke passed for `MM-L1`, Lesson 1, DPS 1: preview returned 30 questions.
- Live Render smoke passed for `MM-L1`, Lesson 10, DPS 2: preview returned 15 questions for `3 Digit Add-Less (Fast Visualisation) & BODMAS`.

On 2026-06-18, a durable source-asset intake system was added:

- `docs/project-memory/SOURCE_ASSETS.md` is now the committed manifest for external DPS images, Excel workbooks, and future curriculum source materials.
- `reference-assets/` is now the local-only drop folder for bulky source files that should remain readable across conversations without being pushed to git.
- Future conversations must read `SOURCE_ASSETS.md` before changing generator/curriculum logic.
- The authoritative Master Module source folder is recorded as `C:\Users\shail\OneDrive\Shailesh\Work\Math Path\Modules\MM\Level - 9`.
- That folder is verified to contain 30 lesson folders, 150 `.png` DPS images, and 3 `.xlsx` workbooks.

On 2026-06-18, the recorded Master Module source workbooks were audited against Learning Path Studio visual concept mappings:

- 150 DPS sheets were audited from the authoritative `Level - 9` source folder.
- 84 DPS contained explicit workbook `VISUAL` / `FAST VISUALISATION` concept labels.
- The initial audit found 23 DPS with missing platform visual mappings or missing visual flags.
- `backend/app/question_engine/mm/curriculum_map.py` was updated so the workbook visual concepts are mapped with `Concept Name (Visual)` display titles where applicable.
- `backend/app/seed/seed_master_module.py` was updated so seeded DPS titles also show the corrected visual concepts.
- Visual negative-borrowing Add-Less generation now uses 4-digit visual operands so it satisfies both visual Add-Less constraints and negative-borrowing validation.
- Workbook-to-platform visual audit passed after the mapping fix: 0 mismatches.
- Backend generator verification passed: `PYTHONPATH=backend pytest backend\tests\test_generator.py backend\tests\test_mm_competition_mock_generator.py` returned 10 passed.
- Commit `47523b5 Fix MM visual concept mappings` was pushed to `main`.
- Live backend read-only smoke after push succeeded for the Admin module/levels API: module `MM`, levels returned `1`.

On 2026-06-18, a stricter live Learning Path Studio sweep was run for the full MM module:

- Live Admin Learning Path Studio payload was fetched for all 30 lessons and 150 DPS.
- The live sweep found no completely missing workbook visual concepts, but 50 DPS still had one or more visual concepts displayed without `Concept Name (Visual)`.
- Commit `6f96201 Align MM visual labels with workbooks` fixes those remaining display mismatches and removes extra `(Visual)` labels where the workbook did not mark the concept visual.
- Local strict workbook-vs-platform audit after the fix returned missing `0`, extra `0`.
- Backend full pytest suite passed after the fix: `PYTHONPATH=backend pytest backend\tests` returned 17 passed.
- Commits `6f96201` and `ec00920` were pushed to `main`.
- Live Admin Learning Path Studio MM was fetched again after push: 30 lessons, 150 DPS.
- Live strict workbook-vs-platform audit passed after normalizing the live API's `×`/`÷` encoding: missing `0`, extra `0`.

The main product work landed on 2026-06-17 and includes:

- MM mock freshness enforcement across the previous 15 active same-level mocks.
- MM generator quality fixes for write-position variety and non-trivial multiplication/division questions.
- Competition Mock Studio assignment scope fixes so student eligibility comes from the selected mock module and level.
- Student competition mock attempt layout changes so the timer, status, question, and choices sit in one coherent exam workspace.
- Student attempt metric polish that moved the live timer into the metric card grid.
- MM visual add/less tightening so fast visualisation and decimal visual questions follow explicit row-count and digit-shape rules.
- Expression-question layout polish so long prompts get more horizontal room and shrink to fit instead of clipping.

On 2026-06-18, this handoff audit re-verified the current branch locally:

- Backend full pytest suite passed: 15 passed.
- Frontend `npm.cmd run typecheck` passed.
- Frontend `npm.cmd run build` passed.

Recorded live verification in repo memory currently stops at the earlier 2026-06-17 deployment entries for freshness, MM generator quality, and mock assignment scope. There is no recorded live Render/Vercel smoke yet for the later commits `8642be7`, `f6c5f6e`, `9d5a268`, or `aae8814`.

## Current Product State

MM mock generator and preview behavior is now expected to be:

- Default MM mock question count: 100.
- Default MM mock duration: 60 minutes.
- 10 locked MM sections.
- 10 questions per section by default.
- Section-only generation, meaning each section generates only its approved concept families.
- Concept-wise sequential question blocks within each section.
- No repeated sums/questions inside the same mock.
- No repeated sums/questions from the previous 15 active same-level MM mocks.
- Write Number From Given Position uses varied position prompts in competition mocks.
- Multiplication/division mocks avoid easy place-shift operands and obvious low quotients.
- MM visual add/less fast visualisation questions stay at 7 rows using the section's explicit digit count.
- MM decimal visual add/less questions must follow explicit approved row/digit patterns instead of arbitrary decimal row mixes.
- MM practice DPS section titles must preserve workbook visual-method concepts with the display convention `Concept Name (Visual)`.
- MM visual negative-borrowing Add-Less practice questions use 4-digit operands so the visual range and negative-borrowing rules both hold.
- Admin mock assignment only shows and assigns students eligible for the selected mock module and level.
- Student competition mock attempts keep the timer visible inside the metric card area and show a red pulsing low-time warning at 5 minutes remaining.
- Student competition mock attempts use a denser full-workspace layout so long vertical sums remain visible on desktop.
- Long expression questions in student mock attempts widen the prompt panel and shrink text to stay visible instead of clipping or wrapping awkwardly.
- Clean preview rendering with no duplicate positional prompt and no inner scrollbars.

## Next Recommended Work

1. Ask the user to retry Admin Learning Path Studio for the originally failing DPS in the browser.
2. Spot-check the live Learning Path Studio UI for MM visual labels, especially Lesson 10 DPS 5 and Lesson 22/23 multiplication-division visual sheets.
3. Live-QA the current student competition mock attempt page on Vercel using long expression, dense vertical-sum, and visual add/less questions.
4. If any Learning Path Studio row still appears stale in the browser, rerun the live API sweep first; only reseed/sync if the API also shows stale rows.

## Important Convention

Do not push any code that has not passed relevant local checks. For frontend changes, run at least:

- `npm.cmd run typecheck`
- `npm.cmd run build`

For backend generator changes, run:

- `.venv\Scripts\python.exe -m pytest tests`

When live deployment matters, verify Render and Vercel after push.
