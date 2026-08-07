import json
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Module, Level, Lesson, DPS, DPSSection
from app.seed.bridge_module_l1_config import (
    BM_LESSONS,
    LESSON_TITLES,
    BmDpsRule,
    BmDpsBlock,
    ADD_LESS,
    MULTIPLY,
    DIVIDE,
    DIVIDE_REMAINDER,
    BODMAS,
    CONCEPT_DRILL_MULTIPLY,
    CONCEPT_DRILL_DIVIDE,
)

MODULE_CODE = "BM"
LEVEL_CODE = "BM-L1"
# Hierarchy is YLM-PM-BM-IM-MM (YLM=1, PM=2, IM=4, MM=5 -- confirmed by
# reading each module's own seed script) -- BM slots in at 3, its own
# untouched value; no other module's seed script is modified by this file.
MODULE_DISPLAY_ORDER = 3

CONCEPT_DRILL_MARKS_PER_QUESTION = 5.0


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
            module_name="Bridge Module",
            description="Bridge Module -- links Preparatory to Intermediate for MathPath Abacus learning.",
            display_order=MODULE_DISPLAY_ORDER,
            is_active=True,
        )
        db.add(module)
        db.flush()
    else:
        module.module_name = module.module_name or "Bridge Module"
        module.description = module.description or "Bridge Module -- links Preparatory to Intermediate for MathPath Abacus learning."
        module.display_order = module.display_order or MODULE_DISPLAY_ORDER
        module.is_active = True
    return module


def _ensure_level(db: Session, module: Module) -> Level:
    level = db.query(Level).filter(Level.module_id == module.id, Level.level_code == LEVEL_CODE).first()
    if not level:
        level = Level(
            module_id=module.id,
            level_code=LEVEL_CODE,
            level_name="Bridge Level 1",
            internal_level_number=1,
            display_order=1,
            is_active=True,
        )
        db.add(level)
        db.flush()
    else:
        level.level_name = level.level_name or "Bridge Level 1"
        level.internal_level_number = 1
        level.display_order = 1
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
            description="BM-L1 lesson reproduced from Bridge Level.xlsx (40 authoritative lesson sheets) -- concept, technique, digit width, and row count match the workbook; question values are generated fresh per publish/attempt via question_engine/bm, BM's own dedicated engine.",
            display_order=lesson_number,
            is_active=True,
        )
        db.add(lesson)
        db.flush()
    else:
        lesson.lesson_title = lesson_title
        lesson.description = lesson.description or "BM-L1 lesson reproduced from Bridge Level.xlsx (40 authoritative lesson sheets) -- concept, technique, digit width, and row count match the workbook; question values are generated fresh per publish/attempt via question_engine/bm, BM's own dedicated engine."
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
        # is the only publisher, same rule every PM-level seed follows.
        dps.is_active = True
    return dps


def _block_concept_family(block: BmDpsBlock) -> str:
    return {
        ADD_LESS: "DIRECT_ADD_LESS",
        MULTIPLY: "BM_MULTIPLICATION",
        DIVIDE: "BM_DIVISION",
        DIVIDE_REMAINDER: "BM_DIVISION_WITH_REMAINDER",
        BODMAS: "BODMAS",
        CONCEPT_DRILL_MULTIPLY: "CONCEPT_DRILL",
        CONCEPT_DRILL_DIVIDE: "CONCEPT_DRILL",
    }[block.kind]


def _block_marks(block: BmDpsBlock) -> float:
    return CONCEPT_DRILL_MARKS_PER_QUESTION if block.kind in (CONCEPT_DRILL_MULTIPLY, CONCEPT_DRILL_DIVIDE) else 1.0


def _block_generator_config(lesson_number: int, dps_number: int, lesson_title: str, block: BmDpsBlock) -> dict:
    base = {
        "lessonNumber": lesson_number,
        "dpsNumber": dps_number,
        "lessonTitle": lesson_title,
        "dpsTitle": block.title,
        "blockKind": block.kind,
        "questionCount": block.question_count,
        "sourceCurriculum": "BM_L1_BRIDGE_LEVEL_XLSX",
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


def _merge_section_config(lesson_number: int, dps_number: int, lesson_title: str, blocks: tuple[BmDpsBlock, ...]) -> dict:
    """Builds one DPSSection's generator_config_json from 1+ blocks that
    share the same section title (see _ensure_section's grouping contract
    below). Always emits a "subBlocks" list -- even for the common case of
    exactly one block -- so generation_service.py has exactly one code path
    to read from, rather than a single-block shape and a separate merged
    shape. Ported directly from PM-L4's post-2026-08-07-fix version (the
    fix that made a DPS's Concept Drill render as one section instead of
    two 1-question sections), built correctly here from day one.
    """
    return {
        "lessonNumber": lesson_number,
        "dpsNumber": dps_number,
        "lessonTitle": lesson_title,
        "dpsTitle": blocks[0].title,
        "questionCount": sum(b.question_count for b in blocks),
        "sourceCurriculum": "BM_L1_BRIDGE_LEVEL_XLSX",
        "subBlocks": [_block_generator_config(lesson_number, dps_number, lesson_title, b) for b in blocks],
    }


def _ensure_section(db: Session, dps: DPS, lesson_number: int, dps_number: int, lesson_title: str, blocks: tuple[BmDpsBlock, ...], section_number: int) -> None:
    """Creates/updates one DPSSection from a group of 1+ BmDpsBlock entries
    that share the same title -- e.g. a DPS's Concept Drill is authored as
    two separate blocks (CONCEPT_DRILL_MULTIPLY then CONCEPT_DRILL_DIVIDE,
    one question each) so each half can carry its own add/times/from/less
    ranges, but both must render as ONE "Concept Drill" section with both
    questions listed together -- not two separate single-question sections
    -- in Learning Path Studio and the student DPS instructions page (both
    read DPSSection rows directly). seed()'s caller groups consecutive
    same-titled blocks before calling this function; a normal solo block
    (e.g. Add/Less) is just a 1-tuple here.
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
    section.difficulty = "BM_L1_WORKBOOK_REPLICA"
    section.allow_negative_operands = primary.kind == ADD_LESS
    section.allow_negative_answer = False
    section.marks_per_question = _block_marks(primary)
    section.generator_config_json = json.dumps(_merge_section_config(lesson_number, dps_number, lesson_title, blocks))


def seed(db: Session):
    """Seed Bridge Module Level 1, Lessons 1-40 -- the sole level of the
    Bridge Module.

    Curriculum/master-data seeding only -- idempotent, no demo users,
    assignments, or attempts, same contract as every other seed_*.py in
    this package. Creates its own "BM" Module row (get-or-create, same
    pattern every module's seed script uses) -- never touches PM's, IM's,
    or MM's Module/Level/Lesson/DPS/DPSSection rows.
    """
    module = _ensure_module(db)
    level = _ensure_level(db, module)

    for lesson_number in sorted(BM_LESSONS):
        lesson_title = LESSON_TITLES.get(lesson_number, f"Lesson {lesson_number}")
        lesson = _ensure_lesson(db, level, lesson_number, lesson_title)
        dps_rules = BM_LESSONS[lesson_number]

        for dps_number in sorted(dps_rules):
            rule: BmDpsRule = dps_rules[dps_number]
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
            # single-question sections.
            groups: list[tuple[BmDpsBlock, ...]] = []
            for block in rule.blocks:
                if groups and groups[-1][0].title == block.title:
                    groups[-1] = groups[-1] + (block,)
                else:
                    groups.append((block,))

            for index, group in enumerate(groups, start=1):
                _ensure_section(db, dps, lesson_number, dps_number, lesson_title, group, section_number=index)

            # Idempotent-upsert cleanup: delete any stale section rows left
            # over from a prior run with more groups than the current one.
            highest_existing = db.query(func.max(DPSSection.section_number)).filter(
                DPSSection.dps_id == dps.id
            ).scalar() or 0
            if highest_existing > len(groups):
                db.query(DPSSection).filter(
                    DPSSection.dps_id == dps.id,
                    DPSSection.section_number > len(groups),
                ).delete()

    db.commit()
