from decimal import Decimal

from app.question_engine.mm.config import MMConfig, IsPackage1Supported


ALLOWED_OPERATORS = {"", "+", "-", "×", "÷", "+%", "-%", "% of", "%"}
PACKAGE_3_COMPACT_CONCEPTS = {"SQUARES", "CUBES", "SQUARE_ROOT", "CUBE_ROOT", "MIXED_SQUARE_CUBE", "MIXED_ROOTS"}


def _IsNumeric(Value: object) -> bool:
    try:
        Decimal(str(Value))
        return True
    except Exception:
        return False


def ValidateMmQuestion(Config: MMConfig, Operands: list[int | float | str], Operators: list[str], CorrectAnswer: Decimal) -> bool:
    if not IsPackage1Supported(Config.ConceptFamily):
        return False
    if Config.ConceptFamily in PACKAGE_3_COMPACT_CONCEPTS:
        if len(Operands) != 1 or len(Operators) != 1:
            return False
        return CorrectAnswer >= 0
    if len(Operands) < 2:
        return False
    if len(Operators) != len(Operands):
        return False
    if any(Operator not in ALLOWED_OPERATORS for Operator in Operators):
        return False
    for Index, Operator in enumerate(Operators):
        if Operator == "÷" and Decimal(str(Operands[Index])) == 0:
            return False
    if Config.ConceptFamily != "INTEGERS" and CorrectAnswer < 0:
        return False
    if Config.ConceptFamily.startswith("PERCENTAGE") and any(_IsNumeric(Value) and Decimal(str(Value)) < 0 for Value in Operands):
        return False
    return True
