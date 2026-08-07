"""Bridge Module's own competition-mock section registry and question
collector -- the BM counterpart to PM's own file
(pm_competition_mock_generation_service.py) and to the MM/IM logic in
competition_mock_generation_service.py, kept in a fully separate file per
the platform's established product decision (2026-08-04, reaffirmed for BM
2026-08-07: "dedicated engine for bm, entirely independent from all the
other modules and levels"): every module gets fully dedicated curriculum
logic so a failure or future change in one module's mock/assessment
generation can never silently affect another.

BM-L1 has exactly the 6 sections Shailesh specified (2026-08-07):

  Section 1 - Add/Less (Abacus)  : every Add/Less sum flagged Abacus across
                                    the entire level.
  Section 2 - Add/Less (Visual)  : every Add/Less sum flagged Visual across
                                    the entire level.
  Section 3 - Multiplication     : every 2D X 1D multiplication sum.
  Section 4 - Division           : every division shape pooled together
                                    (2D÷1D exact, 3D÷1D exact, 3D÷1D WITH
                                    REMAINDER) -- same "all kinds of
                                    division sums throughout the level"
                                    pooling PM-L4 already established.
  Section 5 - BODMAS             : single pooled entry, bodmasTemplate=
                                    "MIXED" -- the batch generator below
                                    picks randomly among BM's own 4
                                    templates per question (one more than
                                    PM-L4's 3 -- see question_engine/bm/
                                    bodmas.py's module docstring for why).
  Section 6 - Concept Drill      : the sole 5-marks-per-question section,
                                    same convention as every PM level from
                                    L2 onward.

This mirrors PM-L4's registry shape exactly (the direct template, per
Shailesh's explicit instruction that BM-L1's assessment/mock sections match
PM-L4's 6-section pattern) but reads exclusively from question_engine/bm
and app/seed/bridge_module_l1_config.py -- zero imports from
question_engine/pm_l4, pm_competition_mock_generation_service.py, or any
other module/level's mock logic.
"""
from __future__ import annotations

import random
from collections import defaultdict
from typing import Any
from uuid import uuid4

from app.core.errors import api_error
from app.models import Level

BM_DEFAULT_COMPETITION_MOCK_QUESTION_COUNT = 60
BM_DEFAULT_COMPETITION_MOCK_DURATION_SECONDS = 1800
BM_COMPETITION_MARKS_PER_QUESTION = 1

from app.question_engine.bm import (
    BMConfig,
    BMConceptDrillConfig,
    BMMultiplyConfig,
    BMDivideConfig,
    BMDivideRemainderConfig,
    BMBodmasConfig,
    DRILL_MULTIPLY,
    DRILL_DIVIDE,
    BODMAS_BM_BRACKET_PRODUCT,
    BODMAS_BM_PLAIN_PRODUCT,
    BODMAS_BM_BRACKET_SUM,
    BODMAS_BM_PRODUCT_AFTER_TAIL,
    generate_bm_question_set,
)
from app.question_engine.bm.multiply import generate_multiply_table_question as generate_bm_multiply_table_question
from app.question_engine.bm.divide import generate_divide_table_question as generate_bm_divide_table_question
from app.question_engine.bm.divide_remainder import generate_divide_remainder_question
from app.question_engine.bm.bodmas import generate_bodmas_question as generate_bm_bodmas_question
from app.question_engine.bm.concept_drill import generate_concept_drill_question as generate_bm_concept_drill_question
from app.seed.bridge_module_l1_config import BM_LESSONS, ADD_LESS as BM_ADD_LESS, MULTIPLY as BM_MULTIPLY

BM_COMPETITION_SECTION_DEFINITIONS: list[dict[str, Any]] = [
    {"key": "BM_ADD_LESS_ABACUS", "number": 1, "title": "Section 1 - Add/Less (Abacus)"},
    {"key": "BM_ADD_LESS_VISUAL", "number": 2, "title": "Section 2 - Add/Less (Visual)"},
    {"key": "BM_MULTIPLICATION", "number": 3, "title": "Section 3 - Multiplication"},
    {"key": "BM_DIVISION", "number": 4, "title": "Section 4 - Division"},
    {"key": "BM_BODMAS", "number": 5, "title": "Section 5 - BODMAS"},
    {"key": "BM_CONCEPT_DRILL", "number": 6, "title": "Section 6 - Concept Drill"},
]


def _bm_addless_and_multiply_pools() -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    """Walks every ADD_LESS and MULTIPLY block in BM_LESSONS, bucketing
    ADD_LESS into Abacus/Visual pools by practice_mode and MULTIPLY into a
    single pooled list regardless of practice_mode -- same convention
    PM-L4's _pm_l4_addless_and_multiply_pools uses. De-duplicates entries
    with identical generation parameters so a range that recurs across
    multiple lessons only occupies one pool slot.
    """
    seen_abacus: set[tuple] = set()
    seen_visual: set[tuple] = set()
    seen_multiply: set[tuple] = set()
    abacus_pool: list[dict[str, Any]] = []
    visual_pool: list[dict[str, Any]] = []
    multiply_pool: list[dict[str, Any]] = []

    for lesson_number in sorted(BM_LESSONS):
        for dps_number, rule in BM_LESSONS[lesson_number].items():
            for block in rule.blocks:
                if block.kind == BM_ADD_LESS:
                    key = (
                        block.digit_pattern, block.rows, block.generation_template,
                        tuple(block.revision_templates), tuple(block.target_numbers),
                        block.digit_pattern_second_half, block.rows_second_half,
                    )
                    spec = {
                        "title": block.title,
                        "conceptFamily": "DIRECT_ADD_LESS",
                        "operationFocus": "ADD_LESS",
                        "digitPattern": block.digit_pattern,
                        "rows": block.rows,
                        "generationTemplate": block.generation_template,
                        "revisionTemplates": list(block.revision_templates),
                        "targetNumbers": list(block.target_numbers),
                        "digitPatternSecondHalf": block.digit_pattern_second_half,
                        "rowsSecondHalf": block.rows_second_half,
                    }
                    mode = (block.practice_mode or "ABACUS").upper()
                    if mode == "VISUAL":
                        if key not in seen_visual:
                            seen_visual.add(key)
                            visual_pool.append(spec)
                    else:
                        if key not in seen_abacus:
                            seen_abacus.add(key)
                            abacus_pool.append(spec)
                elif block.kind == BM_MULTIPLY:
                    key = (block.number_min, block.number_max, block.multiplier_min, block.multiplier_max)
                    if key not in seen_multiply:
                        seen_multiply.add(key)
                        multiply_pool.append({
                            "title": "2D X 1D Multiplication",
                            "conceptFamily": "BM_MULTIPLICATION",
                            "numberMin": block.number_min, "numberMax": block.number_max,
                            "multiplierMin": block.multiplier_min, "multiplierMax": block.multiplier_max,
                        })
    return abacus_pool, visual_pool, multiply_pool


_BM_ABACUS_POOL, _BM_VISUAL_POOL, _BM_MULTIPLY_POOL = _bm_addless_and_multiply_pools()

# Section 4 - Division, ALL THREE division shapes pooled together per
# Shailesh's explicit instruction ("all kinds of division sums flagged
# under... the entire level"): 2D÷1D exact, 3D÷1D exact, and 3D÷1D WITH
# REMAINDER. The even 3-way split _ordered_concept_schedule already does
# means a requested count naturally spreads across all three shapes rather
# than skewing toward whichever is listed first.
BM_DIVISION_POOL: list[dict[str, Any]] = [
    {"title": "2D ÷ 1D Division", "conceptFamily": "BM_DIVISION", "digitWidth": 2, "divisorMin": 2, "divisorMax": 9, "dividendMin": 10, "dividendMax": 99},
    {"title": "3D ÷ 1D Division", "conceptFamily": "BM_DIVISION", "digitWidth": 3, "divisorMin": 2, "divisorMax": 9, "dividendMin": 100, "dividendMax": 999},
    {"title": "3D ÷ 1D Division With Remainder", "conceptFamily": "BM_DIVISION_WITH_REMAINDER", "divisorMin": 2, "divisorMax": 9, "dividendMin": 100, "dividendMax": 999},
]

# Section 5 - BODMAS, standalone. Single entry using bodmasTemplate="MIXED"
# -- the batch generator below randomly picks one of BM's four real
# templates per question (see _generate_bm_competition_batch), so the "one
# concept" the pool sees still produces the level's full template variety.
BM_BODMAS_POOL: list[dict[str, Any]] = [
    {"title": "BODMAS", "conceptFamily": "BODMAS", "bodmasTemplate": "MIXED"},
]

# Section 6 - Concept Drill, alone (same reasoning as every PM level from L2
# onward: it is the sole 5-marks-per-question section in assessments/mocks).
# conceptFamily="CONCEPT_DRILL" on every entry is load-bearing -- see
# assessment_blueprint_service.py's _weighted_section_keys().
# timesMin/timesMax = 5/10 on every entry, matching BM's own DPS-level
# default (question_engine/bm/config.py's BMConceptDrillConfig) so DPS,
# assessment, and mock all draw TIMES from the identical range.
BM_CONCEPT_DRILL_POOL: list[dict[str, Any]] = [
    {"title": "Concept Drill - Multiply (Repeated Addition)", "conceptFamily": "CONCEPT_DRILL", "drillFormat": DRILL_MULTIPLY, "addMin": 1000, "addMax": 4999, "timesMin": 5, "timesMax": 10},
    {"title": "Concept Drill - Divide (Repeated Subtraction)", "conceptFamily": "CONCEPT_DRILL", "drillFormat": DRILL_DIVIDE, "fromMin": 1000, "fromMax": 5999, "lessMin": 100, "lessMax": 599},
]

BM_COMPETITION_SECTION_CONCEPT_POOLS: dict[str, list[dict[str, Any]]] = {
    "BM_ADD_LESS_ABACUS": _BM_ABACUS_POOL,
    "BM_ADD_LESS_VISUAL": _BM_VISUAL_POOL,
    "BM_MULTIPLICATION": _BM_MULTIPLY_POOL,
    "BM_DIVISION": BM_DIVISION_POOL,
    "BM_BODMAS": BM_BODMAS_POOL,
    "BM_CONCEPT_DRILL": BM_CONCEPT_DRILL_POOL,
}

BM_COMPETITION_LEVEL_REGISTRY: dict[str, dict[str, Any]] = {
    "BM-L1": {
        "sectionDefinitions": BM_COMPETITION_SECTION_DEFINITIONS,
        "sectionConceptPools": BM_COMPETITION_SECTION_CONCEPT_POOLS,
    },
}


def _build_bm_config(concept_spec: dict[str, Any], question_count: int, seed: str) -> BMConfig:
    return BMConfig(
        module_code="BM",
        level_code="BM-L1",
        lesson_number=0,
        dps_number=0,
        question_count=question_count,
        rows=int(concept_spec.get("rows") or 4),
        concept_family=concept_spec["conceptFamily"],
        operation_focus=concept_spec.get("operationFocus", "ADD_LESS"),
        target_numbers=list(concept_spec.get("targetNumbers") or []),
        place_value="ONES",
        digit_pattern=concept_spec.get("digitPattern", "2D_FULL"),
        allow_negative_operands=True,
        allow_negative_answer=False,
        seed=seed,
        lesson_title="BM Competition Mock",
        dps_title=str(concept_spec["title"]),
        generation_template=concept_spec.get("generationTemplate", "DIRECT"),
        revision_templates=tuple(concept_spec.get("revisionTemplates") or ()),
        digit_pattern_second_half=concept_spec.get("digitPatternSecondHalf"),
        rows_second_half=concept_spec.get("rowsSecondHalf"),
    )


def _bm_question_signature(question: dict[str, Any]) -> tuple:
    """Same shape as PM-L4's _pm_l4_question_signature -- drill_operands
    (non-empty) marks Multiply/Divide/Divide-Remainder/Concept-Drill's
    box-shaped questions (all carry NUMBER/DIVISOR or ADD/TIMES or
    FROM/LESS in drill_operands), so the same signature shape naturally
    covers every BM concept without a special case.
    """
    if question.get("drill_operands"):
        return (question.get("display_type"),) + tuple(sorted(question["drill_operands"].items()))
    if question.get("metadata", {}).get("concept_family") == "BODMAS":
        return ("BODMAS", question.get("question_text"))
    return ("VERTICAL",) + tuple(question.get("operands") or [])


def _generate_bm_competition_batch(concept_spec: dict[str, Any], count: int, seed: str) -> list[dict[str, Any]]:
    """Dispatches one Section 3/4/5/6 concept-pool entry's batch generation
    to the right question_engine/bm generator. Section 1/2 (Add/Less) use
    generate_bm_question_set directly (see
    CollectBmCompetitionSectionLockedQuestions below).
    """
    if count <= 0:
        return []
    concept_family = concept_spec.get("conceptFamily")

    if concept_family == "BM_MULTIPLICATION":
        config = BMMultiplyConfig(
            module_code="BM", level_code="BM-L1", lesson_number=0, dps_number=0, seed=seed,
            number_min=int(concept_spec.get("numberMin") or 11), number_max=int(concept_spec.get("numberMax") or 99),
            multiplier_min=int(concept_spec.get("multiplierMin") or 1), multiplier_max=int(concept_spec.get("multiplierMax") or 9),
        )
        return [generate_bm_multiply_table_question(config, random.Random(f"{seed}-Q{i}")) for i in range(1, count + 1)]

    if concept_family == "BM_DIVISION":
        config = BMDivideConfig(
            module_code="BM", level_code="BM-L1", lesson_number=0, dps_number=0, seed=seed,
            digit_width=int(concept_spec.get("digitWidth") or 3),
            divisor_min=int(concept_spec.get("divisorMin") or 2), divisor_max=int(concept_spec.get("divisorMax") or 9),
            dividend_min=int(concept_spec.get("dividendMin") or 100), dividend_max=int(concept_spec.get("dividendMax") or 999),
        )
        return [generate_bm_divide_table_question(config, random.Random(f"{seed}-Q{i}")) for i in range(1, count + 1)]

    if concept_family == "BM_DIVISION_WITH_REMAINDER":
        config = BMDivideRemainderConfig(
            module_code="BM", level_code="BM-L1", lesson_number=0, dps_number=0, seed=seed,
            divisor_min=int(concept_spec.get("divisorMin") or 2), divisor_max=int(concept_spec.get("divisorMax") or 9),
            dividend_min=int(concept_spec.get("dividendMin") or 100), dividend_max=int(concept_spec.get("dividendMax") or 999),
        )
        return [generate_divide_remainder_question(config, random.Random(f"{seed}-Q{i}")) for i in range(1, count + 1)]

    if concept_family == "BODMAS":
        templates = (BODMAS_BM_BRACKET_PRODUCT, BODMAS_BM_PLAIN_PRODUCT, BODMAS_BM_BRACKET_SUM, BODMAS_BM_PRODUCT_AFTER_TAIL)
        questions = []
        for i in range(1, count + 1):
            rng = random.Random(f"{seed}-Q{i}")
            template = concept_spec.get("bodmasTemplate")
            template = rng.choice(templates) if (not template or template == "MIXED") else template
            config = BMBodmasConfig(module_code="BM", level_code="BM-L1", lesson_number=0, dps_number=0, template=template, seed=seed)
            questions.append(generate_bm_bodmas_question(config, rng))
        return questions

    if concept_family == "CONCEPT_DRILL":
        times_min = concept_spec.get("timesMin")
        times_max = concept_spec.get("timesMax")
        config = BMConceptDrillConfig(
            module_code="BM", level_code="BM-L1", lesson_number=0, dps_number=0,
            drill_format=concept_spec["drillFormat"], seed=seed,
            add_min=int(concept_spec.get("addMin") or 1000), add_max=int(concept_spec.get("addMax") or 4999),
            times_min=int(times_min) if times_min is not None else 5,
            times_max=int(times_max) if times_max is not None else 10,
            from_min=int(concept_spec.get("fromMin") or 1000), from_max=int(concept_spec.get("fromMax") or 5999),
            less_min=int(concept_spec.get("lessMin") or 100), less_max=int(concept_spec.get("lessMax") or 599),
        )
        return [generate_bm_concept_drill_question(config, random.Random(f"{seed}-Q{i}")) for i in range(1, count + 1)]

    # ADD_LESS (Sections 1/2)
    config = _build_bm_config(concept_spec, count, seed)
    return generate_bm_question_set(config)


def _bm_fill_concept(concept_spec: dict[str, Any], needed_count: int, used_signatures: set[tuple], section_key: str, section_title: str, display_number: int) -> list[dict[str, Any]]:
    """Same redistribution-safe fill pattern as PM-L4's _pm_l4_fill_concept."""
    accepted: list[dict[str, Any]] = []
    if needed_count <= 0:
        return accepted
    attempts = 0
    while len(accepted) < needed_count and attempts < max(needed_count * 4, 20):
        remaining = needed_count - len(accepted)
        seed = f"COMPETITION-BM-L1-{section_key}-{concept_spec['title']}-{uuid4().hex}-{attempts}"
        batch = _generate_bm_competition_batch(concept_spec, remaining, seed)
        for question in batch:
            signature = _bm_question_signature(question)
            if signature in used_signatures:
                continue
            used_signatures.add(signature)
            metadata = dict(question.get("metadata") or {})
            metadata.update({
                "competitionConceptKey": concept_spec["title"],
                "competitionConceptName": concept_spec["title"],
                "competitionAllowedConceptFamily": metadata.get("concept_family") or concept_spec.get("conceptFamily"),
                "conceptName": concept_spec["title"],
                "competitionSectionKey": section_key,
                "competitionSectionNumber": display_number,
                "competitionSectionTitle": section_title,
                "competitionSectionDisplayTitle": section_title,
                "competitionSectionLocked": True,
                "section_number": display_number,
                "section_title": section_title,
            })
            question_copy = dict(question)
            question_copy["metadata"] = metadata
            accepted.append(question_copy)
            if len(accepted) >= needed_count:
                break
        attempts += 1
    return accepted


def BmCompetitionLevelConfig(LevelRecord: Level) -> dict[str, Any]:
    LevelCode = str(getattr(LevelRecord, "level_code", "") or "")
    Config = BM_COMPETITION_LEVEL_REGISTRY.get(LevelCode)
    if Config is None:
        api_error(
            400,
            "BM_COMPETITION_LEVEL_NOT_CONFIGURED",
            f"No competition mock section structure has been defined yet for BM level '{LevelCode}'. "
            "BM competition mocks are designed level by level -- add this level's own sections and "
            "concept pools to BM_COMPETITION_LEVEL_REGISTRY before generating mocks for it.",
            {"levelCode": LevelCode, "configuredLevels": sorted(BM_COMPETITION_LEVEL_REGISTRY.keys())},
        )
    return Config


def _ordered_concept_schedule(concept_pool: list[dict[str, Any]], required_count: int) -> list[dict[str, Any]]:
    """Evenly distribute required_count questions across every concept-pool
    entry (base + remainder-to-the-first-few), so a section never skews
    toward only one or two of its many taught patterns. BM's own copy of
    the same "spread a count across a list" idea PM-L4's own file uses --
    deliberately not imported from there, keeping BM's mock generation
    fully self-contained.
    """
    if not concept_pool or required_count <= 0:
        return []
    base = required_count // len(concept_pool)
    remainder = required_count % len(concept_pool)
    schedule: list[dict[str, Any]] = []
    for index, spec in enumerate(concept_pool):
        count = base + (1 if index < remainder else 0)
        schedule.extend([spec] * count)
    return schedule


def CollectBmCompetitionSectionLockedQuestions(
    LevelRecord: Level,
    TargetQuestionCount: int,
    SectionCountsOverride: dict[str, int] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """BM-L1's counterpart to CollectPmL4CompetitionSectionLockedQuestions --
    same redistribution-safe, id()-keyed allocation, across BM-L1's own 6
    sections.
    """
    from app.services.competition_mock_generation_service import _RedistributeSectionCounts, _DenseSectionNumbering  # noqa: PLC0415

    LevelConfig = BmCompetitionLevelConfig(LevelRecord)
    SectionDefinitions = LevelConfig["sectionDefinitions"]
    SectionConceptPools = LevelConfig["sectionConceptPools"]

    SectionCounts = _RedistributeSectionCounts(TargetQuestionCount, SectionDefinitions, SectionCountsOverride, BM_DEFAULT_COMPETITION_MOCK_QUESTION_COUNT)
    DenseNumbers = _DenseSectionNumbering(SectionDefinitions, SectionCounts)

    Selected: list[dict[str, Any]] = []
    SectionCoverage: list[dict[str, Any]] = []
    UsedSignatures: set[tuple] = set()

    for SectionDefinition in SectionDefinitions:
        SectionKey = SectionDefinition["key"]
        RequiredCount = int(SectionCounts.get(SectionKey, 0) or 0)
        if RequiredCount <= 0:
            continue
        DisplayNumber = DenseNumbers[SectionKey]
        SectionTitle = SectionDefinition["title"]
        ConceptPool = SectionConceptPools.get(SectionKey, [])
        if not ConceptPool:
            api_error(400, "BM_COMPETITION_SECTION_EMPTY", f"{SectionTitle} has no concept pool configured.")

        Schedule = _ordered_concept_schedule(ConceptPool, RequiredCount)
        CountsByConcept: dict[int, int] = defaultdict(int)
        for Spec in Schedule:
            CountsByConcept[id(Spec)] += 1

        SectionQuestions: list[dict[str, Any]] = []
        ConceptCoverage: dict[str, int] = defaultdict(int)
        ConceptCoverageOrder: list[str] = []

        def _record(ConceptSpec: dict[str, Any], Questions: list[dict[str, Any]]) -> None:
            for Question in Questions:
                SectionQuestions.append(Question)
                ConceptCoverage[ConceptSpec["title"]] += 1
                if ConceptSpec["title"] not in ConceptCoverageOrder:
                    ConceptCoverageOrder.append(ConceptSpec["title"])

        for ConceptSpec in ConceptPool:
            RequiredForConcept = CountsByConcept.get(id(ConceptSpec), 0)
            if RequiredForConcept <= 0:
                continue
            _record(ConceptSpec, _bm_fill_concept(ConceptSpec, RequiredForConcept, UsedSignatures, SectionKey, SectionTitle, DisplayNumber))

        ExhaustedConceptIds: set[int] = set()
        for _ in range(len(ConceptPool) + 1):
            if len(SectionQuestions) >= RequiredCount:
                break
            GainedThisSweep = 0
            for ConceptSpec in ConceptPool:
                if id(ConceptSpec) in ExhaustedConceptIds:
                    continue
                Outstanding = RequiredCount - len(SectionQuestions)
                if Outstanding <= 0:
                    break
                Got = _bm_fill_concept(ConceptSpec, Outstanding, UsedSignatures, SectionKey, SectionTitle, DisplayNumber)
                if Got:
                    _record(ConceptSpec, Got)
                    GainedThisSweep += len(Got)
                else:
                    ExhaustedConceptIds.add(id(ConceptSpec))
            if GainedThisSweep == 0:
                break

        if len(SectionQuestions) < RequiredCount:
            api_error(
                400,
                "BM_COMPETITION_SECTION_GENERATION_INCOMPLETE",
                f"Could not generate the required {RequiredCount} questions for {SectionTitle} -- "
                f"only {len(SectionQuestions)} unique questions are available across every concept "
                f"in this section at this mock size. Try a smaller question count for this section.",
                {"sectionKey": SectionKey, "required": RequiredCount, "generated": len(SectionQuestions)},
            )

        Selected.extend(SectionQuestions)
        SectionCoverage.append({
            "sectionKey": SectionKey,
            "sectionNumber": DisplayNumber,
            "sectionTitle": SectionTitle,
            "selectedQuestionCount": len(SectionQuestions),
            "availableQuestionCount": len(SectionQuestions),
            "locked": True,
            "concepts": [
                {"conceptName": Name, "selectedQuestionCount": ConceptCoverage[Name], "availableQuestionCount": ConceptCoverage[Name]}
                for Name in ConceptCoverageOrder
            ],
        })

    for Index, Question in enumerate(Selected, start=1):
        Question["question_number"] = Index

    CoveragePayload = {
        "targetQuestionCount": TargetQuestionCount,
        "selectedQuestionCount": len(Selected),
        "competitionStructure": "BM_L1_6_SECTION_COMPETITION_MOCK_SECTION_LOCKED",
        "sectionCount": len(SectionCoverage),
        "sections": SectionCoverage,
        "generationErrors": [],
    }
    return Selected, CoveragePayload
