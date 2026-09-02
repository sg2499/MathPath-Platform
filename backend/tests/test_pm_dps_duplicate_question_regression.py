"""Regression coverage for the 2026-09-02 PM/PM-L2/PM-L3 duplicate-question
fixes (the same "identical questions near the end of a sheet" bug class
originally found and fixed in YLM the same day -- see
test_ylm_dps_pool_capacity.py for that module's equivalent coverage).

Three distinct root causes were found and fixed across these three modules,
so this file checks all three explicitly rather than relying only on the
full-sweep test to catch a regression in one specific mechanism:

1. PM (L1) and PM-L2's generate_unique_operands() derived its progression
   position from len(seen), which freezes once a duplicate is returned
   (seen.add() of a repeat is a no-op), and gave up on finding a genuinely
   unique candidate too early (only searching the current template's own
   pool, not the DPS's full multi-template pool) before falling back to a
   repeat. Fixed in question_engine/pm/operands.py and
   question_engine/pm_l2/operands.py.

2. A handful of narrow single-digit-pattern complement DPS in both modules
   had so few valid 3-row combinations (6-8) that no fallback-search
   ordering could cover their question_count of 10 without a genuine
   pool-capacity increase -- fixed by widening those specific DPS to 4 rows
   (PM_L1_DPS_ROWS_OVERRIDES / PM_L2_DPS_ROWS_OVERRIDES) and teaching
   _complement_operand_triples() to chain the extra row on.

3. PM-L3's standalone Multiply/Divide DPS (question_engine/pm_l3/multiply.py,
   divide.py) had no uniqueness tracking at all -- each question was an
   independent random draw, so an exact repeat within one sheet was pure
   chance. Fixed by threading a shared `seen` set across each sheet.
"""
from __future__ import annotations

import random

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import DPS, Lesson, Level, Module
from app.seed.seed_preparatory_module import seed as seed_pm_l1
from app.seed.seed_preparatory_module_l2 import seed as seed_pm_l2
from app.seed.seed_preparatory_module_l3 import seed as seed_pm_l3
from app.services.generation_service import generate_preview

from app.question_engine.pm.config import PMConfig
from app.question_engine.pm.operands import build_candidate_pool as pm_build_candidate_pool
from app.question_engine.pm.generator import generate_pm_question_set
from app.question_engine.pm_l2.config import PML2Config
from app.question_engine.pm_l2.operands import build_candidate_pool as pm_l2_build_candidate_pool
from app.question_engine.pm_l3.multiply import generate_multiply_table_question
from app.question_engine.pm_l3.config import PML3MultiplyConfig


def _seeded_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    models.Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    db = SessionLocal()
    seed_pm_l1(db)
    seed_pm_l2(db)
    seed_pm_l3(db)
    return db


def test_pm_l1_lesson3_dps1_no_longer_repeats_questions_7_9_10():
    """Direct regression test for the exact live bug: PM-L1 Lesson 3 DPS 1
    ("Addition of 1 using Complement of 5") used to generate identical
    questions 7, 9 and 10.
    """
    for trial in range(5):
        config = PMConfig(
            module_code="PM", level_code="PM-L1", lesson_number=3, dps_number=1,
            question_count=10, rows=4, concept_family="COMPLEMENT_OF_5", operation_focus="ADDITION",
            abacus_rule="ADD_5_LESS_4", target_numbers=[1], place_value="ONES", digit_pattern="1D",
            generation_template="COMP5_ADD", seed=f"REGRESSION-PM-L3-D1-{trial}",
        )
        questions = generate_pm_question_set(config)
        operand_tuples = [tuple(q["operands"]) for q in questions]
        assert len(set(operand_tuples)) == len(operand_tuples), (
            f"trial {trial}: duplicate questions in {operand_tuples}"
        )


def test_pm_l1_and_l2_narrow_dps_pool_capacity_covers_question_count():
    """Every DPS listed in PM_L1_DPS_ROWS_OVERRIDES / PM_L2_DPS_ROWS_OVERRIDES
    must have at least as many unique candidate combinations as its own
    question_count (10) -- otherwise the override's row bump wasn't enough.
    """
    from app.seed.preparatory_module_l1_config import PM_L1_LESSONS, PM_L1_DPS_ROWS_OVERRIDES
    from app.seed.preparatory_module_l2_config import PM_L2_LESSONS, PM_L2_DPS_ROWS_OVERRIDES

    failures = []
    for lesson_number, dps_overrides in PM_L1_DPS_ROWS_OVERRIDES.items():
        rule = PM_L1_LESSONS[lesson_number]
        for dps_number, rows in dps_overrides.items():
            dps_rule = rule.dps[dps_number]
            config = PMConfig(
                module_code="PM", level_code="PM-L1", lesson_number=lesson_number, dps_number=dps_number,
                question_count=dps_rule.question_count, rows=rows, concept_family=dps_rule.concept_family,
                operation_focus=dps_rule.operation_focus, abacus_rule=dps_rule.abacus_rule,
                target_numbers=dps_rule.target_numbers, place_value=dps_rule.place_value,
                digit_pattern=dps_rule.digit_pattern, generation_template=dps_rule.generation_template,
                revision_templates=dps_rule.revision_templates, seed="CAPACITY-CHECK",
            )
            pool = pm_build_candidate_pool(config)
            unique = len(set(tuple(p) for p in pool))
            if unique < dps_rule.question_count:
                failures.append(f"PM-L1 L{lesson_number} DPS{dps_number}: only {unique} unique combos for question_count={dps_rule.question_count}")

    for lesson_number, dps_overrides in PM_L2_DPS_ROWS_OVERRIDES.items():
        rule = PM_L2_LESSONS[lesson_number]
        for dps_number, rows in dps_overrides.items():
            dps_rule = rule.dps[dps_number]
            config = PML2Config(
                module_code="PM", level_code="PM-L2", lesson_number=lesson_number, dps_number=dps_number,
                question_count=dps_rule.question_count, rows=rows, concept_family=dps_rule.concept_family,
                operation_focus=dps_rule.operation_focus, abacus_rule=dps_rule.abacus_rule,
                target_numbers=dps_rule.target_numbers, place_value=dps_rule.place_value,
                digit_pattern=dps_rule.digit_pattern, generation_template=dps_rule.generation_template,
                practice_mode=dps_rule.practice_mode, revision_templates=dps_rule.revision_templates,
                seed="CAPACITY-CHECK",
            )
            pool = pm_l2_build_candidate_pool(config)
            unique = len(set(tuple(p) for p in pool))
            if unique < dps_rule.question_count:
                failures.append(f"PM-L2 L{lesson_number} DPS{dps_number}: only {unique} unique combos for question_count={dps_rule.question_count}")

    assert not failures, "\n" + "\n".join(failures)


def test_pm_l3_multiply_dedups_within_a_sheet_even_with_pinned_multiplier():
    """Direct regression test for the exact live bug: PM-L3 Lesson 1 DPS 2
    (numberMin=11, numberMax=44, multiplier pinned to 1) used to generate
    the same number twice within one 10-question sheet.
    """
    config = PML3MultiplyConfig(
        module_code="PM", level_code="PM-L3", lesson_number=1, dps_number=2, seed="REGRESSION-PML3-MULT",
        number_min=11, number_max=44, multiplier_min=1, multiplier_max=1,
    )
    for trial in range(5):
        seen: set[tuple[int, int]] = set()
        pairs = []
        for i in range(1, 11):
            q_rng = random.Random(f"REGRESSION-PML3-MULT-{trial}-Q{i}")
            question = generate_multiply_table_question(config, q_rng, seen)
            pairs.append(tuple(question["operands"]))
        assert len(set(pairs)) == len(pairs), f"trial {trial}: duplicate questions in {pairs}"


def test_every_pm_dps_generates_with_zero_internal_duplicates():
    """Full-sweep regression guard: every PM (L1), PM-L2 and PM-L3 DPS that
    supports dynamic generation must produce a question set with zero
    repeated operand tuples. This is the same check that originally found
    all three root-cause bugs fixed 2026-09-02 -- kept as a standing
    regression test so a future change to any of these generators (or a
    newly-added narrow DPS) is caught the same way.
    """
    db = _seeded_db()
    module = db.query(Module).filter(Module.module_code == "PM").first()
    levels = db.query(Level).filter(Level.module_id == module.id).all()

    dup_findings = []
    checked = 0
    for level in levels:
        lessons = db.query(Lesson).filter(Lesson.level_id == level.id).order_by(Lesson.lesson_number).all()
        for lesson in lessons:
            dps_rows = db.query(DPS).filter(DPS.lesson_id == lesson.id).order_by(DPS.dps_number).all()
            for dps in dps_rows:
                try:
                    questions = generate_preview(db, dps, seed=f"SWEEP-{level.level_code}-L{lesson.lesson_number}-D{dps.dps_number}")
                except Exception:
                    continue
                checked += 1
                operand_tuples = [tuple(q["operands"]) for q in questions if q.get("operands") is not None]
                if not operand_tuples:
                    continue
                if len(set(operand_tuples)) != len(operand_tuples):
                    dup_findings.append(f"{level.level_code} L{lesson.lesson_number} DPS{dps.dps_number}: {operand_tuples}")

    assert checked > 100, f"sanity check: expected to sweep well over 100 DPS, only checked {checked}"
    assert not dup_findings, "\n" + "\n".join(dup_findings)
