import random
from decimal import Decimal

from app.question_engine.option_utils import build_mcq_options, rebalance_correct_option_distribution
from app.question_engine.mm.config import MMConfig, IsPackage1Supported, OperationFocusForConcept
from app.question_engine.mm.distractors import GenerateMmDistractors
from app.question_engine.mm.operands import DifficultyStage, GeneratePackage1Question
from app.question_engine.mm.validators import ValidateMmQuestion


def _Display(Value: Decimal) -> int | float:
    if Value == Value.to_integral_value():
        return int(Value)
    return float(Value.normalize())


def _DisplayMode(Config: MMConfig) -> str:
    ConceptFamily = Config.ConceptFamily
    TitleText = f" {Config.DpsTitle} {Config.LessonTitle} ".upper()

    if ConceptFamily in {"ADD_LESS", "DECIMAL_ADD_LESS", "INTEGERS"}:
        return "VISUAL_STACK"

    if ConceptFamily in {"WHOLE_NUMBER_MULTIPLICATION", "WHOLE_NUMBER_DIVISION"}:
        return "VISUAL_STACK"

    if ConceptFamily == "MULTIPLICATION_DIVISION_MIXED":
        if "DECIMAL" in TitleText or "ANSWER POSITION" in TitleText or "FIND POSITION" in TitleText or "ANSWER PLACEMENT" in TitleText:
            return "ANSWER_POSITION"
        return "VISUAL_STACK"

    if ConceptFamily in {"DECIMAL_MULTIPLICATION", "DECIMAL_DIVISION"}:
        if "ANSWER POSITION" in TitleText or "FIND POSITION" in TitleText or "ANSWER PLACEMENT" in TitleText:
            return "ANSWER_POSITION"
        return "EXPRESSION_WORKSHEET"

    if ConceptFamily in {"SQUARES", "CUBES", "SQUARE_ROOT", "CUBE_ROOT", "MIXED_SQUARE_CUBE", "MIXED_ROOTS"}:
        return "COMPACT_EXPRESSION"

    if ConceptFamily in {"BODMAS", "PERCENTAGE_ADD_LESS", "PERCENTAGE_VALUE", "PERCENTAGE_INCREASE_DECREASE"}:
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
        raise ValueError(f"Master Module generator does not support concept: {Config.ConceptFamily}")

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
