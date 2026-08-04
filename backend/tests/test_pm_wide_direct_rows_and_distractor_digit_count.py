"""Regression coverage for two PM-L1 fixes requested 2026-08-04 (Shailesh):

1. Bridge Module Lesson 2's genuine 2/3-digit direct addition-subtraction
   sheets (digit patterns 2D_FULL, 3D_HUNDREDS, 3D_FULL) previously only
   ever carried the target digit width on the starting row -- the other two
   rows were always single-digit (1-9), so a "double/triple digit direct
   addition" sheet never actually tested double/triple digit arithmetic.
   Now at least 2 of the 3 rows must be exactly the target width (optionally
   all 3), with any remaining row a mix of 1/2/3 digits, and which row is
   the odd one out varies question to question rather than being fixed.
   Every step must still be a pure DIRECT bead movement -- no complement/
   carry at any digit place -- since this is what makes it a "direct"
   addition/subtraction concept at all.

2. MCQ distractors for PM specifically must share the correct answer's own
   digit count, not just its last digit -- PM is a foundational level with
   small, simple answers, where a visibly different-width option (e.g.
   correct=9, options 9/29/39/59) can be picked out on sight with zero
   arithmetic. This is opt-in on the shared smart_distractors.py module
   (enforce_same_digit_count, default off) so MM/IM/YLM's own distractor
   behavior is untouched -- only PM's distractors.py turns it on.
"""
from __future__ import annotations

import random
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import DPS, Lesson, Level, Module
from app.question_engine.pm import PMConfig, generate_pm_question_set
from app.question_engine.smart_distractors import generate_smart_distractors, select_best_distractors
from app.seed.preparatory_module_l1_config import PM_L1_LESSONS
from app.seed.seed_preparatory_module import seed as seed_pm
from app.services.generation_service import build_preview_seed, generate_preview

WIDE_DIGIT_PATTERNS = {"2D_FULL": 2, "3D_HUNDREDS": 3, "3D_FULL": 3}


def _row_widths(operands: list[int]) -> list[int]:
    return [len(str(abs(v))) if v != 0 else 1 for v in operands]


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    models.Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def pm_lesson2_dps(db):
    seed_pm(db)
    db.commit()
    module = db.query(Module).filter(Module.module_code == "PM").first()
    level = db.query(Level).filter(Level.module_id == module.id, Level.level_code == "PM-L1").first()
    lesson2 = db.query(Lesson).filter(Lesson.level_id == level.id, Lesson.lesson_number == 2).first()
    dps_rows = db.query(DPS).filter(DPS.lesson_id == lesson2.id).order_by(DPS.dps_number).all()
    return dps_rows


def test_wide_direct_dps_rows_have_at_least_two_at_target_width(pm_lesson2_dps, db):
    rule2 = PM_L1_LESSONS[2]
    for dps in pm_lesson2_dps:
        dps_rule = rule2.dps[dps.dps_number]
        target_width = WIDE_DIGIT_PATTERNS.get(dps_rule.digit_pattern.upper())
        assert target_width is not None, f"unexpected digit pattern {dps_rule.digit_pattern} for Lesson 2 DPS {dps.dps_number}"

        questions = generate_preview(db, dps, build_preview_seed(dps))
        assert len(questions) == 10

        odd_row_positions_seen: set[int | None] = set()
        for question in questions:
            operands = question["operands"]
            assert len(operands) == 3
            widths = _row_widths(operands)
            matching_rows = [index for index, width in enumerate(widths) if width == target_width]
            assert len(matching_rows) >= 2, (
                f"DPS {dps.dps_number} ({dps_rule.dps_title}): expected at least 2 of 3 rows at "
                f"{target_width} digits, got widths={widths} for operands={operands}"
            )
            # 2026-08-04 correction: no row -- and no running total, including
            # the final answer -- may ever exceed the concept's own digit
            # width. A "double digit" sheet must never show a triple-digit
            # row or a triple-digit running total, even if that triple-digit
            # value only ever appeared as an intermediate/final total rather
            # than a single printed row. This is the exact glitch caught
            # after the first cut of this fix: the mixed row's width was
            # sampled from {1,2,3} unconditionally, so a 2D_FULL sheet could
            # (and did) show a 3-digit row.
            running = operands[0]
            widths_seen = [widths[0]]
            for operand in operands[1:]:
                running += operand
                widths_seen.append(len(str(abs(running))) if running != 0 else 1)
            assert max(widths_seen) <= target_width, (
                f"DPS {dps.dps_number} ({dps_rule.dps_title}): a row or running total exceeded "
                f"{target_width} digits -- operands={operands}, running totals width sequence={widths_seen}"
            )
            non_matching = [index for index in range(3) if index not in matching_rows]
            odd_row_positions_seen.add(non_matching[0] if non_matching else None)

            # Every step must be a pure DIRECT bead movement -- a "direct"
            # sheet must never silently include a complement-technique step.
            concept_tags = set(question["metadata"]["concept_tags"])
            assert concept_tags <= {"DIRECT"}, (
                f"DPS {dps.dps_number}: expected only DIRECT movement tags, got {concept_tags} "
                f"for operands={operands}"
            )

        # "Jumbled ordering" -- the odd-row-out position (or "all 3 match")
        # must not be pinned to a single fixed slot across a whole 10-question
        # sheet. (Only meaningfully checkable when the sheet contains at
        # least one question with an actual odd row -- if literally every
        # question happened to land on "all 3 rows match", that's still a
        # valid outcome per the requirement and isn't itself a failure.)
        if odd_row_positions_seen - {None}:
            assert len(odd_row_positions_seen) > 1 or None in odd_row_positions_seen, (
                f"DPS {dps.dps_number}: odd row position never varied across the sheet "
                f"(always {odd_row_positions_seen})"
            )


def test_wide_direct_pattern_also_fixes_mock_assessment_concept_pool_entries():
    """The mock/assessment concept pool entries for Direct Addition/
    Subtraction Double/Triple Digit and Round Hundreds reuse this same
    digit_pattern-driven engine path -- confirms the fix reaches them too,
    with no separate mock-specific code needed."""
    for digit_pattern, target_width in WIDE_DIGIT_PATTERNS.items():
        for operation_focus in ("ADDITION", "SUBTRACTION"):
            if digit_pattern == "3D_HUNDREDS" and operation_focus == "SUBTRACTION":
                continue  # deliberately absent -- see pm_competition_mock_generation_service.py
            config = PMConfig(
                module_code="PM", level_code="PM-L1", lesson_number=0, dps_number=0,
                question_count=10, concept_family="DIRECT_ADD_LESS", operation_focus=operation_focus,
                digit_pattern=digit_pattern, generation_template="DIRECT",
                seed=f"TEST-MOCKPOOL-{digit_pattern}-{operation_focus}",
            )
            questions = generate_pm_question_set(config)
            assert len(questions) == 10
            for question in questions:
                operands = question["operands"]
                widths = _row_widths(operands)
                matching = sum(1 for width in widths if width == target_width)
                assert matching >= 2, (
                    f"{digit_pattern}/{operation_focus}: expected >=2 rows at {target_width} digits, "
                    f"got widths={widths} operands={operands}"
                )
                running = operands[0]
                widths_seen = [widths[0]]
                for operand in operands[1:]:
                    running += operand
                    widths_seen.append(len(str(abs(running))) if running != 0 else 1)
                assert max(widths_seen) <= target_width, (
                    f"{digit_pattern}/{operation_focus}: a row or running total exceeded "
                    f"{target_width} digits -- operands={operands}, widths seen={widths_seen}"
                )


def test_every_pm_l1_dps_mcq_options_match_correct_answer_digit_count(db):
    """Every option offered for every PM-L1 DPS must have the same digit
    count as the correct answer -- the regression this whole fix guards
    against (a single-digit correct answer sitting next to two-digit
    distractors, visibly guessable without solving)."""
    seed_pm(db)
    module = db.query(Module).filter(Module.module_code == "PM").first()
    level = db.query(Level).filter(Level.module_id == module.id, Level.level_code == "PM-L1").first()
    lessons = db.query(Lesson).filter(Lesson.level_id == level.id).order_by(Lesson.lesson_number).all()

    failures: list[str] = []
    for lesson in lessons:
        dps_rows = db.query(DPS).filter(DPS.lesson_id == lesson.id).order_by(DPS.dps_number).all()
        for dps in dps_rows:
            questions = generate_preview(db, dps, build_preview_seed(dps))
            for question in questions:
                correct = question["correct_answer"]
                correct_width = len(str(abs(correct))) if correct != 0 else 1
                for option in question["options"]:
                    value = int(option["value"])
                    option_width = len(str(abs(value))) if value != 0 else 1
                    if option_width != correct_width:
                        failures.append(
                            f"L{lesson.lesson_number} DPS{dps.dps_number}: answer={correct} "
                            f"(width {correct_width}) has option {value} (width {option_width})"
                        )
    assert not failures, "\n" + "\n".join(failures)


def test_enforce_same_digit_count_drops_last_digit_rule_for_single_digit_answers():
    """Single-digit correct answers can never satisfy both same-last-digit
    and same-digit-count at once (a 1-digit number's last digit IS the
    number), so enforce_same_digit_count must drop the last-digit
    requirement there rather than come up empty."""
    rng = random.Random("TEST-SINGLE-DIGIT")
    for correct in (0, 1, 4, 9):
        distractors = select_best_distractors(
            Decimal(correct), [[]], rng, allow_negative=False, count=3,
            enforce_same_digit_count=True,
        )
        assert len(distractors) == 3
        for value in distractors:
            assert 0 <= int(value) <= 9
            assert int(value) != correct


def test_enforce_same_digit_count_keeps_both_rules_for_multi_digit_answers():
    rng = random.Random("TEST-MULTI-DIGIT")
    for correct in (63, 204, 999):
        distractors = select_best_distractors(
            Decimal(correct), [[]], rng, allow_negative=False, count=3,
            enforce_same_digit_count=True,
        )
        assert len(distractors) == 3
        correct_width = len(str(correct))
        for value in distractors:
            assert value != correct
            assert len(str(abs(int(value)))) == correct_width
            assert int(value) % 10 == correct % 10


def test_pm_distractors_generator_enforces_digit_count_end_to_end():
    from app.question_engine.pm.distractors import generate_distractors

    rng = random.Random("TEST-PM-DISTRACTORS")
    for correct, operands in ((9, [5, 4, 0]), (63, [60, 1, 2]), (204, [200, 2, 2])):
        distractors = generate_distractors(correct, operands, rng, allow_negative=False)
        assert len(distractors) == 3
        correct_width = len(str(correct)) if correct != 0 else 1
        for value in distractors:
            assert len(str(abs(value))) == correct_width
            assert value != correct


def test_mm_im_ylm_distractor_default_behavior_is_unchanged():
    """enforce_same_digit_count defaults to False -- confirms the flag is
    genuinely opt-in and MM/IM/YLM's existing call sites (which never pass
    it) keep their original last-digit-only guarantee, with no digit-count
    constraint silently applied."""
    rng = random.Random("TEST-DEFAULT-BEHAVIOR")
    # A correct answer whose only same-last-digit multi-digit neighbours are
    # a different width than itself -- if the digit-count constraint were
    # silently active, none of these could ever appear; they must be
    # reachable when the flag is left at its default.
    correct_answer = Decimal(9)
    seen_different_width = False
    for _ in range(200):
        distractors = generate_smart_distractors(
            correct_answer, rng, "ADD_SUBTRACT", [Decimal(5), Decimal(4)], allow_negative=False,
        )
        for value in distractors:
            assert int(value) % 10 == 9  # last-digit rule still enforced
            if len(str(abs(int(value)))) != 1:
                seen_different_width = True
    assert seen_different_width, (
        "expected the unflagged default path to still produce different-width "
        "distractors sometimes (proving enforce_same_digit_count truly defaults off)"
    )
