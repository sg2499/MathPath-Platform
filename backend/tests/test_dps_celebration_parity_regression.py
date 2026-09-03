"""Regression coverage for the 2026-09-03 DPS celebration parity fix
(Shailesh): "we need to wire in the flow that is followed for the mock exams
where the student after completing an attempt sees the xp and coins received
modal followed by the rank up cut scenes followed by the badges unlocked
that are displayed right now. this does not happen for the dps side of
things and we need to follow the same flow for dps attempts as well."

Root cause: attempt_service.py's _process_attempt_gamification_side_effects()
already computed unlocked_badges (AchievementEngine.evaluate_dps_attempt_
submission) and already had ranked_up/new_rank available on econ_result
(EconomyService.evaluate_activity_performance -- the exact same shared
formula competition_mock_attempt_service.py uses), but only ever returned
the raw econ_result dict -- unlocked_badges was computed for the
notification loop and then silently discarded, never part of this
function's return value. result_payload() then only ever read
"reward_breakdown" off of it. So the DPS result page had nothing to hand a
badge reveal or rank-up cinematic even when one had genuinely just
happened.

The fix makes _process_attempt_gamification_side_effects() return the exact
same {unlockedBadges, awardedXP, awardedCoins, rankedUp, newRankTier,
rewardBreakdown} shape competition_mock_attempt_service.py's
_ProcessMockCompletionSideEffects() already returns, and makes
result_payload() surface all of it (not just rewardBreakdown) -- this suite
locks in both halves directly against the real functions, using the same
"construct an already-submitted Attempt row and call the side-effects
function directly" pattern test_dps_badge_detection.py already established
for this exact area of the codebase.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import Attempt, DPS, Lesson, Level, Module, Student, User
from app.services.achievements import AchievementEngine
from app.services.attempt_service import _process_attempt_gamification_side_effects, result_payload


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
    AchievementEngine.seed_badges(session)
    session.commit()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def student(db):
    user = User(full_name="Test Student", email="dps-celebration-test@test.local", password_hash="x", role="STUDENT")
    db.add(user)
    db.commit()
    module = Module(module_code="MM", module_name="Master Module")
    db.add(module)
    db.commit()
    level = Level(module_id=module.id, level_code="MM-L1", level_name="Master Module Level 1")
    db.add(level)
    db.commit()
    lesson = Lesson(level_id=level.id, lesson_number=1, lesson_title="Lesson 1")
    db.add(lesson)
    db.commit()
    st = Student(user_id=user.id, student_code="MP-ST-CELEB", current_level_id=level.id)
    db.add(st)
    db.commit()
    return st


def _make_dps(db, lesson_id, dps_number=1, duration_seconds=600):
    d = DPS(lesson_id=lesson_id, dps_number=dps_number, dps_title=f"DPS {dps_number}", default_duration_seconds=duration_seconds)
    db.add(d)
    db.commit()
    return d


def _make_attempt(student_id, dps_id, *, accuracy, submitted_at, duration_seconds=600) -> Attempt:
    return Attempt(
        id=str(uuid.uuid4()),
        dps_id=dps_id,
        student_id=student_id,
        mode="PRACTICE",
        status="SUBMITTED",
        attempt_group_id=None,
        attempt_number=0,
        started_at=submitted_at - timedelta(seconds=duration_seconds),
        expires_at=submitted_at + timedelta(seconds=1),
        submitted_at=submitted_at,
        duration_seconds=duration_seconds,
        time_taken_seconds=duration_seconds,
        total_questions=10,
        attempted_count=10,
        unanswered_count=0,
        accuracy_percentage=accuracy,
    )


def _submit_and_process(db, attempt: Attempt) -> dict:
    db.add(attempt)
    db.commit()
    return _process_attempt_gamification_side_effects(db, attempt)


def test_side_effects_return_shape_mirrors_mock_exactly(db, student):
    """Every one of the six keys the DPS result page (and result_payload())
    now depends on must be present, regardless of whether anything notable
    happened this attempt -- mirrors SubmitCompetitionMockAttemptForStudent's
    response shape in competition_mock_attempt_service.py.
    """
    lesson = db.query(Lesson).first()
    dps = _make_dps(db, lesson.id)
    now = datetime.now(timezone.utc)
    result = _submit_and_process(db, _make_attempt(student.id, dps.id, accuracy=60, submitted_at=now))
    assert result is not None
    for key in ("unlockedBadges", "awardedXP", "awardedCoins", "rankedUp", "newRankTier", "rewardBreakdown"):
        assert key in result, f"missing {key} in DPS side-effects result"
    assert isinstance(result["unlockedBadges"], list)
    assert isinstance(result["rankedUp"], bool)


def test_unlocked_badges_survive_into_the_returned_dict(db, student):
    """Before this fix, unlocked_badges was computed then discarded -- this
    is the exact regression: the 25th dps_tome-qualifying attempt must
    report the badge back to the caller, not just persist it silently.
    """
    lesson = db.query(Lesson).first()
    now = datetime.now(timezone.utc)
    result = None
    for i in range(25):
        dps = _make_dps(db, lesson.id, dps_number=i + 1)
        result = _submit_and_process(db, _make_attempt(student.id, dps.id, accuracy=60, submitted_at=now + timedelta(minutes=i)))
    assert result is not None
    codes = {f"{b['code']}_{b['tier']}" for b in result["unlockedBadges"]}
    assert "dps_tome_BASE" in codes, "unlockedBadges must carry the badge this attempt just unlocked, not discard it"


def test_result_payload_surfaces_badges_rank_and_reward_from_side_effects(db, student):
    """The other half of the fix: result_payload() must actually read the
    new camelCase keys (unlockedBadges/rankedUp/newRankTier) off
    attempt._side_effects_result, not just rewardBreakdown.
    """
    lesson = db.query(Lesson).first()
    dps = _make_dps(db, lesson.id)
    now = datetime.now(timezone.utc)
    attempt = _make_attempt(student.id, dps.id, accuracy=90, submitted_at=now)
    db.add(attempt)
    db.commit()
    fake_side_effects = {
        "unlockedBadges": [{"id": "b1", "code": "dps_tome", "tier": "BASE", "name": "Boundless Tome"}],
        "awardedXP": 42,
        "awardedCoins": 7,
        "rankedUp": True,
        "newRankTier": "BRONZE_III",
        "rewardBreakdown": {"xp": {"total": 42}, "coins": {"total": 7}},
    }
    attempt._side_effects_result = fake_side_effects

    payload = result_payload(db, attempt, include_review=False)

    assert payload["unlockedBadges"] == fake_side_effects["unlockedBadges"]
    assert payload["rankedUp"] is True
    assert payload["newRankTier"] == "BRONZE_III"
    assert payload["rewardBreakdown"] == fake_side_effects["rewardBreakdown"]


def test_result_payload_defaults_safely_on_a_plain_reload(db, student):
    """A GET /result reload (no _side_effects_result attached, e.g. the
    student refreshes the page) must never crash and must report "nothing
    to celebrate" rather than replaying a stale reveal -- same contract the
    mock result endpoint already guarantees.
    """
    lesson = db.query(Lesson).first()
    dps = _make_dps(db, lesson.id)
    now = datetime.now(timezone.utc)
    attempt = _make_attempt(student.id, dps.id, accuracy=90, submitted_at=now)
    db.add(attempt)
    db.commit()

    payload = result_payload(db, attempt, include_review=False)

    assert payload["unlockedBadges"] == []
    assert payload["rankedUp"] is False
    assert payload["newRankTier"] is None
    assert payload["rewardBreakdown"] is None
