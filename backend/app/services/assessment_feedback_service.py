from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import (
    AssessmentAssignment,
    AssessmentAttempt,
    AssessmentAttemptRemark,
    AssessmentBlueprint,
    Level,
    Module,
    Student,
    Teacher,
    User,
)
from app.services.notification_service import ActiveAdminUsers, CreateNotification

logger = logging.getLogger(__name__)

POSITIVE_TERMS = ("excellent", "brilliant", "great", "good", "well done", "proud", "perfect", "strong", "clear", "accurate", "improved")
MOTIVATION_TERMS = ("keep", "continue", "confidence", "potential", "consistent", "maintain", "speed", "next", "challenge")
PRACTICE_TERMS = ("practice", "revise", "revision", "focus", "mistake", "concept", "again", "strengthen", "improve", "careful")
ATTENTION_TERMS = ("weak", "poor", "careless", "not satisfactory", "struggle", "confused", "below", "needs attention")


def _safe_percentage(attempt: AssessmentAttempt | None) -> float:
    try:
        return max(0.0, min(100.0, float(getattr(attempt, "percentage", 0) or 0)))
    except Exception:
        return 0.0


def score_band_for_attempt(attempt: AssessmentAttempt | None) -> str:
    percentage = _safe_percentage(attempt)
    if percentage >= 90:
        return "EXCELLENCE"
    if percentage >= 70:
        return "BENCHMARK_MET"
    if percentage >= 40:
        return "CONCEPT_REINFORCEMENT"
    return "REVISION_REQUIRED"


def _contains_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(term in text for term in terms)


def classify_assessment_feedback(attempt: AssessmentAttempt | None, remark_text: str | None) -> dict[str, str]:
    text = (remark_text or "").strip().lower()
    score_band = score_band_for_attempt(attempt)

    has_positive = _contains_any(text, POSITIVE_TERMS)
    has_motivation = _contains_any(text, MOTIVATION_TERMS)
    has_practice = _contains_any(text, PRACTICE_TERMS)
    has_attention = _contains_any(text, ATTENTION_TERMS)

    if score_band == "EXCELLENCE":
        if has_practice or has_attention:
            return {
                "scoreBand": score_band,
                "feedbackCategory": "Mastery Growth",
                "feedbackVariant": "MASTERY_GROWTH",
                "feedbackTone": "POSITIVE_GUIDANCE",
                "notificationVariant": "FEEDBACK_MASTERY",
            }
        return {
            "scoreBand": score_band,
            "feedbackCategory": "Excellence",
            "feedbackVariant": "EXCELLENCE",
            "feedbackTone": "CELEBRATION",
            "notificationVariant": "FEEDBACK_EXCELLENT",
        }

    if score_band == "BENCHMARK_MET":
        if has_practice or has_attention:
            return {
                "scoreBand": score_band,
                "feedbackCategory": "Consistent Performance",
                "feedbackVariant": "CONSISTENT_GROWTH",
                "feedbackTone": "CONSTRUCTIVE_POSITIVE",
                "notificationVariant": "FEEDBACK_MASTERY",
            }
        return {
            "scoreBand": score_band,
            "feedbackCategory": "Great Progress",
            "feedbackVariant": "POSITIVE_PROGRESS",
            "feedbackTone": "POSITIVE",
            "notificationVariant": "FEEDBACK_MASTERY",
        }

    if score_band == "CONCEPT_REINFORCEMENT":
        if has_positive or has_motivation:
            return {
                "scoreBand": score_band,
                "feedbackCategory": "Encouraging Practice",
                "feedbackVariant": "ENCOURAGING_PRACTICE",
                "feedbackTone": "ENCOURAGING",
                "notificationVariant": "FEEDBACK_GUIDANCE",
            }
        return {
            "scoreBand": score_band,
            "feedbackCategory": "Concept Reinforcement",
            "feedbackVariant": "CONCEPT_REINFORCEMENT",
            "feedbackTone": "GUIDANCE",
            "notificationVariant": "FEEDBACK_PRACTICE",
        }

    if has_positive or has_motivation:
        return {
            "scoreBand": score_band,
            "feedbackCategory": "Focused Support",
            "feedbackVariant": "FOCUSED_SUPPORT",
            "feedbackTone": "SUPPORTIVE_ATTENTION",
            "notificationVariant": "FEEDBACK_GUIDANCE",
        }
    return {
        "scoreBand": score_band,
        "feedbackCategory": "Revision Required",
        "feedbackVariant": "REVISION_REQUIRED",
        "feedbackTone": "FOCUSED_REVISION",
        "notificationVariant": "FEEDBACK_REVISION",
    }


def _iso(value: Any) -> str | None:
    if not value:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def active_assessment_remark(db: Session, attempt_id: str) -> AssessmentAttemptRemark | None:
    return (
        db.query(AssessmentAttemptRemark)
        .filter(
            AssessmentAttemptRemark.assessment_attempt_id == attempt_id,
            AssessmentAttemptRemark.deleted_at.is_(None),
        )
        .order_by(AssessmentAttemptRemark.updated_at.desc().nullslast(), AssessmentAttemptRemark.created_at.desc())
        .first()
    )


def assessment_feedback_payload(db: Session, remark: AssessmentAttemptRemark | None) -> dict[str, Any] | None:
    if not remark or remark.deleted_at:
        return None
    created_by = db.get(User, remark.created_by_user_id) if remark.created_by_user_id else None
    updated_by = db.get(User, remark.updated_by_user_id) if remark.updated_by_user_id else None
    return {
        "id": remark.id,
        "attemptId": remark.assessment_attempt_id,
        "text": remark.remark_text,
        "feedbackCategory": remark.feedback_category,
        "feedbackVariant": remark.feedback_variant,
        "feedbackTone": remark.feedback_tone,
        "scoreBand": remark.score_band,
        "createdByRole": remark.created_by_role,
        "createdByName": created_by.full_name if created_by else None,
        "updatedByName": updated_by.full_name if updated_by else None,
        "createdAt": _iso(remark.created_at),
        "updatedAt": _iso(remark.updated_at),
    }


def assessment_context(db: Session, attempt: AssessmentAttempt) -> dict[str, Any]:
    assignment = db.get(AssessmentAssignment, attempt.assessment_assignment_id) if attempt.assessment_assignment_id else None
    student = db.get(Student, attempt.student_id) if attempt.student_id else None
    student_user = db.get(User, student.user_id) if student and student.user_id else None
    teacher = db.get(Teacher, assignment.teacher_id) if assignment and assignment.teacher_id else None
    teacher_user = db.get(User, teacher.user_id) if teacher and teacher.user_id else None
    blueprint = db.get(AssessmentBlueprint, assignment.blueprint_id) if assignment and assignment.blueprint_id else None
    module = db.get(Module, blueprint.module_id) if blueprint and blueprint.module_id else None
    level = db.get(Level, blueprint.level_id) if blueprint and blueprint.level_id else None
    module_label = module.module_code if module and module.module_code else module.module_name if module else "Module"
    level_label = level.level_code if level and level.level_code else level.level_name if level else "Level"
    assessment_title = blueprint.title if blueprint and blueprint.title else "Assessment"
    display_context = " • ".join([part for part in [module_label, level_label, assessment_title] if part])
    return {
        "assignment": assignment,
        "student": student,
        "studentUser": student_user,
        "teacher": teacher,
        "teacherUser": teacher_user,
        "blueprint": blueprint,
        "module": module,
        "level": level,
        "moduleLabel": module_label,
        "levelLabel": level_label,
        "assessmentTitle": assessment_title,
        "displayContext": display_context,
        "studentName": student_user.full_name if student_user else (student.student_code if student else "Student"),
        "studentCode": student.student_code if student else None,
    }


def _notification_title_for_variant(variant: str, role: str) -> str:
    if role == "STUDENT":
        if variant == "FEEDBACK_EXCELLENT":
            return "Great Work Feedback Added"
        if variant == "FEEDBACK_REVISION":
            return "Focused Revision Note Added"
        if variant == "FEEDBACK_PRACTICE":
            return "Practice Guidance Added"
        return "Teacher Feedback Added"
    if role == "ADMIN":
        return "Assessment Remark Submitted"
    return "Remark Saved"



def _safe_create_feedback_notification(db: Session, **kwargs: Any) -> None:
    """Create feedback notifications without risking the saved remark transaction.

    Assessment remarks are the source-of-truth workflow. Notifications are secondary
    delivery records. If notification creation ever fails because of optional
    metadata, stale linked ids, or deployment-time schema differences, the remark
    must still save successfully for every current and future assessment attempt.
    """
    try:
        with db.begin_nested():
            CreateNotification(db, **kwargs)
    except Exception:
        logger.exception(
            "Assessment feedback notification creation failed for recipient=%s attempt=%s type=%s",
            kwargs.get("recipient_user_id"),
            kwargs.get("attempt_id"),
            kwargs.get("type"),
        )


def notify_assessment_feedback_saved(
    db: Session,
    *,
    attempt: AssessmentAttempt,
    remark: AssessmentAttemptRemark,
    actor: User,
    action: str = "SAVED",
) -> None:
    context = assessment_context(db, attempt)
    student = context.get("student")
    student_user = context.get("studentUser")
    teacher = context.get("teacher")
    teacher_user = context.get("teacherUser")
    module = context.get("module")
    level = context.get("level")
    assignment = context.get("assignment")
    display_context = context.get("displayContext")
    student_name = context.get("studentName")
    student_code = context.get("studentCode")
    variant = str(classify_assessment_feedback(attempt, remark.remark_text).get("notificationVariant") or "FEEDBACK_GUIDANCE")
    metadata = {
        "remarkId": remark.id,
        "attemptId": attempt.id,
        "assignmentId": assignment.id if assignment else None,
        "feedbackCategory": remark.feedback_category,
        "feedbackVariant": remark.feedback_variant,
        "scoreBand": remark.score_band,
        "studentCode": student_code,
        "moduleCode": context.get("moduleLabel"),
        "levelCode": context.get("levelLabel"),
        "assessmentTitle": context.get("assessmentTitle"),
        "displayContext": display_context,
        "highlightId": remark.id,
        "targetAction": "view-feedback",
        "event": "ASSESSMENT_FEEDBACK_SAVED" if action != "DELETED" else "ASSESSMENT_FEEDBACK_DELETED",
    }

    if action != "DELETED" and student_user:
        _safe_create_feedback_notification(
            db,
            recipient_user_id=student_user.id,
            recipient_role="STUDENT",
            actor_user_id=actor.id,
            actor_role=actor.role,
            student_id=student.id if student else None,
            teacher_id=teacher.id if teacher else None,
            module_id=module.id if module else None,
            level_id=level.id if level else None,
            assessment_id=assignment.id if assignment else None,
            attempt_id=attempt.id,
            type="ASSESSMENT_FEEDBACK_ADDED",
            category="ASSESSMENT_FEEDBACK",
            title=_notification_title_for_variant(variant, "STUDENT"),
            message=f"Feedback is available for {display_context}.",
            target_route=f"/assessment-result/{attempt.id}?viewer=STUDENT&feedback=1",
            color_variant=variant,
            metadata=metadata,
        )

    for admin in ActiveAdminUsers(db):
        if admin.id == actor.id and action != "DELETED":
            continue
        _safe_create_feedback_notification(
            db,
            recipient_user_id=admin.id,
            recipient_role=admin.role,
            actor_user_id=actor.id,
            actor_role=actor.role,
            student_id=student.id if student else None,
            teacher_id=teacher.id if teacher else None,
            module_id=module.id if module else None,
            level_id=level.id if level else None,
            assessment_id=assignment.id if assignment else None,
            attempt_id=attempt.id,
            type="ASSESSMENT_FEEDBACK_DELETED" if action == "DELETED" else "ASSESSMENT_FEEDBACK_SAVED",
            category="ASSESSMENT_FEEDBACK",
            title="Assessment Remark Deleted" if action == "DELETED" else _notification_title_for_variant(variant, "ADMIN"),
            message=f"{actor.full_name} {'deleted' if action == 'DELETED' else 'saved'} remarks for {student_name} — {display_context}.",
            target_route=f"/assessment-result/{attempt.id}?viewer=ADMIN&feedback=1",
            color_variant=variant,
            metadata=metadata,
        )

    if action != "DELETED" and teacher_user and teacher_user.id != actor.id:
        _safe_create_feedback_notification(
            db,
            recipient_user_id=teacher_user.id,
            recipient_role="TEACHER",
            actor_user_id=actor.id,
            actor_role=actor.role,
            student_id=student.id if student else None,
            teacher_id=teacher.id if teacher else None,
            module_id=module.id if module else None,
            level_id=level.id if level else None,
            assessment_id=assignment.id if assignment else None,
            attempt_id=attempt.id,
            type="ASSESSMENT_FEEDBACK_SAVED",
            category="ASSESSMENT_FEEDBACK",
            title=_notification_title_for_variant(variant, "TEACHER"),
            message=f"Remarks were saved for {student_name} — {display_context}.",
            target_route=f"/assessment-result/{attempt.id}?viewer=TEACHER&feedback=1",
            color_variant=variant,
            metadata=metadata,
        )


def upsert_assessment_remark(db: Session, *, attempt: AssessmentAttempt, actor: User, actor_role: str, remark_text: str) -> AssessmentAttemptRemark:
    text = (remark_text or "").strip()
    if len(text) < 3:
        api_error(400, "REMARK_TOO_SHORT", "Please enter a meaningful assessment remark.")
    if len(text) > 1500:
        api_error(400, "REMARK_TOO_LONG", "Assessment remarks must be within 1500 characters.")
    classification = classify_assessment_feedback(attempt, text)
    remark = active_assessment_remark(db, attempt.id)
    if remark:
        remark.remark_text = text
        remark.feedback_category = classification["feedbackCategory"]
        remark.feedback_variant = classification["feedbackVariant"]
        remark.feedback_tone = classification["feedbackTone"]
        remark.score_band = classification["scoreBand"]
        remark.updated_by_user_id = actor.id
    else:
        remark = AssessmentAttemptRemark(
            assessment_attempt_id=attempt.id,
            remark_text=text,
            feedback_category=classification["feedbackCategory"],
            feedback_variant=classification["feedbackVariant"],
            feedback_tone=classification["feedbackTone"],
            score_band=classification["scoreBand"],
            created_by_user_id=actor.id,
            created_by_role=actor_role.upper(),
            updated_by_user_id=actor.id,
        )
        db.add(remark)
    db.flush()
    try:
        notify_assessment_feedback_saved(db, attempt=attempt, remark=remark, actor=actor, action="SAVED")
    except Exception:
        logger.exception("Assessment feedback notification workflow failed after remark save for attempt=%s", attempt.id)
    return remark


def delete_assessment_remark(db: Session, *, attempt: AssessmentAttempt, actor: User) -> AssessmentAttemptRemark:
    remark = active_assessment_remark(db, attempt.id)
    if not remark:
        api_error(404, "ASSESSMENT_REMARK_NOT_FOUND", "Assessment remark was not found.")
    remark.deleted_at = datetime.now(timezone.utc)
    remark.deleted_by_user_id = actor.id
    remark.updated_by_user_id = actor.id
    db.flush()
    try:
        notify_assessment_feedback_saved(db, attempt=attempt, remark=remark, actor=actor, action="DELETED")
    except Exception:
        logger.exception("Assessment feedback notification workflow failed after remark delete for attempt=%s", attempt.id)
    return remark
