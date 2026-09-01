from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from sqlalchemy import func
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends

from app.core.config import TEMPORARY_ASSESSMENT_READINESS_BYPASS, ASSESSMENT_READINESS_GATE_MODE, ASSESSMENT_READINESS_GATE_LABEL, ASSESSMENT_TESTING_OVERRIDE_ENABLED, ASSESSMENT_TESTING_OVERRIDE_LABEL
from app.core.errors import api_error
from app.database import get_db
from app.dependencies import get_current_teacher
from app.models import Assignment, Attempt, DPS, Lesson, Level, Module, Student, Teacher, User, AssignmentReattemptPermission, AssessmentBlueprint, AssessmentVersion, AssessmentAssignment, AssessmentAttempt, AssessmentReattemptApproval, StudentLevelPromotion, AssessmentReadinessTestingOverride, CompetitionMockAssignment, CompetitionMockExam, CompetitionMockAttempt, CompetitionMockResultSummary
from app.services.assignment_service import create_assignment
from app.services import leaderboard_service
from app.services.attempt_chain_service import ATTEMPT_SOURCE_MANUAL_RETRY
from app.services.manual_intervention_service import BuildManualInterventionQueue, BuildManualRetryAssignment, MANUAL_INTERVENTION_STATUS
from app.services.attempt_service import result_payload
from app.services.reattempt_operational_service import CountNeedsReattemptConcepts, NeedsReattemptAttempts
from app.services.assessment_eligibility_service import assessment_eligibility_payload, eligibility_for_students
from app.services.assessment_blueprint_service import blueprint_payload, teacher_visible_blueprints
from app.services.assessment_engine_service import AvailablePublishedVersions, AssessmentVersionOptionPayload, ExistingAssessmentAssignmentForLevel, AssessmentAssignmentPayload, AssessmentResultPayload, AssessmentProgressionPayload, StudentLevelPromotionPayload
from app.services.assessment_notification_service import NotifyAssessmentAssignmentsCreated
from app.services.practice_notification_service import NotifyPracticeAssignmentsCreated
from app.services.lesson_progress_service import (
    active_reattempt_permission_for_teacher,
    student_has_completed_dps,
    ComputeLessonProgressByLevelGroups,
    ComputeLessonProgressForStudents,
)
from app.services.competition_mock_attempt_service import GetCompetitionMockResultForTeacher
from app.services.route_harmonization_service import EmptyTeacherAssignmentOptionsResponse, EmptyTeacherDpsOptionsResponse
from app.services.assessment_feedback_service import upsert_assessment_remark, assessment_feedback_payload, active_assessment_remark
from app.services.auth_service import public_profile_photo_url
import json

router = APIRouter(prefix="/api/teacher", tags=["teacher"])


class TeacherAssignRequest(BaseModel):
    dpsId: str
    studentIds: list[str]
    title: str | None = None
    instructions: str | None = None
    allowReattempt: bool = False


class TeacherBulkAssignRequest(BaseModel):
    lessonId: str
    studentIds: list[str]
    instructions: str | None = None


class ScheduleItem(BaseModel):
    dpsId: str
    date: str  # "YYYY-MM-DD", interpreted as IST (the school's local day)


class TeacherScheduleAssignRequest(BaseModel):
    lessonId: str
    studentIds: list[str]
    scheduleItems: list[ScheduleItem]
    instructions: str | None = None


class TeacherAssignAssessmentRequest(BaseModel):
    assessmentVersionId: str
    studentIds: list[str]
    instructions: str | None = None


class AssessmentRemarkRequest(BaseModel):
    remarkText: str

BENCHMARK_PERCENTAGE = 70.0

COMPETITION_COMPLETED_STATUSES = {"SUBMITTED", "AUTO_SUBMITTED", "COMPLETED", "EXPIRED", "LOCKED"}


def _competition_json(value, fallback):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except Exception:
        return fallback


def _competition_iso(value):
    return value.isoformat() if value else None


def _competition_duration_text(seconds):
    if seconds is None:
        return "-"
    try:
        total = max(0, int(seconds))
    except Exception:
        return "-"
    minutes = total // 60
    secs = total % 60
    if minutes and secs:
        return f"{minutes} Min{'s' if minutes != 1 else ''} {secs} Sec{'s' if secs != 1 else ''}"
    if minutes:
        return f"{minutes} Min{'s' if minutes != 1 else ''}"
    return f"{secs} Sec{'s' if secs != 1 else ''}"


def _teacher_competition_row_payload(db: Session, assignment: CompetitionMockAssignment):
    exam = db.get(CompetitionMockExam, assignment.mock_exam_id)
    student = db.get(Student, assignment.student_id)
    if not exam or not student:
        return None
    user = db.get(User, student.user_id) if student.user_id else None
    module = db.get(Module, exam.module_id) if exam.module_id else None
    level = db.get(Level, exam.level_id) if exam.level_id else None
    latest_attempt = (
        db.query(CompetitionMockAttempt)
        .filter(CompetitionMockAttempt.mock_assignment_id == assignment.id)
        .order_by(CompetitionMockAttempt.attempt_number.desc(), CompetitionMockAttempt.started_at.desc())
        .first()
    )
    result_summary = None
    if latest_attempt:
        result_summary = (
            db.query(CompetitionMockResultSummary)
            .filter(CompetitionMockResultSummary.mock_attempt_id == latest_attempt.id)
            .first()
        )

    display_status = assignment.status or "ASSIGNED"
    if latest_attempt and latest_attempt.status == "IN_PROGRESS":
        display_status = "IN_PROGRESS"
    elif latest_attempt and latest_attempt.status in COMPETITION_COMPLETED_STATUSES:
        display_status = "COMPLETED"

    section_performance = _competition_json(result_summary.concept_performance_json if result_summary else None, [])
    strengths = _competition_json(result_summary.concept_strengths_json if result_summary else None, [])
    weak_areas = _competition_json(result_summary.concept_weaknesses_json if result_summary else None, [])

    return {
        "assignmentId": assignment.id,
        "mockExamId": exam.id,
        "attemptId": latest_attempt.id if latest_attempt else None,
        "status": display_status,
        "assignmentStatus": assignment.status,
        "attemptStatus": latest_attempt.status if latest_attempt else None,
        "assignedAt": _competition_iso(assignment.assigned_at),
        "dueAt": _competition_iso(assignment.due_at),
        "submittedAt": _competition_iso(latest_attempt.submitted_at) if latest_attempt else None,
        "student": {
            "studentId": student.id,
            "studentCode": student.student_code,
            "studentName": user.full_name if user else student.student_code,
            "className": student.class_name,
            "section": student.section,
        },
        "mockExam": {
            "title": exam.title,
            "mockCode": exam.mock_code,
            "moduleCode": module.module_code if module else None,
            "levelCode": level.level_code if level else None,
            "totalQuestions": exam.total_questions,
            "totalMarks": exam.total_marks,
            "marksPerQuestion": exam.marks_per_question,
            "durationSeconds": exam.duration_seconds,
        },
        "score": result_summary.score if result_summary else (latest_attempt.total_score if latest_attempt else None),
        "maxScore": result_summary.max_score if result_summary else (latest_attempt.max_score if latest_attempt else None),
        "percentage": result_summary.percentage if result_summary else (latest_attempt.percentage if latest_attempt else None),
        "accuracyPercentage": result_summary.accuracy_percentage if result_summary else None,
        "correctCount": latest_attempt.correct_count if latest_attempt else None,
        "wrongCount": latest_attempt.wrong_count if latest_attempt else None,
        "unansweredCount": latest_attempt.unanswered_count if latest_attempt else None,
        "timeTakenSeconds": result_summary.time_taken_seconds if result_summary else (latest_attempt.time_taken_seconds if latest_attempt else None),
        "timeTakenText": _competition_duration_text(result_summary.time_taken_seconds if result_summary else (latest_attempt.time_taken_seconds if latest_attempt else None)),
        "timeUtilizationPercentage": result_summary.time_utilization_percentage if result_summary else (latest_attempt.time_utilization_percentage if latest_attempt else None),
        "performanceBand": result_summary.performance_band if result_summary else (latest_attempt.performance_band if latest_attempt else None),
        "sectionPerformance": section_performance,
        "strengths": strengths,
        "weakAreas": weak_areas,
    }


def _teacher_competition_tracker_payload(db: Session, teacher: Teacher):
    students = own_students_query(db, teacher).filter(Student.is_active == True).all()
    student_ids = [student.id for student in students]
    if not student_ids:
        return {
            "summary": {
                "assignedCount": 0,
                "completedCount": 0,
                "pendingCount": 0,
                "inProgressCount": 0,
                "averageScore": 0,
                "averageAccuracy": 0,
                "averageTimeTakenSeconds": None,
            },
            "rows": [],
        }

    assignments = (
        db.query(CompetitionMockAssignment)
        .join(CompetitionMockExam, CompetitionMockAssignment.mock_exam_id == CompetitionMockExam.id)
        .filter(
            CompetitionMockAssignment.student_id.in_(student_ids),
            CompetitionMockAssignment.is_active == True,
            CompetitionMockExam.is_active == True,
            CompetitionMockExam.status != "ARCHIVED",
        )
        .order_by(CompetitionMockAssignment.assigned_at.desc())
        .limit(500)
        .all()
    )
    rows = [row for row in (_teacher_competition_row_payload(db, assignment) for assignment in assignments) if row]
    completed = [row for row in rows if row.get("status") == "COMPLETED"]
    pending = [row for row in rows if row.get("status") in {"ASSIGNED", "PENDING"}]
    in_progress = [row for row in rows if row.get("status") == "IN_PROGRESS"]
    avg_score = round(sum(float(row.get("percentage") or 0) for row in completed) / len(completed)) if completed else 0
    avg_accuracy = round(sum(float(row.get("accuracyPercentage") or 0) for row in completed) / len(completed)) if completed else 0
    time_values = [int(row.get("timeTakenSeconds") or 0) for row in completed if row.get("timeTakenSeconds") is not None]
    avg_time = round(sum(time_values) / len(time_values)) if time_values else None
    return {
        "summary": {
            "assignedCount": len(rows),
            "completedCount": len(completed),
            "pendingCount": len(pending),
            "inProgressCount": len(in_progress),
            "averageScore": avg_score,
            "averageAccuracy": avg_accuracy,
            "averageTimeTakenSeconds": avg_time,
            "averageTimeTakenText": _competition_duration_text(avg_time),
        },
        "rows": rows,
    }


def benchmark_payload_for_attempt(attempt) -> dict:
    if not attempt or attempt.accuracy_percentage is None:
        return {
            "benchmarkPercentage": BENCHMARK_PERCENTAGE,
            "benchmarkStatus": "PENDING",
            "requiresAttention": False,
            "benchmarkMessage": "Benchmark will be calculated after submission.",
        }
    below = float(attempt.accuracy_percentage or 0) < BENCHMARK_PERCENTAGE
    return {
        "benchmarkPercentage": BENCHMARK_PERCENTAGE,
        "benchmarkStatus": "BELOW_BENCHMARK" if below else "PASS",
        "requiresAttention": below,
        "benchmarkMessage": (
            "Caution: This student scored below the minimum benchmark of 70%. Please review mistakes and provide corrective guidance."
            if below
            else "Meets the minimum benchmark of 70%."
        ),
    }


def teacher_user(db: Session, teacher: Teacher) -> User:
    user = db.get(User, teacher.user_id)
    if not user:
        api_error(404, "NOT_FOUND", "Teacher user not found.")
    return user


def own_students_query(db: Session, teacher: Teacher):
    user = db.get(User, teacher.user_id)
    teacher_name = user.full_name if user else ""
    if hasattr(Student, "teacher_id"):
        return db.query(Student).filter(
            (Student.teacher_id == teacher.id) | (Student.teacher == teacher_name)
        )
    return db.query(Student).filter(Student.teacher == teacher_name)



@router.get("/competition/mock-tracker")
def teacher_competition_mock_tracker(db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    return _teacher_competition_tracker_payload(db, teacher)


@router.get("/competition/mock-attempts/{attempt_id}/result")
def teacher_get_competition_mock_result(attempt_id: str, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    return GetCompetitionMockResultForTeacher(db, teacher, attempt_id)


@router.get("/dashboard")
def teacher_dashboard(db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    students = own_students_query(db, teacher).all()
    student_ids = [student.id for student in students]

    if not student_ids:
        return {
            "studentCount": 0,
            "activeStudentCount": 0,
            "assignmentCount": 0,
            "completedAttemptCount": 0,
            "averageAccuracy": 0,
        }

    active_student_count = sum(1 for student in students if getattr(student, "is_active", True))

    assignments = db.query(Assignment).filter(Assignment.is_active == True).all()
    relevant_assignment_ids = []

    for assignment in assignments:
        if assignment.assigned_to_type == "STUDENT" and assignment.assigned_to_id in student_ids:
            relevant_assignment_ids.append(assignment.id)
        elif assignment.assigned_to_type == "LEVEL":
            if any(student.current_level_id == assignment.assigned_to_id for student in students):
                relevant_assignment_ids.append(assignment.id)

    completed_attempts_query = db.query(Attempt).filter(
        Attempt.student_id.in_(student_ids),
        Attempt.status.in_(["SUBMITTED", "AUTO_SUBMITTED", "COMPLETED"]),
    )

    completed_attempt_count = completed_attempts_query.count()
    avg_accuracy = completed_attempts_query.with_entities(func.avg(Attempt.accuracy_percentage)).scalar()

    return {
        "studentCount": len(students),
        "activeStudentCount": active_student_count,
        "assignmentCount": len(set(relevant_assignment_ids)),
        "completedAttemptCount": completed_attempt_count,
        "averageAccuracy": round(float(avg_accuracy or 0)),
    }



def attempt_score(attempt: Attempt) -> float:
    return float(getattr(attempt, "score", getattr(attempt, "total_score", 0)) or 0)


def attempt_total_marks(attempt: Attempt) -> float:
    return float(getattr(attempt, "total_marks", getattr(attempt, "max_score", 0)) or 0)


def attempt_accuracy(attempt: Attempt) -> float:
    explicit = getattr(attempt, "accuracy", None)
    if explicit is not None:
        return float(explicit or 0)

    stored = getattr(attempt, "accuracy_percentage", None)
    if stored is not None:
        return float(stored or 0)

    total = attempt_total_marks(attempt)
    if total <= 0:
        return 0

    return round((attempt_score(attempt) / total) * 100)


def student_payload(db: Session, student: Student, lesson_progress: dict | None = None) -> dict:
    lesson_progress = lesson_progress or {}
    user = db.get(User, student.user_id)
    module = db.get(Module, student.current_module_id) if student.current_module_id else None
    level = db.get(Level, student.current_level_id) if student.current_level_id else None

    # Assignment visibility for this student includes:
    # 1) assignments directly assigned to the student
    # 2) level assignments matching the student's current level
    direct_assignments = (
        db.query(Assignment)
        .filter(
            Assignment.assigned_to_type == "STUDENT",
            Assignment.assigned_to_id == student.id,
            Assignment.is_active == True,
        )
        .all()
    )
    level_assignments = (
        db.query(Assignment)
        .filter(
            Assignment.assigned_to_type == "LEVEL",
            Assignment.assigned_to_id == student.current_level_id,
            Assignment.is_active == True,
        )
        .all()
        if student.current_level_id
        else []
    )

    assignments_by_id = {}
    for assignment in direct_assignments + level_assignments:
        assignments_by_id[assignment.id] = assignment
    visible_assignments = list(assignments_by_id.values())

    attempts = db.query(Attempt).filter(Attempt.student_id == student.id).all()
    completed_statuses = ["SUBMITTED", "AUTO_SUBMITTED", "COMPLETED"]
    completed_attempts = [a for a in attempts if a.status in completed_statuses]
    latest = sorted(
        completed_attempts,
        key=lambda a: a.submitted_at or a.started_at,
        reverse=True,
    )[0] if completed_attempts else None

    latest_attempt_by_assignment: dict[str, Attempt] = {}
    for attempt in sorted(attempts, key=lambda a: a.started_at or a.created_at, reverse=True):
        if attempt.assignment_id and attempt.assignment_id not in latest_attempt_by_assignment:
            latest_attempt_by_assignment[attempt.assignment_id] = attempt

    completed_assignment_count = 0
    pending_assignment_count = 0
    in_progress_assignment_count = 0

    for assignment in visible_assignments:
        latest_for_assignment = latest_attempt_by_assignment.get(assignment.id)
        if not latest_for_assignment:
            pending_assignment_count += 1
        elif latest_for_assignment.status in completed_statuses:
            completed_assignment_count += 1
        else:
            in_progress_assignment_count += 1

    accuracy_values = [attempt_accuracy(a) for a in completed_attempts]
    average_accuracy = round(sum(accuracy_values) / len(accuracy_values)) if accuracy_values else None
    below_benchmark_attempts = NeedsReattemptAttempts(completed_attempts, BENCHMARK_PERCENTAGE)

    latest_activity_at = None
    if latest:
        latest_activity_at = latest.submitted_at or latest.started_at

    if not visible_assignments:
        attention = "NO_ASSIGNMENT"
    elif pending_assignment_count > 0 or in_progress_assignment_count > 0:
        attention = "NEEDS_FOLLOW_UP"
    elif average_accuracy is None:
        attention = "NO_ATTEMPT_YET"
    elif below_benchmark_attempts:
        attention = "BELOW_BENCHMARK"
    elif average_accuracy < 80:
        attention = "NEEDS_PRACTICE"
    else:
        attention = "ON_TRACK"

    return {
        "studentId": student.id,
        "userId": student.user_id,
        "studentName": user.full_name if user else "",
        "studentCode": student.student_code,
        "customId": student.custom_id,
        "className": student.class_name,
        "section": student.section,
        "schoolName": student.school_name,
        "photoUrl": public_profile_photo_url(user, student.photo_url or (user.photo_url if user else None)) if user else student.photo_url,
        "profilePhotoUrl": public_profile_photo_url(user, student.photo_url or (user.photo_url if user else None)) if user else student.photo_url,
        "currentModuleId": student.current_module_id,
        "currentLevelId": student.current_level_id,
        "currentModuleCode": module.module_code if module else None,
        "currentLevelCode": level.level_code if level else None,
        "isActive": student.is_active,
        "status": "ACTIVE" if student.is_active else "INACTIVE",
        "assignedAssignments": len(visible_assignments),
        "completedAssignments": completed_assignment_count,
        "pendingAssignments": pending_assignment_count,
        "inProgressAssignments": in_progress_assignment_count,
        "completedAttempts": len(completed_attempts),
        "belowBenchmarkAttempts": CountNeedsReattemptConcepts(completed_attempts, BENCHMARK_PERCENTAGE),
        "requiresAttention": bool(below_benchmark_attempts),
        "benchmarkPercentage": BENCHMARK_PERCENTAGE,
        "latestScore": attempt_score(latest) if latest else None,
        "latestAccuracy": attempt_accuracy(latest) if latest else None,
        "averageAccuracy": average_accuracy,
        "latestActivityAt": latest_activity_at.isoformat() if latest_activity_at else None,
        "attention": attention,
        "currentLessonId": lesson_progress.get("currentLessonId"),
        "currentLessonNumber": lesson_progress.get("currentLessonNumber"),
        "currentLessonTitle": lesson_progress.get("currentLessonTitle"),
        "clearedInCurrentLesson": lesson_progress.get("clearedInCurrentLesson", 0),
        "totalInCurrentLesson": lesson_progress.get("totalInCurrentLesson", 0),
        "assignableInCurrentLesson": lesson_progress.get("assignableInCurrentLesson", False),
        "levelComplete": lesson_progress.get("levelComplete", False),
        "previousLessonNumber": lesson_progress.get("previousLessonNumber"),
        "previousLessonTitle": lesson_progress.get("previousLessonTitle"),
    }


def dps_payload(db: Session, dps: DPS) -> dict:
    lesson = db.get(Lesson, dps.lesson_id)
    level = db.get(Level, lesson.level_id) if lesson else None
    module = db.get(Module, level.module_id) if level else None
    required_dps_count = teacher_level_total_dps_count(db, level.id if level else None)
    return {
        "dpsId": dps.id,
        "dpsNumber": dps.dps_number,
        "dpsTitle": dps.dps_title,
        "questionCount": dps.default_question_count,
        "durationSeconds": dps.default_duration_seconds,
        "lessonId": lesson.id if lesson else None,
        "lessonNumber": lesson.lesson_number if lesson else None,
        "lessonTitle": lesson.lesson_title if lesson else None,
        "levelId": level.id if level else None,
        "levelCode": level.level_code if level else None,
        "levelName": level.level_name if level else None,
        "requiredDpsCount": required_dps_count,
        "requiredDPSCount": required_dps_count,
        "totalDpsCount": required_dps_count,
        "totalDPSCount": required_dps_count,
        "levelDpsCount": required_dps_count,
        "levelDPSCount": required_dps_count,
        "moduleId": module.id if module else None,
        "moduleCode": module.module_code if module else None,
        "moduleName": module.module_name if module else None,
        "publicationStatus": getattr(dps, "publication_status", "DRAFT") or "DRAFT",
    }



def ensure_teacher_attempt_access(db: Session, teacher: Teacher, attempt_id: str) -> Attempt:
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        api_error(404, "NOT_FOUND", "Attempt not found.")

    own_student = own_students_query(db, teacher).filter(Student.id == attempt.student_id).first()
    if not own_student:
        api_error(403, "FORBIDDEN", "You can review attempts only for your own students.")

    return attempt


def attempt_payload(db: Session, attempt: Attempt) -> dict:
    assignment = db.get(Assignment, attempt.assignment_id)
    student = db.get(Student, attempt.student_id)
    student_user = db.get(User, student.user_id) if student else None
    dps = db.get(DPS, assignment.dps_id) if assignment else None
    dps_data = dps_payload(db, dps) if dps else {}
    return {
        "attemptId": attempt.id,
        "assignmentId": assignment.id if assignment else None,
        "studentId": student.id if student else None,
        "studentName": student_user.full_name if student_user else "-",
        "studentCode": student.student_code if student else "-",
        "title": assignment.title if assignment else "-",
        "status": attempt.status,
        "score": attempt_score(attempt),
        "totalMarks": attempt_total_marks(attempt),
        "accuracy": attempt_accuracy(attempt),
        "correctCount": attempt.correct_count,
        "wrongCount": attempt.wrong_count,
        "unansweredCount": attempt.unanswered_count,
        "timeTakenSeconds": attempt.time_taken_seconds,
        **benchmark_payload_for_attempt(attempt),
        "startedAt": attempt.started_at.isoformat() if attempt.started_at else None,
        "submittedAt": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        "attemptDate": attempt.started_at.isoformat() if attempt.started_at else None,
        "completedDate": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        **dps_data,
    }



@router.get("/notifications")
def teacher_notifications(db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    students = own_students_query(db, teacher).all()
    student_ids = [student.id for student in students]
    if not student_ids:
        return {"notifications": []}

    student_by_id = {student.id: student for student in students}
    notifications = []

    attempts = (
        db.query(Attempt)
        .filter(Attempt.student_id.in_(student_ids), Attempt.status.in_(["SUBMITTED", "AUTO_SUBMITTED", "COMPLETED"]))
        .order_by(Attempt.submitted_at.desc().nullslast())
        .limit(25)
        .all()
    )

    for attempt in attempts:
        student = student_by_id.get(attempt.student_id) or db.get(Student, attempt.student_id)
        student_user = db.get(User, student.user_id) if student else None
        assignment = db.get(Assignment, attempt.assignment_id) if attempt.assignment_id else None
        accuracy = float(attempt.accuracy_percentage or 0)

        if accuracy < 70:
            tone = "danger"
            title = "Student needs support"
            message = f"{student_user.full_name if student_user else 'A student'} scored {accuracy:g}% below the 70% benchmark. Review mistakes and guide the student."
        elif accuracy >= 90:
            tone = "success"
            title = "Excellent student performance"
            message = f"{student_user.full_name if student_user else 'A student'} scored {accuracy:g}%. Encourage continued excellence."
        else:
            tone = "warning"
            title = "Good progress"
            message = f"{student_user.full_name if student_user else 'A student'} scored {accuracy:g}%. Motivate the student to reach 90%+."

        notifications.append({
            "id": f"teacher-attempt-{attempt.id}",
            "title": title,
            "message": message,
            "tone": tone,
            "targetUrl": f"/teacher/results/{attempt.id}",
            "createdAt": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
            "assignmentType": assignment.assignment_type if assignment else None,
        })

    assignments = db.query(Assignment).filter(Assignment.is_active == True).order_by(Assignment.created_at.desc()).limit(30).all()

    for assignment in assignments:
        if assignment.assigned_to_type == "STUDENT":
            target_students = [student_by_id[assignment.assigned_to_id]] if assignment.assigned_to_id in student_by_id else []
        elif assignment.assigned_to_type == "LEVEL":
            target_students = [student for student in students if student.current_level_id == assignment.assigned_to_id]
        else:
            target_students = []

        if not target_students:
            continue

        pending_count = 0
        for student in target_students:
            latest = latest_attempt_for_assignment(db, assignment.id, student.id)
            if not latest or latest.status not in ["SUBMITTED", "AUTO_SUBMITTED", "COMPLETED"]:
                pending_count += 1

        if pending_count:
            notifications.append({
                "id": f"teacher-assignment-{assignment.id}-pending-{pending_count}",
                "title": f"{pending_count} student(s) pending",
                "message": f"{assignment.title} is still pending for {pending_count} of your student(s).",
                "tone": "info",
                "targetUrl": "/teacher/assessments" if assignment.assignment_type == "ASSESSMENT" else "/teacher/assignment-tracker",
                "createdAt": assignment.created_at.isoformat() if assignment.created_at else None,
                "assignmentType": assignment.assignment_type,
            })

    notifications = sorted(notifications, key=lambda item: item.get("createdAt") or "", reverse=True)
    return {"notifications": notifications[:30]}


@router.get("/students")
def teacher_students(db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    students = own_students_query(db, teacher).order_by(Student.student_code.asc()).all()
    lesson_progress_by_student = ComputeLessonProgressByLevelGroups(db, students)
    return {
        "students": [
            student_payload(db, student, lesson_progress_by_student.get(student.id))
            for student in students
        ]
    }


@router.get("/available-dps")
def available_dps(
    moduleId: str | None = None,
    levelId: str | None = None,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    students = own_students_query(db, teacher).filter(Student.is_active == True).all()
    ScopedStudents = [
        StudentItem for StudentItem in students
        if (not moduleId or StudentItem.current_module_id == moduleId)
        and (not levelId or StudentItem.current_level_id == levelId)
    ]
    level_ids = sorted({StudentItem.current_level_id for StudentItem in ScopedStudents if StudentItem.current_level_id})
    if not level_ids:
        return EmptyTeacherDpsOptionsResponse(moduleId, levelId)

    levels = db.query(Level).filter(Level.id.in_(level_ids)).all()
    lessons = db.query(Lesson).filter(Lesson.level_id.in_(level_ids)).order_by(Lesson.lesson_number.asc()).all()
    lesson_ids = [lesson.id for lesson in lessons]
    dps_rows = (
        db.query(DPS)
        .join(Lesson, DPS.lesson_id == Lesson.id)
        .filter(
            DPS.lesson_id.in_(lesson_ids),
            DPS.publication_status == "PUBLISHED",
        )
        .order_by(Lesson.lesson_number.asc(), DPS.dps_number.asc())
        .all()
        if lesson_ids
        else []
    )

    LevelPayloads = [
        {
            "levelId": level.id,
            "levelCode": level.level_code,
            "levelName": level.level_name,
            "studentCount": len([StudentItem for StudentItem in ScopedStudents if StudentItem.current_level_id == level.id]),
        }
        for level in levels
    ]
    DpsPayloads = [dps_payload(db, dps) for dps in dps_rows]
    LessonProgressByStudent = ComputeLessonProgressByLevelGroups(db, ScopedStudents)
    StudentPayloads = [
        student_payload(db, StudentItem, LessonProgressByStudent.get(StudentItem.id))
        for StudentItem in ScopedStudents
    ]

    return {
        "summary": {
            "levels": len(LevelPayloads),
            "dps": len(DpsPayloads),
            "students": len(StudentPayloads),
            "assignableStudents": len(StudentPayloads),
        },
        "levels": LevelPayloads,
        "dps": DpsPayloads,
        "students": StudentPayloads,
        "routeStatus": "OK",
        "filters": {"moduleId": moduleId, "levelId": levelId},
    }


@router.get("/assign-dps/options")
def teacher_assign_dps_options(
    moduleId: str | None = None,
    levelId: str | None = None,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    return available_dps(moduleId=moduleId, levelId=levelId, db=db, teacher=teacher)


@router.get("/assignments/options")
def teacher_assignment_options(
    moduleId: str | None = None,
    levelId: str | None = None,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    return available_dps(moduleId=moduleId, levelId=levelId, db=db, teacher=teacher)


# active_reattempt_permission_for_teacher() and student_has_completed_dps()
# now live in app.services.lesson_progress_service (imported above) so the
# same duplicate-block predicate can be shared with the lesson-progress
# "assignable" computation without risking the two drifting apart.


def assign_single_dps_to_students(
    db: Session,
    *,
    dps: DPS,
    teacher: Teacher,
    students: list[Student],
    title: str,
    instructions: str | None,
    start_time: datetime | None = None,
) -> tuple[list[Assignment], list[str]]:
    """Core per-student assignment loop for one DPS, shared by the
    single-sheet /assignments route and the bulk /assignments/lesson route
    below -- duplicate-assignment blocking and reattempt handling must stay
    byte-for-byte identical between the two, not two copies that can drift.
    """
    created: list[Assignment] = []
    blocked_students: list[str] = []

    for student in students:
        existing_assignment = (
            db.query(Assignment)
            .filter(
                Assignment.dps_id == dps.id,
                Assignment.assigned_to_type == "STUDENT",
                Assignment.assigned_to_id == student.id,
                Assignment.is_active == True,
            )
            .order_by(Assignment.created_at.desc())
            .first()
        )

        reattempt_permission = active_reattempt_permission_for_teacher(db, student.id, dps.id)
        if existing_assignment or student_has_completed_dps(db, student.id, dps.id):
            if not reattempt_permission:
                user = db.get(User, student.user_id)
                blocked_students.append(user.full_name if user else student.student_code)
                continue

            source_attempt = db.get(Attempt, reattempt_permission.attempt_id) if hasattr(reattempt_permission, "attempt_id") else None
            if not source_attempt:
                source_attempt = (
                    db.query(Attempt)
                    .filter(Attempt.student_id == student.id, Attempt.dps_id == dps.id, Attempt.status.in_(["SUBMITTED", "AUTO_SUBMITTED", "COMPLETED"]))
                    .order_by(Attempt.attempt_number.desc(), Attempt.started_at.desc())
                    .first()
                )
            if not source_attempt:
                user = db.get(User, student.user_id)
                blocked_students.append(user.full_name if user else student.student_code)
                continue

            assignment = BuildManualRetryAssignment(
                db,
                StudentItem=student,
                SourceAttempt=source_attempt,
                AssignedByUserId=teacher.user_id,
                Title=title,
                Instructions=instructions,
            )
            reattempt_permission.status = "USED"
            reattempt_permission.used_at = datetime.now(timezone.utc)
            reattempt_permission.used_assignment_id = assignment.id
            created.append(assignment)
            continue

        assignment = create_assignment(
            db,
            assignment_type="PRACTICE",
            dps_id=dps.id,
            assigned_by_user_id=teacher.user_id,
            assigned_to_type="STUDENT",
            assigned_to_id=student.id,
            title=title,
            instructions=instructions or "Complete this practice within the given time.",
            allow_reattempt=False,
            start_time=start_time,
        )
        created.append(assignment)

    return created, blocked_students


@router.post("/assignments")
def assign_dps_to_students(
    payload: TeacherAssignRequest,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    if not payload.studentIds:
        api_error(400, "VALIDATION_ERROR", "Select at least one student.")

    dps = db.get(DPS, payload.dpsId)
    if not dps:
        api_error(404, "NOT_FOUND", "DPS not found.")
    if (getattr(dps, "publication_status", "DRAFT") or "DRAFT") != "PUBLISHED":
        api_error(403, "DPS_NOT_PUBLISHED", "This DPS has not been published by Admin yet.")
    lesson = db.get(Lesson, dps.lesson_id)
    level = db.get(Level, lesson.level_id) if lesson else None
    if not level:
        api_error(404, "NOT_FOUND", "DPS level not found.")

    own_students = own_students_query(db, teacher).filter(Student.id.in_(payload.studentIds)).all()
    if len(own_students) != len(set(payload.studentIds)):
        api_error(403, "FORBIDDEN", "You can assign DPS only to your own students.")

    invalid_students = [student for student in own_students if student.current_level_id != level.id]
    if invalid_students:
        names = []
        for student in invalid_students:
            user = db.get(User, student.user_id)
            names.append(user.full_name if user else student.student_code)
        api_error(400, "LEVEL_MISMATCH", f"DPS can only be assigned to students in {level.level_code}. Mismatch: {', '.join(names)}")

    title = payload.title or f"{level.level_code} Lesson {lesson.lesson_number} - DPS {dps.dps_number} Practice"
    created, blocked_students = assign_single_dps_to_students(
        db,
        dps=dps,
        teacher=teacher,
        students=own_students,
        title=title,
        instructions=payload.instructions,
    )

    if blocked_students and not created:
        api_error(
            409,
            "DUPLICATE_ASSIGNMENT_BLOCKED",
            "This DPS has already been assigned to: "
            + ", ".join(blocked_students)
            + ". Admin can unlock the existing assignment for a reattempt if needed.",
        )

    NotifyPracticeAssignmentsCreated(db, assignment_ids=[assignment.id for assignment in created], actor_user_id=teacher.user_id)
    db.commit()
    message = f"Assigned DPS to {len(created)} student(s)."
    if blocked_students:
        message += " Skipped already-assigned student(s): " + ", ".join(blocked_students) + "."

    return {
        "created": True,
        "message": message,
        "assignmentIds": [assignment.id for assignment in created],
    }


@router.post("/assignments/lesson")
def assign_lesson_dps_to_students(
    payload: TeacherBulkAssignRequest,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    """Assign every PUBLISHED DPS sheet under one lesson to the same set of
    students in one call -- the "Assign All Sheets" bulk action. Reuses
    assign_single_dps_to_students() per sheet so duplicate/reattempt
    handling matches the single-sheet route exactly; the only new behavior
    is looping over the lesson's sheets and aggregating the results.
    """
    if not payload.studentIds:
        api_error(400, "VALIDATION_ERROR", "Select at least one student.")

    lesson = db.get(Lesson, payload.lessonId)
    if not lesson:
        api_error(404, "NOT_FOUND", "Lesson not found.")
    level = db.get(Level, lesson.level_id)
    if not level:
        api_error(404, "NOT_FOUND", "Lesson level not found.")

    all_lesson_dps = (
        db.query(DPS)
        .filter(DPS.lesson_id == lesson.id, DPS.is_active == True)
        .order_by(DPS.dps_number.asc())
        .all()
    )
    publishable_dps = [dps for dps in all_lesson_dps if (getattr(dps, "publication_status", "DRAFT") or "DRAFT") == "PUBLISHED"]
    if not publishable_dps:
        api_error(403, "DPS_NOT_PUBLISHED", "No published DPS sheets are available for this lesson yet.")

    own_students = own_students_query(db, teacher).filter(Student.id.in_(payload.studentIds)).all()
    if len(own_students) != len(set(payload.studentIds)):
        api_error(403, "FORBIDDEN", "You can assign DPS only to your own students.")

    invalid_students = [student for student in own_students if student.current_level_id != level.id]
    if invalid_students:
        names = []
        for student in invalid_students:
            user = db.get(User, student.user_id)
            names.append(user.full_name if user else student.student_code)
        api_error(400, "LEVEL_MISMATCH", f"DPS can only be assigned to students in {level.level_code}. Mismatch: {', '.join(names)}")

    all_created: list[Assignment] = []
    blocked_pairs: list[str] = []

    for dps in publishable_dps:
        title = f"{level.level_code} Lesson {lesson.lesson_number} - DPS {dps.dps_number} Practice"
        created, blocked_students = assign_single_dps_to_students(
            db,
            dps=dps,
            teacher=teacher,
            students=own_students,
            title=title,
            instructions=payload.instructions,
        )
        all_created.extend(created)
        blocked_pairs.extend(f"DPS {dps.dps_number} – {name}" for name in blocked_students)

    if not all_created and blocked_pairs:
        api_error(
            409,
            "DUPLICATE_ASSIGNMENT_BLOCKED",
            "Every sheet in this lesson is already assigned to the selected student(s). "
            "Admin can unlock existing assignments for a reattempt if needed.",
        )

    NotifyPracticeAssignmentsCreated(db, assignment_ids=[assignment.id for assignment in all_created], actor_user_id=teacher.user_id)
    db.commit()

    sheet_count = len(publishable_dps)
    total_dps_count = len(all_lesson_dps)
    message = f"Assigned {sheet_count} sheet(s) to {len(own_students)} student(s)."
    if sheet_count < total_dps_count:
        message += f" {total_dps_count - sheet_count} sheet(s) in this lesson aren't published yet and were skipped."
    if blocked_pairs:
        message += f" Skipped {len(blocked_pairs)} already-assigned combination(s)."

    return {
        "created": True,
        "message": message,
        "assignmentIds": [assignment.id for assignment in all_created],
        "sheetsAssigned": sheet_count,
        "totalSheetsInLesson": total_dps_count,
        "studentsAssigned": len(own_students),
    }


IST = timezone(timedelta(hours=5, minutes=30))


def _ScheduleDateToStartTimeUtc(date_str: str) -> datetime:
    """Interpret a teacher-picked 'YYYY-MM-DD' date as IST midnight (the
    start of that school day in India Standard Time), then convert to UTC
    for storage -- Assignment.start_time is always stored/compared in UTC
    (see validate_assignment_access() in assignment_service.py). Raises
    ValueError on a malformed date string; callers turn that into a 400.
    """
    naive = datetime.strptime(date_str, "%Y-%m-%d")
    ist_midnight = naive.replace(tzinfo=IST)
    return ist_midnight.astimezone(timezone.utc)


def _IsWeekendInIst(start_time_utc: datetime) -> bool:
    """Saturday/Sunday check against the IST calendar day, since the
    program's weekly rhythm (weekday practice, weekend classes) is defined
    in the school's local time, not server UTC."""
    ist_moment = start_time_utc.astimezone(IST)
    return ist_moment.weekday() >= 5  # Monday=0 ... Saturday=5, Sunday=6


@router.post("/assignments/schedule")
def schedule_lesson_dps_to_students(
    payload: TeacherScheduleAssignRequest,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    """Assign several specific DPS sheets from one lesson to the same
    student(s) in a single call, each sheet unlocking on its own
    teacher-chosen date -- the weekly Mon-Fri practice scheduler, so a
    teacher can line up a whole week (or a whole batch's week) at once
    instead of logging in daily to assign one sheet at a time.

    Fans out to assign_single_dps_to_students() once per (sheet, date)
    pair -- the exact same shared per-student loop the single-sheet and
    "Assign All Sheets" routes above use -- so duplicate-assignment
    blocking and reattempt handling stay identical, not a second copy that
    can drift. The only new behavior is threading a per-item start_time
    through, and collecting soft (non-blocking) weekend warnings.
    """
    if not payload.studentIds:
        api_error(400, "VALIDATION_ERROR", "Select at least one student.")
    if not payload.scheduleItems:
        api_error(400, "VALIDATION_ERROR", "Schedule at least one sheet.")

    lesson = db.get(Lesson, payload.lessonId)
    if not lesson:
        api_error(404, "NOT_FOUND", "Lesson not found.")
    level = db.get(Level, lesson.level_id)
    if not level:
        api_error(404, "NOT_FOUND", "Lesson level not found.")

    own_students = own_students_query(db, teacher).filter(Student.id.in_(payload.studentIds)).all()
    if len(own_students) != len(set(payload.studentIds)):
        api_error(403, "FORBIDDEN", "You can assign DPS only to your own students.")

    invalid_students = [student for student in own_students if student.current_level_id != level.id]
    if invalid_students:
        names = []
        for student in invalid_students:
            user = db.get(User, student.user_id)
            names.append(user.full_name if user else student.student_code)
        api_error(400, "LEVEL_MISMATCH", f"DPS can only be assigned to students in {level.level_code}. Mismatch: {', '.join(names)}")

    scheduled_pairs: list[tuple[DPS, datetime]] = []
    warnings: list[str] = []
    for item in payload.scheduleItems:
        dps = db.get(DPS, item.dpsId)
        if not dps or dps.lesson_id != lesson.id:
            api_error(400, "VALIDATION_ERROR", "One of the scheduled sheets does not belong to this lesson.")
        if (getattr(dps, "publication_status", "DRAFT") or "DRAFT") != "PUBLISHED":
            api_error(403, "DPS_NOT_PUBLISHED", f"DPS {dps.dps_number} has not been published by Admin yet.")
        try:
            start_time = _ScheduleDateToStartTimeUtc(item.date)
        except ValueError:
            api_error(400, "VALIDATION_ERROR", f"'{item.date}' is not a valid date (expected YYYY-MM-DD).")
        if _IsWeekendInIst(start_time):
            warnings.append(f"DPS {dps.dps_number} is scheduled on {item.date}, which falls on a weekend.")
        scheduled_pairs.append((dps, start_time))

    all_created: list[Assignment] = []
    blocked_pairs: list[str] = []

    for dps, start_time in scheduled_pairs:
        day_label = start_time.astimezone(IST).strftime("%a, %d %b")
        title = f"{level.level_code} Lesson {lesson.lesson_number} - DPS {dps.dps_number} Practice ({day_label})"
        created, blocked_students = assign_single_dps_to_students(
            db,
            dps=dps,
            teacher=teacher,
            students=own_students,
            title=title,
            instructions=payload.instructions,
            start_time=start_time,
        )
        all_created.extend(created)
        blocked_pairs.extend(f"DPS {dps.dps_number} - {name}" for name in blocked_students)

    if not all_created and blocked_pairs:
        api_error(
            409,
            "DUPLICATE_ASSIGNMENT_BLOCKED",
            "Every scheduled sheet is already assigned to the selected student(s). "
            "Admin can unlock existing assignments for a reattempt if needed.",
        )

    # Only notify for sheets that unlock immediately (today or earlier) --
    # notifying a student about a sheet that is still locked for days would
    # be confusing (a "go do it now" ping for something they can't open
    # yet). There is no scheduled-job infrastructure in this codebase to
    # fire a notification exactly when a future start_time arrives, and
    # building one is out of scope for this feature -- the sheet simply
    # appears in the student's practice list on its own day instead.
    now_utc = datetime.now(timezone.utc)
    immediate_assignment_ids = [
        assignment.id for assignment in all_created
        if not assignment.start_time or assignment.start_time <= now_utc
    ]
    if immediate_assignment_ids:
        NotifyPracticeAssignmentsCreated(db, assignment_ids=immediate_assignment_ids, actor_user_id=teacher.user_id)
    db.commit()

    message = f"Scheduled {len(payload.scheduleItems)} sheet(s) to {len(own_students)} student(s)."
    if blocked_pairs:
        message += f" Skipped {len(blocked_pairs)} already-assigned combination(s)."

    return {
        "created": True,
        "message": message,
        "assignmentIds": [assignment.id for assignment in all_created],
        "warnings": warnings,
        "studentsAssigned": len(own_students),
    }



def teacher_level_total_dps_count(db: Session, level_id: str | None) -> int:
    if not level_id:
        return 0
    return (
        db.query(DPS)
        .join(Lesson, DPS.lesson_id == Lesson.id)
        .filter(Lesson.level_id == level_id)
        .count()
    )


def assignment_dps_context(db: Session, assignment: Assignment) -> dict:
    dps = db.get(DPS, assignment.dps_id)
    lesson = db.get(Lesson, dps.lesson_id) if dps else None
    level = db.get(Level, lesson.level_id) if lesson else None
    module = db.get(Module, level.module_id) if level else None
    required_dps_count = teacher_level_total_dps_count(db, level.id if level else None)

    return {
        "dpsId": dps.id if dps else None,
        "dpsNumber": dps.dps_number if dps else None,
        "dpsTitle": dps.dps_title if dps else None,
        "lessonId": lesson.id if lesson else None,
        "lessonNumber": lesson.lesson_number if lesson else None,
        "lessonTitle": lesson.lesson_title if lesson else None,
        "levelId": level.id if level else None,
        "levelCode": level.level_code if level else None,
        "levelName": level.level_name if level else None,
        "requiredDpsCount": required_dps_count,
        "requiredDPSCount": required_dps_count,
        "totalDpsCount": required_dps_count,
        "totalDPSCount": required_dps_count,
        "levelDpsCount": required_dps_count,
        "levelDPSCount": required_dps_count,
        "moduleId": module.id if module else None,
        "moduleCode": module.module_code if module else None,
        "moduleName": module.module_name if module else None,
    }


def active_reattempt_permission_for_assignment(db: Session, assignment_id: str, student_id: str):
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


def latest_attempt_for_assignment(db: Session, assignment_id: str, student_id: str) -> Attempt | None:
    return (
        db.query(Attempt)
        .filter(Attempt.assignment_id == assignment_id, Attempt.student_id == student_id)
        .order_by(Attempt.started_at.desc())
        .first()
    )




def all_attempts_for_assignment_student(db: Session, assignment_id: str, student_id: str) -> list[Attempt]:
    return (
        db.query(Attempt)
        .filter(Attempt.assignment_id == assignment_id, Attempt.student_id == student_id)
        .order_by(Attempt.attempt_number.asc().nullslast(), Attempt.started_at.asc().nullslast(), Attempt.submitted_at.asc().nullslast(), Attempt.id.asc())
        .all()
    )


def attempt_history_for_assignment_student(db: Session, assignment: Assignment, student: Student, dps_context: dict | None = None) -> list[dict]:
    Context = dps_context or assignment_dps_context(db, assignment)
    Attempts = all_attempts_for_assignment_student(db, assignment.id, student.id)
    History = []
    for Index, AttemptRow in enumerate(Attempts, start=1):
        SequenceNumber = tracker_attempt_sequence_number(AttemptRow, Index)
        History.append({
            "assignmentId": assignment.id,
            "assignmentTitle": assignment.title,
            "assignmentType": assignment.assignment_type,
            "studentId": student.id,
            "studentCode": student.student_code,
            "className": student.class_name,
            "section": student.section,
            "attemptId": AttemptRow.id,
            "attemptStatus": AttemptRow.status,
            "status": tracker_attempt_status(AttemptRow, None),
            "attemptNumber": SequenceNumber,
            "attemptSequence": SequenceNumber,
            "attemptLabel": f"Re-Attempt {SequenceNumber - 1}" if SequenceNumber > 1 else "Original",
            "isReattempt": SequenceNumber > 1,
            "score": attempt_score(AttemptRow),
            "totalMarks": attempt_total_marks(AttemptRow),
            "accuracy": attempt_accuracy(AttemptRow),
            "correctCount": AttemptRow.correct_count,
            "wrongCount": AttemptRow.wrong_count,
            "unansweredCount": AttemptRow.unanswered_count,
            "timeTakenSeconds": AttemptRow.time_taken_seconds,
            **benchmark_payload_for_attempt(AttemptRow),
            **tracker_date_payload(AttemptRow),
            **Context,
        })
    return History

def tracker_attempt_status(attempt: Attempt | None, reattempt_permission: AssignmentReattemptPermission | None = None) -> str:
    if not attempt:
        return "PENDING"
    if bool(getattr(attempt, "requires_manual_intervention", False)) or str(getattr(attempt, "benchmark_status", "") or "").upper() == "MANUAL_INTERVENTION_REQUIRED":
        return MANUAL_INTERVENTION_STATUS
    if attempt.status in ["SUBMITTED", "AUTO_SUBMITTED", "COMPLETED"]:
        if reattempt_permission:
            return "REATTEMPT_AVAILABLE"
        return "COMPLETED"
    return "IN_PROGRESS"


def tracker_date_payload(attempt: Attempt | None) -> dict:
    if not attempt:
        return {
            "startedAt": None,
            "submittedAt": None,
            "attemptDate": None,
            "completedDate": None,
        }

    return {
        "startedAt": attempt.started_at.isoformat() if attempt.started_at else None,
        "submittedAt": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        "attemptDate": attempt.started_at.isoformat() if attempt.started_at else None,
        "completedDate": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
    }


def tracker_attempt_sequence_number(attempt: Attempt | None, fallback_index: int = 1) -> int:
    """Return display sequence: 1=Original, 2=Re-Attempt 1, 3=Re-Attempt 2."""
    if not attempt:
        return fallback_index
    StoredAttemptNumber = getattr(attempt, "attempt_number", None)
    if StoredAttemptNumber is not None:
        try:
            return int(StoredAttemptNumber or 0) + 1
        except (TypeError, ValueError):
            return fallback_index
    return fallback_index


@router.get("/assignment-tracker")
def teacher_assignment_tracker(db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    own_students = own_students_query(db, teacher).order_by(Student.student_code.asc()).all()
    if not own_students:
        return {
            "summary": {
                "assignedRows": 0,
                "completedRows": 0,
                "pendingRows": 0,
                "inProgressRows": 0,
                "reattemptAvailableRows": 0,
                "uniqueAssignments": 0,
            },
            "rows": [],
        }

    student_ids = [student.id for student in own_students]
    level_ids = sorted({student.current_level_id for student in own_students if student.current_level_id})
    students_by_id = {student.id: student for student in own_students}
    students_by_level: dict[str, list[Student]] = {}
    for student in own_students:
        if student.current_level_id:
            students_by_level.setdefault(student.current_level_id, []).append(student)

    student_specific_assignments = (
        db.query(Assignment)
        .filter(
            Assignment.assigned_to_type == "STUDENT",
            Assignment.assigned_to_id.in_(student_ids),
            Assignment.is_active == True,
        )
        .all()
        if student_ids
        else []
    )

    level_assignments = (
        db.query(Assignment)
        .filter(
            Assignment.assigned_to_type == "LEVEL",
            Assignment.assigned_to_id.in_(level_ids),
            Assignment.is_active == True,
        )
        .all()
        if level_ids
        else []
    )

    assignments = student_specific_assignments + level_assignments
    seen_assignment_ids = set()
    rows = []

    for assignment in assignments:
        seen_assignment_ids.add(assignment.id)
        creator = db.get(User, assignment.assigned_by_user_id) if assignment.assigned_by_user_id else None
        dps_context = assignment_dps_context(db, assignment)

        if assignment.assigned_to_type == "STUDENT":
            target_students = [students_by_id[assignment.assigned_to_id]] if assignment.assigned_to_id in students_by_id else []
        elif assignment.assigned_to_type == "LEVEL":
            target_students = students_by_level.get(assignment.assigned_to_id, [])
        else:
            target_students = []

        for student in target_students:
            student_user = db.get(User, student.user_id)
            attempt = latest_attempt_for_assignment(db, assignment.id, student.id)
            reattempt_permission = active_reattempt_permission_for_assignment(db, assignment.id, student.id)
            status = tracker_attempt_status(attempt, reattempt_permission)

            rows.append({
                "assignmentId": assignment.id,
                "assignmentTitle": assignment.title,
                "assignmentType": assignment.assignment_type,
                "assignedByName": creator.full_name if creator else "System",
                "assignedByRole": "TEACHER" if creator and creator.role == "TEACHER" else "ADMIN",
                "assignedToType": assignment.assigned_to_type,
                "studentId": student.id,
                "studentName": student_user.full_name if student_user else "-",
                "studentCode": student.student_code,
                "className": student.class_name,
                "section": student.section,
                "status": status,
                "attemptGroupId": assignment.attempt_group_id,
                "assignmentSource": assignment.assignment_source,
                "retryAttemptNumber": assignment.retry_attempt_number,
                "attemptNumber": int(assignment.retry_attempt_number or 0),
                "attemptLabel": f"Re-Attempt {assignment.retry_attempt_number}" if int(assignment.retry_attempt_number or 0) > 0 else "Original",
                "isReattempt": int(assignment.retry_attempt_number or 0) > 0,
                "attemptId": attempt.id if attempt else None,
                "attemptStatus": attempt.status if attempt else None,
                "score": attempt_score(attempt) if attempt else None,
                "totalMarks": attempt_total_marks(attempt) if attempt else None,
                "accuracy": attempt_accuracy(attempt) if attempt else None,
                "correctCount": attempt.correct_count if attempt else None,
                "wrongCount": attempt.wrong_count if attempt else None,
                "unansweredCount": attempt.unanswered_count if attempt else None,
                "timeTakenSeconds": attempt.time_taken_seconds if attempt else None,
                **benchmark_payload_for_attempt(attempt),
                "reattemptPermissionId": reattempt_permission.id if reattempt_permission else None,
                "reattemptStatus": "APPROVED" if reattempt_permission else "NONE",
                "reattemptAllowedAt": reattempt_permission.allowed_at.isoformat() if reattempt_permission and reattempt_permission.allowed_at else None,
                "createdAt": assignment.created_at.isoformat() if assignment.created_at else None,
                "attemptHistory": attempt_history_for_assignment_student(db, assignment, student, dps_context),
                **tracker_date_payload(attempt),
                **dps_context,
            })

    rows = sorted(
        rows,
        key=lambda row: (
            row.get("status") != "PENDING",
            row.get("levelCode") or "",
            row.get("lessonNumber") or 0,
            row.get("dpsNumber") or 0,
            row.get("studentName") or "",
        ),
    )

    return {
        "summary": {
            "assignedRows": len(rows),
            "completedRows": len([row for row in rows if row["status"] == "COMPLETED"]),
            "pendingRows": len([row for row in rows if row["status"] == "PENDING"]),
            "inProgressRows": len([row for row in rows if row["status"] == "IN_PROGRESS"]),
            "reattemptAvailableRows": len([row for row in rows if row["status"] == "REATTEMPT_AVAILABLE"]),
            "manualInterventionRows": len([row for row in rows if row["status"] == MANUAL_INTERVENTION_STATUS]),
            "uniqueAssignments": len(seen_assignment_ids),
        },
        "rows": rows,
    }





@router.get("/assessment-attempts/{attempt_id}/result")
def teacher_assessment_attempt_result_route(
    attempt_id: str,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    attempt = db.get(AssessmentAttempt, attempt_id)
    if not attempt:
        api_error(404, "ASSESSMENT_ATTEMPT_NOT_FOUND", "Assessment attempt not found.")
    own_student_ids = [student.id for student in own_students_query(db, teacher).all()]
    if attempt.student_id not in own_student_ids:
        api_error(404, "ASSESSMENT_ATTEMPT_NOT_FOUND", "Assessment attempt not found for this teacher.")
    return AssessmentResultPayload(db, attempt, IncludeReview=True)


@router.post("/assessment-attempts/{attempt_id}/remarks")
def teacher_save_assessment_attempt_remark(
    attempt_id: str,
    payload: AssessmentRemarkRequest,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    attempt = db.get(AssessmentAttempt, attempt_id)
    if not attempt:
        api_error(404, "ASSESSMENT_ATTEMPT_NOT_FOUND", "Assessment attempt not found.")
    own_student_ids = [student.id for student in own_students_query(db, teacher).all()]
    if attempt.student_id not in own_student_ids:
        api_error(404, "ASSESSMENT_ATTEMPT_NOT_FOUND", "Assessment attempt not found for this teacher.")
    user = teacher_user(db, teacher)
    remark = upsert_assessment_remark(db, attempt=attempt, actor=user, actor_role="TEACHER", remark_text=payload.remarkText)
    db.commit()
    db.refresh(remark)
    return {"teacherFeedback": assessment_feedback_payload(db, remark)}


@router.get("/assessment-attempts/{attempt_id}/remarks")
def teacher_get_assessment_attempt_remark(
    attempt_id: str,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    attempt = db.get(AssessmentAttempt, attempt_id)
    if not attempt:
        api_error(404, "ASSESSMENT_ATTEMPT_NOT_FOUND", "Assessment attempt not found.")
    own_student_ids = [student.id for student in own_students_query(db, teacher).all()]
    if attempt.student_id not in own_student_ids:
        api_error(404, "ASSESSMENT_ATTEMPT_NOT_FOUND", "Assessment attempt not found for this teacher.")
    return {"teacherFeedback": assessment_feedback_payload(db, active_assessment_remark(db, attempt.id))}


@router.get("/student-level-promotions")
def teacher_student_level_promotions_route(
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    own_students = own_students_query(db, teacher).all()
    student_ids = [student.id for student in own_students]
    if not student_ids:
        return {"items": [], "total": 0}

    promotions = (
        db.query(StudentLevelPromotion)
        .filter(StudentLevelPromotion.student_id.in_(student_ids))
        .order_by(
            StudentLevelPromotion.promoted_at.desc().nullslast(),
            StudentLevelPromotion.created_at.desc(),
        )
        .all()
    )
    items = [StudentLevelPromotionPayload(db, promotion) for promotion in promotions]
    return {"items": items, "total": len(items)}


@router.get("/assessments")
def teacher_assessments(db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    own_students = own_students_query(db, teacher).order_by(Student.student_code.asc()).all()
    if not own_students:
        return {
            "summary": {
                "assignedRows": 0,
                "completedRows": 0,
                "pendingRows": 0,
                "inProgressRows": 0,
                "reattemptAvailableRows": 0,
                "uniqueAssessments": 0,
            },
            "rows": [],
        }

    student_ids = [student.id for student in own_students]
    level_ids = sorted({student.current_level_id for student in own_students if student.current_level_id})
    students_by_id = {student.id: student for student in own_students}
    students_by_level: dict[str, list[Student]] = {}

    for student in own_students:
        if student.current_level_id:
            students_by_level.setdefault(student.current_level_id, []).append(student)

    student_assessments = (
        db.query(Assignment)
        .filter(
            Assignment.assignment_type == "ASSESSMENT",
            Assignment.assigned_to_type == "STUDENT",
            Assignment.assigned_to_id.in_(student_ids),
            Assignment.is_active == True,
        )
        .all()
        if student_ids
        else []
    )

    level_assessments = (
        db.query(Assignment)
        .filter(
            Assignment.assignment_type == "ASSESSMENT",
            Assignment.assigned_to_type == "LEVEL",
            Assignment.assigned_to_id.in_(level_ids),
            Assignment.is_active == True,
        )
        .all()
        if level_ids
        else []
    )

    assessments = student_assessments + level_assessments
    seen_assessment_ids = set()
    rows = []

    engine_assignments = (
        db.query(AssessmentAssignment)
        .filter(
            AssessmentAssignment.student_id.in_(student_ids),
            AssessmentAssignment.is_active == True,
        )
        .order_by(AssessmentAssignment.assigned_at.desc())
        .all()
        if student_ids
        else []
    )
    for EngineAssignment in engine_assignments:
        Payload = AssessmentAssignmentPayload(db, EngineAssignment)
        if Payload.get("studentId") in students_by_id:
            rows.append(Payload)
            seen_assessment_ids.add(EngineAssignment.id)

    for assessment in assessments:
        seen_assessment_ids.add(assessment.id)
        creator = db.get(User, assessment.assigned_by_user_id) if assessment.assigned_by_user_id else None
        dps_context = assignment_dps_context(db, assessment)

        if assessment.assigned_to_type == "STUDENT":
            target_students = [students_by_id[assessment.assigned_to_id]] if assessment.assigned_to_id in students_by_id else []
        elif assessment.assigned_to_type == "LEVEL":
            target_students = students_by_level.get(assessment.assigned_to_id, [])
        else:
            target_students = []

        for student in target_students:
            student_user = db.get(User, student.user_id)
            attempt = latest_attempt_for_assignment(db, assessment.id, student.id)
            reattempt_permission = active_reattempt_permission_for_assignment(db, assessment.id, student.id)
            status = tracker_attempt_status(attempt, reattempt_permission)

            rows.append({
                "assignmentId": assessment.id,
                "assessmentId": assessment.id,
                "assessmentTitle": assessment.title,
                "assignmentTitle": assessment.title,
                "assignmentType": assessment.assignment_type,
                "assignedByName": creator.full_name if creator else "Admin",
                "assignedByRole": "ADMIN",
                "assignedToType": assessment.assigned_to_type,
                "studentId": student.id,
                "studentName": student_user.full_name if student_user else "-",
                "studentCode": student.student_code,
                "className": student.class_name,
                "section": student.section,
                "status": status,
                "attemptId": attempt.id if attempt else None,
                "attemptStatus": attempt.status if attempt else None,
                "score": attempt_score(attempt) if attempt else None,
                "totalMarks": attempt_total_marks(attempt) if attempt else None,
                "accuracy": attempt_accuracy(attempt) if attempt else None,
                "correctCount": attempt.correct_count if attempt else None,
                "wrongCount": attempt.wrong_count if attempt else None,
                "unansweredCount": attempt.unanswered_count if attempt else None,
                "timeTakenSeconds": attempt.time_taken_seconds if attempt else None,
                **benchmark_payload_for_attempt(attempt),
                **AssessmentProgressionPayload(status, status == "COMPLETED"),
                "reattemptPermissionId": reattempt_permission.id if reattempt_permission else None,
                "reattemptStatus": "APPROVED" if reattempt_permission else "NONE",
                "reattemptAllowedAt": reattempt_permission.allowed_at.isoformat() if reattempt_permission and reattempt_permission.allowed_at else None,
                "createdAt": assessment.created_at.isoformat() if assessment.created_at else None,
                **tracker_date_payload(attempt),
                **dps_context,
            })

    rows = sorted(
        rows,
        key=lambda row: (
            row.get("status") != "PENDING",
            row.get("levelCode") or "",
            row.get("lessonNumber") or 0,
            row.get("dpsNumber") or 0,
            row.get("studentName") or "",
        ),
    )

    return {
        "summary": {
            "assignedRows": len(rows),
            "completedRows": len([row for row in rows if row["status"] == "COMPLETED"]),
            "pendingRows": len([row for row in rows if row["status"] == "PENDING"]),
            "inProgressRows": len([row for row in rows if row["status"] == "IN_PROGRESS"]),
            "reattemptAvailableRows": len([row for row in rows if row["status"] == "REATTEMPT_AVAILABLE"]),
            "uniqueAssessments": len(seen_assessment_ids),
        },
        "rows": rows,
    }




@router.get("/results")
def teacher_results(db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    students = own_students_query(db, teacher).all()
    student_ids = [student.id for student in students]
    if not student_ids:
        return {"attempts": []}

    attempts = (
        db.query(Attempt)
        .filter(Attempt.student_id.in_(student_ids))
        .order_by(Attempt.started_at.desc())
        .limit(200)
        .all()
    )
    return {"attempts": [attempt_payload(db, attempt) for attempt in attempts]}



@router.get("/attempts/{attempt_id}/result")
def teacher_attempt_result(
    attempt_id: str,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    attempt = ensure_teacher_attempt_access(db, teacher, attempt_id)
    student = db.get(Student, attempt.student_id)
    student_user = db.get(User, student.user_id) if student else None
    assignment = db.get(Assignment, attempt.assignment_id) if attempt.assignment_id else None
    dps = db.get(DPS, attempt.dps_id)
    dps_data = dps_payload(db, dps) if dps else {}

    payload = result_payload(db, attempt, include_review=True)
    payload.update(benchmark_payload_for_attempt(attempt))
    payload["startedAt"] = attempt.started_at.isoformat() if attempt.started_at else None
    payload["submittedAt"] = attempt.submitted_at.isoformat() if attempt.submitted_at else None
    payload["attemptDate"] = attempt.started_at.isoformat() if attempt.started_at else None
    payload["completedDate"] = attempt.submitted_at.isoformat() if attempt.submitted_at else None
    payload["student"] = {
        "studentId": student.id if student else None,
        "studentName": student_user.full_name if student_user else "-",
        "studentCode": student.student_code if student else "-",
        "className": student.class_name if student else None,
        "section": student.section if student else None,
    }
    payload["assignment"] = {
        "assignmentId": assignment.id if assignment else None,
        "title": assignment.title if assignment else None,
    }
    payload["dps"] = dps_data
    return payload



def TeacherAssessmentEligibilityResponse(levelId: str | None, db: Session, teacher: Teacher):
    students = own_students_query(db, teacher).filter(Student.is_active == True).all()
    rows = eligibility_for_students(db, students, levelId)
    if levelId and not rows:
        return EmptyAssessmentEligibilityResponse(levelId)
    ready = [row for row in rows if row.get("eligible")]
    return {
        "benchmarkPercentage": 70,
        "levelId": levelId,
        "totalStudents": len(rows),
        "readyCount": len(ready),
        "notReadyCount": len(rows) - len(ready),
        "rows": rows,
        "routeStatus": "OK",
    }


@router.get("/assessment-eligibility")
def teacher_assessment_eligibility(levelId: str | None = None, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    return TeacherAssessmentEligibilityResponse(levelId, db, teacher)


@router.get("/assessment-readiness")
def teacher_assessment_readiness(levelId: str | None = None, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    return TeacherAssessmentEligibilityResponse(levelId, db, teacher)


@router.get("/students/{student_id}/assessment-eligibility")
def teacher_student_assessment_eligibility(student_id: str, levelId: str | None = None, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    student = own_students_query(db, teacher).filter(Student.id == student_id).first()
    if not student:
        api_error(404, "NOT_FOUND", "Student not found under this teacher.")
    return assessment_eligibility_payload(db, student, levelId or student.current_level_id)



def ApprovedAssessmentReattemptAccessForLevel(db: Session, student_id: str, level_id: str) -> AssessmentReattemptApproval | None:
    if not level_id:
        return None
    return (
        db.query(AssessmentReattemptApproval)
        .join(AssessmentAssignment, AssessmentReattemptApproval.assessment_assignment_id == AssessmentAssignment.id)
        .join(AssessmentBlueprint, AssessmentAssignment.blueprint_id == AssessmentBlueprint.id)
        .filter(
            AssessmentReattemptApproval.student_id == student_id,
            AssessmentReattemptApproval.status == "APPROVED",
            AssessmentReattemptApproval.used_at.is_(None),
            AssessmentAssignment.is_active == True,
            AssessmentAssignment.status != "CANCELLED",
            AssessmentBlueprint.level_id == level_id,
        )
        .order_by(AssessmentReattemptApproval.approved_at.desc().nullslast(), AssessmentReattemptApproval.requested_at.desc())
        .first()
    )


def AssessmentRequiresReattempt(AssignmentRow: AssessmentAssignment | None) -> bool:
    return bool(AssignmentRow and AssignmentRow.status == "NEEDS_RE_ATTEMPT")


def ActiveAssessmentReadinessTestingOverrideForLevel(
    db: Session,
    student_id: str | None,
    level_id: str | None,
    module_id: str | None = None,
) -> AssessmentReadinessTestingOverride | None:
    if not ASSESSMENT_TESTING_OVERRIDE_ENABLED or not student_id or not level_id:
        return None
    QueryValue = db.query(AssessmentReadinessTestingOverride).filter(
        AssessmentReadinessTestingOverride.student_id == student_id,
        AssessmentReadinessTestingOverride.level_id == level_id,
        AssessmentReadinessTestingOverride.status == "ACTIVE",
    )
    if module_id:
        QueryValue = QueryValue.filter(
            (AssessmentReadinessTestingOverride.module_id == module_id)
            | (AssessmentReadinessTestingOverride.module_id.is_(None))
        )
    return QueryValue.order_by(AssessmentReadinessTestingOverride.enabled_at.desc()).first()


def AssessmentReadinessGateOpen(Eligibility: dict | None, Override: AssessmentReadinessTestingOverride | None = None) -> bool:
    return bool((Eligibility and Eligibility.get("eligible")) or Override or TEMPORARY_ASSESSMENT_READINESS_BYPASS)


def AssessmentAssignmentReadinessMode(Eligibility: dict | None, Override: AssessmentReadinessTestingOverride | None = None) -> str:
    if Eligibility and Eligibility.get("eligible"):
        return "READY"
    if Override:
        return "ADMIN_TESTING_OVERRIDE"
    if TEMPORARY_ASSESSMENT_READINESS_BYPASS:
        return "TEMPORARY_BYPASS"
    return "BLOCKED"


def AssessmentAssignmentReadinessMessage(Eligibility: dict | None, Override: AssessmentReadinessTestingOverride | None = None) -> str:
    if Eligibility and Eligibility.get("eligible"):
        return "Ready for original assessment assignment."
    if Override:
        return "Eligible By Admin Testing Override. Use only for testing or demo assignment."
    if TEMPORARY_ASSESSMENT_READINESS_BYPASS:
        return "Testing mode allows assessment assignment before readiness is complete."
    BaseMessage = Eligibility.get("message") if Eligibility else None
    return BaseMessage or "Assessment readiness is required before assignment. Ask Admin to enable Testing Override only for controlled testing."


def AssessmentGateModePayload(rows: list[dict]) -> dict:
    StrictMode = not TEMPORARY_ASSESSMENT_READINESS_BYPASS
    return {
        "strictReadinessMode": StrictMode,
        "assignmentGateMode": "STRICT_READINESS" if StrictMode else "GLOBAL_TESTING_BYPASS",
        "assignmentGateLabel": "Strict Readiness Gate" if StrictMode else "Testing Bypass Active",
        "blockedStudents": len([row for row in rows if not row.get("canAssign") and not row.get("alreadyAssigned") and not row.get("requiresReattempt")]),
        "strictBlockedStudents": len([row for row in rows if StrictMode and not row.get("canAssign") and not row.get("alreadyAssigned") and not row.get("requiresReattempt")]),
        "readyStudents": len([row for row in rows if row.get("readinessGateMode") == "READY"]),
        "overrideAssignableStudents": len([row for row in rows if row.get("readinessGateMode") == "ADMIN_TESTING_OVERRIDE" and row.get("canAssign")]),
        "temporaryBypassAssignableStudents": len([row for row in rows if row.get("readinessGateMode") == "TEMPORARY_BYPASS" and row.get("canAssign")]),
    }


@router.get("/available-assessments")
def teacher_available_assessments(
    moduleId: str | None = None,
    levelId: str | None = None,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    own_students = own_students_query(db, teacher).filter(Student.is_active == True).all()
    teacher_module_ids = {student.current_module_id for student in own_students if student.current_module_id}
    teacher_level_ids = {student.current_level_id for student in own_students if student.current_level_id}
    if moduleId and moduleId not in teacher_module_ids:
        api_error(403, "MODULE_NOT_ASSIGNED_TO_TEACHER", "This module is not assigned to your students.")
    if levelId and levelId not in teacher_level_ids:
        api_error(403, "LEVEL_NOT_ASSIGNED_TO_TEACHER", "This level is not assigned to your students.")

    versions = AvailablePublishedVersions(db, levelId)
    visible = []
    for Version in versions:
        Blueprint = db.get(AssessmentBlueprint, Version.blueprint_id)
        if Blueprint and Blueprint.level_id in teacher_level_ids and (not moduleId or Blueprint.module_id == moduleId):
            visible.append(AssessmentVersionOptionPayload(db, Version))

    return {"total": len(visible), "items": visible}


@router.get("/assign-assessment/options")
def teacher_assign_assessment_options(
    moduleId: str | None = None,
    levelId: str | None = None,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    own_students = own_students_query(db, teacher).filter(Student.is_active == True).order_by(Student.student_code.asc()).all()
    rows = []
    for StudentItem in own_students:
        if moduleId and StudentItem.current_module_id != moduleId:
            continue
        if levelId and StudentItem.current_level_id != levelId:
            continue
        Eligibility = assessment_eligibility_payload(db, StudentItem, StudentItem.current_level_id) if StudentItem.current_level_id else None
        ExistingAssignment = ExistingAssessmentAssignmentForLevel(db, StudentItem.id, StudentItem.current_level_id) if StudentItem.current_level_id else None
        ApprovedReattemptAccess = ApprovedAssessmentReattemptAccessForLevel(db, StudentItem.id, StudentItem.current_level_id) if StudentItem.current_level_id else None
        ReattemptNeeded = AssessmentRequiresReattempt(ExistingAssignment)
        ActiveTestingOverride = ActiveAssessmentReadinessTestingOverrideForLevel(
            db,
            StudentItem.id,
            StudentItem.current_level_id,
            StudentItem.current_module_id,
        ) if StudentItem.current_level_id else None
        ReadinessOpen = AssessmentReadinessGateOpen(Eligibility, ActiveTestingOverride)
        IsOriginalAssignable = bool(ReadinessOpen and not ExistingAssignment)
        IsReattemptAssignable = bool(ReattemptNeeded and ApprovedReattemptAccess)
        CanAssign = bool(IsOriginalAssignable or IsReattemptAssignable)
        ReadinessMode = AssessmentAssignmentReadinessMode(Eligibility, ActiveTestingOverride)
        rows.append({
            **(Eligibility or {
                "studentId": StudentItem.id,
                "studentName": (db.get(User, StudentItem.user_id).full_name if db.get(User, StudentItem.user_id) else ""),
                "studentCode": StudentItem.student_code,
                "className": StudentItem.class_name,
                "section": StudentItem.section,
                "levelId": StudentItem.current_level_id,
                "levelCode": None,
                "levelName": None,
                "moduleId": StudentItem.current_module_id,
                "moduleCode": None,
                "moduleName": None,
                "eligible": False,
                "status": "NO_LEVEL",
                "statusLabel": "No level assigned",
                "message": "No level is currently assigned to this student.",
                "requiredDpsCount": 0,
                "passedDpsCount": 0,
                "missingDpsCount": 0,
                "belowBenchmarkDpsCount": 0,
                "progressPercentage": 0,
            }),
            "alreadyAssigned": bool(ExistingAssignment),
            "existingAssessmentAssignmentId": ExistingAssignment.id if ExistingAssignment else None,
            "sourceAssessmentVersionId": ExistingAssignment.assessment_version_id if ExistingAssignment else None,
            "sourceAssessmentTitle": (db.get(AssessmentBlueprint, ExistingAssignment.blueprint_id).title if ExistingAssignment and db.get(AssessmentBlueprint, ExistingAssignment.blueprint_id) else None),
            "requiresReattempt": ReattemptNeeded,
            "approvedReattemptAccess": bool(ApprovedReattemptAccess),
            "approvedReattemptApprovalId": ApprovedReattemptAccess.id if ApprovedReattemptAccess else None,
            "reattemptApprovalStatus": ApprovedReattemptAccess.status if ApprovedReattemptAccess else ("PENDING_APPROVAL" if ReattemptNeeded else "NONE"),
            "reattemptNextAttemptNumber": ApprovedReattemptAccess.next_attempt_number if ApprovedReattemptAccess else None,
            "readinessBypassApplied": bool(TEMPORARY_ASSESSMENT_READINESS_BYPASS and Eligibility and not Eligibility.get("eligible") and not ActiveTestingOverride),
            "testingOverrideApplied": bool(ActiveTestingOverride and Eligibility and not Eligibility.get("eligible")),
            "testingOverrideId": ActiveTestingOverride.id if ActiveTestingOverride else None,
            "testingOverrideLabel": ASSESSMENT_TESTING_OVERRIDE_LABEL if ActiveTestingOverride else None,
            "readinessGateMode": ReadinessMode,
            "canAssign": CanAssign,
            "assignmentBlockReason": (
                "Admin-approved re-attempt access is available." if ExistingAssignment and ReattemptNeeded and ApprovedReattemptAccess else
                "Re-attempt requires Admin approval." if ReattemptNeeded else
                "Already assigned for this level." if ExistingAssignment else
                AssessmentAssignmentReadinessMessage(Eligibility, ActiveTestingOverride)
            ),
        })

    teacher_level_ids = {row.get("levelId") for row in rows if row.get("levelId")}
    versions = []
    for Version in AvailablePublishedVersions(db, levelId):
        Blueprint = db.get(AssessmentBlueprint, Version.blueprint_id)
        if Blueprint and Blueprint.level_id in teacher_level_ids and (not moduleId or Blueprint.module_id == moduleId):
            versions.append(AssessmentVersionOptionPayload(db, Version))

    if (moduleId or levelId) and not rows and not versions:
        EmptyPayload = EmptyTeacherAssignmentOptionsResponse(moduleId, levelId)
        EmptyPayload["summary"]["readinessBypassEnabled"] = TEMPORARY_ASSESSMENT_READINESS_BYPASS
        EmptyPayload["summary"]["testingOverrideEnabled"] = ASSESSMENT_TESTING_OVERRIDE_ENABLED
        EmptyPayload["summary"]["testingOverrideLabel"] = ASSESSMENT_TESTING_OVERRIDE_LABEL
        return EmptyPayload

    return {
        "summary": {
            "students": len(rows),
            "eligibleStudents": len([row for row in rows if row.get("eligible")]),
            "assignableStudents": len([row for row in rows if row.get("canAssign")]),
            "alreadyAssigned": len([row for row in rows if row.get("alreadyAssigned")]),
            "reattemptNeeded": len([row for row in rows if row.get("requiresReattempt")]),
            "availableAssessments": len(versions),
            "readinessBypassEnabled": TEMPORARY_ASSESSMENT_READINESS_BYPASS,
            "readinessGateMode": ASSESSMENT_READINESS_GATE_MODE,
            "readinessGateLabel": ASSESSMENT_READINESS_GATE_LABEL,
            "testingOverrideEnabled": ASSESSMENT_TESTING_OVERRIDE_ENABLED,
            "testingOverrideLabel": ASSESSMENT_TESTING_OVERRIDE_LABEL,
            "readinessBypassStudents": len([row for row in rows if row.get("readinessBypassApplied")]),
            "testingOverrideStudents": len([row for row in rows if row.get("testingOverrideApplied")]),
            **AssessmentGateModePayload(rows),
        },
        "students": rows,
        "availableAssessments": versions,
        "routeStatus": "OK",
        "filters": {"moduleId": moduleId, "levelId": levelId},
    }


@router.post("/assessment-assignments")
def teacher_assign_assessment(
    payload: TeacherAssignAssessmentRequest,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    if not payload.studentIds:
        api_error(400, "NO_STUDENTS_SELECTED", "Select at least one eligible student.")

    Version = db.get(AssessmentVersion, payload.assessmentVersionId)
    if not Version or Version.status != "PUBLISHED" or not Version.is_active:
        api_error(400, "ASSESSMENT_NOT_AVAILABLE", "Only available published assessments can be assigned.")

    Blueprint = db.get(AssessmentBlueprint, Version.blueprint_id)
    if not Blueprint or Blueprint.status != "PUBLISHED" or not Blueprint.is_active:
        api_error(400, "ASSESSMENT_NOT_AVAILABLE", "Only available published assessments can be assigned.")

    TeacherUser = teacher_user(db, teacher)
    CreatedAssignments = []
    Rejected = []

    for StudentId in payload.studentIds:
        StudentItem = own_students_query(db, teacher).filter(Student.id == StudentId, Student.is_active == True).first()
        if not StudentItem:
            Rejected.append({"studentId": StudentId, "reason": "Student is not assigned to this teacher."})
            continue
        if StudentItem.current_level_id != Blueprint.level_id:
            Rejected.append({"studentId": StudentId, "reason": "Assessment level does not match the student's current level."})
            continue
        Eligibility = assessment_eligibility_payload(db, StudentItem, Blueprint.level_id)
        ExistingAssignment = ExistingAssessmentAssignmentForLevel(db, StudentItem.id, Blueprint.level_id)
        ApprovedReattemptAccess = ApprovedAssessmentReattemptAccessForLevel(db, StudentItem.id, Blueprint.level_id)
        ReattemptNeeded = AssessmentRequiresReattempt(ExistingAssignment)
        ActiveTestingOverride = ActiveAssessmentReadinessTestingOverrideForLevel(
            db,
            StudentItem.id,
            Blueprint.level_id,
            Blueprint.module_id,
        )
        IsReattemptAssignment = bool(ExistingAssignment and ReattemptNeeded and ApprovedReattemptAccess)

        if ExistingAssignment and not ReattemptNeeded:
            Rejected.append({"studentId": StudentId, "reason": "One assessment version is already assigned for this level."})
            continue
        if ExistingAssignment and not ApprovedReattemptAccess:
            Rejected.append({"studentId": StudentId, "reason": "One assessment version is already assigned for this level. Re-attempt assignment requires Admin approval."})
            continue
        if not IsReattemptAssignment and not AssessmentReadinessGateOpen(Eligibility, ActiveTestingOverride):
            Rejected.append({"studentId": StudentId, "reason": AssessmentAssignmentReadinessMessage(Eligibility, ActiveTestingOverride)})
            continue

        if IsReattemptAssignment and ExistingAssignment and ExistingAssignment.assessment_version_id == Version.id:
            Rejected.append({"studentId": StudentId, "reason": "Different Assessment Version Required."})
            continue

        AssignmentRow = AssessmentAssignment(
            assessment_version_id=Version.id,
            blueprint_id=Blueprint.id,
            student_id=StudentItem.id,
            teacher_id=teacher.id,
            assigned_by_user_id=TeacherUser.id,
            status="ASSIGNED",
            assessment_assignment_type="RE_ATTEMPT" if IsReattemptAssignment else "ORIGINAL",
            source_assignment_id=ExistingAssignment.id if IsReattemptAssignment else None,
            reattempt_approval_id=ApprovedReattemptAccess.id if IsReattemptAssignment else None,
            current_attempt_number=0,
            max_attempts=1,
            instructions=payload.instructions,
            is_active=True,
        )
        db.add(AssignmentRow)
        db.flush()
        if ExistingAssignment and ApprovedReattemptAccess:
            ApprovedReattemptAccess.used_at = datetime.now(timezone.utc)
        if (not IsReattemptAssignment) and ActiveTestingOverride and Eligibility and not Eligibility.get("eligible"):
            if not ActiveTestingOverride.used_for_assessment_assignment_id:
                ActiveTestingOverride.used_for_assessment_assignment_id = AssignmentRow.id
                ActiveTestingOverride.used_at = datetime.now(timezone.utc)
        CreatedAssignments.append(AssignmentRow.id)

    if not CreatedAssignments:
        db.rollback()
        api_error(400, "ASSESSMENT_ASSIGNMENT_BLOCKED", "No assessment assignments were created.", {"rejected": Rejected})

    NotifyAssessmentAssignmentsCreated(db, assignment_ids=CreatedAssignments, actor_user_id=TeacherUser.id if TeacherUser else None)
    db.commit()
    return {
        "created": True,
        "message": f"Assessment assigned to {len(CreatedAssignments)} student(s).",
        "assignmentIds": CreatedAssignments,
        "rejected": Rejected,
    }


@router.get("/assessment-blueprints")
def teacher_list_published_assessment_blueprints(
    levelId: str | None = None,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    blueprints = teacher_visible_blueprints(db, teacher, levelId)
    return {
        "total": len(blueprints),
        "items": [blueprint_payload(db, blueprint) for blueprint in blueprints],
    }


@router.get("/assessment-blueprints/{blueprint_id}")
def teacher_get_published_assessment_blueprint(
    blueprint_id: str,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    visible = teacher_visible_blueprints(db, teacher, None)
    blueprint = next((item for item in visible if item.id == blueprint_id), None)
    if not blueprint:
        api_error(404, "ASSESSMENT_BLUEPRINT_NOT_FOUND", "Published assessment not found for your assigned students.")
    return blueprint_payload(db, blueprint)


@router.get("/assignment-tracker/manual-intervention-queue")
def teacher_manual_intervention_queue(db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    own_students = own_students_query(db, teacher).order_by(Student.student_code.asc()).all()
    student_ids = [student.id for student in own_students]
    rows = BuildManualInterventionQueue(db, StudentIds=student_ids, BenchmarkPercentage=BENCHMARK_PERCENTAGE)
    return {
        "summary": {
            "manualInterventionRows": len(rows),
            "uniqueStudents": len({row.get("studentId") for row in rows if row.get("studentId")}),
            "uniqueDps": len({row.get("dpsId") for row in rows if row.get("dpsId")}),
        },
        "rows": rows,
    }


# ============================================================================
# Teacher-facing Leaderboard nav (2026-09-01) -- new "Leaderboard" nav
# dropdown (DPS Leaderboard, Mock Leaderboard) so teachers can track how
# their students are doing across both, per Shailesh's explicit request.
# Shows the SAME full leaderboard every student sees (not scoped down to
# only the teacher's own students -- Shailesh's explicit choice), with the
# requesting teacher's own students flagged via isOwnStudent so the
# frontend can highlight them. Every ranking query is the exact same shared
# leaderboard_service.py the 4 student leaderboard endpoints use (see that
# file), so a teacher's view of a leaderboard and a student's view of the
# same leaderboard can never silently disagree.
# ============================================================================

@router.get("/competition/dps/hierarchy")
def teacher_dps_leaderboard_hierarchy(db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    """Hierarchy for the teacher DPS leaderboard pages -- every active
    Module/Level, platform-wide (mirrors the student get_dps_hierarchy() in
    routes_student.py; a teacher has no personal "current level" the way a
    student does, so currentModuleId/currentLevelId are always null and the
    frontend falls back to the first module/level, same as it already does
    for a student with no current level set)."""
    modules = db.query(Module).filter(Module.is_active == True).order_by(Module.display_order).all()  # noqa: E712
    levels = db.query(Level).filter(Level.is_active == True).order_by(Level.display_order).all()  # noqa: E712
    return {
        "modules": [{"id": m.id, "name": m.module_name, "code": m.module_code} for m in modules],
        "levels": [{"id": l.id, "moduleId": l.module_id, "name": l.level_name, "code": l.level_code} for l in levels],
        "currentModuleId": None,
        "currentLevelId": None,
    }


@router.get("/competition/dps/overall-leaderboard")
def teacher_dps_overall_leaderboard(module_id: str, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    """DPS 'Overall Journey' tab, teacher view -- same ranking as the
    student endpoint (leaderboard_service.rank_dps_overall_journey), with
    the teacher's own students flagged instead of a single "current
    student"."""
    leaderboard = leaderboard_service.rank_dps_overall_journey(db, module_id)
    own_student_ids = {s.id for s in own_students_query(db, teacher).all()}
    return leaderboard_service.wrap_for_teacher(leaderboard, own_student_ids)


@router.get("/competition/dps/specific-leaderboard")
def teacher_dps_specific_leaderboard(level_id: str, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    """DPS 'Specific Level' tab, teacher view."""
    leaderboard = leaderboard_service.rank_dps_specific_level(db, level_id)
    own_student_ids = {s.id for s in own_students_query(db, teacher).all()}
    return leaderboard_service.wrap_for_teacher(leaderboard, own_student_ids)


@router.get("/competition/mock/hierarchy")
def teacher_mock_leaderboard_hierarchy(db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    """Hierarchy for the teacher Mock leaderboard pages -- every active,
    non-archived exam platform-wide, not scoped to any one student's
    assignments the way the student get_competition_hierarchy() is (a
    teacher needs to be able to pick any exam to see how the whole class
    did on it, not just exams assigned to one particular student)."""
    modules = db.query(Module).filter(Module.is_active == True).order_by(Module.display_order).all()  # noqa: E712
    levels = db.query(Level).filter(Level.is_active == True).order_by(Level.display_order).all()  # noqa: E712
    exams = (
        db.query(CompetitionMockExam)
        .filter(CompetitionMockExam.is_active == True, CompetitionMockExam.status != "ARCHIVED")  # noqa: E712
        .order_by(CompetitionMockExam.title.asc())
        .all()
    )
    return {
        "modules": [{"id": m.id, "name": m.module_name, "code": m.module_code} for m in modules],
        "levels": [{"id": l.id, "moduleId": l.module_id, "name": l.level_name, "code": l.level_code} for l in levels],
        "exams": [{"id": e.id, "levelId": e.level_id, "moduleId": e.module_id, "title": e.title} for e in exams],
        "currentModuleId": None,
        "currentLevelId": None,
    }


@router.get("/competition/mock/cumulative-leaderboard")
def teacher_mock_cumulative_leaderboard(level_id: str, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    """Mock 'Overall Journey' (cumulative) tab, teacher view."""
    leaderboard = leaderboard_service.rank_mock_overall_journey(db, level_id)
    own_student_ids = {s.id for s in own_students_query(db, teacher).all()}
    return leaderboard_service.wrap_for_teacher(leaderboard, own_student_ids)


@router.get("/competition/mock/specific-leaderboard")
def teacher_mock_specific_leaderboard(exam_id: str, level_id: str, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    """Mock 'Specific Exam' tab, teacher view. `level_id` is required
    explicitly (unlike the student endpoint, which always implicitly used
    the requesting student's own current_level_id) since a teacher has no
    single current level of their own -- the frontend passes the exam's own
    level_id from the hierarchy response."""
    leaderboard = leaderboard_service.rank_mock_specific_exam(db, exam_id, level_id)
    own_student_ids = {s.id for s in own_students_query(db, teacher).all()}
    return leaderboard_service.wrap_for_teacher(leaderboard, own_student_ids)
