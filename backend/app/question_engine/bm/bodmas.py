from __future__ import annotations

import random

from app.question_engine.option_utils import build_mcq_options
from app.question_engine.bm.config import (
    BMBodmasConfig,
    BODMAS_BM_BRACKET_PRODUCT,
    BODMAS_BM_PLAIN_PRODUCT,
    BODMAS_BM_BRACKET_SUM,
    BODMAS_BM_PRODUCT_AFTER_TAIL,
)
from app.question_engine.bm.distractors import generate_bodmas_distractors

"""BM-L1's BODMAS -- like PM-L4, the workbook authors these as free-form
typed expressions rather than a small fixed set. Literal expressions read
across Lessons 17-40 (docs/reference-materials/BM/) map onto four
representative shapes, the first three matching PM-L4's own templates
exactly and a fourth ("product after a leading tail term") that PM-L4's
workbook didn't use but BM-L1's does frequently:

1. BRACKET_PRODUCT: "base +/- (a x b) +/- c [+/- d]".
   Verified against a literal BM row style: "121 + (34 × 6) - 68".
2. PLAIN_PRODUCT: "base +/- a x b +/- c +/- d", multiplication unbracketed
   but still evaluated first per BODMAS.
   Verified: "205 + 52 × 8 + 85 - 48" = 205+416+85-48 = 658.
3. BRACKET_SUM: "base +/- (p +/- q) +/- c +/- d x e" -- bracket wraps a
   SUM/difference (not a product), separate unbracketed product in the
   tail. Verified: "77 - (50 + 18) + 25 + 40 × 2" = 77-68+25+80 = 114.
4. PRODUCT_AFTER_TAIL (new for BM, not present in PM-L4's workbook): the
   bracketed product is positioned AFTER a plain leading tail term rather
   than immediately after the base -- "base +/- c +/- (a x b) [+/- d]".
   Verified against literal BM rows:
     "37 + 88 - (9 × 9) + 58" = 37+88-81+58 = 102.
     "99 + 68 - (11 × 7) + 33" = 99+68-77+33 = 123.
     "89 + 72 - (12 × 6) + 66" = 89+72-72+66 = 155.
   (A handful of BM rows extend this to a 5th trailing term, e.g.
   "94 - 53 - (8 × 7) + 87 - 12"; the 4-term shape here is the
   representative form, matching PM-L4's own precedent of using a
   representative shape rather than replaying every literal term count.)

The seed config (bridge_module_l1_config.py) assigns these four templates
round-robin across the level's BODMAS-bearing DPS (Lessons 17-40) for
variety.

Display: EXPRESSION_WORKSHEET (never COMPACT_EXPRESSION -- that caused
PM-L3's line-wrapping bug). question_text carries the built expression
string; drill_operands empty; operands/operators are the same
[expression]/[""] placeholder shape every other level's BODMAS generator
uses.
"""


def _fmt(value: int) -> str:
    return str(value)


def generate_bracket_product_question(config: BMBodmasConfig, rng: random.Random) -> dict:
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
                "generation_template": BODMAS_BM_BRACKET_PRODUCT,
            },
        }
    raise ValueError(f"BM lesson {config.lesson_number}: could not generate a valid BRACKET_PRODUCT BODMAS question")


def generate_plain_product_question(config: BMBodmasConfig, rng: random.Random) -> dict:
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
                "generation_template": BODMAS_BM_PLAIN_PRODUCT,
            },
        }
    raise ValueError(f"BM lesson {config.lesson_number}: could not generate a valid PLAIN_PRODUCT BODMAS question")


def generate_bracket_sum_question(config: BMBodmasConfig, rng: random.Random) -> dict:
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
                "generation_template": BODMAS_BM_BRACKET_SUM,
            },
        }
    raise ValueError(f"BM lesson {config.lesson_number}: could not generate a valid BRACKET_SUM BODMAS question")


def generate_product_after_tail_question(config: BMBodmasConfig, rng: random.Random) -> dict:
    """"base +/- c +/- (a x b) [+/- d]" -- the bracketed product sits AFTER
    a plain leading tail term rather than immediately after the base, e.g.
    "37 + 88 - (9 x 9) + 58". See module docstring for verified samples.
    """
    for _attempt in range(100):
        base = rng.randint(config.base_min, config.base_max)
        c = rng.randint(config.tail_min, config.tail_max)
        c_sign = rng.choice(("+", "-"))
        a = rng.randint(config.multiplier_left_min, config.multiplier_left_max)
        b = rng.randint(config.multiplier_right_min, config.multiplier_right_max)
        product = a * b
        product_sign = rng.choice(("+", "-"))

        running = base + c if c_sign == "+" else base - c
        running = running + product if product_sign == "+" else running - product

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

        expression = f"{_fmt(base)} {c_sign} {_fmt(c)} {product_sign} ({_fmt(a)} × {_fmt(b)})"
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
                "generation_template": BODMAS_BM_PRODUCT_AFTER_TAIL,
            },
        }
    raise ValueError(f"BM lesson {config.lesson_number}: could not generate a valid PRODUCT_AFTER_TAIL BODMAS question")


def generate_bodmas_question(config: BMBodmasConfig, rng: random.Random) -> dict:
    if config.template == BODMAS_BM_BRACKET_PRODUCT:
        return generate_bracket_product_question(config, rng)
    if config.template == BODMAS_BM_PLAIN_PRODUCT:
        return generate_plain_product_question(config, rng)
    if config.template == BODMAS_BM_BRACKET_SUM:
        return generate_bracket_sum_question(config, rng)
    if config.template == BODMAS_BM_PRODUCT_AFTER_TAIL:
        return generate_product_after_tail_question(config, rng)
    raise ValueError(f"Unknown BM BODMAS template: {config.template}")
