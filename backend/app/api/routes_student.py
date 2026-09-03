import re
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_student
from app.models import Student, DPS, Lesson, Level, Module, Attempt, Assignment, AssignmentReattemptPermission, AssessmentAssignment, StudentLevelPromotion
from app.services.assignment_service import get_student_assignments
from app.services import leaderboard_service
from app.services.practice_notification_service import NotifyMissedPracticeUnlocks
from app.services.curriculum_service import dps_config_payload
from app.services.attempt_service import start_attempt, get_attempt_for_student, safe_questions_payload, save_answer, submit_attempt, result_payload, remaining_seconds, _ComputeDpsMaxScore, attempt_context_payload
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
from app.services.reattempt_operational_service import AttemptConceptKey, AttemptSequenceValue
from app.services.assessment_feedback_service import assessment_feedback_payload, active_assessment_remark
from app.services.competition_mock_assignment_service import ListStudentCompetitionMockAssignments
from app.services.competition_mock_attempt_service import (
    ListStudentCompetitionMockAssignmentsForAttempt,
    StartCompetitionMockAttempt,
    GetCompetitionMockAttemptForStudent,
    SaveCompetitionMockAnswer,
    SubmitCompetitionMockAttemptForStudent,
    GetCompetitionMockResultForStudent,
    GetCompetitionMockProgressInsightsForStudent,
)
from app.services.student_activity_service import GetStudentActivityEventsInRange
from app.core.cache import cache_by_user_id
from app.core.errors import api_error

router = APIRouter(prefix="/api/student", tags=["student"])


def _AssignmentIsUnlocked(start_time: datetime | None, now_utc: datetime) -> bool:
    """True once `start_time` has arrived (or there is none at all, i.e. an
    immediate, non-scheduled assignment). Shared by GET /assignments and
    GET /results so a weekly-scheduled sheet's "not visible yet" status is
    judged identically by both -- these two endpoints disagreeing about the
    same student's state is exactly the class of bug found 2026-09-03
    (Shailesh: assigned sheets not showing up, "Assigned DPS" metric stuck
    at 0). start_time is always written in UTC (see
    _ScheduleDateToStartTimeUtc() in routes_teacher.py); a naive datetime
    coming back from the DB layer is treated as already being that same UTC
    instant rather than raising (offset-naive vs offset-aware comparisons
    otherwise crash this endpoint outright).
    """
    if not start_time:
        return True
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    return start_time <= now_utc

class StartAttemptRequest(BaseModel):
    assignmentId: str
    dpsId: str
    mode: str = "PRACTICE"

class SaveAnswerRequest(BaseModel):
    questionId: str
    # DPS questions are typed free-text answers, not MCQ picks -- see
    # OPEN_ISSUES.md 2026-08-03e. Defaults to "" so clearing the box and
    # letting auto-save fire is a valid (unanswered) save, not a 422.
    answerText: str = ""

class SubmitRequest(BaseModel):
    confirmSubmit: bool = True


class StartAssessmentRequest(BaseModel):
    assignmentId: str

class SaveAssessmentAnswerRequest(BaseModel):
    questionId: str
    selectedOptionId: str


class StartCompetitionMockRequest(BaseModel):
    assignmentId: str


class SaveCompetitionMockAnswerRequest(BaseModel):
    questionId: str
    selectedOptionId: str


class SubmitCompetitionMockRequest(BaseModel):
    confirmSubmit: bool = True


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

# NOTE: GET /notifications (a synthesized, on-the-fly notification list built
# from Assignment/Attempt rows) was removed here as part of the full
# student-portal audit -- confirmed no frontend code calls it. The real
# notification panel (NotificationsBell.tsx) has always used
# GET /api/notifications instead, which is backed by the actual Notification
# table every CreateNotification() call writes to. Keeping this parallel,
# unused implementation around risked a future engineer mistaking it for the
# source of truth.


@router.get("/competition/mock-assignments")
def student_competition_mock_assignments(db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    return {"assignments": ListStudentCompetitionMockAssignmentsForAttempt(db, student)}


@router.get("/competition/mock-assignments/{assignment_id}/instructions")
def student_competition_mock_instructions(assignment_id: str, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    from app.models.models import CompetitionMockAssignment, CompetitionMockExam, CompetitionMockQuestion
    from fastapi import HTTPException
    
    assignment = db.query(CompetitionMockAssignment).filter_by(id=assignment_id, student_id=student.id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Mock assignment not found.")
        
    exam = db.query(CompetitionMockExam).filter_by(id=assignment.mock_exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Mock exam not found.")
        
    questions = db.query(CompetitionMockQuestion).filter_by(mock_exam_id=exam.id).order_by(CompetitionMockQuestion.section_number, CompetitionMockQuestion.question_number).all()
    
    sections_map = {}
    for q in questions:
        sec_num = q.section_number or 1
        if sec_num not in sections_map:
            sections_map[sec_num] = {
                "sectionNumber": sec_num,
                "sectionTitle": q.section_title or "General Section",
                "conceptFamily": q.concept_family or "Mixed Concepts",
                "questionCount": 0
            }
        sections_map[sec_num]["questionCount"] += 1
        
    # Sort by the real (fixed) section number to preserve correct concept
    # order, then renumber sequentially for display. A section with 0
    # questions (a concept the student's assigned level hasn't covered yet)
    # never reaches sections_map at all, so without this step students would
    # see gaps like Section 1, 2, 3, 5, 7 instead of a clean 1-9. This is the
    # student-facing instructions preview only — it doesn't drive question
    # generation or attempt/answer logic, so renumbering here is safe.
    #
    # sectionNumber alone isn't enough: sectionTitle is a full string stored
    # at generation time (e.g. "Section 7 - Cubes and Cube Roots") with the
    # ORIGINAL number baked into the text itself, and that's the string the
    # page actually displays. So the embedded number has to be stripped and
    # rebuilt with the new display number too, or the title text still shows
    # the stale gap even though sectionNumber is correct underneath it.
    sections_list = []
    for display_number, k in enumerate(sorted(sections_map.keys()), start=1):
        section = sections_map[k]
        raw_title = section["sectionTitle"] or ""
        prefix_pattern = re.compile(rf"^section\s*{k}\s*[-–—:]\s*", re.IGNORECASE)
        clean_title = prefix_pattern.sub("", raw_title).strip()
        display_title = f"Section {display_number} - {clean_title}" if clean_title else f"Section {display_number}"
        sections_list.append({
            **section,
            "sectionNumber": display_number,
            "sectionTitle": display_title,
        })

    return {
        "assignmentId": assignment.id,
        "mockExamId": exam.id,
        "title": exam.title,
        "mockCode": exam.mock_code,
        "totalQuestions": exam.total_questions,
        "durationSeconds": exam.duration_seconds,
        "lessonNumber": "Mock",
        "dpsNumber": "Exam",
        "concept": {
            "sections": sections_list
        },
        "instructions": [
            "The exam is timed.",
            "Each question typically has 4 options.",
            "Choose the most appropriate answer.",
            "The exam will auto-submit when the time expires.",
            "Click Start Mock below when you are ready to begin."
        ]
    }


@router.post("/competition/mock-attempts/start")
def student_start_competition_mock_attempt(payload: StartCompetitionMockRequest, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    return StartCompetitionMockAttempt(db, student, payload.assignmentId)


@router.get("/competition/mock-attempts/{attempt_id}")
def student_get_competition_mock_attempt(attempt_id: str, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    return GetCompetitionMockAttemptForStudent(db, student, attempt_id)


@router.post("/competition/mock-attempts/{attempt_id}/answers")
def student_save_competition_mock_answer(attempt_id: str, payload: SaveCompetitionMockAnswerRequest, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    return SaveCompetitionMockAnswer(db, student, attempt_id, payload.questionId, payload.selectedOptionId)


@router.post("/competition/mock-attempts/{attempt_id}/submit")
def student_submit_competition_mock_attempt(attempt_id: str, payload: SubmitCompetitionMockRequest, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    return SubmitCompetitionMockAttemptForStudent(db, student, attempt_id, auto=False)


@router.post("/competition/mock-attempts/{attempt_id}/auto-submit")
def student_auto_submit_competition_mock_attempt(attempt_id: str, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    return SubmitCompetitionMockAttemptForStudent(db, student, attempt_id, auto=True)


@router.get("/competition/mock-attempts/{attempt_id}/result")
def student_get_competition_mock_result(attempt_id: str, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    return GetCompetitionMockResultForStudent(db, student, attempt_id)


@router.get("/competition/progress/insights")
def student_competition_progress_insights(db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    return GetCompetitionMockProgressInsightsForStudent(db, student)


@router.get("/assignments")
@cache_by_user_id()
def assignments(db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    # A weekly-scheduled DPS assignment (routes_teacher.py's
    # /assignments/schedule) is created with start_time set to a future
    # date, exactly like validate_assignment_access() in
    # assignment_service.py already gates at attempt-start time. Filtering
    # it here too means the sheet simply isn't in the list until its own
    # day arrives -- cumulative, not exclusive: once unlocked it stays
    # visible alongside every earlier day's sheet, it never disappears.
    now_utc = datetime.now(timezone.utc)
    # Defense-in-depth alongside the notifications-bell hooks in
    # routes_notifications.py: this endpoint is decorated with
    # @cache_by_user_id() (60s TTL), so this only actually runs on a
    # cache-miss, but it means a student who opens the practice list
    # directly (bypassing the bell) still gets caught up on any
    # weekly-scheduled sheet whose start_time has already arrived.
    NotifyMissedPracticeUnlocks(db, student)
    rows = [
        a for a in get_student_assignments(db, student)
        if a.assignment_type != "ASSESSMENT" and _AssignmentIsUnlocked(a.start_time, now_utc)
    ]
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
            "totalMarks": _ComputeDpsMaxScore(db, dps),
            "status": status,
            "attemptId": attempt_id,
            "reattemptAvailable": bool(reattempt_permission),
            "reattemptPermissionId": reattempt_permission.id if reattempt_permission else None,
            "availableFrom": a.start_time.isoformat() if a.start_time else None,
        })
    # Found 2026-09-02: this endpoint (and the frontend Practice tab consuming it)
    # never ordered the list at all -- it came back in whatever order the plain
    # `db.query(Assignment).filter(...).all()` in get_student_assignments()
    # happened to return, which is unspecified and does not track dps_number or
    # start_time. Live-confirmed on production: a student with all 5 DPS of one
    # lesson unlocked on the same day saw them as DPS 5, 3, 4, 1, 2. Sort here,
    # once, so every consumer (the Practice tab today, anything else built on this
    # endpoint later) gets the same correct order for free: earliest unlock date
    # first (an assignment with no start_time has always been immediately
    # available, so it sorts as earliest -- "" sorts before any ISO date string),
    # then lesson number, then DPS number ascending within the same date.
    payload.sort(key=lambda item: (item["availableFrom"] or "", item["lessonNumber"], item["dpsNumber"]))
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


@router.get("/activity/range")
def student_activity_range(start: str, end: str, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    """Backs the Grind Heatmap's month-browse view (2026-09-03, Shailesh).

    start/end are ISO 8601 timestamps for a half-open [start, end) window --
    the frontend computes these as the student's own local-calendar-month
    boundaries (see toLocalDateKey in the dashboard page) and passes them
    straight through; this endpoint does no month/year math of its own, see
    student_activity_service.py's module docstring for why that split
    matters. Returns the same normalized event shape the dashboard's weekly
    view already builds client-side from three unfiltered "fetch everything"
    endpoints, just scoped to this one range at the database level instead.
    """
    try:
        start_dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
        end_dt = datetime.fromisoformat(end.replace("Z", "+00:00"))
    except ValueError:
        api_error(400, "INVALID_ACTIVITY_RANGE", "start and end must be valid ISO 8601 timestamps.")
    if end_dt <= start_dt:
        api_error(400, "INVALID_ACTIVITY_RANGE", "end must be after start.")
    events = GetStudentActivityEventsInRange(db, student.id, start_dt, end_dt)
    return {"events": events}


@router.get("/results")
@cache_by_user_id()
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
            "expectedDurationSeconds": dps.default_duration_seconds if dps else None,
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

    # Same start_time gate /assignments applies (2026-09-03, Shailesh: the
    # "Assigned DPS" hero metric on the Practice tab must never disagree
    # with the actual practice list). Without this filter, a weekly-
    # scheduled sheet whose start_time is still in the future counted as
    # "assigned" here well before it ever appeared in /assignments -- the
    # two endpoints told two different stories about the same student.
    now_utc = datetime.now(timezone.utc)
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
    pending_assignments = [
        a for a in pending_assignments if _AssignmentIsUnlocked(a.start_time, now_utc)
    ]
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
            "maxScore": _ComputeDpsMaxScore(db, dps) if dps else None,
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
    sections = payload["sections"] or []
    primary_section = sections[0] if sections else {}
    question_count = payload["defaultQuestionCount"] or 0
    return {
        "dpsId": payload["dpsId"],
        "moduleCode": payload["moduleCode"],
        "levelCode": payload["levelCode"],
        "lessonNumber": payload["lessonNumber"],
        "dpsNumber": payload["dpsNumber"],
        "title": payload["dpsTitle"],
        "concept": {
            # Kept for any older consumer that reads a single flat concept
            # (first section only) -- but "sections" below is the real,
            # complete list every sheet's instructions page should render.
            "conceptFamily": primary_section.get("conceptFamily"),
            "operationFocus": primary_section.get("operationFocus"),
            "abacusRule": primary_section.get("abacusRule"),
            "description": primary_section.get("sectionTitle"),
            "sections": [
                {
                    "sectionNumber": s.get("sectionNumber"),
                    "sectionTitle": s.get("sectionTitle"),
                    "questionCount": s.get("questionCount"),
                    "conceptFamily": s.get("conceptFamily"),
                    "operationFocus": s.get("operationFocus"),
                }
                for s in sections
            ],
        },
        "testSettings": {
            "questionCount": question_count,
            "durationSeconds": payload["defaultDurationSeconds"],
            "marksPerQuestion": payload["marksPerQuestion"],
            # DPS questions are typed free-text answers, not MCQ picks -- see
            # OPEN_ISSUES.md 2026-08-03e. Kept as "TYPED" (not "MCQ") since
            # this flows straight into the instructions page's Practice
            # Details panel.
            "answerType": "TYPED",
            "negativeMarking": False,
            "navigationAllowed": True,
            "autoSubmit": True,
        },
        "instructions": [
            f"You will get {question_count} question{'s' if question_count != 1 else ''}.",
            "Type your answer for each question -- no options to pick from.",
            "Your answers auto-save as you type.",
            "The test will auto-submit when time is up.",
        ],
    }

@router.post("/attempts/start")
def start(payload: StartAttemptRequest, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    attempt = start_attempt(db, student, payload.assignmentId, payload.dpsId, payload.mode)
    return {"attemptId": attempt.id, "questionSetId": attempt.question_set_id, "status": attempt.status, "mode": attempt.mode, "startedAt": attempt.started_at, "expiresAt": attempt.expires_at, "remainingSeconds": remaining_seconds(attempt), "totalQuestions": attempt.total_questions, "questions": safe_questions_payload(db, attempt), **attempt_context_payload(db, attempt)}

@router.get("/attempts/{attempt_id}")
def resume(attempt_id: str, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    attempt = get_attempt_for_student(db, student, attempt_id)
    data = {"attemptId": attempt.id, "status": attempt.status, "mode": attempt.mode, "startedAt": attempt.started_at, "expiresAt": attempt.expires_at, "remainingSeconds": remaining_seconds(attempt), "totalQuestions": attempt.total_questions, **attempt_context_payload(db, attempt)}
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
    return save_answer(db, student, attempt_id, payload.questionId, payload.answerText)

@router.post("/attempts/{attempt_id}/submit")
def submit(attempt_id: str, payload: SubmitRequest, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    attempt = get_attempt_for_student(db, student, attempt_id)
    # submit_attempt() now sends the completion notification (and any
    # retry-assignment notification) itself, atomically, exactly once,
    # regardless of whether THIS call is what actually completed the attempt
    # or whether the lazy auto-submit fallback inside get_attempt_for_student()
    # already beat it to it -- see _process_attempt_notification_side_effects.
    attempt = submit_attempt(db, attempt, auto=False)
    return result_payload(db, attempt, include_review=True)

@router.post("/attempts/{attempt_id}/auto-submit")
def auto_submit(attempt_id: str, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    attempt = get_attempt_for_student(db, student, attempt_id)
    attempt = submit_attempt(db, attempt, auto=True)
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
    # SubmitAssessmentAttempt() now sends the completion notification itself,
    # atomically, exactly once, regardless of whether THIS call is what
    # actually completed the attempt or the lazy auto-submit fallback inside
    # GetAssessmentAttemptForStudent() already beat it to it -- see
    # _ProcessAssessmentCompletionNotification.
    Attempt = SubmitAssessmentAttempt(db, student, attempt_id, Auto=False)
    return AssessmentResultPayload(db, Attempt, IncludeReview=True)


@router.post("/assessment-attempts/{attempt_id}/auto-submit")
def auto_submit_assessment_attempt(attempt_id: str, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    Attempt = SubmitAssessmentAttempt(db, student, attempt_id, Auto=True)
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

@router.get("/competition/mock-exams/{exam_id}/leaderboard")
def get_mock_exam_leaderboard(
    exam_id: str,
    db: Session = Depends(get_db),
    student: Student = Depends(get_current_student)
):
    # Ranking query lives in leaderboard_service.py now (2026-09-01
    # extraction) so this endpoint, the new teacher leaderboard endpoints,
    # and the rank-change notification hooks all compute rank off exactly
    # the same query. Behavior here is unchanged: every student at the
    # requesting student's own current_level_id with a result for this
    # exam, ranked by percentage desc / time asc, topBadges attached
    # (dps_* excluded -- this is a mock-exam-scoped leaderboard).
    leaderboard = leaderboard_service.rank_mock_specific_exam(db, exam_id, student.current_level_id)
    return leaderboard_service.wrap_for_student(leaderboard, student.id)

@router.get("/achievements")
def get_student_achievements(
    db: Session = Depends(get_db),
    student: Student = Depends(get_current_student)
):
    from app.models.models import (
        StudentBadge, AchievementBadge, StudentAchievementStat,
        CompetitionMockResultSummary, CompetitionMockExam, Level,
    )
    from sqlalchemy import func as sa_func
    from app.services.achievements import _level_mastery_key

    all_badges = db.query(AchievementBadge).all()
    earned_badges = db.query(StudentBadge).filter(StudentBadge.student_id == student.id).all()
    earned_ids = {eb.badge_id: eb.unlocked_at for eb in earned_badges}

    stats = db.query(StudentAchievementStat).filter(StudentAchievementStat.student_id == student.id).all()
    stats_map = {s.stat_name: s.stat_value for s in stats}

    # Level Mastery badges aren't tracked via StudentAchievementStat -- their
    # detection (AchievementEngine._evaluate_level_mastery) computes a live
    # per-Level mock count instead of a stored counter, so "currentProgress"
    # for a locked Level Mastery badge is computed the same way here, rather
    # than always reading 0 (which is what fell out of badge_progress_map
    # below not knowing about this family at all).
    level_mastery_counts_by_level_id = dict(
        db.query(CompetitionMockExam.level_id, sa_func.count(CompetitionMockResultSummary.id))
        .join(CompetitionMockResultSummary, CompetitionMockResultSummary.mock_exam_id == CompetitionMockExam.id)
        .filter(
            CompetitionMockResultSummary.student_id == student.id,
            CompetitionMockResultSummary.completed_at.isnot(None),
        )
        .group_by(CompetitionMockExam.level_id)
        .all()
    )
    level_mastery_progress_by_code = {}
    if level_mastery_counts_by_level_id:
        levels_by_id = {lvl.id: lvl for lvl in db.query(Level).filter(Level.id.in_(level_mastery_counts_by_level_id.keys())).all()}
        for level_id, count in level_mastery_counts_by_level_id.items():
            level = levels_by_id.get(level_id)
            if level and level.level_code:
                level_mastery_progress_by_code[f"level_mastery_{_level_mastery_key(level.level_code)}"] = count

    # Level Mastery badge visibility: real students already had progress
    # before this platform existed, and mock exams are only ever assigned
    # for a student's CURRENT level -- so a badge for an already-passed
    # level with zero in-app history is permanently unearnable and
    # shouldn't be shown. Rule (deliberately simple, no curriculum-path
    # knowledge needed): a locked, zero-progress Level Mastery badge is
    # only shown if it's for the student's CURRENT level. Already-unlocked
    # or in-progress badges always show regardless. As the student advances
    # to a new current level, that level's badge becomes visible on its own
    # (this check re-runs on every request), and the level they just left
    # stays visible because it now has progress > 0 (or is unlocked) --
    # no path resolution or "reachable levels ahead" projection required.
    # Not filtered to is_active only: a level a student is currently on
    # must still resolve here even if an admin deactivates it later (e.g.
    # retiring a level after students have already progressed onto it) --
    # otherwise that student's own current-level badge would wrongly
    # disappear. Deactivated levels nobody is on just sit unused in the map.
    level_mastery_level_id_by_code = {}
    for lvl in db.query(Level).all():
        if lvl.level_code:
            level_mastery_level_id_by_code[f"level_mastery_{_level_mastery_key(lvl.level_code)}"] = lvl.id

    badge_progress_map = {
        "perfectionist": "perfect_mock_scores",
        "speed_demon": "speed_demon_scores",
        "competitor": "mock_exams_completed",
        "unstoppable_streak": "unstoppable_mock_streak",
        "early_bird": "early_bird_mocks",
        "comeback_kid": "comeback_kid_mocks",
        "sharpshooter": "sharpshooter_mocks",
        "underdog": "underdog_mocks",
        "polymath": "polymath_count",
        "podium_finisher": "podium_finisher_mocks",
    }

    result = []
    for badge in all_badges:
        stat_name = badge_progress_map.get(badge.code)
        
        # Override stat name for Legendary Podium Finisher (The Champion)
        if badge.code == "podium_finisher" and badge.tier == "LEGENDARY":
            stat_name = "champion_mocks"
            
        if badge.code.startswith("level_mastery_"):
            current_progress = level_mastery_progress_by_code.get(badge.code, 0)
        else:
            current_progress = stats_map.get(stat_name, 0) if stat_name else 0

        is_unlocked = badge.id in earned_ids

        if badge.code.startswith("level_mastery_") and not is_unlocked and current_progress == 0:
            badge_level_id = level_mastery_level_id_by_code.get(badge.code)
            if badge_level_id != student.current_level_id:
                continue

        result.append({
            "id": badge.id,
            "code": badge.code,
            "name": badge.name,
            "description": badge.description,
            "iconName": badge.icon_name,
            "tier": badge.tier,
            "requiredCount": badge.required_count,
            "currentProgress": current_progress,
            "isUnlocked": is_unlocked,
            "unlockedAt": earned_ids.get(badge.id)
        })

    return {"achievements": result}


@router.get("/economy")
def get_student_economy(
    db: Session = Depends(get_db),
    student: Student = Depends(get_current_student)
):
    """Real wallet state (XP / coins / rank tier) from the actual economy
    ledger. EconomyService.award_xp_and_coins() is the only writer of this
    table. Prior to this route existing, nothing in the frontend ever read
    UserEconomy at all -- the student dashboard's "Acquired XP / MathCoins"
    widget showed a locally-fabricated approximation instead (completed
    assignments/assessments/badges times fixed multipliers), which didn't
    move when a student completed a mock exam and had no relationship to
    what EconomyService was actually crediting server-side."""
    from app.services.economy_service import EconomyService
    econ = EconomyService.get_user_economy(db, student.user_id)
    return {
        "currentXp": econ.current_xp,
        "coinBalance": econ.coin_balance,
        "currentRankTier": econ.current_rank_tier,
        "lifetimeCoinsEarned": econ.lifetime_coins_earned,
    }


@router.get("/competition/hierarchy")
def get_competition_hierarchy(
    db: Session = Depends(get_db),
    student: Student = Depends(get_current_student)
):
    from app.models.models import Module, Level, CompetitionMockExam, CompetitionMockAssignment
    
    # Get all exams that are assigned to the student (not archived)
    assigned_exams = (
        db.query(CompetitionMockExam)
        .join(CompetitionMockAssignment, CompetitionMockAssignment.mock_exam_id == CompetitionMockExam.id)
        .filter(
            CompetitionMockAssignment.student_id == student.id,
            CompetitionMockAssignment.is_active == True,
            CompetitionMockExam.is_active == True,
            CompetitionMockExam.status != "ARCHIVED"
        )
        .all()
    )
    
    assigned_exam_ids = {e.id for e in assigned_exams}
    assigned_level_ids = {e.level_id for e in assigned_exams}
    assigned_module_ids = {e.module_id for e in assigned_exams}
    
    if student.current_level_id:
        assigned_level_ids.add(student.current_level_id)
        current_level = db.query(Level).filter(Level.id == student.current_level_id).first()
        if current_level:
            assigned_module_ids.add(current_level.module_id)

    if not assigned_module_ids:
        modules = db.query(Module).filter(Module.is_active == True).order_by(Module.display_order).all()
        levels = db.query(Level).filter(Level.is_active == True).order_by(Level.display_order).all()
    else:
        modules = db.query(Module).filter(Module.id.in_(assigned_module_ids), Module.is_active == True).order_by(Module.display_order).all()
        levels = db.query(Level).filter(Level.id.in_(assigned_level_ids), Level.is_active == True).order_by(Level.display_order).all()
    
    return {
        "modules": [{"id": m.id, "name": m.module_name, "code": m.module_code} for m in modules],
        "levels": [{"id": l.id, "moduleId": l.module_id, "name": l.level_name, "code": l.level_code} for l in levels],
        "exams": [{"id": e.id, "levelId": e.level_id, "moduleId": e.module_id, "title": e.title} for e in assigned_exams],
        "currentLevelId": student.current_level_id,
        "currentModuleId": next((l.module_id for l in levels if l.id == student.current_level_id), None)
    }

@router.get("/competition/mock-exams/cumulative-leaderboard")
def get_cumulative_leaderboard(
    level_id: str,
    db: Session = Depends(get_db),
    student: Student = Depends(get_current_student)
):
    # Ranking query lives in leaderboard_service.py now (2026-09-01
    # extraction) -- see rank_mock_overall_journey()'s own docstring for the
    # pooled-accuracy formula and is_active scoping this preserves unchanged.
    leaderboard = leaderboard_service.rank_mock_overall_journey(db, level_id)
    return leaderboard_service.wrap_for_student(leaderboard, student.id)


# ============================================================================
# DPS (practice-sheet) leaderboard -- distinct from the mock-exam leaderboard
# above. Two tabs, mirroring the mock-exam leaderboard's own
# cumulative/specific split but scoped differently per product spec:
# "Overall Journey" pools every completed DPS attempt across an entire
# MODULE (every level within it), "Specific Level" pools every completed DPS
# attempt within one single LEVEL. Both are unranked-cap: every student with
# at least one qualifying completed attempt is returned, never a top-N
# slice, same convention as get_cumulative_leaderboard()/
# get_mock_exam_leaderboard() above.
# ============================================================================

@router.get("/competition/dps/hierarchy")
def get_dps_hierarchy(
    db: Session = Depends(get_db),
    student: Student = Depends(get_current_student)
):
    """Hierarchy for the DPS practice leaderboard -- distinct from
    /competition/hierarchy above, which is scoped to a student's assigned
    mock exams. DPS practice sheets are assigned platform-wide per
    curriculum, not per-student like mock exams, so this simply lists every
    active Module/Level rather than filtering to an assignment set."""
    modules = db.query(Module).filter(Module.is_active == True).order_by(Module.display_order).all()  # noqa: E712
    levels = db.query(Level).filter(Level.is_active == True).order_by(Level.display_order).all()  # noqa: E712
    return {
        "modules": [{"id": m.id, "name": m.module_name, "code": m.module_code} for m in modules],
        "levels": [{"id": l.id, "moduleId": l.module_id, "name": l.level_name, "code": l.level_code} for l in levels],
        "currentModuleId": student.current_module_id,
        "currentLevelId": student.current_level_id,
    }


@router.get("/competition/dps/overall-leaderboard")
def get_dps_overall_leaderboard(
    module_id: str,
    db: Session = Depends(get_db),
    student: Student = Depends(get_current_student)
):
    """'Overall Journey' tab -- pools every completed DPS practice attempt
    across every level within the given module, so a student's rank
    reflects their whole practice journey through the module, not just
    their current level."""
    leaderboard = leaderboard_service.rank_dps_overall_journey(db, module_id)
    return leaderboard_service.wrap_for_student(leaderboard, student.id)


@router.get("/competition/dps/specific-leaderboard")
def get_dps_specific_leaderboard(
    level_id: str,
    db: Session = Depends(get_db),
    student: Student = Depends(get_current_student)
):
    """'Specific Level' tab -- pools every completed DPS practice attempt
    within one single level (every DPS sheet across every lesson in that
    level), so a student's rank reflects their standing at their current
    (or any selected) level specifically."""
    leaderboard = leaderboard_service.rank_dps_specific_level(db, level_id)
    return leaderboard_service.wrap_for_student(leaderboard, student.id)
