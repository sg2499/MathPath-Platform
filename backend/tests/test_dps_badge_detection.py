"""Detection-logic tests for the 10 DPS badge families (dps_discipline,
dps_crystal, dps_tome, dps_quill, dps_sage, dps_chain, dps_phoenix,
dps_anvil, dps_midnight, dps_compass).

Context: these 40 badges (10 families x 4 tiers) were seeded into the
database and given a full frontend/audio treatment on 2026-07-31
(PRs #415/#416/#417), but shipped with zero backend evaluation logic --
confirmed by grepping achievements.py and attempt_service.py before this
fix existed. Every DPS student would have seen 40 permanently-locked,
structurally unearnable badges in the Trophy Room. This suite exercises
the AchievementEngine.evaluate_dps_attempt_submission() detection logic
added on 2026-08-02 against a real in-memory schema (not a mock), the same
pattern test_route_level_section_wise_e2e.py already uses for this repo's
route-level tests.

These tests intentionally do not go through attempt_service.submit_attempt()
-- they construct already-submitted Attempt rows directly, since the thing
under test is achievements.py's detection logic itself, not the submission
pipeline (which already has its own dedicated test coverage elsewhere).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import (
    Attempt, DPS, Lesson, Level, Module, Student, User,
)
from app.services.achievements import AchievementEngine


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
    user = User(full_name="Test Student", email="dps-badge-test@test.local", password_hash="x", role="STUDENT")
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
    st = Student(user_id=user.id, student_code="MP-ST-TEST", current_level_id=level.id)
    db.add(st)
    db.commit()
    return st


def _make_dps(db, lesson_id, dps_number=1, duration_seconds=600):
    d = DPS(lesson_id=lesson_id, dps_number=dps_number, dps_title=f"DPS {dps_number}", default_duration_seconds=duration_seconds)
    db.add(d)
    db.commit()
    return d


def _attempt(
    student_id: str,
    dps_id: str,
    *,
    accuracy: float,
    submitted_at: datetime,
    duration_seconds: int = 600,
    time_taken_seconds: int | None = None,
    unanswered_count: int = 0,
    attempt_number: int = 0,
    attempt_group_id: str | None = None,
    benchmark_status: str = "CLEARED",
    status: str = "SUBMITTED",
) -> Attempt:
    return Attempt(
        id=str(uuid.uuid4()),
        dps_id=dps_id,
        student_id=student_id,
        mode="PRACTICE",
        status=status,
        attempt_group_id=attempt_group_id,
        attempt_number=attempt_number,
        benchmark_status=benchmark_status,
        cleared_at_attempt=(benchmark_status == "CLEARED"),
        started_at=submitted_at - timedelta(seconds=duration_seconds),
        expires_at=submitted_at + timedelta(seconds=1),
        submitted_at=submitted_at,
        duration_seconds=duration_seconds,
        time_taken_seconds=time_taken_seconds if time_taken_seconds is not None else duration_seconds,
        total_questions=10,
        attempted_count=10,
        unanswered_count=unanswered_count,
        accuracy_percentage=accuracy,
    )


def _submit(db, attempt: Attempt) -> list[dict]:
    db.add(attempt)
    db.commit()
    return AchievementEngine.evaluate_dps_attempt_submission(db, attempt.student_id, attempt)


def _codes(unlocked: list[dict]) -> set[str]:
    return {f"{b['code']}_{b['tier']}" for b in unlocked}


# ---------------------------------------------------------------------------
# 3. Boundless Tome -- simplest family (plain lifetime counter), good smoke
# test that seeding + the shared _award_all_tiers tail actually wires up to
# real AchievementBadge rows (seed_badges() must have created a
# ("dps_tome", "BASE", ..., 25) row for this to unlock at all).
# ---------------------------------------------------------------------------
def test_dps_tome_unlocks_base_at_25_and_not_before(db, student):
    now = datetime.now(timezone.utc)
    lesson = db.query(Lesson).first()
    dps = _make_dps(db, lesson.id)
    unlocked = []
    for i in range(25):
        result = _submit(db, _attempt(student.id, dps.id, accuracy=60, submitted_at=now + timedelta(minutes=i)))
        unlocked += result
    assert "dps_tome_BASE" in _codes(unlocked)


def test_dps_tome_does_not_unlock_before_threshold(db, student):
    now = datetime.now(timezone.utc)
    lesson = db.query(Lesson).first()
    dps = _make_dps(db, lesson.id)
    unlocked = []
    for i in range(24):
        unlocked += _submit(db, _attempt(student.id, dps.id, accuracy=60, submitted_at=now + timedelta(minutes=i)))
    assert "dps_tome_BASE" not in _codes(unlocked)


# ---------------------------------------------------------------------------
# 2. Pure Crystal -- distinct-sheet dedup: scoring 100% on the SAME sheet
# five times must not count as 5 distinct sheets.
# ---------------------------------------------------------------------------
def test_dps_crystal_counts_distinct_sheets_not_repeat_attempts(db, student):
    now = datetime.now(timezone.utc)
    lesson = db.query(Lesson).first()
    dps = _make_dps(db, lesson.id)
    unlocked = []
    for i in range(5):
        unlocked += _submit(db, _attempt(student.id, dps.id, accuracy=100, submitted_at=now + timedelta(minutes=i)))
    # Same single sheet, 5 perfect attempts -- still only 1 distinct sheet.
    assert "dps_crystal_BASE" not in _codes(unlocked)


def test_dps_crystal_unlocks_on_5_distinct_perfect_sheets(db, student):
    now = datetime.now(timezone.utc)
    lesson = db.query(Lesson).first()
    unlocked = []
    for i in range(5):
        dps = _make_dps(db, lesson.id, dps_number=i + 1)
        unlocked += _submit(db, _attempt(student.id, dps.id, accuracy=100, submitted_at=now + timedelta(minutes=i)))
    assert "dps_crystal_BASE" in _codes(unlocked)


# ---------------------------------------------------------------------------
# 4/5. Lightning Quill / Sage's Eye -- opposite ends of the time-utilization
# spectrum; confirm each only fires for its own regime.
# ---------------------------------------------------------------------------
def test_dps_quill_requires_fast_and_accurate(db, student):
    now = datetime.now(timezone.utc)
    lesson = db.query(Lesson).first()
    dps = _make_dps(db, lesson.id, duration_seconds=600)
    # Fast (40% of time) + high accuracy (95%) -- should count.
    unlocked = _submit(db, _attempt(student.id, dps.id, accuracy=95, submitted_at=now, duration_seconds=600, time_taken_seconds=240))
    # Fast but low accuracy -- should not count toward quill.
    dps2 = _make_dps(db, lesson.id, dps_number=2)
    unlocked2 = _submit(db, _attempt(student.id, dps2.id, accuracy=60, submitted_at=now + timedelta(minutes=1), duration_seconds=600, time_taken_seconds=240))
    assert AchievementEngine._get_stat(db, student.id, "dps_quill_count") == 1


def test_dps_sage_requires_slow_and_perfect(db, student):
    now = datetime.now(timezone.utc)
    lesson = db.query(Lesson).first()
    dps = _make_dps(db, lesson.id, duration_seconds=600)
    # Used 97% of allotted time and scored exactly 100 -- should count.
    _submit(db, _attempt(student.id, dps.id, accuracy=100, submitted_at=now, duration_seconds=600, time_taken_seconds=582))
    assert AchievementEngine._get_stat(db, student.id, "dps_sage_count") == 1
    # Slow but not perfect -- should not count.
    dps2 = _make_dps(db, lesson.id, dps_number=2)
    _submit(db, _attempt(student.id, dps2.id, accuracy=96, submitted_at=now + timedelta(minutes=1), duration_seconds=600, time_taken_seconds=582))
    assert AchievementEngine._get_stat(db, student.id, "dps_sage_count") == 1


# ---------------------------------------------------------------------------
# 6. Unbroken Chain -- a single unanswered question must reset the streak,
# not just fail to extend it.
# ---------------------------------------------------------------------------
def test_dps_chain_resets_on_any_unanswered_question(db, student):
    now = datetime.now(timezone.utc)
    lesson = db.query(Lesson).first()
    for i in range(9):
        dps = _make_dps(db, lesson.id, dps_number=i + 1)
        _submit(db, _attempt(student.id, dps.id, accuracy=70, submitted_at=now + timedelta(minutes=i), unanswered_count=0))
    assert AchievementEngine._get_stat(db, student.id, "dps_chain_streak") == 9
    dps_break = _make_dps(db, lesson.id, dps_number=10)
    _submit(db, _attempt(student.id, dps_break.id, accuracy=70, submitted_at=now + timedelta(minutes=9), unanswered_count=1))
    assert AchievementEngine._get_stat(db, student.id, "dps_chain_streak") == 0
    dps11 = _make_dps(db, lesson.id, dps_number=11)
    unlocked = _submit(db, _attempt(student.id, dps11.id, accuracy=70, submitted_at=now + timedelta(minutes=10), unanswered_count=0))
    assert AchievementEngine._get_stat(db, student.id, "dps_chain_streak") == 1
    assert "dps_chain_BASE" not in _codes(unlocked)  # needs 10, only at 1 again


# ---------------------------------------------------------------------------
# 7. Rising Phoenix -- must look at the immediately PRECEDING submission,
# and only fire when that one was genuinely below 50%.
# ---------------------------------------------------------------------------
def test_dps_phoenix_fires_only_after_a_sub_50_then_a_90_plus(db, student):
    now = datetime.now(timezone.utc)
    lesson = db.query(Lesson).first()
    dps1 = _make_dps(db, lesson.id, dps_number=1)
    dps2 = _make_dps(db, lesson.id, dps_number=2)
    _submit(db, _attempt(student.id, dps1.id, accuracy=30, submitted_at=now))
    unlocked = _submit(db, _attempt(student.id, dps2.id, accuracy=95, submitted_at=now + timedelta(minutes=5)))
    assert "dps_phoenix_BASE" in _codes(unlocked)


def test_dps_phoenix_does_not_fire_if_prior_score_was_above_50(db, student):
    now = datetime.now(timezone.utc)
    lesson = db.query(Lesson).first()
    dps1 = _make_dps(db, lesson.id, dps_number=1)
    dps2 = _make_dps(db, lesson.id, dps_number=2)
    _submit(db, _attempt(student.id, dps1.id, accuracy=55, submitted_at=now))
    unlocked = _submit(db, _attempt(student.id, dps2.id, accuracy=95, submitted_at=now + timedelta(minutes=5)))
    assert "dps_phoenix_BASE" not in _codes(unlocked)


# ---------------------------------------------------------------------------
# 8. Master's Anvil -- must be the SAME retry chain, and the prior attempt
# in that chain must have failed the platform's real benchmark (<70%).
# ---------------------------------------------------------------------------
def test_dps_anvil_fires_on_same_chain_retry_after_a_fail(db, student):
    now = datetime.now(timezone.utc)
    lesson = db.query(Lesson).first()
    dps = _make_dps(db, lesson.id)
    group = "chain-1"
    _submit(db, _attempt(student.id, dps.id, accuracy=40, submitted_at=now, attempt_number=0, attempt_group_id=group, benchmark_status="NEEDS_REATTEMPT"))
    unlocked = _submit(db, _attempt(student.id, dps.id, accuracy=100, submitted_at=now + timedelta(minutes=5), attempt_number=1, attempt_group_id=group, benchmark_status="CLEARED"))
    assert "dps_anvil_BASE" in _codes(unlocked)


def test_dps_anvil_does_not_fire_across_different_chains(db, student):
    now = datetime.now(timezone.utc)
    lesson = db.query(Lesson).first()
    dps1 = _make_dps(db, lesson.id, dps_number=1)
    dps2 = _make_dps(db, lesson.id, dps_number=2)
    _submit(db, _attempt(student.id, dps1.id, accuracy=40, submitted_at=now, attempt_number=0, attempt_group_id="chain-a", benchmark_status="NEEDS_REATTEMPT"))
    # A perfect FIRST attempt (attempt_number 0) on an unrelated sheet should not trigger Anvil.
    unlocked = _submit(db, _attempt(student.id, dps2.id, accuracy=100, submitted_at=now + timedelta(minutes=5), attempt_number=0, attempt_group_id="chain-b"))
    assert "dps_anvil_BASE" not in _codes(unlocked)


# ---------------------------------------------------------------------------
# 10. Golden Compass -- must be an original (attempt_number == 0) attempt;
# a retry scoring >90% must not count.
# ---------------------------------------------------------------------------
def test_dps_compass_requires_first_attempt_only(db, student):
    now = datetime.now(timezone.utc)
    lesson = db.query(Lesson).first()
    dps = _make_dps(db, lesson.id)
    # A retry (attempt_number=1) scoring 95% should NOT count toward Compass.
    unlocked = _submit(db, _attempt(student.id, dps.id, accuracy=95, submitted_at=now, attempt_number=1, attempt_group_id="c1"))
    assert AchievementEngine._get_stat(db, student.id, "dps_compass_count") == 0
    dps2 = _make_dps(db, lesson.id, dps_number=2)
    _submit(db, _attempt(student.id, dps2.id, accuracy=95, submitted_at=now + timedelta(minutes=1), attempt_number=0))
    assert AchievementEngine._get_stat(db, student.id, "dps_compass_count") == 1


# ---------------------------------------------------------------------------
# 9. Midnight Oil -- weekend vs weekday.
# ---------------------------------------------------------------------------
def test_dps_midnight_only_counts_weekend_submissions(db, student):
    lesson = db.query(Lesson).first()
    # 2026-08-01 is a Saturday.
    saturday = datetime(2026, 8, 1, 10, 0, tzinfo=timezone.utc)
    monday = datetime(2026, 8, 3, 10, 0, tzinfo=timezone.utc)
    dps1 = _make_dps(db, lesson.id, dps_number=1)
    dps2 = _make_dps(db, lesson.id, dps_number=2)
    _submit(db, _attempt(student.id, dps1.id, accuracy=70, submitted_at=monday))
    assert AchievementEngine._get_stat(db, student.id, "dps_midnight_count") == 0
    _submit(db, _attempt(student.id, dps2.id, accuracy=70, submitted_at=saturday))
    assert AchievementEngine._get_stat(db, student.id, "dps_midnight_count") == 1


# ---------------------------------------------------------------------------
# 1. Ironclad Discipline -- weekly streak: needs 5 distinct sheets in one
# Mon-Sun week, and the streak must only advance once per qualifying week
# (not once per sheet submitted after the 5th).
# ---------------------------------------------------------------------------
def test_dps_discipline_requires_5_distinct_sheets_same_week(db, student):
    lesson = db.query(Lesson).first()
    # 2026-08-03 is a Monday; keep all 5 within Mon-Sun.
    monday = datetime(2026, 8, 3, 9, 0, tzinfo=timezone.utc)
    unlocked = []
    for i in range(5):
        dps = _make_dps(db, lesson.id, dps_number=i + 1)
        unlocked += _submit(db, _attempt(student.id, dps.id, accuracy=70, submitted_at=monday + timedelta(days=i)))
    assert AchievementEngine._get_stat(db, student.id, "dps_discipline_streak") == 1
    # A 6th sheet the same week must not double-advance the streak.
    dps6 = _make_dps(db, lesson.id, dps_number=6)
    _submit(db, _attempt(student.id, dps6.id, accuracy=70, submitted_at=monday + timedelta(days=5)))
    assert AchievementEngine._get_stat(db, student.id, "dps_discipline_streak") == 1


def test_dps_discipline_streak_breaks_on_a_skipped_week(db, student):
    lesson = db.query(Lesson).first()
    week1_monday = datetime(2026, 8, 3, 9, 0, tzinfo=timezone.utc)
    for i in range(5):
        dps = _make_dps(db, lesson.id, dps_number=i + 1)
        _submit(db, _attempt(student.id, dps.id, accuracy=70, submitted_at=week1_monday + timedelta(days=i)))
    assert AchievementEngine._get_stat(db, student.id, "dps_discipline_streak") == 1
    # Skip a week entirely, then qualify again two weeks later.
    week3_monday = week1_monday + timedelta(days=21)
    for i in range(5):
        dps = _make_dps(db, lesson.id, dps_number=100 + i)
        _submit(db, _attempt(student.id, dps.id, accuracy=70, submitted_at=week3_monday + timedelta(days=i)))
    assert AchievementEngine._get_stat(db, student.id, "dps_discipline_streak") == 1  # reset, not 2


def test_dps_discipline_streak_extends_on_consecutive_weeks(db, student):
    lesson = db.query(Lesson).first()
    week1_monday = datetime(2026, 8, 3, 9, 0, tzinfo=timezone.utc)
    for i in range(5):
        dps = _make_dps(db, lesson.id, dps_number=i + 1)
        _submit(db, _attempt(student.id, dps.id, accuracy=70, submitted_at=week1_monday + timedelta(days=i)))
    week2_monday = week1_monday + timedelta(days=7)
    for i in range(5):
        dps = _make_dps(db, lesson.id, dps_number=200 + i)
        _submit(db, _attempt(student.id, dps.id, accuracy=70, submitted_at=week2_monday + timedelta(days=i)))
    assert AchievementEngine._get_stat(db, student.id, "dps_discipline_streak") == 2
