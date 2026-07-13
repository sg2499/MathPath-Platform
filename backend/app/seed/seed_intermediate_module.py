"""Intermediate Module (IM) Level 4 curriculum seed.

Structural mirror of seed_master_module.py (same Module -> Level -> Lesson ->
DPS -> DPSSection upsert pattern, same idempotency guarantees, same DRAFT-only /
manual-review-before-publish safety posture) but IM-specific end to end: it
imports only from app.question_engine.im (never app.question_engine.mm or
seed_master_module.py itself), so IM's data and MM's data have zero code
overlap. Source of truth for section structure is IM_CURRICULUM_MAP, built
directly from the verified LEVEL 8.xlsx findings pass (12 lessons, 5 DPS each,
60 DPS total).
"""

import json
from sqlalchemy.orm import Session
from app.models import DPS, DPSSection, Lesson, Level, Module
from app.question_engine.im.config import OperationFocusForConcept
from app.question_engine.im.curriculum_map import IM_CURRICULUM_MAP

MODULE_CODE = "IM"
MODULE_NAME = "Intermediate Module"
MODULE_DESCRIPTION = "MathPath Intermediate Module practice curriculum."
MODULE_DISPLAY_ORDER = 4

LEVEL_CODE = "IM-L4"
LEVEL_NAME = "Intermediate Module Level 4"
LEVEL_INTERNAL_NUMBER = 4
LEVEL_DISPLAY_ORDER = 4

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

def _LessonConceptLabel(section: dict) -> str:
    """Canonical, human-readable concept label for lesson-level rollup. Distinguishes
    sub-variants (borrowing mode, answer-position direction, long division) because
    each is a visually distinct, separately-named section on the actual worksheet --
    not folded together just because they share a concept_family code.
    """
    Concept = section.get("conceptFamily")
    if Concept in ("ADD_LESS", "DECIMAL_ADD_LESS"):
        Borrowing = section.get("borrowingMode")
        if Borrowing == "NEGATIVE":
            return "Borrowing (Negative Answers)"
        if Borrowing == "POSITIVE_NEGATIVE":
            return "Borrowing (Negative/Positive Answers)"
        return "Decimal Add-Less" if Concept == "DECIMAL_ADD_LESS" else "Add-Less"
    if Concept == "WHOLE_NUMBER_MULTIPLICATION":
        return "Multiplication"
    if Concept == "WHOLE_NUMBER_DIVISION":
        return "Long Division & Estimation" if section.get("isLongDivisionEstimation") else "Division"
    if Concept == "SQUARES":
        return "Squares"
    if Concept == "SKILL_STACKER":
        return "Skill Stacker"
    if Concept == "CONCEPT_DRILL":
        return "Concept Drill"
    if Concept == "BODMAS":
        return "BODMAS"
    if Concept == "SOLVE_EQUATION":
        return "Solve the Equation"
    if Concept == "ANSWER_POSITION":
        Direction = section.get("answerPositionDirection")
        if Direction == "WRITE_FROM_POSITION":
            return "Write the Number from the Given Position"
        if Direction == "FIND_POSITION":
            return "Find the Position of the First Natural Number"
        return "Answer Position"
    return str(Concept or "").replace("_", " ").title()


def _JoinLabels(Labels: list[str]) -> str:
    if not Labels:
        return ""
    if len(Labels) == 1:
        return Labels[0]
    return ", ".join(Labels[:-1]) + " & " + Labels[-1]


def _BuildLessonTitles() -> dict[int, str]:
    """Every lesson name is derived directly from IM_CURRICULUM_MAP -- the union of
    every unique concept taught anywhere across that lesson's 5 DPS sheets, alphabetized
    and joined. This is generated, not hand-typed, so it can never drift out of sync
    with the actual section data (add a concept to the curriculum map and the lesson
    title picks it up automatically).
    """
    Titles: dict[int, str] = {}
    for LessonNumber, DpsMap in IM_CURRICULUM_MAP.items():
        Labels: list[str] = []
        for _DpsNumber, Sections in DpsMap.items():
            for Section in Sections:
                Label = _LessonConceptLabel(Section)
                if Label not in Labels:
                    Labels.append(Label)
        Labels.sort()
        Titles[LessonNumber] = _JoinLabels(Labels)
    return Titles


LESSON_TITLES = _BuildLessonTitles()

LESSON_SOURCE_TYPES = {lesson_number: "IMAGE_WORKSHEET" for lesson_number in range(1, 13)}

# Source of truth for images: "Level - 8" folder, "LEVEL 8.xlsx" for answer keys.
ORIGINAL_SOURCE_LEVEL_LABEL = "Level - 8"


def _normalise_source_filename(lesson_number: int, dps_number: int) -> str:
    filename = f"IM-L8_L{lesson_number}-DPS-{dps_number}.png"
    return f"Level - 8/Lesson - {lesson_number}/{filename}"


def _dps_sections(lesson_number: int, dps_number: int) -> list[dict]:
    sections = IM_CURRICULUM_MAP.get(lesson_number, {}).get(dps_number, [])
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
    titles: list[str] = []
    for section in sections:
        title = str(section["sectionTitle"])
        if title not in titles:
            titles.append(title)
    if not titles:
        return LESSON_TITLES.get(lesson_number, f"Lesson {lesson_number}")
    if len(titles) == 1:
        return titles[0]
    return ", ".join(titles[:-1]) + " & " + titles[-1]


def _dps_question_count(lesson_number: int, dps_number: int) -> int:
    return sum(int(section.get("questionCount") or 0) for section in _dps_sections(lesson_number, dps_number))


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
        "seedMode": "DYNAMIC_INTERMEDIATE_MODULE",
        "durationSeconds": DPS_DURATION_SECONDS,
        "manualReviewRequiredBeforePublishing": True,
        "generatorPackage": "IM_LEVEL4_SECTION_AWARE_PACKAGE_1",
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
            description=f"Intermediate Module Lesson {lesson_number}: {LESSON_TITLES[lesson_number]}",
            display_order=lesson_number,
            is_active=True,
        )
        db.add(lesson)
        db.flush()
    else:
        lesson.lesson_title = LESSON_TITLES[lesson_number]
        lesson.description = f"Intermediate Module Lesson {lesson_number}: {LESSON_TITLES[lesson_number]}"
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
            layout_template="VERTICAL_INTERMEDIATE_MODULE",
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
        dps.layout_template = "VERTICAL_INTERMEDIATE_MODULE"
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
        question_count = 2 if concept_family in {"SKILL_STACKER", "CONCEPT_DRILL"} else raw_count
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
                abacus_rule="INTERMEDIATE_MODULE_SECTION_DYNAMIC",
                target_numbers_json=json.dumps(target_payload),
                place_value="INTERMEDIATE_MIXED",
                digit_pattern="INTERMEDIATE_MODULE",
                rows_count=question_count,
                difficulty="INTERMEDIATE",
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
            section.abacus_rule = "INTERMEDIATE_MODULE_SECTION_DYNAMIC"
            section.target_numbers_json = json.dumps(target_payload)
            section.place_value = "INTERMEDIATE_MIXED"
            section.digit_pattern = "INTERMEDIATE_MODULE"
            section.rows_count = question_count
            section.difficulty = "INTERMEDIATE"
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
    """Synchronize the Intermediate Module Level 4 curriculum skeleton.

    This sync is idempotent and intentionally creates only curriculum/master data.
    It does not create students, teachers, assignments, attempts, reports, or demo data.
    All Intermediate Module DPS records are created as Draft by default and use a
    5-minute time limit. Zero imports from app.question_engine.mm or
    seed_master_module.py -- IM is architecturally independent of MM.
    """
    print("[MathPath Seed] Intermediate Module sync started")
    module = _upsert_module(db)
    level = _upsert_level(db, module)

    lesson_count = 0
    dps_count = 0
    section_count = 0
    for lesson_number in range(1, 13):
        lesson = _upsert_lesson(db, level, lesson_number)
        lesson_count += 1
        for dps_number in range(1, DPS_PER_LESSON + 1):
            dps = _upsert_dps(db, lesson, lesson_number, dps_number)
            dps_count += 1
            sections = _upsert_sections(db, dps, lesson_number, dps_number)
            section_count += len(sections)

    db.commit()
    print(
        "[MathPath Seed] Intermediate Module sync completed: "
        f"module={MODULE_CODE}, level={LEVEL_CODE}, lessons={lesson_count}, "
        f"dps={dps_count}, sections={section_count}, duration_seconds={DPS_DURATION_SECONDS}"
    )
