import json
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Module, Level, Lesson, DPS, DPSSection
from app.seed.preparatory_module_l4_config import (
    PM_L4_LESSONS,
    PmL4DpsRule,
    PmL4DpsBlock,
    ADD_LESS,
    MULTIPLY,
    DIVIDE,
    DIVIDE_REMAINDER,
    BODMAS,
    CONCEPT_DRILL_MULTIPLY,
    CONCEPT_DRILL_DIVIDE,
)

MODULE_CODE = "PM"
LEVEL_CODE = "PM-L4"
MODULE_DISPLAY_ORDER = 2

CONCEPT_DRILL_MARKS_PER_QUESTION = 5.0

LESSON_TITLES = {
    1: "Add/Less (Abacus) & 2D X 1D Multiplication, 3D ÷ 1D Division",
    2: "Add/Less (Abacus/Visual), 2D X 1D Multiplication, 3D ÷ 1D Division & BODMAS",
    3: "Add/Less (Visual), 2D X 1D Multiplication, 3D ÷ 1D Division & BODMAS",
    4: "Add/Less (Abacus/Visual), 2D X 1D Multiplication & 3D ÷ 1D Division",
    5: "Add/Less 2D 5R (Visual), 2D X 1D Multiplication, 2D ÷ 1D & 3D ÷ 1D Division & BODMAS",
    6: "Add/Less 4D 4R (Abacus/Visual), 2D X 1D Multiplication, 2D ÷ 1D & 3D ÷ 1D Division & BODMAS",
    7: "2D ÷ 1D & 3D ÷ 1D Division, 2D X 1D Multiplication, Add/Less (Visual) & BODMAS",
    8: "2D X 1D Multiplication, 3D ÷ 1D Division, Add/Less (Abacus/Visual) & Concept Drill",
    9: "Add/Less (Abacus/Visual), 2D X 1D Multiplication, 2D ÷ 1D & 3D ÷ 1D Division & Introduction to 3D ÷ 1D With Remainder",
    10: "Add/Less 4D 3R (Abacus), 3D ÷ 1D With Remainder, 2D X 1D Multiplication & BODMAS",
    11: "Add/Less (Visual), BODMAS, 2D X 1D Multiplication, 3D ÷ 1D Division & 3D ÷ 1D With Remainder",
    12: "Add/Less (Abacus/Visual), BODMAS, 2D X 1D Multiplication, 3D ÷ 1D Division & 3D ÷ 1D With Remainder",
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
            level_name="Preparatory Level 4",
            internal_level_number=4,
            display_order=4,
            is_active=True,
        )
        db.add(level)
        db.flush()
    else:
        level.level_name = level.level_name or "Preparatory Level 4"
        level.internal_level_number = 4
        level.display_order = 4
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
            description="PM-L4 lesson reproduced from PL4.xlsx (12 authoritative lesson sheets) -- concept, technique, digit width, and operand ranges match the workbook; question values are generated fresh per publish/attempt via question_engine/pm_l4, PM-L4's own dedicated engine.",
            display_order=lesson_number,
            is_active=True,
        )
        db.add(lesson)
        db.flush()
    else:
        lesson.lesson_title = lesson_title
        lesson.description = lesson.description or "PM-L4 lesson reproduced from PL4.xlsx (12 authoritative lesson sheets) -- concept, technique, digit width, and operand ranges match the workbook; question values are generated fresh per publish/attempt via question_engine/pm_l4, PM-L4's own dedicated engine."
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
            default_duration_seconds=1200,  # flat 20-minute DPS timer (2026-08-26 timer standardization)
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
        dps.default_duration_seconds = 1200  # flat 20-minute DPS timer (2026-08-26 timer standardization)
        # Never touch publication_status here -- Admin (Learning Path Studio)
        # is the only publisher, same rule PM-L1/L2/L3's seeds follow.
        dps.is_active = True
    return dps


def _block_concept_family(block: PmL4DpsBlock) -> str:
    return {
        ADD_LESS: "DIRECT_ADD_LESS",
        MULTIPLY: "PM_L4_MULTIPLICATION",
        DIVIDE: "PM_L4_DIVISION",
        DIVIDE_REMAINDER: "PM_L4_DIVISION_WITH_REMAINDER",
        BODMAS: "BODMAS",
        CONCEPT_DRILL_MULTIPLY: "CONCEPT_DRILL",
        CONCEPT_DRILL_DIVIDE: "CONCEPT_DRILL",
    }[block.kind]


def _block_marks(block: PmL4DpsBlock) -> float:
    return CONCEPT_DRILL_MARKS_PER_QUESTION if block.kind in (CONCEPT_DRILL_MULTIPLY, CONCEPT_DRILL_DIVIDE) else 1.0


def _block_generator_config(lesson_number: int, dps_number: int, lesson_title: str, block: PmL4DpsBlock) -> dict:
    base = {
        "lessonNumber": lesson_number,
        "dpsNumber": dps_number,
        "lessonTitle": lesson_title,
        "dpsTitle": block.title,
        "blockKind": block.kind,
        "questionCount": block.question_count,
        "sourceCurriculum": "PM_L4_PL4_XLSX",
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
            "digitWidth": block.digit_width,
            "divisorMin": block.divisor_min, "divisorMax": block.divisor_max,
            "dividendMin": block.dividend_min, "dividendMax": block.dividend_max,
        })
    elif block.kind == DIVIDE_REMAINDER:
        base.update({
            "divisorMin": block.divisor_min, "divisorMax": block.divisor_max,
            "dividendMin": block.dividend_min, "dividendMax": block.dividend_max,
        })
    elif block.kind == BODMAS:
        base.update({"bodmasTemplate": block.bodmas_template})
    elif block.kind == CONCEPT_DRILL_MULTIPLY:
        base.update({"addMin": block.add_min, "addMax": block.add_max, "timesMin": block.times_min, "timesMax": block.times_max})
    elif block.kind == CONCEPT_DRILL_DIVIDE:
        base.update({"fromMin": block.from_min, "fromMax": block.from_max, "lessMin": block.less_min, "lessMax": block.less_max})
    return base


def _merge_section_config(lesson_number: int, dps_number: int, lesson_title: str, blocks: tuple[PmL4DpsBlock, ...]) -> dict:
    """Builds one DPSSection's generator_config_json from 1+ blocks that
    share the same section title (see _ensure_section's grouping contract
    below). Always emits a "subBlocks" list -- even for the common case of
    exactly one block -- so generation_service.py has exactly one code path
    to read from, rather than a single-block shape and a separate merged
    shape.
    """
    return {
        "lessonNumber": lesson_number,
        "dpsNumber": dps_number,
        "lessonTitle": lesson_title,
        "dpsTitle": blocks[0].title,
        "questionCount": sum(b.question_count for b in blocks),
        "sourceCurriculum": "PM_L4_PL4_XLSX",
        "subBlocks": [_block_generator_config(lesson_number, dps_number, lesson_title, b) for b in blocks],
    }


def _ensure_section(db: Session, dps: DPS, lesson_number: int, dps_number: int, lesson_title: str, blocks: tuple[PmL4DpsBlock, ...], section_number: int) -> None:
    """Creates/updates one DPSSection from a group of 1+ PmL4DpsBlock
    entries that share the same title -- e.g. a DPS's Concept Drill is
    authored as two separate blocks (CONCEPT_DRILL_MULTIPLY then
    CONCEPT_DRILL_DIVIDE, one question each) so each half can carry its own
    add/times/from/less ranges, but both must render as ONE "Concept Drill"
    section with both questions listed together -- not two separate
    single-question sections -- in Learning Path Studio and the student DPS
    instructions page (both read DPSSection rows directly). seed()'s caller
    groups consecutive same-titled blocks before calling this function; a
    normal solo block (e.g. Add/Less) is just a 1-tuple here.
    """
    primary = blocks[0]
    total_count = sum(b.question_count for b in blocks)
    section = db.query(DPSSection).filter(DPSSection.dps_id == dps.id, DPSSection.section_number == section_number).first()
    if not section:
        section = DPSSection(
            dps_id=dps.id,
            section_number=section_number,
            section_title=primary.title,
            question_count=total_count,
            concept_family=_block_concept_family(primary),
        )
        db.add(section)

    section.section_title = primary.title
    section.question_count = total_count
    section.concept_family = _block_concept_family(primary)
    section.operation_focus = "ADD_LESS" if primary.kind == ADD_LESS else primary.kind
    section.abacus_rule = None
    section.target_numbers_json = json.dumps(list(primary.target_numbers) if primary.kind == ADD_LESS else [])
    section.place_value = "ONES"
    section.digit_pattern = primary.digit_pattern if primary.kind == ADD_LESS else None
    section.rows_count = primary.rows if primary.kind == ADD_LESS else 0
    section.difficulty = "PM_L4_WORKBOOK_REPLICA"
    section.allow_negative_operands = primary.kind == ADD_LESS
    section.allow_negative_answer = False
    section.marks_per_question = _block_marks(primary)
    section.generator_config_json = json.dumps(_merge_section_config(lesson_number, dps_number, lesson_title, blocks))


def seed(db: Session):
    """Seed Preparatory Module Level 4, Lessons 1-12 -- the final level of
    the Preparatory Module.

    Curriculum/master-data seeding only -- idempotent, no demo users,
    assignments, or attempts, same contract as every other seed_*.py in
    this package. Fully additive with respect to PM-L1/L2/L3: reuses the
    existing "PM" Module row (same module, different level) but never
    touches the "PM-L1"/"PM-L2"/"PM-L3" Level or any of their
    Lessons/DPS/DPSSections.
    """
    module = _ensure_module(db)
    level = _ensure_level(db, module)

    for lesson_number in sorted(PM_L4_LESSONS):
        lesson_title = LESSON_TITLES.get(lesson_number, f"Lesson {lesson_number}")
        lesson = _ensure_lesson(db, level, lesson_number, lesson_title)
        dps_rules = PM_L4_LESSONS[lesson_number]

        for dps_number in sorted(dps_rules):
            rule: PmL4DpsRule = dps_rules[dps_number]
            total_questions = sum(block.question_count for block in rule.blocks)
            display_title = rule.dps_title
            if len(rule.blocks) == 1 and rule.blocks[0].kind in (ADD_LESS, MULTIPLY):
                display_title = _titled(rule.dps_title, rule.blocks[0].practice_mode)
            dps = _ensure_dps(db, lesson, dps_number, display_title, total_questions)

            # Group consecutive blocks that share the same section title into
            # one DPSSection -- this is what keeps a DPS's Concept Drill
            # (authored as two separate MULTIPLY/DIVIDE blocks so each half
            # can carry its own ranges) rendering as a single "Concept Drill"
            # section with both questions together, instead of two
            # single-question sections. Grouping by *consecutive* title match
            # (not a title->group dict) deliberately mirrors the blocks'
            # authored order and never merges same-titled blocks that aren't
            # adjacent -- no DPS in this level's config has that shape today,
            # but this keeps the behavior predictable if one ever does.
            groups: list[tuple[PmL4DpsBlock, ...]] = []
            for block in rule.blocks:
                if groups and groups[-1][0].title == block.title:
                    groups[-1] = groups[-1] + (block,)
                else:
                    groups.append((block,))

            for index, group in enumerate(groups, start=1):
                _ensure_section(db, dps, lesson_number, dps_number, lesson_title, group, section_number=index)

            # A prior run of this seed (before the grouping fix above) may
            # have left extra one-block-per-section rows behind -- e.g. 3
            # sections for a DPS that now has only 2 groups. Those stale rows
            # are otherwise invisible to this idempotent upsert loop (it only
            # ever touches section_number 1..len(groups)), so they must be
            # explicitly deleted or Learning Path Studio / the student DPS
            # instructions page would keep showing the old split.
            highest_existing = db.query(func.max(DPSSection.section_number)).filter(
                DPSSection.dps_id == dps.id
            ).scalar() or 0
            if highest_existing > len(groups):
                db.query(DPSSection).filter(
                    DPSSection.dps_id == dps.id,
                    DPSSection.section_number > len(groups),
                ).delete()

    db.commit()
