BENCHMARK_PERCENTAGE = 70.0


def benchmark_payload_from_accuracy(accuracy: float | int | None) -> dict:
    value = float(accuracy or 0)
    below = value < BENCHMARK_PERCENTAGE
    return {
        "benchmarkPercentage": BENCHMARK_PERCENTAGE,
        "benchmarkStatus": "BELOW_BENCHMARK" if below else "PASS",
        "requiresAttention": below,
        "benchmarkMessage": (
            "Caution: This student scored below the minimum benchmark of 70%. Please review the mistakes, provide corrective guidance, and help the student improve."
            if below
            else "Meets the minimum benchmark of 70%."
        ),
    }


def benchmark_payload_for_attempt(attempt) -> dict:
    if not attempt or attempt.accuracy_percentage is None:
        return {
            "benchmarkPercentage": BENCHMARK_PERCENTAGE,
            "benchmarkStatus": "PENDING",
            "requiresAttention": False,
            "benchmarkMessage": "Benchmark will be calculated after submission.",
        }
    return benchmark_payload_from_accuracy(attempt.accuracy_percentage)


import json
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.core.errors import api_error
from app.models import Attempt, AttemptAnswer, GeneratedQuestion, QuestionOption, DPS, DPSSection, Assignment, AssignmentReattemptPermission, Student
from app.services.assignment_service import validate_assignment_access, create_auto_retry_assignment_for_attempt
from app.services.generation_service import build_attempt_question_seed, persist_question_set
from app.services.audit_service import log_event
from app.services.attempt_chain_service import (
    ApplyAttemptChainMetadata,
    BuildAttemptLabel,
    BuildRetryWorkflowPayload,
    UpdateSubmittedAttemptBenchmarkState,
)


def now_utc():
    return datetime.now(timezone.utc)

def _aware(dt):
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

def remaining_seconds(attempt: Attempt) -> int:
    return max(0, int((_aware(attempt.expires_at) - now_utc()).total_seconds()))

def active_reattempt_permission_for_attempt(db: Session, assignment_id: str, student_id: str):
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


def latest_attempt_for_student_assignment(db: Session, assignment_id: str, student_id: str):
    return (
        db.query(Attempt)
        .filter(Attempt.assignment_id == assignment_id, Attempt.student_id == student_id)
        .order_by(Attempt.started_at.desc())
        .first()
    )


def _SectionMarksPerQuestion(section: DPSSection | None, dps_default_marks: float) -> float:
    """A section's own marks_per_question overrides the DPS's flat default when
    set; otherwise every question on the sheet is scored at the DPS's value,
    exactly as before this existed. Today only IM's Concept Drill/Skill
    Stacker sections ever set an override -- every other section in every
    module stays None here and this returns the same value it always has.
    """
    if section is not None and getattr(section, "marks_per_question", None) is not None:
        return float(section.marks_per_question)
    return dps_default_marks


def _ComputeDpsMaxScore(db: Session, dps: DPS) -> float:
    """Sum each section's question_count x its effective marks_per_question.
    Used at attempt creation (before any question set exists yet, so this
    reads section definitions directly rather than generated questions). Falls
    back to the flat DPS-wide calculation if a DPS somehow has no sections."""
    dps_default_marks = float(getattr(dps, "marks_per_question", 1) or 1)
    sections = db.query(DPSSection).filter(DPSSection.dps_id == dps.id).all()
    if not sections:
        return float(dps.default_question_count or 0) * dps_default_marks
    return sum(
        int(section.question_count or 0) * _SectionMarksPerQuestion(section, dps_default_marks)
        for section in sections
    )


def safe_questions_payload(db: Session, attempt: Attempt) -> list[dict]:
    questions = db.query(GeneratedQuestion).filter(GeneratedQuestion.question_set_id == attempt.question_set_id).order_by(GeneratedQuestion.question_number).all()
    answers = {a.question_id: a.selected_option_id for a in db.query(AttemptAnswer).filter(AttemptAnswer.attempt_id == attempt.id).all()}
    dps_sections = db.query(DPSSection).filter(DPSSection.dps_id == attempt.dps_id).order_by(DPSSection.section_number.asc()).all()
    section_count = len(dps_sections)
    section_by_id = {section.id: section for section in dps_sections}
    payload = []
    for q in questions:
        options = db.query(QuestionOption).filter(QuestionOption.question_id == q.id).order_by(QuestionOption.display_order).all()
        metadata = json.loads(q.metadata_json or "{}")
        linked_section = section_by_id.get(q.dps_section_id) if q.dps_section_id else None
        if linked_section:
            metadata.setdefault("section_number", linked_section.section_number)
            metadata.setdefault("section_title", linked_section.section_title)
        metadata.setdefault("dps_total_sections", section_count)
        payload.append({
            "questionId": q.id,
            "questionNumber": q.question_number,
            "displayType": q.display_type,
            "operands": json.loads(q.operands_json or "[]"),
            "operators": json.loads(q.operators_json or "[]"),
            "metadata": metadata,
            "options": [{"optionId": o.id, "label": o.option_label, "value": o.option_value} for o in options],
            "savedOptionId": answers.get(q.id),
        })
    return payload

def start_attempt(db: Session, student, assignment_id: str, dps_id: str, mode: str) -> Attempt:
    assignment = validate_assignment_access(db, student, assignment_id)
    if assignment.dps_id != dps_id:
        api_error(400, "VALIDATION_ERROR", "DPS does not match assignment.")

    reattempt_permission = None
    if not assignment.allow_reattempt:
        existing = latest_attempt_for_student_assignment(db, assignment.id, student.id)
        if existing:
            if existing.status == "IN_PROGRESS":
                return existing

            completed_statuses = ["SUBMITTED", "AUTO_SUBMITTED", "COMPLETED"]
            if existing.status in completed_statuses:
                reattempt_permission = active_reattempt_permission_for_attempt(db, assignment.id, student.id)
                if not reattempt_permission:
                    return existing
            else:
                return existing

    dps = db.get(DPS, dps_id)
    if not dps:
        api_error(404, "NOT_FOUND", "DPS not found.")
    started = now_utc()
    expires = started + timedelta(seconds=dps.default_duration_seconds)
    attempt = Attempt(
        assignment_id=assignment.id,
        dps_id=dps.id,
        student_id=student.id,
        mode=mode,
        status="IN_PROGRESS",
        started_at=started,
        expires_at=expires,
        duration_seconds=dps.default_duration_seconds,
        total_questions=dps.default_question_count,
        max_score=_ComputeDpsMaxScore(db, dps),
    )
    ApplyAttemptChainMetadata(db, attempt, assignment, student.id)
    db.add(attempt)
    db.flush()
    seed = build_attempt_question_seed(dps, assignment, student.id, attempt, started)
    qset = persist_question_set(db, dps, assignment.id, student.id, mode, seed)
    attempt.question_set_id = qset.id

    if reattempt_permission:
        reattempt_permission.status = "USED"
        reattempt_permission.used_at = started
        reattempt_permission.used_assignment_id = assignment.id

    log_event(db, "ATTEMPT_STARTED", student_id=student.id, attempt_id=attempt.id)
    log_event(db, "QUESTION_SET_GENERATED", student_id=student.id, attempt_id=attempt.id, data={"seed": seed})
    db.commit()
    db.refresh(attempt)
    return attempt

def ensure_active_or_auto_submit(db: Session, attempt: Attempt) -> Attempt:
    if attempt.status in ["SUBMITTED", "AUTO_SUBMITTED", "LOCKED", "EXPIRED"]:
        return attempt
    if remaining_seconds(attempt) <= 0:
        return submit_attempt(db, attempt, auto=True)
    return attempt

def get_attempt_for_student(db: Session, student, attempt_id: str) -> Attempt:
    attempt = db.get(Attempt, attempt_id)
    if not attempt or attempt.student_id != student.id:
        api_error(404, "NOT_FOUND", "Attempt not found.")
    return ensure_active_or_auto_submit(db, attempt)

def save_answer(db: Session, student, attempt_id: str, question_id: str, selected_option_id: str):
    attempt = get_attempt_for_student(db, student, attempt_id)
    if attempt.status != "IN_PROGRESS":
        return {"saved": False, "status": attempt.status, "message": "Attempt is no longer active.", "resultAvailable": True}
    question = db.get(GeneratedQuestion, question_id)
    if not question or question.question_set_id != attempt.question_set_id:
        api_error(400, "INVALID_QUESTION", "Question does not belong to this attempt.")
    option = db.get(QuestionOption, selected_option_id)
    if not option or option.question_id != question.id:
        api_error(400, "INVALID_OPTION", "Option does not belong to this question.")
    answer = db.query(AttemptAnswer).filter(AttemptAnswer.attempt_id == attempt.id, AttemptAnswer.question_id == question.id).first()
    if not answer:
        answer = AttemptAnswer(attempt_id=attempt.id, question_id=question.id)
        db.add(answer)
    answer.selected_option_id = option.id
    answer.selected_value = option.option_value
    log_event(db, "ANSWER_SAVED", student_id=student.id, attempt_id=attempt.id, data={"questionId": question.id})
    db.commit()
    answered_count = db.query(AttemptAnswer).filter(AttemptAnswer.attempt_id == attempt.id).count()
    return {"saved": True, "attemptId": attempt.id, "questionId": question.id, "selectedOptionId": option.id, "answeredCount": answered_count, "remainingSeconds": remaining_seconds(attempt)}

def submit_attempt(db: Session, attempt: Attempt, auto: bool = False) -> Attempt:
    if attempt.status in ["SUBMITTED", "AUTO_SUBMITTED"]:
        return attempt
    questions = db.query(GeneratedQuestion).filter(GeneratedQuestion.question_set_id == attempt.question_set_id).all()
    answers = {a.question_id: a for a in db.query(AttemptAnswer).filter(AttemptAnswer.attempt_id == attempt.id).all()}
    # Marks per question comes from each question's own section when that
    # section has an override (e.g. IM's Concept Drill/Skill Stacker, 5 marks
    # each instead of the sheet's flat 1), falling back to the DPS's own
    # configured value otherwise -- every DPS/section that doesn't set an
    # override scores exactly as it always has.
    dps = db.get(DPS, attempt.dps_id)
    dps_default_marks = float(getattr(dps, "marks_per_question", 1) or 1)
    dps_sections = db.query(DPSSection).filter(DPSSection.dps_id == attempt.dps_id).all()
    section_by_id = {section.id: section for section in dps_sections}
    correct = wrong = unanswered = 0
    total_score = 0.0
    max_score = 0.0
    for q in questions:
        section = section_by_id.get(q.dps_section_id) if q.dps_section_id else None
        question_marks = _SectionMarksPerQuestion(section, dps_default_marks)
        max_score += question_marks
        ans = answers.get(q.id)
        if not ans or not ans.selected_option_id:
            unanswered += 1
            continue
        opt = db.get(QuestionOption, ans.selected_option_id)
        if opt and opt.is_correct:
            correct += 1
            ans.is_correct = True
            ans.marks_awarded = question_marks
            total_score += question_marks
        else:
            wrong += 1
            ans.is_correct = False
            ans.marks_awarded = 0
    submitted = now_utc()
    attempt.status = "AUTO_SUBMITTED" if auto else "SUBMITTED"
    attempt.submitted_at = submitted
    attempt.correct_count = correct
    attempt.wrong_count = wrong
    attempt.unanswered_count = unanswered
    attempt.attempted_count = correct + wrong
    attempt.total_score = total_score
    attempt.max_score = max_score
    attempt.accuracy_percentage = round((correct / len(questions)) * 100) if questions else 0
    attempt.time_taken_seconds = attempt.duration_seconds if auto else min(attempt.duration_seconds, int((submitted - _aware(attempt.started_at)).total_seconds()))
    UpdateSubmittedAttemptBenchmarkState(attempt, BENCHMARK_PERCENTAGE)

    source_assignment = db.get(Assignment, attempt.assignment_id) if attempt.assignment_id else None
    retry_assignment = None
    if source_assignment is not None:
        retry_assignment = create_auto_retry_assignment_for_attempt(
            db,
            submitted_attempt=attempt,
            source_assignment=source_assignment,
        )
        if retry_assignment is not None:
            log_event(
                db,
                "AUTO_RETRY_ASSIGNMENT_CREATED",
                student_id=attempt.student_id,
                attempt_id=attempt.id,
                data={
                    "assignmentId": retry_assignment.id,
                    "attemptGroupId": retry_assignment.attempt_group_id,
                    "retryAttemptNumber": retry_assignment.retry_attempt_number,
                },
            )

    log_event(db, "AUTO_SUBMITTED" if auto else "ATTEMPT_SUBMITTED", student_id=attempt.student_id, attempt_id=attempt.id)
    db.commit()
    db.refresh(attempt)

    _process_attempt_notification_side_effects(db, attempt, retry_assignment)
    _process_attempt_gamification_side_effects(db, attempt)

    return attempt


def _process_attempt_notification_side_effects(db: Session, attempt: Attempt, retry_assignment) -> None:
    """Completion notification for a just-graded practice/DPS attempt, plus its
    retry-assignment notification if one was created this call.

    Safe to call from any code path that just completed an attempt -- the
    explicit /attempts/{id}/submit and /attempts/{id}/auto-submit routes, or
    the lazy GET-triggered auto-submit in ensure_active_or_auto_submit() --
    since it atomically claims the attempt via notification_processed_at
    before doing any work. If two requests somehow race to complete the same
    attempt, only one of them actually notifies anyone.

    Background: before this existed, NotifyPracticeAttemptSubmitted() and the
    retry-assignment notification only ever got called from the two explicit
    route handlers, never from submit_attempt() itself. Any attempt completed
    via the lazy path (timer expired while the student's tab was backgrounded
    or closed, then a plain GET detected it) got graded correctly, but the
    student, teacher, and admin were never notified -- the exact same bug
    class as the pre-round-9 competition mock exam bug, just never caught
    because nobody was cross-checking practice sheet notification
    completeness. See the matching Alembic migration for the full history.
    """
    from sqlalchemy import update as _sa_update

    claim = db.execute(
        _sa_update(Attempt)
        .where(
            Attempt.id == attempt.id,
            Attempt.notification_processed_at.is_(None),
        )
        .values(notification_processed_at=now_utc())
    )
    db.commit()
    if claim.rowcount == 0:
        return

    try:
        from app.services.practice_notification_service import (
            NotifyPracticeAssignmentsCreated,
            NotifyPracticeAttemptSubmitted,
        )

        NotifyPracticeAttemptSubmitted(db, attempt_id=attempt.id)
        if retry_assignment is not None:
            NotifyPracticeAssignmentsCreated(
                db,
                assignment_ids=[retry_assignment.id],
                actor_user_id=retry_assignment.assigned_by_user_id,
            )
        db.commit()
    except Exception as e:
        db.rollback()
        import logging
        logging.error(f"Failed to send completion notifications for attempt {attempt.id}: {e}")


def _process_attempt_gamification_side_effects(db: Session, attempt: Attempt) -> dict | None:
    """XP + coin award for a just-graded practice/DPS attempt.

    Same atomic-claim shape as _process_attempt_notification_side_effects()
    above, but gated by its own gamification_processed_at column so the two
    guards can never block or race each other -- an attempt's notification
    and its economy award are independent, each processed exactly once,
    regardless of which code path first completes the attempt.

    Uses EconomyService.evaluate_activity_performance(), the same formula
    shared by assessments and mock exams -- see that function's docstring
    for why reward is based on the DPS's allotted duration rather than the
    student's actual time taken.
    """
    from sqlalchemy import update as _sa_update

    claim = db.execute(
        _sa_update(Attempt)
        .where(
            Attempt.id == attempt.id,
            Attempt.gamification_processed_at.is_(None),
        )
        .values(gamification_processed_at=now_utc())
    )
    db.commit()
    if claim.rowcount == 0:
        return None

    try:
        from app.services.economy_service import EconomyService

        student = db.get(Student, attempt.student_id)
        if not student:
            return None
        return EconomyService.evaluate_activity_performance(
            db=db,
            user_id=student.user_id,
            accuracy_percent=float(attempt.accuracy_percentage or 0),
            activity_type="DPS",
            duration_seconds=attempt.duration_seconds,
            reference_id=attempt.id,
        )
    except Exception as e:
        db.rollback()
        import logging
        logging.error(f"Failed to award economy for attempt {attempt.id}: {e}")
        return None


def latest_retry_assignment_for_attempt(db: Session, attempt: Attempt):
    attempt_group_id = getattr(attempt, "attempt_group_id", None)
    student_id = getattr(attempt, "student_id", None)
    next_retry_number = int(getattr(attempt, "attempt_number", 0) or 0) + 1
    if not attempt_group_id or not student_id:
        return None
    return (
        db.query(Assignment)
        .filter(
            Assignment.attempt_group_id == attempt_group_id,
            Assignment.assigned_to_type == "STUDENT",
            Assignment.assigned_to_id == student_id,
            Assignment.retry_attempt_number == next_retry_number,
            Assignment.is_active == True,
        )
        .order_by(Assignment.created_at.desc())
        .first()
    )


def _safe_float(value, fallback: float = 0.0) -> float:
    try:
        if value is None:
            return fallback
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _safe_int(value, fallback: int = 0) -> int:
    try:
        if value is None:
            return fallback
        return int(float(value))
    except (TypeError, ValueError):
        return fallback


def result_payload(db: Session, attempt: Attempt, include_review: bool = True) -> dict:
    questions_review = []
    if include_review:
        questions = db.query(GeneratedQuestion).filter(GeneratedQuestion.question_set_id == attempt.question_set_id).order_by(GeneratedQuestion.question_number).all()
        answers = {a.question_id: a for a in db.query(AttemptAnswer).filter(AttemptAnswer.attempt_id == attempt.id).all()}
        for q in questions:
            options = db.query(QuestionOption).filter(QuestionOption.question_id == q.id).order_by(QuestionOption.display_order).all()
            selected = answers.get(q.id)
            selected_option = db.get(QuestionOption, selected.selected_option_id) if selected and selected.selected_option_id else None
            correct_option = next((o for o in options if o.is_correct), None)
            questions_review.append({
                "questionNumber": q.question_number,
                "questionId": q.id,
                "displayType": q.display_type,
                "operands": json.loads(q.operands_json or "[]"),
                "operators": json.loads(q.operators_json or "[]"),
                "selectedOption": {"label": selected_option.option_label, "value": selected_option.option_value} if selected_option else None,
                "correctOption": {"label": correct_option.option_label, "value": correct_option.option_value} if correct_option else None,
                "isCorrect": bool(selected.is_correct) if selected else False,
            })
    retry_assignment = latest_retry_assignment_for_attempt(db, attempt)
    retry_workflow = BuildRetryWorkflowPayload(attempt, retry_assignment)

    previous_attempt = None
    attempt_group_id = getattr(attempt, "attempt_group_id", None)
    attempt_number = int(getattr(attempt, "attempt_number", 0) or 0)
    if attempt_group_id and getattr(attempt, "student_id", None) and attempt_number > 0:
        previous_attempt = (
            db.query(Attempt)
            .filter(
                Attempt.attempt_group_id == attempt_group_id,
                Attempt.student_id == attempt.student_id,
                Attempt.id != attempt.id,
                Attempt.attempt_number < attempt_number,
            )
            .order_by(Attempt.attempt_number.desc(), Attempt.submitted_at.desc().nullslast(), Attempt.started_at.desc())
            .first()
        )
    if previous_attempt:
        retry_workflow["previousAccuracyPercentage"] = previous_attempt.accuracy_percentage
        retry_workflow["previousScore"] = previous_attempt.total_score
        retry_workflow["accuracyDelta"] = round(float(attempt.accuracy_percentage or 0) - float(previous_attempt.accuracy_percentage or 0))

    SummaryAccuracy = _safe_float(getattr(attempt, "accuracy_percentage", None), 0.0)
    SummaryScore = _safe_float(getattr(attempt, "total_score", None), 0.0)
    SummaryMaxScore = _safe_float(getattr(attempt, "max_score", None), 0.0)
    BenchmarkPayload = benchmark_payload_for_attempt(attempt)

    return {
        "attemptId": attempt.id,
        "attemptGroupId": getattr(attempt, "attempt_group_id", None),
        "attemptNumber": _safe_int(getattr(attempt, "attempt_number", 0), 0),
        "attemptLabel": BuildAttemptLabel(getattr(attempt, "attempt_number", 0)),
        "attemptSource": getattr(attempt, "attempt_source", None),
        "requiresManualIntervention": bool(getattr(attempt, "requires_manual_intervention", False)),
        "benchmarkState": getattr(attempt, "benchmark_status", None),
        "status": attempt.status,
        "summary": {
            "totalQuestions": _safe_int(getattr(attempt, "total_questions", 0), 0),
            "attempted": _safe_int(getattr(attempt, "attempted_count", 0), 0),
            "correct": _safe_int(getattr(attempt, "correct_count", 0), 0),
            "wrong": _safe_int(getattr(attempt, "wrong_count", 0), 0),
            "unanswered": _safe_int(getattr(attempt, "unanswered_count", 0), 0),
            "score": SummaryScore,
            "maxScore": SummaryMaxScore,
            "accuracyPercentage": SummaryAccuracy,
            "timeTakenSeconds": _safe_int(getattr(attempt, "time_taken_seconds", 0), 0),
            **BenchmarkPayload,
        },
        **BenchmarkPayload,
        "questionReview": questions_review,
        "retryWorkflow": retry_workflow,
        "message": retry_workflow.get("message") or ("Excellent work!" if SummaryAccuracy >= 90 else "Good effort. Keep practicing!"),
    }
