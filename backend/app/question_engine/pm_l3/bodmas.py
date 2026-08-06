from __future__ import annotations

import random

from app.question_engine.option_utils import build_mcq_options
from app.question_engine.pm_l3.config import (
    PML3BodmasConfig,
    BODMAS_SIMPLE_BRACKET,
    BODMAS_COMPOUND,
    BODMAS_CHAINED,
)
from app.question_engine.pm_l3.distractors import generate_bodmas_distractors

"""PM-L3's "BODMAS (ABACUS)" / "Brackets First - Maths Rule (ABACUS)" DPS --
order-of-operations expressions, confirmed by direct hand-evaluation against
every literal workbook answer (2026-08-06 audit). Three distinct term-shapes,
matching IM's own established BODMAS-generator pattern (a fixed "dominant
shape" template per level/lesson, built directly with arithmetic -- not a
generic string-eval parser): question_text carries the built expression
string and drill_operands is empty, matching how IM's GenerateBodmas already
returns `[Expression], [""]` for its own operands/operators.

1. SIMPLE_BRACKET (Lessons 2-4): "(a +/- b) x c" or "c x (a +/- b)".
   Verified: L3 "(9-5) x 2" = 4x2 = 8. L4 "(15-5) x 5" = 10x5 = 50.
2. COMPOUND (Lesson 5): "base + (a x b) - c" or "base - (a x b) + c" or
   "base +/- a x b +/- (c - d)" -- multiplication evaluated first regardless
   of whether it is itself bracketed, per BODMAS.
   Verified: "163 + (2 x 5) - 39" = 163+10-39 = 134.
   Verified: "205 + 5 x 8 + (85 - 48)" = 205+40+37 = 282.
3. CHAINED (Lessons 6, 7, 12): "a x b +/- (c - d) +/- e", no leading base
   term, starts directly with the multiplication.
   Verified: "9 x 4 + (29 - 6) + 21" = 36+23+21 = 80.
   Verified: "89 + (7 x 8) - 75" = 89+56-75 = 70 (COMPOUND shape, bracketed multiply).
"""


def _fmt(value: int) -> str:
    return str(value)


def generate_simple_bracket_question(config: PML3BodmasConfig, rng: random.Random) -> dict:
    a = rng.randint(config.simple_bracket_min, config.simple_bracket_max)
    b = rng.randint(config.simple_bracket_min, min(a, config.simple_bracket_max))
    c = rng.randint(config.simple_multiplier_min, config.simple_multiplier_max)
    sign = rng.choice(("+", "-"))
    bracket_value = a + b if sign == "+" else a - b
    if bracket_value < 0:
        a, b = b, a
        bracket_value = a - b
    correct_answer = bracket_value * c
    bracket_first = rng.choice((True, False))
    if bracket_first:
        expression = f"({_fmt(a)} {sign} {_fmt(b)}) × {_fmt(c)}"
    else:
        expression = f"{_fmt(c)} × ({_fmt(a)} {sign} {_fmt(b)})"
    distractors = generate_bodmas_distractors(correct_answer, rng)
    options = build_mcq_options(correct_answer, distractors, rng)
    return {
        "display_type": "COMPACT_EXPRESSION",
        "question_text": expression,
        "drill_operands": {},
        "operands": [expression],
        "operators": [""],
        "correct_answer": correct_answer,
        "options": options,
        "metadata": {
            "concept_family": "BODMAS",
            "generation_template": BODMAS_SIMPLE_BRACKET,
        },
    }


def generate_compound_question(config: PML3BodmasConfig, rng: random.Random) -> dict:
    base = rng.randint(config.base_min, config.base_max)
    a = rng.randint(config.multiplier_left_min, config.multiplier_left_max)
    b = rng.randint(config.multiplier_right_min, config.multiplier_right_max)
    product = a * b
    variant = rng.choice(("BRACKETED_PRODUCT", "BRACKETED_TAIL"))

    if variant == "BRACKETED_PRODUCT":
        tail_sign = rng.choice(("+", "-"))
        tail = rng.randint(config.tail_min, config.tail_max)
        product_sign = rng.choice(("+", "-"))
        running = base + product if product_sign == "+" else base - product
        # Never let a running total go negative mid-expression -- foundational level, matches every literal workbook instance.
        if running < 0:
            product_sign = "+"
            running = base + product
        correct_answer = running + tail if tail_sign == "+" else running - tail
        if correct_answer < 0:
            tail_sign = "+"
            correct_answer = running + tail
        expression = f"{_fmt(base)} {product_sign} ({_fmt(a)} × {_fmt(b)}) {tail_sign} {_fmt(tail)}"
    else:
        c = rng.randint(config.bracket_min, config.bracket_max)
        d = rng.randint(config.bracket_min, min(c, config.bracket_max))
        bracket_value = c - d
        product_sign = rng.choice(("+", "-"))
        running = base + product if product_sign == "+" else base - product
        if running < 0:
            product_sign = "+"
            running = base + product
        bracket_sign = rng.choice(("+", "-"))
        correct_answer = running + bracket_value if bracket_sign == "+" else running - bracket_value
        if correct_answer < 0:
            bracket_sign = "+"
            correct_answer = running + bracket_value
        expression = f"{_fmt(base)} {product_sign} {_fmt(a)} × {_fmt(b)} {bracket_sign} ({_fmt(c)} - {_fmt(d)})"

    distractors = generate_bodmas_distractors(correct_answer, rng)
    options = build_mcq_options(correct_answer, distractors, rng)
    return {
        "display_type": "COMPACT_EXPRESSION",
        "question_text": expression,
        "drill_operands": {},
        "operands": [expression],
        "operators": [""],
        "correct_answer": correct_answer,
        "options": options,
        "metadata": {
            "concept_family": "BODMAS",
            "generation_template": BODMAS_COMPOUND,
        },
    }


def generate_chained_question(config: PML3BodmasConfig, rng: random.Random) -> dict:
    a = rng.randint(config.multiplier_left_min, config.multiplier_left_max)
    b = rng.randint(config.multiplier_right_min, config.multiplier_right_max)
    product = a * b
    c = rng.randint(config.bracket_min, config.bracket_max)
    d = rng.randint(config.bracket_min, min(c, config.bracket_max))
    bracket_value = c - d
    e = rng.randint(config.tail_min, config.tail_max)

    bracket_sign = rng.choice(("+", "-"))
    running = product + bracket_value if bracket_sign == "+" else product - bracket_value
    if running < 0:
        bracket_sign = "+"
        running = product + bracket_value

    tail_sign = rng.choice(("+", "-"))
    correct_answer = running + e if tail_sign == "+" else running - e
    if correct_answer < 0:
        tail_sign = "+"
        correct_answer = running + e

    expression = f"{_fmt(a)} × {_fmt(b)} {bracket_sign} ({_fmt(c)} - {_fmt(d)}) {tail_sign} {_fmt(e)}"
    distractors = generate_bodmas_distractors(correct_answer, rng)
    options = build_mcq_options(correct_answer, distractors, rng)
    return {
        "display_type": "COMPACT_EXPRESSION",
        "question_text": expression,
        "drill_operands": {},
        "operands": [expression],
        "operators": [""],
        "correct_answer": correct_answer,
        "options": options,
        "metadata": {
            "concept_family": "BODMAS",
            "generation_template": BODMAS_CHAINED,
        },
    }


def generate_bodmas_question(config: PML3BodmasConfig, rng: random.Random) -> dict:
    if config.template == BODMAS_SIMPLE_BRACKET:
        return generate_simple_bracket_question(config, rng)
    if config.template == BODMAS_COMPOUND:
        return generate_compound_question(config, rng)
    if config.template == BODMAS_CHAINED:
        return generate_chained_question(config, rng)
    raise ValueError(f"Unknown PM-L3 BODMAS template: {config.template}")
