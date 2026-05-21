# Phase 10.9.1 — Render + Vercel Deployment Configuration

## Deployment Target

- Backend: Render Web Service
- Database: Render PostgreSQL
- Frontend: Vercel

## Backend Deployment

1. Push these files to GitHub.
2. In Render, create a new Blueprint from the GitHub repo using `render.yaml`, or create the PostgreSQL database and web service manually.
3. Backend root directory: `backend`.
4. Build command: `pip install -r requirements.txt`.
5. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
6. Health check path: `/api/health`.

## Required Backend Environment Variables

Use Render environment variables, not committed `.env` files.

```text
DATABASE_URL=<Render PostgreSQL internal/external connection string>
SECRET_KEY=<long random production secret>
ACCESS_TOKEN_EXPIRE_MINUTES=1440
SEED_ON_STARTUP=true
TEMPORARY_ASSESSMENT_READINESS_BYPASS=false
ASSESSMENT_TESTING_OVERRIDE_ENABLED=false
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=bgmenterprisekol@gmail.com
SMTP_PASSWORD=<Gmail app password>
SMTP_FROM_EMAIL=bgmenterprisekol@gmail.com
SMTP_FROM_NAME=MathPath Team
SMTP_USE_TLS=true
```

## Frontend Deployment

1. Import the same GitHub repo into Vercel.
2. Set project root directory to `frontend`.
3. Add environment variable:

```text
NEXT_PUBLIC_API_BASE_URL=https://YOUR-RENDER-BACKEND.onrender.com/api
```

4. Deploy.

## Post-Deployment Smoke Test

- Open `https://YOUR-RENDER-BACKEND.onrender.com/api/health`.
- Confirm it returns `{ "status": "ok" }`.
- Open Vercel frontend URL.
- Test Admin, Teacher, and Student login.
- Test Admin Students page.
- Test Teacher tracker.
- Test Student practice/results.

## Safety Notes

- Do not commit `.env` files.
- Do not deploy SQLite for client testing.
- Do not run demo reset unless explicitly approved.
- Keep readiness bypass disabled for client demo unless controlled QA needs it.
