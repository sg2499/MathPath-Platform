from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_student
from app.models import Student, DPS, Lesson, Level, Module, Attempt, Assignment, AssignmentReattemptPermission, AssessmentAssignment, StudentLevelPromotion
from app.services.assignment_service import get_student_assignments
from app.services.curriculum_service import dps_config_payload
from app.services.attempt_service import start_attempt, get_attempt_for_student, safe_questions_payload, save_answer, submit_attempt, result_payload, remaining_seconds, latest_retry_assignment_for_attempt
from app.services.assessment_eligibility_service import assessment_eligibility_payload
from app.services.assessment_engine_service import (
    AssessmentAssignmentPayload,
    StudentAssessmentStartPayload,
    StartAssessmentAttempt,
    AssessmentAttemptPayload,
    GetAssessmentAttemptForStudent,
    SaveAssessmentAnswer,
    SubmitAssessmentAttempt,
    AssessmentResultPayload,
)
from app.services.assessment_notification_service import NotifyAssessmentAttemptSubmitted
from app.services.practice_notification_service import NotifyPracticeAttemptSubmitted, NotifyPracticeAssignmentsCreated
from app.services.reattempt_operational_service import AttemptConceptKey, AttemptSequenceValue
from app.services.assessment_feedback_service import assessment_feedback_payload, active_assessment_remark

router = APIRouter(prefix="/api/student", tags=["student"])

class StartAttemptRequest(BaseModel):
    assignmentId: str
    dpsId: str
    mode: str = "PRACTICE"

class SaveAnswerRequest(BaseModel):
    questionId: str
    selectedOptionId: str

class SubmitRequest(BaseModel):
    confirmSubmit: bool = True


class StartAssessmentRequest(BaseModel):
    assignmentId: str

class SaveAssessmentAnswerRequest(BaseModel):
    questionId: str
    selectedOptionId: str



def active_reattempt_permission_for_student(db: Session, assignment_id: str, student_id: str):
    return (
        db.query(AssignmentReattemptPermission)
        .filter(
            AssignmentReattemptPermission.assignment_id == assignment_id,
            AssignmentReattemptPermission.student_id == student_id,
            AssignmentReattemptPermission.status == "APPROVED",
            AssignmentReattemptPermission.used_at.is_(None),
        )
        .order_by(AssignmentReattemptPermission.allowed_at.asc())
        .first()
    )


def latest_attempt_for_assignment_student(db: Session, assignment_id: str, student_id: str):
    return (
        db.query(Attempt)
        .filter(Attempt.assignment_id == assignment_id, Attempt.student_id == student_id)
        .order_by(Attempt.started_at.desc())
        .first()
    )




def benchmark_payload_for_attempt(attempt):
    if not attempt:
        return {
            "benchmarkPercentage": 70,
            "benchmarkStatus": "PENDING",
            "requiresAttention": False,
            "benchmarkMessage": None,
        }
    accuracy = float(attempt.accuracy_percentage or 0)
    return {
        "benchmarkPercentage": 70,
        "benchmarkStatus": "BELOW_70" if accuracy < 70 else "PASS",
        "requiresAttention": accuracy < 70,
        "benchmarkMessage": "Below the 70% benchmark" if accuracy < 70 else "Pass",
    }


def attempt_date_payload(attempt):
    if not attempt:
        return {
            "startedAt": None,
            "submittedAt": None,
            "attemptDate": None,
            "completedDate": None,
        }

    started_at = getattr(attempt, "started_at", None)
    submitted_at = getattr(attempt, "submitted_at", None)

    return {
        "startedAt": started_at.isoformat() if started_at else None,
        "submittedAt": submitted_at.isoformat() if submitted_at else None,
        "attemptDate": started_at.isoformat() if started_at else None,
        "completedDate": submitted_at.isoformat() if submitted_at else None,
    }

@router.get("/notifications")
def student_notifications(db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    notifications = []

    for assignment in get_student_assignments(db, student):
        latest = latest_attempt_for_assignment_student(db, assignment.id, student.id)
        reattempt_permission = active_reattempt_permission_for_student(db, assignment.id, student.id)
        is_completed = latest and latest.status in ["SUBMITTED", "AUTO_SUBMITTED", "COMPLETED"]
        is_available = not latest or (reattempt_permission and is_completed)

        if is_available:
            dps = db.get(DPS, assignment.dps_id)
            lesson = db.get(Lesson, dps.lesson_id) if dps else None
            label = "assessment" if assignment.assignment_type == "ASSESSMENT" else "practice sheet"
            tone = "purple" if reattempt_permission else "info"
            title = "Reattempt unlocked" if reattempt_permission else f"New {label} assigned"
            message = (
                f"Admin has reopened {assignment.title}. Complete it after revision."
                if reattempt_permission
                else f"{assignment.title} is available for you to complete."
            )
            target = "/student/assessments" if assignment.assignment_type == "ASSESSMENT" else "/student/dashboard"

            notifications.append({
                "id": f"student-assignment-{assignment.id}-{'reattempt' if reattempt_permission else 'new'}",
                "title": title,
                "message": message,
                "tone": tone,
                "targetUrl": target,
                "createdAt": (reattempt_permission.allowed_at.isoformat() if reattempt_permission and reattempt_permission.allowed_at else assignment.created_at.isoformat() if assignment.created_at else None),
                "assignmentType": assignment.assignment_type,
                "lessonNumber": lesson.lesson_number if lesson else None,
                "dpsNumber": dps.dps_number if dps else None,
            })

    attempts = (
        db.query(Attempt)
        .filter(Attempt.student_id == student.id, Attempt.status.in_(["SUBMITTED", "AUTO_SUBMITTED", "COMPLETED"]))
        .order_by(Attempt.submitted_at.desc().nullslast())
        .limit(15)
        .all()
    )

    for attempt in attempts:
        assignment = db.get(Assignment, attempt.assignment_id) if attempt.assignment_id else None
        accuracy = float(attempt.accuracy_percentage or 0)
        if accuracy < 70:
            tone = "danger"
            title = "Needs more practice"
            message = "You completed the sheet, but your score is below the 70% benchmark. Review mistakes with your teacher and try again after practice."
        elif accuracy >= 90:
            tone = "success"
            title = "Excellent work"
            message = f"Great performance! You scored {accuracy:g}%. Keep the momentum going."
        else:
            tone = "warning"
            title = "Good progress"
            message = f"You scored {accuracy:g}%. Keep practicing to reach the 90%+ excellence range."

        notifications.append({
            "id": f"student-attempt-{attempt.id}",
            "title": title,
            "message": message,
            "tone": tone,
            "targetUrl": f"/student/result/{attempt.id}",
            "createdAt": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
            "assignmentType": assignment.assignment_type if assignment else None,
        })

    notifications = sorted(notifications, key=lambda item: item.get("createdAt") or "", reverse=True)
    return {"notifications": notifications[:25]}


@router.get("/assignments")
def assignments(db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    rows = [a for a in get_student_assignments(db, student) if a.assignment_type != "ASSESSMENT"]
    payload = []
    for a in rows:
        dps = db.get(DPS, a.dps_id)
        lesson = db.get(Lesson, dps.lesson_id)
        level = db.get(Level, lesson.level_id)
        module = db.get(Module, level.module_id)
        existing = latest_attempt_for_assignment_student(db, a.id, student.id)
        reattempt_permission = active_reattempt_permission_for_student(db, a.id, student.id)
        status = existing.status if existing else "NOT_STARTED"
        attempt_id = existing.id if existing else None
        if reattempt_permission and existing and existing.status in ["SUBMITTED", "AUTO_SUBMITTED", "COMPLETED"]:
            status = "REATTEMPT_AVAILABLE"
            attempt_id = None

        payload.append({
            "assignmentId": a.id,
            "mode": a.assignment_type,
            "title": a.title,
            "moduleCode": module.module_code,
            "moduleName": module.module_name,
            "levelCode": level.level_code,
            "lessonNumber": lesson.lesson_number,
            "lessonTitle": lesson.lesson_title,
            "dpsId": dps.id,
            "dpsNumber": dps.dps_number,
            "dpsTitle": dps.dps_title,
            "questionCount": dps.default_question_count,
            "durationSeconds": dps.default_duration_seconds,
            "marksPerQuestion": dps.marks_per_question,
            "status": status,
            "attemptId": attempt_id,
            "reattemptAvailable": bool(reattempt_permission),
            "reattemptPermissionId": reattempt_permission.id if reattempt_permission else None,
        })
    return {"assignments": payload}


@router.get("/assessments")
def student_assessments(db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    payload = []

    EngineAssignments = (
        db.query(AssessmentAssignment)
        .filter(AssessmentAssignment.student_id == student.id, AssessmentAssignment.is_active == True)
        .order_by(AssessmentAssignment.assigned_at.desc())
        .all()
    )

    for EngineAssignment in EngineAssignments:
        Row = AssessmentAssignmentPayload(db, EngineAssignment)
        Row["mode"] = "ASSESSMENT"
        Row["title"] = Row.get("assessmentTitle") or Row.get("assignmentTitle") or "Assessment"
        Row["questionCount"] = Row.get("questionCount") or Row.get("totalQuestions")
        Row["durationMinutes"] = Row.get("durationMinutes")
        Row["durationSeconds"] = Row.get("durationSeconds")
        Row["reattemptAvailable"] = Row.get("status") == "REATTEMPT_AVAILABLE"
        payload.append(Row)

    LegacyRows = [a for a in get_student_assignments(db, student) if a.assignment_type == "ASSESSMENT"]
    for a in LegacyRows:
        dps = db.get(DPS, a.dps_id)
        lesson = db.get(Lesson, dps.lesson_id) if dps else None
        level = db.get(Level, lesson.level_id) if lesson else None
        module = db.get(Module, level.module_id) if level else None
        existing = latest_attempt_for_assignment_student(db, a.id, student.id)
        reattempt_permission = active_reattempt_permission_for_student(db, a.id, student.id)

        status = existing.status if existing else "NOT_STARTED"
        attempt_id = existing.id if existing else None

        if reattempt_permission and existing and existing.status in ["SUBMITTED", "AUTO_SUBMITTED", "COMPLETED"]:
            status = "REATTEMPT_AVAILABLE"
            attempt_id = None

        payload.append({
            "assignmentId": a.id,
            "mode": a.assignment_type,
            "title": a.title,
            "moduleCode": module.module_code if module else None,
            "moduleName": module.module_name if module else None,
            "levelCode": level.level_code if level else None,
            "levelName": level.level_name if level else None,
            "lessonNumber": lesson.lesson_number if lesson else None,
            "lessonTitle": lesson.lesson_title if lesson else None,
            "dpsId": dps.id if dps else None,
            "dpsNumber": dps.dps_number if dps else None,
            "dpsTitle": dps.dps_title if dps else None,
            "questionCount": dps.default_question_count if dps else None,
            "durationSeconds": dps.default_duration_seconds if dps else None,
            "marksPerQuestion": dps.marks_per_question if dps else None,
            "status": status,
            "attemptId": attempt_id,
            "createdAt": a.created_at.isoformat() if a.created_at else None,
            "assignedAt": a.created_at.isoformat() if a.created_at else None,
            "reattemptAvailable": bool(reattempt_permission),
            "reattemptPermissionId": reattempt_permission.id if reattempt_permission else None,
        })
    return {"assessments": payload}




def attempt_sequence_number(db: Session, attempt: Attempt | None) -> int:
    """Return display sequence: 1=Original, 2=Re-Attempt 1, 3=Re-Attempt 2."""
    if not attempt:
        return 1
    stored_attempt_number = getattr(attempt, "attempt_number", None)
    if stored_attempt_number is not None:
        try:
            return int(stored_attempt_number or 0) + 1
        except (TypeError, ValueError):
            pass
    query = db.query(Attempt).filter(
        Attempt.student_id == attempt.student_id,
        Attempt.dps_id == attempt.dps_id,
    )
    attempt_group_id = getattr(attempt, "attempt_group_id", None)
    if attempt_group_id:
        query = query.filter(Attempt.attempt_group_id == attempt_group_id)
    elif attempt.assignment_id:
        query = query.filter(Attempt.assignment_id == attempt.assignment_id)
    else:
        query = query.filter(Attempt.assignment_id.is_(None))
    attempts = query.order_by(
        Attempt.attempt_number.asc().nullslast(),
        Attempt.started_at.asc().nullslast(),
        Attempt.submitted_at.asc().nullslast(),
        Attempt.id.asc(),
    ).all()
    for index, attempt_row in enumerate(attempts, start=1):
        if attempt_row.id == attempt.id:
            return index
    return 1


def attempt_display_status(db: Session, attempt: Attempt | None) -> str:
    if not attempt:
        return "Pending"
    sequence_number = attempt_sequence_number(db, attempt)
    is_reattempt = sequence_number > 1
    status_value = (attempt.status or "").upper()
    is_completed = status_value in {"SUBMITTED", "AUTO_SUBMITTED", "COMPLETED"}
    if not is_completed:
        return "Re-Attempt Pending" if is_reattempt else "Pending"
    benchmark_met = float(attempt.accuracy_percentage or 0) >= 70
    if is_reattempt:
        return "Re-Attempt Cleared" if benchmark_met else "Needs Re-Attempt"
    return "Cleared" if benchmark_met else "Needs Re-Attempt"


def attempt_metadata(db: Session, attempt: Attempt | None) -> dict:
    sequence_number = attempt_sequence_number(db, attempt) if attempt else 1
    return {
        "attemptNumber": sequence_number,
        "attemptSequence": sequence_number,
        "attemptLabel": f"Re-Attempt {sequence_number - 1}" if sequence_number > 1 else "Original",
        "isReattempt": sequence_number > 1,
        "displayStatus": attempt_display_status(db, attempt),
    }


def current_attempts_by_work_unit(db: Session, attempts: list[Attempt]) -> list[Attempt]:
    current: dict[str, Attempt] = {}
    for attempt in attempts:
        key = AttemptConceptKey(attempt)
        existing = current.get(key)
        if not existing:
            current[key] = attempt
            continue
        existing_sequence = AttemptSequenceValue(existing) or attempt_sequence_number(db, existing)
        attempt_sequence = AttemptSequenceValue(attempt) or attempt_sequence_number(db, attempt)
        existing_time = existing.submitted_at or existing.started_at
        attempt_time = attempt.submitted_at or attempt.started_at
        if (
            attempt_sequence > existing_sequence
            or (attempt_sequence == existing_sequence and (attempt_time or existing_time) and (attempt_time or existing_time) == attempt_time)
        ):
            current[key] = attempt
    return list(current.values())

def level_total_dps_count(db: Session, level_id: str | None) -> int:
    if not level_id:
        return 0
    return (
        db.query(DPS)
        .join(Lesson, DPS.lesson_id == Lesson.id)
        .filter(Lesson.level_id == level_id)
        .count()
    )


def level_completed_attempts_for_student(db: Session, student_id: str, level_id: str | None):
    if not level_id:
        return []
    return (
        db.query(Attempt)
        .join(DPS, Attempt.dps_id == DPS.id)
        .join(Lesson, DPS.lesson_id == Lesson.id)
        .filter(
            Attempt.student_id == student_id,
            Lesson.level_id == level_id,
            Attempt.status.in_(["SUBMITTED", "AUTO_SUBMITTED", "COMPLETED"]),
        )
        .all()
    )


def level_progress_accuracy(attempts: list[Attempt]) -> int:
    values = [float(item.accuracy_percentage or 0) for item in attempts if float(item.accuracy_percentage or 0) > 0]
    if not values:
        return 0
    return round(sum(values) / len(values))


def level_progress_row(
    db: Session,
    student_id: str,
    level_id: str | None,
    role: str,
    status_label: str,
    promotion: StudentLevelPromotion | None = None,
):
    level = db.get(Level, level_id) if level_id else None
    module = db.get(Module, level.module_id) if level and level.module_id else None
    attempts = level_completed_attempts_for_student(db, student_id, level.id if level else None)
    current_attempts = current_attempts_by_work_unit(db, attempts)
    cleared_attempts = [item for item in current_attempts if float(item.accuracy_percentage or 0) >= 70]
    total_dps = level_total_dps_count(db, level.id if level else None)
    return {
        "attemptId": f"level-progress-{level.id if level else role}",
        "assignmentId": None,
        "assignmentTitle": status_label,
        "assignmentType": "LEVEL_PROGRESS",
        "recordKind": "LEVEL_PROGRESS",
        "progressionRole": role,
        "progressionStatus": status_label,
        "status": status_label,
        "score": None,
        "maxScore": None,
        "accuracyPercentage": level_progress_accuracy(cleared_attempts or current_attempts),
        "averageAccuracy": level_progress_accuracy(cleared_attempts or current_attempts),
        "correct": 0,
        "wrong": 0,
        "unanswered": 0,
        "timeTakenSeconds": None,
        "benchmarkPercentage": 70,
        "benchmarkStatus": "MET" if cleared_attempts else "PENDING",
        "requiresAttention": False,
        "benchmarkMessage": None,
        "moduleId": module.id if module else None,
        "moduleCode": module.module_code if module else (promotion.to_module_code if role == "ACTIVE_LEVEL" and promotion else promotion.from_module_code if promotion else None),
        "moduleName": module.module_name if module else None,
        "levelId": level.id if level else level_id,
        "levelCode": level.level_code if level else (promotion.to_level_code if role == "ACTIVE_LEVEL" and promotion else promotion.from_level_code if promotion else None),
        "levelName": level.level_name if level else None,
        "lessonId": None,
        "lessonNumber": None,
        "lessonTitle": None,
        "dpsId": None,
        "dpsNumber": None,
        "dpsTitle": None,
        "requiredDpsCount": total_dps,
        "totalDpsCount": total_dps,
        "clearedDpsCount": len(cleared_attempts),
        "promotedFromLevelId": promotion.from_level_id if promotion else None,
        "promotedFromLevelCode": promotion.from_level_code if promotion else None,
        "promotedToLevelId": promotion.to_level_id if promotion else None,
        "promotedToLevelCode": promotion.to_level_code if promotion else None,
        "promotedAt": promotion.promoted_at.isoformat() if promotion and promotion.promoted_at else None,
        "startedAt": None,
        "submittedAt": promotion.promoted_at.isoformat() if promotion and promotion.promoted_at else None,
        "attemptDate": promotion.promoted_at.isoformat() if promotion and promotion.promoted_at else None,
        "completedDate": promotion.promoted_at.isoformat() if promotion and promotion.promoted_at else None,
    }


def student_level_progress_rows(db: Session, student: Student):
    promotions = (
        db.query(StudentLevelPromotion)
        .filter(StudentLevelPromotion.student_id == student.id, StudentLevelPromotion.status == "PROMOTED")
        .order_by(StudentLevelPromotion.promoted_at.asc().nullslast(), StudentLevelPromotion.created_at.asc())
        .all()
    )
    rows = []
    seen = set()
    for promotion in promotions:
        from_key = (promotion.from_level_id, "PROMOTED_FROM")
        if promotion.from_level_id and from_key not in seen:
            rows.append(level_progress_row(db, student.id, promotion.from_level_id, "PROMOTED_FROM", "Promoted", promotion))
            seen.add(from_key)
    latest = promotions[-1] if promotions else None
    if latest and latest.to_level_id:
        active_key = (latest.to_level_id, "ACTIVE_LEVEL")
        if active_key not in seen:
            rows.append(level_progress_row(db, student.id, latest.to_level_id, "ACTIVE_LEVEL", "Active Level", latest))
            seen.add(active_key)
    return rows


@router.get("/results")
def student_results(db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    attempts = (
        db.query(Attempt)
        .filter(
            Attempt.student_id == student.id,
            Attempt.status.in_(["SUBMITTED", "AUTO_SUBMITTED", "COMPLETED"]),
        )
        .order_by(Attempt.submitted_at.desc().nullslast())
        .all()
    )
    rows = []
    level_dps_totals: dict[str, int] = {}

    def total_dps_for_level(level_id: str | None) -> int:
        if not level_id:
            return 0
        if level_id not in level_dps_totals:
            level_dps_totals[level_id] = level_total_dps_count(db, level_id)
        return level_dps_totals[level_id]

    submitted_assignment_ids = {attempt.assignment_id for attempt in attempts if attempt.assignment_id}

    for attempt in attempts:
        assignment = db.get(Assignment, attempt.assignment_id) if attempt.assignment_id else None
        dps = db.get(DPS, attempt.dps_id)
        lesson = db.get(Lesson, dps.lesson_id) if dps else None
        level = db.get(Level, lesson.level_id) if lesson else None
        module = db.get(Module, level.module_id) if level else None
        total_dps = total_dps_for_level(level.id if level else None)
        rows.append({
            "attemptId": attempt.id,
            "assignmentId": assignment.id if assignment else None,
            "assignmentTitle": assignment.title if assignment else None,
            "assignmentType": assignment.assignment_type if assignment else attempt.mode,
            "status": attempt.status,
            "score": attempt.total_score,
            "maxScore": attempt.max_score,
            "accuracyPercentage": attempt.accuracy_percentage,
            "correct": attempt.correct_count,
            "wrong": attempt.wrong_count,
            "unanswered": attempt.unanswered_count,
            "timeTakenSeconds": attempt.time_taken_seconds,
            **benchmark_payload_for_attempt(attempt),
            **attempt_metadata(db, attempt),
            "moduleId": module.id if module else None,
            "moduleCode": module.module_code if module else None,
            "moduleName": module.module_name if module else None,
            "levelId": level.id if level else None,
            "levelCode": level.level_code if level else None,
            "levelName": level.level_name if level else None,
            "lessonId": lesson.id if lesson else None,
            "lessonNumber": lesson.lesson_number if lesson else None,
            "lessonTitle": lesson.lesson_title if lesson else None,
            "dpsId": dps.id if dps else None,
            "dpsNumber": dps.dps_number if dps else None,
            "dpsTitle": dps.dps_title if dps else None,
            "requiredDpsCount": total_dps,
            "totalDpsCount": total_dps,
            "levelDpsCount": total_dps,
            **attempt_date_payload(attempt),
        })

    pending_assignments = (
        db.query(Assignment)
        .filter(
            Assignment.assignment_type == "PRACTICE",
            Assignment.assigned_to_type == "STUDENT",
            Assignment.assigned_to_id == student.id,
            Assignment.is_active.is_(True),
        )
        .order_by(Assignment.created_at.desc())
        .all()
    )
    for assignment in pending_assignments:
        if assignment.id in submitted_assignment_ids:
            continue
        dps = db.get(DPS, assignment.dps_id) if assignment.dps_id else None
        lesson = db.get(Lesson, dps.lesson_id) if dps else None
        level = db.get(Level, lesson.level_id) if lesson else None
        module = db.get(Module, level.module_id) if level else None
        total_dps = total_dps_for_level(level.id if level else None)
        retry_number = int(getattr(assignment, "retry_attempt_number", 0) or 0)
        rows.append({
            "attemptId": None,
            "assignmentId": assignment.id,
            "assignmentTitle": assignment.title,
            "assignmentType": assignment.assignment_type,
            "recordKind": "PENDING_ASSIGNMENT",
            "status": "PENDING",
            "score": None,
            "maxScore": None,
            "accuracyPercentage": None,
            "correct": 0,
            "wrong": 0,
            "unanswered": 0,
            "timeTakenSeconds": None,
            "benchmarkPercentage": 70,
            "benchmarkStatus": "PENDING",
            "requiresAttention": retry_number > 0,
            "benchmarkMessage": "Pending practice assignment",
            "attemptNumber": retry_number + 1 if retry_number > 0 else 1,
            "retryAttemptNumber": retry_number,
            "attemptLabel": f"Re-Attempt {retry_number}" if retry_number > 0 else "Original",
            "isReattempt": retry_number > 0,
            "attemptSource": getattr(assignment, "assignment_source", None),
            "attemptGroupId": getattr(assignment, "attempt_group_id", None),
            "moduleId": module.id if module else None,
            "moduleCode": module.module_code if module else None,
            "moduleName": module.module_name if module else None,
            "levelId": level.id if level else None,
            "levelCode": level.level_code if level else None,
            "levelName": level.level_name if level else None,
            "lessonId": lesson.id if lesson else None,
            "lessonNumber": lesson.lesson_number if lesson else None,
            "lessonTitle": lesson.lesson_title if lesson else None,
            "dpsId": dps.id if dps else None,
            "dpsNumber": dps.dps_number if dps else None,
            "dpsTitle": dps.dps_title if dps else None,
            "requiredDpsCount": total_dps,
            "totalDpsCount": total_dps,
            "levelDpsCount": total_dps,
            "startedAt": None,
            "submittedAt": None,
            "attemptDate": None,
            "completedDate": None,
            "createdAt": assignment.created_at.isoformat() if assignment.created_at else None,
        })

    rows.extend(student_level_progress_rows(db, student))
    return {"results": rows}


@router.get("/dps/{dps_id}")
def student_dps(dps_id: str, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    payload = dps_config_payload(db, dps_id)
    section = payload["sections"][0] if payload["sections"] else {}
    concept_sections = [
        {
            "sectionNumber": item.get("sectionNumber"),
            "sectionTitle": item.get("sectionTitle"),
            "questionCount": item.get("questionCount"),
            "conceptFamily": item.get("conceptFamily"),
            "operationFocus": item.get("operationFocus"),
        }
        for item in payload.get("sections", [])
    ]
    question_count = payload["defaultQuestionCount"]
    return {
        "dpsId": payload["dpsId"],
        "moduleCode": payload["moduleCode"],
        "levelCode": payload["levelCode"],
        "lessonNumber": payload["lessonNumber"],
        "dpsNumber": payload["dpsNumber"],
        "title": payload["dpsTitle"],
        "concept": {
            "conceptFamily": section.get("conceptFamily"),
            "operationFocus": section.get("operationFocus"),
            "abacusRule": section.get("abacusRule"),
            "description": section.get("sectionTitle"),
            "sections": concept_sections,
        },
        "testSettings": {
            "questionCount": question_count,
            "durationSeconds": payload["defaultDurationSeconds"],
            "marksPerQuestion": payload["marksPerQuestion"],
            "answerType": "MCQ",
            "optionsPerQuestion": 4,
            "negativeMarking": False,
            "navigationAllowed": True,
            "autoSubmit": True,
        },
        "instructions": [f"You will get {question_count} questions.", "Each question has 4 options.", "Choose the correct answer.", "The practice will auto-submit when time is up."],
    }

@router.post("/attempts/start")
def start(payload: StartAttemptRequest, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    attempt = start_attempt(db, student, payload.assignmentId, payload.dpsId, payload.mode)
    return {"attemptId": attempt.id, "questionSetId": attempt.question_set_id, "status": attempt.status, "mode": attempt.mode, "startedAt": attempt.started_at, "expiresAt": attempt.expires_at, "remainingSeconds": remaining_seconds(attempt), "totalQuestions": attempt.total_questions, "questions": safe_questions_payload(db, attempt)}

@router.get("/attempts/{attempt_id}")
def resume(attempt_id: str, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    attempt = get_attempt_for_student(db, student, attempt_id)
    data = {"attemptId": attempt.id, "status": attempt.status, "mode": attempt.mode, "startedAt": attempt.started_at, "expiresAt": attempt.expires_at, "remainingSeconds": remaining_seconds(attempt), "totalQuestions": attempt.total_questions}
    if attempt.status == "IN_PROGRESS":
        data["questions"] = safe_questions_payload(db, attempt)
    else:
        data["resultAvailable"] = True
    return data

@router.get("/attempts/{attempt_id}/questions")
def questions(attempt_id: str, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    attempt = get_attempt_for_student(db, student, attempt_id)
    return {"attemptId": attempt.id, "status": attempt.status, "remainingSeconds": remaining_seconds(attempt), "questions": safe_questions_payload(db, attempt) if attempt.status == "IN_PROGRESS" else []}

@router.post("/attempts/{attempt_id}/answers")
def answer(attempt_id: str, payload: SaveAnswerRequest, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    return save_answer(db, student, attempt_id, payload.questionId, payload.selectedOptionId)

@router.post("/attempts/{attempt_id}/submit")
def submit(attempt_id: str, payload: SubmitRequest, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    attempt = get_attempt_for_student(db, student, attempt_id)
    attempt = submit_attempt(db, attempt, auto=False)
    NotifyPracticeAttemptSubmitted(db, attempt_id=attempt.id)
    RetryAssignment = latest_retry_assignment_for_attempt(db, attempt)
    if RetryAssignment is not None:
        NotifyPracticeAssignmentsCreated(
            db,
            assignment_ids=[RetryAssignment.id],
            actor_user_id=RetryAssignment.assigned_by_user_id,
        )
    db.commit()
    return result_payload(db, attempt, include_review=True)

@router.post("/attempts/{attempt_id}/auto-submit")
def auto_submit(attempt_id: str, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    attempt = get_attempt_for_student(db, student, attempt_id)
    attempt = submit_attempt(db, attempt, auto=True)
    NotifyPracticeAttemptSubmitted(db, attempt_id=attempt.id)
    RetryAssignment = latest_retry_assignment_for_attempt(db, attempt)
    if RetryAssignment is not None:
        NotifyPracticeAssignmentsCreated(
            db,
            assignment_ids=[RetryAssignment.id],
            actor_user_id=RetryAssignment.assigned_by_user_id,
        )
    db.commit()
    return result_payload(db, attempt, include_review=True)

@router.get("/attempts/{attempt_id}/result")
def result(attempt_id: str, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    attempt = get_attempt_for_student(db, student, attempt_id)
    return result_payload(db, attempt, include_review=True)



@router.get("/assessment-assignments/{assignment_id}")
def student_assessment_assignment(assignment_id: str, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    return StudentAssessmentStartPayload(db, student, assignment_id)


@router.post("/assessment-assignments/{assignment_id}/start")
def start_assessment_assignment(assignment_id: str, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    Attempt = StartAssessmentAttempt(db, student, assignment_id)
    return AssessmentAttemptPayload(db, Attempt)


@router.get("/assessment-attempts/{attempt_id}")
def resume_assessment_attempt(attempt_id: str, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    Attempt = GetAssessmentAttemptForStudent(db, student, attempt_id)
    return AssessmentAttemptPayload(db, Attempt)


@router.post("/assessment-attempts/{attempt_id}/answers")
def save_assessment_attempt_answer(attempt_id: str, payload: SaveAssessmentAnswerRequest, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    return SaveAssessmentAnswer(db, student, attempt_id, payload.questionId, payload.selectedOptionId)


@router.post("/assessment-attempts/{attempt_id}/submit")
def submit_assessment_attempt(attempt_id: str, payload: SubmitRequest, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    Attempt = SubmitAssessmentAttempt(db, student, attempt_id, Auto=False)
    NotifyAssessmentAttemptSubmitted(db, attempt_id=Attempt.id)
    db.commit()
    return AssessmentResultPayload(db, Attempt, IncludeReview=True)


@router.post("/assessment-attempts/{attempt_id}/auto-submit")
def auto_submit_assessment_attempt(attempt_id: str, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    Attempt = SubmitAssessmentAttempt(db, student, attempt_id, Auto=True)
    NotifyAssessmentAttemptSubmitted(db, attempt_id=Attempt.id)
    db.commit()
    return AssessmentResultPayload(db, Attempt, IncludeReview=True)


@router.get("/assessment-attempts/{attempt_id}/result")
def assessment_attempt_result(attempt_id: str, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    Attempt = GetAssessmentAttemptForStudent(db, student, attempt_id)
    return AssessmentResultPayload(db, Attempt, IncludeReview=True)


@router.get("/assessment-attempts/{attempt_id}/remarks")
def student_get_assessment_attempt_remark(attempt_id: str, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    Attempt = GetAssessmentAttemptForStudent(db, student, attempt_id)
    return {"teacherFeedback": assessment_feedback_payload(db, active_assessment_remark(db, Attempt.id))}


@router.get("/assessment-eligibility")
def student_assessment_eligibility(db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    return assessment_eligibility_payload(db, student, student.current_level_id)


@router.get("/assessment-readiness")
def student_assessment_readiness(db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    return assessment_eligibility_payload(db, student, student.current_level_id)
