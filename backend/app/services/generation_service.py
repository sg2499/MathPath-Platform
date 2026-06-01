import json
from uuid import uuid4
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models import DPS, DPSSection, GeneratedQuestionSet, GeneratedQuestion, QuestionOption, Module, Level, Lesson
from app.question_engine.ylm import YLMConfig, generate_ylm_question_set
from app.core.errors import api_error

def build_config_from_dps(db: Session, dps: DPS, seed: str) -> YLMConfig:
    lesson = db.get(Lesson, dps.lesson_id)
    level = db.get(Level, lesson.level_id)
    module = db.get(Module, level.module_id)
    section = db.query(DPSSection).filter(DPSSection.dps_id == dps.id).order_by(DPSSection.section_number).first()
    return YLMConfig(
        module_code=module.module_code,
        level_code=level.level_code,
        lesson_number=lesson.lesson_number,
        dps_number=dps.dps_number,
        question_count=dps.default_question_count,
        rows=section.rows_count or 3,
        concept_family=section.concept_family,
        operation_focus=section.operation_focus or "ADD_LESS",
        abacus_rule=section.abacus_rule,
        target_numbers=json.loads(section.target_numbers_json or "[]"),
        place_value=section.place_value or "MIXED",
        digit_pattern=section.digit_pattern or "1D_AND_2D",
        allow_negative_operands=section.allow_negative_operands,
        allow_negative_answer=section.allow_negative_answer,
        seed=seed,
    )


def build_attempt_question_seed(dps: DPS, assignment, student_id: str, attempt, started_at) -> str:
    """Build the question seed for a student attempt.

    Original published DPS attempts may continue to use the published seed so existing
    live behavior stays stable. Retry attempts intentionally receive a fresh seed tied
    to the attempt chain/attempt number so the student receives a different question
    set for the same DPS concept.
    """
    AssignmentSource = getattr(assignment, "assignment_source", "ORIGINAL") if assignment else "ORIGINAL"
    RetryAttemptNumber = int(getattr(assignment, "retry_attempt_number", 0) or 0) if assignment else 0
    AttemptNumber = int(getattr(attempt, "attempt_number", RetryAttemptNumber) or 0) if attempt else RetryAttemptNumber
    PublishedSeed = getattr(dps, "published_seed", None)

    if AssignmentSource == "ORIGINAL" and RetryAttemptNumber <= 0 and AttemptNumber <= 0 and PublishedSeed:
        return PublishedSeed

    Timestamp = int((started_at or datetime.now(timezone.utc)).timestamp())
    AttemptId = getattr(attempt, "id", None) or uuid4().hex
    AssignmentId = getattr(assignment, "id", None) or "NO-ASSIGNMENT"
    AttemptGroupId = getattr(attempt, "attempt_group_id", None) or getattr(assignment, "attempt_group_id", None) or AssignmentId
    return (
        f"YLM-RETRY-{dps.id}-{student_id}-{AttemptGroupId}-"
        f"ASSIGNMENT-{AssignmentId}-ATTEMPT-{AttemptNumber}-"
        f"SOURCE-{AssignmentSource}-{AttemptId}-{Timestamp}"
    )

def build_preview_seed(dps: DPS) -> str:
    """Create a fresh Admin preview seed so every preview generation varies while preserving the DPS pattern."""
    return f"ADMIN-PREVIEW-{dps.id}-{uuid4().hex}"


def _is_dynamic_generator_supported(db: Session, dps: DPS) -> bool:
    lesson = db.get(Lesson, dps.lesson_id)
    level = db.get(Level, lesson.level_id) if lesson else None
    module = db.get(Module, level.module_id) if level else None
    return str(getattr(module, "module_code", "") or "").upper() == "YLM"


def _unsupported_static_message(db: Session, dps: DPS) -> str:
    lesson = db.get(Lesson, dps.lesson_id)
    level = db.get(Level, lesson.level_id) if lesson else None
    module = db.get(Module, level.module_id) if level else None
    module_code = str(getattr(module, "module_code", "") or "Module").upper()
    level_code = str(getattr(level, "level_code", "") or "Level")
    lesson_number = getattr(lesson, "lesson_number", "-")
    return (
        f"{module_code} {level_code} Lesson {lesson_number} is seeded as a static worksheet reference. "
        "Dynamic question generation is currently enabled only for YLM. "
        "Do not publish or assign this DPS until the matching module generator/static-render workflow is implemented."
    )


def generate_preview(db: Session, dps: DPS, seed: str | None = None) -> list[dict]:
    if not _is_dynamic_generator_supported(db, dps):
        api_error(400, "STATIC_WORKSHEET_GENERATION_NOT_AVAILABLE", _unsupported_static_message(db, dps))
    seed = seed or build_preview_seed(dps)
    config = build_config_from_dps(db, dps, seed)
    return generate_ylm_question_set(config)

def persist_question_set(db: Session, dps: DPS, assignment_id: str | None, student_id: str, mode: str, seed: str) -> GeneratedQuestionSet:
    if not _is_dynamic_generator_supported(db, dps):
        api_error(400, "STATIC_WORKSHEET_GENERATION_NOT_AVAILABLE", _unsupported_static_message(db, dps))
    section = db.query(DPSSection).filter(DPSSection.dps_id == dps.id).order_by(DPSSection.section_number).first()
    config = build_config_from_dps(db, dps, seed)
    generated = generate_ylm_question_set(config)
    qset = GeneratedQuestionSet(assignment_id=assignment_id, dps_id=dps.id, student_id=student_id, mode=mode, seed=seed)
    db.add(qset)
    db.flush()
    for q in generated:
        gq = GeneratedQuestion(
            question_set_id=qset.id,
            dps_section_id=section.id if section else None,
            question_number=q["question_number"],
            display_type=q["display_type"],
            operands_json=json.dumps(q["operands"]),
            operators_json=json.dumps(q["operators"]),
            correct_answer=str(q["correct_answer"]),
            seed=q["seed"],
            metadata_json=json.dumps(q["metadata"]),
        )
        db.add(gq)
        db.flush()
        for opt in q["options"]:
            db.add(QuestionOption(
                question_id=gq.id,
                option_label=opt["label"],
                option_value=str(opt["value"]),
                is_correct=opt["is_correct"],
                display_order=opt["display_order"],
            ))
    return qset
