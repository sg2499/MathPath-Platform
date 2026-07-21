# MathPath YLM Full-Stack Setup Guide

## 1. Requirements

Install:

- Python 3.11+
- Node.js 18+
- npm

The backend currently uses SQLite by default for fast local setup. PostgreSQL can be configured later by changing `DATABASE_URL` in `backend/.env`.

---

## 2. Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python run.py
```

Windows PowerShell:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python run.py
```

Backend URL:

```text
http://localhost:8000
```

Docs:

```text
http://localhost:8000/docs
```

---

## 3. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Windows PowerShell:

```powershell
cd frontend
npm install
copy .env.example .env.local
npm run dev
```

Frontend URL:

```text
http://localhost:3000
```

Make sure `frontend/.env.local` contains:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api
```

---

## 4. Seeded Accounts

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

Student code:

```text
identifier: YLM001
password: <set locally when you create this account, never commit a real value here>
```

---

## 5. Integration Test Checklist

### Admin

- Login as admin.
- Open admin dashboard.
- Browse YLM curriculum.
- Select any Lesson 1–8 DPS 1–5.
- Generate preview.
- Confirm each question has 4 options.
- Confirm only one option is marked correct in admin preview.
- Create assignment.

### Student

- Login as student.
- View assignment.
- Open DPS instructions.
- Start attempt.
- Answer questions.
- Move Previous/Next.
- Submit.
- View result.

### Critical Checks

- Student API does not expose `is_correct` before submission.
- Correct option positions vary across questions.
- Timer is restored on refresh.
- Submitted attempts cannot be changed.
