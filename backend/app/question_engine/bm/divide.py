from __future__ import annotations

import random

from app.question_engine.option_utils import build_mcq_options
from app.question_engine.bm.config import BMDivideConfig
from app.question_engine.bm.distractors import generate_divide_table_distractors
from app.question_engine.bm.operands import is_trivial_scale_operand

"""BM-L1's EXACT division -- "2D ÷ 1D" and "3D ÷ 1D", both zero-remainder.
One shared generator, distinguished by config.digit_width (2 or 3) which
drives dividend_min/dividend_max and the metadata generation_template tag.
Built the same guaranteed-exact way as PM-L3/L4: pick the divisor and
quotient first, multiply them to get the dividend, so exactness is
guaranteed by construction.

Display and trivial-divisor guard match PM-L4's conventions: plain
EXPRESSION_WORKSHEET single-line "234 ÷ 6 = ?" expression,
is_trivial_scale_operand() guard on the divisor.
"""


def compute_divide_table_answer(number: int, divisor: int) -> int:
    if divisor <= 0:
        raise ValueError("divisor must be positive")
    if number % divisor != 0:
        raise ValueError(f"{number} is not exactly divisible by {divisor}")
    return number // divisor


def generate_divide_table_question(config: BMDivideConfig, rng: random.Random) -> dict:
    for _attempt in range(200):
        divisor = rng.randint(config.divisor_min, config.divisor_max)
        if is_trivial_scale_operand(divisor):
            continue
        quotient_min = max(2, -(-config.dividend_min // divisor))  # ceil division
        quotient_max = config.dividend_max // divisor
        if quotient_max < quotient_min:
            continue
        quotient = rng.randint(quotient_min, quotient_max)
        number = divisor * quotient
        if not (config.dividend_min <= number <= config.dividend_max):
            continue
        correct_answer = compute_divide_table_answer(number, divisor)
        distractors = generate_divide_table_distractors(number, divisor, correct_answer, rng)
        options = build_mcq_options(correct_answer, distractors, rng)
        generation_template = "2D_DIV_1D" if config.digit_width == 2 else "3D_DIV_1D"
        return {
            "display_type": "EXPRESSION_WORKSHEET",
            "question_text": None,
            "drill_operands": {"NUMBER": number, "DIVISOR": divisor},
            "operands": [number, divisor],
            "operators": ["", "÷"],
            "correct_answer": correct_answer,
            "options": options,
            "metadata": {
                "concept_family": "BM_DIVISION",
                "generation_template": generation_template,
            },
        }
    raise ValueError(f"BM lesson {config.lesson_number}: could not generate a valid {config.digit_width}D/1D exact-division pair")
