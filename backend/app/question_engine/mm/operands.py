import random
import re
from decimal import Decimal, ROUND_HALF_UP

from app.question_engine.mm.config import MMConfig


def DifficultyStage(QuestionIndex: int) -> str:
    if QuestionIndex < 2:
        return "WARM_UP"
    if QuestionIndex < 4:
        return "STANDARD"
    if QuestionIndex < 6:
        return "MIXED_STEP"
    if QuestionIndex < 8:
        return "ADVANCED"
    return "CHALLENGE"


def _DecimalPlaces(Stage: str) -> int:
    return 1 if Stage in {"WARM_UP", "STANDARD"} else 2


def _NumberRange(Stage: str) -> tuple[int, int]:
    Ranges = {
        "WARM_UP": (10, 99),
        "STANDARD": (50, 250),
        "MIXED_STEP": (100, 750),
        "ADVANCED": (500, 2500),
        "CHALLENGE": (1000, 9000),
    }
    return Ranges.get(Stage, (10, 99))

def _LessonBand(Config: MMConfig) -> int:
    LessonNumber = max(1, min(30, int(Config.LessonNumber or 1)))
    return min(6, ((LessonNumber - 1) // 5) + 1)


def _ScaleRangeByLesson(Minimum: int, Maximum: int, Config: MMConfig) -> tuple[int, int]:
    Band = _LessonBand(Config)
    Scale = [1, 1, 2, 3, 5, 7][Band - 1]
    return max(1, Minimum * Scale), max(2, Maximum * Scale)


def _AddLessTitleText(Config: MMConfig) -> str:
    return " ".join(
        f" {Config.DpsTitle} "
        .lower()
        .replace("-", " ")
        .replace("_", " ")
        .split()
    )


def _IsFastVisualisationConcept(Config: MMConfig) -> bool:
    Text = _AddLessTitleText(Config)
    return "fast visualisation" in Text or "fast visualization" in Text


def _IsMixedDigitAddLessConcept(Config: MMConfig) -> bool:
    Text = _AddLessTitleText(Config)
    return "mixed digit" in Text and "add less" in Text


def _ExplicitAddLessDigitCount(Config: MMConfig) -> int | None:
    Text = _AddLessTitleText(Config)
    Match = re.search(r"\b([2-6])\s*digit(?:\s+number)?\s+add\s+less\b", Text)
    if Match:
        return int(Match.group(1))
    return None


def _IsDecimalConcept(Config: MMConfig) -> bool:
    # Use the active DPS/section title, not the broader lesson title.
    # Example: a section named "2 Digit Number Add-Less" inside a lesson that
    # contains decimal concepts must remain a whole-number 2-digit stack.
    if Config.ConceptFamily == "DECIMAL_ADD_LESS":
        return True
    return "decimal" in _AddLessTitleText(Config)


def _AddLessDecimalPlaces(Config: MMConfig, Stage: str) -> int:
    if _ExplicitAddLessDigitCount(Config) is not None:
        return 0
    if not _IsDecimalConcept(Config):
        return 0
    Band = _LessonBand(Config)
    if Band <= 2:
        return 1 if Stage == "WARM_UP" else 2
    return 2


def _AddLessValueRange(Config: MMConfig, Stage: str) -> tuple[int, int]:
    ExplicitDigits = _ExplicitAddLessDigitCount(Config)
    if ExplicitDigits is not None:
        return _DigitRange(ExplicitDigits)
    if _IsMixedDigitAddLessConcept(Config):
        return _DigitRange(2)[0], _DigitRange(4)[1]
    return _ScaleRangeByLesson(*_NumberRange(Stage), Config)


def _RandMixedDigitAddLessValue(Rng: random.Random) -> Decimal:
    Digits = Rng.choice([2, 3, 4])
    Minimum, Maximum = _DigitRange(Digits)
    return Decimal(Rng.randint(Minimum, Maximum))


def _AddLessRowCount(Config: MMConfig, Stage: str) -> int:
    if _IsFastVisualisationConcept(Config):
        return 6 if Stage in {"WARM_UP", "STANDARD", "MIXED_STEP"} else 7

    Band = _LessonBand(Config)
    if Stage in {"WARM_UP", "STANDARD"}:
        return 3
    if Band <= 2:
        return 4
    if Band <= 4:
        return 5
    return 6


def _Quantize(Value: Decimal, Places: int) -> Decimal:
    Unit = Decimal("1") if Places <= 0 else Decimal("1").scaleb(-Places)
    return Value.quantize(Unit, rounding=ROUND_HALF_UP)


def _AsDisplayNumber(Value: Decimal | int | float) -> int | float:
    DecimalValue = Value if isinstance(Value, Decimal) else Decimal(str(Value))
    if DecimalValue == DecimalValue.to_integral_value():
        return int(DecimalValue)
    return float(DecimalValue.normalize())


def _RandDecimal(Rng: random.Random, Minimum: int, Maximum: int, Places: int) -> Decimal:
    Scale = 10 ** Places
    Raw = Rng.randint(Minimum * Scale, Maximum * Scale)
    if Places > 0 and Raw % Scale == 0:
        Raw += Rng.randint(1, Scale - 1)
    return Decimal(Raw) / Decimal(Scale)


def _DigitRange(Digits: int) -> tuple[int, int]:
    if Digits <= 1:
        return 1, 9
    return 10 ** (Digits - 1), (10 ** Digits) - 1


def _NormalisedPatternTitle(Config: MMConfig) -> str:
    return " ".join(
        f" {Config.DpsTitle} {Config.LessonTitle} "
        .upper()
        .replace("×", " X ")
        .replace("*", " X ")
        .replace("÷", " DIVISION ")
        .replace("/", " DIVISION ")
        .replace(":", " DIVISION ")
        .replace("-", " ")
        .split()
    )


def _ExtractMultiplicationDigits(Config: MMConfig) -> tuple[int, int] | None:
    Title = _NormalisedPatternTitle(Config)
    Patterns = [
        r"([1-6])D\s*X\s*([1-6])D",
        r"([1-6])D\s*MULTIPLICATION\s*(?:BY\s*)?([1-6])D",
    ]
    for Pattern in Patterns:
        Match = re.search(Pattern, Title)
        if Match:
            return int(Match.group(1)), int(Match.group(2))
    return None


def _ExtractDivisionDigits(Config: MMConfig) -> tuple[int, int] | None:
    Title = _NormalisedPatternTitle(Config)
    Patterns = [
        r"([1-6])D\s*DIVISION\s*([1-6])D",
        r"([1-6])D\s*DIVIDE\s*([1-6])D",
        r"([1-6])D\s*DIVIDED\s*BY\s*([1-6])D",
    ]
    for Pattern in Patterns:
        Match = re.search(Pattern, Title)
        if Match:
            return int(Match.group(1)), int(Match.group(2))
    if "DIVISION BY 6D" in Title:
        return 6, 3
    if "DIVISION BY 3D" in Title:
        return 4, 3
    return None


def _MultiplicationDigits(Config: MMConfig, Stage: str) -> tuple[int, int]:
    ExplicitDigits = _ExtractMultiplicationDigits(Config)
    if ExplicitDigits is not None:
        return ExplicitDigits
    Title = _NormalisedPatternTitle(Config)
    if "MULTIPLICATION BY 3D" in Title:
        return 3, 3
    if Stage == "WARM_UP":
        return 2, 1
    if Stage == "STANDARD":
        return 2, 2
    if Stage == "MIXED_STEP":
        return 3, 2
    if Stage == "ADVANCED":
        return 3, 3
    return 4, 2


def _DivisionDigits(Config: MMConfig, Stage: str) -> tuple[int, int]:
    ExplicitDigits = _ExtractDivisionDigits(Config)
    if ExplicitDigits is not None:
        return ExplicitDigits
    Title = _NormalisedPatternTitle(Config)
    if "DIVISION BY 6D" in Title:
        return 6, 3
    if "DIVISION BY 3D" in Title:
        return 4, 3
    if Stage == "WARM_UP":
        return 2, 1
    if Stage == "STANDARD":
        return 3, 1
    if Stage == "MIXED_STEP":
        return 4, 2
    if Stage == "ADVANCED":
        return 5, 2
    return 5, 3



def _BorrowingAnswerMode(Config: MMConfig) -> str:
    Title = " ".join(
        f" {Config.DpsTitle} {Config.LessonTitle} "
        .upper()
        .replace(",", " ")
        .replace("-", " ")
        .split()
    )
    if "BORROWING" not in Title:
        return "STANDARD"
    HasPositive = "POSITIVE" in Title
    HasNegative = "NEGATIVE" in Title
    if HasPositive and HasNegative:
        return "MIXED_POSITIVE_NEGATIVE"
    if HasNegative:
        return "NEGATIVE_ONLY"
    return "BORROWING_STANDARD"


def _BuildBorrowingAddLess(
    Config: MMConfig,
    Rng: random.Random,
    QuestionNumber: int,
    RequireNegativeAnswer: bool,
) -> tuple[list[int | float], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    Places = _AddLessDecimalPlaces(Config, Stage)
    Minimum, Maximum = _ScaleRangeByLesson(*_NumberRange(Stage), Config)
    RowCount = _AddLessRowCount(Config, Stage)

    if RequireNegativeAnswer:
        # Master Module negative borrowing sheets must use only 4-digit/5-digit
        # operands while preserving a mixed stack and a negative final answer.
        RowCount = max(4, RowCount)
        SignedOperands: list[Decimal] = []
        Operators: list[str] = []
        RunningTotal = Decimal(0)

        FirstValue = Decimal(Rng.randrange(1000, 9001, 25))
        SignedOperands.append(FirstValue)
        Operators.append("")
        RunningTotal += FirstValue

        for RowIndex in range(1, RowCount - 1):
            Value = Decimal(Rng.randrange(1000, 9001, 25))
            UseSubtraction = RowIndex % 3 == 0
            if UseSubtraction:
                SignedOperands.append(-Value)
                Operators.append("-")
                RunningTotal -= Value
            else:
                SignedOperands.append(Value)
                Operators.append("+")
                RunningTotal += Value

        FinalSubtraction = abs(RunningTotal) + Decimal(Rng.randrange(1000, 9001, 25))
        if FinalSubtraction > Decimal(99999):
            FinalSubtraction = Decimal(Rng.randrange(50000, 95001, 25))
        SignedOperands.append(-FinalSubtraction)
        Operators.append("-")
        CorrectAnswer = sum(SignedOperands, Decimal(0))

        if CorrectAnswer >= 0:
            ExtraNeeded = CorrectAnswer + Decimal(Rng.randrange(1000, 9001, 25))
            Replacement = min(Decimal(99999), abs(SignedOperands[-1]) + ExtraNeeded)
            SignedOperands[-1] = -Replacement
            CorrectAnswer = sum(SignedOperands, Decimal(0))

        return [_AsDisplayNumber(Value) for Value in SignedOperands], Operators, CorrectAnswer, {
            "decimal_places": 0,
            "row_count": RowCount,
            "lesson_band": _LessonBand(Config),
            "add_less_layout": "LEFT_MINUS_OPERATOR_ONLY",
            "borrowing_answer_mode": "NEGATIVE",
            "borrowing_negative_answer_required": True,
            "borrowing_stack_not_all_negative": True,
            "borrowing_negative_operand_digit_rule": "4D_OR_5D_ONLY",
        }

    PositiveRows: list[Decimal] = []
    NegativeRows: list[Decimal] = []

    # First row remains positive so the stack never becomes an all-negative list.
    FirstValue = _RandDecimal(Rng, max(1, Minimum // 3), max(3, Maximum // 4), Places)
    PositiveRows.append(FirstValue)
    SignedOperands: list[Decimal] = [FirstValue]
    Operators: list[str] = [""]
    RunningTotal = FirstValue

    for RowIndex in range(1, RowCount - 1):
        PreferSubtraction = Rng.random() < (0.65 if RequireNegativeAnswer else 0.45)
        Value = _RandDecimal(Rng, max(1, Minimum // 4), max(3, Maximum // 3), Places)
        if PreferSubtraction:
            Operators.append("-")
            SignedOperands.append(-Value)
            NegativeRows.append(Value)
            RunningTotal -= Value
        else:
            Operators.append("+")
            SignedOperands.append(Value)
            PositiveRows.append(Value)
            RunningTotal += Value

    if RequireNegativeAnswer:
        # Final subtraction is sized from the current running total so the final
        # answer is genuinely negative, matching the workbook concept.
        Extra = _RandDecimal(Rng, max(1, Minimum // 5), max(3, Maximum // 5), Places)
        LastValue = (RunningTotal if RunningTotal > 0 else Decimal(0)) + Extra
        LastValue = _Quantize(LastValue, Places)
        if LastValue <= 0:
            LastValue = Extra
        Operators.append("-")
        SignedOperands.append(-LastValue)
        NegativeRows.append(LastValue)
        RunningTotal -= LastValue
    else:
        # Positive-answer borrowing practice still includes at least one
        # subtraction row, but the final result stays positive.
        if not NegativeRows:
            LastValue = min(FirstValue / Decimal(2), _RandDecimal(Rng, 1, max(2, Maximum // 5), Places))
            LastValue = _Quantize(max(Decimal(1).scaleb(-Places), LastValue), Places)
            Operators.append("-")
            SignedOperands.append(-LastValue)
            NegativeRows.append(LastValue)
            RunningTotal -= LastValue
        else:
            AddValue = abs(RunningTotal) + _RandDecimal(Rng, max(1, Minimum // 5), max(3, Maximum // 4), Places)
            AddValue = _Quantize(AddValue, Places)
            Operators.append("+")
            SignedOperands.append(AddValue)
            PositiveRows.append(AddValue)
            RunningTotal += AddValue
        if RunningTotal <= 0:
            LiftValue = abs(RunningTotal) + _RandDecimal(Rng, 1, max(3, Maximum // 5), Places)
            Operators[-1] = "+"
            SignedOperands[-1] = _Quantize(LiftValue, Places)
            RunningTotal += SignedOperands[-1] if SignedOperands[-1] > 0 else abs(SignedOperands[-1])

    CorrectAnswer = _Quantize(RunningTotal, Places)

    # Hard guards: this concept must not silently produce the wrong sign or an
    # all-negative stack. Retry safety is handled by deterministic outer loops.
    if RequireNegativeAnswer and CorrectAnswer >= 0:
        Correction = CorrectAnswer + _RandDecimal(Rng, 1, max(3, Maximum // 5), Places)
        Correction = _Quantize(Correction, Places)
        Operators[-1] = "-"
        SignedOperands[-1] = -abs(SignedOperands[-1]) - Correction
        CorrectAnswer = _Quantize(sum(SignedOperands), Places)

    if all(Value < 0 for Value in SignedOperands):
        SignedOperands[0] = abs(SignedOperands[0])
        CorrectAnswer = _Quantize(sum(SignedOperands), Places)

    return [_AsDisplayNumber(Value) for Value in SignedOperands], Operators, CorrectAnswer, {
        "decimal_places": Places,
        "row_count": RowCount,
        "lesson_band": _LessonBand(Config),
        "add_less_layout": "LEFT_MINUS_OPERATOR_ONLY",
        "borrowing_answer_mode": "NEGATIVE" if RequireNegativeAnswer else "POSITIVE",
        "borrowing_negative_answer_required": RequireNegativeAnswer,
        "borrowing_stack_not_all_negative": True,
    }

def GenerateAddLess(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    BorrowingMode = _BorrowingAnswerMode(Config)
    if BorrowingMode == "NEGATIVE_ONLY":
        return _BuildBorrowingAddLess(Config, Rng, QuestionNumber, True)
    if BorrowingMode == "MIXED_POSITIVE_NEGATIVE":
        return _BuildBorrowingAddLess(Config, Rng, QuestionNumber, QuestionNumber % 2 == 1)

    Stage = DifficultyStage(QuestionNumber - 1)
    Places = _AddLessDecimalPlaces(Config, Stage)
    Minimum, Maximum = _AddLessValueRange(Config, Stage)
    RowCount = _AddLessRowCount(Config, Stage)

    IsMixedDigitAddLess = _IsMixedDigitAddLessConcept(Config)
    InitialValue = _RandMixedDigitAddLessValue(Rng) if IsMixedDigitAddLess else _RandDecimal(Rng, Minimum, Maximum, Places)
    Values: list[Decimal] = [InitialValue]
    Operators = [""]
    RunningTotal = Values[0]

    for RowIndex in range(1, RowCount):
        Sign = Rng.choice(["+", "-"])
        if IsMixedDigitAddLess:
            Value = _RandMixedDigitAddLessValue(Rng)
        elif _ExplicitAddLessDigitCount(Config) is not None:
            Value = _RandDecimal(Rng, Minimum, Maximum, Places)
        else:
            Value = _RandDecimal(Rng, max(1, Minimum // 4), max(2, Maximum // 3), Places)

        # Workbook-style Add/Less sheets should remain solvable and non-negative unless
        # the sheet explicitly belongs to a borrowing negative-answer concept.
        if Sign == "-" and RunningTotal - Value < 0:
            Sign = "+"

        Operators.append(Sign)
        Values.append(Value)
        RunningTotal = RunningTotal + Value if Sign == "+" else RunningTotal - Value

    CorrectAnswer = _Quantize(RunningTotal, Places)
    SignedOperands = [Values[0]] + [
        Values[Index] if Operators[Index] == "+" else -Values[Index]
        for Index in range(1, len(Values))
    ]
    return [_AsDisplayNumber(Value) for Value in SignedOperands], Operators, CorrectAnswer, {
        "decimal_places": Places,
        "row_count": RowCount,
        "lesson_band": _LessonBand(Config),
        "add_less_layout": "LEFT_MINUS_OPERATOR_ONLY",
        "mixed_digit_range": "2D_TO_4D" if IsMixedDigitAddLess else None,
    }


def GenerateDecimalAddLess(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    return GenerateAddLess(Config, Rng, QuestionNumber)


DECIMAL_MULTIPLICATION_PATTERNS: tuple[tuple[int, int], ...] = (
    (1, 1),
    (2, 1),
    (3, 1),
    (4, 1),
    (2, 2),
    (3, 2),
    (4, 2),
    (3, 3),
)


def _CanonicalMultiplicationPattern(LeftDigits: int, RightDigits: int) -> tuple[int, int]:
    return (max(LeftDigits, RightDigits), min(LeftDigits, RightDigits))


def _DecimalMultiplicationPatternsForLesson(Config: MMConfig) -> list[tuple[int, int]]:
    ExplicitPattern = _ExtractMultiplicationDigits(Config)
    if ExplicitPattern is not None:
        CanonicalPattern = _CanonicalMultiplicationPattern(*ExplicitPattern)
        if CanonicalPattern in DECIMAL_MULTIPLICATION_PATTERNS:
            return [CanonicalPattern]

    LessonNumber = int(Config.LessonNumber or 1)
    if LessonNumber <= 8:
        return [(1, 1), (2, 1), (2, 2), (3, 1)]
    if LessonNumber <= 13:
        return [(2, 1), (2, 2), (3, 1), (3, 2), (4, 1)]
    if LessonNumber <= 18:
        return [(3, 2), (4, 1), (4, 2), (3, 3), (2, 2)]
    return [(4, 2), (3, 3), (3, 2), (4, 1), (2, 2), (2, 1)]


def _GeneratePatternWholeOperand(Rng: random.Random, Digits: int) -> int:
    Minimum, Maximum = _DigitRange(Digits)
    if Digits == 1:
        Minimum = max(2, Minimum)
    return Rng.randint(Minimum, Maximum)


def _DecimalShiftOptions(Value: int) -> list[int]:
    DigitCount = len(str(abs(Value)))
    # Workbook Decimal Multiplication Visual sheets frequently use leading-zero
    # decimal placements such as 0.003, 0.00014, 0.001, and 0.0006.
    # Pattern classification still happens after removing the decimal point;
    # these wider shift options only control presentation.
    MaxShift = min(DigitCount + 4, 5)
    return list(range(0, MaxShift + 1))


def _FormatDecimalOperandFromWhole(Value: int, DecimalPlaces: int) -> str:
    if DecimalPlaces <= 0:
        return str(Value)
    Raw = str(abs(Value))
    if DecimalPlaces >= len(Raw):
        Raw = "0" * (DecimalPlaces - len(Raw) + 1) + Raw
    SplitAt = len(Raw) - DecimalPlaces
    WholePart = Raw[:SplitAt] or "0"
    DecimalPart = Raw[SplitAt:]
    Sign = "-" if Value < 0 else ""
    return f"{Sign}{WholePart}.{DecimalPart}"


def _DisplayDecimalMultiplicationOperand(Value: int, DecimalPlaces: int) -> int | str:
    if DecimalPlaces <= 0:
        return Value
    return _FormatDecimalOperandFromWhole(Value, DecimalPlaces)


def _DecimalPlacesInOperand(Value: int | float | str) -> int:
    Text = str(Value)
    return len(Text.split(".", 1)[1]) if "." in Text else 0


def _DecimalMultiplicationShiftTemplatesForLesson(LessonNumber: int) -> list[tuple[int, int]]:
    if LessonNumber <= 8:
        return [
            (3, 0),
            (1, 3),
            (0, 2),
            (4, 1),
            (2, 2),
            (5, 1),
            (1, 1),
            (0, 1),
            (1, 4),
            (2, 0),
        ]
    if LessonNumber <= 13:
        return [
            (3, 0),
            (2, 3),
            (3, 2),
            (1, 3),
            (2, 2),
            (4, 1),
            (5, 1),
            (1, 1),
            (0, 1),
            (1, 0),
        ]
    if LessonNumber <= 18:
        return [
            (1, 0),
            (0, 1),
            (1, 1),
            (2, 1),
            (1, 2),
            (2, 2),
            (3, 1),
            (1, 3),
            (0, 2),
            (2, 0),
        ]
    return [
        (1, 0),
        (0, 1),
        (1, 1),
        (2, 1),
        (1, 2),
        (2, 2),
        (3, 1),
        (1, 3),
        (0, 2),
        (2, 0),
    ]


def _SelectDecimalMultiplicationShiftPair(
    Rng: random.Random,
    LessonNumber: int,
    QuestionNumber: int,
    LeftWhole: int,
    RightWhole: int,
) -> tuple[int, int] | None:
    LeftOptions = set(_DecimalShiftOptions(LeftWhole))
    RightOptions = set(_DecimalShiftOptions(RightWhole))
    Templates = _DecimalMultiplicationShiftTemplatesForLesson(LessonNumber)
    OrderedTemplates = Templates[(QuestionNumber - 1) % len(Templates):] + Templates[:(QuestionNumber - 1) % len(Templates)]

    for LeftShift, RightShift in OrderedTemplates:
        if (
            LeftShift in LeftOptions
            and RightShift in RightOptions
            and LeftShift + RightShift > 0
            and LeftShift + RightShift <= 6
        ):
            return LeftShift, RightShift

    CandidatePairs = [
        (LeftShift, RightShift)
        for LeftShift in LeftOptions
        for RightShift in RightOptions
        if LeftShift + RightShift > 0 and LeftShift + RightShift <= 6
    ]
    if not CandidatePairs:
        return None
    return Rng.choice(CandidatePairs)


def _MaybeSwapDecimalMultiplicationOperands(
    Rng: random.Random,
    QuestionNumber: int,
    LeftWhole: int,
    RightWhole: int,
    LeftShift: int,
    RightShift: int,
) -> tuple[int, int, int, int]:
    # Workbook sheets freely alternate decimal × whole, whole × decimal, and
    # decimal × decimal. Swapping is presentation-only and does not change the
    # underlying abacus pattern because multiplication is commutative.
    if QuestionNumber % 3 == 0 or (QuestionNumber % 5 == 0 and Rng.random() < 0.7):
        return RightWhole, LeftWhole, RightShift, LeftShift
    return LeftWhole, RightWhole, LeftShift, RightShift


def GenerateDecimalMultiplication(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    PatternOptions = _DecimalMultiplicationPatternsForLesson(Config)
    Pattern = PatternOptions[(QuestionNumber - 1) % len(PatternOptions)]
    LeftDigits, RightDigits = Pattern
    LessonNumber = int(Config.LessonNumber or 1)

    # Generate the abacus multiplication first as whole-number operands.
    # Decimal placement is applied only after the underlying pattern is fixed.
    for _Attempt in range(160):
        LeftWhole = _GeneratePatternWholeOperand(Rng, LeftDigits)
        RightWhole = _GeneratePatternWholeOperand(Rng, RightDigits)
        WholeProduct = LeftWhole * RightWhole
        if WholeProduct >= 1000000:
            continue

        ShiftPair = _SelectDecimalMultiplicationShiftPair(Rng, LessonNumber, QuestionNumber + _Attempt, LeftWhole, RightWhole)
        if ShiftPair is None:
            continue
        LeftShift, RightShift = ShiftPair
        DisplayLeftWhole, DisplayRightWhole, DisplayLeftShift, DisplayRightShift = _MaybeSwapDecimalMultiplicationOperands(
            Rng, QuestionNumber + _Attempt, LeftWhole, RightWhole, LeftShift, RightShift
        )

        if (DisplayLeftShift > 0 and DisplayLeftWhole % 10 == 0) or (DisplayRightShift > 0 and DisplayRightWhole % 10 == 0):
            continue

        LeftOperand = _DisplayDecimalMultiplicationOperand(DisplayLeftWhole, DisplayLeftShift)
        RightOperand = _DisplayDecimalMultiplicationOperand(DisplayRightWhole, DisplayRightShift)
        TotalDecimalPlaces = _DecimalPlacesInOperand(LeftOperand) + _DecimalPlacesInOperand(RightOperand)
        CorrectAnswer = _Quantize(Decimal(WholeProduct) / (Decimal(10) ** TotalDecimalPlaces), TotalDecimalPlaces)

        return [LeftOperand, RightOperand], ["", "×"], CorrectAnswer, {
            "left_digits": LeftDigits,
            "right_digits": RightDigits,
            "underlying_left": LeftWhole,
            "underlying_right": RightWhole,
            "underlying_product": WholeProduct,
            "decimal_places": TotalDecimalPlaces,
            "decimal_pattern_rule": "DIGIT_COUNT_AFTER_DECIMAL_REMOVAL",
            "decimal_variation_rule": "WORKBOOK_STYLE_SHIFT_TEMPLATES",
        }

    # Conservative fallback should almost never be used, but keeps preview generation safe.
    LeftDigits, RightDigits = (2, 1)
    LeftWhole = _GeneratePatternWholeOperand(Rng, LeftDigits)
    RightWhole = _GeneratePatternWholeOperand(Rng, RightDigits)
    LeftOperand = _DisplayDecimalMultiplicationOperand(LeftWhole, 1)
    RightOperand = RightWhole
    CorrectAnswer = _Quantize(Decimal(LeftWhole * RightWhole) / Decimal(10), 1)
    return [LeftOperand, RightOperand], ["", "×"], CorrectAnswer, {
        "left_digits": LeftDigits,
        "right_digits": RightDigits,
        "underlying_left": LeftWhole,
        "underlying_right": RightWhole,
        "underlying_product": LeftWhole * RightWhole,
        "decimal_places": 1,
        "decimal_pattern_rule": "DIGIT_COUNT_AFTER_DECIMAL_REMOVAL",
    }


DECIMAL_DIVISION_PATTERNS: tuple[tuple[int, int], ...] = (
    (2, 1),
    (3, 1),
    (4, 1),
    (5, 1),
    (3, 2),
    (4, 2),
    (5, 2),
    (6, 2),
    (4, 3),
    (5, 3),
    (6, 3),
)


def _DecimalDivisionPatternsForLesson(Config: MMConfig) -> list[tuple[int, int]]:
    ExplicitPattern = _ExtractDivisionDigits(Config)
    if ExplicitPattern is not None and ExplicitPattern in DECIMAL_DIVISION_PATTERNS:
        return [ExplicitPattern]

    LessonNumber = int(Config.LessonNumber or 1)
    if LessonNumber <= 11:
        return [(2, 1), (3, 1), (2, 1), (3, 2)]
    if LessonNumber <= 15:
        return [(2, 1), (3, 1), (4, 1), (3, 2), (4, 2)]
    if LessonNumber <= 22:
        return [(3, 1), (4, 1), (3, 2), (4, 2), (5, 2), (6, 2), (4, 3)]
    return [(4, 1), (4, 2), (5, 2), (6, 2), (4, 3), (5, 3), (6, 3), (3, 2)]


def _GenerateDivisionBase(Rng: random.Random, DividendDigits: int, DivisorDigits: int) -> tuple[int, int, int] | None:
    DivisorMin, DivisorMax = _DigitRange(DivisorDigits)
    DividendMin, DividendMax = _DigitRange(DividendDigits)

    for _Attempt in range(120):
        Divisor = Rng.randint(DivisorMin, DivisorMax)
        if Divisor == 0:
            continue

        MinQuotient = max(1, (DividendMin + Divisor - 1) // Divisor)
        MaxQuotient = max(MinQuotient, DividendMax // Divisor)
        if MinQuotient > MaxQuotient:
            continue

        Quotient = Rng.randint(MinQuotient, MaxQuotient)
        Dividend = Divisor * Quotient
        if DividendMin <= Dividend <= DividendMax:
            return Dividend, Divisor, Quotient

    return None


def _DisplayDecimalDivisionOperand(Value: int, DecimalPlaces: int) -> int | str:
    if DecimalPlaces <= 0:
        return Value
    return _FormatDecimalOperandFromWhole(Value, DecimalPlaces)


def _DecimalDivisionShiftTemplatesForLesson(LessonNumber: int) -> list[tuple[int, int]]:
    if LessonNumber <= 11:
        return [
            (1, 0),
            (2, 1),
            (2, 0),
            (2, 2),
            (3, 2),
            (3, 1),
            (1, 1),
            (0, 1),
        ]
    if LessonNumber <= 15:
        return [
            (1, 1),
            (2, 1),
            (3, 2),
            (4, 3),
            (1, 0),
            (2, 0),
            (3, 1),
            (0, 1),
            (1, 2),
        ]
    if LessonNumber <= 22:
        return [
            (3, 2),
            (2, 1),
            (1, 1),
            (4, 2),
            (4, 3),
            (1, 0),
            (2, 0),
            (0, 1),
            (3, 1),
        ]
    return [
        (2, 1),
        (3, 2),
        (1, 1),
        (4, 2),
        (5, 2),
        (3, 0),
        (1, 0),
        (0, 1),
        (4, 3),
    ]


def _SelectDecimalDivisionShiftPair(
    Rng: random.Random,
    LessonNumber: int,
    QuestionNumber: int,
    DividendWhole: int,
    DivisorWhole: int,
) -> tuple[int, int] | None:
    DividendOptions = set(_DecimalShiftOptions(DividendWhole))
    DivisorOptions = set(_DecimalShiftOptions(DivisorWhole))
    Templates = _DecimalDivisionShiftTemplatesForLesson(LessonNumber)
    OrderedTemplates = Templates[(QuestionNumber - 1) % len(Templates):] + Templates[:(QuestionNumber - 1) % len(Templates)]

    for DividendShift, DivisorShift in OrderedTemplates:
        if (
            DividendShift in DividendOptions
            and DivisorShift in DivisorOptions
            and DividendShift + DivisorShift > 0
            and DividendShift + DivisorShift <= 7
        ):
            return DividendShift, DivisorShift

    CandidatePairs = [
        (DividendShift, DivisorShift)
        for DividendShift in DividendOptions
        for DivisorShift in DivisorOptions
        if DividendShift + DivisorShift > 0 and DividendShift + DivisorShift <= 7
    ]
    if not CandidatePairs:
        return None
    return Rng.choice(CandidatePairs)


def _DecimalDivisionAnswer(DividendWhole: int, DivisorWhole: int, DividendShift: int, DivisorShift: int) -> Decimal:
    return (
        Decimal(DividendWhole)
        * (Decimal(10) ** DivisorShift)
        / (Decimal(DivisorWhole) * (Decimal(10) ** DividendShift))
    )


def _DecimalDivisionAnswerPlaces(DividendShift: int, DivisorShift: int) -> int:
    # Base whole-number division is generated with an integer quotient. Decimal
    # placement only moves the decimal point, so the answer needs at most the
    # positive shift difference as decimal places.
    return max(0, DividendShift - DivisorShift)


def GenerateDecimalDivision(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    PatternOptions = _DecimalDivisionPatternsForLesson(Config)
    Pattern = PatternOptions[(QuestionNumber - 1) % len(PatternOptions)]
    DividendDigits, DivisorDigits = Pattern
    LessonNumber = int(Config.LessonNumber or 1)

    # Generate the whole-number abacus division pattern first. Decimal placement
    # is applied only after the underlying dividend/divisor digit pattern is fixed.
    for _Attempt in range(180):
        Base = _GenerateDivisionBase(Rng, DividendDigits, DivisorDigits)
        if Base is None:
            continue
        DividendWhole, DivisorWhole, WholeQuotient = Base

        ShiftPair = _SelectDecimalDivisionShiftPair(Rng, LessonNumber, QuestionNumber + _Attempt, DividendWhole, DivisorWhole)
        if ShiftPair is None:
            continue
        DividendShift, DivisorShift = ShiftPair

        if (DividendShift > 0 and DividendWhole % 10 == 0) or (DivisorShift > 0 and DivisorWhole % 10 == 0):
            continue

        CorrectAnswer = _DecimalDivisionAnswer(DividendWhole, DivisorWhole, DividendShift, DivisorShift)
        if CorrectAnswer <= 0 or CorrectAnswer > Decimal("200000"):
            continue

        AnswerPlaces = _DecimalDivisionAnswerPlaces(DividendShift, DivisorShift)
        CorrectAnswer = _Quantize(CorrectAnswer, AnswerPlaces)
        DividendOperand = _DisplayDecimalDivisionOperand(DividendWhole, DividendShift)
        DivisorOperand = _DisplayDecimalDivisionOperand(DivisorWhole, DivisorShift)

        return [DividendOperand, DivisorOperand], ["", "÷"], CorrectAnswer, {
            "dividend_digits": DividendDigits,
            "divisor_digits": DivisorDigits,
            "underlying_dividend": DividendWhole,
            "underlying_divisor": DivisorWhole,
            "underlying_quotient": WholeQuotient,
            "dividend_decimal_places": DividendShift,
            "divisor_decimal_places": DivisorShift,
            "decimal_pattern_rule": "DIGIT_COUNT_AFTER_DECIMAL_REMOVAL_AND_LEADING_ZERO_NORMALIZATION",
            "decimal_variation_rule": "WORKBOOK_STYLE_DIVISION_SHIFT_TEMPLATES",
        }

    # Conservative fallback should almost never be used, but keeps preview generation safe.
    DividendWhole, DivisorWhole, WholeQuotient = 21, 7, 3
    DividendOperand = _DisplayDecimalDivisionOperand(DividendWhole, 1)
    CorrectAnswer = Decimal("0.3")
    return [DividendOperand, DivisorWhole], ["", "÷"], CorrectAnswer, {
        "dividend_digits": 2,
        "divisor_digits": 1,
        "underlying_dividend": DividendWhole,
        "underlying_divisor": DivisorWhole,
        "underlying_quotient": WholeQuotient,
        "dividend_decimal_places": 1,
        "divisor_decimal_places": 0,
        "decimal_pattern_rule": "DIGIT_COUNT_AFTER_DECIMAL_REMOVAL_AND_LEADING_ZERO_NORMALIZATION",
    }


def _GenerateWholeNumberMultiplicationByDigits(
    Rng: random.Random,
    LeftDigits: int,
    RightDigits: int,
    MixedVariant: str | None = None,
) -> tuple[list[int | float], list[str], Decimal, dict]:
    LeftMin, LeftMax = _DigitRange(LeftDigits)
    RightMin, RightMax = _DigitRange(RightDigits)
    Left = Rng.randint(LeftMin, LeftMax)
    Right = Rng.randint(RightMin, RightMax)
    CorrectAnswer = Decimal(Left * Right)
    Metadata = {"left_digits": LeftDigits, "right_digits": RightDigits}
    if MixedVariant:
        Metadata["mixed_pattern_variant"] = MixedVariant
        Metadata["mixed_pattern_family"] = "WHOLE_NUMBER_MULTIPLICATION"
    return [Left, Right], ["", "×"], CorrectAnswer, Metadata


def GenerateWholeNumberMultiplication(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    LeftDigits, RightDigits = _MultiplicationDigits(Config, Stage)
    return _GenerateWholeNumberMultiplicationByDigits(Rng, LeftDigits, RightDigits)


def _GenerateWholeNumberDivisionByDigits(
    Rng: random.Random,
    DividendDigits: int,
    DivisorDigits: int,
    MixedVariant: str | None = None,
) -> tuple[list[int | float], list[str], Decimal, dict]:
    DivisorMin, DivisorMax = _DigitRange(DivisorDigits)
    DividendMin, DividendMax = _DigitRange(DividendDigits)
    Divisor = Rng.randint(DivisorMin, DivisorMax)
    MinQuotient = max(1, (DividendMin + Divisor - 1) // Divisor)
    MaxQuotient = max(MinQuotient, DividendMax // Divisor)
    Quotient = Rng.randint(MinQuotient, MaxQuotient)
    Dividend = Divisor * Quotient
    CorrectAnswer = Decimal(Quotient)
    Metadata = {"dividend_digits": DividendDigits, "divisor_digits": DivisorDigits}
    if MixedVariant:
        Metadata["mixed_pattern_variant"] = MixedVariant
        Metadata["mixed_pattern_family"] = "WHOLE_NUMBER_DIVISION"
    return [Dividend, Divisor], ["", "÷"], CorrectAnswer, Metadata


def GenerateWholeNumberDivision(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    DividendDigits, DivisorDigits = _DivisionDigits(Config, Stage)
    return _GenerateWholeNumberDivisionByDigits(Rng, DividendDigits, DivisorDigits)


def GenerateIntegers(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    MaxAbs = {"WARM_UP": 20, "STANDARD": 50, "MIXED_STEP": 100, "ADVANCED": 250, "CHALLENGE": 500}.get(Stage, 50) * _LessonBand(Config)
    RowCount = 3 if Stage in {"WARM_UP", "STANDARD"} else 4

    # Integer worksheets are displayed as signed vertical stacks. The displayed
    # value of each row is the signed operand itself, so the correct answer must
    # be the direct sum of the signed operands. Do not combine signed operands
    # with a second operator layer, because that can mark a mathematically wrong
    # option as correct when the renderer shows the signed rows.
    Values: list[int] = []
    for RowIndex in range(RowCount):
        Value = Rng.randint(1, MaxAbs)
        Sign = -1 if Rng.random() < (0.45 if RowIndex else 0.35) else 1
        Values.append(Sign * Value)

    # A worksheet may contain multiple negative operands, but never all negative
    # operands. Force at least one positive row while keeping the question varied.
    if all(Value < 0 for Value in Values):
        PositiveIndex = Rng.randrange(RowCount)
        Values[PositiveIndex] = abs(Values[PositiveIndex])

    # Keep at least one negative row for the integer concept unless the random
    # sample somehow produced only positives. This preserves the intended signed
    # integer practice without allowing the all-negative pattern.
    if all(Value > 0 for Value in Values):
        NegativeIndex = Rng.randrange(RowCount)
        Values[NegativeIndex] = -abs(Values[NegativeIndex])

    Operators = [""] * RowCount
    CorrectAnswer = sum(Decimal(Value) for Value in Values)
    return Values, Operators, CorrectAnswer, {
        "row_count": RowCount,
        "integer_range": MaxAbs,
        "allow_negative_answer": True,
        "integer_display_mode": "SIGNED_OPERAND_SUM",
        "integer_no_all_negative_rows": True,
    }


def _FormatBodmasNumber(Value: Decimal | int | float) -> str:
    DecimalValue = Value if isinstance(Value, Decimal) else Decimal(str(Value))
    if DecimalValue == DecimalValue.to_integral_value():
        return str(int(DecimalValue))
    return format(DecimalValue.normalize(), "f")


def _GenerateBodmasDivisionTerm(Rng: random.Random, DivisorMinimum: int, DivisorMaximum: int, QuotientMinimum: int, QuotientMaximum: int) -> tuple[int, int, int]:
    """Generate a BODMAS division term whose visible dividend stays within 4 digits.

    Workbook correction: addition/subtraction terms inside BODMAS should stay
    mentally readable. Division terms that appear after + or - must therefore
    avoid 5-digit dividends such as 19590 ÷ 89.
    """
    SafeDivisorMinimum = max(1, int(DivisorMinimum))
    SafeDivisorMaximum = max(SafeDivisorMinimum, int(DivisorMaximum))
    SafeQuotientMinimum = max(1, int(QuotientMinimum))
    SafeQuotientMaximum = max(SafeQuotientMinimum, int(QuotientMaximum))

    for _ in range(80):
        Divisor = Rng.randint(SafeDivisorMinimum, SafeDivisorMaximum)
        MaxSafeQuotient = min(SafeQuotientMaximum, 9999 // Divisor)
        if MaxSafeQuotient >= SafeQuotientMinimum:
            Quotient = Rng.randint(SafeQuotientMinimum, MaxSafeQuotient)
            return Divisor, Quotient, Divisor * Quotient

    Divisor = min(SafeDivisorMaximum, max(SafeDivisorMinimum, 99))
    Quotient = min(SafeQuotientMaximum, max(SafeQuotientMinimum, 9999 // Divisor))
    return Divisor, Quotient, Divisor * Quotient


def _BodmasRawNumberCount(ExpressionUnits: list[str]) -> int:
    # Workbook BODMAS rows must stay short enough for the DPS/MCQ card.
    # Count every visible numeric value, including operands inside ×/÷,
    # roots, powers, percentages, and bracketed percentage terms.
    Count = 0
    for Unit in ExpressionUnits:
        Count += len(re.findall(r"\d+(?:\.\d+)?", Unit))
    return Count


def _BodmasPayload(ExpressionTokens: list[str], CorrectAnswer: Decimal, Pattern: str, LessonStage: str) -> tuple[list[str], list[str], Decimal, dict]:
    Expression = " ".join(ExpressionTokens)
    ExpressionUnits = [Token for Token in ExpressionTokens if Token not in {"+", "-", "×", "÷"}]
    RawNumberCount = _BodmasRawNumberCount(ExpressionUnits)
    if RawNumberCount > 7:
        raise ValueError(f"BODMAS expression exceeded workbook numeric limit: {Expression}")
    return ExpressionUnits, [""] * len(ExpressionUnits), CorrectAnswer, {
        "question_text": Expression,
        "bodmas_pattern": Pattern,
        "bodmas_lesson_stage": LessonStage,
        "bodmas_expression_unit_count": len(ExpressionUnits),
        "bodmas_raw_number_count": RawNumberCount,
        "bodmas_workbook_progressive": True,
        "bodmas_max_expression_units": 7,
        "bodmas_max_raw_numbers": 7,
    }


def _BodmasBasicArithmetic(Config: MMConfig, Rng: random.Random, QuestionNumber: int, Stage: str) -> tuple[list[str], list[str], Decimal, dict]:
    Band = _LessonBand(Config)
    LargeBaseMin = min(9999, 1200 + (Band * 350))
    LargeBaseMax = min(9999, 8500 + (Band * 900))
    Multiplier = Rng.randint(3, 9 if Stage in {"WARM_UP", "STANDARD"} else 16)
    Multiplicand = Rng.randint(120, 950 if Stage in {"WARM_UP", "STANDARD"} else 2500)
    Divisor, Quotient, Dividend = _GenerateBodmasDivisionTerm(
        Rng,
        6,
        25 if Stage in {"WARM_UP", "STANDARD"} else 90,
        12,
        120 if Stage in {"WARM_UP", "STANDARD"} else 350,
    )
    A = Rng.randint(LargeBaseMin, LargeBaseMax)
    E = Rng.randint(100, 900)
    Product = Multiplicand * Multiplier
    CorrectAnswer = Decimal(A - Product - Quotient + E)
    if CorrectAnswer <= 0:
        A = min(9999, A + int(abs(CorrectAnswer)) + Rng.randint(100, 800))
        CorrectAnswer = Decimal(A - Product - Quotient + E)
    Units = [str(A), "-", f"{Multiplicand} × {Multiplier}", "-", f"{Dividend} ÷ {Divisor}", "+", str(E)]
    return _BodmasPayload(Units, CorrectAnswer, "BASIC_ADD_SUB_MUL_DIV", "LESSON_4_6_BASIC")


def _BodmasSquares(Config: MMConfig, Rng: random.Random, QuestionNumber: int, Stage: str) -> tuple[list[str], list[str], Decimal, dict]:
    SquareBase = Rng.randint(24, 95 if Stage in {"WARM_UP", "STANDARD"} else 260)
    Multiplier = Rng.randint(3, 9 if Stage in {"WARM_UP", "STANDARD"} else 15)
    Multiplicand = Rng.randint(180, 900 if Stage in {"WARM_UP", "STANDARD"} else 1800)
    Divisor, Quotient, Dividend = _GenerateBodmasDivisionTerm(Rng, 14, 60, 10, 140)
    AddValue = Rng.randint(500, 9000)
    Product = Multiplicand * Multiplier

    if QuestionNumber % 2 == 0:
        CorrectAnswer = Decimal(AddValue + Product - Quotient - (SquareBase ** 2))
        if CorrectAnswer <= 0:
            AddValue = min(9999, AddValue + int(abs(CorrectAnswer)) + Rng.randint(200, 1200))
            CorrectAnswer = Decimal(AddValue + Product - Quotient - (SquareBase ** 2))
        Units = [str(AddValue), "+", f"{Multiplicand} × {Multiplier}", "-", f"{Dividend} ÷ {Divisor}", "-", f"({SquareBase})²"]
        Pattern = "SQUARE_TRAILING"
    else:
        CorrectAnswer = Decimal((SquareBase ** 2) - Product - Quotient + AddValue)
        if CorrectAnswer <= 0:
            AddValue = min(9999, AddValue + int(abs(CorrectAnswer)) + Rng.randint(200, 1200))
            CorrectAnswer = Decimal((SquareBase ** 2) - Product - Quotient + AddValue)
        Units = [f"({SquareBase})²", "-", f"{Multiplicand} × {Multiplier}", "-", f"{Dividend} ÷ {Divisor}", "+", str(AddValue)]
        Pattern = "SQUARE_LEADING"
    return _BodmasPayload(Units, CorrectAnswer, Pattern, "LESSON_11_SQUARES")


def _BodmasBracketsPowersPercent(Config: MMConfig, Rng: random.Random, QuestionNumber: int, Stage: str) -> tuple[list[str], list[str], Decimal, dict]:
    # Lesson 16 workbook rows introduce brackets, powers, and percentages,
    # but the expression must still remain compact. This template intentionally
    # avoids adding a separate division term so the visible numeric count stays
    # within the workbook limit of seven.
    Left = Rng.randint(240, 850)
    Right = Rng.randint(12, 28)
    BracketDivisor = Rng.choice([10, 20, 25, 40, 50])
    BracketProduct = Decimal(Left * Right) / Decimal(BracketDivisor)

    Percent = Rng.choice([10, 15, 20, 25, 30, 40, 50, 70, 85])
    PercentBase = Rng.randrange(500, 6000, 10)
    PercentValue = Decimal(PercentBase * Percent) / Decimal(100)

    if QuestionNumber % 2 == 0:
        PowerBase = Rng.randint(18, 32)
        PowerValue = Decimal(PowerBase ** 3)
        PowerText = f"{PowerBase}³"
        Pattern = "BRACKET_PERCENT_CUBE_COMPACT"
    else:
        PowerBase = Rng.randint(28, 72)
        PowerValue = Decimal(PowerBase ** 2)
        PowerText = f"{PowerBase}²"
        Pattern = "BRACKET_PERCENT_SQUARE_COMPACT"

    CorrectAnswer = BracketProduct - PercentValue + PowerValue
    if CorrectAnswer <= 0:
        CorrectAnswer = BracketProduct + PercentValue + PowerValue
        Units = [f"({Left}×{Right})÷{BracketDivisor}", "+", f"({Percent}% of {PercentBase})", "+", PowerText]
        Pattern = f"{Pattern}_SAFE_ADD"
    else:
        Units = [f"({Left}×{Right})÷{BracketDivisor}", "-", f"({Percent}% of {PercentBase})", "+", PowerText]
    return _BodmasPayload(Units, _Quantize(CorrectAnswer, 2), Pattern, "LESSON_16_BRACKETS_POWERS_PERCENT")


def _BodmasCubeRootPercent(Config: MMConfig, Rng: random.Random, QuestionNumber: int, Stage: str) -> tuple[list[str], list[str], Decimal, dict]:
    Divisor, Quotient, Dividend = _GenerateBodmasDivisionTerm(Rng, 21, 90, 40, 150)

    Multiplier = Rng.randint(120, 900)
    Percent = Rng.choice([3, 4, 5, 6, 8, 10, 12, 15])
    PercentProduct = Decimal(Multiplier * Percent) / Decimal(100)

    Root = Rng.randint(24, 85)
    Radicand = Root ** 3

    if QuestionNumber % 2 == 0:
        CorrectAnswer = Decimal(Quotient) - PercentProduct + Decimal(Root)
        Units = [f"{Dividend} ÷ {Divisor}", "-", f"{Multiplier} × {Percent}%", "+", f"∛{Radicand}"]
        Pattern = "DIV_PERCENT_CUBEROOT_SUB"
    else:
        CorrectAnswer = Decimal(Quotient) + PercentProduct + Decimal(Root)
        Units = [f"{Dividend} ÷ {Divisor}", "+", f"{Multiplier} × {Percent}%", "+", f"∛{Radicand}"]
        Pattern = "DIV_PERCENT_CUBEROOT_ADD"
    if CorrectAnswer <= 0:
        CorrectAnswer = Decimal(Quotient) + PercentProduct + Decimal(Root)
        Units = [f"{Dividend} ÷ {Divisor}", "+", f"{Multiplier} × {Percent}%", "+", f"∛{Radicand}"]
        Pattern = "DIV_PERCENT_CUBEROOT_ADD_SAFE"
    return _BodmasPayload(Units, _Quantize(CorrectAnswer, 2), Pattern, "LESSON_19_CUBEROOT_PERCENT")


def _BodmasDecimalPercentSquare(Config: MMConfig, Rng: random.Random, QuestionNumber: int, Stage: str) -> tuple[list[str], list[str], Decimal, dict]:
    # Lesson 21/22 style keeps the decimal percentage bracket, but removes the
    # extra trailing constant so the row cannot overflow the question card.
    StartValue = Decimal(Rng.randrange(1500, 8500, 25))
    DecimalFactor = _RandDecimal(Rng, 20, 95, 2)
    Percent = Decimal(str(Rng.choice([10, 15, 20, 25, 30, 35, 40, 50])))
    Divisor = Decimal(str(Rng.choice([5, 10, 15, 20, 25, 30])))
    PercentTerm = (DecimalFactor * Percent / Decimal(100)) / Divisor
    SquareBase = Rng.randint(12, 30)
    CorrectAnswer = StartValue + PercentTerm - Decimal(SquareBase ** 2)
    if CorrectAnswer <= 0:
        StartValue = min(Decimal(9999), StartValue + Decimal(abs(int(CorrectAnswer))) + Decimal(Rng.randint(300, 900)))
        CorrectAnswer = StartValue + PercentTerm - Decimal(SquareBase ** 2)
    Units = [
        _FormatBodmasNumber(StartValue),
        "+",
        f"({_FormatBodmasNumber(DecimalFactor)}×{_FormatBodmasNumber(Percent)}%)÷{_FormatBodmasNumber(Divisor)}",
        "-",
        f"{SquareBase}²",
    ]
    return _BodmasPayload(Units, _Quantize(CorrectAnswer, 2), "DECIMAL_PERCENT_SQUARE_COMPACT", "LESSON_22_DECIMAL_PERCENT_SQUARE")


def _BodmasCubeRootSquareLarge(Config: MMConfig, Rng: random.Random, QuestionNumber: int, Stage: str) -> tuple[list[str], list[str], Decimal, dict]:
    CubeRoot = Rng.randint(24, 78)
    CubeRadicand = CubeRoot ** 3
    SquareBase = Rng.randint(42, 99)
    Divisor, Quotient, Dividend = _GenerateBodmasDivisionTerm(Rng, 32, 96, 24, 160)
    Multiplier = Rng.randint(25, 85)
    Multiplicand = Rng.randint(180, 980)
    TailValue = Rng.randint(120, 750)
    CorrectAnswer = Decimal(CubeRoot + (SquareBase ** 2) - Quotient + (Multiplicand * Multiplier) - TailValue)
    Units = [f"∛{CubeRadicand}", "+", f"{SquareBase}²", "-", f"{Dividend}÷{Divisor}", "+", f"{Multiplicand}×{Multiplier}", "-", str(TailValue)]
    return _BodmasPayload(Units, CorrectAnswer, "CUBEROOT_SQUARE_LARGE_COMPACT", "LESSON_23_CUBEROOT_SQUARE_LARGE")


def _BodmasSquareRootLarge(Config: MMConfig, Rng: random.Random, QuestionNumber: int, Stage: str) -> tuple[list[str], list[str], Decimal, dict]:
    Multiplicand = Rng.randint(240, 980)
    Multiplier = Rng.randint(24, 86)
    Root = Rng.randint(54, 99)
    Radicand = Root ** 2
    Divisor, Quotient, Dividend = _GenerateBodmasDivisionTerm(Rng, 24, 96, 40, 180)
    AddValue = Rng.randint(80, 350)
    SubValue = Rng.randint(80, 350)
    CorrectAnswer = Decimal((Multiplicand * Multiplier) + Root - Quotient + AddValue - SubValue)
    Units = [f"{Multiplicand}×{Multiplier}", "+", f"√{Radicand}", "-", f"{Dividend}÷{Divisor}", "+", str(AddValue), "-", str(SubValue)]
    return _BodmasPayload(Units, CorrectAnswer, "SQUAREROOT_LARGE_COMPACT", "LESSON_27_SQUAREROOT_LARGE")


def GenerateBodmas(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    LessonNumber = int(Config.LessonNumber or 1)

    if LessonNumber >= 27:
        return _BodmasSquareRootLarge(Config, Rng, QuestionNumber, Stage)
    if LessonNumber >= 23:
        return _BodmasCubeRootSquareLarge(Config, Rng, QuestionNumber, Stage)
    if LessonNumber >= 22:
        return _BodmasDecimalPercentSquare(Config, Rng, QuestionNumber, Stage)
    if LessonNumber >= 19:
        return _BodmasCubeRootPercent(Config, Rng, QuestionNumber, Stage)
    if LessonNumber >= 16:
        return _BodmasBracketsPowersPercent(Config, Rng, QuestionNumber, Stage)
    if LessonNumber >= 11:
        return _BodmasSquares(Config, Rng, QuestionNumber, Stage)
    return _BodmasBasicArithmetic(Config, Rng, QuestionNumber, Stage)


def _NumericDigitCount(Value: Decimal) -> int:
    return len("".join(Character for Character in format(Value, "f") if Character.isdigit()))


def GeneratePercentageAddLess(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    Band = _LessonBand(Config)
    BaseRanges = {
        1: (100, 750),
        2: (250, 1500),
        3: (500, 3000),
        4: (750, 7000),
        5: (1000, 15000),
        6: (1500, 25000),
    }
    BaseMin, BaseMax = BaseRanges.get(Band, (100, 750))

    ActiveSectionTitle = ""
    if isinstance(Config.GeneratorConfig, dict) and isinstance(Config.GeneratorConfig.get("activeSection"), dict):
        ActiveSectionTitle = str(Config.GeneratorConfig.get("activeSection", {}).get("sectionTitle") or Config.GeneratorConfig.get("activeSection", {}).get("title") or "")
    TitleText = f" {ActiveSectionTitle or Config.DpsTitle} ".lower()
    if "less" in TitleText and "add" not in TitleText:
        Operator = "-%"
    elif "add" in TitleText and "less" not in TitleText:
        Operator = "×%"
    else:
        Operator = Rng.choice(["×%", "-%"])

    if Operator == "-%":
        PercentChoices = [5, 8, 10, 12, 15, 18, 20, 22, 25, 30, 35, 40, 45, 50]
    elif Stage in {"WARM_UP", "STANDARD"}:
        PercentChoices = [5, 10, 15, 20, 25, 30, 40, 50]
    elif Stage == "MIXED_STEP":
        PercentChoices = [5, 8, 10, 12, 15, 18, 20, 22, 25, 30, 35, 45, 50]
    else:
        PercentChoices = [5, 7.5, 10, 12.5, 15, 17.5, 20, 25, 30, 35, 40, 45, 50, 60, 70]

    LakhCap = Decimal("100000")
    Base = Decimal(0)
    Percent = Decimal(0)
    CorrectAnswer = Decimal(0)
    for Attempt in range(60):
        Percent = Decimal(str(Rng.choice(PercentChoices)))
        if Operator == "-%":
            # Less Percentage must use whole-number base and whole-number percent.
            Step = 10 if BaseMax >= 1000 else 1
            Base = Decimal(Rng.randrange(BaseMin, BaseMax + 1, Step))
            Percent = Decimal(int(Percent))
        else:
            if Band >= 3 and Rng.random() < 0.45:
                Base = _RandDecimal(Rng, BaseMin, min(BaseMax, 9999), 2)
            else:
                Step = 10 if BaseMax >= 1000 else 1
                Base = Decimal(Rng.randrange(BaseMin, min(BaseMax, 999999) + 1, Step))

        if Operator == "×%" and _NumericDigitCount(Base) > 6:
            continue
        if Operator == "-%" and (Base != Base.to_integral_value() or Percent != Percent.to_integral_value()):
            continue

        PercentValue = Base * Percent / Decimal(100)
        CorrectAnswer = PercentValue if Operator == "×%" else Base - PercentValue
        CorrectAnswer = _Quantize(CorrectAnswer, 2)
        if Decimal(0) <= CorrectAnswer <= LakhCap:
            break
    else:
        Percent = Decimal("10")
        Base = Decimal(min(BaseMax, 9999))
        CorrectAnswer = _Quantize(Base * Percent / Decimal(100) if Operator == "×%" else Base - (Base * Percent / Decimal(100)), 2)

    return [_AsDisplayNumber(Base), _AsDisplayNumber(Percent)], ["", Operator], CorrectAnswer, {
        "percentage_mode": "ADD_PERCENTAGE" if Operator == "×%" else "LESS_PERCENTAGE",
        "base_amount": _AsDisplayNumber(Base),
        "percentage_operator": Operator,
        "percentage_workbook_rule": "BASE_TIMES_PERCENT" if Operator == "×%" else "BASE_MINUS_PERCENT_OF_BASE",
        "lakh_range_cap": int(LakhCap),
        "two_part_only": True,
        "lesson_band": Band,
        "add_percentage_max_numeric_digits": 6 if Operator == "×%" else None,
        "less_percentage_whole_numbers_only": Operator == "-%",
    }


def GeneratePercentageValue(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    # Percentage calculation format (for example, "25% of 800") is currently
    # disabled for MM because the workbook convention for active percentage
    # sheets is Add/Less Percentage only: base × percent% or base - percent%.
    # Keep this safe fallback so old/ambiguous concept routing cannot leak
    # percentage-calculation questions into Add/Less Percentage sheets.
    return GeneratePercentageAddLess(Config, Rng, QuestionNumber)


def GeneratePercentageIncreaseDecrease(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    return GeneratePercentageAddLess(Config, Rng, QuestionNumber)


def _MoneyRange(Config: MMConfig, Stage: str) -> tuple[int, int]:
    Band = _LessonBand(Config)
    BaseRanges = {
        1: (1000, 6000),
        2: (1500, 10000),
        3: (2500, 15000),
        4: (5000, 30000),
        5: (7500, 40000),
        6: (10000, 45000),
    }
    Minimum, Maximum = BaseRanges.get(Band, (1000, 6000))
    return Minimum, min(Maximum, 50000)


def _CleanMoney(Value: Decimal) -> Decimal:
    return _Quantize(Value, 2)


def _FinancialPercentChoices(Config: MMConfig, Stage: str) -> list[Decimal]:
    if Stage in {"WARM_UP", "STANDARD"}:
        Choices = [5, 10, 15, 20, 25, 30]
    elif Stage == "MIXED_STEP":
        Choices = [5, 8, 10, 12, 15, 18, 20, 22, 25, 30]
    elif Stage == "ADVANCED":
        Choices = [2.5, 5, 7.5, 10, 12.5, 15, 18, 20, 25, 30, 35]
    else:
        Choices = [1, 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 25, 30, 35, 40]
    return [Decimal(str(Value)) for Value in Choices]


def _FinancialMode(Config: MMConfig, QuestionNumber: int) -> str:
    Text = f" {Config.DpsTitle} ".lower()
    if "selling price" in Text:
        return "FIND_SELLING_PRICE"
    if "cost price" in Text:
        return "FIND_COST_PRICE"
    if "profit" in Text and "loss" not in Text:
        return "PROFIT"
    if "loss" in Text and "profit" not in Text:
        return "LOSS"
    return "PROFIT" if QuestionNumber % 2 == 1 else "LOSS"


def _ProfitLossVariant(Config: MMConfig, QuestionNumber: int) -> str:
    Text = f" {Config.DpsTitle} ".lower()
    HasProfit = "profit" in Text
    HasLoss = "loss" in Text

    if HasProfit and not HasLoss:
        Sequence = ["PROFIT", "PROFIT_PERCENT"]
    elif HasLoss and not HasProfit:
        Sequence = ["LOSS", "LOSS_PERCENT"]
    else:
        # A generic Profit/Loss section must cover all four workbook variants
        # instead of alternating only Profit and Loss %.
        Sequence = ["PROFIT", "PROFIT_PERCENT", "LOSS", "LOSS_PERCENT"]

    return Sequence[(QuestionNumber - 1) % len(Sequence)]


def GenerateProfitLoss(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    Minimum, Maximum = _MoneyRange(Config, Stage)
    Percent = Rng.choice(_FinancialPercentChoices(Config, Stage))
    Variant = _ProfitLossVariant(Config, QuestionNumber)
    IsLoss = Variant.startswith("LOSS")

    CostPrice = Decimal(0)
    SellingPrice = Decimal(0)
    for _ in range(40):
        Percent = Rng.choice(_FinancialPercentChoices(Config, Stage))
        EffectiveMaximum = Maximum
        if not IsLoss:
            EffectiveMaximum = min(EffectiveMaximum, int(Decimal(50000) / (Decimal(1) + Percent / Decimal(100))))
        CostPrice = Decimal(Rng.randrange(Minimum, max(Minimum, EffectiveMaximum) + 1, 25))
        Change = _CleanMoney(CostPrice * Percent / Decimal(100))
        SellingPrice = _CleanMoney(CostPrice - Change) if IsLoss else _CleanMoney(CostPrice + Change)
        if CostPrice <= Decimal(50000) and SellingPrice <= Decimal(50000):
            break

    Change = _CleanMoney(abs(SellingPrice - CostPrice))

    if Variant == "LOSS":
        CorrectAnswer = Change
        QuestionText = "Find Loss"
        AnswerKind = "LOSS"
    elif Variant == "LOSS_PERCENT":
        CorrectAnswer = Percent
        QuestionText = "Find Loss %"
        AnswerKind = "LOSS_PERCENT"
    elif Variant == "PROFIT_PERCENT":
        CorrectAnswer = Percent
        QuestionText = "Find Profit %"
        AnswerKind = "PROFIT_PERCENT"
    else:
        CorrectAnswer = Change
        QuestionText = "Find Profit"
        AnswerKind = "PROFIT"

    return [_AsDisplayNumber(CostPrice), _AsDisplayNumber(SellingPrice)], ["Cost Price", "Selling Price"], _CleanMoney(CorrectAnswer), {
        "financial_mode": "LOSS" if IsLoss else "PROFIT",
        "answer_kind": AnswerKind,
        "question_text": QuestionText,
        "cost_price": _AsDisplayNumber(CostPrice),
        "selling_price": _AsDisplayNumber(SellingPrice),
        "percentage": _AsDisplayNumber(Percent),
        "money_cap": 50000,
    }


def GenerateFindSellingPrice(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    Minimum, Maximum = _MoneyRange(Config, Stage)
    IsLoss = "loss" in f" {Config.DpsTitle} ".lower() or ("profit" not in f" {Config.DpsTitle} ".lower() and QuestionNumber % 2 == 0)

    CostPrice = Decimal(0)
    SellingPrice = Decimal(0)
    Percent = Decimal(0)
    for _ in range(40):
        Percent = Rng.choice(_FinancialPercentChoices(Config, Stage))
        EffectiveMaximum = Maximum
        if not IsLoss:
            EffectiveMaximum = min(EffectiveMaximum, int(Decimal(50000) / (Decimal(1) + Percent / Decimal(100))))
        CostPrice = Decimal(Rng.randrange(Minimum, max(Minimum, EffectiveMaximum) + 1, 25))
        SellingPrice = _CleanMoney(CostPrice - (CostPrice * Percent / Decimal(100))) if IsLoss else _CleanMoney(CostPrice + (CostPrice * Percent / Decimal(100)))
        if CostPrice <= Decimal(50000) and SellingPrice <= Decimal(50000):
            break

    PercentLabel = "Loss %" if IsLoss else "Profit %"
    return [_AsDisplayNumber(CostPrice), _AsDisplayNumber(Percent)], ["Cost Price", PercentLabel], SellingPrice, {
        "financial_mode": "FIND_SELLING_PRICE",
        "question_text": "Find Selling Price",
        "cost_price": _AsDisplayNumber(CostPrice),
        "percentage": _AsDisplayNumber(Percent),
        "percentage_type": PercentLabel,
        "selling_price_cap": 50000,
    }


def GenerateFindCostPrice(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    Minimum, Maximum = _MoneyRange(Config, Stage)
    Percent = Rng.choice(_FinancialPercentChoices(Config, Stage))
    CostPrice = Decimal(Rng.randrange(Minimum, Maximum + 1, 25))
    IsLoss = "loss" in f" {Config.DpsTitle} ".lower() or ("profit" not in f" {Config.DpsTitle} ".lower() and QuestionNumber % 2 == 0)
    SellingPrice = _CleanMoney(CostPrice - (CostPrice * Percent / Decimal(100))) if IsLoss else _CleanMoney(CostPrice + (CostPrice * Percent / Decimal(100)))
    if SellingPrice > Decimal(50000):
        SellingPrice = Decimal(50000)
        if IsLoss:
            CostPrice = _CleanMoney(SellingPrice / (Decimal(1) - (Percent / Decimal(100))))
        else:
            CostPrice = _CleanMoney(SellingPrice / (Decimal(1) + (Percent / Decimal(100))))
    PercentLabel = "Loss %" if IsLoss else "Profit %"
    return [_AsDisplayNumber(SellingPrice), _AsDisplayNumber(Percent)], ["Selling Price", PercentLabel], _CleanMoney(CostPrice), {
        "financial_mode": "FIND_COST_PRICE",
        "question_text": "Find Cost Price",
        "selling_price": _AsDisplayNumber(SellingPrice),
        "percentage": _AsDisplayNumber(Percent),
        "percentage_type": PercentLabel,
        "money_cap": 50000,
    }





def _SkillStackerRanges(Config: MMConfig, Stage: str) -> tuple[tuple[int, int], tuple[int, int]]:
    """Strict workbook-safe Skill Stacker range.

    Skill Stacker ADD values must stay two-digit and never exceed 50.
    TIMES remains progression-banded so the accumulation challenge still grows
    without leaking into 3+ digit ADD values.
    """
    AddRange = (10, 50)
    TimesRanges = {
        "WARM_UP": (8, 10),
        "STANDARD": (8, 11),
        "MIXED_STEP": (7, 11),
        "ADVANCED": (6, 10),
        "CHALLENGE": (5, 9),
    }
    return AddRange, TimesRanges.get(Stage, (6, 10))


def _SkillStackerAnswer(AddValue: int, Times: int) -> Decimal:
    return Decimal(AddValue * (2 ** (Times - 1)))


def _SkillStackerMagnitudeBand(Config: MMConfig, QuestionNumber: int) -> str:
    """Return the Skill Stacker difficulty band for two-digit ADD values.

    The ADD value is always 10–50. Progression is created by pairing lower ADD
    values with higher TIMES and higher ADD values with lower TIMES.
    """
    NormalizedQuestionNumber = max(1, min(5, int(QuestionNumber or 1)))
    Pattern = ["SMALL", "SMALL", "MEDIUM", "MEDIUM", "LARGE"]
    return Pattern[NormalizedQuestionNumber - 1]


def _SkillStackerPairFromBand(PairSlot: int, Band: str) -> tuple[int, int]:
    """Return a deterministic unique ADD/TIMES pair for the selected band.

    ADD is strictly two-digit and within 10–50 inclusive.
    """
    if Band == "SMALL":
        AddCandidates = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]
        TimesCandidates = [12, 11, 10, 9, 8]
    elif Band == "LARGE":
        AddCandidates = [39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50]
        TimesCandidates = [7, 6, 5, 4, 3]
    else:
        AddCandidates = [23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38]
        TimesCandidates = [10, 9, 8, 7, 6]

    AddValue = AddCandidates[PairSlot % len(AddCandidates)]
    Times = TimesCandidates[(PairSlot // len(AddCandidates)) % len(TimesCandidates)]
    return AddValue, Times


def _SkillStackerUniquePair(Config: MMConfig, QuestionNumber: int) -> tuple[int, int]:
    """Return a deterministic ADD/TIMES pair for Skill Stacker.

    Hard rules:
    - ADD is always two-digit.
    - ADD is always between 10 and 50 inclusive.
    - Question numbers are intentionally capped to 1–5 because every Skill
      Stacker section is limited to exactly five sums.
    - Pair selection includes lesson, DPS, section, and question slot so the five
      rows inside a sheet stay unique and sheets avoid repeated pairs as much as
      the finite 10–50 pool allows.
    """
    LessonNumber = max(1, min(30, int(Config.LessonNumber or 1)))
    DpsNumber = max(1, min(5, int(Config.DpsNumber or 1)))
    SectionNumber = 1
    if isinstance(Config.GeneratorConfig, dict):
        ActiveSection = Config.GeneratorConfig.get("activeSection")
        if isinstance(ActiveSection, dict):
            try:
                SectionNumber = max(1, int(ActiveSection.get("sectionNumber") or ActiveSection.get("order") or 1))
            except Exception:
                SectionNumber = 1

    NormalizedQuestionNumber = max(1, min(5, int(QuestionNumber or 1)))
    WorkbookSlot = ((LessonNumber - 1) * 25) + ((DpsNumber - 1) * 5) + (NormalizedQuestionNumber - 1)
    SectionOffset = (SectionNumber - 1) * 150
    PairSlot = WorkbookSlot + SectionOffset
    Band = _SkillStackerMagnitudeBand(Config, NormalizedQuestionNumber)

    return _SkillStackerPairFromBand(PairSlot, Band)


def GenerateSkillStacker(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    AddValue, Times = _SkillStackerUniquePair(Config, QuestionNumber)
    CorrectAnswer = _SkillStackerAnswer(AddValue, Times)
    return [AddValue, Times], ["Add", "Times"], CorrectAnswer, {
        "question_text": "Skill Stacker",
        "skill_stacker_mode": "REPEATED_DOUBLING_ACCUMULATION",
        "skill_stacker_uniqueness": "LESSON_DPS_QUESTION_PAIR_POOL",
    }

def _ConceptDrillRanges(Config: MMConfig, Stage: str) -> tuple[tuple[int, int], tuple[int, int]]:
    Band = _LessonBand(Config)
    if Band <= 2:
        FromRanges = {
            "WARM_UP": (250, 1200),
            "STANDARD": (800, 2500),
            "MIXED_STEP": (1500, 4500),
            "ADVANCED": (3000, 7500),
            "CHALLENGE": (5000, 12000),
        }
        LessRanges = {
            "WARM_UP": (25, 150),
            "STANDARD": (75, 300),
            "MIXED_STEP": (150, 600),
            "ADVANCED": (250, 900),
            "CHALLENGE": (400, 1500),
        }
    elif Band <= 4:
        FromRanges = {
            "WARM_UP": (1200, 5000),
            "STANDARD": (2500, 9000),
            "MIXED_STEP": (6000, 18000),
            "ADVANCED": (12000, 35000),
            "CHALLENGE": (20000, 70000),
        }
        LessRanges = {
            "WARM_UP": (120, 450),
            "STANDARD": (250, 900),
            "MIXED_STEP": (500, 1800),
            "ADVANCED": (900, 3500),
            "CHALLENGE": (1500, 6500),
        }
    else:
        FromRanges = {
            "WARM_UP": (5000, 25000),
            "STANDARD": (15000, 60000),
            "MIXED_STEP": (30000, 120000),
            "ADVANCED": (75000, 250000),
            "CHALLENGE": (150000, 500000),
        }
        LessRanges = {
            "WARM_UP": (250, 1500),
            "STANDARD": (750, 4500),
            "MIXED_STEP": (1500, 9000),
            "ADVANCED": (3500, 18000),
            "CHALLENGE": (7000, 35000),
        }
    return FromRanges.get(Stage, (1000, 5000)), LessRanges.get(Stage, (100, 500))


def GenerateConceptDrill(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    (FromMin, FromMax), (LessMin, LessMax) = _ConceptDrillRanges(Config, Stage)
    LessValue = Rng.randint(LessMin, LessMax)
    RepetitionCount = Rng.randint(3, 10 if Stage in {"WARM_UP", "STANDARD"} else 16)
    Remainder = Rng.randint(1, max(1, LessValue - 1))
    FromValue = (LessValue * RepetitionCount) + Remainder
    if FromValue < FromMin:
        ExtraSteps = ((FromMin - FromValue) // LessValue) + 1
        RepetitionCount += ExtraSteps
        FromValue = (LessValue * RepetitionCount) + Remainder
    if FromValue > FromMax:
        FromValue = Rng.randint(FromMin, FromMax)
        LessValue = Rng.randint(max(2, min(LessMin, FromValue // 8)), max(3, min(LessMax, FromValue // 2)))
        if FromValue % LessValue == 0:
            FromValue += 1
    CorrectAnswer = Decimal(FromValue % LessValue)
    if CorrectAnswer == 0:
        FromValue += 1
        CorrectAnswer = Decimal(FromValue % LessValue)
    return [FromValue, LessValue], ["From", "Less"], CorrectAnswer, {
        "question_text": "Concept Drill",
        "concept_drill_mode": "REPEATED_SUBTRACTION_REMAINDER",
    }


def _AnswerPositionTitle(Config: MMConfig) -> str:
    return " ".join(f" {Config.DpsTitle} ".lower().split())


def _PowerOfTenDecimal(Position: int) -> Decimal:
    if Position >= 0:
        return Decimal(10) ** Position
    return Decimal(1) / (Decimal(10) ** abs(Position))


def _WorkbookPositionAnswer(NumberValue: int, Position: int) -> Decimal:
    """Return workbook answer for Write Number from the Given Position.

    Workbook rule:
    - Place the complete number so its first digit starts at the requested
      position on the place-value scale.
    - Example: position -2 with number 56 => 0.0056.
    - Formula: number × 10^(position - digit_count(number)).
    """
    DigitCount = len(str(abs(int(NumberValue))))
    Exponent = int(Position) - DigitCount
    if Exponent >= 0:
        return Decimal(NumberValue) * (Decimal(10) ** Exponent)
    return Decimal(NumberValue) / (Decimal(10) ** abs(Exponent))


def _WorkbookPositionDecimalPlaces(NumberValue: int, Position: int) -> int:
    DigitCount = len(str(abs(int(NumberValue))))
    Exponent = int(Position) - DigitCount
    return abs(Exponent) if Exponent < 0 else 0


def _WorkbookPositionChoices(Config: MMConfig, Stage: str) -> list[int]:
    Band = _LessonBand(Config)
    if Band <= 2:
        return [-2, -1, 0, 1, 2]
    if Band <= 4:
        return [-4, -3, -2, -1, 0, 1, 2]
    return [-5, -4, -3, -2, -1, 0, 1, 2, 3]


def _WorkbookPositionNumber(Config: MMConfig, Rng: random.Random, Stage: str) -> int:
    Band = _LessonBand(Config)
    if Stage in {"WARM_UP", "STANDARD"}:
        DigitLength = 2 if Band <= 2 else Rng.choice([2, 3])
    elif Stage == "MIXED_STEP":
        DigitLength = Rng.choice([2, 3, 4])
    elif Stage == "ADVANCED":
        DigitLength = Rng.choice([3, 4, 5])
    else:
        DigitLength = Rng.choice([3, 4, 5, 6])

    Minimum, Maximum = _DigitRange(DigitLength)
    return Rng.randint(Minimum, Maximum)



def _FirstNaturalDigitPositionFromDecimalText(ValueText: str) -> int:
    """Return the workbook position of the first non-zero/natural digit.

    Workbook scale for decimal multiplication answer placement:
    2001 -> 4, 213.5 -> 3, 2.06 -> 1, 0.351 -> 0,
    0.03 -> -1, 0.003 -> -2.
    """
    CleanText = str(ValueText).strip().replace(",", "")
    if CleanText.startswith("+") or CleanText.startswith("-"):
        CleanText = CleanText[1:]
    IntegerPart, _, DecimalPart = CleanText.partition(".")
    IntegerPart = IntegerPart or "0"
    IntegerDigits = IntegerPart.lstrip("0")
    if IntegerDigits:
        return len(IntegerDigits)

    for Index, Character in enumerate(DecimalPart):
        if Character.isdigit() and Character != "0":
            return -Index
    return 0


def _GenerateDecimalPlacementOperandForPosition(TargetPosition: int, SeedValue: int) -> str:
    """Create a compact workbook-style operand with the requested first-digit position.

    The generated value is deterministic from lesson/DPS/question seed so the
    examples vary without becoming random or repeated-looking across previews.
    """
    FirstDigit = str((SeedValue % 8) + 1)
    SecondDigit = str(((SeedValue // 3) % 9) + 1)
    ThirdDigit = str(((SeedValue // 7) % 9) + 1)
    FourthDigit = str(((SeedValue // 11) % 9) + 1)

    if TargetPosition >= 1:
        IntegerDigits = (FirstDigit + SecondDigit + ThirdDigit + FourthDigit + "246813579")[:TargetPosition]
        DecimalTailLength = 1 + (SeedValue % 3)
        DecimalTail = (SecondDigit + FourthDigit + ThirdDigit + "579")[:DecimalTailLength]
        if TargetPosition >= 4 and SeedValue % 2 == 0:
            return IntegerDigits
        return f"{IntegerDigits}.{DecimalTail}"

    if TargetPosition == 0:
        DecimalTailLength = 2 + (SeedValue % 3)
        DecimalTail = (FirstDigit + ThirdDigit + SecondDigit + FourthDigit + "864")[:DecimalTailLength]
        return f"0.{DecimalTail}"

    LeadingZeros = "0" * abs(TargetPosition)
    TailLength = 1 + (SeedValue % 3)
    Tail = (FirstDigit + SecondDigit + ThirdDigit + FourthDigit + "975")[:TailLength]
    return f"0.{LeadingZeros}{Tail}"


def _DecimalMultiplicationPlacementOperands(Config: MMConfig, QuestionNumber: int) -> tuple[str, str, int]:
    """Generate workbook-aligned answer-placement operands.

    The answer is not product decimal places. It is the sum of the workbook
    first-natural-digit positions of both operands.
    """
    LessonNumber = max(1, int(Config.LessonNumber or 1))
    DpsNumber = max(1, int(Config.DpsNumber or 1))
    Slot = ((LessonNumber - 1) * 5 * 10) + ((DpsNumber - 1) * 10) + max(1, QuestionNumber)
    WorkbookPairs = [
        (1, -2),    # 2.2 × 0.004 -> -1
        (-2, -3),  # 0.001 × 0.0009 -> -5
        (4, -2),   # 2001 × 0.003 -> 2
        (0, 0),     # 0.351 × 0.2 -> 0
        (3, -2),   # 213.5 × 0.0022 -> 1
        (-2, -2),  # 0.0031 × 0.002 -> -4
        (0, 1),     # 0.1023 × 4 -> 1
        (1, -2),
        (-1, -3),
        (2, -2),
    ]
    LeftPosition, RightPosition = WorkbookPairs[(QuestionNumber - 1) % len(WorkbookPairs)]
    if (LessonNumber + DpsNumber + QuestionNumber) % 4 == 0:
        LeftPosition, RightPosition = RightPosition, LeftPosition

    LeftText = _GenerateDecimalPlacementOperandForPosition(LeftPosition, Slot + 17)
    RightText = _GenerateDecimalPlacementOperandForPosition(RightPosition, Slot + 43)
    CorrectPosition = _FirstNaturalDigitPositionFromDecimalText(LeftText) + _FirstNaturalDigitPositionFromDecimalText(RightText)
    return LeftText, RightText, CorrectPosition

def GenerateAnswerPosition(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    """Generate workbook-specific position/placement questions.

    This covers separate MM workbook concepts:
    - Find the Position of the First Natural Number
    - Write the Number from the Given Position
    - Decimal Multiplication Answer Position / Answer Placement

    Each branch is concept-specific so a multiplication/division or equation
    routing change cannot leak into the position workbook task.
    """
    Title = _AnswerPositionTitle(Config)
    Stage = DifficultyStage(QuestionNumber - 1)

    if "write" in Title and "given position" in Title:
        PositionChoices = _WorkbookPositionChoices(Config, Stage)
        # Use a deterministic workbook-style spread so one DPS naturally includes
        # negative, zero, and positive positions instead of random-only patterns.
        Position = PositionChoices[(QuestionNumber - 1) % len(PositionChoices)]
        if Rng.random() < 0.35:
            Position = Rng.choice(PositionChoices)

        NumberValue = _WorkbookPositionNumber(Config, Rng, Stage)
        CorrectAnswer = _WorkbookPositionAnswer(NumberValue, Position)
        CorrectAnswer = _Quantize(CorrectAnswer, _WorkbookPositionDecimalPlaces(NumberValue, Position))

        return [Position, NumberValue], ["Position", "Number"], CorrectAnswer, {
            "question_text": "Write the Number from the Given Position",
            "answer_position_mode": "WRITE_NUMBER_FROM_GIVEN_POSITION_TABLE",
            "source_number": str(NumberValue),
            "position": Position,
            "position_number_table": True,
            "workbook_display": "POSITION_NUMBER_TABLE",
        }

    if "decimal" in Title or "answer placement" in Title or "answer position" in Title:
        LeftText, RightText, CorrectPosition = _DecimalMultiplicationPlacementOperands(Config, QuestionNumber)
        QuestionText = f"{LeftText} × {RightText} = ?"
        return [LeftText, RightText], ["", "×"], Decimal(CorrectPosition), {
            "question_text": QuestionText,
            "answer_position_mode": "DECIMAL_MULTIPLICATION_PLACEMENT",
            "left_position": _FirstNaturalDigitPositionFromDecimalText(LeftText),
            "right_position": _FirstNaturalDigitPositionFromDecimalText(RightText),
        }

    def _FirstNaturalUniqueNumber(Config: MMConfig, QuestionNumber: int) -> str:
        """Create a deterministic, workbook-style non-repeating number.

        The workbook treats this concept as repeated place-value recognition, so
        students should not see the same source number again in later DPS sheets.
        The slot formula below gives each lesson/DPS/question a stable unique
        source value while cycling through positive, zero, and negative position
        bands from the workbook.
        """
        LessonNumber = max(1, min(30, int(Config.LessonNumber or 1)))
        DpsNumber = max(1, min(5, int(Config.DpsNumber or 1)))
        Slot = ((LessonNumber - 1) * 5 * 10) + ((DpsNumber - 1) * 10) + max(1, QuestionNumber)
        PositionCycle = [1, 2, -2, -1, 3, 0, -3, 2, -4, 1]
        TargetPosition = PositionCycle[(Slot - 1) % len(PositionCycle)]
        Offset = Slot * 37
        UniqueSuffix = f"{Slot:04d}"

        if TargetPosition >= 1:
            Minimum = 10 ** (TargetPosition - 1)
            Maximum = (10 ** TargetPosition) - 1
            IntegerValue = Minimum + (Offset % (Maximum - Minimum + 1))
            return f"{IntegerValue}.{UniqueSuffix}"

        FirstDigit = 1 + (Offset % 9)
        if TargetPosition == 0:
            return f"0.{FirstDigit}{UniqueSuffix}"

        LeadingZeros = abs(TargetPosition)
        return f"0.{('0' * LeadingZeros)}{FirstDigit}{UniqueSuffix}"

    NumberText = _FirstNaturalUniqueNumber(Config, QuestionNumber)

    def _FirstNaturalPosition(ValueText: str) -> int:
        CleanValue = str(ValueText).strip().replace(",", "")
        IntegerPart, _, DecimalPart = CleanValue.partition(".")
        IntegerDigits = IntegerPart.lstrip("+-") or "0"
        if any(Char != "0" for Char in IntegerDigits):
            return len(IntegerDigits.lstrip("0"))
        LeadingDecimalZeros = 0
        for Char in DecimalPart:
            if Char == "0":
                LeadingDecimalZeros += 1
                continue
            if Char.isdigit():
                return -LeadingDecimalZeros
        return 0

    CorrectAnswer = Decimal(_FirstNaturalPosition(NumberText))
    return [NumberText], ["Number"], CorrectAnswer, {
        "question_text": "",
        "answer_position_mode": "FIRST_NATURAL_NUMBER_POSITION",
        "source_number": NumberText,
        "workbook_display": "FIRST_NATURAL_NUMBER_CARD",
    }


def GenerateSimpleInterest(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    PrincipalRanges = {
        "WARM_UP": (1000, 12000),
        "STANDARD": (2500, 25000),
        "MIXED_STEP": (5000, 40000),
        "ADVANCED": (7500, 75000),
        "CHALLENGE": (10000, 99975),
    }
    Minimum, Maximum = PrincipalRanges.get(Stage, (1000, 25000))
    Principal = Decimal(Rng.randrange(Minimum, Maximum + 1, 25))
    Rate = Decimal(Rng.randint(1, 9))
    TermChoices = [2, 3, 4, 5, 6] if Stage in {"WARM_UP", "STANDARD"} else [2, 3, 4, 5, 6, 7, 8, 9]
    Term = Decimal(str(Rng.choice(TermChoices)))
    CorrectAnswer = _CleanMoney(Principal * Term * Rate / Decimal(100))
    return [_AsDisplayNumber(Principal), _AsDisplayNumber(Term), _AsDisplayNumber(Rate)], ["Principal", "Term (Years)", "Rate of Interest"], CorrectAnswer, {
        "financial_mode": "SIMPLE_INTEREST",
        "question_text": "Find Simple Interest",
        "principal": _AsDisplayNumber(Principal),
        "term_years": _AsDisplayNumber(Term),
        "rate_percent": _AsDisplayNumber(Rate),
        "principal_max_digits": 5,
        "single_digit_rate_only": True,
        "time_limited_for_known_patterns": True,
    }


def _FindTokenPosition(Text: str, Tokens: list[str]) -> int | None:
    Positions = [Text.find(Token) for Token in Tokens if Text.find(Token) >= 0]
    return min(Positions) if Positions else None


def _MixedMultiplicationDivisionOperationSequence(Config: MMConfig) -> list[str]:
    """Return lesson-aware operation variants for mixed multiplication/division sheets.

    Mixed Pattern means a balanced review of the operation family, not merely a
    whole/decimal split. Standalone decimal sections remain decimal-only, but
    true mixed sections cycle through the digit patterns introduced by the
    current lesson and include decimal mechanisms as one part of the review.
    """
    GeneratorConfig = Config.GeneratorConfig if isinstance(Config.GeneratorConfig, dict) else {}
    MixedOperationGroup = str(GeneratorConfig.get("mixedOperationGroup") or "").upper()
    ActiveSection = GeneratorConfig.get("activeSection") if isinstance(GeneratorConfig.get("activeSection"), dict) else {}
    ActiveSectionTitle = str(ActiveSection.get("sectionTitle") or ActiveSection.get("title") or "")
    SourceDpsTitle = str(GeneratorConfig.get("sourceDpsTitle") or Config.DpsTitle)
    SourceLessonTitle = str(GeneratorConfig.get("sourceLessonTitle") or Config.LessonTitle)
    SectionText = " ".join(
        f" {Config.DpsTitle} {ActiveSectionTitle} ".lower().replace("×", " x ").replace("÷", " division ").split()
    )
    FullText = " ".join(
        f" {SourceDpsTitle} {SourceLessonTitle} {Config.DpsTitle} {Config.LessonTitle} {ActiveSectionTitle} "
        .lower()
        .replace("×", " x ")
        .replace("÷", " division ")
        .split()
    )
    HasDecimalMultiplication = (
        "decimal multiplication" in FullText
        or "decimal number multiplication" in FullText
        or "multiplication of decimal" in FullText
    )
    HasDecimalDivision = (
        "decimal division" in FullText
        or "division of decimal" in FullText
        or "decimal number division" in FullText
    )
    MixedDpsText = " ".join(f" {SourceDpsTitle} {Config.DpsTitle} {ActiveSectionTitle} ".lower().split())
    IsTrueMixedPattern = "mixed pattern" in MixedDpsText

    LessonNumber = int(Config.LessonNumber or 1)

    MultiplicationVariants = ["MUL_2D_2D"]
    if LessonNumber >= 8:
        MultiplicationVariants.append("MUL_DECIMAL")
    if LessonNumber >= 14:
        MultiplicationVariants.append("MUL_3D_2D")
    if LessonNumber >= 20:
        MultiplicationVariants.extend(["MUL_4D_1D", "MUL_4D_2D"])
    if LessonNumber >= 23:
        MultiplicationVariants.append("MUL_3D_3D")

    DivisionVariants = ["DIV_3D_1D"]
    if LessonNumber >= 11:
        DivisionVariants.append("DIV_DECIMAL")
    if LessonNumber >= 14:
        DivisionVariants.append("DIV_4D_1D")
    if LessonNumber >= 18:
        DivisionVariants.extend(["DIV_3D_2D", "DIV_4D_2D"])
    if LessonNumber >= 22:
        DivisionVariants.extend(["DIV_5D_2D", "DIV_4D_3D"])
    if LessonNumber >= 26:
        DivisionVariants.extend(["DIV_6D_2D", "DIV_5D_3D", "DIV_6D_3D"])

    if MixedOperationGroup == "MULTIPLICATION":
        if HasDecimalMultiplication and not IsTrueMixedPattern:
            return ["DECIMAL_MULTIPLICATION"]
        return MultiplicationVariants
    if MixedOperationGroup == "DIVISION":
        if HasDecimalDivision and not IsTrueMixedPattern:
            return ["DECIMAL_DIVISION"]
        return DivisionVariants

    Text = FullText
    Operations: list[tuple[int, str]] = []

    DecimalMultiplicationPos = _FindTokenPosition(Text, ["decimal multiplication", "decimal x"])
    DecimalDivisionPos = _FindTokenPosition(Text, ["decimal division", "decimal divide"])

    WholeMultiplicationPos = _FindTokenPosition(
        Text,
        [
            "1d x",
            "2d x",
            "3d x",
            "4d x",
            "5d x",
            "6d x",
            "multiplication by",
            "mixed pattern multiplication",
        ],
    )
    WholeDivisionPos = _FindTokenPosition(
        Text,
        [
            "1d division",
            "2d division",
            "3d division",
            "4d division",
            "5d division",
            "6d division",
            "division by",
        ],
    )

    if DecimalMultiplicationPos is not None:
        Operations.append((DecimalMultiplicationPos, "DECIMAL_MULTIPLICATION"))
    if DecimalDivisionPos is not None:
        Operations.append((DecimalDivisionPos, "DECIMAL_DIVISION"))
    if WholeMultiplicationPos is not None:
        Operations.append((WholeMultiplicationPos, "WHOLE_NUMBER_MULTIPLICATION"))
    if WholeDivisionPos is not None:
        Operations.append((WholeDivisionPos, "WHOLE_NUMBER_DIVISION"))

    if not Operations:
        if "decimal" in Text:
            return ["DECIMAL_MULTIPLICATION", "DECIMAL_DIVISION"]
        # Generic mixed multiplication/division sheets should test both the
        # whole-number mechanisms and the decimal mechanisms in their respective
        # parent sections. The section-level mixedOperationGroup override above
        # keeps visible output grouped as Multiplication and Division.
        return [
            "WHOLE_NUMBER_MULTIPLICATION",
            "DECIMAL_MULTIPLICATION",
            "WHOLE_NUMBER_DIVISION",
            "DECIMAL_DIVISION",
        ]

    Ordered = [Operation for _, Operation in sorted(Operations, key=lambda Item: Item[0])]
    Deduped: list[str] = []
    for Operation in Ordered:
        if Operation not in Deduped:
            Deduped.append(Operation)
    return Deduped



def _SignedTermText(Value: int, ParenthesisePositive: bool = False) -> str:
    if Value < 0:
        return f"({Value})"
    return f"({Value})" if ParenthesisePositive else str(Value)


def GenerateSolveEquation(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    """Generate workbook-style signed integer expressions for Solve the Equation.

    The MM workbook examples for this section are arithmetic expressions with
    positive and negative integers, such as:
    5 + (-8), (-7) + (-6), 9 - (-3), (15) + (25).
    Therefore this generator must not create generic algebra equations like
    x + 3 = 7.
    """
    Stage = DifficultyStage(QuestionNumber - 1)
    MaxAbs = {
        "WARM_UP": 12,
        "STANDARD": 25,
        "MIXED_STEP": 50,
        "ADVANCED": 100,
        "CHALLENGE": 250,
    }.get(Stage, 25) * _LessonBand(Config)

    Pattern = (QuestionNumber - 1) % 5

    if Pattern == 0:
        Left = Rng.randint(3, MaxAbs)
        Right = -Rng.randint(2, MaxAbs)
        QuestionText = f"{_SignedTermText(Left)} + {_SignedTermText(Right)}"
        CorrectAnswer = Decimal(Left + Right)
    elif Pattern == 1:
        Left = -Rng.randint(2, MaxAbs)
        Right = -Rng.randint(2, MaxAbs)
        QuestionText = f"{_SignedTermText(Left)} + {_SignedTermText(Right)}"
        CorrectAnswer = Decimal(Left + Right)
    elif Pattern == 2:
        Left = -Rng.randint(5, MaxAbs)
        Right = -Rng.randint(5, MaxAbs)
        QuestionText = f"{_SignedTermText(Left)} + {_SignedTermText(Right)}"
        CorrectAnswer = Decimal(Left + Right)
    elif Pattern == 3:
        Left = Rng.randint(5, MaxAbs)
        Right = -Rng.randint(2, MaxAbs)
        QuestionText = f"{_SignedTermText(Left)} - {_SignedTermText(Right)}"
        CorrectAnswer = Decimal(Left - Right)
    else:
        Left = Rng.randint(5, MaxAbs)
        Right = Rng.randint(5, MaxAbs)
        QuestionText = f"{_SignedTermText(Left, True)} + {_SignedTermText(Right, True)}"
        CorrectAnswer = Decimal(Left + Right)

    return [QuestionText], [""], CorrectAnswer, {
        "question_text": QuestionText,
        "solve_equation_mode": "WORKBOOK_SIGNED_INTEGER_EXPRESSION",
        "workbook_display": "SIGNED_INTEGER_EXPRESSION",
        "allow_negative_answer": True,
    }


def GenerateMmQuestion(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    ConceptFamily = Config.ConceptFamily
    if ConceptFamily == "ADD_LESS":
        return GenerateAddLess(Config, Rng, QuestionNumber)
    if ConceptFamily == "DECIMAL_ADD_LESS":
        return GenerateDecimalAddLess(Config, Rng, QuestionNumber)
    if ConceptFamily == "DECIMAL_MULTIPLICATION":
        return GenerateDecimalMultiplication(Config, Rng, QuestionNumber)
    if ConceptFamily == "DECIMAL_DIVISION":
        return GenerateDecimalDivision(Config, Rng, QuestionNumber)
    if ConceptFamily == "WHOLE_NUMBER_MULTIPLICATION":
        return GenerateWholeNumberMultiplication(Config, Rng, QuestionNumber)
    if ConceptFamily == "WHOLE_NUMBER_DIVISION":
        return GenerateWholeNumberDivision(Config, Rng, QuestionNumber)
    if ConceptFamily == "INTEGERS":
        return GenerateIntegers(Config, Rng, QuestionNumber)
    if ConceptFamily == "BODMAS":
        return GenerateBodmas(Config, Rng, QuestionNumber)
    if ConceptFamily == "PERCENTAGE_ADD_LESS":
        return GeneratePercentageAddLess(Config, Rng, QuestionNumber)
    if ConceptFamily == "PERCENTAGE_VALUE":
        return GeneratePercentageValue(Config, Rng, QuestionNumber)
    if ConceptFamily == "PERCENTAGE_INCREASE_DECREASE":
        return GeneratePercentageIncreaseDecrease(Config, Rng, QuestionNumber)
    if ConceptFamily == "SQUARES":
        return GenerateSquares(Config, Rng, QuestionNumber)
    if ConceptFamily == "CUBES":
        return GenerateCubes(Config, Rng, QuestionNumber)
    if ConceptFamily == "SQUARE_ROOT":
        return GenerateSquareRoot(Config, Rng, QuestionNumber)
    if ConceptFamily == "CUBE_ROOT":
        return GenerateCubeRoot(Config, Rng, QuestionNumber)
    if ConceptFamily == "MIXED_SQUARE_CUBE":
        return GenerateMixedSquareCube(Config, Rng, QuestionNumber)
    if ConceptFamily == "MIXED_ROOTS":
        return GenerateMixedRoots(Config, Rng, QuestionNumber)
    if ConceptFamily == "SIMPLE_INTEREST":
        return GenerateSimpleInterest(Config, Rng, QuestionNumber)
    if ConceptFamily == "PROFIT_LOSS":
        return GenerateProfitLoss(Config, Rng, QuestionNumber)
    if ConceptFamily == "FIND_SELLING_PRICE":
        return GenerateFindSellingPrice(Config, Rng, QuestionNumber)
    if ConceptFamily == "FIND_COST_PRICE":
        return GenerateFindCostPrice(Config, Rng, QuestionNumber)
    if ConceptFamily == "SKILL_STACKER":
        return GenerateSkillStacker(Config, Rng, QuestionNumber)
    if ConceptFamily == "CONCEPT_DRILL":
        return GenerateConceptDrill(Config, Rng, QuestionNumber)
    if ConceptFamily == "ANSWER_POSITION":
        return GenerateAnswerPosition(Config, Rng, QuestionNumber)
    if ConceptFamily == "SOLVE_EQUATION":
        return GenerateSolveEquation(Config, Rng, QuestionNumber)
    if ConceptFamily == "MULTIPLICATION_DIVISION_MIXED":
        OperationSequence = _MixedMultiplicationDivisionOperationSequence(Config)
        Operation = OperationSequence[(QuestionNumber - 1) % len(OperationSequence)]
        if Operation in {"DECIMAL_MULTIPLICATION", "MUL_DECIMAL"}:
            Operands, Operators, CorrectAnswer, Metadata = GenerateDecimalMultiplication(Config, Rng, QuestionNumber)
            Metadata["mixed_pattern_variant"] = "DECIMAL_MULTIPLICATION"
            Metadata["mixed_pattern_family"] = "DECIMAL_MULTIPLICATION"
            return Operands, Operators, CorrectAnswer, Metadata
        if Operation in {"DECIMAL_DIVISION", "DIV_DECIMAL"}:
            Operands, Operators, CorrectAnswer, Metadata = GenerateDecimalDivision(Config, Rng, QuestionNumber)
            Metadata["mixed_pattern_variant"] = "DECIMAL_DIVISION"
            Metadata["mixed_pattern_family"] = "DECIMAL_DIVISION"
            return Operands, Operators, CorrectAnswer, Metadata

        MultiplicationPatternDigits = {
            "WHOLE_NUMBER_MULTIPLICATION": (2, 2),
            "MUL_3D_1D": (3, 1),
            "MUL_4D_1D": (4, 1),
            "MUL_2D_2D": (2, 2),
            "MUL_3D_2D": (3, 2),
            "MUL_4D_2D": (4, 2),
            "MUL_3D_3D": (3, 3),
        }
        DivisionPatternDigits = {
            "WHOLE_NUMBER_DIVISION": (3, 1),
            "DIV_2D_1D": (2, 1),
            "DIV_3D_1D": (3, 1),
            "DIV_4D_1D": (4, 1),
            "DIV_3D_2D": (3, 2),
            "DIV_4D_2D": (4, 2),
            "DIV_5D_2D": (5, 2),
            "DIV_6D_2D": (6, 2),
            "DIV_4D_3D": (4, 3),
            "DIV_5D_3D": (5, 3),
            "DIV_6D_3D": (6, 3),
        }
        if Operation in MultiplicationPatternDigits:
            LeftDigits, RightDigits = MultiplicationPatternDigits[Operation]
            return _GenerateWholeNumberMultiplicationByDigits(Rng, LeftDigits, RightDigits, Operation)
        DividendDigits, DivisorDigits = DivisionPatternDigits.get(Operation, (3, 1))
        return _GenerateWholeNumberDivisionByDigits(Rng, DividendDigits, DivisorDigits, Operation)
    raise ValueError(f"Unsupported Master Module concept: {ConceptFamily}")


# Backward-compatible name used by existing generator.py import in Package 1.
def GeneratePackage1Question(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    return GenerateMmQuestion(Config, Rng, QuestionNumber)


def _CompactDisplay(Value: int | Decimal) -> str:
    return str(Value)


def _SquareBaseRange(Config: MMConfig, Stage: str) -> tuple[int, int]:
    Band = _LessonBand(Config)
    if Band <= 2:
        Ranges = {
            "WARM_UP": (11, 30),
            "STANDARD": (21, 50),
            "MIXED_STEP": (31, 75),
            "ADVANCED": (50, 95),
            "CHALLENGE": (70, 125),
        }
    elif Band <= 4:
        Ranges = {
            "WARM_UP": (35, 90),
            "STANDARD": (50, 125),
            "MIXED_STEP": (75, 175),
            "ADVANCED": (100, 250),
            "CHALLENGE": (150, 350),
        }
    else:
        Ranges = {
            "WARM_UP": (75, 175),
            "STANDARD": (100, 250),
            "MIXED_STEP": (150, 400),
            "ADVANCED": (250, 650),
            "CHALLENGE": (400, 900),
        }
    return Ranges.get(Stage, (11, 99))


def _CubeBaseRange(Config: MMConfig, Stage: str) -> tuple[int, int]:
    Band = _LessonBand(Config)
    if Band <= 3:
        Ranges = {
            "WARM_UP": (5, 12),
            "STANDARD": (8, 18),
            "MIXED_STEP": (12, 25),
            "ADVANCED": (18, 35),
            "CHALLENGE": (25, 50),
        }
    elif Band <= 4:
        Ranges = {
            "WARM_UP": (12, 25),
            "STANDARD": (18, 40),
            "MIXED_STEP": (25, 55),
            "ADVANCED": (40, 75),
            "CHALLENGE": (60, 95),
        }
    else:
        Ranges = {
            "WARM_UP": (20, 45),
            "STANDARD": (35, 65),
            "MIXED_STEP": (50, 85),
            "ADVANCED": (65, 120),
            "CHALLENGE": (90, 160),
        }
    return Ranges.get(Stage, (5, 20))


def _SquareRootTitleText(Config: MMConfig) -> str:
    return " ".join(
        f" {Config.DpsTitle or ''} {Config.LessonTitle or ''} "
        .lower()
        .replace("-", " ")
        .replace("_", " ")
        .replace("&", " and ")
        .split()
    )


def _SquareRootRadicandDigitTargets(Config: MMConfig) -> list[int] | None:
    """Return exact workbook radicand digit targets from the active title.

    Square-root sheets are digit-range concepts. A title such as
    "Square Root - 5 Digit Number" must generate 5-digit radicands only;
    "Square Root 3 & 4 Digit Number" must generate only 3- and 4-digit
    radicands. This intentionally keys off the active title so later generic
    root range changes cannot leak into explicit workbook sheets.
    """
    Text = _SquareRootTitleText(Config)
    if "square root" not in Text:
        return None

    RangeMatch = re.search(r"\b([3-6])\s*(?:and|to|/)\s*([3-6])\s*digit", Text)
    if RangeMatch:
        Start = int(RangeMatch.group(1))
        End = int(RangeMatch.group(2))
        Lower, Upper = sorted((Start, End))
        return list(range(Lower, Upper + 1))

    DigitMatches = []
    for Match in re.finditer(r"\b([3-6])\s*digit", Text):
        DigitValue = int(Match.group(1))
        if DigitValue not in DigitMatches:
            DigitMatches.append(DigitValue)
    if len(DigitMatches) >= 2:
        return DigitMatches

    SingleMatch = re.search(r"\b([3-6])\s*digit", Text)
    if SingleMatch:
        return [int(SingleMatch.group(1))]

    return None


def _RootRangeForRadicandDigits(DigitCount: int) -> tuple[int, int]:
    LowerRadicand = 10 ** (DigitCount - 1)
    UpperRadicand = (10 ** DigitCount) - 1
    MinimumRoot = 1
    while MinimumRoot * MinimumRoot < LowerRadicand:
        MinimumRoot += 1
    MaximumRoot = int(UpperRadicand ** 0.5)
    return MinimumRoot, MaximumRoot


def _CubeRootRadicandDigitTargets(Config: MMConfig) -> list[int] | None:
    """Return exact workbook cube-root radicand digit targets from the active title.

    Dedicated cube-root sheets must generate exactly the digit range stated in
    the section/DPS title. Mixed cube-root sheets intentionally return None so
    they keep their mixed progression.
    """
    Text = _SquareRootTitleText(Config)
    if "cube root" not in Text:
        return None
    if "mixed" in Text:
        return None

    RangeMatch = re.search(r"\b([3-6])\s*(?:and|to|/)\s*([3-6])\s*digit", Text)
    if RangeMatch:
        Start = int(RangeMatch.group(1))
        End = int(RangeMatch.group(2))
        Lower, Upper = sorted((Start, End))
        return list(range(Lower, Upper + 1))

    DigitMatches = []
    for Match in re.finditer(r"\b([3-6])\s*digit", Text):
        DigitValue = int(Match.group(1))
        if DigitValue not in DigitMatches:
            DigitMatches.append(DigitValue)
    if DigitMatches:
        return DigitMatches

    return None


def _CubeRootRangeForRadicandDigits(DigitCount: int) -> tuple[int, int]:
    LowerRadicand = 10 ** (DigitCount - 1)
    UpperRadicand = (10 ** DigitCount) - 1
    MinimumRoot = 1
    while MinimumRoot ** 3 < LowerRadicand:
        MinimumRoot += 1
    MaximumRoot = MinimumRoot
    while (MaximumRoot + 1) ** 3 <= UpperRadicand:
        MaximumRoot += 1
    return MinimumRoot, MaximumRoot


def _SquareRootBaseRange(Config: MMConfig, Stage: str) -> tuple[int, int]:
    ExplicitTargets = _SquareRootRadicandDigitTargets(Config)
    if ExplicitTargets:
        # Generate within the full explicit radicand target band. Question-level
        # selection happens in GenerateSquareRoot so mixed 3/4-digit sheets can
        # alternate cleanly without crossing into unintended digit ranges.
        MinimumsAndMaximums = [_RootRangeForRadicandDigits(Target) for Target in ExplicitTargets]
        return min(Minimum for Minimum, _ in MinimumsAndMaximums), max(Maximum for _, Maximum in MinimumsAndMaximums)

    Band = _LessonBand(Config)
    if Band <= 4:
        Ranges = {
            "WARM_UP": (20, 50),
            "STANDARD": (35, 75),
            "MIXED_STEP": (50, 99),
            "ADVANCED": (75, 150),
            "CHALLENGE": (100, 220),
        }
    elif Band == 5:
        Ranges = {
            "WARM_UP": (40, 90),
            "STANDARD": (60, 140),
            "MIXED_STEP": (90, 220),
            "ADVANCED": (150, 320),
            "CHALLENGE": (220, 450),
        }
    else:
        Ranges = {
            "WARM_UP": (70, 160),
            "STANDARD": (120, 260),
            "MIXED_STEP": (180, 420),
            "ADVANCED": (300, 650),
            "CHALLENGE": (500, 900),
        }
    return Ranges.get(Stage, (20, 99))


def _CubeRootBaseRange(Config: MMConfig, Stage: str) -> tuple[int, int]:
    ExplicitTargets = _CubeRootRadicandDigitTargets(Config)
    if ExplicitTargets:
        SafeTargets = [Target for Target in ExplicitTargets if Target <= 6]
        if not SafeTargets:
            SafeTargets = [6]
        MinimumsAndMaximums = [_CubeRootRangeForRadicandDigits(Target) for Target in SafeTargets]
        return min(Minimum for Minimum, _ in MinimumsAndMaximums), min(99, max(Maximum for _, Maximum in MinimumsAndMaximums))

    Band = _LessonBand(Config)
    if Band <= 3:
        Ranges = {
            "WARM_UP": (10, 16),
            "STANDARD": (12, 20),
            "MIXED_STEP": (15, 25),
            "ADVANCED": (20, 35),
            "CHALLENGE": (30, 45),
        }
    elif Band <= 4:
        Ranges = {
            "WARM_UP": (12, 22),
            "STANDARD": (18, 32),
            "MIXED_STEP": (25, 45),
            "ADVANCED": (35, 65),
            "CHALLENGE": (50, 90),
        }
    else:
        Ranges = {
            "WARM_UP": (20, 45),
            "STANDARD": (35, 70),
            "MIXED_STEP": (50, 100),
            "ADVANCED": (80, 140),
            "CHALLENGE": (120, 180),
        }
    Minimum, Maximum = Ranges.get(Stage, (10, 25))
    Maximum = min(Maximum, 99)
    if Minimum > Maximum:
        Minimum = max(10, Maximum - 25)
    return Minimum, Maximum


def GenerateSquares(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    Minimum, Maximum = _SquareBaseRange(Config, Stage)
    Base = Rng.randint(Minimum, Maximum)
    CorrectAnswer = Decimal(Base * Base)
    QuestionText = f"({Base})²"
    return [QuestionText], [""], CorrectAnswer, {
        "package_3_concept": "SQUARES",
        "compact_expression": True,
        "question_text": QuestionText,
        "base_value": Base,
        "lesson_band": _LessonBand(Config),
    }


def GenerateCubes(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    Minimum, Maximum = _CubeBaseRange(Config, Stage)
    Base = Rng.randint(Minimum, Maximum)
    CorrectAnswer = Decimal(Base ** 3)
    QuestionText = f"({Base})³"
    return [QuestionText], [""], CorrectAnswer, {
        "package_3_concept": "CUBES",
        "compact_expression": True,
        "question_text": QuestionText,
        "base_value": Base,
        "lesson_band": _LessonBand(Config),
    }


def GenerateSquareRoot(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    ExplicitTargets = _SquareRootRadicandDigitTargets(Config)
    TargetDigits = None
    if ExplicitTargets:
        TargetDigits = ExplicitTargets[(QuestionNumber - 1) % len(ExplicitTargets)]
        Minimum, Maximum = _RootRangeForRadicandDigits(TargetDigits)
    else:
        Minimum, Maximum = _SquareRootBaseRange(Config, Stage)

    Root = Rng.randint(Minimum, Maximum)
    Radicand = Root * Root
    if TargetDigits is not None:
        # Defensive guard: keep trying within the explicit digit band so the
        # visible radicand always follows the sheet title exactly.
        for _ in range(25):
            if len(str(Radicand)) == TargetDigits:
                break
            Root = Rng.randint(Minimum, Maximum)
            Radicand = Root * Root

    CorrectAnswer = Decimal(Root)
    QuestionText = f"√{Radicand}"
    return [QuestionText], [""], CorrectAnswer, {
        "package_3_concept": "SQUARE_ROOT",
        "compact_expression": True,
        "question_text": QuestionText,
        "root_value": Root,
        "radicand": Radicand,
        "perfect_root_only": True,
        "lesson_band": _LessonBand(Config),
        "radicand_digit_target": TargetDigits,
        "radicand_digit_count": len(str(Radicand)),
    }


def GenerateCubeRoot(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    ExplicitTargets = _CubeRootRadicandDigitTargets(Config)
    TargetDigits = None
    if ExplicitTargets:
        TargetDigits = min(6, ExplicitTargets[(QuestionNumber - 1) % len(ExplicitTargets)])
        Minimum, Maximum = _CubeRootRangeForRadicandDigits(TargetDigits)
        Maximum = min(Maximum, 99)
    else:
        Minimum, Maximum = _CubeRootBaseRange(Config, Stage)

    Root = Rng.randint(Minimum, Maximum)
    Radicand = Root ** 3
    if TargetDigits is not None:
        for _ in range(25):
            if len(str(Radicand)) == TargetDigits:
                break
            Root = Rng.randint(Minimum, Maximum)
            Radicand = Root ** 3

    CorrectAnswer = Decimal(Root)
    QuestionText = f"∛{Radicand}"
    return [QuestionText], [""], CorrectAnswer, {
        "package_3_concept": "CUBE_ROOT",
        "compact_expression": True,
        "question_text": QuestionText,
        "root_value": Root,
        "radicand": Radicand,
        "perfect_root_only": True,
        "lesson_band": _LessonBand(Config),
        "radicand_digit_target": TargetDigits,
        "radicand_digit_count": len(str(Radicand)),
    }


def GenerateMixedSquareCube(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    return GenerateSquares(Config, Rng, QuestionNumber) if QuestionNumber % 2 else GenerateCubes(Config, Rng, QuestionNumber)


def GenerateMixedRoots(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    TitleText = f" {Config.DpsTitle} ".lower()
    if "square root" in TitleText and "cube root" not in TitleText:
        return GenerateSquareRoot(Config, Rng, QuestionNumber)
    if "cube root" in TitleText and "square root" not in TitleText and "squares" not in TitleText and "cubes" not in TitleText:
        return GenerateCubeRoot(Config, Rng, QuestionNumber)
    if QuestionNumber % 3 == 1:
        return GenerateCubeRoot(Config, Rng, QuestionNumber)
    if QuestionNumber % 3 == 2:
        return GenerateSquares(Config, Rng, QuestionNumber)
    return GenerateCubes(Config, Rng, QuestionNumber)
