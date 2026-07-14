"""MCQ distractor generation for Intermediate Module. Independent of
app.question_engine.mm.distractors -- IM only needs generic numeric
distractors and a position-shift variant for the Answer Position concept;
it has no financial (profit/loss/interest) concepts to support.
"""

import random
from decimal import Decimal, ROUND_HALF_UP

from app.question_engine.smart_distractors import generate_smart_distractors


def _QuantizeLike(Value: Decimal, CorrectAnswer: Decimal) -> Decimal:
    Exponent = CorrectAnswer.as_tuple().exponent
    if Exponent >= 0:
        return Value.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return Value.quantize(Decimal("1").scaleb(Exponent), rounding=ROUND_HALF_UP)


def _Display(Value: Decimal) -> int | str:
    if Value == Value.to_integral_value():
        return int(Value)
    Text = format(Value.normalize(), "f")
    if "." in Text:
        Text = Text.rstrip("0").rstrip(".")
    return Text if Text != "-0" else "0"


def GenerateImDistractors(
    CorrectAnswer: Decimal,
    Rng: random.Random,
    AllowNegative: bool = False,
    Operation: str = "GENERIC",
    Operands: list[Decimal] | None = None,
) -> list[int | str]:
    """Every wrong option shares CorrectAnswer's own last digit (at its own
    decimal precision) so a units-digit shortcut can never eliminate an
    option, and is built from a plausible calculation mistake where the
    operation gives us enough structure to construct one, rather than a
    naive small numeric offset. See app.question_engine.smart_distractors
    for the shared implementation used identically by MM and YLM.
    """
    Selected = generate_smart_distractors(CorrectAnswer, Rng, Operation, Operands or [], AllowNegative)
    return [_Display(Value) for Value in Selected]


def GenerateAnswerPositionDistractors(CorrectAnswer: Decimal, Rng: random.Random) -> list[int | str]:
    """Decimal-shift distractors: the classic wrong answer for a position
    question is the right digits at the wrong power-of-ten shift.
    """
    Candidates: list[Decimal] = []
    for Shift in (-3, -2, -1, 1, 2, 3):
        Candidate = CorrectAnswer.scaleb(Shift)
        if Candidate != CorrectAnswer and Candidate not in Candidates:
            Candidates.append(Candidate)
    Rng.shuffle(Candidates)
    Selected = Candidates[:3]
    Displayed = [_Display(Value) for Value in Selected]
    if len(Displayed) < 3:
        Displayed.extend(GenerateImDistractors(CorrectAnswer, Rng, AllowNegative=True)[: 3 - len(Displayed)])
    return Displayed
