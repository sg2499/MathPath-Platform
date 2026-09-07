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
    CompetitionEventResult,
    CompetitionEventSlot,
    Student,
    User,
)
from app.services.annual_competition_attempt_service import HEARTBEAT_GRACE_SECONDS

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


def _ActiveSectionForAttempt(db: Session, AttemptRecord: CompetitionEventAttempt | None) -> CompetitionEventAttemptSectionState | None:
    if not AttemptRecord:
        return None
    return (
        db.query(CompetitionEventAttemptSectionState)
        .filter(
            CompetitionEventAttemptSectionState.attempt_id == AttemptRecord.id,
            CompetitionEventAttemptSectionState.status == "ACTIVE",
        )
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


def _LiveStatusRow(db: Session, AssignmentRecord: CompetitionEventAssignment, NowUtc: datetime) -> dict[str, Any] | None:
    StudentRecord = db.get(Student, AssignmentRecord.student_id)
    if not StudentRecord:
        # Defensive only -- an assignment should never outlive its student
        # (the FK cascades on delete), but a monitoring read must never 500
        # over a single bad row.
        return None
    UserRecord = db.get(User, StudentRecord.user_id) if StudentRecord.user_id else None
    SlotRecord = db.get(CompetitionEventSlot, AssignmentRecord.slot_id) if AssignmentRecord.slot_id else None
    AttemptRecord = _LatestAttemptForAssignment(db, AssignmentRecord)

    LiveStatus = LIVE_STATUS_NOT_STARTED
    CurrentSectionNumber: int | None = None
    RemainingSecondsAtLastHeartbeat: int | None = None
    LastHeartbeatAtValue: datetime | None = None
    GapSeconds: float | None = None

    if AttemptRecord and AttemptRecord.status == "IN_PROGRESS":
        CurrentSectionNumber = AttemptRecord.current_section_number
        ActiveSectionState = _ActiveSectionForAttempt(db, AttemptRecord)
        if ActiveSectionState:
            RemainingSecondsAtLastHeartbeat = ActiveSectionState.remaining_seconds_at_last_heartbeat
            LastHeartbeatAtValue = _Aware(ActiveSectionState.last_heartbeat_at) or _Aware(ActiveSectionState.started_at)
            if LastHeartbeatAtValue:
                GapSeconds = (NowUtc - LastHeartbeatAtValue).total_seconds()
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

    return {
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
        "remainingSecondsAtLastHeartbeat": RemainingSecondsAtLastHeartbeat,
        "lastHeartbeatAt": LastHeartbeatAtValue.isoformat() if LastHeartbeatAtValue else None,
        "heartbeatGapSeconds": int(GapSeconds) if GapSeconds is not None else None,
    }


def GetAnnualCompetitionLiveMonitoring(
    db: Session, *, EventId: str, StudentIdsFilter: list[str] | None = None, SlotId: str | None = None
) -> dict[str, Any]:
    """Package 7 checklist item 1: started/in-progress/submitted/stuck
    status per student, per slot, during the event window. `StudentIdsFilter
    =None` is the admin view (every assignment); a list is a roster-scoped
    (teacher) view -- see module docstring."""
    EventRecord = _GetEventOr404(db, EventId)
    NowUtc = _NowUtc()

    AssignmentRecords = _ResolveAssignmentsForRoster(db, EventId=EventId, StudentIdsFilter=StudentIdsFilter, SlotId=SlotId)
    Rows = [Row for Row in (_LiveStatusRow(db, AssignmentRecord, NowUtc) for AssignmentRecord in AssignmentRecords) if Row]
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
        "summary": Summary,
        "rows": Rows,
    }


def _TeacherResultRow(db: Session, AssignmentRecord: CompetitionEventAssignment) -> dict[str, Any] | None:
    """One row of the release-gated roster results review (checklist item
    2). Mirrors GetCompetitionEventResultForStudent's own lock-down exactly
    (an unreleased -- or not-yet-computed -- result never surfaces its
    metrics), applied across a roster instead of a single student/attempt.
    """
    StudentRecord = db.get(Student, AssignmentRecord.student_id)
    if not StudentRecord:
        return None
    UserRecord = db.get(User, StudentRecord.user_id) if StudentRecord.user_id else None
    AttemptRecord = _LatestAttemptForAssignment(db, AssignmentRecord)

    BaseRow = {
        "assignmentId": AssignmentRecord.id,
        "studentId": StudentRecord.id,
        "studentCode": StudentRecord.student_code,
        "studentName": UserRecord.full_name if UserRecord else StudentRecord.student_code,
        "assignedLevelCode": AssignmentRecord.assigned_level_code,
        "attemptId": AttemptRecord.id if AttemptRecord else None,
        "attemptStatus": AttemptRecord.status if AttemptRecord else LIVE_STATUS_NOT_STARTED,
    }

    if not AttemptRecord:
        return {**BaseRow, "released": False, "result": None}

    ResultRecord = db.query(CompetitionEventResult).filter(CompetitionEventResult.attempt_id == AttemptRecord.id).first()
    if not ResultRecord or not ResultRecord.is_released:
        return {**BaseRow, "released": False, "result": None}

    return {
        **BaseRow,
        "released": True,
        "result": {
            "score": ResultRecord.score,
            "maxScore": ResultRecord.max_score,
            "percentage": ResultRecord.percentage,
            "accuracyPercentage": ResultRecord.accuracy_percentage,
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
    # Released+ranked rows first (by rank), then everything still unreleased
    # (or unranked), by student name -- so a partially-released level still
    # reads sensibly rather than in assignment-insertion order.
    Rows.sort(
        key=lambda Row: (0, Row["result"]["rank"] if Row["result"].get("rank") is not None else 10**9)
        if Row["released"]
        else (1, Row["studentName"] or "")
    )
    return {"eventId": EventId, "competitionLevelCode": CompetitionLevelCode, "totalResults": len(Rows), "rows": Rows}


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
