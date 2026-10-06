"""Regression coverage for the 2026-10 assessment result-review display fix
(Shailesh: "the instruction should always be present on top of the box ...
for all the flows").

Root cause: AssessmentResultPayload()'s questionReview rows carried
questionText, operands and operators but not displayType. The attempt screen
(AssessmentQuestionSafePayload) has always sent it. Without it the shared
question renderer falls back to the plain stacked layout, so in the review --
which the student, the teacher and the admin result pages all read from this
one payload -- every box question (Skill Stacker, Concept Drill, profit/loss,
simple interest) lost its box and its instruction, and expression questions
(multiplication, division, BODMAS) were stacked like an addition.

This runs the real flow on a real in-memory schema: a section-wise MM-L1
blueprint -> generated version -> assignment -> StartAssessmentAttempt ->
SubmitAssessmentAttempt -> AssessmentResultPayload, and locks in that every
review row says how its question is drawn, exactly as stored.
"""
from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import AssessmentAssignment, AssessmentQuestion, AssessmentVersion, Level, Module, Student, User
from app.services import assessment_blueprint_service as bp_service
from app.services.assessment_engine_service import (
    AssessmentResultPayload,
    StartAssessmentAttempt,
    SubmitAssessmentAttempt,
)
from app.services.competition_mock_generation_service import MM_COMPETITION_LEVEL_REGISTRY

WEIGHTED_FAMILIES = {"SKILL_STACKER", "CONCEPT_DRILL"}
BOX_DISPLAY_TYPES = {
    "FINANCIAL_TABLE",
    "SKILL_STACKER_TABLE",
    "CONCEPT_DRILL_TABLE",
    "CONCEPT_DRILL_MULTIPLY",
    "CONCEPT_DRILL_DIVIDE",
    "CONCEPT_DRILL_RANGE_SUM",
}


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    models.Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)()
    try:
        yield session
    finally:
        session.close()


def _hundred_mark_distribution(registry_config):
    """5 marks per Skill Stacker / Concept Drill question, 1 mark per other
    question, exactly 100 marks in total -- the blueprint rule."""
    section_defs = registry_config["sectionDefinitions"]
    pools = registry_config["sectionConceptPools"]
    weighted = [
        d for d in section_defs
        if pools.get(d["key"]) and all(c.get("conceptFamily") in WEIGHTED_FAMILIES for c in pools[d["key"]])
    ]
    normal = [d for d in section_defs if d not in weighted]
    rows = [{"sectionKey": d["key"], "questionCount": 2} for d in weighted]
    remaining = 100 - 10 * len(weighted)
    base, extra = divmod(remaining, len(normal))
    rows += [{"sectionKey": d["key"], "questionCount": base + (1 if i < extra else 0)} for i, d in enumerate(normal)]
    return rows


def test_assessment_review_rows_carry_the_display_type(db):
    module = Module(module_code="MM", module_name="Master Module", is_active=True)
    db.add(module)
    db.flush()
    level = Level(module_id=module.id, level_code="MM-L1", level_name="MM Level 1", is_active=True)
    admin = User(full_name="Test Admin", role="SUPER_ADMIN", email="review-admin@test.local", password_hash="x")
    student_user = User(full_name="Review Student", role="STUDENT", email="review-student@test.local", password_hash="x")
    db.add_all([level, admin, student_user])
    db.flush()
    student = Student(user_id=student_user.id, student_code="MP-ST-REVIEW", current_level_id=level.id)
    db.add(student)
    db.commit()

    distribution = _hundred_mark_distribution(MM_COMPETITION_LEVEL_REGISTRY["MM-L1"])
    blueprint = bp_service.create_blueprint(
        db,
        title="MM-L1 Assessment",
        module_id=module.id,
        level_id=level.id,
        total_questions=sum(row["questionCount"] for row in distribution),
        duration_seconds=3600,
        lesson_distribution=distribution,
        instructions=None,
        created_by_user_id=admin.id,
        status="PUBLISHED",
    )
    version = db.query(AssessmentVersion).filter(AssessmentVersion.blueprint_id == blueprint.id).one()
    questions = {
        q.id: q
        for q in db.query(AssessmentQuestion).filter(AssessmentQuestion.assessment_version_id == version.id).all()
    }
    stored_types = {(q.display_type or "").upper() for q in questions.values()}
    # The fixture must actually contain the shapes that used to break.
    assert stored_types & BOX_DISPLAY_TYPES, "expected box questions in an MM-L1 assessment"
    assert "EXPRESSION_WORKSHEET" in stored_types

    assignment = AssessmentAssignment(
        assessment_version_id=version.id,
        blueprint_id=blueprint.id,
        student_id=student.id,
        assigned_by_user_id=admin.id,
        status="ASSIGNED",
        max_attempts=1,
        is_active=True,
    )
    db.add(assignment)
    db.commit()

    attempt = StartAssessmentAttempt(db, student, assignment.id)
    submitted = SubmitAssessmentAttempt(db, student, attempt.id)
    review = AssessmentResultPayload(db, submitted, IncludeReview=True)["questionReview"]

    assert len(review) == len(questions) > 0
    for row in review:
        stored = questions[row["questionId"]]
        assert "displayType" in row, "the assessment review must say how each question is drawn"
        assert row["displayType"] == stored.display_type
        assert row["questionText"] == stored.question_text
    # Every financial box in the review still has its instruction.
    for row in review:
        if (row["displayType"] or "").upper() == "FINANCIAL_TABLE":
            assert (row["questionText"] or "").strip().lower().startswith("find ")
