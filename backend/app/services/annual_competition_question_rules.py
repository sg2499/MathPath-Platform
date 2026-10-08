"""Annual Competition question rules -- 2026-10-07 build (Shailesh).

"now we need to make the following changes for the annual competition
question engine ... these need to be pristine, accurate and exact without
any issues or bugs, non negotiable."

Everything here is ANNUAL-COMPETITION-ONLY (official and practice papers
alike) and follows the same "build separately" rule as the rest of the
Annual Competition engine: nothing in this file is imported by, or changes
the output of, the module engines that also feed practice sheets, mocks and
term assessments.

Three things live here:

1. An abacus bead model and a sum builder (BuildBeadSumQuestion). The
   module engines for Bloomers / Beginners / PM-1 / PM-2 build 3-row sums
   from fixed lesson templates whose second and third rows are almost
   always a single digit, so the shapes asked for on 2026-10-07 --
   "12+55-50", "2d 3 rows + 1d 2 rows", "2d+2d+2d+2d", "3d 3 rows",
   "2d 2rows + 3d 1row" -- cannot come out of them at all. This builder
   takes a row-width shape and a set of allowed bead techniques and
   constructs a sum column by column, so every single bead move in it is
   one the level has been taught.

2. NeverBelowZero: "Remove negative numbers in the start of the sum, no
   borrowing sums" (IM-1, IM-2 visual). In this curriculum a "borrowing
   sum" is one whose running total drops below zero (the IM sheets are
   literally titled "Borrowing Sums with Negative Answers"), so the rule is:
   the first number is never negative and the running total is never below
   zero at any step.

3. MM-1's own decimal multiplication, decimal division and percentage
   patterns ("24.16 x 0.04", "81.37 / 8", "97.03 x 29%", "70.37 - 81%").
   The Master Module engine's own decimal patterns are different ones
   (0.096 x 11, 85.8 / 39, whole-number percentages in steps of 5) and are
   left exactly as they are for MM-2 and for every non-competition flow.
"""
from __future__ import annotations

import random
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from app.question_engine.mm.distractors import GenerateMmDistractors
from app.question_engine.option_utils import build_mcq_options
from app.question_engine.pm.distractors import generate_distractors as _GenerateWholeNumberDistractors

# ---------------------------------------------------------------------------
# 1. The abacus bead model
#
# One rod holds a digit 0-9 as lower beads (worth 1 each, four of them) plus
# one upper bead (worth 5). A move on a rod is one of:
#
#   DIRECT  the beads just move: there are enough free lower beads and, if a
#           5 is involved, the upper bead is free (adding) or set (taking
#           away). 2+2, 3+5, 1+7, 9-6, 7-7.
#   COMP5   "small friends": +d done as +5 -(5-d), or -d as -5 +(5-d).
#           4+1, 3+4, 5-1, 6-3.
#   COMP10  "big friends": +d done as +10 -(10-d), or -d as -10 +(10-d),
#           where the -(10-d) / +(10-d) part is itself a direct move.
#           8+7 (+10 -3), 9+1, 12-9 (-10 +1).
#
# A move that needs big friends AND small friends at once (6+7 is +10 -3 but
# the -3 on a 6 is itself -5 +2; 13-6 is -10 +4 but +4 on a 3 is +5 -1) is a
# "mixed friends" move. It is never produced here (Shailesh, 2026-10-07:
# default accepted, PM-1 / PM-2 do not use them).
#
# The carry of a COMP10 move (+1 on the next rod) and its borrow (-1) are
# real bead moves too, so they are classified the same way and counted.
# ---------------------------------------------------------------------------
MOVE_DIRECT = "DIRECT"
MOVE_COMP5 = "COMP5"
MOVE_COMP10 = "COMP10"

MOVE_LABELS = {
    MOVE_DIRECT: "Direct Add-Less",
    MOVE_COMP5: "Complement of 5",
    MOVE_COMP10: "Complement of 10",
}


def IsDirectAdd(CurrentDigit: int, Digit: int) -> bool:
    """True when +Digit on a rod showing CurrentDigit needs no formula."""
    if not (1 <= Digit <= 9) or CurrentDigit + Digit > 9:
        return False
    return (CurrentDigit % 5) + (Digit % 5) <= 4 and (Digit < 5 or CurrentDigit < 5)


def IsDirectSub(CurrentDigit: int, Digit: int) -> bool:
    """True when -Digit on a rod showing CurrentDigit needs no formula."""
    if not (1 <= Digit <= 9) or CurrentDigit - Digit < 0:
        return False
    return (CurrentDigit % 5) >= (Digit % 5) and (Digit < 5 or CurrentDigit >= 5)


def _DigitAt(Value: int, Place: int) -> int:
    return (Value // (10 ** Place)) % 10


def _CarryMoves(Value: int, Place: int) -> set[str]:
    """Bead moves needed to add 1 on the rod at Place (a COMP10 carry)."""
    CurrentDigit = _DigitAt(Value, Place)
    if CurrentDigit <= 8:
        return {MOVE_DIRECT} if IsDirectAdd(CurrentDigit, 1) else {MOVE_COMP5}
    # 9 + 1: add 10, less 9 (taking 9 off a 9 is direct), and carry on.
    return {MOVE_COMP10} | _CarryMoves(Value, Place + 1)


def _BorrowMoves(Value: int, Place: int) -> set[str]:
    """Bead moves needed to take 1 off the rod at Place (a COMP10 borrow).
    The caller guarantees Value >= 10 ** Place, so a rod to borrow from
    always exists."""
    CurrentDigit = _DigitAt(Value, Place)
    if CurrentDigit >= 1:
        return {MOVE_DIRECT} if IsDirectSub(CurrentDigit, 1) else {MOVE_COMP5}
    # 0 - 1: less 10, add 9 (putting 9 on an empty rod is direct), borrow on.
    return {MOVE_COMP10} | _BorrowMoves(Value, Place + 1)


def ClassifyDigitMove(Value: int, Place: int, Digit: int, Sign: int) -> set[str] | None:
    """The bead moves needed to add (Sign > 0) or take away (Sign < 0) Digit
    on the rod at Place of an abacus showing Value.

    Returns an empty set for a zero digit (nothing moves), and None when the
    move is impossible (would go below zero) or needs mixed friends.
    """
    if Digit == 0:
        return set()
    CurrentDigit = _DigitAt(Value, Place)
    if Sign > 0:
        if CurrentDigit + Digit <= 9:
            return {MOVE_DIRECT} if IsDirectAdd(CurrentDigit, Digit) else {MOVE_COMP5}
        if not IsDirectSub(CurrentDigit, 10 - Digit):
            return None  # mixed friends
        return {MOVE_COMP10} | _CarryMoves(Value, Place + 1)
    if Value < Digit * (10 ** Place):
        return None  # would go below zero
    if CurrentDigit >= Digit:
        return {MOVE_DIRECT} if IsDirectSub(CurrentDigit, Digit) else {MOVE_COMP5}
    if not IsDirectAdd(CurrentDigit, 10 - Digit):
        return None  # mixed friends
    return {MOVE_COMP10} | _BorrowMoves(Value, Place + 1)


def ClassifyRowMove(Value: int, Operand: int) -> set[str] | None:
    """The bead moves needed to apply one row (a signed whole number) to an
    abacus showing Value, worked the way it is taught: highest rod first.
    None when the row cannot be applied with taught moves."""
    if Operand == 0:
        return set()
    Sign = 1 if Operand > 0 else -1
    Magnitude = abs(Operand)
    if Sign < 0 and Magnitude > Value:
        return None
    Moves: set[str] = set()
    Current = Value
    for Place in reversed(range(len(str(Magnitude)))):
        Digit = _DigitAt(Magnitude, Place)
        if Digit == 0:
            continue
        DigitMoves = ClassifyDigitMove(Current, Place, Digit, Sign)
        if DigitMoves is None:
            return None
        Moves |= DigitMoves
        Current += Sign * Digit * (10 ** Place)
    return Moves


def TraceBeadSum(Operands: list[int]) -> tuple[bool, list[set[str]]]:
    """(every row is a taught move and the total never drops below zero,
    the moves used by each row after the first)."""
    if not Operands or int(Operands[0]) <= 0:
        return False, []
    Current = int(Operands[0])
    Trace: list[set[str]] = []
    for Operand in Operands[1:]:
        Moves = ClassifyRowMove(Current, int(Operand))
        if Moves is None:
            return False, Trace
        Trace.append(Moves)
        Current += int(Operand)
        if Current < 0:
            return False, Trace
    return True, Trace


# Which techniques a sum may use, and which it must show at least once.
# DIRECT sums use nothing else; FIVE sums are direct + small friends with
# at least one small-friends move; TEN the same for big friends; ALL must
# show both.
BEAD_PROFILES: dict[str, dict[str, Any]] = {
    "DIRECT": {"allowed": {MOVE_DIRECT}, "required": set(), "conceptFamily": "DIRECT_ADD_LESS"},
    "FIVE": {"allowed": {MOVE_DIRECT, MOVE_COMP5}, "required": {MOVE_COMP5}, "conceptFamily": "COMPLEMENT_OF_5"},
    "TEN": {"allowed": {MOVE_DIRECT, MOVE_COMP10}, "required": {MOVE_COMP10}, "conceptFamily": "COMPLEMENT_OF_10"},
    "ALL": {"allowed": {MOVE_DIRECT, MOVE_COMP5, MOVE_COMP10}, "required": {MOVE_COMP5, MOVE_COMP10}, "conceptFamily": "MIXED_REVISION"},
}

_BEAD_SUM_BUILD_ATTEMPTS = 600
_NEGATIVE_ROW_CHANCE = 0.45
_ZERO_DIGIT_WEIGHT = 0.3
_NEEDED_MOVE_WEIGHT = 5.0


def _BuildBeadRow(
    Rng: random.Random, Value: int, Width: int, Sign: int, Allowed: set[str], StillNeeded: set[str], MaxTotal: int
) -> tuple[int, set[str]] | None:
    """One row of exactly Width digits, built highest rod first, every digit
    chosen from the ones whose bead move is allowed at that moment."""
    Current = Value
    Magnitude = 0
    Moves: set[str] = set()
    ZeroDigits = 0
    for Place in reversed(range(Width)):
        Candidates: list[tuple[int, set[str]]] = []
        Weights: list[float] = []
        for Digit in range(0, 10):
            if Digit == 0 and Place == Width - 1:
                continue  # a row of Width digits never starts with 0
            if Digit == 0 and Width >= 3 and ZeroDigits >= 1:
                continue  # 305 and 340 are sums; 300 is not
            Step = Digit * (10 ** Place)
            if Sign > 0 and Current + Step > MaxTotal:
                continue
            if Sign < 0 and Step > Current:
                continue
            DigitMoves = ClassifyDigitMove(Current, Place, Digit, Sign)
            if DigitMoves is None or not DigitMoves <= Allowed:
                continue
            Candidates.append((Digit, DigitMoves))
            if Digit == 0:
                Weights.append(_ZERO_DIGIT_WEIGHT)
            elif DigitMoves & (StillNeeded - Moves):
                Weights.append(_NEEDED_MOVE_WEIGHT)
            else:
                Weights.append(1.0)
        if not Candidates:
            return None
        Digit, DigitMoves = Rng.choices(Candidates, weights=Weights, k=1)[0]
        if Digit == 0:
            ZeroDigits += 1
        Moves |= DigitMoves
        Magnitude += Digit * (10 ** Place)
        Current += Sign * Digit * (10 ** Place)
    return Sign * Magnitude, Moves


def BuildBeadSum(
    Rng: random.Random, Shape: list[int], Profile: str, MaxTotal: int
) -> tuple[list[int], list[set[str]]] | None:
    """A sum whose rows have exactly the digit widths in Shape (in that
    order), using only the profile's bead techniques, showing each required
    technique at least once, never below zero and never above MaxTotal.
    The answer is never zero, no row undoes an earlier row, and the running
    total never stands at the same value twice.

    Returns (signed rows, moves used by each row after the first), or None
    if this random source could not finish one -- the caller simply retries
    with its next seed.
    """
    ProfileSpec = BEAD_PROFILES[Profile]
    Allowed: set[str] = ProfileSpec["allowed"]
    Required: set[str] = ProfileSpec["required"]
    for _Attempt in range(_BEAD_SUM_BUILD_ATTEMPTS):
        FirstWidth = int(Shape[0])
        First = Rng.randint(10 ** (FirstWidth - 1), min(MaxTotal, (10 ** FirstWidth) - 1))
        if FirstWidth >= 3 and str(First).count("0") > 1:
            continue
        Rows = [First]
        Totals = [First]
        Trace: list[set[str]] = []
        Seen: set[str] = set()
        Current = First
        Failed = False
        for Width in Shape[1:]:
            Width = int(Width)
            Smallest = 10 ** (Width - 1)
            CanAdd = Current + Smallest <= MaxTotal
            CanSubtract = Current >= Smallest
            if not CanAdd and not CanSubtract:
                Failed = True
                break
            if CanAdd and CanSubtract:
                Sign = -1 if Rng.random() < _NEGATIVE_ROW_CHANCE else 1
            else:
                Sign = 1 if CanAdd else -1
            Built = _BuildBeadRow(Rng, Current, Width, Sign, Allowed, Required - Seen, MaxTotal)
            if Built is None and CanAdd and CanSubtract:
                Built = _BuildBeadRow(Rng, Current, Width, -Sign, Allowed, Required - Seen, MaxTotal)
            if Built is None:
                Failed = True
                break
            Row, Moves = Built
            Current += Row
            # Sums that answer themselves are not competition sums:
            #   a total that comes back to zero ("21 - 21 + 3", "4 - 2 - 2"),
            #   a row that undoes an earlier one ("35 + 4 - 35", "9 - 5 + 5"),
            #   a total the sum has already stood at ("80 + 14 - 14").
            #   and a row of two or more digits is never the same number as
            #   an earlier row ("27 + 32 + 20 + 20"); single digits may
            #   repeat, as in his own "5+2+2".
            RepeatsLongRow = abs(Row) >= 10 and any(abs(Earlier) == abs(Row) for Earlier in Rows)
            if Current == 0 or -Row in Rows or Current in Totals or RepeatsLongRow:
                Failed = True
                break
            Rows.append(Row)
            Totals.append(Current)
            Trace.append(Moves)
            Seen |= Moves
        if Failed or not Required <= Seen:
            continue
        if len(set(abs(Row) for Row in Rows)) == 1 and len(Rows) > 2:
            continue  # 3 + 3 + 3
        return Rows, Trace
    return None


def BuildBeadSumQuestion(Spec: dict[str, Any], Seed: str) -> dict[str, Any] | None:
    """One stacked add/less question for a registry entry carrying
    beadShape / beadProfile / beadMaxTotal -- shaped exactly like the
    YLM and PM engines' own question dicts (signed operands, "+" / "-"
    operators, VERTICAL display) so every screen that already shows those
    shows this."""
    Rng = random.Random(Seed)
    Shape = [int(Width) for Width in Spec["beadShape"]]
    Profile = str(Spec["beadProfile"])
    MaxTotal = int(Spec.get("beadMaxTotal") or 999)
    Built = BuildBeadSum(Rng, Shape, Profile, MaxTotal)
    if Built is None:
        return None
    Rows, Trace = Built
    Valid, CheckedTrace = TraceBeadSum(Rows)
    if not Valid or CheckedTrace != Trace:
        return None  # belt and braces: the independent check must agree
    CorrectAnswer = sum(Rows)
    Distractors = _GenerateWholeNumberDistractors(CorrectAnswer, Rows, Rng, False)
    UsedMoves = [Move for Move in (MOVE_DIRECT, MOVE_COMP5, MOVE_COMP10) if any(Move in Moves for Moves in Trace)]
    Running = Rows[0]
    ConceptTrace = []
    for RowNumber, (Row, Moves) in enumerate(zip(Rows[1:], Trace), start=2):
        ConceptTrace.append({
            "row_number": RowNumber, "before": Running, "operand": Row, "after": Running + Row,
            "concept_tags": sorted(Moves), "concept_labels": [MOVE_LABELS[Move] for Move in sorted(Moves)],
        })
        Running += Row
    return {
        "question_number": 1,
        "display_type": "VERTICAL",
        "operands": Rows,
        "operators": ["+" if Row >= 0 else "-" for Row in Rows],
        "correct_answer": CorrectAnswer,
        "options": build_mcq_options(CorrectAnswer, Distractors, Rng),
        "seed": Seed,
        "metadata": {
            "concept_family": BEAD_PROFILES[Profile]["conceptFamily"],
            "operation_focus": "ADD_LESS",
            "generation_template": "ANNUAL_BEAD_SUM",
            "annual_bead_shape": Shape,
            "annual_bead_profile": Profile,
            "rows": len(Rows),
            "concept_tags": UsedMoves,
            "concept_labels": [MOVE_LABELS[Move] for Move in UsedMoves],
            "primary_concept_tag": UsedMoves[-1] if UsedMoves else MOVE_DIRECT,
            "primary_concept_label": MOVE_LABELS[UsedMoves[-1]] if UsedMoves else MOVE_LABELS[MOVE_DIRECT],
            "concept_validated": True,
            "concept_trace": ConceptTrace,
        },
    }


# ---------------------------------------------------------------------------
# 2. "No negative start, no borrowing"
# ---------------------------------------------------------------------------
def SignedRowsOf(Operands: Any, Operators: Any) -> list[Decimal] | None:
    """A stacked add/less question's rows as signed numbers, whichever of
    the two storage conventions it uses: signed operands (YLM / PM / MM),
    or positive magnitudes with the sign carried by the operator (IM)."""
    if not isinstance(Operands, (list, tuple)) or not Operands:
        return None
    OperatorList = list(Operators or [])
    Rows: list[Decimal] = []
    for Index, Operand in enumerate(Operands):
        try:
            Number = Decimal(str(Operand).strip())
        except Exception:  # noqa: BLE001 -- not a number: not a stacked sum
            return None
        Operator = str(OperatorList[Index]).strip() if Index < len(OperatorList) else ""
        if Index > 0 and Operator == "-" and Number > 0:
            Number = -Number
        Rows.append(Number)
    return Rows


def StartsNegativeOrDipsBelowZero(Operands: Any, Operators: Any) -> bool:
    """True when the first number is negative or the running total is below
    zero after any row. False for anything that is not a stacked sum."""
    Rows = SignedRowsOf(Operands, Operators)
    if not Rows:
        return False
    if Rows[0] < 0:
        return True
    Running = Decimal(0)
    for Row in Rows:
        Running += Row
        if Running < 0:
            return True
    return False


def IsSelfCancellingSum(Operands: Any, Operators: Any) -> bool:
    """2026-10-08: a stacked sum that answers itself -- the answer is zero
    ("75 - 25 - 50"), a row undoes an earlier row ("23 - 23 + 10"), or the
    running total comes back to a value it already stood at ("80 + 14 - 14").
    The sums this module builds never take these shapes; this lets the
    collector refuse them from the module engines too. False for anything
    that is not a stacked sum."""
    Rows = SignedRowsOf(Operands, Operators)
    if not Rows or len(Rows) < 2:
        return False
    Totals: list[Decimal] = []
    Running = Decimal(0)
    for Index, Row in enumerate(Rows):
        if Index > 0 and -Row in Rows[:Index]:
            return True
        Running += Row
        if Running in Totals:
            return True
        Totals.append(Running)
    return Running == 0


# ---------------------------------------------------------------------------
# 3. MM-1's own decimal multiplication / decimal division / percentage
# ---------------------------------------------------------------------------
_MULTIPLY = "×"
_DIVIDE = "÷"
_ADD_PERCENT = "×%"
_LESS_PERCENT = "-%"


def _PlainDecimalText(Value: Decimal) -> str:
    Text = format(Value, "f")
    if "." in Text:
        Text = Text.rstrip("0").rstrip(".")
    return Text or "0"


def _TwoDecimalNumber(Rng: random.Random, WholeDigits: int) -> Decimal:
    """A number with exactly WholeDigits before the point and two after,
    whose last decimal is never 0 -- so 24.16, never 24.10 or 24.00."""
    Low = 10 ** (WholeDigits - 1) * 100
    High = (10 ** WholeDigits) * 100 - 1
    while True:
        Hundredths = Rng.randint(Low, High)
        if Hundredths % 10 != 0:
            return Decimal(Hundredths) / Decimal(100)


def _DecimalQuestion(
    *, Operands: list[Any], Operator: str, CorrectAnswer: Decimal, Rng: random.Random, Seed: str,
    Operation: str, NumericOperands: list[Decimal], Metadata: dict[str, Any],
) -> dict[str, Any]:
    CorrectDisplay = _PlainDecimalText(CorrectAnswer)
    Distractors = GenerateMmDistractors(Decimal(CorrectDisplay), Rng, False, Operation, NumericOperands)
    return {
        "question_number": 1,
        "display_type": "EXPRESSION_WORKSHEET",
        "operands": Operands,
        "operators": ["", Operator],
        "correct_answer": CorrectDisplay,
        "options": build_mcq_options(CorrectDisplay, [str(Value) for Value in Distractors], Rng),
        "seed": Seed,
        "metadata": {"generation_template": "ANNUAL_MM1_DECIMAL", "annual_validated": True, **Metadata},
    }


def BuildDecimalMultiplicationQuestion(Spec: dict[str, Any], Seed: str) -> dict[str, Any] | None:
    """NN.NN x 0.0N ("24.16 x 0.04") or NNN.NN x 0.0N ("231.15 x 0.08").
    The answer is the exact product."""
    Rng = random.Random(Seed)
    WholeDigits = int(Spec["decimalWholeDigits"])
    Left = _TwoDecimalNumber(Rng, WholeDigits)
    Factor = Rng.randint(2, 9)
    Right = Decimal(Factor) / Decimal(100)
    Answer = Left * Right
    return _DecimalQuestion(
        Operands=[f"{Left:.2f}", f"{Right:.2f}"], Operator=_MULTIPLY, CorrectAnswer=Answer, Rng=Rng, Seed=Seed,
        Operation="MULTIPLICATION", NumericOperands=[Left, Right],
        Metadata={
            "concept_family": "DECIMAL_MULTIPLICATION", "operation_focus": "MULTIPLICATION",
            "left_digits": WholeDigits + 2, "right_digits": 1, "decimal_places": 4,
            "decimal_pattern_rule": "TWO_DECIMALS_TIMES_HUNDREDTHS",
        },
    )


def BuildDecimalDivisionQuestion(Spec: dict[str, Any], Seed: str) -> dict[str, Any] | None:
    """NN.NN / N ("81.36 / 8") or NNN.NN / N ("110.32 / 4"). The numbers
    are chosen so the answer is exact at two decimals -- no rounding for a
    child to argue about (Shailesh, 2026-10-07: default accepted)."""
    Rng = random.Random(Seed)
    WholeDigits = int(Spec["decimalWholeDigits"])
    Low = 10 ** (WholeDigits - 1) * 100
    High = (10 ** WholeDigits) * 100 - 1
    for _Attempt in range(200):
        Divisor = Rng.randint(2, 9)
        QuotientHundredths = Rng.randint(-(-Low // Divisor), High // Divisor)
        DividendHundredths = QuotientHundredths * Divisor
        if not (Low <= DividendHundredths <= High) or DividendHundredths % 10 == 0:
            continue
        if QuotientHundredths % 100 == 0:
            continue  # a whole-number answer is not a decimal division sum
        Dividend = Decimal(DividendHundredths) / Decimal(100)
        Answer = Decimal(QuotientHundredths) / Decimal(100)
        return _DecimalQuestion(
            Operands=[f"{Dividend:.2f}", Divisor], Operator=_DIVIDE, CorrectAnswer=Answer, Rng=Rng, Seed=Seed,
            Operation="DIVISION", NumericOperands=[Dividend, Decimal(Divisor)],
            Metadata={
                "concept_family": "DECIMAL_DIVISION", "operation_focus": "DIVISION",
                "dividend_digits": WholeDigits + 2, "divisor_digits": 1, "dividend_decimal_places": 2,
                "divisor_decimal_places": 0, "decimal_pattern_rule": "TWO_DECIMALS_BY_SINGLE_DIGIT_EXACT",
            },
        )
    return None


def BuildPercentageQuestion(Spec: dict[str, Any], Seed: str) -> dict[str, Any] | None:
    """Add Percentage: "97.03 x 29%" -- 29% of 97.03. Less Percentage:
    "70.37 - 81%" -- 70.37 less 81% of itself. A two-decimal base (NN.NN or
    N.NN), a two-digit percent that is not a round ten, and the answer
    rounded to two decimals, half up -- the Master Module's own percentage
    rounding rule."""
    Rng = random.Random(Seed)
    WholeDigits = int(Spec["decimalWholeDigits"])
    Mode = str(Spec["percentageMode"])
    Base = _TwoDecimalNumber(Rng, WholeDigits)
    while True:
        Percent = Rng.randint(11, 99)
        if Percent % 10 != 0:
            break
    Portion = Base * Decimal(Percent) / Decimal(100)
    Exact = Portion if Mode == "ADD_PERCENTAGE" else Base - Portion
    Answer = Exact.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    Operator = _ADD_PERCENT if Mode == "ADD_PERCENTAGE" else _LESS_PERCENT
    return _DecimalQuestion(
        Operands=[f"{Base:.2f}", Percent], Operator=Operator, CorrectAnswer=Answer, Rng=Rng, Seed=Seed,
        Operation="GENERIC", NumericOperands=[Base, Decimal(Percent)],
        Metadata={
            "concept_family": "PERCENTAGE_ADD_LESS", "operation_focus": "PERCENTAGE",
            "percentage_mode": Mode, "base_amount": f"{Base:.2f}", "percentage_operator": Operator,
            "percentage_workbook_rule": "BASE_TIMES_PERCENT" if Mode == "ADD_PERCENTAGE" else "BASE_LESS_PERCENT",
            "two_part_only": True, "answer_decimal_places": 2,
        },
    )


# ---------------------------------------------------------------------------
# 4. 2026-10-08 (Shailesh, after a student's complaint on an MM-2 practice
#    paper): "in abacus sections they get to use a tool which is abacus but
#    in visual sections it is complete visualisation so the add/less
#    (visual) sections need to be simpler and less complicated than the
#    abacus sections and for the abacus sections also complication does not
#    mean that it'll be immense and unattainable but within the rules and
#    guidelines of the particular level paper".
# ---------------------------------------------------------------------------
def _WholeNumberStackQuestion(Rows: list[int], Seed: str, Rng: random.Random, Metadata: dict[str, Any]) -> dict[str, Any]:
    CorrectAnswer = sum(Rows)
    Distractors = GenerateMmDistractors(Decimal(CorrectAnswer), Rng, CorrectAnswer < 0, "ADD_SUBTRACT", [Decimal(Row) for Row in Rows])
    return {
        "question_number": 1,
        "display_type": "VERTICAL",
        "operands": Rows,
        "operators": ["" if Index == 0 else ("+" if Row >= 0 else "-") for Index, Row in enumerate(Rows)],
        "correct_answer": CorrectAnswer,
        "options": build_mcq_options(CorrectAnswer, [int(Value) for Value in Distractors], Rng),
        "seed": Seed,
        "metadata": {"annual_validated": True, "row_count": len(Rows), **Metadata},
    }


def BuildFourDigitBorrowingQuestion(Spec: dict[str, Any], Seed: str) -> dict[str, Any] | None:
    """"Add/Less 4D 3R (Abacus) - Borrowing, Positive/Negative Answers"
    (IM-4, MM-1, MM-2), kept to its own name: three rows, every row exactly
    four digits.

    The Master Module engine's version of this section made the last row
    big enough to force a negative answer, so 44% of its sums carried a
    five-digit row (4625 + 6450 - 15875). Built here instead, three kinds,
    each with its own share of the section (see the registry):
      NEGATIVE  a + b - c, c larger than a + b, so the answer is negative
                (rows in steps of 25, as the engine's own negative-answer
                sums were: 2350 + 4125 - 7900 = -1425)
      DIP       a - b + c, b larger than a, so the total goes below zero and
                comes back: borrowing with a positive answer
                (2361 - 6194 + 7480 = 3647)
      PLAIN     a + b - c with a positive answer (5734 + 2816 - 3459 = 5091)
    Every answer has at most four digits.
    """
    Rng = random.Random(Seed)
    Kind = str(Spec["borrowingKind"])
    for _Attempt in range(200):
        if Kind == "NEGATIVE":
            A = Rng.randrange(1000, 4476, 25)
            B = Rng.randrange(1000, 4476, 25)
            if A + B > 8900:
                continue
            C = Rng.randrange(A + B + 100, 9976, 25)
            Rows = [A, B, -C]
        elif Kind == "DIP":
            A = Rng.randint(1000, 8000)
            B = Rng.randint(A + 100, 9999)
            C = Rng.randint(B - A + 100, min(9999, B - A + 9999))
            Rows = [A, -B, C]
        else:
            A = Rng.randint(1000, 9999)
            B = Rng.randint(1000, 9999)
            C = Rng.randint(max(1000, A + B - 9999), min(9999, A + B - 100))
            Rows = [A, B, -C]
        if not all(1000 <= abs(Row) <= 9999 for Row in Rows):
            continue
        Answer = sum(Rows)
        if Answer == 0 or abs(Answer) > 9999:
            continue
        if (Kind == "NEGATIVE") != (Answer < 0):
            continue
        if len({abs(Row) for Row in Rows}) < 3:
            continue
        return _WholeNumberStackQuestion(Rows, Seed, Rng, {
            "concept_family": "ADD_LESS", "operation_focus": "ADD_LESS",
            "generation_template": "ANNUAL_4D_3R_BORROWING", "borrowing_kind": Kind,
            "borrowing_answer_mode": "NEGATIVE" if Answer < 0 else "POSITIVE",
        })
    return None


def BuildLightDecimalVisualQuestion(Spec: dict[str, Any], Seed: str) -> dict[str, Any] | None:
    """MM-1 / MM-2 "Decimal Add-Less (Visual)": lighter than the level's
    abacus section on every count -- three rows (the abacus has three), every
    number N.NN or NN.NN (at most four digits, like the abacus's four-digit
    rows; still two decimals, per the 7 Oct note), the first number never
    negative and the running total never below zero, so the answer is at
    most NNN.NN. Before 8 Oct this section had 3 to 4 rows of NNN.NN and
    answers up to six digits (746.19 + 45.49 + 938.64 - 52.97 = 1677.35).
    """
    Rng = random.Random(Seed)
    RowCount = int(Spec.get("decimalVisualRows") or 3)
    TwoDigitShare = float(Spec.get("twoDigitWholeShare") or 0.6)
    for _Attempt in range(200):
        Rows: list[Decimal] = []
        Running = Decimal(0)
        Failed = False
        for Index in range(RowCount):
            WholeDigits = 2 if Rng.random() < TwoDigitShare else 1
            Low = 10 ** (WholeDigits - 1) * 100
            High = (10 ** WholeDigits) * 100 - 1
            Hundredths = Rng.randint(Low, High)
            if Hundredths % 100 == 0:
                Failed = True  # 47.00 is a whole number, not a decimal sum
                break
            Value = Decimal(Hundredths) / Decimal(100)
            Subtract = Index > 0 and Rng.random() < 0.4 and Value < Running
            Row = -Value if Subtract else Value
            if any(abs(Earlier) == Value for Earlier in Rows):
                Failed = True  # a row never repeats or undoes an earlier one
                break
            Rows.append(Row)
            Running += Row
            if Running <= 0:
                Failed = True
                break
        if Failed or not any(Row < 0 for Row in Rows[1:]) and Rng.random() < 0.5:
            continue
        if not any(len(str(abs(Row)).split(".")[0]) == 2 for Row in Rows):
            continue  # at least one NN.NN row in every sum
        Answer = sum(Rows)
        if Answer == Answer.to_integral_value():
            continue  # a decimal sum whose answer is a whole number reads as a trick
        return {
            "question_number": 1,
            "display_type": "VERTICAL",
            "operands": [f"{Rows[0]:.2f}"] + [f"{abs(Row):.2f}" for Row in Rows[1:]],
            "operators": [""] + ["+" if Row >= 0 else "-" for Row in Rows[1:]],
            "correct_answer": _PlainDecimalText(Answer),
            "options": build_mcq_options(
                _PlainDecimalText(Answer),
                [str(Value) for Value in GenerateMmDistractors(Answer, Rng, False, "ADD_SUBTRACT", list(Rows))],
                Rng,
            ),
            "seed": Seed,
            "metadata": {
                "concept_family": "DECIMAL_ADD_LESS", "operation_focus": "ADD_LESS",
                "generation_template": "ANNUAL_LIGHT_DECIMAL_VISUAL", "decimal_places": 2,
                "row_count": RowCount, "annual_validated": True,
            },
        }
    return None


_ANNUAL_RULE_BUILDERS = {
    "BEAD_SUM": BuildBeadSumQuestion,
    "DECIMAL_MULTIPLICATION": BuildDecimalMultiplicationQuestion,
    "DECIMAL_DIVISION": BuildDecimalDivisionQuestion,
    "PERCENTAGE": BuildPercentageQuestion,
    "FOUR_DIGIT_BORROWING": BuildFourDigitBorrowingQuestion,
    "LIGHT_DECIMAL_VISUAL": BuildLightDecimalVisualQuestion,
}


def GenerateAnnualRuleQuestion(Spec: dict[str, Any], Seed: str) -> dict[str, Any] | None:
    Kind = str(Spec.get("annualRuleKind") or "")
    Builder = _ANNUAL_RULE_BUILDERS.get(Kind)
    if Builder is None:
        raise ValueError(f"Annual Competition question rules do not support annualRuleKind: {Kind!r}")
    return Builder(Spec, Seed)


# ---------------------------------------------------------------------------
# Mixing: "Mix the patterns don't keep single digit sums together. Mix all
# the patterns and present", "now it is multiply with 2 then 3 then 4
# serially change the order".
# ---------------------------------------------------------------------------
def _MixIsStillPossible(Remaining: dict[str, int], LastKey: str | None, RunLength: int, MaxRun: int) -> bool:
    """Can the patterns still left be laid out with no run above MaxRun,
    given the pattern just placed and how long its run already is?"""
    Total = sum(Remaining.values())
    for Key, Count in Remaining.items():
        if Count <= 0:
            continue
        Others = Total - Count
        Room = MaxRun * Others + (MaxRun - RunLength if Key == LastKey else MaxRun)
        if Count > Room:
            return False
    return True


def MixSchedule(Schedule: list[dict[str, Any]], Rng: random.Random, MaxRun: int) -> list[dict[str, Any]]:
    """Schedule's own entries, same counts, in a mixed order in which no
    pattern (an entry's mixKey, else its title) runs for more than MaxRun
    questions in a row -- whenever the counts make that possible at all.

    Each next pattern is drawn at random, weighted by how many of it are
    left, from the patterns that keep the limit reachable for everything
    still to come.
    """
    def KeyOf(Entry: dict[str, Any]) -> str:
        return str(Entry.get("mixKey") or Entry.get("title") or "")

    Buckets: dict[str, list[dict[str, Any]]] = {}
    for Entry in Schedule:
        Buckets.setdefault(KeyOf(Entry), []).append(Entry)
    for Entries in Buckets.values():
        Rng.shuffle(Entries)
    MaxRun = max(1, int(MaxRun))
    Remaining = {Key: len(Entries) for Key, Entries in Buckets.items()}
    Mixed: list[dict[str, Any]] = []
    LastKey: str | None = None
    RunLength = 0
    while sum(Remaining.values()) > 0:
        Open = [Key for Key, Count in Remaining.items() if Count > 0]
        Allowed = [Key for Key in Open if not (Key == LastKey and RunLength >= MaxRun)]
        Safe = []
        for Key in Allowed:
            After = dict(Remaining)
            After[Key] -= 1
            if _MixIsStillPossible(After, Key, RunLength + 1 if Key == LastKey else 1, MaxRun):
                Safe.append(Key)
        # Safe is only ever empty when the counts never allowed the limit
        # (one pattern outnumbers all the others put together too heavily):
        # then the order is simply as mixed as it can be.
        Choices = Safe or Allowed or Open
        Key = Rng.choices(Choices, weights=[Remaining[Choice] for Choice in Choices], k=1)[0]
        Mixed.append(Buckets[Key].pop())
        Remaining[Key] -= 1
        RunLength = RunLength + 1 if Key == LastKey else 1
        LastKey = Key
    return Mixed
