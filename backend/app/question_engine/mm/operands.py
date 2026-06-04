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

    # Platform correctness rule:
    # The value displayed in the vertical stack must be the value that is evaluated.
    # Therefore integer stacks use signed operands directly and neutral operators,
    # avoiding ambiguous cases like operator '-' applied to a negative operand.
    Values: list[int] = []
    for _ in range(RowCount):
        Value = Rng.randint(-MaxAbs, MaxAbs)
        if Value == 0:
            Value = Rng.choice([-1, 1])
        Values.append(Value)

    CorrectAnswer = sum(Decimal(Value) for Value in Values)
    Operators = [""] + ["+" for _ in Values[1:]]
    return Values, Operators, CorrectAnswer, {
        "row_count": RowCount,
        "integer_range": MaxAbs,
        "allow_negative_answer": True,
        "integer_evaluation_mode": "SIGNED_OPERAND_SUM",
    }

def GenerateSolveEquation(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    Band = _LessonBand(Config)
    MaxValue = {"WARM_UP": 15, "STANDARD": 30, "MIXED_STEP": 60, "ADVANCED": 120, "CHALLENGE": 250}.get(Stage, 30) * Band
    Pattern = ["ADD", "SUB", "MULTIPLY", "DIVIDE"][(QuestionNumber - 1) % 4]
    XValue = Decimal(Rng.randint(2, MaxValue))

    if Pattern == "ADD":
        Term = Decimal(Rng.randint(2, max(3, MaxValue // 2)))
        Right = XValue + Term
        QuestionText = f"x + {_AsDisplayNumber(Term)} = {_AsDisplayNumber(Right)}"
    elif Pattern == "SUB":
        Term = Decimal(Rng.randint(2, max(3, MaxValue // 2)))
        Right = XValue - Term
        QuestionText = f"x - {_AsDisplayNumber(Term)} = {_AsDisplayNumber(Right)}"
    elif Pattern == "MULTIPLY":
        Term = Decimal(Rng.randint(2, 12 if Stage in {"WARM_UP", "STANDARD"} else 25))
        Right = XValue * Term
        QuestionText = f"x × {_AsDisplayNumber(Term)} = {_AsDisplayNumber(Right)}"
    else:
        Term = Decimal(Rng.randint(2, 12 if Stage in {"WARM_UP", "STANDARD"} else 25))
        Right = XValue / Term
        # Keep division-equation RHS exact and student-friendly.
        Right = _Quantize(Right, 2) if Right != Right.to_integral_value() else Right
        XValue = Right * Term
        XValue = _Quantize(XValue, 2) if XValue != XValue.to_integral_value() else XValue
        QuestionText = f"x ÷ {_AsDisplayNumber(Term)} = {_AsDisplayNumber(Right)}"

    return [QuestionText], [""], XValue, {
        "question_text": QuestionText,
        "equation_pattern": Pattern,
        "answer_variable": "x",
        "answer_value": str(XValue),
    }

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
    # Percentage calculation format (for example, "25% of 800") is currently
    # disabled for MM because the workbook convention for active percentage
    # sheets is Add/Less Percentage only: base + percent% or base - percent%.
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
        4: (5000, 35000),
        5: (7500, 75000),
        6: (10000, 120000),
    }
    Minimum, Maximum = BaseRanges.get(Band, (1000, 6000))
    StageBoost = {"WARM_UP": 1, "STANDARD": 1, "MIXED_STEP": 2, "ADVANCED": 3, "CHALLENGE": 4}.get(Stage, 1)
    return Minimum, Maximum * StageBoost


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
    CostPrice = Decimal(Rng.randrange(Minimum, Maximum + 1, 25))
    Percent = Rng.choice(_FinancialPercentChoices(Config, Stage))
    Variant = _ProfitLossVariant(Config, QuestionNumber)
    IsLoss = Variant.startswith("LOSS")

    Change = _CleanMoney(CostPrice * Percent / Decimal(100))
    SellingPrice = _CleanMoney(CostPrice - Change) if IsLoss else _CleanMoney(CostPrice + Change)

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
    }


def GenerateFindSellingPrice(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    Minimum, Maximum = _MoneyRange(Config, Stage)
    CostPrice = Decimal(Rng.randrange(Minimum, Maximum + 1, 25))
    Percent = Rng.choice(_FinancialPercentChoices(Config, Stage))
    IsLoss = "loss" in f" {Config.DpsTitle} ".lower() or ("profit" not in f" {Config.DpsTitle} ".lower() and QuestionNumber % 2 == 0)
    SellingPrice = _CleanMoney(CostPrice - (CostPrice * Percent / Decimal(100))) if IsLoss else _CleanMoney(CostPrice + (CostPrice * Percent / Decimal(100)))
    PercentLabel = "Loss %" if IsLoss else "Profit %"
    return [_AsDisplayNumber(CostPrice), _AsDisplayNumber(Percent)], ["Cost Price", PercentLabel], SellingPrice, {
        "financial_mode": "FIND_SELLING_PRICE",
        "question_text": "Find Selling Price",
        "cost_price": _AsDisplayNumber(CostPrice),
        "percentage": _AsDisplayNumber(Percent),
        "percentage_type": PercentLabel,
    }


def GenerateFindCostPrice(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    Minimum, Maximum = _MoneyRange(Config, Stage)
    Percent = Rng.choice(_FinancialPercentChoices(Config, Stage))
    CostPrice = Decimal(Rng.randrange(Minimum, Maximum + 1, 25))
    IsLoss = "loss" in f" {Config.DpsTitle} ".lower() or ("profit" not in f" {Config.DpsTitle} ".lower() and QuestionNumber % 2 == 0)
    SellingPrice = _CleanMoney(CostPrice - (CostPrice * Percent / Decimal(100))) if IsLoss else _CleanMoney(CostPrice + (CostPrice * Percent / Decimal(100)))
    PercentLabel = "Loss %" if IsLoss else "Profit %"
    return [_AsDisplayNumber(SellingPrice), _AsDisplayNumber(Percent)], ["Selling Price", PercentLabel], _CleanMoney(CostPrice), {
        "financial_mode": "FIND_COST_PRICE",
        "question_text": "Find Cost Price",
        "selling_price": _AsDisplayNumber(SellingPrice),
        "percentage": _AsDisplayNumber(Percent),
        "percentage_type": PercentLabel,
    }




def _SkillStackerRanges(Config: MMConfig, Stage: str) -> tuple[tuple[int, int], tuple[int, int]]:
    Band = _LessonBand(Config)
    if Band <= 2:
        AddRanges = {
            "WARM_UP": (8, 25),
            "STANDARD": (12, 40),
            "MIXED_STEP": (18, 60),
            "ADVANCED": (25, 85),
            "CHALLENGE": (35, 120),
        }
        TimesRanges = {
            "WARM_UP": (5, 10),
            "STANDARD": (8, 12),
            "MIXED_STEP": (10, 15),
            "ADVANCED": (12, 18),
            "CHALLENGE": (15, 24),
        }
    elif Band <= 4:
        AddRanges = {
            "WARM_UP": (18, 60),
            "STANDARD": (25, 90),
            "MIXED_STEP": (40, 140),
            "ADVANCED": (75, 220),
            "CHALLENGE": (100, 350),
        }
        TimesRanges = {
            "WARM_UP": (8, 12),
            "STANDARD": (10, 16),
            "MIXED_STEP": (12, 20),
            "ADVANCED": (15, 25),
            "CHALLENGE": (20, 30),
        }
    else:
        AddRanges = {
            "WARM_UP": (35, 125),
            "STANDARD": (60, 220),
            "MIXED_STEP": (100, 400),
            "ADVANCED": (200, 750),
            "CHALLENGE": (350, 1250),
        }
        TimesRanges = {
            "WARM_UP": (10, 18),
            "STANDARD": (15, 24),
            "MIXED_STEP": (20, 30),
            "ADVANCED": (25, 40),
            "CHALLENGE": (30, 50),
        }
    return AddRanges.get(Stage, (10, 50)), TimesRanges.get(Stage, (5, 15))


def GenerateSkillStacker(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    (AddMin, AddMax), (TimesMin, TimesMax) = _SkillStackerRanges(Config, Stage)
    AddValue = Rng.randint(AddMin, AddMax)
    Times = Rng.randint(TimesMin, TimesMax)
    CorrectAnswer = Decimal(AddValue * Times)
    return [AddValue, Times], ["Add", "Times"], CorrectAnswer, {
        "question_text": "Skill Stacker",
        "skill_stacker_mode": "REPEATED_ADDITION",
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

def GenerateSimpleInterest(Config: MMConfig, Rng: random.Random, QuestionNumber: int) -> tuple[list[int | float | str], list[str], Decimal, dict]:
    Stage = DifficultyStage(QuestionNumber - 1)
    Band = _LessonBand(Config)
    PrincipalRanges = {
        1: (1000, 10000),
        2: (1000, 25000),
        3: (2500, 75000),
        4: (5000, 100000),
        5: (7500, 150000),
        6: (10000, 250000),
    }
    Minimum, Maximum = PrincipalRanges.get(Band, (1000, 25000))
    Principal = Decimal(Rng.randrange(Minimum, Maximum + 1, 25))
    TermChoices = [2, 3, 4, 5, 6] if Stage in {"WARM_UP", "STANDARD"} else [2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 16]
    RateChoices = [3, 4, 5, 6, 7, 8, 9] if Stage != "CHALLENGE" else [2.5, 3, 4, 5, 6, 7, 8, 9, 10, 12.5]
    Term = Decimal(str(Rng.choice(TermChoices)))
    Rate = Decimal(str(Rng.choice(RateChoices)))
    CorrectAnswer = _CleanMoney(Principal * Term * Rate / Decimal(100))
    return [_AsDisplayNumber(Principal), _AsDisplayNumber(Term), _AsDisplayNumber(Rate)], ["Principal", "Term (Years)", "Rate of Interest"], CorrectAnswer, {
        "financial_mode": "SIMPLE_INTEREST",
        "question_text": "Find Simple Interest",
        "principal": _AsDisplayNumber(Principal),
        "term_years": _AsDisplayNumber(Term),
        "rate_percent": _AsDisplayNumber(Rate),
    }


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
    if ConceptFamily == "SOLVE_EQUATION":
        return GenerateSolveEquation(Config, Rng, QuestionNumber)
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
