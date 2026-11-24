"""Move many students to one teacher at once (2026-11-24, Shailesh)."""
import pytest
from fastapi import HTTPException

from app.models import Notification, Student, Teacher, User
from tests.test_phase2_demo_students import db, world  # noqa: F401  (fixtures)


@pytest.fixture()
def school(world):
    world.add(User(id="tu2", full_name="Teacher Two", email="t2@x.test", password_hash="x", role="TEACHER", is_active=True))
    world.add(User(id="tu3", full_name="Teacher Gone", email="t3@x.test", password_hash="x", role="TEACHER", is_active=True))
    world.flush()
    world.add(Teacher(id="t2", user_id="tu2", teacher_code="MP-T-2"))
    world.add(Teacher(id="t3", user_id="tu3", teacher_code="MP-T-3", is_active=False))
    for number in range(1, 5):
        world.add(User(id=f"us{number}", full_name=f"Pupil {number}", password_hash="x", role="STUDENT", is_active=True))
        world.flush()
        world.add(Student(id=f"s{number}", user_id=f"us{number}", student_code=f"MP-ST-000{number}", is_active=number != 4,
                          current_level_id="l", current_module_id="m",
                          teacher_id="t2" if number == 3 else "t1", teacher="Teacher Two" if number == 3 else "Teacher One"))
    world.commit()
    return world


def _move(db, student_ids, teacher_id):
    from app.api.routes_admin import StudentBulkTeacherRequest, bulk_change_student_teacher

    return bulk_change_student_teacher(StudentBulkTeacherRequest(studentIds=student_ids, teacherId=teacher_id), db=db, user=db.get(User, "admin"))


def _error(call):
    with pytest.raises(HTTPException) as caught:
        call()
    return caught.value.status_code, caught.value.detail["code"]


def test_moves_everyone_including_inactive_and_skips_those_already_there(school):
    reply = _move(school, ["s1", "s2", "s3", "s4", "s1"], "t2")
    assert (reply["moved"], reply["skipped"]) == (3, 1)
    assert reply["message"] == "3 students moved to Teacher Two. 1 already had this teacher."
    for StudentId in ("s1", "s2", "s3", "s4"):
        Row = school.get(Student, StudentId)
        assert (Row.teacher_id, Row.teacher) == ("t2", "Teacher Two")


def test_new_teacher_gets_one_notification(school):
    _move(school, ["s1", "s2", "s4"], "t2")
    notes = school.query(Notification).filter(Notification.recipient_user_id == "tu2").all()
    assert len(notes) == 1
    note = notes[0]
    assert note.title == "3 Students Assigned To You"
    assert note.message == "3 students were moved to you: Pupil 1, Pupil 2, Pupil 4."
    assert note.category == "STUDENTS" and note.target_route == "/teacher/students"
    assert school.query(Notification).filter(Notification.recipient_user_id == "tu").count() == 0


def test_one_student_reads_well(school):
    _move(school, ["s1"], "t2")
    note = school.query(Notification).filter(Notification.recipient_user_id == "tu2").one()
    assert (note.title, note.message) == ("1 Student Assigned To You", "1 student was moved to you: Pupil 1.")
    assert note.student_id == "s1"


def test_long_lists_name_three_and_count_the_rest(school):
    _move(school, ["s1", "s2", "s4", "real", "demo"], "t2")
    note = school.query(Notification).filter(Notification.recipient_user_id == "tu2").one()
    assert note.title == "5 Students Assigned To You"
    assert note.message.endswith("and 2 more.")


def test_nothing_to_move_sends_nothing(school):
    reply = _move(school, ["s3"], "t2")
    assert (reply["moved"], reply["skipped"]) == (0, 1)
    assert school.query(Notification).count() == 0


def test_all_or_nothing_when_a_student_is_missing(school):
    assert _error(lambda: _move(school, ["s1", "gone"], "t2")) == (404, "STUDENT_NOT_FOUND")
    assert school.get(Student, "s1").teacher_id == "t1"


@pytest.mark.parametrize("teacher_id, expected", [("t3", (400, "TEACHER_INACTIVE")), ("nobody", (404, "TEACHER_NOT_FOUND"))])
def test_only_an_existing_active_teacher(school, teacher_id, expected):
    assert _error(lambda: _move(school, ["s1"], teacher_id)) == expected
    assert school.query(Teacher).count() == 3
    assert school.get(Student, "s1").teacher_id == "t1"


def test_needs_students(school):
    assert _error(lambda: _move(school, ["", "  "], "t2")) == (400, "NO_STUDENTS_SELECTED")


def test_teacher_sees_moved_students(school):
    from app.api.routes_teacher import own_students_query

    _move(school, ["s1", "s2"], "t2")
    assert sorted(Row.id for Row in own_students_query(school, school.get(Teacher, "t2")).all()) == ["s1", "s2", "s3"]
    assert "s1" not in {Row.id for Row in own_students_query(school, school.get(Teacher, "t1")).all()}
