# Package 7 (Phase 7): Teacher/Admin Monitoring

## Objective
Give teachers and admins visibility into an event while it's live and
after it's over.

## Status: COMPLETE (2026-09-05)

## What was built (backend)
- `backend/app/services/annual_competition_monitoring_service.py` -- the
  full read-only engine, split into the checklist's two concerns:
  - **Live view** (`GetAnnualCompetitionLiveMonitoring`): recomputes, on
    every call, a `liveStatus` per assignment --
    `NOT_STARTED`/`IN_PROGRESS`/`STUCK`/`SUBMITTED`/`FINALIZED` -- from
    `CompetitionEventAttempt`/`CompetitionEventAttemptSectionState` as
    they stand right now. Nothing is stored. `STUCK` deliberately reuses
    `HEARTBEAT_GRACE_SECONDS` from `annual_competition_attempt_service.py`
    (imported, not duplicated as a literal) -- the exact same "no
    heartbeat within the grace window right now" definition Package 4's
    `ReconcileExpiredCompetitionEventAttempts` already uses, so an admin
    sees precisely the population that sweep will act on next run. Also
    returns summary counts and supports an optional `slotId` filter (the
    checklist's "per student, per slot").
  - **Post-event review** (`ListAnnualCompetitionResultsForRoster`):
    roster-scoped, release-gated results -- an unreleased (or not-yet-
    computed) result never surfaces its metrics, mirroring
    `GetCompetitionEventResultForStudent`'s own lock-down from Package 6,
    just applied across a roster instead of one student/attempt.
  - `ListNonDraftAnnualCompetitionEvents` -- a minimal event picker (both
    monitoring endpoints need an event ID first); excludes DRAFT events,
    same exclusion rule the student-facing discovery endpoint already
    applies.
  - Both `GetAnnualCompetitionLiveMonitoring` and
    `ListAnnualCompetitionResultsForRoster` take an optional
    `StudentIdsFilter`: `None` = every assignment on the event (admin,
    who can always see every student); an explicit list = only those
    students (teacher, scoped by the caller via `own_students_query`); an
    explicitly *empty* list short-circuits to an empty result without
    ever issuing an `IN ()` query, mirroring
    `_teacher_competition_tracker_payload`'s own early return for a
    teacher with no students.
  - Zero mutation anywhere in this module (no `db.add`/`db.commit`) -- a
    pure read surface over state Packages 1/4/6 already maintain.
- `backend/app/api/routes_admin.py` -- one new endpoint:
  `GET /api/admin/annual-competition/events/{event_id}/monitoring/live`
  (optional `slotId` query param), `StudentIdsFilter=None`. Post-event
  review for admin is unchanged -- Package 6's own
  `GET .../results` already bypasses the release gate for admin, exactly
  the checklist's "still showing admin everything."
- `backend/app/api/routes_teacher.py` -- 3 new, **GET-only** endpoints
  (checklist item 3: "Teacher role has no write path here" -- matches
  this repo's existing Competition Mock teacher-permissions convention,
  `pkg-09-permissions-and-safety.md`):
  `GET /api/teacher/competition/annual/events` (non-DRAFT event picker),
  `GET .../events/{event_id}/live` (own roster only, via
  `own_students_query`), `GET .../events/{event_id}/results` (own roster
  only, release-gated).
- `backend/tests/test_annual_competition_monitoring_service.py` -- 15 new
  tests: NOT_STARTED/IN_PROGRESS/STUCK/FINALIZED derivation (including a
  direct construction proving the mapper still handles a persisted
  SUBMITTED row correctly, even though today's only write path collapses
  straight through it to FINALIZED in one transaction), roster scoping
  (empty-list short-circuit, filtered-to-given-students, admin-sees-all),
  the slot filter, release-gating for the roster results view (hidden
  until released, full metrics + rank once released, not-started student
  has no result, empty-filter short-circuit), the non-DRAFT event filter,
  and a route-introspection check that all 3 new teacher routes are
  GET-only.
- Full backend suite: 466 passed (451 existing + 15 new), zero
  regressions.

## What was built (frontend)
- `frontend/lib/api/admin.ts` -- Package 6's results/rank/release client
  functions (never added when Package 6 shipped API-only) plus Package
  7's own live-monitoring and reconcile client functions.
- `frontend/app/admin/competition/annual-studio/[eventId]/page.tsx` --
  two new tabs on the existing Studio event page: **Live Monitoring**
  (per-student status table, summary counts, a 15s auto-refresh while the
  tab is open, and a "Run Reconciliation Sweep" button -- this finally
  gives Package 4's reconcile endpoint and Package 6's rank/release
  endpoints a UI, having shipped API-only in their own packages) and
  **Results** (rank/release actions, per-level filter, results table).
- `frontend/lib/api/teacher.ts` -- read-only client functions for the 3
  new teacher endpoints.
- `frontend/app/teacher/competition/annual/page.tsx` -- new page: an
  event picker plus Live Status / Results tabs, scoped to the teacher's
  own roster, with no write action anywhere on the page (checklist item
  3). Styled to match the Studio page's simpler table-based convention
  rather than the heavier grouped/expandable Competition Mock Tracker --
  a deliberate, lighter-weight choice for a status table, not an attempt
  to replicate that page's bespoke dark-hover CSS system.
- Added to the teacher sidebar nav (`AppShell.tsx`) under Competition ->
  "Annual Competition Monitor".
- Verification: `npx tsc --noEmit` clean, `npm run build` succeeds
  (new routes: the admin event-detail page grew by two tabs; new
  `/teacher/competition/annual` route added), zero new warnings.

## Checklist

### 1. Live view
- [x] Started/in-progress/submitted/stuck status per student, per slot,
      during the event window.

### 2. Post-event review
- [x] Results review screen, respecting the Package 6 release gate for
      any student/parent-visible surfaces while still showing admin
      everything.

### 3. Verification
- [x] Teacher role has no write path here (monitor/review only, matching
      this repo's existing Competition Mock teacher-permissions
      convention -- see `pkg-09-permissions-and-safety.md` under the
      Competition Mock Practice epic for the precedent). Enforced both by
      construction (every new teacher route is a GET calling a read-only
      service function) and by a dedicated route-introspection test.

## Not built in this package (by design -- later packages' scope)
- No leaderboard or certificate display -- Package 8's territory.
- The "technical issue" admin-retry-override for a genuine retake
  (REQUIREMENTS.md item 6) -- flagged again here, now built as its own
  small addition, see `pkg-06b-retry-override.md` (COMPLETE, 2026-09-05).
