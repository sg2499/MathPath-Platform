from decimal import Decimal

from app.question_engine.mm.config import MMConfig, IsPackage1Supported


def ValidateMmQuestion(Config: MMConfig, Operands: list[int | float], Operators: list[str], CorrectAnswer: Decimal) -> bool:
    if not IsPackage1Supported(Config.ConceptFamily):
        return False
    if len(Operands) < 2:
        return False
    if len(Operators) != len(Operands):
        return False
    if Operators[1] == "÷" and Decimal(str(Operands[1])) == 0:
        return False
    if CorrectAnswer < 0:
        return False
    return True
