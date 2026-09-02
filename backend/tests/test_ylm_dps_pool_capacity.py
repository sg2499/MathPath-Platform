"""Regression coverage for the 2026-09-02 YLM DPS question-repetition fix.

Root cause, live-confirmed on production (YLM-L1 Lesson 3 DPS-1, "Addition of 1
using Complement of 5"): questions 5-10 of a real assigned sheet were all
identical. Two compounding bugs:

1. 18 of the 32 lessons' narrow single-target Complement-of-5/10 DPS sheets
   (single addition/subtraction target, "1D" digit pattern) have mathematically
   only 4-9 unique valid Golden-Step question combinations at the standard
   3-operand row shape, far short of the 10 questions a sheet needs.
2. generate_unique_operands() derived its progression position from
   len(seen) instead of the real loop position. Once a narrow pool ran out of
   unique combinations, seen.add() of a repeated tuple was a no-op, so
   len(seen) -- and the difficulty stage it drove -- froze permanently, which
   meant every remaining question landed on the exact same difficulty bucket
   and picked the exact same leftover combination instead of rotating.

Fixed via a new per-DPS row-count override (YLM_DPS_ROWS_OVERRIDES, mirroring
the existing per-DPS digit-pattern override) that adds one extra direct-support
row to exactly the 18 affected sheets -- enough to push every one of them to
>= 10 unique combinations -- plus passing generate_ylm_question_set()'s real
loop position into generate_unique_operands() so any future reuse rotates
instead of locking onto one combination.

These tests exist so this bug class -- a DPS sheet repeating the same question
multiple times -- can never silently ship again for any of YLM's 160 lesson x
DPS combinations, regardless of future curriculum edits to YLM_LESSON_RULES or
either override table.
"""

from app.question_engine.ylm.config import YLM_LESSON_RULES, YLM_DPS_ROWS_OVERRIDES
from app.question_engine.ylm.config import YLMConfig
from app.question_engine.ylm.generator import generate_ylm_question_set
from app.question_engine.ylm.operands import build_candidate_pool


def test_dps_rows_overrides_only_widen_never_shrink():
    """Sanity guard on the override table shape: it may only ever raise a DPS's
    row count above its lesson default (widening for more variety), never lower
    it -- a lower row count would change the worksheet's taught shape, which is
    a curriculum decision, not something this capacity fix should ever do
    silently.
    """
    for lesson_num, overrides in YLM_DPS_ROWS_OVERRIDES.items():
        assert lesson_num in YLM_LESSON_RULES, f"override references unknown lesson {lesson_num}"
        rule = YLM_LESSON_RULES[lesson_num]
        for dps_num, rows in overrides.items():
            assert 1 <= dps_num <= 5
            assert rows > rule.rows, (
                f"lesson {lesson_num} dps {dps_num}: override rows={rows} must exceed "
                f"lesson default rows={rule.rows}"
            )


def test_every_lesson_dps_candidate_pool_covers_a_full_sheet():
    """Exhaustive sweep: every one of YLM's 160 lesson x DPS combinations must have
    a candidate pool of at least 10 unique valid operand combinations -- the exact
    check that would have caught the Lesson 3 DPS-1 bug (pool size 4) before it
    ever shipped. This checks pool capacity directly, independent of any
    particular generation seed or selection strategy.
    """
    shortfalls = []
    for lesson_num in sorted(YLM_LESSON_RULES):
        rule = YLM_LESSON_RULES[lesson_num]
        for dps_num in range(1, 6):
            config = YLMConfig(
                module_code="YLM",
                level_code=rule.level_code,
                lesson_number=lesson_num,
                dps_number=dps_num,
                seed=f"CAPACITY-L{lesson_num}-D{dps_num}",
            )
            pool = build_candidate_pool(config)
            if len(pool) < 10:
                shortfalls.append((lesson_num, dps_num, len(pool)))
    assert not shortfalls, f"lesson/DPS combos with < 10 unique combinations: {shortfalls}"


def test_every_lesson_dps_generates_ten_distinct_questions_across_many_seeds():
    """Exhaustive sweep with several different seeds per combination: every
    generated 10-question sheet must contain 10 distinct operand combinations --
    no question may repeat anywhere on the sheet, regardless of seed. This is the
    end-to-end version of the pool-capacity check above, exercised through the
    real generator/selection path a student attempt actually uses.
    """
    seeds = ("SEED-A", "SEED-B", "SEED-C")
    repeats = []
    for lesson_num in sorted(YLM_LESSON_RULES):
        rule = YLM_LESSON_RULES[lesson_num]
        for dps_num in range(1, 6):
            for seed_tag in seeds:
                config = YLMConfig(
                    module_code="YLM",
                    level_code=rule.level_code,
                    lesson_number=lesson_num,
                    dps_number=dps_num,
                    seed=f"{seed_tag}-L{lesson_num}-D{dps_num}",
                )
                questions = generate_ylm_question_set(config)
                operand_tuples = [tuple(q["operands"]) for q in questions]
                unique_count = len(set(operand_tuples))
                if unique_count != len(operand_tuples):
                    repeats.append((lesson_num, dps_num, seed_tag, unique_count, len(operand_tuples)))
    assert not repeats, f"lesson/DPS/seed combos with a repeated question: {repeats}"


def test_lesson_3_dps_1_no_longer_repeats_the_live_confirmed_bug():
    """Direct regression test for the exact live-confirmed report: YLM-L1 Lesson 3
    DPS-1 ("Addition of 1 using Complement of 5") generating the same sum for
    questions 4 through 10.
    """
    config = YLMConfig(module_code="YLM", level_code="YLM-L1", lesson_number=3, dps_number=1, seed="LIVE-CONFIRMED-REPRO")
    questions = generate_ylm_question_set(config)
    operand_tuples = [tuple(q["operands"]) for q in questions]
    assert len(set(operand_tuples)) == 10, f"expected 10 distinct questions, got {operand_tuples}"
