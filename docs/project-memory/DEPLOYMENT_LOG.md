# Deployment Log

Last updated: 2026-06-17

## 2026-06-17

### Competition Mock Assignment Scope Fix

Expected deployment:

- Render backend redeploy.
- Vercel frontend redeploy.

Verification:

- Frontend typecheck passed locally.
- Frontend production build passed locally.
- Focused backend assignment/MM generator tests passed locally.
- Full backend pytest suite passed locally: 15 passed.

Change summary:

- Admin Mock Studio assignment scope now comes from selected mock exam(s).
- Student list filters by selected mock module and level.
- Backend assignment rejects selected students outside that module+level and assign-all only targets eligible students.

### Commit `918d38c`

Title: `Improve MM mock question variety`

Pushed to:

- `main`
- GitHub remote `origin`

Expected deployment:

- Render backend redeploy.

Verification:

- Backend focused MM generator tests passed locally.
- Full backend tests passed locally: 13 passed.
- Live Render API generated and deleted a temporary 100-question MM mock:
  - mock id `4c92384b-6951-4948-8fc8-5184c274c06b`
  - write-position values: `-1,-2,0`
  - unique write-position values: `-2,-1,0`
  - trivial multiplication/division operand count: `0`
  - 100 questions deleted during cleanup

### Commit `9ede198`

Title: `Enforce MM mock question freshness`

Pushed to:

- `main`
- GitHub remote `origin`

Expected deployment:

- Render backend redeploy.
- Vercel frontend may redeploy from the same repo push, but the product change is backend-only.

Verification:

- Backend focused MM generator tests passed locally.
- Full backend tests passed locally: 11 passed.
- Live Render API generated and deleted a temporary MM mock:
  - mock id `f21af651-0964-4975-a460-d0934a8e0afb`
  - level `MM-L1`
  - 10 generated questions
  - `freshnessWindow` returned as `15`
  - `recentBlocked` returned as `100`
  - 10 questions deleted during cleanup

## 2026-06-16

### Commit `d327e84`

Title: `Fix MM competition mock generation`

Pushed to:

- `main`
- GitHub remote `origin`

Expected deployment:

- Render backend redeploy.
- Vercel frontend redeploy.

Verification:

- Backend tests passed locally.
- Frontend typecheck and build passed locally.
- Live Render API verified MM section plan:
  - 100 total questions.
  - 10 sections.
  - all sections locked.
  - 10 questions per section.
- Live Render API generated and deleted a temporary MM mock:
  - 100 generated questions.
  - 3600 seconds.
  - section-locked coverage.
- Live Vercel UI verified MM defaults after selecting MM module and level.

### Commit `861bf41`

Title: `Clean MM mock question previews`

Pushed to:

- `main`
- GitHub remote `origin`

Expected deployment:

- Vercel frontend redeploy.

Verification:

- Frontend typecheck passed locally.
- Frontend production build passed locally.
- Live Vercel exact mock detail URL loaded successfully after deploy.
- Browser smoke showed no console errors.
