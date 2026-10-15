"""Phase 2 part 3 (2026-10-14): demo / test accounts keep working but are
left out of counts, trackers, readiness, leaderboards, staff notifications
and billing."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import DPS, Assignment, Attempt, Lesson, Level, Module, Notification, Student, Teacher, User
from app.services import demo_students

T0 = datetime(2026, 10, 1, 10, 0, tzinfo=timezone.utc)


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", future=True, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)()
    yield session
    session.close()


@pytest.fixture()
def world(db):
    db.add(User(id="admin", full_name="Admin", email="a@x.test", password_hash="x", role="ADMIN", is_active=True))
    db.add(User(id="tu", full_name="Teacher One", email="t@x.test", password_hash="x", role="TEACHER", is_active=True))
    db.flush()
    db.add(Teacher(id="t1", user_id="tu", teacher_code="MP-T-1"))
    db.add(Module(id="m", module_code="IM", module_name="Intermediate"))
    db.flush()
    db.add(Level(id="l", module_id="m", level_code="IM-L1", level_name="IM L1"))
    db.flush()
    db.add(Lesson(id="ls", level_id="l", lesson_number=1, lesson_title="Lesson 1"))
    db.flush()
    db.add(DPS(id="d1", lesson_id="ls", dps_number=1, dps_title="DPS 1"))
    for sid, demo in (("real", False), ("demo", True)):
        db.add(User(id=f"u-{sid}", full_name=f"Student {sid}", email=f"{sid}@x.test", password_hash="x", role="STUDENT", is_active=True))
        db.flush()
        db.add(Student(id=sid, user_id=f"u-{sid}", student_code=f"MP-{sid}", is_active=True, is_demo=demo,
                       current_level_id="l", current_module_id="m", teacher_id="t1", teacher="Teacher One"))
        db.flush()
        db.add(Assignment(id=f"a-{sid}", assignment_type="PRACTICE", dps_id="d1", assigned_to_type="STUDENT", assigned_to_id=sid,
                          title="DPS 1", retry_attempt_number=0, is_active=True, attempt_group_id=f"a-{sid}", created_at=T0))
        db.flush()
        db.add(Attempt(id=f"t-{sid}", assignment_id=f"a-{sid}", dps_id="d1", student_id=sid, mode="PRACTICE", status="SUBMITTED",
                       attempt_group_id=f"a-{sid}", attempt_number=0, started_at=T0, submitted_at=T0 + timedelta(minutes=9),
                       expires_at=T0 + timedelta(minutes=15), duration_seconds=900, accuracy_percentage=90.0 if demo else 60.0,
                       total_questions=10, correct_count=9 if demo else 6))
    db.commit()
    return db


def test_demo_ids_and_filters(world):
    assert demo_students.DemoStudentIds(world) == {"demo"}
    assert [Row.id for Row in demo_students.RealStudents(world.query(Student)).all()] == ["real"]
    assert [Row.id for Row in demo_students.WithoutDemoColumn(world, world.query(Attempt), Attempt.student_id).all()] == ["t-real"]


def test_teacher_lists_leave_out_demo_but_single_student_access_works(world):
    from app.api.routes_teacher import own_students_query

    teacher = world.get(Teacher, "t1")
    assert [Row.id for Row in own_students_query(world, teacher).all()] == ["real"]
    assert sorted(Row.id for Row in own_students_query(world, teacher, include_demo=True).all()) == ["demo", "real"]


def test_teacher_tracker_has_no_demo_rows(world):
    from app.api.routes_teacher import teacher_assignment_tracker

    reply = teacher_assignment_tracker(db=world, teacher=world.get(Teacher, "t1"))
    assert {Row["studentId"] for Row in reply["rows"]} == {"real"}


def test_dps_leaderboard_leaves_out_demo(world):
    from app.services.leaderboard_service import rank_dps_specific_level

    board = rank_dps_specific_level(world, "l", with_badges=False)
    # The demo account scored higher but takes no place.
    assert [Row["studentId"] for Row in board] == ["real"]
    assert board[0]["rank"] == 1


def test_readiness_leaves_out_demo(world):
    from app.api.routes_admin import admin_assessment_eligibility

    reply = admin_assessment_eligibility(levelId=None, db=world, user=world.get(User, "admin"))
    assert [Row["studentId"] for Row in reply["rows"]] == ["real"]
    assert reply["totalStudents"] == 1


def test_staff_notices_about_demo_show_only_with_the_switch_on(world):
    from app.services.notification_service import CreateNotification, ListNotifications

    CreateNotification(world, recipient_user_id="tu", recipient_role="TEACHER", type="X", category="PRACTICE", title="demo did a thing", student_id="demo")
    CreateNotification(world, recipient_user_id="tu", recipient_role="TEACHER", type="X", category="PRACTICE", title="real did a thing", student_id="real")
    CreateNotification(world, recipient_user_id="u-demo", recipient_role="STUDENT", type="X", category="PRACTICE", title="your result", student_id="demo")
    world.commit()
    # Always saved, so the switch can show them.
    assert {Row.title for Row in world.query(Notification).all()} == {"demo did a thing", "real did a thing", "your result"}

    Teacher = ListNotifications(world, recipient_user_id="tu", role="TEACHER")
    assert [Item["title"] for Item in Teacher["items"]] == ["real did a thing"]
    assert Teacher["unreadCount"] == 1
    demo_students.SetIncludeDemo(world, True)
    Teacher = ListNotifications(world, recipient_user_id="tu", role="TEACHER")
    assert {Item["title"] for Item in Teacher["items"]} == {"demo did a thing", "real did a thing"}
    demo_students.SetIncludeDemo(world, False)
    # A student always sees their own notices.
    Student = ListNotifications(world, recipient_user_id="u-demo", role="STUDENT")
    assert [Item["title"] for Item in Student["items"]] == ["your result"]


def test_switch_on_shows_demo_everywhere(world):
    from app.api.routes_teacher import teacher_assignment_tracker
    from app.services.leaderboard_service import rank_dps_specific_level

    demo_students.SetIncludeDemo(world, True)
    reply = teacher_assignment_tracker(db=world, teacher=world.get(Teacher, "t1"))
    assert {Row["studentId"] for Row in reply["rows"]} == {"real", "demo"}
    board = rank_dps_specific_level(world, "l", with_badges=False)
    assert [Row["studentId"] for Row in board] == ["demo", "real"]


def test_demo_accounts_are_not_billed_unless_shown_and_never_auto_drafted(world):
    from app.models import PaymentInvoiceDraft
    from app.services.payments.billing_service import _ActiveStudents, _CreateDrafts

    assert [StudentRow.id for StudentRow, _ in _ActiveStudents(world)] == ["real"]
    demo_students.SetIncludeDemo(world, True)
    assert sorted(StudentRow.id for StudentRow, _ in _ActiveStudents(world)) == ["demo", "real"]
    # The automatic run on the 1st skips demo accounts even with the switch on...
    assert _CreateDrafts(world, "2026-11", None, "AUTO", None) == 1
    assert [Row.student_id for Row in world.query(PaymentInvoiceDraft).all()] == ["real"]
    # ...but a draft made by hand with the switch on can be for a demo account.
    assert _CreateDrafts(world, "2026-11", ["demo"], "MANUAL", None) == 1


def test_payments_reads_hide_demo_rows_only_when_scoped(world):
    from app.models import PaymentInvoiceDraft

    world.add(PaymentInvoiceDraft(student_id="real", billing_month=11, billing_year=2026, period_key="2026-11", status="DRAFT", source="MANUAL"))
    world.add(PaymentInvoiceDraft(student_id="demo", billing_month=11, billing_year=2026, period_key="2026-11", status="DRAFT", source="MANUAL"))
    world.commit()
    assert world.query(PaymentInvoiceDraft).count() == 2
    demo_students.HideDemoPaymentsForThisRequest(world)
    assert [Row.student_id for Row in world.query(PaymentInvoiceDraft).all()] == ["real"]
    assert world.query(PaymentInvoiceDraft).count() == 1
