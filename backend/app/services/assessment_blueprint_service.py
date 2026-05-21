from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import (
    AssessmentBlueprint,
    AssessmentBlueprintLesson,
    AssessmentVersion,
    AssessmentQuestion,
    AssessmentQuestionOption,
    AssessmentAssignment,
    AssessmentAttempt,
    AssessmentAttemptAnswer,
    AssessmentReattemptApproval,
    AssessmentResult,
    StudentLevelPromotion,
    Lesson,
    Level,
    Module,
    Student,
    Teacher,
    User,
)

from app.services.assessment_engine_service import (
    RegisterPublishedBlueprintVersion,
)

TOTAL_ASSESSMENT_MARKS = 100.0
PASSING_PERCENTAGE = 70.0
BLUEPRINT_STATUSES = {"DRAFT", "PUBLISHED", "ARCHIVED"}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value):
    if not value:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _safe_json(value: str | None, fallback=None):
    if fallback is None:
        fallback = {}
    if not value:
        return fallback
    try:
        return json.loads(value)
    except Exception:
        return fallback


def get_module_level_or_404(db: Session, module_id: str, level_id: str) -> tuple[Module, Level]:
    module = db.get(Module, module_id)
    if not module or not getattr(module, "is_active", True):
        api_error(404, "MODULE_NOT_FOUND", "Module not found or inactive.")

    level = db.get(Level, level_id)
    if not level or not getattr(level, "is_active", True):
        api_error(404, "LEVEL_NOT_FOUND", "Level not found or inactive.")

    if level.module_id != module.id:
        api_error(400, "LEVEL_MODULE_MISMATCH", "Selected level does not belong to the selected module.")

    return module, level


def active_lessons_for_level(db: Session, level_id: str) -> list[Lesson]:
    return (
        db.query(Lesson)
        .filter(Lesson.level_id == level_id, Lesson.is_active == True)
        .order_by(Lesson.display_order.asc(), Lesson.lesson_number.asc())
        .all()
    )


def validate_distribution(
    db: Session,
    level_id: str,
    total_questions: int,
    lesson_distribution: list[dict[str, Any]],
) -> list[tuple[Lesson, int, dict[str, Any] | None]]:
    if total_questions <= 0:
        api_error(400, "INVALID_TOTAL_QUESTIONS", "Total questions must be greater than zero.")

    lessons = active_lessons_for_level(db, level_id)
    if not lessons:
        api_error(400, "NO_ACTIVE_LESSONS", "This level has no active lessons. Assessment cannot be created.")

    lesson_map = {lesson.id: lesson for lesson in lessons}

    if not lesson_distribution:
        api_error(400, "MISSING_LESSON_DISTRIBUTION", "Lesson-wise question distribution is required.")

    seen = set()
    parsed: list[tuple[Lesson, int, dict[str, Any] | None]] = []

    for item in lesson_distribution:
        lesson_id = str(item.get("lessonId") or item.get("lesson_id") or "").strip()
        question_count = item.get("questionCount", item.get("question_count"))

        if not lesson_id:
            api_error(400, "INVALID_LESSON_DISTRIBUTION", "Every distribution row must include lessonId.")

        if lesson_id in seen:
            api_error(400, "DUPLICATE_LESSON_DISTRIBUTION", "A lesson can appear only once in the assessment distribution.")
        seen.add(lesson_id)

        lesson = lesson_map.get(lesson_id)
        if not lesson:
            api_error(400, "LESSON_NOT_IN_LEVEL", "Every lesson in the distribution must belong to the selected level.")

        try:
            count = int(question_count)
        except Exception:
            api_error(400, "INVALID_QUESTION_COUNT", "Question count must be a number.")

        if count <= 0:
            api_error(400, "INVALID_QUESTION_COUNT", "Each active lesson must contribute at least one question.")

        concept_rule = item.get("conceptRules") or item.get("conceptRule") or item.get("concept_rule")
        if concept_rule is not None and not isinstance(concept_rule, dict):
            api_error(400, "INVALID_CONCEPT_RULE", "conceptRules must be an object when provided.")

        parsed.append((lesson, count, concept_rule))

    missing_lesson_ids = set(lesson_map.keys()) - seen
    if missing_lesson_ids:
        missing_titles = [lesson_map[lesson_id].lesson_title for lesson_id in missing_lesson_ids]
        api_error(
            400,
            "FULL_LEVEL_COVERAGE_REQUIRED",
            "Assessment must include every active lesson in the selected level.",
            {"missingLessons": missing_titles},
        )

    total_from_distribution = sum(count for _, count, _ in parsed)
    if total_from_distribution != total_questions:
        api_error(
            400,
            "QUESTION_DISTRIBUTION_MISMATCH",
            "Sum of lesson-wise questions must equal total questions.",
            {"totalQuestions": total_questions, "distributionTotal": total_from_distribution},
        )

    return parsed


def marks_per_question(total_questions: int) -> float:
    if total_questions <= 0:
        api_error(400, "INVALID_TOTAL_QUESTIONS", "Total questions must be greater than zero.")
    return round(TOTAL_ASSESSMENT_MARKS / total_questions, 4)


def blueprint_payload(db: Session, blueprint: AssessmentBlueprint) -> dict[str, Any]:
    module = db.get(Module, blueprint.module_id)
    level = db.get(Level, blueprint.level_id)
    created_by = db.get(User, blueprint.created_by_user_id) if blueprint.created_by_user_id else None

    rows = (
        db.query(AssessmentBlueprintLesson, Lesson)
        .join(Lesson, AssessmentBlueprintLesson.lesson_id == Lesson.id)
        .filter(AssessmentBlueprintLesson.blueprint_id == blueprint.id)
        .order_by(AssessmentBlueprintLesson.display_order.asc(), Lesson.lesson_number.asc())
        .all()
    )

    distribution = []
    for row, lesson in rows:
        distribution.append(
            {
                "id": row.id,
                "lessonId": lesson.id,
                "lessonNumber": lesson.lesson_number,
                "lessonTitle": lesson.lesson_title,
                "questionCount": row.question_count,
                "displayOrder": row.display_order,
                "conceptRules": _safe_json(row.concept_rule_json, {}),
            }
        )

    VersionCount = db.query(AssessmentVersion).filter(AssessmentVersion.blueprint_id == blueprint.id).count()
    AssignmentCount = db.query(AssessmentAssignment).filter(AssessmentAssignment.blueprint_id == blueprint.id).count()
    ResultCount = db.query(AssessmentResult).filter(AssessmentResult.blueprint_id == blueprint.id).count()
    LatestPublishedVersion = (
        db.query(AssessmentVersion)
        .filter(AssessmentVersion.blueprint_id == blueprint.id, AssessmentVersion.status == "PUBLISHED")
        .order_by(AssessmentVersion.version_number.desc(), AssessmentVersion.created_at.desc())
        .first()
    )

    return {
        "id": blueprint.id,
        "title": blueprint.title,
        "moduleId": blueprint.module_id,
        "moduleCode": module.module_code if module else None,
        "moduleName": module.module_name if module else None,
        "levelId": blueprint.level_id,
        "levelCode": level.level_code if level else None,
        "levelName": level.level_name if level else None,
        "totalQuestions": blueprint.total_questions,
        "totalMarks": blueprint.total_marks,
        "marksPerQuestion": blueprint.marks_per_question,
        "durationSeconds": blueprint.duration_seconds,
        "durationMinutes": round((blueprint.duration_seconds or 0) / 60, 2),
        "passingPercentage": blueprint.passing_percentage,
        "instructions": blueprint.instructions,
        "status": blueprint.status,
        "isPublished": blueprint.status == "PUBLISHED",
        "isArchived": blueprint.status == "ARCHIVED",
        "isActive": blueprint.is_active,
        "createdByUserId": blueprint.created_by_user_id,
        "createdByName": created_by.full_name if created_by else None,
        "publishedAt": _iso(blueprint.published_at),
        "archivedAt": _iso(blueprint.archived_at),
        "createdAt": _iso(blueprint.created_at),
        "updatedAt": _iso(blueprint.updated_at),
        "lessonDistribution": distribution,
        "engineVersionCount": VersionCount,
        "engineAssignmentCount": AssignmentCount,
        "engineResultCount": ResultCount,
        "latestPublishedVersionId": LatestPublishedVersion.id if LatestPublishedVersion else None,
        "latestPublishedVersionNumber": LatestPublishedVersion.version_number if LatestPublishedVersion else None,
        "latestPublishedVersionStatus": LatestPublishedVersion.status if LatestPublishedVersion else None,
        "latestPublishedVersionIsLive": bool(LatestPublishedVersion.is_active) if LatestPublishedVersion else False,
    }


def list_blueprints(db: Session, status: str | None = None, module_id: str | None = None, level_id: str | None = None, include_archived: bool = False) -> list[AssessmentBlueprint]:
    query = db.query(AssessmentBlueprint)

    if not include_archived:
        query = query.filter(AssessmentBlueprint.status != "ARCHIVED", AssessmentBlueprint.is_active == True)

    if status:
        normalized = status.upper()
        if normalized not in BLUEPRINT_STATUSES:
            api_error(400, "INVALID_STATUS", "Invalid assessment blueprint status.")
        query = query.filter(AssessmentBlueprint.status == normalized)

    if module_id:
        query = query.filter(AssessmentBlueprint.module_id == module_id)

    if level_id:
        query = query.filter(AssessmentBlueprint.level_id == level_id)

    return query.order_by(AssessmentBlueprint.created_at.desc()).all()


def create_blueprint(db: Session, *, title: str, module_id: str, level_id: str, total_questions: int, duration_seconds: int, lesson_distribution: list[dict[str, Any]], instructions: str | None, created_by_user_id: str | None, status: str = "DRAFT") -> AssessmentBlueprint:
    title = (title or "").strip()
    if not title:
        api_error(400, "TITLE_REQUIRED", "Assessment title is required.")

    if duration_seconds <= 0:
        api_error(400, "INVALID_DURATION", "Duration must be greater than zero.")

    status = (status or "DRAFT").upper()
    if status not in {"DRAFT", "PUBLISHED"}:
        api_error(400, "INVALID_STATUS", "Assessment can be created only as Draft or Published.")

    get_module_level_or_404(db, module_id, level_id)
    parsed_distribution = validate_distribution(db, level_id, total_questions, lesson_distribution)

    blueprint = AssessmentBlueprint(
        title=title,
        module_id=module_id,
        level_id=level_id,
        total_questions=total_questions,
        total_marks=TOTAL_ASSESSMENT_MARKS,
        marks_per_question=marks_per_question(total_questions),
        duration_seconds=duration_seconds,
        passing_percentage=PASSING_PERCENTAGE,
        instructions=instructions,
        status=status,
        created_by_user_id=created_by_user_id,
        published_at=now_utc() if status == "PUBLISHED" else None,
        is_active=True,
    )

    db.add(blueprint)
    db.flush()

    for display_order, (lesson, count, concept_rule) in enumerate(parsed_distribution, start=1):
        db.add(
            AssessmentBlueprintLesson(
                blueprint_id=blueprint.id,
                lesson_id=lesson.id,
                question_count=count,
                display_order=display_order,
                concept_rule_json=json.dumps(concept_rule or {}),
            )
        )

    # Critical: published assessments immediately generate/publish an assessment version.
    # Persist the lesson distribution rows before the generation engine queries them.
    db.flush()

    if status == "PUBLISHED":
        RegisterPublishedBlueprintVersion(db, blueprint, created_by_user_id)

    db.commit()
    db.refresh(blueprint)
    return blueprint


def update_blueprint(db: Session, blueprint_id: str, *, title: str | None = None, total_questions: int | None = None, duration_seconds: int | None = None, lesson_distribution: list[dict[str, Any]] | None = None, instructions: str | None = None) -> AssessmentBlueprint:
    blueprint = db.get(AssessmentBlueprint, blueprint_id)
    if not blueprint or not blueprint.is_active:
        api_error(404, "ASSESSMENT_BLUEPRINT_NOT_FOUND", "Assessment blueprint not found.")

    if blueprint.status == "PUBLISHED":
        api_error(400, "PUBLISHED_BLUEPRINT_LOCKED", "Published assessments cannot be edited. Archive it and create a new version instead.")

    if blueprint.status == "ARCHIVED":
        api_error(400, "ARCHIVED_BLUEPRINT_LOCKED", "Archived assessments cannot be edited.")

    if title is not None:
        cleaned = title.strip()
        if not cleaned:
            api_error(400, "TITLE_REQUIRED", "Assessment title cannot be blank.")
        blueprint.title = cleaned

    if duration_seconds is not None:
        if duration_seconds <= 0:
            api_error(400, "INVALID_DURATION", "Duration must be greater than zero.")
        blueprint.duration_seconds = duration_seconds

    if instructions is not None:
        blueprint.instructions = instructions

    if total_questions is not None:
        if total_questions <= 0:
            api_error(400, "INVALID_TOTAL_QUESTIONS", "Total questions must be greater than zero.")
        blueprint.total_questions = total_questions
        blueprint.marks_per_question = marks_per_question(total_questions)

    if lesson_distribution is not None:
        parsed_distribution = validate_distribution(db, blueprint.level_id, blueprint.total_questions, lesson_distribution)

        db.query(AssessmentBlueprintLesson).filter(AssessmentBlueprintLesson.blueprint_id == blueprint.id).delete()

        for display_order, (lesson, count, concept_rule) in enumerate(parsed_distribution, start=1):
            db.add(
                AssessmentBlueprintLesson(
                    blueprint_id=blueprint.id,
                    lesson_id=lesson.id,
                    question_count=count,
                    display_order=display_order,
                    concept_rule_json=json.dumps(concept_rule or {}),
                )
            )
        db.flush()

    db.commit()
    db.refresh(blueprint)
    return blueprint


def publish_blueprint(db: Session, blueprint_id: str, published_by_user_id: str | None = None) -> AssessmentBlueprint:
    blueprint = db.get(AssessmentBlueprint, blueprint_id)
    if not blueprint or not blueprint.is_active:
        api_error(404, "ASSESSMENT_BLUEPRINT_NOT_FOUND", "Assessment blueprint not found.")

    if blueprint.status == "ARCHIVED":
        api_error(400, "ARCHIVED_BLUEPRINT_LOCKED", "Archived assessments cannot be published.")

    rows = db.query(AssessmentBlueprintLesson).filter(AssessmentBlueprintLesson.blueprint_id == blueprint.id).all()
    distribution = [{"lessonId": row.lesson_id, "questionCount": row.question_count} for row in rows]
    validate_distribution(db, blueprint.level_id, blueprint.total_questions, distribution)

    blueprint.status = "PUBLISHED"
    blueprint.published_at = blueprint.published_at or now_utc()
    blueprint.archived_at = None
    blueprint.is_active = True
    RegisterPublishedBlueprintVersion(db, blueprint, published_by_user_id)

    db.commit()
    db.refresh(blueprint)
    return blueprint


def archive_blueprint(db: Session, blueprint_id: str) -> AssessmentBlueprint:
    blueprint = db.get(AssessmentBlueprint, blueprint_id)
    if not blueprint:
        api_error(404, "ASSESSMENT_BLUEPRINT_NOT_FOUND", "Assessment blueprint not found.")

    blueprint.status = "ARCHIVED"
    blueprint.archived_at = now_utc()
    blueprint.is_active = False

    db.commit()
    db.refresh(blueprint)
    return blueprint


def delete_blueprint(db: Session, blueprint_id: str) -> dict[str, Any]:
    blueprint = db.get(AssessmentBlueprint, blueprint_id)
    if not blueprint:
        api_error(404, "ASSESSMENT_BLUEPRINT_NOT_FOUND", "Assessment blueprint not found.")

    # Admin delete is intentionally permanent. Archive remains the soft-retention path.
    # Delete removes the assessment structure and every directly related assignment,
    # attempt, result, answer, and re-attempt approval record to avoid orphaned history.
    snapshot = blueprint_payload(db, blueprint)

    version_ids = [row[0] for row in db.query(AssessmentVersion.id).filter(AssessmentVersion.blueprint_id == blueprint.id).all()]
    assignment_ids = [row[0] for row in db.query(AssessmentAssignment.id).filter(AssessmentAssignment.blueprint_id == blueprint.id).all()]
    attempt_ids = []
    question_ids = []

    if version_ids:
        question_ids = [row[0] for row in db.query(AssessmentQuestion.id).filter(AssessmentQuestion.assessment_version_id.in_(version_ids)).all()]
        attempt_ids.extend([row[0] for row in db.query(AssessmentAttempt.id).filter(AssessmentAttempt.assessment_version_id.in_(version_ids)).all()])

    if assignment_ids:
        attempt_ids.extend([row[0] for row in db.query(AssessmentAttempt.id).filter(AssessmentAttempt.assessment_assignment_id.in_(assignment_ids)).all()])

    attempt_ids = list(dict.fromkeys(attempt_ids))

    if assignment_ids:
        db.query(AssessmentReattemptApproval).filter(AssessmentReattemptApproval.assessment_assignment_id.in_(assignment_ids)).delete(synchronize_session=False)
        db.query(StudentLevelPromotion).filter(StudentLevelPromotion.assessment_assignment_id.in_(assignment_ids)).delete(synchronize_session=False)
    if attempt_ids:
        db.query(AssessmentReattemptApproval).filter(AssessmentReattemptApproval.assessment_attempt_id.in_(attempt_ids)).delete(synchronize_session=False)
        db.query(StudentLevelPromotion).filter(StudentLevelPromotion.assessment_attempt_id.in_(attempt_ids)).update({StudentLevelPromotion.assessment_attempt_id: None, StudentLevelPromotion.assessment_result_id: None}, synchronize_session=False)
        db.query(AssessmentAttemptAnswer).filter(AssessmentAttemptAnswer.assessment_attempt_id.in_(attempt_ids)).delete(synchronize_session=False)
        db.query(AssessmentResult).filter(AssessmentResult.assessment_attempt_id.in_(attempt_ids)).delete(synchronize_session=False)

    if assignment_ids:
        db.query(AssessmentResult).filter(AssessmentResult.assessment_assignment_id.in_(assignment_ids)).delete(synchronize_session=False)
    if version_ids:
        db.query(AssessmentResult).filter(AssessmentResult.assessment_version_id.in_(version_ids)).delete(synchronize_session=False)
    db.query(AssessmentResult).filter(AssessmentResult.blueprint_id == blueprint.id).delete(synchronize_session=False)

    if attempt_ids:
        db.query(AssessmentAttempt).filter(AssessmentAttempt.id.in_(attempt_ids)).delete(synchronize_session=False)

    if assignment_ids:
        db.query(AssessmentAssignment).filter(AssessmentAssignment.source_assignment_id.in_(assignment_ids)).update({AssessmentAssignment.source_assignment_id: None}, synchronize_session=False)
        db.query(AssessmentAssignment).filter(AssessmentAssignment.id.in_(assignment_ids)).delete(synchronize_session=False)

    if question_ids:
        db.query(AssessmentAttemptAnswer).filter(AssessmentAttemptAnswer.assessment_question_id.in_(question_ids)).delete(synchronize_session=False)
        db.query(AssessmentQuestionOption).filter(AssessmentQuestionOption.assessment_question_id.in_(question_ids)).delete(synchronize_session=False)
        db.query(AssessmentQuestion).filter(AssessmentQuestion.id.in_(question_ids)).delete(synchronize_session=False)

    if version_ids:
        db.query(AssessmentVersion).filter(AssessmentVersion.id.in_(version_ids)).delete(synchronize_session=False)

    db.query(AssessmentBlueprintLesson).filter(AssessmentBlueprintLesson.blueprint_id == blueprint.id).delete(synchronize_session=False)
    db.delete(blueprint)
    db.commit()
    return snapshot


def teacher_visible_blueprints(db: Session, teacher: Teacher, level_id: str | None = None) -> list[AssessmentBlueprint]:
    user = db.get(User, teacher.user_id)
    teacher_name = user.full_name if user else ""

    student_query = db.query(Student).filter(Student.is_active == True)
    if hasattr(Student, "teacher_id"):
        student_query = student_query.filter((Student.teacher_id == teacher.id) | (Student.teacher == teacher_name))
    else:
        student_query = student_query.filter(Student.teacher == teacher_name)

    students = student_query.all()
    level_ids = {student.current_level_id for student in students if student.current_level_id}
    if level_id:
        if level_id not in level_ids:
            return []
        level_ids = {level_id}

    if not level_ids:
        return []

    return (
        db.query(AssessmentBlueprint)
        .join(AssessmentVersion, AssessmentVersion.blueprint_id == AssessmentBlueprint.id)
        .filter(
            AssessmentBlueprint.level_id.in_(level_ids),
            AssessmentBlueprint.status == "PUBLISHED",
            AssessmentBlueprint.is_active == True,
            AssessmentVersion.status == "PUBLISHED",
            AssessmentVersion.is_active == True,
        )
        .order_by(AssessmentBlueprint.created_at.desc())
        .distinct()
        .all()
    )
