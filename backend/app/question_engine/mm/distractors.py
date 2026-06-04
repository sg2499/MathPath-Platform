import random
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable


def _NormalisedDecimal(Value: Decimal) -> Decimal:
    """Return a stable Decimal without false decimal precision.

    BODMAS and division-heavy concepts can produce Decimal('28205.0') even when
    the visible answer is the whole number 28205. MCQ distractors must follow
    the visible answer format, not the internal arithmetic exponent, otherwise
    the correct answer becomes guessable by format.
    """
    if Value == Value.to_integral_value():
        return Value.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return Value.normalize()


def _DecimalPlaces(Value: Decimal) -> int:
    Value = _NormalisedDecimal(Value)
    Exponent = Value.as_tuple().exponent
    return max(0, -Exponent)


def _QuantizeLike(Value: Decimal, CorrectAnswer: Decimal) -> Decimal:
    Places = _DecimalPlaces(CorrectAnswer)
    Quantizer = Decimal("1") if Places == 0 else Decimal("1").scaleb(-Places)
    Quantized = Value.quantize(Quantizer, rounding=ROUND_HALF_UP)
    return _NormalisedDecimal(Quantized)


def _Display(Value: Decimal) -> int | float:
    Value = _NormalisedDecimal(Value)
    if Value == Value.to_integral_value():
        return int(Value)
    return float(Value)


def _UniqueAppend(Candidates: list[Decimal], Candidate: Decimal, CorrectAnswer: Decimal, AllowNegative: bool) -> None:
    Candidate = _QuantizeLike(Candidate, CorrectAnswer)
    Correct = _QuantizeLike(CorrectAnswer, CorrectAnswer)
    if Candidate == Correct:
        return
    if not AllowNegative and Candidate < 0:
        return
    if Candidate not in Candidates:
        Candidates.append(Candidate)


def _IntegerDeltas(Magnitude: Decimal) -> list[Decimal]:
    if Magnitude < 20:
        Raw = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5]
    elif Magnitude < 100:
        Raw = [1, -1, 2, -2, 5, -5, 10, -10, 12, -12]
    elif Magnitude < 1000:
        Raw = [1, -1, 2, -2, 5, -5, 10, -10, 20, -20, 50, -50]
    elif Magnitude < 10000:
        Raw = [1, -1, 2, -2, 5, -5, 10, -10, 20, -20, 100, -100]
    else:
        Raw = [1, -1, 2, -2, 5, -5, 10, -10, 20, -20, 50, -50, 100, -100]
    return [Decimal(Value) for Value in Raw]


def _DecimalDeltas(CorrectAnswer: Decimal) -> list[Decimal]:
    Places = _DecimalPlaces(CorrectAnswer)
    Step = Decimal("1").scaleb(-Places)
    RawMultipliers = [1, -1, 2, -2, 3, -3, 5, -5, 8, -8, 10, -10]
    Deltas = [Step * Multiplier for Multiplier in RawMultipliers]
    Magnitude = abs(CorrectAnswer)
    if Magnitude >= 100:
        Deltas.extend([Step * 20, Step * -20, Step * 50, Step * -50])
    return Deltas


def _RepairToRequiredCount(Candidates: list[Decimal], CorrectAnswer: Decimal, Rng: random.Random, AllowNegative: bool) -> None:
    Correct = _QuantizeLike(CorrectAnswer, CorrectAnswer)
    IsIntegerAnswer = _DecimalPlaces(Correct) == 0
    Guard = 0
    while len(Candidates) < 3 and Guard < 200:
        Guard += 1
        if IsIntegerAnswer:
            MaxDelta = max(5, min(250, int(abs(Correct)) // 20 + 12))
            RandomDelta = Decimal(Rng.choice([Delta for Delta in range(-MaxDelta, MaxDelta + 1) if Delta != 0]))
        else:
            Step = Decimal("1").scaleb(-_DecimalPlaces(Correct))
            RandomDelta = Step * Decimal(Rng.choice([Delta for Delta in range(-25, 26) if Delta != 0]))
        _UniqueAppend(Candidates, Correct + RandomDelta, Correct, AllowNegative)

    Offset = Decimal("1") if IsIntegerAnswer else Decimal("1").scaleb(-_DecimalPlaces(Correct))
    while len(Candidates) < 3:
        _UniqueAppend(Candidates, Correct + Offset, Correct, AllowNegative)
        _UniqueAppend(Candidates, Correct - Offset, Correct, AllowNegative)
        Offset += Decimal("1") if IsIntegerAnswer else Decimal("1").scaleb(-_DecimalPlaces(Correct))


def GenerateMmDistractors(CorrectAnswer: Decimal, Rng: random.Random, AllowNegative: bool = False) -> list[int | float]:
    """Generate plausible, format-consistent MCQ distractors for MM.

    Global convention enforced here:
    - Whole-number correct answers receive whole-number distractors.
    - Decimal correct answers receive decimal distractors with matching precision.
    - Distractors stay close enough to be plausible and never duplicate the answer.
    - The answer cannot be identified by decimal/integer formatting patterns.
    """
    Correct = _QuantizeLike(CorrectAnswer, CorrectAnswer)
    Magnitude = max(Decimal("1"), abs(Correct))
    IsIntegerAnswer = _DecimalPlaces(Correct) == 0

    CandidateDeltas = _IntegerDeltas(Magnitude) if IsIntegerAnswer else _DecimalDeltas(Correct)

    Candidates: list[Decimal] = []
    for Delta in CandidateDeltas:
        _UniqueAppend(Candidates, Correct + Delta, Correct, AllowNegative)

    # Add a few common arithmetic-near alternatives while preserving answer format.
    if IsIntegerAnswer:
        for Delta in [Decimal("3"), Decimal("-3"), Decimal("7"), Decimal("-7"), Decimal("11"), Decimal("-11")]:
            _UniqueAppend(Candidates, Correct + Delta, Correct, AllowNegative)
    else:
        Step = Decimal("1").scaleb(-_DecimalPlaces(Correct))
        for Multiplier in [Decimal("4"), Decimal("-4"), Decimal("6"), Decimal("-6"), Decimal("9"), Decimal("-9")]:
            _UniqueAppend(Candidates, Correct + Step * Multiplier, Correct, AllowNegative)

    _RepairToRequiredCount(Candidates, Correct, Rng, AllowNegative)

    Candidates.sort(key=lambda Candidate: (abs(Candidate - Correct), Candidate))
    Selected = Candidates[:3]
    Rng.shuffle(Selected)
    return [_Display(Value) for Value in Selected]
