"""Attempt-chain foundation for MathPath DPS retry workflows.

Phase 10.9.4A intentionally adds the data/utility layer only. The automatic
retry assignment engine is introduced in the next phase so existing live
submission behavior remains stable while the new audit fields are deployed.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import Assignment, Attempt

ATTEMPT_SOURCE_ORIGINAL = "ORIGINAL"
ATTEMPT_SOURCE_AUTO_RETRY = "AUTO_RETRY"
ATTEMPT_SOURCE_MANUAL_RETRY = "MANUAL_RETRY"

BENCHMARK_STATUS_PENDING = "PENDING"
BENCHMARK_STATUS_CLEARED = "CLEARED"
BENCHMARK_STATUS_NEEDS_REATTEMPT = "NEEDS_REATTEMPT"
BENCHMARK_STATUS_MANUAL_INTERVENTION_REQUIRED = "MANUAL_INTERVENTION_REQUIRED"

DEFAULT_AUTO_RETRY_LIMIT = 3


def ResolveAttemptGroupId(AssignmentItem: Assignment, StudentId: str | None = None) -> str:
    """Return the stable group id that links original + retry DPS attempts."""
    ExistingGroupId = getattr(AssignmentItem, "attempt_group_id", None)
    if ExistingGroupId:
        return ExistingGroupId

    # Keep the group stable and human-auditable. Student-specific assignments
    # use the assignment id directly; level/batch assignments include the
    # student id so every child gets an independent retry chain.
    if getattr(AssignmentItem, "assigned_to_type", None) == "STUDENT":
        return AssignmentItem.id
    if StudentId:
        return f"{AssignmentItem.id}:{StudentId}"
    return AssignmentItem.id


def CountPriorAttemptsInGroup(Db: Session, AttemptGroupId: str, StudentId: str) -> int:
    """Count already-created attempts for one student's DPS attempt chain."""
    return (
        Db.query(Attempt)
        .filter(
            Attempt.attempt_group_id == AttemptGroupId,
            Attempt.student_id == StudentId,
        )
        .count()
    )


def NextAttemptNumber(Db: Session, AssignmentItem: Assignment, StudentId: str) -> int:
    """Return 0 for original, 1+ for retry attempts in the same chain."""
    AttemptGroupId = ResolveAttemptGroupId(AssignmentItem, StudentId)
    GroupCount = CountPriorAttemptsInGroup(Db, AttemptGroupId, StudentId)
    if GroupCount > 0:
        return GroupCount

    # Compatibility fallback for attempts created before Phase 10.9.4A.
    LegacyCount = (
        Db.query(Attempt)
        .filter(
            Attempt.assignment_id == AssignmentItem.id,
            Attempt.student_id == StudentId,
        )
        .count()
    )
    return LegacyCount


def AttemptSourceForNumber(AttemptNumber: int, AssignmentItem: Assignment | None = None) -> str:
    """Classify the attempt source without changing current workflow behavior."""
    if AttemptNumber <= 0:
        return ATTEMPT_SOURCE_ORIGINAL

    AssignmentSource = getattr(AssignmentItem, "assignment_source", None) if AssignmentItem else None
    if AssignmentSource in {ATTEMPT_SOURCE_AUTO_RETRY, ATTEMPT_SOURCE_MANUAL_RETRY}:
        return AssignmentSource
    return ATTEMPT_SOURCE_MANUAL_RETRY


def ApplyAttemptChainMetadata(
    Db: Session,
    AttemptItem: Attempt,
    AssignmentItem: Assignment,
    StudentId: str,
) -> Attempt:
    """Attach normalized chain metadata to a newly-created attempt."""
    AttemptGroupId = ResolveAttemptGroupId(AssignmentItem, StudentId)
    AttemptNumber = NextAttemptNumber(Db, AssignmentItem, StudentId)

    AttemptItem.attempt_group_id = AttemptGroupId
    AttemptItem.attempt_number = AttemptNumber
    AttemptItem.attempt_source = AttemptSourceForNumber(AttemptNumber, AssignmentItem)
    AttemptItem.requires_manual_intervention = False
    AttemptItem.cleared_at_attempt = False
    AttemptItem.benchmark_status = BENCHMARK_STATUS_PENDING
    return AttemptItem


def UpdateSubmittedAttemptBenchmarkState(AttemptItem: Attempt, BenchmarkPercentage: float) -> Attempt:
    """Persist the submitted attempt benchmark state for future retry engines."""
    Accuracy = float(getattr(AttemptItem, "accuracy_percentage", 0) or 0)
    AutoRetryLimit = DEFAULT_AUTO_RETRY_LIMIT

    if Accuracy >= BenchmarkPercentage:
        AttemptItem.benchmark_status = BENCHMARK_STATUS_CLEARED
        AttemptItem.cleared_at_attempt = True
        AttemptItem.requires_manual_intervention = False
        return AttemptItem

    AttemptNumber = int(getattr(AttemptItem, "attempt_number", 0) or 0)
    if AttemptNumber >= AutoRetryLimit:
        AttemptItem.benchmark_status = BENCHMARK_STATUS_MANUAL_INTERVENTION_REQUIRED
        AttemptItem.requires_manual_intervention = True
    else:
        AttemptItem.benchmark_status = BENCHMARK_STATUS_NEEDS_REATTEMPT
        AttemptItem.requires_manual_intervention = False
    return AttemptItem


def BuildAttemptLabel(AttemptNumber: int | None) -> str:
    """Consistent audit label for Admin/Teacher/Student history views."""
    NumberValue = int(AttemptNumber or 0)
    if NumberValue <= 0:
        return "Original"
    return f"Re-Attempt {NumberValue}"



def ShouldAutoCreateRetryAssignment(AttemptItem: Attempt) -> bool:
    """Return true when a failed DPS attempt should immediately receive an automatic retry."""
    BenchmarkState = getattr(AttemptItem, "benchmark_status", None)
    AttemptNumber = int(getattr(AttemptItem, "attempt_number", 0) or 0)
    RequiresManualIntervention = bool(getattr(AttemptItem, "requires_manual_intervention", False))
    return (
        BenchmarkState == BENCHMARK_STATUS_NEEDS_REATTEMPT
        and AttemptNumber < DEFAULT_AUTO_RETRY_LIMIT
        and not RequiresManualIntervention
    )


def NextAutoRetryAttemptNumber(AttemptItem: Attempt) -> int:
    """Return the next automatic retry number for a submitted failed attempt."""
    return int(getattr(AttemptItem, "attempt_number", 0) or 0) + 1


def ExistingRetryAssignmentForNumber(
    Db: Session,
    AttemptGroupId: str,
    StudentId: str,
    RetryAttemptNumber: int,
) -> Assignment | None:
    """Prevent duplicate automatic retry assignments if a submit endpoint is retried."""
    return (
        Db.query(Assignment)
        .filter(
            Assignment.attempt_group_id == AttemptGroupId,
            Assignment.assigned_to_type == "STUDENT",
            Assignment.assigned_to_id == StudentId,
            Assignment.retry_attempt_number == RetryAttemptNumber,
            Assignment.is_active == True,
        )
        .order_by(Assignment.created_at.desc())
        .first()
    )


def BuildRetryAssignmentTitle(SourceAssignment: Assignment, RetryAttemptNumber: int) -> str:
    """Create a clean operational title for auto-created retry DPS assignments."""
    BaseTitle = (getattr(SourceAssignment, "title", None) or "Practice Sheet").strip()
    NormalizedBase = BaseTitle.split(" - Re-Attempt ")[0].strip()
    return f"{NormalizedBase} - Re-Attempt {RetryAttemptNumber}"


def BuildRetryAssignmentInstructions(RetryAttemptNumber: int) -> str:
    """Student-safe retry instructions without exposing internal automation wording."""
    return (
        "This practice sheet has been prepared to help strengthen the same concept "
        "before moving ahead. Focus carefully on accuracy and complete the next practice attempt."
    )


def BuildRetryWorkflowPayload(AttemptItem: Attempt, RetryAssignment: Assignment | None = None) -> dict:
    """Compact response payload consumed by current/future Student UI result messages."""
    BenchmarkState = getattr(AttemptItem, "benchmark_status", None)
    AttemptNumber = int(getattr(AttemptItem, "attempt_number", 0) or 0)
    RequiresManualIntervention = bool(getattr(AttemptItem, "requires_manual_intervention", False))

    if BenchmarkState == BENCHMARK_STATUS_CLEARED:
        return {
            "state": "CLEARED",
            "attemptNumber": AttemptNumber,
            "nextAssignmentId": None,
            "requiresManualIntervention": False,
            "title": "Benchmark Achieved",
            "message": "Excellent work! You have successfully achieved the benchmark for this practice sheet.",
            "guidance": "You may now continue your learning journey with the next assigned practice.",
        }

    if RequiresManualIntervention or BenchmarkState == BENCHMARK_STATUS_MANUAL_INTERVENTION_REQUIRED:
        return {
            "state": "MANUAL_REVIEW_REQUIRED",
            "attemptNumber": AttemptNumber,
            "nextAssignmentId": None,
            "requiresManualIntervention": True,
            "title": "Additional Review Required",
            "message": "This practice requires additional review before the next attempt can be unlocked.",
            "guidance": "Your teacher will guide you through the next step to help strengthen this concept.",
        }

    return {
        "state": "RETRY_PREPARED" if RetryAssignment else "RETRY_REQUIRED",
        "attemptNumber": AttemptNumber,
        "nextAssignmentId": getattr(RetryAssignment, "id", None),
        "requiresManualIntervention": False,
        "title": "More Practice Recommended",
        "message": "You are improving, but the required benchmark has not been achieved yet.",
        "guidance": "A new practice sheet has been prepared to help you strengthen this concept before moving ahead.",
    }
