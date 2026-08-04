import random
from decimal import Decimal

from app.question_engine.smart_distractors import generate_smart_distractors


def generate_distractors(correct_answer: int, operands: list[int], rng: random.Random, allow_negative: bool = False) -> list[int]:
    """Every wrong option shares correct_answer's own last digit so a
    units-digit shortcut can never eliminate an option, built from a real
    Add/Less mistake (missed row, flipped sign, transposed/mid-digit slip)
    rather than a naive small numeric offset. PM is add/subtract-only, so
    this always uses that strategy -- see
    app.question_engine.smart_distractors for the shared low-level math
    utility (already used identically by MM, IM, and YLM; this is generic
    "produce plausible wrong numeric options" arithmetic, not curriculum
    logic, so sharing it does not create any cross-module curriculum
    coupling).
    """
    DecimalOperands = [Decimal(int(value)) for value in operands]
    Selected = generate_smart_distractors(
        Decimal(int(correct_answer)),
        rng,
        "ADD_SUBTRACT",
        DecimalOperands,
        allow_negative,
    )
    return [int(value) for value in Selected]
