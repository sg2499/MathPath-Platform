import random
import re
from decimal import Decimal

from app.question_engine.option_utils import build_mcq_options, rebalance_correct_option_distribution
from app.question_engine.mm.config import MMConfig, IsPackage1Supported, OperationFocusForConcept
from app.question_engine.mm.curriculum_map import MM_CURRICULUM_MAP
from app.question_engine.mm.distractors import GenerateFinancialDistractors, GenerateMmDistractors, GenerateAnswerPositionDistractors
from app.question_engine.mm.operands import DifficultyStage, GeneratePackage1Question
from app.question_engine.mm.validators import ValidateMmQuestion


def _Display(Value: Decimal) -> int | float:
    if Value == Value.to_integral_value():
        return int(Value)
    return float(Value.normalize())


def _OperationKind(ConceptFamily: str) -> str:
    """Which smart-distractor structural strategy applies. See
    app.question_engine.smart_distractors -- every concept family still gets
    the universal last-digit-safe baseline regardless of this classification;
    this only picks which "genuine mistake" candidates get tried first."""
    if ConceptFamily in {"ADD_LESS", "DECIMAL_ADD_LESS", "INTEGERS"}:
        return "ADD_SUBTRACT"
    if ConceptFamily in {
        "WHOLE_NUMBER_MULTIPLICATION", "DECIMAL_MULTIPLICATION",
        "SQUARES", "CUBES", "MIXED_SQUARE_CUBE", "SKILL_STACKER",
    }:
        return "MULTIPLY"
    if ConceptFamily in {"WHOLE_NUMBER_DIVISION", "DECIMAL_DIVISION"}:
        return "DIVIDE"
    return "GENERIC"


def _OperandsAsDecimals(Operands: list) -> list[Decimal]:
    Result: list[Decimal] = []
    for Value in Operands:
        try:
            Result.append(Decimal(str(Value)))
        except Exception:
            continue
    return Result


def _DisplayMode(ConceptFamily: str) -> str:
    if ConceptFamily == "ANSWER_POSITION": return "ANSWER_POSITION"
    if ConceptFamily == "SOLVE_EQUATION": return "EXPRESSION_WORKSHEET"
    if ConceptFamily in {"ADD_LESS", "DECIMAL_ADD_LESS", "INTEGERS"}: return "VISUAL_STACK"
    if ConceptFamily in {"WHOLE_NUMBER_MULTIPLICATION", "WHOLE_NUMBER_DIVISION", "MULTIPLICATION_DIVISION_MIXED"}: return "EXPRESSION_WORKSHEET"
    if ConceptFamily in {"DECIMAL_MULTIPLICATION", "DECIMAL_DIVISION"}: return "EXPRESSION_WORKSHEET"
    if ConceptFamily in {"SQUARES", "CUBES", "SQUARE_ROOT", "CUBE_ROOT", "MIXED_SQUARE_CUBE", "MIXED_ROOTS"}: return "COMPACT_EXPRESSION"
    if ConceptFamily in {"BODMAS", "PERCENTAGE_ADD_LESS", "PERCENTAGE_VALUE", "PERCENTAGE_INCREASE_DECREASE"}: return "EXPRESSION_WORKSHEET"
    if ConceptFamily in {"SIMPLE_INTEREST", "PROFIT_LOSS", "FIND_SELLING_PRICE", "FIND_COST_PRICE"}: return "FINANCIAL_TABLE"
    if ConceptFamily == "SKILL_STACKER": return "SKILL_STACKER_TABLE"
    if ConceptFamily == "CONCEPT_DRILL": return "CONCEPT_DRILL_TABLE"
    return "VISUAL_STACK"


def _GenerateSingleSectionQuestionSet(Config: MMConfig, SectionNumber: int = 1, SectionTitle: str | None = None, StartNumber: int = 1, TotalSections: int = 1) -> list[dict]:
    if not IsPackage1Supported(Config.ConceptFamily):
        raise ValueError(f"Master Module generator does not support concept: {Config.ConceptFamily}")

    Questions: list[dict] = []
    Seen: set[tuple[str, ...]] = set()

    QuestionCount = 5 if Config.ConceptFamily in {"SKILL_STACKER", "CONCEPT_DRILL"} else min(max(int(Config.QuestionCount or 10), 1), 30)
    for SectionQuestionNumber in range(1, QuestionCount + 1):
        GlobalQuestionNumber = StartNumber + SectionQuestionNumber - 1
        QuestionSeed = f"{Config.Seed}-MM-S{SectionNumber}-Q{SectionQuestionNumber}"
        Accepted = None
        LastCandidate = None
        for Attempt in range(0, 12):
            Rng = random.Random(QuestionSeed if Attempt == 0 else f"{QuestionSeed}-retry-{Attempt}")
            Operands, Operators, CorrectAnswer, ExtraMetadata = GeneratePackage1Question(Config, Rng, SectionQuestionNumber)
            LastCandidate = (Operands, Operators, CorrectAnswer, ExtraMetadata, Rng, Attempt)
            Signature = tuple([str(Value) for Value in Operands] + Operators)
            if ValidateMmQuestion(Config, Operands, Operators, CorrectAnswer) and Signature not in Seen:
                Accepted = LastCandidate
                Seen.add(Signature)
                break
        if Accepted is None:
            if LastCandidate is None:
                raise ValueError(f"Master Module generator could not create question {SectionQuestionNumber} for {Config.ConceptFamily}")
            Operands, Operators, CorrectAnswer, ExtraMetadata, Rng, Attempt = LastCandidate
            if not ValidateMmQuestion(Config, Operands, Operators, CorrectAnswer):
                raise ValueError(f"Master Module generator produced invalid question {SectionQuestionNumber} for {Config.ConceptFamily}")
            Seen.add(tuple([str(Value) for Value in Operands] + Operators))
        else:
            Operands, Operators, CorrectAnswer, ExtraMetadata, Rng, Attempt = Accepted

        CorrectDisplay = _Display(CorrectAnswer)
        AllowNegativeOptions = Config.ConceptFamily == "INTEGERS" or CorrectAnswer < 0
        if Config.ConceptFamily in {"PROFIT_LOSS", "FIND_SELLING_PRICE", "FIND_COST_PRICE", "SIMPLE_INTEREST"}:
            Distractors = GenerateFinancialDistractors(CorrectAnswer, Rng, ExtraMetadata)
        elif ExtraMetadata.get("answer_position_mode") == "WRITE_NUMBER_FROM_GIVEN_POSITION_TABLE":
            Distractors = GenerateAnswerPositionDistractors(CorrectAnswer, Rng, ExtraMetadata)
        else:
            OperationKind = _OperationKind(Config.ConceptFamily)
            NumericOperands = _OperandsAsDecimals(Operands) if OperationKind in {"ADD_SUBTRACT", "DIVIDE"} else []
            Distractors = GenerateMmDistractors(CorrectAnswer, Rng, AllowNegativeOptions, OperationKind, NumericOperands)
        Options = build_mcq_options(CorrectDisplay, Distractors, Rng)
        QuestionText = ExtraMetadata.get("question_text") if isinstance(ExtraMetadata, dict) else None
        DisplaySectionTitle = SectionTitle or Config.DpsTitle
        QuestionPayload = {
            "question_number": GlobalQuestionNumber,
            "display_type": _DisplayMode(Config.ConceptFamily),
            "operands": Operands,
            "operators": Operators,
            "correct_answer": CorrectDisplay,
            "options": Options,
            "seed": QuestionSeed,
        }
        if QuestionText:
            QuestionPayload["question_text"] = QuestionText
        QuestionPayload["metadata"] = {
                "module_code": Config.ModuleCode,
                "level_code": Config.LevelCode,
                "lesson_number": Config.LessonNumber,
                "dps_number": Config.DpsNumber,
                "lesson_title": Config.LessonTitle,
                "dps_title": Config.DpsTitle,
                "section_number": SectionNumber,
                "section_title": DisplaySectionTitle,
                "source_section_title": SectionTitle or Config.DpsTitle,
                "section_question_number": SectionQuestionNumber,
                "section_question_count": QuestionCount,
                "dps_total_sections": TotalSections,
                "concept_family": Config.ConceptFamily,
                "operation_focus": Config.OperationFocus,
                "digit_pattern": Config.DigitPattern,
                "difficulty_stage": DifficultyStage(SectionQuestionNumber - 1),
                "difficulty_progression": "MM_SECTION_AWARE_WARM_UP_TO_CHALLENGE",
                "generator_package": "MM_SECTION_AWARE_PACKAGE_5",
                "mm_validated": True,
                "generation_attempts": Attempt + 1,
                "generation_mode": "DETERMINISTIC_BOUNDED",
                **ExtraMetadata,
            }
        Questions.append(QuestionPayload)
    return Questions


def GenerateMmQuestionSet(Config: MMConfig) -> list[dict]:
    GeneratorConfig = Config.GeneratorConfig if isinstance(Config.GeneratorConfig, dict) else {}
    if GeneratorConfig.get("forceSingleSection"):
        # Callers that already resolved one specific DPSSection row (e.g. assessment
        # generation, which iterates live DB sections itself) must never have this
        # LessonNumber/DpsNumber pair silently re-expanded into every section
        # MM_CURRICULUM_MAP knows about for that DPS. This flag skips that lookup.
        return rebalance_correct_option_distribution(_GenerateSingleSectionQuestionSet(Config))
    IsCompetitionSectionLocked = GeneratorConfig.get("source") == "MM_COMPETITION_SECTION_LOCKED_GENERATOR"
    SectionDefinitions = []

    if IsCompetitionSectionLocked:
        ActiveSection = GeneratorConfig.get("activeSection") if isinstance(GeneratorConfig.get("activeSection"), dict) else {}
        SectionDefinitions = GeneratorConfig.get("dpsSections") or ([ActiveSection] if ActiveSection else [])
    else:
        SectionDefinitions = MM_CURRICULUM_MAP.get(Config.LessonNumber, {}).get(Config.DpsNumber, [])

    if not SectionDefinitions:
        SectionDefinitions = GeneratorConfig.get("dpsSections") or []

    if SectionDefinitions:
        Questions: list[dict] = []
        StartNumber = 1
        TotalSections = len(SectionDefinitions)
        for Index, Section in enumerate(SectionDefinitions, start=1):
            SectionTitle = str(Section.get("sectionTitle") or Config.DpsTitle)
            SectionConcept = str(Section.get("conceptFamily") or Config.ConceptFamily)

            RawSectionCount = int(Section.get("questionCount") or 10)
            SectionCount = 5 if SectionConcept in {"SKILL_STACKER", "CONCEPT_DRILL"} else RawSectionCount
            SectionConfig = MMConfig(
                ModuleCode=Config.ModuleCode,
                LevelCode=Config.LevelCode,
                LessonNumber=Config.LessonNumber,
                DpsNumber=Config.DpsNumber,
                DpsTitle=SectionTitle,
                LessonTitle=Config.LessonTitle,
                QuestionCount=SectionCount,
                Seed=f"{Config.Seed}-SECTION-{Index}",
                ConceptFamily=SectionConcept,
                OperationFocus=OperationFocusForConcept(SectionConcept),
                DigitPattern=str(Section.get("digitPattern") or Config.DigitPattern),
                Difficulty=str(Section.get("difficulty") or Config.Difficulty),
                GeneratorConfig={
                    **Config.GeneratorConfig,
                    **Section,
                    "sourceDpsTitle": Config.DpsTitle,
                    "sourceLessonTitle": Config.LessonTitle,
                    "activeSection": Section,
                },
            )
            SectionQuestions = _GenerateSingleSectionQuestionSet(SectionConfig, Index, SectionTitle, StartNumber, TotalSections)
            Questions.extend(SectionQuestions)
            StartNumber += SectionCount
        return rebalance_correct_option_distribution(Questions)

    return rebalance_correct_option_distribution(_GenerateSingleSectionQuestionSet(Config))
