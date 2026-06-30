# Open Issues

Last updated: 2026-06-29

## Active

- Finish or discard the current local frontend edits in `frontend/app/globals.css`, `frontend/app/student/assessment-readiness/page.tsx`, `frontend/app/student/assessments/page.tsx`, `frontend/app/student/dashboard/page.tsx`, and `frontend/app/student/practice/page.tsx`; then run frontend typecheck and build.
- Browser-QA Admin, Teacher, and Student login flows after `590e1dc` and `4502bdd`.
- Browser-QA responsive behavior after `fdc0aab` and the later student-page/header cleanup, especially mobile width, safe-area spacing, and header/logo rendering.
- Verify that deployed backend auth works after schema-migration commit `7f92d7d`, and confirm the missing security columns self-heal in the target environment.
- Add deployment evidence for the recent pushed stack from `4502bdd` through `c4d2ddf`.
- Historical MM browser confirmations are still not explicitly recorded in repo memory for:
  - the originally failing Admin Learning Path Studio preview for `MM-L1`, Lesson 1, DPS 1
  - Lesson 12 DPS 3 visual labels in browser UI after the successful live API verification

## Watch List

- Existing local untracked/nested items remain intentionally untouched:
  - `MathPath-Platform`
  - `copy_titles.py`
  - `old_seed.py`
  - `seed_function.py`
- The recent frontend changes are heavily style-driven; visual regressions are more likely than type-level regressions, so browser QA remains important even after a clean build.

## Resolved Recently

- Competition mock notifications and deep-link routing were stabilized across Admin, Teacher, and Student result flows.
- Student mock instructions and start-practice entry points were added.
- Sticky metric bars and question block sizing were cleaned up across student attempt pages.
- Teacher/student table spacing, chip wrapping, and metric-card presentation were standardized across the late 2026-06-25 and 2026-06-26 commits.
- Login no longer waits on an artificial post-submit delay or shows verbose connection banners.
- Global responsive layout safeguards were added for viewport handling, safe-area spacing, and horizontal overflow control.
- The app shell now uses the refreshed larger image-only MathPath logo treatment.
