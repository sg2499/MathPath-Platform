"""Regression coverage for the 2026-09-07 fix (Shailesh) to a recurring
complaint: "whenever the assignment is being given to a student it does
not occur on their end when they login... this is being seen repeatedly."

This is a *second*, deeper bug in the same area as the 2026-09-03 fix in
test_student_results_pending_start_time_regression.py -- that fix made
GET /results agree with GET /assignments about which sheets are unlocked,
but neither endpoint's own correctness was ever the remaining problem.
Both GET /student/assignments and GET /student/results were decorated with
@cache_by_user_id() (backend/app/core/cache.py, now deleted): a 60-second
in-process TTLCache, keyed only by (function name, student id), with no
invalidation anywhere in the codebase -- not on assignment creation, not
on anything. Combined with this backend running as 4 separate gunicorn
worker processes (each with its own independent copy of the cache), a
student could log in seconds after a teacher assigned them a sheet and
still be served a stale, pre-assignment response, entirely depending on
which worker handled the request and whether that worker had already
cached that student's data in the last 60 seconds. This is exactly the
kind of bug that looks intermittent and "randomly still broken" even
after a real, unrelated bug in the same area (the 2026-09-03 fix above)
was already found and shipped -- because the cache was never touched by
that fix and kept reproducing the same user-visible symptom afterward.

Both endpoints are now called with no caching decorator at all -- every
call is a fresh database read. This test locks that in for /assignments
by calling it twice within the same process, with a real new Assignment
row committed to the database in between, and asserting the second call
reflects it immediately. Under the old @cache_by_user_id() decorator this
would have failed (the second call would return the first call's cached,
pre-assignment result), since both calls happen well inside the old 60s
TTL and share the same in-process cache.
"""
from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import Assignment, DPS, Lesson, Level, Module, Student, User
from app.api.routes_student import assignments as student_assignments_route


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
    user = User(full_name="Test Student", email="assignments-no-stale-cache-test@test.local", password_hash="x", role="STUDENT")
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
    st = Student(user_id=user.id, student_code="MP-ST-NOCACHE-ST", current_level_id=level.id)
    db.add(st)
    db.commit()
    return st


def test_newly_created_assignment_is_visible_on_the_very_next_call(db, student):
    """The core repro: no sleep, no TTL manipulation -- a second call to
    the same endpoint, from the same process, immediately after the first,
    must reflect a brand new Assignment row committed in between. A cache
    with any TTL >0s and no invalidation would fail this."""
    lesson = db.query(Lesson).first()

    first_response = student_assignments_route(db=db, student=student)
    assert first_response["assignments"] == [], "sanity check: nothing assigned yet"

    dps = DPS(lesson_id=lesson.id, dps_number=1, dps_title="DPS 1", default_duration_seconds=300, publication_status="PUBLISHED")
    db.add(dps)
    db.commit()
    new_assignment = Assignment(
        assignment_type="PRACTICE", dps_id=dps.id, assigned_to_type="STUDENT", assigned_to_id=student.id,
        title="Practice", start_time=None,
    )
    db.add(new_assignment)
    db.commit()

    second_response = student_assignments_route(db=db, student=student)
    assigned_dps_ids = {row["dpsId"] for row in second_response["assignments"]}
    assert dps.id in assigned_dps_ids, (
        "a freshly committed Assignment must appear on the very next call to "
        "GET /student/assignments -- if this fails, a caching layer has been "
        "reintroduced on this endpoint without invalidation"
    )


def test_repeated_calls_with_no_change_are_stable(db, student):
    """Not a caching test per se -- just confirms removing the cache didn't
    break the ordinary repeated-call case (e.g. a student refreshing the
    page twice with nothing new)."""
    first_response = student_assignments_route(db=db, student=student)
    second_response = student_assignments_route(db=db, student=student)
    assert first_response == second_response
