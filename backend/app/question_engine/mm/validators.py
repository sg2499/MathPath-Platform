from decimal import Decimal

from app.question_engine.mm.config import MMConfig, IsPackage1Supported


ALLOWED_OPERATORS = {"", "+", "-", "×", "÷", "+%", "-%", "% of", "%"}


def ValidateMmQuestion(Config: MMConfig, Operands: list[int | float], Operators: list[str], CorrectAnswer: Decimal) -> bool:
    if not IsPackage1Supported(Config.ConceptFamily):
        return False
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
    if Config.ConceptFamily.startswith("PERCENTAGE") and any(Decimal(str(Value)) < 0 for Value in Operands):
        return False
    return True
