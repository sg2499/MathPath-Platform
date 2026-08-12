"""Young Learners Module's own competition-mock section registry and question
collector -- the YLM counterpart to bm_competition_mock_generation_service.py
/ pm_competition_mock_generation_service.py, kept in a fully separate file per
the platform's established product decision (2026-08-04, reaffirmed for every
module added since: "dedicated engine, entirely independent from all the
other modules and levels"): every module gets fully dedicated curriculum
logic so a failure or future change in one module's mock/assessment
generation can never silently affect another.

Section design (Shailesh, 2026-08-11, originally negotiated per-level;
2026-08-12: YLM collapsed from 3 levels down to a single YLM-L1 level
covering all 32 lessons, matching the BM/MM one-level-per-module pattern --
see question_engine/ylm/config.py's YLM_LEVEL_LESSON_RANGES. The section
design below is the same 3-section shape as before, just pooled across the
whole level instead of split per old level boundary):

  YLM-L1 (all 32 lessons) gets 3 sections -- Addition, Subtraction, Add/Less
  -- each pooling "every kind of X sum taught anywhere in the level," not
  just within an old level boundary. Every question in both the
  section-wise assessment workflow and the competition-mock workflow is
  worth exactly 1 mark (see YLM_COMPETITION_MARKS_PER_QUESTION below, and
  assessment_engine_service.py/assessment_blueprint_service.py's
  "YLM_FLAT" handling, which puts YLM on the same flat-1-mark-always scheme
  as MM rather than IM's concept-weighted one).

  Addition and Subtraction pool one concept-pool entry per contributing
  lesson across the full 1-32 range, built directly from that lesson's own
  YLM_LESSON_RULES entry (title, concept family, operation focus, abacus
  rule, target numbers, digit pattern, generation template) -- so a
  mock/assessment question can never describe a taught pattern that doesn't
  actually exist in the curriculum.

  No lesson from 25-31 has a pure Addition focus (they're all
  Complement-of-10 Subtraction), and no lesson past 7 has a pure Add/Less
  focus at all -- Lesson 32 (the level's final mixed revision) is the only
  place addition-shaped and add/less-shaped content exists past that point.
  Per Shailesh's explicit direction from the original per-level design
  ("what is the best way forward for level 3 then?"), the Addition and
  Add/Less sections both fold in synthetic entries sourced from Lesson 32's
  own revision pool -- restricted to addition-shaped slots (Direct-addition-
  only, Complement-of-5 Addition, Complement-of-10 Addition) for Addition,
  and Direct Add/Less slots (mixed +/- in the same sum, matching Shailesh's
  own "add/less sum stacks" phrasing) for Add/Less -- on top of the real
  lesson-sourced entries from earlier in the level. This uses
  lesson_number=0 on every synthetic config, which is the confirmed,
  already-existing bypass in question_engine/ylm/config.py's
  enrich_config_with_lesson_rule(): a lesson_number with no entry in
  YLM_LESSON_RULES leaves every field the caller set completely untouched,
  so a fully custom generation_template/revision_templates/digit_pattern/etc.
  combination is honored exactly as given -- no new generator code was
  needed for this constraint.

Reads exclusively from question_engine/ylm and this file's own module-level
constants -- zero imports from any other module's mock/assessment logic.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any
from uuid import uuid4

from app.core.errors import api_error
from app.models import Level
from app.question_engine.ylm import YLMConfig, generate_ylm_question_set
from app.question_engine.ylm.config import YLM_LESSON_RULES

YLM_DEFAULT_COMPETITION_MOCK_QUESTION_COUNT = 60
YLM_DEFAULT_COMPETITION_MOCK_DURATION_SECONDS = 1800
YLM_COMPETITION_MARKS_PER_QUESTION = 1


def _ylm_concept_spec_from_lesson(lesson_number: int, level_code: str) -> dict[str, Any]:
    """Builds one concept-pool entry directly from a real, taught YLM lesson.

    Every field here is copied straight off that lesson's own
    YLM_LESSON_RULES entry -- this is what guarantees "all kinds of
    addition/subtraction sums throughout the entire level" actually reflects
    the real curriculum instead of an invented shape -- with one deliberate
    exception: digitPattern is always widened to "1D_AND_2D" rather than
    copied as-is.

    Found 2026-08-11 while verifying this file: YLM_LESSON_RULES.digit_pattern
    is each lesson's DPS-1 (single-digit introduction) default -- real
    lessons teach across 5 DPS sheets that widen up to double digits by
    DPS-3/4/5 (see YLM_DPS_DIGIT_PATTERN_OVERRIDES in
    question_engine/ylm/config.py). Copying only the DPS-1 default here
    starves several single-target lessons (e.g. Lesson 17's Complement-of-10
    Addition, target=[4] only) down to as few as 4 unique question shapes --
    nowhere near enough to fill a pooled "Section 1 - Addition" competition
    mock/assessment slot honestly (confirmed live via
    CollectYlmCompetitionSectionLockedQuestions during verification: Level
    2's Addition section could only produce 24 unique questions against a
    30-question ask). Widening every lesson-sourced concept-spec to the same
    "1D_AND_2D" mixed range Lesson 32's own synthetic entries already use
    both fixes that capacity gap and is the more faithful reading of "all
    kinds of X sums throughout the entire level" -- a pooled section should
    span every DPS variant of every contributing lesson, not just each
    lesson's narrowest introduction sheet.
    """
    rule = YLM_LESSON_RULES[lesson_number]
    return {
        "title": f"Lesson {lesson_number}: {rule.lesson_title}",
        "levelCode": level_code,
        "conceptFamily": rule.concept_family,
        "operationFocus": rule.operation_focus,
        "abacusRule": rule.abacus_rule,
        "targetNumbers": list(rule.target_numbers),
        "placeValue": rule.place_value,
        "digitPattern": "1D_AND_2D",
        "rows": rule.rows,
        "generationTemplate": rule.generation_template,
        "revisionTemplates": list(rule.revision_templates),
        "allowNegativeOperands": rule.allow_negative_operands,
        "allowNegativeAnswer": rule.allow_negative_answer,
        "allowedMovementTypes": list(rule.allowed_movement_types),
        "requiredMovementTypes": list(rule.required_movement_types),
    }


def _ylm_pool_from_lessons(lesson_numbers: list[int], level_code: str) -> list[dict[str, Any]]:
    return [_ylm_concept_spec_from_lesson(lesson_number, level_code) for lesson_number in lesson_numbers]


YLM_COMPETITION_SECTION_DEFINITIONS: list[dict[str, Any]] = [
    {"key": "YLM_ADDITION", "number": 1, "title": "Section 1 - Addition"},
    {"key": "YLM_SUBTRACTION", "number": 2, "title": "Section 2 - Subtraction"},
    {"key": "YLM_ADD_LESS", "number": 3, "title": "Section 3 - Add/Less"},
]

# Addition: every addition-flavored real lesson across the whole level --
# Complement-of-5 Addition (Lessons 3-6) + its revision (Lesson 12) +
# Complement-of-10 Addition (Lessons 14-22). Lessons 25-32 have no
# purely-addition lesson of their own; Lesson 32's synthetic contribution
# (YLM_LESSON_32_ADDITION_POOL below) is appended separately.
YLM_ADDITION_LESSONS: list[int] = [3, 4, 5, 6, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22]
# Subtraction: every subtraction-flavored lesson across the whole level --
# Complement-of-5 Subtraction (Lessons 8-11) + its revision (Lesson 13) +
# Complement-of-10 Subtraction (Lessons 23-31). Fully lesson-sourced, no
# synthetic entries needed -- Subtraction has real coverage everywhere.
YLM_SUBTRACTION_LESSONS: list[int] = [8, 9, 10, 11, 13, 23, 24, 25, 26, 27, 28, 29, 30, 31]
# Add/Less: the two Direct Add-Less introduction lessons (1, 2) and the
# combined Direct Add-Less + Complement-of-5-Addition revision (Lesson 7) --
# the only lessons anywhere in the level that pool true mixed +/- rows.
# Lesson 32's synthetic contribution (YLM_LESSON_32_ADD_LESS_POOL below) is
# appended separately.
YLM_ADD_LESS_LESSONS: list[int] = [1, 2, 7]

# Lesson 32 (the level's final mixed revision) has no YLM_LESSON_RULES entry
# that is purely "Addition" or purely "Add/Less" -- it's deliberately a blend
# of every movement type taught across all 32 lessons. These synthetic,
# lesson_number=0 concept-pool entries draw addition-shaped and
# add/less-shaped slots out of that blend so "all kinds of addition/add-less
# sums from all 32 lessons" genuinely includes Lesson 32's contribution
# instead of skipping it for not being single-purpose. digitPattern=
# "1D_AND_2D" and rows=3 match Lesson 32's own YLM_LESSON_RULES entry;
# targetNumbers=[] deliberately, so each entry falls back to the generator's
# own full target range (COMP5_ADD: 1-4, COMP10_ADD: 1-9) for maximum
# coverage. lesson_number=0 (set in _build_ylm_config) is what lets
# generation_template/revision_templates/digit_pattern be honored exactly as
# given, bypassing Lesson 32's own REVISION_TEMPLATE_SCHEDULES pacing (fine
# here -- that pacing exists for a single 10-question DPS worksheet, not a
# pooled mock/assessment section).
YLM_LESSON_32_ADDITION_POOL: list[dict[str, Any]] = [
    {
        "title": "Lesson 32 Revision Pool: Direct Addition",
        "levelCode": "YLM-L1",
        "conceptFamily": "MIXED_REVISION",
        "operationFocus": "ADDITION",
        "abacusRule": None,
        "targetNumbers": [],
        "placeValue": "MIXED",
        "digitPattern": "1D_AND_2D",
        "rows": 3,
        "generationTemplate": "DIRECT",
        "revisionTemplates": [],
        "allowNegativeOperands": True,
        "allowNegativeAnswer": False,
        "allowedMovementTypes": ["DIRECT"],
        "requiredMovementTypes": [],
    },
    {
        "title": "Lesson 32 Revision Pool: Complement of 5 Addition",
        "levelCode": "YLM-L1",
        "conceptFamily": "MIXED_REVISION",
        "operationFocus": "ADDITION",
        "abacusRule": None,
        "targetNumbers": [],
        "placeValue": "MIXED",
        "digitPattern": "1D_AND_2D",
        "rows": 3,
        "generationTemplate": "COMP5_ADD",
        "revisionTemplates": [],
        "allowNegativeOperands": True,
        "allowNegativeAnswer": False,
        "allowedMovementTypes": ["DIRECT", "COMP5_ADD"],
        "requiredMovementTypes": ["COMP5_ADD"],
    },
    {
        "title": "Lesson 32 Revision Pool: Complement of 10 Addition",
        "levelCode": "YLM-L1",
        "conceptFamily": "MIXED_REVISION",
        "operationFocus": "ADDITION",
        "abacusRule": None,
        "targetNumbers": [],
        "placeValue": "MIXED",
        "digitPattern": "1D_AND_2D",
        "rows": 3,
        "generationTemplate": "COMP10_ADD",
        "revisionTemplates": [],
        "allowNegativeOperands": True,
        "allowNegativeAnswer": False,
        "allowedMovementTypes": ["DIRECT", "COMP10_ADD"],
        "requiredMovementTypes": ["COMP10_ADD"],
    },
]

# Add/Less: Lesson 32's Direct slots only -- true mixed +/- rows in the same
# sum stack (e.g. 36 + 4 - 2), matching Shailesh's own definition of an
# "add/less sum stack".
YLM_LESSON_32_ADD_LESS_POOL: list[dict[str, Any]] = [
    {
        "title": "Lesson 32 Revision Pool: Direct Add/Less",
        "levelCode": "YLM-L1",
        "conceptFamily": "MIXED_REVISION",
        "operationFocus": "ADD_LESS",
        "abacusRule": None,
        "targetNumbers": [],
        "placeValue": "MIXED",
        "digitPattern": "1D_AND_2D",
        "rows": 3,
        "generationTemplate": "DIRECT",
        "revisionTemplates": [],
        "allowNegativeOperands": True,
        "allowNegativeAnswer": False,
        "allowedMovementTypes": ["DIRECT"],
        "requiredMovementTypes": [],
    },
]

YLM_COMPETITION_SECTION_CONCEPT_POOLS: dict[str, list[dict[str, Any]]] = {
    "YLM_ADDITION": _ylm_pool_from_lessons(YLM_ADDITION_LESSONS, "YLM-L1") + YLM_LESSON_32_ADDITION_POOL,
    "YLM_SUBTRACTION": _ylm_pool_from_lessons(YLM_SUBTRACTION_LESSONS, "YLM-L1"),
    "YLM_ADD_LESS": _ylm_pool_from_lessons(YLM_ADD_LESS_LESSONS, "YLM-L1") + YLM_LESSON_32_ADD_LESS_POOL,
}


YLM_COMPETITION_LEVEL_REGISTRY: dict[str, dict[str, Any]] = {
    "YLM-L1": {
        "sectionDefinitions": YLM_COMPETITION_SECTION_DEFINITIONS,
        "sectionConceptPools": YLM_COMPETITION_SECTION_CONCEPT_POOLS,
    },
}


def _build_ylm_config(concept_spec: dict[str, Any], question_count: int, seed: str) -> YLMConfig:
    return YLMConfig(
        module_code="YLM",
        level_code=str(concept_spec.get("levelCode") or "YLM-L1"),
        lesson_number=0,
        dps_number=0,
        question_count=question_count,
        rows=int(concept_spec.get("rows") or 3),
        concept_family=str(concept_spec.get("conceptFamily") or "DIRECT_ADD_LESS"),
        operation_focus=str(concept_spec.get("operationFocus") or "ADD_LESS"),
        abacus_rule=concept_spec.get("abacusRule"),
        target_numbers=list(concept_spec.get("targetNumbers") or []),
        place_value=str(concept_spec.get("placeValue") or "ONES"),
        digit_pattern=str(concept_spec.get("digitPattern") or "1D"),
        allow_negative_operands=bool(concept_spec.get("allowNegativeOperands", True)),
        allow_negative_answer=bool(concept_spec.get("allowNegativeAnswer", False)),
        seed=seed,
        allowed_movement_types=tuple(concept_spec.get("allowedMovementTypes") or ()),
        required_movement_types=tuple(concept_spec.get("requiredMovementTypes") or ()),
        lesson_title=str(concept_spec.get("title") or ""),
        generation_template=str(concept_spec.get("generationTemplate") or "DIRECT"),
        revision_templates=tuple(concept_spec.get("revisionTemplates") or ()),
    )


def _generate_ylm_competition_batch(concept_spec: dict[str, Any], count: int, seed: str) -> list[dict[str, Any]]:
    """YLM has exactly one generation dispatch path (unlike BM/PM-L4, which
    branch across multiplication/division/BODMAS/concept-drill) -- every
    concept-pool entry, whether lesson-sourced or Lesson-32-synthetic, is a
    YLMConfig consumed by the same generate_ylm_question_set(). Kept as its
    own function (rather than inlining this at every call site) purely to
    match the shape every other module's dedicated mock/assessment file
    uses, so a future YLM concept kind that does need its own dispatch
    branch has an obvious place to add it.
    """
    if count <= 0:
        return []
    config = _build_ylm_config(concept_spec, count, seed)
    return generate_ylm_question_set(config)


def _ylm_question_signature(question: dict[str, Any]) -> tuple:
    """Every YLM question is a VERTICAL 3-operand add/less sum -- no
    drill_operands, no alternate display types -- so a single signature
    shape (unlike BM's, which has to branch across drill/BODMAS/plain
    questions) covers every YLM concept.
    """
    return ("VERTICAL",) + tuple(question.get("operands") or [])


def _ylm_fill_concept(concept_spec: dict[str, Any], needed_count: int, used_signatures: set[tuple], section_key: str, section_title: str, display_number: int) -> list[dict[str, Any]]:
    """Same redistribution-safe fill pattern as BM's _bm_fill_concept /
    PM-L4's _pm_l4_fill_concept."""
    accepted: list[dict[str, Any]] = []
    if needed_count <= 0:
        return accepted
    attempts = 0
    while len(accepted) < needed_count and attempts < max(needed_count * 4, 20):
        remaining = needed_count - len(accepted)
        seed = f"COMPETITION-{concept_spec.get('levelCode', 'YLM')}-{section_key}-{concept_spec['title']}-{uuid4().hex}-{attempts}"
        batch = _generate_ylm_competition_batch(concept_spec, remaining, seed)
        for question in batch:
            signature = _ylm_question_signature(question)
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


def YlmCompetitionLevelConfig(LevelRecord: Level) -> dict[str, Any]:
    LevelCode = str(getattr(LevelRecord, "level_code", "") or "")
    Config = YLM_COMPETITION_LEVEL_REGISTRY.get(LevelCode)
    if Config is None:
        api_error(
            400,
            "YLM_COMPETITION_LEVEL_NOT_CONFIGURED",
            f"No competition mock section structure has been defined yet for YLM level '{LevelCode}'. "
            "YLM competition mocks are designed level by level -- add this level's own sections and "
            "concept pools to YLM_COMPETITION_LEVEL_REGISTRY before generating mocks for it.",
            {"levelCode": LevelCode, "configuredLevels": sorted(YLM_COMPETITION_LEVEL_REGISTRY.keys())},
        )
    return Config


def _ordered_concept_schedule(concept_pool: list[dict[str, Any]], required_count: int) -> list[dict[str, Any]]:
    """Evenly distribute required_count questions across every concept-pool
    entry (base + remainder-to-the-first-few), so a section never skews
    toward only one or two of its many taught patterns. YLM's own copy of
    the same "spread a count across a list" idea every other module's mock
    file already carries -- deliberately not imported from any of them,
    keeping YLM's mock generation fully self-contained.
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


def CollectYlmCompetitionSectionLockedQuestions(
    LevelRecord: Level,
    TargetQuestionCount: int,
    SectionCountsOverride: dict[str, int] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """YLM's counterpart to CollectBmCompetitionSectionLockedQuestions --
    same redistribution-safe, id()-keyed allocation, across this level's own
    2 or 3 sections.
    """
    from app.services.competition_mock_generation_service import _RedistributeSectionCounts, _DenseSectionNumbering  # noqa: PLC0415

    LevelConfig = YlmCompetitionLevelConfig(LevelRecord)
    SectionDefinitions = LevelConfig["sectionDefinitions"]
    SectionConceptPools = LevelConfig["sectionConceptPools"]

    SectionCounts = _RedistributeSectionCounts(TargetQuestionCount, SectionDefinitions, SectionCountsOverride, YLM_DEFAULT_COMPETITION_MOCK_QUESTION_COUNT)
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
            api_error(400, "YLM_COMPETITION_SECTION_EMPTY", f"{SectionTitle} has no concept pool configured.")

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
            _record(ConceptSpec, _ylm_fill_concept(ConceptSpec, RequiredForConcept, UsedSignatures, SectionKey, SectionTitle, DisplayNumber))

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
                Got = _ylm_fill_concept(ConceptSpec, Outstanding, UsedSignatures, SectionKey, SectionTitle, DisplayNumber)
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
                "YLM_COMPETITION_SECTION_GENERATION_INCOMPLETE",
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
        "competitionStructure": "YLM_SECTION_COMPETITION_MOCK_SECTION_LOCKED",
        "sectionCount": len(SectionCoverage),
        "sections": SectionCoverage,
        "generationErrors": [],
    }
    return Selected, CoveragePayload
