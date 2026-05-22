from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models import Assignment, Student, StudentBatch
from app.core.errors import api_error
from app.services.attempt_chain_service import (
    ATTEMPT_SOURCE_ORIGINAL,
    ATTEMPT_SOURCE_AUTO_RETRY,
    DEFAULT_AUTO_RETRY_LIMIT,
    BuildRetryAssignmentInstructions,
    BuildRetryAssignmentTitle,
    ExistingRetryAssignmentForNumber,
    NextAutoRetryAttemptNumber,
    ResolveAttemptGroupId,
    ShouldAutoCreateRetryAssignment,
)

def create_assignment(db: Session, *, assignment_type: str, dps_id: str, assigned_by_user_id: str, assigned_to_type: str, assigned_to_id: str, title: str, instructions: str | None = None, allow_reattempt: bool = False) -> Assignment:
    assignment = Assignment(
        assignment_type=assignment_type,
        dps_id=dps_id,
        assigned_by_user_id=assigned_by_user_id,
        assigned_to_type=assigned_to_type,
        assigned_to_id=assigned_to_id,
        title=title,
        instructions=instructions,
        allow_reattempt=allow_reattempt,
        assignment_source=ATTEMPT_SOURCE_ORIGINAL,
        retry_attempt_number=0,
        auto_retry_limit=DEFAULT_AUTO_RETRY_LIMIT,
        requires_manual_intervention=False,
    )
    db.add(assignment)
    db.flush()
    if not assignment.attempt_group_id:
        assignment.attempt_group_id = assignment.id
    return assignment

def student_has_assignment(db: Session, student: Student, assignment: Assignment) -> bool:
    if assignment.assigned_to_type == "STUDENT":
        return assignment.assigned_to_id == student.id
    if assignment.assigned_to_type == "LEVEL":
        return assignment.assigned_to_id == student.current_level_id
    if assignment.assigned_to_type == "BATCH":
        return db.query(StudentBatch).filter(
            StudentBatch.student_id == student.id,
            StudentBatch.batch_id == assignment.assigned_to_id,
            StudentBatch.is_active == True,
        ).first() is not None
    return False

def get_student_assignments(db: Session, student: Student):
    assignments = db.query(Assignment).filter(Assignment.is_active == True).all()
    return [a for a in assignments if student_has_assignment(db, student, a)]

def validate_assignment_access(db: Session, student: Student, assignment_id: str) -> Assignment:
    assignment = db.get(Assignment, assignment_id)
    if not assignment or not assignment.is_active:
        api_error(404, "NOT_FOUND", "Assignment not found.")
    now = datetime.now(timezone.utc)
    if assignment.start_time and now < assignment.start_time:
        api_error(403, "ASSIGNMENT_NOT_AVAILABLE", "This assignment is not available yet.")
    if assignment.end_time and now > assignment.end_time:
        api_error(403, "ASSIGNMENT_NOT_AVAILABLE", "This assignment is closed.")
    if not student_has_assignment(db, student, assignment):
        api_error(403, "FORBIDDEN", "This assignment is not assigned to this student.")
    return assignment



def create_auto_retry_assignment_for_attempt(db: Session, *, submitted_attempt, source_assignment: Assignment) -> Assignment | None:
    """Create the next automatic retry assignment after a below-benchmark DPS submission.

    Phase 10.9.4B only creates the assignment shell. The student will start it from
    the normal Practice area, preserving existing attempt history and tracker views.
    """
    if not ShouldAutoCreateRetryAssignment(submitted_attempt):
        return None

    student_id = getattr(submitted_attempt, "student_id", None)
    if not student_id:
        return None

    attempt_group_id = ResolveAttemptGroupId(source_assignment, student_id)
    retry_attempt_number = NextAutoRetryAttemptNumber(submitted_attempt)

    existing_assignment = ExistingRetryAssignmentForNumber(
        db,
        attempt_group_id,
        student_id,
        retry_attempt_number,
    )
    if existing_assignment:
        return existing_assignment

    retry_assignment = Assignment(
        assignment_type=source_assignment.assignment_type,
        dps_id=source_assignment.dps_id,
        assigned_by_user_id=source_assignment.assigned_by_user_id,
        assigned_to_type="STUDENT",
        assigned_to_id=student_id,
        title=BuildRetryAssignmentTitle(source_assignment, retry_attempt_number),
        instructions=BuildRetryAssignmentInstructions(retry_attempt_number),
        start_time=None,
        end_time=None,
        allow_reattempt=False,
        show_result_immediately=source_assignment.show_result_immediately,
        show_correct_answers_after_submit=source_assignment.show_correct_answers_after_submit,
        attempt_group_id=attempt_group_id,
        source_assignment_id=source_assignment.id,
        retry_attempt_number=retry_attempt_number,
        assignment_source=ATTEMPT_SOURCE_AUTO_RETRY,
        auto_retry_limit=DEFAULT_AUTO_RETRY_LIMIT,
        requires_manual_intervention=False,
        manual_intervention_reason=None,
        is_active=True,
    )
    db.add(retry_assignment)
    db.flush()
    return retry_assignment
