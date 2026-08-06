"""Regression coverage for PM-L3's DPS/assessment/mock workflows
(2026-08-06).

PM-L3 has its own fully dedicated engine (question_engine/pm_l3), seed
config (preparatory_module_l3_config.py / seed_preparatory_module_l3.py),
and assessment/mock section registry entry ("PM-L3" in
PM_COMPETITION_LEVEL_REGISTRY, pm_competition_mock_generation_service.py) --
zero shared code with PM-L1's or PM-L2's engines, per Shailesh's "dedicated
engine per level, never overlaps" instruction. This file locks in the
properties verified manually while building it:

- All 60 DPS (12 lessons x 5) generate their exact configured question count
  with zero errors, and every generated question's stored correct_answer
  matches its own operands under its display type's formula.
- Five distinct question shapes work: VERTICAL (Add/Less, now genuinely
  N-row instead of PM-L1/PM-L2's hardcoded 3), EXPRESSION_WORKSHEET for both
  plain Multiplication (2D x 1D) and plain Division (3D / 1D, always exact --
  corrected 2026-08-06, Shailesh, to match IM's WHOLE_NUMBER_MULTIPLICATION/
  WHOLE_NUMBER_DIVISION precedent instead of a Concept Drill-style box),
  COMPACT_EXPRESSION (BODMAS, three term-shape templates), and the reused
  CONCEPT_DRILL_MULTIPLY/CONCEPT_DRILL_DIVIDE from PM-L2's own formulas.
- Assessments total exactly 100 marks with Concept Drill (Section 5) alone
  weighted 5 marks/question and every other section flat 1 -- Shailesh's
  explicit 2026-08-06 restructure ("only the last section has questions
  with 5 marks").
- Mocks generate cleanly across question counts from 10 to 300 with the
  redistribution-safe collector, and Section 4 (Division & BODMAS) emits
  its two concepts as two contiguous blocks (Division first, then BODMAS),
  split as evenly as the requested count allows.
"""
from __future__ import annotations

import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import AssessmentQuestion, Level, Module, User, DPS, Lesson
from app.seed.seed_preparatory_module_l3 import seed as seed_pm_l3
from app.services import assessment_blueprint_service as bp_service
from app.services.assessment_engine_service import GenerateAssessmentVersion
from app.services.generation_service import generate_pm_l3_preview, build_preview_seed
from app.services.pm_competition_mock_generation_service import (
    PM_COMPETITION_LEVEL_REGISTRY,
    CollectPmL3CompetitionSectionLockedQuestions,
)
from app.question_engine.pm_l3.multiply import compute_multiply_table_answer
from app.question_engine.pm_l3.divide import compute_divide_table_answer
from app.question_engine.pm_l3.concept_drill import compute_multiply_answer, compute_divide_answer, is_guessable_divide_pair


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
def pm_l3_level(db):
    seed_pm_l3(db)
    db.commit()
    module = db.query(Module).filter(Module.module_code == "PM").first()
    level = db.query(Level).filter(Level.module_id == module.id, Level.level_code == "PM-L3").first()
    admin = db.query(User).first()
    if admin is None:
        admin = User(full_name="Test Admin", role="SUPER_ADMIN", email="admin@test.local", password_hash="x")
        db.add(admin)
        db.flush()
    return module, level, admin


def _manual_eval(expr: str):
    return eval(expr.replace("×", "*").replace("−", "-"), {"__builtins__": {}}, {})


def test_pm_l3_all_60_dps_generate_correctly(db, pm_l3_level):
    _module, level, _admin = pm_l3_level
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
            questions = generate_pm_l3_preview(db, dps, seed)
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
                elif dt == "EXPRESSION_WORKSHEET" and concept_family == "PM_L3_MULTIPLICATION":
                    # Plain multiplication (corrected 2026-08-06, Shailesh): renders
                    # as a single "43 x 8 = ?" expression, not a Concept Drill box --
                    # matching IM's WHOLE_NUMBER_MULTIPLICATION precedent.
                    n, t = q["operands"]
                    assert q["operators"] == ["", "×"]
                    assert n * t == q["correct_answer"]
                elif dt == "EXPRESSION_WORKSHEET" and concept_family == "PM_L3_DIVISION":
                    # Plain division (corrected 2026-08-06, Shailesh): same
                    # EXPRESSION_WORKSHEET treatment, matching IM's
                    # WHOLE_NUMBER_DIVISION precedent.
                    n, d = q["operands"]
                    assert q["operators"] == ["", "÷"]
                    assert n % d == 0
                    assert compute_divide_table_answer(n, d) == q["correct_answer"]
                elif dt == "CONCEPT_DRILL_DIVIDE":
                    f, l = q["operands"]
                    assert f % l == q["correct_answer"]
                    assert not is_guessable_divide_pair(f, l)
                elif dt == "COMPACT_EXPRESSION":
                    assert _manual_eval(q["question_text"]) == q["correct_answer"]
    assert total_dps == 60
    assert total_questions > 0


def test_pm_l3_addless_supports_wider_row_counts_than_pm1_pm2(db, pm_l3_level):
    """PM-L1/PM-L2's operand builders hardcode exactly 3 rows -- PM-L3's own
    workbook needs real row-count variety (3R/4R/5R), so this is the one
    genuinely new piece of math in the Add/Less engine. Confirms a DPS
    configured for 5 rows actually produces 5-operand questions, not 3.
    """
    _module, level, _admin = pm_l3_level
    lesson1 = db.query(Lesson).filter(Lesson.level_id == level.id, Lesson.lesson_number == 1).first()
    dps5 = db.query(DPS).filter(DPS.lesson_id == lesson1.id, DPS.dps_number == 5).first()
    questions = generate_pm_l3_preview(db, dps5, build_preview_seed(dps5))
    vertical = [q for q in questions if q["display_type"] == "VERTICAL"]
    assert vertical
    assert all(len(q["operands"]) == 5 for q in vertical)


def test_multiply_table_formula():
    assert compute_multiply_table_answer(81, 6) == 486
    assert compute_multiply_table_answer(67, 8) == 536


def test_divide_table_always_exact():
    assert compute_divide_table_answer(582, 6) == 97
    with pytest.raises(ValueError):
        compute_divide_table_answer(583, 6)


def test_concept_drill_formulas_match_pm_l2():
    assert compute_multiply_answer(123, 5) == 615
    assert compute_divide_answer(1330, 123) == 100
    assert is_guessable_divide_pair(100, 10) is True
    assert is_guessable_divide_pair(1330, 123) is False


def test_pm_l3_assessment_totals_100_marks_concept_drill_weighted(db, pm_l3_level):
    module, level, admin = pm_l3_level
    blueprint = bp_service.create_blueprint(
        db,
        title="PM-L3 Test Assessment",
        module_id=module.id,
        level_id=level.id,
        total_questions=84,
        duration_seconds=3600,
        lesson_distribution=[
            {"sectionKey": "PM_L3_ADD_LESS_ABACUS", "questionCount": 20},
            {"sectionKey": "PM_L3_ADD_LESS_VISUAL", "questionCount": 20},
            {"sectionKey": "PM_L3_MULTIPLICATION", "questionCount": 20},
            {"sectionKey": "PM_L3_DIVISION_BODMAS", "questionCount": 20},
            {"sectionKey": "PM_L3_CONCEPT_DRILL", "questionCount": 4},
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
        # BODMAS must never inherit Concept Drill's 5-mark weighting even
        # though both live in this level's assessments -- Shailesh's
        # explicit 2026-08-06 instruction.
        if q.display_type == "COMPACT_EXPRESSION":
            assert md.get("questionMarks") == 1.0


def test_pm_l3_mock_section4_splits_division_then_bodmas_sequentially(db, pm_l3_level):
    _module, level, _admin = pm_l3_level
    questions, coverage = CollectPmL3CompetitionSectionLockedQuestions(
        level, 100,
        SectionCountsOverride={
            "PM_L3_ADD_LESS_ABACUS": 20, "PM_L3_ADD_LESS_VISUAL": 20, "PM_L3_MULTIPLICATION": 20,
            "PM_L3_DIVISION_BODMAS": 20, "PM_L3_CONCEPT_DRILL": 20,
        },
    )
    assert len(questions) == 100
    section4 = [q for q in questions if q["metadata"]["competitionSectionKey"] == "PM_L3_DIVISION_BODMAS"]
    assert len(section4) == 20
    kinds = [q["metadata"]["competitionConceptKey"] for q in section4]
    assert kinds == ["3D ÷ 1D Division"] * 10 + ["BODMAS"] * 10
    assert coverage["sectionCount"] == 5


@pytest.mark.parametrize("count", [10, 45, 60, 90, 150, 300])
def test_pm_l3_mock_generates_cleanly_at_varied_counts(db, pm_l3_level, count):
    _module, level, _admin = pm_l3_level
    questions, coverage = CollectPmL3CompetitionSectionLockedQuestions(level, count)
    assert len(questions) == count
    assert coverage["sectionCount"] <= 5


def test_pm_l3_registered_in_competition_level_registry():
    assert "PM-L3" in PM_COMPETITION_LEVEL_REGISTRY
    config = PM_COMPETITION_LEVEL_REGISTRY["PM-L3"]
    assert len(config["sectionDefinitions"]) == 5
    pools = config["sectionConceptPools"]
    # Section 5 (Concept Drill) must be uniformly tagged CONCEPT_DRILL so
    # assessment_blueprint_service.py's _weighted_section_keys() classifies
    # it -- and only it -- as the 5-marks-per-question section.
    assert all(c["conceptFamily"] == "CONCEPT_DRILL" for c in pools["PM_L3_CONCEPT_DRILL"])
    assert all(c["conceptFamily"] != "CONCEPT_DRILL" for c in pools["PM_L3_DIVISION_BODMAS"])
    assert all(c["conceptFamily"] != "CONCEPT_DRILL" for c in pools["PM_L3_MULTIPLICATION"])
