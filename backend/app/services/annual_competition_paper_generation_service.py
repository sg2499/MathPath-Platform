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
from typing import Any
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import CompetitionMockExam, CompetitionMockQuestion, Level, Module, User
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

ANNUAL_COMPETITION_SLOT_MAX_RETRIES = 10
DEFAULT_ANNUAL_COMPETITION_DIFFICULTY_BAND = "ANNUAL_COMPETITION"


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


_IM_EXCLUDE = {"generatorFamily", "title", "conceptFamily", "operationFocus"}


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


_MM_EXCLUDE = {"generatorFamily", "title", "conceptFamily", "operationFocus", "mmStagingQuestionNumber", "mmLessonNumber"}


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

        for SlotIndex, ScheduledConceptSpec in enumerate(Schedule):
            Accepted: dict[str, Any] | None = None
            AcceptedConceptSpec: dict[str, Any] | None = None
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
            for FallbackOffset in range(PoolSize):
                ConceptSpec = ConceptPool[(ScheduledPoolIndex + FallbackOffset) % PoolSize]
                for RetryIndex in range(ANNUAL_COMPETITION_SLOT_MAX_RETRIES):
                    Seed = f"ANNUAL-{LevelCode}-{PaperSeed}-{SectionKey}-SLOT{SlotIndex}-C{FallbackOffset}-{RetryIndex}"
                    Candidate = _GenerateOneAnnualQuestion(ConceptSpec, Seed, LevelCode)
                    if not Candidate:
                        continue
                    Signature = _QuestionSignature(Candidate)
                    if Signature in UsedSignatures:
                        continue
                    Accepted = Candidate
                    AcceptedConceptSpec = ConceptSpec
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

            Metadata = Accepted.get("metadata") if isinstance(Accepted.get("metadata"), dict) else {}
            Metadata = dict(Metadata)
            Metadata.update({
                "annualCompetitionConceptTitle": AcceptedConceptSpec.get("title"),
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

    TotalDurationSeconds = sum(int(Section["timeLimitSeconds"]) for Section in Sections)
    DisplayMockCode = MockCode or f"ANNUAL-{LevelCode}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid4().hex[:6].upper()}"
    MockTitle = Title or f"{LevelCode} Annual Competition Paper {datetime.now(timezone.utc).strftime('%d %b %Y %H:%M')}"

    ExamRecord = CompetitionMockExam(
        title=MockTitle,
        mock_code=DisplayMockCode,
        module_id=ModuleRecord.id,
        level_id=LevelRecord.id,
        competition_scope=CompetitionScope,
        difficulty_band=DEFAULT_ANNUAL_COMPETITION_DIFFICULTY_BAND,
        total_questions=ActualQuestionCount,
        total_marks=ActualQuestionCount * ANNUAL_COMPETITION_MARKS_PER_QUESTION,
        marks_per_question=ANNUAL_COMPETITION_MARKS_PER_QUESTION,
        duration_seconds=TotalDurationSeconds,
        status="DRAFT",
        instructions=f"{LevelCode} Annual Competition -- {len(Sections)} section(s), {ActualQuestionCount} questions, {TotalDurationSeconds // 60} minutes total. 1 mark per correct answer, no negative marking.",
        syllabus_coverage_json=json.dumps({
            "engine": "ANNUAL_COMPETITION_PAPER_GENERATOR",
            "sections": [{"number": Section["number"], "title": Section["title"], "mode": Section.get("mode"), "questionCount": Section["questionCount"], "timeLimitSeconds": Section["timeLimitSeconds"]} for Section in Sections],
        }),
        generation_config_json=json.dumps({
            "engine": "ANNUAL_COMPETITION_PAPER_GENERATOR",
            "levelCode": LevelCode,
            "paperSeed": PaperSeed,
            "requestedQuestionCount": sum(int(Section["questionCount"]) for Section in Sections),
            "actualQuestionCount": ActualQuestionCount,
        }),
        created_by_user_id=CreatedBy.id if CreatedBy else None,
        is_active=True,
    )
    db.add(ExamRecord)
    db.flush()

    for Index, Question in enumerate(SelectedQuestions, start=1):
        Metadata = Question.get("metadata") if isinstance(Question.get("metadata"), dict) else {}
        SectionNumber = int(Question.get("_annual_section_number") or 1)
        SectionTitle = str(Question.get("_annual_section_title") or f"Section {SectionNumber}")
        ConceptTag = str(Metadata.get("annualCompetitionConceptTitle") or Metadata.get("concept_family") or "")[:100]
        QuestionRecord = CompetitionMockQuestion(
            mock_exam_id=ExamRecord.id,
            section_number=SectionNumber,
            section_title=SectionTitle,
            question_number=Index,
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

    db.commit()
    db.refresh(ExamRecord)
    return CompetitionMockExamPayload(db, ExamRecord, IncludeQuestions=True)
