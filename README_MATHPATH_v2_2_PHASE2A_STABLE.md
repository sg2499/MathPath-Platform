# MathPath v2.2 — Phase 2A Student Management Stable

This is the stable rollback-safe package after completing Phase 2A Student Management.

## Included in this stable build

### Core platform
- Backend API working
- Frontend working
- Premium UI restored
- Dark/light theme system
- MathPath logo integrated
- Favicon/browser tab icon integrated
- Header fit fixes applied

### Admin
- Admin dashboard
- Curriculum browser
- DPS generate preview
- Create assignment
- Admin DPS-wise results

### Student flow
- Student dashboard
- Student practice/test flow
- Auto-save
- Submit test
- Student result history
- Student avatar/photo shown in top profile area after login

### Student Management
- Admin Students tab
- Full student admission-style profile
- Photo upload
- Signature upload
- Local backend image storage
- Student directory table
- Search
- Teacher filter
- Add/Edit student form
- Student profile modal
- Modal overlay/header overlap fix
- Activate/deactivate student
- Delete student with confirmation
- Reset student password
- Bulk Excel template download
- Bulk Excel upload
- Mandatory Excel validation
- Excel-uploaded password preservation

## Image storage

Local student images are stored inside:

```txt
backend/uploads/students/photos/
backend/uploads/students/signatures/
```

For deployment, this can later be moved to cloud storage.

## Do not edit this stable folder directly

Use this as the rollback-safe version.

For the next phase, duplicate this folder and work on the copy.

Recommended next working folder name:

```txt
mathpath_v2_3_phase2b_teacher_management
```

## Backend setup

From the `backend` folder:

```powershell
python -m venv backend_venv
.\backend_venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python run.py
```

Backend:

```txt
http://localhost:8000
```

Health check:

```txt
http://localhost:8000/api/health
```

Swagger:

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

Frontend:

```txt
http://localhost:3000
```

## Default credentials

Admin:

```txt
admin@mathpath.local
Admin@123
```

Demo Student:

```txt
student@mathpath.local
Student@123
```

## Recommended sanity test

1. Start backend.
2. Start frontend.
3. Login as admin.
4. Open Students.
5. Add a student with photo and signature.
6. Confirm student appears in the table.
7. Open student profile modal.
8. Confirm close/back button works and modal does not overlap with top navbar.
9. Test teacher filter.
10. Download Excel template.
11. Upload Excel with required fields.
12. Login as the newly created student.
13. Confirm student photo appears in top avatar after login.
14. Create assignment from admin.
15. Complete assignment as student.
16. Check student result history.
17. Check admin DPS-wise results.

## Notes

- For existing students imported before the password fix, delete/re-upload the test student or reset the password from the Students table.
- If student avatar does not update immediately, logout and login again.
- If styling looks stale, clear frontend cache:

```powershell
cd frontend
rmdir /s /q .next
npm run dev
```

Then hard refresh browser:

```txt
Ctrl + Shift + R
```
