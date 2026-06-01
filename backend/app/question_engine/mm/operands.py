import random
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


def _MultiplicationDigits(Config: MMConfig, Stage: str) -> tuple[int, int]:
    Title = f" {Config.DpsTitle} ".upper()
    if "5D X 2D" in Title:
        return 5, 2
    if "4D X 3D" in Title:
        return 4, 3
    if "4D X 2D" in Title:
        return 4, 2
    if "3D X 3D" in Title:
        return 3, 3
    if "3D X 2D" in Title:
        return 3, 2
    if "2D X 2D" in Title:
        return 2, 2
    if "BY 3D" in Title:
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
    Title = f" {Config.DpsTitle} ".upper()
    if "6D ÷ 3D" in Title or "6D DIVISION 3D" in Title:
        return 6, 3
    if "6D" in Title and "DIVISION" in Title:
        return 6, 3
    if "5D ÷ 3D" in Title or "5D DIVISION 3D" in Title:
        return 5, 3
    if "5D ÷ 2D" in Title or "5D DIVISION 2D" in Title:
        return 5, 2
    if "4D ÷ 3D" in Title or "4D DIVISION 3D" in Title:
        return 4, 3
    if "4D ÷ 2D" in Title or "4D DIVISION 2D" in Title:
        return 4, 2
    if "BY 6D" in Title:
        return 6, 3
    if "BY 3D" in Title:
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


def GenerateDecimalAddLess(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    Places = _DecimalPlaces(Stage)
    Minimum, Maximum = _NumberRange(Stage)
    RowCount = 3 if Stage in {"WARM_UP", "STANDARD"} else 4
    Values: list[Decimal] = [_RandDecimal(Rng, Minimum, Maximum, Places)]
    Operators = [""]
    RunningTotal = Values[0]

    for RowIndex in range(1, RowCount):
        Sign = Rng.choice(["+", "-"])
        Value = _RandDecimal(Rng, max(1, Minimum // 4), max(2, Maximum // 3), Places)
        if Sign == "-" and RunningTotal - Value < 0:
            Sign = "+"
        Operators.append(Sign)
        Values.append(Value)
        RunningTotal = RunningTotal + Value if Sign == "+" else RunningTotal - Value

    CorrectAnswer = _Quantize(RunningTotal, Places)
    SignedOperands = [Values[0]] + [Values[Index] if Operators[Index] == "+" else -Values[Index] for Index in range(1, len(Values))]
    return [_AsDisplayNumber(Value) for Value in SignedOperands], Operators, CorrectAnswer, {"decimal_places": Places, "row_count": RowCount}


def GenerateDecimalMultiplication(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    Places = 1 if Stage in {"WARM_UP", "STANDARD", "MIXED_STEP"} else 2
    Minimum, Maximum = _NumberRange(Stage)
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
    Quotient = _RandDecimal(Rng, 2, 40 if Stage in {"WARM_UP", "STANDARD"} else 250, Places)
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
    QuotientDigits = max(1, DividendDigits - DivisorDigits)
    QuotientMin, QuotientMax = _DigitRange(QuotientDigits)
    Divisor = Rng.randint(DivisorMin, DivisorMax)
    Quotient = Rng.randint(QuotientMin, QuotientMax)
    Dividend = Divisor * Quotient
    DividendMin, DividendMax = _DigitRange(DividendDigits)
    Safety = 0
    while not (DividendMin <= Dividend <= DividendMax) and Safety < 50:
        Divisor = Rng.randint(DivisorMin, DivisorMax)
        Quotient = Rng.randint(QuotientMin, QuotientMax)
        Dividend = Divisor * Quotient
        Safety += 1
    CorrectAnswer = Decimal(Quotient)
    return [Dividend, Divisor], ["", "÷"], CorrectAnswer, {"dividend_digits": DividendDigits, "divisor_digits": DivisorDigits}


def GenerateIntegers(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    MaxAbs = {"WARM_UP": 20, "STANDARD": 50, "MIXED_STEP": 100, "ADVANCED": 250, "CHALLENGE": 500}.get(Stage, 50)
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
    MaxValue = {"WARM_UP": 9, "STANDARD": 15, "MIXED_STEP": 25, "ADVANCED": 50, "CHALLENGE": 99}.get(Stage, 15)
    A = Rng.randint(2, MaxValue)
    B = Rng.randint(2, 9 if Stage in {"WARM_UP", "STANDARD"} else 15)
    C = Rng.randint(2, 9 if Stage in {"WARM_UP", "STANDARD"} else 20)
    D = Rng.randint(1, MaxValue)
    Pattern = Rng.choice(["ADD_MUL_SUB", "SUB_ADD_MUL", "MUL_ADD_DIV"])
    if Pattern == "ADD_MUL_SUB":
        CorrectAnswer = Decimal(A + (B * C) - D)
        return [A, B, C, D], ["", "+", "×", "-"], CorrectAnswer, {"bodmas_pattern": Pattern}
    if Pattern == "SUB_ADD_MUL":
        CorrectAnswer = Decimal(A - B + (C * D))
        return [A, B, C, D], ["", "-", "+", "×"], CorrectAnswer, {"bodmas_pattern": Pattern}
    Divisor = Rng.randint(2, 9)
    Quotient = Rng.randint(2, max(4, MaxValue // 3))
    Dividend = Divisor * Quotient
    CorrectAnswer = Decimal((A * B) + (Dividend // Divisor))
    return [A, B, Dividend, Divisor], ["", "×", "+", "÷"], CorrectAnswer, {"bodmas_pattern": Pattern}


def GeneratePercentageAddLess(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    BaseMin, BaseMax = {"WARM_UP": (100, 500), "STANDARD": (200, 1000), "MIXED_STEP": (500, 2500), "ADVANCED": (1000, 5000), "CHALLENGE": (2500, 12000)}.get(Stage, (100, 500))
    Base = Decimal(Rng.randrange(BaseMin, BaseMax + 1, 10))
    PercentChoices = [5, 10, 15, 20, 25, 30, 40, 50]
    if Stage in {"ADVANCED", "CHALLENGE"}:
        PercentChoices.extend([12, 18, 22, 35, 45])
    FirstPercent = Decimal(Rng.choice(PercentChoices))
    SecondPercent = Decimal(Rng.choice(PercentChoices)) if Stage in {"MIXED_STEP", "ADVANCED", "CHALLENGE"} else Decimal(0)
    FirstOp = Rng.choice(["+%", "-%"])
    SecondOp = Rng.choice(["+%", "-%"]) if SecondPercent else ""
    Total = Base * (Decimal("1") + FirstPercent / Decimal(100) if FirstOp == "+%" else Decimal("1") - FirstPercent / Decimal(100))
    if SecondPercent:
        Total = Total * (Decimal("1") + SecondPercent / Decimal(100) if SecondOp == "+%" else Decimal("1") - SecondPercent / Decimal(100))
    CorrectAnswer = _Quantize(Total, 2)
    Operands = [Base, FirstPercent] + ([SecondPercent] if SecondPercent else [])
    Operators = ["", FirstOp] + ([SecondOp] if SecondPercent else [])
    return [_AsDisplayNumber(Value) for Value in Operands], Operators, CorrectAnswer, {"percentage_mode": "ADD_LESS", "base_amount": _AsDisplayNumber(Base)}


def GeneratePercentageValue(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    BaseMin, BaseMax = {"WARM_UP": (100, 500), "STANDARD": (200, 1000), "MIXED_STEP": (500, 2500), "ADVANCED": (1000, 5000), "CHALLENGE": (2500, 12000)}.get(Stage, (100, 500))
    Base = Decimal(Rng.randrange(BaseMin, BaseMax + 1, 10))
    Percent = Decimal(Rng.choice([5, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75]))
    CorrectAnswer = _Quantize(Base * Percent / Decimal(100), 2)
    return [_AsDisplayNumber(Percent), _AsDisplayNumber(Base)], ["", "% of"], CorrectAnswer, {"percentage_mode": "VALUE"}


def GeneratePercentageIncreaseDecrease(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    return GeneratePercentageAddLess(Config, Rng, QuestionNumber)


def GenerateMmQuestion(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    ConceptFamily = Config.ConceptFamily
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
    if ConceptFamily == "MULTIPLICATION_DIVISION_MIXED":
        TitleText = f" {Config.DpsTitle} {Config.LessonTitle} ".lower()
        UsesDecimalPattern = "decimal" in TitleText
        if QuestionNumber % 2 == 0:
            return GenerateDecimalDivision(Config, Rng, QuestionNumber) if UsesDecimalPattern else GenerateWholeNumberDivision(Config, Rng, QuestionNumber)
        return GenerateDecimalMultiplication(Config, Rng, QuestionNumber) if UsesDecimalPattern else GenerateWholeNumberMultiplication(Config, Rng, QuestionNumber)
    raise ValueError(f"Unsupported Master Module Package 2 concept: {ConceptFamily}")


# Backward-compatible name used by existing generator.py import in Package 1.
def GeneratePackage1Question(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
    return GenerateMmQuestion(Config, Rng, QuestionNumber)
