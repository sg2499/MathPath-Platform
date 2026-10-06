"""Regression coverage for the 2026-10-06 assessment rank-up animation
(Shailesh: "lets add the rank up animation for assessments as well since
they also add to that").

An assessment awards XP through EconomyService.evaluate_activity_performance,
the same shared formula practice sheets and mock exams use, so it can move a
student to a new rank tier. The practice-sheet and mock submit replies have
always said so (rankedUp / newRankTier) and their result pages play the
rank-up animation; the assessment reply carried only rewardBreakdown, so the
assessment result page had nothing to play.

AssessmentResultPayload() now surfaces the two fields off
Attempt._side_effects_result -- on the request that completed the attempt
only, exactly like rewardBreakdown. This runs the real flow on a real
in-memory schema (blueprint -> version -> assignment -> start -> submit ->
payload) and locks in the shape, the pass-through, and the safe defaults on a
plain reload. Nothing about the award itself is touched.
"""
from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import AssessmentAssignment, AssessmentVersion, Level, Module, Student, User
from app.services import assessment_blueprint_service as bp_service
from app.services.assessment_engine_service import (
    AssessmentResultPayload,
    StartAssessmentAttempt,
    SubmitAssessmentAttempt,
)
from app.services.competition_mock_generation_service import MM_COMPETITION_LEVEL_REGISTRY

WEIGHTED_FAMILIES = {"SKILL_STACKER", "CONCEPT_DRILL"}


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


def _submitted_assessment(db):
    module = Module(module_code="MM", module_name="Master Module", is_active=True)
    db.add(module)
    db.flush()
    level = Level(module_id=module.id, level_code="MM-L1", level_name="MM Level 1", is_active=True)
    admin = User(full_name="Test Admin", role="SUPER_ADMIN", email="rank-admin@test.local", password_hash="x")
    student_user = User(full_name="Rank Student", role="STUDENT", email="rank-student@test.local", password_hash="x")
    db.add_all([level, admin, student_user])
    db.flush()
    student = Student(user_id=student_user.id, student_code="MP-ST-RANK", current_level_id=level.id)
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
    return SubmitAssessmentAttempt(db, student, attempt.id)


def test_real_submit_reply_says_whether_the_student_ranked_up(db):
    submitted = _submitted_assessment(db)
    side_effects = getattr(submitted, "_side_effects_result", None)
    # The economy award ran on this request and reports the rank outcome under
    # the keys the payload reads -- a rename on either side would silently
    # switch the animation off again.
    assert isinstance(side_effects, dict)
    assert "ranked_up" in side_effects and "new_rank" in side_effects

    payload = AssessmentResultPayload(db, submitted, IncludeReview=False)

    assert payload["rankedUp"] is bool(side_effects["ranked_up"])
    # A blank paper earns no rank; the tier is only named when one was reached.
    assert payload["rankedUp"] is False
    assert payload["newRankTier"] is None
    # The reward hand-off this sits beside is unchanged.
    assert payload["rewardBreakdown"] == side_effects.get("reward_breakdown")


def test_payload_names_the_new_tier_when_the_award_crossed_one(db):
    submitted = _submitted_assessment(db)
    submitted._side_effects_result = {
        "ranked_up": True,
        "new_rank": "BRONZE_V",
        "reward_breakdown": {"xp": {"total": 260}, "coins": {"total": 104}},
    }

    payload = AssessmentResultPayload(db, submitted, IncludeReview=False)

    assert payload["rankedUp"] is True
    assert payload["newRankTier"] == "BRONZE_V"
    assert payload["rewardBreakdown"] == {"xp": {"total": 260}, "coins": {"total": 104}}


def test_payload_never_names_a_tier_without_a_rank_up(db):
    """new_rank is the student's CURRENT tier on every award, ranked up or
    not -- the payload must only pass it on when a tier was actually reached,
    or every assessment would play the animation."""
    submitted = _submitted_assessment(db)
    submitted._side_effects_result = {"ranked_up": False, "new_rank": "COPPER_IV", "reward_breakdown": None}

    payload = AssessmentResultPayload(db, submitted, IncludeReview=False)

    assert payload["rankedUp"] is False
    assert payload["newRankTier"] is None


def test_plain_reload_has_no_rank_up(db):
    """A later GET of the result (no side effects attached) never replays it."""
    submitted = _submitted_assessment(db)
    submitted._side_effects_result = None

    payload = AssessmentResultPayload(db, submitted, IncludeReview=False)

    assert payload["rankedUp"] is False
    assert payload["newRankTier"] is None
    assert payload["rewardBreakdown"] is None
