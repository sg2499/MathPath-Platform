import json
from sqlalchemy.orm import Session
from app.models import DPS, DPSSection, Lesson, Level, Module

MODULE_CODE = "MM"
MODULE_NAME = "Master Module"
MODULE_DESCRIPTION = "Advanced MathPath Master Module practice curriculum."
MODULE_DISPLAY_ORDER = 5

LEVEL_CODE = "MM-L1"
LEVEL_NAME = "Master Module Level 1"
LEVEL_INTERNAL_NUMBER = 1
LEVEL_DISPLAY_ORDER = 1

DPS_DURATION_SECONDS = 5 * 60
DPS_PER_LESSON = 5

# MathPath module hierarchy convention:
# 1. Young Learners Module
# 2. Preparatory Module
# 3. Bridge Module
# 4. Intermediate Module
# 5. Master Module
MODULE_ORDER = {
    "YLM": 1,
    "PM": 2,
    "PREP": 2,
    "BM": 3,
    "BRIDGE": 3,
    "IM": 4,
    "MM": 5,
}

LESSON_TITLES = {
    1: "Excel Practice Set 1",
    2: "Excel Practice Set 2",
    3: "Decimal Number Add-Less",
    4: "Decimal Number Add-Less Practice",
    5: "Borrowing Sums with Negative Answers and BODMAS",
    6: "Decimal Number Add-Less Visual Practice",
    7: "Four-Digit and Five-Digit Visual Add-Less",
    8: "Two-Digit Number Add-Less Fast Visualisation",
    9: "Five-Digit Add-Less and Decimal Multiplication",
    10: "Squares and Four-Digit Add-Less",
    11: "Natural Number Position, Equations, and Decimal Multiplication",
    12: "Division of Decimal Numbers and Decimal Multiplication",
    13: "Decimal Division and Decimal Multiplication",
    14: "Add Percentage and Less Percentage",
    15: "Percentage Add-Less Practice",
    16: "Integers",
    17: "Decimal Division and Decimal Multiplication Review",
    18: "Cube Root of Six-Digit Numbers",
    19: "Squares, Cubes, and Skill Stacker",
    20: "Decimal Multiplication Visual Practice",
    21: "Mixed Digit Add-Less",
    22: "BODMAS",
    23: "Concept Drill Abacus",
    24: "Profit and Loss: Selling Price",
    25: "Square Root of Three- and Four-Digit Numbers",
    26: "Square Root of Four-Digit Numbers",
    27: "Square Root of Five-Digit Numbers",
    28: "Cubes, Cube Root, Squares, and Square Root",
    29: "Percentage Visual Practice",
    30: "Profit and Loss",
}

LESSON_SOURCE_TYPES = {
    1: "EXCEL_WORKBOOK",
    2: "EXCEL_WORKBOOK",
    **{lesson_number: "IMAGE_WORKSHEET" for lesson_number in range(3, 31)},
}

LESSON_SOURCE_FILES = {
    1: "Level - 9/LESSON 1.xlsx",
    2: "Level - 9/LESSON 2.xlsx",
}

# Preserve the original uploaded-source reference while presenting MM as Level 1 in the app.
ORIGINAL_SOURCE_LEVEL_LABEL = "Level - 9"


def _normalise_source_filename(lesson_number: int, dps_number: int) -> str:
    if lesson_number in LESSON_SOURCE_FILES:
        return f"{LESSON_SOURCE_FILES[lesson_number]}#DPS {dps_number}"
    # Uploaded ZIP contains one typo: MM-L9_L8-DPS-2png.png. Preserve the source path in metadata.
    filename = f"MM-L9_L{lesson_number}-DPS-{dps_number}.png"
    if lesson_number == 8 and dps_number == 2:
        filename = "MM-L9_L8-DPS-2png.png"
    return f"Level - 9/Lesson - {lesson_number}/{filename}"


def _dps_title(lesson_number: int, dps_number: int) -> str:
    return f"DPS {dps_number}: {LESSON_TITLES[lesson_number]}"


def _section_config(lesson_number: int, dps_number: int) -> dict:
    source_type = LESSON_SOURCE_TYPES[lesson_number]
    return {
        "moduleCode": MODULE_CODE,
        "levelCode": LEVEL_CODE,
        "lessonNumber": lesson_number,
        "dpsNumber": dps_number,
        "sourceType": source_type,
        "sourceFile": _normalise_source_filename(lesson_number, dps_number),
        "sourceLevelLabel": ORIGINAL_SOURCE_LEVEL_LABEL,
        "seedMode": "STATIC_MASTER_MODULE_REFERENCE",
        "durationSeconds": DPS_DURATION_SECONDS,
        "manualReviewRequiredBeforePublishing": True,
    }


def _upsert_module_order(db: Session) -> None:
    for module_code, display_order in MODULE_ORDER.items():
        module = db.query(Module).filter(Module.module_code == module_code).first()
        if module and module.display_order != display_order:
            module.display_order = display_order


def _upsert_module(db: Session) -> Module:
    _upsert_module_order(db)
    module = db.query(Module).filter(Module.module_code == MODULE_CODE).first()
    if not module:
        module = Module(
            module_code=MODULE_CODE,
            module_name=MODULE_NAME,
            description=MODULE_DESCRIPTION,
            display_order=MODULE_DISPLAY_ORDER,
            is_active=True,
        )
        db.add(module)
        db.flush()
    else:
        module.module_name = MODULE_NAME
        module.description = MODULE_DESCRIPTION
        module.display_order = MODULE_DISPLAY_ORDER
        module.is_active = True
    return module


def _upsert_level(db: Session, module: Module) -> Level:
    level = (
        db.query(Level)
        .filter(Level.module_id == module.id, Level.level_code == LEVEL_CODE)
        .first()
    )
    if not level:
        level = Level(
            module_id=module.id,
            level_code=LEVEL_CODE,
            level_name=LEVEL_NAME,
            internal_level_number=LEVEL_INTERNAL_NUMBER,
            display_order=LEVEL_DISPLAY_ORDER,
            is_active=True,
        )
        db.add(level)
        db.flush()
    else:
        level.level_name = LEVEL_NAME
        level.internal_level_number = LEVEL_INTERNAL_NUMBER
        level.display_order = LEVEL_DISPLAY_ORDER
        level.is_active = True
    return level


def _upsert_lesson(db: Session, level: Level, lesson_number: int) -> Lesson:
    lesson = (
        db.query(Lesson)
        .filter(Lesson.level_id == level.id, Lesson.lesson_number == lesson_number)
        .first()
    )
    if not lesson:
        lesson = Lesson(
            level_id=level.id,
            lesson_number=lesson_number,
            lesson_title=LESSON_TITLES[lesson_number],
            description=f"Master Module Lesson {lesson_number}: {LESSON_TITLES[lesson_number]}",
            display_order=lesson_number,
            is_active=True,
        )
        db.add(lesson)
        db.flush()
    else:
        lesson.lesson_title = LESSON_TITLES[lesson_number]
        lesson.description = f"Master Module Lesson {lesson_number}: {LESSON_TITLES[lesson_number]}"
        lesson.display_order = lesson_number
        lesson.is_active = True
    return lesson


def _upsert_dps(db: Session, lesson: Lesson, lesson_number: int, dps_number: int) -> DPS:
    dps = (
        db.query(DPS)
        .filter(DPS.lesson_id == lesson.id, DPS.dps_number == dps_number)
        .first()
    )
    if not dps:
        dps = DPS(
            lesson_id=lesson.id,
            dps_number=dps_number,
            dps_title=_dps_title(lesson_number, dps_number),
            default_question_count=20,
            default_duration_seconds=DPS_DURATION_SECONDS,
            marks_per_question=1,
            label_style="NUMERIC",
            answer_type="STATIC_WORKSHEET",
            options_per_question=0,
            layout_template="STATIC_MASTER_MODULE_WORKSHEET",
            publication_status="DRAFT",
            is_active=True,
        )
        db.add(dps)
        db.flush()
    else:
        dps.dps_title = _dps_title(lesson_number, dps_number)
        dps.default_question_count = 20
        dps.default_duration_seconds = DPS_DURATION_SECONDS
        dps.marks_per_question = 1
        dps.label_style = "NUMERIC"
        dps.answer_type = "STATIC_WORKSHEET"
        dps.options_per_question = 0
        dps.layout_template = "STATIC_MASTER_MODULE_WORKSHEET"
        dps.is_active = True
        if not getattr(dps, "publication_status", None):
            dps.publication_status = "DRAFT"
    return dps


def _upsert_section(db: Session, dps: DPS, lesson_number: int, dps_number: int) -> DPSSection:
    section = (
        db.query(DPSSection)
        .filter(DPSSection.dps_id == dps.id, DPSSection.section_number == 1)
        .first()
    )
    config = _section_config(lesson_number, dps_number)
    target_payload = {
        "sourceType": config["sourceType"],
        "sourceFile": config["sourceFile"],
    }
    if not section:
        section = DPSSection(
            dps_id=dps.id,
            section_number=1,
            section_title="Master Module Static Worksheet",
            question_count=20,
            concept_family="MASTER_MODULE_STATIC",
            operation_focus="STATIC_WORKSHEET",
            abacus_rule="MASTER_MODULE_REFERENCE",
            target_numbers_json=json.dumps(target_payload),
            place_value="ADVANCED_MIXED",
            digit_pattern="MASTER_MODULE",
            rows_count=20,
            difficulty="MASTER",
            allow_negative_operands=True,
            allow_negative_answer=True,
            generator_config_json=json.dumps(config),
        )
        db.add(section)
        db.flush()
    else:
        section.section_title = "Master Module Static Worksheet"
        section.question_count = 20
        section.concept_family = "MASTER_MODULE_STATIC"
        section.operation_focus = "STATIC_WORKSHEET"
        section.abacus_rule = "MASTER_MODULE_REFERENCE"
        section.target_numbers_json = json.dumps(target_payload)
        section.place_value = "ADVANCED_MIXED"
        section.digit_pattern = "MASTER_MODULE"
        section.rows_count = 20
        section.difficulty = "MASTER"
        section.allow_negative_operands = True
        section.allow_negative_answer = True
        section.generator_config_json = json.dumps(config)
    return section


def seed(db: Session) -> None:
    """Seed the Master Module curriculum skeleton.

    This seed is idempotent and intentionally creates only curriculum/master data.
    It does not create students, teachers, assignments, attempts, reports, or demo data.
    All Master Module DPS records are created as Draft by default and use a 5-minute time limit.
    """
    module = _upsert_module(db)
    level = _upsert_level(db, module)

    for lesson_number in range(1, 31):
        lesson = _upsert_lesson(db, level, lesson_number)
        for dps_number in range(1, DPS_PER_LESSON + 1):
            dps = _upsert_dps(db, lesson, lesson_number, dps_number)
            _upsert_section(db, dps, lesson_number, dps_number)

    db.commit()
