import json
from sqlalchemy.orm import Session
from app.models import Module, Level, Lesson, DPS, DPSSection
from app.core.errors import api_error

def get_dps_or_404(db: Session, dps_id: str) -> DPS:
    dps = db.get(DPS, dps_id)
    if not dps:
        api_error(404, "NOT_FOUND", "DPS not found.")
    return dps

def dps_config_payload(db: Session, dps_id: str) -> dict:
    dps = get_dps_or_404(db, dps_id)
    lesson = db.get(Lesson, dps.lesson_id)
    level = db.get(Level, lesson.level_id)
    module = db.get(Module, level.module_id)
    sections = db.query(DPSSection).filter(DPSSection.dps_id == dps.id).order_by(DPSSection.section_number).all()
    return {
        "dpsId": dps.id,
        "dpsNumber": dps.dps_number,
        "dpsTitle": dps.dps_title,
        "defaultQuestionCount": dps.default_question_count,
        "defaultDurationSeconds": dps.default_duration_seconds,
        "marksPerQuestion": dps.marks_per_question,
        "labelStyle": dps.label_style,
        "answerType": dps.answer_type,
        "optionsPerQuestion": dps.options_per_question,
        "layoutTemplate": dps.layout_template,
        "moduleCode": module.module_code,
        "levelCode": level.level_code,
        "lessonNumber": lesson.lesson_number,
        "lessonTitle": lesson.lesson_title,
        "sections": [
            {
                "sectionId": s.id,
                "sectionNumber": s.section_number,
                "sectionTitle": s.section_title,
                "questionCount": s.question_count,
                "conceptFamily": s.concept_family,
                "operationFocus": s.operation_focus,
                "abacusRule": s.abacus_rule,
                "targetNumbers": json.loads(s.target_numbers_json or "[]"),
                "placeValue": s.place_value,
                "digitPattern": s.digit_pattern,
                "rowsCount": s.rows_count,
                "allowNegativeOperands": s.allow_negative_operands,
                "allowNegativeAnswer": s.allow_negative_answer,
            }
            for s in sections
        ],
    }
