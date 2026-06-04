from decimal import Decimal
import re

from app.question_engine.mm.config import MMConfig, IsPackage1Supported


ALLOWED_OPERATORS = {"", "+", "-", "×", "÷", "+%", "-%", "% of", "%"}
PACKAGE_4_FINANCIAL_CONCEPTS = {"SIMPLE_INTEREST", "PROFIT_LOSS", "FIND_SELLING_PRICE", "FIND_COST_PRICE"}
PACKAGE_5_SPECIAL_CONCEPTS = {"SKILL_STACKER", "CONCEPT_DRILL", "ANSWER_POSITION", "SOLVE_EQUATION"}
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
        # Some workbook sheets combine cubes, squares, and cube-root sections under
        # one compact mixed title. Accept all compact power/root forms so preview
        # generation never fails for those mapped sheets.
        return (Text.startswith("√") or Text.startswith("∛") or "²" in Text or "³" in Text) and CorrectAnswer >= 0
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

    if Config.ConceptFamily == "ANSWER_POSITION":
        return len(Operands) == 1 and Operators == [""] and CorrectAnswer >= 0

    if Config.ConceptFamily == "SOLVE_EQUATION":
        return len(Operands) == 1 and Operators == [""] and CorrectAnswer >= 0

    return False




def _ValidateIntegerQuestion(Operands: list[int | float | str], Operators: list[str], CorrectAnswer: Decimal) -> bool:
    if len(Operands) < 2 or len(Operators) != len(Operands):
        return False
    if any(Operator not in {"", "+"} for Operator in Operators):
        return False
    if any(not _IsNumeric(Value) or not _IsWholeNumber(Value) for Value in Operands):
        return False

    SignedValues = [_DecimalValue(Value) for Value in Operands]
    if all(Value < 0 for Value in SignedValues):
        return False

    ExpectedAnswer = sum(SignedValues, Decimal(0))
    return CorrectAnswer == ExpectedAnswer


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

    if len(Operands) < 2:
        return False

    for Index, Operator in enumerate(Operators):
        if Operator == "÷" and Decimal(str(Operands[Index])) == 0:
            return False

    if Config.ConceptFamily == "WHOLE_NUMBER_MULTIPLICATION":
        return _ValidateWholeMultiplicationPattern(Config, Operands, Operators) and CorrectAnswer >= 0

    if Config.ConceptFamily == "WHOLE_NUMBER_DIVISION":
        return _ValidateWholeDivisionPattern(Config, Operands, Operators) and CorrectAnswer >= 0

    if Config.ConceptFamily == "DECIMAL_MULTIPLICATION":
        return _ValidateDecimalOperation(Operands, Operators, "×") and CorrectAnswer >= 0

    if Config.ConceptFamily == "DECIMAL_DIVISION":
        return _ValidateDecimalOperation(Operands, Operators, "÷") and CorrectAnswer >= 0

    if Config.ConceptFamily == "PERCENTAGE_ADD_LESS":
        return _ValidatePercentageAddLess(Operands, Operators) and CorrectAnswer >= 0

    if Config.ConceptFamily.startswith("PERCENTAGE") and any(_IsNumeric(Value) and Decimal(str(Value)) < 0 for Value in Operands):
        return False

    if Config.ConceptFamily == "INTEGERS":
        return _ValidateIntegerQuestion(Operands, Operators, CorrectAnswer)

    if CorrectAnswer < 0:
        return False

    return True
