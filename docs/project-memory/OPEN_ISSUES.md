# Open Issues

Last updated: 2026-06-16

## Active

- User should visually confirm the latest live mock preview cleanup.
- Add automated browser regression for MM saved mock preview once the local dev/browser setup is stable enough.

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
- Inner scrollbar convention issue was addressed in frontend renderers.
