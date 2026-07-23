"""Regression coverage for the 2026-07-22 section-wise assessment rework.

Assessments for IM and MM now mirror the exact sections that level's
competition mock exam uses (AssessmentBlueprintSection), sourced from the
same IM_COMPETITION_LEVEL_REGISTRY / MM_COMPETITION_LEVEL_REGISTRY registry
mocks read, instead of a lesson-wise split. MM is always flat 1 mark per
question everywhere; IM (and any future concept-weighted module) is 5 marks
for Skill Stacker / Concept Drill questions and 1 mark otherwise. YLM stays
on the original lesson-wise AssessmentBlueprintLesson path, untouched.

This deliberately does not seed any Lesson/DPS/DPSSection rows -- the whole
point of the section-wise redesign is that IM/MM assessment generation reads
only the static mock section registry (competition_mock_generation_service.py)
plus Module/Level, exactly like mocks themselves do.
"""
from fastapi import HTTPException
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import models
from app.models.models import Module, Level, User
from app.services import assessment_blueprint_service as bp_service
from app.services.assessment_engine_service import VersionPayload
from app.services.competition_mock_generation_service import (
    MM_COMPETITION_LEVEL_REGISTRY,
    IM_COMPETITION_LEVEL_REGISTRY,
)

WEIGHTED_FAMILIES = {"SKILL_STACKER", "CONCEPT_DRILL"}


def _distribute_evenly(section_defs, total):
    """Same base+remainder split the Assessment Blueprint Studio frontend
    uses (distributeEvenlyFromSections in page.tsx) -- every section gets at
    least floor(total/count), the first `total % count` sections get one
    extra, so the sum always lands exactly on `total`.
    """
    count = len(section_defs)
    base = total // count
    remainder = total % count
    rows = []
    for index, section_def in enumerate(section_defs):
        extra = 1 if index < remainder else 0
        rows.append({"sectionKey": section_def["key"], "questionCount": base + extra})
    return rows


def _valid_weighted_distribution(section_defs, concept_pools, weighted_question_count=2):
    """Builds a section distribution for a concept-weighted module (IM) that
    satisfies the 2026-07-23 100-marks-always invariant: 5 marks x every
    Skill Stacker/Concept Drill question + 1 mark x everything else must sum
    to exactly 100. Mirrors distributeWeighted100() in the Assessment
    Blueprint Studio frontend (page.tsx).
    """
    weighted_keys = {
        key for key, concepts in concept_pools.items()
        if concepts and all(concept.get("conceptFamily") in WEIGHTED_FAMILIES for concept in concepts)
    }
    weighted_defs = [row for row in section_defs if row["key"] in weighted_keys]
    normal_defs = [row for row in section_defs if row["key"] not in weighted_keys]
    normal_total = 100 - weighted_question_count * 5
    assert normal_total >= len(normal_defs), "test fixture: weighted_question_count too high for this level's section count"
    return _distribute_evenly(weighted_defs, weighted_question_count) + _distribute_evenly(normal_defs, normal_total)


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    models.Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _full_section_distribution(section_defs, questions_per_section):
    return [
        {"sectionKey": section_def["key"], "questionCount": questions_per_section}
        for section_def in section_defs
    ]


def _seed_module_level(db_session, module_code, module_name, level_code, level_name):
    module = Module(module_code=module_code, module_name=module_name, is_active=True)
    db_session.add(module)
    db_session.flush()
    level = Level(module_id=module.id, level_code=level_code, level_name=level_name, is_active=True)
    db_session.add(level)
    db_session.flush()
    admin = User(full_name="Test Admin", role="SUPER_ADMIN", email="admin@test.local", password_hash="x")
    db_session.add(admin)
    db_session.flush()
    return module, level, admin


def test_mm_section_wise_blueprint_generates_flat_one_mark_questions(db_session):
    module, level, admin = _seed_module_level(db_session, "MM", "Master Module", "MM-L1", "MM Level 1")
    section_defs = MM_COMPETITION_LEVEL_REGISTRY["MM-L1"]["sectionDefinitions"]
    assert len(section_defs) == 10

    # 2026-07-23: MM assessments must always total exactly 100 questions (1
    # mark each, so 100 marks) -- 10 sections x 10 questions each.
    questions_per_section = 10
    total_questions = len(section_defs) * questions_per_section
    assert total_questions == 100
    distribution = _full_section_distribution(section_defs, questions_per_section)

    blueprint = bp_service.create_blueprint(
        db_session,
        title="MM-L1 Assessment",
        module_id=module.id,
        level_id=level.id,
        total_questions=total_questions,
        duration_seconds=1800,
        lesson_distribution=distribution,
        instructions=None,
        created_by_user_id=admin.id,
        status="PUBLISHED",
    )

    payload = bp_service.blueprint_payload(db_session, blueprint)
    assert payload["distributionMode"] == "SECTION_WISE"
    assert len(payload["sectionDistribution"]) == 10

    version = (
        db_session.query(models.AssessmentVersion)
        .filter(models.AssessmentVersion.blueprint_id == blueprint.id)
        .one()
    )
    questions = (
        db_session.query(models.AssessmentQuestion)
        .filter(models.AssessmentQuestion.assessment_version_id == version.id)
        .all()
    )
    assert len(questions) == total_questions
    # MM: every question is flat 1 mark, always -- total_marks must equal
    # total_questions exactly, never the old 100-total auto-balanced scheme.
    assert version.total_marks == total_questions
    assert version.marks_per_question == 1.0
    for question in questions:
        assert question.lesson_id is None
        assert question.source_type == "ASSESSMENT_SECTION_REGISTRY"


def test_im_section_wise_blueprint_weights_concept_drill_and_skill_stacker(db_session):
    module, level, admin = _seed_module_level(db_session, "IM", "Intermediate Module", "IM-L4", "IM Level 4")
    registry_config = IM_COMPETITION_LEVEL_REGISTRY["IM-L4"]
    section_defs = registry_config["sectionDefinitions"]

    # 2026-07-23: IM assessments must always total exactly 100 marks (5 marks
    # x each Skill Stacker/Concept Drill question, 1 mark x every other
    # question) -- a uniform "same count everywhere" distribution (the old
    # test's approach) essentially never lands on exactly 100, so this now
    # builds a distribution that satisfies the invariant on purpose.
    distribution = _valid_weighted_distribution(section_defs, registry_config["sectionConceptPools"], weighted_question_count=2)
    total_questions = sum(row["questionCount"] for row in distribution)

    blueprint = bp_service.create_blueprint(
        db_session,
        title="IM-L4 Assessment",
        module_id=module.id,
        level_id=level.id,
        total_questions=total_questions,
        duration_seconds=1800,
        lesson_distribution=distribution,
        instructions=None,
        created_by_user_id=admin.id,
        status="PUBLISHED",
    )

    version = (
        db_session.query(models.AssessmentVersion)
        .filter(models.AssessmentVersion.blueprint_id == blueprint.id)
        .one()
    )
    questions = (
        db_session.query(models.AssessmentQuestion)
        .filter(models.AssessmentQuestion.assessment_version_id == version.id)
        .all()
    )
    assert len(questions) == total_questions

    expected_total = sum(5.0 if q.concept_tag in WEIGHTED_FAMILIES else 1.0 for q in questions)
    assert version.total_marks == expected_total
    # The real point of this feature: total marks are always exactly 100,
    # regardless of question count.
    assert version.total_marks == 100.0
    assert any(q.concept_tag in WEIGHTED_FAMILIES for q in questions)


def test_im_distribution_violating_marks_invariant_is_rejected(db_session):
    module, level, admin = _seed_module_level(db_session, "IM", "Intermediate Module", "IM-L4", "IM Level 4")
    section_defs = IM_COMPETITION_LEVEL_REGISTRY["IM-L4"]["sectionDefinitions"]

    # Uniform 4-per-section (the pre-2026-07-23 test's distribution) does not
    # land on 100 marks for IM-L4 -- must be rejected up front, not silently
    # published with a wrong total.
    questions_per_section = 4
    distribution = _full_section_distribution(section_defs, questions_per_section)
    total_questions = len(section_defs) * questions_per_section

    with pytest.raises(HTTPException) as excinfo:
        bp_service.create_blueprint(
            db_session,
            title="IM-L4 Invalid Marks Assessment",
            module_id=module.id,
            level_id=level.id,
            total_questions=total_questions,
            duration_seconds=1800,
            lesson_distribution=distribution,
            instructions=None,
            created_by_user_id=admin.id,
            status="DRAFT",
        )
    assert excinfo.value.detail["code"] == "ASSESSMENT_MARKS_MISMATCH"


def test_im_weighted_question_count_is_editable_and_still_totals_100(db_session):
    # Shailesh's explicit choice: the Skill Stacker/Concept Drill question
    # count is editable per assessment (not locked to the default of 2) --
    # any valid value must still land on exactly 100 marks.
    module, level, admin = _seed_module_level(db_session, "IM", "Intermediate Module", "IM-L4", "IM Level 4")
    registry_config = IM_COMPETITION_LEVEL_REGISTRY["IM-L4"]
    section_defs = registry_config["sectionDefinitions"]

    distribution = _valid_weighted_distribution(section_defs, registry_config["sectionConceptPools"], weighted_question_count=6)
    total_questions = sum(row["questionCount"] for row in distribution)

    blueprint = bp_service.create_blueprint(
        db_session,
        title="IM-L4 Assessment W6",
        module_id=module.id,
        level_id=level.id,
        total_questions=total_questions,
        duration_seconds=1800,
        lesson_distribution=distribution,
        instructions=None,
        created_by_user_id=admin.id,
        status="PUBLISHED",
    )
    version = (
        db_session.query(models.AssessmentVersion)
        .filter(models.AssessmentVersion.blueprint_id == blueprint.id)
        .one()
    )
    assert version.total_marks == 100.0


def test_mm_distribution_with_wrong_total_questions_is_rejected(db_session):
    # 2026-07-23: MM assessments must always be exactly 100 questions (1 mark
    # each) -- anything else must be rejected up front.
    module, level, admin = _seed_module_level(db_session, "MM", "Master Module", "MM-L1", "MM Level 1")
    section_defs = MM_COMPETITION_LEVEL_REGISTRY["MM-L1"]["sectionDefinitions"]
    distribution = _full_section_distribution(section_defs, 4)  # 10 sections x 4 = 40, not 100
    total_questions = sum(row["questionCount"] for row in distribution)

    with pytest.raises(HTTPException) as excinfo:
        bp_service.create_blueprint(
            db_session,
            title="MM-L1 Wrong Total Assessment",
            module_id=module.id,
            level_id=level.id,
            total_questions=total_questions,
            duration_seconds=1800,
            lesson_distribution=distribution,
            instructions=None,
            created_by_user_id=admin.id,
            status="DRAFT",
        )
    assert excinfo.value.detail["code"] == "ASSESSMENT_QUESTION_COUNT_MUST_BE_100"


def test_missing_section_in_distribution_is_rejected(db_session):
    module, level, admin = _seed_module_level(db_session, "MM", "Master Module", "MM-L1", "MM Level 1")
    section_defs = MM_COMPETITION_LEVEL_REGISTRY["MM-L1"]["sectionDefinitions"]
    # Deliberately drop the last section -- full coverage is required.
    partial = _full_section_distribution(section_defs[:-1], 2)
    total_questions = sum(row["questionCount"] for row in partial)

    with pytest.raises(Exception):
        bp_service.create_blueprint(
            db_session,
            title="Incomplete MM-L1 Assessment",
            module_id=module.id,
            level_id=level.id,
            total_questions=total_questions,
            duration_seconds=1800,
            lesson_distribution=partial,
            instructions=None,
            created_by_user_id=admin.id,
            status="DRAFT",
        )


def test_generated_preview_groups_section_wise_questions_by_section(db_session):
    module, level, admin = _seed_module_level(db_session, "MM", "Master Module", "MM-L1", "MM Level 1")
    section_defs = MM_COMPETITION_LEVEL_REGISTRY["MM-L1"]["sectionDefinitions"]
    distribution = _full_section_distribution(section_defs, 10)  # 10 sections x 10 = 100, always exactly 100 for MM
    total_questions = sum(row["questionCount"] for row in distribution)

    blueprint = bp_service.create_blueprint(
        db_session,
        title="MM-L1 Preview Grouping",
        module_id=module.id,
        level_id=level.id,
        total_questions=total_questions,
        duration_seconds=1800,
        lesson_distribution=distribution,
        instructions=None,
        created_by_user_id=admin.id,
        status="PUBLISHED",
    )
    version = (
        db_session.query(models.AssessmentVersion)
        .filter(models.AssessmentVersion.blueprint_id == blueprint.id)
        .one()
    )
    payload = VersionPayload(db_session, version, IncludeQuestions=True, IncludeAnswerKey=True)
    groups = payload["lessonGroups"]
    # Real section grouping, not one giant "unknown" bucket -- one group per
    # section, each carrying its section identity for the frontend to render.
    assert len(groups) == len(section_defs)
    assert all(g["groupKind"] == "SECTION" for g in groups)
    assert all(g["sectionKey"] for g in groups)
    assert sum(g["questionCount"] for g in groups) == total_questions


def test_ylm_module_stays_on_legacy_lesson_wise_path(db_session):
    # YLM has no entry in either section registry -- is_section_wise_module()
    # must return False for it, not silently error looking one up.
    assert bp_service.is_section_wise_module("YLM") is False
    assert bp_service.is_section_wise_module("MM") is True
    assert bp_service.is_section_wise_module("IM") is True
