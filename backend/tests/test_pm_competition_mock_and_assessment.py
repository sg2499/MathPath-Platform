"""Regression coverage for PM-L1's competition mock exam + section-wise
assessment workflow (2026-08-04).

Per explicit product decision, PM-L1 gets exactly 3 sections -- "Section 1 -
Addition", "Section 2 - Subtraction", and "Section 3 - Add/Less" -- covering
every addition/subtraction pattern taught across its 15 lessons (see
preparatory_module_l1_config.py), flat 1 mark per question for both the
mock exam and the assessment (PM has no Skill Stacker/Concept Drill
equivalent, unlike IM). Section 3 was added after Sections 1/2 shipped (see
pm_competition_mock_generation_service.py's _add_less_pool() docstring for
exactly which 3 lessons' concepts feed it and why). This mirrors the exact
architecture IM/MM already use for mocks and assessments
(PM_COMPETITION_LEVEL_REGISTRY sourced from
pm_competition_mock_generation_service.py, read by both the mock generator
and the assessment blueprint/engine services), with PM's own fully
dedicated concept pools, registry, and collector -- see that module's
docstring for why it is a separate file rather than authored inline
alongside MM/IM.

Uses the real seed_preparatory_module.seed() (not hand-built Module/Level
rows) because competition mock generation's _LevelRecords() requires at
least one active DPS row to exist for the level (NO_DPS_FOUND guard) --
PM's own section-locked collector does not read those DPS rows itself, but
the shared dispatch path it's reached through does.
"""
from __future__ import annotations

import json

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import (
    AssessmentQuestion,
    AssessmentQuestionOption,
    AssessmentVersion,
    CompetitionMockExam,
    CompetitionMockQuestion,
    Level,
    Module,
    User,
)
from app.seed.seed_preparatory_module import seed as seed_pm
from app.services import assessment_blueprint_service as bp_service
from app.services.assessment_engine_service import VersionPayload
from app.services.competition_mock_generation_service import (
    CompetitionMockSectionPlan,
    GenerateCompetitionMockDraft,
)
from app.services.pm_competition_mock_generation_service import (
    PM_COMPETITION_LEVEL_REGISTRY,
    CollectPmCompetitionSectionLockedQuestions,
)


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
def pm_level(db):
    seed_pm(db)
    db.commit()
    module = db.query(Module).filter(Module.module_code == "PM").first()
    level = db.query(Level).filter(Level.module_id == module.id, Level.level_code == "PM-L1").first()
    admin = db.query(User).first()
    if admin is None:
        admin = User(full_name="Test Admin", role="SUPER_ADMIN", email="admin@test.local", password_hash="x")
        db.add(admin)
        db.flush()
    return module, level, admin


def test_pm_registry_has_exactly_three_sections():
    registry = PM_COMPETITION_LEVEL_REGISTRY["PM-L1"]
    section_defs = registry["sectionDefinitions"]
    assert [s["title"] for s in section_defs] == [
        "Section 1 - Addition", "Section 2 - Subtraction", "Section 3 - Add/Less",
    ]
    pools = registry["sectionConceptPools"]
    assert pools["PM_ADDITION"], "Addition concept pool must not be empty"
    assert pools["PM_SUBTRACTION"], "Subtraction concept pool must not be empty"
    assert pools["PM_ADD_LESS"], "Add/Less concept pool must not be empty"


def test_pm_add_less_pool_entries_produce_genuine_mixed_operations():
    """Section 3's whole point is that a single question can carry both a
    + and a - step -- distinct from Sections 1/2, where every operand after
    the first row is locked to one sign. Guards against a future edit
    accidentally re-splitting these entries into single-direction ones.
    """
    from app.services.pm_competition_mock_generation_service import _build_pm_config
    from app.question_engine.pm import generate_pm_question_set

    registry = PM_COMPETITION_LEVEL_REGISTRY["PM-L1"]
    pool = registry["sectionConceptPools"]["PM_ADD_LESS"]
    assert len(pool) == 6
    for spec in pool:
        assert spec["operationFocus"] == "ADD_LESS"
        config = _build_pm_config(spec, 20, f"TEST-ADDLESS-MIX-{spec['title']}")
        questions = generate_pm_question_set(config)
        assert len(questions) == 20
        has_positive_step = any(any(op > 0 for op in q["operands"][1:]) for q in questions)
        has_negative_step = any(any(op < 0 for op in q["operands"][1:]) for q in questions)
        assert has_positive_step and has_negative_step, (
            f"{spec['title']}: expected both + and - steps across a 20-question sample, "
            f"operands seen={[q['operands'] for q in questions]}"
        )


def test_every_pm_concept_pool_entry_can_generate_at_least_one_question():
    """Regression guard for the exact bug class found while wiring this up:
    'Direct Subtraction (Round Hundreds)' was included as a standalone
    concept-pool entry, but a round-hundred base always has ones-digit 0,
    and DIRECT_SUB_ALLOWED[0] (question_engine/pm/validators.py) is
    deliberately empty -- subtracting a single digit from a number ending in
    0 requires a borrow across places, not a direct move. That entry
    produced zero valid operand rows and blew up generation with "no valid
    generation pool" the moment it was scheduled. Every concept-pool entry
    must be independently capable of generating a question.
    """
    from app.services.pm_competition_mock_generation_service import _build_pm_config
    from app.question_engine.pm import generate_pm_question_set

    registry = PM_COMPETITION_LEVEL_REGISTRY["PM-L1"]
    failures = []
    for section_key, pool in registry["sectionConceptPools"].items():
        for spec in pool:
            config = _build_pm_config(spec, 1, f"TEST-{section_key}-{spec['title']}")
            try:
                questions = generate_pm_question_set(config)
                if not questions:
                    failures.append(f"{section_key}/{spec['title']}: generated 0 questions")
            except Exception as exc:  # noqa: BLE001
                failures.append(f"{section_key}/{spec['title']}: {exc!r}")
    assert not failures, "\n" + "\n".join(failures)


def test_collect_pm_section_locked_questions_splits_evenly_and_flat_one_mark(pm_level):
    _module, level, _admin = pm_level
    selected, coverage = CollectPmCompetitionSectionLockedQuestions(level, 60)
    assert len(selected) == 60
    assert coverage["competitionStructure"] == "PM_3_SECTION_COMPETITION_MOCK_SECTION_LOCKED"
    section_counts = {row["sectionTitle"]: row["selectedQuestionCount"] for row in coverage["sections"]}
    assert section_counts == {"Section 1 - Addition": 20, "Section 2 - Subtraction": 20, "Section 3 - Add/Less": 20}

    signatures = set()
    for question in selected:
        signature = tuple(question["operands"])
        assert signature not in signatures, f"duplicate operand row within one paper: {signature}"
        signatures.add(signature)
        assert sum(question["operands"]) == question["correct_answer"]


def test_competition_mock_section_plan_for_pm_level(db, pm_level):
    _module, level, _admin = pm_level
    plan = CompetitionMockSectionPlan(db, LevelId=level.id, TotalQuestions=45)
    assert plan["structure"] == "PM_3_SECTION_COMPETITION_MOCK"
    assert plan["moduleCode"] == "PM"
    assert plan["totalQuestions"] == 45
    counts = {s["sectionTitle"]: s["questionCount"] for s in plan["sections"]}
    # 45 split across 3 sections: 15 + 15 + 15.
    assert sum(counts.values()) == 45
    assert len(counts) == 3
    assert all(s["locked"] for s in plan["sections"])


def test_generate_competition_mock_draft_for_pm_persists_flat_one_mark_questions(db, pm_level):
    _module, level, admin = pm_level
    draft = GenerateCompetitionMockDraft(db, LevelId=level.id, CreatedBy=admin, TotalQuestions=40, DurationSeconds=1200)
    db.commit()

    exam = db.query(CompetitionMockExam).filter(CompetitionMockExam.id == draft["mockExamId"]).first()
    assert exam is not None
    assert exam.total_questions == 40
    assert exam.marks_per_question == 1
    assert exam.total_marks == 40

    questions = (
        db.query(CompetitionMockQuestion)
        .filter(CompetitionMockQuestion.mock_exam_id == exam.id)
        .order_by(CompetitionMockQuestion.question_number)
        .all()
    )
    assert len(questions) == 40
    section_titles = sorted({q.section_title for q in questions})
    assert section_titles == ["Section 1 - Addition", "Section 2 - Subtraction", "Section 3 - Add/Less"]
    assert [q.question_number for q in questions] == list(range(1, 41))


def test_pm_is_section_wise_and_flat_marks_metadata():
    assert bp_service.is_section_wise_module("PM") is True
    registry_config = PM_COMPETITION_LEVEL_REGISTRY["PM-L1"]
    marks_meta = bp_service.section_marks_metadata("PM", registry_config)
    assert marks_meta == {
        "PM_ADDITION": {"isWeighted": False, "marksPerQuestion": 1.0},
        "PM_SUBTRACTION": {"isWeighted": False, "marksPerQuestion": 1.0},
        "PM_ADD_LESS": {"isWeighted": False, "marksPerQuestion": 1.0},
    }


def test_pm_assessment_distribution_must_total_100_questions(db, pm_level):
    _module, level, _admin = pm_level
    valid = bp_service.validate_section_distribution(
        db, "PM", level, 100,
        [
            {"sectionKey": "PM_ADDITION", "questionCount": 40},
            {"sectionKey": "PM_SUBTRACTION", "questionCount": 30},
            {"sectionKey": "PM_ADD_LESS", "questionCount": 30},
        ],
    )
    assert {row[0]["key"] for row in valid} == {"PM_ADDITION", "PM_SUBTRACTION", "PM_ADD_LESS"}

    with pytest.raises(HTTPException) as excinfo:
        bp_service.validate_section_distribution(
            db, "PM", level, 90,
            [
                {"sectionKey": "PM_ADDITION", "questionCount": 30},
                {"sectionKey": "PM_SUBTRACTION", "questionCount": 30},
                {"sectionKey": "PM_ADD_LESS", "questionCount": 30},
            ],
        )
    # 2026-08-05, Shailesh: PM now goes through the same weighted-marks
    # computation path as IM (needed for PM-L2's Concept Drill section,
    # worth 5 marks/question) instead of its own PM-specific flat-100-
    # questions branch. For PM-L1 specifically this is a pure code-path
    # unification with no behavior change -- PM-L1 has zero
    # CONCEPT_DRILL-tagged sections, so the weighted computation reduces to
    # exactly the same "must total 100" check, just reported under the
    # shared ASSESSMENT_MARKS_MISMATCH code (matching IM's own error code
    # for the identical failure) instead of the old PM-only
    # ASSESSMENT_QUESTION_COUNT_MUST_BE_100. The distribution is still
    # correctly rejected either way.
    assert excinfo.value.detail["code"] == "ASSESSMENT_MARKS_MISMATCH"


def test_pm_assessment_missing_section_is_rejected(db, pm_level):
    _module, level, _admin = pm_level
    with pytest.raises(Exception):
        bp_service.validate_section_distribution(
            db, "PM", level, 100,
            [
                {"sectionKey": "PM_ADDITION", "questionCount": 50},
                {"sectionKey": "PM_SUBTRACTION", "questionCount": 50},
            ],
        )


def test_pm_published_blueprint_generates_100_flat_one_mark_questions(db, pm_level):
    _module, level, admin = pm_level
    blueprint = bp_service.create_blueprint(
        db,
        title="PM-L1 Term Assessment",
        module_id=level.module_id,
        level_id=level.id,
        total_questions=100,
        duration_seconds=3600,
        lesson_distribution=[
            {"sectionKey": "PM_ADDITION", "questionCount": 34},
            {"sectionKey": "PM_SUBTRACTION", "questionCount": 33},
            {"sectionKey": "PM_ADD_LESS", "questionCount": 33},
        ],
        instructions=None,
        created_by_user_id=admin.id,
        status="PUBLISHED",
    )
    assert blueprint.total_marks == 100.0
    assert blueprint.marks_per_question == 1.0

    version = (
        db.query(AssessmentVersion)
        .filter(AssessmentVersion.blueprint_id == blueprint.id)
        .order_by(AssessmentVersion.version_number.desc())
        .first()
    )
    assert version.status == "PUBLISHED"
    assert version.generation_mode == "SECTION_WIDE_RANDOMIZED"
    assert version.total_marks == 100.0
    assert version.marks_per_question == 1.0

    questions = (
        db.query(AssessmentQuestion)
        .filter(AssessmentQuestion.assessment_version_id == version.id)
        .order_by(AssessmentQuestion.question_number)
        .all()
    )
    assert len(questions) == 100
    for question in questions:
        assert question.lesson_id is None
        assert question.source_type == "ASSESSMENT_SECTION_REGISTRY"
        assert question.correct_answer not in (None, "")
        metadata = json.loads(question.metadata_json or "{}")
        assert metadata.get("marksMode") == "PM_FLAT"
        assert metadata.get("questionMarks") == 1.0

    section_titles = {
        json.loads(q.metadata_json or "{}").get("assessmentSectionTitle") for q in questions
    }
    assert section_titles == {"Section 1 - Addition", "Section 2 - Subtraction", "Section 3 - Add/Less"}

    options = (
        db.query(AssessmentQuestionOption)
        .filter(AssessmentQuestionOption.assessment_question_id == questions[0].id)
        .all()
    )
    assert len(options) == 4

    payload = VersionPayload(db, version, IncludeQuestions=True, IncludeAnswerKey=True)
    groups = payload["lessonGroups"]
    assert len(groups) == 3
    assert all(g["groupKind"] == "SECTION" for g in groups)
    assert sum(g["questionCount"] for g in groups) == 100


def test_pm_engine_never_imported_directly_by_dispatch_isolation_check():
    """Sanity check that the dedicated PM registry/collector file only pulls
    in the two documented generic shared utilities from the MM/IM mock file
    (_RedistributeSectionCounts, _DenseSectionNumbering), not any of that
    file's MM/IM curriculum-specific config builders or generators.
    """
    import pathlib

    pm_mock_file = (
        pathlib.Path(__file__).resolve().parents[1]
        / "app" / "services" / "pm_competition_mock_generation_service.py"
    )
    forbidden = ("MMConfig", "IMConfig", "GenerateMmQuestionSet", "GenerateImQuestionSet")
    text = pm_mock_file.read_text()
    offenders = [marker for marker in forbidden if marker in text]
    assert not offenders, f"pm_competition_mock_generation_service.py references MM/IM engine symbols: {offenders}"
