"""Per-lesson "assigned or not" status for Assign Practice and My Students (2026-10-15)."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import Assignment, Attempt, DPS, Lesson, Level, Module, Student, Teacher, User
from app.services.lesson_progress_service import ComputeLessonProgressForStudents, LessonAssignmentState


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
def world(db):
    """Three lessons (1, 2, 3), each with 2 published DPS sheets, under one
    level. Callers assign/clear sheets per-test to build up whichever
    scenario they need.
    """
    teacher_user = User(full_name="Ms. Teacher", email="lp-teacher@test.local", password_hash="x", role="TEACHER")
    db.add(teacher_user)
    db.commit()
    teacher = Teacher(user_id=teacher_user.id, teacher_code="MP-TC-LP")
    db.add(teacher)
    db.commit()

    module = Module(module_code="MM", module_name="Master Module")
    db.add(module)
    db.commit()
    level = Level(module_id=module.id, level_code="MM-L1", level_name="Master Module Level 1")
    db.add(level)
    db.commit()

    lessons = []
    dps_by_lesson = []
    for lesson_number in (1, 2, 3):
        lesson = Lesson(level_id=level.id, lesson_number=lesson_number, lesson_title=f"Lesson {lesson_number}")
        db.add(lesson)
        db.commit()
        lessons.append(lesson)
        lesson_dps = []
        for n in (1, 2):
            dps = DPS(
                lesson_id=lesson.id, dps_number=n, dps_title=f"L{lesson_number} DPS {n}",
                default_duration_seconds=300, publication_status="PUBLISHED",
            )
            db.add(dps)
            lesson_dps.append(dps)
        db.commit()
        dps_by_lesson.append(lesson_dps)

    def _make_student(code):
        user = User(full_name=code, email=f"{code.lower()}@test.local", password_hash="x", role="STUDENT")
        db.add(user)
        db.commit()
        st = Student(user_id=user.id, student_code=code, current_level_id=level.id, teacher_id=teacher.id)
        db.add(st)
        db.commit()
        return st

    return {
        "teacher": teacher, "level": level, "lessons": lessons, "dps_by_lesson": dps_by_lesson,
        "make_student": _make_student,
    }


def _assign(db, student, dps, days_ago=1):
    start_time = datetime.now(timezone.utc) - timedelta(days=days_ago)
    assignment = Assignment(
        assignment_type="DPS", dps_id=dps.id, assigned_to_type="STUDENT", assigned_to_id=student.id,
        title=f"{dps.dps_title} Practice", start_time=start_time, is_active=True,
    )
    db.add(assignment)
    db.commit()
    return assignment


def _clear(db, student, dps, days_ago=1):
    now = datetime.now(timezone.utc) - timedelta(days=days_ago)
    attempt = Attempt(
        id=str(uuid.uuid4()), dps_id=dps.id, student_id=student.id, mode="PRACTICE", status="SUBMITTED",
        attempt_number=0, started_at=now - timedelta(seconds=300), expires_at=now + timedelta(seconds=1),
        submitted_at=now, duration_seconds=300, time_taken_seconds=250,
        total_questions=10, attempted_count=10, accuracy_percentage=80, cleared_at_attempt=True,
    )
    db.add(attempt)
    db.commit()
    return attempt




def _assign_at(db, student, dps, start):
    assignment = Assignment(
        assignment_type="DPS", dps_id=dps.id, assigned_to_type="STUDENT", assigned_to_id=student.id,
        title=f"{dps.dps_title} Practice", start_time=start, is_active=True,
    )
    db.add(assignment)
    db.commit()
    return assignment


def _status(db, world, student):
    return ComputeLessonProgressForStudents(db, [student], world["level"].id)[student.id]


def test_state_words():
    assert LessonAssignmentState(0, 5, False) == "NOT_ASSIGNED"
    assert LessonAssignmentState(2, 5, False) == "PARTLY"
    assert LessonAssignmentState(5, 5, False) == "ASSIGNED"
    assert LessonAssignmentState(5, 5, True) == "SCHEDULED"
    assert LessonAssignmentState(2, 5, True) == "PARTLY"


def test_next_lesson_before_and_after_it_is_assigned_reads_differently(db, world):
    """Chahana's case: lesson 1 fully cleared, so the current lesson moves
    to lesson 2 -- which must say NOT_ASSIGNED until the teacher gives it,
    then ASSIGNED. Before this fix both looked like "Lesson 2 · 0/2 Cleared"."""
    student = world["make_student"]("MP-ST-NEXT")
    for dps in world["dps_by_lesson"][0]:
        _assign(db, student, dps, days_ago=3)
        _clear(db, student, dps, days_ago=2)

    before = _status(db, world, student)
    assert before["currentLessonNumber"] == 2
    assert before["currentLessonStatus"]["state"] == "NOT_ASSIGNED"
    assert world["lessons"][1].id not in before["lessonStatus"]
    assert before["lessonStatus"][world["lessons"][0].id]["state"] == "ASSIGNED"

    for dps in world["dps_by_lesson"][1]:
        _assign(db, student, dps, days_ago=0)
    after = _status(db, world, student)
    assert after["currentLessonNumber"] == 2
    assert after["currentLessonStatus"]["state"] == "ASSIGNED"
    assert after["currentLessonStatus"]["given"] == 2
    assert after["currentLessonStatus"]["cleared"] == 0


def test_week_scheduled_ahead_is_scheduled_then_assigned(db, world):
    student = world["make_student"]("MP-ST-WEEK")
    lesson = world["lessons"][0]
    now = datetime.now(timezone.utc)
    for offset, dps in enumerate(world["dps_by_lesson"][0]):
        _assign_at(db, student, dps, now + timedelta(days=2 + offset))
    status = _status(db, world, student)["lessonStatus"][lesson.id]
    assert status["state"] == "SCHEDULED"
    assert status["nextOpensAt"] == status["firstOpensAt"]
    assert status["firstOpensAt"] < status["lastOpensAt"]

    # The usual Mon-Fri week: first sheet open today, the rest later -> Assigned.
    other = world["make_student"]("MP-ST-WEEK2")
    for offset, dps in enumerate(world["dps_by_lesson"][0]):
        _assign_at(db, other, dps, now - timedelta(hours=1) + timedelta(days=offset))
    status = _status(db, world, other)["lessonStatus"][lesson.id]
    assert status["state"] == "ASSIGNED"
    assert status["nextOpensAt"] is not None


def test_single_sheet_is_partly_and_done_counts(db, world):
    student = world["make_student"]("MP-ST-PART")
    first, second = world["dps_by_lesson"][0]
    _assign(db, student, first)
    status = _status(db, world, student)["lessonStatus"][world["lessons"][0].id]
    assert status["state"] == "PARTLY"
    assert status["given"] == 1 and status["assignableTotal"] == 2

    _clear(db, student, first)
    _assign(db, student, second)
    status = _status(db, world, student)["lessonStatus"][world["lessons"][0].id]
    assert status["state"] == "ASSIGNED"
    assert status["done"] == 1 and status["cleared"] == 1


def test_unpublished_sheet_does_not_keep_a_lesson_partly_assigned(db, world):
    student = world["make_student"]("MP-ST-UNPUB")
    first, second = world["dps_by_lesson"][0]
    second.publication_status = "DRAFT"
    db.commit()
    _assign(db, student, first)
    status = _status(db, world, student)["lessonStatus"][world["lessons"][0].id]
    assert status["state"] == "ASSIGNED"
    assert status["total"] == 2 and status["assignableTotal"] == 1
