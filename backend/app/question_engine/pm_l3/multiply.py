from __future__ import annotations

import random

from app.question_engine.option_utils import build_mcq_options
from app.question_engine.pm_l3.config import PML3MultiplyConfig
from app.question_engine.pm_l3.distractors import generate_multiply_table_distractors
from app.question_engine.pm_l3.operands import is_trivial_scale_operand

"""PM-L3's "2D X 1D (ABACUS/VISUAL)" -- the level's dominant new skill, a
full standalone DPS (not a small teaser like Concept Drill). Plain
multiplication, taught as repeated addition on the abacus, same as PM-L2's
Concept Drill MULTIPLY formula -- but here it IS the whole DPS, one number
times one multiplier per question, box columns with no header-label row in
the literal workbook cells (confirmed: PM-L3 Lesson 1 DPS2 image shows plain
SL/number/×/multiplier/blank-answer rows, no ADD/TIMES label row above the
data, unlike Concept Drill's box). Digit-width progression confirmed lesson
to lesson (Lesson 1: multiplier pinned to 1, then 1-4; Lesson 9-11: full 1-9
range, 2-digit operand up to the 90s) -- reproduced here via number_min/max
and multiplier_min/max, not literal replay of the workbook's own digits.

Display (corrected 2026-08-06, Shailesh): this is plain multiplication, not
a Concept Drill teaser, so it must not use Concept Drill's labeled box --
matching IM's WHOLE_NUMBER_MULTIPLICATION (question_engine/im/operands.py),
which is the platform's own precedent for this exact concept and renders as
a single "43 × 8 = ?" expression (display_type EXPRESSION_WORKSHEET,
operators ["", "×"], no question_text so the frontend builds the string).

Trivial-operand guard (added 2026-08-06, Shailesh, from a live admin-preview
showing round-number products like "80 × 7"): retries while EITHER number or
multiplier is trivial (x1, or a round value like 20/30/.../90), same OR-guard
IM's GenerateWholeNumberMultiplication uses. Lesson 1 DPS2 legitimately pins
multiplier_min=multiplier_max=1 as the workbook's own intro scaffold -- the
retry loop just exhausts its attempts and falls back to that forced value
there, it never raises.
"""


def compute_multiply_table_answer(number: int, multiplier: int) -> int:
    return number * multiplier


def generate_multiply_table_question(config: PML3MultiplyConfig, rng: random.Random) -> dict:
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
            "concept_family": "PM_L3_MULTIPLICATION",
            "generation_template": "2D_X_1D",
            "practice_mode": config.practice_mode,
        },
    }
