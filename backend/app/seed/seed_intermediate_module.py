"""Intermediate Module (IM) curriculum seed -- IM-L4 and IM-L3.

Structural mirror of seed_master_module.py (same Module -> Level -> Lesson ->
DPS -> DPSSection upsert pattern, same idempotency guarantees, same DRAFT-only /
manual-review-before-publish safety posture) but IM-specific end to end: it
imports only from app.question_engine.im (never app.question_engine.mm or
seed_master_module.py itself), so IM's data and MM's data have zero code
overlap. Source of truth for section structure is
app.question_engine.im.curriculum_map.IM_CURRICULUM_MAP, keyed by level code.

This module seeds every IM level from one shared, level-parametrized upsert
pipeline (`_LevelSeedConfig` + the `_upsert_*` functions below, which all take
that config explicitly rather than reading module-level constants) instead of
duplicating the Module -> Level -> Lesson -> DPS -> DPSSection logic per
level. IM-L4 (LEVEL 8.xlsx, "Level - 8" images) and IM-L3 (IM3 Lvl 7 New.xlsx,
"Level - 7" images) are two configs run through that one pipeline; adding a
future IM-L5/L6/etc. is a third config, not a third copy of this file.
"""

import json
from dataclasses import dataclass
from sqlalchemy.orm import Session
from app.models import DPS, DPSSection, Lesson, Level, Module
from app.question_engine.im.config import OperationFocusForConcept
from app.question_engine.im.curriculum_map import IM_CURRICULUM_MAP

MODULE_CODE = "IM"
MODULE_NAME = "Intermediate Module"
MODULE_DESCRIPTION = "MathPath Intermediate Module practice curriculum."
MODULE_DISPLAY_ORDER = 4

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


@dataclass(frozen=True)
class _LevelSeedConfig:
    level_code: str
    level_name: str
    internal_level_number: int
    display_order: int
    curriculum_map: dict[int, dict[int, list[dict]]]
    source_level_label: str          # e.g. "Level - 8" -- the images-folder name
    source_workbook_tag: str          # e.g. "IM-L8" -- the image filename prefix


LEVEL_4_CONFIG = _LevelSeedConfig(
    level_code="IM-L4",
    level_name="Intermediate Module Level 4",
    internal_level_number=4,
    display_order=4,
    curriculum_map=IM_CURRICULUM_MAP["IM-L4"],
    source_level_label="Level - 8",
    source_workbook_tag="IM-L8",
)

LEVEL_3_CONFIG = _LevelSeedConfig(
    level_code="IM-L3",
    level_name="Intermediate Module Level 3",
    internal_level_number=3,
    display_order=3,
    curriculum_map=IM_CURRICULUM_MAP["IM-L3"],
    source_level_label="Level - 7",
    source_workbook_tag="IM-L7",
)


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


def _BuildLessonTitles(config: _LevelSeedConfig) -> dict[int, str]:
    """Every lesson name is derived directly from the level's curriculum map -- the
    union of every unique concept taught anywhere across that lesson's 5 DPS sheets,
    alphabetized and joined. This is generated, not hand-typed, so it can never drift
    out of sync with the actual section data (add a concept to the curriculum map and
    the lesson title picks it up automatically).
    """
    Titles: dict[int, str] = {}
    for LessonNumber, DpsMap in config.curriculum_map.items():
        Labels: list[str] = []
        for _DpsNumber, Sections in DpsMap.items():
            for Section in Sections:
                Label = _LessonConceptLabel(Section)
                if Label not in Labels:
                    Labels.append(Label)
        Labels.sort()
        Titles[LessonNumber] = _JoinLabels(Labels)
    return Titles


LESSON_SOURCE_TYPES = {lesson_number: "IMAGE_WORKSHEET" for lesson_number in range(1, 13)}


def _normalise_source_filename(config: _LevelSeedConfig, lesson_number: int, dps_number: int) -> str:
    filename = f"{config.source_workbook_tag}_L{lesson_number}-DPS-{dps_number}.png"
    return f"{config.source_level_label}/Lesson - {lesson_number}/{filename}"


def _dps_sections(config: _LevelSeedConfig, lesson_number: int, dps_number: int) -> list[dict]:
    sections = config.curriculum_map.get(lesson_number, {}).get(dps_number, [])
    return [
        {
            **section,
            "sectionNumber": index,
            "operationFocus": OperationFocusForConcept(section["conceptFamily"]),
        }
        for index, section in enumerate(sections, start=1)
    ]


def _dps_display_title(config: _LevelSeedConfig, lesson_titles: dict[int, str], lesson_number: int, dps_number: int) -> str:
    sections = _dps_sections(config, lesson_number, dps_number)
    titles: list[str] = []
    for section in sections:
        title = str(section["sectionTitle"])
        if title not in titles:
            titles.append(title)
    if not titles:
        return lesson_titles.get(lesson_number, f"Lesson {lesson_number}")
    if len(titles) == 1:
        return titles[0]
    return ", ".join(titles[:-1]) + " & " + titles[-1]


def _dps_question_count(config: _LevelSeedConfig, lesson_number: int, dps_number: int) -> int:
    return sum(int(section.get("questionCount") or 0) for section in _dps_sections(config, lesson_number, dps_number))


def _section_config(config: _LevelSeedConfig, lesson_titles: dict[int, str], lesson_number: int, dps_number: int) -> dict:
    source_type = LESSON_SOURCE_TYPES[lesson_number]
    return {
        "moduleCode": MODULE_CODE,
        "levelCode": config.level_code,
        "lessonNumber": lesson_number,
        "dpsNumber": dps_number,
        "dpsTitle": _dps_display_title(config, lesson_titles, lesson_number, dps_number),
        "lessonTitle": lesson_titles[lesson_number],
        "sourceType": source_type,
        "sourceFile": _normalise_source_filename(config, lesson_number, dps_number),
        "sourceLevelLabel": config.source_level_label,
        "seedMode": "DYNAMIC_INTERMEDIATE_MODULE",
        "durationSeconds": DPS_DURATION_SECONDS,
        "manualReviewRequiredBeforePublishing": True,
        # Shared across every IM level -- see the matching comment in
        # question_engine/im/generator.py (2026-07-17).
        "generatorPackage": "IM_SECTION_AWARE_PACKAGE_1",
        "dpsSections": _dps_sections(config, lesson_number, dps_number),
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


def _upsert_level(db: Session, module: Module, config: _LevelSeedConfig) -> Level:
    level = (
        db.query(Level)
        .filter(Level.module_id == module.id, Level.level_code == config.level_code)
        .first()
    )
    if not level:
        level = Level(
            module_id=module.id,
            level_code=config.level_code,
            level_name=config.level_name,
            internal_level_number=config.internal_level_number,
            display_order=config.display_order,
            is_active=True,
        )
        db.add(level)
        db.flush()
    else:
        level.level_name = config.level_name
        level.internal_level_number = config.internal_level_number
        level.display_order = config.display_order
        level.is_active = True
    return level


def _upsert_lesson(db: Session, level: Level, lesson_titles: dict[int, str], lesson_number: int) -> Lesson:
    lesson = (
        db.query(Lesson)
        .filter(Lesson.level_id == level.id, Lesson.lesson_number == lesson_number)
        .first()
    )
    title = lesson_titles[lesson_number]
    if not lesson:
        lesson = Lesson(
            level_id=level.id,
            lesson_number=lesson_number,
            lesson_title=title,
            description=f"Intermediate Module Lesson {lesson_number}: {title}",
            display_order=lesson_number,
            is_active=True,
        )
        db.add(lesson)
        db.flush()
    else:
        lesson.lesson_title = title
        lesson.description = f"Intermediate Module Lesson {lesson_number}: {title}"
        lesson.display_order = lesson_number
        lesson.is_active = True
    return lesson


def _upsert_dps(db: Session, lesson: Lesson, config: _LevelSeedConfig, lesson_titles: dict[int, str],
                 lesson_number: int, dps_number: int) -> DPS:
    dps = (
        db.query(DPS)
        .filter(DPS.lesson_id == lesson.id, DPS.dps_number == dps_number)
        .first()
    )
    title = _dps_display_title(config, lesson_titles, lesson_number, dps_number)
    question_count = _dps_question_count(config, lesson_number, dps_number)
    if not dps:
        dps = DPS(
            lesson_id=lesson.id,
            dps_number=dps_number,
            dps_title=title,
            default_question_count=question_count,
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
        dps.dps_title = title
        dps.default_question_count = question_count
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


def _upsert_sections(db: Session, dps: DPS, config: _LevelSeedConfig, lesson_titles: dict[int, str],
                      lesson_number: int, dps_number: int) -> list[DPSSection]:
    section_config_base = _section_config(config, lesson_titles, lesson_number, dps_number)
    target_payload = {
        "sourceType": section_config_base["sourceType"],
        "sourceFile": section_config_base["sourceFile"],
    }
    workbook_sections = _dps_sections(config, lesson_number, dps_number)
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
        # Concept Drill and Skill Stacker only ever carry 2 questions per sheet
        # occurrence -- at the DPS's default 1 mark/question that section would
        # contribute just 2 marks and make the sheet's total marks come out
        # non-whole. 5 marks each (10 total for the section) keeps the DPS
        # total round. None everywhere else means "inherit DPS.marks_per_question"
        # (unchanged, still 1) -- this rule is keyed by concept_family, not by
        # level, so it applies identically to IM-L3 and IM-L4 with zero extra code.
        section_marks_per_question = 5.0 if concept_family in {"SKILL_STACKER", "CONCEPT_DRILL"} else None

        section_config = {
            **section_config_base,
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
                marks_per_question=section_marks_per_question,
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
            section.marks_per_question = section_marks_per_question
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


def _seed_level(db: Session, module: Module, config: _LevelSeedConfig) -> tuple[int, int, int]:
    lesson_titles = _BuildLessonTitles(config)
    level = _upsert_level(db, module, config)

    lesson_count = 0
    dps_count = 0
    section_count = 0
    for lesson_number in range(1, 13):
        lesson = _upsert_lesson(db, level, lesson_titles, lesson_number)
        lesson_count += 1
        for dps_number in range(1, DPS_PER_LESSON + 1):
            dps = _upsert_dps(db, lesson, config, lesson_titles, lesson_number, dps_number)
            dps_count += 1
            sections = _upsert_sections(db, dps, config, lesson_titles, lesson_number, dps_number)
            section_count += len(sections)

    return lesson_count, dps_count, section_count


def seed(db: Session) -> None:
    """Synchronize the Intermediate Module curriculum skeleton for every live IM
    level (currently IM-L4 and IM-L3).

    This sync is idempotent and intentionally creates only curriculum/master data.
    It does not create students, teachers, assignments, attempts, reports, or demo data.
    All Intermediate Module DPS records are created as Draft by default and use a
    5-minute time limit. Zero imports from app.question_engine.mm or
    seed_master_module.py -- IM is architecturally independent of MM.
    """
    print("[MathPath Seed] Intermediate Module sync started")
    module = _upsert_module(db)

    total_lessons = total_dps = total_sections = 0
    for config in (LEVEL_4_CONFIG, LEVEL_3_CONFIG):
        lesson_count, dps_count, section_count = _seed_level(db, module, config)
        total_lessons += lesson_count
        total_dps += dps_count
        total_sections += section_count
        print(
            "[MathPath Seed] Intermediate Module level sync completed: "
            f"module={MODULE_CODE}, level={config.level_code}, lessons={lesson_count}, "
            f"dps={dps_count}, sections={section_count}, duration_seconds={DPS_DURATION_SECONDS}"
        )

    db.commit()
    print(
        "[MathPath Seed] Intermediate Module sync completed: "
        f"module={MODULE_CODE}, levels=2, lessons={total_lessons}, "
        f"dps={total_dps}, sections={total_sections}"
    )
