"""Post-generation validation for Intermediate Module questions. Independent
of app.question_engine.mm.validators. Acts as a safety net: every generated
question is checked against its concept's own rules before being accepted,
and the generator retries with a fresh seed if a check fails.
"""

from decimal import Decimal

from app.question_engine.im.config import IMConfig, IsImConceptSupported
from app.question_engine.im.operands import TruncateThenRoundQuotient


def _IsNumericText(Value: object) -> bool:
    try:
        Decimal(str(Value))
        return True
    except Exception:
        return False


def _ValidateAddLess(Operands: list, Operators: list[str], CorrectAnswer: Decimal) -> bool:
    if len(Operands) < 3 or len(Operands) != len(Operators) or Operators[0] != "":
        return False
    if any(Operator not in {"", "+", "-"} for Operator in Operators):
        return False
    if any(not _IsNumericText(Value) for Value in Operands):
        return False
    Signed = [
        Decimal(str(Value)) if Operator in ("", "+") else -Decimal(str(Value))
        for Value, Operator in zip(Operands, Operators)
    ]
    return sum(Signed, Decimal(0)) == CorrectAnswer


def _ValidateMultiplication(Operands: list, Operators: list[str], CorrectAnswer: Decimal) -> bool:
    if len(Operands) != 2 or Operators != ["", "×"]:
        return False
    Left, Right = Decimal(str(Operands[0])), Decimal(str(Operands[1]))
    return Left > 0 and Right > 0 and CorrectAnswer == Left * Right


def _ValidateDivision(Config: IMConfig, Operands: list, Operators: list[str], CorrectAnswer: Decimal) -> bool:
    if len(Operands) != 2 or Operators != ["", "÷"]:
        return False
    Dividend, Divisor = Decimal(str(Operands[0])), Decimal(str(Operands[1]))
    if Divisor <= 0:
        return False
    GeneratorConfig = Config.GeneratorConfig if isinstance(Config.GeneratorConfig, dict) else {}
    if bool(GeneratorConfig.get("isLongDivisionEstimation")):
        # This concept requires a genuine remainder (see operands.py's
        # _GenerateLongDivisionEstimationPair) and the answer is the rounded
        # quotient, not the exact one -- mirror both rules here.
        if Dividend % Divisor == 0:
            return False
        return CorrectAnswer == TruncateThenRoundQuotient(Dividend / Divisor)
    return CorrectAnswer == Dividend / Divisor


def _ValidateSquares(Operands: list, Operators: list[str], CorrectAnswer: Decimal) -> bool:
    if len(Operands) != 1 or Operators != [""]:
        return False
    Text = str(Operands[0])
    return "²" in Text and CorrectAnswer >= 0


def _ValidateSkillStacker(Operands: list, Operators: list[str], CorrectAnswer: Decimal) -> bool:
    if len(Operands) != 2 or Operators != ["Add", "Times"]:
        return False
    AddValue = Decimal(str(Operands[0]))
    Times = int(Operands[1])
    # Upper bound widened to 15 to match LEVEL 8.xlsx's real ceiling (Lesson
    # 12 uses TIMES=15, POWER(2,15-1)) -- the old <=12 cap rejected every
    # valid Times=15 question the generator now produces (2026-07-17 audit).
    if Times < 8 or Times > 15 or AddValue <= 0:
        return False
    return CorrectAnswer == AddValue * (Decimal(2) ** (Times - 1))


def _ValidateConceptDrill(Operands: list, Operators: list[str], CorrectAnswer: Decimal) -> bool:
    if len(Operands) != 2 or Operators != ["From", "Less"]:
        return False
    FromValue = Decimal(str(Operands[0]))
    LessValue = Decimal(str(Operands[1]))
    if LessValue <= 0 or FromValue <= 0:
        return False
    if CorrectAnswer < 0 or CorrectAnswer >= LessValue:
        return False
    ExpectedAnswer = FromValue - (LessValue * int(FromValue // LessValue))
    return abs(CorrectAnswer - ExpectedAnswer) < Decimal("0.0001")


def _ValidateBodmas(Operands: list, Operators: list[str], CorrectAnswer: Decimal) -> bool:
    return len(Operands) == 1 and Operators == [""] and isinstance(Operands[0], str)


def _ValidateSolveEquation(Operands: list, Operators: list[str], CorrectAnswer: Decimal) -> bool:
    return len(Operands) == 1 and Operators == [""] and isinstance(Operands[0], str)


def _ValidateAnswerPosition(Config: IMConfig, Operands: list, Operators: list[str], CorrectAnswer: Decimal) -> bool:
    GeneratorConfig = Config.GeneratorConfig if isinstance(Config.GeneratorConfig, dict) else {}
    Direction = GeneratorConfig.get("answerPositionDirection", "WRITE_FROM_POSITION")
    if Direction == "WRITE_FROM_POSITION":
        return len(Operands) == 2 and Operators == ["Position", "Number"]
    return len(Operands) == 1 and Operators == ["Number"]


def ValidateImQuestion(Config: IMConfig, Operands: list, Operators: list[str], CorrectAnswer: Decimal) -> bool:
    if not IsImConceptSupported(Config.ConceptFamily):
        return False
    if len(Operators) != len(Operands):
        return False

    ConceptFamily = Config.ConceptFamily
    if ConceptFamily in ("ADD_LESS", "DECIMAL_ADD_LESS"):
        return _ValidateAddLess(Operands, Operators, CorrectAnswer)
    if ConceptFamily == "WHOLE_NUMBER_MULTIPLICATION":
        return _ValidateMultiplication(Operands, Operators, CorrectAnswer)
    if ConceptFamily == "WHOLE_NUMBER_DIVISION":
        return _ValidateDivision(Config, Operands, Operators, CorrectAnswer)
    if ConceptFamily == "SQUARES":
        return _ValidateSquares(Operands, Operators, CorrectAnswer)
    if ConceptFamily == "SKILL_STACKER":
        return _ValidateSkillStacker(Operands, Operators, CorrectAnswer)
    if ConceptFamily == "CONCEPT_DRILL":
        return _ValidateConceptDrill(Operands, Operators, CorrectAnswer)
    if ConceptFamily == "BODMAS":
        return _ValidateBodmas(Operands, Operators, CorrectAnswer)
    if ConceptFamily == "SOLVE_EQUATION":
        return _ValidateSolveEquation(Operands, Operators, CorrectAnswer)
    if ConceptFamily == "ANSWER_POSITION":
        return _ValidateAnswerPosition(Config, Operands, Operators, CorrectAnswer)
    return False
