import random
from decimal import Decimal

from app.question_engine.smart_distractors import generate_smart_distractors


def generate_distractors(correct_answer: int, operands: list[int], rng: random.Random, allow_negative: bool = False) -> list[int]:
    """Built from a real Add/Less mistake (missed row, flipped sign,
    transposed/mid-digit slip) rather than a naive small numeric offset --
    see app.question_engine.smart_distractors for the shared low-level math
    utility (already used identically by MM, IM, and YLM; this is generic
    "produce plausible wrong numeric options" arithmetic, not curriculum
    logic, so sharing it does not create any cross-module curriculum
    coupling).

    Passes enforce_same_digit_count=True (2026-08-04, Shailesh, PM-only):
    PM is a foundational level with small, simple answers, where a
    distractor of a visibly different width (e.g. correct=9, options
    9/29/39/59) can be picked out on sight with zero arithmetic. This turns
    on select_best_distractors()'s digit-count matching for PM specifically
    -- MM/IM/YLM's own distractor behavior is untouched (the flag defaults
    off in the shared function).
    """
    DecimalOperands = [Decimal(int(value)) for value in operands]
    Selected = generate_smart_distractors(
        Decimal(int(correct_answer)),
        rng,
        "ADD_SUBTRACT",
        DecimalOperands,
        allow_negative,
        enforce_same_digit_count=True,
    )
    return [int(value) for value in Selected]
