from __future__ import annotations

import random

from app.question_engine.option_utils import build_mcq_options
from app.question_engine.bm.config import BMConceptDrillConfig, DRILL_MULTIPLY, DRILL_DIVIDE
from app.question_engine.bm.distractors import generate_multiply_distractors, generate_divide_distractors

"""BM-L1's "CONCEPT DRILL (ABACUS)" sub-block -- identical formulas to
PM-L2/L3/L4's (confirmed against BM-L1's own literal workbook rows, e.g.
Lesson 16 DPS1: ADD=23, TIMES=5 -> 115; FROM=549, LESS=42 -> 549 mod 42=3).
Always a small teaser embedded in a larger DPS (1 row each), never a full
standalone DPS.

1. MULTIPLY (columns SL/ADD/TIMES/ANSWER): answer = ADD * TIMES.
2. DIVIDE (columns SL/FROM/LESS/ANSWER): answer = FROM mod LESS (repeated
   subtraction on the abacus); remainder-zero pairs rejected as guessable.

TIMES: always drawn from config.times_min/times_max (5-10 by default, see
BMConceptDrillConfig's docstring) across ALL THREE flows (DPS, assessment,
AND mock) -- following PM-L4's precedent (Shailesh, 2026-08-06) rather than
replaying the workbook's static literal 5, to avoid a
guessable-after-one-question Concept Drill Multiply row.
"""


def compute_multiply_answer(add_value: int, times_value: int) -> int:
    return add_value * times_value


def compute_divide_answer(from_value: int, less_value: int) -> int:
    if less_value <= 0:
        raise ValueError("LESS must be positive")
    return from_value % less_value


def is_guessable_divide_pair(from_value: int, less_value: int) -> bool:
    return less_value > 0 and from_value % less_value == 0


def generate_multiply_question(config: BMConceptDrillConfig, rng: random.Random) -> dict:
    add_value = rng.randint(config.add_min, config.add_max)
    if config.times_min is not None and config.times_max is not None:
        times_value = rng.randint(config.times_min, config.times_max)
    else:
        times_value = config.times_value
    correct_answer = compute_multiply_answer(add_value, times_value)
    distractors = generate_multiply_distractors(correct_answer, rng)
    options = build_mcq_options(correct_answer, distractors, rng)
    return {
        "display_type": "CONCEPT_DRILL_MULTIPLY",
        "question_text": None,
        "drill_operands": {"ADD": add_value, "TIMES": times_value},
        "operands": [add_value, times_value],
        "operators": ["Add", "Times"],
        "correct_answer": correct_answer,
        "options": options,
        "metadata": {
            "concept_family": "CONCEPT_DRILL",
            "generation_template": "CONCEPT_DRILL_MULTIPLY",
            "lesson_title": config.lesson_number,
        },
    }


def generate_divide_question(config: BMConceptDrillConfig, rng: random.Random) -> dict:
    for _attempt in range(200):
        from_value = rng.randint(config.from_min, config.from_max)
        less_value = rng.randint(config.less_min, config.less_max)
        if less_value <= 0 or from_value < less_value:
            continue
        if is_guessable_divide_pair(from_value, less_value):
            continue
        correct_answer = compute_divide_answer(from_value, less_value)
        distractors = generate_divide_distractors(from_value, less_value, correct_answer, rng)
        options = build_mcq_options(correct_answer, distractors, rng)
        return {
            "display_type": "CONCEPT_DRILL_DIVIDE",
            "question_text": None,
            "drill_operands": {"FROM": from_value, "LESS": less_value},
            "operands": [from_value, less_value],
            "operators": ["From", "Less"],
            "correct_answer": correct_answer,
            "options": options,
            "metadata": {
                "concept_family": "CONCEPT_DRILL",
                "generation_template": "CONCEPT_DRILL_DIVIDE",
            },
        }
    raise ValueError(f"BM lesson {config.lesson_number}: could not generate a valid DIVIDE concept-drill pair")


def generate_concept_drill_question(config: BMConceptDrillConfig, rng: random.Random) -> dict:
    if config.drill_format == DRILL_MULTIPLY:
        return generate_multiply_question(config, rng)
    if config.drill_format == DRILL_DIVIDE:
        return generate_divide_question(config, rng)
    raise ValueError(f"Unknown BM concept-drill format: {config.drill_format}")
