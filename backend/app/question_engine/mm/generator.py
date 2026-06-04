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


def _ConceptTitleText(Config: MMConfig, SectionTitle: str | None = None) -> str:
    return f" {Config.DpsTitle} {Config.LessonTitle} {SectionTitle or ''} ".upper()


def _IsAnswerPositionConcept(Config: MMConfig, SectionTitle: str | None = None) -> bool:
    TitleText = _ConceptTitleText(Config, SectionTitle)
    return any(
        Marker in TitleText
        for Marker in (
            "ANSWER POSITION",
            "FIND POSITION",
            "ANSWER PLACEMENT",
            "GIVEN POSITION",
            "WRITE THE NUMBER",
            "FIRST NATURAL NUMBER",
            "NATURAL NUMBER POSITION",
        )
    )


def _IsNormalMultiplicationDivisionSection(Config: MMConfig, SectionTitle: str | None = None) -> bool:
    if _IsAnswerPositionConcept(Config, SectionTitle):
        return False

    TitleText = _ConceptTitleText(Config, SectionTitle)
    BlockedMarkers = (
        "SOLVE EQUATION",
        "EQUATION PRACTICE",
        "BODMAS",
        "ADD-LESS",
        "ADD LESS",
        "INTEGERS",
        "INTEGER",
        "SKILL STACKER",
        "CONCEPT DRILL",
        "SQUARE",
        "CUBE",
        "ROOT",
        "PROFIT",
        "LOSS",
        "SIMPLE INTEREST",
        "PERCENT",
        "PERCENTAGE",
    )

    if any(Marker in TitleText for Marker in BlockedMarkers):
        # Dedicated normal multiplication/division sections can still contain the
        # pattern text directly; mixed workbook sections with the blocked labels
        # must keep their existing display modes.
        ExplicitPatternOnly = any(Marker in TitleText for Marker in (" X ", " × ", " DIVISION", " ÷ "))
        if not ExplicitPatternOnly:
            return False

    return True


def _DisplayMode(Config: MMConfig, SectionTitle: str | None = None) -> str:
    ConceptFamily = Config.ConceptFamily

    if ConceptFamily in {"ADD_LESS", "DECIMAL_ADD_LESS", "INTEGERS"}:
        return "VISUAL_STACK"

    # Normal multiplication/division should display as a single horizontal
    # expression, for example "453 × 675 = ?" or "450 ÷ 9 = ?". The guard above
    # prevents answer-position, solve-equation, and other workbook-specific
    # sections from being pulled into this display rule.
    if ConceptFamily in {"WHOLE_NUMBER_MULTIPLICATION", "WHOLE_NUMBER_DIVISION"}:
        return "EXPRESSION_WORKSHEET" if _IsNormalMultiplicationDivisionSection(Config, SectionTitle) else "VISUAL_STACK"

    if ConceptFamily == "MULTIPLICATION_DIVISION_MIXED":
        if _IsAnswerPositionConcept(Config, SectionTitle):
            return "ANSWER_POSITION"
        return "EXPRESSION_WORKSHEET" if _IsNormalMultiplicationDivisionSection(Config, SectionTitle) else "VISUAL_STACK"

    if ConceptFamily in {"DECIMAL_MULTIPLICATION", "DECIMAL_DIVISION"}:
        if _IsAnswerPositionConcept(Config, SectionTitle):
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



def _NormalisedSectionTitle(Config: MMConfig, SectionTitle: str | None, ExtraMetadata: dict | None) -> str:
    OriginalTitle = SectionTitle or Config.DpsTitle
    Metadata = ExtraMetadata if isinstance(ExtraMetadata, dict) else {}

    # Do not rename answer-position / find-position sections. These have their
    # own workbook meaning and must remain exactly as mapped in the stable DPS
    # section structure.
    if _IsAnswerPositionConcept(Config, SectionTitle):
        return OriginalTitle

    if Config.ConceptFamily == "WHOLE_NUMBER_MULTIPLICATION":
        LeftDigits = Metadata.get("left_digits")
        RightDigits = Metadata.get("right_digits")
        if LeftDigits and RightDigits:
            return f"Multiplication {LeftDigits}D × {RightDigits}D"
        return "Multiplication"

    if Config.ConceptFamily == "WHOLE_NUMBER_DIVISION":
        DividendDigits = Metadata.get("dividend_digits")
        DivisorDigits = Metadata.get("divisor_digits")
        if DividendDigits and DivisorDigits:
            return f"Division {DividendDigits}D ÷ {DivisorDigits}D"
        return "Division"

    if Config.ConceptFamily == "DECIMAL_MULTIPLICATION":
        return "Decimal Multiplication"

    if Config.ConceptFamily == "DECIMAL_DIVISION":
        return "Decimal Division"

    return OriginalTitle

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
        DisplaySectionTitle = _NormalisedSectionTitle(Config, SectionTitle, ExtraMetadata)
        QuestionPayload = {
            "question_number": GlobalQuestionNumber,
            "display_type": _DisplayMode(Config, SectionTitle),
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
