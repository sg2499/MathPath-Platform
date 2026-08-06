import json
from sqlalchemy.orm import Session

from app.models import Module, Level, Lesson, DPS, DPSSection
from app.seed.preparatory_module_l3_config import (
    PM_L3_LESSONS,
    PmL3DpsRule,
    PmL3DpsBlock,
    ADD_LESS,
    MULTIPLY,
    DIVIDE,
    BODMAS,
    CONCEPT_DRILL_MULTIPLY,
    CONCEPT_DRILL_DIVIDE,
)

MODULE_CODE = "PM"
LEVEL_CODE = "PM-L3"
MODULE_DISPLAY_ORDER = 2

CONCEPT_DRILL_MARKS_PER_QUESTION = 5.0

LESSON_TITLES = {
    1: "Add/Less (Abacus) & Introduction to 2D X 1D Multiplication",
    2: "Add/Less (Abacus), 2D 4R & 2D X 1D Multiplication",
    3: "Add/Less (Abacus), 3D & 2D Combined Rows & 2D X 1D Multiplication",
    4: "Add/Less (Abacus), 3D & 2D Combined Rows, BODMAS & 2D X 1D Multiplication",
    5: "Add/Less 2D 4R (Visual), 3D 4R (Abacus) & BODMAS",
    6: "Add/Less 3D 4R (Abacus), 2D X 1D Multiplication & BODMAS",
    7: "2D X 1D Multiplication, Add/Less 3D 4R (Abacus) & Concept Drill",
    8: "2D X 1D Multiplication, Add/Less (Abacus/Visual) & Concept Drill",
    9: "Add/Less 3D 4R (Abacus), 2D X 1D Multiplication & Concept Drill",
    10: "Add/Less 3D 3R (Abacus), 3D ÷ 1D Division, 2D X 1D Multiplication & BODMAS",
    11: "Add/Less (Visual), BODMAS, 2D X 1D Multiplication & Concept Drill",
    12: "Add/Less 3D 3R (Abacus), 2D X 1D Multiplication, BODMAS & Concept Drill",
}


def _practice_mode_suffix(practice_mode: str | None) -> str:
    mode = (practice_mode or "ABACUS").upper()
    return "(Visual)" if mode == "VISUAL" else "(Abacus)"


def _titled(base_title: str, practice_mode: str | None) -> str:
    suffix = _practice_mode_suffix(practice_mode)
    mode_word = suffix.strip("()")
    if mode_word.lower() in base_title.lower():
        return base_title
    return f"{base_title} {suffix}"


def _ensure_module(db: Session) -> Module:
    module = db.query(Module).filter(Module.module_code == MODULE_CODE).first()
    if not module:
        module = Module(
            module_code=MODULE_CODE,
            module_name="Preparatory Module",
            description="Preparatory Module for MathPath Abacus learning.",
            display_order=MODULE_DISPLAY_ORDER,
            is_active=True,
        )
        db.add(module)
        db.flush()
    else:
        module.module_name = module.module_name or "Preparatory Module"
        module.description = module.description or "Preparatory Module for MathPath Abacus learning."
        module.display_order = module.display_order or MODULE_DISPLAY_ORDER
        module.is_active = True
    return module


def _ensure_level(db: Session, module: Module) -> Level:
    level = db.query(Level).filter(Level.module_id == module.id, Level.level_code == LEVEL_CODE).first()
    if not level:
        level = Level(
            module_id=module.id,
            level_code=LEVEL_CODE,
            level_name="Preparatory Level 3",
            internal_level_number=3,
            display_order=3,
            is_active=True,
        )
        db.add(level)
        db.flush()
    else:
        level.level_name = level.level_name or "Preparatory Level 3"
        level.internal_level_number = 3
        level.display_order = 3
        level.is_active = True
    return level


def _ensure_lesson(db: Session, level: Level, lesson_number: int, lesson_title: str) -> Lesson:
    lesson = (
        db.query(Lesson)
        .filter(Lesson.level_id == level.id, Lesson.lesson_number == lesson_number)
        .first()
    )
    if not lesson:
        lesson = Lesson(
            level_id=level.id,
            lesson_number=lesson_number,
            lesson_title=lesson_title,
            description="PM-L3 lesson reproduced from PL3.xlsx (12 authoritative lesson sheets) -- concept, technique, digit width, and operand ranges match the workbook; question values are generated fresh per publish/attempt via question_engine/pm_l3, PM-L3's own dedicated engine.",
            display_order=lesson_number,
            is_active=True,
        )
        db.add(lesson)
        db.flush()
    else:
        lesson.lesson_title = lesson_title
        lesson.description = lesson.description or "PM-L3 lesson reproduced from PL3.xlsx (12 authoritative lesson sheets) -- concept, technique, digit width, and operand ranges match the workbook; question values are generated fresh per publish/attempt via question_engine/pm_l3, PM-L3's own dedicated engine."
        lesson.display_order = lesson_number
        lesson.is_active = True
    return lesson


def _ensure_dps(db: Session, lesson: Lesson, dps_number: int, dps_title: str, question_count: int) -> DPS:
    dps = db.query(DPS).filter(DPS.lesson_id == lesson.id, DPS.dps_number == dps_number).first()
    if not dps:
        dps = DPS(
            lesson_id=lesson.id,
            dps_number=dps_number,
            dps_title=dps_title,
            default_question_count=question_count,
            default_duration_seconds=600 if question_count <= 10 else 1200,
            marks_per_question=1.0,
            publication_status="DRAFT",
            published_seed=None,
            published_at=None,
            published_by_user_id=None,
            is_active=True,
        )
        db.add(dps)
        db.flush()
    else:
        dps.dps_title = dps_title
        dps.default_question_count = question_count
        dps.default_duration_seconds = 600 if question_count <= 10 else 1200
        # Never touch publication_status here -- Admin (Learning Path Studio)
        # is the only publisher, same rule PM-L1/PM-L2's seeds follow.
        dps.is_active = True
    return dps


def _block_concept_family(block: PmL3DpsBlock) -> str:
    return {
        ADD_LESS: "DIRECT_ADD_LESS",
        MULTIPLY: "PM_L3_MULTIPLICATION",
        DIVIDE: "PM_L3_DIVISION",
        BODMAS: "BODMAS",
        CONCEPT_DRILL_MULTIPLY: "CONCEPT_DRILL",
        CONCEPT_DRILL_DIVIDE: "CONCEPT_DRILL",
    }[block.kind]


def _block_marks(block: PmL3DpsBlock) -> float:
    return CONCEPT_DRILL_MARKS_PER_QUESTION if block.kind in (CONCEPT_DRILL_MULTIPLY, CONCEPT_DRILL_DIVIDE) else 1.0


def _block_generator_config(lesson_number: int, dps_number: int, lesson_title: str, block: PmL3DpsBlock) -> dict:
    base = {
        "lessonNumber": lesson_number,
        "dpsNumber": dps_number,
        "lessonTitle": lesson_title,
        "dpsTitle": block.title,
        "blockKind": block.kind,
        "questionCount": block.question_count,
        "sourceCurriculum": "PM_L3_PL3_XLSX",
    }
    if block.kind == ADD_LESS:
        base.update({
            "digitPattern": block.digit_pattern,
            "digitPatternSecondHalf": block.digit_pattern_second_half,
            "rows": block.rows,
            "rowsSecondHalf": block.rows_second_half,
            "generationTemplate": block.generation_template,
            "revisionTemplates": list(block.revision_templates),
            "targetNumbers": list(block.target_numbers),
            "practiceMode": block.practice_mode,
        })
    elif block.kind == MULTIPLY:
        base.update({
            "numberMin": block.number_min, "numberMax": block.number_max,
            "multiplierMin": block.multiplier_min, "multiplierMax": block.multiplier_max,
            "practiceMode": block.practice_mode,
        })
    elif block.kind == DIVIDE:
        base.update({
            "divisorMin": block.divisor_min, "divisorMax": block.divisor_max,
            "dividendMin": block.dividend_min, "dividendMax": block.dividend_max,
        })
    elif block.kind == BODMAS:
        base.update({"bodmasTemplate": block.bodmas_template})
    elif block.kind == CONCEPT_DRILL_MULTIPLY:
        base.update({"addMin": block.add_min, "addMax": block.add_max, "timesValue": block.times_value})
    elif block.kind == CONCEPT_DRILL_DIVIDE:
        base.update({"fromMin": block.from_min, "fromMax": block.from_max, "lessMin": block.less_min, "lessMax": block.less_max})
    return base


def _ensure_section(db: Session, dps: DPS, lesson_number: int, dps_number: int, lesson_title: str, block: PmL3DpsBlock, section_number: int) -> None:
    section = db.query(DPSSection).filter(DPSSection.dps_id == dps.id, DPSSection.section_number == section_number).first()
    if not section:
        section = DPSSection(
            dps_id=dps.id,
            section_number=section_number,
            section_title=block.title,
            question_count=block.question_count,
            concept_family=_block_concept_family(block),
        )
        db.add(section)

    section.section_title = block.title
    section.question_count = block.question_count
    section.concept_family = _block_concept_family(block)
    section.operation_focus = "ADD_LESS" if block.kind == ADD_LESS else block.kind
    section.abacus_rule = None
    section.target_numbers_json = json.dumps(list(block.target_numbers) if block.kind == ADD_LESS else [])
    section.place_value = "ONES"
    section.digit_pattern = block.digit_pattern if block.kind == ADD_LESS else None
    section.rows_count = block.rows if block.kind == ADD_LESS else 0
    section.difficulty = "PM_L3_WORKBOOK_REPLICA"
    section.allow_negative_operands = block.kind == ADD_LESS
    section.allow_negative_answer = False
    section.marks_per_question = _block_marks(block)
    section.generator_config_json = json.dumps(_block_generator_config(lesson_number, dps_number, lesson_title, block))


def seed(db: Session):
    """Seed Preparatory Module Level 3, Lessons 1-12.

    Curriculum/master-data seeding only -- idempotent, no demo users,
    assignments, or attempts, same contract as every other seed_*.py in this
    package. Fully additive with respect to PM-L1/PM-L2: reuses the existing
    "PM" Module row (same module, different level) but never touches the
    "PM-L1"/"PM-L2" Level or any of their Lessons/DPS/DPSSections.
    """
    module = _ensure_module(db)
    level = _ensure_level(db, module)

    for lesson_number in sorted(PM_L3_LESSONS):
        lesson_title = LESSON_TITLES.get(lesson_number, f"Lesson {lesson_number}")
        lesson = _ensure_lesson(db, level, lesson_number, lesson_title)
        dps_rules = PM_L3_LESSONS[lesson_number]

        for dps_number in sorted(dps_rules):
            rule: PmL3DpsRule = dps_rules[dps_number]
            total_questions = sum(block.question_count for block in rule.blocks)
            display_title = rule.dps_title
            if len(rule.blocks) == 1 and rule.blocks[0].kind in (ADD_LESS, MULTIPLY):
                display_title = _titled(rule.dps_title, rule.blocks[0].practice_mode)
            dps = _ensure_dps(db, lesson, dps_number, display_title, total_questions)
            for index, block in enumerate(rule.blocks, start=1):
                _ensure_section(db, dps, lesson_number, dps_number, lesson_title, block, section_number=index)

    db.commit()
