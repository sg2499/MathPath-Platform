"""Regression coverage for the 2026-09-03 fix (Shailesh) to GET
/student/results' pending_assignments query, found while chasing "the
problem where teachers assign sheets to the student and they do not see
it in their login... the card metrics always show 0 assigned":
GET /assignments (the Practice tab's actual list) already filtered out an
Assignment whose start_time is still in the future -- a weekly-scheduled
sheet stays invisible until its own day arrives, "the sheet simply isn't
in the list until its own day arrives" per that route's own comment.
GET /results' pending_assignments query had no equivalent filter, so a
sheet scheduled for a future date counted as "assigned" in the results
list (and therefore in the Practice tab's "Assigned DPS" hero metric,
which prefers /results whenever it has rows) well before a student could
ever see or act on it in /assignments -- the two endpoints disagreed
about the same student's state. This locks in that both endpoints now
agree: a not-yet-unlocked assignment is invisible to both.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import Assignment, DPS, Lesson, Level, Module, Student, User
from app.api.routes_student import student_results


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
def student(db):
    user = User(full_name="Test Student", email="results-start-time-test@test.local", password_hash="x", role="STUDENT")
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
    st = Student(user_id=user.id, student_code="MP-ST-RESULTS-ST", current_level_id=level.id)
    db.add(st)
    db.commit()
    return st


def _dps(db, lesson_id, number):
    d = DPS(lesson_id=lesson_id, dps_number=number, dps_title=f"DPS {number}", default_duration_seconds=300, publication_status="PUBLISHED")
    db.add(d)
    db.commit()
    return d


def _pending_assignment(db, student_id, dps_id, *, start_time):
    a = Assignment(
        assignment_type="PRACTICE", dps_id=dps_id, assigned_to_type="STUDENT", assigned_to_id=student_id,
        title="Practice", start_time=start_time,
    )
    db.add(a)
    db.commit()
    return a


def test_future_scheduled_assignment_is_excluded_from_pending_results(db, student):
    lesson = db.query(Lesson).first()
    dps_today = _dps(db, lesson.id, 1)
    dps_future = _dps(db, lesson.id, 2)
    now = datetime.now(timezone.utc)
    _pending_assignment(db, student.id, dps_today.id, start_time=now - timedelta(hours=1))
    _pending_assignment(db, student.id, dps_future.id, start_time=now + timedelta(days=2))

    payload = student_results(db=db, student=student)

    dps_ids = {row["dpsId"] for row in payload["results"] if row.get("recordKind") == "PENDING_ASSIGNMENT"}
    assert dps_today.id in dps_ids, "an already-unlocked sheet must still be reported as pending"
    assert dps_future.id not in dps_ids, "a sheet scheduled for a future date must not count as assigned yet"


def test_assignment_with_no_start_time_is_always_pending(db, student):
    """Immediate (non-scheduled) assignments have start_time=None and must
    behave exactly as before -- always visible, same as /assignments'
    `not a.start_time or a.start_time <= now_utc` rule.
    """
    lesson = db.query(Lesson).first()
    dps = _dps(db, lesson.id, 1)
    _pending_assignment(db, student.id, dps.id, start_time=None)

    payload = student_results(db=db, student=student)

    dps_ids = {row["dpsId"] for row in payload["results"] if row.get("recordKind") == "PENDING_ASSIGNMENT"}
    assert dps.id in dps_ids
