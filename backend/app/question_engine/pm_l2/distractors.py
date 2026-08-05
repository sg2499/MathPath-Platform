import random
from decimal import Decimal

from app.question_engine.smart_distractors import generate_smart_distractors


def generate_distractors(correct_answer: int, operands: list[int], rng: random.Random, allow_negative: bool = False) -> list[int]:
    """Vertical 3-row add/less distractors -- built from a real Add/Less
    mistake (missed row, flipped sign, transposed/mid-digit slip). Uses the
    same shared, generic (non-curriculum) smart_distractors utility PM-L1,
    MM, IM, and YLM all already use -- sharing this is fine under the
    "dedicated engine per level" rule because it is generic "produce
    plausible wrong numeric options" arithmetic with zero PM-L2 curriculum
    knowledge baked in, exactly like PM-L1's own distractors.py already
    documents.

    enforce_same_digit_count=True (matches PM-L1): PM is a foundational
    program, so a distractor of a visibly different width can be picked out
    on sight with zero arithmetic.
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
    """Distractors for the ADD x TIMES concept-drill (repeated-addition
    multiplication). No signed operands and no digit-count enforcement here
    -- these products can legitimately land at different widths from small
    off-by-one-multiple mistakes, so forcing same-digit-count would exclude
    the most realistic wrong answers (e.g. correct=1248, a very plausible
    student slip is 1148 or 1348, already same width -- but also 104x11=1144
    or 104x13=1352, which select_best_distractors is free to consider without
    an artificial width gate).
    """
    selected = generate_smart_distractors(
        Decimal(int(correct_answer)), rng, "MULTIPLY", [], False, enforce_same_digit_count=False,
    )
    return [int(value) for value in selected]


def generate_divide_distractors(from_value: int, less_value: int, correct_answer: int, rng: random.Random) -> list[int]:
    """Distractors for the FROM/LESS concept-drill (repeated-subtraction
    remainder). Passes [FROM, LESS] as the DIVIDE operands so the shared
    utility's division-structural-mistake strategy (e.g. off-by-one
    quotient, using the wrong operand as remainder) applies.
    """
    selected = generate_smart_distractors(
        Decimal(int(correct_answer)), rng, "DIVIDE",
        [Decimal(int(from_value)), Decimal(int(less_value))], False, enforce_same_digit_count=False,
    )
    return [int(value) for value in selected]


def generate_range_sum_distractors(correct_answer: int, rng: random.Random) -> list[int]:
    """Distractors for the FROM/TO range-sum concept-drill -- no operand-
    specific structural mistake modelled in the shared utility for this
    shape, so this falls through to the generic digit-transpose/middle-
    digit-shift baseline (same as PM-L1's own generator would fall back to
    for anything outside ADD_SUBTRACT/MULTIPLY/DIVIDE).
    """
    selected = generate_smart_distractors(
        Decimal(int(correct_answer)), rng, "RANGE_SUM", [], False, enforce_same_digit_count=False,
    )
    return [int(value) for value in selected]
