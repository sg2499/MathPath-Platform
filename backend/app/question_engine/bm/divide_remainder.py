from __future__ import annotations

import random

from app.question_engine.option_utils import build_mcq_options
from app.question_engine.bm.config import BMDivideRemainderConfig
from app.question_engine.bm.distractors import generate_divide_remainder_distractors
from app.question_engine.bm.operands import is_trivial_scale_operand

"""BM-L1's "3D ÷ 1D WITH REMAINDER(S)" -- appears Lessons 36-40 (the final
block of the level), same shape as PM-L4's own division-with-remainder
concept. Real division that does NOT divide evenly (e.g. "214 ÷ 7").

Design (same as PM-L4, confirmed against BM-L1's own workbook, e.g. Lesson
36 DPS5: 214 ÷ 7 -> "30, 4"):
- correct_answer is a combined "Q, R" text string, matching the workbook's
  own literal answer-key cell shape -- both for the MCQ options here
  (assessment/mock previews) AND for DPS free-text grading, handled by the
  same dedicated pair-comparison path already added to
  app/services/answer_matching.py's answers_match() (gated strictly on
  correct_answer's own "N, M" shape, so it never misfires for any other
  question type on the platform, BM included).
- Visually renders IDENTICALLY to plain division -- one "number ÷ divisor
  = ?" expression, one blank/MCQ answer slot -- so this reuses
  EXPRESSION_WORKSHEET, exactly like exact division.

Built the same guaranteed-construction way as exact division: pick the
divisor and quotient first, then ADD a nonzero remainder strictly less
than the divisor, so a genuine (non-guessable, non-zero) remainder is
guaranteed by construction. Trivial-divisor guard applied here too.
"""


def generate_divide_remainder_question(config: BMDivideRemainderConfig, rng: random.Random) -> dict:
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
                "concept_family": "BM_DIVISION_WITH_REMAINDER",
                "generation_template": "3D_DIV_1D_WITH_REMAINDER",
                "quotient": quotient,
                "remainder": remainder,
            },
        }
    raise ValueError(
        f"BM lesson {config.lesson_number}: could not generate a valid 3D/1D division-with-remainder pair"
    )
