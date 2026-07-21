# MathPath YLM Full-Stack v1

Integrated full-stack package for **MathPath YLM Phase 1**.

This package combines:

- FastAPI backend working version
- Next.js frontend working version
- Database schema and seed references
- Product/engineering documentation

## Current Scope

YLM Phase 1 supports:

- Young Learners Module
- Level 1
- Lessons 1–8
- 5 DPS per lesson
- 40 DPS configs total
- 10 MCQ questions per DPS
- 1 correct answer + 3 plausible wrong answers
- Randomized correct option position
- Server-side answer validation
- Student attempt flow
- Timer and auto-submit support
- Admin preview and assignment flow

## Folder Structure

```text
mathpath_ylm_fullstack_v1/
├── backend/     # FastAPI backend
├── frontend/    # Next.js frontend
├── db/          # SQL schema and seed reference files
├── docs/        # Product and technical documentation
├── SETUP_GUIDE.md
└── README.md
```

## Seeded Logins

These are example local-dev accounts, not something the app auto-creates with a fixed password. Set your own password for each when you set up a fresh local environment, and never commit a real value here.

### Admin

```text
identifier: admin@mathpath.local
password: <set locally -- see "Rotate seeded credentials" below, never commit a real value here>
```

### Teacher

```text
identifier: teacher@mathpath.local
password: <set locally -- see "Rotate seeded credentials" below, never commit a real value here>
```

### Student

```text
identifier: student@mathpath.local
password: <set locally -- see "Rotate seeded credentials" below, never commit a real value here>
```

Student code login:

```text
identifier: YLM001
password: <set locally when you create this account, never commit a real value here>
```

## Quick Run

Open two terminals.

### Terminal 1: Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # Windows PowerShell: copy .env.example .env
python run.py
```

Backend runs at:

```text
http://localhost:8000
```

API docs:

```text
http://localhost:8000/docs
```

### Terminal 2: Frontend

```bash
cd frontend
npm install
cp .env.example .env.local  # Windows PowerShell: copy .env.example .env.local
npm run dev
```

Frontend runs at:

```text
http://localhost:3000
```

## First Full Test Flow

1. Start backend.
2. Start frontend.
3. Login as admin.
4. Open curriculum.
5. Select any YLM Level 1 Lesson 1–8 DPS 1–5.
6. Generate preview.
7. Create an assignment.
8. Login as student.
9. Open assigned DPS.
10. Start attempt.
11. Answer MCQs.
12. Submit or allow timer to auto-submit.
13. View result.
14. Login as admin and view result/attempt review.

## Important Product Rules

- Correct answers are never exposed to students before submission.
- Every question has exactly 4 MCQ options.
- Correct option position is randomized.
- Question labels are numeric only.
- Timer authority is backend-side.
- Scoring is backend-side only.


## v2 Stable Package Notes

This package includes the tested YLM Phase 1 full-stack stable flow:

- Backend bcrypt/passlib dependency pinning (`passlib==1.7.4`, `bcrypt==4.0.1`).
- Swagger bearer auth support for protected endpoints.
- Root `QueryProvider` wiring for TanStack Query.
- Student assignment status logic: `NOT_STARTED`, `IN_PROGRESS`, `SUBMITTED`, `AUTO_SUBMITTED`.
- Guarded attempt timer to prevent instant auto-submit while questions are loading.
- Student dashboard shows only active assignments.
- Student Results History page at `/student/results`.
- AppShell navigation for Dashboard/Results and admin controls.
- Admin Create Assignment dropdown workflow.
- Admin Curriculum Browser with MCQ preview, show/hide answers, and direct level assignment.

Default test credentials:

- Admin: `admin@mathpath.local` / `<set locally, see below>`
- Student: `student@mathpath.local` / `<set locally, see below>`
