from __future__ import annotations

import random

from app.question_engine.option_utils import build_mcq_options
from app.question_engine.pm_l3.config import PML3ConceptDrillConfig, DRILL_MULTIPLY, DRILL_DIVIDE
from app.question_engine.pm_l3.distractors import generate_multiply_distractors, generate_divide_distractors

"""PM-L3's "CONCEPT DRILL (ABACUS)" sub-block -- confirmed identical formulas
to PM-L2's (Shailesh, 2026-08-05/06), verified against PM-L3's own literal
workbook rows (Lesson 1 DPS1: ADD=123,TIMES=5 -> 615; FROM=1330,LESS=123 ->
100). Always a small teaser embedded in a larger DPS (1 row each, SL 11/12),
never a full standalone DPS -- confirmed across every lesson that has it
(1, 6, 7, 8, 9, 10, 12; absent in 2, 3, 4, 5, 11 per the header scan).

1. MULTIPLY (columns SL/ADD/TIMES/ANSWER): answer = ADD * TIMES.
2. DIVIDE (columns SL/FROM/LESS/ANSWER): answer = FROM mod LESS (repeated
   subtraction on the abacus); remainder-zero pairs rejected as guessable.
"""


def compute_multiply_answer(add_value: int, times_value: int) -> int:
    return add_value * times_value


def compute_divide_answer(from_value: int, less_value: int) -> int:
    if less_value <= 0:
        raise ValueError("LESS must be positive")
    return from_value % less_value


def is_guessable_divide_pair(from_value: int, less_value: int) -> bool:
    return less_value > 0 and from_value % less_value == 0


def generate_multiply_question(config: PML3ConceptDrillConfig, rng: random.Random) -> dict:
    add_value = rng.randint(config.add_min, config.add_max)
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


def generate_divide_question(config: PML3ConceptDrillConfig, rng: random.Random) -> dict:
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
    raise ValueError(f"PM-L3 lesson {config.lesson_number}: could not generate a valid DIVIDE concept-drill pair")


def generate_concept_drill_question(config: PML3ConceptDrillConfig, rng: random.Random) -> dict:
    if config.drill_format == DRILL_MULTIPLY:
        return generate_multiply_question(config, rng)
    if config.drill_format == DRILL_DIVIDE:
        return generate_divide_question(config, rng)
    raise ValueError(f"Unknown PM-L3 concept-drill format: {config.drill_format}")
