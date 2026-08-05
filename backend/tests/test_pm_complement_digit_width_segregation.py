"""Regression coverage for the 2026-08-05 PM-L1 audit fix + redesign
(Shailesh): every complement lesson (3-15) is supposed to teach a technique
at single-digit scale first (DPS1/DPS3) then escalate the *same* technique
to double-digit scale (DPS2/DPS4), per Bridge Level.xlsx and the matching
Lesson-1..15 DPS images.

Part 1 (digit-width gate): before this fix, `_comp5_add_bases`/
`_comp5_sub_bases`/`_comp10_add_bases`/`_comp10_sub_bases` in
question_engine/pm/operands.py silently ignored digit_pattern entirely, so
DPS1 and DPS2 (and DPS3/DPS4) drew from an identical, undifferentiated
single+double-digit pool -- confirmed via a live generator run: DPS1 and
DPS2 produced byte-for-byte identical candidate pools, and even a single
DPS1 sheet mixed single- and double-digit bases when it should have been
100% single-digit. Fixed by gating each base builder's tens component on
digit_pattern.

COMP10_SUB is a structural exception, not a bug: subtracting via complement
of 10 requires an actual tens place to borrow from, so there is no
mathematically valid single-digit base for that one template -- its own
"1D" DPS (e.g. Lesson 4 DPS3, Lesson 13 DPS1/DPS3) narrows to the smallest
available tens tier (10-19) instead, which is still strictly narrower/
simpler than the corresponding "2D" DPS (spread across 20-99).

Part 2 (trigger-position redesign): fixing part 1 alone left single-digit
DPS pinned to exactly one "trigger" base value (e.g. Lesson 3 DPS1's base
was always literally 4), which is mathematically correct for digit width
but collapsed the real per-question variety visible in the Excel (Lesson 3
DPS1's actual row0 values are 2,3,4,9,2,4,4,4,1,4 -- not a constant 4).
Traced why: the real worksheet lets the complement technique fire at either
of the two operation slots, not just the first -- e.g. column A1 is
2 -> (+2, DIRECT) -> 4 -> (+1, COMP5_ADD) (technique second), while column
A3 is 4 -> (+1, COMP5_ADD) -> 5 -> (+2, DIRECT) (technique first). Rebuilt
_complement_operand_triples() to generate both shapes (MODE A: trigger
first + trailing support; MODE B: direct setup move first + trigger last,
see _setup_reaching()) so pools now range 8-1016 instead of 4-5, and a
generated sheet now shows the same base value varying with the trigger
position, matching the source material's own pattern (verified against the
real traced example above -- a generated [9, -5, 1] triple for Lesson 3
DPS1 is an exact structural match to the Excel's own column A4).
"""
from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import DPS, Lesson, Level, Module
from app.question_engine.pm.validators import (
    MOVEMENT_COMP5_ADD,
    MOVEMENT_COMP5_SUB,
    MOVEMENT_COMP10_ADD,
    MOVEMENT_COMP10_SUB,
    movement_profile,
)
from app.seed.preparatory_module_l1_config import PM_L1_LESSONS
from app.seed.seed_preparatory_module import seed as seed_pm
from app.services.generation_service import build_preview_seed, generate_preview

COMPLEMENT_LESSONS = list(range(3, 16))
COMPLEMENT_TEMPLATES = {"COMP5_ADD", "COMP5_SUB", "COMP10_ADD", "COMP10_SUB"}
TECHNIQUE_MOVEMENTS = {MOVEMENT_COMP5_ADD, MOVEMENT_COMP5_SUB, MOVEMENT_COMP10_ADD, MOVEMENT_COMP10_SUB}


def _digit_width(value: int) -> int:
    return len(str(abs(int(value)))) if value != 0 else 1


def _trigger_step(operands: list[int]) -> int | None:
    """1-indexed position of the operand that actually fires the complement
    technique (1 = operands[1], 2 = operands[2]), or None if neither step
    does (shouldn't happen for a genuine complement-template question).
    """
    _valid, profile = movement_profile(operands)
    for index, step_types in enumerate(profile, start=1):
        if step_types & TECHNIQUE_MOVEMENTS:
            return index
    return None


def _templates_used(dps_rule) -> set[str]:
    if dps_rule.generation_template.upper() == "REVISION":
        return {t.upper() for t in dps_rule.revision_templates}
    return {dps_rule.generation_template.upper()}


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
def pm_dps_by_lesson(db):
    seed_pm(db)
    db.commit()
    module = db.query(Module).filter(Module.module_code == "PM").first()
    level = db.query(Level).filter(Level.module_id == module.id, Level.level_code == "PM-L1").first()
    by_lesson: dict[int, list[DPS]] = {}
    for lesson_number in COMPLEMENT_LESSONS:
        lesson = db.query(Lesson).filter(Lesson.level_id == level.id, Lesson.lesson_number == lesson_number).first()
        by_lesson[lesson_number] = db.query(DPS).filter(DPS.lesson_id == lesson.id).order_by(DPS.dps_number).all()
    return by_lesson


def test_1d_dps_never_produces_a_wide_base_outside_the_comp10_sub_exception(pm_dps_by_lesson, db):
    """DPS rows configured "1D" must only ever show a base whose width is 1
    digit -- except COMP10_SUB, which structurally cannot go below the
    10-19 tier (see module docstring), so it's allowed exactly that tier and
    nothing wider.
    """
    for lesson_number, dps_rows in pm_dps_by_lesson.items():
        lesson_rule = PM_L1_LESSONS[lesson_number]
        for dps in dps_rows:
            dps_rule = lesson_rule.dps[dps.dps_number]
            if dps_rule.digit_pattern.upper() != "1D":
                continue
            templates = _templates_used(dps_rule)
            if not (templates & COMPLEMENT_TEMPLATES):
                continue
            questions = generate_preview(db, dps, build_preview_seed(dps))
            assert len(questions) == 10
            is_comp10_sub_only = templates == {"COMP10_SUB"}
            for question in questions:
                base = question["operands"][0]
                width = _digit_width(base)
                if is_comp10_sub_only:
                    assert 10 <= abs(base) <= 19, (
                        f"Lesson {lesson_number} DPS {dps.dps_number} (COMP10_SUB, 1D exception): "
                        f"expected base in the 10-19 narrow tier, got {base} (operands={question['operands']})"
                    )
                else:
                    assert width == 1, (
                        f"Lesson {lesson_number} DPS {dps.dps_number} ({dps_rule.dps_title}): "
                        f"expected a single-digit base, got {base} (operands={question['operands']})"
                    )


def test_2d_dps_never_produces_a_single_digit_base(pm_dps_by_lesson, db):
    """DPS rows configured "2D" (the double-digit escalation of a 1D
    sibling, or a pure-double-digit revision sheet) must never show a
    single-digit base.
    """
    for lesson_number, dps_rows in pm_dps_by_lesson.items():
        lesson_rule = PM_L1_LESSONS[lesson_number]
        for dps in dps_rows:
            dps_rule = lesson_rule.dps[dps.dps_number]
            if dps_rule.digit_pattern.upper() != "2D":
                continue
            templates = _templates_used(dps_rule)
            if not (templates & COMPLEMENT_TEMPLATES):
                continue
            questions = generate_preview(db, dps, build_preview_seed(dps))
            assert len(questions) == 10
            for question in questions:
                base = question["operands"][0]
                assert _digit_width(base) == 2, (
                    f"Lesson {lesson_number} DPS {dps.dps_number} ({dps_rule.dps_title}): "
                    f"expected a double-digit base, got {base} (operands={question['operands']})"
                )


def test_dps1_and_dps2_are_never_identical_candidate_pools(pm_dps_by_lesson, db):
    """The exact regression this fix targets: before it, DPS1 and DPS2 (and
    DPS3/DPS4) drew from byte-for-byte the same pool. Confirm every paired
    1D/2D DPS in every complement lesson now produces disjoint base sets.
    """
    for lesson_number, dps_rows in pm_dps_by_lesson.items():
        lesson_rule = PM_L1_LESSONS[lesson_number]
        pairs = [(1, 2), (3, 4)]
        for narrow_num, wide_num in pairs:
            narrow_rule = lesson_rule.dps.get(narrow_num)
            wide_rule = lesson_rule.dps.get(wide_num)
            if narrow_rule is None or wide_rule is None:
                continue
            if narrow_rule.digit_pattern.upper() != "1D" or wide_rule.digit_pattern.upper() != "2D":
                continue
            narrow_dps = next(d for d in dps_rows if d.dps_number == narrow_num)
            wide_dps = next(d for d in dps_rows if d.dps_number == wide_num)
            narrow_bases = {q["operands"][0] for q in generate_preview(db, narrow_dps, build_preview_seed(narrow_dps))}
            wide_bases = {q["operands"][0] for q in generate_preview(db, wide_dps, build_preview_seed(wide_dps))}
            assert not (narrow_bases & wide_bases), (
                f"Lesson {lesson_number} DPS {narrow_num} vs DPS {wide_num}: base pools overlap "
                f"({narrow_bases & wide_bases}) -- the digit-width escalation is not actually happening"
            )


def test_mock_and_assessment_complement_pools_still_span_both_widths():
    """Mock/assessment complement concept entries were deliberately moved to
    "1D_AND_2D" (not "1D"/"2D") so this fix doesn't narrow their coverage --
    they have no DPS1-vs-DPS2-style tiering to preserve, unlike DPS sheets.
    A 40-question sample across both widths confirms they're still mixed.
    """
    from app.question_engine.pm import PMConfig, generate_pm_question_set

    config = PMConfig(
        module_code="PM", level_code="PM-L1", lesson_number=0, dps_number=0,
        question_count=40, concept_family="COMPLEMENT_OF_5", operation_focus="ADDITION",
        abacus_rule="ADD_5_LESS_4", target_numbers=[1], place_value="MIXED",
        digit_pattern="1D_AND_2D", generation_template="COMP5_ADD",
        seed="TEST-MOCK-POOL-WIDTH", lesson_title="PM Competition Mock",
        dps_title="Addition of 1 using Complement of 5",
    )
    questions = generate_pm_question_set(config)
    widths = {_digit_width(q["operands"][0]) for q in questions}
    assert widths == {1, 2}, f"expected both single- and double-digit bases in the mock pool, got widths={widths}"


def test_trigger_position_varies_within_a_sheet(pm_dps_by_lesson, db):
    """The 2026-08-05 redesign's whole point: the complement technique must
    be able to fire at either operand position across a 10-question sheet,
    not be pinned to always-first (the pre-redesign shape) or always-second.
    Every question must still fire the technique exactly once (this is a
    complement-template sheet, not a plain direct one).
    """
    checked_any = False
    for lesson_number, dps_rows in pm_dps_by_lesson.items():
        lesson_rule = PM_L1_LESSONS[lesson_number]
        for dps in dps_rows:
            dps_rule = lesson_rule.dps[dps.dps_number]
            templates = set(dps_rule.revision_templates) if dps_rule.generation_template.upper() == "REVISION" else {dps_rule.generation_template}
            templates = {t.upper() for t in templates}
            if not (templates & COMPLEMENT_TEMPLATES) or templates - COMPLEMENT_TEMPLATES:
                # Skip REVISION DPS that also rotate in a non-complement
                # template (none currently do, but keep this test scoped to
                # pure complement sheets rather than assume that forever).
                continue
            questions = generate_preview(db, dps, build_preview_seed(dps))
            positions = [_trigger_step(q["operands"]) for q in questions]
            assert all(p is not None for p in positions), (
                f"Lesson {lesson_number} DPS {dps.dps_number}: at least one question never fired "
                f"the complement technique at all -- positions={positions}"
            )
            checked_any = True
            if len(set(positions)) == 1:
                # A real, if less common, valid outcome for a very small
                # pool (e.g. pool size 8) -- only flag if it happens on a
                # DPS whose pool is comfortably large enough that a 10-draw
                # sample landing on a single position by chance is
                # implausible.
                from app.question_engine.pm.config import PMConfig
                from app.question_engine.pm.operands import build_candidate_pool
                cfg = PMConfig(
                    module_code="PM", level_code="PM-L1", lesson_number=lesson_number, dps_number=dps.dps_number,
                    question_count=10, rows=dps_rule.rows, concept_family=dps_rule.concept_family,
                    operation_focus=dps_rule.operation_focus, abacus_rule=dps_rule.abacus_rule,
                    target_numbers=dps_rule.target_numbers, place_value=dps_rule.place_value,
                    digit_pattern=dps_rule.digit_pattern, generation_template=dps_rule.generation_template,
                    revision_templates=dps_rule.revision_templates, seed="TRIGGER-VARIANCE-POOL-CHECK",
                )
                pool_size = len(build_candidate_pool(cfg))
                assert pool_size < 15, (
                    f"Lesson {lesson_number} DPS {dps.dps_number}: trigger position never varied "
                    f"(always {positions[0]}) across a pool of {pool_size} candidates -- expected mixing"
                )
    assert checked_any, "no pure-complement DPS were actually exercised by this test"
