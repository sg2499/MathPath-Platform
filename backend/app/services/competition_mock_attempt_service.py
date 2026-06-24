from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.services.competition_mock_generation_service import _MmCompetitionPadVisualAddLessRows
from app.models import (
    CompetitionMockAssignment,
    CompetitionMockAttempt,
    CompetitionMockAttemptAnswer,
    CompetitionMockExam,
    CompetitionMockQuestion,
    CompetitionMockQuestionOption,
    CompetitionMockResultSummary,
    Level,
    Module,
    Student,
    Teacher,
    User,
)
from app.services.notification_service import CreateNotification

COMPLETED_STATUSES = {"SUBMITTED", "AUTO_SUBMITTED", "COMPLETED", "EXPIRED", "LOCKED"}
ACTIVE_STATUS = "IN_PROGRESS"

MM_COMPETITION_SECTION_TITLES: dict[int, str] = {
    1: "Add/Less (Abacus)",
    2: "Add/Less (Visual)",
    3: "Multiplication",
    4: "Division",
    5: "Positional & Placement",
    6: "Squares and Square Roots",
    7: "Cubes and Cube Roots",
    8: "BODMAS, Solve Equation, Add/Less Percentage",
    9: "Profit/Loss, Simple Interest, Selling Price",
    10: "Skill Stacker, Concept Drill",
}


def _competition_section_title(question: CompetitionMockQuestion) -> str:
    try:
        section_number = int(question.section_number or 0)
    except Exception:
        section_number = 0
    return MM_COMPETITION_SECTION_TITLES.get(section_number) or question.section_title or "Competition Mock"


def _section_sort_key(item: dict[str, Any]) -> tuple[int, str]:
    try:
        return (int(item.get("sectionNumber") or 999), str(item.get("concept") or ""))
    except Exception:
        return (999, str(item.get("concept") or ""))


def _section_performance_from_review(review: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    section_totals: dict[int, dict[str, Any]] = {}
    for question in review:
        try:
            section_number = int(question.get("sectionNumber") or 0)
        except Exception:
            section_number = 0
        section_title = MM_COMPETITION_SECTION_TITLES.get(section_number) or question.get("sectionTitle") or "Competition Mock"
        bucket = section_totals.setdefault(
            section_number,
            {"concept": section_title, "sectionNumber": section_number, "correct": 0, "total": 0, "percentage": 0.0},
        )
        bucket["total"] += 1
        if question.get("isCorrect"):
            bucket["correct"] += 1
    performance: list[dict[str, Any]] = []
    strengths: list[dict[str, Any]] = []
    weaknesses: list[dict[str, Any]] = []
    for item in sorted(section_totals.values(), key=_section_sort_key):
        total = int(item["total"] or 0)
        correct = int(item["correct"] or 0)
        percentage = round((correct / total) * 100, 2) if total else 0.0
        payload = {**item, "percentage": percentage}
        performance.append(payload)
        if percentage >= 75:
            strengths.append(payload)
        elif percentage < 60:
            weaknesses.append(payload)
    return performance, strengths, weaknesses


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _json_loads(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except Exception:
        return fallback


def _remaining_seconds(attempt: CompetitionMockAttempt) -> int:
    expires_at = _aware(attempt.expires_at)
    if not expires_at:
        return 0
    return max(0, int((expires_at - _now_utc()).total_seconds()))


def _duration_seconds(started_at: datetime | None, submitted_at: datetime | None, max_duration: int) -> int | None:
    if not started_at or not submitted_at:
        return None
    elapsed = int((_aware(submitted_at) - _aware(started_at)).total_seconds())
    return max(0, min(max_duration, elapsed))


def _performance_band(percentage: float) -> str:
    if percentage >= 90:
        return "EXCELLENT"
    if percentage >= 75:
        return "STRONG"
    if percentage >= 60:
        return "DEVELOPING"
    return "NEEDS_PRACTICE"


def _question_payload(
    question: CompetitionMockQuestion,
    options: list[CompetitionMockQuestionOption],
    saved_answer: CompetitionMockAttemptAnswer | None = None,
) -> dict[str, Any]:
    metadata = _json_loads(question.metadata_json, {})
    section_title = _competition_section_title(question)
    shaped_question = _MmCompetitionPadVisualAddLessRows(
        {
            "question_text": question.question_text,
            "operands": _json_loads(question.operands_json, []),
            "operators": _json_loads(question.operators_json, []),
            "metadata": metadata,
        },
        SectionKey=str(metadata.get("competitionSectionKey") or ("MM_VISUAL_ADD_LESS" if int(question.section_number or 0) == 2 else "")),
        ConceptTitle=str(metadata.get("competitionConceptKey") or question.concept_tag or section_title),
        Seed=f"ATTEMPT-VISUAL-NORMALIZE-{question.id}",
    )
    metadata = dict(shaped_question.get("metadata") if isinstance(shaped_question.get("metadata"), dict) else metadata)
    metadata.update({
        "section_number": question.section_number,
        "section_title": section_title,
        "sectionTitle": section_title,
        "concept_family": question.concept_family,
        "concept_tag": question.concept_tag,
        "mock_mode": "COMPETITION_MOCK",
    })
    return {
        "questionId": question.id,
        "questionNumber": question.question_number,
        "displayType": question.display_type,
        "questionText": question.question_text,
        "operands": shaped_question.get("operands") or [],
        "operators": shaped_question.get("operators") or [],
        "metadata": metadata,
        "options": [
            {
                "optionId": option.id,
                "label": option.option_label,
                "value": option.option_value,
            }
            for option in options
        ],
        "savedOptionId": saved_answer.selected_option_id if saved_answer else None,
    }


def _attempt_payload(db: Session, attempt: CompetitionMockAttempt) -> dict[str, Any]:
    assignment = db.get(CompetitionMockAssignment, attempt.mock_assignment_id)
    exam = db.get(CompetitionMockExam, attempt.mock_exam_id)
    if not assignment or not exam:
        api_error(404, "COMPETITION_ATTEMPT_NOT_FOUND", "Competition mock attempt could not be loaded.")

    questions = (
        db.query(CompetitionMockQuestion)
        .filter(CompetitionMockQuestion.mock_exam_id == exam.id)
        .order_by(CompetitionMockQuestion.question_number.asc())
        .all()
    )
    option_rows = []
    if questions:
        option_rows = (
            db.query(CompetitionMockQuestionOption)
            .filter(CompetitionMockQuestionOption.mock_question_id.in_([q.id for q in questions]))
            .order_by(CompetitionMockQuestionOption.display_order.asc())
            .all()
        )
    options_by_question: dict[str, list[CompetitionMockQuestionOption]] = {}
    for option in option_rows:
        options_by_question.setdefault(option.mock_question_id, []).append(option)

    answer_rows = (
        db.query(CompetitionMockAttemptAnswer)
        .filter(CompetitionMockAttemptAnswer.mock_attempt_id == attempt.id)
        .all()
    )
    answers_by_question = {answer.mock_question_id: answer for answer in answer_rows}

    module_record = db.get(Module, exam.module_id)
    level_record = db.get(Level, exam.level_id)

    return {
        "attemptId": attempt.id,
        "assignmentId": assignment.id,
        "mockExamId": exam.id,
        "status": attempt.status,
        "mode": "COMPETITION",
        "startedAt": attempt.started_at.isoformat() if attempt.started_at else None,
        "expiresAt": attempt.expires_at.isoformat() if attempt.expires_at else None,
        "serverTime": _now_utc().isoformat(),
        "remainingSeconds": _remaining_seconds(attempt),
        "durationSeconds": attempt.duration_seconds,
        "totalQuestions": len(questions),
        "answeredCount": len([answer for answer in answer_rows if answer.selected_option_id]),
        "mockExam": {
            "title": exam.title,
            "mockCode": exam.mock_code,
            "totalQuestions": exam.total_questions,
            "totalMarks": exam.total_marks,
            "marksPerQuestion": exam.marks_per_question,
            "durationSeconds": exam.duration_seconds,
            "moduleCode": module_record.module_code if module_record else None,
            "levelCode": level_record.level_code if level_record else None,
        },
        "questions": [
            _question_payload(question, options_by_question.get(question.id, []), answers_by_question.get(question.id))
            for question in questions
        ],
    }


def _assignment_with_current_attempt_payload(db: Session, assignment: CompetitionMockAssignment) -> dict[str, Any]:
    exam = db.get(CompetitionMockExam, assignment.mock_exam_id)
    if not exam:
        return {}
    level_record = db.get(Level, exam.level_id)
    module_record = db.get(Module, exam.module_id)
    latest_attempt = (
        db.query(CompetitionMockAttempt)
        .filter(CompetitionMockAttempt.mock_assignment_id == assignment.id)
        .order_by(CompetitionMockAttempt.attempt_number.desc(), CompetitionMockAttempt.started_at.desc())
        .first()
    )
    status = assignment.status
    if latest_attempt and latest_attempt.status == ACTIVE_STATUS:
        status = "IN_PROGRESS"
    elif latest_attempt and latest_attempt.status in COMPLETED_STATUSES:
        status = "COMPLETED"

    latest_result = None
    if latest_attempt and latest_attempt.status in COMPLETED_STATUSES:
        latest_result = (
            db.query(CompetitionMockResultSummary)
            .filter(CompetitionMockResultSummary.mock_attempt_id == latest_attempt.id)
            .first()
        )

    return {
        "assignmentId": assignment.id,
        "mockExamId": exam.id,
        "status": status,
        "assignmentStatus": assignment.status,
        "currentAttemptNumber": assignment.current_attempt_number,
        "maxAttempts": assignment.max_attempts,
        "assignedAt": assignment.assigned_at.isoformat() if assignment.assigned_at else None,
        "dueAt": assignment.due_at.isoformat() if assignment.due_at else None,
        "instructions": assignment.instructions,
        "latestAttemptId": latest_attempt.id if latest_attempt else None,
        "latestAttemptStatus": latest_attempt.status if latest_attempt else None,
        "latestResult": (
            {
                "score": latest_result.score,
                "maxScore": latest_result.max_score,
                "percentage": latest_result.percentage,
                "accuracyPercentage": latest_result.accuracy_percentage,
                "timeTakenSeconds": latest_result.time_taken_seconds,
                "timeUtilizationPercentage": latest_result.time_utilization_percentage,
                "performanceBand": latest_result.performance_band,
                "completedAt": latest_result.completed_at.isoformat() if latest_result.completed_at else None,
            }
            if latest_result else None
        ),
        "mockExam": {
            "mockExamId": exam.id,
            "title": exam.title,
            "mockCode": exam.mock_code,
            "status": exam.status,
            "totalQuestions": exam.total_questions,
            "totalMarks": exam.total_marks,
            "marksPerQuestion": exam.marks_per_question,
            "durationSeconds": exam.duration_seconds,
            "moduleId": exam.module_id,
            "moduleCode": module_record.module_code if module_record else None,
            "moduleName": module_record.module_name if module_record else None,
            "levelId": exam.level_id,
            "levelCode": level_record.level_code if level_record else None,
            "levelName": level_record.level_name if level_record else None,
        },
    }


def ListStudentCompetitionMockAssignmentsForAttempt(db: Session, student: Student) -> list[dict[str, Any]]:
    query = (
        db.query(CompetitionMockAssignment)
        .join(CompetitionMockExam, CompetitionMockAssignment.mock_exam_id == CompetitionMockExam.id)
        .filter(
            CompetitionMockAssignment.student_id == student.id,
            CompetitionMockAssignment.is_active == True,
            CompetitionMockExam.is_active == True,
            CompetitionMockExam.status != "ARCHIVED",
        )
    )
    if student.current_level_id:
        query = query.filter(CompetitionMockExam.level_id == student.current_level_id)
    rows = query.order_by(CompetitionMockAssignment.assigned_at.desc()).all()
    return [_assignment_with_current_attempt_payload(db, row) for row in rows]


def StartCompetitionMockAttempt(db: Session, student: Student, assignment_id: str) -> dict[str, Any]:
    assignment = db.get(CompetitionMockAssignment, assignment_id)
    if not assignment or assignment.student_id != student.id or not assignment.is_active:
        api_error(404, "COMPETITION_ASSIGNMENT_NOT_FOUND", "Competition mock assignment not found.")
    exam = db.get(CompetitionMockExam, assignment.mock_exam_id)
    if not exam or not exam.is_active or exam.status == "ARCHIVED":
        api_error(404, "COMPETITION_MOCK_NOT_AVAILABLE", "Competition mock is not available.")
    if student.current_level_id and exam.level_id != student.current_level_id:
        api_error(403, "WRONG_LEVEL_COMPETITION_MOCK", "This mock is not assigned for your current level.")

    active_attempt = (
        db.query(CompetitionMockAttempt)
        .filter(
            CompetitionMockAttempt.mock_assignment_id == assignment.id,
            CompetitionMockAttempt.student_id == student.id,
            CompetitionMockAttempt.status == ACTIVE_STATUS,
        )
        .order_by(CompetitionMockAttempt.started_at.desc())
        .first()
    )
    if active_attempt:
        active_attempt = EnsureCompetitionAttemptActiveOrSubmit(db, active_attempt)
        if active_attempt.status == ACTIVE_STATUS:
            return _attempt_payload(db, active_attempt)

    completed_count = (
        db.query(CompetitionMockAttempt)
        .filter(
            CompetitionMockAttempt.mock_assignment_id == assignment.id,
            CompetitionMockAttempt.student_id == student.id,
            CompetitionMockAttempt.status.in_(list(COMPLETED_STATUSES)),
        )
        .count()
    )
    if completed_count >= max(1, assignment.max_attempts or 1):
        api_error(403, "COMPETITION_ATTEMPTS_EXHAUSTED", "This mock exam has already been submitted.")

    questions_count = db.query(CompetitionMockQuestion).filter(CompetitionMockQuestion.mock_exam_id == exam.id).count()
    if questions_count <= 0:
        api_error(400, "COMPETITION_MOCK_EMPTY", "This mock exam has no questions.")

    started_at = _now_utc()
    attempt = CompetitionMockAttempt(
        mock_assignment_id=assignment.id,
        mock_exam_id=exam.id,
        student_id=student.id,
        attempt_number=(assignment.current_attempt_number or 0) + 1,
        status=ACTIVE_STATUS,
        started_at=started_at,
        expires_at=started_at + timedelta(seconds=exam.duration_seconds),
        duration_seconds=exam.duration_seconds,
        total_questions=questions_count,
        max_score=float(exam.total_marks or questions_count),
    )
    assignment.current_attempt_number = attempt.attempt_number
    assignment.status = "IN_PROGRESS"
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return _attempt_payload(db, attempt)


def EnsureCompetitionAttemptActiveOrSubmit(db: Session, attempt: CompetitionMockAttempt) -> CompetitionMockAttempt:
    if attempt.status in COMPLETED_STATUSES:
        return attempt
    if _remaining_seconds(attempt) <= 0:
        return SubmitCompetitionMockAttempt(db, attempt, auto=True)
    return attempt


def GetCompetitionMockAttemptForStudent(db: Session, student: Student, attempt_id: str) -> dict[str, Any]:
    attempt = db.get(CompetitionMockAttempt, attempt_id)
    if not attempt or attempt.student_id != student.id:
        api_error(404, "COMPETITION_ATTEMPT_NOT_FOUND", "Competition mock attempt not found.")
    attempt = EnsureCompetitionAttemptActiveOrSubmit(db, attempt)
    if attempt.status != ACTIVE_STATUS:
        return {
            "attemptId": attempt.id,
            "status": attempt.status,
            "message": "Competition mock has already been submitted.",
            "resultAvailable": True,
        }
    return _attempt_payload(db, attempt)


def SaveCompetitionMockAnswer(db: Session, student: Student, attempt_id: str, question_id: str, selected_option_id: str) -> dict[str, Any]:
    attempt = db.get(CompetitionMockAttempt, attempt_id)
    if not attempt or attempt.student_id != student.id:
        api_error(404, "COMPETITION_ATTEMPT_NOT_FOUND", "Competition mock attempt not found.")
    attempt = EnsureCompetitionAttemptActiveOrSubmit(db, attempt)
    if attempt.status != ACTIVE_STATUS:
        return {"saved": False, "status": attempt.status, "message": "Competition mock is no longer active.", "resultAvailable": True}

    question = db.get(CompetitionMockQuestion, question_id)
    if not question or question.mock_exam_id != attempt.mock_exam_id:
        api_error(400, "INVALID_COMPETITION_QUESTION", "Question does not belong to this mock attempt.")
    option = db.get(CompetitionMockQuestionOption, selected_option_id)
    if not option or option.mock_question_id != question.id:
        api_error(400, "INVALID_COMPETITION_OPTION", "Option does not belong to this question.")

    answer = (
        db.query(CompetitionMockAttemptAnswer)
        .filter(
            CompetitionMockAttemptAnswer.mock_attempt_id == attempt.id,
            CompetitionMockAttemptAnswer.mock_question_id == question.id,
        )
        .first()
    )
    if not answer:
        answer = CompetitionMockAttemptAnswer(mock_attempt_id=attempt.id, mock_question_id=question.id)
        db.add(answer)
    answer.selected_option_id = option.id
    answer.selected_value = option.option_value
    answer.is_correct = bool(option.is_correct)
    answer.marks_awarded = float(question.marks or 1) if option.is_correct else 0.0
    db.commit()

    answered_count = (
        db.query(CompetitionMockAttemptAnswer)
        .filter(CompetitionMockAttemptAnswer.mock_attempt_id == attempt.id, CompetitionMockAttemptAnswer.selected_option_id.isnot(None))
        .count()
    )
    return {
        "saved": True,
        "attemptId": attempt.id,
        "questionId": question.id,
        "selectedOptionId": option.id,
        "answeredCount": answered_count,
        "remainingSeconds": _remaining_seconds(attempt),
    }


def _format_concept_family(concept: str | None) -> str:
    if not concept or concept == "MM_UNSUPPORTED":
        return "Mixed Concepts"
    if concept == "BODMAS":
        return "BODMAS"
    if concept == "ADD_LESS":
        return "Add/Less"
    if concept == "DECIMAL_ADD_LESS":
        return "Decimal Add/Less"
    if concept == "PERCENTAGE_ADD_LESS":
        return "Percentage Add/Less"

    words = concept.replace("_", " ").split()
    return " ".join(word.capitalize() for word in words)

def SubmitCompetitionMockAttempt(db: Session, attempt: CompetitionMockAttempt, auto: bool = False) -> CompetitionMockAttempt:
    if attempt.status in COMPLETED_STATUSES:
        return attempt

    questions = (
        db.query(CompetitionMockQuestion)
        .filter(CompetitionMockQuestion.mock_exam_id == attempt.mock_exam_id)
        .order_by(CompetitionMockQuestion.question_number.asc())
        .all()
    )
    answers = {
        answer.mock_question_id: answer
        for answer in db.query(CompetitionMockAttemptAnswer).filter(CompetitionMockAttemptAnswer.mock_attempt_id == attempt.id).all()
    }
    correct = wrong = unanswered = 0
    score = 0.0
    max_score = 0.0
    concept_totals: dict[str, dict[str, float]] = {}

    for question in questions:
        max_score += float(question.marks or 1)

        # Group by exact question concept tag, fallback to family or section title if missing
        if question.concept_tag:
            concept_key = question.concept_tag
        elif question.concept_family and question.concept_family != "MM_UNSUPPORTED":
            concept_key = _format_concept_family(question.concept_family)
        else:
            concept_key = _competition_section_title(question)

        concept_totals.setdefault(concept_key, {"correct": 0, "total": 0})
        concept_totals[concept_key]["total"] += 1
        answer = answers.get(question.id)
        if not answer or not answer.selected_option_id:
            unanswered += 1
            continue
        option = db.get(CompetitionMockQuestionOption, answer.selected_option_id)
        if option and option.is_correct:
            correct += 1
            concept_totals[concept_key]["correct"] += 1
            answer.is_correct = True
            answer.marks_awarded = float(question.marks or 1)
            score += answer.marks_awarded
        else:
            wrong += 1
            answer.is_correct = False
            answer.marks_awarded = 0.0

    submitted_at = _now_utc()
    attempt.status = "AUTO_SUBMITTED" if auto else "SUBMITTED"
    attempt.submitted_at = submitted_at
    attempt.correct_count = correct
    attempt.wrong_count = wrong
    attempt.unanswered_count = unanswered
    attempt.attempted_count = correct + wrong
    attempt.total_questions = len(questions)
    attempt.total_score = round(score, 2)
    attempt.max_score = round(max_score, 2)
    attempt.percentage = round((score / max_score) * 100, 2) if max_score else 0.0
    attempt.performance_band = _performance_band(attempt.percentage)
    attempt.time_taken_seconds = attempt.duration_seconds if auto else _duration_seconds(attempt.started_at, submitted_at, attempt.duration_seconds)
    attempt.time_utilization_percentage = round(((attempt.time_taken_seconds or 0) / attempt.duration_seconds) * 100, 2) if attempt.duration_seconds else None

    assignment = db.get(CompetitionMockAssignment, attempt.mock_assignment_id)
    if assignment:
        assignment.status = "COMPLETED"

    concept_performance = []
    strengths = []
    weaknesses = []
    for concept, item in concept_totals.items():
        total = int(item["total"])
        correct_value = int(item["correct"])
        percentage = round((correct_value / total) * 100, 2) if total else 0.0
        concept_payload = {"concept": concept, "correct": correct_value, "total": total, "percentage": percentage}
        concept_performance.append(concept_payload)
        if percentage >= 75:
            strengths.append(concept_payload)
        elif percentage < 60:
            weaknesses.append(concept_payload)

    existing_summary = (
        db.query(CompetitionMockResultSummary)
        .filter(CompetitionMockResultSummary.mock_attempt_id == attempt.id)
        .first()
    )
    if not existing_summary:
        existing_summary = CompetitionMockResultSummary(
            mock_attempt_id=attempt.id,
            mock_assignment_id=attempt.mock_assignment_id,
            mock_exam_id=attempt.mock_exam_id,
            student_id=attempt.student_id,
        )
        db.add(existing_summary)
    existing_summary.score = attempt.total_score
    existing_summary.max_score = attempt.max_score
    existing_summary.percentage = attempt.percentage
    existing_summary.accuracy_percentage = round((correct / (correct + wrong)) * 100, 2) if (correct + wrong) else 0.0
    existing_summary.time_taken_seconds = attempt.time_taken_seconds
    existing_summary.time_utilization_percentage = attempt.time_utilization_percentage
    existing_summary.performance_band = attempt.performance_band or _performance_band(attempt.percentage)
    existing_summary.concept_strengths_json = json.dumps(strengths)
    existing_summary.concept_weaknesses_json = json.dumps(weaknesses)
    existing_summary.concept_performance_json = json.dumps(concept_performance)
    existing_summary.recommendation_json = json.dumps({"message": "Review weak areas and retry similar practice before the next mock."})
    existing_summary.completed_at = submitted_at
    db.commit()
    db.refresh(attempt)
    return attempt


def SubmitCompetitionMockAttemptForStudent(db: Session, student: Student, attempt_id: str, auto: bool = False) -> dict[str, Any]:
    attempt = db.get(CompetitionMockAttempt, attempt_id)
    if not attempt or attempt.student_id != student.id:
        api_error(404, "COMPETITION_ATTEMPT_NOT_FOUND", "Competition mock attempt not found.")
    attempt = SubmitCompetitionMockAttempt(db, attempt, auto=auto)

    exam = db.get(CompetitionMockExam, attempt.mock_exam_id)
    module = db.get(Module, exam.module_id) if exam else None
    level = db.get(Level, exam.level_id) if exam else None
    assignment = db.get(CompetitionMockAssignment, attempt.mock_assignment_id)

    if exam and assignment:
        student_user = db.get(User, student.user_id)
        if not student_user:
            return

        try:
            safe_teacher_id = student.teacher_id if student.teacher_id else None

            # Notify Student
            CreateNotification(
                db,
                recipient_user_id=student_user.id,
                recipient_role="STUDENT",
                type="MOCK_SUBMITTED",
                category="COMPETITION_MOCK",
                title="Mock Exam Submitted",
                message=f"You successfully submitted {exam.title or exam.mock_code}. Score: {attempt.total_score}/{attempt.max_score} ({attempt.percentage}%)",
                actor_user_id=student_user.id,
                actor_role="STUDENT",
                student_id=student.id,
                teacher_id=safe_teacher_id,
                attempt_id=attempt.id,
                color_variant="indigo",
                metadata={
                    "event": "MOCK_SUBMITTED",
                    "moduleCode": module.module_code if module else None,
                    "levelCode": level.level_code if level else None,
                }
            )

            teacher_name = "No Teacher"
            if safe_teacher_id:
                teacher_record = db.get(Teacher, safe_teacher_id)
                teacher_user = db.get(User, teacher_record.user_id) if teacher_record else None
                if teacher_user and teacher_record:
                    teacher_name = teacher_user.full_name
                    CreateNotification(
                        db,
                        recipient_user_id=teacher_user.id,
                        recipient_role="TEACHER",
                        type="STUDENT_MOCK_SUBMITTED",
                        category="COMPETITION_MOCK",
                        title="Student Mock Submitted",
                        message=f"{student_user.full_name} submitted {exam.title or exam.mock_code}. Score: {attempt.total_score}/{attempt.max_score} ({attempt.percentage}%)",
                        actor_user_id=student_user.id,
                        actor_role="STUDENT",
                        student_id=student.id,
                        teacher_id=safe_teacher_id,
                        attempt_id=attempt.id,
                        color_variant="purple",
                        metadata={
                            "event": "STUDENT_MOCK_SUBMITTED",
                            "moduleCode": module.module_code if module else None,
                            "levelCode": level.level_code if level else None,
                        }
                    )

            admins = db.query(User).filter(User.role == "ADMIN", User.is_active == True).all()
            for admin in admins:
                CreateNotification(
                    db,
                    recipient_user_id=admin.id,
                    recipient_role="ADMIN",
                    type="STUDENT_MOCK_SUBMITTED",
                    category="COMPETITION_MOCK",
                    title="Student Mock Submitted",
                    message=f"{student_user.full_name} (Teacher: {teacher_name}) submitted {exam.title or exam.mock_code}. Score: {attempt.total_score}/{attempt.max_score} ({attempt.percentage}%)",
                    actor_user_id=student_user.id,
                    actor_role="STUDENT",
                    student_id=student.id,
                    teacher_id=safe_teacher_id,
                    attempt_id=attempt.id,
                    color_variant="indigo",
                    metadata={
                        "event": "STUDENT_MOCK_SUBMITTED",
                        "moduleCode": module.module_code if module else None,
                        "levelCode": level.level_code if level else None,
                    }
                )

            db.commit()
        except Exception as e:
            db.rollback()
            import logging
            logging.error(f"Failed to generate notifications for mock submission {attempt.id}: {e}")

    return {
        "attemptId": attempt.id,
        "status": attempt.status,
        "score": attempt.total_score,
        "maxScore": attempt.max_score,
        "percentage": attempt.percentage,
        "correct": attempt.correct_count,
        "wrong": attempt.wrong_count,
        "unanswered": attempt.unanswered_count,
        "timeTakenSeconds": attempt.time_taken_seconds,
    }



def _question_review_payload(db: Session, attempt: CompetitionMockAttempt) -> list[dict[str, Any]]:
    questions = (
        db.query(CompetitionMockQuestion)
        .filter(CompetitionMockQuestion.mock_exam_id == attempt.mock_exam_id)
        .order_by(CompetitionMockQuestion.question_number.asc())
        .all()
    )
    if not questions:
        return []

    question_ids = [question.id for question in questions]
    option_rows = (
        db.query(CompetitionMockQuestionOption)
        .filter(CompetitionMockQuestionOption.mock_question_id.in_(question_ids))
        .order_by(CompetitionMockQuestionOption.display_order.asc())
        .all()
    )
    options_by_question: dict[str, list[CompetitionMockQuestionOption]] = {}
    options_by_id: dict[str, CompetitionMockQuestionOption] = {}
    for option in option_rows:
        options_by_question.setdefault(option.mock_question_id, []).append(option)
        options_by_id[option.id] = option

    answer_rows = (
        db.query(CompetitionMockAttemptAnswer)
        .filter(CompetitionMockAttemptAnswer.mock_attempt_id == attempt.id)
        .all()
    )
    answers_by_question = {answer.mock_question_id: answer for answer in answer_rows}

    review: list[dict[str, Any]] = []
    for question in questions:
        section_title = _competition_section_title(question)
        metadata = _json_loads(question.metadata_json, {})
        metadata.update({
            "section_number": question.section_number,
            "section_title": section_title,
            "sectionTitle": section_title,
            "concept_family": question.concept_family,
            "concept_tag": question.concept_tag,
            "mock_mode": "COMPETITION_MOCK",
        })
        options = options_by_question.get(question.id, [])
        correct_option = next((option for option in options if option.is_correct), None)
        answer = answers_by_question.get(question.id)
        selected_option = options_by_id.get(answer.selected_option_id) if answer and answer.selected_option_id else None

        review.append({
            "questionId": question.id,
            "questionNumber": question.question_number,
            "sectionNumber": question.section_number,
            "sectionTitle": section_title,
            "concept": section_title,
            "displayType": question.display_type,
            "questionText": question.question_text,
            "operands": _json_loads(question.operands_json, []),
            "operators": _json_loads(question.operators_json, []),
            "metadata": metadata,
            "options": [
                {
                    "optionId": option.id,
                    "label": option.option_label,
                    "value": option.option_value,
                    "isCorrect": bool(option.is_correct),
                }
                for option in options
            ],
            "selectedOption": (
                {
                    "optionId": selected_option.id,
                    "label": selected_option.option_label,
                    "value": selected_option.option_value,
                }
                if selected_option else None
            ),
            "correctOption": (
                {
                    "optionId": correct_option.id,
                    "label": correct_option.option_label,
                    "value": correct_option.option_value,
                }
                if correct_option else None
            ),
            "isCorrect": bool(answer.is_correct) if answer and answer.selected_option_id else False,
            "isUnanswered": not bool(answer and answer.selected_option_id),
            "marksAwarded": float(answer.marks_awarded or 0) if answer else 0.0,
            "marks": float(question.marks or 1),
        })
    return review

def _result_payload(db: Session, attempt: CompetitionMockAttempt) -> dict[str, Any]:
    assignment = db.get(CompetitionMockAssignment, attempt.mock_assignment_id)
    exam = db.get(CompetitionMockExam, attempt.mock_exam_id)
    if not assignment or not exam:
        api_error(404, "COMPETITION_RESULT_NOT_FOUND", "Competition mock result could not be loaded.")

    if attempt.status not in COMPLETED_STATUSES:
        api_error(409, "COMPETITION_ATTEMPT_NOT_SUBMITTED", "Submit the mock before viewing the result.")

    summary = (
        db.query(CompetitionMockResultSummary)
        .filter(CompetitionMockResultSummary.mock_attempt_id == attempt.id)
        .first()
    )
    if not summary:
        # Defensive repair for already-submitted attempts where summary creation did not run.
        attempt = SubmitCompetitionMockAttempt(db, attempt, auto=attempt.status == "AUTO_SUBMITTED")
        summary = (
            db.query(CompetitionMockResultSummary)
            .filter(CompetitionMockResultSummary.mock_attempt_id == attempt.id)
            .first()
        )
    if not summary:
        api_error(404, "COMPETITION_RESULT_NOT_FOUND", "Competition mock result summary is not available.")

    level_record = db.get(Level, exam.level_id)
    module_record = db.get(Module, exam.module_id)
    question_review = _question_review_payload(db, attempt)
    section_performance, section_strengths, section_weaknesses = _section_performance_from_review(question_review)

    return {
        "attemptId": attempt.id,
        "assignmentId": assignment.id,
        "mockExamId": exam.id,
        "status": attempt.status,
        "score": summary.score,
        "maxScore": summary.max_score,
        "percentage": summary.percentage,
        "accuracyPercentage": summary.accuracy_percentage,
        "correct": attempt.correct_count,
        "wrong": attempt.wrong_count,
        "unanswered": attempt.unanswered_count,
        "attempted": attempt.attempted_count,
        "totalQuestions": attempt.total_questions,
        "timeTakenSeconds": summary.time_taken_seconds,
        "timeUtilizationPercentage": summary.time_utilization_percentage,
        "performanceBand": summary.performance_band,
        "completedAt": summary.completed_at.isoformat() if summary.completed_at else None,
        "submittedAt": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        "conceptPerformance": section_performance or _json_loads(summary.concept_performance_json, []),
        "conceptStrengths": section_strengths or _json_loads(summary.concept_strengths_json, []),
        "conceptWeaknesses": section_weaknesses or _json_loads(summary.concept_weaknesses_json, []),
        "recommendation": _json_loads(summary.recommendation_json, {}),
        "questionReview": question_review,
        "mockExam": {
            "title": exam.title,
            "mockCode": exam.mock_code,
            "totalQuestions": exam.total_questions,
            "totalMarks": exam.total_marks,
            "marksPerQuestion": exam.marks_per_question,
            "durationSeconds": exam.duration_seconds,
            "moduleCode": module_record.module_code if module_record else None,
            "moduleName": module_record.module_name if module_record else None,
            "levelCode": level_record.level_code if level_record else None,
            "levelName": level_record.level_name if level_record else None,
        },
    }


def GetCompetitionMockResultForStudent(db: Session, student: Student, attempt_id: str) -> dict[str, Any]:
    attempt = db.get(CompetitionMockAttempt, attempt_id)
    if not attempt or attempt.student_id != student.id:
        api_error(404, "COMPETITION_RESULT_NOT_FOUND", "Competition mock result not found.")
    attempt = EnsureCompetitionAttemptActiveOrSubmit(db, attempt)
    return _result_payload(db, attempt)


def GetCompetitionMockResultForTeacher(db: Session, teacher: Teacher, attempt_id: str) -> dict[str, Any]:
    attempt = db.get(CompetitionMockAttempt, attempt_id)
    if not attempt:
        api_error(404, "COMPETITION_RESULT_NOT_FOUND", "Competition mock result not found.")

    student = db.get(Student, attempt.student_id) if attempt.student_id else None
    if not student or not getattr(student, "is_active", True):
        api_error(404, "COMPETITION_RESULT_NOT_FOUND", "Competition mock result not found.")

    teacher_name = ""
    if getattr(teacher, "user_id", None):
        teacher_user = db.get(User, teacher.user_id)
        teacher_name = teacher_user.full_name if teacher_user else ""

    linked_by_id = bool(getattr(student, "teacher_id", None) and student.teacher_id == teacher.id)
    linked_by_name = bool(teacher_name and getattr(student, "teacher", None) == teacher_name)
    if not linked_by_id and not linked_by_name:
        api_error(404, "COMPETITION_RESULT_NOT_FOUND", "Competition mock result not found.")

    attempt = EnsureCompetitionAttemptActiveOrSubmit(db, attempt)
    return _result_payload(db, attempt)


def GetCompetitionMockResultForAdmin(db: Session, attempt_id: str) -> dict[str, Any]:
    attempt = db.get(CompetitionMockAttempt, attempt_id)
    if not attempt:
        api_error(404, "COMPETITION_RESULT_NOT_FOUND", "Competition mock result not found.")
    attempt = EnsureCompetitionAttemptActiveOrSubmit(db, attempt)
    return _result_payload(db, attempt)


def GetCompetitionMockProgressInsightsForStudent(db: Session, student: Student) -> dict[str, Any]:
    from collections import defaultdict
    import json
    from sqlalchemy.orm import joinedload
    from app.models.models import CompetitionMockResultSummary, CompetitionMockExam, CompetitionMockAttempt, CompetitionMockAssignment

    summaries = (
        db.query(CompetitionMockResultSummary)
        .join(CompetitionMockAttempt, CompetitionMockResultSummary.mock_attempt_id == CompetitionMockAttempt.id)
        .join(CompetitionMockAssignment, CompetitionMockAttempt.mock_assignment_id == CompetitionMockAssignment.id)
        .filter(
            CompetitionMockResultSummary.student_id == student.id,
            CompetitionMockAssignment.is_active == True
        )
        .options(
            joinedload(CompetitionMockResultSummary.mock_exam).joinedload(CompetitionMockExam.module),
            joinedload(CompetitionMockResultSummary.mock_exam).joinedload(CompetitionMockExam.level)
        )
        .order_by(CompetitionMockResultSummary.completed_at.asc())
        .all()
    )

    if not summaries:
        return {
            "overallScore": 0,
            "overallAccuracy": 0,
            "overallTimeUtilization": 0,
            "totalMocksAttempted": 0,
            "averageTimePerQuestion": 0,
            "history": [],
            "moduleInsights": []
        }

    total_score = 0
    total_accuracy = 0
    total_time_utilization = 0
    total_time_taken = 0
    total_questions = 0

    history = []

    # Structure: module_level_key -> concept -> stats
    # module_level_key = (module.id, level.id, module.module_code, level.level_code, module.module_name, level.level_name)
    concept_stats_by_level = defaultdict(lambda: defaultdict(lambda: {"correct": 0, "total": 0, "time_taken": 0}))

    for s in summaries:
        history.append({
            "mockExamId": s.mock_exam_id,
            "completedAt": s.completed_at.isoformat() if s.completed_at else None,
            "score": s.score,
            "accuracyPercentage": s.accuracy_percentage,
            "timeUtilizationPercentage": s.time_utilization_percentage,
            "timeTakenSeconds": s.time_taken_seconds
        })

        total_score += s.score
        total_accuracy += s.accuracy_percentage

        if s.time_utilization_percentage:
            total_time_utilization += s.time_utilization_percentage

        if s.time_taken_seconds:
            total_time_taken += s.time_taken_seconds

        module = s.mock_exam.module
        level = s.mock_exam.level
        level_key = (module.id, level.id, module.module_code, level.level_code, module.module_name, level.level_name)

        if s.concept_performance_json:
            try:
                perfs = json.loads(s.concept_performance_json)
                for p in perfs:
                    concept = p.get("concept", "Unknown")
                    concept_stats_by_level[level_key][concept]["correct"] += p.get("correct", 0)
                    concept_stats_by_level[level_key][concept]["total"] += p.get("total", 0)
                    concept_stats_by_level[level_key][concept]["time_taken"] += p.get("time_taken", 0)
                    total_questions += p.get("total", 0)
            except:
                pass

    n = len(summaries)

    module_insights = []

    for level_key, concept_stats in concept_stats_by_level.items():
        module_id, level_id, module_code, level_code, module_name, level_name = level_key
        strong_concepts = []
        weak_concepts = []

        for concept, stats in concept_stats.items():
            if stats["total"] > 0:
                acc = (stats["correct"] / stats["total"]) * 100
                time_per_q = stats["time_taken"] / stats["total"]

                payload = {
                    "concept": concept,
                    "accuracy": acc,
                    "totalQuestions": stats["total"],
                    "timePerQuestion": time_per_q
                }

                if acc >= 70:
                    strong_concepts.append(payload)
                else:
                    weak_concepts.append(payload)

        strong_concepts.sort(key=lambda x: x["accuracy"], reverse=True)
        weak_concepts.sort(key=lambda x: x["accuracy"])

        module_insights.append({
            "moduleId": module_id,
            "moduleCode": module_code,
            "moduleName": module_name,
            "levelId": level_id,
            "levelCode": level_code,
            "levelName": level_name,
            "strongConcepts": strong_concepts,
            "weakConcepts": weak_concepts
        })

    # Sort by module code then level code
    module_insights.sort(key=lambda x: (x["moduleCode"], x["levelCode"]))

    return {
        "overallScore": round(total_score / n, 1) if n > 0 else 0,
        "overallAccuracy": round(total_accuracy / n, 2) if n > 0 else 0,
        "overallTimeUtilization": round(total_time_utilization / n, 2) if n > 0 else 0,
        "totalMocksAttempted": n,
        "averageTimePerQuestion": round(total_time_taken / total_questions, 2) if total_questions > 0 else 0,
        "history": history,
        "moduleInsights": module_insights
    }

