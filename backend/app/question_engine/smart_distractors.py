"""Shared "smart" MCQ distractor engine used by MM, IM, and YLM.

Why this exists: a wrong option is only a genuine test of whether the
student actually solved the problem if it can't be eliminated by a mental
shortcut that's faster than solving it. The most common shortcut in
arithmetic is checking just the correct answer's last digit -- units-column
addition, a single multiplication-table lookup, a known-impossible square
ending -- which is real, valid math, just a much smaller step than the full
calculation. Every operation family here (add/less stacks, multiplication,
division, squares/cubes, etc.) has this property to some degree.

The rule enforced everywhere in this module: every distractor must share the
correct answer's own last digit (at the correct answer's own decimal
precision), so that shortcut never discriminates between options. Distractors
still differ from the correct answer in the higher-order digits, chosen to
mimic a genuine calculation mistake (missed a row, flipped a sign, a
transposed digit, a wrong middle digit) wherever the operation gives us
enough structure to construct one, and otherwise a magnitude-scaled multiple
of ten away from the correct answer -- never a fixed small offset like +/-1
or +/-2, which is both a units-digit giveaway and an "estimate and pick the
closest-looking number" giveaway (the exact failure mode the previous
generic +/-delta distractor generators had).

This module only decides which 3 WRONG options to offer. It never touches
what the question asks or what the correct answer is.
"""

import logging
import random
from decimal import Decimal, ROUND_HALF_UP

_LOGGER = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Precision helpers (shared decimal-place logic, mirrors what MM/IM already
# had in their own distractor files so behavior stays identical for anything
# that isn't the distractor-selection strategy itself).
# ---------------------------------------------------------------------------

def _exponent_of(value: Decimal) -> int:
    exponent = value.as_tuple().exponent
    return exponent if isinstance(exponent, int) else 0


def quantize_like(value: Decimal, correct_answer: Decimal) -> Decimal:
    """Round `value` to the same decimal precision as `correct_answer`."""
    exponent = _exponent_of(correct_answer)
    if exponent >= 0:
        return value.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return value.quantize(Decimal("1").scaleb(exponent), rounding=ROUND_HALF_UP)


def display_value(value: Decimal) -> int | str:
    """Plain decimal notation for student display (no scientific notation,
    no trailing zeros)."""
    if value == value.to_integral_value():
        return int(value)
    text = format(value.normalize(), "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text if text != "-0" else "0"


def _unit_step(correct_answer: Decimal) -> Decimal:
    """Smallest place-value step at the correct answer's own precision: 1 for
    integers, 0.1 for 1-decimal-place answers, 0.01 for 2, etc."""
    exponent = _exponent_of(correct_answer)
    if exponent >= 0:
        return Decimal("1")
    return Decimal("1").scaleb(exponent)


def _last_digit_signature_at(value: Decimal, unit: Decimal) -> Decimal:
    """The value's last significant digit at the given precision, based on
    its magnitude (sign-independent, matching how a student would actually
    reason about "what does this end in" for a negative stack result)."""
    modulus = unit * 10
    return abs(value) % modulus


def shares_last_digit(candidate: Decimal, correct_answer: Decimal) -> bool:
    unit = _unit_step(correct_answer)
    return _last_digit_signature_at(candidate, unit) == _last_digit_signature_at(correct_answer, unit)


def _within_plausible_band(candidate: Decimal, correct_answer: Decimal) -> bool:
    """Keep distractors in the same rough neighbourhood as the correct
    answer -- close enough to feel like a real contender, never so far off
    that magnitude alone gives it away either."""
    unit = _unit_step(correct_answer)
    magnitude = max(abs(correct_answer), unit * 10)
    diff = abs(candidate - correct_answer)
    return diff <= (magnitude * Decimal("0.5")) + (unit * 100)


# ---------------------------------------------------------------------------
# Baseline candidate generator: always available, always last-digit-safe.
# ---------------------------------------------------------------------------

def _magnitude_steps(correct_answer: Decimal) -> list[Decimal]:
    unit = _unit_step(correct_answer)
    magnitude = max(unit, abs(correct_answer))
    ten = unit * 10
    steps = [ten, ten * 2, ten * 3, ten * 5]
    if magnitude >= unit * 500:
        steps.extend([ten * 10, ten * 20])
    if magnitude >= unit * 10000:
        steps.extend([ten * 100, ten * 200])
    return steps


def generate_same_signature_candidates(
    correct_answer: Decimal,
    rng: random.Random,
    allow_negative: bool = False,
    count: int = 10,
) -> list[Decimal]:
    """Candidates that always share the correct answer's last digit, varying
    only in the tens place and above -- immune to units-digit elimination by
    construction, regardless of operation type."""
    unit = _unit_step(correct_answer)
    candidates: list[Decimal] = []
    for step in _magnitude_steps(correct_answer):
        for delta in (step, -step):
            candidate = correct_answer + delta
            if candidate == correct_answer:
                continue
            if not allow_negative and candidate < 0:
                continue
            if candidate not in candidates:
                candidates.append(candidate)
    rng.shuffle(candidates)

    guard = 0
    while len(candidates) < count and guard < 150:
        guard += 1
        random_tens_multiple = Decimal(rng.randint(1, 80)) * unit * 10
        candidate = correct_answer + (random_tens_multiple * rng.choice([1, -1]))
        if candidate == correct_answer:
            continue
        if not allow_negative and candidate < 0:
            continue
        if candidate not in candidates:
            candidates.append(candidate)
    return candidates[:count]


# ---------------------------------------------------------------------------
# Structural "genuine mistake" candidate generators, per operation shape.
# ---------------------------------------------------------------------------

def missed_row_candidates(operands: list[Decimal], correct_answer: Decimal) -> list[Decimal]:
    """A very real Add/Less mistake: skipping one row entirely."""
    candidates: list[Decimal] = []
    if len(operands) < 2:
        return candidates
    for index in range(len(operands)):
        remaining = sum(value for position, value in enumerate(operands) if position != index)
        if remaining != correct_answer and remaining not in candidates:
            candidates.append(remaining)
    return candidates


def sign_flip_candidates(operands: list[Decimal], correct_answer: Decimal) -> list[Decimal]:
    """Another real Add/Less mistake: reading one row's sign backwards."""
    candidates: list[Decimal] = []
    for index in range(len(operands)):
        flipped = list(operands)
        flipped[index] = -flipped[index]
        total = sum(flipped)
        if total != correct_answer and total not in candidates:
            candidates.append(total)
    return candidates


def _digit_string(correct_answer: Decimal, unit: Decimal) -> tuple[int, list[str]]:
    scaled = int((correct_answer / unit).to_integral_value())
    sign = -1 if scaled < 0 else 1
    return sign, list(str(abs(scaled)))


def digit_transpose_candidates(correct_answer: Decimal, rng: random.Random) -> list[Decimal]:
    """Swap two adjacent digits -- a classic real transcription/calculation
    slip (e.g. reading or writing 2607 as 2670)."""
    unit = _unit_step(correct_answer)
    sign, digits = _digit_string(correct_answer, unit)
    candidates: list[Decimal] = []
    for index in range(len(digits) - 1):
        if digits[index] == digits[index + 1]:
            continue
        swapped = digits.copy()
        swapped[index], swapped[index + 1] = swapped[index + 1], swapped[index]
        if swapped[0] == "0" and len(swapped) > 1:
            continue
        value = Decimal(sign * int("".join(swapped))) * unit
        if value != correct_answer and value not in candidates:
            candidates.append(value)
    rng.shuffle(candidates)
    return candidates


def middle_digit_shift_candidates(correct_answer: Decimal, rng: random.Random, limit: int = 8) -> list[Decimal]:
    """Change one internal digit (never the very last digit -- that's the
    signature every candidate must preserve, enforced again downstream as a
    hard filter) to simulate a plausible mid-calculation slip."""
    unit = _unit_step(correct_answer)
    sign, digits = _digit_string(correct_answer, unit)
    candidates: list[Decimal] = []
    if len(digits) < 2:
        return candidates
    editable_positions = list(range(0, len(digits) - 1))
    rng.shuffle(editable_positions)
    for position in editable_positions:
        original = digits[position]
        replacements = [d for d in "0123456789" if d != original]
        rng.shuffle(replacements)
        for replacement in replacements:
            if position == 0 and replacement == "0" and len(digits) > 1:
                continue
            trial = digits.copy()
            trial[position] = replacement
            value = Decimal(sign * int("".join(trial))) * unit
            if value != correct_answer and value not in candidates:
                candidates.append(value)
            if len(candidates) >= limit:
                return candidates
    return candidates


def division_structural_candidates(
    dividend: Decimal,
    divisor: Decimal,
    correct_answer: Decimal,
    rng: random.Random,
) -> list[Decimal]:
    """Wrong quotients built from digit-level slips on the real quotient --
    a transposed digit or a wrong middle digit, the kind of value a student
    would actually land on from a real division mistake, not from rough
    estimation. (These are already guaranteed to share the correct answer's
    last digit by the universal filter in select_best_distractors, which is
    what blocks both the units-digit shortcut and a reverse-multiplication
    shortcut against the divisor.)"""
    del dividend, divisor  # kept in the signature for call-site clarity/future use
    candidates = middle_digit_shift_candidates(correct_answer, rng, limit=12)
    candidates += digit_transpose_candidates(correct_answer, rng)
    return candidates


# ---------------------------------------------------------------------------
# Selection: merge pools in priority order, always enforcing the last-digit
# rule and the plausibility band, with graceful multi-stage fallback so this
# can never come up short or hang.
# ---------------------------------------------------------------------------

def select_best_distractors(
    correct_answer: Decimal,
    candidate_pools: list[list[Decimal]],
    rng: random.Random,
    allow_negative: bool = False,
    count: int = 3,
) -> list[Decimal]:
    selected: list[Decimal] = []
    seen = {correct_answer}

    def _try_add(candidate: Decimal) -> None:
        if len(selected) >= count or candidate in seen:
            return
        if not allow_negative and candidate < 0:
            return
        if not shares_last_digit(candidate, correct_answer):
            return
        if not _within_plausible_band(candidate, correct_answer):
            return
        selected.append(candidate)
        seen.add(candidate)

    for pool in candidate_pools:
        for candidate in pool:
            _try_add(candidate)
            if len(selected) >= count:
                break
        if len(selected) >= count:
            break

    # Stage 2: same-signature magnitude variants (still last-digit-safe by
    # construction, so the plausibility-band/last-digit gate above is
    # effectively a no-op here, but kept for a single code path).
    if len(selected) < count:
        for candidate in generate_same_signature_candidates(correct_answer, rng, allow_negative, count=30):
            _try_add(candidate)
            if len(selected) >= count:
                break

    # Stage 3: relax the plausibility band (keep the last-digit rule, which
    # is the one property that must never be dropped).
    if len(selected) < count:
        for pool in candidate_pools:
            for candidate in pool:
                if len(selected) >= count or candidate in seen:
                    continue
                if not allow_negative and candidate < 0:
                    continue
                if not shares_last_digit(candidate, correct_answer):
                    continue
                selected.append(candidate)
                seen.add(candidate)

    # Stage 4: last resort, old-style small numeric offsets. Should be
    # extremely rare (tiny correct answers with almost no room to work
    # with); logged so it can be monitored.
    if len(selected) < count:
        _LOGGER.warning(
            "smart_distractors: fell back to naive offsets for correct_answer=%s (only found %d/%d safe candidates)",
            correct_answer, len(selected), count,
        )
        unit = _unit_step(correct_answer)
        guard = 0
        offset = unit
        while len(selected) < count and guard < 300:
            guard += 1
            for delta in (offset, -offset):
                candidate = correct_answer + delta
                if candidate in seen:
                    continue
                if not allow_negative and candidate < 0:
                    continue
                selected.append(candidate)
                seen.add(candidate)
                if len(selected) >= count:
                    break
            offset += unit

    rng.shuffle(selected)
    return selected[:count]


# ---------------------------------------------------------------------------
# Public entry point.
# ---------------------------------------------------------------------------

def generate_smart_distractors(
    correct_answer: Decimal,
    rng: random.Random,
    operation: str,
    operands: list[Decimal] | None = None,
    allow_negative: bool = False,
) -> list[Decimal]:
    """Main entry point used by every module. `operation` selects which
    structural-mistake strategy runs first; every strategy sits on top of the
    same last-digit-safe baseline via select_best_distractors, so every
    operation family gets units-digit protection even when no operation-
    specific structural mistake applies (BODMAS, roots, remainders, etc.).

    operation: one of "ADD_SUBTRACT", "MULTIPLY", "DIVIDE", or anything else
    (treated as a generic baseline -- digit-transpose + middle-digit-shift
    plus the same-signature fallback).
    operands: for ADD_SUBTRACT, the real signed row values (summing to
    correct_answer). For DIVIDE, [dividend, divisor]. Unused otherwise.
    """
    operands = operands or []
    pools: list[list[Decimal]] = []

    if operation == "ADD_SUBTRACT" and len(operands) >= 2:
        pools.append(missed_row_candidates(operands, correct_answer))
        pools.append(sign_flip_candidates(operands, correct_answer))
        pools.append(digit_transpose_candidates(correct_answer, rng))
        pools.append(middle_digit_shift_candidates(correct_answer, rng))
    elif operation == "DIVIDE" and len(operands) >= 2:
        pools.append(division_structural_candidates(operands[0], operands[1], correct_answer, rng))
    elif operation == "MULTIPLY":
        pools.append(digit_transpose_candidates(correct_answer, rng))
        pools.append(middle_digit_shift_candidates(correct_answer, rng))
    else:
        pools.append(digit_transpose_candidates(correct_answer, rng))
        pools.append(middle_digit_shift_candidates(correct_answer, rng))

    return select_best_distractors(correct_answer, pools, rng, allow_negative, count=3)
