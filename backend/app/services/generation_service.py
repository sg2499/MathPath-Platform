import json
from uuid import uuid4
from sqlalchemy.orm import Session
from app.models import DPS, DPSSection, GeneratedQuestionSet, GeneratedQuestion, QuestionOption, Module, Level, Lesson
from app.question_engine.ylm import YLMConfig, generate_ylm_question_set

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

def build_preview_seed(dps: DPS) -> str:
    """Create a fresh Admin preview seed so every preview generation varies while preserving the DPS pattern."""
    return f"ADMIN-PREVIEW-{dps.id}-{uuid4().hex}"


def generate_preview(db: Session, dps: DPS, seed: str | None = None) -> list[dict]:
    seed = seed or build_preview_seed(dps)
    config = build_config_from_dps(db, dps, seed)
    return generate_ylm_question_set(config)

def persist_question_set(db: Session, dps: DPS, assignment_id: str | None, student_id: str, mode: str, seed: str) -> GeneratedQuestionSet:
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
