"""Annual Competition -- Teacher/Admin Monitoring (Package 7).

Two, deliberately separate, read-only concerns, matching pkg-07's own
checklist:

1. **Live view** -- what is happening right now, during the event window:
   per-student/per-slot status across NOT_STARTED / IN_PROGRESS / STUCK /
   SUBMITTED / FINALIZED. Nothing here is stored -- every call recomputes
   from `CompetitionEventAttempt`/`CompetitionEventAttemptSectionState` as
   they stand at read time (the same "never trust a stale flag, recompute
   on every touch" philosophy Package 4 already used, just applied to a
   read instead of a write).
2. **Post-event review** -- Package 6's `CompetitionEventResult` rows,
   listed for a roster. Admin's own view of this already exists
   (`ListCompetitionEventResultsForAdmin` in annual_competition_scoring_
   service.py, which always bypasses the release gate) -- the only new
   surface this package adds is the roster-scoped, release-gated version
   for a teacher, who is a "student/parent-visible surface" for gating
   purposes even though the checklist calls this out for admin/teacher
   monitoring in general.

Both concerns take an optional `StudentIdsFilter`: `None` means "every
assignment on the event" (the admin view -- admin can always see every
student, matching this package's own checklist item 3 read together with
Package 6's "admin can always see a result"); a list means "only these
students" (the teacher view, scoped by the caller via
`own_students_query` in routes_teacher.py, exactly like the existing
Competition Mock tracker's own teacher scoping). An explicitly empty list
short-circuits to an empty result without ever touching the DB with an
`IN ()`, mirroring `_teacher_competition_tracker_payload`'s own early
return for a teacher with no students.

## Why "STUCK" reuses the reconciliation sweep's exact threshold

`ReconcileExpiredCompetitionEventAttempts` (Package 4) already has a
definition of "paused right now": an IN_PROGRESS attempt whose active
section's heartbeat gap exceeds `HEARTBEAT_GRACE_SECONDS`. Rather than
inventing a second, subtly different "stuck" threshold for the monitoring
screen, this module imports that same constant and applies the identical
comparison -- so what an admin sees as "STUCK" here is exactly the
population the reconciliation sweep will act on if run right now. Two
different definitions of "the timer isn't moving" would be a real, easy-
to-introduce bug class in a feature this timing-sensitive; reusing the one
already-tested threshold avoids it entirely. `HEARTBEAT_GRACE_SECONDS`
itself is imported (not duplicated as a bare literal) specifically so the
two modules can never drift apart if that constant is ever tuned.

A handful of other tiny helpers (`_NowUtc`, `_Aware`) ARE duplicated
rather than imported, matching the precedent already set between
annual_competition_attempt_service.py and annual_competition_scoring_
service.py (see the latter's own module docstring) -- each service module
stays self-contained for its own trivial one-liners, and only a genuine
shared threshold constant crosses the module boundary.

This module never mutates anything (no `db.add`/`db.commit` anywhere in
it) -- it is purely a read surface over state Packages 1/4/6 already
maintain.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import (
    CompetitionEvent,
    CompetitionEventAssignment,
    CompetitionEventAttempt,
    CompetitionEventAttemptSectionState,
    CompetitionEventLevelPaper,
    CompetitionEventResult,
    CompetitionEventSlot,
    Student,
    User,
)
from app.services.annual_competition_attempt_service import (
    HEARTBEAT_GRACE_SECONDS,
    ReconcileOnReadIfAbandoned,
    _ReconcileSingleAttemptIfAbandoned,
)
from app.services.annual_competition_paper_registry import ANNUAL_COMPETITION_LEVEL_REGISTRY
from app.services.annual_competition_studio_service import ComputePracticePaperOrdinals, RoundPercentageForDisplay

LIVE_STATUS_NOT_STARTED = "NOT_STARTED"
LIVE_STATUS_IN_PROGRESS = "IN_PROGRESS"
LIVE_STATUS_STUCK = "STUCK"
LIVE_STATUS_SUBMITTED = "SUBMITTED"
LIVE_STATUS_FINALIZED = "FINALIZED"


def _NowUtc() -> datetime:
    return datetime.now(timezone.utc)


def _Aware(Value: datetime | None) -> datetime | None:
    if Value is None:
        return None
    if Value.tzinfo is None:
        return Value.replace(tzinfo=timezone.utc)
    return Value


def _GetEventOr404(db: Session, EventId: str) -> CompetitionEvent:
    EventRecord = db.get(CompetitionEvent, EventId)
    if not EventRecord:
        api_error(404, "COMPETITION_EVENT_NOT_FOUND", "The selected Annual Competition event was not found.")
    return EventRecord


def _LatestAttemptForAssignment(db: Session, AssignmentRecord: CompetitionEventAssignment) -> CompetitionEventAttempt | None:
    return (
        db.query(CompetitionEventAttempt)
        .filter(CompetitionEventAttempt.assignment_id == AssignmentRecord.id)
        .order_by(CompetitionEventAttempt.attempt_number.desc())
        .first()
    )


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


def _ResolveAssignmentsForRoster(
    db: Session, *, EventId: str, StudentIdsFilter: list[str] | None, SlotId: str | None = None, CompetitionLevelCode: str | None = None
) -> list[CompetitionEventAssignment]:
    """`StudentIdsFilter=None` means "every active assignment on the event"
    (admin). A list scopes to those students (teacher); an explicitly EMPTY
    list means "this caller has no students at all" and short-circuits
    without ever issuing an `IN ()` query, mirroring
    `_teacher_competition_tracker_payload`'s own early return."""
    if StudentIdsFilter is not None and not StudentIdsFilter:
        return []

    Query = db.query(CompetitionEventAssignment).filter(
        CompetitionEventAssignment.event_id == EventId,
        CompetitionEventAssignment.is_active == True,  # noqa: E712
    )
    if StudentIdsFilter is not None:
        Query = Query.filter(CompetitionEventAssignment.student_id.in_(StudentIdsFilter))
    if SlotId:
        Query = Query.filter(CompetitionEventAssignment.slot_id == SlotId)
    if CompetitionLevelCode:
        Query = Query.filter(CompetitionEventAssignment.assigned_level_code == CompetitionLevelCode)
    return Query.all()


# Largest IN (...) list sent in one query. SQLite (tests, local) caps bound
# parameters at 999; a real event's roster can be larger than that.
_IN_CHUNK_SIZE = 500


def _InChunks(Values: list[str]) -> list[list[str]]:
    return [Values[Index : Index + _IN_CHUNK_SIZE] for Index in range(0, len(Values), _IN_CHUNK_SIZE)]


def _LiveStatusRows(
    db: Session, AssignmentRecords: list[CompetitionEventAssignment], NowUtc: datetime
) -> list[dict[str, Any]]:
    """Every row of the live status board, built from a FIXED number of
    queries however many students are on it.

    2026-10-07 (Shailesh, live countdown + section "as soon as the student
    moves"): the board is now re-read every 5 seconds instead of every 15,
    by every admin and teacher who has it open, during the event itself. The
    previous per-student version issued four to five queries per row (student,
    user, slot, latest attempt, active section) -- about 1,500 queries a read
    for a 300-student event. This reads the same five tables once each.

    Also new on every row, for the overall countdown the board now shows:

      * totalSectionCount -- how many sections this student's paper has
        ("2 of 4").
      * totalDurationSeconds -- the whole paper's time (10:00 / 20:00 / 35:00).
      * totalRemainingSecondsAtLastHeartbeat -- time left in the WHOLE paper
        as of the student's last heartbeat: what is left of the active section
        plus the full time of every section not started yet. A section the
        student finished early has forfeited its leftover (by design -- see
        SubmitCompetitionEventSection), so it is simply not counted.
      * heartbeatGapMilliseconds -- how long ago that heartbeat was, to the
        millisecond, so the screen can keep counting between reads without
        depending on the admin's own clock agreeing with the server's.

    The screen counts down from totalRemainingSecondsAtLastHeartbeat by the
    time since that heartbeat, capped at HEARTBEAT_GRACE_SECONDS -- exactly
    the deduction RecordCompetitionEventHeartbeat itself will apply when the
    student's next heartbeat arrives. So a disconnected student's timer stops
    on the admin's screen at the same value the student will resume from.
    """
    if not AssignmentRecords:
        return []

    AssignmentIds = [AssignmentRecord.id for AssignmentRecord in AssignmentRecords]
    StudentIds = list({AssignmentRecord.student_id for AssignmentRecord in AssignmentRecords})
    SlotIds = list({AssignmentRecord.slot_id for AssignmentRecord in AssignmentRecords if AssignmentRecord.slot_id})

    StudentById: dict[str, Student] = {}
    for Chunk in _InChunks(StudentIds):
        for StudentRecord in db.query(Student).filter(Student.id.in_(Chunk)).all():
            StudentById[StudentRecord.id] = StudentRecord

    UserIds = list({StudentRecord.user_id for StudentRecord in StudentById.values() if StudentRecord.user_id})
    UserById: dict[str, User] = {}
    for Chunk in _InChunks(UserIds):
        for UserRecord in db.query(User).filter(User.id.in_(Chunk)).all():
            UserById[UserRecord.id] = UserRecord

    SlotById: dict[str, CompetitionEventSlot] = {}
    for Chunk in _InChunks(SlotIds):
        for SlotRecord in db.query(CompetitionEventSlot).filter(CompetitionEventSlot.id.in_(Chunk)).all():
            SlotById[SlotRecord.id] = SlotRecord

    # Latest attempt per assignment: the highest attempt_number, the same
    # choice _LatestAttemptForAssignment makes one assignment at a time.
    LatestAttemptByAssignmentId: dict[str, CompetitionEventAttempt] = {}
    for Chunk in _InChunks(AssignmentIds):
        for AttemptRecord in (
            db.query(CompetitionEventAttempt).filter(CompetitionEventAttempt.assignment_id.in_(Chunk)).all()
        ):
            Current = LatestAttemptByAssignmentId.get(AttemptRecord.assignment_id)
            if not Current or (AttemptRecord.attempt_number or 0) > (Current.attempt_number or 0):
                LatestAttemptByAssignmentId[AttemptRecord.assignment_id] = AttemptRecord

    InProgressAttemptIds = [
        AttemptRecord.id for AttemptRecord in LatestAttemptByAssignmentId.values() if AttemptRecord.status == "IN_PROGRESS"
    ]
    SectionStatesByAttemptId: dict[str, list[CompetitionEventAttemptSectionState]] = {}
    for Chunk in _InChunks(InProgressAttemptIds):
        for SectionState in (
            db.query(CompetitionEventAttemptSectionState)
            .filter(CompetitionEventAttemptSectionState.attempt_id.in_(Chunk))
            .all()
        ):
            SectionStatesByAttemptId.setdefault(SectionState.attempt_id, []).append(SectionState)

    Rows: list[dict[str, Any]] = []
    for AssignmentRecord in AssignmentRecords:
        StudentRecord = StudentById.get(AssignmentRecord.student_id)
        if not StudentRecord:
            # Defensive only -- an assignment should never outlive its student
            # (the FK cascades on delete), but a monitoring read must never
            # 500 over a single bad row.
            continue
        UserRecord = UserById.get(StudentRecord.user_id) if StudentRecord.user_id else None
        SlotRecord = SlotById.get(AssignmentRecord.slot_id) if AssignmentRecord.slot_id else None
        AttemptRecord = LatestAttemptByAssignmentId.get(AssignmentRecord.id)

        LiveStatus = LIVE_STATUS_NOT_STARTED
        CurrentSectionNumber: int | None = None
        RemainingSecondsAtLastHeartbeat: int | None = None
        LastHeartbeatAtValue: datetime | None = None
        GapSeconds: float | None = None
        TotalSectionCount: int | None = None
        TotalDurationSeconds: int | None = None
        TotalRemainingSecondsAtLastHeartbeat: int | None = None
        # 2026-10-07 (section screens): True while the student is on the
        # screen shown before a section. Their clock is not running, so the
        # board must not tick it down between refreshes.
        ClockHeld = False

        if AttemptRecord and AttemptRecord.status == "IN_PROGRESS":
            CurrentSectionNumber = AttemptRecord.current_section_number
            SectionStates = sorted(
                SectionStatesByAttemptId.get(AttemptRecord.id, []), key=lambda State: State.section_number or 0
            )
            if SectionStates:
                TotalSectionCount = len(SectionStates)
                TotalDurationSeconds = sum(int(State.time_limit_seconds or 0) for State in SectionStates)
            ActiveSectionState = next((State for State in SectionStates if State.status == "ACTIVE"), None)
            if ActiveSectionState:
                ClockHeld = bool(ActiveSectionState.briefing_pending)
                RemainingSecondsAtLastHeartbeat = ActiveSectionState.remaining_seconds_at_last_heartbeat
                LastHeartbeatAtValue = _Aware(ActiveSectionState.last_heartbeat_at) or _Aware(ActiveSectionState.started_at)
                if LastHeartbeatAtValue:
                    GapSeconds = (NowUtc - LastHeartbeatAtValue).total_seconds()
                ActiveRemaining = (
                    RemainingSecondsAtLastHeartbeat
                    if RemainingSecondsAtLastHeartbeat is not None
                    else int(ActiveSectionState.time_limit_seconds or 0)
                )
                NotStartedSeconds = sum(
                    int(State.time_limit_seconds or 0) for State in SectionStates if State.status == "PENDING"
                )
                TotalRemainingSecondsAtLastHeartbeat = max(0, int(ActiveRemaining)) + NotStartedSeconds
            # Same "no heartbeat within the grace window right now" definition
            # as ReconcileExpiredCompetitionEventAttempts -- see module
            # docstring. No ACTIVE section at all (a data oddity) is treated as
            # stuck too, since nothing will self-correct it without a touch.
            IsStuck = GapSeconds is None or GapSeconds > HEARTBEAT_GRACE_SECONDS
            LiveStatus = LIVE_STATUS_STUCK if IsStuck else LIVE_STATUS_IN_PROGRESS
        elif AttemptRecord and AttemptRecord.status in ("SUBMITTED", "FINALIZED"):
            LiveStatus = AttemptRecord.status
        # else: no attempt row at all (or, defensively, one still literally at
        # the schema default) -- NOT_STARTED, same synthesis
        # _AssignmentWithAttemptPayload already uses for the student-facing
        # discovery endpoint.

        Rows.append(
            {
                "assignmentId": AssignmentRecord.id,
                "studentId": StudentRecord.id,
                "studentCode": StudentRecord.student_code,
                "studentName": UserRecord.full_name if UserRecord else StudentRecord.student_code,
                "className": StudentRecord.class_name,
                "section": StudentRecord.section,
                "assignedLevelCode": AssignmentRecord.assigned_level_code,
                "slot": _SlotPayload(SlotRecord),
                "attemptId": AttemptRecord.id if AttemptRecord else None,
                "attemptStatus": AttemptRecord.status if AttemptRecord else LIVE_STATUS_NOT_STARTED,
                "liveStatus": LiveStatus,
                "currentSectionNumber": CurrentSectionNumber,
                "totalSectionCount": TotalSectionCount,
                "totalDurationSeconds": TotalDurationSeconds,
                "totalRemainingSecondsAtLastHeartbeat": TotalRemainingSecondsAtLastHeartbeat,
                "remainingSecondsAtLastHeartbeat": RemainingSecondsAtLastHeartbeat,
                "lastHeartbeatAt": LastHeartbeatAtValue.isoformat() if LastHeartbeatAtValue else None,
                "heartbeatGapSeconds": int(GapSeconds) if GapSeconds is not None else None,
                "heartbeatGapMilliseconds": int(max(0.0, GapSeconds) * 1000) if GapSeconds is not None else None,
                "clockHeld": ClockHeld,
            }
        )
    return Rows


def GetAnnualCompetitionLiveMonitoring(
    db: Session,
    *,
    EventId: str,
    StudentIdsFilter: list[str] | None = None,
    SlotId: str | None = None,
    CompetitionLevelCode: str | None = None,
) -> dict[str, Any]:
    """Package 7 checklist item 1: started/in-progress/submitted/stuck
    status per student, per slot, during the event window. `StudentIdsFilter
    =None` is the admin view (every assignment); a list is a roster-scoped
    (teacher) view -- see module docstring."""
    EventRecord = _GetEventOr404(db, EventId)
    NowUtc = _NowUtc()

    AssignmentRecords = _ResolveAssignmentsForRoster(db, EventId=EventId, StudentIdsFilter=StudentIdsFilter, SlotId=SlotId)

    # 2026-10-07 (Shailesh, level filter): "the different levels would be
    # allotted different slots so when one slot gets underway for one level
    # the admin can filter that and see the live monitoring for that level."
    # The list of levels offered is always every level this viewer has
    # students in (never narrowed by the filter itself, or picking one level
    # would empty the dropdown), in the registry's own order. The filter is
    # applied here, before any row is built, so a filtered read only loads
    # and sends that level's students.
    LevelCodesPresent = {AssignmentRecord.assigned_level_code for AssignmentRecord in AssignmentRecords}
    RegistryOrder = list(ANNUAL_COMPETITION_LEVEL_REGISTRY.keys())
    LevelCodes = [Code for Code in RegistryOrder if Code in LevelCodesPresent] + sorted(LevelCodesPresent - set(RegistryOrder))
    if CompetitionLevelCode:
        AssignmentRecords = [
            AssignmentRecord for AssignmentRecord in AssignmentRecords if AssignmentRecord.assigned_level_code == CompetitionLevelCode
        ]

    Rows = _LiveStatusRows(db, AssignmentRecords, NowUtc)
    Rows.sort(key=lambda Row: ((Row["slot"] or {}).get("scheduledStartAt") or "", Row["studentName"] or ""))

    Summary = {
        "totalCount": len(Rows),
        "notStartedCount": sum(1 for Row in Rows if Row["liveStatus"] == LIVE_STATUS_NOT_STARTED),
        "inProgressCount": sum(1 for Row in Rows if Row["liveStatus"] == LIVE_STATUS_IN_PROGRESS),
        "stuckCount": sum(1 for Row in Rows if Row["liveStatus"] == LIVE_STATUS_STUCK),
        "submittedCount": sum(1 for Row in Rows if Row["liveStatus"] == LIVE_STATUS_SUBMITTED),
        "finalizedCount": sum(1 for Row in Rows if Row["liveStatus"] == LIVE_STATUS_FINALIZED),
    }

    return {
        "eventId": EventRecord.id,
        "eventName": EventRecord.name,
        "eventStatus": EventRecord.status,
        "generatedAt": NowUtc.isoformat(),
        # How long a student's clock keeps running without a heartbeat before
        # it pauses. The screen stops its own countdown at the same point.
        "heartbeatGraceSeconds": HEARTBEAT_GRACE_SECONDS,
        # Levels this viewer can filter by, and the filter this reply used.
        "levelCodes": LevelCodes,
        "competitionLevelCode": CompetitionLevelCode or None,
        "summary": Summary,
        "rows": Rows,
    }


def _TeacherResultRow(db: Session, AssignmentRecord: CompetitionEventAssignment) -> dict[str, Any] | None:
    """One row of the release-gated roster results review (checklist item
    2). Mirrors GetCompetitionEventResultForStudent's own lock-down exactly
    (an unreleased -- or not-yet-computed -- result never surfaces its
    metrics), applied across a roster instead of a single student/attempt.

    2026-09-29 (Shailesh, "should only show the students whose results the
    admin has released and not everyone which makes it look much more
    chaotic and weird"): this used to still return a row (with
    released=False, result=None) for a student with no attempt yet or with
    an unreleased result, and the teacher UI rendered those as "Not released
    yet" placeholder rows -- exactly the noise being complained about.
    Now returns None (dropped by ListAnnualCompetitionResultsForRoster's own
    `if Row` filter) for any assignment that isn't a genuinely released
    result, so the teacher's Results tab only ever lists students whose
    result the admin has actually released.
    """
    StudentRecord = db.get(Student, AssignmentRecord.student_id)
    if not StudentRecord:
        return None
    UserRecord = db.get(User, StudentRecord.user_id) if StudentRecord.user_id else None
    AttemptRecord = _LatestAttemptForAssignment(db, AssignmentRecord)

    # 2026-09-17 (Shailesh: "never ever anywhere"): this is a *results*
    # roster (unlike GetAnnualCompetitionLiveMonitoring's live status board,
    # which deliberately leaves a paused attempt visibly IN_PROGRESS/paused
    # rather than silently finalizing it out from under a live view) -- so a
    # genuinely abandoned attempt should self-heal here too, the same as the
    # single-attempt review endpoints, rather than sitting "released: False"
    # until someone happens to press the manual reconcile button.
    # 2026-10-07: but never while the event is still on -- a teacher opening
    # Results mid-slot must not submit the paper of a child who is only
    # disconnected. See ReconcileOnReadIfAbandoned.
    if AttemptRecord and ReconcileOnReadIfAbandoned(db, AttemptRecord, _NowUtc()):
        db.commit()

    if not AttemptRecord:
        return None

    ResultRecord = db.query(CompetitionEventResult).filter(CompetitionEventResult.attempt_id == AttemptRecord.id).first()
    if not ResultRecord or not ResultRecord.is_released:
        return None

    BaseRow = {
        "assignmentId": AssignmentRecord.id,
        "studentId": StudentRecord.id,
        "studentCode": StudentRecord.student_code,
        "studentName": UserRecord.full_name if UserRecord else StudentRecord.student_code,
        "assignedLevelCode": AssignmentRecord.assigned_level_code,
        "attemptId": AttemptRecord.id if AttemptRecord else None,
        "attemptStatus": AttemptRecord.status if AttemptRecord else LIVE_STATUS_NOT_STARTED,
    }

    return {
        **BaseRow,
        "released": True,
        "result": {
            "score": ResultRecord.score,
            "maxScore": ResultRecord.max_score,
            "percentage": RoundPercentageForDisplay(ResultRecord.percentage),
            "accuracyPercentage": RoundPercentageForDisplay(ResultRecord.accuracy_percentage),
            "correctCount": ResultRecord.correct_count,
            "wrongCount": ResultRecord.wrong_count,
            "unansweredCount": ResultRecord.unanswered_count,
            "timeTakenSeconds": ResultRecord.time_taken_seconds,
            "perSectionTime": json.loads(ResultRecord.per_section_time_json) if ResultRecord.per_section_time_json else [],
            "rank": ResultRecord.rank,
            "releasedAt": ResultRecord.released_at.isoformat() if ResultRecord.released_at else None,
        },
    }


def ListAnnualCompetitionResultsForRoster(
    db: Session, *, EventId: str, StudentIdsFilter: list[str] | None, CompetitionLevelCode: str | None = None
) -> dict[str, Any]:
    """Package 7 checklist item 2, teacher side -- admin's own equivalent
    (`ListCompetitionEventResultsForAdmin`, Package 6) already bypasses the
    release gate on purpose and is unchanged by this package.
    `StudentIdsFilter=None` would mean "every assignment," matching this
    module's live-view convention, but every current caller passes an
    explicit roster (a teacher's own students) -- admin keeps using its own
    ungated Package 6 endpoint instead of this one.
    """
    _GetEventOr404(db, EventId)
    AssignmentRecords = _ResolveAssignmentsForRoster(
        db, EventId=EventId, StudentIdsFilter=StudentIdsFilter, CompetitionLevelCode=CompetitionLevelCode
    )
    Rows = [Row for Row in (_TeacherResultRow(db, AssignmentRecord) for AssignmentRecord in AssignmentRecords) if Row]
    # 2026-09-29 (Shailesh): every row past _TeacherResultRow's gate above is
    # now guaranteed released (unreleased/no-attempt assignments are dropped
    # entirely, not just marked), so this only needs to sort by rank --
    # unranked rows (no rank yet even though released) sort after ranked
    # ones, by student name.
    Rows.sort(key=lambda Row: (0, Row["result"]["rank"]) if Row["result"].get("rank") is not None else (1, Row["studentName"] or ""))
    return {"eventId": EventId, "competitionLevelCode": CompetitionLevelCode, "totalResults": len(Rows), "rows": Rows}


def ListAnnualCompetitionPracticeResultsForRoster(
    db: Session, *, StudentIdsFilter: list[str], CompetitionLevelCode: str | None = None
) -> dict[str, Any]:
    """Practice's own teacher-facing results surface (Phase E) -- the
    sibling of ListAnnualCompetitionResultsForRoster above, but practice has
    no CompetitionEventAssignment to traverse from at all (see this
    module's own docstring on why the OFFICIAL-side functions above are
    assignment-keyed).

    2026-09-14 (Shailesh, "show all papers, not just submitted, on
    expanding a student block"): rewired from CompetitionEventResult-only
    (submitted attempts only) to CompetitionEventLevelPaper-driven (the
    bank itself), exactly mirroring ListAnnualCompetitionPracticeResultsForAdmin's
    own rewrite in annual_competition_scoring_service.py -- see that
    function's docstring for the full reasoning. One bucket per student,
    papers listed ascending by assignment order (paperOrdinal 1, 2, 3...),
    each carrying its matching result when the paper has been consumed and
    a plain NOT_STARTED status when it hasn't. Practice is never ranked and
    always released the instant it's computed (Phase D), so there is no
    rank to order by and no release gate to apply here, unlike
    _TeacherResultRow's own gate above.

    2026-09-12 (Shailesh, decoupling): no event scope anymore -- there is no
    event to look up, and papers are no longer filtered by event_id.

    StudentIdsFilter follows this module's own convention (see docstring):
    an explicitly empty list is "this teacher has no students" and
    short-circuits without ever issuing an `IN ()` query.
    """
    if not StudentIdsFilter:
        return {"competitionLevelCode": CompetitionLevelCode, "totalStudents": 0, "students": []}

    PaperQuery = db.query(CompetitionEventLevelPaper).filter(
        CompetitionEventLevelPaper.paper_kind == "PRACTICE",
        CompetitionEventLevelPaper.assigned_student_id.in_(StudentIdsFilter),
    )
    if CompetitionLevelCode:
        PaperQuery = PaperQuery.filter(CompetitionEventLevelPaper.competition_level_code == CompetitionLevelCode)
    PracticePapers = PaperQuery.order_by(
        CompetitionEventLevelPaper.assigned_at.asc(), CompetitionEventLevelPaper.id.asc()
    ).all()

    if not PracticePapers:
        return {"competitionLevelCode": CompetitionLevelCode, "totalStudents": 0, "students": []}

    # Mirrors ListAnnualCompetitionPracticeResultsForAdmin's own bulk-fetch
    # + ComputePracticePaperOrdinals call (annual_competition_scoring_
    # service.py) exactly, so the "Paper Name" column and row set read
    # identically for a teacher and an admin looking at the same student.
    Ordinals = ComputePracticePaperOrdinals(
        db, {(PaperRecord.assigned_student_id, PaperRecord.competition_level_code) for PaperRecord in PracticePapers}
    )

    PaperIds = [PaperRecord.id for PaperRecord in PracticePapers]
    AttemptsByLevelPaperId = {
        AttemptRecord.level_paper_id: AttemptRecord
        for AttemptRecord in db.query(CompetitionEventAttempt)
        .filter(CompetitionEventAttempt.level_paper_id.in_(PaperIds), CompetitionEventAttempt.attempt_type == "PRACTICE")
        .all()
    }
    # 2026-09-17 (Shailesh: "never ever anywhere"): same self-heal as
    # _TeacherResultRow above -- a practice attempt abandoned mid-section
    # never organically times out on its own (heartbeat-gap detection, not
    # a pure wall-clock expiry), so without this an abandoned practice
    # attempt would show as a plain NOT_STARTED-looking row forever instead
    # of the real (if late) result.
    ReconciledAny = False
    for AttemptRecord in AttemptsByLevelPaperId.values():
        if _ReconcileSingleAttemptIfAbandoned(db, AttemptRecord, _NowUtc()):
            ReconciledAny = True
    if ReconciledAny:
        db.commit()

    AttemptIds = [AttemptRecord.id for AttemptRecord in AttemptsByLevelPaperId.values()]
    ResultsByAttemptId = (
        {
            ResultRecord.attempt_id: ResultRecord
            for ResultRecord in db.query(CompetitionEventResult).filter(CompetitionEventResult.attempt_id.in_(AttemptIds)).all()
        }
        if AttemptIds
        else {}
    )

    StudentIds = {PaperRecord.assigned_student_id for PaperRecord in PracticePapers}
    StudentsById = {StudentRecord.id: StudentRecord for StudentRecord in db.query(Student).filter(Student.id.in_(StudentIds)).all()}

    StudentBuckets: dict[str, dict[str, Any]] = {}
    for PaperRecord in PracticePapers:
        StudentRecord = StudentsById.get(PaperRecord.assigned_student_id)
        if not StudentRecord:
            continue
        UserRecord = db.get(User, StudentRecord.user_id) if StudentRecord.user_id else None
        Bucket = StudentBuckets.setdefault(
            StudentRecord.id,
            {
                "studentId": StudentRecord.id,
                "studentCode": StudentRecord.student_code,
                "studentName": UserRecord.full_name if UserRecord else StudentRecord.student_code,
                "papers": [],
            },
        )
        Ordinal = Ordinals.get(PaperRecord.id)
        AttemptRecord = AttemptsByLevelPaperId.get(PaperRecord.id)
        ResultRecord = ResultsByAttemptId.get(AttemptRecord.id) if AttemptRecord else None
        Bucket["papers"].append(
            {
                "levelPaperId": PaperRecord.id,
                "attemptId": AttemptRecord.id if AttemptRecord else None,
                "competitionLevelCode": PaperRecord.competition_level_code,
                "paperOrdinal": Ordinal,
                "paperLabel": f"Practice Paper {Ordinal}" if Ordinal else "Practice Paper",
                "status": AttemptRecord.status if AttemptRecord else "NOT_STARTED",
                "assignedAt": PaperRecord.assigned_at.isoformat() if PaperRecord.assigned_at else None,
                "submittedAt": AttemptRecord.submitted_at.isoformat() if AttemptRecord and AttemptRecord.submitted_at else None,
                "result": (
                    {
                        "score": ResultRecord.score,
                        "maxScore": ResultRecord.max_score,
                        "percentage": RoundPercentageForDisplay(ResultRecord.percentage),
                        "accuracyPercentage": RoundPercentageForDisplay(ResultRecord.accuracy_percentage),
                        "correctCount": ResultRecord.correct_count,
                        "wrongCount": ResultRecord.wrong_count,
                        "unansweredCount": ResultRecord.unanswered_count,
                        "timeTakenSeconds": ResultRecord.time_taken_seconds,
                        "computedAt": ResultRecord.computed_at.isoformat() if ResultRecord.computed_at else None,
                    }
                    if ResultRecord
                    else None
                ),
            }
        )

    return {"competitionLevelCode": CompetitionLevelCode, "totalStudents": len(StudentBuckets), "students": list(StudentBuckets.values())}


def ListNonDraftAnnualCompetitionEvents(db: Session) -> dict[str, Any]:
    """A minimal event picker for the teacher monitoring screens -- neither
    endpoint above is usable without an event ID first, and unlike admin
    (whose own ListCompetitionEvents in annual_competition_studio_service.py
    deliberately shows every event, DRAFT included, since admin is still
    setting them up), a DRAFT event is excluded here: nothing about it is
    final enough for a teacher to monitor, same exclusion rule
    ListMyAnnualCompetitionAssignments already applies for students."""
    EventRecords = (
        db.query(CompetitionEvent)
        .filter(CompetitionEvent.status != "DRAFT")
        .order_by(CompetitionEvent.competition_date.asc())
        .all()
    )
    return {
        "events": [
            {
                "eventId": EventRecord.id,
                "name": EventRecord.name,
                "status": EventRecord.status,
                "competitionDate": EventRecord.competition_date.isoformat() if EventRecord.competition_date else None,
            }
            for EventRecord in EventRecords
        ]
    }
