from __future__ import annotations

import random

from app.question_engine.option_utils import build_mcq_options
from app.question_engine.pm_l3.config import PML3DivideConfig
from app.question_engine.pm_l3.distractors import generate_divide_table_distractors
from app.question_engine.pm_l3.operands import is_trivial_scale_operand

"""PM-L3's "3D ÷ 1D (ABACUS)" -- appears once in the literal workbook
(Lesson 10 DPS3, 10 instances: 582/6=97, 117/9=13, 680/8=85, 280/5=56,
294/6=49, 864/9=96, 243/3=81, 306/6=51, 455/5=91, 315/7=45), every single one
an EXACT division (zero remainder) -- confirmed by hand-checking all 10.
Shailesh's explicit instruction (2026-08-06): Section 4 (Division) needs a
genuine wide-range generator for assessment/mock practice, not replay of
those 10 rows. Built the same way the workbook itself evidently was: pick
the divisor and quotient first, multiply them to get the dividend, so
exactness is guaranteed by construction rather than by filtering random
dividends for luck.

Display (corrected 2026-08-06, Shailesh): plain division, not a Concept
Drill teaser -- matching IM's WHOLE_NUMBER_DIVISION precedent, a single
"2236 ÷ 52 = ?" expression (display_type EXPRESSION_WORKSHEET, operators
["", "÷"], no question_text), not Concept Drill's labeled box.

Trivial-divisor guard (widened 2026-08-06, Shailesh): now uses the same
is_trivial_scale_operand() shared with multiply.py (IM/MM's own guard)
instead of a bare "divisor <= 1" check -- equivalent today since
divisor_min defaults to 2 and every config in this level sets it there too,
but this matches the platform-wide convention exactly and stays correct if
a divisor range is ever widened down to 1 or up past a round ten later.
"""


def compute_divide_table_answer(number: int, divisor: int) -> int:
    if divisor <= 0:
        raise ValueError("divisor must be positive")
    if number % divisor != 0:
        raise ValueError(f"{number} is not exactly divisible by {divisor}")
    return number // divisor


def generate_divide_table_question(config: PML3DivideConfig, rng: random.Random) -> dict:
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
        return {
            "display_type": "EXPRESSION_WORKSHEET",
            "question_text": None,
            "drill_operands": {"NUMBER": number, "DIVISOR": divisor},
            "operands": [number, divisor],
            "operators": ["", "÷"],
            "correct_answer": correct_answer,
            "options": options,
            "metadata": {
                "concept_family": "PM_L3_DIVISION",
                "generation_template": "3D_DIV_1D",
            },
        }
    raise ValueError(f"PM-L3 lesson {config.lesson_number}: could not generate a valid 3D/1D exact-division pair")
