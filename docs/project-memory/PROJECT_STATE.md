# MathPath Project State

Last updated: 2026-06-18

## Product

MathPath is a role-based abacus and mental math learning platform for Admin, Teacher, and Student workflows. The platform currently includes:

- Admin curriculum and Learning Path Studio workflows.
- DPS practice generation and publishing.
- Student practice and result workflows.
- Assessment creation, assignment, readiness, attempts, and results.
- Competition mock generation, assignment, attempts, tracking, and results.
- Master Module and Young Learners Module support.

## Live URLs

- Frontend: https://math-path-platform.vercel.app/
- Backend: https://mathpath-backend.onrender.com
- GitHub remote: https://github.com/sg2499/MathPath-Platform.git

## Current Focus

The current active product area is the Master Module competition mock workflow, especially MM visual add/less quality and student attempt rendering QA.

The latest implemented state:

- MM mock defaults are 100 questions and 60 minutes.
- MM mock section plan has 10 locked sections.
- Each section receives 10 questions by default for a 100-question mock.
- MM mock generation is section-locked and concept-sequential.
- MM mock generation now enforces stable question/sum uniqueness within each mock and avoids repeats from the previous 15 active same-level MM mocks.
- MM visual add/less generation now enforces explicit fast-visual and decimal-visual row/digit constraints.
- MM practice DPS preview generation now handles negative-answer decimal visual add-less and 2-digit/3-digit fast visualisation concepts without generator/validator contract failures.
- Existing mock previews render cleanly without duplicated first-natural-number prompt text.
- Admin mock assignment is scoped to active students in the selected mock module and level.
- Student competition mock attempts now keep timer/navigation visible in a single structured exam workspace.
- Student competition mock attempts also scale dense vertical sums down to reduce clipping in desktop exam view.
- Student competition mock attempts surface the live timer inside the metric card grid.
- Long expression-style attempt questions widen the question panel and shrink text to stay visible.
- Question previews avoid inner scrollbars for expression-style displays.

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

Recent verification commands that passed:

- Backend: `.venv\Scripts\python.exe -m pytest tests` on 2026-06-18, 17 passed.
- Backend focused: `.venv\Scripts\python.exe -m pytest tests\test_mm_competition_mock_generator.py`
- Backend focused: `.venv\Scripts\python.exe -m pytest tests\test_generator.py tests\test_mm_competition_mock_generator.py` on 2026-06-18, 10 passed.
- Frontend: `npm.cmd run typecheck` on 2026-06-18.
- Frontend: `npm.cmd run build` on 2026-06-18.
- Local DB-backed smoke: Admin DPS preview generation for `MM-L1`, Lesson 1, DPS 1 returned 30 questions.
- Live Render smoke: Admin DPS preview generation for `MM-L1`, Lesson 1, DPS 1 returned 30 questions after commit `5bce2ed`.
- Live Render smoke: Admin DPS preview generation for `MM-L1`, Lesson 10, DPS 2 returned 15 questions after commit `5bce2ed`.
- Live API smoke: MM mock section plan returns 100 total questions, 10 locked sections, and 10 questions per section.
- Live API smoke: temporary MM mock draft generated 100 questions, 3600 seconds, 10 locked sections, then was deleted.
- Live Vercel smoke: Admin Mock Studio loads with live auth token and MM defaults are visible after module/level selection.
- No live verification is currently recorded for the latest Admin Learning Path MM DPS preview fix, the post-assignment student-attempt commits, or the MM visual add/less commits.

## Known Local Unrelated Items

These were present and intentionally left untouched:

- `MathPath-Platform`
- `copy_titles.py`
- `old_seed.py`
- `seed_function.py`
