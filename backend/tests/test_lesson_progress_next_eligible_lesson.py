"""Coverage for the additive `nextEligibleLessonNumber` field on
ComputeLessonProgressForStudents (Shailesh, 2026-09-15): "lets not keep any
lock at all, the teacher should be able to assign any of the lessons that
come next ofc sequentially and not skipping any, but yes once a lesson is
assigned then the student can be assigned the next lesson irrespective of
them completing it or not, as they can always come back and complete it
later. also the lesson info that the teacher sees in all the relevant
places must be shown as expected for instance if a student has 3/5 sheets
completed in lesson 3 suppose and gets assigned lesson 4 then the next week
when the teacher opens it should show the progress of lesson 4 and the next
eligible lesson that needs to be assigned to that particular student."

Deliberately does NOT assert anything about currentLessonNumber/levelComplete
changing meaning -- those two fields must keep their existing cleared-based
semantics unchanged (the Annual Competition assignment engine's Master-module
lesson-16-threshold / full-completion rules also read them). This file only
proves the NEW field is correct and additive.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import Assignment, Attempt, DPS, Lesson, Level, Module, Student, Teacher, User
from app.services.lesson_progress_service import ComputeLessonProgressForStudents


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


def test_partial_progress_in_last_assigned_lesson_shows_its_own_count_and_the_next_lesson(db, world):
    """The user's own example: 3/5 (here 1/2, smaller fixture) cleared in
    lesson 3's own sheets after it was the last one assigned -- teacher-
    facing display (currentLessonNumber/clearedInCurrentLesson) must show
    THAT lesson's own progress, not lesson 2's, and nextEligibleLessonNumber
    must point at lesson 4... but this fixture only has 3 lessons, so use
    lesson 2 as "the last assigned" and confirm it points at lesson 3.
    """
    student = world["make_student"]("MP-ST-PARTIAL")
    lesson1_dps = world["dps_by_lesson"][0]
    lesson2_dps = world["dps_by_lesson"][1]

    # Lesson 1: fully assigned and fully cleared (ordinary prior history).
    for dps in lesson1_dps:
        _assign(db, student, dps, days_ago=5)
        _clear(db, student, dps, days_ago=5)

    # Lesson 2 is the one just assigned (the "next lesson" from the
    # now-removed lock's point of view) -- only ONE of its two sheets is
    # cleared so far, matching "3/5 completed... gets assigned lesson 4"
    # (partial, not full).
    _assign(db, student, lesson2_dps[0], days_ago=1)
    _assign(db, student, lesson2_dps[1], days_ago=1)
    _clear(db, student, lesson2_dps[0], days_ago=1)

    progress = ComputeLessonProgressForStudents(db, [student], world["level"].id)[student.id]

    # currentLessonNumber/clearedInCurrentLesson -- EXISTING semantics,
    # unchanged: anchored on the last-assigned lesson (2), showing its own
    # 1/2 progress, since it isn't fully cleared yet.
    assert progress["currentLessonNumber"] == 2
    assert progress["clearedInCurrentLesson"] == 1
    assert progress["totalInCurrentLesson"] == 2
    assert progress["levelComplete"] is False

    # NEW additive field: the next lesson in sequence a teacher may now
    # assign, regardless of lesson 2 being incomplete.
    assert progress["nextEligibleLessonNumber"] == 3
    assert progress["nextEligibleLessonTitle"] == "Lesson 3"


def test_next_eligible_lesson_is_none_at_the_final_lesson_of_the_level(db, world):
    student = world["make_student"]("MP-ST-LAST")
    lesson3_dps = world["dps_by_lesson"][2]
    _assign(db, student, lesson3_dps[0], days_ago=1)

    progress = ComputeLessonProgressForStudents(db, [student], world["level"].id)[student.id]

    assert progress["currentLessonNumber"] == 3
    assert progress["nextEligibleLessonNumber"] is None
    assert progress["nextEligibleLessonTitle"] is None


def test_next_eligible_lesson_is_none_for_a_student_new_to_the_level(db, world):
    """No assignment history anywhere in this level yet -- isNewToLevel
    already leaves this student unrestricted on the frontend, so there's no
    "next" to compute; nextEligibleLessonNumber stays None rather than
    guessing lesson 1.
    """
    student = world["make_student"]("MP-ST-NEW")

    progress = ComputeLessonProgressForStudents(db, [student], world["level"].id)[student.id]

    assert progress["isNewToLevel"] is True
    assert progress["nextEligibleLessonNumber"] is None


def test_next_eligible_lesson_is_none_once_the_whole_level_is_complete(db, world):
    student = world["make_student"]("MP-ST-DONE")
    for lesson_dps in world["dps_by_lesson"]:
        for dps in lesson_dps:
            _assign(db, student, dps, days_ago=3)
            _clear(db, student, dps, days_ago=3)

    progress = ComputeLessonProgressForStudents(db, [student], world["level"].id)[student.id]

    assert progress["levelComplete"] is True
    assert progress["nextEligibleLessonNumber"] is None


def test_next_eligible_lesson_coincides_with_current_once_last_assigned_lesson_is_fully_cleared(db, world):
    """When the last-assigned lesson IS fully cleared, the existing
    cleared-based walk already advances currentLessonNumber to the next
    lesson on its own -- so nextEligibleLessonNumber (derived independently
    from the raw assignment anchor) lands on the exact same lesson. This is
    expected and harmless (the frontend badge suppresses a redundant "Next
    Eligible" chip when the two match) -- not a bug.
    """
    student = world["make_student"]("MP-ST-ADVANCED")
    lesson1_dps = world["dps_by_lesson"][0]
    for dps in lesson1_dps:
        _assign(db, student, dps, days_ago=2)
        _clear(db, student, dps, days_ago=2)

    progress = ComputeLessonProgressForStudents(db, [student], world["level"].id)[student.id]

    assert progress["currentLessonNumber"] == 2
    assert progress["nextEligibleLessonNumber"] == 2
