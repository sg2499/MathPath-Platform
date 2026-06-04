from decimal import Decimal
import re

from app.question_engine.mm.config import MMConfig, IsPackage1Supported


ALLOWED_OPERATORS = {"", "+", "-", "×", "÷", "+%", "-%", "% of", "%"}
PACKAGE_4_FINANCIAL_CONCEPTS = {"SIMPLE_INTEREST", "PROFIT_LOSS", "FIND_SELLING_PRICE", "FIND_COST_PRICE"}
PACKAGE_5_SPECIAL_CONCEPTS = {"SKILL_STACKER", "CONCEPT_DRILL", "SOLVE_EQUATION", "WRITE_NUMBER_FROM_POSITION", "FIND_FIRST_NATURAL_POSITION"}
PACKAGE_3_COMPACT_CONCEPTS = {"SQUARES", "CUBES", "SQUARE_ROOT", "CUBE_ROOT", "MIXED_SQUARE_CUBE", "MIXED_ROOTS"}


def _IsNumeric(Value: object) -> bool:
    try:
        Decimal(str(Value))
        return True
    except Exception:
        return False


def _DecimalValue(Value: object) -> Decimal:
    return Decimal(str(Value))


def _IsWholeNumber(Value: object) -> bool:
    try:
        DecimalValue = _DecimalValue(Value)
        return DecimalValue == DecimalValue.to_integral_value()
    except Exception:
        return False


def _HasDecimalOperand(Operands: list[int | float | str]) -> bool:
    return any(_IsNumeric(Value) and not _IsWholeNumber(Value) for Value in Operands)


def _DigitCount(Value: object) -> int | None:
    if not _IsNumeric(Value) or not _IsWholeNumber(Value):
        return None
    IntegerValue = abs(int(_DecimalValue(Value)))
    return len(str(IntegerValue)) if IntegerValue != 0 else 1


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
    for Pattern in [r"([1-6])D\s*X\s*([1-6])D", r"([1-6])D\s*MULTIPLICATION\s*(?:BY\s*)?([1-6])D"]:
        Match = re.search(Pattern, Title)
        if Match:
            return int(Match.group(1)), int(Match.group(2))
    return None


def _ExtractDivisionDigits(Config: MMConfig) -> tuple[int, int] | None:
    Title = _NormalisedPatternTitle(Config)
    for Pattern in [
        r"([1-6])D\s*DIVISION\s*([1-6])D",
        r"([1-6])D\s*DIVIDE\s*([1-6])D",
        r"([1-6])D\s*DIVIDED\s*BY\s*([1-6])D",
    ]:
        Match = re.search(Pattern, Title)
        if Match:
            return int(Match.group(1)), int(Match.group(2))
    if "DIVISION BY 6D" in Title:
        return 6, 3
    if "DIVISION BY 3D" in Title:
        return 4, 3
    return None


def _ValidateWholeMultiplicationPattern(Config: MMConfig, Operands: list[int | float | str], Operators: list[str]) -> bool:
    if len(Operands) != 2 or Operators != ["", "×"]:
        return False
    if _HasDecimalOperand(Operands):
        return False
    ExpectedDigits = _ExtractMultiplicationDigits(Config)
    if ExpectedDigits is None:
        return True
    return (_DigitCount(Operands[0]), _DigitCount(Operands[1])) == ExpectedDigits


def _ValidateWholeDivisionPattern(Config: MMConfig, Operands: list[int | float | str], Operators: list[str]) -> bool:
    if len(Operands) != 2 or Operators != ["", "÷"]:
        return False
    if _HasDecimalOperand(Operands):
        return False
    ExpectedDigits = _ExtractDivisionDigits(Config)
    if ExpectedDigits is None:
        return True
    return (_DigitCount(Operands[0]), _DigitCount(Operands[1])) == ExpectedDigits


def _ValidateDecimalOperation(Operands: list[int | float | str], Operators: list[str], ExpectedOperator: str) -> bool:
    if len(Operands) != 2 or Operators != ["", ExpectedOperator]:
        return False
    return _HasDecimalOperand(Operands)


def _ValidatePercentageAddLess(Operands: list[int | float | str], Operators: list[str]) -> bool:
    if len(Operands) != 2 or Operators[0] != "":
        return False
    return Operators[1] in {"+%", "-%"}


def _EvaluateBodmasExpression(Expression: str) -> Decimal | None:
    """Safely evaluate generated workbook BODMAS expression text.

    This is intentionally limited to generator-created arithmetic strings. It
    supports the workbook symbols used by MM BODMAS: ×, ÷, %, powers, square
    roots, cube roots, brackets and signed decimals. It is used as a final
    correctness guard so the stored answer cannot drift from the displayed row.
    """
    try:
        import ast
        import math
        import re

        Sanitised = str(Expression)
        Sanitised = Sanitised.replace("−", "-").replace("×", "*").replace("÷", "/")
        Sanitised = Sanitised.replace("^", "**")
        Sanitised = re.sub(r"∛\s*([0-9]+(?:\.[0-9]+)?)", r"cuberoot(\1)", Sanitised)
        Sanitised = re.sub(r"√\s*([0-9]+(?:\.[0-9]+)?)", r"sqrt(\1)", Sanitised)
        Sanitised = re.sub(r"(?<![A-Za-z0-9_])([0-9]+(?:\.[0-9]+)?)\s*%", r"(\1/100)", Sanitised)
        Sanitised = Sanitised.replace("²", "**2").replace("³", "**3")

        AllowedNames = {
            "sqrt": lambda Value: Decimal(str(int(math.isqrt(int(Value))) if math.isqrt(int(Value)) ** 2 == int(Value) else math.sqrt(float(Value)))),
            "cuberoot": lambda Value: Decimal(str(round(float(Value) ** (1 / 3)))) if round(float(Value) ** (1 / 3)) ** 3 == int(Value) else Decimal(str(float(Value) ** (1 / 3))),
        }

        def EvalNode(Node):
            if isinstance(Node, ast.Expression):
                return EvalNode(Node.body)
            if isinstance(Node, ast.Constant) and isinstance(Node.value, (int, float)):
                return Decimal(str(Node.value))
            if isinstance(Node, ast.UnaryOp) and isinstance(Node.op, ast.USub):
                return -EvalNode(Node.operand)
            if isinstance(Node, ast.UnaryOp) and isinstance(Node.op, ast.UAdd):
                return EvalNode(Node.operand)
            if isinstance(Node, ast.BinOp):
                Left = EvalNode(Node.left)
                Right = EvalNode(Node.right)
                if isinstance(Node.op, ast.Add):
                    return Left + Right
                if isinstance(Node.op, ast.Sub):
                    return Left - Right
                if isinstance(Node.op, ast.Mult):
                    return Left * Right
                if isinstance(Node.op, ast.Div):
                    if Right == 0:
                        raise ValueError("division by zero")
                    return Left / Right
                if isinstance(Node.op, ast.Pow):
                    return Left ** int(Right)
            if isinstance(Node, ast.Call) and isinstance(Node.func, ast.Name) and Node.func.id in AllowedNames and len(Node.args) == 1:
                return AllowedNames[Node.func.id](EvalNode(Node.args[0]))
            raise ValueError("unsupported expression node")

        Parsed = ast.parse(Sanitised, mode="eval")
        return EvalNode(Parsed).quantize(Decimal("0.01"))
    except Exception:
        return None


def _ValidateBodmasQuestion(Operands: list[int | float | str], Operators: list[str], CorrectAnswer: Decimal) -> bool:
    if len(Operands) != 1 or Operators != [""]:
        return False
    Expression = str(Operands[0]).strip()
    if not Expression:
        return False
    if not any(Symbol in Expression for Symbol in ["+", "-", "×", "÷", "√", "∛", "²", "³", "%", "("]):
        return False
    ExpectedAnswer = _EvaluateBodmasExpression(Expression)
    if ExpectedAnswer is None:
        return False
    return CorrectAnswer.quantize(Decimal("0.01")) == ExpectedAnswer


def _EvaluateExpressionWithPrecedence(Operands: list[int | float | str], Operators: list[str]) -> Decimal | None:
    """Evaluate a flat workbook expression using ×/÷ before +/-.

    Operators are aligned with operands, where Operators[0] is usually "".
    This intentionally supports the platform's horizontal BODMAS convention
    without using Python eval or unsafe expression parsing.
    """
    if not Operands or len(Operands) != len(Operators):
        return None
    try:
        Values = [_DecimalValue(Value) for Value in Operands]
    except Exception:
        return None

    Terms: list[Decimal] = []
    PendingSign = Decimal(1)
    Current = Values[0]

    for Index in range(1, len(Values)):
        Operator = Operators[Index]
        Value = Values[Index]
        if Operator == "×":
            Current *= Value
        elif Operator == "÷":
            if Value == 0:
                return None
            Current /= Value
        elif Operator in {"+", "-"}:
            Terms.append(PendingSign * Current)
            PendingSign = Decimal(1) if Operator == "+" else Decimal(-1)
            Current = Value
        else:
            return None
    Terms.append(PendingSign * Current)
    return sum(Terms, Decimal(0))


def _AnswersMatch(Expected: Decimal, CorrectAnswer: Decimal) -> bool:
    if Expected == CorrectAnswer:
        return True
    return abs(Expected - CorrectAnswer) <= Decimal("0.000001")


def _ValidatePackage3Compact(Config: MMConfig, Operands: list[int | float | str], Operators: list[str], CorrectAnswer: Decimal) -> bool:
    if len(Operands) != 1 or len(Operators) != 1 or Operators[0] != "":
        return False
    Text = str(Operands[0])
    if Config.ConceptFamily == "SQUARES":
        return "²" in Text and "√" not in Text and CorrectAnswer >= 0
    if Config.ConceptFamily == "CUBES":
        return "³" in Text and "∛" not in Text and CorrectAnswer >= 0
    if Config.ConceptFamily == "SQUARE_ROOT":
        return Text.startswith("√") and CorrectAnswer >= 0
    if Config.ConceptFamily == "CUBE_ROOT":
        return Text.startswith("∛") and CorrectAnswer >= 0
    if Config.ConceptFamily == "MIXED_SQUARE_CUBE":
        return ("²" in Text or "³" in Text) and CorrectAnswer >= 0
    if Config.ConceptFamily == "MIXED_ROOTS":
        return (Text.startswith("√") or Text.startswith("∛")) and CorrectAnswer >= 0
    return False


def _ValidateFinancialQuestion(Config: MMConfig, Operands: list[int | float | str], Operators: list[str], CorrectAnswer: Decimal) -> bool:
    if Config.ConceptFamily == "SIMPLE_INTEREST":
        if len(Operands) != 3 or Operators != ["Principal", "Term (Years)", "Rate of Interest"]:
            return False
        Principal, Term, Rate = [_DecimalValue(Value) for Value in Operands]
        ExpectedAnswer = (Principal * Term * Rate / Decimal(100)).quantize(Decimal("0.01"))
        return Principal > 0 and Term > 0 and Rate > 0 and CorrectAnswer.quantize(Decimal("0.01")) == ExpectedAnswer

    if Config.ConceptFamily == "PROFIT_LOSS":
        if len(Operands) != 2 or Operators != ["Cost Price", "Selling Price"]:
            return False
        CostPrice, SellingPrice = [_DecimalValue(Value) for Value in Operands]
        if CostPrice <= 0 or SellingPrice <= 0 or CostPrice == SellingPrice or CorrectAnswer < 0:
            return False
        Difference = abs(SellingPrice - CostPrice).quantize(Decimal("0.01"))
        Percentage = (Difference / CostPrice * Decimal(100)).quantize(Decimal("0.01"))
        Answer = CorrectAnswer.quantize(Decimal("0.01"))
        return Answer in {Difference, Percentage}

    if Config.ConceptFamily == "FIND_SELLING_PRICE":
        if len(Operands) != 2 or Operators[0] != "Cost Price" or Operators[1] not in {"Profit %", "Loss %"}:
            return False
        CostPrice, Percent = [_DecimalValue(Value) for Value in Operands]
        ExpectedAnswer = CostPrice + (CostPrice * Percent / Decimal(100)) if Operators[1] == "Profit %" else CostPrice - (CostPrice * Percent / Decimal(100))
        return CostPrice > 0 and Percent > 0 and CorrectAnswer.quantize(Decimal("0.01")) == ExpectedAnswer.quantize(Decimal("0.01"))

    if Config.ConceptFamily == "FIND_COST_PRICE":
        if len(Operands) != 2 or Operators[0] != "Selling Price" or Operators[1] not in {"Profit %", "Loss %"}:
            return False
        SellingPrice, Percent = [_DecimalValue(Value) for Value in Operands]
        if Operators[1] == "Profit %":
            ExpectedAnswer = SellingPrice / (Decimal(1) + (Percent / Decimal(100)))
        else:
            ExpectedAnswer = SellingPrice / (Decimal(1) - (Percent / Decimal(100)))
        return SellingPrice > 0 and Decimal(0) < Percent < Decimal(100) and abs(CorrectAnswer - ExpectedAnswer) < Decimal("0.02")

    return False


def _ValidateNumberFromFirstPosition(Digits: int, FirstPosition: int) -> Decimal:
    DigitText = str(abs(int(Digits)))
    Exponent = FirstPosition - (len(DigitText) - 1)
    return Decimal(DigitText) * (Decimal(10) ** Decimal(Exponent))


def _ValidateFirstNaturalPosition(Value: Decimal) -> int:
    if Value == 0:
        return 0
    AbsoluteValue = abs(Value.normalize())
    if AbsoluteValue >= 1:
        IntegerText = str(int(AbsoluteValue))
        return len(IntegerText) - 1
    Position = -1
    Current = AbsoluteValue
    while Current < 1:
        Current *= 10
        if int(Current) > 0:
            return Position
        Position -= 1
    return Position


def _ValidatePackage5Special(Config: MMConfig, Operands: list[int | float | str], Operators: list[str], CorrectAnswer: Decimal) -> bool:
    if Config.ConceptFamily == "SKILL_STACKER":
        if len(Operands) != 2 or Operators != ["Add", "Times"]:
            return False
        AddValue, Times = [_DecimalValue(Value) for Value in Operands]
        return AddValue > 0 and Times > 0 and CorrectAnswer == AddValue * Times

    if Config.ConceptFamily == "CONCEPT_DRILL":
        if len(Operands) != 2 or Operators != ["From", "Less"]:
            return False
        FromValue, LessValue = [_DecimalValue(Value) for Value in Operands]
        if FromValue <= 0 or LessValue <= 0 or FromValue <= LessValue:
            return False
        ExpectedAnswer = FromValue % LessValue
        if ExpectedAnswer == 0:
            return False
        return Decimal(0) < CorrectAnswer < LessValue and CorrectAnswer == ExpectedAnswer

    if Config.ConceptFamily == "SOLVE_EQUATION":
        if len(Operands) != 2 or Operators[0] != "" or Operators[1] not in {"+", "-"}:
            return False
        Left, Right = [_DecimalValue(Value) for Value in Operands]
        ExpectedAnswer = Left + Right if Operators[1] == "+" else Left - Right
        return CorrectAnswer == ExpectedAnswer

    if Config.ConceptFamily == "WRITE_NUMBER_FROM_POSITION":
        if len(Operands) != 2 or Operators != ["Position", "Number"]:
            return False
        if not _IsWholeNumber(Operands[0]) or not _IsWholeNumber(Operands[1]):
            return False
        ExpectedAnswer = _ValidateNumberFromFirstPosition(int(_DecimalValue(Operands[1])), int(_DecimalValue(Operands[0]))).normalize()
        return CorrectAnswer.normalize() == ExpectedAnswer

    if Config.ConceptFamily == "FIND_FIRST_NATURAL_POSITION":
        if len(Operands) != 1 or Operators != ["Number"]:
            return False
        ExpectedAnswer = Decimal(_ValidateFirstNaturalPosition(_DecimalValue(Operands[0])))
        return CorrectAnswer == ExpectedAnswer

    return False


def ValidateMmQuestion(Config: MMConfig, Operands: list[int | float | str], Operators: list[str], CorrectAnswer: Decimal) -> bool:
    if not IsPackage1Supported(Config.ConceptFamily):
        return False

    if len(Operators) != len(Operands):
        return False

    if Config.ConceptFamily in PACKAGE_4_FINANCIAL_CONCEPTS:
        return _ValidateFinancialQuestion(Config, Operands, Operators, CorrectAnswer)

    if Config.ConceptFamily in PACKAGE_5_SPECIAL_CONCEPTS:
        return _ValidatePackage5Special(Config, Operands, Operators, CorrectAnswer)

    if any(Operator not in ALLOWED_OPERATORS for Operator in Operators):
        return False

    if Config.ConceptFamily in PACKAGE_3_COMPACT_CONCEPTS:
        return _ValidatePackage3Compact(Config, Operands, Operators, CorrectAnswer)

    if Config.ConceptFamily == "BODMAS":
        return _ValidateBodmasQuestion(Operands, Operators, CorrectAnswer)

    if len(Operands) < 2:
        return False

    for Index, Operator in enumerate(Operators):
        if Operator == "÷" and Decimal(str(Operands[Index])) == 0:
            return False

    if Config.ConceptFamily in {"ADD_LESS", "DECIMAL_ADD_LESS"}:
        try:
            ExpectedAnswer = sum((_DecimalValue(Value) for Value in Operands), Decimal(0))
        except Exception:
            return False
        return _AnswersMatch(ExpectedAnswer, CorrectAnswer)

    if Config.ConceptFamily == "WHOLE_NUMBER_MULTIPLICATION":
        ExpectedAnswer = _DecimalValue(Operands[0]) * _DecimalValue(Operands[1]) if len(Operands) == 2 else None
        return _ValidateWholeMultiplicationPattern(Config, Operands, Operators) and ExpectedAnswer is not None and _AnswersMatch(ExpectedAnswer, CorrectAnswer) and CorrectAnswer >= 0

    if Config.ConceptFamily == "WHOLE_NUMBER_DIVISION":
        ExpectedAnswer = _DecimalValue(Operands[0]) / _DecimalValue(Operands[1]) if len(Operands) == 2 and _DecimalValue(Operands[1]) != 0 else None
        return _ValidateWholeDivisionPattern(Config, Operands, Operators) and ExpectedAnswer is not None and _AnswersMatch(ExpectedAnswer, CorrectAnswer) and CorrectAnswer >= 0

    if Config.ConceptFamily == "DECIMAL_MULTIPLICATION":
        ExpectedAnswer = _DecimalValue(Operands[0]) * _DecimalValue(Operands[1]) if len(Operands) == 2 else None
        return _ValidateDecimalOperation(Operands, Operators, "×") and ExpectedAnswer is not None and _AnswersMatch(ExpectedAnswer, CorrectAnswer) and CorrectAnswer >= 0

    if Config.ConceptFamily == "DECIMAL_DIVISION":
        ExpectedAnswer = _DecimalValue(Operands[0]) / _DecimalValue(Operands[1]) if len(Operands) == 2 and _DecimalValue(Operands[1]) != 0 else None
        return _ValidateDecimalOperation(Operands, Operators, "÷") and ExpectedAnswer is not None and _AnswersMatch(ExpectedAnswer, CorrectAnswer) and CorrectAnswer >= 0

    if Config.ConceptFamily == "BODMAS":
        if len(Operands) < 3 or Operators[0] != "" or not any(Operator in {"×", "÷"} for Operator in Operators[1:]):
            return False
        ExpectedAnswer = _EvaluateExpressionWithPrecedence(Operands, Operators)
        return ExpectedAnswer is not None and _AnswersMatch(ExpectedAnswer, CorrectAnswer) and CorrectAnswer >= 0

    if Config.ConceptFamily == "PERCENTAGE_ADD_LESS":
        if not _ValidatePercentageAddLess(Operands, Operators):
            return False
        Base, Percent = [_DecimalValue(Value) for Value in Operands]
        ExpectedAnswer = Base + (Base * Percent / Decimal(100)) if Operators[1] == "+%" else Base - (Base * Percent / Decimal(100))
        return _AnswersMatch(ExpectedAnswer.quantize(Decimal("0.01")), CorrectAnswer.quantize(Decimal("0.01"))) and CorrectAnswer >= 0

    if Config.ConceptFamily == "INTEGERS":
        ExpectedAnswer = _EvaluateExpressionWithPrecedence(Operands, Operators)
        return ExpectedAnswer is not None and _AnswersMatch(ExpectedAnswer, CorrectAnswer)

    if Config.ConceptFamily.startswith("PERCENTAGE") and any(_IsNumeric(Value) and Decimal(str(Value)) < 0 for Value in Operands):
        return False

    if Config.ConceptFamily != "INTEGERS" and CorrectAnswer < 0:
        return False

    ExpectedAnswer = _EvaluateExpressionWithPrecedence(Operands, Operators)
    return ExpectedAnswer is not None and _AnswersMatch(ExpectedAnswer, CorrectAnswer)
