# Daily Handoff

Last updated: 2026-06-18

## Resume First

Read:

1. `CURRENT_STATUS.md`
2. `.mathpath/STATE.yaml`
3. `.mathpath/rules/global.md`
4. `docs/project-memory/PROJECT_STATE.md`
5. Latest daily log under `docs/project-memory/DAILY_LOGS/`

## Latest Completed Work

The current `main` branch and `origin/main` both point to commit `aae8814`.

On 2026-06-18, Admin Learning Path Studio preview generation for MM practice DPS was fixed locally after the live screenshot showed a generic server error for `MM-L1`, Lesson 1, DPS 1:

- Negative-answer decimal visual add-less now generates stacks that satisfy the approved decimal visual row/digit rules.
- Fast visualisation validation now respects the section's explicit digit count, so both 2-digit and 3-digit fast visualisation sheets can generate.
- Regression coverage now checks the exact failing `MM-L1` Lesson 1 / DPS 1 plan and sweeps every mapped Master Module DPS plan.
- Backend full pytest suite passed locally: 17 passed.
- Local database-backed preview generation for the selected DPS returned 30 questions successfully.
- Commit `5bce2ed` was pushed to `main`.
- Live Render smoke passed for `MM-L1`, Lesson 1, DPS 1: preview returned 30 questions.
- Live Render smoke passed for `MM-L1`, Lesson 10, DPS 2: preview returned 15 questions for `3 Digit Add-Less (Fast Visualisation) & BODMAS`.

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
- Admin mock assignment only shows and assigns students eligible for the selected mock module and level.
- Student competition mock attempts keep the timer visible inside the metric card area and show a red pulsing low-time warning at 5 minutes remaining.
- Student competition mock attempts use a denser full-workspace layout so long vertical sums remain visible on desktop.
- Long expression questions in student mock attempts widen the prompt panel and shrink text to stay visible instead of clipping or wrapping awkwardly.
- Clean preview rendering with no duplicate positional prompt and no inner scrollbars.

## Next Recommended Work

1. Ask the user to retry Admin Learning Path Studio for the same DPS in the browser.
2. Live-QA the current student competition mock attempt page on Vercel using long expression, dense vertical-sum, and visual add/less questions.
3. Append explicit deployment verification for the late June 17 student-attempt commits if their live QA passes.
4. Add an API/browser regression that creates repeated MM drafts and confirms signatures are not reused within the active 15-mock window.

## Important Convention

Do not push any code that has not passed relevant local checks. For frontend changes, run at least:

- `npm.cmd run typecheck`
- `npm.cmd run build`

For backend generator changes, run:

- `.venv\Scripts\python.exe -m pytest tests`

When live deployment matters, verify Render and Vercel after push.
