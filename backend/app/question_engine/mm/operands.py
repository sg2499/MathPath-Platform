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


def _IsDecimalConcept(Config: MMConfig) -> bool:
    Text = f" {Config.DpsTitle} {Config.LessonTitle} ".lower()
    return "decimal" in Text


def _AddLessDecimalPlaces(Config: MMConfig, Stage: str) -> int:
    if not _IsDecimalConcept(Config):
        return 0
    Band = _LessonBand(Config)
    if Band <= 2:
        return 1 if Stage == "WARM_UP" else 2
    return 2


def _AddLessRowCount(Config: MMConfig, Stage: str) -> int:
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


def GenerateAddLess(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    Places = _AddLessDecimalPlaces(Config, Stage)
    Minimum, Maximum = _ScaleRangeByLesson(*_NumberRange(Stage), Config)
    RowCount = _AddLessRowCount(Config, Stage)

    Values: list[Decimal] = [_RandDecimal(Rng, Minimum, Maximum, Places)]
    Operators = [""]
    RunningTotal = Values[0]

    for RowIndex in range(1, RowCount):
        Sign = Rng.choice(["+", "-"])
        Value = _RandDecimal(Rng, max(1, Minimum // 4), max(2, Maximum // 3), Places)

        # Workbook-style Add/Less sheets should remain solvable and non-negative unless
        # the sheet explicitly belongs to an integer/negative-answer concept.
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
    }


def GenerateDecimalAddLess(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    return GenerateAddLess(Config, Rng, QuestionNumber)


def GenerateDecimalMultiplication(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    Places = 1 if Stage in {"WARM_UP", "STANDARD", "MIXED_STEP"} else 2
    Minimum, Maximum = _ScaleRangeByLesson(*_NumberRange(Stage), Config)
    Left = _RandDecimal(Rng, max(2, Minimum // 5), max(8, Maximum // 20), Places)
    Right = Decimal(Rng.randint(2, 9 if Stage in {"WARM_UP", "STANDARD"} else 99))
    if Stage in {"ADVANCED", "CHALLENGE"} and Rng.random() < 0.55:
        Right = _RandDecimal(Rng, 2, 25, 1)
    CorrectAnswer = _Quantize(Left * Right, Places + (1 if Right != Right.to_integral_value() else 0))
    return [_AsDisplayNumber(Left), _AsDisplayNumber(Right)], ["", "×"], CorrectAnswer, {"decimal_places": Places}


def GenerateDecimalDivision(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    Places = 1 if Stage in {"WARM_UP", "STANDARD"} else 2
    Divisor = Decimal(Rng.randint(2, 9 if Stage in {"WARM_UP", "STANDARD"} else 25))
    QuotientLimit = (40 if Stage in {"WARM_UP", "STANDARD"} else 250) * _LessonBand(Config)
    Quotient = _RandDecimal(Rng, 2, QuotientLimit, Places)
    Dividend = _Quantize(Quotient * Divisor, Places)
    return [_AsDisplayNumber(Dividend), _AsDisplayNumber(Divisor)], ["", "÷"], Quotient, {"decimal_places": Places}


def GenerateWholeNumberMultiplication(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    LeftDigits, RightDigits = _MultiplicationDigits(Config, Stage)
    LeftMin, LeftMax = _DigitRange(LeftDigits)
    RightMin, RightMax = _DigitRange(RightDigits)
    Left = Rng.randint(LeftMin, LeftMax)
    Right = Rng.randint(RightMin, RightMax)
    CorrectAnswer = Decimal(Left * Right)
    return [Left, Right], ["", "×"], CorrectAnswer, {"left_digits": LeftDigits, "right_digits": RightDigits}


def GenerateWholeNumberDivision(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    DividendDigits, DivisorDigits = _DivisionDigits(Config, Stage)
    DivisorMin, DivisorMax = _DigitRange(DivisorDigits)
    DividendMin, DividendMax = _DigitRange(DividendDigits)
    Divisor = Rng.randint(DivisorMin, DivisorMax)
    MinQuotient = max(1, (DividendMin + Divisor - 1) // Divisor)
    MaxQuotient = max(MinQuotient, DividendMax // Divisor)
    Quotient = Rng.randint(MinQuotient, MaxQuotient)
    Dividend = Divisor * Quotient
    CorrectAnswer = Decimal(Quotient)
    return [Dividend, Divisor], ["", "÷"], CorrectAnswer, {"dividend_digits": DividendDigits, "divisor_digits": DivisorDigits}


def GenerateIntegers(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    MaxAbs = {"WARM_UP": 20, "STANDARD": 50, "MIXED_STEP": 100, "ADVANCED": 250, "CHALLENGE": 500}.get(Stage, 50) * _LessonBand(Config)
    RowCount = 3 if Stage in {"WARM_UP", "STANDARD"} else 4
    Values = [Rng.randint(-MaxAbs, MaxAbs) or Rng.choice([-1, 1])]
    Operators = [""]
    RunningTotal = Decimal(Values[0])
    for _ in range(1, RowCount):
        Operator = Rng.choice(["+", "-"])
        Value = Rng.randint(-MaxAbs, MaxAbs) or Rng.choice([-1, 1])
        Values.append(Value)
        Operators.append(Operator)
        RunningTotal = RunningTotal + Decimal(Value) if Operator == "+" else RunningTotal - Decimal(Value)
    return Values, Operators, RunningTotal, {"row_count": RowCount, "integer_range": MaxAbs, "allow_negative_answer": True}


def GenerateBodmas(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    MaxValue = {"WARM_UP": 9, "STANDARD": 15, "MIXED_STEP": 25, "ADVANCED": 50, "CHALLENGE": 99}.get(Stage, 15) * _LessonBand(Config)
    A = Rng.randint(2, MaxValue)
    B = Rng.randint(2, 9 if Stage in {"WARM_UP", "STANDARD"} else 15)
    C = Rng.randint(2, 9 if Stage in {"WARM_UP", "STANDARD"} else 20)
    Pattern = ["ADD_MUL_SUB", "SUB_ADD_MUL", "MUL_ADD_DIV"][(QuestionNumber - 1) % 3]

    if Pattern == "ADD_MUL_SUB":
        Product = B * C
        D = Rng.randint(1, max(1, A + Product - 1))
        CorrectAnswer = Decimal(A + Product - D)
        return [A, B, C, D], ["", "+", "×", "-"], CorrectAnswer, {"bodmas_pattern": Pattern}

    if Pattern == "SUB_ADD_MUL":
        D = Rng.randint(2, max(3, MaxValue // 2))
        Product = C * D
        if A - B + Product < 0:
            A = B + Rng.randint(1, MaxValue)
        CorrectAnswer = Decimal(A - B + Product)
        return [A, B, C, D], ["", "-", "+", "×"], CorrectAnswer, {"bodmas_pattern": Pattern}

    Divisor = Rng.randint(2, 9)
    Quotient = Rng.randint(2, max(4, MaxValue // 3))
    Dividend = Divisor * Quotient
    CorrectAnswer = Decimal((A * B) + Quotient)
    return [A, B, Dividend, Divisor], ["", "×", "+", "÷"], CorrectAnswer, {"bodmas_pattern": Pattern}


def GeneratePercentageAddLess(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    Band = _LessonBand(Config)
    BaseRanges = {
        1: (100, 500),
        2: (200, 1000),
        3: (500, 2500),
        4: (1000, 6000),
        5: (2500, 12000),
        6: (5000, 25000),
    }
    BaseMin, BaseMax = BaseRanges.get(Band, (100, 500))

    if Stage in {"WARM_UP", "STANDARD"}:
        PercentChoices = [5, 10, 15, 20, 25, 30, 40, 50]
    elif Stage == "MIXED_STEP":
        PercentChoices = [5, 8, 10, 12, 15, 18, 20, 22, 25, 30, 35, 45]
    elif Stage == "ADVANCED":
        PercentChoices = [2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 25, 30, 35, 45]
    else:
        PercentChoices = [0.5, 1, 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 25, 30, 40, 50]

    Base = Decimal(Rng.randrange(BaseMin, BaseMax + 1, 10))
    if Band >= 4 and Rng.random() < 0.35:
        Base = _RandDecimal(Rng, BaseMin, BaseMax, 2)

    Percent = Decimal(str(Rng.choice(PercentChoices)))
    Text = f" {Config.DpsTitle} ".lower()
    if "less" in Text and "add" not in Text:
        Operator = "-%"
    elif "add" in Text and "less" not in Text:
        Operator = "+%"
    else:
        Operator = Rng.choice(["+%", "-%"])

    PercentValue = Base * Percent / Decimal(100)
    CorrectAnswer = Base + PercentValue if Operator == "+%" else Base - PercentValue
    CorrectAnswer = _Quantize(CorrectAnswer, 2)

    return [_AsDisplayNumber(Base), _AsDisplayNumber(Percent)], ["", Operator], CorrectAnswer, {
        "percentage_mode": "ADD_LESS",
        "base_amount": _AsDisplayNumber(Base),
        "percentage_operator": Operator,
        "two_part_only": True,
        "lesson_band": Band,
    }


def GeneratePercentageValue(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    BaseMin, BaseMax = {"WARM_UP": (100, 500), "STANDARD": (200, 1000), "MIXED_STEP": (500, 2500), "ADVANCED": (1000, 5000), "CHALLENGE": (2500, 12000)}.get(Stage, (100, 500))
    Base = Decimal(Rng.randrange(BaseMin, BaseMax + 1, 10))
    Percent = Decimal(Rng.choice([5, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75]))
    CorrectAnswer = _Quantize(Base * Percent / Decimal(100), 2)
    return [_AsDisplayNumber(Percent), _AsDisplayNumber(Base)], ["", "% of"], CorrectAnswer, {"percentage_mode": "VALUE"}


def GeneratePercentageIncreaseDecrease(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    return GeneratePercentageAddLess(Config, Rng, QuestionNumber)


def _FindTokenPosition(Text: str, Tokens: list[str]) -> int | None:
    Positions = [Text.find(Token) for Token in Tokens if Text.find(Token) >= 0]
    return min(Positions) if Positions else None


def _MixedMultiplicationDivisionOperationSequence(Config: MMConfig) -> list[str]:
    """Return the exact operation families for mixed multiplication/division sheets.

    Critical convention:
    - Normal digit-pattern concepts such as 2D × 2D, 3D × 4D, 4D ÷ 3D
      must always use whole-number operands.
    - Decimal operands are allowed only when the concept text explicitly says
      Decimal Multiplication or Decimal Division.
    """
    Text = " ".join(f" {Config.DpsTitle} ".lower().replace("×", " x ").replace("÷", " division ").split())
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
        return ["WHOLE_NUMBER_MULTIPLICATION", "WHOLE_NUMBER_DIVISION"]

    Ordered = [Operation for _, Operation in sorted(Operations, key=lambda Item: Item[0])]
    Deduped: list[str] = []
    for Operation in Ordered:
        if Operation not in Deduped:
            Deduped.append(Operation)
    return Deduped


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
    if ConceptFamily == "MULTIPLICATION_DIVISION_MIXED":
        OperationSequence = _MixedMultiplicationDivisionOperationSequence(Config)
        Operation = OperationSequence[(QuestionNumber - 1) % len(OperationSequence)]
        if Operation == "DECIMAL_MULTIPLICATION":
            return GenerateDecimalMultiplication(Config, Rng, QuestionNumber)
        if Operation == "DECIMAL_DIVISION":
            return GenerateDecimalDivision(Config, Rng, QuestionNumber)
        if Operation == "WHOLE_NUMBER_MULTIPLICATION":
            return GenerateWholeNumberMultiplication(Config, Rng, QuestionNumber)
        return GenerateWholeNumberDivision(Config, Rng, QuestionNumber)
    raise ValueError(f"Unsupported Master Module Package 3 concept: {ConceptFamily}")


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


def _SquareRootBaseRange(Config: MMConfig, Stage: str) -> tuple[int, int]:
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
    return Ranges.get(Stage, (10, 25))


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
    Minimum, Maximum = _SquareRootBaseRange(Config, Stage)
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
    }


def GenerateCubeRoot(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    Minimum, Maximum = _CubeRootBaseRange(Config, Stage)
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
