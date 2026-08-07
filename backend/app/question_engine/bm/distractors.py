import random
from decimal import Decimal

from app.question_engine.smart_distractors import generate_smart_distractors


def generate_distractors(correct_answer: int, operands: list[int], rng: random.Random, allow_negative: bool = False) -> list[int]:
    """Vertical N-row Add/Less distractors -- same shared, generic
    (non-curriculum) smart_distractors utility every level uses.
    enforce_same_digit_count=True (matches PM-L1/L2/L3/L4): a visibly
    different-width distractor is guessable on sight with zero arithmetic.
    """
    decimal_operands = [Decimal(int(value)) for value in operands]
    selected = generate_smart_distractors(
        Decimal(int(correct_answer)),
        rng,
        "ADD_SUBTRACT",
        decimal_operands,
        allow_negative,
        enforce_same_digit_count=True,
    )
    return [int(value) for value in selected]


def generate_multiply_distractors(correct_answer: int, rng: random.Random) -> list[int]:
    """Concept Drill's ADD x TIMES teaser."""
    selected = generate_smart_distractors(
        Decimal(int(correct_answer)), rng, "MULTIPLY", [], False, enforce_same_digit_count=False,
    )
    return [int(value) for value in selected]


def generate_divide_distractors(from_value: int, less_value: int, correct_answer: int, rng: random.Random) -> list[int]:
    """Concept Drill's FROM/LESS repeated-subtraction-remainder teaser."""
    selected = generate_smart_distractors(
        Decimal(int(correct_answer)), rng, "DIVIDE",
        [Decimal(int(from_value)), Decimal(int(less_value))], False, enforce_same_digit_count=False,
    )
    return [int(value) for value in selected]


def generate_multiply_table_distractors(correct_answer: int, rng: random.Random) -> list[int]:
    """BM-L1's standalone "2D X 1D" DPS -- same MULTIPLY strategy as Concept
    Drill's teaser (off-by-one-multiple mistakes), no digit-count gate.
    """
    selected = generate_smart_distractors(
        Decimal(int(correct_answer)), rng, "MULTIPLY", [], False, enforce_same_digit_count=False,
    )
    return [int(value) for value in selected]


def generate_bodmas_distractors(correct_answer: int, rng: random.Random) -> list[int]:
    """BM-L1's BODMAS expressions -- same as PM-L3/L4's: no operand-specific
    structural mistake modelled in the shared utility for a multi-term
    expression shape, so this falls through to the generic digit-transpose/
    middle-digit-shift baseline.
    """
    selected = generate_smart_distractors(
        Decimal(int(correct_answer)), rng, "BODMAS", [], False, enforce_same_digit_count=False,
    )
    return [int(value) for value in selected]


def generate_divide_table_distractors(number: int, divisor: int, correct_answer: int, rng: random.Random) -> list[int]:
    """BM-L1's standalone exact-division DPS (2D÷1D or 3D÷1D) -- real exact
    division (a true quotient), same DIVIDE structural-mistake strategy
    (off-by-one quotient etc.) from the shared utility.
    """
    selected = generate_smart_distractors(
        Decimal(int(correct_answer)), rng, "DIVIDE",
        [Decimal(int(number)), Decimal(int(divisor))], False, enforce_same_digit_count=False,
    )
    return [int(value) for value in selected]


def generate_divide_remainder_distractors(
    quotient: int, remainder: int, divisor: int, rng: random.Random,
) -> list[str]:
    """BM-L1's "3D ÷ 1D WITH REMAINDER(S)" concept (Lessons 36-40) -- same
    approach as PM-L4's: no existing smart-distractor strategy models a
    paired quotient+remainder value, so this builds plausible wrong PAIRS
    directly: a wrong quotient (off by +/-1 or +/-2) paired with the correct
    remainder, the correct quotient paired with a wrong remainder (still
    kept in [0, divisor) so it still LOOKS like a valid remainder), and one
    pair with both wrong. Every distractor is formatted identically to the
    correct answer ("Q, R") and guaranteed distinct from it and from each
    other.
    """
    correct_pair = (quotient, remainder)
    seen_pairs = {correct_pair}
    candidates: list[tuple[int, int]] = []

    quotient_deltas = [-2, -1, 1, 2]
    rng.shuffle(quotient_deltas)
    remainder_deltas = [-2, -1, 1, 2]
    rng.shuffle(remainder_deltas)

    def _clamped_remainder(delta: int) -> int | None:
        candidate = remainder + delta
        if divisor <= 1:
            return None
        candidate %= divisor
        if candidate == remainder:
            return None
        return candidate

    # Wrong quotient, correct remainder.
    for delta in quotient_deltas:
        wrong_quotient = quotient + delta
        if wrong_quotient <= 0:
            continue
        pair = (wrong_quotient, remainder)
        if pair not in seen_pairs:
            candidates.append(pair)
            seen_pairs.add(pair)
        if len(candidates) >= 1:
            break

    # Correct quotient, wrong (but still valid-looking) remainder.
    for delta in remainder_deltas:
        wrong_remainder = _clamped_remainder(delta)
        if wrong_remainder is None:
            continue
        pair = (quotient, wrong_remainder)
        if pair not in seen_pairs:
            candidates.append(pair)
            seen_pairs.add(pair)
        if len([c for c in candidates if c[0] == quotient]) >= 1:
            break

    # Both wrong.
    for q_delta in quotient_deltas:
        for r_delta in remainder_deltas:
            wrong_quotient = quotient + q_delta
            wrong_remainder = _clamped_remainder(r_delta)
            if wrong_quotient <= 0 or wrong_remainder is None:
                continue
            pair = (wrong_quotient, wrong_remainder)
            if pair not in seen_pairs:
                candidates.append(pair)
                seen_pairs.add(pair)
                break
        if any(c[0] != quotient and c[1] != remainder for c in candidates):
            break

    # Fallback: fill up to 3 with any not-yet-used nearby quotient offsets
    # against the correct remainder, in case divisor is too small (e.g.
    # divisor=2) for enough distinct remainder variants above.
    offset = 3
    guard = 0
    while len(candidates) < 3 and guard < 50:
        guard += 1
        for wrong_quotient in (quotient + offset, quotient - offset):
            if wrong_quotient <= 0:
                continue
            pair = (wrong_quotient, remainder)
            if pair not in seen_pairs:
                candidates.append(pair)
                seen_pairs.add(pair)
            if len(candidates) >= 3:
                break
        offset += 1

    return [f"{q}, {r}" for q, r in candidates[:3]]
