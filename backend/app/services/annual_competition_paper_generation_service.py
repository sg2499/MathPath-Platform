"""Annual Competition paper generation -- 2026-09 build (Shailesh-approved
"build separately" architecture: "we should not remove or edit anything but
build the annual competition engine separately so that none of the flows
get affected and work as expected").

This module is intentionally NEW and ADDITIVE. It does not import, call, or
modify anything in competition_mock_generation_service.py's IM/MM registries
or pm_competition_mock_generation_service.py's / ylm_competition_mock_
generation_service.py's per-level registries or collector functions -- those
are read by the practice "Competition Mock" feature AND (per the 2026-07-22
design decision documented in assessment_blueprint_service.py) by Term
Assessments, so editing them ripples into both. See
annual_competition_paper_registry.py's module docstring for the full
rationale and the registry data this service walks.

What this module DOES reuse -- deliberately, because these are either (a)
generic, curriculum-independent utilities with no registry content of their
own, or (b) each module's own public, already-shipped, unmodified low-level
question generator (the same engine every other feature already calls):
  - PlainNumberString (app.question_engine.number_format) -- pure display
    formatting, no curriculum content.
  - CompetitionMockExamPayload, _StoreQuestionOptions,
    _ApplyMmCompetitionOptionQualityGuards, _QuestionSignature (all from
    competition_mock_generation_service.py) -- pure formatting/dedup/
    persistence helpers, not registry-coupled; reading them creates no
    coupling to that file's IM/MM registry dicts or collector logic.
  - generate_ylm_question_set / generate_pm_question_set /
    generate_pm_l2_question_set / generate_pm_l3_question_set +
    generate_multiply_table_question/generate_divide_table_question (pm_l3)
    / generate_pm_l4_question_set + the pm_l4 multiply/divide equivalents /
    GenerateImQuestionSet / GenerateMmQuestionSet -- every module's own
    public generation entrypoint, called directly with GeneratorConfig
    fields set explicitly (bypassing the shared collector's title-regex
    parsing helpers entirely, which is what lets this module avoid ever
    touching the shared registry files).

Why an Annual Competition paper is never generated via the shared
GenerateCompetitionMockDraft: that function hard-caps a mock at 100
questions ("100, not 300: ... a mock's total marks are capped at 100...
This is a hard server-side floor"), but MM-L1/MM-L2's official papers need
450 questions -- and even where a level's count would fit under 100, using
that shared function would still route through its section-balancing,
freshness-window, and IM/MM/PM-registry lookups, none of which this level's
Annual Competition content is described by. This module writes directly
into the existing CompetitionMockExam/CompetitionMockQuestion tables
instead (the same tables that feature already uses -- CompetitionEventLevelPaper.
mock_exam_id already expects a CompetitionMockExam row, so no new table is
needed for the paper's content), via its own persistence path.
"""
from __future__ import annotations

import json
import random
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import CompetitionMockExam, CompetitionMockQuestion, CompetitionMockQuestionOption, Level, Module, User
from app.question_engine.number_format import PlainNumberString

from app.question_engine.ylm import YLMConfig, generate_ylm_question_set
from app.question_engine.ylm.config import enrich_config_with_lesson_rule

from app.question_engine.pm import PMConfig, generate_pm_question_set
from app.question_engine.pm_l2 import PML2Config, generate_pm_l2_question_set
from app.question_engine.pm_l3 import PML3Config, generate_pm_l3_question_set
from app.question_engine.pm_l3.multiply import PML3MultiplyConfig, generate_multiply_table_question as generate_pm_l3_multiply_question
from app.question_engine.pm_l4 import PML4Config, generate_pm_l4_question_set
from app.question_engine.pm_l4.multiply import PML4MultiplyConfig, generate_multiply_table_question as generate_pm_l4_multiply_question
from app.question_engine.pm_l4.divide import PML4DivideConfig, generate_divide_table_question as generate_pm_l4_divide_question

from app.question_engine.im import IMConfig, GenerateImQuestionSet, OperationFocusForConcept as ImOperationFocusForConcept
from app.question_engine.mm import MMConfig, GenerateMmQuestionSet, OperationFocusForConcept as MmOperationFocusForConcept

# Generic, non-registry-coupled reuse -- see module docstring.
from app.services.competition_mock_generation_service import (
    CompetitionMockExamPayload,
    _StoreQuestionOptions,
    _ApplyMmCompetitionOptionQualityGuards,
    _QuestionSignature,
)

from app.services.annual_competition_paper_registry import (
    ANNUAL_COMPETITION_LEVEL_REGISTRY,
    ANNUAL_COMPETITION_MARKS_PER_QUESTION,
    GetAnnualCompetitionLevelConfig,
)
from app.services.annual_competition_question_rules import (
    GenerateAnnualRuleQuestion,
    MixSchedule,
    StartsNegativeOrDipsBelowZero,
)

# 2026-09-15 (Shailesh): "we need to make sure this never happens and always
# gets assigned flawlessly and seamlessly whether we assign 5 or 25 sheets".
# Was 10 -- too thin for a single-concept pool drawing deep into a small
# achievable domain. IM-L3/IM-L4's "Squares" sections (_IM_L3_SQUARES_POOL/
# _IM_L4_SQUARES_POOL, both single-concept, no fallback-to-another-concept
# possible) need 50 unique draws from GenerateSquares's 89-value domain
# (Base = randint(11, 99) in app/question_engine/im/operands.py). At the
# tightest slot (49 of 89 values already used), a single random draw has
# only a 40/89 (~45%) chance of landing on an unused value, so a run of 10
# straight misses -- ~0.17% per slot -- was common enough across a full
# batch of papers to surface as the intermittent
# ANNUAL_COMPETITION_SECTION_GENERATION_INCOMPLETE errors reported live.
# At 50 retries the same worst-case slot's failure probability is
# ~1.15e-13 per slot -- effectively impossible even summed across every
# slot of a full 25-paper batch. Deliberately raised for every section
# (not just Squares): the extra retries are free when a slot succeeds on
# its first or second attempt (the overwhelming majority of slots, which
# have much larger achievable domains), so this only spends extra work on
# the rare slots that actually need it.
ANNUAL_COMPETITION_SLOT_MAX_RETRIES = 50
# The question rules a paper was generated under, stamped into every paper's
# generation_config_json as "questionRulesVersion". A stored paper without
# this exact value predates today's rules -- that is how the backfill
# (scripts/backfill_annual_competition_question_rules.py) tells an old paper
# from a current one without re-checking every sum. Move it forward whenever
# the rules a paper must follow change.
ANNUAL_COMPETITION_QUESTION_RULES_VERSION = "2026-10-07"
# 2026-10-07: a section marked strictQuotas never lets one pattern borrow
# another pattern's questions (see the collector below), so a slot's own
# pattern gets a far deeper retry budget instead. The extra retries are
# only ever spent by a slot that is still missing -- in the proof run of
# 300 papers per level no slot came anywhere near it.
ANNUAL_COMPETITION_STRICT_SLOT_MAX_RETRIES = 600
# Registry keys that steer the Annual Competition collector itself and are
# never handed to a module engine as generator configuration.
_ANNUAL_COLLECTOR_ONLY_KEYS = {"quota", "mixKey", "conceptTitle", "annualNeverBelowZero"}
DEFAULT_ANNUAL_COMPETITION_DIFFICULTY_BAND = "ANNUAL_COMPETITION"


# ---------------------------------------------------------------------------
# 2026-10-06 (Shailesh): "for the multiplication concepts we need to remove
# sums like 23 x 1, 2 x 1, 23 x 10, 23 x 100 and so on these make it very easy
# for the students to just type the answer without even solving it which
# defeats the purpose of competition completely. same goes for division ...
# max one or two questions like this is okay", then: "at most 2 is okay but
# never back to back".
#
# An ANNUAL-COMPETITION-ONLY rule (official and practice papers alike, since
# both come through _CollectAnnualCompetitionQuestions below). It lives here,
# in this module's own accept/reject step, and not in the shared module
# generators, because those also feed practice sheets, mocks and term
# assessments, where a "table of 1" sheet is a deliberate teaching step.
#
# Two classes of a plain two-number multiplication or division:
#   NEVER -- the answer can be typed with no working at all:
#            a factor of 1 (or 0), a factor that is a power of ten (10, 100,
#            1000, 0.1 ...), a divisor of 1 or a power of ten, a number
#            divided by itself, or a quotient that is exactly a power of ten
#            (540 / 54, 800 / 8, 8100 / 81).
#   ROUND -- one step of working plus zeros: 300 / 5, 350 / 5, 400 x 3,
#            23 x 20, 4800 / 20. At most
#            ANNUAL_COMPETITION_ROUND_SUMS_PER_SECTION_MAX per section, and
#            never two in consecutive questions.
# A number that merely ends in zero (930 x 64, 9440 / 8) still needs real
# working and is not classed at all.
#
# Before this rule every PM-L3 paper carried exactly ten "NN x 1" sums (one
# of that section's ten pool entries is the curriculum's own table-of-1
# sheet), PM-L4 one to six sums such as 800 / 8 or 300 / 5, and IM-L2/L3/L4
# one to seven such as 540 / 54 -- measured over 100 generated papers per
# level and confirmed on real completed practice papers.
# ---------------------------------------------------------------------------
ANNUAL_COMPETITION_ROUND_SUMS_PER_SECTION_MAX = 2
ANNUAL_COMPETITION_MULTIPLY_OPERATOR = "×"
ANNUAL_COMPETITION_DIVIDE_OPERATOR = "÷"


def _AsDecimal(Value: Any) -> Decimal | None:
    try:
        Number = Decimal(str(Value).strip())
    except (InvalidOperation, ValueError, TypeError):
        return None
    return Number if Number.is_finite() else None


def _SignificantDigitCount(Number: Decimal) -> int:
    """300 -> 1, 170 -> 2, 0.012 -> 2, 23 -> 2."""
    if Number == 0:
        return 0
    return len(abs(Number).normalize().as_tuple().digits)


def _IsPowerOfTen(Number: Decimal) -> bool:
    """10, 100, 1000, 0.1, 0.01 ... -- never 1 itself (handled separately)."""
    Magnitude = abs(Number)
    if Magnitude == 0 or Magnitude == 1:
        return False
    return Magnitude.normalize().as_tuple().digits == (1,)


def _EndsInZero(Number: Decimal) -> bool:
    return Number == Number.to_integral_value() and Number != 0 and Number % 10 == 0


def ClassifyAnnualMultiplyDivideSum(Operands: Any, Operators: Any) -> str | None:
    """"NEVER", "ROUND" or None for one question's operands/operators.

    Only a plain two-number multiplication or division is ever classed --
    every other shape (stacked add/less, percentages whose operator is
    "x%", squares, roots, boxes) returns None and is untouched by the rule.
    """
    if not isinstance(Operands, (list, tuple)) or len(Operands) != 2:
        return None
    OperatorList = [str(Item) for Item in (Operators or []) if str(Item or "").strip()]
    if len(OperatorList) != 1:
        return None
    Operator = OperatorList[0].strip()
    if Operator not in (ANNUAL_COMPETITION_MULTIPLY_OPERATOR, ANNUAL_COMPETITION_DIVIDE_OPERATOR):
        return None
    First, Second = _AsDecimal(Operands[0]), _AsDecimal(Operands[1])
    if First is None or Second is None:
        return None

    if Operator == ANNUAL_COMPETITION_MULTIPLY_OPERATOR:
        if First in (0, 1) or Second in (0, 1) or _IsPowerOfTen(First) or _IsPowerOfTen(Second):
            return "NEVER"
        FirstDigits, SecondDigits = _SignificantDigitCount(First), _SignificantDigitCount(Second)
        if FirstDigits == 1 and SecondDigits == 1:
            return "ROUND"  # 30 x 4, 200 x 3
        if (FirstDigits == 1 and abs(First) >= 10) or (SecondDigits == 1 and abs(Second) >= 10):
            return "ROUND"  # 23 x 20, 345 x 200
        return None

    # Division.
    if Second == 0:
        return None
    if First == 0 or Second == 1 or _IsPowerOfTen(Second) or First == Second:
        return "NEVER"
    Quotient = First / Second
    IsExact = Quotient * Second == First
    if IsExact and (Quotient == 1 or _IsPowerOfTen(Quotient)):
        return "NEVER"  # 540 / 54, 800 / 8
    DivisorDigits = _SignificantDigitCount(Second)
    if _SignificantDigitCount(First) == 1 and DivisorDigits == 1:
        return "ROUND"  # 300 / 5, 900 / 6, 800 / 2 -- one digit by one digit, plus zeros
    if IsExact and _SignificantDigitCount(Quotient) == 1 and DivisorDigits == 1 and _EndsInZero(First):
        return "ROUND"  # 350 / 5, 4200 / 6 -- one table fact plus zeros
    if DivisorDigits == 1 and abs(Second) >= 10 and _EndsInZero(First):
        return "ROUND"  # 4800 / 20 -- the zeros cancel
    return None


def AnnualMultiplyDivideRuleFaults(Sums: list[tuple[Any, Any]]) -> dict[str, int]:
    """How one section's questions, in question order, stand against the rule.

    Sums is [(operands, operators), ...]. Returns never / round / adjacent
    counts plus "faults": the number of ways the section breaks the rule
    (0 means it already complies). Used by the backfill to decide whether a
    stored section needs rebuilding, and by the tests.
    """
    Never = Round = Adjacent = 0
    PreviousWasRound = False
    for Operands, Operators in Sums:
        Kind = ClassifyAnnualMultiplyDivideSum(Operands, Operators)
        if Kind == "NEVER":
            Never += 1
        if Kind == "ROUND":
            Round += 1
            if PreviousWasRound:
                Adjacent += 1
        PreviousWasRound = Kind == "ROUND"
    Faults = Never + max(0, Round - ANNUAL_COMPETITION_ROUND_SUMS_PER_SECTION_MAX) + Adjacent
    return {"never": Never, "round": Round, "adjacent": Adjacent, "faults": Faults}


_MULTIPLY_DIVIDE_GENERATOR_FAMILIES = {"PM_L3_MULTIPLY", "PM_L4_MULTIPLY", "PM_L4_DIVIDE"}
_MULTIPLY_DIVIDE_CONCEPT_FAMILIES = {
    "WHOLE_NUMBER_MULTIPLICATION", "DECIMAL_MULTIPLICATION", "WHOLE_NUMBER_DIVISION", "DECIMAL_DIVISION",
}


def IsAnnualMultiplyDivideSection(ConceptPool: list[dict[str, Any]]) -> bool:
    """True when every concept in a section's pool is a plain multiplication
    or division -- decided from the registry's own generator/concept family
    tags, never from the section's display title."""
    if not ConceptPool:
        return False
    return all(
        str(Spec.get("generatorFamily") or "") in _MULTIPLY_DIVIDE_GENERATOR_FAMILIES
        or str(Spec.get("conceptFamily") or "") in _MULTIPLY_DIVIDE_CONCEPT_FAMILIES
        for Spec in ConceptPool
    )


# ---------------------------------------------------------------------------
# Per-slot ordered concept schedule -- identical intent/shape to
# competition_mock_generation_service.py's own
# _ImCompetitionOrderedConceptSchedule (base + remainder equal split, pool
# order preserved), reimplemented here rather than imported so this module
# never needs to import a helper by that file's internal (underscore-
# prefixed, private) name for correctness-critical scheduling logic --
# the four lines of pure math are simple enough that duplicating them is
# safer than an unstated dependency on another file's private symbol.
# ---------------------------------------------------------------------------
def _OrderedConceptSchedule(ConceptPool: list[dict[str, Any]], RequiredCount: int) -> list[dict[str, Any]]:
    if not ConceptPool or RequiredCount <= 0:
        return []
    # 2026-10-07: a pool whose every entry carries a "quota" gets exactly
    # those counts ("keep square root & cube root 25, 25 each") instead of
    # the equal split. The quotas must add up to the section's question
    # count -- anything else is a registry mistake and stops generation
    # rather than quietly producing a short or lopsided section.
    if all("quota" in Spec for Spec in ConceptPool):
        if sum(int(Spec["quota"]) for Spec in ConceptPool) != RequiredCount:
            api_error(
                500,
                "ANNUAL_COMPETITION_QUOTA_MISMATCH",
                f"A section's pattern quotas add up to {sum(int(Spec['quota']) for Spec in ConceptPool)}, not its {RequiredCount} questions. This is a registry bug, not a data issue.",
            )
        QuotaSchedule: list[dict[str, Any]] = []
        for Spec in ConceptPool:
            QuotaSchedule.extend([Spec] * int(Spec["quota"]))
        return QuotaSchedule
    Base = RequiredCount // len(ConceptPool)
    Remainder = RequiredCount % len(ConceptPool)
    Schedule: list[dict[str, Any]] = []
    for Index, Spec in enumerate(ConceptPool):
        Count = Base + (1 if Index < Remainder else 0)
        Schedule.extend([Spec] * Count)
    return Schedule


def _ExtraFlags(Spec: dict[str, Any], Exclude: set[str]) -> dict[str, Any]:
    return {Key: Value for Key, Value in Spec.items() if Key not in Exclude}


# ---------------------------------------------------------------------------
# Per-family adapters. Each returns one question dict shaped like every
# other engine's own single-question output (display_type, operands,
# operators, correct_answer, options, metadata, optionally question_text) --
# or None if that engine could not produce a question this attempt.
# ---------------------------------------------------------------------------
_YLM_EXCLUDE = {"generatorFamily", "title", "lessonNumber"}


def _GenerateYlmQuestion(Spec: dict[str, Any], Seed: str) -> dict[str, Any] | None:
    Config = YLMConfig(
        module_code="YLM", level_code="YLM-L1",
        lesson_number=int(Spec["lessonNumber"]), dps_number=0,
        question_count=1, seed=Seed,
    )
    # 2026-09-17 (Shailesh, Bloomers/Beginners digit-mix fix): "the pattern
    # should be a mix of single, double and single-double mixed sums but
    # direct add/less only, the concept remains the same." YLM_LESSON_RULES
    # only has two DIRECT_ADD_LESS lessons (1 = pure "1D", 2 = mixed
    # "1D_AND_2D") -- there is no lesson anywhere in that shared, DPS-facing
    # table offering a pure double-digit ("2D") DIRECT_ADD_LESS tier, and
    # this module must never edit YLM_LESSON_RULES/YLM_DPS_DIGIT_PATTERN_
    # OVERRIDES itself to add one (that table also drives DPS worksheet
    # generation -- see annual_competition_paper_registry.py's own module
    # docstring on why this file's registry is built deliberately separate
    # from every shared, DPS/Assessment-facing table). Setting the new,
    # opt-in YLMConfig.digit_pattern_override here -- rather than assigning
    # Config.digit_pattern directly -- matters because generate_ylm_question_
    # set() re-runs enrich_config_with_lesson_rule() internally on every
    # call, which would silently overwrite a direct digit_pattern assignment
    # right back to the chosen lesson's own default; digit_pattern_override
    # is a separate field enrich_config_with_lesson_rule() re-applies after
    # its own lookup on every one of those calls, so it survives. Still
    # direct add/less, still the same operation focus/generation template
    # (inherited from the chosen base lesson) -- only the operand width
    # changes (see operands.py's _direct_bases(), which is driven by
    # digit_pattern alone).
    DigitPatternOverride = Spec.get("digitPatternOverride")
    if DigitPatternOverride:
        Config.digit_pattern_override = str(DigitPatternOverride)
    Config = enrich_config_with_lesson_rule(Config)
    Questions = generate_ylm_question_set(Config)
    return Questions[0] if Questions else None


_PM_ADD_LESS_EXCLUDE = {"generatorFamily", "title", "conceptFamily", "operationFocus", "abacusRule", "targetNumbers", "digitPattern", "generationTemplate", "revisionTemplates", "digitPatternSecondHalf", "rowsSecondHalf", "rows"}


def _GeneratePmL1Question(Spec: dict[str, Any], Seed: str) -> dict[str, Any] | None:
    Config = PMConfig(
        module_code="PM", level_code="PM-L1", lesson_number=0, dps_number=0,
        question_count=1, rows=3,
        concept_family=str(Spec["conceptFamily"]), operation_focus=str(Spec.get("operationFocus") or "ADD_LESS"),
        abacus_rule=Spec.get("abacusRule"), target_numbers=list(Spec.get("targetNumbers") or []),
        digit_pattern=str(Spec.get("digitPattern") or "1D"), seed=Seed,
        generation_template=str(Spec.get("generationTemplate") or "DIRECT"),
        revision_templates=tuple(Spec.get("revisionTemplates") or ()),
    )
    Questions = generate_pm_question_set(Config)
    return Questions[0] if Questions else None


def _GeneratePmL2Question(Spec: dict[str, Any], Seed: str) -> dict[str, Any] | None:
    Config = PML2Config(
        module_code="PM", level_code="PM-L2", lesson_number=0, dps_number=0,
        question_count=1, rows=3,
        concept_family=str(Spec["conceptFamily"]), operation_focus=str(Spec.get("operationFocus") or "ADD_LESS"),
        abacus_rule=Spec.get("abacusRule"), target_numbers=list(Spec.get("targetNumbers") or []),
        digit_pattern=str(Spec.get("digitPattern") or "1D"), seed=Seed,
        generation_template=str(Spec.get("generationTemplate") or "DIRECT"),
        revision_templates=tuple(Spec.get("revisionTemplates") or ()),
    )
    Questions = generate_pm_l2_question_set(Config)
    return Questions[0] if Questions else None


def _GeneratePmL3AddLessQuestion(Spec: dict[str, Any], Seed: str) -> dict[str, Any] | None:
    Config = PML3Config(
        module_code="PM", level_code="PM-L3", lesson_number=0, dps_number=0,
        question_count=1, rows=int(Spec.get("rows") or 4),
        concept_family=str(Spec.get("conceptFamily") or "DIRECT_ADD_LESS"), operation_focus=str(Spec.get("operationFocus") or "ADD_LESS"),
        target_numbers=list(Spec.get("targetNumbers") or []), digit_pattern=str(Spec.get("digitPattern") or "2D_FULL"),
        seed=Seed, generation_template=str(Spec.get("generationTemplate") or "DIRECT"),
        revision_templates=tuple(Spec.get("revisionTemplates") or ()),
        digit_pattern_second_half=Spec.get("digitPatternSecondHalf"), rows_second_half=Spec.get("rowsSecondHalf"),
    )
    Questions = generate_pm_l3_question_set(Config)
    return Questions[0] if Questions else None


def _GeneratePmL3MultiplyQuestion(Spec: dict[str, Any], Seed: str) -> dict[str, Any] | None:
    Config = PML3MultiplyConfig(
        module_code="PM", level_code="PM-L3", lesson_number=0, dps_number=0, seed=Seed,
        number_min=int(Spec.get("numberMin") or 11), number_max=int(Spec.get("numberMax") or 99),
        multiplier_min=int(Spec.get("multiplierMin") or 1), multiplier_max=int(Spec.get("multiplierMax") or 9),
        practice_mode=Spec.get("practiceMode"),
    )
    Rng = random.Random(Seed)
    return generate_pm_l3_multiply_question(Config, Rng)


def _GeneratePmL4AddLessQuestion(Spec: dict[str, Any], Seed: str) -> dict[str, Any] | None:
    Config = PML4Config(
        module_code="PM", level_code="PM-L4", lesson_number=0, dps_number=0,
        question_count=1, rows=int(Spec.get("rows") or 4),
        concept_family=str(Spec.get("conceptFamily") or "DIRECT_ADD_LESS"), operation_focus=str(Spec.get("operationFocus") or "ADD_LESS"),
        target_numbers=list(Spec.get("targetNumbers") or []), digit_pattern=str(Spec.get("digitPattern") or "2D_FULL"),
        seed=Seed, generation_template=str(Spec.get("generationTemplate") or "DIRECT"),
        revision_templates=tuple(Spec.get("revisionTemplates") or ()),
        digit_pattern_second_half=Spec.get("digitPatternSecondHalf"), rows_second_half=Spec.get("rowsSecondHalf"),
    )
    Questions = generate_pm_l4_question_set(Config)
    return Questions[0] if Questions else None


def _GeneratePmL4MultiplyQuestion(Spec: dict[str, Any], Seed: str) -> dict[str, Any] | None:
    Config = PML4MultiplyConfig(
        module_code="PM", level_code="PM-L4", lesson_number=0, dps_number=0, seed=Seed,
        number_min=int(Spec.get("numberMin") or 11), number_max=int(Spec.get("numberMax") or 99),
        multiplier_min=int(Spec.get("multiplierMin") or 1), multiplier_max=int(Spec.get("multiplierMax") or 9),
        practice_mode=Spec.get("practiceMode"),
    )
    Rng = random.Random(Seed)
    return generate_pm_l4_multiply_question(Config, Rng)


def _GeneratePmL4DivideQuestion(Spec: dict[str, Any], Seed: str) -> dict[str, Any] | None:
    Config = PML4DivideConfig(
        module_code="PM", level_code="PM-L4", lesson_number=0, dps_number=0,
        digit_width=int(Spec.get("digitWidth") or 3), seed=Seed,
        divisor_min=int(Spec.get("divisorMin") or 2), divisor_max=int(Spec.get("divisorMax") or 9),
        dividend_min=int(Spec.get("dividendMin") or 100), dividend_max=int(Spec.get("dividendMax") or 999),
    )
    Rng = random.Random(Seed)
    return generate_pm_l4_divide_question(Config, Rng)


_IM_EXCLUDE = {"generatorFamily", "title", "conceptFamily", "operationFocus"} | _ANNUAL_COLLECTOR_ONLY_KEYS


def _GenerateImQuestion(Spec: dict[str, Any], Seed: str, LevelCode: str) -> dict[str, Any] | None:
    ConceptFamily = str(Spec["conceptFamily"])
    Config = IMConfig(
        ModuleCode="IM", LevelCode=LevelCode, LessonNumber=1, DpsNumber=1,
        DpsTitle=str(Spec["title"]), LessonTitle="Annual Competition",
        QuestionCount=1, Seed=Seed, ConceptFamily=ConceptFamily,
        OperationFocus=str(Spec.get("operationFocus") or ImOperationFocusForConcept(ConceptFamily)),
        DigitPattern="ANNUAL_COMPETITION", Difficulty="INTERMEDIATE",
        GeneratorConfig={"forceSingleSection": True, **_ExtraFlags(Spec, _IM_EXCLUDE)},
    )
    Questions = GenerateImQuestionSet(Config)
    return Questions[0] if Questions else None


_MM_EXCLUDE = {"generatorFamily", "title", "conceptFamily", "operationFocus", "mmStagingQuestionNumber", "mmLessonNumber"} | _ANNUAL_COLLECTOR_ONLY_KEYS


def _GenerateMmQuestion(Spec: dict[str, Any], Seed: str, LevelCode: str) -> dict[str, Any] | None:
    ConceptFamily = str(Spec["conceptFamily"])
    # A handful of MM concepts (currently: the "4D 4R, borrowing, positive
    # and negative final answers" Add/Less family) are internally staged --
    # MM's own DifficultyStage/_AddLessRowCount machinery derives row count
    # and digit magnitude from *which* question number in a batch this is
    # (see mm/operands.py), not from any GeneratorConfig field. Requesting
    # QuestionCount = mmStagingQuestionNumber and taking the LAST generated
    # question reliably lands on that exact stage (verified empirically,
    # 2026-09-09 build session: QuestionCount=9 + take-last gives row_count
    # 4 with ~4-digit operands across 200 sampled lessons/seeds, with a
    # genuine ~50/50 positive/negative split). A plain QuestionCount=1 call
    # would instead always land on SectionQuestionNumber=1 (the WARM_UP
    # stage), which is not what the gist's "4D 4R" section describes.
    StagingQuestionNumber = max(1, int(Spec.get("mmStagingQuestionNumber") or 1))
    # LessonNumber only feeds MM's internal difficulty-band scaling (see
    # _LessonBand/_ScaleRangeByLesson in mm/operands.py) -- it has no FK/DB
    # meaning here (this generator never looks up a real Lesson row), so any
    # value in the level's own natural lesson range is safe. Bands 1-2
    # (lesson_number <= 10) are what keep the 4D-4R staging trick's row
    # count exactly 4 at the CHALLENGE stage (band > 2 pushes it to 5 or 6
    # rows) -- see the module-level verification note above.
    LessonNumber = max(1, min(10, int(Spec.get("mmLessonNumber") or 5)))
    Config = MMConfig(
        ModuleCode="MM", LevelCode=LevelCode, LessonNumber=LessonNumber, DpsNumber=1,
        DpsTitle=str(Spec["title"]), LessonTitle="Annual Competition",
        QuestionCount=StagingQuestionNumber, Seed=Seed, ConceptFamily=ConceptFamily,
        OperationFocus=str(Spec.get("operationFocus") or MmOperationFocusForConcept(ConceptFamily)),
        DigitPattern="ANNUAL_COMPETITION", Difficulty="MASTER",
        GeneratorConfig={"forceSingleSection": True, **_ExtraFlags(Spec, _MM_EXCLUDE)},
    )
    Questions = GenerateMmQuestionSet(Config)
    if not Questions:
        return None
    Index = StagingQuestionNumber - 1 if len(Questions) >= StagingQuestionNumber else -1
    return _ApplyMmCompetitionOptionQualityGuards(Questions[Index])


def _GenerateOneAnnualQuestion(Spec: dict[str, Any], Seed: str, LevelCode: str) -> dict[str, Any] | None:
    Family = str(Spec.get("generatorFamily") or "")
    if Family == "YLM":
        return _GenerateYlmQuestion(Spec, Seed)
    if Family == "PM_L1":
        return _GeneratePmL1Question(Spec, Seed)
    if Family == "PM_L2":
        return _GeneratePmL2Question(Spec, Seed)
    if Family == "PM_L3_ADD_LESS":
        return _GeneratePmL3AddLessQuestion(Spec, Seed)
    if Family == "PM_L3_MULTIPLY":
        return _GeneratePmL3MultiplyQuestion(Spec, Seed)
    if Family == "PM_L4_ADD_LESS":
        return _GeneratePmL4AddLessQuestion(Spec, Seed)
    if Family == "PM_L4_MULTIPLY":
        return _GeneratePmL4MultiplyQuestion(Spec, Seed)
    if Family == "PM_L4_DIVIDE":
        return _GeneratePmL4DivideQuestion(Spec, Seed)
    if Family == "IM":
        return _GenerateImQuestion(Spec, Seed, LevelCode)
    if Family == "MM":
        return _GenerateMmQuestion(Spec, Seed, LevelCode)
    if Family == "ANNUAL_RULE":
        # 2026-10-07: the Annual Competition's own sum builders (see
        # annual_competition_question_rules.py).
        return GenerateAnnualRuleQuestion(Spec, Seed)
    raise ValueError(f"Annual Competition generator does not support generatorFamily: {Family!r}")


# ---------------------------------------------------------------------------
# Section collector: one question at a time per slot, in schedule order,
# with in-paper dedup + retry. Mirrors the proven pattern
# competition_mock_generation_service.py's own IM collector uses
# (_CollectImCompetitionSectionLockedQuestions) -- generate exactly one
# question per pre-assigned slot rather than pulling a multi-question batch
# per concept, so a duplicate-skip on one concept can never silently eat
# another concept's slot share.
# ---------------------------------------------------------------------------
def _CollectAnnualCompetitionQuestions(LevelCode: str, Sections: list[dict[str, Any]], SectionConceptPools: dict[str, list[dict[str, Any]]], PaperSeed: str) -> list[dict[str, Any]]:
    Selected: list[dict[str, Any]] = []
    UsedSignatures: set[str] = set()

    for Section in Sections:
        SectionKey = Section["key"]
        RequiredCount = int(Section["questionCount"])
        ConceptPool = SectionConceptPools.get(SectionKey) or []
        if not ConceptPool:
            api_error(
                500,
                "ANNUAL_COMPETITION_EMPTY_SECTION_POOL",
                f"No concept pool is configured for section '{SectionKey}' of {LevelCode}. This is a registry bug, not a data issue.",
            )
        Schedule = _OrderedConceptSchedule(ConceptPool, RequiredCount)
        # 2026-10-07 (Shailesh): "Mix the patterns don't keep single digit
        # sums together", "now it is multiply with 2 then 3 then 4 serially
        # change the order". A section marked mixMaxRun has its patterns
        # mixed through the paper, the order drawn from the paper's own
        # seed, with no pattern running longer than that many questions.
        MixMaxRun = int(Section.get("mixMaxRun") or 0)
        if MixMaxRun > 0:
            Schedule = MixSchedule(Schedule, random.Random(f"ANNUAL-MIX-{LevelCode}-{PaperSeed}-{SectionKey}"), MixMaxRun)
        # A strictQuotas section never fills one pattern's slot from another
        # pattern: each pattern gets exactly its own share or the paper
        # fails to generate.
        StrictQuotas = bool(Section.get("strictQuotas"))
        SlotMaxRetries = ANNUAL_COMPETITION_STRICT_SLOT_MAX_RETRIES if StrictQuotas else ANNUAL_COMPETITION_SLOT_MAX_RETRIES
        # Multiplication / division rule (see ClassifyAnnualMultiplyDivideSum):
        # counted per section, in question order.
        RoundSumsInSection = 0
        PreviousAcceptedWasRound = False

        for SlotIndex, ScheduledConceptSpec in enumerate(Schedule):
            Accepted: dict[str, Any] | None = None
            AcceptedConceptSpec: dict[str, Any] | None = None
            AcceptedKind: str | None = None
            # A handful of concept/digit-pattern combinations across the
            # underlying module engines turn out to have a very small (even
            # single-valued, i.e. fully deterministic) achievable output
            # space -- e.g. PM-L1's "Direct Add/Less (Round Hundreds)" at
            # 3D_HUNDREDS ADD_LESS focus produces the exact same operands
            # every single call, live-confirmed while building this module
            # (50/50 identical draws). No amount of retrying that one
            # concept can ever produce a second fresh question once its one
            # achievable value is used. Rather than hard-failing the whole
            # paper over one narrow concept -- which would make an
            # otherwise-generatable paper impossible whenever the equal-
            # split schedule happens to assign a low-diversity concept more
            # slots than it can uniquely fill -- this tries every OTHER
            # concept in the section's pool (starting from the next one, so
            # a run of low-diversity concepts doesn't all pile onto the
            # same neighbor) before giving up. The section's total question
            # count is what the client's spec is strict about; exactly
            # which pool concept fills a given slot beyond the intended
            # even split is not.
            PoolSize = len(ConceptPool)
            ScheduledPoolIndex = ConceptPool.index(ScheduledConceptSpec) if ScheduledConceptSpec in ConceptPool else 0
            for FallbackOffset in range(1 if StrictQuotas else PoolSize):
                ConceptSpec = ConceptPool[(ScheduledPoolIndex + FallbackOffset) % PoolSize]
                for RetryIndex in range(SlotMaxRetries):
                    Seed = f"ANNUAL-{LevelCode}-{PaperSeed}-{SectionKey}-SLOT{SlotIndex}-C{FallbackOffset}-{RetryIndex}"
                    Candidate = _GenerateOneAnnualQuestion(ConceptSpec, Seed, LevelCode)
                    if not Candidate:
                        continue
                    # 2026-10-07 (Shailesh, IM-1 and IM-2 visual): "Remove
                    # negative numbers in the start of the sum, no borrowing
                    # sums". A draw that starts negative, or whose running
                    # total drops below zero at any step, is another retry.
                    if ConceptSpec.get("annualNeverBelowZero") and StartsNegativeOrDipsBelowZero(
                        Candidate.get("operands"), Candidate.get("operators")
                    ):
                        continue
                    # A sum that needs no working is never accepted, and a
                    # round-number one only while this section still has
                    # room for it and the question before it was not one
                    # too. A rejected draw is simply another retry; a
                    # concept that can ONLY produce such sums (PM-L3's
                    # table-of-1 entry) runs out of retries and hands its
                    # slots to the next concept in the pool, exactly like a
                    # concept that has run out of fresh questions.
                    CandidateKind = ClassifyAnnualMultiplyDivideSum(Candidate.get("operands"), Candidate.get("operators"))
                    if CandidateKind == "NEVER":
                        continue
                    if CandidateKind == "ROUND" and (
                        RoundSumsInSection >= ANNUAL_COMPETITION_ROUND_SUMS_PER_SECTION_MAX or PreviousAcceptedWasRound
                    ):
                        continue
                    Signature = _QuestionSignature(Candidate)
                    if Signature in UsedSignatures:
                        continue
                    Accepted = Candidate
                    AcceptedConceptSpec = ConceptSpec
                    AcceptedKind = CandidateKind
                    UsedSignatures.add(Signature)
                    break
                if Accepted is not None:
                    break

            if Accepted is None or AcceptedConceptSpec is None:
                api_error(
                    400,
                    "ANNUAL_COMPETITION_SECTION_GENERATION_INCOMPLETE",
                    f"Could not generate a fresh question for {Section['title']} ({LevelCode}) from any concept in this "
                    f"section's pool without repeating a question already used in this paper.",
                    {"sectionKey": SectionKey, "slotIndex": SlotIndex, "required": RequiredCount},
                )

            PreviousAcceptedWasRound = AcceptedKind == "ROUND"
            if PreviousAcceptedWasRound:
                RoundSumsInSection += 1

            Metadata = Accepted.get("metadata") if isinstance(Accepted.get("metadata"), dict) else {}
            Metadata = dict(Metadata)
            Metadata.update({
                "annualCompetitionConceptTitle": AcceptedConceptSpec.get("conceptTitle") or AcceptedConceptSpec.get("title"),
                "annualCompetitionConceptFamily": AcceptedConceptSpec.get("conceptFamily"),
                "annualCompetitionGeneratorFamily": AcceptedConceptSpec.get("generatorFamily"),
                "annualCompetitionSectionKey": SectionKey,
                "annualCompetitionSectionNumber": Section["number"],
                "annualCompetitionSectionTitle": Section["title"],
                "annualCompetitionSectionMode": Section.get("mode"),
            })
            QuestionCopy = dict(Accepted)
            QuestionCopy["metadata"] = Metadata
            QuestionCopy["_annual_section_number"] = Section["number"]
            QuestionCopy["_annual_section_title"] = Section["title"]
            Selected.append(QuestionCopy)

    return Selected


def _StoreAnnualCompetitionQuestion(
    db: Session, *, MockExamId: str, QuestionNumber: int, Question: dict[str, Any], SectionTitleOverride: str | None = None
) -> CompetitionMockQuestion:
    """The one write path for an Annual Competition question row and its
    options -- used by paper generation below and by the multiplication /
    division section rebuild further down, so a rebuilt question is stored
    exactly the way a freshly generated one is."""
    Metadata = Question.get("metadata") if isinstance(Question.get("metadata"), dict) else {}
    SectionNumber = int(Question.get("_annual_section_number") or 1)
    SectionTitle = str(SectionTitleOverride or Question.get("_annual_section_title") or f"Section {SectionNumber}")
    ConceptTag = str(Metadata.get("annualCompetitionConceptTitle") or Metadata.get("concept_family") or "")[:100]
    QuestionRecord = CompetitionMockQuestion(
        mock_exam_id=MockExamId,
        section_number=SectionNumber,
        section_title=SectionTitle,
        question_number=QuestionNumber,
        display_type=str(Question.get("display_type") or "VERTICAL"),
        question_text=Question.get("question_text"),
        operands_json=json.dumps(Question.get("operands") or []),
        operators_json=json.dumps(Question.get("operators") or []),
        correct_answer=PlainNumberString(Question.get("correct_answer")),
        explanation=Question.get("explanation"),
        difficulty=str(Question.get("difficulty") or DEFAULT_ANNUAL_COMPETITION_DIFFICULTY_BAND),
        concept_family=str(Metadata.get("annualCompetitionConceptFamily") or Metadata.get("concept_family") or ConceptTag)[:100],
        concept_tag=ConceptTag,
        source_type="ANNUAL_COMPETITION_GENERATOR",
        source_reference_id="",
        seed=str(Question.get("seed") or ""),
        marks=ANNUAL_COMPETITION_MARKS_PER_QUESTION,
        metadata_json=json.dumps(Metadata),
    )
    db.add(QuestionRecord)
    db.flush()
    _StoreQuestionOptions(db, QuestionRecord, Question.get("options") or [])
    return QuestionRecord


def _AnnualPaperFacts(LevelCode: str, Sections: list[dict[str, Any]], PaperSeed: str, ActualQuestionCount: int) -> dict[str, Any]:
    """Everything a paper's own exam record says about itself -- question
    total, marks, duration, the one-line description, the section list and
    the generation record. Built in one place so a freshly generated paper
    and a paper rebuilt in place (RebuildAnnualCompetitionPaperContent
    below) can never describe themselves differently."""
    TotalDurationSeconds = sum(int(Section["timeLimitSeconds"]) for Section in Sections)
    return {
        "total_questions": ActualQuestionCount,
        "total_marks": ActualQuestionCount * ANNUAL_COMPETITION_MARKS_PER_QUESTION,
        "duration_seconds": TotalDurationSeconds,
        "instructions": f"{LevelCode} Annual Competition — {len(Sections)} section(s), {ActualQuestionCount} questions, {TotalDurationSeconds // 60} minutes total. 1 mark per correct answer, no negative marking.",
        "syllabus_coverage_json": json.dumps({
            "engine": "ANNUAL_COMPETITION_PAPER_GENERATOR",
            "sections": [{"number": Section["number"], "title": Section["title"], "mode": Section.get("mode"), "questionCount": Section["questionCount"], "timeLimitSeconds": Section["timeLimitSeconds"]} for Section in Sections],
        }),
        "generation_config_json": json.dumps({
            "engine": "ANNUAL_COMPETITION_PAPER_GENERATOR",
            "levelCode": LevelCode,
            "paperSeed": PaperSeed,
            "requestedQuestionCount": sum(int(Section["questionCount"]) for Section in Sections),
            "actualQuestionCount": ActualQuestionCount,
            "questionRulesVersion": ANNUAL_COMPETITION_QUESTION_RULES_VERSION,
        }),
    }


def AnnualPaperQuestionRulesVersion(ExamRecord: CompetitionMockExam | None) -> str | None:
    """The question rules a stored paper was generated under, or None for a
    paper from before the rules were versioned."""
    if ExamRecord is None:
        return None
    try:
        Config = json.loads(ExamRecord.generation_config_json or "{}")
    except (TypeError, ValueError):
        return None
    Version = Config.get("questionRulesVersion") if isinstance(Config, dict) else None
    return str(Version) if Version else None


def GenerateAnnualCompetitionLevelPaper(
    db: Session,
    *,
    LevelId: str,
    CreatedBy: User | None,
    Title: str | None = None,
    MockCode: str | None = None,
    CompetitionScope: str = "ANNUAL_COMPETITION",
    CompetitionLevelCode: str | None = None,
) -> dict[str, Any]:
    """Generate and persist one Annual Competition level's official paper.

    Writes a CompetitionMockExam + its CompetitionMockQuestion/
    CompetitionMockQuestionOption rows -- the same tables the practice
    Competition Mock feature uses (so CompetitionEventLevelPaper.mock_exam_id
    and every downstream attempt/scoring/timer screen that already expects a
    CompetitionMockExam keeps working unchanged) -- via this module's own
    write path, never GenerateCompetitionMockDraft (see module docstring for
    why: that function's 100-question cap and section-balancing/registry
    lookups don't fit this level's gist-exact, sometimes-450-question spec).

    CompetitionLevelCode is an optional override for which registry entry to
    generate content from, distinct from LevelId's own curriculum Level row.
    This exists for exactly one real case today: "MM-L2" is a real Annual
    Competition target (students who have completed the MM module fully are
    eligible for it, per the client gist) but has no curriculum Level row of
    its own anywhere in the platform -- the Master Module only seeds one
    Level, "MM-L1" (see app/seed/seed_master_module.py; also documented as a
    known, tracked gap in this file's own NO_CURRICULUM_LEVEL_FOR_CODE error,
    pkg-02-assignment-engine.md finding #4). The gist's "MM-2" spec is fully
    self-contained content-wise (transcribed into this registry as an alias
    of MM-L1's own section/concept-pool spec), so callers generating an
    MM-L2 paper pass MM-L1's real Level id (purely for Module/DB linkage --
    every question is still produced by MM's own generator) together with
    CompetitionLevelCode="MM-L2" (for registry lookup and question/exam
    tagging). Every other level code's LevelId already matches its own
    CompetitionLevelCode 1:1, so this parameter is a no-op for them.
    """
    LevelRecord = db.get(Level, LevelId)
    if not LevelRecord or not LevelRecord.is_active:
        api_error(404, "LEVEL_NOT_FOUND", "The selected level was not found or is inactive.")
    ModuleRecord = db.get(Module, LevelRecord.module_id)
    if not ModuleRecord or not ModuleRecord.is_active:
        api_error(404, "MODULE_NOT_FOUND", "The selected module was not found or is inactive.")

    LevelCode = str(CompetitionLevelCode or LevelRecord.level_code or "")
    LevelConfig = GetAnnualCompetitionLevelConfig(LevelCode)
    if not LevelConfig:
        api_error(
            400,
            "ANNUAL_COMPETITION_LEVEL_NOT_CONFIGURED",
            f"'{LevelCode}' has no Annual Competition paper spec configured yet.",
        )

    Sections = LevelConfig["sections"]
    SectionConceptPools = LevelConfig["sectionConceptPools"]
    PaperSeed = uuid4().hex

    SelectedQuestions = _CollectAnnualCompetitionQuestions(LevelCode, Sections, SectionConceptPools, PaperSeed)
    ActualQuestionCount = len(SelectedQuestions)
    if ActualQuestionCount <= 0:
        api_error(400, "ANNUAL_COMPETITION_GENERATION_EMPTY", f"No questions could be generated for {LevelCode}'s Annual Competition paper.")

    PaperFacts = _AnnualPaperFacts(LevelCode, Sections, PaperSeed, ActualQuestionCount)
    DisplayMockCode = MockCode or f"ANNUAL-{LevelCode}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid4().hex[:6].upper()}"
    MockTitle = Title or f"{LevelCode} Annual Competition Paper {datetime.now(timezone.utc).strftime('%d %b %Y %H:%M')}"

    ExamRecord = CompetitionMockExam(
        title=MockTitle,
        mock_code=DisplayMockCode,
        module_id=ModuleRecord.id,
        level_id=LevelRecord.id,
        competition_scope=CompetitionScope,
        difficulty_band=DEFAULT_ANNUAL_COMPETITION_DIFFICULTY_BAND,
        total_questions=PaperFacts["total_questions"],
        total_marks=PaperFacts["total_marks"],
        marks_per_question=ANNUAL_COMPETITION_MARKS_PER_QUESTION,
        duration_seconds=PaperFacts["duration_seconds"],
        status="DRAFT",
        instructions=PaperFacts["instructions"],
        syllabus_coverage_json=PaperFacts["syllabus_coverage_json"],
        generation_config_json=PaperFacts["generation_config_json"],
        created_by_user_id=CreatedBy.id if CreatedBy else None,
        is_active=True,
    )
    db.add(ExamRecord)
    db.flush()

    for Index, Question in enumerate(SelectedQuestions, start=1):
        _StoreAnnualCompetitionQuestion(db, MockExamId=ExamRecord.id, QuestionNumber=Index, Question=Question)

    db.commit()
    db.refresh(ExamRecord)
    return CompetitionMockExamPayload(db, ExamRecord, IncludeQuestions=True)



# ---------------------------------------------------------------------------
# Backfill support (2026-10-06): bring an ALREADY STORED paper's
# multiplication / division sections in line with the rule above.
#
# A practice paper's content is generated once and frozen as its own
# CompetitionMockExam the moment it is assigned, so the rule only reaches
# papers generated after it shipped. Shailesh: "once this is applied we will
# need to backfill the existing assigned practice papers to the students
# that are pending and have not been completed yet", and then: "regeneration
# is only required for division and multiplication rest is fine" -- so this
# rebuilds ONLY the multiplication / division sections that break the rule
# and leaves every other question row of the paper exactly as it is (same
# ids, same order). A section that already complies is left alone too.
#
# This function never decides WHICH papers qualify -- the caller does
# (scripts/backfill_annual_competition_multiply_divide_rule.py: practice
# papers nobody has opened). It also never commits: with Apply=True it only
# flushes, so the caller owns the transaction, one paper at a time.
# ---------------------------------------------------------------------------
def _StoredSumOf(QuestionRecord: CompetitionMockQuestion) -> tuple[Any, Any]:
    try:
        Operands = json.loads(QuestionRecord.operands_json or "[]")
    except (TypeError, ValueError):
        Operands = []
    try:
        Operators = json.loads(QuestionRecord.operators_json or "[]")
    except (TypeError, ValueError):
        Operators = []
    return Operands, Operators


def RebuildAnnualCompetitionMultiplyDivideSections(
    db: Session, *, MockExamId: str, CompetitionLevelCode: str, Apply: bool
) -> dict[str, Any]:
    """Check one stored Annual Competition paper against the multiplication /
    division rule and, with Apply=True, rebuild the sections that break it.

    Returns {"status": ..., "sections": [...]} where status is one of
      NOT_APPLICABLE     this level has no multiplication / division section
      COMPLIANT          nothing to do
      STRUCTURE_DIFFERS  the stored paper does not match today's section
                         layout for this level -- reported, never touched
      WOULD_REBUILD      Apply=False and at least one section breaks the rule
      REBUILT            Apply=True and those sections were rebuilt (flushed,
                         not committed)
    """
    LevelConfig = GetAnnualCompetitionLevelConfig(CompetitionLevelCode)
    if not LevelConfig:
        return {"status": "NOT_APPLICABLE", "sections": []}
    SectionConceptPools = LevelConfig["sectionConceptPools"]
    TargetSections = [
        Section for Section in LevelConfig["sections"] if IsAnnualMultiplyDivideSection(SectionConceptPools.get(Section["key"]) or [])
    ]
    if not TargetSections:
        return {"status": "NOT_APPLICABLE", "sections": []}

    StoredQuestions = (
        db.query(CompetitionMockQuestion)
        .filter(CompetitionMockQuestion.mock_exam_id == MockExamId)
        .order_by(CompetitionMockQuestion.question_number.asc())
        .all()
    )
    StoredBySection: dict[int, list[CompetitionMockQuestion]] = {}
    for QuestionRecord in StoredQuestions:
        StoredBySection.setdefault(int(QuestionRecord.section_number or 0), []).append(QuestionRecord)

    Report: list[dict[str, Any]] = []
    SectionsToRebuild: list[dict[str, Any]] = []
    for Section in TargetSections:
        SectionNumber = int(Section["number"])
        Rows = StoredBySection.get(SectionNumber) or []
        Sums = [_StoredSumOf(Row) for Row in Rows]
        IsPlainSumSection = bool(Rows) and all(
            isinstance(Operands, list) and len(Operands) == 2
            and any(str(Item).strip() in (ANNUAL_COMPETITION_MULTIPLY_OPERATOR, ANNUAL_COMPETITION_DIVIDE_OPERATOR) for Item in (Operators or []))
            for Operands, Operators in Sums
        )
        if len(Rows) != int(Section["questionCount"]) or not IsPlainSumSection:
            return {
                "status": "STRUCTURE_DIFFERS",
                "sections": [{
                    "number": SectionNumber, "title": Section["title"],
                    "storedQuestions": len(Rows), "expectedQuestions": int(Section["questionCount"]),
                }],
            }
        Faults = AnnualMultiplyDivideRuleFaults(Sums)
        Report.append({"number": SectionNumber, "title": Section["title"], **Faults})
        if Faults["faults"] > 0:
            SectionsToRebuild.append(Section)

    if not SectionsToRebuild:
        return {"status": "COMPLIANT", "sections": Report}
    if not Apply:
        return {"status": "WOULD_REBUILD", "sections": Report}

    for Section in SectionsToRebuild:
        SectionNumber = int(Section["number"])
        OldRows = StoredBySection[SectionNumber]
        QuestionNumbers = [int(Row.question_number) for Row in OldRows]
        # Keep whatever title this paper already shows for the section (an
        # older paper may predate a section rename); only the sums change.
        StoredTitle = str(OldRows[0].section_title or Section["title"])
        NewQuestions = _CollectAnnualCompetitionQuestions(
            CompetitionLevelCode, [Section], SectionConceptPools, f"MDRULE-{uuid4().hex}"
        )
        if len(NewQuestions) != len(OldRows):
            api_error(
                500,
                "ANNUAL_COMPETITION_SECTION_REBUILD_COUNT_MISMATCH",
                f"Rebuilt {len(NewQuestions)} questions for {Section['title']} ({CompetitionLevelCode}); the paper holds {len(OldRows)}.",
            )
        OldIds = [Row.id for Row in OldRows]
        db.query(CompetitionMockQuestionOption).filter(CompetitionMockQuestionOption.mock_question_id.in_(OldIds)).delete(synchronize_session=False)
        db.query(CompetitionMockQuestion).filter(CompetitionMockQuestion.id.in_(OldIds)).delete(synchronize_session=False)
        db.flush()
        for QuestionNumber, Question in zip(QuestionNumbers, NewQuestions):
            _StoreAnnualCompetitionQuestion(
                db, MockExamId=MockExamId, QuestionNumber=QuestionNumber, Question=Question, SectionTitleOverride=StoredTitle
            )
    db.flush()
    return {"status": "REBUILT", "sections": Report, "rebuiltSectionNumbers": [int(Section["number"]) for Section in SectionsToRebuild]}


# ---------------------------------------------------------------------------
# Backfill support (2026-10-07): bring an ALREADY STORED paper wholly onto
# today's question rules.
#
# Shailesh: "once done we will need to backfill the assigned but pending
# practice papers and after it is applied then official and practice papers
# generated after that will obviously follow the new rules and conventions."
#
# The 2026-10-07 rules change what whole sections look like (new sum shapes,
# mixed order, exact shares) and remove a section outright from IM-3, so --
# unlike the multiplication / division rebuild above, which swaps single
# sections -- this replaces the paper's entire content with a freshly
# generated paper of its level. The paper keeps its own exam record (same
# id, same code, same title), so the practice-bank entry that points at it,
# its "Practice Paper N" number and its assignment date are untouched; only
# the questions inside, and what the exam record says about them, change.
#
# Like the rebuild above it never decides WHICH papers qualify and never
# commits -- it flushes, and the caller owns the transaction, one paper at a
# time (RebuildUnopenedPracticePaperToCurrentRules in
# annual_competition_studio_service.py, which is also what puts the section
# timers right).
# ---------------------------------------------------------------------------
def RebuildAnnualCompetitionPaperContent(db: Session, *, MockExamId: str, CompetitionLevelCode: str) -> dict[str, Any]:
    """Replace every question of one stored Annual Competition paper with a
    freshly generated paper of its level, and bring the exam record's own
    totals and description in line. Flushes; does not commit.

    Returns {"questionsBefore", "questionsAfter", "sectionsBefore",
    "sectionsAfter", "paperSeed"}.
    """
    LevelConfig = GetAnnualCompetitionLevelConfig(CompetitionLevelCode)
    if not LevelConfig:
        api_error(400, "ANNUAL_COMPETITION_LEVEL_NOT_CONFIGURED", f"'{CompetitionLevelCode}' has no Annual Competition paper spec configured yet.")
    ExamRecord = db.get(CompetitionMockExam, MockExamId)
    if not ExamRecord:
        api_error(404, "ANNUAL_COMPETITION_PAPER_NOT_FOUND", "This paper's content could not be found.")

    Sections = LevelConfig["sections"]
    PaperSeed = uuid4().hex
    # Generated in full BEFORE anything stored is touched: if generation
    # fails, the paper is exactly as it was.
    NewQuestions = _CollectAnnualCompetitionQuestions(CompetitionLevelCode, Sections, LevelConfig["sectionConceptPools"], PaperSeed)
    ExpectedCount = sum(int(Section["questionCount"]) for Section in Sections)
    if len(NewQuestions) != ExpectedCount:
        api_error(
            500,
            "ANNUAL_COMPETITION_PAPER_REBUILD_COUNT_MISMATCH",
            f"Generated {len(NewQuestions)} questions for {CompetitionLevelCode}; the level's paper has {ExpectedCount}.",
        )

    OldRows = (
        db.query(CompetitionMockQuestion.id, CompetitionMockQuestion.section_number)
        .filter(CompetitionMockQuestion.mock_exam_id == MockExamId)
        .all()
    )
    OldIds = [Row[0] for Row in OldRows]
    SectionsBefore = sorted({int(Row[1] or 0) for Row in OldRows})
    # In slices: a 450-question paper would otherwise put 450 ids in one IN (...).
    for Start in range(0, len(OldIds), 200):
        Slice = OldIds[Start:Start + 200]
        db.query(CompetitionMockQuestionOption).filter(CompetitionMockQuestionOption.mock_question_id.in_(Slice)).delete(synchronize_session=False)
        db.query(CompetitionMockQuestion).filter(CompetitionMockQuestion.id.in_(Slice)).delete(synchronize_session=False)
    db.flush()

    for Index, Question in enumerate(NewQuestions, start=1):
        _StoreAnnualCompetitionQuestion(db, MockExamId=MockExamId, QuestionNumber=Index, Question=Question)

    PaperFacts = _AnnualPaperFacts(CompetitionLevelCode, Sections, PaperSeed, len(NewQuestions))
    ExamRecord.total_questions = PaperFacts["total_questions"]
    ExamRecord.total_marks = PaperFacts["total_marks"]
    ExamRecord.marks_per_question = ANNUAL_COMPETITION_MARKS_PER_QUESTION
    ExamRecord.duration_seconds = PaperFacts["duration_seconds"]
    ExamRecord.instructions = PaperFacts["instructions"]
    ExamRecord.syllabus_coverage_json = PaperFacts["syllabus_coverage_json"]
    ExamRecord.generation_config_json = PaperFacts["generation_config_json"]
    db.flush()
    return {
        "questionsBefore": len(OldIds),
        "questionsAfter": len(NewQuestions),
        "sectionsBefore": SectionsBefore,
        "sectionsAfter": [int(Section["number"]) for Section in Sections],
        "paperSeed": PaperSeed,
    }
