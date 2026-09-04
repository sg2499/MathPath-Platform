# Package 5 (Phase 5): Student Live-Attempt UI

## Objective
The student-facing screen for actually taking the Annual Competition,
built on top of the Package 4 timer/pause engine.

## Status: COMPLETE (2026-09-04)

## Scope note: answer capture was added to this package, not Package 4

Package 4's own doc explicitly scoped answer capture out ("No answer
capture ... A student's actual responses are Package 5/6 territory").
Building the actual attempt screen surfaced that Package 4 also never
added a `CompetitionEventAttemptAnswer` table -- there was nowhere to
persist a selected option at all. This is a real, considered scope
addition to this package (not a silent expansion): a new
`CompetitionEventAttemptAnswer` model was added (models.py), mirroring
`CompetitionMockAttemptAnswer`'s exact shape and reusing the same frozen
`CompetitionMockQuestion`/`CompetitionMockQuestionOption` rows the linked
`CompetitionEventLevelPaper.mock_exam_id` already points at -- no parallel
question/option model invented. `Base.metadata.create_all` at FastAPI
startup means the new table needs no Alembic migration.

## What was built (backend)
- `backend/app/models/models.py`: new `CompetitionEventAttemptAnswer`
  model (see the class's own docstring for why it also directly answers
  the client's item-4 tie-break -- "who made a mistake first" -- with no
  extra ordering column, by ordering on the joined question's
  `question_number`, which is identical for every student on the same
  level paper).
- `backend/app/services/annual_competition_attempt_service.py` (extends
  the Package 4 file):
  - **Slot-gated start**: `_CheckSlotGate` -- enforced only when the
    assignment has a `slot_id` set. Nothing today populates `slot_id` in
    bulk (only the admin studio's one-at-a-time manual override does) --
    a real, tracked gap, not a bug: for the common AUTO-assigned case
    there is nothing to gate against yet, so starting is correctly
    allowed. Wired into `StartCompetitionEventAttempt` so only a brand
    new first attempt is gated, never a resume (a resume must always
    succeed regardless of slot timing, since the student is already in).
  - **Question-serving**: `_ActiveSectionQuestionsPayload` /
    `_QuestionOptionPayload` -- `GetCompetitionEventAttemptForStudent` now
    returns the active section's questions/options/saved-answers
    (`is_correct` deliberately stripped from the option payload; option
    keys are `label`/`value`, matching the existing `McqOption` frontend
    type/`OptionButton` component rather than inventing new field names).
    Heartbeat/submit-section responses stay lean by design; the frontend
    re-fetches via GET whenever it detects `currentSectionNumber` or
    `status` changed.
  - **`SaveCompetitionEventAnswer`**: mirrors
    `SaveCompetitionMockAnswer`'s exact upsert pattern, layered with the
    same session-token + active-section guards every other mutating entry
    point in this file already enforces -- a question outside the
    currently-active section is rejected even with a valid token, since
    sections lock sequentially (no cross-section review, unlike
    Competition Mock's flat list).
  - **`ListMyAnnualCompetitionAssignments`**: new student discovery
    endpoint -- every active assignment across events (excluding `DRAFT`
    events), each with slot info if any and the latest attempt's status
    (`NOT_STARTED` when none exists yet), so the frontend can route a
    student to "not started" / "resume" / "already submitted".
  - **`GetCompetitionEventInstructions`**: pre-section instructions
    payload (name, mode, concept family, question count, time limit per
    section) sourced from the curated `CompetitionEventSectionTimer` rows
    joined with question counts from the linked mock exam -- not derived/
    renumbered from which concepts happen to have questions, since every
    section here is explicitly defined up front (mirrors
    `student_competition_mock_instructions`'s shape, adapted).
- `backend/app/api/routes_student.py`: 3 new student routes --
  `GET /api/student/annual-competition/assignments`,
  `GET /api/student/annual-competition/events/{event_id}/instructions`,
  `POST /api/student/annual-competition/attempts/{attempt_id}/answers`.
- `backend/tests/test_annual_competition_student_screens_service.py`: 18
  new tests -- slot-gating (blocked, allowed, unset-never-gated, resume-
  never-gated), question-serving payload shape (no `is_correct` leak),
  answer upsert + re-answer, session-token/section-identity/cross-section/
  cross-question rejections, save-after-submit returns a lean payload
  rather than erroring, discovery listing (not-started -> in-progress,
  DRAFT-event exclusion, slot inclusion), and instructions (happy path,
  404 no assignment, 400 paper not ready). Full backend suite: 434 passed
  (416 existing + 18 new), zero regressions.

## What was built (frontend)
- `frontend/lib/api/student.ts`: Annual Competition student API section --
  types (`AnnualCompetitionAssignmentForStudent`, `AnnualCompetitionInstructions`,
  `AnnualCompetitionAttempt`, `AnnualCompetitionQuestion`, etc., mirroring
  the backend dict payloads verbatim) plus the 6 fetch functions
  (assignments, instructions, start, get, heartbeat, submit-section,
  save-answer).
- `frontend/lib/api.ts`: added `apiErrorDetail()` -- structured
  `{code, message, details}` access to `api_error()`'s response shape,
  alongside the existing `apiErrorMessage()` string-only helper. Needed
  because the slot-gate error carries a machine-readable
  `scheduledStartAt` the instructions screen renders directly, and the
  attempt screen needs to distinguish
  `COMPETITION_ATTEMPT_SESSION_SUPERSEDED` from any other error to show
  its own "resumed elsewhere" state instead of a generic error banner.
- `frontend/hooks/useAnnualCompetitionHeartbeat.ts`: fires a heartbeat
  every 7s (inside the plan's "~5-10s" window, well under the 45s grace
  window) while a section is active, and exposes a `fireNow()` escape
  hatch for the moment the local visual countdown hits zero, so the UI
  reacts immediately instead of waiting for the next scheduled beat.
- `frontend/app/student/competition/annual/page.tsx`: discovery screen --
  lists the student's Annual Competition assignment(s) with status
  (Not Started / In Progress / Submitted), slot info if any, and routes to
  instructions (not started) or straight back into the attempt (resume).
- `frontend/app/student/competition/annual/[eventId]/instructions/page.tsx`:
  pre-section instructions screen (mirrors the Competition Mock
  instructions page's layout) -- section name/mode/concept/question-count/
  time-limit per section, plus a slot-gate-aware "Start Competition" button
  that shows a friendly "opens at ..." message (via `apiErrorDetail`)
  instead of a raw error when the slot hasn't opened yet.
- `frontend/app/student/competition/annual/attempt/[attemptId]/page.tsx`:
  the live multi-section attempt screen. Reuses `MathQuestionDisplay`,
  `OptionButton`, `QuestionNavigator`, `TestTimer` as-is from the
  Competition Mock attempt screen. Key differences from that screen (all
  deliberate, not oversights):
  - **Bootstrap-on-mount**: a plain GET never carries a `session_token`
    (only Start/Resume does -- see the backend service's own module
    docstring). So this screen always calls Start again on mount --
    including a page refresh -- to resume and reissue a fresh token. This
    IS the "resume here" remediation the plan describes.
  - **Heartbeat-driven timer**, not a single client-side countdown against
    a fixed deadline: `useAttemptTimer` still drives the smooth per-second
    visual countdown, but re-anchors to the server's
    `remainingSeconds` every time a heartbeat lands, and the heartbeat --
    not a local timeout -- is the actual source of truth.
  - **No cross-section navigation**: `activeSectionQuestions` only ever
    contains the current section's questions in the first place, so
    "cannot go back to a previous section" falls out of the data shape
    itself, not extra UI logic.
  - **Session-superseded handling**: shows a dedicated "this attempt is
    now active in another session" screen (with a manual "Resume Here"
    reload) rather than a generic error toast, since this is an expected,
    recoverable state (Package 4's single-active-session guard working as
    designed), not a failure.
  - **No results redirect**: once `status` leaves `IN_PROGRESS`, shows an
    in-page "Competition Submitted" card. There is nowhere to redirect to
    yet -- `CompetitionEventResult` computation/display is Package 6.
- `frontend/components/common/AppShell.tsx`: added "Annual Competition" as
  the first item under the student "Competition" nav group, linking to
  `/student/competition/annual`.
- Verification: `npx tsc --noEmit` clean, `npm run build` succeeds with
  all 3 new routes generated
  (`/student/competition/annual`,
  `/student/competition/annual/[eventId]/instructions`,
  `/student/competition/annual/attempt/[attemptId]`), zero new warnings.

## What's NOT built yet (explicitly out of scope, not silently skipped)
- No results/leaderboard screen -- `CompetitionEventResult` computation and
  its student-facing display are Package 6.
- No admin/teacher live-monitoring view of an in-progress competition --
  Package 7.
- Manual browser-driven end-to-end verification (actually clicking through
  a full multi-section attempt with a real pause/resume) has not been
  done -- only backend-level automated tests plus frontend build/typecheck
  verification.

## Checklist

### 1. Pre-attempt gating
- [x] Student cannot start before their assigned slot's
      `scheduled_start_at` ("can't begin before your scheduled time") --
      enforced backend + mirrored client-side (disabled Start button with
      an "opens at ..." message).
- [x] Pre-section instructions screen showing section name, ABACUS/VISUAL
      mode, concepts/formats, sum count, and time limit -- per the client
      doc's own requirement.

### 2. Attempt screen
- [x] Multi-section timer UI, one section active at a time.
- [x] Resume-on-reconnect UX: reopening mid-section (including a hard
      refresh) re-resumes via Start and picks up the persisted remaining
      time -- no special-cased "you were disconnected" flow, since
      disconnect and idle-reopen are indistinguishable by design.
- [x] "Your timer is running" indicator: the sticky timer card is always
      visible during a section; no separate connectivity indicator was
      added beyond that, since heartbeats are already the only signal
      this mechanic has (see Package 4's own "explicitly not solved by
      this" note on idle-but-connected tabs).
- [x] Answer capture: full question/option UI wired to the save-answer
      endpoint, auto-saving on selection.

### 3. Verification
- [x] Backend: a student cannot start a second concurrent session
      (Package 4's `session_token` guard, now also covering the new
      answer-save endpoint) -- covered by tests.
- [x] Backend: slot-gating blocks/allows correctly, and a resume is never
      re-gated -- covered by tests.
- [x] Frontend: builds and typechecks clean with all 3 new routes
      generated.
- [ ] Manual/browser end-to-end run-through (real disconnect/resume,
      real section auto-advance) -- not yet done, noted above.
