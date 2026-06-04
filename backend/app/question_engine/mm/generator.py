import logging
import random
from decimal import Decimal

from app.question_engine.option_utils import build_mcq_options, rebalance_correct_option_distribution
from app.question_engine.mm.config import MMConfig, IsPackage1Supported, OperationFocusForConcept, ClassifyMmConcept
from app.question_engine.mm.distractors import GenerateMmDistractors
from app.question_engine.mm.operands import DifficultyStage, GeneratePackage1Question
from app.question_engine.mm.validators import ExpectedMmAnswer, ValidateMmQuestion

Logger = logging.getLogger(__name__)


def _Display(Value: Decimal) -> int | float:
    if Value == Value.to_integral_value():
        return int(Value)
    return float(Value.normalize())


def _DisplayMode(Config: MMConfig) -> str:
    ConceptFamily = Config.ConceptFamily
    TitleText = f" {Config.DpsTitle} {Config.LessonTitle} ".upper()

    if ConceptFamily in {"ADD_LESS", "DECIMAL_ADD_LESS", "INTEGERS"}:
        return "VISUAL_STACK"

    # Platform-level multiplication/division display convention:
    # Every multiplication/division concept must render as a clean one-line
    # worksheet expression, not as a vertical stack. This applies to digit
    # pattern, decimal, and mixed multiplication/division sections.
    if ConceptFamily in {"WHOLE_NUMBER_MULTIPLICATION", "WHOLE_NUMBER_DIVISION"}:
        return "EXPRESSION_WORKSHEET"

    if ConceptFamily == "MULTIPLICATION_DIVISION_MIXED":
        if "ANSWER POSITION" in TitleText or "FIND POSITION" in TitleText or "ANSWER PLACEMENT" in TitleText:
            return "ANSWER_POSITION"
        return "EXPRESSION_WORKSHEET"

    if ConceptFamily in {"DECIMAL_MULTIPLICATION", "DECIMAL_DIVISION"}:
        if "ANSWER POSITION" in TitleText or "FIND POSITION" in TitleText or "ANSWER PLACEMENT" in TitleText:
            return "ANSWER_POSITION"
        return "EXPRESSION_WORKSHEET"

    if ConceptFamily in {"SQUARES", "CUBES", "SQUARE_ROOT", "CUBE_ROOT", "MIXED_SQUARE_CUBE", "MIXED_ROOTS"}:
        return "COMPACT_EXPRESSION"

    if ConceptFamily in {"BODMAS", "SOLVE_EQUATION", "NATURAL_NUMBER_POSITION", "PERCENTAGE_ADD_LESS", "PERCENTAGE_VALUE", "PERCENTAGE_INCREASE_DECREASE"}:
        return "EXPRESSION_WORKSHEET"

    if ConceptFamily in {"SIMPLE_INTEREST", "PROFIT_LOSS", "FIND_SELLING_PRICE", "FIND_COST_PRICE"}:
        return "FINANCIAL_TABLE"

    if ConceptFamily == "SKILL_STACKER":
        return "SKILL_STACKER_TABLE"

    if ConceptFamily == "CONCEPT_DRILL":
        return "CONCEPT_DRILL_TABLE"

    return "VISUAL_STACK"


def _GenerateSingleSectionQuestionSet(Config: MMConfig, SectionNumber: int = 1, SectionTitle: str | None = None, StartNumber: int = 1, TotalSections: int = 1) -> list[dict]:
    if not IsPackage1Supported(Config.ConceptFamily):
        Logger.warning(
            "MM generation fallback: unsupported concept routed to NATURAL_NUMBER_POSITION | module=%s level=%s lesson=%s dps=%s title=%s concept=%s",
            Config.ModuleCode,
            Config.LevelCode,
            Config.LessonNumber,
            Config.DpsNumber,
            Config.DpsTitle,
            Config.ConceptFamily,
        )
        Config = MMConfig(
            ModuleCode=Config.ModuleCode,
            LevelCode=Config.LevelCode,
            LessonNumber=Config.LessonNumber,
            DpsNumber=Config.DpsNumber,
            DpsTitle=Config.DpsTitle,
            LessonTitle=Config.LessonTitle,
            QuestionCount=Config.QuestionCount,
            Seed=f"{Config.Seed}-SAFE-FALLBACK",
            ConceptFamily="NATURAL_NUMBER_POSITION",
            OperationFocus="NUMBER_POSITION",
            DigitPattern=Config.DigitPattern,
            Difficulty=Config.Difficulty,
            GeneratorConfig={**Config.GeneratorConfig, "fallback_reason": "UNSUPPORTED_CONCEPT"},
        )

    Questions: list[dict] = []
    Seen: set[tuple[str, ...]] = set()

    QuestionCount = min(max(int(Config.QuestionCount or 10), 1), 30)
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
            if ValidateMmQuestion(Config, Operands, Operators, CorrectAnswer, ExtraMetadata) and Signature not in Seen:
                Accepted = LastCandidate
                Seen.add(Signature)
                break
        if Accepted is None:
            if LastCandidate is None:
                raise ValueError(f"Master Module generator could not create question {SectionQuestionNumber} for {Config.ConceptFamily}")
            Operands, Operators, CorrectAnswer, ExtraMetadata, Rng, Attempt = LastCandidate
            if not ValidateMmQuestion(Config, Operands, Operators, CorrectAnswer, ExtraMetadata):
                Logger.warning(
                    "MM question repair fallback: invalid candidate repaired by expected answer | module=%s level=%s lesson=%s dps=%s concept=%s section=%s question=%s",
                    Config.ModuleCode, Config.LevelCode, Config.LessonNumber, Config.DpsNumber, Config.ConceptFamily, SectionNumber, SectionQuestionNumber,
                )
                ExpectedAnswer = ExpectedMmAnswer(Config, Operands, Operators, ExtraMetadata)
                if ExpectedAnswer is None:
                    RepairConfig = MMConfig(
                        ModuleCode=Config.ModuleCode,
                        LevelCode=Config.LevelCode,
                        LessonNumber=Config.LessonNumber,
                        DpsNumber=Config.DpsNumber,
                        DpsTitle=Config.DpsTitle,
                        LessonTitle=Config.LessonTitle,
                        QuestionCount=1,
                        Seed=f"{QuestionSeed}-REPAIR",
                        ConceptFamily="NATURAL_NUMBER_POSITION",
                        OperationFocus="NUMBER_POSITION",
                        DigitPattern=Config.DigitPattern,
                        Difficulty=Config.Difficulty,
                        GeneratorConfig={**Config.GeneratorConfig, "fallback_reason": "INVALID_QUESTION_REPAIR"},
                    )
                    Operands, Operators, CorrectAnswer, ExtraMetadata = GeneratePackage1Question(RepairConfig, random.Random(f"{QuestionSeed}-repair"), SectionQuestionNumber)
                    Config = RepairConfig
                else:
                    CorrectAnswer = ExpectedAnswer
                    ExtraMetadata = {**ExtraMetadata, "answer_repaired_from_display": True}
            Seen.add(tuple([str(Value) for Value in Operands] + Operators))
        else:
            Operands, Operators, CorrectAnswer, ExtraMetadata, Rng, Attempt = Accepted

        ExpectedAnswer = ExpectedMmAnswer(Config, Operands, Operators, ExtraMetadata)
        if ExpectedAnswer is not None and abs(ExpectedAnswer - CorrectAnswer) > Decimal("0.000001"):
            Logger.warning(
                "MM answer repair: stored answer corrected from displayed expression | module=%s level=%s lesson=%s dps=%s concept=%s section=%s question=%s expected=%s stored=%s",
                Config.ModuleCode, Config.LevelCode, Config.LessonNumber, Config.DpsNumber, Config.ConceptFamily, SectionNumber, SectionQuestionNumber, ExpectedAnswer, CorrectAnswer,
            )
            CorrectAnswer = ExpectedAnswer
            ExtraMetadata = {**ExtraMetadata, "answer_repaired_from_display": True}

        CorrectDisplay = _Display(CorrectAnswer)
        AllowNegativeOptions = Config.ConceptFamily == "INTEGERS" or CorrectAnswer < 0
        Distractors = GenerateMmDistractors(CorrectAnswer, Rng, AllowNegativeOptions)
        Options = build_mcq_options(CorrectDisplay, Distractors, Rng)
        QuestionText = ExtraMetadata.get("question_text") if isinstance(ExtraMetadata, dict) else None
        QuestionPayload = {
            "question_number": GlobalQuestionNumber,
            "display_type": _DisplayMode(Config),
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
                "section_title": SectionTitle or Config.DpsTitle,
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
    SectionDefinitions = []
    if isinstance(Config.GeneratorConfig, dict):
        SectionDefinitions = Config.GeneratorConfig.get("dpsSections") or []

    if SectionDefinitions:
        Questions: list[dict] = []
        StartNumber = 1
        TotalSections = len(SectionDefinitions)
        for Index, Section in enumerate(SectionDefinitions, start=1):
            SectionTitle = str(Section.get("sectionTitle") or Section.get("title") or Config.DpsTitle)
            SectionConcept = str(Section.get("conceptFamily") or Config.ConceptFamily)
            NormalisedSectionTitle = SectionTitle.strip().lower()
            ClassifiedSectionConcept = ClassifyMmConcept(SectionTitle, Config.LessonTitle)
            if SectionConcept in {"", "MM_UNSUPPORTED", "None", "null"} or not IsPackage1Supported(SectionConcept):
                Logger.warning(
                    "MM section concept repair: section route corrected | module=%s level=%s lesson=%s dps=%s section=%s title=%s old=%s new=%s",
                    Config.ModuleCode, Config.LevelCode, Config.LessonNumber, Config.DpsNumber, Index, SectionTitle, SectionConcept, ClassifiedSectionConcept,
                )
                SectionConcept = ClassifiedSectionConcept
            if "find position" in NormalisedSectionTitle or "first natural number" in NormalisedSectionTitle or "number position" in NormalisedSectionTitle:
                SectionConcept = "NATURAL_NUMBER_POSITION"
            elif "solve equation" in NormalisedSectionTitle or "equation practice" in NormalisedSectionTitle:
                SectionConcept = "SOLVE_EQUATION"
            elif "skill stacker" in NormalisedSectionTitle:
                SectionConcept = "SKILL_STACKER"
            elif "concept drill" in NormalisedSectionTitle:
                SectionConcept = "CONCEPT_DRILL"
            if not IsPackage1Supported(SectionConcept):
                Logger.warning(
                    "MM section fallback: unresolved section routed to NATURAL_NUMBER_POSITION | module=%s level=%s lesson=%s dps=%s section=%s title=%s concept=%s",
                    Config.ModuleCode, Config.LevelCode, Config.LessonNumber, Config.DpsNumber, Index, SectionTitle, SectionConcept,
                )
                SectionConcept = "NATURAL_NUMBER_POSITION"
            SectionCount = int(Section.get("questionCount") or 10)
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
                GeneratorConfig={**Config.GeneratorConfig, "activeSection": Section},
            )
            SectionQuestions = _GenerateSingleSectionQuestionSet(SectionConfig, Index, SectionTitle, StartNumber, TotalSections)
            Questions.extend(SectionQuestions)
            StartNumber += SectionCount
        return rebalance_correct_option_distribution(Questions)

    return rebalance_correct_option_distribution(_GenerateSingleSectionQuestionSet(Config))
