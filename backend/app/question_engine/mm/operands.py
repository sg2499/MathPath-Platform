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
    # Keep the displayed dividend inside the intended digit band where possible.
    DividendMin, DividendMax = _DigitRange(DividendDigits)
    Safety = 0
    while not (DividendMin <= Dividend <= DividendMax) and Safety < 50:
        Divisor = Rng.randint(DivisorMin, DivisorMax)
        Quotient = Rng.randint(QuotientMin, QuotientMax)
        Dividend = Divisor * Quotient
        Safety += 1
    CorrectAnswer = Decimal(Quotient)
    return [Dividend, Divisor], ["", "÷"], CorrectAnswer, {"dividend_digits": DividendDigits, "divisor_digits": DivisorDigits}


def GeneratePackage1Question(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float], list[str], Decimal, dict]:
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
    if ConceptFamily == "MULTIPLICATION_DIVISION_MIXED":
        TitleText = f" {Config.DpsTitle} {Config.LessonTitle} ".lower()
        UsesDecimalPattern = "decimal" in TitleText
        if QuestionNumber % 2 == 0:
            return GenerateDecimalDivision(Config, Rng, QuestionNumber) if UsesDecimalPattern else GenerateWholeNumberDivision(Config, Rng, QuestionNumber)
        return GenerateDecimalMultiplication(Config, Rng, QuestionNumber) if UsesDecimalPattern else GenerateWholeNumberMultiplication(Config, Rng, QuestionNumber)
    raise ValueError(f"Unsupported Master Module Package 1 concept: {ConceptFamily}")
