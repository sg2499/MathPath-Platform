# Package 5 (Phase 5): Student Live-Attempt UI

## Objective
The student-facing screen for actually taking the Annual Competition,
built on top of the Package 4 timer/pause engine.

## Status: IN PROGRESS (2026-09-04) -- backend complete, frontend not started

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
    (`is_correct` deliberately stripped from the option payload).
    Heartbeat/submit-section responses stay lean by design; the frontend
    is expected to re-fetch via GET whenever `currentSectionNumber`
    changes.
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

## What's NOT built yet (explicitly out of scope, not silently skipped)
- No frontend at all yet: the pre-section instructions screen and the
  multi-section attempt/timer UI (checklist items 2 below) are next.
- No nav/routing entry point wired for students to reach this feature yet.

## Checklist

### 1. Pre-attempt gating
- [x] Student cannot start before their assigned slot's
      `scheduled_start_at` ("can't begin before your scheduled time") --
      backend enforced (`_CheckSlotGate`); only matters once `slot_id` is
      actually populated for a student (currently admin-override-only,
      see the note in `StartCompetitionEventAttempt`'s own docstring).
- [ ] Pre-section instructions screen showing section name, ABACUS/VISUAL
      mode, concepts/formats, sum count, and time limit -- per the client
      doc's own requirement. Backend payload (`GetCompetitionEventInstructions`)
      is ready; the screen itself is not built.

### 2. Attempt screen
- [ ] Multi-section timer UI, one section active at a time.
- [ ] Resume-on-reconnect UX: reopening mid-section picks up exactly where
      the heartbeat mechanic left off, with no special-cased "you were
      disconnected" flow needed since disconnect and idle-reopen are
      indistinguishable by design.
- [ ] "Your timer is running" indicator, since heartbeats signal
      connectivity, not attentiveness -- an idle-but-connected tab still
      burns its timer normally.
- [x] Answer capture: backend save-answer endpoint and payload wiring are
      done (see above); the question/option UI itself is not built.

### 3. Verification
- [x] Backend: a student cannot start a second concurrent session
      (Package 4's `session_token` guard, now also covering the new
      answer-save endpoint) -- covered by tests.
- [x] Backend: slot-gating blocks/allows correctly, and a resume is never
      re-gated -- covered by tests.
- [ ] Frontend: a student who reloads mid-section resumes with the
      correct remaining time, not a full reset -- cannot be verified until
      the attempt screen exists.
