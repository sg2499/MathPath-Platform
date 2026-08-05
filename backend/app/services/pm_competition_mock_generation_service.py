"""Preparatory Module's own competition-mock section registry and question
collector -- the PM counterpart to the MM/IM logic in
competition_mock_generation_service.py, kept in a fully separate file per
product decision (2026-08-04): every module gets fully dedicated curriculum
logic so a failure or future change in one module's mock/assessment
generation can never silently affect another.

PM-L1 has exactly 3 sections (Section 1 - Addition, Section 2 -
Subtraction, Section 3 - Add/Less), covering every addition/subtraction
pattern taught across its 15 lessons (see
app/seed/preparatory_module_l1_config.py), flat 1 mark per question --
there is no Skill Stacker/Concept Drill equivalent in PM, so none of IM's
weighting machinery applies here.

Section 3 - Add/Less is not "some of each direction" -- it is the native,
genuinely-mixed generation (both + and - within the very same question)
that only exists in three places across all 15 lessons: Lesson 1's 1D/
1D_AND_2D direct add-less, Lesson 2's 2D_FULL/3D_HUNDREDS/3D_FULL direct
add-less, and Lesson 11 DPS5's complement-of-10 add-less for target 5.
Every other lesson (3-10, 12-15) is locked to a single direction per
lesson even where its own DPS5 is labelled "MIXED_REVISION" (that mixes
COMP5/COMP10 technique, not addition/subtraction direction) -- those stay
exclusive to Sections 1/2 via the operation-focus-split entries already
in _addition_pool()/_subtraction_pool() below. Section 3 reuses the same
underlying DPS concepts with their native operation_focus="ADD_LESS"
instead of the artificially split ADDITION/SUBTRACTION-only versions.

The only things imported from the shared MM/IM file are two generic,
doc-confirmed-as-shared distribution utilities
(_RedistributeSectionCounts, _DenseSectionNumbering) -- pure "split N
across sections" and "assign 1..N display numbers to non-empty sections"
math with no curriculum content of its own, already explicitly designed to
serve "every current and future MM/IM level" per that file's own docstring.
Everything that actually describes PM's curriculum (section definitions,
concept pools, question construction) is authored here, independently, and
calls PM's own dedicated generator (app/question_engine/pm) directly.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any
from uuid import uuid4

from app.core.errors import api_error
from app.models import Level
from app.question_engine.pm import PMConfig, generate_pm_question_set

PM_DEFAULT_COMPETITION_MOCK_QUESTION_COUNT = 60
PM_DEFAULT_COMPETITION_MOCK_DURATION_SECONDS = 1800
PM_COMPETITION_MARKS_PER_QUESTION = 1

PM_COMPETITION_SECTION_DEFINITIONS: list[dict[str, Any]] = [
    {"key": "PM_ADDITION", "number": 1, "title": "Section 1 - Addition"},
    {"key": "PM_SUBTRACTION", "number": 2, "title": "Section 2 - Subtraction"},
    {"key": "PM_ADD_LESS", "number": 3, "title": "Section 3 - Add/Less"},
]

PM_COMPETITION_SECTION_BY_KEY = {Row["key"]: Row for Row in PM_COMPETITION_SECTION_DEFINITIONS}


def _addition_pool() -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = [
        {"title": "Direct Addition (Single Digit)", "conceptFamily": "DIRECT_ADD_LESS", "operationFocus": "ADDITION", "digitPattern": "1D", "generationTemplate": "DIRECT", "targetNumbers": []},
        {"title": "Direct Addition (Double Digit, Ones & Tens)", "conceptFamily": "DIRECT_ADD_LESS", "operationFocus": "ADDITION", "digitPattern": "1D_AND_2D", "generationTemplate": "DIRECT", "targetNumbers": []},
        {"title": "Direct Addition (Double Digit)", "conceptFamily": "DIRECT_ADD_LESS", "operationFocus": "ADDITION", "digitPattern": "2D_FULL", "generationTemplate": "DIRECT", "targetNumbers": []},
        {"title": "Direct Addition (Round Hundreds)", "conceptFamily": "DIRECT_ADD_LESS", "operationFocus": "ADDITION", "digitPattern": "3D_HUNDREDS", "generationTemplate": "DIRECT", "targetNumbers": []},
        {"title": "Direct Addition (Triple Digit)", "conceptFamily": "DIRECT_ADD_LESS", "operationFocus": "ADDITION", "digitPattern": "3D_FULL", "generationTemplate": "DIRECT", "targetNumbers": []},
    ]
    for target, abacus in ((1, "ADD_5_LESS_4"), (2, "ADD_5_LESS_3"), (3, "ADD_5_LESS_2"), (4, "ADD_5_LESS_1")):
        entries.append({
            "title": f"Addition of {target} using Complement of 5",
            "conceptFamily": "COMPLEMENT_OF_5", "operationFocus": "ADDITION",
            "abacusRule": abacus, "targetNumbers": [target], "digitPattern": "1D_AND_2D", "generationTemplate": "COMP5_ADD",
        })
    for target, abacus in ((1, "ADD_10_LESS_9"), (2, "ADD_10_LESS_8"), (3, "ADD_10_LESS_7"), (4, "ADD_10_LESS_6"), (5, "ADD_10_LESS_5"), (6, "ADD_10_LESS_4"), (7, "ADD_10_LESS_3"), (8, "ADD_10_LESS_2"), (9, "ADD_10_LESS_1")):
        entries.append({
            "title": f"Addition of {target} using Complement of 10",
            "conceptFamily": "COMPLEMENT_OF_10", "operationFocus": "ADDITION",
            "abacusRule": abacus, "targetNumbers": [target], "digitPattern": "1D_AND_2D", "generationTemplate": "COMP10_ADD",
        })
    return entries


def _subtraction_pool() -> list[dict[str, Any]]:
    # Note: no standalone "Round Hundreds" entry here, unlike the addition
    # pool -- a round-hundred base (100, 200, ...) always has ones-digit 0,
    # and DIRECT_SUB_ALLOWED[0] in validators.py is deliberately empty
    # (subtracting a single digit from a number ending in 0 requires
    # borrowing across places, which is not a "direct" abacus move). This
    # matches the real seeded curriculum exactly: Lesson 2 DPS4
    # (preparatory_module_l1_config.py) configures 3D_HUNDREDS with
    # operation_focus="ADD_LESS", not a subtraction-only focus, precisely
    # because only the addition direction is achievable from those bases.
    entries: list[dict[str, Any]] = [
        {"title": "Direct Subtraction (Single Digit)", "conceptFamily": "DIRECT_ADD_LESS", "operationFocus": "SUBTRACTION", "digitPattern": "1D", "generationTemplate": "DIRECT", "targetNumbers": []},
        {"title": "Direct Subtraction (Double Digit, Ones & Tens)", "conceptFamily": "DIRECT_ADD_LESS", "operationFocus": "SUBTRACTION", "digitPattern": "1D_AND_2D", "generationTemplate": "DIRECT", "targetNumbers": []},
        {"title": "Direct Subtraction (Double Digit)", "conceptFamily": "DIRECT_ADD_LESS", "operationFocus": "SUBTRACTION", "digitPattern": "2D_FULL", "generationTemplate": "DIRECT", "targetNumbers": []},
        {"title": "Direct Subtraction (Triple Digit)", "conceptFamily": "DIRECT_ADD_LESS", "operationFocus": "SUBTRACTION", "digitPattern": "3D_FULL", "generationTemplate": "DIRECT", "targetNumbers": []},
    ]
    for target, abacus in ((1, "LESS_5_ADD_4"), (2, "LESS_5_ADD_3"), (3, "LESS_5_ADD_2"), (4, "LESS_5_ADD_1")):
        entries.append({
            "title": f"Subtraction of {target} using Complement of 5",
            "conceptFamily": "COMPLEMENT_OF_5", "operationFocus": "SUBTRACTION",
            "abacusRule": abacus, "targetNumbers": [target], "digitPattern": "1D_AND_2D", "generationTemplate": "COMP5_SUB",
        })
    for target, abacus in ((1, "LESS_10_ADD_9"), (2, "LESS_10_ADD_8"), (3, "LESS_10_ADD_7"), (4, "LESS_10_ADD_6"), (5, "LESS_10_ADD_5"), (6, "LESS_10_ADD_4"), (7, "LESS_10_ADD_3"), (8, "LESS_10_ADD_2"), (9, "LESS_10_ADD_1")):
        entries.append({
            "title": f"Subtraction of {target} using Complement of 10",
            "conceptFamily": "COMPLEMENT_OF_10", "operationFocus": "SUBTRACTION",
            "abacusRule": abacus, "targetNumbers": [target], "digitPattern": "1D_AND_2D", "generationTemplate": "COMP10_SUB",
        })
    return entries


def _add_less_pool() -> list[dict[str, Any]]:
    """Section 3 - Add/Less: the genuinely-mixed generation (both + and -
    within the same question) that exists in exactly three places across
    PM-L1's 15 lessons -- Lesson 1's direct add-less (1D, 1D_AND_2D),
    Lesson 2's direct add-less (2D_FULL, 3D_HUNDREDS, 3D_FULL), and Lesson
    11 DPS5's complement-of-10 add-less for target 5. Each entry below
    reuses the exact concept_family/digit_pattern/generation_template of
    the matching DPS in preparatory_module_l1_config.py, but with the
    native operation_focus="ADD_LESS" instead of the ADDITION/SUBTRACTION
    split used by _addition_pool()/_subtraction_pool() above -- so Section
    3 tests the real mixed-direction skill, not a relabelled single
    direction. Round Hundreds is included here (unlike _subtraction_pool(),
    which omits it -- see that function's comment) because add-less mixing
    from a round-hundred base is achievable even though pure subtraction
    alone from one is not.
    """
    return [
        {"title": "Direct Add/Less (Single Digit)", "conceptFamily": "DIRECT_ADD_LESS", "operationFocus": "ADD_LESS", "digitPattern": "1D", "generationTemplate": "DIRECT", "targetNumbers": []},
        {"title": "Direct Add/Less (Double Digit, Ones & Tens)", "conceptFamily": "DIRECT_ADD_LESS", "operationFocus": "ADD_LESS", "digitPattern": "1D_AND_2D", "generationTemplate": "DIRECT", "targetNumbers": []},
        {"title": "Direct Add/Less (Double Digit)", "conceptFamily": "DIRECT_ADD_LESS", "operationFocus": "ADD_LESS", "digitPattern": "2D_FULL", "generationTemplate": "DIRECT", "targetNumbers": []},
        {"title": "Direct Add/Less (Round Hundreds)", "conceptFamily": "DIRECT_ADD_LESS", "operationFocus": "ADD_LESS", "digitPattern": "3D_HUNDREDS", "generationTemplate": "DIRECT", "targetNumbers": []},
        {"title": "Direct Add/Less (Triple Digit)", "conceptFamily": "DIRECT_ADD_LESS", "operationFocus": "ADD_LESS", "digitPattern": "3D_FULL", "generationTemplate": "DIRECT", "targetNumbers": []},
        {
            "title": "Add/Less of 5 using Complement of 10",
            "conceptFamily": "MIXED_REVISION", "operationFocus": "ADD_LESS",
            "abacusRule": None, "targetNumbers": [5], "digitPattern": "1D_AND_2D", "generationTemplate": "REVISION",
            "revisionTemplates": ["COMP10_ADD", "COMP10_SUB"],
        },
    ]


PM_COMPETITION_SECTION_CONCEPT_POOLS: dict[str, list[dict[str, Any]]] = {
    "PM_ADDITION": _addition_pool(),
    "PM_SUBTRACTION": _subtraction_pool(),
    "PM_ADD_LESS": _add_less_pool(),
}

PM_COMPETITION_LEVEL_REGISTRY: dict[str, dict[str, Any]] = {
    "PM-L1": {
        "sectionDefinitions": PM_COMPETITION_SECTION_DEFINITIONS,
        "sectionConceptPools": PM_COMPETITION_SECTION_CONCEPT_POOLS,
    },
}


# ---------------------------------------------------------------------------
# PM-L2 -- added 2026-08-05, Shailesh. Structurally different from PM-L1's
# Addition/Subtraction/Add-Less split: PM-L2's sections are keyed by
# *practice mode* (Abacus vs Visual), not by operation direction, because
# that is the axis Shailesh explicitly asked for -- "for the assessment and
# mock workflows the sections need to follow the underlying concepts...
# Section 1 - Add/Less (Abacus)... Section 2 - Add/Less (Visual)... Section
# 3 - Concept Drill". Unlike PM-L1's Addition/Subtraction sections (true
# mirror images of the same technique set), Sections 1 and 2 here are NOT
# expected to be symmetric -- which specific target/technique lands in
# which section is dictated by which DPS sheet the workbook happened to tag
# ABACUS vs VISUAL, confirmed and accepted by Shailesh as expected, not a
# defect to "fix" into a mirrored shape.
#
# Section 1/2 concept pools are derived programmatically from
# PM_L2_LESSONS (preparatory_module_l2_config.py) -- the exact same table
# that drives DPS seeding -- rather than hand-duplicated here, so the two
# can never silently drift apart. Section 3 (Concept Drill) uses wide
# generation ranges (not the DPS table's pinned literal values) per
# Shailesh's explicit "assessment/mock need concept-driven generation, not
# workbook-literal replay" instruction.
#
# Question generation for PM-L2 routes through question_engine/pm_l2 (its
# own dedicated engine, zero imports from question_engine/pm) via
# CollectPmL2CompetitionSectionLockedQuestions below -- a separate function
# from PM-L1's CollectPmCompetitionSectionLockedQuestions above, so PM-L1's
# already-verified mock/assessment code path is never touched by anything
# added here.
# ---------------------------------------------------------------------------
from app.question_engine.pm_l2 import (  # noqa: E402
    PML2Config,
    PML2ConceptDrillConfig,
    DRILL_MULTIPLY,
    DRILL_DIVIDE,
    DRILL_RANGE_SUM,
    generate_pm_l2_question_set,
)
from app.question_engine.pm_l2.concept_drill import generate_concept_drill_question  # noqa: E402
from app.seed.preparatory_module_l2_config import PM_L2_LESSONS  # noqa: E402

PM_L2_COMPETITION_SECTION_DEFINITIONS: list[dict[str, Any]] = [
    {"key": "PM_L2_ADD_LESS_ABACUS", "number": 1, "title": "Section 1 - Add/Less (Abacus)"},
    {"key": "PM_L2_ADD_LESS_VISUAL", "number": 2, "title": "Section 2 - Add/Less (Visual)"},
    {"key": "PM_L2_CONCEPT_DRILL", "number": 3, "title": "Section 3 - Concept Drill"},
]


def _pm_l2_addless_pools() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Walks every normal (non-concept-drill) DPS rule in PM_L2_LESSONS and
    buckets its concept (family/operationFocus/digitPattern/targetNumbers/
    abacusRule/generationTemplate/revisionTemplates) into the Abacus or
    Visual pool by that DPS's own resolved practice_mode, de-duplicating
    identical concepts that recur across lessons (e.g. multiple lessons
    reusing DIRECT_ADD_LESS at the same digit pattern). Returns
    (abacus_pool, visual_pool).
    """
    seen_abacus: set[tuple] = set()
    seen_visual: set[tuple] = set()
    abacus_pool: list[dict[str, Any]] = []
    visual_pool: list[dict[str, Any]] = []

    for lesson_number in sorted(PM_L2_LESSONS):
        lesson_rule = PM_L2_LESSONS[lesson_number]
        for dps_number, dps_rule in lesson_rule.dps.items():
            key = (
                dps_rule.concept_family,
                dps_rule.operation_focus,
                dps_rule.digit_pattern,
                tuple(dps_rule.target_numbers),
                dps_rule.abacus_rule,
                dps_rule.generation_template,
                tuple(dps_rule.revision_templates),
            )
            spec = {
                "title": dps_rule.dps_title,
                "conceptFamily": dps_rule.concept_family,
                "operationFocus": dps_rule.operation_focus,
                "abacusRule": dps_rule.abacus_rule,
                "targetNumbers": list(dps_rule.target_numbers),
                "digitPattern": dps_rule.digit_pattern,
                "generationTemplate": dps_rule.generation_template,
                "revisionTemplates": list(dps_rule.revision_templates),
            }
            mode = (dps_rule.practice_mode or "ABACUS").upper()
            if mode == "VISUAL":
                if key not in seen_visual:
                    seen_visual.add(key)
                    visual_pool.append(spec)
            else:
                if key not in seen_abacus:
                    seen_abacus.add(key)
                    abacus_pool.append(spec)
    return abacus_pool, visual_pool


_PM_L2_ABACUS_POOL, _PM_L2_VISUAL_POOL = _pm_l2_addless_pools()

# Concept Drill pool -- wide generation ranges (not the DPS table's pinned
# literal values), one entry per drill format. "title" doubles as this
# pool's concept-schedule key (see _ordered_concept_schedule below).
# conceptFamily="CONCEPT_DRILL" on every entry is load-bearing, not
# decorative -- assessment_blueprint_service.py's _weighted_section_keys()
# classifies a whole section as 5-marks-per-question by checking that every
# concept in its pool has conceptFamily in _CONCEPT_WEIGHTED_FAMILIES (which
# includes "CONCEPT_DRILL"); without this field the Assessment Blueprint
# Studio would silently price these questions at 1 mark instead of 5.
PM_L2_CONCEPT_DRILL_POOL: list[dict[str, Any]] = [
    {"title": "Concept Drill - Multiply (Repeated Addition)", "conceptFamily": "CONCEPT_DRILL", "drillFormat": DRILL_MULTIPLY, "addMin": 20, "addMax": 200, "timesValue": 12},
    {"title": "Concept Drill - Divide (Repeated Subtraction)", "conceptFamily": "CONCEPT_DRILL", "drillFormat": DRILL_DIVIDE, "fromMin": 50, "fromMax": 900, "lessMin": 10, "lessMax": 90},
    {"title": "Concept Drill - Range Sum", "conceptFamily": "CONCEPT_DRILL", "drillFormat": DRILL_RANGE_SUM},
]

PM_L2_COMPETITION_SECTION_CONCEPT_POOLS: dict[str, list[dict[str, Any]]] = {
    "PM_L2_ADD_LESS_ABACUS": _PM_L2_ABACUS_POOL,
    "PM_L2_ADD_LESS_VISUAL": _PM_L2_VISUAL_POOL,
    "PM_L2_CONCEPT_DRILL": PM_L2_CONCEPT_DRILL_POOL,
}

PM_COMPETITION_LEVEL_REGISTRY["PM-L2"] = {
    "sectionDefinitions": PM_L2_COMPETITION_SECTION_DEFINITIONS,
    "sectionConceptPools": PM_L2_COMPETITION_SECTION_CONCEPT_POOLS,
}


def _build_pm_l2_config(concept_spec: dict[str, Any], question_count: int, seed: str) -> PML2Config:
    return PML2Config(
        module_code="PM",
        level_code="PM-L2",
        lesson_number=0,
        dps_number=0,
        question_count=question_count,
        concept_family=concept_spec["conceptFamily"],
        operation_focus=concept_spec["operationFocus"],
        abacus_rule=concept_spec.get("abacusRule"),
        target_numbers=list(concept_spec.get("targetNumbers") or []),
        place_value="MIXED",
        digit_pattern=concept_spec.get("digitPattern", "1D"),
        allow_negative_operands=True,
        allow_negative_answer=False,
        seed=seed,
        lesson_title="PM-L2 Competition Mock",
        dps_title=str(concept_spec["title"]),
        generation_template=concept_spec.get("generationTemplate", "DIRECT"),
        revision_templates=tuple(concept_spec.get("revisionTemplates") or ()),
    )


def _generate_pm_l2_concept_drill_batch(concept_spec: dict[str, Any], question_count: int, seed: str) -> list[dict[str, Any]]:
    drill_format = concept_spec["drillFormat"]
    drill_config = PML2ConceptDrillConfig(
        module_code="PM",
        level_code="PM-L2",
        lesson_number=0,
        dps_number=0,
        drill_format=drill_format,
        seed=seed,
        add_min=concept_spec.get("addMin", 1),
        add_max=concept_spec.get("addMax", 200),
        times_value=concept_spec.get("timesValue", 12),
        from_min=concept_spec.get("fromMin", 1),
        from_max=concept_spec.get("fromMax", 999),
        less_min=concept_spec.get("lessMin", 2),
        less_max=concept_spec.get("lessMax", 99),
    )
    batch: list[dict[str, Any]] = []
    for i in range(question_count):
        q_rng = __import__("random").Random(f"{seed}-Q{i}")
        question = generate_concept_drill_question(drill_config, q_rng)
        batch.append(question)
    return batch


def _pm_l2_question_signature(question: dict[str, Any]) -> tuple:
    """Vertical-stack questions dedupe on their operand tuple; concept-drill
    questions carry a `drill_operands` dict instead (and, for downstream
    compatibility with code that unconditionally reads `Generated.get(
    "operands", [])`, also carry an *empty* `operands` list -- so checking
    "operands" in question is not enough to distinguish the two shapes, it
    is true for both. Must check drill_operands first.
    """
    if question.get("drill_operands"):
        return (question.get("display_type"),) + tuple(sorted(question["drill_operands"].items()))
    return ("VERTICAL",) + tuple(question.get("operands") or [])


def CollectPmL2CompetitionSectionLockedQuestions(
    LevelRecord: Level,
    TargetQuestionCount: int,
    SectionCountsOverride: dict[str, int] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """PM-L2's counterpart to CollectPmCompetitionSectionLockedQuestions
    above -- deliberately a separate function (not a branch inside that one)
    so PM-L1's already-verified code path is never touched by anything here.
    Sections 1/2 (Add/Less Abacus/Visual) generate through
    question_engine/pm_l2's vertical-stack generator; Section 3 (Concept
    Drill) generates through the same package's dedicated concept_drill
    generator, an entirely different question shape (no operands list, no
    rows) -- both are handled here since they share the same section-count
    distribution and coverage-reporting logic.
    """
    from app.services.competition_mock_generation_service import _RedistributeSectionCounts, _DenseSectionNumbering  # noqa: PLC0415

    LevelConfig = PmCompetitionLevelConfig(LevelRecord)
    SectionDefinitions = LevelConfig["sectionDefinitions"]
    SectionConceptPools = LevelConfig["sectionConceptPools"]

    SectionCounts = _RedistributeSectionCounts(TargetQuestionCount, SectionDefinitions, SectionCountsOverride, PM_DEFAULT_COMPETITION_MOCK_QUESTION_COUNT)
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
            api_error(400, "PM_COMPETITION_SECTION_EMPTY", f"{SectionTitle} has no concept pool configured.")

        IsConceptDrillSection = SectionKey == "PM_L2_CONCEPT_DRILL"

        Schedule = _ordered_concept_schedule(ConceptPool, RequiredCount)
        # Keyed by pool-entry identity (id), not by title: two distinct pool
        # entries can share the exact same display title (e.g. PM-L2's
        # "Two Digit Addition-Subtraction (Direct Method)" appears for both
        # the 1D_AND_2D and 2D_FULL digit patterns). Bucketing by title text
        # would collapse them into one shared count, and then EACH entry's
        # loop iteration below would look up and try to fill the FULL
        # combined count on its own -- silently doubling the attempted
        # output and starving whichever entry has the narrower operand
        # range of unique signatures, which is what raised
        # PM_COMPETITION_SECTION_GENERATION_INCOMPLETE. _ordered_concept_schedule
        # reuses the same dict object references from ConceptPool, so id()
        # is a stable per-entry key here.
        CountsByConcept: dict[int, int] = defaultdict(int)
        for Spec in Schedule:
            CountsByConcept[id(Spec)] += 1

        SectionQuestions: list[dict[str, Any]] = []
        ConceptCoverage: dict[str, int] = defaultdict(int)
        ConceptCoverageOrder: list[str] = []

        for ConceptSpec in ConceptPool:
            RequiredForConcept = CountsByConcept.get(id(ConceptSpec), 0)
            if RequiredForConcept <= 0:
                continue
            Attempts = 0
            AcceptedForConcept = 0
            while AcceptedForConcept < RequiredForConcept and Attempts < max(RequiredForConcept * 4, 20):
                Seed = f"COMPETITION-PM-L2-{SectionKey}-{ConceptSpec['title']}-{uuid4().hex}-{Attempts}"
                if IsConceptDrillSection:
                    Batch = _generate_pm_l2_concept_drill_batch(ConceptSpec, RequiredForConcept - AcceptedForConcept, Seed)
                else:
                    Config = _build_pm_l2_config(ConceptSpec, RequiredForConcept - AcceptedForConcept, Seed)
                    Batch = generate_pm_l2_question_set(Config)
                for Question in Batch:
                    Signature = _pm_l2_question_signature(Question)
                    if Signature in UsedSignatures:
                        continue
                    UsedSignatures.add(Signature)
                    Metadata = dict(Question.get("metadata") or {})
                    Metadata.update({
                        "competitionConceptKey": ConceptSpec["title"],
                        "competitionConceptName": ConceptSpec["title"],
                        "competitionAllowedConceptFamily": Metadata.get("concept_family") or ConceptSpec.get("conceptFamily") or "CONCEPT_DRILL",
                        "conceptName": ConceptSpec["title"],
                        "competitionSectionKey": SectionKey,
                        "competitionSectionNumber": DisplayNumber,
                        "competitionSectionTitle": SectionTitle,
                        "competitionSectionDisplayTitle": SectionTitle,
                        "competitionSectionLocked": True,
                        "section_number": DisplayNumber,
                        "section_title": SectionTitle,
                    })
                    QuestionCopy = dict(Question)
                    QuestionCopy["metadata"] = Metadata
                    SectionQuestions.append(QuestionCopy)
                    ConceptCoverage[ConceptSpec["title"]] += 1
                    if ConceptSpec["title"] not in ConceptCoverageOrder:
                        ConceptCoverageOrder.append(ConceptSpec["title"])
                    AcceptedForConcept += 1
                    if AcceptedForConcept >= RequiredForConcept:
                        break
                Attempts += 1

            if AcceptedForConcept < RequiredForConcept:
                api_error(
                    400,
                    "PM_COMPETITION_SECTION_GENERATION_INCOMPLETE",
                    f"Could not generate the required {RequiredForConcept} fresh questions for "
                    f"'{ConceptSpec['title']}' in {SectionTitle}.",
                    {"sectionKey": SectionKey, "concept": ConceptSpec["title"], "required": RequiredForConcept, "generated": AcceptedForConcept},
                )

        if len(SectionQuestions) < RequiredCount:
            api_error(
                400,
                "PM_COMPETITION_SECTION_GENERATION_INCOMPLETE",
                f"Could not generate the required {RequiredCount} questions for {SectionTitle}.",
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
        "competitionStructure": "PM_L2_3_SECTION_COMPETITION_MOCK_SECTION_LOCKED",
        "sectionCount": len(SectionCoverage),
        "sections": SectionCoverage,
        "generationErrors": [],
    }
    return Selected, CoveragePayload


def PmCompetitionLevelConfig(LevelRecord: Level) -> dict[str, Any]:
    LevelCode = str(getattr(LevelRecord, "level_code", "") or "")
    Config = PM_COMPETITION_LEVEL_REGISTRY.get(LevelCode)
    if Config is None:
        api_error(
            400,
            "PM_COMPETITION_LEVEL_NOT_CONFIGURED",
            f"No competition mock section structure has been defined yet for PM level '{LevelCode}'. "
            "PM competition mocks are designed level by level -- add this level's own sections and "
            "concept pools to PM_COMPETITION_LEVEL_REGISTRY before generating mocks for it.",
            {"levelCode": LevelCode, "configuredLevels": sorted(PM_COMPETITION_LEVEL_REGISTRY.keys())},
        )
    return Config


def _ordered_concept_schedule(concept_pool: list[dict[str, Any]], required_count: int) -> list[dict[str, Any]]:
    """Evenly distribute required_count questions across every concept-pool
    entry (base + remainder-to-the-first-few), so a section never skews
    toward only one or two of its many taught patterns. PM's own copy of
    the same "spread a count across a list" idea IM/MM's competition
    generator uses -- deliberately not imported from that file, since it's
    trivial to author independently and doing so keeps PM's mock generation
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


def _build_pm_config(concept_spec: dict[str, Any], question_count: int, seed: str) -> PMConfig:
    return PMConfig(
        module_code="PM",
        level_code="PM-L1",
        lesson_number=0,
        dps_number=0,
        question_count=question_count,
        concept_family=concept_spec["conceptFamily"],
        operation_focus=concept_spec["operationFocus"],
        abacus_rule=concept_spec.get("abacusRule"),
        target_numbers=list(concept_spec.get("targetNumbers") or []),
        place_value="MIXED",
        digit_pattern=concept_spec.get("digitPattern", "1D"),
        allow_negative_operands=True,
        allow_negative_answer=False,
        seed=seed,
        lesson_title="PM Competition Mock",
        dps_title=str(concept_spec["title"]),
        generation_template=concept_spec.get("generationTemplate", "DIRECT"),
        revision_templates=tuple(concept_spec.get("revisionTemplates") or ()),
    )


def CollectPmCompetitionSectionLockedQuestions(
    LevelRecord: Level,
    TargetQuestionCount: int,
    SectionCountsOverride: dict[str, int] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """PM's counterpart to _CollectMmCompetitionSectionLockedQuestions /
    _CollectImCompetitionSectionLockedQuestions. Simpler by design -- PM has
    no challenge-lesson escalation, freshness-window cross-mock dedup, or
    special-cased question types (BODMAS/profit-loss/etc.); it just needs
    every addition/subtraction pattern represented, split evenly within each
    section, with no exact-duplicate operand rows inside the same paper.
    """
    from app.services.competition_mock_generation_service import _RedistributeSectionCounts, _DenseSectionNumbering  # noqa: PLC0415 -- generic shared utility only, see module docstring

    LevelConfig = PmCompetitionLevelConfig(LevelRecord)
    SectionDefinitions = LevelConfig["sectionDefinitions"]
    SectionConceptPools = LevelConfig["sectionConceptPools"]

    SectionCounts = _RedistributeSectionCounts(TargetQuestionCount, SectionDefinitions, SectionCountsOverride, PM_DEFAULT_COMPETITION_MOCK_QUESTION_COUNT)
    DenseNumbers = _DenseSectionNumbering(SectionDefinitions, SectionCounts)

    Selected: list[dict[str, Any]] = []
    SectionCoverage: list[dict[str, Any]] = []
    UsedSignatures: set[tuple[int, ...]] = set()

    for SectionDefinition in SectionDefinitions:
        SectionKey = SectionDefinition["key"]
        RequiredCount = int(SectionCounts.get(SectionKey, 0) or 0)
        if RequiredCount <= 0:
            continue
        DisplayNumber = DenseNumbers[SectionKey]
        SectionTitle = SectionDefinition["title"]
        ConceptPool = SectionConceptPools.get(SectionKey, [])
        if not ConceptPool:
            api_error(400, "PM_COMPETITION_SECTION_EMPTY", f"{SectionTitle} has no concept pool configured.")

        Schedule = _ordered_concept_schedule(ConceptPool, RequiredCount)
        # See the matching comment in CollectPmL2CompetitionSectionLockedQuestions:
        # bucket by pool-entry identity (id), not by title text, so two
        # distinct entries that happen to share a display title never get
        # their required counts merged and double-attempted.
        CountsByConcept: dict[int, int] = defaultdict(int)
        for Spec in Schedule:
            CountsByConcept[id(Spec)] += 1

        SectionQuestions: list[dict[str, Any]] = []
        ConceptCoverage: dict[str, int] = defaultdict(int)
        ConceptCoverageOrder: list[str] = []

        for ConceptSpec in ConceptPool:
            RequiredForConcept = CountsByConcept.get(id(ConceptSpec), 0)
            if RequiredForConcept <= 0:
                continue
            Attempts = 0
            AcceptedForConcept = 0
            while AcceptedForConcept < RequiredForConcept and Attempts < max(RequiredForConcept * 4, 20):
                Seed = f"COMPETITION-PM-{SectionKey}-{ConceptSpec['title']}-{uuid4().hex}-{Attempts}"
                Config = _build_pm_config(ConceptSpec, RequiredForConcept - AcceptedForConcept, Seed)
                Batch = generate_pm_question_set(Config)
                for Question in Batch:
                    Signature = tuple(Question["operands"])
                    if Signature in UsedSignatures:
                        continue
                    UsedSignatures.add(Signature)
                    Metadata = dict(Question.get("metadata") or {})
                    Metadata.update({
                        "competitionConceptKey": ConceptSpec["title"],
                        "competitionConceptName": ConceptSpec["title"],
                        "competitionAllowedConceptFamily": ConceptSpec["conceptFamily"],
                        "conceptName": ConceptSpec["title"],
                        "competitionSectionKey": SectionKey,
                        "competitionSectionNumber": DisplayNumber,
                        "competitionSectionTitle": SectionTitle,
                        "competitionSectionDisplayTitle": SectionTitle,
                        "competitionSectionLocked": True,
                        "section_number": DisplayNumber,
                        "section_title": SectionTitle,
                    })
                    QuestionCopy = dict(Question)
                    QuestionCopy["metadata"] = Metadata
                    SectionQuestions.append(QuestionCopy)
                    ConceptCoverage[ConceptSpec["title"]] += 1
                    if ConceptSpec["title"] not in ConceptCoverageOrder:
                        ConceptCoverageOrder.append(ConceptSpec["title"])
                    AcceptedForConcept += 1
                    if AcceptedForConcept >= RequiredForConcept:
                        break
                Attempts += 1

            if AcceptedForConcept < RequiredForConcept:
                api_error(
                    400,
                    "PM_COMPETITION_SECTION_GENERATION_INCOMPLETE",
                    f"Could not generate the required {RequiredForConcept} fresh questions for "
                    f"'{ConceptSpec['title']}' in {SectionTitle}.",
                    {"sectionKey": SectionKey, "concept": ConceptSpec["title"], "required": RequiredForConcept, "generated": AcceptedForConcept},
                )

        if len(SectionQuestions) < RequiredCount:
            api_error(
                400,
                "PM_COMPETITION_SECTION_GENERATION_INCOMPLETE",
                f"Could not generate the required {RequiredCount} questions for {SectionTitle}.",
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
        "competitionStructure": "PM_3_SECTION_COMPETITION_MOCK_SECTION_LOCKED",
        "sectionCount": len(SectionCoverage),
        "sections": SectionCoverage,
        "generationErrors": [],
    }
    return Selected, CoveragePayload
