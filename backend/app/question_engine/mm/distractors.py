import random
from decimal import Decimal, ROUND_HALF_UP


def _QuantizeLike(Value: Decimal, CorrectAnswer: Decimal) -> Decimal:
    Exponent = CorrectAnswer.as_tuple().exponent
    if Exponent >= 0:
        return Value.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return Value.quantize(Decimal("1").scaleb(Exponent), rounding=ROUND_HALF_UP)


def _Display(Value: Decimal) -> int | float:
    if Value == Value.to_integral_value():
        return int(Value)
    return float(Value.normalize())


def GenerateMmDistractors(CorrectAnswer: Decimal, Rng: random.Random, AllowNegative: bool = False) -> list[int | float]:
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

    while len(Candidates) < 3:
        RandomDelta = Decimal(Rng.choice([-9, -7, -5, -3, 3, 5, 7, 9])) * Step
        Candidate = _QuantizeLike(CorrectAnswer + RandomDelta, CorrectAnswer)
        if Candidate != CorrectAnswer and (AllowNegative or Candidate >= 0) and Candidate not in Candidates:
            Candidates.append(Candidate)

    Candidates.sort(key=lambda Candidate: abs(Candidate - CorrectAnswer))
    Selected = Candidates[:3]
    Rng.shuffle(Selected)
    return [_Display(Value) for Value in Selected]
