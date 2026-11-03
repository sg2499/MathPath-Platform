"""A lesson published in parts (2026-11-03, Shailesh).

IM-L2 Lesson 8 had DPS 1-2 published while DPS 3-5 waited. The teacher must:
- see that only n of the lesson's sheets are published (available-dps
  carries per-lesson totals; schedule / assign-all say so in their message);
- be able to schedule just the remaining sheets later, starting from the
  day they open the scheduler (Day 1 = the student's own next sheet);
- be told when Admin publishes the rest (one notification per teacher).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import routes_admin
from app.api.routes_teacher import (
    IST,
    LessonSheetCounts,
    ScheduleItem,
    TeacherBulkAssignRequest,
    TeacherScheduleAssignRequest,
    assign_lesson_dps_to_students,
    available_dps,
    schedule_lesson_dps_to_students,
)
from app.models import models
from app.models.models import DPS, Assignment, Lesson, Level, Module, Notification, Student, Teacher, User
from app.services.lesson_publish_notification_service import NOTIFICATION_TYPE, NotifyTeachersRestOfLessonPublished


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    models.Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def world(db):
    teacher_user = User(full_name="Ashalatha Gupta", email="t@test.local", password_hash="x", role="TEACHER")
    admin_user = User(full_name="Admin", email="a@test.local", password_hash="x", role="ADMIN")
    db.add_all([teacher_user, admin_user])
    db.commit()
    teacher = Teacher(user_id=teacher_user.id, teacher_code="MP-TC-1")
    db.add(teacher)
    module = Module(module_code="IM", module_name="Intermediate Module")
    db.add(module)
    db.commit()
    level = Level(module_id=module.id, level_code="IM-L2", level_name="Intermediate Level 2")
    db.add(level)
    db.commit()
    lesson = Lesson(level_id=level.id, lesson_number=8, lesson_title="Lesson 8")
    db.add(lesson)
    db.commit()
    sheets = []
    for n in range(1, 6):
        dps = DPS(
            lesson_id=lesson.id, dps_number=n, dps_title=f"DPS {n}", default_duration_seconds=300,
            publication_status="PUBLISHED" if n <= 2 else "DRAFT", last_preview_seed=f"seed-{n}",
        )
        db.add(dps)
        sheets.append(dps)
    db.commit()

    def student(code, name):
        user = User(full_name=name, email=f"{code.lower()}@test.local", password_hash="x", role="STUDENT")
        db.add(user)
        db.commit()
        row = Student(user_id=user.id, student_code=code, current_level_id=level.id, teacher_id=teacher.id, is_active=True)
        db.add(row)
        db.commit()
        return row

    return {
        "teacher": teacher, "admin": admin_user, "level": level, "lesson": lesson, "dps": sheets,
        "shivansh": student("MP-ST-0066", "Shivansh Singh"),
        "navya": student("MP-ST-0053", "Navya Sahal"),
        "fresh": student("MP-ST-0058", "Piyansh Bothra"),
    }


def _today(offset=0):
    return (datetime.now(IST) + timedelta(days=offset)).strftime("%Y-%m-%d")


def _schedule(db, world, students, sheets, start_offset=0):
    return schedule_lesson_dps_to_students(
        TeacherScheduleAssignRequest(
            lessonId=world["lesson"].id,
            studentIds=[s.id for s in students],
            scheduleItems=[ScheduleItem(dpsId=d.id, date=_today(start_offset + i)) for i, d in enumerate(sheets)],
            instructions="x",
        ),
        db,
        world["teacher"],
    )


def _sheets_of(db, student):
    rows = db.query(Assignment).filter(Assignment.assigned_to_id == student.id, Assignment.is_active == True).all()
    numbers = {}
    for row in rows:
        dps = db.get(DPS, row.dps_id)
        numbers[dps.dps_number] = row.start_time.replace(tzinfo=timezone.utc).astimezone(IST).strftime("%Y-%m-%d") if row.start_time else None
    return numbers


def _publish_rest(db, world):
    rest = world["dps"][2:]
    return routes_admin.publish_all_dps_for_lesson(
        world["lesson"].id, routes_admin.LessonBulkPublishRequest(dpsIds=[d.id for d in rest]), db, world["admin"],
    )


def test_counts_show_partly_published_lesson(db, world):
    counts = LessonSheetCounts(db, [world["lesson"].id])[world["lesson"].id]
    assert counts == {"totalSheets": 5, "publishedSheets": 2, "notPublishedDpsNumbers": [3, 4, 5]}
    payload = available_dps(None, None, db, world["teacher"])
    lesson = [row for row in payload["lessons"] if row["lessonId"] == world["lesson"].id][0]
    assert (lesson["totalSheets"], lesson["publishedSheets"], lesson["notPublishedDpsNumbers"]) == (5, 2, [3, 4, 5])
    assert len([row for row in payload["dps"] if row.get("lessonId") == world["lesson"].id]) == 2


def test_schedule_says_only_two_of_five(db, world):
    result = _schedule(db, world, [world["shivansh"]], world["dps"][:2])
    assert "Only 2 of 5 sheets in this lesson are published" in result["message"]
    assert "DPS 3, 4 and 5 are not published yet" in result["message"]
    assert result["notPublishedDpsNumbers"] == [3, 4, 5]
    assert result["sheetsScheduled"] == 2
    assert _sheets_of(db, world["shivansh"]) == {1: _today(0), 2: _today(1)}


def test_assign_all_says_only_two_of_five(db, world):
    result = assign_lesson_dps_to_students(
        TeacherBulkAssignRequest(lessonId=world["lesson"].id, studentIds=[world["navya"].id], instructions="x"), db, world["teacher"],
    )
    assert "Only 2 of 5 sheets in this lesson are published" in result["message"]
    assert result["notPublishedDpsNumbers"] == [3, 4, 5]


def test_rest_published_notifies_teacher_once_and_remaining_schedule_starts_today(db, world):
    _schedule(db, world, [world["shivansh"]], world["dps"][:2], start_offset=-5)
    _publish_rest(db, world)

    notes = db.query(Notification).filter(Notification.type == NOTIFICATION_TYPE).all()
    assert len(notes) == 1
    note = notes[0]
    assert note.recipient_role == "TEACHER" and note.lesson_id == world["lesson"].id
    assert note.title == "IM-L2 Lesson 8: DPS 3, 4 and 5 are now published"
    assert "Shivansh Singh" in note.message and "Piyansh" not in note.message
    assert note.target_route == f"/teacher/assign-dps?lesson={world['lesson'].id}"

    # The scheduler now sends only the 3 remaining sheets, from today.
    result = _schedule(db, world, [world["shivansh"]], world["dps"][2:], start_offset=0)
    assert result["sheetsScheduled"] == 3 and not result["notPublishedDpsNumbers"]
    assert "not published" not in result["message"]
    sheets = _sheets_of(db, world["shivansh"])
    assert {n: sheets[n] for n in (3, 4, 5)} == {3: _today(0), 4: _today(1), 5: _today(2)}


def test_mixed_students_each_start_on_day_one(db, world):
    _schedule(db, world, [world["shivansh"]], world["dps"][:2], start_offset=-5)
    _publish_rest(db, world)
    # Shivansh needs DPS 3-5; Piyansh (new) needs all 5. The page sends every
    # needed sheet, Day 1..Day 5 dates; each starts with their own next sheet.
    result = _schedule(db, world, [world["shivansh"], world["fresh"]], world["dps"], start_offset=0)
    assert result["studentsAssigned"] == 2
    assert {n: d for n, d in _sheets_of(db, world["shivansh"]).items() if n >= 3} == {3: _today(0), 4: _today(1), 5: _today(2)}
    assert _sheets_of(db, world["fresh"]) == {n: _today(n - 1) for n in range(1, 6)}


def test_no_notification_when_nobody_holds_earlier_sheets_or_on_republish(db, world):
    _publish_rest(db, world)
    assert db.query(Notification).filter(Notification.type == NOTIFICATION_TYPE).count() == 0
    # Re-publishing an already published sheet never notifies.
    _schedule(db, world, [world["navya"]], world["dps"][:2])
    routes_admin.publish_dps_route(world["dps"][0].id, db, world["admin"])
    assert db.query(Notification).filter(Notification.type == NOTIFICATION_TYPE).count() == 0


def test_single_publish_notifies_for_that_sheet(db, world):
    _schedule(db, world, [world["navya"]], world["dps"][:2])
    routes_admin.publish_dps_route(world["dps"][2].id, db, world["admin"])
    note = db.query(Notification).filter(Notification.type == NOTIFICATION_TYPE).one()
    assert note.title == "IM-L2 Lesson 8: DPS 3 is now published"
    assert "1 of your students has the earlier sheets" in note.message and "Navya Sahal" in note.message


def test_notification_never_breaks_publish(db, world, monkeypatch):
    _schedule(db, world, [world["navya"]], world["dps"][:2])
    import app.services.lesson_publish_notification_service as service

    def boom(*args, **kwargs):
        raise RuntimeError("no")

    monkeypatch.setattr(service, "StudentsNeedingRestOfLesson", boom)
    result = routes_admin.publish_dps_route(world["dps"][3].id, db, world["admin"])
    assert result["published"] is True
    assert db.get(DPS, world["dps"][3].id).publication_status == "PUBLISHED"
    assert NotifyTeachersRestOfLessonPublished(db, lesson_id=world["lesson"].id, published_dps=[world["dps"][4]]) == 0
