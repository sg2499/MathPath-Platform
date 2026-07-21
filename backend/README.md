# MathPath Backend Working Version v1

This backend implements the first working vertical slice for the MathPath YLM Phase 1 platform.

## Included

- FastAPI backend
- SQLite default local database
- JWT login
- Seeded users
- Seeded YLM Level 1 Lessons 1-8
- 5 DPS per lesson, 40 DPS configs total
- Admin curriculum APIs
- Admin DPS preview generation
- Admin assignment creation
- Student assignment list
- Student attempt start/resume
- Dynamic 10-question MCQ generation
- 1 correct + 3 incorrect options
- Randomized correct option position
- Server-side answer validation
- Auto-save answers
- Manual submit
- Auto-submit support
- Student/admin result APIs

## Quick Start

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python run.py
```

Open:

```text
http://localhost:8000/docs
```

## Seeded Logins

These are example local-dev accounts, not something the app auto-creates with a fixed password. Set your own password for each when you set up a fresh local environment.

Admin:

```text
identifier: admin@mathpath.local
password: <set locally when you create this account, never commit a real value here>
```

Teacher:

```text
identifier: teacher@mathpath.local
password: <set locally when you create this account, never commit a real value here>
```

Student:

```text
identifier: student@mathpath.local
password: <set locally when you create this account, never commit a real value here>
```

Student code login also works:

```text
identifier: YLM001
password: <set locally when you create this account, never commit a real value here>
```

## First Test Flow

1. Login as admin.
2. Call `GET /api/admin/modules`.
3. Browse levels, lessons, and DPS.
4. Call `POST /api/admin/dps/{dpsId}/generate-preview`.
5. Create an assignment if needed.
6. Login as student.
7. Call `GET /api/student/assignments`.
8. Call `POST /api/student/attempts/start`.
9. Save answers using `POST /api/student/attempts/{attemptId}/answers`.
10. Submit using `POST /api/student/attempts/{attemptId}/submit`.
11. View result using `GET /api/student/attempts/{attemptId}/result`.

## Important Security Rule

Student APIs never expose `correct_answer` or `is_correct` before submission. Admin preview and result review may expose answer keys.
