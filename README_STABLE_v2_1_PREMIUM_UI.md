# MathPath Full-Stack v2.1 Premium UI Stable

This is the clean stable package for the current MathPath platform phase.

## Included in this stable build

- Backend API working
- SQLite seed setup available
- Admin login flow working
- Student login flow working
- Admin dashboard working
- Curriculum browser working
- DPS generate preview working
- Create assignment flow working
- Student dashboard working
- Student test attempt flow working
- Auto-save and submit flow working
- Student result history working
- Admin DPS-wise results working
- Premium UI applied
- Dark/light theme system applied
- MathPath logo integrated
- Favicon/browser tab icon added
- Dark-mode MCQ preview visibility fixed

## Do not edit this stable folder directly

Use this as your rollback-safe version. For the next feature phase, duplicate this folder and work on the copy.

Recommended next working folder name:

```txt
mathpath_ylm_fullstack_v2_2_phase2_student_management
```

## Backend setup

From the `backend` folder:

```powershell
python -m venv backend_venv
backend_venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python run.py
```

Backend should run at:

```txt
http://localhost:8000
```

Health check:

```txt
http://localhost:8000/api/health
```

Swagger docs:

```txt
http://localhost:8000/docs
```

## Frontend setup

From the `frontend` folder:

```powershell
npm install
copy .env.example .env.local
npm run dev
```

Frontend should run at:

```txt
http://localhost:3000
```

## Default test credentials

Admin:

```txt
admin@mathpath.local
Admin@123
```

Student:

```txt
student@mathpath.local
Student@123
```

## Suggested sanity test after setup

1. Open `/login`
2. Test light/dark toggle
3. Login as admin
4. Open Curriculum
5. Select DPS and Generate Preview
6. Create assignment
7. Logout
8. Login as student
9. Start practice
10. Answer and submit
11. View result
12. Login as admin again
13. Check DPS-wise results

## Favicon note

Browsers cache favicons aggressively. If the MathPath icon does not appear immediately in the browser tab:

- hard refresh
- close/reopen the tab
- clear site data if needed
