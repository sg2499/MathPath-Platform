import json
from sqlalchemy.orm import Session

from app.models import Module, Level, Lesson, DPS, DPSSection
from app.seed.preparatory_module_l2_config import PM_L2_LESSONS, PmL2DpsRule, PmL2ConceptDrillItem

MODULE_CODE = "PM"
LEVEL_CODE = "PM-L2"

# Same display-order convention as seed_preparatory_module.py (PM-L1).
MODULE_DISPLAY_ORDER = 2

CONCEPT_DRILL_MARKS_PER_QUESTION = 5.0


def _practice_mode_suffix(practice_mode: str | None) -> str:
    """Bakes the resolved ABACUS/VISUAL tag directly into the DPS's display
    title (e.g. "... (Abacus)") so it shows up automatically everywhere the
    platform already displays DPS.dps_title -- including the Learning Path
    Studio -- with zero schema changes, per Shailesh's 2026-08-05 instruction
    that untagged sheets default to Abacus and the tag should show on every
    DPS name, not just the ones the workbook happened to label explicitly.
    """
    mode = (practice_mode or "ABACUS").upper()
    return "(Visual)" if mode == "VISUAL" else "(Abacus)"


def _titled(base_title: str, practice_mode: str | None) -> str:
    """Appends the resolved "(Abacus)"/"(Visual)" tag -- unless the literal
    workbook title already names that same mode somewhere in its own text
    (e.g. "3 Digit Addition & Subtraction - Visual", "Abacus - Addition &
    Subtraction", "Addition-Subtraction (Abacus)"). A large share of PM-L2's
    real DPS titles are lifted verbatim from the workbook's own column
    headers, which already say Abacus/Visual themselves -- appending the tag
    unconditionally on top of that produced literal double-tagging (e.g.
    "2 Digit Addition & Subtraction - Visual (Visual)"), caught via live
    verification against the running admin UI, not assumed away. A
    case-insensitive substring check on the resolved mode word covers every
    phrasing found in the real titles (prefix, suffix, mid-sentence, and
    already-parenthesized) without needing to special-case each one.
    """
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
            level_name="Preparatory Level 2",
            internal_level_number=2,
            display_order=2,
            is_active=True,
        )
        db.add(level)
        db.flush()
    else:
        level.level_name = level.level_name or "Preparatory Level 2"
        level.internal_level_number = 2
        level.display_order = 2
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
            description="PM-L2 lesson reproduced from Level 2.xlsx (12 authoritative lesson sheets) -- concept, technique, digit width, and practice mode match the workbook; question values are generated fresh per publish/attempt via question_engine/pm_l2, PM-L2's own dedicated engine.",
            display_order=lesson_number,
            is_active=True,
        )
        db.add(lesson)
        db.flush()
    else:
        lesson.lesson_title = lesson_title
        lesson.description = lesson.description or "PM-L2 lesson reproduced from Level 2.xlsx (12 authoritative lesson sheets) -- concept, technique, digit width, and practice mode match the workbook; question values are generated fresh per publish/attempt via question_engine/pm_l2, PM-L2's own dedicated engine."
        lesson.display_order = lesson_number
        lesson.is_active = True
    return lesson


def _ensure_dps(db: Session, lesson: Lesson, dps_number: int, dps_title: str, question_count: int, marks_per_question: float = 1.0) -> DPS:
    dps = db.query(DPS).filter(DPS.lesson_id == lesson.id, DPS.dps_number == dps_number).first()
    if not dps:
        dps = DPS(
            lesson_id=lesson.id,
            dps_number=dps_number,
            dps_title=dps_title,
            default_question_count=question_count,
            default_duration_seconds=1200,  # flat 20-minute DPS timer (2026-08-26 timer standardization)
            marks_per_question=marks_per_question,
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
        dps.default_duration_seconds = 1200  # flat 20-minute DPS timer (2026-08-26 timer standardization)
        # Never touch publication_status here -- Admin (Learning Path Studio)
        # is the only publisher, same rule PM-L1's seed follows. A re-run of
        # this seed must not un-publish or re-publish anything.
        dps.is_active = True
    return dps


def _ensure_normal_section(db: Session, dps: DPS, lesson_number: int, dps_number: int, lesson_title: str, rule: PmL2DpsRule, section_number: int) -> None:
    section = db.query(DPSSection).filter(DPSSection.dps_id == dps.id, DPSSection.section_number == section_number).first()
    if not section:
        section = DPSSection(
            dps_id=dps.id,
            section_number=section_number,
            section_title=rule.dps_title,
            question_count=rule.question_count,
            concept_family=rule.concept_family,
        )
        db.add(section)

    section.section_title = rule.dps_title
    section.question_count = rule.question_count
    section.concept_family = rule.concept_family
    section.operation_focus = rule.operation_focus
    section.abacus_rule = rule.abacus_rule
    section.target_numbers_json = json.dumps(rule.target_numbers)
    section.place_value = rule.place_value
    section.digit_pattern = rule.digit_pattern
    section.rows_count = rule.rows
    section.difficulty = "PM_L2_WORKBOOK_REPLICA"
    section.allow_negative_operands = True
    section.allow_negative_answer = False
    section.marks_per_question = None  # inherit DPS.marks_per_question (1)
    section.generator_config_json = json.dumps({
        "lessonNumber": lesson_number,
        "dpsNumber": dps_number,
        "lessonTitle": lesson_title,
        "dpsTitle": rule.dps_title,
        "conceptFamily": rule.concept_family,
        "operationFocus": rule.operation_focus,
        "abacusRule": rule.abacus_rule,
        "targetNumbers": rule.target_numbers,
        "digitPattern": rule.digit_pattern,
        "digitPatternSecondHalf": rule.digit_pattern_second_half,
        "generationTemplate": rule.generation_template,
        "revisionTemplates": list(rule.revision_templates),
        "rows": rule.rows,
        "questionCount": rule.question_count,
        "practiceMode": rule.practice_mode,
        "sourceCurriculum": "PM_L2_LEVEL_2_XLSX",
    })


def _ensure_concept_drill_section(db: Session, dps: DPS, lesson_number: int, dps_number: int, items: tuple[PmL2ConceptDrillItem, ...], section_number: int) -> None:
    section = db.query(DPSSection).filter(DPSSection.dps_id == dps.id, DPSSection.section_number == section_number).first()
    if not section:
        section = DPSSection(
            dps_id=dps.id,
            section_number=section_number,
            section_title="Concept Drill (Abacus)",
            question_count=len(items),
            concept_family="CONCEPT_DRILL",
        )
        db.add(section)

    section.section_title = "Concept Drill (Abacus)"
    section.question_count = len(items)
    section.concept_family = "CONCEPT_DRILL"
    section.operation_focus = "CONCEPT_DRILL"
    section.abacus_rule = None
    section.target_numbers_json = json.dumps([])
    section.place_value = None
    section.digit_pattern = None
    section.rows_count = 0
    section.difficulty = "PM_L2_WORKBOOK_REPLICA"
    section.allow_negative_operands = False
    section.allow_negative_answer = False
    # 5 marks/question, matching IM's Skill Stacker/Concept Drill override
    # convention (seed_intermediate_module.py) applied to PM-L2's own
    # concept-drill format, per Shailesh's explicit 2026-08-05 instruction.
    section.marks_per_question = CONCEPT_DRILL_MARKS_PER_QUESTION
    section.generator_config_json = json.dumps({
        "lessonNumber": lesson_number,
        "dpsNumber": dps_number,
        "conceptFamily": "CONCEPT_DRILL",
        "questionCount": len(items),
        "items": [
            {
                "drillFormat": item.drill_format,
                "addValue": item.add_value,
                "timesValue": item.times_value,
                "fromValue": item.from_value,
                "lessValue": item.less_value,
                "rangeArchetype": item.range_archetype,
                "rangeStep": item.range_step,
                "rangeNTerms": item.range_n_terms,
            }
            for item in items
        ],
        "sourceCurriculum": "PM_L2_LEVEL_2_XLSX",
    })


def seed(db: Session):
    """Seed Preparatory Module Level 2, Lessons 1-12.

    Curriculum/master-data seeding only -- idempotent, no demo users,
    assignments, or attempts, same contract as seed_preparatory_module.py
    (PM-L1) and every other seed_*.py in this package. Safe to run on every
    deploy. Fully additive with respect to PM-L1: reuses the existing "PM"
    Module row (same module, different level) but never touches the
    "PM-L1" Level or any of its Lessons/DPS/DPSSections.
    """
    module = _ensure_module(db)
    level = _ensure_level(db, module)

    for lesson_number in sorted(PM_L2_LESSONS):
        lesson_rule = PM_L2_LESSONS[lesson_number]
        lesson = _ensure_lesson(db, level, lesson_number, lesson_rule.lesson_title)

        for dps_number in sorted(lesson_rule.dps):
            dps_rule = lesson_rule.dps[dps_number]
            has_drill_here = bool(lesson_rule.concept_drill) and dps_number == lesson_rule.concept_drill_dps_number
            display_title = _titled(dps_rule.dps_title, dps_rule.practice_mode)
            dps = _ensure_dps(db, lesson, dps_number, display_title, dps_rule.question_count)
            _ensure_normal_section(db, dps, lesson_number, dps_number, lesson_rule.lesson_title, dps_rule, section_number=1)
            if has_drill_here:
                _ensure_concept_drill_section(db, dps, lesson_number, dps_number, lesson_rule.concept_drill, section_number=2)

        # Concept-drill-only DPS (no PmL2DpsRule entry at its number, e.g.
        # DPS5 in Lessons 2, 3, 10, 11, 12).
        if lesson_rule.concept_drill and lesson_rule.concept_drill_dps_number not in lesson_rule.dps:
            drill_dps_number = lesson_rule.concept_drill_dps_number
            dps = _ensure_dps(db, lesson, drill_dps_number, "Concept Drill (Abacus)", len(lesson_rule.concept_drill), marks_per_question=CONCEPT_DRILL_MARKS_PER_QUESTION)
            _ensure_concept_drill_section(db, dps, lesson_number, drill_dps_number, lesson_rule.concept_drill, section_number=1)

    db.commit()
