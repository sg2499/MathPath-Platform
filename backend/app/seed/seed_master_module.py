import json
from sqlalchemy.orm import Session
from app.models import DPS, DPSSection, Lesson, Level, Module
from app.question_engine.mm.config import ClassifyMmConcept, OperationFocusForConcept

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

LESSON_TITLES = {1: 'Decimal Number Add-Less, Borrowing, Integers & Fast Visualisation',
 2: 'Decimal Number Add-Less, Borrowing, Integers & Fast Visualisation Practice',
 3: 'Decimal Number Add-Less, Multiplication, Squares & Borrowing Review',
 4: 'Integers, Fast Visualisation, BODMAS & Decimal Add-Less',
 5: 'Borrowing, Multiplication, Skill Stacker, Integers & Equation Practice',
 6: 'Decimal Add-Less, Equations, Squares & BODMAS',
 7: 'Four-Digit/Three-Digit Visual, Decimal Multiplication & Integers',
 8: 'Fast Visualisation, Decimal Multiplication & Skill Stacker',
 9: 'Decimal Multiplication, Concept Drill, Borrowing & Division',
 10: 'Squares, Add-Less, Decimal Multiplication & Skill Stacker',
 11: 'Natural Number Position, Decimal Multiplication, Squares & BODMAS',
 12: 'Decimal Division, Decimal Multiplication & Percentage',
 13: 'Decimal Division, Multiplication & Percentage',
 14: 'Add Percentage, Less Percentage & Simple Interest',
 15: 'Percentage, Simple Interest & Decimal Operations',
 16: 'Integers, Squares/Cubes, Profit-Loss, Multiplication & BODMAS',
 17: 'Decimal Division, Percentage, Simple Interest, Profit-Loss & Cube Root',
 18: 'Cube Root, Decimal Operations, Multiplication & Percentage',
 19: 'Squares, Cubes, Percentage, BODMAS & Decimal Division',
 20: 'Decimal Division, Percentage, Squares/Cubes, Simple Interest & Cube Root',
 21: 'Mixed Digit Add-Less, Multiplication/Division, Simple Interest & BODMAS',
 22: 'BODMAS, Decimal Division, Borrowing, Multiplication & Cube Root',
 23: 'Concept Drill, BODMAS, Multiplication, Percentage & Profit-Loss',
 24: 'Profit-Loss, Simple Interest, Squares/Cubes & Decimal Operations',
 25: 'Square Root, Profit-Loss, Multiplication & Division',
 26: 'Square Root, Cubes, Multiplication, Simple Interest & Profit-Loss',
 27: 'Square Root, Profit-Loss, Percentage & BODMAS',
 28: 'Cubes, Multiplication, Division & Concept Drill',
 29: 'Percentage, Profit-Loss, Simple Interest, Multiplication & Division',
 30: 'Profit-Loss, Square Root, Decimal Division, Cube Root & Multiplication'}

DPS_TITLES = {1: {1: 'Decimal Number Add-Less (Visual)',
     2: 'Add-Less (Visual)',
     3: 'Borrowing Sums with Negative Answers (Visual)',
     4: 'Integers',
     5: '2 Digit Number Add-Less (Fast Visualisation)'},
 2: {1: 'Decimal Number Add-Less (Visual)',
     2: 'Add-Less (Visual)',
     3: 'Borrowing Sums with Negative Answers (Visual)',
     4: 'Integers',
     5: '2 Digit Number Add-Less (Fast Visualisation)'},
 3: {1: 'Decimal Number Add-Less (Visual)',
     2: '2D x 2D and 4D ÷ 2D Visual',
     3: '3D x 2D and 5D ÷ 2D Visual',
     4: 'Squares and 4D ÷ 3D Visual',
     5: 'Borrowing Sums with Negative Answers (Visual)'},
 4: {1: 'Integers and 3D x 2D Visual',
     2: '2 Digit Number Add-Less (Fast Visualisation)',
     3: 'BODMAS (Visual)',
     4: 'Decimal Number Add-Less (Visual)',
     5: 'BODMAS (Visual)'},
 5: {1: 'Borrowing Sums with Negative Answers',
     2: '4D ÷ 3D Visual and Skill Stacker (Visual)',
     3: '2D x 2D and 4D ÷ 2D Visual',
     4: 'Integers (Visual)',
     5: 'Decimal Multiplication Answer Position'},
 6: {1: 'Decimal Number Add-Less (Visual)',
     2: 'Decimal Multiplication Equation',
     3: 'Squares and 4D ÷ 3D',
     4: 'Add-Less (Visual)',
     5: 'BODMAS (Visual)'},
 7: {1: '4D ÷ 3D and 5D ÷ 2D Visual',
     2: 'Decimal Number Add-Less (Visual)',
     3: '2D x 2D and 4D ÷ 3D Visual',
     4: 'Integers',
     5: 'Decimal Multiplication and 4D ÷ 2D Visual'},
 8: {1: '2 Digit Number Add-Less (Fast Visualisation)',
     2: 'Decimal Multiplication and Multiplication Mixed Pattern',
     3: 'Skill Stacker / Concept Drill (Visual)',
     4: '2D x 2D and 4D ÷ 3D Visual',
     5: '5D ÷ 2D and Decimal Multiplication Visual'},
 9: {1: '5D ÷ 2D and Decimal Multiplication Visual',
     2: 'Concept Drill (Abacus)',
     3: '3D x 2D and 4D x 3D Visual',
     4: 'Borrowing Sums with Positive / Negative Answers',
     5: 'Multiplication and Division Mixed Pattern'},
 10: {1: 'Squares (Visual) and 4D ÷ 3D',
      2: '3 Digit Add-Less (Fast Visualisation)',
      3: 'Decimal Multiplication and Number Position',
      4: '5D ÷ 3D and 3D x 2D Visual',
      5: 'Squares, Skill Stacker and Concept Drill (Visual)'},
 11: {1: 'Natural Number Position and Equation Solving',
      2: 'Decimal Multiplication and Skill Stacker (Visual)',
      3: 'Mixed Pattern Multiplication and Skill Stacker (Visual)',
      4: 'Squares and 5D ÷ 2D / 5D ÷ 3D',
      5: 'BODMAS (Visual)'},
 12: {1: 'Division of Decimal Numbers and Decimal Number Multiplication',
      2: 'Multiplication and Division Mixed Pattern',
      3: 'Add Percentage and Less Percentage',
      4: 'Add Percentage and Less Percentage',
      5: 'Add Percentage and Less Percentage'},
 13: {1: 'Division of Decimal Numbers and Decimal Number Multiplication',
      2: 'Multiplication and Division Mixed Pattern',
      3: 'Add Percentage and Less Percentage',
      4: 'Add Percentage and Less Percentage',
      5: 'Add Percentage and Less Percentage'},
 14: {1: 'Add Percentage and Less Percentage',
      2: 'Add Percentage and Less Percentage',
      3: 'Add Percentage and Less Percentage',
      4: 'Add Percentage and Less Percentage',
      5: 'Simple Interest and Less Percentage'},
 15: {1: 'Add Percentage and Less Percentage',
      2: 'Add Percentage and Less Percentage',
      3: 'Simple Interest',
      4: 'Division of Decimal Numbers and Less Percentage',
      5: 'Simple Interest'},
 16: {1: 'Integers (Visual)',
      2: 'Squares and Cubes (Visual)',
      3: 'Profit and Loss / Skill Stacker (Visual)',
      4: 'Multiplication Mixed Pattern and BODMAS',
      5: 'BODMAS'},
 17: {1: 'Division of Decimal Numbers and Decimal Number Multiplication',
      2: 'Add Percentage and Less Percentage',
      3: 'Simple Interest and Profit-Loss',
      4: '3D x 3D and 4D ÷ 3D Visual',
      5: 'Cube Root of 4 Digit Number'},
 18: {1: 'Cube Root of 5 Digit Numbers',
      2: 'Cube Root of 6 Digit Numbers',
      3: 'Cube Root of Mixed Digit',
      4: 'Division of Decimal Numbers and Decimal Number Multiplication',
      5: 'Multiplication Mixed Pattern and Less Percentage'},
 19: {1: 'Squares and Cubes (Visual)',
      2: 'Add Percentage and Less Percentage',
      3: 'Cube Root of Mixed Digit',
      4: 'BODMAS (Visual)',
      5: 'Division of Decimal Numbers'},
 20: {1: 'Division of Decimal Numbers and Decimal Number Multiplication',
      2: 'Add Percentage and Less Percentage',
      3: 'Squares and Cubes (Visual)',
      4: 'Simple Interest and Profit-Loss',
      5: 'Cubes, Squares and Cube Root'},
 21: {1: 'Mixed Digit Add-Less (Visual)',
      2: 'Multiplication and Division by 3D',
      3: 'Multiplication and Division by 5D',
      4: 'Simple Interest and Decimal Division',
      5: 'BODMAS'},
 22: {1: 'BODMAS',
      2: 'Division of Decimal Numbers and Decimal Number Multiplication',
      3: 'Borrowing Sums with Positive / Negative Answers',
      4: 'Multiplication by 3D and Division by 6D',
      5: 'Division of Decimal Numbers and 6 Digit Number Cube Root'},
 23: {1: 'Concept Drill (Abacus)',
      2: 'BODMAS',
      3: 'Multiplication by 3D and Division by 6D',
      4: 'Add Percentage and Less Percentage',
      5: 'Multiplication Mixed Pattern and Less Percentage'},
 24: {1: 'Profit-Loss / Selling Price',
      2: 'Simple Interest',
      3: 'Cubes, Squares and Cube Root',
      4: 'Division of Decimal Numbers and Decimal Number Multiplication',
      5: 'Add-Less (Visual)'},
 25: {1: 'Square Root 3 & 4 Digit Number',
      2: 'Profit-Loss and Skill Stacker (Visual)',
      3: '4D x 2D and 3D x 3D Visual',
      4: 'Profit-Loss',
      5: 'Multiplication and Division Mixed Pattern'},
 26: {1: 'Square Root - 4 Digit Number',
      2: 'Cubes, Squares and Cube Root',
      3: '3D x 3D and 4D ÷ 3D Visual',
      4: 'Simple Interest',
      5: 'Profit-Loss / Selling Price'},
 27: {1: 'Square Root - 5 Digit Number',
      2: 'Profit-Loss / Selling Price',
      3: 'Add Percentage and Less Percentage',
      4: 'Profit & Loss',
      5: 'BODMAS'},
 28: {1: 'Cubes and Squares (Visual)',
      2: 'Multiplication by 3D and 5D x 2D',
      3: 'Division of Decimal Numbers and Decimal Number Multiplication',
      4: '5D ÷ 3D and 6D ÷ 3D Visual',
      5: 'Concept Drill (Abacus)'},
 29: {1: 'Add Percentage and Less Percentage',
      2: 'Profit-Loss / Selling Price',
      3: 'Profit & Loss',
      4: 'Simple Interest and Profit-Loss',
      5: 'Multiplication by 3D and Division by 6D'},
 30: {1: 'Profit & Loss',
      2: 'Square Root - 5 Digit Number',
      3: 'Square Root - 6 Digit Number',
      4: 'Division of Decimal Numbers and Cube Root',
      5: 'Multiplication by 3D and Division by 3D'}}


# Section-aware workbook structure. This map stores exact/special splits identified from the MM workbook audit.
# DPS records not present here fall back to a conservative title-derived split.
# Concept Drill and Skill Stacker remain intentionally tagged separately for a future dedicated convention.
MM_DPS_SECTION_OVERRIDES = {
    (4, 5): [
        {"sectionTitle": "BODMAS (Visual)", "questionCount": 5, "conceptFamily": "BODMAS"},
        {"sectionTitle": "Solve Equation", "questionCount": 5, "conceptFamily": "BODMAS"},
        {"sectionTitle": "Find Position", "questionCount": 5, "conceptFamily": "MULTIPLICATION_DIVISION_MIXED"},
    ],
    (20, 5): [
        {"sectionTitle": "Cubes", "questionCount": 5, "conceptFamily": "CUBES"},
        {"sectionTitle": "Squares", "questionCount": 5, "conceptFamily": "SQUARES"},
        {"sectionTitle": "Cube Root", "questionCount": 5, "conceptFamily": "CUBE_ROOT"},
    ],
    (24, 3): [
        {"sectionTitle": "Cubes", "questionCount": 5, "conceptFamily": "CUBES"},
        {"sectionTitle": "Squares", "questionCount": 5, "conceptFamily": "SQUARES"},
        {"sectionTitle": "Cube Root", "questionCount": 5, "conceptFamily": "CUBE_ROOT"},
    ],
    (26, 2): [
        {"sectionTitle": "Cubes", "questionCount": 5, "conceptFamily": "CUBES"},
        {"sectionTitle": "Squares", "questionCount": 5, "conceptFamily": "SQUARES"},
        {"sectionTitle": "Cube Root", "questionCount": 5, "conceptFamily": "CUBE_ROOT"},
    ],
}

SECTION_TITLE_NORMALISATIONS = {
    "add percentage": "Add Percentage",
    "less percentage": "Less Percentage",
    "profit loss": "Profit-Loss",
    "profit-loss": "Profit-Loss",
    "simple interest": "Simple Interest",
    "bodmas": "BODMAS",
    "integers": "Integers",
    "squares": "Squares",
    "cubes": "Cubes",
    "cube root": "Cube Root",
    "square root": "Square Root",
    "decimal number multiplication": "Decimal Number Multiplication",
    "decimal multiplication": "Decimal Multiplication",
    "decimal number add less": "Decimal Number Add-Less",
    "add less": "Add-Less",
}


def _clean_section_title(value: str) -> str:
    title = " ".join(str(value or "").replace("/", " and ").replace("&", " and ").split())
    title = title.replace(" x ", " × ").replace(" X ", " × ")
    lower = title.lower().strip()
    return SECTION_TITLE_NORMALISATIONS.get(lower, title)


def _concept_for_section(section_title: str, lesson_title: str) -> str:
    return ClassifyMmConcept(section_title, lesson_title)


def _split_title_into_sections(lesson_number: int, dps_number: int) -> list[dict]:
    override = MM_DPS_SECTION_OVERRIDES.get((lesson_number, dps_number))
    if override:
        return override

    title = _dps_title(lesson_number, dps_number)
    lesson_title = LESSON_TITLES[lesson_number]
    # Keep special future-rule sheets as a single section until their convention is approved.
    lowered = title.lower()
    if "skill stacker" in lowered or "concept drill" in lowered:
        return [{
            "sectionTitle": title,
            "questionCount": 20,
            "conceptFamily": ClassifyMmConcept(title, lesson_title),
        }]

    raw_parts = [title]
    for delimiter in [" and ", " / "]:
        if delimiter in title:
            raw_parts = []
            for part in title.split(delimiter):
                raw_parts.append(part)
            break

    parts = [_clean_section_title(part) for part in raw_parts if str(part).strip()]
    if len(parts) <= 1:
        return [{
            "sectionTitle": title,
            "questionCount": int(20 if "visual" in lowered and (" x " in lowered or "÷" in lowered) else 10),
            "conceptFamily": ClassifyMmConcept(title, lesson_title),
        }]

    # Default workbook split for normal two-concept sheets is 10+10.
    # Three-concept sheets default to 10+5+5 unless explicitly overridden as 5+5+5.
    if len(parts) == 2:
        counts = [10, 10]
    elif len(parts) == 3:
        counts = [10, 5, 5]
    else:
        counts = [10] + [5 for _ in parts[1:]]

    return [
        {
            "sectionTitle": section_title,
            "questionCount": counts[index],
            "conceptFamily": _concept_for_section(section_title, lesson_title),
        }
        for index, section_title in enumerate(parts)
    ]


def _dps_sections(lesson_number: int, dps_number: int) -> list[dict]:
    sections = _split_title_into_sections(lesson_number, dps_number)
    return [
        {
            **section,
            "sectionNumber": index,
            "operationFocus": OperationFocusForConcept(section["conceptFamily"]),
        }
        for index, section in enumerate(sections, start=1)
    ]


def _dps_display_title(lesson_number: int, dps_number: int) -> str:
    sections = _dps_sections(lesson_number, dps_number)
    if len(sections) <= 1:
        return _dps_title(lesson_number, dps_number)
    return ", ".join(section["sectionTitle"] for section in sections)


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
        question_count = int(section_definition["questionCount"])
        concept_family = str(section_definition["conceptFamily"])
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
