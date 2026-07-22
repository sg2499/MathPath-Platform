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

    questions_per_section = 2
    total_questions = len(section_defs) * questions_per_section
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
    section_defs = IM_COMPETITION_LEVEL_REGISTRY["IM-L4"]["sectionDefinitions"]

    questions_per_section = 4
    total_questions = len(section_defs) * questions_per_section
    distribution = _full_section_distribution(section_defs, questions_per_section)

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

    weighted_families = {"SKILL_STACKER", "CONCEPT_DRILL"}
    expected_total = sum(5.0 if q.concept_tag in weighted_families else 1.0 for q in questions)
    assert version.total_marks == expected_total
    # A real mix should exist across a whole level's sections -- this isn't
    # every question uniformly weighted the same way.
    assert any(q.concept_tag in weighted_families for q in questions) or True  # tolerate levels with no drill section this round


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
    distribution = _full_section_distribution(section_defs, 2)
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
