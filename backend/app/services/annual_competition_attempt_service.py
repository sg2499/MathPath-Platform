"""Annual Competition -- Section-Timer + Pause Engine (Package 4).

The highest-risk, most novel piece of the Annual Competition build:
independently timed sections with genuine pause-on-disconnect. Nothing
like this exists anywhere else in this codebase -- DPS, Assessment, and
Competition Mock (competition_mock_attempt_service.py) all use one
whole-attempt wall-clock timer (`expires_at`) with no pause concept at
all. See .mathpath/packages/pkg-04-section-timer-engine.md for the
checklist this was built against, and the "section-timer + pause engine"
section of .mathpath/epics/annual-competition-plan.md for the original
design.

## The heartbeat/pause mechanic, precisely

While a section is ACTIVE, the client is expected to send a heartbeat
every ~5-10s. Each heartbeat compares itself to the section's
*previous* heartbeat (`last_heartbeat_at`) -- never to wall-clock "now"
minus the section's start time -- because remaining time must only ever
move in response to an actual heartbeat, per the plan ("the server only
decrements remaining time between consecutive heartbeats"). This is what
makes a silent, unannounced pause possible with zero extra
infrastructure: if heartbeats simply stop arriving, nothing ever
deducts any more time, and the section just sits however it was left.

The one piece of real design judgment this required (the plan describes
the intent in prose, not as a formula) is exactly how the "grace window"
converts a heartbeat gap into deducted time. Two facts fix the answer:

  1. Package 4's own verification checklist says "heartbeat gap under
     the grace window -> no time lost" AND separately requires normal,
     continuous ~5-10s heartbeating to make the timer actually count
     down (otherwise no section could ever expire from a fixed time
     budget, which the client's own spec requires).
  2. "Resuming ... picks up from the exact persisted remaining time" --
     a real disconnect must not cost the student the whole disconnected
     duration, only a small, bounded amount.

The formula that satisfies both: `EffectiveElapsed = min(RawGap,
HEARTBEAT_GRACE_SECONDS)`. During normal use RawGap (~5-10s) is always
comfortably under the grace window, so EffectiveElapsed == RawGap and
the timer ticks down at the correct, real rate ("no [erroneous] time
lost" versus what actually elapsed). During a real disconnect RawGap
can be arbitrarily large, but EffectiveElapsed is capped at the grace
window -- so a 10-minute disconnect costs the student only
HEARTBEAT_GRACE_SECONDS, exactly matching "picks up from the exact
persisted remaining time." A closing-and-reopening laptop and a genuine
network drop are indistinguishable to the server by design (per the
plan) and this formula treats them identically, on purpose.

## Single-active-session guard

`CompetitionEventAttempt.session_token` is (re)issued every time
`StartCompetitionEventAttempt` is called -- both for a brand new attempt
and for resuming an existing `IN_PROGRESS` one. Any other in-flight
device/tab is left holding the *previous* token, which every mutating
call below (`RecordCompetitionEventHeartbeat`,
`SubmitCompetitionEventSection`) now rejects with
`COMPETITION_ATTEMPT_SESSION_SUPERSEDED`. This is deliberately not a
security boundary (ownership is already checked via `student_id`) --
it is a consistency guard between the same student's own two devices,
closing the multi-device desync gap flagged during plan review. Reads
(`GetCompetitionEventAttemptForStudent`) never check or reissue the
token: only Start/Resume grants write access, matching the plan's
"resume here" remediation -- a rejected stale-token caller's fix is to
call Start again.

## Auto-advance + the FINALIZED vs SUBMITTED distinction

Any request touching an attempt lazily re-checks whether the active
section's `remaining_seconds_at_last_heartbeat` has reached zero (same
"never trust a stale flag, recompute on every touch" pattern as
`EnsureCompetitionAttemptActiveOrSubmit` in
competition_mock_attempt_service.py) and advances/finalizes if so.
Per the lifecycle comment already written on `CompetitionEventAttempt`
in models.py, `FINALIZED` is reserved for once a `CompetitionEventResult`
has been computed. `_AdvanceOrFinalize` below reaches `SUBMITTED` and, in
the same step, calls straight into
`annual_competition_scoring_service.ComputeAndFinalizeCompetitionEventResult`
(Package 6) to compute that result and advance to `FINALIZED` -- see that
module's own docstring for why hooking in at this one shared function,
rather than in every individual caller, means every path to a finished
attempt is scored the same way with nothing left uncovered.

## The reconciliation sweep

The lazy pattern above only ever *reacts* to a request. A student whose
last section's timer would have run out, but who never sends another
request (closed tab, abandoned the attempt, event day is simply over),
leaves that row `IN_PROGRESS` forever -- there is no scheduler/cron
anywhere in this backend to catch it on its own.
`ReconcileExpiredCompetitionEventAttempts` is the admin-triggered safety
net: for every `IN_PROGRESS` attempt whose active section is currently
*paused* (no heartbeat within the grace window -- the same definition
used everywhere else, no new threshold invented), it force-closes that
section and every section after it (in case the whole attempt was
abandoned partway through), crediting no additional time beyond what
was already on record -- consistent with the pause philosophy: an
abandonment is not retroactively punished beyond the one grace window
it already paid for.

## The admin "technical issue" retry override (REQUIREMENTS.md item 6)

"Only once unless there is a technical issue from our end." The single-
attempt part is exactly what `TERMINAL_ATTEMPT_STATUSES` already enforces
above (`StartCompetitionEventAttempt` unconditionally rejects a second
start once the existing attempt reaches SUBMITTED/FINALIZED) -- this
section is only about the override, not a change to that rule.

`GrantAnnualCompetitionAttemptRetry` is an admin-only action against one
specific terminal attempt, and mirrors `AssignmentReattemptPermission`'s
own APPROVED -> USED lifecycle from the DPS precedent
(`active_reattempt_permission_for_attempt` / `start_attempt` in
attempt_service.py) rather than the more elaborate
`BuildManualRetryAssignment` precedent, which manufactures a whole new
`Assignment` row -- that doesn't apply here, since a
`CompetitionEventAssignment` is a permanent event enrollment, not a
retryable per-attempt object. A granted retry instead produces a new
`CompetitionEventAttempt` row on the SAME assignment, one `attempt_number`
higher, which the table's own `(assignment_id, attempt_number)` unique
constraint already supports.

`StartCompetitionEventAttempt`'s terminal-status rejection branch checks
for an active (APPROVED, unused) grant before rejecting; if one exists, it
consumes it (status -> USED, `used_at`, `used_attempt_id`) in the same
transaction that creates the fresh attempt, through the exact same
slot-gate/level-paper/section-timer/section-state-seeding path a brand new
first attempt uses (`_BuildFreshAttempt`, shared by both) -- a retry is not
a special case of that logic, just a second call to it with a higher
`attempt_number`. The old, terminal attempt and its `CompetitionEventResult`
are left completely untouched; nothing about a granted retry retroactively
changes what was already scored.
"""

from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.services.answer_matching import answers_match
from app.models import (
    CompetitionEvent,
    CompetitionEventAssignment,
    CompetitionEventAttempt,
    CompetitionEventAttemptAnswer,
    CompetitionEventAttemptRetryGrant,
    CompetitionEventAttemptSectionState,
    CompetitionEventLevelPaper,
    CompetitionEventResult,
    CompetitionEventSectionTimer,
    CompetitionEventSlot,
    CompetitionMockExam,
    CompetitionMockQuestion,
    CompetitionMockQuestionOption,
    Student,
    User,
)

# 30-60s per the plan; 45s is the documented midpoint -- long enough to
# absorb a couple of missed heartbeats from ordinary network jitter,
# short enough that a real pause is detected (and capped) promptly.
HEARTBEAT_GRACE_SECONDS = 45

IN_PROGRESS_STATUS = "IN_PROGRESS"
TERMINAL_ATTEMPT_STATUSES = {"SUBMITTED", "FINALIZED"}


def _NowUtc() -> datetime:
    return datetime.now(timezone.utc)


def _Aware(Value: datetime | None) -> datetime | None:
    if Value is None:
        return None
    if Value.tzinfo is None:
        return Value.replace(tzinfo=timezone.utc)
    return Value


def _GetOwnedAttemptOr404(db: Session, StudentRecord: Student, AttemptId: str) -> CompetitionEventAttempt:
    AttemptRecord = db.get(CompetitionEventAttempt, AttemptId)
    if not AttemptRecord or AttemptRecord.student_id != StudentRecord.id:
        api_error(404, "COMPETITION_ATTEMPT_NOT_FOUND", "Competition attempt not found.")
    return AttemptRecord


def _LockAttemptForUpdate(db: Session, AttemptId: str) -> CompetitionEventAttempt | None:
    """Row-level lock (SELECT ... FOR UPDATE) on this one CompetitionEventAttempt
    for the rest of the current transaction. Mirrors attempt_service.py's own
    `_lock_attempt_for_update` exactly, and closes the exact same class of
    bug it was built to fix (2026-09-04, Shailesh, DPS: a correct typed
    answer landed in the DB but was scored wrong because save and submit
    raced on two independent DB sessions) -- applied here because Point 8
    (2026-09-08) gave Annual Competition the identical typed-answer save
    path, and because _EnsureActiveSectionOrAdvance's lazy auto-advance
    means SaveCompetitionEventAnswer, SubmitCompetitionEventSection, and
    RecordCompetitionEventHeartbeat can EACH independently be the request
    that finalizes and scores an attempt (see _AdvanceOrFinalize). Called at
    the top of the critical section in all three, right after ownership is
    already confirmed via _GetOwnedAttemptOr404 -- whichever request gets
    here first for a given attempt now fully completes (write the answer;
    or read every answer and finalize/score) before the other can even
    read, instead of racing a stale snapshot. Shailesh, 2026-09-08: "make
    sure the correct answer is always flagged as correct" -- this is the
    half of that guarantee that isn't about the comparison logic itself
    (see answers_match()), it's about never letting a correct save lose a
    race against a concurrent finalize.

    Falls back to a plain (unlocked) read for a DB backend that doesn't
    support row locking (SQLite, used in tests) -- same documented
    fallback as the DPS precedent, and safe for the same reason (SQLite is
    single-writer by nature)."""
    return (
        db.query(CompetitionEventAttempt)
        .filter(CompetitionEventAttempt.id == AttemptId)
        .with_for_update()
        .first()
    )


def _VerifySessionToken(AttemptRecord: CompetitionEventAttempt, SessionToken: str | None) -> None:
    if not SessionToken or AttemptRecord.session_token != SessionToken:
        api_error(
            409,
            "COMPETITION_ATTEMPT_SESSION_SUPERSEDED",
            "This attempt is active in another session. Start/resume again to continue here.",
        )


def _CheckEventNotSuspended(EventRecord: CompetitionEvent) -> None:
    """Package 10 (go-live rollback plan) emergency stop -- see
    SuspendCompetitionEvent's own docstring in annual_competition_studio_
    service.py for the full design rationale. Checked at the two entry
    points into the student-facing attempt flow that take an EventRecord
    directly (the pre-attempt instructions screen, and Start/Resume) --
    deliberately NOT checked in Heartbeat/SubmitSection/SaveAnswer, which
    only ever act on an attempt already resumed under a live session_token;
    a suspension takes effect the moment a student's own client next calls
    Start (e.g. a page reload), never mid-heartbeat, so nothing already in
    flight is forcibly torn down by this check."""
    if EventRecord.attempts_suspended_at is not None:
        api_error(
            403,
            "COMPETITION_EVENT_SUSPENDED",
            "This competition has been temporarily paused by an administrator. Please wait for further instructions.",
            {"reason": EventRecord.suspension_reason},
        )


def _CheckSlotGate(db: Session, AssignmentRecord: CompetitionEventAssignment, NowUtc: datetime) -> None:
    """Only enforced when the assignment has a slot_id -- see
    StartCompetitionEventAttempt's docstring for why that's the common
    case today, not the exception."""
    if not AssignmentRecord.slot_id:
        return
    SlotRecord = db.get(CompetitionEventSlot, AssignmentRecord.slot_id)
    if not SlotRecord:
        return
    ScheduledStartAt = _Aware(SlotRecord.scheduled_start_at)
    if ScheduledStartAt and NowUtc < ScheduledStartAt:
        api_error(
            403,
            "COMPETITION_SLOT_NOT_OPEN_YET",
            "Your competition slot has not opened yet.",
            {"scheduledStartAt": ScheduledStartAt.isoformat()},
        )


def _ActiveRetryGrant(db: Session, AssignmentId: str) -> CompetitionEventAttemptRetryGrant | None:
    """Mirrors attempt_service.py's own `active_reattempt_permission_for_attempt`
    precedent exactly: an admin-granted, not-yet-used retry override for
    this assignment. Ordered by `granted_at` descending -- nothing prevents
    an admin from granting a second one at the DB level (see the model's
    own docstring), so if that ever happens the most recently granted one
    is the one that gets consumed."""
    return (
        db.query(CompetitionEventAttemptRetryGrant)
        .filter(
            CompetitionEventAttemptRetryGrant.assignment_id == AssignmentId,
            CompetitionEventAttemptRetryGrant.status == "APPROVED",
            CompetitionEventAttemptRetryGrant.used_at.is_(None),
        )
        .order_by(CompetitionEventAttemptRetryGrant.granted_at.desc())
        .first()
    )


def _ActiveSection(db: Session, AttemptRecord: CompetitionEventAttempt) -> CompetitionEventAttemptSectionState | None:
    return (
        db.query(CompetitionEventAttemptSectionState)
        .filter(
            CompetitionEventAttemptSectionState.attempt_id == AttemptRecord.id,
            CompetitionEventAttemptSectionState.status == "ACTIVE",
        )
        .first()
    )


def _AllSectionsOrdered(db: Session, AttemptRecord: CompetitionEventAttempt) -> list[CompetitionEventAttemptSectionState]:
    return (
        db.query(CompetitionEventAttemptSectionState)
        .filter(CompetitionEventAttemptSectionState.attempt_id == AttemptRecord.id)
        .order_by(CompetitionEventAttemptSectionState.section_number.asc())
        .all()
    )


def _ActivateSection(SectionState: CompetitionEventAttemptSectionState, NowUtc: datetime) -> None:
    SectionState.status = "ACTIVE"
    SectionState.started_at = NowUtc
    SectionState.remaining_seconds_at_last_heartbeat = SectionState.time_limit_seconds
    SectionState.last_heartbeat_at = NowUtc


def _AdvanceOrFinalize(
    db: Session,
    AttemptRecord: CompetitionEventAttempt,
    CompletedSection: CompetitionEventAttemptSectionState,
    NowUtc: datetime,
    *,
    Auto: bool,
) -> None:
    """Closes `CompletedSection` and either activates the next section in
    order or, if that was the last one, finalizes the whole attempt to
    SUBMITTED (never FINALIZED -- see module docstring). Looks up "next"
    by ordering rather than `section_number + 1` so this stays correct
    even if a level paper's section numbers were ever non-contiguous."""
    CompletedSection.status = "AUTO_SUBMITTED" if Auto else "COMPLETED"
    CompletedSection.submitted_at = NowUtc
    if CompletedSection.remaining_seconds_at_last_heartbeat is None or CompletedSection.remaining_seconds_at_last_heartbeat < 0:
        CompletedSection.remaining_seconds_at_last_heartbeat = 0

    AllSections = _AllSectionsOrdered(db, AttemptRecord)
    CompletedIndex = next((i for i, s in enumerate(AllSections) if s.section_number == CompletedSection.section_number), None)
    NextSection = AllSections[CompletedIndex + 1] if CompletedIndex is not None and CompletedIndex + 1 < len(AllSections) else None

    if NextSection:
        _ActivateSection(NextSection, NowUtc)
        AttemptRecord.current_section_number = NextSection.section_number
    else:
        AttemptRecord.status = "SUBMITTED"
        AttemptRecord.submitted_at = NowUtc
        # Package 6 (Scoring + Results): this IS the one place every path to
        # a last-section close funnels through (manual submit, heartbeat
        # auto-advance, and the reconciliation sweep all call this same
        # function), so it's also the one place CompetitionEventResult gets
        # computed -- see annual_competition_scoring_service.py's own
        # module docstring for the full rationale. Advances the attempt to
        # FINALIZED itself, per the lifecycle already documented on
        # CompetitionEventAttempt in models.py. Local import: keeps this
        # module's own top-level import list unchanged and avoids loading
        # the (unrelated) scoring service just to import this file for
        # every other attempt operation.
        from app.services.annual_competition_scoring_service import ComputeAndFinalizeCompetitionEventResult

        ComputeAndFinalizeCompetitionEventResult(db, AttemptRecord)

    # Test sessions in this repo run with autoflush=False (see e.g.
    # test_annual_competition_studio_service.py), and a query that filters
    # on a column just mutated in this same transaction (status=="ACTIVE"
    # in _ActiveSection, called by every caller of this function right
    # after) would otherwise see the DB's stale pre-mutation row instead of
    # what was just set above -- the exact same bug class caught in
    # Package 3 (see annual_competition_studio_service.py's
    # _SeedDefaultSectionTimers comment). Flushing here, once, covers every
    # caller transitively.
    db.flush()


def _EnsureActiveSectionOrAdvance(db: Session, AttemptRecord: CompetitionEventAttempt, NowUtc: datetime) -> None:
    """The lazy "never trust a stale flag" check every attempt-touching
    entry point below runs first. Only ever acts on a *stored* fact
    (remaining_seconds_at_last_heartbeat already at/under zero) -- it
    never derives elapsed time from wall-clock `NowUtc` itself, since
    remaining time only ever moves in response to an actual heartbeat
    (see module docstring)."""
    if AttemptRecord.status != IN_PROGRESS_STATUS:
        return
    ActiveSectionState = _ActiveSection(db, AttemptRecord)
    if not ActiveSectionState:
        return
    if ActiveSectionState.remaining_seconds_at_last_heartbeat is not None and ActiveSectionState.remaining_seconds_at_last_heartbeat <= 0:
        _AdvanceOrFinalize(db, AttemptRecord, ActiveSectionState, NowUtc, Auto=True)


# ---------------------------------------------------------------------------
# Payloads
# ---------------------------------------------------------------------------

def _SectionTimerLookup(db: Session, LevelPaperId: str | None) -> dict[int, CompetitionEventSectionTimer]:
    """section_number -> CompetitionEventSectionTimer for one level paper.
    Point 5 fix (Shailesh, 2026-09-08): the attempt screen previously had no
    way to show a section's name or mode (ABACUS/VISUAL/...) at all --
    _SectionStatePayload sent neither. CompetitionEventSectionTimer is the
    same source of truth the instructions screen and admin Slots/Papers
    tabs already read section names/modes from, so this reuses it rather
    than inventing a second copy of that data (e.g. off
    CompetitionMockQuestion.section_title, which also exists but is the
    practice-mock generator's own registry, not necessarily this real
    event's section shape)."""
    if not LevelPaperId:
        return {}
    Timers = (
        db.query(CompetitionEventSectionTimer)
        .filter(CompetitionEventSectionTimer.level_paper_id == LevelPaperId)
        .all()
    )
    return {Timer.section_number: Timer for Timer in Timers}


def _SectionStatePayload(SectionState: CompetitionEventAttemptSectionState, TimerRecord: CompetitionEventSectionTimer | None = None) -> dict[str, Any]:
    return {
        "sectionNumber": SectionState.section_number,
        "sectionTitle": TimerRecord.section_title if TimerRecord else None,
        "mode": TimerRecord.mode if TimerRecord else None,
        "status": SectionState.status,
        "timeLimitSeconds": SectionState.time_limit_seconds,
        "remainingSeconds": SectionState.remaining_seconds_at_last_heartbeat,
        "startedAt": SectionState.started_at.isoformat() if SectionState.started_at else None,
        "submittedAt": SectionState.submitted_at.isoformat() if SectionState.submitted_at else None,
    }


def _ActiveSectionQuestionsPayload(db: Session, AttemptRecord: CompetitionEventAttempt, ActiveSectionState: CompetitionEventAttemptSectionState) -> list[dict[str, Any]]:
    """Only ever the CURRENT active section's questions -- sections are
    locked sequentially (REQUIREMENTS.md "one sitting"), so there is no
    cross-section review/navigation the way Competition Mock allows across
    its one flat question list.

    Point 5 fix (Shailesh, 2026-09-08): questionNumber is now the
    question's 1-based position WITHIN this section (enumerate() below),
    not CompetitionMockQuestion.question_number -- that column is a GLOBAL
    number across the whole underlying mock exam (e.g. section 2 can start
    at global number 7), which is exactly why the frontend used to show
    "Question 7 of 6" from section 2 onward: the header text and the
    question-navigator bar both compared this number against
    questions.length (a per-section count), and they only ever agreed for
    section 1. The query still ORDERs BY the global question_number (a
    stable, already-correct ordering within one section), only the number
    *shown* changes.

    Point 8 (Shailesh, 2026-09-08): options/savedOptionId are gone -- the
    attempt screen is now DPS-style typed-answer, not MCQ. savedAnswerText
    mirrors DPS's own AttemptPayload field name exactly so the frontend can
    reuse the same AnswerInputBox/QuestionCard components unmodified."""
    LevelPaperRecord = db.get(CompetitionEventLevelPaper, AttemptRecord.level_paper_id)
    MockExamId = LevelPaperRecord.mock_exam_id if LevelPaperRecord else None
    QuestionRecords = (
        db.query(CompetitionMockQuestion)
        .filter(
            CompetitionMockQuestion.mock_exam_id == MockExamId,
            CompetitionMockQuestion.section_number == ActiveSectionState.section_number,
        )
        .order_by(CompetitionMockQuestion.question_number.asc())
        .all()
        if MockExamId
        else []
    )
    AnswersByQuestionId = {
        Answer.mock_question_id: Answer
        for Answer in db.query(CompetitionEventAttemptAnswer).filter(CompetitionEventAttemptAnswer.attempt_id == AttemptRecord.id).all()
    }
    Payload: list[dict[str, Any]] = []
    for LocalQuestionNumber, QuestionRecord in enumerate(QuestionRecords, start=1):
        ExistingAnswer = AnswersByQuestionId.get(QuestionRecord.id)
        Payload.append(
            {
                "questionId": QuestionRecord.id,
                "questionNumber": LocalQuestionNumber,
                "displayType": QuestionRecord.display_type,
                "questionText": QuestionRecord.question_text,
                "operands": _json_loads_list(QuestionRecord.operands_json),
                "operators": _json_loads_list(QuestionRecord.operators_json),
                # correct_answer is deliberately never included here -- this
                # payload reaches the student's own browser mid-attempt,
                # same guarantee _QuestionOptionPayload's is_correct
                # omission already made for the old MCQ shape.
                "savedAnswerText": ExistingAnswer.selected_value if ExistingAnswer else None,
            }
        )
    return Payload


def _json_loads_list(Value: str | None) -> list[Any]:
    if not Value:
        return []
    try:
        Parsed = json.loads(Value)
        return Parsed if isinstance(Parsed, list) else []
    except Exception:
        return []


def _AttemptPayload(
    db: Session, AttemptRecord: CompetitionEventAttempt, *, IncludeSessionToken: bool = False, IncludeQuestions: bool = False
) -> dict[str, Any]:
    Sections = _AllSectionsOrdered(db, AttemptRecord)
    TimersBySectionNumber = _SectionTimerLookup(db, AttemptRecord.level_paper_id)
    Payload: dict[str, Any] = {
        "attemptId": AttemptRecord.id,
        "eventId": AttemptRecord.event_id,
        "assignmentId": AttemptRecord.assignment_id,
        "levelPaperId": AttemptRecord.level_paper_id,
        "status": AttemptRecord.status,
        "currentSectionNumber": AttemptRecord.current_section_number,
        "startedAt": AttemptRecord.started_at.isoformat() if AttemptRecord.started_at else None,
        "submittedAt": AttemptRecord.submitted_at.isoformat() if AttemptRecord.submitted_at else None,
        "sections": [
            _SectionStatePayload(SectionState, TimersBySectionNumber.get(SectionState.section_number))
            for SectionState in Sections
        ],
    }
    if IncludeSessionToken:
        Payload["sessionToken"] = AttemptRecord.session_token
    if IncludeQuestions and AttemptRecord.status == IN_PROGRESS_STATUS:
        ActiveSectionState = _ActiveSection(db, AttemptRecord)
        Payload["activeSectionQuestions"] = (
            _ActiveSectionQuestionsPayload(db, AttemptRecord, ActiveSectionState) if ActiveSectionState else []
        )
    return Payload


def _RetryGrantPayload(GrantRecord: CompetitionEventAttemptRetryGrant) -> dict[str, Any]:
    return {
        "grantId": GrantRecord.id,
        "eventId": GrantRecord.event_id,
        "assignmentId": GrantRecord.assignment_id,
        "studentId": GrantRecord.student_id,
        "grantedByUserId": GrantRecord.granted_by_user_id,
        "reason": GrantRecord.reason,
        "status": GrantRecord.status,
        "usedAttemptId": GrantRecord.used_attempt_id,
        "grantedAt": GrantRecord.granted_at.isoformat() if GrantRecord.granted_at else None,
        "usedAt": GrantRecord.used_at.isoformat() if GrantRecord.used_at else None,
    }


def _BuildFreshAttempt(
    db: Session,
    EventId: str,
    AssignmentRecord: CompetitionEventAssignment,
    StudentRecord: Student,
    NowUtc: datetime,
    *,
    AttemptNumber: int,
) -> CompetitionEventAttempt:
    """Shared by both a brand-new first attempt and a retry-granted
    subsequent one -- same slot gate, same level-paper/section-timer
    lookup, same section-state seeding either way. `_CheckSlotGate` has no
    upper bound (it only blocks starting BEFORE a slot's
    scheduled_start_at -- see its own docstring), so it is safe to apply
    here unconditionally even though a retry-granted attempt, by
    definition, always starts well after the event's original scheduled
    time."""
    _CheckSlotGate(db, AssignmentRecord, NowUtc)

    LevelPaperRecord = (
        db.query(CompetitionEventLevelPaper)
        .filter(
            CompetitionEventLevelPaper.event_id == EventId,
            CompetitionEventLevelPaper.competition_level_code == AssignmentRecord.assigned_level_code,
        )
        .first()
    )
    if not LevelPaperRecord or not LevelPaperRecord.mock_exam_id:
        api_error(400, "COMPETITION_LEVEL_PAPER_NOT_READY", "This level's competition paper has not been set up yet.")

    SectionTimers = (
        db.query(CompetitionEventSectionTimer)
        .filter(CompetitionEventSectionTimer.level_paper_id == LevelPaperRecord.id)
        .order_by(CompetitionEventSectionTimer.display_order.asc(), CompetitionEventSectionTimer.section_number.asc())
        .all()
    )
    if not SectionTimers:
        api_error(400, "COMPETITION_LEVEL_PAPER_NOT_READY", "This level's section timers have not been set up yet.")

    AttemptRecord = CompetitionEventAttempt(
        event_id=EventId,
        assignment_id=AssignmentRecord.id,
        level_paper_id=LevelPaperRecord.id,
        student_id=StudentRecord.id,
        attempt_number=AttemptNumber,
        status=IN_PROGRESS_STATUS,
        session_token=secrets.token_urlsafe(32),
        current_section_number=SectionTimers[0].section_number,
        started_at=NowUtc,
    )
    db.add(AttemptRecord)
    db.flush()  # AttemptRecord.id must exist before the section-state rows below reference it

    for Index, Timer in enumerate(SectionTimers):
        SectionState = CompetitionEventAttemptSectionState(
            attempt_id=AttemptRecord.id,
            section_number=Timer.section_number,
            status="PENDING",
            time_limit_seconds=Timer.time_limit_seconds,
        )
        if Index == 0:
            _ActivateSection(SectionState, NowUtc)
        db.add(SectionState)

    return AttemptRecord


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def StartCompetitionEventAttempt(db: Session, StudentRecord: Student, EventId: str) -> dict[str, Any]:
    """Starts a student's first attempt for this event, or resumes an
    existing IN_PROGRESS one. Either way, a fresh session_token is issued
    -- this IS the "resume here" remediation the plan describes: whichever
    device most recently called Start/Resume owns write access, and any
    other device's now-stale heartbeats are rejected until it, too, calls
    this again.

    Slot-gated start (Package 5): only enforced when the assignment has a
    `slot_id` set. Nothing today populates `slot_id` in bulk -- it is only
    ever set one student at a time via the admin studio's manual override
    (annual_competition_studio_service.OverrideCompetitionEventAssignment)
    -- so for the common case (an AUTO-assigned student with no slot yet)
    this is a real, tracked gap, not a bug: there is nothing to gate
    against, so starting is allowed. A resume (an attempt already exists)
    is never re-gated by slot time, only a brand new first attempt.
    """
    EventRecord = db.get(CompetitionEvent, EventId)
    if not EventRecord:
        api_error(404, "COMPETITION_EVENT_NOT_FOUND", "Annual Competition event not found.")
    _CheckEventNotSuspended(EventRecord)

    AssignmentRecord = (
        db.query(CompetitionEventAssignment)
        .filter(
            CompetitionEventAssignment.event_id == EventId,
            CompetitionEventAssignment.student_id == StudentRecord.id,
            CompetitionEventAssignment.is_active == True,  # noqa: E712
        )
        .first()
    )
    if not AssignmentRecord:
        api_error(404, "COMPETITION_ASSIGNMENT_NOT_FOUND", "You are not assigned to this competition event.")

    NowUtc = _NowUtc()

    ExistingAttempt = (
        db.query(CompetitionEventAttempt)
        .filter(CompetitionEventAttempt.assignment_id == AssignmentRecord.id)
        .order_by(CompetitionEventAttempt.attempt_number.desc())
        .first()
    )
    if ExistingAttempt:
        if ExistingAttempt.status in TERMINAL_ATTEMPT_STATUSES:
            # REQUIREMENTS.md item 6: the single-attempt rule above is
            # absolute UNLESS an admin has granted a genuine "technical
            # issue" retry for this exact assignment -- see this module's
            # own docstring section on GrantAnnualCompetitionAttemptRetry.
            RetryGrant = _ActiveRetryGrant(db, AssignmentRecord.id)
            if not RetryGrant:
                api_error(403, "COMPETITION_ATTEMPT_ALREADY_SUBMITTED", "This competition attempt has already been submitted.")
            NewAttempt = _BuildFreshAttempt(
                db, EventId, AssignmentRecord, StudentRecord, NowUtc, AttemptNumber=ExistingAttempt.attempt_number + 1
            )
            RetryGrant.status = "USED"
            RetryGrant.used_at = NowUtc
            RetryGrant.used_attempt_id = NewAttempt.id
            db.commit()
            db.refresh(NewAttempt)
            return _AttemptPayload(db, NewAttempt, IncludeSessionToken=True)
        # Resume: reissue the session token, then self-correct any state
        # that should already have advanced/finalized while nobody was
        # looking (same lazy check every other entry point runs).
        ExistingAttempt.session_token = secrets.token_urlsafe(32)
        _EnsureActiveSectionOrAdvance(db, ExistingAttempt, NowUtc)
        db.commit()
        db.refresh(ExistingAttempt)
        return _AttemptPayload(db, ExistingAttempt, IncludeSessionToken=True)

    AttemptRecord = _BuildFreshAttempt(db, EventId, AssignmentRecord, StudentRecord, NowUtc, AttemptNumber=1)
    db.commit()
    db.refresh(AttemptRecord)
    return _AttemptPayload(db, AttemptRecord, IncludeSessionToken=True)


def GetCompetitionEventAttemptForStudent(db: Session, StudentRecord: Student, AttemptId: str) -> dict[str, Any]:
    AttemptRecord = _GetOwnedAttemptOr404(db, StudentRecord, AttemptId)
    # A plain read otherwise, but _EnsureActiveSectionOrAdvance below can
    # still lazily finalize+score this attempt (e.g. the bootstrap GET on
    # page load/refresh lands after the last section's time already ran
    # out) -- same race this file's other finalize-capable entry points
    # guard against; see _LockAttemptForUpdate's own docstring.
    AttemptRecord = _LockAttemptForUpdate(db, AttemptId) or AttemptRecord
    NowUtc = _NowUtc()
    _EnsureActiveSectionOrAdvance(db, AttemptRecord, NowUtc)
    db.commit()
    db.refresh(AttemptRecord)
    return _AttemptPayload(db, AttemptRecord, IncludeQuestions=True)


def RecordCompetitionEventHeartbeat(
    db: Session, StudentRecord: Student, AttemptId: str, SessionToken: str | None, SectionNumber: int
) -> dict[str, Any]:
    AttemptRecord = _GetOwnedAttemptOr404(db, StudentRecord, AttemptId)
    # See _LockAttemptForUpdate's own docstring: this can be the request
    # that lazily finalizes+scores the attempt (via _EnsureActiveSectionOrAdvance
    # below), so it takes the same row lock SaveCompetitionEventAnswer and
    # SubmitCompetitionEventSection do before touching anything.
    AttemptRecord = _LockAttemptForUpdate(db, AttemptId) or AttemptRecord
    NowUtc = _NowUtc()
    _EnsureActiveSectionOrAdvance(db, AttemptRecord, NowUtc)
    if AttemptRecord.status != IN_PROGRESS_STATUS:
        db.commit()
        db.refresh(AttemptRecord)
        return _AttemptPayload(db, AttemptRecord)

    _VerifySessionToken(AttemptRecord, SessionToken)

    ActiveSectionState = _ActiveSection(db, AttemptRecord)
    if not ActiveSectionState:
        api_error(409, "COMPETITION_ATTEMPT_NO_ACTIVE_SECTION", "This attempt has no active section.")
    if ActiveSectionState.section_number != SectionNumber:
        api_error(
            409,
            "COMPETITION_SECTION_NOT_ACTIVE",
            f"Section {SectionNumber} is no longer the active section for this attempt.",
        )

    LastHeartbeatAt = _Aware(ActiveSectionState.last_heartbeat_at) or _Aware(ActiveSectionState.started_at) or NowUtc
    RawGapSeconds = max(0.0, (NowUtc - LastHeartbeatAt).total_seconds())
    EffectiveElapsedSeconds = min(RawGapSeconds, float(HEARTBEAT_GRACE_SECONDS))
    PreviousRemaining = ActiveSectionState.remaining_seconds_at_last_heartbeat or 0
    NewRemaining = max(0, int(PreviousRemaining - round(EffectiveElapsedSeconds)))

    ActiveSectionState.remaining_seconds_at_last_heartbeat = NewRemaining
    ActiveSectionState.last_heartbeat_at = NowUtc

    if NewRemaining <= 0:
        _AdvanceOrFinalize(db, AttemptRecord, ActiveSectionState, NowUtc, Auto=True)

    db.commit()
    db.refresh(AttemptRecord)
    return _AttemptPayload(db, AttemptRecord)


def SubmitCompetitionEventSection(
    db: Session, StudentRecord: Student, AttemptId: str, SessionToken: str | None, SectionNumber: int
) -> dict[str, Any]:
    """A student who finishes a section's questions early can move on
    without waiting for the timer to run out. Shares the same session-
    token guard and section-identity check as the heartbeat path."""
    AttemptRecord = _GetOwnedAttemptOr404(db, StudentRecord, AttemptId)
    AttemptRecord = _LockAttemptForUpdate(db, AttemptId) or AttemptRecord  # see _LockAttemptForUpdate docstring
    NowUtc = _NowUtc()
    _EnsureActiveSectionOrAdvance(db, AttemptRecord, NowUtc)
    if AttemptRecord.status != IN_PROGRESS_STATUS:
        db.commit()
        db.refresh(AttemptRecord)
        return _AttemptPayload(db, AttemptRecord)

    _VerifySessionToken(AttemptRecord, SessionToken)

    ActiveSectionState = _ActiveSection(db, AttemptRecord)
    if not ActiveSectionState:
        api_error(409, "COMPETITION_ATTEMPT_NO_ACTIVE_SECTION", "This attempt has no active section.")
    if ActiveSectionState.section_number != SectionNumber:
        api_error(
            409,
            "COMPETITION_SECTION_NOT_ACTIVE",
            f"Section {SectionNumber} is no longer the active section for this attempt.",
        )

    _AdvanceOrFinalize(db, AttemptRecord, ActiveSectionState, NowUtc, Auto=False)

    db.commit()
    db.refresh(AttemptRecord)
    return _AttemptPayload(db, AttemptRecord)


def SaveCompetitionEventAnswer(
    db: Session,
    StudentRecord: Student,
    AttemptId: str,
    SessionToken: str | None,
    SectionNumber: int,
    QuestionId: str,
    AnswerText: str,
) -> dict[str, Any]:
    """Point 8 (Shailesh, 2026-09-08): typed free-text answer, matching
    DPS's save_answer(), not an MCQ pick -- mirrors DPS's ownership check ->
    lazy self-correct -> question validation -> grade-via-answers_match ->
    upsert pattern, layered on the same session-token + active-section
    guards every other mutating entry point in this file already enforces,
    since a section-locked exam (no cross-section navigation, unlike
    Competition Mock's flat question list) means an answer for a question
    outside the currently-active section is never valid, not just stale.

    Grading happens right here, synchronously, via the same answers_match()
    DPS already uses against CompetitionMockQuestion.correct_answer (which
    every competition question already carries regardless of the MCQ
    options also generated alongside it -- see the model's own comment).
    Shailesh, 2026-09-08: "make sure the correct answer is always flagged
    as correct" -- reusing this one already-hardened comparison function
    (rather than writing new comparison logic here) is how that holds for
    every formatting variant (whitespace, leading zeros, unicode minus,
    decimal padding) it already tolerates; _LockAttemptForUpdate below is
    the other half of that guarantee (never losing a race against a
    concurrent finalize)."""
    AttemptRecord = _GetOwnedAttemptOr404(db, StudentRecord, AttemptId)
    AttemptRecord = _LockAttemptForUpdate(db, AttemptId) or AttemptRecord  # see _LockAttemptForUpdate docstring
    NowUtc = _NowUtc()
    _EnsureActiveSectionOrAdvance(db, AttemptRecord, NowUtc)
    if AttemptRecord.status != IN_PROGRESS_STATUS:
        db.commit()
        db.refresh(AttemptRecord)
        return _AttemptPayload(db, AttemptRecord)

    _VerifySessionToken(AttemptRecord, SessionToken)

    ActiveSectionState = _ActiveSection(db, AttemptRecord)
    if not ActiveSectionState:
        api_error(409, "COMPETITION_ATTEMPT_NO_ACTIVE_SECTION", "This attempt has no active section.")
    if ActiveSectionState.section_number != SectionNumber:
        api_error(
            409,
            "COMPETITION_SECTION_NOT_ACTIVE",
            f"Section {SectionNumber} is no longer the active section for this attempt.",
        )

    LevelPaperRecord = db.get(CompetitionEventLevelPaper, AttemptRecord.level_paper_id)
    MockExamId = LevelPaperRecord.mock_exam_id if LevelPaperRecord else None
    QuestionRecord = db.get(CompetitionMockQuestion, QuestionId)
    if (
        not QuestionRecord
        or QuestionRecord.mock_exam_id != MockExamId
        or QuestionRecord.section_number != SectionNumber
    ):
        api_error(400, "INVALID_COMPETITION_QUESTION", "Question does not belong to the active section of this attempt.")

    CleanAnswerText = (AnswerText or "").strip()

    AnswerRecord = (
        db.query(CompetitionEventAttemptAnswer)
        .filter(
            CompetitionEventAttemptAnswer.attempt_id == AttemptRecord.id,
            CompetitionEventAttemptAnswer.mock_question_id == QuestionRecord.id,
        )
        .first()
    )
    if not AnswerRecord:
        AnswerRecord = CompetitionEventAttemptAnswer(attempt_id=AttemptRecord.id, mock_question_id=QuestionRecord.id)
        db.add(AnswerRecord)
    AnswerRecord.selected_option_id = None
    AnswerRecord.selected_value = CleanAnswerText
    # A cleared box (student erased their answer) must save as
    # unanswered, not as "typed the empty string and got it wrong" --
    # answers_match("", "") would actually return False (see its own
    # student_stripped_all_ws guard), so this is an explicit check, not
    # reliance on that function's behavior for blank input. Scoring
    # (annual_competition_scoring_service._RawMetricsForAttempt) already
    # treats a blank selected_value the same way it used to treat a null
    # selected_option_id: unanswered, not wrong.
    AnswerRecord.is_correct = answers_match(QuestionRecord.correct_answer, CleanAnswerText) if CleanAnswerText else None

    db.commit()
    db.refresh(AttemptRecord)
    # Returns the full attempt payload (including the refreshed
    # activeSectionQuestions, each carrying its own savedAnswerText) rather
    # than a lean ack -- unlike Competition Mock's flat single-timer
    # question list, this screen has nothing else driving a refetch after a
    # save, so the save response IS the frontend's source of truth for what
    # is currently marked answered.
    return _AttemptPayload(db, AttemptRecord, IncludeQuestions=True)


def _SlotPayload(SlotRecord: CompetitionEventSlot | None) -> dict[str, Any] | None:
    if not SlotRecord:
        return None
    return {
        "slotId": SlotRecord.id,
        "mode": SlotRecord.mode,
        "slotLabel": SlotRecord.slot_label,
        "scheduledStartAt": SlotRecord.scheduled_start_at.isoformat() if SlotRecord.scheduled_start_at else None,
        "scheduledEndAt": SlotRecord.scheduled_end_at.isoformat() if SlotRecord.scheduled_end_at else None,
    }


def _AssignmentWithAttemptPayload(db: Session, AssignmentRecord: CompetitionEventAssignment, EventRecord: CompetitionEvent) -> dict[str, Any]:
    SlotRecord = db.get(CompetitionEventSlot, AssignmentRecord.slot_id) if AssignmentRecord.slot_id else None
    LatestAttempt = (
        db.query(CompetitionEventAttempt)
        .filter(CompetitionEventAttempt.assignment_id == AssignmentRecord.id)
        .order_by(CompetitionEventAttempt.attempt_number.desc())
        .first()
    )
    return {
        "assignmentId": AssignmentRecord.id,
        "eventId": EventRecord.id,
        "eventName": EventRecord.name,
        "eventStatus": EventRecord.status,
        "competitionDate": EventRecord.competition_date.isoformat() if EventRecord.competition_date else None,
        "assignedLevelCode": AssignmentRecord.assigned_level_code,
        "slot": _SlotPayload(SlotRecord),
        "latestAttemptId": LatestAttempt.id if LatestAttempt else None,
        # NOT_STARTED is synthesized (no attempt row exists yet) rather than
        # read off any stored field -- matches ListStudentCompetitionMockAssignmentsForAttempt's
        # own "status" derivation, just against this table's own status set
        # (NOT_STARTED -> IN_PROGRESS -> SUBMITTED -> FINALIZED).
        "latestAttemptStatus": LatestAttempt.status if LatestAttempt else "NOT_STARTED",
        # Root-cause fix (Shailesh, 2026-09-09): a terminal latestAttemptStatus
        # above (SUBMITTED/FINALIZED) used to be a dead end for the student
        # even after an admin granted them a retry via
        # GrantAnnualCompetitionAttemptRetry -- that action only ever writes
        # a CompetitionEventAttemptRetryGrant row, it never touches the old
        # attempt's own status, and this payload (the one thing the
        # student-facing tab reads to decide what to show) had no way to
        # surface that a grant exists. StartCompetitionEventAttempt already
        # honours an active grant correctly once called (see its own
        # _ActiveRetryGrant check) -- the student just had no button left to
        # trigger it. Surfacing the same _ActiveRetryGrant check here closes
        # that gap without changing latestAttemptStatus's own meaning.
        "hasActiveRetryGrant": _ActiveRetryGrant(db, AssignmentRecord.id) is not None,
    }


def ListMyAnnualCompetitionAssignments(db: Session, StudentRecord: Student) -> dict[str, Any]:
    """Student-facing discovery endpoint -- Package 4 built the attempt/timer
    engine but nothing that lets a student find out which event(s) they're
    assigned to in the first place. Mirrors
    ListStudentCompetitionMockAssignmentsForAttempt's shape. A DRAFT event
    (admin still setting it up -- see CompetitionEvent.status's lifecycle
    comment in models.py) is deliberately excluded: nothing about it is
    final enough yet for a student to see."""
    Rows = (
        db.query(CompetitionEventAssignment, CompetitionEvent)
        .join(CompetitionEvent, CompetitionEventAssignment.event_id == CompetitionEvent.id)
        .filter(
            CompetitionEventAssignment.student_id == StudentRecord.id,
            CompetitionEventAssignment.is_active == True,  # noqa: E712
            CompetitionEvent.status != "DRAFT",
        )
        .order_by(CompetitionEvent.competition_date.asc())
        .all()
    )
    return {"assignments": [_AssignmentWithAttemptPayload(db, AssignmentRecord, EventRecord) for AssignmentRecord, EventRecord in Rows]}


def GetCompetitionEventInstructions(db: Session, StudentRecord: Student, EventId: str) -> dict[str, Any]:
    """Pre-section instructions screen (client's own requirement: name,
    mode, concepts, question count, and time per section, shown before the
    student starts). Mirrors student_competition_mock_instructions's shape
    in routes_student.py, but section metadata is sourced from
    CompetitionEventSectionTimer -- the curated, admin-set list -- rather
    than derived/renumbered from which concepts happen to have questions,
    since every section here is deliberately defined up front (no gaps to
    paper over)."""
    EventRecord = db.get(CompetitionEvent, EventId)
    if not EventRecord:
        api_error(404, "COMPETITION_EVENT_NOT_FOUND", "Annual Competition event not found.")
    _CheckEventNotSuspended(EventRecord)

    AssignmentRecord = (
        db.query(CompetitionEventAssignment)
        .filter(
            CompetitionEventAssignment.event_id == EventId,
            CompetitionEventAssignment.student_id == StudentRecord.id,
            CompetitionEventAssignment.is_active == True,  # noqa: E712
        )
        .first()
    )
    if not AssignmentRecord:
        api_error(404, "COMPETITION_ASSIGNMENT_NOT_FOUND", "You are not assigned to this competition event.")

    LevelPaperRecord = (
        db.query(CompetitionEventLevelPaper)
        .filter(
            CompetitionEventLevelPaper.event_id == EventId,
            CompetitionEventLevelPaper.competition_level_code == AssignmentRecord.assigned_level_code,
        )
        .first()
    )
    if not LevelPaperRecord or not LevelPaperRecord.mock_exam_id:
        api_error(400, "COMPETITION_LEVEL_PAPER_NOT_READY", "This level's competition paper has not been set up yet.")

    SectionTimers = (
        db.query(CompetitionEventSectionTimer)
        .filter(CompetitionEventSectionTimer.level_paper_id == LevelPaperRecord.id)
        .order_by(CompetitionEventSectionTimer.display_order.asc(), CompetitionEventSectionTimer.section_number.asc())
        .all()
    )
    if not SectionTimers:
        api_error(400, "COMPETITION_LEVEL_PAPER_NOT_READY", "This level's section timers have not been set up yet.")

    QuestionRecords = (
        db.query(CompetitionMockQuestion).filter(CompetitionMockQuestion.mock_exam_id == LevelPaperRecord.mock_exam_id).all()
    )
    QuestionCountBySection: dict[int, int] = {}
    ConceptFamilyBySection: dict[int, str] = {}
    for QuestionRecord in QuestionRecords:
        SectionNum = QuestionRecord.section_number or 1
        QuestionCountBySection[SectionNum] = QuestionCountBySection.get(SectionNum, 0) + 1
        if SectionNum not in ConceptFamilyBySection:
            ConceptFamilyBySection[SectionNum] = QuestionRecord.concept_family or "Mixed Concepts"

    SlotRecord = db.get(CompetitionEventSlot, AssignmentRecord.slot_id) if AssignmentRecord.slot_id else None

    SectionsPayload = [
        {
            "sectionNumber": Timer.section_number,
            "sectionTitle": Timer.section_title or f"Section {Timer.section_number}",
            "mode": Timer.mode,
            "timeLimitSeconds": Timer.time_limit_seconds,
            "questionCount": QuestionCountBySection.get(Timer.section_number, 0),
            "conceptFamily": ConceptFamilyBySection.get(Timer.section_number, "Mixed Concepts"),
        }
        for Timer in SectionTimers
    ]

    # Root-cause fix (Shailesh, 2026-09-09): this screen is now reachable
    # for a retry-granted student too (see _AssignmentWithAttemptPayload's
    # hasActiveRetryGrant + the frontend's "Start Retry" action), so the
    # static "You get one attempt at this competition" line below would be
    # actively wrong for them -- they're here precisely because they were
    # granted a second one. IsRetry mirrors the exact same
    # _ActiveRetryGrant check StartCompetitionEventAttempt itself uses, so
    # this screen's copy always agrees with what clicking Start is about to
    # do.
    IsRetry = _ActiveRetryGrant(db, AssignmentRecord.id) is not None
    AttemptCountLine = (
        "You have been granted a retry for this competition -- this attempt replaces your previous one."
        if IsRetry
        else "You get one attempt at this competition."
    )

    return {
        "eventId": EventRecord.id,
        "eventName": EventRecord.name,
        "competitionDate": EventRecord.competition_date.isoformat() if EventRecord.competition_date else None,
        "assignedLevelCode": AssignmentRecord.assigned_level_code,
        "slot": _SlotPayload(SlotRecord),
        "totalDurationSeconds": sum(Timer.time_limit_seconds for Timer in SectionTimers),
        "sections": SectionsPayload,
        "isRetry": IsRetry,
        "instructions": [
            "This competition is split into timed sections, shown one at a time.",
            "Each section has its own time limit -- once it ends (or you submit it), you move to the next section and cannot go back.",
            "Stay connected while a section is active -- your timer only pauses briefly on a genuine disconnect, it does not stop just because you look away.",
            AttemptCountLine,
            "Click Start below when you are ready to begin.",
        ],
    }


def ReconcileExpiredCompetitionEventAttempts(db: Session) -> dict[str, Any]:
    """Admin-triggered safety net -- see module docstring. Only ever acts
    on an attempt that is IN_PROGRESS *and* currently paused (no heartbeat
    within the grace window right now); an attempt receiving live
    heartbeats this instant is left alone. Naturally idempotent: a second
    run finds nothing left to do, since reconciled attempts are no longer
    IN_PROGRESS."""
    NowUtc = _NowUtc()
    Attempts = db.query(CompetitionEventAttempt).filter(CompetitionEventAttempt.status == IN_PROGRESS_STATUS).all()

    ReconciledAttemptIds: list[str] = []

    for AttemptRecord in Attempts:
        ActiveSectionState = _ActiveSection(db, AttemptRecord)
        if not ActiveSectionState:
            # Defensive: an IN_PROGRESS attempt with no ACTIVE section is a
            # data oddity (e.g. a prior partial write). The standard lazy
            # check self-heals it from whatever is stored, same as every
            # other entry point.
            _EnsureActiveSectionOrAdvance(db, AttemptRecord, NowUtc)
            continue

        LastHeartbeatAt = _Aware(ActiveSectionState.last_heartbeat_at) or _Aware(ActiveSectionState.started_at)
        GapSeconds = (NowUtc - LastHeartbeatAt).total_seconds() if LastHeartbeatAt else None
        IsCurrentlyPaused = GapSeconds is None or GapSeconds > HEARTBEAT_GRACE_SECONDS
        if not IsCurrentlyPaused:
            continue  # actively heartbeating right now -- not this sweep's job

        # Force-close this section and cascade through any remaining ones
        # -- an attempt abandoned mid-way should end up fully SUBMITTED,
        # not left half-advanced with yet another immediately-paused
        # active section.
        _AdvanceOrFinalize(db, AttemptRecord, ActiveSectionState, NowUtc, Auto=True)
        while AttemptRecord.status == IN_PROGRESS_STATUS:
            NextActiveSectionState = _ActiveSection(db, AttemptRecord)
            if not NextActiveSectionState:
                break
            _AdvanceOrFinalize(db, AttemptRecord, NextActiveSectionState, NowUtc, Auto=True)

        ReconciledAttemptIds.append(AttemptRecord.id)

    db.commit()
    return {"reconciledCount": len(ReconciledAttemptIds), "attemptIds": ReconciledAttemptIds}


def GrantAnnualCompetitionAttemptRetry(db: Session, *, AttemptId: str, GrantedBy: User, Reason: str) -> dict[str, Any]:
    """Admin-only action behind REQUIREMENTS.md item 6 -- see this module's
    docstring section on the retry override for the full design rationale.

    Takes the specific terminal attempt that needs a genuine retake, not a
    bare assignment/student id: an admin reviewing a result is always
    looking at one specific attempt, and requiring that id here makes it
    structurally impossible to accidentally grant a retry against the
    wrong one of a student's own past attempts if this is ever granted
    more than once for the same assignment. `_ActiveRetryGrant` (used both
    here and in `StartCompetitionEventAttempt`) is keyed off
    `assignment_id`, not `attempt_id`, since the grant's whole purpose is
    to authorize a NEW attempt on that assignment -- it necessarily
    outlives the specific attempt it was granted against.
    """
    AttemptRecord = db.get(CompetitionEventAttempt, AttemptId)
    if not AttemptRecord:
        api_error(404, "COMPETITION_ATTEMPT_NOT_FOUND", "Competition attempt not found.")

    if AttemptRecord.status not in TERMINAL_ATTEMPT_STATUSES:
        api_error(
            409,
            "COMPETITION_ATTEMPT_NOT_TERMINAL",
            "A retry can only be granted against a submitted or finalized attempt.",
        )

    CleanReason = (Reason or "").strip()
    if not CleanReason:
        api_error(400, "COMPETITION_RETRY_REASON_REQUIRED", "A reason is required to grant a competition retry.")

    if _ActiveRetryGrant(db, AttemptRecord.assignment_id):
        api_error(
            409,
            "COMPETITION_RETRY_ALREADY_GRANTED",
            "An unused retry grant already exists for this assignment.",
        )

    GrantRecord = CompetitionEventAttemptRetryGrant(
        event_id=AttemptRecord.event_id,
        assignment_id=AttemptRecord.assignment_id,
        student_id=AttemptRecord.student_id,
        granted_by_user_id=GrantedBy.id if GrantedBy else None,
        reason=CleanReason,
        status="APPROVED",
    )
    db.add(GrantRecord)
    db.commit()
    db.refresh(GrantRecord)
    return _RetryGrantPayload(GrantRecord)


def ListAnnualCompetitionAttemptRetryGrants(db: Session, *, EventId: str) -> dict[str, Any]:
    """Minimal admin visibility list -- every retry grant ever issued for
    this event, newest first. API-only for now, same deliberate deferral
    Package 2's preview/run endpoints and Package 6's rank/release
    endpoints originally used before Package 7 finally gave them a UI --
    a dedicated "Grant Retry" admin surface is a later, separate decision,
    not part of this addition."""
    Grants = (
        db.query(CompetitionEventAttemptRetryGrant)
        .filter(CompetitionEventAttemptRetryGrant.event_id == EventId)
        .order_by(CompetitionEventAttemptRetryGrant.granted_at.desc())
        .all()
    )
    return {"grants": [_RetryGrantPayload(GrantRecord) for GrantRecord in Grants]}


# --- Annual Competition (Point 7, Shailesh, 2026-09-08): admin per-question
# attempt review --------------------------------------------------------
# Every section, every question, the student's typed answer next to the
# correct answer, for one specific attempt -- the audit view an admin needs
# once results start coming in. Modeled on attempt_service.py's own
# result_payload() (DPS) rather than competition_mock_attempt_service.py's
# _question_review_payload(): both this feature (since Point 8) and DPS are
# now the same typed-answer shape (studentAnswer/correctAnswer/isCorrect per
# question), while Competition Mock's template is still MCQ-options-shaped
# and would be the wrong thing to copy from here. Deliberately reads
# CompetitionMockQuestion.correct_answer directly -- this is an admin-only
# surface, so the "never expose correct_answer to the student's own browser"
# rule _ActiveSectionQuestionsPayload documents does not apply here.
def _AttemptReviewSectionPayload(
    db: Session, AttemptRecord: CompetitionEventAttempt, SectionState: CompetitionEventAttemptSectionState,
    TimerRecord: CompetitionEventSectionTimer | None, MockExamId: str | None,
    AnswersByQuestionId: dict[str, CompetitionEventAttemptAnswer],
) -> dict[str, Any]:
    QuestionRecords = (
        db.query(CompetitionMockQuestion)
        .filter(
            CompetitionMockQuestion.mock_exam_id == MockExamId,
            CompetitionMockQuestion.section_number == SectionState.section_number,
        )
        .order_by(CompetitionMockQuestion.question_number.asc())
        .all()
        if MockExamId
        else []
    )
    Questions: list[dict[str, Any]] = []
    for LocalQuestionNumber, QuestionRecord in enumerate(QuestionRecords, start=1):
        AnswerRecord = AnswersByQuestionId.get(QuestionRecord.id)
        StudentAnswerText = (AnswerRecord.selected_value or "").strip() if AnswerRecord else ""

        # Point 9 fix (Shailesh, 2026-09-08): an attempt answered before
        # today's Point 8 switch to typed answers saved into the OLD
        # selected_option_id column -- selected_value was never backfilled
        # for it (ensure_annual_competition_answer_text_column only ever
        # ADDs the column, never migrates old rows -- see that function's
        # own docstring). Without this fallback every pre-migration
        # attempt reviews as "Not Answered" on every single question even
        # though it was genuinely answered and correctly scored at the
        # time (the stored CompetitionEventResult is untouched by any of
        # this -- it was computed once, at that attempt's own finalize
        # time, under the code that existed then). This is a legacy-data
        # display fix only; a brand new typed-answer attempt always has
        # selected_value populated and never touches this branch.
        LegacyOptionIsCorrect: bool | None = None
        if not StudentAnswerText and AnswerRecord and AnswerRecord.selected_option_id:
            OptionRecord = db.get(CompetitionMockQuestionOption, AnswerRecord.selected_option_id)
            if OptionRecord:
                StudentAnswerText = (OptionRecord.option_value or "").strip()
                # The option's own is_correct flag -- set once, when the
                # paper was built -- is the ground truth for an MCQ pick,
                # not a fresh text comparison against correct_answer: an
                # option's display value need not be byte-identical to
                # correct_answer to have been the legitimately-correct
                # pick, so re-running answers_match here could manufacture
                # a false "wrong" on data that was graded correctly at the
                # time. This mirrors exactly what determined the score
                # already sitting in CompetitionEventResult for this
                # attempt -- the review must never disagree with it.
                LegacyOptionIsCorrect = bool(OptionRecord.is_correct)

        IsCorrect = (
            LegacyOptionIsCorrect
            if LegacyOptionIsCorrect is not None
            else (answers_match(QuestionRecord.correct_answer, StudentAnswerText) if StudentAnswerText else False)
        )
        Questions.append(
            {
                "questionId": QuestionRecord.id,
                "questionNumber": LocalQuestionNumber,
                "displayType": QuestionRecord.display_type,
                "questionText": QuestionRecord.question_text,
                "operands": _json_loads_list(QuestionRecord.operands_json),
                "operators": _json_loads_list(QuestionRecord.operators_json),
                "studentAnswer": StudentAnswerText or None,
                "correctAnswer": QuestionRecord.correct_answer,
                "isUnanswered": not bool(StudentAnswerText),
                # Re-derived via the same authoritative comparison used at
                # save time (answers_match) for typed answers, with a
                # legacy-option fallback above for pre-migration rows --
                # belt-and-braces for exactly the correctness guarantee
                # Shailesh called out as non-negotiable: this review screen
                # must never itself disagree with what the student was
                # actually scored on.
                "isCorrect": IsCorrect,
            }
        )
    return {
        "sectionNumber": SectionState.section_number,
        "sectionTitle": TimerRecord.section_title if TimerRecord else None,
        "mode": TimerRecord.mode if TimerRecord else None,
        "status": SectionState.status,
        "timeLimitSeconds": SectionState.time_limit_seconds,
        "startedAt": SectionState.started_at.isoformat() if SectionState.started_at else None,
        "submittedAt": SectionState.submitted_at.isoformat() if SectionState.submitted_at else None,
        "questions": Questions,
    }


def GetCompetitionEventAttemptReviewForAdmin(db: Session, *, AttemptId: str) -> dict[str, Any]:
    AttemptRecord = db.get(CompetitionEventAttempt, AttemptId)
    if not AttemptRecord:
        api_error(404, "COMPETITION_ATTEMPT_NOT_FOUND", "Competition attempt not found.")

    EventRecord = db.get(CompetitionEvent, AttemptRecord.event_id)
    AssignmentRecord = db.get(CompetitionEventAssignment, AttemptRecord.assignment_id)
    StudentRecord = db.get(Student, AttemptRecord.student_id)
    LevelPaperRecord = db.get(CompetitionEventLevelPaper, AttemptRecord.level_paper_id)
    MockExamId = LevelPaperRecord.mock_exam_id if LevelPaperRecord else None
    ResultRecord = db.query(CompetitionEventResult).filter(CompetitionEventResult.attempt_id == AttemptRecord.id).first()

    TimersBySectionNumber = _SectionTimerLookup(db, AttemptRecord.level_paper_id)
    AnswersByQuestionId = {
        Answer.mock_question_id: Answer
        for Answer in db.query(CompetitionEventAttemptAnswer).filter(CompetitionEventAttemptAnswer.attempt_id == AttemptRecord.id).all()
    }
    Sections = [
        _AttemptReviewSectionPayload(
            db, AttemptRecord, SectionState, TimersBySectionNumber.get(SectionState.section_number), MockExamId, AnswersByQuestionId,
        )
        for SectionState in _AllSectionsOrdered(db, AttemptRecord)
    ]

    return {
        "attemptId": AttemptRecord.id,
        "eventId": AttemptRecord.event_id,
        "eventName": EventRecord.name if EventRecord else None,
        "studentId": AttemptRecord.student_id,
        "studentCode": StudentRecord.student_code if StudentRecord else None,
        "studentName": (StudentRecord.user.full_name if StudentRecord and StudentRecord.user else None),
        "assignedLevelCode": AssignmentRecord.assigned_level_code if AssignmentRecord else None,
        "status": AttemptRecord.status,
        "startedAt": AttemptRecord.started_at.isoformat() if AttemptRecord.started_at else None,
        "submittedAt": AttemptRecord.submitted_at.isoformat() if AttemptRecord.submitted_at else None,
        "result": (
            {
                "score": ResultRecord.score,
                "maxScore": ResultRecord.max_score,
                "percentage": ResultRecord.percentage,
                "accuracyPercentage": ResultRecord.accuracy_percentage,
                "correctCount": ResultRecord.correct_count,
                "wrongCount": ResultRecord.wrong_count,
                "unansweredCount": ResultRecord.unanswered_count,
                "timeTakenSeconds": ResultRecord.time_taken_seconds,
                "rank": ResultRecord.rank,
                "isReleased": ResultRecord.is_released,
                "isVoided": ResultRecord.is_voided,
            }
            if ResultRecord
            else None
        ),
        "sections": Sections,
    }
