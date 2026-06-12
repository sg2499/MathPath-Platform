# MathPath Scoped Verification System

This verification setup uses Playwright to capture screenshots, text snapshots, HTML snapshots, console errors, page errors, failed network requests, HTTP errors, and route summaries.

It is split into focused commands so you do not have to run the full platform sweep after every small UI change.

## Before Running

Run backend in one terminal.

Run frontend in another terminal:

```powershell
cd frontend
npm run dev
```

Then run verification in a third terminal:

```powershell
cd frontend
npm run verify:teacher-results
```

## First-Time Setup

1. Install dependencies and browser binaries:
```powershell
cd frontend
npm install
npx playwright install chromium
```

2. Create a local environment file by copying the template:
```text
.env.verification.example  ->  .env.verification
```
The file `.env.verification` is ignored by Git (via `.gitignore`), meaning it is secure to put actual live platform credentials there for local testing.

## Live Verification & Theme Testing

By default, the sweeps target `http://localhost:3000` in `light` mode. You can redirect the target or change the theme using environment variables:

### 1. Target Base URL
Define `MATHPATH_BASE_URL` in `.env.verification` or set it in your shell. For example, to sweep the live deployed site:
```powershell
$env:MATHPATH_BASE_URL="https://math-path-platform.vercel.app"
```

### 2. Theme Mode Sweep
Specify `MATHPATH_THEME="light"` or `MATHPATH_THEME="dark"`. The test runner will automatically inject the corresponding key into `localStorage` and class updates to test the layout in that mode:
```powershell
# Run a full dark mode sweep on live site
$env:MATHPATH_THEME="dark"
$env:MATHPATH_REPORT_DIR="verification-report/dark"
npx playwright test tests/mathpath-platform-verification.spec.ts --config=playwright.config.ts
```


## Command Levels

### Full Regression

Use only before freezing a larger phase or after shared/nav/backend contract changes.

```powershell
npm run verify:mathpath
```

### Public/Login

```powershell
npm run verify:public
```

### Role-Level Sweeps

```powershell
npm run verify:admin
npm run verify:teacher
npm run verify:student
```

### Admin Tab Sweeps

```powershell
npm run verify:admin-dashboard
npm run verify:admin-curriculum
npm run verify:admin-students
npm run verify:admin-teachers
npm run verify:admin-assignments
npm run verify:admin-assessments
npm run verify:admin-assessment-blueprints
npm run verify:admin-assessment-readiness
npm run verify:admin-results
```

### Teacher Tab Sweeps

```powershell
npm run verify:teacher-dashboard
npm run verify:teacher-students
npm run verify:teacher-assign-dps
npm run verify:teacher-tracker
npm run verify:teacher-results
npm run verify:teacher-assessments
npm run verify:teacher-assessment-readiness
```

### Student Tab Sweeps

```powershell
npm run verify:student-dashboard
npm run verify:student-practice
npm run verify:student-results
npm run verify:student-assessments
npm run verify:student-assessment-readiness
```

## Custom Scope Runner

You can also run any scope directly:

```powershell
npm run verify:scope -- teacher-results
npm run verify:scope -- admin-assignments
npm run verify:scope -- student-results
```

Headed mode:

```powershell
npm run verify:scope -- teacher-results --headed
```

Or with PowerShell helper:

```powershell
.\scripts\run-mathpath-verification.ps1 -Scope teacher-results
.\scripts\run-mathpath-verification.ps1 -Scope teacher-results -Headed
```

## Report Location

Each command writes to its own folder:

```text
frontend/verification-report/<scope>/
├── summary.md
├── screenshots/
├── page-snapshots/
├── diagnostics/
└── playwright-html/
```

Example:

```text
frontend/verification-report/teacher-results/
```

Zip the scope folder after running:

```powershell
Compress-Archive -Path verification-report\teacher-results -DestinationPath teacher-results-verification-report.zip -Force
```

Upload the ZIP here for review.

## Safety Rules

The script clicks safe view/review/details/tabs/expand/filter controls, but skips destructive or state-changing actions such as:

```text
Delete
Archive
Deactivate
Reset
Submit
Publish
Save
Approve
Assign Now
Create Assignment
Create Assessment
Start Attempt
Logout
```

## Dynamic Routes

Some detail routes need sample IDs. Add these to `.env.verification` when you want those pages captured:

```text
MATHPATH_SAMPLE_ASSIGNMENT_ID=
MATHPATH_SAMPLE_ASSESSMENT_ID=
MATHPATH_SAMPLE_ATTEMPT_ID=
MATHPATH_SAMPLE_DPS_ID=
```

Student/module-level detail defaults are already set:

```text
MATHPATH_SAMPLE_STUDENT_CODE=MP-ST-001
MATHPATH_SAMPLE_MODULE_CODE=YLM
MATHPATH_SAMPLE_LEVEL_CODE=YLM-L1
```

## Best Workflow

For a focused change, run only the matching command.

Examples:

```powershell
npm run verify:teacher-results
npm run verify:student-results
npm run verify:admin-assignments
```

For a role-wide change:

```powershell
npm run verify:teacher
```

For a final phase freeze:

```powershell
npm run verify:mathpath
```
