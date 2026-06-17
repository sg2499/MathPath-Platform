# MathPath Project State

Last updated: 2026-06-17

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

The current active product area is the Master Module competition mock generator and preview workflow.

The latest implemented state:

- MM mock defaults are 100 questions and 60 minutes.
- MM mock section plan has 10 locked sections.
- Each section receives 10 questions by default for a 100-question mock.
- MM mock generation is section-locked and concept-sequential.
- MM mock generation now enforces stable question/sum uniqueness within each mock and avoids repeats from the previous 15 active same-level MM mocks.
- Existing mock previews render cleanly without duplicated first-natural-number prompt text.
- Admin mock assignment is scoped to active students in the selected mock module and level.
- Student competition mock attempts now keep timer/navigation visible with a compact sticky attempt layout.
- Question previews avoid inner scrollbars for expression-style displays.

## Existing Brain Context

The repository already contains `.mathpath`, which remains authoritative for legacy epic/package context:

- `.mathpath/STATE.yaml`
- `.mathpath/rules/global.md`
- `.mathpath/packages/pkg-10-rollout.md`

This project-memory folder extends that system with daily continuity, deployment evidence, and handoff notes.

## Verification Baseline

Recent verification commands that passed:

- Backend: `.venv\Scripts\python.exe -m pytest tests`
- Backend focused: `.venv\Scripts\python.exe -m pytest tests\test_mm_competition_mock_generator.py`
- Frontend: `npm.cmd run typecheck`
- Frontend: `npm.cmd run build`
- Live API smoke: MM mock section plan returns 100 total questions, 10 locked sections, and 10 questions per section.
- Live API smoke: temporary MM mock draft generated 100 questions, 3600 seconds, 10 locked sections, then was deleted.
- Live Vercel smoke: Admin Mock Studio loads with live auth token and MM defaults are visible after module/level selection.

## Known Local Unrelated Items

These were present and intentionally left untouched:

- `MathPath-Platform`
- `copy_titles.py`
- `old_seed.py`
- `seed_function.py`
