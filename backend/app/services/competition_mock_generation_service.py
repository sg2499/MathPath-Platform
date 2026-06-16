import json
import random
import re
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import (
    CompetitionMockExam,
    CompetitionMockQuestion,
    CompetitionMockQuestionOption,
    CompetitionMockAssignment,
    CompetitionMockAttempt,
    CompetitionMockAttemptAnswer,
    CompetitionMockResultSummary,
    DPS,
    DPSSection,
    Lesson,
    Level,
    Module,
    User,
)
from app.services.generation_service import generate_preview
from app.question_engine.mm import MMConfig, GenerateMmQuestionSet, OperationFocusForConcept


DEFAULT_COMPETITION_MOCK_QUESTION_COUNT = 60
DEFAULT_COMPETITION_MOCK_DURATION_SECONDS = 1800
DEFAULT_COMPETITION_MARKS_PER_QUESTION = 1
MM_DEFAULT_COMPETITION_MOCK_QUESTION_COUNT = 100
MM_DEFAULT_COMPETITION_MOCK_DURATION_SECONDS = 3600


MM_COMPETITION_SECTION_DEFINITIONS: list[dict[str, Any]] = [
    {
        "key": "MM_ABACUS_ADD_LESS",
        "number": 1,
        "title": "Section 1 - Add/Less (Abacus)",
    },
    {
        "key": "MM_VISUAL_ADD_LESS",
        "number": 2,
        "title": "Section 2 - Add/Less (Visual)",
    },
    {
        "key": "MM_MULTIPLICATION",
        "number": 3,
        "title": "Section 3 - Multiplication",
    },
    {
        "key": "MM_DIVISION",
        "number": 4,
        "title": "Section 4 - Division",
    },
    {
        "key": "MM_POSITIONAL_PLACEMENT",
        "number": 5,
        "title": "Section 5 - Positional & Placement",
    },
    {
        "key": "MM_SQUARES_ROOTS",
        "number": 6,
        "title": "Section 6 - Squares and Square Roots",
    },
    {
        "key": "MM_CUBES_ROOTS",
        "number": 7,
        "title": "Section 7 - Cubes and Cube Roots",
    },
    {
        "key": "MM_BODMAS_PERCENTAGE",
        "number": 8,
        "title": "Section 8 - BODMAS, Solve Equation, Add/Less Percentage",
    },
    {
        "key": "MM_FINANCIAL",
        "number": 9,
        "title": "Section 9 - Profit/Loss, Simple Interest, Selling Price",
    },
    {
        "key": "MM_SKILL_DRILL",
        "number": 10,
        "title": "Section 10 - Skill Stacker, Concept Drill",
    },
]

MM_COMPETITION_SECTION_BY_KEY = {Row["key"]: Row for Row in MM_COMPETITION_SECTION_DEFINITIONS}


def _CompetitionSectionDisplayTitle(SectionDefinition: dict[str, Any]) -> str:
    return f"Section {SectionDefinition['number']} - {SectionDefinition['title'].split(' - ', 1)[-1]}"


def _DecorateCompetitionSectionQuestion(Question: dict[str, Any], SectionKey: str, SectionDefinition: dict[str, Any]) -> dict[str, Any]:
    DecoratedQuestion = dict(Question)
    Metadata = DecoratedQuestion.get("metadata") if isinstance(DecoratedQuestion.get("metadata"), dict) else {}
    Metadata = dict(Metadata)
    Metadata.update({
        "competitionSectionKey": SectionKey,
        "competitionSectionNumber": SectionDefinition["number"],
        "competitionSectionTitle": SectionDefinition["title"],
        "competitionSectionDisplayTitle": _CompetitionSectionDisplayTitle(SectionDefinition),
        "competitionSectionLocked": True,
    })
    DecoratedQuestion["metadata"] = Metadata
    return DecoratedQuestion


MM_DEFAULT_SECTION_COUNT_FLOOR = 0

MM_COMPETITION_SECTION_CONCEPT_POOLS: dict[str, list[dict[str, Any]]] = {
    "MM_ABACUS_ADD_LESS": [
        {"conceptFamily": "ADD_LESS", "title": "Borrowing Sums with Positive and Negative Answers"},
        {"conceptFamily": "ADD_LESS", "title": "Mixed Digit Add-Less"},
        {"conceptFamily": "DECIMAL_ADD_LESS", "title": "Decimal Add-Less"},
        {"conceptFamily": "INTEGERS", "title": "Integers Add-Less"},
        {"conceptFamily": "ADD_LESS", "title": "4 Digit Number Add-Less"},
        {"conceptFamily": "ADD_LESS", "title": "2 Digit Number Add-Less (Fast Visualisation)"},
    ],
    "MM_VISUAL_ADD_LESS": [
        {"conceptFamily": "ADD_LESS", "title": "2 Digit Number Add-Less (Fast Visualisation)"},
        {"conceptFamily": "DECIMAL_ADD_LESS", "title": "Decimal Add-Less (Visual)"},
        {"conceptFamily": "INTEGERS", "title": "Integers Add-Less (Visual)"},
        {"conceptFamily": "ADD_LESS", "title": "Borrowing Add-Less (Visual)"},
        {"conceptFamily": "ADD_LESS", "title": "Mixed Digit Add-Less (Visual)"},
    ],
    "MM_MULTIPLICATION": [
        {"conceptFamily": "WHOLE_NUMBER_MULTIPLICATION", "title": "2D × 2D Multiplication"},
        {"conceptFamily": "WHOLE_NUMBER_MULTIPLICATION", "title": "3D × 2D Multiplication"},
        {"conceptFamily": "WHOLE_NUMBER_MULTIPLICATION", "title": "3D × 3D Multiplication"},
        {"conceptFamily": "WHOLE_NUMBER_MULTIPLICATION", "title": "4D × 2D Multiplication"},
        {"conceptFamily": "WHOLE_NUMBER_MULTIPLICATION", "title": "4D × 3D Multiplication"},
        {"conceptFamily": "WHOLE_NUMBER_MULTIPLICATION", "title": "5D × 2D Multiplication"},
        {"conceptFamily": "DECIMAL_MULTIPLICATION", "title": "2D × 2D Decimal Multiplication"},
        {"conceptFamily": "DECIMAL_MULTIPLICATION", "title": "3D × 2D Decimal Multiplication"},
        {"conceptFamily": "DECIMAL_MULTIPLICATION", "title": "3D × 3D Decimal Multiplication"},
        {"conceptFamily": "DECIMAL_MULTIPLICATION", "title": "4D × 2D Decimal Multiplication"},
    ],
    "MM_DIVISION": [
        {"conceptFamily": "WHOLE_NUMBER_DIVISION", "title": "3D ÷ 2D Division"},
        {"conceptFamily": "WHOLE_NUMBER_DIVISION", "title": "4D ÷ 2D Division"},
        {"conceptFamily": "WHOLE_NUMBER_DIVISION", "title": "5D ÷ 2D Division"},
        {"conceptFamily": "WHOLE_NUMBER_DIVISION", "title": "5D ÷ 3D Division"},
        {"conceptFamily": "WHOLE_NUMBER_DIVISION", "title": "6D ÷ 3D Division"},
        {"conceptFamily": "DECIMAL_DIVISION", "title": "3D ÷ 2D Decimal Division"},
        {"conceptFamily": "DECIMAL_DIVISION", "title": "4D ÷ 2D Decimal Division"},
        {"conceptFamily": "DECIMAL_DIVISION", "title": "5D ÷ 2D Decimal Division"},
        {"conceptFamily": "DECIMAL_DIVISION", "title": "5D ÷ 3D Decimal Division"},
        {"conceptFamily": "DECIMAL_DIVISION", "title": "6D ÷ 3D Decimal Division"},
    ],
    "MM_POSITIONAL_PLACEMENT": [
        {"conceptFamily": "ANSWER_POSITION", "title": "Find Position of the First Natural Number"},
        {"conceptFamily": "ANSWER_POSITION", "title": "Write Number From Given Position"},
        {"conceptFamily": "ANSWER_POSITION", "title": "Decimal Multiplication Answer Position"},
    ],
    "MM_SQUARES_ROOTS": [
        {"conceptFamily": "SQUARES", "title": "Squares"},
        {"conceptFamily": "SQUARE_ROOT", "title": "Square Root 5 Digit Number"},
        {"conceptFamily": "SQUARE_ROOT", "title": "Square Root 4 Digit Number"},
        {"conceptFamily": "SQUARE_ROOT", "title": "Square Root 3 & 4 Digit Number"},
    ],
    "MM_CUBES_ROOTS": [
        {"conceptFamily": "CUBES", "title": "Cubes"},
        {"conceptFamily": "CUBE_ROOT", "title": "Cube Root 6 Digit Number"},
        {"conceptFamily": "CUBE_ROOT", "title": "Cube Root 5 Digit Number"},
        {"conceptFamily": "CUBE_ROOT", "title": "Cube Root 4 Digit Number"},
    ],
    "MM_BODMAS_PERCENTAGE": [
        {"conceptFamily": "BODMAS", "title": "BODMAS Competition Challenge"},
        {"conceptFamily": "BODMAS", "title": "BODMAS Square Root Decimal Percentage Challenge"},
        {"conceptFamily": "SOLVE_EQUATION", "title": "Solve Equation Competition Challenge"},
        {"conceptFamily": "PERCENTAGE_ADD_LESS", "title": "Add-Less Percentage Challenge"},
        {"conceptFamily": "PERCENTAGE_ADD_LESS", "title": "Less Percentage Challenge"},
        {"conceptFamily": "PERCENTAGE_ADD_LESS", "title": "Add Percentage Challenge"},
    ],
    "MM_FINANCIAL": [
        {"conceptFamily": "PROFIT_LOSS", "title": "Find Profit"},
        {"conceptFamily": "PROFIT_LOSS", "title": "Find Loss"},
        {"conceptFamily": "PROFIT_LOSS", "title": "Find Profit %"},
        {"conceptFamily": "PROFIT_LOSS", "title": "Find Loss %"},
        {"conceptFamily": "SIMPLE_INTEREST", "title": "Simple Interest"},
        {"conceptFamily": "FIND_SELLING_PRICE", "title": "Selling Price"},
        {"conceptFamily": "FIND_COST_PRICE", "title": "Cost Price"},
    ],
    "MM_SKILL_DRILL": [
        {"conceptFamily": "SKILL_STACKER", "title": "Skill Stacker"},
        {"conceptFamily": "CONCEPT_DRILL", "title": "Concept Drill"},
    ],
}


MM_COMPETITION_CHALLENGE_LESSON_FLOORS: dict[str, int] = {
    "MM_ABACUS_ADD_LESS": 20,
    "MM_VISUAL_ADD_LESS": 20,
    "MM_MULTIPLICATION": 18,
    "MM_DIVISION": 18,
    "MM_POSITIONAL_PLACEMENT": 20,
    "MM_SQUARES_ROOTS": 24,
    "MM_CUBES_ROOTS": 24,
    "MM_BODMAS_PERCENTAGE": 27,
    "MM_FINANCIAL": 20,
    "MM_SKILL_DRILL": 20,
}


MM_COMPETITION_BATCH_SIZE = 5


MM_COMPETITION_ORDERED_CONCEPT_GROUPS: dict[str, list[list[str]]] = {
    "MM_ABACUS_ADD_LESS": [
        ["Borrowing Sums with Positive and Negative Answers"],
        ["Mixed Digit Add-Less"],
        ["Decimal Add-Less"],
        ["Integers Add-Less"],
        ["4 Digit Number Add-Less"],
        ["2 Digit Number Add-Less (Fast Visualisation)"],
    ],
    "MM_VISUAL_ADD_LESS": [
        ["2 Digit Number Add-Less (Fast Visualisation)"],
        ["Decimal Add-Less (Visual)"],
        ["Integers Add-Less (Visual)"],
        ["Borrowing Add-Less (Visual)"],
        ["Mixed Digit Add-Less (Visual)"],
    ],
    "MM_MULTIPLICATION": [
        ["2D × 2D Multiplication"],
        ["3D × 2D Multiplication"],
        ["3D × 3D Multiplication"],
        ["4D × 2D Multiplication"],
        ["4D × 3D Multiplication"],
        ["5D × 2D Multiplication"],
        ["2D × 2D Decimal Multiplication"],
        ["3D × 2D Decimal Multiplication"],
        ["3D × 3D Decimal Multiplication"],
        ["4D × 2D Decimal Multiplication"],
    ],
    "MM_DIVISION": [
        ["3D ÷ 2D Division"],
        ["4D ÷ 2D Division"],
        ["5D ÷ 2D Division"],
        ["5D ÷ 3D Division"],
        ["6D ÷ 3D Division"],
        ["3D ÷ 2D Decimal Division"],
        ["4D ÷ 2D Decimal Division"],
        ["5D ÷ 2D Decimal Division"],
        ["5D ÷ 3D Decimal Division"],
        ["6D ÷ 3D Decimal Division"],
    ],
    "MM_POSITIONAL_PLACEMENT": [
        ["Find Position of the First Natural Number"],
        ["Write Number From Given Position"],
        ["Decimal Multiplication Answer Position"],
    ],
    "MM_SQUARES_ROOTS": [
        ["Squares"],
        ["Square Root 5 Digit Number"],
        ["Square Root 4 Digit Number"],
        ["Square Root 3 & 4 Digit Number"],
    ],
    "MM_CUBES_ROOTS": [
        ["Cubes"],
        ["Cube Root 6 Digit Number"],
        ["Cube Root 5 Digit Number"],
        ["Cube Root 4 Digit Number"],
    ],
    "MM_BODMAS_PERCENTAGE": [
        ["BODMAS Competition Challenge"],
        ["BODMAS Square Root Decimal Percentage Challenge"],
        ["Solve Equation Competition Challenge"],
        ["Add Percentage Challenge"],
        ["Less Percentage Challenge"],
        ["Add-Less Percentage Challenge"],
    ],
    "MM_FINANCIAL": [
        ["Find Profit"],
        ["Find Loss"],
        ["Find Profit %"],
        ["Find Loss %"],
        ["Simple Interest"],
        ["Selling Price"],
        ["Cost Price"],
    ],
    "MM_SKILL_DRILL": [
        ["Skill Stacker"],
        ["Concept Drill"],
    ],
}


def _MmCompetitionOrderedConceptSchedule(SectionKey: str, ConceptPool: list[dict[str, Any]], RequiredCount: int) -> list[dict[str, Any]] | None:
    """Return a section-internal ordered concept schedule for MM competition mocks.

    Students are trained to solve one concept family at a time inside a section.
    For mixed competition sections, keep the questions grouped in the same
    predictable training order while preserving the section's total count.
    """
    Groups = MM_COMPETITION_ORDERED_CONCEPT_GROUPS.get(SectionKey)
    if not Groups or RequiredCount <= 0:
        return None

    SpecByTitle = {str(Spec.get("title") or ""): Spec for Spec in ConceptPool}
    ResolvedGroups: list[list[dict[str, Any]]] = []
    for Group in Groups:
        Resolved = [SpecByTitle[Title] for Title in Group if Title in SpecByTitle]
        if Resolved:
            ResolvedGroups.append(Resolved)

    if not ResolvedGroups:
        return None

    Base = RequiredCount // len(ResolvedGroups)
    Remainder = RequiredCount % len(ResolvedGroups)
    Schedule: list[dict[str, Any]] = []
    for GroupIndex, GroupSpecs in enumerate(ResolvedGroups):
        GroupCount = Base + (1 if GroupIndex < Remainder else 0)
        for LocalIndex in range(GroupCount):
            Schedule.append(GroupSpecs[LocalIndex % len(GroupSpecs)])
    return Schedule


def _MmCompetitionChallengeLessons(Lessons: list[Lesson], SectionKey: str) -> list[Lesson]:
    if not Lessons:
        return []
    MinimumLessonNumber = MM_COMPETITION_CHALLENGE_LESSON_FLOORS.get(SectionKey, 20)
    ChallengeLessons = [
        LessonRecord
        for LessonRecord in Lessons
        if int(getattr(LessonRecord, "lesson_number", 1) or 1) >= MinimumLessonNumber
    ]
    return ChallengeLessons or Lessons


def _MmCompetitionOrderedCandidates(Questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Prefer the later/difficult generated rows inside the MM section generator.

    Normal MM practice sheets intentionally progress from warm-up to challenge.
    Competition mocks should draw from the challenge end of that same generator
    without changing DPS/Learning Path behaviour, so we consume generated rows
    in reverse question order.
    """
    return list(reversed(Questions))


def _DecimalOrIntFromAny(Value: Any) -> Decimal | None:
    try:
        Clean = str(Value).strip().replace(",", "")
        if Clean in {"", "+", "-", "−"}:
            return None
        return Decimal(Clean.replace("−", "-"))
    except Exception:
        return None


def _FormatCompetitionNumber(Value: Decimal) -> str:
    return _PlainDecimalText(Value) if "_PlainDecimalText" in globals() else str(Value.normalize())


def _MmCompetitionIsAddLessStack(Question: dict[str, Any]) -> bool:
    Operands = Question.get("operands") or []
    Operators = Question.get("operators") or []
    if not isinstance(Operands, list) or not Operands:
        return False
    if Operators and any(str(Operator or "").strip() not in {"", "+", "-", "−"} for Operator in Operators):
        return False
    return all(_DecimalOrIntFromAny(Operand) is not None for Operand in Operands)


def _MmCompetitionStackAnswer(Operands: list[Any], Operators: list[Any]) -> Decimal:
    Total = Decimal("0")
    for Index, Operand in enumerate(Operands):
        Value = _DecimalOrIntFromAny(Operand)
        if Value is None:
            continue
        RawOperator = str(Operators[Index] if Index < len(Operators) else "").strip()
        if Index > 0 and RawOperator in {"-", "−"}:
            Total -= abs(Value)
        else:
            Total += Value
    return Total


def _MmCompetitionSmartNumericOptions(CorrectAnswer: Decimal, Seed: str) -> list[dict[str, Any]]:
    Rng = random.Random(Seed)
    IsDecimal = CorrectAnswer != CorrectAnswer.to_integral_value()
    Quantum = Decimal("0.01") if IsDecimal else Decimal("1")
    BaseOffsets = [Decimal("1"), Decimal("2"), Decimal("3"), Decimal("5")]
    if IsDecimal:
        BaseOffsets = [Decimal("0.10"), Decimal("0.20"), Decimal("0.50"), Decimal("1.00")]
    Distractors: list[str] = []
    for Offset in BaseOffsets + [Offset * -1 for Offset in BaseOffsets]:
        Candidate = CorrectAnswer + Offset
        if IsDecimal:
            Candidate = Candidate.quantize(Quantum, rounding=ROUND_HALF_UP)
        CandidateText = _PlainDecimalText(Candidate)
        if CandidateText != _PlainDecimalText(CorrectAnswer) and CandidateText not in Distractors:
            Distractors.append(CandidateText)
        if len(Distractors) >= 3:
            break
    Values = [_PlainDecimalText(CorrectAnswer)] + Distractors[:3]
    Rng.shuffle(Values)
    Labels = ["A", "B", "C", "D"]
    return [
        {"label": Labels[Index], "value": Value, "is_correct": Value == _PlainDecimalText(CorrectAnswer), "display_order": Index + 1}
        for Index, Value in enumerate(Values)
    ]


def _DigitRange(Digits: int) -> tuple[int, int]:
    Digits = max(1, int(Digits or 1))
    return (10 ** (Digits - 1), (10 ** Digits) - 1)


def _MultiplicationPairForBodmasPattern(Rng: random.Random, LeftDigits: int, RightDigits: int) -> tuple[int, int]:
    LeftMin, LeftMax = _DigitRange(LeftDigits)
    RightMin, RightMax = _DigitRange(RightDigits)
    return Rng.randint(LeftMin, LeftMax), Rng.randint(RightMin, RightMax)


def _DivisiblePairForBodmasPattern(Rng: random.Random, DividendDigits: int, DivisorDigits: int) -> tuple[int, int, int]:
    DividendMin, DividendMax = _DigitRange(DividendDigits)
    DivisorMin, DivisorMax = _DigitRange(DivisorDigits)
    for _ in range(160):
        Divisor = Rng.randint(DivisorMin, DivisorMax)
        MinQuotient = max(2, (DividendMin + Divisor - 1) // Divisor)
        MaxQuotient = max(MinQuotient, DividendMax // Divisor)
        if MaxQuotient < MinQuotient:
            continue
        Quotient = Rng.randint(MinQuotient, MaxQuotient)
        Dividend = Divisor * Quotient
        if DividendMin <= Dividend <= DividendMax:
            return Dividend, Divisor, Quotient
    # Deterministic fallbacks preserve exact displayed digit patterns.
    if DividendDigits == 3 and DivisorDigits == 3:
        return 936, 312, 3
    if DividendDigits == 4 and DivisorDigits == 3:
        return 8736, 312, 28
    return _DivisiblePairForBodmas(Rng)


def _SignedTermText(Value: int) -> str:
    return f"({Value})" if Value < 0 else str(Value)


def _BuildMmCompetitionSolveEquationChallengeQuestion(*, Seed: str, VariantIndex: int = 0) -> dict[str, Any]:
    """Generate competition-only Solve Equation questions.

    This keeps the workbook-approved signed-integer arithmetic convention:
    two or three numbers only, single-digit or double-digit values only, and
    plus/minus operations only. Competition difficulty comes from signed values
    and subtraction of negatives, not from unsupported algebra or oversized terms.
    """
    Rng = random.Random(Seed)
    TermCount = 3 if VariantIndex % 3 != 0 else 2
    Values: list[int] = []
    Operators: list[str] = []

    for Index in range(TermCount):
        Magnitude = Rng.choice([
            Rng.randint(3, 9),
            Rng.randint(11, 49),
            Rng.randint(50, 99),
        ])
        Sign = -1 if Rng.random() < 0.45 else 1
        Values.append(Sign * Magnitude)
        if Index > 0:
            Operators.append(Rng.choice(["+", "-", "+", "-"]))

    # Ensure the expression is not a plain all-positive warm-up.
    if all(Value > 0 for Value in Values):
        Values[-1] = -Values[-1]

    # Keep a controlled mix of subtraction-of-negative cases across generated
    # rows, while still respecting the 2-3 term workbook convention.
    if TermCount == 3 and VariantIndex % 2 == 1:
        Operators[1] = "-"
        Values[2] = -abs(Values[2])

    Answer = Decimal(Values[0])
    ExpressionParts = [_SignedTermText(Values[0])]
    for Operator, Value in zip(Operators, Values[1:]):
        ExpressionParts.append(Operator)
        ExpressionParts.append(_SignedTermText(Value))
        if Operator == "-":
            Answer -= Decimal(Value)
        else:
            Answer += Decimal(Value)

    Expression = " ".join(ExpressionParts) + " = ?"
    CorrectAnswer = _PlainDecimalText(Answer)
    return {
        "question_number": 1,
        "display_type": "EXPRESSION_WORKSHEET",
        "question_text": Expression,
        "operands": Values,
        "operators": ["+"] + Operators,
        "correct_answer": CorrectAnswer,
        "options": _MmCompetitionSmartNumericOptions(Answer, Seed),
        "difficulty": "COMPETITION_CHALLENGE",
        "seed": Seed,
        "metadata": {
            "conceptFamily": "SOLVE_EQUATION",
            "competitionConceptKey": "Solve Equation Competition Challenge",
            "competitionSolveEquationProfile": "SIGNED_INTEGER_2_TO_3_TERM_WORKBOOK_STYLE",
            "maxTermCount": 3,
            "maxTermDigits": 2,
            "unsupportedAlgebraUsed": False,
        },
    }

def _PerfectSquareAtOrBelow(MaxValue: int, Rng: random.Random, MinimumRoot: int = 12) -> tuple[int, int]:
    Root = Rng.randint(MinimumRoot, max(MinimumRoot, int(MaxValue ** 0.5)))
    return Root * Root, Root


def _PerfectCubeAtOrBelow(MaxValue: int, Rng: random.Random, MinimumRoot: int = 8) -> tuple[int, int]:
    Roots = [Value for Value in range(MinimumRoot, 22) if Value ** 3 <= MaxValue]
    Root = Rng.choice(Roots or [MinimumRoot])
    return Root ** 3, Root


def _DivisiblePairForBodmas(Rng: random.Random, *, MinDivisor: int = 12, MaxDivisor: int = 96, MinQuotient: int = 18, MaxQuotient: int = 98) -> tuple[int, int, int]:
    for _ in range(80):
        Divisor = Rng.randint(MinDivisor, MaxDivisor)
        Quotient = Rng.randint(MinQuotient, MaxQuotient)
        Dividend = Divisor * Quotient
        if 100 <= Dividend <= 9999:
            return Dividend, Divisor, Quotient
    Divisor = 24
    Quotient = 37
    return Divisor * Quotient, Divisor, Quotient


def _BuildMmCompetitionBodmasChallengeQuestion(*, Seed: str, VariantIndex: int = 0) -> dict[str, Any]:
    """Generate MM competition-only BODMAS with mixed challenge operands.

    This intentionally does not modify the normal MM DPS BODMAS generator. The
    mock exam must test competition readiness, so the multiplication/division
    pair is selected from a mixed pattern pool instead of locking every BODMAS
    question to the same pair. Displayed operands remain max 4 digits.
    """
    Rng = random.Random(Seed)
    PatternPool = [
        {"profile": "3D×3D_AND_4D÷3D", "multiply": (3, 3), "divide": (4, 3)},
        {"profile": "4D×3D_AND_3D÷3D", "multiply": (4, 3), "divide": (3, 3)},
        {"profile": "4D×2D_AND_4D÷3D", "multiply": (4, 2), "divide": (4, 3)},
        {"profile": "3D×2D_AND_3D÷3D", "multiply": (3, 2), "divide": (3, 3)},
        {"profile": "3D×3D_AND_3D÷3D", "multiply": (3, 3), "divide": (3, 3)},
        {"profile": "4D×3D_AND_4D÷3D", "multiply": (4, 3), "divide": (4, 3)},
        {"profile": "4D×2D_AND_3D÷3D", "multiply": (4, 2), "divide": (3, 3)},
        {"profile": "3D×2D_AND_4D÷3D", "multiply": (3, 2), "divide": (4, 3)},
    ]
    Pattern = PatternPool[(VariantIndex + Rng.randrange(len(PatternPool))) % len(PatternPool)]
    MultLeftDigits, MultRightDigits = Pattern["multiply"]
    DividendDigits, DivisorDigits = Pattern["divide"]
    MultLeft, MultRight = _MultiplicationPairForBodmasPattern(Rng, MultLeftDigits, MultRightDigits)
    Dividend, Divisor, Quotient = _DivisiblePairForBodmasPattern(Rng, DividendDigits, DivisorDigits)
    PatternProfile = str(Pattern["profile"])
    Template = (VariantIndex + Rng.randrange(6)) % 6

    if Template == 0:
        SquareRadicand, SquareRoot = _PerfectSquareAtOrBelow(9801, Rng, 18)
        PercentBase = Rng.randrange(1200, 9000, 100)
        Percent = Rng.choice([12, 15, 18, 20, 24, 25, 30, 35, 40, 45, 50, 60, 75])
        SubtractValue = Rng.randint(121, 987)
        Answer = Decimal(MultLeft * MultRight) + Decimal(SquareRoot) - Decimal(Quotient) + (Decimal(PercentBase) * Decimal(Percent) / Decimal(100)) - Decimal(SubtractValue)
        Expression = f"{MultLeft}×{MultRight} + √{SquareRadicand} - {Dividend}÷{Divisor} + {PercentBase}×{Percent}% - {SubtractValue} = ?"
    elif Template == 1:
        A = Rng.randint(120, 890)
        B = Rng.randint(80, 940)
        CubeRadicand, CubeRoot = _PerfectCubeAtOrBelow(9261, Rng, 9)
        SquareBase = Rng.randint(18, 96)
        Answer = Decimal(A + B) + Decimal(MultLeft * MultRight) + Decimal(CubeRoot) - Decimal(SquareBase ** 2) + Decimal(Quotient)
        Expression = f"({A}+{B}) + {MultLeft}×{MultRight} + ∛{CubeRadicand} - {SquareBase}² + {Dividend}÷{Divisor} = ?"
    elif Template == 2:
        SquareBase = Rng.randint(34, 98)
        CubeBase = Rng.randint(9, 21)
        PercentBase = Rng.randrange(1600, 9600, 100)
        Percent = Rng.choice([12, 15, 20, 24, 25, 30, 40, 45, 50, 60])
        Answer = Decimal(SquareBase ** 2) + Decimal(CubeBase ** 3) + Decimal(MultLeft * MultRight) - Decimal(Quotient) + (Decimal(PercentBase) * Decimal(Percent) / Decimal(100))
        Expression = f"{SquareBase}² + {CubeBase}³ + {MultLeft}×{MultRight} - {Dividend}÷{Divisor} + {PercentBase}×{Percent}% = ?"
    elif Template == 3:
        Base = Rng.randrange(1800, 9800, 100)
        LessPercent = Rng.choice([10, 12, 15, 20, 25, 30, 35, 40, 50])
        SquareRadicand, SquareRoot = _PerfectSquareAtOrBelow(9801, Rng, 20)
        CubeRadicand, CubeRoot = _PerfectCubeAtOrBelow(9261, Rng, 8)
        Answer = (Decimal(Base) - (Decimal(Base) * Decimal(LessPercent) / Decimal(100))) + Decimal(MultLeft * MultRight) - Decimal(Quotient) - Decimal(SquareRoot) + Decimal(CubeRoot)
        Expression = f"{Base} - {LessPercent}% + {MultLeft}×{MultRight} - {Dividend}÷{Divisor} - √{SquareRadicand} + ∛{CubeRadicand} = ?"
    elif Template == 4:
        AddValue = Rng.randint(340, 980)
        SquareRadicand, SquareRoot = _PerfectSquareAtOrBelow(9801, Rng, 16)
        Answer = Decimal(MultLeft * MultRight) - Decimal(Dividend) / Decimal(Divisor) + Decimal(AddValue) - Decimal(SquareRoot)
        Expression = f"{MultLeft}×{MultRight} - {Dividend}÷{Divisor} + {AddValue} - √{SquareRadicand} = ?"
    else:
        PercentBase = Rng.randrange(1100, 9900, 100)
        Percent = Rng.choice([15, 20, 25, 30, 35, 40, 45, 50, 60])
        CubeRadicand, CubeRoot = _PerfectCubeAtOrBelow(9261, Rng, 8)
        SubtractValue = Rng.randint(121, 987)
        Answer = Decimal(MultLeft * MultRight) + (Decimal(PercentBase) * Decimal(Percent) / Decimal(100)) - Decimal(Quotient) + Decimal(CubeRoot) - Decimal(SubtractValue)
        Expression = f"{MultLeft}×{MultRight} + {PercentBase}×{Percent}% - {Dividend}÷{Divisor} + ∛{CubeRadicand} - {SubtractValue} = ?"

    # Every displayed number inserted above is bounded to 4 digits by construction.
    Answer = Answer.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if Answer != Answer.to_integral_value() else Answer
    CorrectAnswer = _PlainDecimalText(Answer)
    return {
        "question_number": 1,
        "display_type": "EXPRESSION_WORKSHEET",
        "question_text": Expression,
        "operands": [],
        "operators": [],
        "correct_answer": CorrectAnswer,
        "options": _MmCompetitionSmartNumericOptions(Answer, Seed),
        "difficulty": "COMPETITION_CHALLENGE",
        "seed": Seed,
        "metadata": {
            "conceptFamily": "BODMAS",
            "competitionConceptKey": "BODMAS Competition Challenge",
            "competitionBodmasProfile": "ADVANCED_MIXED_PATTERN_MAX_4_DIGIT_OPERANDS",
            "competitionBodmasPatternProfile": PatternProfile,
            "maxDisplayedNumberDigits": 4,
        },
    }



def _MmCompetitionPadVisualAddLessRows(Question: dict[str, Any], *, SectionKey: str, ConceptTitle: str, Seed: str) -> dict[str, Any]:
    if SectionKey != "MM_VISUAL_ADD_LESS" or not _MmCompetitionIsAddLessStack(Question):
        return Question

    Updated = dict(Question)
    Operands = list(Updated.get("operands") or [])
    Operators = list(Updated.get("operators") or [])
    Text = _NormalizedSearchText(ConceptTitle, Updated.get("question_text"), _QuestionMetadata(Updated).get("competitionConceptKey"))
    IsTwoDigitFastVisualisation = "2 digit" in Text and ("fast visualisation" in Text or "fast visualization" in Text)
    TargetMin = 7 if IsTwoDigitFastVisualisation else 4
    TargetMax = 7 if IsTwoDigitFastVisualisation else 5
    Rng = random.Random(Seed)

    if len(Operands) > TargetMax:
        Operands = Operands[:TargetMax]
        Operators = Operators[:TargetMax]

    while len(Operands) < TargetMin:
        if IsTwoDigitFastVisualisation:
            NewValue = Rng.randint(21, 98)
        else:
            NewValue = Rng.randint(300, 9999)
        NewOperator = "-" if len(Operands) % 3 == 1 else "+"
        Operands.append(NewValue)
        Operators.append(NewOperator)

    if len(Operators) < len(Operands):
        Operators = Operators + ["+"] * (len(Operands) - len(Operators))
    Operators = Operators[:len(Operands)]

    CorrectAnswer = _MmCompetitionStackAnswer(Operands, Operators)
    Updated["operands"] = Operands
    Updated["operators"] = Operators
    Updated["correct_answer"] = _PlainDecimalText(CorrectAnswer)
    Updated["options"] = _MmCompetitionSmartNumericOptions(CorrectAnswer, Seed)
    Metadata = Updated.get("metadata") if isinstance(Updated.get("metadata"), dict) else {}
    Metadata = dict(Metadata)
    Metadata.update({
        "competitionVisualRowRule": "EXACTLY_7_ROWS" if IsTwoDigitFastVisualisation else "FOUR_TO_FIVE_ROWS",
        "competitionVisualRowCount": len(Operands),
    })
    Updated["metadata"] = Metadata
    return Updated



def _BuildMmCompetitionProfitLossQuestion(*, Seed: str, VariantTitle: str) -> dict[str, Any]:
    """Generate MM competition-only Profit/Loss variants.

    Normal MM Profit/Loss DPS generation stays untouched.  Competition mocks
    must rotate through Profit, Loss, Profit %, and Loss % so Section 9 does
    not collapse into only one financial subtype.
    """
    Rng = random.Random(Seed)
    VariantText = _NormalizedSearchText(VariantTitle)
    IsPercent = "%" in VariantTitle or "percent" in VariantText
    IsLoss = "loss" in VariantText

    CostPrice = Decimal(Rng.randrange(12000, 50001, 250))
    Rate = Decimal(Rng.choice([8, 10, 12, 15, 16, 18, 20, 22, 25, 28, 30, 32, 35, 40]))
    Amount = (CostPrice * Rate / Decimal(100)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    if Amount <= 0:
        Amount = Decimal("500")

    if IsLoss:
        SellingPrice = CostPrice - Amount
        Result = (Amount * Decimal(100) / CostPrice).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if IsPercent else Amount
        Prompt = "Find Loss %" if IsPercent else "Find Loss"
    else:
        SellingPrice = CostPrice + Amount
        Result = (Amount * Decimal(100) / CostPrice).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if IsPercent else Amount
        Prompt = "Find Profit %" if IsPercent else "Find Profit"

    CorrectAnswer = _PlainDecimalText(Result)
    Suffix = "%" if IsPercent else ""
    Options = _MmCompetitionSmartNumericOptions(Result, Seed)
    if IsPercent:
        for Option in Options:
            ValueText = str(Option.get("value") or "")
            Option["value"] = ValueText if ValueText.endswith("%") else f"{ValueText}%"
            Option["is_correct"] = Option["value"] == f"{CorrectAnswer}%"

    return {
        "question_number": 1,
        "display_type": "FINANCIAL_TABLE",
        "question_text": Prompt,
        "operands": [_PlainDecimalText(CostPrice), _PlainDecimalText(SellingPrice)],
        "operators": ["Cost Price", "Selling Price"],
        "correct_answer": f"{CorrectAnswer}{Suffix}",
        "options": Options,
        "difficulty": "COMPETITION_CHALLENGE",
        "seed": Seed,
        "metadata": {
            "conceptFamily": "PROFIT_LOSS",
            "competitionConceptKey": Prompt,
            "competitionFinancialVariant": Prompt,
            "competitionProfitLossMixedVariant": True,
        },
    }

def _ApplyMmCompetitionQuestionShaping(Question: dict[str, Any], *, SectionKey: str, ConceptTitle: str, Seed: str) -> dict[str, Any]:
    ShapedQuestion = _MmCompetitionPadVisualAddLessRows(Question, SectionKey=SectionKey, ConceptTitle=ConceptTitle, Seed=Seed)
    return ShapedQuestion


def _MmSectionCountMap(TotalQuestionCount: int, SectionCountsOverride: dict[str, int] | None = None) -> dict[str, int]:
    if SectionCountsOverride:
        return {
            Section["key"]: int(SectionCountsOverride.get(Section["key"], 0) or 0)
            for Section in MM_COMPETITION_SECTION_DEFINITIONS
        }
    Requested = max(1, int(TotalQuestionCount or DEFAULT_COMPETITION_MOCK_QUESTION_COUNT))
    Base = Requested // len(MM_COMPETITION_SECTION_DEFINITIONS)
    Remainder = Requested % len(MM_COMPETITION_SECTION_DEFINITIONS)
    return {
        Section["key"]: Base + (1 if Index < Remainder else 0)
        for Index, Section in enumerate(MM_COMPETITION_SECTION_DEFINITIONS)
    }


def _MmCompetitionDigitConfig(ConceptTitle: str, ConceptFamily: str) -> dict[str, list[int]]:
    TitleText = (
        str(ConceptTitle or "")
        .upper()
        .replace("×", " X ")
        .replace("Ã—", " X ")
        .replace("÷", " DIVISION ")
        .replace("Ã·", " DIVISION ")
    )
    Match = re.search(r"([1-9])D\s*(?:X|DIVISION)\s*([1-9])D", TitleText)
    if not Match:
        return {}
    Digits = [int(Match.group(1)), int(Match.group(2))]
    if ConceptFamily in {"WHOLE_NUMBER_MULTIPLICATION", "DECIMAL_MULTIPLICATION"}:
        return {"multiplicationDigits": Digits}
    if ConceptFamily in {"WHOLE_NUMBER_DIVISION", "DECIMAL_DIVISION"}:
        return {"divisionDigits": Digits}
    return {}


def _GenerateMmCompetitionConceptBatch(
    *,
    ModuleRecord: Module,
    LevelRecord: Level,
    LessonRecord: Lesson | None,
    SectionDefinition: dict[str, Any],
    ConceptSpec: dict[str, Any],
    RequiredCount: int,
    Seed: str,
) -> list[dict[str, Any]]:
    ConceptFamily = str(ConceptSpec["conceptFamily"])
    ConceptTitle = str(ConceptSpec["title"])
    MixedOperationGroup = str(ConceptSpec.get("mixedOperationGroup") or "")
    DigitConfig = _MmCompetitionDigitConfig(ConceptTitle, ConceptFamily)
    if SectionDefinition.get("key") == "MM_BODMAS_PERCENTAGE" and ConceptFamily == "BODMAS":
        return [
            _BuildMmCompetitionBodmasChallengeQuestion(
                Seed=f"{Seed}-BODMAS-{Index}",
                VariantIndex=Index,
            )
            for Index in range(max(RequiredCount, 1))
        ][:RequiredCount]

    if SectionDefinition.get("key") == "MM_BODMAS_PERCENTAGE" and ConceptFamily == "SOLVE_EQUATION":
        return [
            _BuildMmCompetitionSolveEquationChallengeQuestion(
                Seed=f"{Seed}-SOLVE-EQUATION-{Index}",
                VariantIndex=Index,
            )
            for Index in range(max(RequiredCount, 1))
        ][:RequiredCount]

    if SectionDefinition.get("key") == "MM_FINANCIAL" and ConceptFamily == "PROFIT_LOSS":
        return [
            _BuildMmCompetitionProfitLossQuestion(
                Seed=f"{Seed}-PROFIT-LOSS-{Index}",
                VariantTitle=ConceptTitle,
            )
            for Index in range(max(RequiredCount, 1))
        ][:RequiredCount]

    Config = MMConfig(
        ModuleCode=getattr(ModuleRecord, "module_code", "MM") or "MM",
        LevelCode=getattr(LevelRecord, "level_code", "MM-L1") or "MM-L1",
        LessonNumber=int(getattr(LessonRecord, "lesson_number", 1) or 1),
        DpsNumber=SectionDefinition["number"],
        DpsTitle=ConceptTitle,
        LessonTitle=getattr(LessonRecord, "lesson_title", "Competition Mock") or "Competition Mock",
        QuestionCount=max(RequiredCount, 1),
        Seed=Seed,
        ConceptFamily=ConceptFamily,
        OperationFocus=OperationFocusForConcept(ConceptFamily),
        DigitPattern="MASTER_MODULE",
        Difficulty="MASTER",
        GeneratorConfig={
            "source": "MM_COMPETITION_SECTION_LOCKED_GENERATOR",
            "competitionSectionKey": SectionDefinition["key"],
            "competitionSectionNumber": SectionDefinition["number"],
            "competitionSectionTitle": SectionDefinition["title"],
            "mixedOperationGroup": MixedOperationGroup,
            **DigitConfig,
            "activeSection": {
                "sectionNumber": SectionDefinition["number"],
                "sectionTitle": ConceptTitle,
                "questionCount": max(RequiredCount, 1),
                "conceptFamily": ConceptFamily,
                "mixedOperationGroup": MixedOperationGroup,
                **DigitConfig,
            },
        },
    )
    Questions = GenerateMmQuestionSet(Config)
    return Questions[:RequiredCount]


def _CollectMmCompetitionSectionLockedQuestions(
    ModuleRecord: Module,
    LevelRecord: Level,
    Lessons: list[Lesson],
    TargetQuestionCount: int,
    SectionCountsOverride: dict[str, int] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    SectionCounts = _MmSectionCountMap(TargetQuestionCount, SectionCountsOverride)
    Selected: list[dict[str, Any]] = []
    SectionCoverage: list[dict[str, Any]] = []
    UsedSignatures: set[str] = set()
    OrderedLessons = Lessons or [None]

    for SectionIndex, SectionDefinition in enumerate(MM_COMPETITION_SECTION_DEFINITIONS):
        SectionKey = SectionDefinition["key"]
        RequiredCount = int(SectionCounts.get(SectionKey, 0) or 0)
        ConceptPool = MM_COMPETITION_SECTION_CONCEPT_POOLS.get(SectionKey, [])
        SectionQuestions: list[dict[str, Any]] = []
        ConceptCoverage: dict[str, int] = defaultdict(int)
        ConceptCoverageOrder: list[str] = []
        OrderedConceptSchedule = _MmCompetitionOrderedConceptSchedule(SectionKey, ConceptPool, RequiredCount)
        Attempts = 0
        ChallengeLessons = _MmCompetitionChallengeLessons(Lessons, SectionKey) or OrderedLessons

        while len(SectionQuestions) < RequiredCount and Attempts < max(RequiredCount * 12, 48):
            if OrderedConceptSchedule:
                ConceptSpec = OrderedConceptSchedule[len(SectionQuestions)]
            else:
                ConceptSpec = ConceptPool[Attempts % len(ConceptPool)]
            LessonRecord = ChallengeLessons[(SectionIndex + Attempts) % len(ChallengeLessons)]
            Batch = _GenerateMmCompetitionConceptBatch(
                ModuleRecord=ModuleRecord,
                LevelRecord=LevelRecord,
                LessonRecord=LessonRecord,
                SectionDefinition=SectionDefinition,
                ConceptSpec=ConceptSpec,
                # Generate a full MM warm-up-to-challenge mini-set and select
                # from the challenge end. This keeps normal DPS generation
                # untouched while making competition mocks exam-worthy.
                RequiredCount=MM_COMPETITION_BATCH_SIZE,
                Seed=f"COMPETITION-MM-CHALLENGE-{SectionKey}-{ConceptSpec['conceptFamily']}-{uuid4().hex}-{Attempts}",
            )
            AcceptedFromThisTurn = False
            for Question in _MmCompetitionOrderedCandidates(Batch):
                Question = _ApplyMmCompetitionQuestionShaping(
                    Question,
                    SectionKey=SectionKey,
                    ConceptTitle=str(ConceptSpec["title"]),
                    Seed=f"MM-COMPETITION-SHAPE-{SectionKey}-{ConceptSpec['title']}-{Attempts}-{uuid4().hex}",
                )
                Signature = _QuestionSignature(Question)
                if Signature in UsedSignatures:
                    continue
                UsedSignatures.add(Signature)
                Metadata = Question.get("metadata") if isinstance(Question.get("metadata"), dict) else {}
                Metadata = dict(Metadata)
                Metadata.update({
                    "competitionConceptKey": ConceptSpec["title"],
                    "competitionConceptName": ConceptSpec["title"],
                    "competitionAllowedConceptFamily": ConceptSpec["conceptFamily"],
                    "conceptName": ConceptSpec["title"],
                    "competitionSectionKey": SectionKey,
                    "competitionSectionNumber": SectionDefinition["number"],
                    "competitionSectionTitle": SectionDefinition["title"],
                    "competitionSectionDisplayTitle": _CompetitionSectionDisplayTitle(SectionDefinition),
                    "competitionSectionLocked": True,
                    "competitionDifficultyProfile": "MM_COMPETITION_CHALLENGE",
                    "competitionChallengeLessonFloor": MM_COMPETITION_CHALLENGE_LESSON_FLOORS.get(SectionKey, 20),
                    "section_number": SectionDefinition["number"],
                    "section_title": _CompetitionSectionDisplayTitle(SectionDefinition),
                })
                QuestionCopy = dict(Question)
                QuestionCopy["metadata"] = Metadata
                SectionQuestions.append(_DecorateCompetitionSectionQuestion(QuestionCopy, SectionKey, SectionDefinition))
                ConceptName = str(ConceptSpec["title"])
                ConceptCoverage[ConceptName] += 1
                if ConceptName not in ConceptCoverageOrder:
                    ConceptCoverageOrder.append(ConceptName)
                AcceptedFromThisTurn = True
                break
            Attempts += 1
            if len(SectionQuestions) >= RequiredCount:
                break
            if not AcceptedFromThisTurn and Attempts > max(RequiredCount * 6, 24):
                break

        if len(SectionQuestions) < RequiredCount:
            api_error(
                400,
                "MM_COMPETITION_SECTION_GENERATION_INCOMPLETE",
                f"Could not generate the required {RequiredCount} questions for {SectionDefinition['title']}.",
                {
                    "sectionKey": SectionKey,
                    "required": RequiredCount,
                    "generated": len(SectionQuestions),
                },
            )

        Selected.extend(SectionQuestions)
        SectionCoverage.append({
            "sectionKey": SectionKey,
            "sectionNumber": SectionDefinition["number"],
            "sectionTitle": SectionDefinition["title"],
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
        "competitionStructure": "MM_10_SECTION_COMPETITION_MOCK_SECTION_LOCKED",
        "sectionCount": len(SectionCoverage),
        "sections": SectionCoverage,
        "generationErrors": [],
    }
    return Selected, CoveragePayload



def CompetitionMockSectionPlan(db: Session, *, LevelId: str, TotalQuestions: int | None = None) -> dict[str, Any]:
    ModuleRecord, LevelRecord, Lessons, DpsRows = _LevelRecords(db, LevelId)
    if _IsMasterModule(ModuleRecord):
        RequestedQuestionCount = int(TotalQuestions or MM_DEFAULT_COMPETITION_MOCK_QUESTION_COUNT)
        Base = RequestedQuestionCount // len(MM_COMPETITION_SECTION_DEFINITIONS)
        Remainder = RequestedQuestionCount % len(MM_COMPETITION_SECTION_DEFINITIONS)
        Sections = []
        for Index, Section in enumerate(MM_COMPETITION_SECTION_DEFINITIONS):
            Sections.append({
                "sectionKey": Section["key"],
                "sectionNumber": Section["number"],
                "sectionTitle": Section["title"],
                "questionCount": Base + (1 if Index < Remainder else 0),
                "locked": True,
            })
        return {
            "moduleId": ModuleRecord.id,
            "moduleCode": ModuleRecord.module_code,
            "moduleName": ModuleRecord.module_name,
            "levelId": LevelRecord.id,
            "levelCode": LevelRecord.level_code,
            "levelName": LevelRecord.level_name,
            "totalQuestions": RequestedQuestionCount,
            "structure": "MM_10_SECTION_COMPETITION_MOCK",
            "sections": Sections,
        }

    RequestedQuestionCount = int(TotalQuestions or DEFAULT_COMPETITION_MOCK_QUESTION_COUNT)
    SectionsByDps = _ActiveSectionsByDps(db, DpsRows)
    UniqueSections: dict[str, dict[str, Any]] = {}
    for DpsRecord in DpsRows:
        for Section in SectionsByDps.get(DpsRecord.id, []):
            Title = _NormalizeText(Section.section_title) or _NormalizeText(Section.concept_family) or DpsRecord.dps_title
            Key = Title.upper().replace(" ", "_")[:80]
            if Key not in UniqueSections:
                UniqueSections[Key] = {
                    "sectionKey": Key,
                    "sectionNumber": len(UniqueSections) + 1,
                    "sectionTitle": Title,
                    "questionCount": 0,
                    "locked": False,
                }
    if not UniqueSections:
        UniqueSections["GENERAL_COMPETITION_PRACTICE"] = {
            "sectionKey": "GENERAL_COMPETITION_PRACTICE",
            "sectionNumber": 1,
            "sectionTitle": "Competition Practice",
            "questionCount": RequestedQuestionCount,
            "locked": False,
        }
    Base = RequestedQuestionCount // len(UniqueSections)
    Remainder = RequestedQuestionCount % len(UniqueSections)
    Sections = list(UniqueSections.values())
    for Index, Section in enumerate(Sections):
        Section["questionCount"] = Base + (1 if Index < Remainder else 0)
    return {
        "moduleId": ModuleRecord.id,
        "moduleCode": ModuleRecord.module_code,
        "moduleName": ModuleRecord.module_name,
        "levelId": LevelRecord.id,
        "levelCode": LevelRecord.level_code,
        "levelName": LevelRecord.level_name,
        "totalQuestions": RequestedQuestionCount,
        "structure": "LEVEL_SECTION_COMPETITION_MOCK",
        "sections": Sections,
    }


def _NormalizeSectionCounts(SectionCounts: dict[str, Any] | None) -> dict[str, int]:
    Normalized: dict[str, int] = {}
    for Key, Value in (SectionCounts or {}).items():
        CleanKey = _NormalizeText(Key)
        if not CleanKey:
            continue
        try:
            Count = int(Value)
        except Exception:
            Count = 0
        if Count > 0:
            Normalized[CleanKey] = Count
    return Normalized


def _SafeJsonLoads(Value: str | None, Fallback: Any) -> Any:
    if not Value:
        return Fallback
    try:
        return json.loads(Value)
    except Exception:
        return Fallback


def _NormalizeText(Value: Any) -> str:
    return str(Value or "").strip()


def _NormalizedSearchText(*Values: Any) -> str:
    return " ".join(_NormalizeText(Value).lower() for Value in Values if _NormalizeText(Value))


def _IsMasterModule(ModuleRecord: Module) -> bool:
    ModuleCode = _NormalizeText(getattr(ModuleRecord, "module_code", "")).upper()
    ModuleName = _NormalizeText(getattr(ModuleRecord, "module_name", "")).lower()
    return ModuleCode == "MM" or "master module" in ModuleName


def _QuestionSourceText(Question: dict[str, Any], FallbackTitle: str) -> str:
    Metadata = Question.get("metadata") if isinstance(Question.get("metadata"), dict) else {}
    return _NormalizedSearchText(
        Metadata.get("sectionTitle"),
        Metadata.get("section_title"),
        Metadata.get("conceptFamily"),
        Metadata.get("concept_family"),
        Metadata.get("competitionConceptKey"),
        Metadata.get("sourceDpsTitle"),
        FallbackTitle,
        Question.get("question_text"),
    )


def _QuestionMetadata(Question: dict[str, Any]) -> dict[str, Any]:
    Metadata = Question.get("metadata")
    return Metadata if isinstance(Metadata, dict) else {}


def _QuestionConceptFamily(Question: dict[str, Any], FallbackTitle: str) -> str:
    Metadata = _QuestionMetadata(Question)
    RawConcept = (
        Metadata.get("concept_family")
        or Metadata.get("conceptFamily")
        or Metadata.get("competitionConceptKey")
        or FallbackTitle
    )
    return _NormalizeText(RawConcept).upper()


def _QuestionSectionTitleText(Question: dict[str, Any], FallbackTitle: str) -> str:
    Metadata = _QuestionMetadata(Question)
    return _NormalizedSearchText(
        Metadata.get("section_title"),
        Metadata.get("sectionTitle"),
        Metadata.get("source_section_title"),
        Metadata.get("sourceSectionTitle"),
        FallbackTitle,
        Question.get("question_text"),
    )


def _MmCompetitionSectionKeys(Question: dict[str, Any], FallbackTitle: str) -> list[str]:
    """Map generated MM questions into the approved 10 competition sections.

    The competition mock must reuse Learning Path Studio's MM generators while
    grouping generated questions by competition-family.  The mapping is based on
    the generator's concept-family metadata first and text only as a fallback so
    stale titles or section labels do not narrow a competition section to one
    small worksheet subtype.
    """
    ConceptFamily = _QuestionConceptFamily(Question, FallbackTitle)
    Text = _QuestionSourceText(Question, FallbackTitle)
    SectionText = _QuestionSectionTitleText(Question, FallbackTitle)

    SkillDrillFamilies = {"SKILL_STACKER", "CONCEPT_DRILL"}
    FinancialFamilies = {"SIMPLE_INTEREST", "PROFIT_LOSS", "FIND_SELLING_PRICE", "FIND_COST_PRICE"}
    BodmasPercentageFamilies = {"BODMAS", "PERCENTAGE_ADD_LESS", "PERCENTAGE_VALUE", "PERCENTAGE_INCREASE_DECREASE", "SOLVE_EQUATION"}
    PositionalFamilies = {"ANSWER_POSITION"}
    AddLessFamilies = {"ADD_LESS", "DECIMAL_ADD_LESS", "INTEGERS"}
    MultiplicationFamilies = {"WHOLE_NUMBER_MULTIPLICATION", "DECIMAL_MULTIPLICATION"}
    DivisionFamilies = {"WHOLE_NUMBER_DIVISION", "DECIMAL_DIVISION"}
    SquaresRootsFamilies = {"SQUARES", "SQUARE_ROOT"}
    CubesRootsFamilies = {"CUBES", "CUBE_ROOT"}

    if ConceptFamily in SkillDrillFamilies or any(Term in Text for Term in ["skill stacker", "concept drill"]):
        return ["MM_SKILL_DRILL"]

    if ConceptFamily in FinancialFamilies or any(Term in Text for Term in ["profit", "loss", "simple interest", "selling price", "cost price"]):
        return ["MM_FINANCIAL"]

    if ConceptFamily in BodmasPercentageFamilies or any(Term in Text for Term in ["bodmas", "percentage", "percent", "add percentage", "less percentage", "solve equation"]):
        return ["MM_BODMAS_PERCENTAGE"]

    if ConceptFamily in PositionalFamilies or any(Term in Text for Term in ["position", "placement", "natural number"]):
        return ["MM_POSITIONAL_PLACEMENT"]

    if ConceptFamily in AddLessFamilies or any(Term in Text for Term in ["add-less", "add less", "add/less", "borrowing", "integer", "fast visualisation", "fast visualization"]):
        # Both approved Add/Less competition sections must draw from the full MM
        # Add/Less family: ordinary stacks, decimals, fast visualisation,
        # integers, borrowing, exact digit sheets, and related workbook-valid
        # Add/Less variants.  Do not narrow Section 2 to only visual titles.
        return ["MM_ABACUS_ADD_LESS", "MM_VISUAL_ADD_LESS"]

    if ConceptFamily == "MULTIPLICATION_DIVISION_MIXED":
        if any(Term in SectionText for Term in ["division", "divide", "÷"]):
            return ["MM_DIVISION"]
        if any(Term in SectionText for Term in ["multiplication", " x ", "×", "times"]):
            return ["MM_MULTIPLICATION"]
        return ["MM_MULTIPLICATION", "MM_DIVISION"]

    if ConceptFamily in SquaresRootsFamilies or any(Term in Text for Term in ["square root", "squareroot", "squares"]):
        return ["MM_SQUARES_ROOTS"]

    if ConceptFamily in CubesRootsFamilies or any(Term in Text for Term in ["cube root", "cuberoot", "cubes"]):
        return ["MM_CUBES_ROOTS"]

    if ConceptFamily == "MIXED_SQUARE_CUBE":
        return ["MM_SQUARES_ROOTS", "MM_CUBES_ROOTS"]

    if ConceptFamily == "MIXED_ROOTS":
        return ["MM_SQUARES_ROOTS", "MM_CUBES_ROOTS"]

    if ConceptFamily in DivisionFamilies or any(Term in Text for Term in ["division", "÷", "divide"]):
        return ["MM_DIVISION"]

    if ConceptFamily in MultiplicationFamilies or any(Term in Text for Term in ["multiplication", "×", " x ", "times"]):
        return ["MM_MULTIPLICATION"]

    return []


def _QuestionSignature(Question: dict[str, Any]) -> str:
    Metadata = _QuestionMetadata(Question)
    return "|".join([
        _NormalizeText(Metadata.get("sourceDpsId")),
        _NormalizeText(Metadata.get("sourceQuestionNumber") or Question.get("question_number")),
        _NormalizeText(Question.get("question_text")),
        json.dumps(Question.get("operands") or [], sort_keys=True, default=str),
        json.dumps(Question.get("operators") or [], sort_keys=True, default=str),
        _NormalizeText(Question.get("correct_answer")),
    ])


def _AllocateCompetitionSectionCounts(TargetQuestionCount: int, AvailableBySection: dict[str, int]) -> dict[str, int]:
    ActiveSections = [
        Section["key"]
        for Section in MM_COMPETITION_SECTION_DEFINITIONS
        if AvailableBySection.get(Section["key"], 0) > 0
    ]
    if not ActiveSections:
        return {}

    Requested = max(1, TargetQuestionCount)
    Counts = {SectionKey: 0 for SectionKey in ActiveSections}
    Base = Requested // len(ActiveSections)
    Remainder = Requested % len(ActiveSections)
    for Index, SectionKey in enumerate(ActiveSections):
        Counts[SectionKey] = Base + (1 if Index < Remainder else 0)

    RemainingToAllocate = 0
    for SectionKey in list(Counts.keys()):
        Available = AvailableBySection.get(SectionKey, 0)
        if Counts[SectionKey] > Available:
            RemainingToAllocate += Counts[SectionKey] - Available
            Counts[SectionKey] = Available

    while RemainingToAllocate > 0:
        Added = False
        for SectionKey in ActiveSections:
            Available = AvailableBySection.get(SectionKey, 0)
            if Counts[SectionKey] < Available:
                Counts[SectionKey] += 1
                RemainingToAllocate -= 1
                Added = True
                if RemainingToAllocate <= 0:
                    break
        if not Added:
            break

    return {Key: Value for Key, Value in Counts.items() if Value > 0}


def _RoundRobinSelectFromConceptBuckets(
    ConceptBuckets: dict[str, list[dict[str, Any]]],
    RequiredCount: int,
    ExcludedSignatures: set[str] | None = None,
) -> list[dict[str, Any]]:
    Selected: list[dict[str, Any]] = []
    OrderedConcepts = sorted(ConceptBuckets.keys())
    CursorByConcept = {Concept: 0 for Concept in OrderedConcepts}
    Blocked = ExcludedSignatures or set()
    while len(Selected) < RequiredCount:
        AddedInPass = False
        for Concept in OrderedConcepts:
            Bucket = ConceptBuckets[Concept]
            Cursor = CursorByConcept[Concept]
            while Cursor < len(Bucket) and _QuestionSignature(Bucket[Cursor]) in Blocked:
                Cursor += 1
            CursorByConcept[Concept] = Cursor
            if Cursor < len(Bucket):
                Selected.append(Bucket[Cursor])
                CursorByConcept[Concept] = Cursor + 1
                AddedInPass = True
                if len(Selected) >= RequiredCount:
                    break
        if not AddedInPass:
            break
    return Selected


def _QuestionConceptKey(Question: dict[str, Any], FallbackTitle: str) -> str:
    Metadata = Question.get("metadata") if isinstance(Question.get("metadata"), dict) else {}
    # Store the actual generated concept as the question concept tag.
    # Competition section titles are grouping labels only and must not overwrite
    # concept identity in the mock preview/student-facing cards.
    return (
        _NormalizeText(Metadata.get("competitionConceptKey"))
        or _NormalizeText(Metadata.get("sourceDpsTitle"))
        or _NormalizeText(Metadata.get("conceptTitle"))
        or _NormalizeText(Metadata.get("conceptName"))
        or _NormalizeText(Metadata.get("sectionTitle"))
        or _NormalizeText(Metadata.get("section_title"))
        or _NormalizeText(Metadata.get("conceptFamily"))
        or _NormalizeText(FallbackTitle)
        or "Competition Practice"
    )


def _QuestionSectionNumber(Question: dict[str, Any], FallbackNumber: int) -> int:
    Metadata = Question.get("metadata") if isinstance(Question.get("metadata"), dict) else {}
    try:
        return int(Metadata.get("section_number") or Metadata.get("sectionNumber") or FallbackNumber)
    except Exception:
        return FallbackNumber


def _BuildMockCode(ModuleCode: str, LevelCode: str) -> str:
    Timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    Suffix = uuid4().hex[:6].upper()
    return f"CMP-{ModuleCode}-{LevelCode}-{Timestamp}-{Suffix}".replace(" ", "-")


def _LevelRecords(db: Session, LevelId: str) -> tuple[Module, Level, list[Lesson], list[DPS]]:
    LevelRecord = db.get(Level, LevelId)
    if not LevelRecord or not LevelRecord.is_active:
        api_error(404, "LEVEL_NOT_FOUND", "The selected level was not found or is inactive.")
    ModuleRecord = db.get(Module, LevelRecord.module_id)
    if not ModuleRecord or not ModuleRecord.is_active:
        api_error(404, "MODULE_NOT_FOUND", "The selected module was not found or is inactive.")

    Lessons = (
        db.query(Lesson)
        .filter(Lesson.level_id == LevelRecord.id, Lesson.is_active == True)
        .order_by(Lesson.lesson_number.asc())
        .all()
    )
    LessonIds = [LessonRecord.id for LessonRecord in Lessons]
    DpsRows = (
        db.query(DPS)
        .filter(DPS.lesson_id.in_(LessonIds), DPS.is_active == True)
        .order_by(DPS.dps_number.asc())
        .all()
        if LessonIds
        else []
    )
    if not DpsRows:
        api_error(400, "NO_DPS_FOUND", "No active DPS records were found for the selected level.")
    return ModuleRecord, LevelRecord, Lessons, DpsRows


def _ActiveSectionsByDps(db: Session, DpsRows: list[DPS]) -> dict[str, list[DPSSection]]:
    DpsIds = [Row.id for Row in DpsRows]
    Sections = (
        db.query(DPSSection)
        .filter(DPSSection.dps_id.in_(DpsIds))
        .order_by(DPSSection.section_number.asc())
        .all()
        if DpsIds
        else []
    )
    ByDps: dict[str, list[DPSSection]] = defaultdict(list)
    for Section in Sections:
        ByDps[Section.dps_id].append(Section)
    return ByDps


def _CompetitionInstructions(ModuleRecord: Module, LevelRecord: Level, TotalQuestions: int, DurationSeconds: int) -> str:
    Minutes = max(1, round(DurationSeconds / 60))
    return (
        f"Competition-style mock practice for {ModuleRecord.module_name} / {LevelRecord.level_name}. "
        f"Answer all {TotalQuestions} questions within {Minutes} minutes. "
        "Focus on speed, accuracy, time management, and calm exam temperament."
    )


def _CollectGeneratedQuestions(db: Session, ModuleRecord: Module, LevelRecord: Level, Lessons: list[Lesson], DpsRows: list[DPS], TargetQuestionCount: int, SectionCountsOverride: dict[str, int] | None = None) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    SectionsByDps = _ActiveSectionsByDps(db, DpsRows)
    GeneratedByConcept: dict[str, list[dict[str, Any]]] = defaultdict(list)
    MmGeneratedBySection: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
    CoverageRows: list[dict[str, Any]] = []
    GenerationErrors: list[dict[str, Any]] = []
    IsMmMock = _IsMasterModule(ModuleRecord)

    for DpsRecord in DpsRows:
        Seed = f"COMPETITION-MOCK-DRAFT-{DpsRecord.id}-{uuid4().hex}"
        Sections = SectionsByDps.get(DpsRecord.id, [])
        try:
            Questions = generate_preview(db, DpsRecord, Seed)
        except Exception as Error:
            GenerationErrors.append({
                "dpsId": DpsRecord.id,
                "dpsTitle": DpsRecord.dps_title,
                "error": str(Error),
            })
            continue

        for Question in Questions:
            ConceptKey = _QuestionConceptKey(Question, DpsRecord.dps_title)
            QuestionCopy = dict(Question)
            Metadata = QuestionCopy.get("metadata") if isinstance(QuestionCopy.get("metadata"), dict) else {}
            Metadata = dict(Metadata)
            Metadata.update({
                "sourceDpsId": DpsRecord.id,
                "sourceDpsTitle": DpsRecord.dps_title,
                "sourceLessonId": DpsRecord.lesson_id,
                "competitionConceptKey": ConceptKey,
            })
            QuestionCopy["metadata"] = Metadata
            if IsMmMock:
                SectionKeys = _MmCompetitionSectionKeys(QuestionCopy, DpsRecord.dps_title)
                if SectionKeys:
                    for SectionKey in SectionKeys:
                        MmGeneratedBySection[SectionKey][ConceptKey].append(dict(QuestionCopy))
                else:
                    GeneratedByConcept[ConceptKey].append(QuestionCopy)
            else:
                GeneratedByConcept[ConceptKey].append(QuestionCopy)

        CoverageRows.append({
            "dpsId": DpsRecord.id,
            "dpsNumber": DpsRecord.dps_number,
            "dpsTitle": DpsRecord.dps_title,
            "sections": [
                {
                    "sectionNumber": Section.section_number,
                    "sectionTitle": Section.section_title,
                    "conceptFamily": Section.concept_family,
                    "questionCount": Section.question_count,
                }
                for Section in Sections
            ],
            "generatedQuestionCount": len(Questions),
        })

    if IsMmMock:
        # MM competition papers are not allowed to inherit mixed/stale DPS section
        # titles and then classify later. Generate directly from the approved
        # 8-section competition whitelist so every section receives only the
        # concepts that belong to that section.
        return _CollectMmCompetitionSectionLockedQuestions(
            ModuleRecord,
            LevelRecord,
            Lessons,
            TargetQuestionCount,
            SectionCountsOverride,
        )

    if not GeneratedByConcept:
        api_error(
            400,
            "COMPETITION_GENERATION_EMPTY",
            "No competition mock questions could be generated for this level.",
            {"generationErrors": GenerationErrors},
        )

    OrderedConcepts = sorted(GeneratedByConcept.keys())
    Selected = []
    CursorByConcept = {Concept: 0 for Concept in OrderedConcepts}

    while len(Selected) < TargetQuestionCount:
        AddedInPass = False
        for Concept in OrderedConcepts:
            Bucket = GeneratedByConcept[Concept]
            Cursor = CursorByConcept[Concept]
            if Cursor < len(Bucket):
                Selected.append(Bucket[Cursor])
                CursorByConcept[Concept] = Cursor + 1
                AddedInPass = True
                if len(Selected) >= TargetQuestionCount:
                    break
        if not AddedInPass:
            break

    if not Selected:
        api_error(400, "COMPETITION_GENERATION_EMPTY", "No competition mock questions were selected.")

    CoveragePayload = {
        "targetQuestionCount": TargetQuestionCount,
        "selectedQuestionCount": len(Selected),
        "conceptCount": len(OrderedConcepts),
        "concepts": [
            {"conceptName": Concept, "availableQuestionCount": len(GeneratedByConcept[Concept])}
            for Concept in OrderedConcepts
        ],
        "dpsCoverage": CoverageRows,
        "generationErrors": GenerationErrors,
    }
    return Selected, CoveragePayload




def _PlainDecimalText(Value: Decimal) -> str:
    if Value == Value.to_integral_value():
        return str(int(Value))
    Text = format(Value.normalize(), "f")
    if "." in Text:
        Text = Text.rstrip("0").rstrip(".")
    return "0" if Text in {"", "-0"} else Text


def _WorkbookPositionAnswerForDigits(NumberText: str, Position: int) -> Decimal:
    CleanDigits = "".join(Character for Character in str(NumberText) if Character.isdigit()) or "0"
    DigitCount = len(CleanDigits)
    NumberValue = Decimal(CleanDigits)
    Exponent = int(Position) - DigitCount
    if Exponent >= 0:
        return NumberValue * (Decimal(10) ** Exponent)
    return NumberValue / (Decimal(10) ** abs(Exponent))


def _BuildSameDigitPositionOptions(Question: dict[str, Any]) -> list[dict[str, Any]] | None:
    """Build smart same-digit distractors for Write Number From Given Position.

    In competition mocks the student must solve the place-value task.  Options
    that mutate 5809 into 4809/6809 let students pattern-spot without solving,
    so every option here preserves the exact source digit sequence and varies
    only the decimal/place-value placement.
    """
    Metadata = Question.get("metadata") if isinstance(Question.get("metadata"), dict) else {}
    Mode = str(Metadata.get("answer_position_mode") or "").upper()
    QuestionText = str(Question.get("question_text") or "").lower()
    Operators = [str(Value or "").strip().lower() for Value in (Question.get("operators") or [])]
    ConceptText = _NormalizedSearchText(
        Metadata.get("competitionConceptKey"),
        Metadata.get("conceptTitle"),
        Metadata.get("conceptName"),
        Metadata.get("sectionTitle"),
        Metadata.get("section_title"),
        Question.get("display_type"),
    )
    IsWriteNumberQuestion = (
        Mode == "WRITE_NUMBER_FROM_GIVEN_POSITION_TABLE"
        or ("write" in QuestionText and "given position" in QuestionText)
        or Operators[:2] == ["position", "number"]
        or "write number" in ConceptText
        or "given position" in ConceptText
    )
    if not IsWriteNumberQuestion:
        return None

    Operands = Question.get("operands") or []
    if len(Operands) < 2:
        return None

    try:
        CorrectPosition = int(Operands[0])
    except Exception:
        CorrectPosition = int(Metadata.get("position") or 0)

    SourceNumber = str(
        Metadata.get("source_number")
        or Metadata.get("sourceNumber")
        or Metadata.get("number")
        or Operands[1]
        or ""
    ).strip()
    SourceDigits = "".join(Character for Character in SourceNumber if Character.isdigit())
    if not SourceDigits:
        return None

    CorrectValue = _WorkbookPositionAnswerForDigits(SourceDigits, CorrectPosition)
    CorrectText = _PlainDecimalText(CorrectValue)
    CandidatePositions = [
        CorrectPosition,
        CorrectPosition + 1,
        CorrectPosition - 1,
        CorrectPosition + 2,
        CorrectPosition - 2,
        CorrectPosition + 3,
        CorrectPosition - 3,
        0,
        1,
        -1,
        2,
        -2,
    ]

    Values: list[str] = []
    for CandidatePosition in CandidatePositions:
        CandidateText = _PlainDecimalText(_WorkbookPositionAnswerForDigits(SourceDigits, CandidatePosition))
        if CandidateText not in Values:
            Values.append(CandidateText)
        if len(Values) >= 6:
            break

    if CorrectText not in Values:
        Values.insert(0, CorrectText)

    Distractors = [Value for Value in Values if Value != CorrectText][:3]
    if len(Distractors) < 3:
        return None

    OptionValues = [CorrectText] + Distractors[:3]
    Rng = random.Random(str(Question.get("seed") or "MM-COMPETITION-POSITION-OPTIONS"))
    Rng.shuffle(OptionValues)
    Labels = ["A", "B", "C", "D"]
    return [
        {
            "label": Labels[Index],
            "value": Value,
            "is_correct": Value == CorrectText,
            "display_order": Index + 1,
        }
        for Index, Value in enumerate(OptionValues)
    ]


def _ApplyMmCompetitionOptionQualityGuards(Question: dict[str, Any]) -> dict[str, Any]:
    UpdatedQuestion = dict(Question)
    SameDigitOptions = _BuildSameDigitPositionOptions(UpdatedQuestion)
    if SameDigitOptions:
        UpdatedQuestion["options"] = SameDigitOptions
        UpdatedQuestion["correct_answer"] = next(Option["value"] for Option in SameDigitOptions if Option["is_correct"])
    return UpdatedQuestion


def _StoreQuestionOptions(db: Session, QuestionRecord: CompetitionMockQuestion, Options: list[dict[str, Any]]) -> None:
    Labels = ["A", "B", "C", "D", "E", "F"]
    for Index, Option in enumerate(Options or []):
        Label = _NormalizeText(Option.get("label")) or Labels[Index] if Index < len(Labels) else str(Index + 1)
        db.add(CompetitionMockQuestionOption(
            mock_question_id=QuestionRecord.id,
            option_label=Label[:1],
            option_value=str(Option.get("value", "")),
            is_correct=bool(Option.get("is_correct")),
            display_order=int(Option.get("display_order") or Index + 1),
        ))




def _NormalizeMockCodeInput(MockCode: str | None) -> str | None:
    RawValue = _NormalizeText(MockCode)
    if not RawValue:
        return None
    NormalizedValue = re.sub(r"\s+", "-", RawValue.strip()).upper()
    if not re.fullmatch(r"[A-Z0-9_-]{2,25}", NormalizedValue):
        api_error(400, "INVALID_MOCK_CODE", "Mock code must be 2-25 characters using only A-Z, 0-9, hyphen, or underscore.")
    return NormalizedValue


def _EnsureUniqueMockCode(db: Session, *, LevelId: str, MockCode: str) -> None:
    ExistingRecord = (
        db.query(CompetitionMockExam)
        .filter(CompetitionMockExam.level_id == LevelId, CompetitionMockExam.mock_code == MockCode)
        .first()
    )
    if ExistingRecord:
        api_error(400, "DUPLICATE_MOCK_CODE", "This mock code already exists for the selected level. Please use a different code.")
def GenerateCompetitionMockDraft(
    db: Session,
    *,
    LevelId: str,
    CreatedBy: User,
    Title: str | None = None,
    MockCode: str | None = None,
    TotalQuestions: int | None = None,
    DurationSeconds: int | None = None,
    CompetitionScope: str = "GENERAL",
    DifficultyBand: str = "COMPETITION",
    SectionCounts: dict[str, Any] | None = None,
) -> dict[str, Any]:
    ModuleRecord, LevelRecord, Lessons, DpsRows = _LevelRecords(db, LevelId)
    SectionCountsOverride = _NormalizeSectionCounts(SectionCounts)
    IsMmMock = _IsMasterModule(ModuleRecord)
    DefaultQuestionCount = MM_DEFAULT_COMPETITION_MOCK_QUESTION_COUNT if IsMmMock else DEFAULT_COMPETITION_MOCK_QUESTION_COUNT
    DefaultDurationSeconds = MM_DEFAULT_COMPETITION_MOCK_DURATION_SECONDS if IsMmMock else DEFAULT_COMPETITION_MOCK_DURATION_SECONDS
    RequestedQuestionCount = int(TotalQuestions or sum(SectionCountsOverride.values()) or DefaultQuestionCount)
    if RequestedQuestionCount < 10:
        api_error(400, "INVALID_QUESTION_COUNT", "Competition mock exams must contain at least 10 questions.")
    if RequestedQuestionCount > 150:
        api_error(400, "INVALID_QUESTION_COUNT", "Competition mock exams cannot exceed 150 questions in this package.")

    RequestedDurationSeconds = int(DurationSeconds or DefaultDurationSeconds)
    if RequestedDurationSeconds < 300:
        api_error(400, "INVALID_DURATION", "Competition mock duration must be at least 5 minutes.")

    if SectionCountsOverride:
        RequestedQuestionCount = sum(SectionCountsOverride.values())
    SelectedQuestions, CoveragePayload = _CollectGeneratedQuestions(db, ModuleRecord, LevelRecord, Lessons, DpsRows, RequestedQuestionCount, SectionCountsOverride)
    ActualQuestionCount = len(SelectedQuestions)
    DisplayMockCode = _NormalizeMockCodeInput(MockCode) or _BuildMockCode(ModuleRecord.module_code, LevelRecord.level_code)
    _EnsureUniqueMockCode(db, LevelId=LevelRecord.id, MockCode=DisplayMockCode)
    MockTitle = Title or f"{LevelRecord.level_code} Competition Mock Practice {datetime.now(timezone.utc).strftime('%d %b %Y %H:%M')}"

    ExamRecord = CompetitionMockExam(
        title=MockTitle,
        mock_code=DisplayMockCode,
        module_id=ModuleRecord.id,
        level_id=LevelRecord.id,
        competition_scope=CompetitionScope or "GENERAL",
        difficulty_band=DifficultyBand or "COMPETITION",
        total_questions=ActualQuestionCount,
        total_marks=ActualQuestionCount * DEFAULT_COMPETITION_MARKS_PER_QUESTION,
        marks_per_question=DEFAULT_COMPETITION_MARKS_PER_QUESTION,
        duration_seconds=RequestedDurationSeconds,
        status="DRAFT",
        instructions=_CompetitionInstructions(ModuleRecord, LevelRecord, ActualQuestionCount, RequestedDurationSeconds),
        syllabus_coverage_json=json.dumps(CoveragePayload),
        generation_config_json=json.dumps({
            "engine": "COMPETITION_MOCK_GENERATOR_FOUNDATION",
            "requestedQuestionCount": RequestedQuestionCount,
            "actualQuestionCount": ActualQuestionCount,
            "source": "LEVEL_DPS_GENERATORS",
            "competitionStructure": CoveragePayload.get("competitionStructure", "BALANCED_CONCEPT_ROTATION"),
            "sectionCounts": SectionCountsOverride,
        }),
        created_by_user_id=CreatedBy.id if CreatedBy else None,
        is_active=True,
    )
    db.add(ExamRecord)
    db.flush()

    ConceptSectionNumbers: dict[str, int] = {}
    for Index, RawQuestion in enumerate(SelectedQuestions, start=1):
        Question = _ApplyMmCompetitionOptionQualityGuards(RawQuestion) if _IsMasterModule(ModuleRecord) else RawQuestion
        Metadata = Question.get("metadata") if isinstance(Question.get("metadata"), dict) else {}
        ConceptKey = _QuestionConceptKey(Question, f"Section {Index}")
        ExistingSectionNumber = Metadata.get("competitionSectionNumber")
        ExistingSectionTitle = _NormalizeText(Metadata.get("competitionSectionTitle"))
        if ExistingSectionNumber and ExistingSectionTitle:
            try:
                SectionNumber = int(ExistingSectionNumber)
            except Exception:
                SectionNumber = len(ConceptSectionNumbers) + 1
            SectionTitle = ExistingSectionTitle
        else:
            if ConceptKey not in ConceptSectionNumbers:
                ConceptSectionNumbers[ConceptKey] = len(ConceptSectionNumbers) + 1
            SectionNumber = ConceptSectionNumbers[ConceptKey]
            SectionTitle = ConceptKey
        QuestionMetadata = dict(Metadata)
        QuestionMetadata.update({
            "competitionSectionNumber": SectionNumber,
            "competitionSectionTitle": SectionTitle,
            "sourceQuestionNumber": Question.get("question_number"),
        })
        QuestionRecord = CompetitionMockQuestion(
            mock_exam_id=ExamRecord.id,
            section_number=SectionNumber,
            section_title=SectionTitle,
            question_number=Index,
            display_type=str(Question.get("display_type") or "VERTICAL"),
            question_text=Question.get("question_text"),
            operands_json=json.dumps(Question.get("operands") or []),
            operators_json=json.dumps(Question.get("operators") or []),
            correct_answer=str(Question.get("correct_answer")),
            explanation=Question.get("explanation"),
            difficulty=str(Question.get("difficulty") or DifficultyBand or "COMPETITION"),
            concept_family=str(Metadata.get("conceptFamily") or Metadata.get("concept_family") or ConceptKey)[:100],
            concept_tag=ConceptKey[:100],
            source_type="LEVEL_DPS_GENERATOR",
            source_reference_id=str(Metadata.get("sourceDpsId") or ""),
            seed=str(Question.get("seed") or ""),
            marks=DEFAULT_COMPETITION_MARKS_PER_QUESTION,
            metadata_json=json.dumps(QuestionMetadata),
        )
        db.add(QuestionRecord)
        db.flush()
        _StoreQuestionOptions(db, QuestionRecord, Question.get("options") or [])

    db.commit()
    db.refresh(ExamRecord)
    return CompetitionMockExamPayload(db, ExamRecord, IncludeQuestions=True)



def DeleteCompetitionMockExam(db: Session, *, MockExamId: str) -> dict[str, Any]:
    ExamRecord = db.get(CompetitionMockExam, MockExamId)
    if not ExamRecord:
        api_error(404, "COMPETITION_MOCK_NOT_FOUND", "Competition mock exam was not found.")

    Questions = db.query(CompetitionMockQuestion).filter(CompetitionMockQuestion.mock_exam_id == MockExamId).all()
    QuestionIds = [Question.id for Question in Questions]
    Assignments = db.query(CompetitionMockAssignment).filter(CompetitionMockAssignment.mock_exam_id == MockExamId).all()
    AssignmentIds = [Assignment.id for Assignment in Assignments]
    Attempts = db.query(CompetitionMockAttempt).filter(CompetitionMockAttempt.mock_exam_id == MockExamId).all()
    AttemptIds = [Attempt.id for Attempt in Attempts]

    DeletedSummary = {
        "mockExamId": MockExamId,
        "title": ExamRecord.title,
        "questionsDeleted": len(QuestionIds),
        "assignmentsDeleted": len(AssignmentIds),
        "attemptsDeleted": len(AttemptIds),
    }

    if AttemptIds:
        db.query(CompetitionMockResultSummary).filter(CompetitionMockResultSummary.mock_attempt_id.in_(AttemptIds)).delete(synchronize_session=False)
        db.query(CompetitionMockAttemptAnswer).filter(CompetitionMockAttemptAnswer.mock_attempt_id.in_(AttemptIds)).delete(synchronize_session=False)
    if QuestionIds:
        db.query(CompetitionMockQuestionOption).filter(CompetitionMockQuestionOption.mock_question_id.in_(QuestionIds)).delete(synchronize_session=False)
    db.query(CompetitionMockAttempt).filter(CompetitionMockAttempt.mock_exam_id == MockExamId).delete(synchronize_session=False)
    db.query(CompetitionMockAssignment).filter(CompetitionMockAssignment.mock_exam_id == MockExamId).delete(synchronize_session=False)
    db.query(CompetitionMockQuestion).filter(CompetitionMockQuestion.mock_exam_id == MockExamId).delete(synchronize_session=False)
    db.delete(ExamRecord)
    db.commit()
    return DeletedSummary


def ArchiveCompetitionMockExam(db: Session, *, MockExamId: str) -> dict[str, Any]:
    ExamRecord = db.get(CompetitionMockExam, MockExamId)
    if not ExamRecord or not ExamRecord.is_active:
        api_error(404, "COMPETITION_MOCK_NOT_FOUND", "Competition mock exam was not found.")

    ExamRecord.status = "ARCHIVED"
    ExamRecord.archived_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ExamRecord)
    return CompetitionMockExamPayload(db, ExamRecord, IncludeQuestions=False)

def CompetitionMockExamPayload(db: Session, ExamRecord: CompetitionMockExam, IncludeQuestions: bool = False) -> dict[str, Any]:
    ModuleRecord = db.get(Module, ExamRecord.module_id)
    LevelRecord = db.get(Level, ExamRecord.level_id)
    Payload: dict[str, Any] = {
        "mockExamId": ExamRecord.id,
        "mockCode": ExamRecord.mock_code,
        "title": ExamRecord.title,
        "moduleId": ExamRecord.module_id,
        "moduleCode": ModuleRecord.module_code if ModuleRecord else None,
        "moduleName": ModuleRecord.module_name if ModuleRecord else None,
        "levelId": ExamRecord.level_id,
        "levelCode": LevelRecord.level_code if LevelRecord else None,
        "levelName": LevelRecord.level_name if LevelRecord else None,
        "competitionScope": ExamRecord.competition_scope,
        "difficultyBand": ExamRecord.difficulty_band,
        "totalQuestions": ExamRecord.total_questions,
        "totalMarks": ExamRecord.total_marks,
        "marksPerQuestion": ExamRecord.marks_per_question,
        "durationSeconds": ExamRecord.duration_seconds,
        "status": ExamRecord.status,
        "instructions": ExamRecord.instructions,
        "syllabusCoverage": _SafeJsonLoads(ExamRecord.syllabus_coverage_json, {}),
        "generationConfig": _SafeJsonLoads(ExamRecord.generation_config_json, {}),
        "createdAt": ExamRecord.created_at.isoformat() if ExamRecord.created_at else None,
        "updatedAt": ExamRecord.updated_at.isoformat() if ExamRecord.updated_at else None,
        "archivedAt": ExamRecord.archived_at.isoformat() if ExamRecord.archived_at else None,
    }
    if IncludeQuestions:
        Questions = (
            db.query(CompetitionMockQuestion)
            .filter(CompetitionMockQuestion.mock_exam_id == ExamRecord.id)
            .order_by(CompetitionMockQuestion.question_number.asc())
            .all()
        )
        OptionsByQuestion: dict[str, list[CompetitionMockQuestionOption]] = defaultdict(list)
        if Questions:
            Options = (
                db.query(CompetitionMockQuestionOption)
                .filter(CompetitionMockQuestionOption.mock_question_id.in_([Question.id for Question in Questions]))
                .order_by(CompetitionMockQuestionOption.display_order.asc())
                .all()
            )
            for Option in Options:
                OptionsByQuestion[Option.mock_question_id].append(Option)
        Payload["questions"] = [
            {
                "mockQuestionId": Question.id,
                "sectionNumber": Question.section_number,
                "sectionTitle": Question.section_title,
                "questionNumber": Question.question_number,
                "displayType": Question.display_type,
                "questionText": Question.question_text,
                "operands": _SafeJsonLoads(Question.operands_json, []),
                "operators": _SafeJsonLoads(Question.operators_json, []),
                "correctAnswer": Question.correct_answer,
                "difficulty": Question.difficulty,
                "conceptFamily": Question.concept_family,
                "conceptTag": Question.concept_tag,
                "options": [
                    {
                        "optionId": Option.id,
                        "label": Option.option_label,
                        "value": Option.option_value,
                        "isCorrect": Option.is_correct,
                        "displayOrder": Option.display_order,
                    }
                    for Option in OptionsByQuestion.get(Question.id, [])
                ],
            }
            for Question in Questions
        ]
    return Payload


def ListCompetitionMockDrafts(db: Session, LevelId: str | None = None) -> list[dict[str, Any]]:
    Query = db.query(CompetitionMockExam).filter(CompetitionMockExam.is_active == True)
    if LevelId:
        Query = Query.filter(CompetitionMockExam.level_id == LevelId)
    Rows = Query.order_by(CompetitionMockExam.created_at.desc()).limit(100).all()
    return [CompetitionMockExamPayload(db, Row, IncludeQuestions=False) for Row in Rows]
