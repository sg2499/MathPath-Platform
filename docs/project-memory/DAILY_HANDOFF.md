# Daily Handoff

Last updated: 2026-06-17

## Resume First

Read:

1. `CURRENT_STATUS.md`
2. `.mathpath/STATE.yaml`
3. `.mathpath/rules/global.md`
4. `docs/project-memory/PROJECT_STATE.md`
5. Latest daily log under `docs/project-memory/DAILY_LOGS/`

## Latest Completed Work

On 2026-06-17, the MM competition mock generator was updated, pushed, and live-verified to enforce recent-question freshness:

- Stable content signatures now detect duplicate MM sums/questions while ignoring volatile seed/source fields.
- Each generated MM mock blocks duplicates within the same mock.
- Each generated MM mock also blocks questions from the previous 15 active MM mocks for the same level.
- The saved generation config and coverage payload include freshness-window audit metadata.
- Backend focused and full test suites passed locally.
- Commit `9ede198` was pushed to `main`.
- Live Render smoke generated and deleted temporary mock `f21af651-0964-4975-a460-d0934a8e0afb`; response returned `freshnessWindow = 15`.

Later on 2026-06-17, additional MM generator quality fixes were implemented locally:

- Write Number From Given Position now varies position values instead of repeatedly producing only one slot such as `-1`.
- Section-locked MM mocks avoid reusing write-position values while unused positions remain.
- Multiplication and division generation now rejects shortcut scale operands such as `10`, `30`, `50`, `100`, and low/scale-like division answers.
- Backend tests passed locally: 13 passed.

Also on 2026-06-17, Competition Mock Studio assignment scope was fixed:

- The admin assignment panel now derives student eligibility from the selected mock exam(s), not the manage-list level filter.
- The displayed student list is restricted to active students matching the selected mock module and level.
- The selected-student assign button can enable when a mock and eligible student are selected even if the manage level filter is set to `All Levels`.
- Backend assignment now enforces the same module+level eligibility rule for assign-all and selected-student requests.
- Verification passed: frontend typecheck/build and full backend pytest suite, 15 tests passed.

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
- Admin mock assignment only shows and assigns students eligible for the selected mock module and level.
- Clean preview rendering with no duplicate positional prompt and no inner scrollbars.

## Next Recommended Work

1. Inspect the live Mock Studio after the user checks the latest deployment.
2. If the user reports any remaining visual issue, use screenshots and browser inspection to patch the affected renderer.
3. Add a Playwright regression around saved mock detail preview if the test harness is stable enough.
4. Add an API/browser regression that creates repeated MM drafts and confirms signatures are not reused within the active 15-mock window.
5. Continue improving project memory after every work session.

## Important Convention

Do not push any code that has not passed relevant local checks. For frontend changes, run at least:

- `npm.cmd run typecheck`
- `npm.cmd run build`

For backend generator changes, run:

- `.venv\Scripts\python.exe -m pytest tests`

When live deployment matters, verify Render and Vercel after push.
