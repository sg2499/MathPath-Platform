"""MCQ distractor generation for Intermediate Module. Independent of
app.question_engine.mm.distractors -- IM only needs generic numeric
distractors and a position-shift variant for the Answer Position concept;
it has no financial (profit/loss/interest) concepts to support.
"""

import random
from decimal import Decimal, ROUND_HALF_UP


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


def GenerateImDistractors(CorrectAnswer: Decimal, Rng: random.Random, AllowNegative: bool = False) -> list[int | str]:
    Magnitude = max(Decimal("1"), abs(CorrectAnswer))
    Step = Decimal("0.1") if CorrectAnswer.as_tuple().exponent < 0 else Decimal("1")
    CandidateDeltas = [Step, -Step, Step * 2, -Step * 2, Step * 5, -Step * 5]
    if Magnitude >= 50:
        CandidateDeltas.extend([Decimal("10"), Decimal("-10"), Decimal("20"), Decimal("-20")])
    if Magnitude >= 1000:
        CandidateDeltas.extend([Decimal("100"), Decimal("-100")])

    Candidates: list[Decimal] = []
    for Delta in CandidateDeltas:
        Candidate = _QuantizeLike(CorrectAnswer + Delta, CorrectAnswer)
        if Candidate == CorrectAnswer:
            continue
        if not AllowNegative and Candidate < 0:
            continue
        if Candidate not in Candidates:
            Candidates.append(Candidate)

    Guard = 0
    while len(Candidates) < 3 and Guard < 80:
        Guard += 1
        RandomDelta = Decimal(Rng.choice([-25, -20, -15, -12, -9, -7, -5, -3, 3, 5, 7, 9, 12, 15, 20, 25])) * Step
        Candidate = _QuantizeLike(CorrectAnswer + RandomDelta, CorrectAnswer)
        if Candidate != CorrectAnswer and (AllowNegative or Candidate >= 0) and Candidate not in Candidates:
            Candidates.append(Candidate)

    Offset = Decimal("1")
    while len(Candidates) < 3:
        Candidate = _QuantizeLike(CorrectAnswer + Offset, CorrectAnswer)
        if Candidate != CorrectAnswer and (AllowNegative or Candidate >= 0) and Candidate not in Candidates:
            Candidates.append(Candidate)
        Offset += Decimal("1")

    Candidates.sort(key=lambda Candidate: abs(Candidate - CorrectAnswer))
    Selected = Candidates[:3]
    Rng.shuffle(Selected)
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
