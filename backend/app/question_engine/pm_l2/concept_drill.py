from __future__ import annotations

import random

from app.question_engine.option_utils import build_mcq_options
from app.question_engine.pm_l2.config import (
    PML2ConceptDrillConfig,
    DRILL_MULTIPLY,
    DRILL_DIVIDE,
    DRILL_RANGE_SUM,
)
from app.question_engine.pm_l2.distractors import (
    generate_multiply_distractors,
    generate_divide_distractors,
    generate_range_sum_distractors,
)

"""PM-L2's "CONCEPT DRILL (ABACUS)" question generation -- confirmed against
Lessons 1-8, 10-12 of Level 2.xlsx (absent only in Lesson 9) plus the
matching DPS images. Genuinely not a variant of the vertical 3-row add/less
stack every other PM-L1/PM-L2 question uses -- three distinct formats, each
with its own answer formula, clarified directly by Shailesh (2026-08-05):

1. MULTIPLY (columns SL/ADD/TIMES/ANSWER): answer = ADD * TIMES -- plain
   multiplication, taught as repeated addition on the abacus. Every literal
   instance in the workbook uses TIMES = 12; ADD climbs lesson to lesson
   (34 in Lesson 3 up to 155 in Lesson 12).

2. DIVIDE (columns SL/FROM/LESS/ANSWER): answer = FROM repeatedly less LESS,
   stopping the moment the next subtraction would go below 0 -- i.e. FROM
   mod LESS, but the student is doing the actual repeated subtraction on the
   abacus, not a modulo shortcut. Shailesh's explicit 2026-08-05 instruction:
   never generate a pair where FROM is an exact multiple of LESS (remainder
   0) -- that answer is guessable on sight without doing the subtraction, so
   REMAINDER_ZERO pairs are hard-rejected below.

3. RANGE_SUM (columns SL/FROM/TO/ANSWER, Lessons 1 & 2 only): answer = sum of
   an arithmetic sequence. The workbook's own Excel formula (confirmed by
   Shailesh) is SUMPRODUCT(ROW(INDIRECT("1:n"))*step) = step * n*(n+1)/2 --
   i.e. the sum of the first n multiples of `step`. Lesson 1's two rows have
   no named-sequence label, and back-solving against the workbook's own
   answer-check values proves step there is literally FROM's own value
   (FROM=1 -> step 1, FROM=2 -> step 2). Lesson 2 instead carries an explicit
   text label ("CONSECUTIVE NUMBERS 1-30" / "ODD NUMBERS 1-30") that
   overrides the mechanical FROM-is-the-step rule -- both of Lesson 2's rows
   share FROM=1,TO=30, and only the label distinguishes step 1 (consecutive)
   from step 2 starting at 1 (odd) -- applying the mechanical rule to the
   "odd" row would silently produce the consecutive answer (465) instead of
   the correct one (225). See RANGE_SUM_ARCHETYPES below.
"""


def compute_multiply_answer(add_value: int, times_value: int) -> int:
    return add_value * times_value


def compute_divide_answer(from_value: int, less_value: int) -> int:
    """FROM repeatedly less LESS until doing so again would go < 0 --
    mathematically FROM % LESS, but framed as the actual repeated-
    subtraction process a student performs on the abacus (Shailesh,
    2026-08-05).
    """
    if less_value <= 0:
        raise ValueError("LESS must be positive")
    return from_value % less_value


def is_guessable_divide_pair(from_value: int, less_value: int) -> bool:
    """True if FROM divides evenly by LESS (remainder 0) -- rejected per
    Shailesh's explicit instruction: a zero answer is guessable without
    doing the subtraction.
    """
    return less_value > 0 and from_value % less_value == 0


# RANGE_SUM archetypes -- (sequence_label, start_offset_from_step) -- "start
# equals step" reproduces Lesson 1's unlabeled mechanical rule; "start fixed
# at 1" reproduces Lesson 2's labelled CONSECUTIVE/ODD rows. Only these three
# shapes are backed by real workbook data (Lessons 1-2 only; no other lesson
# uses RANGE_SUM), so generation never invents a fourth shape.
RANGE_SUM_MULTIPLES = "MULTIPLES"     # from = step, e.g. Lesson 1's two rows
RANGE_SUM_CONSECUTIVE = "CONSECUTIVE"  # from = 1, step = 1, e.g. Lesson 2 row 1
RANGE_SUM_ODD = "ODD"                 # from = 1, step = 2, e.g. Lesson 2 row 2


def resolve_range_sum_sequence(archetype: str, step_or_bound: int, n_terms: int) -> tuple[int, int, int]:
    """Returns (effective_from, effective_step, effective_to) for the given
    archetype. `step_or_bound` is the counting step for MULTIPLES, or unused
    (kept 1) for CONSECUTIVE/ODD.
    """
    if archetype == RANGE_SUM_MULTIPLES:
        step = max(1, int(step_or_bound))
        return step, step, step * n_terms
    if archetype == RANGE_SUM_ODD:
        return 1, 2, 1 + 2 * (n_terms - 1)
    # CONSECUTIVE (default)
    return 1, 1, n_terms


def compute_range_sum_answer(effective_from: int, effective_step: int, n_terms: int) -> int:
    """Closed-form sum of an n-term arithmetic sequence starting at
    effective_from, incrementing by effective_step each term -- exact for
    every archetype above (verified against all 4 literal workbook answers:
    210, 420, 465, 225).
    """
    return n_terms * effective_from + effective_step * n_terms * (n_terms - 1) // 2


def generate_multiply_question(config: PML2ConceptDrillConfig, rng: random.Random) -> dict:
    add_value = rng.randint(config.add_min, config.add_max)
    times_value = config.times_value
    correct_answer = compute_multiply_answer(add_value, times_value)
    distractors = generate_multiply_distractors(correct_answer, rng)
    options = build_mcq_options(correct_answer, distractors, rng)
    return {
        "display_type": "CONCEPT_DRILL_MULTIPLY",
        # 2026-08-05, later still: was a written sentence ("34 × 12 = ?"), but
        # the platform already has an established box convention for this
        # exact shape -- IM's Skill Stacker (ADD x TIMES, a different formula,
        # but the same [Add, Times] box) renders as a labeled 2-column card
        # via SKILL_STACKER_TABLE/CompactTwoColumnQuestion, and the literal
        # workbook image (Lesson 3 DPS5) shows this as SL/ADD/TIMES/ANSWER
        # columns with no per-question caption. question_text=None (no
        # caption) matches that image exactly; the box itself is built from
        # operands/operators below, same as every other level's equivalent.
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


def generate_divide_question(config: PML2ConceptDrillConfig, rng: random.Random) -> dict:
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
            # Same box-convention fix as MULTIPLY above -- FROM/LESS is
            # literally IM/MM's own existing Concept Drill shape
            # (CONCEPT_DRILL_TABLE/CompactTwoColumnQuestion, labels "From"/
            # "Less"), and the workbook image (Lesson 3 DPS5) shows this as
            # SL/FROM/LESS/ANSWER columns with no per-question caption.
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
    raise ValueError(f"PM-L2 lesson {config.lesson_number}: could not generate a valid DIVIDE concept-drill pair")


def generate_range_sum_question(config: PML2ConceptDrillConfig, rng: random.Random, archetype: str | None = None, n_terms: int | None = None) -> dict:
    archetype = archetype or rng.choice((RANGE_SUM_MULTIPLES, RANGE_SUM_CONSECUTIVE, RANGE_SUM_ODD))
    n_terms = n_terms or rng.randint(10, 30)
    # step=1 excluded from the random choice for MULTIPLES specifically --
    # "multiples of 1" is mathematically identical to plain consecutive
    # numbers (every integer is a multiple of 1), which would caption as
    # "Multiples of 1" while being indistinguishable in effect from the
    # CONSECUTIVE archetype's own "Consecutive Numbers" -- confusing, not
    # crystal clear. CONSECUTIVE/ODD ignore step_or_bound entirely (see
    # resolve_range_sum_sequence), so this only narrows MULTIPLES's range.
    step_or_bound = config.range_step or (
        rng.choice((2, 3, 4, 5)) if archetype == RANGE_SUM_MULTIPLES else 1
    )
    effective_from, effective_step, effective_to = resolve_range_sum_sequence(archetype, step_or_bound, n_terms)
    correct_answer = compute_range_sum_answer(effective_from, effective_step, n_terms)
    distractors = generate_range_sum_distractors(correct_answer, rng)
    options = build_mcq_options(correct_answer, distractors, rng)
    # 2026-08-05, later still: was a full written sentence ("Sum the numbers
    # from 1 to 30."). Fixed to match the workbook's own SL/FROM/TO/ANSWER
    # box (Lesson 1/2 DPS5 images) instead -- a "From"/"To" 2-column card,
    # same CompactTwoColumnQuestion component IM/MM's own Concept Drill and
    # Skill Stacker already use. The one thing the box alone can't convey is
    # WHICH numbers to sum: Lesson 2's image shows two rows with identical
    # FROM=1/TO=30 values, distinguished only by a caption above each box
    # ("CONSECUTIVE NUMBERS 1-30" vs "ODD NUMBERS 1-30") -- without that
    # caption the two are mathematically indistinguishable. The MULTIPLES
    # archetype (Lesson 1) has no per-row caption in the workbook at all, but
    # that sheet only ever shows two fixed, one-time number pairs with
    # implied classroom context; this platform regenerates fresh random
    # FROM/step/TO every attempt, so a caption is needed there too for the
    # question to be solvable standalone (Shailesh's explicit call,
    # 2026-08-05: "clear labelling on top of the box which would communicate
    # everything to the student in a crystal clear way").
    # Caption keys off the EFFECTIVE step, not just the archetype name --
    # live-verification catch (2026-08-05, later still): Lesson 1's own
    # literal seeded DPS row (FROM=1, TO=20, an explicit workbook value, not
    # a random draw) passes step=1 through MULTIPLES, which is mathematically
    # identical to CONSECUTIVE (every number is a multiple of 1) but would
    # otherwise caption as the confusing "Multiples of 1". Captioning by
    # effective step catches this regardless of whether step=1 arrived via
    # explicit config (literal DPS content) or, previously, random choice
    # (now excluded above, but this is the more robust fix of the two).
    if archetype == RANGE_SUM_ODD:
        caption = "Odd Numbers"
    elif archetype == RANGE_SUM_CONSECUTIVE or effective_step == 1:
        caption = "Consecutive Numbers"
    else:
        caption = f"Multiples of {effective_step}"
    return {
        "display_type": "CONCEPT_DRILL_RANGE_SUM",
        "question_text": caption,
        "drill_operands": {"FROM": effective_from, "TO": effective_to},
        "operands": [effective_from, effective_to],
        "operators": ["From", "To"],
        "correct_answer": correct_answer,
        "options": options,
        "metadata": {
            "concept_family": "CONCEPT_DRILL",
            "generation_template": "CONCEPT_DRILL_RANGE_SUM",
            "sequence_label": archetype,
        },
    }


def generate_concept_drill_question(config: PML2ConceptDrillConfig, rng: random.Random) -> dict:
    if config.drill_format == DRILL_MULTIPLY:
        return generate_multiply_question(config, rng)
    if config.drill_format == DRILL_DIVIDE:
        return generate_divide_question(config, rng)
    if config.drill_format == DRILL_RANGE_SUM:
        return generate_range_sum_question(config, rng)
    raise ValueError(f"Unknown PM-L2 concept-drill format: {config.drill_format}")
