import random
from decimal import Decimal

from app.question_engine.smart_distractors import generate_smart_distractors


def generate_distractors(correct_answer: int, operands: list[int], rng: random.Random, allow_negative: bool = False) -> list[int]:
    """Vertical N-row Add/Less distractors -- same shared, generic
    (non-curriculum) smart_distractors utility every level uses.
    enforce_same_digit_count=True (matches PM-L1/PM-L2): PM is a
    foundational program, a visibly different-width distractor is
    guessable on sight with zero arithmetic.
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
    """Concept Drill's ADD x TIMES teaser -- no digit-count enforcement, same
    reasoning as PM-L2's identical function (products can legitimately land
    at different widths from realistic off-by-one-multiple mistakes).
    """
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
    """PM-L3's standalone "2D X 1D" DPS -- same MULTIPLY strategy as Concept
    Drill's teaser (off-by-one-multiple mistakes), no digit-count gate.
    """
    selected = generate_smart_distractors(
        Decimal(int(correct_answer)), rng, "MULTIPLY", [], False, enforce_same_digit_count=False,
    )
    return [int(value) for value in selected]


def generate_divide_table_distractors(number: int, divisor: int, correct_answer: int, rng: random.Random) -> list[int]:
    """PM-L3's standalone "3D / 1D" DPS -- real exact division (a true
    quotient, not a remainder like Concept Drill's DIVIDE), same DIVIDE
    structural-mistake strategy (off-by-one quotient etc.) from the shared
    utility.
    """
    selected = generate_smart_distractors(
        Decimal(int(correct_answer)), rng, "DIVIDE",
        [Decimal(int(number)), Decimal(int(divisor))], False, enforce_same_digit_count=False,
    )
    return [int(value) for value in selected]


def generate_bodmas_distractors(correct_answer: int, rng: random.Random) -> list[int]:
    """PM-L3's BODMAS expressions -- no operand-specific structural mistake
    modelled in the shared utility for a multi-term expression shape (same
    situation PM-L2's RANGE_SUM was in), so this falls through to the
    generic digit-transpose/middle-digit-shift baseline.
    """
    selected = generate_smart_distractors(
        Decimal(int(correct_answer)), rng, "BODMAS", [], False, enforce_same_digit_count=False,
    )
    return [int(value) for value in selected]
