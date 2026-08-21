"""Regression coverage for the Bridge Module's (BM-L1) DPS/assessment/mock
workflows (2026-08-07) -- the new module sitting between Preparatory and
Intermediate in the platform's hierarchy (YLM-PM-BM-IM-MM).

BM has its own fully dedicated engine (question_engine/bm), seed config
(bridge_module_l1_config.py / seed_bridge_module_l1.py), and assessment/mock
section registry entry ("BM-L1" in BM_COMPETITION_LEVEL_REGISTRY,
bm_competition_mock_generation_service.py) -- zero shared code with any
PM/IM/MM engine, per Shailesh's "dedicated engine for BM, entirely
independent from all other modules and levels" instruction. This file locks
in the properties verified manually while building it:

- All 200 DPS (40 lessons x 5) generate their exact configured question
  count with zero errors, and every generated question's stored
  correct_answer matches its own operands under its display type's formula.
- Seven block kinds work: ADD_LESS (VERTICAL, up to 4-digit width),
  MULTIPLY (EXPRESSION_WORKSHEET, 2D x 1D), DIVIDE (EXPRESSION_WORKSHEET,
  both 2D/1D and 3D/1D exact), DIVIDE_REMAINDER (EXPRESSION_WORKSHEET,
  3D/1D WITH REMAINDER(S), correct_answer a "Q, R" text pair), BODMAS (four
  representative shapes -- one more than PM-L4's three), and the
  CONCEPT_DRILL_MULTIPLY/CONCEPT_DRILL_DIVIDE teaser pair.
- BM's Concept Drill TIMES is randomized 5-10 across ALL THREE flows (DPS,
  assessment, AND mock), following PM-L4's precedent.
- Assessments' Concept Drill (Section 6) alone is weighted 5 marks/question
  and every other section flat 1, via BmQuestionMark()/BmCompetitionLevelConfig.
- Mocks generate cleanly across question counts, with exactly 6 sections
  matching Shailesh's exact spec (Add/Less Abacus, Add/Less Visual,
  Multiplication, Division, BODMAS, Concept Drill) and Section 4 (Division)
  pooling all division shapes (2D/1D exact, 3D/1D exact, 3D/1D WITH
  REMAINDER) together.
- The two latent operands.py bugs found and fixed while building this
  engine (row-width-schedule ceiling for narrow-but-multi-digit patterns
  like "2D_TENS", and generate_unique_operands's crash on combinatorially
  narrow chains) stay fixed.
- persist_question_set() (the real student "start attempt" path) uses BM's
  own engine, not any PM engine silently falling through.
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
from app.seed.seed_bridge_module_l1 import seed as seed_bm
from app.services import assessment_blueprint_service as bp_service
from app.services.assessment_engine_service import GenerateAssessmentVersion
from app.services.generation_service import generate_bm_preview, build_preview_seed
from app.services.bm_competition_mock_generation_service import (
    BM_COMPETITION_LEVEL_REGISTRY,
    CollectBmCompetitionSectionLockedQuestions,
)
from app.question_engine.bm.multiply import compute_multiply_table_answer, generate_multiply_table_question
from app.question_engine.bm.divide import compute_divide_table_answer, generate_divide_table_question
from app.question_engine.bm.divide_remainder import generate_divide_remainder_question
from app.question_engine.bm.concept_drill import compute_multiply_answer, compute_divide_answer, is_guessable_divide_pair
from app.question_engine.bm.operands import is_trivial_scale_operand, generate_unique_operands
from app.question_engine.bm.config import (
    BMConfig, BMMultiplyConfig, BMDivideConfig, BMDivideRemainderConfig,
)
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
def bm_l1_level(db):
    seed_bm(db)
    db.commit()
    module = db.query(Module).filter(Module.module_code == "BM").first()
    level = db.query(Level).filter(Level.module_id == module.id, Level.level_code == "BM-L1").first()
    admin = db.query(User).first()
    if admin is None:
        admin = User(full_name="Test Admin", role="SUPER_ADMIN", email="admin@test.local", password_hash="x")
        db.add(admin)
        db.flush()
    return module, level, admin


def _manual_eval(expr: str):
    return eval(expr.replace("×", "*").replace("−", "-"), {"__builtins__": {}}, {})


def test_bm_module_seeded_with_correct_hierarchy_position(db, bm_l1_level):
    module, level, _admin = bm_l1_level
    assert module.module_code == "BM"
    assert module.display_order == 3  # YLM=1, PM=2, BM=3, IM=4, MM=5
    assert level.level_code == "BM-L1"


def test_bm_all_200_dps_generate_correctly(db, bm_l1_level):
    _module, level, _admin = bm_l1_level
    lessons = db.query(Lesson).filter(Lesson.level_id == level.id).order_by(Lesson.lesson_number).all()
    assert len(lessons) == 40

    total_dps = 0
    total_questions = 0
    block_kind_counts: dict[str, int] = {}
    for lesson in lessons:
        dps_list = db.query(DPS).filter(DPS.lesson_id == lesson.id).order_by(DPS.dps_number).all()
        assert len(dps_list) == 5, f"Lesson {lesson.lesson_number} should have 5 DPS"
        for dps in dps_list:
            total_dps += 1
            seed = build_preview_seed(dps)
            questions = generate_bm_preview(db, dps, seed)
            assert len(questions) == dps.default_question_count
            total_questions += len(questions)
            for q in questions:
                assert any(o["is_correct"] for o in q["options"])
                assert len({o["value"] for o in q["options"]}) == 4
                dt = q["display_type"]
                concept_family = q["metadata"].get("concept_family")
                block_kind_counts[concept_family] = block_kind_counts.get(concept_family, 0) + 1
                if dt == "VERTICAL":
                    assert sum(q["operands"]) == q["correct_answer"]
                elif dt == "CONCEPT_DRILL_MULTIPLY":
                    n, t = q["operands"]
                    assert n * t == q["correct_answer"]
                    assert 5 <= t <= 10, f"Concept Drill TIMES {t} outside the instructed 5-10 range"
                elif dt == "CONCEPT_DRILL_DIVIDE":
                    f, l = q["operands"]
                    assert f % l == q["correct_answer"]
                    assert not is_guessable_divide_pair(f, l)
                elif dt == "EXPRESSION_WORKSHEET" and concept_family == "BM_MULTIPLICATION":
                    n, t = q["operands"]
                    assert q["operators"] == ["", "×"]
                    assert n * t == q["correct_answer"]
                elif dt == "EXPRESSION_WORKSHEET" and concept_family == "BM_DIVISION":
                    n, d = q["operands"]
                    assert q["operators"] == ["", "÷"]
                    assert n % d == 0
                    assert compute_divide_table_answer(n, d) == q["correct_answer"]
                elif dt == "EXPRESSION_WORKSHEET" and concept_family == "BM_DIVISION_WITH_REMAINDER":
                    n, d = q["operands"]
                    assert q["operators"] == ["", "÷"]
                    quotient = q["metadata"]["quotient"]
                    remainder = q["metadata"]["remainder"]
                    assert n == d * quotient + remainder
                    assert 0 < remainder < d, "WITH REMAINDER must be a genuine, nonzero, in-range remainder"
                    assert q["correct_answer"] == f"{quotient}, {remainder}"
                    assert answers_match(q["correct_answer"], q["correct_answer"]) is True
                    assert answers_match(q["correct_answer"], f"{quotient},{remainder}") is True
                elif dt == "EXPRESSION_WORKSHEET" and concept_family == "BODMAS":
                    assert _manual_eval(q["question_text"]) == q["correct_answer"]
                else:
                    pytest.fail(f"Unexpected display_type/concept_family combo: {dt} / {concept_family}")
    assert total_dps == 200
    # Locked-in question-level totals per concept family, verified empirically
    # against the seeded engine output. Updated 2026-08-21 (Shailesh, explicit):
    # DPS sheets that showed exactly 10 questions were bumped to 20 (each
    # concept's share scaled up proportionally on multi-concept sheets), except
    # where a sheet's real combinatorial ceiling is narrower than 20 -- those
    # are capped to their audited exact ceiling instead of allowing repeats.
    # Only DIRECT_ADD_LESS, BM_MULTIPLICATION (1 DPS), and BM_DIVISION (1 DPS)
    # had any sheet sitting at exactly 10; BM_DIVISION_WITH_REMAINDER, BODMAS,
    # and CONCEPT_DRILL sheets were never at exactly 10 and are unchanged.
    assert block_kind_counts.get("DIRECT_ADD_LESS", 0) == 2005
    assert block_kind_counts.get("BM_MULTIPLICATION", 0) == 900
    assert block_kind_counts.get("BM_DIVISION", 0) == 370
    assert block_kind_counts.get("BM_DIVISION_WITH_REMAINDER", 0) == 60
    assert block_kind_counts.get("BODMAS", 0) == 90
    assert block_kind_counts.get("CONCEPT_DRILL", 0) == 48  # 24 multiply + 24 divide, both tagged CONCEPT_DRILL, 1 question each
    assert total_questions == sum(block_kind_counts.values()) == 3473


def test_bm_addless_supports_4_digit_width(db, bm_l1_level):
    """BM-L1 ramps up to the same 4-digit ceiling PM-L4 introduced. Confirms
    at least one DPS configured for 4-digit width actually produces 4-digit
    operands somewhere in the level.
    """
    _module, level, _admin = bm_l1_level
    lessons = db.query(Lesson).filter(Lesson.level_id == level.id).order_by(Lesson.lesson_number).all()
    found_4digit = False
    for lesson in lessons:
        dps_list = db.query(DPS).filter(DPS.lesson_id == lesson.id).order_by(DPS.dps_number).all()
        for dps in dps_list:
            questions = generate_bm_preview(db, dps, build_preview_seed(dps))
            vertical = [q for q in questions if q["display_type"] == "VERTICAL"]
            for q in vertical:
                if any(len(str(abs(v))) == 4 for v in q["operands"]):
                    found_4digit = True
                    break
            if found_4digit:
                break
        if found_4digit:
            break
    assert found_4digit, "expected at least one 4-digit-wide Add/Less row somewhere in BM-L1"


def test_multiply_table_formula():
    assert compute_multiply_table_answer(81, 6) == 486
    assert compute_multiply_table_answer(67, 8) == 536


def test_divide_table_always_exact():
    assert compute_divide_table_answer(96, 6) == 16
    with pytest.raises(ValueError):
        compute_divide_table_answer(97, 6)


def test_concept_drill_formulas_match_earlier_levels():
    # Verified against BM's own literal workbook row (Lesson 16 DPS1).
    assert compute_multiply_answer(23, 5) == 115
    assert compute_divide_answer(549, 42) == 3
    assert is_guessable_divide_pair(100, 10) is True
    assert is_guessable_divide_pair(1974, 123) is False


def test_bm_divide_remainder_formula_and_answer_matching():
    """The genuinely new concept: builds a real non-exact division and
    stores a "Q, R" pair, exercised end to end through the exact
    answer-matching path DPS grading uses. Verified against BM's own
    workbook row (Lesson 36 DPS5): 214 / 7 -> "30, 4".
    """
    config = BMDivideRemainderConfig(
        module_code="BM", level_code="BM-L1", lesson_number=36, dps_number=5,
        divisor_min=2, divisor_max=9, dividend_min=100, dividend_max=999,
    )
    for i in range(100):
        q = generate_divide_remainder_question(config, random.Random(f"bm-divrem-{i}"))
        n, d = q["operands"]
        quotient = q["metadata"]["quotient"]
        remainder = q["metadata"]["remainder"]
        assert n == d * quotient + remainder
        assert 0 < remainder < d
        assert q["correct_answer"] == f"{quotient}, {remainder}"
        assert answers_match(q["correct_answer"], f" {quotient} , {remainder} ") is True
        assert answers_match(q["correct_answer"], f"0{quotient}, 0{remainder}") is True
        assert answers_match(q["correct_answer"], f"{quotient + 1}, {remainder}") is False

    # Literal workbook value sanity check (not generator-derived).
    assert 214 == 7 * 30 + 4


def test_bm_assessment_concept_drill_weighted_5_marks(db, bm_l1_level):
    module, level, admin = bm_l1_level
    blueprint = bp_service.create_blueprint(
        db,
        title="BM-L1 Test Assessment",
        module_id=module.id,
        level_id=level.id,
        total_questions=60,
        duration_seconds=1800,
        lesson_distribution=[
            {"sectionKey": "BM_ADD_LESS_ABACUS", "questionCount": 10},
            {"sectionKey": "BM_ADD_LESS_VISUAL", "questionCount": 10},
            {"sectionKey": "BM_MULTIPLICATION", "questionCount": 10},
            {"sectionKey": "BM_DIVISION", "questionCount": 10},
            {"sectionKey": "BM_BODMAS", "questionCount": 10},
            {"sectionKey": "BM_CONCEPT_DRILL", "questionCount": 10},
        ],
        instructions=None,
        created_by_user_id=admin.id,
        status="PUBLISHED",
    )

    version = GenerateAssessmentVersion(db, blueprint, admin.id, "PUBLISHED")
    db.commit()

    questions = db.query(AssessmentQuestion).filter(AssessmentQuestion.assessment_version_id == version.id).all()
    assert len(questions) == 60
    drill_questions = [q for q in questions if q.concept_tag == "CONCEPT_DRILL"]
    normal_questions = [q for q in questions if q.concept_tag != "CONCEPT_DRILL"]
    assert len(drill_questions) == 10
    assert len(normal_questions) == 50
    for q in drill_questions:
        md = json.loads(q.metadata_json or "{}")
        assert md.get("questionMarks") == 5.0
        assert md.get("marksMode") == "BM_CONCEPT_WEIGHTED"
    for q in normal_questions:
        md = json.loads(q.metadata_json or "{}")
        assert md.get("questionMarks") == 1.0
        assert md.get("marksMode") == "BM_FLAT"
        # Division-with-remainder and BODMAS must never inherit Concept
        # Drill's 5-mark weighting.
        if q.concept_tag in ("BODMAS", "BM_DIVISION_WITH_REMAINDER", "BM_DIVISION"):
            assert md.get("questionMarks") == 1.0


def test_bm_section_marks_metadata_reports_concept_drill_weighted(db, bm_l1_level):
    """Regression for the 2026-08-07 live-verification bug: section_marks_
    metadata() (assessment_blueprint_service.py) gated its weighted-marks
    branch on `module_upper in _CONCEPT_WEIGHTED_MODULES or module_upper ==
    "PM"`, silently omitting "BM". This made the Assessment Studio frontend
    (which reads this metadata to compute the live "Marks: X/100" banner and
    what Auto Balance produces) treat every BM section -- including Concept
    Drill -- as flat 1 mark, so an evenly-auto-balanced 100-question BM
    distribution (17/17/17/17/16/16) showed "100/100, ready to publish" while
    its true weighted total was 164 marks, only surfacing as a hard failure
    once GenerateAssessmentVersion ran (ASSESSMENT_MARKS_MISMATCH) -- a much
    less actionable failure point than catching it at save time.
    """
    from app.services.assessment_blueprint_service import section_marks_metadata, get_module_level_or_404, level_section_registry_config

    module, level, _admin = bm_l1_level
    _module_row, _level_row = get_module_level_or_404(db, module.id, level.id)
    registry_config = level_section_registry_config("BM", level)
    metadata = section_marks_metadata("BM", registry_config)

    assert metadata["BM_CONCEPT_DRILL"]["isWeighted"] is True
    assert metadata["BM_CONCEPT_DRILL"]["marksPerQuestion"] == 5.0
    for key in ("BM_ADD_LESS_ABACUS", "BM_ADD_LESS_VISUAL", "BM_MULTIPLICATION", "BM_DIVISION", "BM_BODMAS"):
        assert metadata[key]["isWeighted"] is False
        assert metadata[key]["marksPerQuestion"] == 1.0


def test_bm_create_blueprint_rejects_distribution_that_does_not_total_100_marks(db, bm_l1_level):
    """Regression for the same 2026-08-07 bug, exercised through the actual
    create_blueprint() entry point an admin's "Save Draft" / "Create &
    Publish" click goes through. A naive even split of 100 questions across
    BM's 6 sections (17/17/17/17/16/16) -- exactly what the frontend's Auto
    Balance button would have produced before this fix -- must be rejected
    with ASSESSMENT_MARKS_MISMATCH rather than silently accepted, since
    16 Concept Drill questions at 5 marks + 84 others at 1 mark = 164, not
    100.
    """
    module, level, admin = bm_l1_level
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        bp_service.create_blueprint(
            db,
            title="BM-L1 Bad Auto-Balance Distribution",
            module_id=module.id,
            level_id=level.id,
            total_questions=100,
            duration_seconds=1800,
            lesson_distribution=[
                {"sectionKey": "BM_ADD_LESS_ABACUS", "questionCount": 17},
                {"sectionKey": "BM_ADD_LESS_VISUAL", "questionCount": 17},
                {"sectionKey": "BM_MULTIPLICATION", "questionCount": 17},
                {"sectionKey": "BM_DIVISION", "questionCount": 17},
                {"sectionKey": "BM_BODMAS", "questionCount": 16},
                {"sectionKey": "BM_CONCEPT_DRILL", "questionCount": 16},
            ],
            instructions=None,
            created_by_user_id=admin.id,
            status="DRAFT",
        )
    assert exc_info.value.detail.get("code") == "ASSESSMENT_MARKS_MISMATCH"

    # The correctly-weighted equivalent (84 normal + 16 drill would need
    # adjusting; use the known-good 50/10 split: 5 sections x 10 = 50 normal
    # + 10 drill x 5 = 50 -> 100 exactly) must succeed.
    blueprint = bp_service.create_blueprint(
        db,
        title="BM-L1 Correctly Weighted Distribution",
        module_id=module.id,
        level_id=level.id,
        total_questions=60,
        duration_seconds=1800,
        lesson_distribution=[
            {"sectionKey": "BM_ADD_LESS_ABACUS", "questionCount": 10},
            {"sectionKey": "BM_ADD_LESS_VISUAL", "questionCount": 10},
            {"sectionKey": "BM_MULTIPLICATION", "questionCount": 10},
            {"sectionKey": "BM_DIVISION", "questionCount": 10},
            {"sectionKey": "BM_BODMAS", "questionCount": 10},
            {"sectionKey": "BM_CONCEPT_DRILL", "questionCount": 10},
        ],
        instructions=None,
        created_by_user_id=admin.id,
        status="DRAFT",
    )
    assert blueprint.total_marks == 100.0


def test_bm_mock_section4_pools_all_division_shapes(db, bm_l1_level):
    """Section 4 - Division pools 2D/1D exact, 3D/1D exact, AND 3D/1D WITH
    REMAINDER together, per Shailesh's "all kinds of division sums flagged
    ... in the entire level" instruction.
    """
    _module, level, _admin = bm_l1_level
    questions, coverage = CollectBmCompetitionSectionLockedQuestions(
        level, 90,
        SectionCountsOverride={
            "BM_ADD_LESS_ABACUS": 15, "BM_ADD_LESS_VISUAL": 15, "BM_MULTIPLICATION": 15,
            "BM_DIVISION": 30, "BM_BODMAS": 5, "BM_CONCEPT_DRILL": 10,
        },
    )
    assert len(questions) == 90
    section4 = [q for q in questions if q["metadata"]["competitionSectionKey"] == "BM_DIVISION"]
    assert len(section4) == 30
    division_families = {q["metadata"].get("concept_family") for q in section4}
    assert division_families == {"BM_DIVISION", "BM_DIVISION_WITH_REMAINDER"}
    with_remainder = [q for q in section4 if q["metadata"].get("concept_family") == "BM_DIVISION_WITH_REMAINDER"]
    assert with_remainder, "expected at least one WITH REMAINDER question pooled into Section 4"
    assert all("," in str(q["correct_answer"]) for q in with_remainder)
    assert coverage["sectionCount"] == 6


@pytest.mark.parametrize("count", [10, 30, 60, 96, 150, 300])
def test_bm_mock_generates_cleanly_at_varied_counts(db, bm_l1_level, count):
    _module, level, _admin = bm_l1_level
    questions, coverage = CollectBmCompetitionSectionLockedQuestions(level, count)
    assert len(questions) == count
    assert coverage["sectionCount"] <= 6


def test_bm_multiply_never_trivial():
    config = BMMultiplyConfig(
        module_code="BM", level_code="BM-L1", lesson_number=0, dps_number=0,
        number_min=11, number_max=99, multiplier_min=1, multiplier_max=9,
    )
    for i in range(200):
        q = generate_multiply_table_question(config, random.Random(f"bm-trivial-multiply-{i}"))
        number, multiplier = q["operands"]
        assert not is_trivial_scale_operand(number), f"trivial number {number} in {q}"
        assert not is_trivial_scale_operand(multiplier), f"trivial multiplier {multiplier} in {q}"


def test_bm_divide_never_trivial_divisor():
    config = BMDivideConfig(
        module_code="BM", level_code="BM-L1", lesson_number=0, dps_number=0,
        digit_width=3, divisor_min=2, divisor_max=9, dividend_min=100, dividend_max=999,
    )
    for i in range(200):
        q = generate_divide_table_question(config, random.Random(f"bm-trivial-divide-{i}"))
        _number, divisor = q["operands"]
        assert not is_trivial_scale_operand(divisor), f"trivial divisor {divisor} in {q}"


def test_bm_concept_drill_multiply_times_value_varies_in_mocks(db, bm_l1_level):
    _module, level, _admin = bm_l1_level
    questions, _coverage = CollectBmCompetitionSectionLockedQuestions(
        level, 100,
        SectionCountsOverride={
            "BM_ADD_LESS_ABACUS": 8, "BM_ADD_LESS_VISUAL": 8, "BM_MULTIPLICATION": 8,
            "BM_DIVISION": 8, "BM_BODMAS": 8, "BM_CONCEPT_DRILL": 60,
        },
    )
    multiply_questions = [q for q in questions if q["display_type"] == "CONCEPT_DRILL_MULTIPLY"]
    assert len(multiply_questions) >= 10
    times_values = {q["operands"][1] for q in multiply_questions}
    assert len(times_values) > 1, f"TIMES value never varied across {len(multiply_questions)} questions: {times_values}"
    assert times_values <= set(range(5, 11)), f"TIMES value outside the instructed 5-10 range: {times_values}"


def test_bm_concept_drill_multiply_times_value_varies_in_dps_too(db, bm_l1_level):
    _module, level, _admin = bm_l1_level
    lesson16 = db.query(Lesson).filter(Lesson.level_id == level.id, Lesson.lesson_number == 16).first()
    dps1 = db.query(DPS).filter(DPS.lesson_id == lesson16.id, DPS.dps_number == 1).first()
    times_seen = set()
    for i in range(20):
        questions = generate_bm_preview(db, dps1, f"TEST-BM-DPS-SEED-{i}")
        drill_multiply = [q for q in questions if q["display_type"] == "CONCEPT_DRILL_MULTIPLY"]
        assert drill_multiply
        times_seen.add(drill_multiply[0]["operands"][1])
    assert len(times_seen) > 1, f"DPS-level TIMES never varied across 20 seeds: {times_seen}"
    assert times_seen <= set(range(5, 11))


def test_bm_registered_in_competition_level_registry():
    assert "BM-L1" in BM_COMPETITION_LEVEL_REGISTRY
    config = BM_COMPETITION_LEVEL_REGISTRY["BM-L1"]
    section_defs = config["sectionDefinitions"]
    assert len(section_defs) == 6
    section_keys = [s["key"] for s in section_defs]
    assert section_keys == [
        "BM_ADD_LESS_ABACUS", "BM_ADD_LESS_VISUAL", "BM_MULTIPLICATION",
        "BM_DIVISION", "BM_BODMAS", "BM_CONCEPT_DRILL",
    ]
    section_titles = {s["key"]: s["title"] for s in section_defs}
    assert section_titles["BM_ADD_LESS_ABACUS"] == "Section 1 - Add/Less (Abacus)"
    assert section_titles["BM_ADD_LESS_VISUAL"] == "Section 2 - Add/Less (Visual)"
    assert section_titles["BM_MULTIPLICATION"] == "Section 3 - Multiplication"
    assert section_titles["BM_DIVISION"] == "Section 4 - Division"
    assert section_titles["BM_BODMAS"] == "Section 5 - BODMAS"
    assert section_titles["BM_CONCEPT_DRILL"] == "Section 6 - Concept Drill"

    pools = config["sectionConceptPools"]
    # Section 6 (Concept Drill) must be uniformly tagged CONCEPT_DRILL so
    # assessment marks weighting classifies it -- and only it -- as the
    # 5-marks-per-question section.
    assert all(c["conceptFamily"] == "CONCEPT_DRILL" for c in pools["BM_CONCEPT_DRILL"])
    assert all(c["conceptFamily"] != "CONCEPT_DRILL" for c in pools["BM_DIVISION"])
    assert all(c["conceptFamily"] != "CONCEPT_DRILL" for c in pools["BM_BODMAS"])
    assert all(c["conceptFamily"] != "CONCEPT_DRILL" for c in pools["BM_MULTIPLICATION"])


def test_bm_concept_drill_renders_as_a_single_section(db, bm_l1_level):
    """A DPS's Concept Drill must be authored as ONE DPSSection (bundling
    both the multiply and divide sub-blocks), not two separate sections --
    the exact bug class fixed in PM-L3/PM-L4 mid-session, avoided in BM from
    day one. Locks that in across every DPS in the level.
    """
    _module, level, _admin = bm_l1_level
    lessons = db.query(Lesson).filter(Lesson.level_id == level.id).order_by(Lesson.lesson_number).all()

    concept_drill_dps_checked = 0
    for lesson in lessons:
        dps_list = db.query(DPS).filter(DPS.lesson_id == lesson.id).order_by(DPS.dps_number).all()
        for dps in dps_list:
            sections = (
                db.query(models.DPSSection)
                .filter(models.DPSSection.dps_id == dps.id)
                .order_by(models.DPSSection.section_number)
                .all()
            )
            titles = [s.section_title for s in sections]
            assert len(titles) == len(set(titles)), (
                f"Lesson {lesson.lesson_number} DPS {dps.dps_number} has duplicate "
                f"section titles: {titles}"
            )
            for section in sections:
                if section.section_title and "Concept Drill" in section.section_title:
                    concept_drill_dps_checked += 1
                    assert section.question_count == 2, (
                        f"Lesson {lesson.lesson_number} DPS {dps.dps_number}'s Concept "
                        f"Drill section should bundle both the multiply and divide "
                        f"questions (2), got {section.question_count}"
                    )
                    cfg = json.loads(section.generator_config_json or "{}")
                    sub_kinds = [b.get("blockKind") for b in cfg.get("subBlocks", [])]
                    assert sub_kinds == ["CONCEPT_DRILL_MULTIPLY", "CONCEPT_DRILL_DIVIDE"]

            seed = build_preview_seed(dps)
            questions = generate_bm_preview(db, dps, seed)
            section_numbers_by_title = {}
            for q in questions:
                title = q["metadata"].get("section_title")
                section_numbers_by_title.setdefault(title, set()).add(q["metadata"]["section_number"])
            for title, nums in section_numbers_by_title.items():
                assert len(nums) == 1, f"Title {title!r} spans multiple section_numbers: {nums}"

    assert concept_drill_dps_checked == 24, f"expected 24 Concept Drill DPS, found {concept_drill_dps_checked}"


def test_bm_persist_question_set_uses_bm_engine(db, bm_l1_level):
    """persist_question_set() is the function that backs a real student's
    "start attempt" flow, not just the admin preview -- see attempt_service
    .py's StartAttempt. Exercises persist_question_set() directly against
    every one of the 200 BM-L1 DPS, confirming BM's own engine ran (not any
    PM engine silently falling through) via display types/concept families
    PM's engines have no notion of.
    """
    from app.services.generation_service import persist_question_set
    from app.models.models import GeneratedQuestion

    _module, level, _admin = bm_l1_level
    lessons = db.query(Lesson).filter(Lesson.level_id == level.id).order_by(Lesson.lesson_number).all()

    checked = 0
    concept_drill_seen = False
    divide_remainder_seen = False
    for lesson in lessons:
        dps_list = db.query(DPS).filter(DPS.lesson_id == lesson.id).order_by(DPS.dps_number).all()
        for dps in dps_list:
            checked += 1
            qset = persist_question_set(
                db, dps, None, "REGRESSION-STUDENT", "PRACTICE",
                f"BM-PERSIST-REGRESSION-L{lesson.lesson_number}-D{dps.dps_number}",
            )
            db.flush()
            gqs = (
                db.query(GeneratedQuestion)
                .filter(GeneratedQuestion.question_set_id == qset.id)
                .order_by(GeneratedQuestion.question_number)
                .all()
            )
            assert len(gqs) == dps.default_question_count
            for gq in gqs:
                if gq.display_type == "CONCEPT_DRILL_MULTIPLY":
                    concept_drill_seen = True
                if gq.display_type == "EXPRESSION_WORKSHEET":
                    meta = json.loads(gq.metadata_json or "{}")
                    if meta.get("concept_family") == "BM_DIVISION_WITH_REMAINDER":
                        divide_remainder_seen = True
                        assert "," in gq.correct_answer

    assert checked == 200
    assert concept_drill_seen, "no CONCEPT_DRILL_MULTIPLY question seen across all 200 DPS via persist_question_set"
    assert divide_remainder_seen, "no divide-with-remainder question seen across all 200 DPS via persist_question_set"


def test_bm_generate_unique_operands_raises_once_narrow_combinatorial_space_is_exhausted():
    """Regression for 2026-08-21 (Shailesh, explicit): BM-L1 DPS sheets must
    never repeat a question, for any concept, ever -- including narrow
    single-target COMP5/COMP10 drills such as this one (digit_pattern="1D"),
    which really do only have 4 distinct valid 3-row chains available. This
    supersedes the 2026-08-07 version of this test, which asserted the old
    "fall back to a valid repeat" behavior -- that fallback is gone by
    explicit instruction, and bridge_module_l1_config.py's own count for
    this exact DPS (Lesson 3, DPS 1) was capped from 10 down to 4 to match
    its real ceiling, so production never asks this generator for more than
    it can uniquely provide.
    """
    config = BMConfig(
        module_code="BM", level_code="BM-L1", lesson_number=3, dps_number=1,
        question_count=4, rows=3,
        concept_family="DIRECT_ADD_LESS", operation_focus="ADD_LESS",
        target_numbers=[1], place_value="ONES", digit_pattern="1D",
        allow_negative_operands=True, allow_negative_answer=False,
        seed="BM-NARROW-TEST", generation_template="COMP5_ADD",
    )
    rng = random.Random("BM-NARROW-TEST")
    seen: set[tuple[int, ...]] = set()
    chains = []
    for _ in range(4):
        chain = generate_unique_operands(config, rng, seen)
        chains.append(tuple(chain))
        seen.add(tuple(chain))
    assert len(chains) == 4
    assert len(set(chains)) == 4, "all 4 chains must be genuinely distinct -- no duplicates allowed"
    # Every single chain must still be independently valid.
    from app.question_engine.bm.validators import validate_question
    import dataclasses
    from app.question_engine.bm.operands import total_row_count
    check_config = dataclasses.replace(config, rows=total_row_count(config))
    for chain in chains:
        assert validate_question(check_config, list(chain)), f"invalid chain produced: {chain}"

    # The real combinatorial space (4 distinct chains) is now exhausted --
    # a 5th request must raise loudly rather than silently repeat.
    with pytest.raises(ValueError):
        generate_unique_operands(config, rng, seen)


def test_bm_row_width_schedule_handles_narrow_multi_digit_patterns():
    """Regression for the 2026-08-07 bug: '2D_TENS' (round-tens-only bead
    recognition, e.g. Lesson 2 DPS1-3) has a 2-digit-wide row0 base even
    though it's not in WIDE_DIRECT_PATTERNS. The overflow-guard ceiling
    must derive from the pattern's own base pool, not assume 1 digit.
    """
    from app.question_engine.bm.operands import _row_width_schedule
    config = BMConfig(
        module_code="BM", level_code="BM-L1", lesson_number=2, dps_number=1,
        question_count=10, rows=3,
        concept_family="DIRECT_ADD_LESS", operation_focus="ADD_LESS",
        target_numbers=[], place_value="TENS", digit_pattern="2D_TENS",
        allow_negative_operands=True, allow_negative_answer=False,
        seed="BM-SCHEDULE-TEST", generation_template="DIRECT",
    )
    schedule = _row_width_schedule(config)
    assert schedule, "expected a non-empty row-width schedule"
    assert schedule[0][0] == 2, f"expected 2-digit-wide ceiling for 2D_TENS row0, got {schedule[0]}"

    # And it must actually generate successfully end to end, not just size
    # the schedule correctly.
    rng = random.Random("BM-SCHEDULE-GEN-TEST")
    seen: set[tuple[int, ...]] = set()
    for _ in range(20):
        chain = generate_unique_operands(config, rng, seen)
        assert chain, "chain generation should not fail for 2D_TENS pattern"
        seen.add(tuple(chain))


def test_bm_section_plan_returns_real_registry_keys_not_generic_dps_fallback(db, bm_l1_level):
    """Regression for the 2026-08-07 live-verification bug: CompetitionMockSectionPlan()
    (competition_mock_generation_service.py) had explicit branches for MM, IM, and PM
    that resolve sections via each module's own *CompetitionLevelConfig -- but no branch
    for BM. BM fell through to the generic per-DPS-title fallback at the bottom of that
    function, which invents its own ad-hoc sectionKey per DPS section title (e.g.
    "ADD_LESS_4D_4R_ABACUS" from a title like "Add/Less 4D,4R (Abacus)"), producing ~30
    sections completely unrelated to BM_COMPETITION_SECTION_DEFINITIONS's real 6 keys
    (BM_ADD_LESS_ABACUS, BM_ADD_LESS_VISUAL, BM_MULTIPLICATION, BM_DIVISION, BM_BODMAS,
    BM_CONCEPT_DRILL) that CollectBmCompetitionSectionLockedQuestions/_RedistributeSectionCounts
    actually key off of.

    Caught live: the admin's Section Allocation panel (built from this endpoint) showed
    30 fine-grained DPS-title sections instead of BM's real 6; submitting that panel's
    counts back as SectionCountsOverride matched none of the real section keys, so
    every section's RequiredCount resolved to 0 and the mock silently saved as a DRAFT
    with 0 questions -- no error, "Draft mock generated" success message shown regardless.
    """
    from app.services.competition_mock_generation_service import CompetitionMockSectionPlan

    _module, level, _admin = bm_l1_level
    plan = CompetitionMockSectionPlan(db, LevelId=level.id, TotalQuestions=60)
    assert plan["structure"] == "BM_SECTION_COMPETITION_MOCK"
    section_keys = {row["sectionKey"] for row in plan["sections"]}
    assert section_keys == {
        "BM_ADD_LESS_ABACUS", "BM_ADD_LESS_VISUAL", "BM_MULTIPLICATION",
        "BM_DIVISION", "BM_BODMAS", "BM_CONCEPT_DRILL",
    }
    assert sum(row["questionCount"] for row in plan["sections"]) == 60
    for row in plan["sections"]:
        assert row["locked"] is True


def test_bm_generate_draft_mock_using_section_plan_keys_produces_real_questions(db, bm_l1_level):
    """End-to-end regression for the same 2026-08-07 bug, at the actual generation
    entrypoint: simulates exactly what the admin UI does -- fetch CompetitionMockSectionPlan,
    build a SectionCounts override keyed by its own sectionKey values (as the frontend's
    Section Allocation panel does), then call GenerateCompetitionMockDraft with that
    override. Before the fix this silently produced a DRAFT with total_questions == 0
    and zero persisted CompetitionMockQuestion rows, with no error raised anywhere.
    """
    from app.services.competition_mock_generation_service import (
        CompetitionMockSectionPlan,
        GenerateCompetitionMockDraft,
    )
    from app.models.models import CompetitionMockQuestion

    module, level, admin = bm_l1_level
    plan = CompetitionMockSectionPlan(db, LevelId=level.id, TotalQuestions=60)
    section_counts = {row["sectionKey"]: row["questionCount"] for row in plan["sections"]}

    result = GenerateCompetitionMockDraft(
        db,
        LevelId=level.id,
        CreatedBy=admin,
        Title="BM-L1 Section-Plan Regression Mock",
        TotalQuestions=60,
        SectionCounts=section_counts,
    )
    assert result["totalQuestions"] == 60
    persisted = db.query(CompetitionMockQuestion).filter(
        CompetitionMockQuestion.mock_exam_id == result["mockExamId"]
    ).count()
    assert persisted == 60


def test_bm_generate_draft_mock_rejects_mismatched_section_keys_instead_of_silently_saving_empty(db, bm_l1_level):
    """Defense-in-depth regression: even if some future section-key mismatch reappears
    (for BM or any other module), GenerateCompetitionMockDraft must fail loudly with
    COMPETITION_MOCK_GENERATION_EMPTY rather than silently persist a DRAFT mock with
    total_questions == 0 and no CompetitionMockQuestion rows, which is exactly what
    happened live before this fix.
    """
    from fastapi import HTTPException
    from app.services.competition_mock_generation_service import GenerateCompetitionMockDraft

    module, level, admin = bm_l1_level
    with pytest.raises(HTTPException) as exc_info:
        GenerateCompetitionMockDraft(
            db,
            LevelId=level.id,
            CreatedBy=admin,
            Title="BM-L1 Mismatched Keys Mock",
            TotalQuestions=60,
            SectionCounts={
                "ADD_LESS_4D_4R_ABACUS": 2,
                "CONCEPT_DRILL_ABACUS": 2,
                "SOME_OTHER_FAKE_KEY": 2,
            },
        )
    assert exc_info.value.detail.get("code") == "COMPETITION_MOCK_GENERATION_EMPTY"
