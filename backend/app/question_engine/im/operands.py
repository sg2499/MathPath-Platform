"""Intermediate Module Level 4 question-generation formulas.

Every formula in this file was independently verified against LEVEL 8.xlsx's own
embedded answer-key formulas (not just the cached values) before being written
here:
  - Concept Drill: FROM mod LESS (workbook cell formula =MOD(...)).
  - Skill Stacker: ADD x 2^(TIMES-1) (workbook cell formula =...*POWER(2,...)).
  - Write the Number From the Given Position: digitstring_as_integer x
    10^(position - digit_count), verified against 39/40 real workbook instances.
  - Find the Position of the First Natural Number: the exact inverse of the
    above, verified against 15/15 real workbook instances.
  - Division: the workbook itself generates clean dividends via
    "pick a divisor, multiply by a small random whole factor" -- the division
    generator below reproduces that same strategy from first principles.

This module does not import anything from app.question_engine.mm. Intermediate
Module has its own identity in the curriculum hierarchy and its own tuned
ranges (drawn from the actual observed values across all 60 IM Level 4 DPS),
not Master Module's wider "MASTER" ranges.
"""

import random
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_UP

from app.question_engine.im.config import IMConfig


# ---------------------------------------------------------------------------
# Small shared helpers
# ---------------------------------------------------------------------------

def _DigitRange(Digits: int) -> tuple[int, int]:
    Digits = max(1, Digits)
    if Digits == 1:
        return 1, 9
    return 10 ** (Digits - 1), (10 ** Digits) - 1


def _Quantize(Value: Decimal, Places: int) -> Decimal:
    if Places <= 0:
        return Value.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return Value.quantize(Decimal("1").scaleb(-Places), rounding=ROUND_HALF_UP)


def _Display(Value: Decimal) -> int | float:
    if Value == Value.to_integral_value():
        return int(Value)
    return float(Value.normalize())


# ---------------------------------------------------------------------------
# Add/Less, Decimal Add/Less, and Borrowing (all share one running-sum shape)
# ---------------------------------------------------------------------------

def _AddLessRowPlan(Config: IMConfig) -> tuple[int, int, int]:
    """Return (row_count, magnitude_min, magnitude_max) for this section."""
    GeneratorConfig = Config.GeneratorConfig if isinstance(Config.GeneratorConfig, dict) else {}
    ExplicitDigits = GeneratorConfig.get("explicitDigitCount")
    if ExplicitDigits:
        Minimum, Maximum = _DigitRange(int(ExplicitDigits))
        RowCount = 3 if int(ExplicitDigits) >= 6 else 4
        return RowCount, Minimum, Maximum

    IsDecimal = bool(GeneratorConfig.get("isDecimal"))
    BorrowingMode = GeneratorConfig.get("borrowingMode")
    if BorrowingMode:
        # Workbook borrowing rows sit in the 100-999 band (3-digit) so a mix of
        # signs can plausibly cross zero either way.
        return 3, 100, 999
    if IsDecimal:
        # Workbook decimal add/less rows: 4 stacked addends, magnitude ~10-999
        # before the decimal point, 2 decimal places.
        return 4, 10, 999
    # Plain whole-number Add/Less (e.g. Lesson 6 DPS3/5, Lesson 9 DPS1): 5 rows,
    # 3-digit magnitude.
    return 5, 100, 999


def GenerateAddLess(Config: IMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    GeneratorConfig = Config.GeneratorConfig if isinstance(Config.GeneratorConfig, dict) else {}
    IsDecimal = bool(GeneratorConfig.get("isDecimal")) or Config.ConceptFamily == "DECIMAL_ADD_LESS"
    Places = int(GeneratorConfig.get("decimalPlaces") or (2 if IsDecimal else 0))
    RowCount, Minimum, Maximum = _AddLessRowPlan(Config)
    BorrowingMode = GeneratorConfig.get("borrowingMode")

    # Sign/magnitude bias, calibrated against real workbook column sums (not
    # assumed): hand-computing the actual answer-key columns for several
    # "Negative Answers" / "Negative/Positive Answers" DPS sheets showed sums
    # landing negative 70-100% of the time (e.g. Lesson 7 DPS-1: 10/10 negative;
    # Lesson 1 DPS-5: 7/10; Lesson 4 DPS-5: 7/10) -- these sections are built to
    # reliably produce negative (borrowing) results, not an even split. A flat
    # 50/50 or majority-positive draw (the original implementation) gets this
    # backwards. NegativeProbability=0.9 with a max-of-two draw for the negative
    # magnitude (stays within the same digit range, just biased toward its top
    # end) reproduces that same skew without ever exceeding the digit ceiling.
    NegativeProbability = 0.9 if BorrowingMode else 0.22

    Values: list[Decimal] = []
    for RowIndex in range(RowCount):
        if RowIndex == 0:
            Sign = 1
            Magnitude = Decimal(Rng.randint(Minimum, Maximum))
        else:
            Sign = -1 if Rng.random() < NegativeProbability else 1
            if Sign == -1 and BorrowingMode:
                Magnitude = Decimal(max(Rng.randint(Minimum, Maximum), Rng.randint(Minimum, Maximum)))
            else:
                Magnitude = Decimal(Rng.randint(Minimum, Maximum))
        if Places:
            Magnitude = Magnitude + (Decimal(Rng.randint(0, (10 ** Places) - 1)) / Decimal(10 ** Places))
        Values.append(Magnitude * Sign)

    CorrectAnswer = _Quantize(sum(Values, Decimal(0)), Places)
    Operators = ["" if Index == 0 else ("+" if Value >= 0 else "-") for Index, Value in enumerate(Values)]
    # Match the workbook's own display convention: magnitudes shown positive,
    # sign carried by the operator (except the first, unsigned, row).
    DisplayOperands: list[int | float | str]
    if Places:
        DisplayOperands = [f"{abs(Value):.{Places}f}" for Value in Values]
    else:
        DisplayOperands = [_Display(abs(Value)) for Value in Values]

    return DisplayOperands, Operators, CorrectAnswer, {
        "question_text": "Add/Less",
        "decimal_places": Places,
        "row_count": RowCount,
    }


# ---------------------------------------------------------------------------
# Multiplication / Division (whole numbers only anywhere in IM Level 4)
# ---------------------------------------------------------------------------

def _IsTrivial(Value: int) -> bool:
    # Avoid operands that are suspiciously round (all-zero tail) too often --
    # a light quality guard, not a workbook rule.
    return Value % 100 == 0 and Value >= 100


def GenerateWholeNumberMultiplication(Config: IMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    GeneratorConfig = Config.GeneratorConfig if isinstance(Config.GeneratorConfig, dict) else {}
    LeftDigits, RightDigits = GeneratorConfig.get("multiplicationDigits") or (2, 2)
    LeftMin, LeftMax = _DigitRange(int(LeftDigits))
    RightMin, RightMax = _DigitRange(int(RightDigits))

    Left = Right = 0
    for _Attempt in range(60):
        Left = Rng.randint(LeftMin, LeftMax)
        Right = Rng.randint(RightMin, RightMax)
        if not (_IsTrivial(Left) and _IsTrivial(Right)):
            break

    CorrectAnswer = Decimal(Left * Right)
    # No question_text here on purpose: the frontend's EXPRESSION_WORKSHEET renderer
    # (MathQuestionDisplay.tsx) prefers questionText over building the expression from
    # operands/operators when questionText is present. A generic label like
    # "Multiplication" here would silently replace the actual "3242 × 7 = ?" expression
    # with just the word "Multiplication" -- exactly the bug this fixes. Leaving
    # question_text unset lets the frontend build the real expression from operands.
    return [Left, Right], ["", "×"], CorrectAnswer, {
        "left_digits": int(LeftDigits),
        "right_digits": int(RightDigits),
    }


def TruncateThenRoundQuotient(ExactQuotient: Decimal) -> Decimal:
    """The "Long Division & Estimation" rounding rule (Shailesh's spec,
    2026-07-15): a student works the division out by hand to 3 decimal places
    -- truncated, not rounded, since that's the literal next digit long
    division produces -- then rounds that 3-decimal figure to 2 decimal places
    using the standard rule on the 3rd decimal digit (< 5 rounds down, >= 5
    rounds up). Worked example: 415 / 7 = 59.285714... -> truncate to 59.285
    -> 3rd decimal is 5 -> rounds up to 59.29. Exported (no leading
    underscore) because im/validators.py needs the exact same rounding to
    check a submitted answer.
    """
    ThreeDecimalPlaces = ExactQuotient.quantize(Decimal("0.001"), rounding=ROUND_DOWN)
    return ThreeDecimalPlaces.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _GenerateLongDivisionEstimationPair(
    Rng: random.Random, DividendMin: int, DividendMax: int, DivisorMin: int, DivisorMax: int,
) -> tuple[int, int]:
    """Long Division & Estimation is a distinct concept from plain division:
    the whole point is practicing long division out to a remainder and
    rounding the result (see TruncateThenRoundQuotient), so -- unlike plain
    division -- the dividend must NOT divide evenly. Digit-pattern-agnostic on
    purpose (works for 3D/1D, 4D/1D today, and any future digit pattern or
    level whose curriculum map sets isLongDivisionEstimation=True) -- callers
    control the exact digit ranges, this only enforces "has a remainder."
    """
    Divisor = max(DivisorMin, 2)
    Dividend = min(DividendMax, max(DividendMin, Divisor + 1))
    if Dividend % Divisor == 0:
        Dividend = min(DividendMax, Dividend + 1)

    for _Attempt in range(120):
        CandidateDivisor = Rng.randint(DivisorMin, DivisorMax)
        if CandidateDivisor <= 1:
            continue
        CandidateDividend = Rng.randint(DividendMin, DividendMax)
        if CandidateDividend % CandidateDivisor == 0:
            continue  # exact division defeats the purpose of this concept
        if _IsTrivial(CandidateDividend):
            continue
        Divisor, Dividend = CandidateDivisor, CandidateDividend
        break

    return Dividend, Divisor


def GenerateWholeNumberDivision(Config: IMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    """Plain division reproduces the workbook's own dividend-generation
    strategy from first principles: pick a divisor within its digit range,
    then pick a quotient that keeps the dividend inside its own digit range,
    and multiply -- guaranteeing a clean, remainder-free division every time,
    exactly the way LEVEL 8.xlsx's own RANDBETWEEN-driven cells do it.

    Long Division & Estimation (isLongDivisionEstimation=True, currently the
    3D/1D and 4D/1D sections per curriculum_map.py's _DIV() calls) is
    deliberately different: the dividend must NOT divide evenly, and the
    answer is the quotient rounded per TruncateThenRoundQuotient rather than
    a whole number. See that function's docstring for the exact rule and
    worked example (Shailesh, 2026-07-15).
    """
    GeneratorConfig = Config.GeneratorConfig if isinstance(Config.GeneratorConfig, dict) else {}
    DividendDigits, DivisorDigits = GeneratorConfig.get("divisionDigits") or (4, 2)
    DivisorMin, DivisorMax = _DigitRange(int(DivisorDigits))
    DividendMin, DividendMax = _DigitRange(int(DividendDigits))
    IsLongDivisionEstimation = bool(GeneratorConfig.get("isLongDivisionEstimation"))

    if IsLongDivisionEstimation:
        Dividend, Divisor = _GenerateLongDivisionEstimationPair(
            Rng, DividendMin, DividendMax, DivisorMin, DivisorMax
        )
        CorrectAnswer = TruncateThenRoundQuotient(Decimal(Dividend) / Decimal(Divisor))
    else:
        Divisor = max(DivisorMin, 2)
        Quotient = max(DividendMin // Divisor, 2)
        Dividend = Divisor * Quotient

        for _Attempt in range(120):
            Divisor = Rng.randint(DivisorMin, DivisorMax)
            if Divisor <= 1:
                continue
            MinQuotient = max(2, -(-DividendMin // Divisor))
            MaxQuotient = DividendMax // Divisor
            if MinQuotient > MaxQuotient:
                continue
            Quotient = Rng.randint(MinQuotient, MaxQuotient)
            Dividend = Divisor * Quotient
            if DividendMin <= Dividend <= DividendMax and not _IsTrivial(Dividend):
                break

        CorrectAnswer = Decimal(Quotient)

    # See the comment in GenerateWholeNumberMultiplication: no question_text on
    # purpose, so the frontend builds "2236 ÷ 52 = ?" from operands instead of
    # displaying a bare "Division" label.
    return [Dividend, Divisor], ["", "÷"], CorrectAnswer, {
        "dividend_digits": int(DividendDigits),
        "divisor_digits": int(DivisorDigits),
        "is_long_division_estimation": IsLongDivisionEstimation,
    }


# ---------------------------------------------------------------------------
# Squares
# ---------------------------------------------------------------------------

def GenerateSquares(Config: IMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    Base = Rng.randint(11, 99)
    CorrectAnswer = Decimal(Base * Base)
    # No question_text here either -- same bug class as multiplication/division.
    # The single preformatted operand "(45)²" is exactly what COMPACT_EXPRESSION's
    # BuildExpression() fallback needs; a "Square" label would hide it.
    return [f"({Base})²"], [""], CorrectAnswer, {"base": Base}


# ---------------------------------------------------------------------------
# Skill Stacker: ADD x 2^(TIMES-1)
# ---------------------------------------------------------------------------

def GenerateSkillStacker(Config: IMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    Times = Rng.choice([8, 9, 10, 11, 12])
    if Rng.random() < 0.4:
        AddValue = Decimal(Rng.randint(400, 8000)) / Decimal(100)  # e.g. 4.00-80.00
        AddValue = AddValue.quantize(Decimal("0.01"))
    else:
        AddValue = Decimal(Rng.randint(4, 80))

    CorrectAnswer = AddValue * (Decimal(2) ** (Times - 1))
    return [_Display(AddValue), Times], ["Add", "Times"], CorrectAnswer, {
        "question_text": "Skill Stacker",
    }


# ---------------------------------------------------------------------------
# Concept Drill: FROM mod LESS
# ---------------------------------------------------------------------------

def GenerateConceptDrill(Config: IMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    GeneratorConfig = Config.GeneratorConfig if isinstance(Config.GeneratorConfig, dict) else {}
    UseDecimalFrom = bool(GeneratorConfig.get("allowDecimalFrom")) and QuestionNumber % 2 == 0

    if UseDecimalFrom:
        FromValue = Decimal(Rng.randint(10000, 999999)) / Decimal(100)  # e.g. 100.00-9999.99
        FromValue = FromValue.quantize(Decimal("0.01"))
        LessValue = Decimal(Rng.randint(2000, 9500)) / Decimal(100)
        LessValue = LessValue.quantize(Decimal("0.01"))
        if LessValue <= 0:
            LessValue = Decimal("1.00")
        StepsHigh = int(FromValue // LessValue)
        if StepsHigh < 1:
            LessValue = (FromValue / Decimal(12)).quantize(Decimal("0.01"))
        CorrectAnswer = FromValue - (LessValue * int(FromValue // LessValue))
        FromDisplay: int | float | str = f"{FromValue:.2f}"
        LessDisplay: int | float | str = f"{LessValue:.2f}"
    else:
        FromValue = Rng.randint(1000, 99999)
        LessValue = Rng.randint(90, max(91, FromValue // 4))
        CorrectAnswer = Decimal(FromValue % LessValue)
        FromDisplay = FromValue
        LessDisplay = LessValue

    return [FromDisplay, LessDisplay], ["From", "Less"], CorrectAnswer, {
        "question_text": "Concept Drill",
    }


# ---------------------------------------------------------------------------
# BODMAS -- basic 4-operation tier (Lessons 5-6) and squared-term tier
# (Lesson 7 onward), matching the workbook's own mid-level difficulty step.
# ---------------------------------------------------------------------------

def GenerateBodmas(Config: IMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    GeneratorConfig = Config.GeneratorConfig if isinstance(Config.GeneratorConfig, dict) else {}
    HasSquare = bool(GeneratorConfig.get("hasSquareTerm"))

    A = Rng.randint(150, 980)       # dividend
    B = Rng.randint(13, 92)         # divisor
    F = Rng.randint(100, 9999)      # additive term
    G = Rng.randint(100, 9999)      # subtractive term

    if HasSquare:
        C = Rng.randint(10, 99)     # squared base
        D = Rng.randint(10, 99)     # multiplication term left
        E = Rng.randint(10, 99)     # multiplication term right
        Expression = f"{A} ÷ {B} + {C}² + {D} × {E} + {F} - {G}"
        CorrectAnswer = (Decimal(A) / Decimal(B)) + Decimal(C * C) + Decimal(D * E) + Decimal(F) - Decimal(G)
    else:
        C = Rng.randint(1000, 9999)  # multiplication term left (larger operand)
        D = Rng.randint(2, 9)        # multiplication term right (single digit)
        Expression = f"{A} ÷ {B} + {C} × {D} + {F} - {G}"
        CorrectAnswer = (Decimal(A) / Decimal(B)) + Decimal(C * D) + Decimal(F) - Decimal(G)

    CorrectAnswer = _Quantize(CorrectAnswer, 2)
    return [Expression], [""], CorrectAnswer, {
        "question_text": Expression,
        "has_square_term": HasSquare,
    }


# ---------------------------------------------------------------------------
# Solve the Equation: signed-integer add/subtract, parenthesised negatives
# ---------------------------------------------------------------------------

def GenerateSolveEquation(Config: IMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    A = Rng.choice([Value for Value in range(-15, 16) if Value != 0])
    B = Rng.choice([Value for Value in range(-15, 16) if Value != 0])
    Operator = Rng.choice(["+", "-"])

    ShouldParenthesise = B < 0 or Rng.random() < 0.3
    BText = f"({B})" if ShouldParenthesise else f"{B}"
    Expression = f"{A} {Operator} {BText}"

    CorrectAnswer = Decimal(A + B) if Operator == "+" else Decimal(A - B)
    return [Expression], [""], CorrectAnswer, {
        "question_text": Expression,
    }


# ---------------------------------------------------------------------------
# Answer Position: Write the Number From the Given Position, and its inverse,
# Find the Position of the First Natural Number. Both directions share one
# place-value scale: position 1 = ones, 2 = tens, 3 = hundreds ... and
# 0 = tenths, -1 = hundredths, -2 = thousandths ...
# ---------------------------------------------------------------------------

def _DigitStringForPosition(NumberValue: Decimal) -> str:
    """Strip the decimal point, drop a leading integer-part '0' placeholder
    (values < 1 only -- that zero is not a real digit), keep every other
    digit including internal/trailing zeros.
    """
    Text = format(abs(NumberValue), "f")
    if "." in Text:
        IntegerPart, FractionalPart = Text.split(".", 1)
    else:
        IntegerPart, FractionalPart = Text, ""
    if IntegerPart == "0":
        IntegerPart = ""
    DigitString = (IntegerPart + FractionalPart) or "0"
    return DigitString


def _WorkbookPositionAnswer(NumberValue: Decimal, Position: int) -> Decimal:
    DigitString = _DigitStringForPosition(NumberValue)
    DigitCount = len(DigitString)
    Exponent = Position - DigitCount
    Value = Decimal(int(DigitString))
    if Exponent >= 0:
        return Value * (Decimal(10) ** Exponent)
    return Value / (Decimal(10) ** abs(Exponent))


def _FirstNonzeroPosition(NumberValue: Decimal) -> int:
    Text = format(abs(NumberValue), "f")
    IntegerPart, _, FractionalPart = Text.partition(".")
    IntegerDigits = IntegerPart.lstrip("0")
    if IntegerDigits:
        return len(IntegerDigits)
    for Index, Character in enumerate(FractionalPart):
        if Character != "0":
            return -Index
    return 0


def _GenerateWriteFromPositionNumber(Rng: random.Random) -> Decimal:
    if Rng.random() < 0.15:
        WholeDigits = Rng.randint(1, 2)
        Minimum, Maximum = _DigitRange(WholeDigits)
        Whole = Rng.randint(Minimum, Maximum)
        Fraction = Rng.randint(1, 9999)
        return Decimal(f"{Whole}.{Fraction}")
    Digits = Rng.randint(2, 4)
    Minimum, Maximum = _DigitRange(Digits)
    return Decimal(Rng.randint(Minimum, Maximum))


def _GenerateFindPositionNumber(Rng: random.Random, TargetPosition: int) -> Decimal:
    if TargetPosition >= 1:
        Minimum, Maximum = _DigitRange(TargetPosition)
        Whole = Rng.randint(Minimum, Maximum)
        if Rng.random() < 0.4:
            return Decimal(f"{Whole}.{Rng.randint(0, 9999)}")
        return Decimal(Whole)
    FirstDigit = Rng.randint(1, 9)
    LeadingZeros = abs(TargetPosition)
    Tail = Rng.randint(0, 9999)
    return Decimal(f"0.{'0' * LeadingZeros}{FirstDigit}{Tail}")


def GenerateAnswerPosition(Config: IMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    GeneratorConfig = Config.GeneratorConfig if isinstance(Config.GeneratorConfig, dict) else {}
    Direction = GeneratorConfig.get("answerPositionDirection", "WRITE_FROM_POSITION")
    PositionRange = GeneratorConfig.get("positionRange") or (-4, 2)
    PositionMin, PositionMax = int(PositionRange[0]), int(PositionRange[1])

    if Direction == "WRITE_FROM_POSITION":
        Position = Rng.randint(PositionMin, PositionMax)
        NumberValue = _GenerateWriteFromPositionNumber(Rng)
        CorrectAnswer = _WorkbookPositionAnswer(NumberValue, Position)
        NumberDisplay: int | float | str = _Display(NumberValue)
        return [Position, NumberDisplay], ["Position", "Number"], CorrectAnswer, {
            "question_text": "Write the Number from the Given Position",
            "answer_position_direction": "WRITE_FROM_POSITION",
        }

    TargetPosition = Rng.randint(PositionMin, PositionMax)
    NumberValue = _GenerateFindPositionNumber(Rng, TargetPosition)
    CorrectAnswer = Decimal(_FirstNonzeroPosition(NumberValue))
    NumberText = format(NumberValue, "f")
    return [NumberText], ["Number"], CorrectAnswer, {
        "question_text": "Find the Position of the First Natural Number",
        "answer_position_direction": "FIND_POSITION",
    }


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

def GenerateImQuestion(Config: IMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list, list[str], Decimal, dict]:
    ConceptFamily = Config.ConceptFamily
    if ConceptFamily in ("ADD_LESS", "DECIMAL_ADD_LESS"):
        return GenerateAddLess(Config, Rng, QuestionNumber)
    if ConceptFamily == "WHOLE_NUMBER_MULTIPLICATION":
        return GenerateWholeNumberMultiplication(Config, Rng, QuestionNumber)
    if ConceptFamily == "WHOLE_NUMBER_DIVISION":
        return GenerateWholeNumberDivision(Config, Rng, QuestionNumber)
    if ConceptFamily == "SQUARES":
        return GenerateSquares(Config, Rng, QuestionNumber)
    if ConceptFamily == "SKILL_STACKER":
        return GenerateSkillStacker(Config, Rng, QuestionNumber)
    if ConceptFamily == "CONCEPT_DRILL":
        return GenerateConceptDrill(Config, Rng, QuestionNumber)
    if ConceptFamily == "BODMAS":
        return GenerateBodmas(Config, Rng, QuestionNumber)
    if ConceptFamily == "SOLVE_EQUATION":
        return GenerateSolveEquation(Config, Rng, QuestionNumber)
    if ConceptFamily == "ANSWER_POSITION":
        return GenerateAnswerPosition(Config, Rng, QuestionNumber)
    raise ValueError(f"Intermediate Module generator does not support concept: {ConceptFamily}")
