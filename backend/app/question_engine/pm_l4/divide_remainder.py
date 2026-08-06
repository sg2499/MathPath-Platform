from __future__ import annotations

import random

from app.question_engine.option_utils import build_mcq_options
from app.question_engine.pm_l4.config import PML4DivideRemainderConfig
from app.question_engine.pm_l4.distractors import generate_divide_remainder_distractors
from app.question_engine.pm_l4.operands import is_trivial_scale_operand

"""PM-L4's "3D ÷ 1D WITH REMAINDER(S)" -- genuinely new, no PM-L1/L2/L3, IM,
or MM precedent (confirmed in the findings report). Real division that does
NOT divide evenly (e.g. "439 ÷ 6"), appearing only in Lessons 9-12 (the
back third of the level).

Design decisions confirmed with Shailesh, 2026-08-06:
- correct_answer is a combined "Q, R" text string (e.g. "73, 1"), matching
  the workbook's own literal answer-key cell shape ("73 ,  1") -- both for
  the MCQ options here (assessment/mock previews) AND for DPS free-text
  grading, which is handled by a dedicated pair-comparison path added to
  app/services/answer_matching.py's answers_match() (gated strictly on
  correct_answer's own "N, M" shape, so it can never misfire for any other
  question type on the platform).
- Visually this renders IDENTICALLY to plain division (confirmed from the
  DPS images: one "number ÷ divisor = ?" expression, one blank/MCQ answer
  slot, no visual cue that the answer is compound) -- so this reuses
  EXPRESSION_WORKSHEET, exactly like exact division, rather than inventing
  a new display_type. The compound-ness lives entirely in correct_answer's
  shape, not in how the question itself is displayed.

Built the same guaranteed-construction way as exact division: pick the
divisor and quotient first, then ADD a nonzero remainder strictly less
than the divisor, so a genuine (non-guessable, non-zero) remainder is
guaranteed by construction rather than by filtering random dividends for
luck. Trivial-divisor guard applied here too, matching every other
Multiply/Divide generator in this package.
"""


def generate_divide_remainder_question(config: PML4DivideRemainderConfig, rng: random.Random) -> dict:
    for _attempt in range(200):
        divisor = rng.randint(config.divisor_min, config.divisor_max)
        if is_trivial_scale_operand(divisor) or divisor < 2:
            continue
        quotient_min = max(2, -(-config.dividend_min // divisor))  # ceil division
        quotient_max = config.dividend_max // divisor
        if quotient_max < quotient_min:
            continue
        quotient = rng.randint(quotient_min, quotient_max)
        remainder = rng.randint(1, divisor - 1)  # nonzero -- this is the WITH REMAINDER concept
        number = divisor * quotient + remainder
        if not (config.dividend_min <= number <= config.dividend_max):
            continue
        correct_answer_text = f"{quotient}, {remainder}"
        distractor_texts = generate_divide_remainder_distractors(quotient, remainder, divisor, rng)
        options = build_mcq_options(correct_answer_text, distractor_texts, rng)
        return {
            "display_type": "EXPRESSION_WORKSHEET",
            "question_text": None,
            "drill_operands": {"NUMBER": number, "DIVISOR": divisor},
            "operands": [number, divisor],
            "operators": ["", "÷"],
            "correct_answer": correct_answer_text,
            "options": options,
            "metadata": {
                "concept_family": "PM_L4_DIVISION_WITH_REMAINDER",
                "generation_template": "3D_DIV_1D_WITH_REMAINDER",
                "quotient": quotient,
                "remainder": remainder,
            },
        }
    raise ValueError(
        f"PM-L4 lesson {config.lesson_number}: could not generate a valid 3D/1D division-with-remainder pair"
    )
