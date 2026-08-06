"""Regression coverage for PM-L4's DPS/assessment/mock workflows
(2026-08-06) -- the final level of the Preparatory Module.

PM-L4 has its own fully dedicated engine (question_engine/pm_l4), seed
config (preparatory_module_l4_config.py / seed_preparatory_module_l4.py),
and assessment/mock section registry entry ("PM-L4" in
PM_COMPETITION_LEVEL_REGISTRY, pm_competition_mock_generation_service.py) --
zero shared code with PM-L1/L2/L3's engines, per Shailesh's "dedicated
engine per level, never overlaps" instruction. This file locks in the
properties verified manually while building it:

- All 60 DPS (12 lessons x 5) generate their exact configured question count
  with zero errors, and every generated question's stored correct_answer
  matches its own operands under its display type's formula.
- Six question shapes work: VERTICAL (Add/Less, up to 4-digit width -- new
  vs PM-L3's 3-digit cap), EXPRESSION_WORKSHEET for plain Multiplication
  (2D x 1D), plain exact Division (both 2D/1D and 3D/1D -- the level's new
  easier variant), the genuinely new DIVIDE_REMAINDER ("3D / 1D WITH
  REMAINDER(S)", correct_answer a "Q, R" text pair), BODMAS (three
  representative shapes derived from the free-form workbook expressions),
  and the reused CONCEPT_DRILL_MULTIPLY/CONCEPT_DRILL_DIVIDE teaser.
- PM-L4's Concept Drill TIMES is randomized 5-10 across ALL THREE flows
  (DPS, assessment, AND mock) -- a deliberate deviation from PM-L3's
  precedent of keeping DPS-level TIMES literal, per Shailesh's explicit
  2026-08-06 instruction (PM-L4's own workbook pins TIMES to a literal 5
  everywhere, which would otherwise make the row fully guessable).
- Assessments total exactly 100 marks with Concept Drill (Section 6) alone
  weighted 5 marks/question and every other section (including the new
  Division and BODMAS sections) flat 1.
- Mocks generate cleanly across question counts, and Section 4 (Division)
  pools all three division shapes together (2D/1D exact, 3D/1D exact,
  3D/1D WITH REMAINDER) rather than splitting them into separate sections.
- The division-with-remainder pair answer is internally consistent
  (number == divisor * quotient + remainder, 0 < remainder < divisor) and
  its correct_answer text exactly matches app.services.answer_matching's
  expected "Q, R" shape (see test_answer_matching.py for the exhaustive
  grading-side coverage of that path).
"""
from __future__ import annotations

import json
import random

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import AssessmentQuestion, Level, Module, User, DPS, Lesson
from app.seed.seed_preparatory_module_l4 import seed as seed_pm_l4
from app.services import assessment_blueprint_service as bp_service
from app.services.assessment_engine_service import GenerateAssessmentVersion
from app.services.generation_service import generate_pm_l4_preview, build_preview_seed
from app.services.pm_competition_mock_generation_service import (
    PM_COMPETITION_LEVEL_REGISTRY,
    CollectPmL4CompetitionSectionLockedQuestions,
)
from app.question_engine.pm_l4.multiply import compute_multiply_table_answer, generate_multiply_table_question
from app.question_engine.pm_l4.divide import compute_divide_table_answer, generate_divide_table_question
from app.question_engine.pm_l4.divide_remainder import generate_divide_remainder_question
from app.question_engine.pm_l4.concept_drill import compute_multiply_answer, compute_divide_answer, is_guessable_divide_pair
from app.question_engine.pm_l4.operands import is_trivial_scale_operand
from app.question_engine.pm_l4.config import PML4MultiplyConfig, PML4DivideConfig, PML4DivideRemainderConfig
from app.services.answer_matching import answers_match


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
def pm_l4_level(db):
    seed_pm_l4(db)
    db.commit()
    module = db.query(Module).filter(Module.module_code == "PM").first()
    level = db.query(Level).filter(Level.module_id == module.id, Level.level_code == "PM-L4").first()
    admin = db.query(User).first()
    if admin is None:
        admin = User(full_name="Test Admin", role="SUPER_ADMIN", email="admin@test.local", password_hash="x")
        db.add(admin)
        db.flush()
    return module, level, admin


def _manual_eval(expr: str):
    return eval(expr.replace("×", "*").replace("−", "-"), {"__builtins__": {}}, {})


def test_pm_l4_all_60_dps_generate_correctly(db, pm_l4_level):
    _module, level, _admin = pm_l4_level
    lessons = db.query(Lesson).filter(Lesson.level_id == level.id).order_by(Lesson.lesson_number).all()
    assert len(lessons) == 12

    total_dps = 0
    total_questions = 0
    for lesson in lessons:
        dps_list = db.query(DPS).filter(DPS.lesson_id == lesson.id).order_by(DPS.dps_number).all()
        assert len(dps_list) == 5, f"Lesson {lesson.lesson_number} should have 5 DPS"
        for dps in dps_list:
            total_dps += 1
            seed = build_preview_seed(dps)
            questions = generate_pm_l4_preview(db, dps, seed)
            assert len(questions) == dps.default_question_count
            total_questions += len(questions)
            for q in questions:
                assert any(o["is_correct"] for o in q["options"])
                assert len({o["value"] for o in q["options"]}) == 4
                dt = q["display_type"]
                concept_family = q["metadata"].get("concept_family")
                if dt == "VERTICAL":
                    assert sum(q["operands"]) == q["correct_answer"]
                elif dt == "CONCEPT_DRILL_MULTIPLY":
                    n, t = q["operands"]
                    assert n * t == q["correct_answer"]
                    assert 5 <= t <= 10, f"Concept Drill TIMES {t} outside the instructed 5-10 range"
                elif dt == "EXPRESSION_WORKSHEET" and concept_family == "PM_L4_MULTIPLICATION":
                    n, t = q["operands"]
                    assert q["operators"] == ["", "×"]
                    assert n * t == q["correct_answer"]
                elif dt == "EXPRESSION_WORKSHEET" and concept_family == "PM_L4_DIVISION":
                    n, d = q["operands"]
                    assert q["operators"] == ["", "÷"]
                    assert n % d == 0
                    assert compute_divide_table_answer(n, d) == q["correct_answer"]
                elif dt == "EXPRESSION_WORKSHEET" and concept_family == "PM_L4_DIVISION_WITH_REMAINDER":
                    n, d = q["operands"]
                    assert q["operators"] == ["", "÷"]
                    quotient = q["metadata"]["quotient"]
                    remainder = q["metadata"]["remainder"]
                    assert n == d * quotient + remainder
                    assert 0 < remainder < d, "WITH REMAINDER must be a genuine, nonzero, in-range remainder"
                    assert q["correct_answer"] == f"{quotient}, {remainder}"
                    # The exact grading path a student's typed DPS answer goes
                    # through -- must accept the canonical form.
                    assert answers_match(q["correct_answer"], q["correct_answer"]) is True
                    assert answers_match(q["correct_answer"], f"{quotient},{remainder}") is True
                elif dt == "CONCEPT_DRILL_DIVIDE":
                    f, l = q["operands"]
                    assert f % l == q["correct_answer"]
                    assert not is_guessable_divide_pair(f, l)
                elif dt == "EXPRESSION_WORKSHEET" and concept_family == "BODMAS":
                    assert _manual_eval(q["question_text"]) == q["correct_answer"]
    assert total_dps == 60
    assert total_questions == 998


def test_pm_l4_addless_supports_4_digit_width(db, pm_l4_level):
    """PM-L3's operand builder caps at 3-digit width -- PM-L4's own workbook
    needs a genuine 4th digit (Lesson 2 DPS5, Lesson 6 DPS1, Lesson 8 DPS5's
    "(4D,4R)" -- though L2 DPS5's own literal data is 3 rows, see the
    findings report §7 -- and Lesson 10 DPS1's "(4D,3R)"). Confirms a DPS
    configured for 4-digit width actually produces 4-digit operands.
    """
    _module, level, _admin = pm_l4_level
    lesson6 = db.query(Lesson).filter(Lesson.level_id == level.id, Lesson.lesson_number == 6).first()
    dps1 = db.query(DPS).filter(DPS.lesson_id == lesson6.id, DPS.dps_number == 1).first()
    questions = generate_pm_l4_preview(db, dps1, build_preview_seed(dps1))
    vertical = [q for q in questions if q["display_type"] == "VERTICAL"]
    assert vertical
    assert any(len(str(abs(q["operands"][0]))) == 4 for q in vertical), "expected at least one 4-digit row0 operand"


def test_multiply_table_formula():
    assert compute_multiply_table_answer(81, 6) == 486
    assert compute_multiply_table_answer(67, 8) == 536


def test_divide_table_always_exact():
    assert compute_divide_table_answer(582, 6) == 97
    with pytest.raises(ValueError):
        compute_divide_table_answer(583, 6)


def test_concept_drill_formulas_match_earlier_levels():
    assert compute_multiply_answer(1234, 5) == 6170
    assert compute_divide_answer(1974, 123) == 6
    assert is_guessable_divide_pair(100, 10) is True
    assert is_guessable_divide_pair(1974, 123) is False


def test_pm_l4_divide_remainder_formula_and_answer_matching():
    """The genuinely new concept: builds a real non-exact division and
    stores a "Q, R" pair, exercised end to end through the exact
    answer-matching path DPS grading uses.
    """
    config = PML4DivideRemainderConfig(
        module_code="PM", level_code="PM-L4", lesson_number=9, dps_number=5,
        divisor_min=2, divisor_max=9, dividend_min=100, dividend_max=999,
    )
    for i in range(100):
        q = generate_divide_remainder_question(config, random.Random(f"divrem-{i}"))
        n, d = q["operands"]
        quotient = q["metadata"]["quotient"]
        remainder = q["metadata"]["remainder"]
        assert n == d * quotient + remainder
        assert 0 < remainder < d
        assert q["correct_answer"] == f"{quotient}, {remainder}"
        # Formatting noise a student might type must still match.
        assert answers_match(q["correct_answer"], f" {quotient} , {remainder} ") is True
        assert answers_match(q["correct_answer"], f"0{quotient}, 0{remainder}") is True
        # A genuinely different pair must never match.
        assert answers_match(q["correct_answer"], f"{quotient + 1}, {remainder}") is False


def test_pm_l4_assessment_totals_100_marks_concept_drill_weighted(db, pm_l4_level):
    module, level, admin = pm_l4_level
    blueprint = bp_service.create_blueprint(
        db,
        title="PM-L4 Test Assessment",
        module_id=module.id,
        level_id=level.id,
        total_questions=84,
        duration_seconds=3600,
        lesson_distribution=[
            {"sectionKey": "PM_L4_ADD_LESS_ABACUS", "questionCount": 16},
            {"sectionKey": "PM_L4_ADD_LESS_VISUAL", "questionCount": 16},
            {"sectionKey": "PM_L4_MULTIPLICATION", "questionCount": 16},
            {"sectionKey": "PM_L4_DIVISION", "questionCount": 16},
            {"sectionKey": "PM_L4_BODMAS", "questionCount": 16},
            {"sectionKey": "PM_L4_CONCEPT_DRILL", "questionCount": 4},
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
        # Division-with-remainder and BODMAS must never inherit Concept
        # Drill's 5-mark weighting.
        if q.concept_tag in ("BODMAS", "PM_L4_DIVISION_WITH_REMAINDER", "PM_L4_DIVISION"):
            assert md.get("questionMarks") == 1.0
        if q.concept_tag == "PM_L4_DIVISION_WITH_REMAINDER":
            # MCQ option values for this concept are "Q, R" text, and
            # correct_answer must be stored/round-trippable as that same text.
            assert "," in q.correct_answer


def test_pm_l4_mock_section4_pools_all_three_division_shapes(db, pm_l4_level):
    """Section 4 - Division pools 2D/1D exact, 3D/1D exact, AND 3D/1D WITH
    REMAINDER together (per Shailesh's explicit "all kinds of division sums
    throughout the level" instruction) -- unlike PM-L3, which never had a
    2D/1D variant or a WITH REMAINDER concept at all. A count divisible by
    3 should spread close to evenly across all three concepts.
    """
    _module, level, _admin = pm_l4_level
    questions, coverage = CollectPmL4CompetitionSectionLockedQuestions(
        level, 96,
        SectionCountsOverride={
            "PM_L4_ADD_LESS_ABACUS": 12, "PM_L4_ADD_LESS_VISUAL": 12, "PM_L4_MULTIPLICATION": 12,
            "PM_L4_DIVISION": 36, "PM_L4_BODMAS": 12, "PM_L4_CONCEPT_DRILL": 12,
        },
    )
    assert len(questions) == 96
    section4 = [q for q in questions if q["metadata"]["competitionSectionKey"] == "PM_L4_DIVISION"]
    assert len(section4) == 36
    concept_names = {q["metadata"]["competitionConceptKey"] for q in section4}
    assert concept_names == {"2D ÷ 1D Division", "3D ÷ 1D Division", "3D ÷ 1D Division With Remainder"}
    counts_by_concept = {}
    for q in section4:
        counts_by_concept.setdefault(q["metadata"]["competitionConceptKey"], 0)
        counts_by_concept[q["metadata"]["competitionConceptKey"]] += 1
    assert all(v == 12 for v in counts_by_concept.values()), counts_by_concept
    # Every WITH REMAINDER question in this section must carry a genuine
    # "Q, R" correct_answer, never a plain single number.
    with_remainder = [q for q in section4 if q["metadata"]["competitionConceptKey"] == "3D ÷ 1D Division With Remainder"]
    assert all("," in str(q["correct_answer"]) for q in with_remainder)
    assert coverage["sectionCount"] == 6


@pytest.mark.parametrize("count", [12, 48, 60, 96, 150, 300])
def test_pm_l4_mock_generates_cleanly_at_varied_counts(db, pm_l4_level, count):
    _module, level, _admin = pm_l4_level
    questions, coverage = CollectPmL4CompetitionSectionLockedQuestions(level, count)
    assert len(questions) == count
    assert coverage["sectionCount"] <= 6


def test_pm_l4_multiply_table_never_trivial():
    config = PML4MultiplyConfig(
        module_code="PM", level_code="PM-L4", lesson_number=0, dps_number=0,
        number_min=11, number_max=99, multiplier_min=1, multiplier_max=9,
    )
    for i in range(200):
        q = generate_multiply_table_question(config, random.Random(f"trivial-multiply-{i}"))
        number, multiplier = q["operands"]
        assert not is_trivial_scale_operand(number), f"trivial number {number} in {q}"
        assert not is_trivial_scale_operand(multiplier), f"trivial multiplier {multiplier} in {q}"


def test_pm_l4_divide_table_never_trivial_divisor():
    config = PML4DivideConfig(
        module_code="PM", level_code="PM-L4", lesson_number=0, dps_number=0,
        digit_width=3, divisor_min=2, divisor_max=9, dividend_min=100, dividend_max=999,
    )
    for i in range(200):
        q = generate_divide_table_question(config, random.Random(f"trivial-divide-{i}"))
        _number, divisor = q["operands"]
        assert not is_trivial_scale_operand(divisor), f"trivial divisor {divisor} in {q}"


def test_pm_l4_divide_remainder_never_trivial_divisor():
    config = PML4DivideRemainderConfig(
        module_code="PM", level_code="PM-L4", lesson_number=0, dps_number=0,
        divisor_min=2, divisor_max=9, dividend_min=100, dividend_max=999,
    )
    for i in range(200):
        q = generate_divide_remainder_question(config, random.Random(f"trivial-divrem-{i}"))
        _number, divisor = q["operands"]
        assert not is_trivial_scale_operand(divisor), f"trivial divisor {divisor} in {q}"


def test_pm_l4_concept_drill_multiply_times_value_varies_in_mocks(db, pm_l4_level):
    _module, level, _admin = pm_l4_level
    questions, _coverage = CollectPmL4CompetitionSectionLockedQuestions(
        level, 100,
        SectionCountsOverride={
            "PM_L4_ADD_LESS_ABACUS": 8, "PM_L4_ADD_LESS_VISUAL": 8, "PM_L4_MULTIPLICATION": 8,
            "PM_L4_DIVISION": 8, "PM_L4_BODMAS": 8, "PM_L4_CONCEPT_DRILL": 60,
        },
    )
    multiply_questions = [q for q in questions if q["display_type"] == "CONCEPT_DRILL_MULTIPLY"]
    assert len(multiply_questions) >= 10
    times_values = {q["operands"][1] for q in multiply_questions}
    assert len(times_values) > 1, f"TIMES value never varied across {len(multiply_questions)} questions: {times_values}"
    assert times_values <= set(range(5, 11)), f"TIMES value outside the instructed 5-10 range: {times_values}"


def test_pm_l4_concept_drill_multiply_times_value_varies_in_dps_too(db, pm_l4_level):
    """Deliberate deviation from PM-L3's precedent (Shailesh, 2026-08-06):
    PM-L4's workbook pins TIMES literally to 5 everywhere, but every flow
    -- DPS included, not just assessment/mock -- must randomize it 5-10 to
    avoid a fully guessable Concept Drill Multiply row. Generates the same
    Lesson 1 DPS1 Concept Drill block with several different preview seeds
    (mirroring several different admin preview clicks) and confirms TIMES
    genuinely varies rather than always landing on the workbook's literal 5.
    """
    _module, level, _admin = pm_l4_level
    lesson1 = db.query(Lesson).filter(Lesson.level_id == level.id, Lesson.lesson_number == 1).first()
    dps1 = db.query(DPS).filter(DPS.lesson_id == lesson1.id, DPS.dps_number == 1).first()
    times_seen = set()
    for i in range(20):
        questions = generate_pm_l4_preview(db, dps1, f"TEST-DPS-SEED-{i}")
        drill_multiply = [q for q in questions if q["display_type"] == "CONCEPT_DRILL_MULTIPLY"]
        assert drill_multiply
        times_seen.add(drill_multiply[0]["operands"][1])
    assert len(times_seen) > 1, f"DPS-level TIMES never varied across 20 seeds: {times_seen}"
    assert times_seen <= set(range(5, 11))


def test_pm_l4_registered_in_competition_level_registry():
    assert "PM-L4" in PM_COMPETITION_LEVEL_REGISTRY
    config = PM_COMPETITION_LEVEL_REGISTRY["PM-L4"]
    assert len(config["sectionDefinitions"]) == 6
    pools = config["sectionConceptPools"]
    # Section 6 (Concept Drill) must be uniformly tagged CONCEPT_DRILL so
    # assessment_blueprint_service.py's _weighted_section_keys() classifies
    # it -- and only it -- as the 5-marks-per-question section.
    assert all(c["conceptFamily"] == "CONCEPT_DRILL" for c in pools["PM_L4_CONCEPT_DRILL"])
    assert all(c["conceptFamily"] != "CONCEPT_DRILL" for c in pools["PM_L4_DIVISION"])
    assert all(c["conceptFamily"] != "CONCEPT_DRILL" for c in pools["PM_L4_BODMAS"])
    assert all(c["conceptFamily"] != "CONCEPT_DRILL" for c in pools["PM_L4_MULTIPLICATION"])
    # Division section pools all three shapes (2D/1D, 3D/1D, WITH REMAINDER).
    division_families = {c["conceptFamily"] for c in pools["PM_L4_DIVISION"]}
    assert division_families == {"PM_L4_DIVISION", "PM_L4_DIVISION_WITH_REMAINDER"}
