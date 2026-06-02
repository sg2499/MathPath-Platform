from decimal import Decimal
import re

from app.question_engine.mm.config import MMConfig, IsPackage1Supported


ALLOWED_OPERATORS = {"", "+", "-", "×", "÷", "+%", "-%", "% of", "%"}
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
        return (Text.startswith("√") or Text.startswith("∛")) and CorrectAnswer >= 0
    return False


def ValidateMmQuestion(Config: MMConfig, Operands: list[int | float | str], Operators: list[str], CorrectAnswer: Decimal) -> bool:
    if not IsPackage1Supported(Config.ConceptFamily):
        return False

    if len(Operators) != len(Operands):
        return False
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

    if Config.ConceptFamily != "INTEGERS" and CorrectAnswer < 0:
        return False

    return True
