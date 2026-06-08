import random
import re
from decimal import Decimal

from app.question_engine.option_utils import build_mcq_options, rebalance_correct_option_distribution
from app.question_engine.mm.config import MMConfig, IsPackage1Supported, OperationFocusForConcept, ResolveMmConceptAlias
from app.question_engine.mm.distractors import GenerateMmDistractors
from app.question_engine.mm.operands import DifficultyStage, GeneratePackage1Question
from app.question_engine.mm.validators import ValidateMmQuestion


def _Display(Value: Decimal) -> int | float:
    if Value == Value.to_integral_value():
        return int(Value)
    return float(Value.normalize())


def _SectionTitleText(Config: MMConfig, SectionTitle: str | None = None) -> str:
    """Return only the active DPS/section text.

    This intentionally excludes LessonTitle because lesson names can contain
    broad words such as Multiplication, Division, Integers, or BODMAS while the
    current section may be a different workbook concept. Rendering must be based
    on the active section/concept only so one concept fix cannot override another.
    """
    return f" {SectionTitle or Config.DpsTitle or ''} ".upper()


def _ContainsAny(Text: str, Markers: tuple[str, ...]) -> bool:
    return any(Marker in Text for Marker in Markers)


def _IsAnswerPositionConcept(Config: MMConfig, SectionTitle: str | None = None) -> bool:
    TitleText = _SectionTitleText(Config, SectionTitle)
    return _ContainsAny(
        TitleText,
        (
            "ANSWER POSITION",
            "FIND POSITION",
            "ANSWER PLACEMENT",
            "GIVEN POSITION",
            "WRITE THE NUMBER",
            "FIRST NATURAL NUMBER",
            "NATURAL NUMBER POSITION",
            "NUMBER POSITION",
        ),
    )


def _IsSolveEquationConcept(Config: MMConfig, SectionTitle: str | None = None) -> bool:
    TitleText = _SectionTitleText(Config, SectionTitle)
    return "SOLVE EQUATION" in TitleText or "EQUATION PRACTICE" in TitleText


def _IsVisualStackConcept(Config: MMConfig, SectionTitle: str | None = None) -> bool:
    TitleText = _SectionTitleText(Config, SectionTitle)
    return Config.ConceptFamily in {"ADD_LESS", "DECIMAL_ADD_LESS", "INTEGERS"} or _ContainsAny(
        TitleText,
        (
            "BORROWING",
            "ADD-LESS",
            "ADD LESS",
            "FAST VISUALISATION",
            "FAST VISUALIZATION",
            "VISUAL PRACTICE",
            "INTEGERS",
            "INTEGER",
        ),
    )


def _IsNormalMultiplicationSection(Config: MMConfig, SectionTitle: str | None = None) -> bool:
    if _IsAnswerPositionConcept(Config, SectionTitle) or _IsSolveEquationConcept(Config, SectionTitle) or _IsVisualStackConcept(Config, SectionTitle):
        return False
    TitleText = _SectionTitleText(Config, SectionTitle)
    return Config.ConceptFamily == "WHOLE_NUMBER_MULTIPLICATION" or _ContainsAny(
        TitleText,
        (
            "MULTIPLICATION BY",
            "MULTIPLICATION MIXED PATTERN",
            "MIXED PATTERN MULTIPLICATION",
            " X ",
            " × ",
        ),
    )


def _IsNormalDivisionSection(Config: MMConfig, SectionTitle: str | None = None) -> bool:
    if _IsAnswerPositionConcept(Config, SectionTitle) or _IsSolveEquationConcept(Config, SectionTitle) or _IsVisualStackConcept(Config, SectionTitle):
        return False
    TitleText = _SectionTitleText(Config, SectionTitle)
    return Config.ConceptFamily == "WHOLE_NUMBER_DIVISION" or _ContainsAny(
        TitleText,
        (
            "DIVISION BY",
            "DIVISION MIXED PATTERN",
            " ÷ ",
        ),
    )


def _IsNormalMultiplicationDivisionSection(Config: MMConfig, SectionTitle: str | None = None) -> bool:
    return _IsNormalMultiplicationSection(Config, SectionTitle) or _IsNormalDivisionSection(Config, SectionTitle)


def _DisplayMode(Config: MMConfig, SectionTitle: str | None = None) -> str:
    ConceptFamily = Config.ConceptFamily

    # Dedicated/special workbook tasks must win before any generic arithmetic rule.
    if _IsAnswerPositionConcept(Config, SectionTitle):
        return "ANSWER_POSITION"

    if _IsSolveEquationConcept(Config, SectionTitle):
        return "EXPRESSION_WORKSHEET"

    # Existing vertical-stack concepts are protected here. This prevents future
    # multiplication/division work from changing Borrowing, Add-Less, Integers,
    # Fast Visualisation, or Visual Practice layouts.
    if _IsVisualStackConcept(Config, SectionTitle):
        return "VISUAL_STACK"

    # Only true normal multiplication/division sections use the new horizontal
    # expression convention. Mixed workbook sections that are not explicitly a
    # multiplication/division section fall back to their original safe stack.
    if ConceptFamily in {"WHOLE_NUMBER_MULTIPLICATION", "WHOLE_NUMBER_DIVISION", "MULTIPLICATION_DIVISION_MIXED"}:
        return "EXPRESSION_WORKSHEET" if _IsNormalMultiplicationDivisionSection(Config, SectionTitle) else "VISUAL_STACK"

    if ConceptFamily in {"DECIMAL_MULTIPLICATION", "DECIMAL_DIVISION"}:
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
    TitleText = _SectionTitleText(Config, SectionTitle)
    HasExplicitMultiplicationPattern = bool(re.search(r"[1-6]D\s*(?:X|×)\s*[1-6]D", TitleText))
    HasExplicitDivisionPattern = bool(re.search(r"[1-6]D\s*(?:DIVISION|÷)\s*[1-6]D", TitleText))

    # Preserve all special/visual section names exactly as mapped. Only true
    # normal multiplication/division and explicit decimal multiplication/division
    # sections receive the new naming convention.
    if _IsAnswerPositionConcept(Config, SectionTitle) or _IsSolveEquationConcept(Config, SectionTitle) or _IsVisualStackConcept(Config, SectionTitle):
        return OriginalTitle

    # Exact workbook pattern sections such as "3D × 3D" and "6D ÷ 3D" must
    # display exactly as their section title. Prefixes like "Multiplication" or
    # "Division" make these audited sheets look like generic mixed sections.
    if HasExplicitMultiplicationPattern or HasExplicitDivisionPattern:
        return OriginalTitle

    if Config.ConceptFamily == "WHOLE_NUMBER_MULTIPLICATION" or _IsNormalMultiplicationSection(Config, SectionTitle):
        LeftDigits = Metadata.get("left_digits")
        RightDigits = Metadata.get("right_digits")
        if LeftDigits and RightDigits:
            return f"Multiplication {LeftDigits}D × {RightDigits}D"
        return "Multiplication"

    if Config.ConceptFamily == "WHOLE_NUMBER_DIVISION" or _IsNormalDivisionSection(Config, SectionTitle):
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
            RawSectionConcept = str(Section.get("conceptFamily") or Config.ConceptFamily)
            SectionConcept = RawSectionConcept
            if not IsPackage1Supported(SectionConcept):
                SectionConcept = ResolveMmConceptAlias(SectionTitle, Config.DpsTitle, Config.LessonTitle)
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
                GeneratorConfig={**Config.GeneratorConfig, "activeSection": Section},
            )
            SectionQuestions = _GenerateSingleSectionQuestionSet(SectionConfig, Index, SectionTitle, StartNumber, TotalSections)
            Questions.extend(SectionQuestions)
            StartNumber += SectionCount
        return rebalance_correct_option_distribution(Questions)

    return rebalance_correct_option_distribution(_GenerateSingleSectionQuestionSet(Config))
