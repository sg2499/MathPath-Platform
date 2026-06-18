import json
from sqlalchemy.orm import Session
from app.models import DPS, DPSSection, Lesson, Level, Module
from app.question_engine.mm.config import OperationFocusForConcept
from app.question_engine.mm.curriculum_map import MM_CURRICULUM_MAP

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
    1: 'Add-Less, BODMAS, Borrowing (Negative Answers), Decimal Add-Less, Division, Integers, Multiplication & Squares',
    2: 'Add-Less, BODMAS, Borrowing (Negative Answers), Decimal Add-Less, Division, Equation Solving, Integers, Multiplication & Squares',
    3: 'Add-Less, Borrowing (Negative Answers), Concept Drill, Decimal Add-Less, Division, Multiplication, Skill Stacker & Squares',
    4: 'Add-Less, BODMAS, Concept Drill, Decimal Add-Less, Equation Solving, Integers, Multiplication & Number Position',
    5: 'BODMAS, Borrowing (Negative Answers), Decimal Answer Position, Division, Equation Solving, Integers, Multiplication, Number Position & Skill Stacker',
    6: 'Add-Less, BODMAS, Decimal Add-Less, Decimal Answer Position, Division, Equation Solving, Multiplication & Squares',
    7: 'Add-Less, Decimal Answer Position, Decimal Multiplication, Division, Integers & Multiplication',
    8: 'Add-Less, Concept Drill, Decimal Multiplication, Division, Mixed Operations, Multiplication & Skill Stacker',
    9: 'Borrowing (Mixed), Concept Drill, Decimal Multiplication, Division, Equation Solving, Mixed Operations, Multiplication, Number Position & Skill Stacker',
    10: 'Add-Less, Answer Position, BODMAS, Concept Drill, Decimal Multiplication, Division, Multiplication, Skill Stacker & Squares',
    11: 'BODMAS, Decimal Division, Decimal Multiplication, Division, Equation Solving, Mixed Operations, Number Position, Skill Stacker & Squares',
    12: 'Decimal Division, Decimal Multiplication, Mixed Operations, Multiplication & Percentage',
    13: 'Decimal Division, Decimal Multiplication, Mixed Operations, Multiplication & Percentage',
    14: 'Percentage & Simple Interest',
    15: 'Decimal Division, Percentage & Simple Interest',
    16: 'BODMAS, Concept Drill, Cubes, Integers, Mixed Operations, Profit & Loss, Skill Stacker & Squares',
    17: 'Cube Root, Decimal Division, Decimal Multiplication, Division, Multiplication, Percentage, Profit & Loss & Simple Interest',
    18: 'Cube Root, Decimal Division, Decimal Multiplication, Mixed Operations & Percentage',
    19: 'BODMAS, Concept Drill, Cube Root, Cubes, Decimal Division, Percentage, Simple Interest, Skill Stacker & Squares',
    20: 'Cube Root, Cubes, Decimal Division, Decimal Multiplication, Percentage, Profit & Loss, Simple Interest & Squares',
    21: 'Add-Less, BODMAS, Decimal Division, Division, Multiplication & Simple Interest',
    22: 'BODMAS, Borrowing (Mixed), Cube Root, Decimal Division, Decimal Multiplication, Division, Multiplication & Skill Stacker',
    23: 'BODMAS, Concept Drill, Division, Mixed Operations, Multiplication, Percentage & Skill Stacker',
    24: 'Add-Less, Cube Root, Cubes, Decimal Division, Decimal Multiplication, Profit & Loss, Selling Price, Simple Interest & Squares',
    25: 'Mixed Operations, Multiplication, Profit & Loss, Skill Stacker & Square Root',
    26: 'Cube Root, Cubes, Division, Multiplication, Profit & Loss, Selling Price, Simple Interest, Square Root & Squares',
    27: 'BODMAS, Percentage, Profit & Loss, Selling Price & Square Root',
    28: 'Concept Drill, Cube Root, Cubes, Decimal Division, Decimal Multiplication, Division, Multiplication, Skill Stacker, Square Root & Squares',
    29: 'Division, Multiplication, Percentage, Profit & Loss, Selling Price & Simple Interest',
    30: 'Cube Root, Decimal Division, Division, Multiplication, Profit & Loss & Square Root',
}

DPS_TITLES = {
    1: {
        1: 'Decimal Number Add-Less, 2D × 2D (Visual) & 4D ÷ 2D (Visual)',
        2: 'Add-Less, 2D × 2D (Visual) & 4D ÷ 2D (Visual)',
        3: 'Borrowing Sums with Negative Answers (Visual), 3D × 2D (Visual) & 4D ÷ 3D (Visual)',
        4: 'Integers, Squares (Visual) & 4D ÷ 3D (Visual)',
        5: '2 Digit Number Add-Less (Fast Visualisation) & BODMAS',
    },
    2: {
        1: 'Decimal Number Add-Less, 2D × 2D (Visual) & 4D ÷ 2D (Visual)',
        2: 'Add-Less, 2D × 2D (Visual) & 4D ÷ 2D (Visual)',
        3: 'Borrowing Sums with Negative Answers (Visual), 3D × 2D (Visual) & 5D ÷ 2D (Visual)',
        4: 'Integers, Squares (Visual) & 4D ÷ 3D (Visual)',
        5: '2 Digit Number Add-Less (Fast Visualisation), BODMAS & Solve Equation',
    },
    3: {
        1: 'Decimal Number Add-Less (Visual), Skill Stacker (Visual), Concept Drill, 2D × 2D (Visual) & 4D ÷ 2D (Visual)',
        2: '2D × 2D (Visual) & 4D ÷ 2D (Visual)',
        3: 'Borrowing Sums with Negative Answers (Visual), 3D × 2D (Visual), 5D ÷ 2D (Visual) & 4D ÷ 3D (Visual)',
        4: 'Add-Less, Squares (Visual) & 4D ÷ 3D (Visual)',
        5: 'Borrowing Sums with Negative Answers (Visual), 2 Digit Number Add-Less (Fast Visualisation), 4D ÷ 3D (Visual) & BODMAS (Visual)',
    },
    4: {
        1: '3 Digit Add-Less (Fast Visualisation), Integers & 3D × 2D (Visual)',
        2: '2 Digit Number Add-Less (Fast Visualisation) & 2D × 2D (Visual)',
        3: 'BODMAS & Concept Drill',
        4: 'Decimal Number Add-Less',
        5: 'Borrowing Sums with Positive / Negative Answers (Visual), BODMAS (Visual), Solve Equation & Write the Number from the Given Position',
    },
    5: {
        1: 'Borrowing Sums with Negative Answers (Visual) & BODMAS (Visual)',
        2: '4D ÷ 3D (Visual) & Skill Stacker (Visual)',
        3: '2D × 2D (Visual) & 4D ÷ 2D (Visual)',
        4: 'Integers & Find the Position of the First Natural Number',
        5: 'Find the Position for Decimal Number Multiplication Answer Placement & Solve Equation',
    },
    6: {
        1: 'Decimal Number Add-Less & 2D × 2D (Visual)',
        2: 'Find the Position for Decimal Number Multiplication Answer Placement & Solve Equation',
        3: 'Squares (Visual) & 4D ÷ 3D',
        4: 'Add-Less',
        5: 'BODMAS',
    },
    7: {
        1: '4D ÷ 3D (Visual) & 5D ÷ 2D (Visual)',
        2: 'Add-Less & Find the Position for Decimal Number Multiplication Answer Placement',
        3: '2D × 2D (Visual) & 4D ÷ 3D (Visual)',
        4: 'Integers',
        5: 'Decimal Multiplication (Visual) & 4D ÷ 2D (Visual)',
    },
    8: {
        1: '2 Digit Number Add-Less (Fast Visualisation)',
        2: 'Decimal Multiplication (Visual) & Multiplication Mixed Pattern',
        3: 'Skill Stacker (Visual) & Concept Drill',
        4: '3D × 2D (Visual) & 4D ÷ 3D (Visual)',
        5: '5D ÷ 2D (Visual) & Decimal Multiplication (Visual)',
    },
    9: {
        1: '5D ÷ 2D (Visual) & Decimal Multiplication (Visual)',
        2: 'Skill Stacker & Concept Drill',
        3: '3D × 2D (Visual) & 4D × 3D (Visual)',
        4: 'Borrowing Sums with Positive / Negative Answers (Visual), Find the Position of the First Natural Number & Solve Equation',
        5: 'Multiplication & Division Mixed Pattern',
    },
    10: {
        1: 'Squares (Visual) & 4D ÷ 3D',
        2: '3 Digit Add-Less (Fast Visualisation) & BODMAS',
        3: 'Decimal Multiplication (Visual) & Write the Number from the Given Position',
        4: '5D ÷ 3D (Visual) & 3D × 2D (Visual)',
        5: 'Squares (Visual), Skill Stacker (Visual) & Concept Drill (Visual)',
    },
    11: {
        1: 'Find the Position of the First Natural Number, Solve Equation & Decimal Multiplication (Visual)',
        2: 'Decimal Multiplication (Visual) & Skill Stacker (Visual)',
        3: 'Multiplication Mixed Pattern (Visual) & Skill Stacker (Visual)',
        4: 'Squares (Visual), 5D ÷ 2D & 5D ÷ 3D',
        5: 'BODMAS & Division of Decimal Numbers',
    },
    12: {
        1: 'Decimal Multiplication (Visual) & Division Mixed Pattern',
        2: 'Multiplication Mixed Pattern (Visual) & Division Mixed Pattern (Visual)',
        3: 'Add Percentage (Visual) & Less Percentage (Visual)',
        4: 'Add Percentage (Visual) & Less Percentage (Visual)',
        5: 'Add Percentage (Visual) & Less Percentage (Visual)',
    },
    13: {
        1: 'Decimal Multiplication (Visual) & Division Mixed Pattern',
        2: 'Multiplication Mixed Pattern (Visual) & Division Mixed Pattern (Visual)',
        3: 'Add Percentage (Visual) & Less Percentage (Visual)',
        4: 'Add Percentage (Visual) & Less Percentage (Visual)',
        5: 'Add Percentage (Visual) & Less Percentage (Visual)',
    },
    14: {
        1: 'Add Percentage (Visual) & Less Percentage (Visual)',
        2: 'Add Percentage (Visual) & Less Percentage (Visual)',
        3: 'Add Percentage (Visual) & Less Percentage (Visual)',
        4: 'Add Percentage (Visual) & Less Percentage (Visual)',
        5: 'Simple Interest & Less Percentage (Visual)',
    },
    15: {
        1: 'Add Percentage (Visual) & Less Percentage (Visual)',
        2: 'Add Percentage (Visual) & Less Percentage (Visual)',
        3: 'Simple Interest',
        4: 'Division of Decimal Numbers (Visual) & Less Percentage (Visual)',
        5: 'Simple Interest',
    },
    16: {
        1: 'Integers & Concept Drill',
        2: 'Squares (Visual) & Cubes',
        3: 'Profit-Loss & Skill Stacker (Visual)',
        4: 'Multiplication Mixed Pattern & BODMAS',
        5: 'BODMAS & Concept Drill',
    },
    17: {
        1: 'Division of Decimal Numbers (Visual) & Decimal Multiplication (Visual)',
        2: 'Add Percentage & Less Percentage',
        3: 'Simple Interest & Profit-Loss',
        4: '3D × 3D (Visual) & 4D ÷ 3D (Visual)',
        5: 'Cube Root of 4 Digit Number',
    },
    18: {
        1: 'Cube Root of 5 Digit Numbers',
        2: 'Cube Root of 6 Digit Numbers',
        3: 'Cube Root of Mixed Digit',
        4: 'Division of Decimal Numbers & Decimal Multiplication (Visual)',
        5: 'Multiplication Mixed Pattern (Visual) & Less Percentage (Visual)',
    },
    19: {
        1: 'Squares (Visual), Cubes, Skill Stacker (Visual) & Concept Drill',
        2: 'Add Percentage (Visual) & Less Percentage (Visual)',
        3: 'Cube Root of Mixed Digit',
        4: 'BODMAS & Concept Drill',
        5: 'Division of Decimal Numbers & Simple Interest',
    },
    20: {
        1: 'Division of Decimal Numbers (Visual) & Decimal Multiplication (Visual)',
        2: 'Add Percentage (Visual) & Less Percentage (Visual)',
        3: 'Squares (Visual) & Cubes',
        4: 'Simple Interest & Profit-Loss',
        5: 'Cubes, Squares (Visual) & Cube Root (Visual)',
    },
    21: {
        1: 'Mixed Digit Add-Less (Visual)',
        2: '3D × 2D (Visual) & 5D ÷ 3D (Visual)',
        3: '3D × 3D (Visual) & 5D ÷ 3D (Visual)',
        4: 'Simple Interest & Decimal Division',
        5: 'BODMAS',
    },
    22: {
        1: 'BODMAS',
        2: 'BODMAS, Division of Decimal Numbers & Decimal Multiplication (Visual)',
        3: 'Borrowing Sums with Positive / Negative Answers & Skill Stacker (Visual)',
        4: '3D × 3D (Visual) & 6D ÷ 3D (Visual)',
        5: 'Division of Decimal Numbers & 6 Digit Number Cube Root',
    },
    23: {
        1: 'Skill Stacker & Concept Drill',
        2: 'BODMAS',
        3: '3D × 3D (Visual) & 6D ÷ 3D (Visual)',
        4: 'Add Percentage (Visual) & Less Percentage (Visual)',
        5: 'Multiplication Mixed Pattern (Visual) & Less Percentage (Visual)',
    },
    24: {
        1: 'Profit-Loss & Selling Price',
        2: 'Simple Interest',
        3: 'Cubes, Squares (Visual) & Cube Root (Visual)',
        4: 'Division of Decimal Numbers (Visual) & Decimal Multiplication (Visual)',
        5: 'Add-Less',
    },
    25: {
        1: 'Square Root 3 & 4 Digit Number',
        2: 'Profit-Loss & Skill Stacker (Visual)',
        3: '6D ÷ 3D (Visual) & 3D × 3D (Visual)',
        4: 'Profit-Loss',
        5: 'Multiplication Mixed Pattern (Visual) & Division Mixed Pattern (Visual)',
    },
    26: {
        1: 'Square Root - 4 Digit Number',
        2: 'Cubes, Squares (Visual) & Cube Root (Visual)',
        3: '3D × 3D (Visual) & 4D ÷ 3D (Visual)',
        4: 'Simple Interest',
        5: 'Profit-Loss & Selling Price',
    },
    27: {
        1: 'Square Root - 5 Digit Number',
        2: 'Profit-Loss & Selling Price',
        3: 'Add Percentage (Visual) & Less Percentage (Visual)',
        4: 'Profit & Loss',
        5: 'BODMAS',
    },
    28: {
        1: 'Cubes, Squares (Visual), Cube Root & Square Root',
        2: '3D × 2D (Visual), 5D × 2D (Visual) & 5D ÷ 2D',
        3: 'Division of Decimal Numbers (Visual) & Decimal Multiplication (Visual)',
        4: '5D ÷ 3D (Visual) & 6D ÷ 3D (Visual)',
        5: 'Concept Drill & Skill Stacker (Visual)',
    },
    29: {
        1: 'Add Percentage (Visual) & Less Percentage (Visual)',
        2: 'Profit-Loss & Selling Price',
        3: 'Profit & Loss',
        4: 'Simple Interest & Profit-Loss',
        5: '3D × 3D (Visual) & 6D ÷ 3D (Visual)',
    },
    30: {
        1: 'Profit & Loss',
        2: 'Square Root - 5 Digit Number',
        3: 'Square Root - 6 Digit Number',
        4: 'Division of Decimal Numbers & Cube Root',
        5: '3D × 3D & 6D ÷ 3D',
    },
}

def _dps_sections(lesson_number: int, dps_number: int) -> list[dict]:
    sections = MM_CURRICULUM_MAP.get(lesson_number, {}).get(dps_number, [])
    return [
        {
            **section,
            "sectionNumber": index,
            "operationFocus": OperationFocusForConcept(section["conceptFamily"]),
        }
        for index, section in enumerate(sections, start=1)
    ]


def _dps_display_title(lesson_number: int, dps_number: int) -> str:
    return _dps_title(lesson_number, dps_number)


def _dps_question_count(lesson_number: int, dps_number: int) -> int:
    return sum(int(section.get("questionCount") or 0) for section in _dps_sections(lesson_number, dps_number))

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
    return DPS_TITLES.get(lesson_number, {}).get(dps_number, LESSON_TITLES[lesson_number])


def _section_config(lesson_number: int, dps_number: int) -> dict:
    source_type = LESSON_SOURCE_TYPES[lesson_number]
    return {
        "moduleCode": MODULE_CODE,
        "levelCode": LEVEL_CODE,
        "lessonNumber": lesson_number,
        "dpsNumber": dps_number,
        "dpsTitle": _dps_display_title(lesson_number, dps_number),
        "lessonTitle": LESSON_TITLES[lesson_number],
        "sourceType": source_type,
        "sourceFile": _normalise_source_filename(lesson_number, dps_number),
        "sourceLevelLabel": ORIGINAL_SOURCE_LEVEL_LABEL,
        "seedMode": "DYNAMIC_MASTER_MODULE",
        "durationSeconds": DPS_DURATION_SECONDS,
        "manualReviewRequiredBeforePublishing": True,
        "generatorPackage": "MM_SECTION_AWARE_PACKAGE_3",
        "dpsSections": _dps_sections(lesson_number, dps_number),
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
            dps_title=_dps_display_title(lesson_number, dps_number),
            default_question_count=_dps_question_count(lesson_number, dps_number),
            default_duration_seconds=DPS_DURATION_SECONDS,
            marks_per_question=1,
            label_style="NUMERIC",
            answer_type="MCQ",
            options_per_question=4,
            layout_template="VERTICAL_MASTER_MODULE",
            publication_status="DRAFT",
            is_active=True,
        )
        db.add(dps)
        db.flush()
    else:
        dps.dps_title = _dps_display_title(lesson_number, dps_number)
        dps.default_question_count = _dps_question_count(lesson_number, dps_number)
        dps.default_duration_seconds = DPS_DURATION_SECONDS
        dps.marks_per_question = 1
        dps.label_style = "NUMERIC"
        dps.answer_type = "MCQ"
        dps.options_per_question = 4
        dps.layout_template = "VERTICAL_MASTER_MODULE"
        dps.is_active = True
        if not getattr(dps, "publication_status", None):
            dps.publication_status = "DRAFT"
    return dps


def _upsert_sections(db: Session, dps: DPS, lesson_number: int, dps_number: int) -> list[DPSSection]:
    config = _section_config(lesson_number, dps_number)
    target_payload = {
        "sourceType": config["sourceType"],
        "sourceFile": config["sourceFile"],
    }
    workbook_sections = _dps_sections(lesson_number, dps_number)
    active_section_numbers = {int(section["sectionNumber"]) for section in workbook_sections}
    saved_sections: list[DPSSection] = []

    for section_definition in workbook_sections:
        section_number = int(section_definition["sectionNumber"])
        section = (
            db.query(DPSSection)
            .filter(DPSSection.dps_id == dps.id, DPSSection.section_number == section_number)
            .first()
        )
        section_title = str(section_definition["sectionTitle"])
        concept_family = str(section_definition["conceptFamily"])
        raw_count = int(section_definition.get("questionCount") or 10)
        question_count = 5 if concept_family in {"SKILL_STACKER", "CONCEPT_DRILL"} else raw_count
        operation_focus = str(section_definition.get("operationFocus") or OperationFocusForConcept(concept_family))

        section_config = {
            **config,
            "activeSection": section_definition,
        }
        if not section:
            section = DPSSection(
                dps_id=dps.id,
                section_number=section_number,
                section_title=section_title,
                question_count=question_count,
                concept_family=concept_family,
                operation_focus=operation_focus,
                abacus_rule="MASTER_MODULE_SECTION_DYNAMIC",
                target_numbers_json=json.dumps(target_payload),
                place_value="ADVANCED_MIXED",
                digit_pattern="MASTER_MODULE",
                rows_count=question_count,
                difficulty="MASTER",
                allow_negative_operands=True,
                allow_negative_answer=True,
                generator_config_json=json.dumps(section_config),
            )
            db.add(section)
            db.flush()
        else:
            section.section_title = section_title
            section.question_count = question_count
            section.concept_family = concept_family
            section.operation_focus = operation_focus
            section.abacus_rule = "MASTER_MODULE_SECTION_DYNAMIC"
            section.target_numbers_json = json.dumps(target_payload)
            section.place_value = "ADVANCED_MIXED"
            section.digit_pattern = "MASTER_MODULE"
            section.rows_count = question_count
            section.difficulty = "MASTER"
            section.allow_negative_operands = True
            section.allow_negative_answer = True
            section.generator_config_json = json.dumps(section_config)
        saved_sections.append(section)

    stale_sections = (
        db.query(DPSSection)
        .filter(DPSSection.dps_id == dps.id)
        .filter(~DPSSection.section_number.in_(active_section_numbers))
        .all()
    )
    for stale_section in stale_sections:
        stale_section.question_count = 0
        stale_section.section_title = f"Archived Section {stale_section.section_number}"

    return saved_sections

def seed(db: Session) -> None:
    """Synchronize the Master Module curriculum skeleton.

    This sync is idempotent and intentionally creates only curriculum/master data.
    It does not create students, teachers, assignments, attempts, reports, or demo data.
    All Master Module DPS records are created as Draft by default and use a 5-minute time limit.
    """
    print("[MathPath Seed] Master Module sync started")
    module = _upsert_module(db)
    level = _upsert_level(db, module)

    lesson_count = 0
    dps_count = 0
    section_count = 0
    for lesson_number in range(1, 31):
        lesson = _upsert_lesson(db, level, lesson_number)
        lesson_count += 1
        for dps_number in range(1, DPS_PER_LESSON + 1):
            dps = _upsert_dps(db, lesson, lesson_number, dps_number)
            dps_count += 1
            sections = _upsert_sections(db, dps, lesson_number, dps_number)
            section_count += len(sections)

    db.commit()
    print(
        "[MathPath Seed] Master Module sync completed: "
        f"module={MODULE_CODE}, level={LEVEL_CODE}, lessons={lesson_count}, "
        f"dps={dps_count}, sections={section_count}, duration_seconds={DPS_DURATION_SECONDS}"
    )


