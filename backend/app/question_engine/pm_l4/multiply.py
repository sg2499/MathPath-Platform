from __future__ import annotations

import random

from app.question_engine.option_utils import build_mcq_options
from app.question_engine.pm_l4.config import PML4MultiplyConfig
from app.question_engine.pm_l4.distractors import generate_multiply_table_distractors
from app.question_engine.pm_l4.operands import is_trivial_scale_operand

"""PM-L4's "2D X 1D (ABACUS/VISUAL)" -- same shape and role as PM-L3's
standalone Multiply DPS (a full standalone block, not a Concept Drill
teaser). Plain multiplication: one 2-digit number times one 1-digit
multiplier per question. Display and trivial-operand guard match PM-L3's
already-corrected conventions from the start (per Shailesh's 2026-08-06
instruction not to repeat the same mistakes for this level): plain
EXPRESSION_WORKSHEET single-line expression, operators ["", "×"], and a
retry loop that rejects round/guessable operands (x1, x10, x20, ...).
"""


def compute_multiply_table_answer(number: int, multiplier: int) -> int:
    return number * multiplier


def generate_multiply_table_question(config: PML4MultiplyConfig, rng: random.Random) -> dict:
    number = multiplier = 0
    for _attempt in range(60):
        number = rng.randint(config.number_min, config.number_max)
        multiplier = rng.randint(config.multiplier_min, config.multiplier_max)
        if not (is_trivial_scale_operand(number) or is_trivial_scale_operand(multiplier)):
            break
    correct_answer = compute_multiply_table_answer(number, multiplier)
    distractors = generate_multiply_table_distractors(correct_answer, rng)
    options = build_mcq_options(correct_answer, distractors, rng)
    return {
        "display_type": "EXPRESSION_WORKSHEET",
        "question_text": None,
        "drill_operands": {"NUMBER": number, "TIMES": multiplier},
        "operands": [number, multiplier],
        "operators": ["", "×"],
        "correct_answer": correct_answer,
        "options": options,
        "metadata": {
            "concept_family": "PM_L4_MULTIPLICATION",
            "generation_template": "2D_X_1D",
            "practice_mode": config.practice_mode,
        },
    }
