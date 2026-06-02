import json
from uuid import uuid4
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models import DPS, DPSSection, GeneratedQuestionSet, GeneratedQuestion, QuestionOption, Module, Level, Lesson
from app.question_engine.ylm import YLMConfig, generate_ylm_question_set
from app.question_engine.mm import MMConfig, ClassifyMmConcept, GenerateMmQuestionSet, IsPackage1Supported, OperationFocusForConcept
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


def build_mm_config_from_dps(db: Session, dps: DPS, seed: str) -> MMConfig:
    LessonRecord = db.get(Lesson, dps.lesson_id)
    LevelRecord = db.get(Level, LessonRecord.level_id) if LessonRecord else None
    ModuleRecord = db.get(Module, LevelRecord.module_id) if LevelRecord else None
    SectionRecord = (
        db.query(DPSSection)
        .filter(DPSSection.dps_id == dps.id)
        .order_by(DPSSection.section_number)
        .first()
    )
    GeneratorConfig = {}
    if SectionRecord and SectionRecord.generator_config_json:
        try:
            GeneratorConfig = json.loads(SectionRecord.generator_config_json or "{}")
        except Exception:
            GeneratorConfig = {}

    DpsTitle = getattr(dps, "dps_title", "") or GeneratorConfig.get("dpsTitle", "")
    LessonTitle = getattr(LessonRecord, "lesson_title", "") or GeneratorConfig.get("lessonTitle", "")
    ConceptFamily = ClassifyMmConcept(DpsTitle, LessonTitle)
    OperationFocus = OperationFocusForConcept(ConceptFamily)

    return MMConfig(
        ModuleCode=getattr(ModuleRecord, "module_code", "MM") or "MM",
        LevelCode=getattr(LevelRecord, "level_code", "MM-L1") or "MM-L1",
        LessonNumber=int(getattr(LessonRecord, "lesson_number", 0) or 0),
        DpsNumber=int(getattr(dps, "dps_number", 0) or 0),
        DpsTitle=DpsTitle,
        LessonTitle=LessonTitle,
        QuestionCount=int(getattr(dps, "default_question_count", 20) or 20),
        Seed=seed,
        ConceptFamily=ConceptFamily,
        OperationFocus=OperationFocus,
        DigitPattern=getattr(SectionRecord, "digit_pattern", "MASTER_MODULE") if SectionRecord else "MASTER_MODULE",
        Difficulty=getattr(SectionRecord, "difficulty", "MASTER") if SectionRecord else "MASTER",
        GeneratorConfig=GeneratorConfig,
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


def _module_code_for_dps(db: Session, dps: DPS) -> str:
    LessonRecord = db.get(Lesson, dps.lesson_id)
    LevelRecord = db.get(Level, LessonRecord.level_id) if LessonRecord else None
    ModuleRecord = db.get(Module, LevelRecord.module_id) if LevelRecord else None
    return str(getattr(ModuleRecord, "module_code", "") or "").upper()


def _is_dynamic_generator_supported(db: Session, dps: DPS) -> bool:
    ModuleCode = _module_code_for_dps(db, dps)
    if ModuleCode == "YLM":
        return True
    if ModuleCode == "MM":
        Config = build_mm_config_from_dps(db, dps, build_preview_seed(dps))
        return IsPackage1Supported(Config.ConceptFamily)
    return False


def _unsupported_static_message(db: Session, dps: DPS) -> str:
    LessonRecord = db.get(Lesson, dps.lesson_id)
    LevelRecord = db.get(Level, LessonRecord.level_id) if LessonRecord else None
    ModuleRecord = db.get(Module, LevelRecord.module_id) if LevelRecord else None
    ModuleCode = str(getattr(ModuleRecord, "module_code", "") or "Module").upper()
    LevelCode = str(getattr(LevelRecord, "level_code", "") or "Level")
    LessonNumber = getattr(LessonRecord, "lesson_number", "-")
    DpsTitle = getattr(dps, "dps_title", "") or "selected DPS"
    if ModuleCode == "MM":
        return (
            f"{ModuleCode} {LevelCode} Lesson {LessonNumber} / {DpsTitle} is not part of the active MM generator package yet. "
            "Active MM generator packages currently support decimal add-less, decimal multiplication/division, whole-number multiplication/division digit patterns, integers, BODMAS, and percentage practice."
        )
    return (
        f"{ModuleCode} {LevelCode} Lesson {LessonNumber} is not connected to a dynamic question generator yet."
    )


def generate_preview(db: Session, dps: DPS, seed: str | None = None) -> list[dict]:
    if not _is_dynamic_generator_supported(db, dps):
        api_error(400, "DYNAMIC_GENERATION_NOT_AVAILABLE", _unsupported_static_message(db, dps))
    seed = seed or build_preview_seed(dps)
    ModuleCode = _module_code_for_dps(db, dps)
    if ModuleCode == "MM":
        Config = build_mm_config_from_dps(db, dps, seed)
        return GenerateMmQuestionSet(Config)
    config = build_config_from_dps(db, dps, seed)
    return generate_ylm_question_set(config)

def persist_question_set(db: Session, dps: DPS, assignment_id: str | None, student_id: str, mode: str, seed: str) -> GeneratedQuestionSet:
    if not _is_dynamic_generator_supported(db, dps):
        api_error(400, "DYNAMIC_GENERATION_NOT_AVAILABLE", _unsupported_static_message(db, dps))
    sections = db.query(DPSSection).filter(DPSSection.dps_id == dps.id).order_by(DPSSection.section_number).all()
    section_by_number = {int(getattr(section, "section_number", 1) or 1): section for section in sections}
    section = sections[0] if sections else None
    ModuleCode = _module_code_for_dps(db, dps)
    if ModuleCode == "MM":
        Config = build_mm_config_from_dps(db, dps, seed)
        generated = GenerateMmQuestionSet(Config)
    else:
        config = build_config_from_dps(db, dps, seed)
        generated = generate_ylm_question_set(config)
    qset = GeneratedQuestionSet(assignment_id=assignment_id, dps_id=dps.id, student_id=student_id, mode=mode, seed=seed)
    db.add(qset)
    db.flush()
    for q in generated:
        Metadata = q.get("metadata") or {}
        SectionNumber = int(Metadata.get("section_number") or 1)
        LinkedSection = section_by_number.get(SectionNumber) or section
        gq = GeneratedQuestion(
            question_set_id=qset.id,
            dps_section_id=LinkedSection.id if LinkedSection else None,
            question_number=q["question_number"],
            display_type=q["display_type"],
            question_text=q.get("question_text"),
            operands_json=json.dumps(q["operands"]),
            operators_json=json.dumps(q["operators"]),
            correct_answer=str(q["correct_answer"]),
            seed=q["seed"],
            metadata_json=json.dumps(Metadata),
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
