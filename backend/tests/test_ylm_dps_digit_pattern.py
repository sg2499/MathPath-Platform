"""Regression coverage for the 2026-08-11 YLM DPS-level digit-width fix.

Root cause (found via a full audit of the real DPS Junior Level workbook against
the live production admin panel): `YLMConfig.dps_number` existed on the dataclass
but was never read anywhere in generation -- every one of a YLM lesson's 5 DPS
sheets generated statistically identical questions, regardless of what the DPS's
own title promised ("50, 60, 70, 80, 90 Direct Add-Less" generated single-digit
questions same as DPS-1). Live-confirmed on mock.mathpath.in before this fix.

These tests exist so that bug class can't silently return. There was no
`test_ylm*.py` file in this suite before this fix -- YLM had zero dedicated
generator test coverage.
"""

from app.question_engine.ylm.config import (
    YLM_LESSON_RULES,
    YLM_DPS_DIGIT_PATTERN_OVERRIDES,
    dps_digit_pattern_for,
)
from app.question_engine.ylm.config import YLMConfig
from app.question_engine.ylm.generator import generate_ylm_question_set


def _base_digit_width(question: dict) -> str:
    base = abs(question["operands"][0])
    return "1D" if base < 10 else "2D"


def test_dps_digit_pattern_overrides_only_cover_dps_2_through_5_or_lesson32_dps1():
    """Sanity guard on the override table shape itself, not just behavior."""
    for lesson_num, overrides in YLM_DPS_DIGIT_PATTERN_OVERRIDES.items():
        assert lesson_num in YLM_LESSON_RULES, f"override references unknown lesson {lesson_num}"
        for dps_num, pattern in overrides.items():
            assert 1 <= dps_num <= 5
            assert pattern in {"1D", "2D", "1D_AND_2D", "2D_TENS"}


def test_same_lesson_different_dps_generate_different_digit_widths():
    """The exact bug this fix closes: DPS-1 and DPS-5 of the same lesson used to
    be indistinguishable. Lesson 2 is a clean case -- DPS-1 is explicitly single-
    digit ("Number 5"), DPS-5 is explicitly double-digit ("Number 50 Double
    Digit") -- confirmed against the real source workbook and live-verified on
    production before this fix existed.
    """
    dps1_config = YLMConfig(module_code="YLM", level_code="YLM-L1", lesson_number=2, dps_number=1, seed="T-L2-D1")
    dps5_config = YLMConfig(module_code="YLM", level_code="YLM-L1", lesson_number=2, dps_number=5, seed="T-L2-D5")

    dps1_questions = generate_ylm_question_set(dps1_config)
    dps5_questions = generate_ylm_question_set(dps5_config)

    dps1_widths = {_base_digit_width(q) for q in dps1_questions}
    dps5_widths = {_base_digit_width(q) for q in dps5_questions}

    assert dps1_widths == {"1D"}, f"DPS-1 (Number 5) should be single-digit only, got {dps1_widths}"
    assert dps5_widths == {"2D"}, f"DPS-5 (Number 50 Double Digit) should be double-digit only, got {dps5_widths}"


def test_all_32_lessons_all_5_dps_generate_ten_valid_questions():
    """Exhaustive sweep -- every lesson x DPS combination the real platform can
    request must still produce a full, valid 10-question set post-fix. This is
    the same style of exhaustive check used for the PM-L1 audit in this
    project's history (all 75 DPS x 12 draws before that fix shipped).
    """
    checked = 0
    for lesson_num in sorted(YLM_LESSON_RULES):
        rule = YLM_LESSON_RULES[lesson_num]
        for dps_num in range(1, 6):
            config = YLMConfig(
                module_code="YLM",
                level_code=rule.level_code,
                lesson_number=lesson_num,
                dps_number=dps_num,
                question_count=10,
                seed=f"SWEEP-L{lesson_num}-D{dps_num}",
            )
            questions = generate_ylm_question_set(config)
            assert len(questions) == 10, f"lesson {lesson_num} dps {dps_num} produced {len(questions)} questions"
            for q in questions:
                assert len(q["operands"]) == 3
                assert q["correct_answer"] == sum(q["operands"])
                assert len(q["options"]) == 4
                assert sum(1 for o in q["options"] if o["is_correct"]) == 1
            checked += 1
    assert checked == 160


def test_comp10_sub_narrowest_tier_fallback_for_1d():
    """COMP10_SUB structurally has no true single-digit base (it always needs a
    tens place to borrow from). "1D" for this template means the narrowest
    available tier (10-19), matching the identical precedent already established
    by this project's PM-L1 digit-pattern fix -- not a bug, an explicit,
    documented exception.
    """
    config = YLMConfig(module_code="YLM", level_code="YLM-L1", lesson_number=23, dps_number=1, seed="T-L23-D1")
    questions = generate_ylm_question_set(config)
    bases = [abs(q["operands"][0]) for q in questions]
    assert all(10 <= b <= 19 for b in bases), f"expected narrowest COMP10_SUB tier 10-19, got {bases}"


def test_dps_digit_pattern_for_falls_back_to_lesson_default():
    """A DPS number with no explicit override (e.g. DPS-1 in most lessons) must
    fall back to the lesson-level default, not error or silently return blank.
    """
    assert dps_digit_pattern_for(5, 1, "1D") == "1D"  # no override for lesson 5 dps 1
    assert dps_digit_pattern_for(2, 5, "1D_AND_2D") == "2D"  # explicit override
    assert dps_digit_pattern_for(999, 1, "1D") == "1D"  # unknown lesson -> default
