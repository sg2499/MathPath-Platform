"""Regression coverage for PM-L2's DPS/assessment/mock workflows
(2026-08-05).

PM-L2 has its own fully dedicated engine (question_engine/pm_l2), seed
config (preparatory_module_l2_config.py / seed_preparatory_module_l2.py),
and assessment/mock section registry entry ("PM-L2" in
PM_COMPETITION_LEVEL_REGISTRY, pm_competition_mock_generation_service.py) --
zero shared code with PM-L1's engine, per Shailesh's explicit 2026-08-05
"dedicated engine per level, never overlaps" instruction. This file exists
to lock in the properties verified manually while building it:

- DPS structure matches the workbook exactly, including the two genuine
  structural findings (Lesson 8 has 6 physical blocks, Lesson 11 DPS3
  escalates 2-digit -> 3-digit mid-sheet) and Lesson 9's complete absence of
  a Concept Drill section.
- The three Concept Drill formats (multiply, divide-remainder, range-sum)
  compute the exact formulas confirmed against the workbook's own answer
  values, and DIVIDE never produces a guessable remainder-zero pair.
- Sections 1/2/3 ("Add/Less (Abacus)", "Add/Less (Visual)", "Concept
  Drill") generate valid questions for both mocks and assessments, and
  Concept Drill correctly prices at 5 marks/question while everything else
  in PM-L2 stays flat 1 -- and this weighting change to PM's shared marks
  code does not alter PM-L1 at all.
"""
from __future__ import annotations

import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import AssessmentQuestion, AssessmentVersion, Level, Module, User, DPS, DPSSection, Lesson
from app.seed.seed_preparatory_module_l2 import seed as seed_pm_l2
from app.services import assessment_blueprint_service as bp_service
from app.services.assessment_engine_service import GenerateAssessmentVersion
from app.services.pm_competition_mock_generation_service import (
    PM_COMPETITION_LEVEL_REGISTRY,
    CollectPmL2CompetitionSectionLockedQuestions,
)
from app.question_engine.pm_l2.concept_drill import (
    compute_multiply_answer,
    compute_divide_answer,
    is_guessable_divide_pair,
    resolve_range_sum_sequence,
    compute_range_sum_answer,
)
from app.services.generation_service import generate_preview, persist_question_set, build_preview_seed


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
def pm_l2_level(db):
    seed_pm_l2(db)
    db.commit()
    module = db.query(Module).filter(Module.module_code == "PM").first()
    level = db.query(Level).filter(Level.module_id == module.id, Level.level_code == "PM-L2").first()
    admin = db.query(User).first()
    if admin is None:
        admin = User(full_name="Test Admin", role="SUPER_ADMIN", email="admin@test.local", password_hash="x")
        db.add(admin)
        db.flush()
    return module, level, admin


def test_pm_l2_registry_has_three_sections_asymmetric_pools():
    registry = PM_COMPETITION_LEVEL_REGISTRY["PM-L2"]
    section_defs = registry["sectionDefinitions"]
    assert [s["title"] for s in section_defs] == [
        "Section 1 - Add/Less (Abacus)", "Section 2 - Add/Less (Visual)", "Section 3 - Concept Drill",
    ]
    pools = registry["sectionConceptPools"]
    assert pools["PM_L2_ADD_LESS_ABACUS"]
    assert pools["PM_L2_ADD_LESS_VISUAL"]
    assert pools["PM_L2_CONCEPT_DRILL"]
    # Deliberately not asserting equal sizes -- Abacus/Visual are a genuine
    # partition of the workbook's own tagging, not a mirrored pair (unlike
    # PM-L1's Addition/Subtraction sections). Confirmed 14 vs 23 while
    # building this; guard against the pool collapsing to empty/near-empty
    # rather than requiring symmetry that was never true.
    assert len(pools["PM_L2_ADD_LESS_ABACUS"]) >= 5
    assert len(pools["PM_L2_ADD_LESS_VISUAL"]) >= 5


def test_pm_l2_dps_structure_matches_workbook_findings(db, pm_l2_level):
    _module, level, _admin = pm_l2_level
    lessons = db.query(Lesson).filter(Lesson.level_id == level.id).order_by(Lesson.lesson_number).all()
    assert [l.lesson_number for l in lessons] == list(range(1, 13))

    by_lesson = {l.lesson_number: l for l in lessons}

    # Lesson 8: 6 physical DPS blocks (two both printed "-4" in the source).
    l8_dps = db.query(DPS).filter(DPS.lesson_id == by_lesson[8].id).all()
    assert len(l8_dps) == 6

    # Lesson 9: no Concept Drill section anywhere in the lesson.
    l9_dps = db.query(DPS).filter(DPS.lesson_id == by_lesson[9].id).all()
    assert len(l9_dps) == 5
    for dps in l9_dps:
        families = {s.concept_family for s in db.query(DPSSection).filter(DPSSection.dps_id == dps.id).all()}
        assert "CONCEPT_DRILL" not in families

    # Lesson 11 DPS3: escalates 2-digit -> 3-digit mid-sheet.
    l11_dps3 = db.query(DPS).filter(DPS.lesson_id == by_lesson[11].id, DPS.dps_number == 3).first()
    section = db.query(DPSSection).filter(DPSSection.dps_id == l11_dps3.id, DPSSection.section_number == 1).first()
    cfg = json.loads(section.generator_config_json)
    assert cfg["digitPattern"] == "2D_FULL"
    assert cfg["digitPatternSecondHalf"] == "3D_FULL"

    # Every lesson except 9 has a Concept Drill section, marked 5 marks/question.
    total_drill_sections = 0
    for lesson in lessons:
        dps_rows = db.query(DPS).filter(DPS.lesson_id == lesson.id).all()
        drill_sections = [
            s for dps in dps_rows
            for s in db.query(DPSSection).filter(DPSSection.dps_id == dps.id).all()
            if s.concept_family == "CONCEPT_DRILL"
        ]
        if lesson.lesson_number == 9:
            assert len(drill_sections) == 0
        else:
            assert len(drill_sections) == 1, f"Lesson {lesson.lesson_number} should have exactly one Concept Drill section"
            assert drill_sections[0].marks_per_question == 5.0


def test_pm_l2_dps_titles_carry_resolved_practice_mode_tag(db, pm_l2_level):
    """Every DPS title clearly reflects its resolved Abacus/Visual mode,
    including sheets the workbook itself left untagged (they default to
    Abacus) -- this is what makes the mode visible in the Learning Path
    Studio, which just renders dps.dpsTitle directly
    (app/admin/curriculum/page.tsx).

    Corrected from an earlier version of this test that required a literal
    trailing "(Abacus)"/"(Visual)" suffix on every title. Live verification
    against the running admin UI (2026-08-05, via Claude in Chrome) caught
    that a large share of PM-L2's real titles are lifted verbatim from the
    workbook's own column headers, which already say Abacus/Visual
    themselves (e.g. "3 Digit Addition & Subtraction - Visual",
    "Abacus - Addition & Subtraction") -- appending the tag unconditionally
    on top of that produced literal double-tagging in the live UI (e.g.
    "2 Digit Addition & Subtraction - Visual (Visual)"). _titled() in
    seed_preparatory_module_l2.py now skips the append when the resolved
    mode word already appears anywhere in the title, so the correct
    assertion is "the mode word appears somewhere in the title" rather than
    "the title ends with the parenthesized tag."
    """
    _module, level, _admin = pm_l2_level
    lessons = db.query(Lesson).filter(Lesson.level_id == level.id).all()
    for lesson in lessons:
        for dps in db.query(DPS).filter(DPS.lesson_id == lesson.id).all():
            title_lower = dps.dps_title.lower()
            assert "abacus" in title_lower or "visual" in title_lower, dps.dps_title


def test_pm_l2_lesson12_dps4_title_corrected_to_2_digit(db, pm_l2_level):
    """Lesson 12 DPS4's source title read '3 DIGIT ... - VISUAL' but its
    actual data is 2-digit -- confirmed a mislabelling by Shailesh
    (2026-08-05) and corrected here.
    """
    _module, level, _admin = pm_l2_level
    lesson12 = db.query(Lesson).filter(Lesson.level_id == level.id, Lesson.lesson_number == 12).first()
    dps4 = db.query(DPS).filter(DPS.lesson_id == lesson12.id, DPS.dps_number == 4).first()
    assert "2 Digit" in dps4.dps_title
    assert "3 Digit" not in dps4.dps_title


def test_pm_l2_generate_preview_real_dispatch_path_concept_drill_only_dps(db, pm_l2_level):
    """Regression test for a real bug caught via live verification (2026-08-05,
    Claude in Chrome against the running admin UI): backend/app/services/
    generation_service.py's generate_preview()/persist_question_set() routed
    every ModuleCode == "PM" DPS through PM-L1's build_pm_config_from_dps /
    generate_pm_question_set regardless of level_code, with no PM-L2 branch
    at all -- so clicking "Generate Preview" on a real PM-L2 DPS 500'd
    immediately, and the same code path (persist_question_set) backs actual
    student DPS attempts, meaning this would have broken every PM-L2 DPS for
    real students, not just the admin preview button. Every prior PM-L2 test
    in this file called the pm_l2 engine functions directly, bypassing this
    dispatcher entirely, which is exactly why the gap went uncaught until a
    live click. Fixed via generate_pm_l2_preview() in generation_service.py,
    dispatched whenever level_code == "PM-L2". This test exercises the real
    dispatcher, not the engine directly, so this class of bug can't silently
    reappear.
    """
    _module, level, _admin = pm_l2_level
    lesson3 = db.query(Lesson).filter(Lesson.level_id == level.id, Lesson.lesson_number == 3).first()
    dps5 = db.query(DPS).filter(DPS.lesson_id == lesson3.id, DPS.dps_number == 5).first()
    assert dps5 is not None

    seed = build_preview_seed(dps5)
    questions = generate_preview(db, dps5, seed)
    assert len(questions) == 2
    display_types = {q["display_type"] for q in questions}
    assert display_types == {"CONCEPT_DRILL_MULTIPLY", "CONCEPT_DRILL_DIVIDE"}
    for q in questions:
        assert any(o["is_correct"] for o in q["options"])

    # Real student-attempt path (not just the admin preview button) -- same
    # dispatcher, must not 500 either.
    qset = persist_question_set(db, dps5, None, "TEST-STUDENT", "PRACTICE", seed + "-PERSIST")
    db.commit()
    assert qset.id is not None


def test_pm_l2_generate_preview_combines_normal_and_concept_drill_sections(db, pm_l2_level):
    """Lesson 1 DPS5 carries TWO DPSSection rows under the same DPS -- a
    normal vertical add/less block (section_number=1) and a separate
    Concept Drill block (section_number=2). No other module in this codebase
    combines multiple DPSSection rows' generated output into a single DPS
    (every other build_*_config_from_dps() reads only the first section), so
    this is new PM-L2-specific combining logic in generate_pm_l2_preview().
    Confirms both blocks appear, in order, correctly tagged by section.
    """
    _module, level, _admin = pm_l2_level
    lesson1 = db.query(Lesson).filter(Lesson.level_id == level.id, Lesson.lesson_number == 1).first()
    dps5 = db.query(DPS).filter(DPS.lesson_id == lesson1.id, DPS.dps_number == 5).first()
    sections = db.query(DPSSection).filter(DPSSection.dps_id == dps5.id).order_by(DPSSection.section_number).all()
    assert len(sections) == 2, "Lesson 1 DPS5 should carry a normal section + a concept-drill section"

    questions = generate_preview(db, dps5, build_preview_seed(dps5))
    assert [q["question_number"] for q in questions] == list(range(1, len(questions) + 1))
    normal_questions = [q for q in questions if q["display_type"] == "VERTICAL"]
    drill_questions = [q for q in questions if q["display_type"] != "VERTICAL"]
    assert len(normal_questions) == sections[0].question_count
    assert len(drill_questions) == sections[1].question_count
    assert all(q["metadata"]["section_number"] == 1 for q in normal_questions)
    assert all(q["metadata"]["section_number"] == 2 for q in drill_questions)


def test_pm_l2_dps_titles_never_double_tag_practice_mode(db, pm_l2_level):
    """Regression test for the title-duplication bug caught alongside the
    dispatcher bug above: several PM-L2 DPS titles are lifted verbatim from
    the workbook's own column headers, which already say Abacus/Visual
    themselves -- appending the resolved tag unconditionally on top produced
    literal double-tagging in the live admin UI (e.g. "2 Digit Addition &
    Subtraction - Visual (Visual)"). _titled() in seed_preparatory_module_l2.py
    now skips the append when the mode word already appears anywhere in the
    title. This guards against a specific bad pattern -- a "(Visual)" or
    "(Abacus)" parenthesized tag appearing more than once -- without
    forbidding legitimate double mentions in the workbook's own prose titles
    (e.g. Lesson 11 DPS3's real title mentions "Visual" twice in two
    different clauses, which is not a bug).
    """
    _module, level, _admin = pm_l2_level
    lessons = db.query(Lesson).filter(Lesson.level_id == level.id).all()
    for lesson in lessons:
        for dps in db.query(DPS).filter(DPS.lesson_id == lesson.id).all():
            assert dps.dps_title.count("(Abacus)") <= 1, dps.dps_title
            assert dps.dps_title.count("(Visual)") <= 1, dps.dps_title
            # never both tags on the same title
            assert not ("(Abacus)" in dps.dps_title and "(Visual)" in dps.dps_title), dps.dps_title


def test_concept_drill_multiply_formula():
    assert compute_multiply_answer(34, 12) == 408
    assert compute_multiply_answer(155, 12) == 1860


def test_concept_drill_divide_formula_matches_workbook_and_rejects_guessable():
    # Literal workbook pairs (corrected 2026-08-05 after Shailesh clarified
    # this is repeated subtraction to a remainder, not a flat subtraction).
    assert compute_divide_answer(108, 13) == 4
    assert compute_divide_answer(467, 25) == 17
    assert compute_divide_answer(500, 49) == 10
    # Remainder-zero must be rejected by the generator (Shailesh, 2026-08-05:
    # "the students are smart enough to make out that the answer is gonna be
    # zero").
    assert is_guessable_divide_pair(100, 10) is True
    assert is_guessable_divide_pair(108, 13) is False


def test_concept_drill_range_sum_reproduces_all_four_literal_workbook_answers():
    # Lesson 1 (unlabelled, step = FROM itself, confirmed via Shailesh's
    # SUMPRODUCT(ROW(INDIRECT("1:20"))*step) formula).
    ef, es, et = resolve_range_sum_sequence("MULTIPLES", 1, 20)
    assert compute_range_sum_answer(ef, es, 20) == 210
    ef, es, et = resolve_range_sum_sequence("MULTIPLES", 2, 20)
    assert compute_range_sum_answer(ef, es, 20) == 420
    # Lesson 2 (explicitly labelled CONSECUTIVE / ODD, overriding the
    # mechanical FROM-is-the-step rule).
    ef, es, et = resolve_range_sum_sequence("CONSECUTIVE", 1, 30)
    assert compute_range_sum_answer(ef, es, 30) == 465
    ef, es, et = resolve_range_sum_sequence("ODD", 1, 15)
    assert compute_range_sum_answer(ef, es, 15) == 225


def test_pm_l2_mock_generation_produces_correct_valid_questions(db, pm_l2_level):
    _module, level, _admin = pm_l2_level
    questions, coverage = CollectPmL2CompetitionSectionLockedQuestions(level, 60)
    assert len(questions) > 0
    assert coverage["sectionCount"] == 3

    for q in questions:
        assert any(o["is_correct"] for o in q["options"])
        assert len({o["value"] for o in q["options"]}) == 4
        if q["display_type"] == "VERTICAL":
            assert sum(q["operands"]) == q["correct_answer"]
        elif q["display_type"] == "CONCEPT_DRILL_MULTIPLY":
            assert q["drill_operands"]["ADD"] * q["drill_operands"]["TIMES"] == q["correct_answer"]
        elif q["display_type"] == "CONCEPT_DRILL_DIVIDE":
            frm, less = q["drill_operands"]["FROM"], q["drill_operands"]["LESS"]
            assert frm % less == q["correct_answer"]
            assert not is_guessable_divide_pair(frm, less)


def test_pm_l2_assessment_totals_exactly_100_marks_with_concept_drill_weighting(db, pm_l2_level):
    module, level, admin = pm_l2_level
    blueprint = bp_service.create_blueprint(
        db,
        title="PM-L2 Test Assessment",
        module_id=module.id,
        level_id=level.id,
        total_questions=84,
        duration_seconds=3600,
        lesson_distribution=[
            {"sectionKey": "PM_L2_ADD_LESS_ABACUS", "questionCount": 40},
            {"sectionKey": "PM_L2_ADD_LESS_VISUAL", "questionCount": 40},
            {"sectionKey": "PM_L2_CONCEPT_DRILL", "questionCount": 4},
        ],
        instructions=None,
        created_by_user_id=admin.id,
        status="PUBLISHED",
    )
    assert blueprint.total_marks == 100.0

    version = GenerateAssessmentVersion(db, blueprint, admin.id, "PUBLISHED")
    db.commit()
    assert version.total_marks == 100.0

    questions = db.query(AssessmentQuestion).filter(AssessmentQuestion.assessment_version_id == version.id).all()
    assert len(questions) == 84
    drill_questions = [q for q in questions if q.concept_tag == "CONCEPT_DRILL"]
    normal_questions = [q for q in questions if q.concept_tag != "CONCEPT_DRILL"]
    assert len(drill_questions) == 4
    assert len(normal_questions) == 80
    for q in drill_questions:
        md = json.loads(q.metadata_json or "{}")
        assert md.get("questionMarks") == 5.0
    for q in normal_questions:
        md = json.loads(q.metadata_json or "{}")
        assert md.get("questionMarks") == 1.0


def test_pm_l1_unaffected_by_pm_l2_marks_weighting_change(db):
    """PM's shared marks-computation code (assessment_engine_service.py,
    assessment_blueprint_service.py) now branches on the question's own
    concept_tag rather than assuming PM is always flat -- this test proves
    PM-L1, which never produces a CONCEPT_DRILL-tagged question, is
    completely unaffected.
    """
    from app.seed.seed_preparatory_module import seed as seed_pm_l1

    seed_pm_l1(db)
    db.commit()
    module = db.query(Module).filter(Module.module_code == "PM").first()
    level = db.query(Level).filter(Level.module_id == module.id, Level.level_code == "PM-L1").first()
    registry_config = bp_service.level_section_registry_config("PM", level)
    marks_meta = bp_service.section_marks_metadata("PM", registry_config)
    assert all(not meta["isWeighted"] and meta["marksPerQuestion"] == 1.0 for meta in marks_meta.values())
