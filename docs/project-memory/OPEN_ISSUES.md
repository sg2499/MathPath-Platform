# Open Issues

Last updated: 2026-06-18

## Active

- User should retry `MM-L1`, Lesson 1, DPS 1 in Admin Learning Path Studio browser UI after the backend deploy.
- Live-QA the current student competition mock attempt page after the late 2026-06-17 layout and expression-polish commits.
- Push/deploy commit `6f96201` and re-run the strict live MM workbook-vs-platform visual label sweep.
- Reseed/sync the live backend curriculum if existing DPS section rows do not update automatically after deployment.
- Add automated browser or component regression coverage for student attempt expression rendering and no-clipping behavior.
- Add an API/browser regression that creates repeated MM drafts and confirms question signatures are not reused within the same-level 15-mock window.

## Watch List

- Existing local untracked files and nested folder remain untouched:
  - `MathPath-Platform`
  - `copy_titles.py`
  - `old_seed.py`
  - `seed_function.py`
- The local Next dev server did not stay alive reliably through hidden background PowerShell launches, although `npm.cmd run dev -- -p 3000` starts correctly in foreground.

## Resolved Recently

- MM mock default was corrected from older non-MM defaults to 100 questions and 60 minutes.
- Section leakage in MM mock generation was fixed.
- Positional prompt duplication in mock preview was fixed.
- Empty first-natural-number prompts now render the full task label in mock cards.
- Inner scrollbar convention issue was addressed in frontend renderers.
- Local backend MM generator now blocks duplicate sums/questions inside a mock and across the previous 15 active same-level MM mocks.
- Live backend MM generator now varies Write Number From Given Position prompts and avoids trivial multiplication/division scale operands.
- Local Admin Learning Path MM DPS preview generation no longer fails for `MM-L1`, Lesson 1, DPS 1.
- Local generator sweep now verifies every mapped Master Module DPS plan generates a non-empty question set.
- Live Render Admin DPS preview smoke passed for `MM-L1`, Lesson 1, DPS 1 and `MM-L1`, Lesson 10, DPS 2.
- Authoritative Master Module Level 9 source folder is recorded in `SOURCE_ASSETS.md`.
- Local workbook-to-platform audit for MM visual concepts reached 0 mismatches after the curriculum map fix.
- Local backend generator tests passed after the MM visual concept mapping fix.
