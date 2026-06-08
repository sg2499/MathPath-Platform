import random
from decimal import Decimal, ROUND_HALF_UP


def _QuantizeLike(Value: Decimal, CorrectAnswer: Decimal) -> Decimal:
    Exponent = CorrectAnswer.as_tuple().exponent
    if Exponent >= 0:
        return Value.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return Value.quantize(Decimal("1").scaleb(Exponent), rounding=ROUND_HALF_UP)


def _Display(Value: Decimal) -> int | str:
    """Return distractor values in plain decimal notation for student display."""
    if Value == Value.to_integral_value():
        return int(Value)

    DisplayText = format(Value.normalize(), "f")
    if "." in DisplayText:
        DisplayText = DisplayText.rstrip("0").rstrip(".")
    if DisplayText == "-0":
        DisplayText = "0"
    return DisplayText


def GenerateMmDistractors(CorrectAnswer: Decimal, Rng: random.Random, AllowNegative: bool = False) -> list[int | str]:
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

def GenerateFinancialDistractors(CorrectAnswer: Decimal, Rng: random.Random, Metadata: dict | None = None) -> list[int | str]:
    """Generate formula-aware financial distractors for Profit/Loss style questions.

    Generic +/- 0.1 distractors are too weak for money concepts. These
    candidates intentionally reflect common workbook mistakes: using the wrong
    profit/loss direction, using half/double percentage movement, confusing
    difference and percentage answers, and nearby rounded money values.
    """
    Metadata = Metadata if isinstance(Metadata, dict) else {}
    Candidates: list[Decimal] = []

    def AddCandidate(Value: Decimal | int | float | str | None) -> None:
        if Value is None:
            return
        try:
            Candidate = _QuantizeLike(Decimal(str(Value)), CorrectAnswer)
        except Exception:
            return
        if Candidate <= 0 or Candidate == CorrectAnswer:
            return
        if Candidate not in Candidates:
            Candidates.append(Candidate)

    CostPrice = Metadata.get("cost_price")
    SellingPrice = Metadata.get("selling_price")
    Percent = Metadata.get("percentage")
    PercentageType = str(Metadata.get("percentage_type") or "")
    AnswerKind = str(Metadata.get("answer_kind") or "")

    Cost = Decimal(str(CostPrice)) if CostPrice not in {None, ""} else None
    Selling = Decimal(str(SellingPrice)) if SellingPrice not in {None, ""} else None
    Rate = Decimal(str(Percent)) if Percent not in {None, ""} else None

    if Cost is not None and Selling is not None:
        Difference = abs(Selling - Cost)
        AddCandidate(Difference)
        if Cost > 0:
            AddCandidate(Difference / Cost * Decimal(100))
        if Selling > 0:
            AddCandidate(Difference / Selling * Decimal(100))

    if Cost is not None and Rate is not None:
        Change = Cost * Rate / Decimal(100)
        AddCandidate(Change)
        AddCandidate(Cost + Change)
        AddCandidate(Cost - Change)
        AddCandidate(Cost + (Cost * (Rate / Decimal(2)) / Decimal(100)))
        AddCandidate(Cost - (Cost * (Rate / Decimal(2)) / Decimal(100)))
        AddCandidate(Cost + (Cost * (Rate * Decimal(2)) / Decimal(100)))
        AddCandidate(Cost - (Cost * (Rate * Decimal(2)) / Decimal(100)))

    if Selling is not None and Rate is not None and Rate < 100:
        AddCandidate(Selling / (Decimal(1) + Rate / Decimal(100)))
        AddCandidate(Selling / (Decimal(1) - Rate / Decimal(100)))

    if AnswerKind.endswith("PERCENT") or CorrectAnswer <= Decimal(100):
        for Delta in [Decimal("1"), Decimal("2"), Decimal("5"), Decimal("-1"), Decimal("-2"), Decimal("-5")]:
            AddCandidate(CorrectAnswer + Delta)
    else:
        Step = Decimal("50") if CorrectAnswer >= Decimal("1000") else Decimal("10")
        for Multiplier in [1, -1, 2, -2, 5, -5]:
            AddCandidate(CorrectAnswer + Step * Decimal(Multiplier))

    Candidates.sort(key=lambda Candidate: abs(Candidate - CorrectAnswer))
    Selected = Candidates[:6]
    Rng.shuffle(Selected)
    return [_Display(Value) for Value in Selected[:3]] if len(Selected) >= 3 else GenerateMmDistractors(CorrectAnswer, Rng, False)

