from __future__ import annotations

import random

from app.question_engine.option_utils import build_mcq_options
from app.question_engine.pm_l4.config import (
    PML4BodmasConfig,
    BODMAS_L4_BRACKET_PRODUCT,
    BODMAS_L4_PLAIN_PRODUCT,
    BODMAS_L4_BRACKET_SUM,
)
from app.question_engine.pm_l4.distractors import generate_bodmas_distractors

"""PM-L4's BODMAS -- unlike PM-L3, the workbook authors these as free-form
typed expressions rather than three fixed shapes (confirmed in the findings
report: term count varies 4-6, bracket position varies, sign patterns vary
freely). 55 literal expressions were read across all 12 lessons to derive
three representative shapes, each hand-verified against a literal workbook
row:

Sample literal rows read during the audit (findings report doesn't pin
each one to a specific lesson/DPS cell, only that all three shapes recur
across the level) map onto these three shapes:

1. BRACKET_PRODUCT: "base +/- (a x b) +/- c [+/- d]".
   Verified: "102- (21 X 4) + 60 -70" = 102-84+60-70 = 8.
2. PLAIN_PRODUCT: "base +/- a x b +/- c +/- d", multiplication unbracketed
   but still evaluated first per BODMAS.
   Verified: "98 + 30 x 8 - 50 + 12" = 98+240-50+12 = 300.
   Verified: "55 - 28 x 4 + 245 - 60" = 55-112+245-60 = 128 (note the
   workbook itself lets the running value go negative mid-expression,
   55-112=-57, before recovering -- this is ordinary arithmetic evaluation,
   not an abacus row-by-row movement chain, so unlike Add/Less this
   generator does not guard against negative intermediate values, only a
   non-negative FINAL answer).
3. BRACKET_SUM: "base +/- (p +/- q) +/- c +/- d x e" -- bracket wraps a
   SUM/difference (not a product) and a separate unbracketed product
   appears in the tail.
   Verified: "77- (50 +18) + 25 + 40 x 2" = 77-68+25+80 = 114.

The seed config (preparatory_module_l4_config.py) assigns these three
templates round-robin across the level's 7 BODMAS-bearing DPS for variety,
since the exact template-to-DPS mapping wasn't captured at cell-level
granularity in the audit (only that all three shapes recur).

Display: EXPRESSION_WORKSHEET (matching the corrected PM-L3 convention from
the start -- never COMPACT_EXPRESSION, which caused PM-L3's line-wrapping
bug). question_text carries the built expression string; drill_operands
empty; operands/operators are the same [expression]/[""] placeholder shape
IM/MM/PM-L3's own BODMAS generators use.
"""


def _fmt(value: int) -> str:
    return str(value)


def generate_bracket_product_question(config: PML4BodmasConfig, rng: random.Random) -> dict:
    for _attempt in range(100):
        base = rng.randint(config.base_min, config.base_max)
        a = rng.randint(config.multiplier_left_min, config.multiplier_left_max)
        b = rng.randint(config.multiplier_right_min, config.multiplier_right_max)
        product = a * b
        product_sign = rng.choice(("+", "-"))
        c = rng.randint(config.tail_min, config.tail_max)
        c_sign = rng.choice(("+", "-"))

        running = base + product if product_sign == "+" else base - product
        running = running + c if c_sign == "+" else running - c

        include_d = config.include_extra_tail and rng.choice((True, False))
        d = None
        d_sign = "+"
        if include_d:
            d = rng.randint(config.tail_min, config.tail_max)
            d_sign = rng.choice(("+", "-"))
            correct_answer = running + d if d_sign == "+" else running - d
        else:
            correct_answer = running

        if correct_answer < 0:
            continue

        expression = f"{_fmt(base)} {product_sign} ({_fmt(a)} × {_fmt(b)}) {c_sign} {_fmt(c)}"
        if include_d:
            expression += f" {d_sign} {_fmt(d)}"

        distractors = generate_bodmas_distractors(correct_answer, rng)
        options = build_mcq_options(correct_answer, distractors, rng)
        return {
            "display_type": "EXPRESSION_WORKSHEET",
            "question_text": expression,
            "drill_operands": {},
            "operands": [expression],
            "operators": [""],
            "correct_answer": correct_answer,
            "options": options,
            "metadata": {
                "concept_family": "BODMAS",
                "generation_template": BODMAS_L4_BRACKET_PRODUCT,
            },
        }
    raise ValueError(f"PM-L4 lesson {config.lesson_number}: could not generate a valid BRACKET_PRODUCT BODMAS question")


def generate_plain_product_question(config: PML4BodmasConfig, rng: random.Random) -> dict:
    for _attempt in range(100):
        base = rng.randint(config.base_min, config.base_max)
        a = rng.randint(config.multiplier_left_min, config.multiplier_left_max)
        b = rng.randint(config.multiplier_right_min, config.multiplier_right_max)
        product = a * b
        product_sign = rng.choice(("+", "-"))
        c = rng.randint(config.tail_min, config.tail_max)
        c_sign = rng.choice(("+", "-"))
        d = rng.randint(config.tail_min, config.tail_max)
        d_sign = rng.choice(("+", "-"))

        running = base + product if product_sign == "+" else base - product
        running = running + c if c_sign == "+" else running - c
        correct_answer = running + d if d_sign == "+" else running - d

        if correct_answer < 0:
            continue

        expression = (
            f"{_fmt(base)} {product_sign} {_fmt(a)} × {_fmt(b)} "
            f"{c_sign} {_fmt(c)} {d_sign} {_fmt(d)}"
        )
        distractors = generate_bodmas_distractors(correct_answer, rng)
        options = build_mcq_options(correct_answer, distractors, rng)
        return {
            "display_type": "EXPRESSION_WORKSHEET",
            "question_text": expression,
            "drill_operands": {},
            "operands": [expression],
            "operators": [""],
            "correct_answer": correct_answer,
            "options": options,
            "metadata": {
                "concept_family": "BODMAS",
                "generation_template": BODMAS_L4_PLAIN_PRODUCT,
            },
        }
    raise ValueError(f"PM-L4 lesson {config.lesson_number}: could not generate a valid PLAIN_PRODUCT BODMAS question")


def generate_bracket_sum_question(config: PML4BodmasConfig, rng: random.Random) -> dict:
    for _attempt in range(100):
        base = rng.randint(config.base_min, config.base_max)
        p = rng.randint(config.bracket_min, config.bracket_max)
        bracket_sign = rng.choice(("+", "-"))
        if bracket_sign == "+":
            q = rng.randint(config.bracket_min, config.bracket_max)
            bracket_value = p + q
        else:
            q = rng.randint(config.bracket_min, min(p, config.bracket_max))
            bracket_value = p - q
        base_sign = rng.choice(("+", "-"))
        c = rng.randint(config.tail_min, config.tail_max)
        c_sign = rng.choice(("+", "-"))
        d = rng.randint(config.multiplier_left_min, config.multiplier_left_max)
        e = rng.randint(config.multiplier_right_min, config.multiplier_right_max)
        tail_product = d * e
        product_sign = rng.choice(("+", "-"))

        running = base + bracket_value if base_sign == "+" else base - bracket_value
        running = running + c if c_sign == "+" else running - c
        correct_answer = running + tail_product if product_sign == "+" else running - tail_product

        if correct_answer < 0:
            continue

        expression = (
            f"{_fmt(base)} {base_sign} ({_fmt(p)} {bracket_sign} {_fmt(q)}) "
            f"{c_sign} {_fmt(c)} {product_sign} {_fmt(d)} × {_fmt(e)}"
        )
        distractors = generate_bodmas_distractors(correct_answer, rng)
        options = build_mcq_options(correct_answer, distractors, rng)
        return {
            "display_type": "EXPRESSION_WORKSHEET",
            "question_text": expression,
            "drill_operands": {},
            "operands": [expression],
            "operators": [""],
            "correct_answer": correct_answer,
            "options": options,
            "metadata": {
                "concept_family": "BODMAS",
                "generation_template": BODMAS_L4_BRACKET_SUM,
            },
        }
    raise ValueError(f"PM-L4 lesson {config.lesson_number}: could not generate a valid BRACKET_SUM BODMAS question")


def generate_bodmas_question(config: PML4BodmasConfig, rng: random.Random) -> dict:
    if config.template == BODMAS_L4_BRACKET_PRODUCT:
        return generate_bracket_product_question(config, rng)
    if config.template == BODMAS_L4_PLAIN_PRODUCT:
        return generate_plain_product_question(config, rng)
    if config.template == BODMAS_L4_BRACKET_SUM:
        return generate_bracket_sum_question(config, rng)
    raise ValueError(f"Unknown PM-L4 BODMAS template: {config.template}")
