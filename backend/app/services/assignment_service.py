from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models import Assignment, Student, StudentBatch
from app.core.errors import api_error

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
    )
    db.add(assignment)
    db.flush()
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
