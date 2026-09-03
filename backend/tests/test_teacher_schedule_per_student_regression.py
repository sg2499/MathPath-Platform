"""Regression coverage for the 2026-09-03 weekly-schedule assignment fix
(Shailesh): "the problem where the teachers assign sheets to the student
and they do not see it in their login has still not been resolved, when a
week is scheduled atleast 1 sheet that belongs to today's date should
appear in the practice tab but right now it always shows 0 assigned in
the card metrics and the sheets do not appear."

Root cause: schedule_lesson_dps_to_students() (POST /assignments/schedule,
routes_teacher.py) applied ONE shared "sheet N -> date N" grid identically
to every selected student. A student who was already partway through the
lesson (had individually cleared/been assigned its earlier sheets) would
have their "today" slot land on an already-done sheet -- silently skipped
by assign_single_dps_to_students()'s duplicate guard -- while their
genuinely-next sheet got pushed onto a later date instead of landing on
slot 0 (today). The fix personalizes the date grid per student: each
student's own remaining eligible sheets (via
ComputeLessonProgressForStudents()/assignableDpsIds, live-recomputed, not
a stale frontend snapshot) are zipped against the teacher's date sequence
positionally, so slot 0 always lands on that student's own next eligible
sheet.

Calls schedule_lesson_dps_to_students() directly against a real in-memory
DB (bypassing HTTP/auth plumbing, the same pattern
test_dps_celebration_parity_regression.py and
test_student_activity_range_regression.py already established for this
codebase) -- Depends(...) defaults on the route function are simply
ignored when called as a plain Python function, so real Session/Teacher
objects are passed straight in.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import Assignment, Attempt, DPS, Lesson, Level, Module, Student, Teacher, User
from app.api.routes_teacher import (
    ScheduleItem,
    TeacherScheduleAssignRequest,
    schedule_lesson_dps_to_students,
    IST,
)


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
    """One lesson with 5 published DPS sheets, one teacher, and two
    students on that same lesson: `fresh` has no history in it at all,
    `partway` has already completed sheets 1 and 2 individually earlier
    (the common real-world case this bug hit).
    """
    teacher_user = User(full_name="Ms. Teacher", email="sched-teacher@test.local", password_hash="x", role="TEACHER")
    db.add(teacher_user)
    db.commit()
    teacher = Teacher(user_id=teacher_user.id, teacher_code="MP-TC-SCHED")
    db.add(teacher)
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

    dps_rows = []
    for n in range(1, 6):
        dps = DPS(
            lesson_id=lesson.id, dps_number=n, dps_title=f"DPS {n}",
            default_duration_seconds=300, publication_status="PUBLISHED",
        )
        db.add(dps)
        dps_rows.append(dps)
    db.commit()

    def _make_student(code):
        user = User(full_name=code, email=f"{code.lower()}@test.local", password_hash="x", role="STUDENT")
        db.add(user)
        db.commit()
        st = Student(user_id=user.id, student_code=code, current_level_id=level.id, teacher_id=teacher.id)
        db.add(st)
        db.commit()
        return st

    fresh = _make_student("MP-ST-FRESH")
    partway = _make_student("MP-ST-PARTWAY")

    # `partway` already completed DPS 1 and 2 on their own, before this
    # week's schedule is created.
    now = datetime.now(timezone.utc) - timedelta(days=3)
    for dps in dps_rows[:2]:
        attempt = Attempt(
            id=str(uuid.uuid4()), dps_id=dps.id, student_id=partway.id, mode="PRACTICE", status="SUBMITTED",
            attempt_number=0, started_at=now - timedelta(seconds=300), expires_at=now + timedelta(seconds=1),
            submitted_at=now, duration_seconds=300, time_taken_seconds=250,
            total_questions=10, attempted_count=10, accuracy_percentage=80,
        )
        db.add(attempt)
    db.commit()

    return {
        "teacher": teacher, "level": level, "lesson": lesson, "dps": dps_rows,
        "fresh": fresh, "partway": partway,
    }


def _week_schedule_items(dps_rows, start_from: datetime):
    """Mon..Fri-style ascending dates, one per sheet, in lesson order --
    exactly what the frontend's NextWeekdaySequence()-seeded scheduler
    submits by default.
    """
    return [
        ScheduleItem(dpsId=dps.id, date=(start_from + timedelta(days=i)).strftime("%Y-%m-%d"))
        for i, dps in enumerate(dps_rows)
    ]


def _assignments_for(db, student_id):
    return (
        db.query(Assignment)
        .filter(Assignment.assigned_to_type == "STUDENT", Assignment.assigned_to_id == student_id, Assignment.is_active == True)
        .order_by(Assignment.start_time.asc())
        .all()
    )


def test_partway_through_student_gets_todays_slot_filled_with_their_own_next_sheet(db, world):
    """The exact regression: a student who already cleared this lesson's
    first two sheets on their own must still get something scheduled for
    slot 0 (today) -- their own next eligible sheet (DPS 3), not nothing.
    """
    today = datetime.now(timezone.utc)
    payload = TeacherScheduleAssignRequest(
        lessonId=world["lesson"].id,
        studentIds=[world["fresh"].id, world["partway"].id],
        scheduleItems=_week_schedule_items(world["dps"], today),
        instructions="Complete this practice within the given time.",
    )

    result = schedule_lesson_dps_to_students(payload, db=db, teacher=world["teacher"])

    assert result["created"] is True

    fresh_assignments = _assignments_for(db, world["fresh"].id)
    partway_assignments = _assignments_for(db, world["partway"].id)

    # Fresh student: no history anywhere in this lesson -- gets all 5
    # sheets, sheet-for-sheet, on the exact grid the teacher chose.
    assert [a.dps_id for a in fresh_assignments] == [dps.id for dps in world["dps"]]

    # Partway student: DPS 1 and 2 are already done, so their remaining
    # eligible sheets are DPS 3, 4, 5 -- these must land on the teacher's
    # FIRST three dates (slots 0, 1, 2), not on the 3rd/4th/5th dates the
    # slots those dps rows nominally occupied in the shared grid. Above
    # all: slot 0 (today) must not come back empty.
    assert len(partway_assignments) == 3
    assert [a.dps_id for a in partway_assignments] == [dps.id for dps in world["dps"][2:5]]
    slot_dates_ascending = sorted(item.date for item in payload.scheduleItems)
    assert [a.start_time.astimezone(IST).strftime("%Y-%m-%d") for a in partway_assignments] == slot_dates_ascending[:3]
    # The concrete bug report: today's date must have a sheet.
    assert partway_assignments[0].start_time.astimezone(IST).strftime("%Y-%m-%d") == slot_dates_ascending[0]
    assert partway_assignments[0].dps_id == world["dps"][2].id  # DPS 3, their own next sheet


def test_student_who_already_has_every_sheet_is_reported_not_silently_zeroed(db, world):
    """Before this fix, a request where the (only) selected student had
    nothing left in the lesson still returned created=True with an empty
    assignment list and a confusing "Scheduled N sheet(s) to 1 student(s)"
    message -- indistinguishable from a real bug. Now this is a clear,
    typed error rather than a silent no-op success.
    """
    # Complete every sheet for `partway` too, so nobody has anything left.
    now = datetime.now(timezone.utc) - timedelta(days=1)
    for dps in world["dps"][2:]:
        attempt = Attempt(
            id=str(uuid.uuid4()), dps_id=dps.id, student_id=world["partway"].id, mode="PRACTICE", status="SUBMITTED",
            attempt_number=0, started_at=now - timedelta(seconds=300), expires_at=now + timedelta(seconds=1),
            submitted_at=now, duration_seconds=300, time_taken_seconds=250,
            total_questions=10, attempted_count=10, accuracy_percentage=80,
        )
        db.add(attempt)
    db.commit()

    today = datetime.now(timezone.utc)
    payload = TeacherScheduleAssignRequest(
        lessonId=world["lesson"].id,
        studentIds=[world["partway"].id],
        scheduleItems=_week_schedule_items(world["dps"], today),
        instructions="Complete this practice within the given time.",
    )

    with pytest.raises(HTTPException) as exc_info:
        schedule_lesson_dps_to_students(payload, db=db, teacher=world["teacher"])
    assert exc_info.value.status_code == 409
    assert exc_info.value.detail["code"] == "DUPLICATE_ASSIGNMENT_BLOCKED"

    # And no partial/phantom assignment was left behind.
    assert _assignments_for(db, world["partway"].id) == []


def test_teacher_customized_dates_are_preserved_as_the_slot_sequence(db, world):
    """A teacher who edits individual dates (not just the NextWeekdaySequence
    default) still gets those exact dates applied, in lesson-sheet order,
    to each eligible student -- the personalization only changes WHICH
    sheet lands on a slot for a given student, never the slot dates
    themselves.
    """
    today = datetime.now(timezone.utc)
    custom_dates = [today + timedelta(days=offset) for offset in [0, 2, 4, 6, 8]]
    items = [
        ScheduleItem(dpsId=dps.id, date=d.strftime("%Y-%m-%d"))
        for dps, d in zip(world["dps"], custom_dates)
    ]
    payload = TeacherScheduleAssignRequest(
        lessonId=world["lesson"].id,
        studentIds=[world["fresh"].id],
        scheduleItems=items,
        instructions="Complete this practice within the given time.",
    )

    schedule_lesson_dps_to_students(payload, db=db, teacher=world["teacher"])

    fresh_assignments = _assignments_for(db, world["fresh"].id)
    assert [a.start_time.astimezone(IST).strftime("%Y-%m-%d") for a in fresh_assignments] == [
        d.strftime("%Y-%m-%d") for d in custom_dates
    ]
