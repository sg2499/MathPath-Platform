# Daily Handoff

Last updated: 2026-06-16

## Resume First

Read:

1. `CURRENT_STATUS.md`
2. `.mathpath/STATE.yaml`
3. `.mathpath/rules/global.md`
4. `docs/project-memory/PROJECT_STATE.md`
5. Latest daily log under `docs/project-memory/DAILY_LOGS/`

## Latest Completed Work

Two commits were pushed to `main` on 2026-06-16:

- `d327e84 Fix MM competition mock generation`
- `861bf41 Clean MM mock question previews`

The deployed platform was verified after both pushes.

## Current Product State

MM mock generator and preview behavior is now expected to be:

- Default MM mock question count: 100.
- Default MM mock duration: 60 minutes.
- 10 locked MM sections.
- 10 questions per section by default.
- Section-only generation, meaning each section generates only its approved concept families.
- Concept-wise sequential question blocks within each section.
- Clean preview rendering with no duplicate positional prompt and no inner scrollbars.

## Next Recommended Work

1. Inspect the live Mock Studio after the user checks the latest deployment.
2. If the user reports any remaining visual issue, use screenshots and browser inspection to patch the affected renderer.
3. Add a Playwright regression around saved mock detail preview if the test harness is stable enough.
4. Continue improving project memory after every work session.

## Important Convention

Do not push any code that has not passed relevant local checks. For frontend changes, run at least:

- `npm.cmd run typecheck`
- `npm.cmd run build`

For backend generator changes, run:

- `.venv\Scripts\python.exe -m pytest tests`

When live deployment matters, verify Render and Vercel after push.
