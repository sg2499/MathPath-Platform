import json
import random
from uuid import uuid4
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models import DPS, DPSSection, GeneratedQuestionSet, GeneratedQuestion, QuestionOption, Module, Level, Lesson
from app.question_engine.ylm import YLMConfig, generate_ylm_question_set
from app.question_engine.mm import MMConfig, GenerateMmQuestionSet, IsPackage1Supported
from app.question_engine.im import IMConfig, GenerateImQuestionSet, IsImConceptSupported
from app.question_engine.pm import PMConfig, generate_pm_question_set
from app.question_engine.pm_l2 import PML2Config, PML2ConceptDrillConfig, generate_pm_l2_question_set
from app.question_engine.pm_l2.concept_drill import generate_concept_drill_question, generate_range_sum_question
from app.question_engine.pm_l3 import (
    PML3Config,
    PML3ConceptDrillConfig,
    PML3MultiplyConfig,
    PML3DivideConfig,
    PML3BodmasConfig,
    generate_pm_l3_question_set,
    generate_pm_l3_multiply_set,
    generate_pm_l3_divide_set,
    generate_pm_l3_bodmas_set,
)
from app.question_engine.pm_l3.concept_drill import generate_concept_drill_question as generate_pm_l3_concept_drill_question
from app.question_engine.pm_l4 import (
    PML4Config,
    PML4ConceptDrillConfig,
    PML4MultiplyConfig,
    PML4DivideConfig,
    PML4DivideRemainderConfig,
    PML4BodmasConfig,
    generate_pm_l4_question_set,
    generate_pm_l4_multiply_set,
    generate_pm_l4_divide_set,
    generate_pm_l4_divide_remainder_set,
    generate_pm_l4_bodmas_set,
)
from app.question_engine.pm_l4.concept_drill import generate_concept_drill_question as generate_pm_l4_concept_drill_question
from app.question_engine.bm import (
    BMConfig,
    BMConceptDrillConfig,
    BMMultiplyConfig,
    BMDivideConfig,
    BMDivideRemainderConfig,
    BMBodmasConfig,
    generate_bm_question_set,
    generate_bm_multiply_set,
    generate_bm_divide_set,
    generate_bm_divide_remainder_set,
    generate_bm_bodmas_set,
)
from app.question_engine.bm.concept_drill import generate_concept_drill_question as generate_bm_concept_drill_question
from app.core.errors import api_error

def build_config_from_dps(db: Session, dps: DPS, seed: str) -> YLMConfig:
    lesson = db.get(Lesson, dps.lesson_id)
    level = db.get(Level, lesson.level_id)
    module = db.get(Module, level.module_id)
    section = db.query(DPSSection).filter(DPSSection.dps_id == dps.id).order_by(DPSSection.section_number).first()
    return YLMConfig(
        module_code=module.module_code,
        level_code=level.level_code,
        lesson_number=lesson.lesson_number,
        dps_number=dps.dps_number,
        question_count=dps.default_question_count,
        rows=section.rows_count or 3,
        concept_family=section.concept_family,
        operation_focus=section.operation_focus or "ADD_LESS",
        abacus_rule=section.abacus_rule,
        target_numbers=json.loads(section.target_numbers_json or "[]"),
        place_value=section.place_value or "MIXED",
        digit_pattern=section.digit_pattern or "1D_AND_2D",
        allow_negative_operands=section.allow_negative_operands,
        allow_negative_answer=section.allow_negative_answer,
        seed=seed,
    )


def build_mm_config_from_dps(db: Session, dps: DPS, seed: str) -> MMConfig:
    LessonRecord = db.get(Lesson, dps.lesson_id)
    LevelRecord = db.get(Level, LessonRecord.level_id) if LessonRecord else None
    ModuleRecord = db.get(Module, LevelRecord.module_id) if LevelRecord else None
    SectionRecord = (
        db.query(DPSSection)
        .filter(DPSSection.dps_id == dps.id)
        .order_by(DPSSection.section_number)
        .first()
    )
    GeneratorConfig = {}
    if SectionRecord and SectionRecord.generator_config_json:
        try:
            GeneratorConfig = json.loads(SectionRecord.generator_config_json or "{}")
        except Exception:
            GeneratorConfig = {}

    DpsTitle = getattr(dps, "dps_title", "") or GeneratorConfig.get("dpsTitle", "")
    LessonTitle = getattr(LessonRecord, "lesson_title", "") or GeneratorConfig.get("lessonTitle", "")
    ConceptFamily = getattr(SectionRecord, "concept_family", None) or GeneratorConfig.get("conceptFamily", "CONCEPT_DRILL")
    OperationFocus = getattr(SectionRecord, "operation_focus", None) or "MIXED"

    return MMConfig(
        ModuleCode=getattr(ModuleRecord, "module_code", "MM") or "MM",
        LevelCode=getattr(LevelRecord, "level_code", "MM-L1") or "MM-L1",
        LessonNumber=int(getattr(LessonRecord, "lesson_number", 0) or 0),
        DpsNumber=int(getattr(dps, "dps_number", 0) or 0),
        DpsTitle=DpsTitle,
        LessonTitle=LessonTitle,
        QuestionCount=int(getattr(dps, "default_question_count", 20) or 20),
        Seed=seed,
        ConceptFamily=ConceptFamily,
        OperationFocus=OperationFocus,
        DigitPattern=getattr(SectionRecord, "digit_pattern", "MASTER_MODULE") if SectionRecord else "MASTER_MODULE",
        Difficulty=getattr(SectionRecord, "difficulty", "MASTER") if SectionRecord else "MASTER",
        GeneratorConfig=GeneratorConfig,
    )


def build_im_config_from_dps(db: Session, dps: DPS, seed: str) -> IMConfig:
    LessonRecord = db.get(Lesson, dps.lesson_id)
    LevelRecord = db.get(Level, LessonRecord.level_id) if LessonRecord else None
    ModuleRecord = db.get(Module, LevelRecord.module_id) if LevelRecord else None
    SectionRecord = (
        db.query(DPSSection)
        .filter(DPSSection.dps_id == dps.id)
        .order_by(DPSSection.section_number)
        .first()
    )
    GeneratorConfig = {}
    if SectionRecord and SectionRecord.generator_config_json:
        try:
            GeneratorConfig = json.loads(SectionRecord.generator_config_json or "{}")
        except Exception:
            GeneratorConfig = {}

    DpsTitle = getattr(dps, "dps_title", "") or GeneratorConfig.get("dpsTitle", "")
    LessonTitle = getattr(LessonRecord, "lesson_title", "") or GeneratorConfig.get("lessonTitle", "")
    ConceptFamily = getattr(SectionRecord, "concept_family", None) or GeneratorConfig.get("conceptFamily", "ADD_LESS")
    OperationFocus = getattr(SectionRecord, "operation_focus", None) or "MIXED"

    return IMConfig(
        ModuleCode=getattr(ModuleRecord, "module_code", "IM") or "IM",
        LevelCode=getattr(LevelRecord, "level_code", "IM-L4") or "IM-L4",
        LessonNumber=int(getattr(LessonRecord, "lesson_number", 0) or 0),
        DpsNumber=int(getattr(dps, "dps_number", 0) or 0),
        DpsTitle=DpsTitle,
        LessonTitle=LessonTitle,
        QuestionCount=int(getattr(dps, "default_question_count", 10) or 10),
        Seed=seed,
        ConceptFamily=ConceptFamily,
        OperationFocus=OperationFocus,
        DigitPattern=getattr(SectionRecord, "digit_pattern", "INTERMEDIATE_MODULE") if SectionRecord else "INTERMEDIATE_MODULE",
        Difficulty=getattr(SectionRecord, "difficulty", "INTERMEDIATE") if SectionRecord else "INTERMEDIATE",
        GeneratorConfig=GeneratorConfig,
    )


def build_pm_config_from_dps(db: Session, dps: DPS, seed: str) -> PMConfig:
    """PM's own config builder -- deliberately not shared with
    build_config_from_dps() (YLM's) even though the shape looks similar.
    Keeping this separate means a future change to YLM's builder (e.g. a new
    field, a new default) can never silently change what PM reads from its
    DPSSection row, and vice versa.
    """
    LessonRecord = db.get(Lesson, dps.lesson_id)
    LevelRecord = db.get(Level, LessonRecord.level_id) if LessonRecord else None
    ModuleRecord = db.get(Module, LevelRecord.module_id) if LevelRecord else None
    SectionRecord = (
        db.query(DPSSection)
        .filter(DPSSection.dps_id == dps.id)
        .order_by(DPSSection.section_number)
        .first()
    )
    GeneratorConfig = {}
    if SectionRecord and SectionRecord.generator_config_json:
        try:
            GeneratorConfig = json.loads(SectionRecord.generator_config_json or "{}")
        except Exception:
            GeneratorConfig = {}

    return PMConfig(
        module_code=getattr(ModuleRecord, "module_code", "PM") or "PM",
        level_code=getattr(LevelRecord, "level_code", "PM-L1") or "PM-L1",
        lesson_number=int(getattr(LessonRecord, "lesson_number", 0) or 0),
        dps_number=int(getattr(dps, "dps_number", 0) or 0),
        question_count=int(getattr(dps, "default_question_count", 10) or 10),
        rows=int(getattr(SectionRecord, "rows_count", 3) or 3) if SectionRecord else 3,
        concept_family=getattr(SectionRecord, "concept_family", None) or GeneratorConfig.get("conceptFamily", "DIRECT_ADD_LESS"),
        operation_focus=getattr(SectionRecord, "operation_focus", None) or "ADD_LESS",
        abacus_rule=getattr(SectionRecord, "abacus_rule", None),
        target_numbers=json.loads(SectionRecord.target_numbers_json or "[]") if SectionRecord else [],
        place_value=getattr(SectionRecord, "place_value", None) or "ONES",
        digit_pattern=getattr(SectionRecord, "digit_pattern", None) or "1D",
        allow_negative_operands=getattr(SectionRecord, "allow_negative_operands", True) if SectionRecord else True,
        allow_negative_answer=getattr(SectionRecord, "allow_negative_answer", False) if SectionRecord else False,
        seed=seed,
        lesson_title=getattr(LessonRecord, "lesson_title", "") or GeneratorConfig.get("lessonTitle", ""),
        dps_title=getattr(dps, "dps_title", "") or GeneratorConfig.get("dpsTitle", ""),
        generation_template=GeneratorConfig.get("generationTemplate") or "DIRECT",
        revision_templates=tuple(GeneratorConfig.get("revisionTemplates") or ()),
    )


def _build_pm_l2_normal_config(dps: DPS, LessonRecord, section: DPSSection, seed: str) -> PML2Config:
    """PM-L2's own config builder for a single vertical-stack (non-concept-
    drill) DPSSection row. Deliberately separate from build_pm_config_from_dps
    (PM-L1's) even though the shape looks similar -- same reasoning as that
    function's own docstring: a future change to PM-L1's builder must never
    silently change what PM-L2 reads, and vice versa.
    """
    GeneratorConfig = {}
    if section.generator_config_json:
        try:
            GeneratorConfig = json.loads(section.generator_config_json or "{}")
        except Exception:
            GeneratorConfig = {}
    return PML2Config(
        module_code="PM",
        level_code="PM-L2",
        lesson_number=int(getattr(LessonRecord, "lesson_number", 0) or 0),
        dps_number=int(getattr(dps, "dps_number", 0) or 0),
        question_count=int(getattr(section, "question_count", None) or getattr(dps, "default_question_count", 10) or 10),
        rows=int(getattr(section, "rows_count", 3) or 3),
        concept_family=getattr(section, "concept_family", None) or GeneratorConfig.get("conceptFamily", "DIRECT_ADD_LESS"),
        operation_focus=getattr(section, "operation_focus", None) or "ADD_LESS",
        abacus_rule=getattr(section, "abacus_rule", None),
        target_numbers=json.loads(section.target_numbers_json or "[]"),
        place_value=getattr(section, "place_value", None) or "ONES",
        digit_pattern=getattr(section, "digit_pattern", None) or GeneratorConfig.get("digitPattern") or "1D",
        allow_negative_operands=getattr(section, "allow_negative_operands", True),
        allow_negative_answer=getattr(section, "allow_negative_answer", False),
        seed=seed,
        lesson_title=getattr(LessonRecord, "lesson_title", "") or GeneratorConfig.get("lessonTitle", ""),
        dps_title=getattr(dps, "dps_title", "") or GeneratorConfig.get("dpsTitle", ""),
        generation_template=GeneratorConfig.get("generationTemplate") or "DIRECT",
        revision_templates=tuple(GeneratorConfig.get("revisionTemplates") or ()),
        practice_mode=GeneratorConfig.get("practiceMode"),
        digit_pattern_second_half=GeneratorConfig.get("digitPatternSecondHalf"),
    )


def _generate_pm_l2_concept_drill_section_questions(dps: DPS, LessonRecord, section: DPSSection, seed: str) -> list[dict]:
    """Generates one Concept Drill DPSSection's questions from its literal
    pinned per-item workbook values (addValue/timesValue, fromValue/lessValue,
    rangeArchetype/rangeStep/rangeNTerms -- see
    seed_preparatory_module_l2.py's _ensure_concept_drill_section). PM-L2's
    Concept Drill format is a genuine literal replica of the workbook, not a
    randomized-within-range pool like the vertical add/less blocks, per
    Shailesh's explicit "follow the workbook as is" instruction (2026-08-05).
    Each item still passes through the real random-distractor/option-shuffle
    machinery (generate_concept_drill_question), so options vary per seed even
    though the tested value itself is pinned.
    """
    GeneratorConfig = {}
    if section.generator_config_json:
        try:
            GeneratorConfig = json.loads(section.generator_config_json or "{}")
        except Exception:
            GeneratorConfig = {}
    items = GeneratorConfig.get("items") or []
    lesson_number = int(getattr(LessonRecord, "lesson_number", 0) or 0)
    dps_number = int(getattr(dps, "dps_number", 0) or 0)
    questions: list[dict] = []
    for index, item in enumerate(items):
        drill_format = item.get("drillFormat")
        item_seed = f"{seed}-DRILL-{index}"
        q_rng_seed = item_seed
        config = PML2ConceptDrillConfig(
            module_code="PM",
            level_code="PM-L2",
            lesson_number=lesson_number,
            dps_number=dps_number,
            drill_format=drill_format,
            seed=item_seed,
            add_min=item.get("addValue") or 1,
            add_max=item.get("addValue") or 1,
            times_value=item.get("timesValue") or 12,
            from_min=item.get("fromValue") or 1,
            from_max=item.get("fromValue") or 1,
            less_min=item.get("lessValue") or 2,
            less_max=item.get("lessValue") or 2,
            range_step=item.get("rangeStep"),
        )
        rng = random.Random(q_rng_seed)
        if drill_format == "CONCEPT_DRILL_RANGE_SUM":
            question = generate_range_sum_question(
                config, rng,
                archetype=item.get("rangeArchetype"),
                n_terms=item.get("rangeNTerms"),
            )
        else:
            question = generate_concept_drill_question(config, rng)
        question["seed"] = item_seed
        questions.append(question)
    return questions


def _pm_l3_generator_config(section: DPSSection) -> dict:
    if not section.generator_config_json:
        return {}
    try:
        return json.loads(section.generator_config_json or "{}")
    except Exception:
        return {}


def _generate_pm_l3_block_questions(GeneratorConfig: dict, lesson_number: int, dps_number: int, seed: str) -> list[dict]:
    """Generates questions for exactly one PM-L3 block config -- dispatches
    on blockKind (ADD_LESS/MULTIPLY/DIVIDE/BODMAS/CONCEPT_DRILL_MULTIPLY/
    CONCEPT_DRILL_DIVIDE), all reading from question_engine/pm_l3, PM-L3's
    own fully independent engine. Mirrors PM-L2's generate_pm_l2_preview's
    per-section dispatch, generalized to more than two block kinds since
    PM-L3 has five (vs PM-L2's two).

    Called once per sub-block by _generate_pm_l3_section_questions -- a
    DPSSection may bundle more than one sub-block under one section (e.g.
    Concept Drill's MULTIPLY + DIVIDE halves, which must render as ONE
    section, not two, in Learning Path Studio and the student DPS
    instructions page -- see seed_preparatory_module_l3.py's seed(), fixed
    2026-08-06). Reads every field from GeneratorConfig (the block's own
    JSON config, not a parent DPSSection row) so it never depends on a
    section row correctly reflecting more than one block's worth of
    settings.
    """
    block_kind = GeneratorConfig.get("blockKind")
    question_count = int(GeneratorConfig.get("questionCount") or 10)

    if block_kind == "ADD_LESS":
        config = PML3Config(
            module_code="PM",
            level_code="PM-L3",
            lesson_number=lesson_number,
            dps_number=dps_number,
            question_count=question_count,
            rows=int(GeneratorConfig.get("rows") or 4),
            concept_family="DIRECT_ADD_LESS",
            operation_focus="ADD_LESS",
            target_numbers=list(GeneratorConfig.get("targetNumbers") or []),
            place_value="ONES",
            digit_pattern=GeneratorConfig.get("digitPattern") or "2D_FULL",
            allow_negative_operands=True,
            allow_negative_answer=False,
            seed=seed,
            lesson_title=GeneratorConfig.get("lessonTitle", ""),
            dps_title=GeneratorConfig.get("dpsTitle", ""),
            generation_template=GeneratorConfig.get("generationTemplate") or "DIRECT",
            revision_templates=tuple(GeneratorConfig.get("revisionTemplates") or ()),
            practice_mode=GeneratorConfig.get("practiceMode"),
            digit_pattern_second_half=GeneratorConfig.get("digitPatternSecondHalf"),
            rows_second_half=GeneratorConfig.get("rowsSecondHalf"),
        )
        return generate_pm_l3_question_set(config)

    if block_kind == "MULTIPLY":
        config = PML3MultiplyConfig(
            module_code="PM", level_code="PM-L3", lesson_number=lesson_number, dps_number=dps_number,
            seed=seed,
            number_min=int(GeneratorConfig.get("numberMin") or 11),
            number_max=int(GeneratorConfig.get("numberMax") or 99),
            multiplier_min=int(GeneratorConfig.get("multiplierMin") or 1),
            multiplier_max=int(GeneratorConfig.get("multiplierMax") or 9),
            practice_mode=GeneratorConfig.get("practiceMode"),
        )
        return generate_pm_l3_multiply_set(config, question_count)

    if block_kind == "DIVIDE":
        config = PML3DivideConfig(
            module_code="PM", level_code="PM-L3", lesson_number=lesson_number, dps_number=dps_number,
            seed=seed,
            divisor_min=int(GeneratorConfig.get("divisorMin") or 2),
            divisor_max=int(GeneratorConfig.get("divisorMax") or 9),
            dividend_min=int(GeneratorConfig.get("dividendMin") or 100),
            dividend_max=int(GeneratorConfig.get("dividendMax") or 999),
        )
        return generate_pm_l3_divide_set(config, question_count)

    if block_kind == "BODMAS":
        config = PML3BodmasConfig(
            module_code="PM", level_code="PM-L3", lesson_number=lesson_number, dps_number=dps_number,
            template=GeneratorConfig.get("bodmasTemplate") or "PM_L3_SIMPLE_BRACKET",
            seed=seed,
        )
        return generate_pm_l3_bodmas_set(config, question_count)

    if block_kind in ("CONCEPT_DRILL_MULTIPLY", "CONCEPT_DRILL_DIVIDE"):
        drill_format = block_kind
        config = PML3ConceptDrillConfig(
            module_code="PM", level_code="PM-L3", lesson_number=lesson_number, dps_number=dps_number,
            drill_format=drill_format,
            seed=seed,
            add_min=int(GeneratorConfig.get("addMin") or 100),
            add_max=int(GeneratorConfig.get("addMax") or 500),
            times_value=int(GeneratorConfig.get("timesValue") or 12),
            from_min=int(GeneratorConfig.get("fromMin") or 500),
            from_max=int(GeneratorConfig.get("fromMax") or 3999),
            less_min=int(GeneratorConfig.get("lessMin") or 50),
            less_max=int(GeneratorConfig.get("lessMax") or 299),
        )
        questions = []
        for i in range(1, question_count + 1):
            q_rng = random.Random(f"{seed}-Q{i}")
            question = generate_pm_l3_concept_drill_question(config, q_rng)
            question["seed"] = f"{seed}-Q{i}"
            questions.append(question)
        return questions

    raise ValueError(f"Unknown PM-L3 block kind: {block_kind}")


def _generate_pm_l3_section_questions(dps: DPS, LessonRecord, section: DPSSection, seed: str) -> list[dict]:
    """Generates one PM-L3 DPSSection's questions. A section carries a
    "subBlocks" list in its generator_config_json (always -- even a normal
    solo-block section like Add/Less has a 1-entry list, see
    seed_preparatory_module_l3.py's _merge_section_config) -- this exists so
    a DPS's Concept Drill (authored as two separate MULTIPLY/DIVIDE blocks)
    generates both halves' questions together under one section, rather than
    each half needing its own DPSSection row (which used to render as two
    separate "Concept Drill" sections in Learning Path Studio -- fixed
    2026-08-06, mirroring the identical PM-L4 fix).
    """
    GeneratorConfig = _pm_l3_generator_config(section)
    lesson_number = int(getattr(LessonRecord, "lesson_number", 0) or 0)
    dps_number = int(getattr(dps, "dps_number", 0) or 0)

    sub_blocks = GeneratorConfig.get("subBlocks")
    if not sub_blocks:
        # Backward-compat only: a DPSSection row seeded before the subBlocks
        # grouping change still carries the old single-block shape
        # (blockKind at the top level, no subBlocks list). seed()'s startup
        # re-run rewrites every row to the new shape, so this branch exists
        # only to avoid a 500 in the brief window before that seed has run.
        sub_blocks = [GeneratorConfig]

    all_questions: list[dict] = []
    for sub_index, sub_config in enumerate(sub_blocks, start=1):
        sub_seed = f"{seed}-B{sub_index}"
        all_questions.extend(_generate_pm_l3_block_questions(sub_config, lesson_number, dps_number, sub_seed))
    return all_questions


def generate_pm_l3_preview(db: Session, dps: DPS, seed: str) -> list[dict]:
    """PM-L3's DPS question generation entry point -- combines every
    DPSSection row belonging to this DPS (1-3 blocks per DPS: a wide
    Add/Less or Multiplication/Division/BODMAS block, sometimes paired with
    a Concept Drill teaser sub-block -- see preparatory_module_l3_config.py
    for exactly which DPS carry which blocks). Mirrors PM-L2's
    generate_pm_l2_preview combining pattern, generalized to PM-L3's five
    block kinds.
    """
    LessonRecord = db.get(Lesson, dps.lesson_id)
    sections = (
        db.query(DPSSection)
        .filter(DPSSection.dps_id == dps.id)
        .order_by(DPSSection.section_number)
        .all()
    )
    all_questions: list[dict] = []
    question_number = 1
    for section in sections:
        section_seed = f"{seed}-S{section.section_number}"
        section_questions = _generate_pm_l3_section_questions(dps, LessonRecord, section, section_seed)
        for q in section_questions:
            q["question_number"] = question_number
            question_number += 1
            Metadata = q.get("metadata") or {}
            Metadata["section_number"] = int(getattr(section, "section_number", 1) or 1)
            Metadata["section_title"] = getattr(section, "section_title", None) or Metadata.get("dps_title")
            q["metadata"] = Metadata
            all_questions.append(q)
    return all_questions


def _pm_l4_generator_config(section: DPSSection) -> dict:
    if not section.generator_config_json:
        return {}
    try:
        return json.loads(section.generator_config_json or "{}")
    except Exception:
        return {}


def _generate_pm_l4_block_questions(GeneratorConfig: dict, lesson_number: int, dps_number: int, seed: str) -> list[dict]:
    """Generates questions for exactly one PM-L4 block config -- dispatches
    on blockKind (ADD_LESS/MULTIPLY/DIVIDE/DIVIDE_REMAINDER/BODMAS/
    CONCEPT_DRILL_MULTIPLY/CONCEPT_DRILL_DIVIDE), all reading from
    question_engine/pm_l4, PM-L4's own fully independent engine. Mirrors
    PM-L3's per-section dispatch, extended with DIVIDE_REMAINDER (PM-L4's
    genuinely new "3D ÷ 1D WITH REMAINDER(S)" concept) and DIVIDE's added
    digit_width (2D or 3D, both routed through the same PML4DivideConfig).

    Called once per sub-block by _generate_pm_l4_section_questions -- a
    DPSSection may bundle more than one sub-block under one section (e.g.
    Concept Drill's MULTIPLY + DIVIDE halves, which must render as ONE
    section, not two, in Learning Path Studio and the student DPS
    instructions page -- see seed_preparatory_module_l4.py's seed()).
    Reads every field from GeneratorConfig (the block's own JSON config, not
    a parent DPSSection row) so it never depends on a section row correctly
    reflecting more than one block's worth of settings.
    """
    block_kind = GeneratorConfig.get("blockKind")
    question_count = int(GeneratorConfig.get("questionCount") or 10)

    if block_kind == "ADD_LESS":
        config = PML4Config(
            module_code="PM",
            level_code="PM-L4",
            lesson_number=lesson_number,
            dps_number=dps_number,
            question_count=question_count,
            rows=int(GeneratorConfig.get("rows") or 4),
            concept_family="DIRECT_ADD_LESS",
            operation_focus="ADD_LESS",
            target_numbers=list(GeneratorConfig.get("targetNumbers") or []),
            place_value="ONES",
            digit_pattern=GeneratorConfig.get("digitPattern") or "2D_FULL",
            allow_negative_operands=True,
            allow_negative_answer=False,
            seed=seed,
            lesson_title=GeneratorConfig.get("lessonTitle", ""),
            dps_title=GeneratorConfig.get("dpsTitle", ""),
            generation_template=GeneratorConfig.get("generationTemplate") or "DIRECT",
            revision_templates=tuple(GeneratorConfig.get("revisionTemplates") or ()),
            practice_mode=GeneratorConfig.get("practiceMode"),
            digit_pattern_second_half=GeneratorConfig.get("digitPatternSecondHalf"),
            rows_second_half=GeneratorConfig.get("rowsSecondHalf"),
        )
        return generate_pm_l4_question_set(config)

    if block_kind == "MULTIPLY":
        config = PML4MultiplyConfig(
            module_code="PM", level_code="PM-L4", lesson_number=lesson_number, dps_number=dps_number,
            seed=seed,
            number_min=int(GeneratorConfig.get("numberMin") or 11),
            number_max=int(GeneratorConfig.get("numberMax") or 99),
            multiplier_min=int(GeneratorConfig.get("multiplierMin") or 1),
            multiplier_max=int(GeneratorConfig.get("multiplierMax") or 9),
            practice_mode=GeneratorConfig.get("practiceMode"),
        )
        return generate_pm_l4_multiply_set(config, question_count)

    if block_kind == "DIVIDE":
        config = PML4DivideConfig(
            module_code="PM", level_code="PM-L4", lesson_number=lesson_number, dps_number=dps_number,
            digit_width=int(GeneratorConfig.get("digitWidth") or 3),
            seed=seed,
            divisor_min=int(GeneratorConfig.get("divisorMin") or 2),
            divisor_max=int(GeneratorConfig.get("divisorMax") or 9),
            dividend_min=int(GeneratorConfig.get("dividendMin") or 100),
            dividend_max=int(GeneratorConfig.get("dividendMax") or 999),
        )
        return generate_pm_l4_divide_set(config, question_count)

    if block_kind == "DIVIDE_REMAINDER":
        config = PML4DivideRemainderConfig(
            module_code="PM", level_code="PM-L4", lesson_number=lesson_number, dps_number=dps_number,
            seed=seed,
            divisor_min=int(GeneratorConfig.get("divisorMin") or 2),
            divisor_max=int(GeneratorConfig.get("divisorMax") or 9),
            dividend_min=int(GeneratorConfig.get("dividendMin") or 100),
            dividend_max=int(GeneratorConfig.get("dividendMax") or 999),
        )
        return generate_pm_l4_divide_remainder_set(config, question_count)

    if block_kind == "BODMAS":
        config = PML4BodmasConfig(
            module_code="PM", level_code="PM-L4", lesson_number=lesson_number, dps_number=dps_number,
            template=GeneratorConfig.get("bodmasTemplate") or "PM_L4_BRACKET_PRODUCT",
            seed=seed,
        )
        return generate_pm_l4_bodmas_set(config, question_count)

    if block_kind in ("CONCEPT_DRILL_MULTIPLY", "CONCEPT_DRILL_DIVIDE"):
        drill_format = block_kind
        config = PML4ConceptDrillConfig(
            module_code="PM", level_code="PM-L4", lesson_number=lesson_number, dps_number=dps_number,
            drill_format=drill_format,
            seed=seed,
            add_min=int(GeneratorConfig.get("addMin") or 1000),
            add_max=int(GeneratorConfig.get("addMax") or 4999),
            times_min=int(GeneratorConfig.get("timesMin") or 5),
            times_max=int(GeneratorConfig.get("timesMax") or 10),
            from_min=int(GeneratorConfig.get("fromMin") or 1000),
            from_max=int(GeneratorConfig.get("fromMax") or 5999),
            less_min=int(GeneratorConfig.get("lessMin") or 100),
            less_max=int(GeneratorConfig.get("lessMax") or 599),
        )
        questions = []
        for i in range(1, question_count + 1):
            q_rng = random.Random(f"{seed}-Q{i}")
            question = generate_pm_l4_concept_drill_question(config, q_rng)
            question["seed"] = f"{seed}-Q{i}"
            questions.append(question)
        return questions

    raise ValueError(f"Unknown PM-L4 block kind: {block_kind}")


def _bm_generator_config(section: DPSSection) -> dict:
    if not section.generator_config_json:
        return {}
    try:
        return json.loads(section.generator_config_json or "{}")
    except Exception:
        return {}


def _generate_bm_block_questions(GeneratorConfig: dict, lesson_number: int, dps_number: int, seed: str) -> list[dict]:
    """Generates questions for exactly one Bridge Module block config --
    dispatches on blockKind (ADD_LESS/MULTIPLY/DIVIDE/DIVIDE_REMAINDER/
    BODMAS/CONCEPT_DRILL_MULTIPLY/CONCEPT_DRILL_DIVIDE), all reading from
    question_engine/bm, BM's own fully independent engine (mirrors PM-L4's
    _generate_pm_l4_block_questions exactly, ported to BM's own config/
    generator functions -- zero cross-imports from question_engine/pm_l4).

    Called once per sub-block by _generate_bm_section_questions -- a
    DPSSection may bundle more than one sub-block under one section (e.g.
    Concept Drill's MULTIPLY + DIVIDE halves, which must render as ONE
    section, not two, in Learning Path Studio and the student DPS
    instructions page -- see seed_bridge_module_l1.py's seed()).
    """
    block_kind = GeneratorConfig.get("blockKind")
    question_count = int(GeneratorConfig.get("questionCount") or 10)

    if block_kind == "ADD_LESS":
        config = BMConfig(
            module_code="BM",
            level_code="BM-L1",
            lesson_number=lesson_number,
            dps_number=dps_number,
            question_count=question_count,
            rows=int(GeneratorConfig.get("rows") or 4),
            concept_family="DIRECT_ADD_LESS",
            operation_focus="ADD_LESS",
            target_numbers=list(GeneratorConfig.get("targetNumbers") or []),
            place_value="ONES",
            digit_pattern=GeneratorConfig.get("digitPattern") or "2D_FULL",
            allow_negative_operands=True,
            allow_negative_answer=False,
            seed=seed,
            lesson_title=GeneratorConfig.get("lessonTitle", ""),
            dps_title=GeneratorConfig.get("dpsTitle", ""),
            generation_template=GeneratorConfig.get("generationTemplate") or "DIRECT",
            revision_templates=tuple(GeneratorConfig.get("revisionTemplates") or ()),
            practice_mode=GeneratorConfig.get("practiceMode"),
            digit_pattern_second_half=GeneratorConfig.get("digitPatternSecondHalf"),
            rows_second_half=GeneratorConfig.get("rowsSecondHalf"),
        )
        return generate_bm_question_set(config)

    if block_kind == "MULTIPLY":
        config = BMMultiplyConfig(
            module_code="BM", level_code="BM-L1", lesson_number=lesson_number, dps_number=dps_number,
            seed=seed,
            number_min=int(GeneratorConfig.get("numberMin") or 11),
            number_max=int(GeneratorConfig.get("numberMax") or 99),
            multiplier_min=int(GeneratorConfig.get("multiplierMin") or 1),
            multiplier_max=int(GeneratorConfig.get("multiplierMax") or 9),
            practice_mode=GeneratorConfig.get("practiceMode"),
        )
        return generate_bm_multiply_set(config, question_count)

    if block_kind == "DIVIDE":
        config = BMDivideConfig(
            module_code="BM", level_code="BM-L1", lesson_number=lesson_number, dps_number=dps_number,
            digit_width=int(GeneratorConfig.get("digitWidth") or 3),
            seed=seed,
            divisor_min=int(GeneratorConfig.get("divisorMin") or 2),
            divisor_max=int(GeneratorConfig.get("divisorMax") or 9),
            dividend_min=int(GeneratorConfig.get("dividendMin") or 100),
            dividend_max=int(GeneratorConfig.get("dividendMax") or 999),
        )
        return generate_bm_divide_set(config, question_count)

    if block_kind == "DIVIDE_REMAINDER":
        config = BMDivideRemainderConfig(
            module_code="BM", level_code="BM-L1", lesson_number=lesson_number, dps_number=dps_number,
            seed=seed,
            divisor_min=int(GeneratorConfig.get("divisorMin") or 2),
            divisor_max=int(GeneratorConfig.get("divisorMax") or 9),
            dividend_min=int(GeneratorConfig.get("dividendMin") or 100),
            dividend_max=int(GeneratorConfig.get("dividendMax") or 999),
        )
        return generate_bm_divide_remainder_set(config, question_count)

    if block_kind == "BODMAS":
        config = BMBodmasConfig(
            module_code="BM", level_code="BM-L1", lesson_number=lesson_number, dps_number=dps_number,
            template=GeneratorConfig.get("bodmasTemplate") or "BM_BRACKET_PRODUCT",
            seed=seed,
        )
        return generate_bm_bodmas_set(config, question_count)

    if block_kind in ("CONCEPT_DRILL_MULTIPLY", "CONCEPT_DRILL_DIVIDE"):
        drill_format = block_kind
        config = BMConceptDrillConfig(
            module_code="BM", level_code="BM-L1", lesson_number=lesson_number, dps_number=dps_number,
            drill_format=drill_format,
            seed=seed,
            add_min=int(GeneratorConfig.get("addMin") or 1000),
            add_max=int(GeneratorConfig.get("addMax") or 4999),
            times_min=int(GeneratorConfig.get("timesMin") or 5),
            times_max=int(GeneratorConfig.get("timesMax") or 10),
            from_min=int(GeneratorConfig.get("fromMin") or 1000),
            from_max=int(GeneratorConfig.get("fromMax") or 5999),
            less_min=int(GeneratorConfig.get("lessMin") or 100),
            less_max=int(GeneratorConfig.get("lessMax") or 599),
        )
        questions = []
        for i in range(1, question_count + 1):
            q_rng = random.Random(f"{seed}-Q{i}")
            question = generate_bm_concept_drill_question(config, q_rng)
            question["seed"] = f"{seed}-Q{i}"
            questions.append(question)
        return questions

    raise ValueError(f"Unknown BM block kind: {block_kind}")


def _generate_bm_section_questions(dps: DPS, LessonRecord, section: DPSSection, seed: str) -> list[dict]:
    """Generates one BM DPSSection's questions. A section carries a
    "subBlocks" list in its generator_config_json (always -- even a normal
    solo-block section like Add/Less has a 1-entry list, see
    seed_bridge_module_l1.py's _merge_section_config), built correctly from
    day one per PM-L4's post-2026-08-07-fix design -- BM's own workbook has
    the identical multi-concept-per-DPS shape that made the fix necessary
    there.
    """
    GeneratorConfig = _bm_generator_config(section)
    lesson_number = int(getattr(LessonRecord, "lesson_number", 0) or 0)
    dps_number = int(getattr(dps, "dps_number", 0) or 0)

    sub_blocks = GeneratorConfig.get("subBlocks") or [GeneratorConfig]

    all_questions: list[dict] = []
    for sub_index, sub_config in enumerate(sub_blocks, start=1):
        sub_seed = f"{seed}-B{sub_index}"
        all_questions.extend(_generate_bm_block_questions(sub_config, lesson_number, dps_number, sub_seed))
    return all_questions


def generate_bm_preview(db: Session, dps: DPS, seed: str) -> list[dict]:
    """Bridge Module Level 1's DPS question generation entry point --
    combines every DPSSection row belonging to this DPS. Mirrors PM-L4's
    generate_pm_l4_preview combining pattern, reading exclusively from
    question_engine/bm (BM's own fully independent engine).
    """
    LessonRecord = db.get(Lesson, dps.lesson_id)
    sections = (
        db.query(DPSSection)
        .filter(DPSSection.dps_id == dps.id)
        .order_by(DPSSection.section_number)
        .all()
    )
    all_questions: list[dict] = []
    question_number = 1
    for section in sections:
        section_seed = f"{seed}-S{section.section_number}"
        section_questions = _generate_bm_section_questions(dps, LessonRecord, section, section_seed)
        for q in section_questions:
            q["question_number"] = question_number
            question_number += 1
            Metadata = q.get("metadata") or {}
            Metadata["section_number"] = int(getattr(section, "section_number", 1) or 1)
            Metadata["section_title"] = getattr(section, "section_title", None) or Metadata.get("dps_title")
            q["metadata"] = Metadata
            all_questions.append(q)
    return all_questions


def _generate_pm_l4_section_questions(dps: DPS, LessonRecord, section: DPSSection, seed: str) -> list[dict]:
    """Generates one PM-L4 DPSSection's questions. A section carries a
    "subBlocks" list in its generator_config_json (always -- even a normal
    solo-block section like Add/Less has a 1-entry list, see
    seed_preparatory_module_l4.py's _merge_section_config) -- this exists so
    a DPS's Concept Drill (authored as two separate MULTIPLY/DIVIDE blocks)
    generates both halves' questions together under one section, rather than
    each half needing its own DPSSection row (which used to render as two
    separate "Concept Drill" sections in Learning Path Studio -- fixed
    2026-08-06).
    """
    GeneratorConfig = _pm_l4_generator_config(section)
    lesson_number = int(getattr(LessonRecord, "lesson_number", 0) or 0)
    dps_number = int(getattr(dps, "dps_number", 0) or 0)

    sub_blocks = GeneratorConfig.get("subBlocks")
    if not sub_blocks:
        # Backward-compat only: a DPSSection row seeded before the subBlocks
        # grouping change still carries the old single-block shape
        # (blockKind at the top level, no subBlocks list). seed()'s startup
        # re-run rewrites every row to the new shape, so this branch exists
        # only to avoid a 500 in the brief window before that seed has run.
        sub_blocks = [GeneratorConfig]

    all_questions: list[dict] = []
    for sub_index, sub_config in enumerate(sub_blocks, start=1):
        sub_seed = f"{seed}-B{sub_index}"
        all_questions.extend(_generate_pm_l4_block_questions(sub_config, lesson_number, dps_number, sub_seed))
    return all_questions


def generate_pm_l4_preview(db: Session, dps: DPS, seed: str) -> list[dict]:
    """PM-L4's DPS question generation entry point -- combines every
    DPSSection row belonging to this DPS. Mirrors PM-L3's
    generate_pm_l3_preview combining pattern, extended for PM-L4's
    DIVIDE_REMAINDER block kind.
    """
    LessonRecord = db.get(Lesson, dps.lesson_id)
    sections = (
        db.query(DPSSection)
        .filter(DPSSection.dps_id == dps.id)
        .order_by(DPSSection.section_number)
        .all()
    )
    all_questions: list[dict] = []
    question_number = 1
    for section in sections:
        section_seed = f"{seed}-S{section.section_number}"
        section_questions = _generate_pm_l4_section_questions(dps, LessonRecord, section, section_seed)
        for q in section_questions:
            q["question_number"] = question_number
            question_number += 1
            Metadata = q.get("metadata") or {}
            Metadata["section_number"] = int(getattr(section, "section_number", 1) or 1)
            Metadata["section_title"] = getattr(section, "section_title", None) or Metadata.get("dps_title")
            q["metadata"] = Metadata
            all_questions.append(q)
    return all_questions


def generate_pm_l2_preview(db: Session, dps: DPS, seed: str) -> list[dict]:
    """PM-L2's DPS question generation entry point -- combines every
    DPSSection row belonging to this DPS (some PM-L2 DPS carry exactly one:
    either a normal vertical block or a concept-drill block; a few, e.g.
    Lesson 1 DPS5, carry both a normal section AND a separate concept-drill
    section under the same DPS number -- see seed_preparatory_module_l2.py's
    seed() for exactly which). No other module in this codebase combines
    multiple DPSSection rows' generated output into a single DPS today (every
    other build_*_config_from_dps() reads only the first section), so this is
    new, PM-L2-specific combining logic rather than a generic change to the
    shared dispatcher below.
    """
    LessonRecord = db.get(Lesson, dps.lesson_id)
    sections = (
        db.query(DPSSection)
        .filter(DPSSection.dps_id == dps.id)
        .order_by(DPSSection.section_number)
        .all()
    )
    all_questions: list[dict] = []
    question_number = 1
    for section in sections:
        section_seed = f"{seed}-S{section.section_number}"
        if getattr(section, "concept_family", None) == "CONCEPT_DRILL":
            section_questions = _generate_pm_l2_concept_drill_section_questions(dps, LessonRecord, section, section_seed)
        else:
            config = _build_pm_l2_normal_config(dps, LessonRecord, section, section_seed)
            section_questions = generate_pm_l2_question_set(config)
        for q in section_questions:
            q["question_number"] = question_number
            question_number += 1
            Metadata = q.get("metadata") or {}
            Metadata["section_number"] = int(getattr(section, "section_number", 1) or 1)
            # Admin Learning Path Studio's preview groups questions into
            # Section N cards keyed by (section_number, section_title) --
            # without this, DPS carrying two sections (a normal block + a
            # concept-drill block, e.g. Lesson 1 DPS5) both fall back to the
            # same DPS-level title, so Section 2 visually mislabels itself
            # with Section 1's name even though the questions themselves are
            # correct. Caught via live verification (2026-08-05).
            Metadata["section_title"] = getattr(section, "section_title", None) or Metadata.get("dps_title")
            q["metadata"] = Metadata
            all_questions.append(q)
    return all_questions


def build_attempt_question_seed(dps: DPS, assignment, student_id: str, attempt, started_at) -> str:
    """Build the question seed for a student attempt.

    Original published DPS attempts may continue to use the published seed so existing
    live behavior stays stable. Retry attempts intentionally receive a fresh seed tied
    to the attempt chain/attempt number so the student receives a different question
    set for the same DPS concept.
    """
    AssignmentSource = getattr(assignment, "assignment_source", "ORIGINAL") if assignment else "ORIGINAL"
    RetryAttemptNumber = int(getattr(assignment, "retry_attempt_number", 0) or 0) if assignment else 0
    AttemptNumber = int(getattr(attempt, "attempt_number", RetryAttemptNumber) or 0) if attempt else RetryAttemptNumber
    PublishedSeed = getattr(dps, "published_seed", None)

    if AssignmentSource == "ORIGINAL" and RetryAttemptNumber <= 0 and AttemptNumber <= 0 and PublishedSeed:
        return PublishedSeed

    Timestamp = int((started_at or datetime.now(timezone.utc)).timestamp())
    AttemptId = getattr(attempt, "id", None) or uuid4().hex
    AssignmentId = getattr(assignment, "id", None) or "NO-ASSIGNMENT"
    AttemptGroupId = getattr(attempt, "attempt_group_id", None) or getattr(assignment, "attempt_group_id", None) or AssignmentId
    return (
        f"YLM-RETRY-{dps.id}-{student_id}-{AttemptGroupId}-"
        f"ASSIGNMENT-{AssignmentId}-ATTEMPT-{AttemptNumber}-"
        f"SOURCE-{AssignmentSource}-{AttemptId}-{Timestamp}"
    )

def build_preview_seed(dps: DPS) -> str:
    """Create a fresh Admin preview seed so every preview generation varies while preserving the DPS pattern."""
    return f"ADMIN-PREVIEW-{dps.id}-{uuid4().hex}"


def _module_code_for_dps(db: Session, dps: DPS) -> str:
    LessonRecord = db.get(Lesson, dps.lesson_id)
    LevelRecord = db.get(Level, LessonRecord.level_id) if LessonRecord else None
    ModuleRecord = db.get(Module, LevelRecord.module_id) if LevelRecord else None
    return str(getattr(ModuleRecord, "module_code", "") or "").upper()


def _level_code_for_dps(db: Session, dps: DPS) -> str:
    LessonRecord = db.get(Lesson, dps.lesson_id)
    LevelRecord = db.get(Level, LessonRecord.level_id) if LessonRecord else None
    return str(getattr(LevelRecord, "level_code", "") or "").upper()


def _is_pm_l2(db: Session, dps: DPS) -> bool:
    return _level_code_for_dps(db, dps) == "PM-L2"


def _is_pm_l3(db: Session, dps: DPS) -> bool:
    return _level_code_for_dps(db, dps) == "PM-L3"


def _is_pm_l4(db: Session, dps: DPS) -> bool:
    return _level_code_for_dps(db, dps) == "PM-L4"


def _is_dynamic_generator_supported(db: Session, dps: DPS) -> bool:
    ModuleCode = _module_code_for_dps(db, dps)
    if ModuleCode == "YLM":
        return True
    if ModuleCode == "PM":
        return True
    if ModuleCode == "BM":
        return True
    if ModuleCode == "MM":
        Config = build_mm_config_from_dps(db, dps, build_preview_seed(dps))
        return IsPackage1Supported(Config.ConceptFamily)
    if ModuleCode == "IM":
        Config = build_im_config_from_dps(db, dps, build_preview_seed(dps))
        return IsImConceptSupported(Config.ConceptFamily)
    return False


def _unsupported_static_message(db: Session, dps: DPS) -> str:
    LessonRecord = db.get(Lesson, dps.lesson_id)
    LevelRecord = db.get(Level, LessonRecord.level_id) if LessonRecord else None
    ModuleRecord = db.get(Module, LevelRecord.module_id) if LevelRecord else None
    ModuleCode = str(getattr(ModuleRecord, "module_code", "") or "Module").upper()
    LevelCode = str(getattr(LevelRecord, "level_code", "") or "Level")
    LessonNumber = getattr(LessonRecord, "lesson_number", "-")
    DpsTitle = getattr(dps, "dps_title", "") or "selected DPS"
    if ModuleCode == "MM":
        return (
            f"{ModuleCode} {LevelCode} Lesson {LessonNumber} / {DpsTitle} is not part of the active MM generator package yet. "
            "Active MM generator packages currently support decimal add-less, decimal multiplication/division, whole-number multiplication/division digit patterns, integers, BODMAS, and percentage practice."
        )
    if ModuleCode == "IM":
        return (
            f"{ModuleCode} {LevelCode} Lesson {LessonNumber} / {DpsTitle} is not part of the active IM generator package yet. "
            "The IM generator currently supports Add/Less, Decimal Add/Less, Borrowing Sums, whole-number multiplication/division, Squares, Skill Stacker, Concept Drill, BODMAS, Solve the Equation, and Answer Position."
        )
    return (
        f"{ModuleCode} {LevelCode} Lesson {LessonNumber} is not connected to a dynamic question generator yet."
    )


def generate_preview(db: Session, dps: DPS, seed: str | None = None) -> list[dict]:
    if not _is_dynamic_generator_supported(db, dps):
        api_error(400, "DYNAMIC_GENERATION_NOT_AVAILABLE", _unsupported_static_message(db, dps))
    seed = seed or build_preview_seed(dps)
    ModuleCode = _module_code_for_dps(db, dps)
    if ModuleCode == "MM":
        Config = build_mm_config_from_dps(db, dps, seed)
        return GenerateMmQuestionSet(Config)
    if ModuleCode == "IM":
        Config = build_im_config_from_dps(db, dps, seed)
        return GenerateImQuestionSet(Config)
    if ModuleCode == "BM":
        return generate_bm_preview(db, dps, seed)
    if ModuleCode == "PM":
        if _is_pm_l4(db, dps):
            return generate_pm_l4_preview(db, dps, seed)
        if _is_pm_l3(db, dps):
            return generate_pm_l3_preview(db, dps, seed)
        if _is_pm_l2(db, dps):
            return generate_pm_l2_preview(db, dps, seed)
        Config = build_pm_config_from_dps(db, dps, seed)
        return generate_pm_question_set(Config)
    config = build_config_from_dps(db, dps, seed)
    return generate_ylm_question_set(config)

def persist_question_set(db: Session, dps: DPS, assignment_id: str | None, student_id: str, mode: str, seed: str) -> GeneratedQuestionSet:
    if not _is_dynamic_generator_supported(db, dps):
        api_error(400, "DYNAMIC_GENERATION_NOT_AVAILABLE", _unsupported_static_message(db, dps))
    sections = db.query(DPSSection).filter(DPSSection.dps_id == dps.id).order_by(DPSSection.section_number).all()
    section_by_number = {int(getattr(section, "section_number", 1) or 1): section for section in sections}
    section = sections[0] if sections else None
    ModuleCode = _module_code_for_dps(db, dps)
    if ModuleCode == "MM":
        Config = build_mm_config_from_dps(db, dps, seed)
        generated = GenerateMmQuestionSet(Config)
    elif ModuleCode == "IM":
        Config = build_im_config_from_dps(db, dps, seed)
        generated = GenerateImQuestionSet(Config)
    elif ModuleCode == "BM":
        # Must mirror generate_preview()'s BM dispatch exactly -- this is
        # the function that actually backs real student "start attempt"
        # flow (see attempt_service.py), not just the admin preview. PM-L3/
        # PM-L4 both had a real bug here (2026-08-06) where this dispatcher
        # was missing their branch and silently fell through to an earlier
        # level's engine for real student attempts while the admin preview
        # (which already had the correct branch) looked fine -- BM's own
        # branch is added here from day one specifically to avoid repeating
        # that gap.
        generated = generate_bm_preview(db, dps, seed)
    elif ModuleCode == "PM":
        # Must mirror generate_preview()'s PM dispatch exactly (same
        # _is_pm_l2/_is_pm_l3/_is_pm_l4 checks, same order, L4 checked
        # before L3 before L2) -- this is the function that actually backs
        # real student "start attempt" flow (see attempt_service.py), not
        # just the admin preview. Before this fix, only _is_pm_l2 was
        # checked here; PM-L3 and PM-L4 DPS attempts silently fell through
        # to build_pm_config_from_dps/generate_pm_question_set (PM-L1's own
        # engine), producing wrong questions for every real student attempt
        # on those two levels -- generate_preview() (admin preview) was
        # never affected since it already had the correct checks, which is
        # exactly why this went unnoticed: the admin preview always looked
        # right. Fixed 2026-08-06.
        if _is_pm_l4(db, dps):
            generated = generate_pm_l4_preview(db, dps, seed)
        elif _is_pm_l3(db, dps):
            generated = generate_pm_l3_preview(db, dps, seed)
        elif _is_pm_l2(db, dps):
            generated = generate_pm_l2_preview(db, dps, seed)
        else:
            Config = build_pm_config_from_dps(db, dps, seed)
            generated = generate_pm_question_set(Config)
    else:
        config = build_config_from_dps(db, dps, seed)
        generated = generate_ylm_question_set(config)
    qset = GeneratedQuestionSet(assignment_id=assignment_id, dps_id=dps.id, student_id=student_id, mode=mode, seed=seed)
    db.add(qset)
    db.flush()
    for q in generated:
        Metadata = q.get("metadata") or {}
        SectionNumber = int(Metadata.get("section_number") or 1)
        LinkedSection = section_by_number.get(SectionNumber) or section
        gq = GeneratedQuestion(
            question_set_id=qset.id,
            dps_section_id=LinkedSection.id if LinkedSection else None,
            question_number=q["question_number"],
            display_type=q["display_type"],
            question_text=q.get("question_text"),
            operands_json=json.dumps(q["operands"]),
            operators_json=json.dumps(q["operators"]),
            correct_answer=str(q["correct_answer"]),
            seed=q["seed"],
            metadata_json=json.dumps(Metadata),
        )
        db.add(gq)
        db.flush()
        for opt in q["options"]:
            db.add(QuestionOption(
                question_id=gq.id,
                option_label=opt["label"],
                option_value=str(opt["value"]),
                is_correct=opt["is_correct"],
                display_order=opt["display_order"],
            ))
    return qset
