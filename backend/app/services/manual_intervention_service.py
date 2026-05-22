"""Manual escalation helpers for DPS retry chains.

Phase 10.9.4F keeps the existing Admin approval -> Teacher assignment ->
Student attempt governance layer, but only exposes it after the automatic retry
window has been exhausted for a unique DPS concept chain.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy.orm import Session

from app.models import Assignment, Attempt, DPS, Lesson, Level, Module, Student, Teacher, User
from app.services.attempt_chain_service import (
    ATTEMPT_SOURCE_MANUAL_RETRY,
    BENCHMARK_STATUS_MANUAL_INTERVENTION_REQUIRED,
    BuildAttemptLabel,
    ResolveAttemptGroupId,
)
from app.services.reattempt_operational_service import (
    AttemptActivityTimestamp,
    AttemptSequenceValue,
    NeedsReattemptAttempts,
)

MANUAL_INTERVENTION_STATUS = "MANUAL_INTERVENTION_REQUIRED"
MANUAL_RETRY_INSTRUCTIONS = (
    "This guided practice has been unlocked after teacher review. Complete it carefully "
    "to strengthen the concept before moving ahead."
)


def IsManualInterventionAttempt(AttemptItem: Attempt | None) -> bool:
    if not AttemptItem:
        return False
    BenchmarkStatus = str(getattr(AttemptItem, "benchmark_status", "") or "").upper()
    return bool(getattr(AttemptItem, "requires_manual_intervention", False)) or BenchmarkStatus == BENCHMARK_STATUS_MANUAL_INTERVENTION_REQUIRED


def ManualInterventionAttempts(
    AttemptItems: Iterable[Attempt],
    BenchmarkPercentage: float = 70.0,
) -> list[Attempt]:
    return [AttemptItem for AttemptItem in NeedsReattemptAttempts(AttemptItems, BenchmarkPercentage) if IsManualInterventionAttempt(AttemptItem)]


def LatestAttemptInChain(Db: Session, AttemptItem: Attempt) -> Attempt | None:
    AttemptGroupId = getattr(AttemptItem, "attempt_group_id", None)
    if AttemptGroupId:
        return (
            Db.query(Attempt)
            .filter(
                Attempt.attempt_group_id == AttemptGroupId,
                Attempt.student_id == AttemptItem.student_id,
            )
            .order_by(Attempt.attempt_number.desc(), Attempt.started_at.desc())
            .first()
        )
    return AttemptItem


def NextManualAttemptNumber(Db: Session, AttemptItem: Attempt) -> int:
    LatestAttempt = LatestAttemptInChain(Db, AttemptItem) or AttemptItem
    return int(getattr(LatestAttempt, "attempt_number", 0) or 0) + 1


def BuildManualRetryTitle(SourceAssignment: Assignment | None, Dps: DPS | None, NextAttemptNumber: int) -> str:
    if SourceAssignment and getattr(SourceAssignment, "title", None):
        BaseTitle = str(SourceAssignment.title).split(" - Re-Attempt ")[0].strip()
    elif Dps:
        BaseTitle = f"DPS {Dps.dps_number} Practice"
    else:
        BaseTitle = "Practice Sheet"
    return f"{BaseTitle} - Re-Attempt {NextAttemptNumber}"


def AssignmentLineageRoot(Db: Session, AssignmentItem: Assignment | None) -> Assignment | None:
    Current = AssignmentItem
    SeenIds: set[str] = set()
    while Current and getattr(Current, "source_assignment_id", None) and Current.source_assignment_id not in SeenIds:
        SeenIds.add(Current.id)
        Parent = Db.get(Assignment, Current.source_assignment_id)
        if not Parent:
            break
        Current = Parent
    return Current or AssignmentItem


def BuildManualRetryAssignment(
    Db: Session,
    *,
    StudentItem: Student,
    SourceAttempt: Attempt,
    AssignedByUserId: str,
    Title: str | None = None,
    Instructions: str | None = None,
) -> Assignment:
    """Create the teacher-assigned retry after Admin approval.

    This does not bypass history. The assignment remains linked to the same
    attempt_group_id so Admin, Teacher, and Student histories continue to show
    Original, Re-Attempt 1, Re-Attempt 2, Re-Attempt 3, then manual retries.
    """
    SourceAssignment = Db.get(Assignment, SourceAttempt.assignment_id) if SourceAttempt.assignment_id else None
    RootAssignment = AssignmentLineageRoot(Db, SourceAssignment)
    Dps = Db.get(DPS, SourceAttempt.dps_id) if SourceAttempt.dps_id else None
    AttemptGroupId = getattr(SourceAttempt, "attempt_group_id", None) or (
        ResolveAttemptGroupId(RootAssignment, StudentItem.id) if RootAssignment else f"{SourceAttempt.dps_id}:{StudentItem.id}"
    )
    NextAttemptNumber = NextManualAttemptNumber(Db, SourceAttempt)

    ExistingManualAssignment = (
        Db.query(Assignment)
        .filter(
            Assignment.attempt_group_id == AttemptGroupId,
            Assignment.assigned_to_type == "STUDENT",
            Assignment.assigned_to_id == StudentItem.id,
            Assignment.retry_attempt_number == NextAttemptNumber,
            Assignment.assignment_source == ATTEMPT_SOURCE_MANUAL_RETRY,
            Assignment.is_active == True,
        )
        .order_by(Assignment.created_at.desc())
        .first()
    )
    if ExistingManualAssignment:
        return ExistingManualAssignment

    AssignmentItem = Assignment(
        assignment_type="PRACTICE",
        dps_id=SourceAttempt.dps_id,
        assigned_by_user_id=AssignedByUserId,
        assigned_to_type="STUDENT",
        assigned_to_id=StudentItem.id,
        title=Title or BuildManualRetryTitle(SourceAssignment or RootAssignment, Dps, NextAttemptNumber),
        instructions=Instructions or MANUAL_RETRY_INSTRUCTIONS,
        start_time=None,
        end_time=None,
        allow_reattempt=False,
        show_result_immediately=True,
        show_correct_answers_after_submit=True,
        attempt_group_id=AttemptGroupId,
        source_assignment_id=(SourceAssignment.id if SourceAssignment else None),
        retry_attempt_number=NextAttemptNumber,
        assignment_source=ATTEMPT_SOURCE_MANUAL_RETRY,
        auto_retry_limit=3,
        requires_manual_intervention=False,
        manual_intervention_reason=None,
        is_active=True,
    )
    Db.add(AssignmentItem)
    Db.flush()
    return AssignmentItem


def ManualInterventionQueuePayload(Db: Session, AttemptItem: Attempt) -> dict:
    StudentItem = Db.get(Student, AttemptItem.student_id) if AttemptItem.student_id else None
    StudentUser = Db.get(User, StudentItem.user_id) if StudentItem and StudentItem.user_id else None
    AssignmentItem = Db.get(Assignment, AttemptItem.assignment_id) if AttemptItem.assignment_id else None
    Dps = Db.get(DPS, AttemptItem.dps_id) if AttemptItem.dps_id else None
    Lesson = Db.get(Lesson, Dps.lesson_id) if Dps else None
    Level = Db.get(Level, Lesson.level_id) if Lesson else None
    Module = Db.get(Module, Level.module_id) if Level else None
    NextAttemptNumber = NextManualAttemptNumber(Db, AttemptItem)
    ActivityAt = AttemptActivityTimestamp(AttemptItem)

    return {
        "status": MANUAL_INTERVENTION_STATUS,
        "requiresManualIntervention": True,
        "attemptId": AttemptItem.id,
        "assignmentId": AssignmentItem.id if AssignmentItem else None,
        "attemptGroupId": getattr(AttemptItem, "attempt_group_id", None),
        "attemptNumber": getattr(AttemptItem, "attempt_number", None),
        "attemptLabel": BuildAttemptLabel(getattr(AttemptItem, "attempt_number", None)),
        "nextAttemptNumber": NextAttemptNumber,
        "nextAttemptLabel": BuildAttemptLabel(NextAttemptNumber),
        "studentId": StudentItem.id if StudentItem else None,
        "studentName": StudentUser.full_name if StudentUser else None,
        "studentCode": StudentItem.student_code if StudentItem else None,
        "teacherName": getattr(StudentItem, "teacher", None) if StudentItem else None,
        "dpsId": Dps.id if Dps else getattr(AttemptItem, "dps_id", None),
        "dpsNumber": Dps.dps_number if Dps else None,
        "dpsTitle": Dps.dps_title if Dps else None,
        "lessonId": Lesson.id if Lesson else None,
        "lessonNumber": Lesson.lesson_number if Lesson else None,
        "lessonTitle": Lesson.lesson_title if Lesson else None,
        "levelId": Level.id if Level else None,
        "levelCode": Level.level_code if Level else None,
        "levelName": Level.level_name if Level else None,
        "moduleId": Module.id if Module else None,
        "moduleCode": Module.module_code if Module else None,
        "moduleName": Module.module_name if Module else None,
        "accuracy": AttemptItem.accuracy_percentage,
        "score": AttemptItem.total_score,
        "totalMarks": AttemptItem.max_score,
        "correctCount": AttemptItem.correct_count,
        "wrongCount": AttemptItem.wrong_count,
        "unansweredCount": AttemptItem.unanswered_count,
        "submittedAt": AttemptItem.submitted_at.isoformat() if AttemptItem.submitted_at else None,
        "lastActivityAt": ActivityAt.isoformat() if ActivityAt else None,
        "message": "This practice requires teacher review before the next attempt can be assigned.",
    }


def BuildManualInterventionQueue(
    Db: Session,
    *,
    StudentIds: list[str] | None = None,
    BenchmarkPercentage: float = 70.0,
) -> list[dict]:
    Query = Db.query(Attempt).filter(Attempt.status.in_(["SUBMITTED", "AUTO_SUBMITTED", "COMPLETED"]))
    if StudentIds is not None:
        if not StudentIds:
            return []
        Query = Query.filter(Attempt.student_id.in_(StudentIds))

    Attempts = Query.all()
    QueueAttempts = ManualInterventionAttempts(Attempts, BenchmarkPercentage)
    LatestQueueAttempts = []
    for AttemptItem in QueueAttempts:
        LatestAttempt = LatestAttemptInChain(Db, AttemptItem) or AttemptItem
        if LatestAttempt.id == AttemptItem.id and IsManualInterventionAttempt(LatestAttempt):
            LatestQueueAttempts.append(AttemptItem)

    Rows = [ManualInterventionQueuePayload(Db, AttemptItem) for AttemptItem in LatestQueueAttempts]
    return sorted(
        Rows,
        key=lambda Row: (
            Row.get("moduleCode") or "",
            Row.get("levelCode") or "",
            Row.get("lessonNumber") or 0,
            Row.get("dpsNumber") or 0,
            Row.get("studentName") or "",
        ),
    )
