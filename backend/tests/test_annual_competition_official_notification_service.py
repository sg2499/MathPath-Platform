"""2026-10-07 (Shailesh): "as long as a student is getting assigned a paper
they should get notified and the redirection should be accurate ... how it's
getting assigned shouldn't matter."

Every test goes through the real admin actions (engine run, single Apply,
bulk Set Level, the event status switch), never the notify function alone, so
the wiring in each write path is what is proven.
"""

import json
from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import (
    CompetitionEvent,
    CompetitionEventAssignment,
    CompetitionEventRoster,
    CompetitionEventSlot,
    Level,
    Module,
    Notification,
    Student,
    User,
)
from app.services import annual_competition_assignment_service as engine
from app.services import annual_competition_official_notification_service as official
from app.services import annual_competition_studio_service as studio


def _session():
    db_engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(db_engine)
    Session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    return Session()


def _admin(db):
    a = User(id="user-admin", full_name="Admin", email="admin@example.test", password_hash="x", role="ADMIN", is_active=True)
    db.add(a)
    return a


def _curriculum(db):
    pm = Module(id="module-PM", module_code="PM", module_name="Preparatory Module", is_active=True)
    ylm = Module(id="module-YLM", module_code="YLM", module_name="Young Learners Module", is_active=True)
    db.add_all([pm, ylm])
    db.flush()
    levels = {
        "PM-L2": Level(id="level-PM-L2", module_id=pm.id, level_code="PM-L2", level_name="Preparatory Level 2", is_active=True),
        "YLM-L1": Level(id="level-YLM-L1", module_id=ylm.id, level_code="YLM-L1", level_name="Young Learners Level 1", is_active=True),
    }
    db.add_all(levels.values())
    db.flush()
    return {"PM": pm, "YLM": ylm}, levels


def _student(db, sid, module, level):
    u = User(id=f"user-{sid}", full_name=f"Student {sid}", email=f"{sid}@example.test", password_hash="x", role="STUDENT", is_active=True)
    db.add(u)
    db.flush()
    s = Student(id=sid, user_id=u.id, student_code=f"MP-{sid.upper()}", current_module_id=module.id, current_level_id=level.id, is_active=True)
    db.add(s)
    db.flush()
    return s


def _event(db, status="SCHEDULED"):
    e = CompetitionEvent(id="event-1", name="Test Run", status=status, competition_date=datetime.now(timezone.utc))
    db.add(e)
    return e


def _roster(db, *student_ids):
    for StudentId in student_ids:
        db.add(CompetitionEventRoster(id=f"roster-{StudentId}", event_id="event-1", student_id=StudentId))


def _slot(db, level_code, mode="ONLINE_INDIA"):
    # 06:00 UTC == 11:30 AM India time.
    db.add(
        CompetitionEventSlot(
            id=f"slot-{level_code}",
            event_id="event-1",
            mode=mode,
            slot_label=f"{level_code} slot",
            scheduled_start_at=datetime(2026, 10, 7, 6, 0, tzinfo=timezone.utc),
            scheduled_end_at=datetime(2026, 10, 7, 6, 20, tzinfo=timezone.utc),
            applicable_level_codes_json=json.dumps([level_code]),
            is_active=True,
        )
    )


def _notes(db, sid):
    return (
        db.query(Notification)
        .filter(Notification.recipient_user_id == f"user-{sid}")
        .order_by(Notification.created_at.asc(), Notification.id.asc())
        .all()
    )


def _setup(db, status="SCHEDULED", students=("s1",)):
    modules, levels = _curriculum(db)
    admin = _admin(db)
    _event(db, status=status)
    for sid in students:
        _student(db, sid, modules["PM"], levels["PM-L2"])
    _roster(db, *students)
    db.commit()
    return admin, modules, levels


# --- engine -----------------------------------------------------------------

def test_engine_run_on_a_scheduled_event_notifies_the_student_once():
    db = _session()
    admin, _, _ = _setup(db)

    first = engine.RunAnnualCompetitionAssignmentEngine(db, EventId="event-1", RunBy=admin)
    assert first["created"] == 1
    assert first["studentsNotified"] == 1

    notes = _notes(db, "s1")
    assert len(notes) == 1
    note = notes[0]
    assert note.type == "ANNUAL_OFFICIAL_ASSIGNED"
    assert note.category == "ANNUAL_COMPETITION_OFFICIAL"
    assert note.recipient_role == "STUDENT"
    assert note.title == "Annual Competition Paper Assigned"
    assert "Test Run" in note.message and "PM-L1" in note.message
    # Redirect: the student page's Official tab.
    assert note.target_route == "/student/competition/annual"
    assert note.target_tab == "OFFICIAL"
    # Never "levelCode": the bell forwards that key as a query parameter the
    # student page reads as "open this level's PRACTICE block".
    metadata = json.loads(note.metadata_json)
    assert metadata["assignedLevelCode"] == "PM-L1"
    assert metadata["eventId"] == "event-1"
    assert "levelCode" not in metadata

    # A second run changes nothing and tells nobody again.
    second = engine.RunAnnualCompetitionAssignmentEngine(db, EventId="event-1", RunBy=admin)
    assert second["studentsNotified"] == 0
    assert len(_notes(db, "s1")) == 1


def test_engine_run_on_a_draft_event_notifies_nobody():
    db = _session()
    admin, _, _ = _setup(db, status="DRAFT")

    result = engine.RunAnnualCompetitionAssignmentEngine(db, EventId="event-1", RunBy=admin)
    assert result["created"] == 1
    assert result["studentsNotified"] == 0
    assert _notes(db, "s1") == []
    row = db.query(CompetitionEventAssignment).one()
    assert row.notified_level_code is None


def test_engine_run_notifies_a_hand_set_student_it_did_not_touch():
    """The engine never rewrites an ADMIN_OVERRIDE row, but "the engine was
    run" must still leave every assigned student notified -- e.g. a level set
    by hand before this feature existed."""
    db = _session()
    admin, _, _ = _setup(db)
    db.add(
        CompetitionEventAssignment(
            id="assignment-s1", event_id="event-1", student_id="s1",
            assigned_level_code="IM-L1", assignment_source="ADMIN_OVERRIDE", is_active=True,
        )
    )
    db.commit()

    result = engine.RunAnnualCompetitionAssignmentEngine(db, EventId="event-1", RunBy=admin)
    assert result["created"] == 0 and result["updated"] == 0
    assert result["skippedAdminOverrides"] == 1
    assert result["studentsNotified"] == 1
    assert "IM-L1" in _notes(db, "s1")[0].message


def test_engine_run_result_says_who_has_a_level_and_who_does_not():
    """The run summary the admin reads must never make a hand-set student
    look unassigned (Shailesh, 2026-10-07): a YLM-L1 student the engine has
    no rule for, whose level was set by hand, counts as having a level."""
    db = _session()
    modules, levels = _curriculum(db)
    admin = _admin(db)
    _event(db)
    _student(db, "s1", modules["PM"], levels["PM-L2"])      # engine assigns
    _student(db, "s2", modules["YLM"], levels["YLM-L1"])    # no rule, hand-set below
    _student(db, "s3", modules["YLM"], levels["YLM-L1"])    # no rule, nothing set
    _roster(db, "s1", "s2", "s3")
    db.add(
        CompetitionEventAssignment(
            id="assignment-s2", event_id="event-1", student_id="s2",
            assigned_level_code="YLM-L0", assignment_source="ADMIN_OVERRIDE", is_active=True,
        )
    )
    db.commit()

    result = engine.RunAnnualCompetitionAssignmentEngine(db, EventId="event-1", RunBy=admin)
    assert result["totalConsidered"] == 3
    assert result["created"] == 1
    assert result["noRuleMatched"] == 2
    assert result["studentsWithLevel"] == 2
    assert result["studentsWithoutLevel"] == 1
    assert result["adminSetLevelsKept"] == 1
    assert result["studentsNotified"] == 2

    preview = engine.PreviewAnnualCompetitionAssignments(db, EventId="event-1")
    assert preview["studentsWithLevelCount"] == 2
    assert preview["studentsWithoutLevelCount"] == 1


# --- hand-set levels ---------------------------------------------------------

def test_single_apply_notifies_and_a_level_change_notifies_again():
    db = _session()
    admin, _, _ = _setup(db)

    first = studio.OverrideCompetitionEventAssignment(
        db, EventId="event-1", StudentId="s1", AssignedLevelCode="PM-L1", OverriddenBy=admin
    )
    assert first["studentsNotified"] == 1
    assert first["studentName"] == "Student s1"

    # Same level saved again: already told, nothing new.
    again = studio.OverrideCompetitionEventAssignment(
        db, EventId="event-1", StudentId="s1", AssignedLevelCode="PM-L1", OverriddenBy=admin
    )
    assert again["studentsNotified"] == 0
    assert len(_notes(db, "s1")) == 1

    # A different level: their paper changes, so they are told.
    changed = studio.OverrideCompetitionEventAssignment(
        db, EventId="event-1", StudentId="s1", AssignedLevelCode="IM-L1", OverriddenBy=admin
    )
    assert changed["studentsNotified"] == 1
    # Both rows can share a created_at second, so look them up by type.
    by_type = {n.type: n for n in _notes(db, "s1")}
    assert sorted(by_type) == ["ANNUAL_OFFICIAL_ASSIGNED", "ANNUAL_OFFICIAL_LEVEL_CHANGED"]
    change = by_type["ANNUAL_OFFICIAL_LEVEL_CHANGED"]
    assert change.title == "Your Annual Competition Level Has Changed"
    assert change.message.startswith("Your paper for Test Run is now IM-L1.")
    assert change.target_route == "/student/competition/annual" and change.target_tab == "OFFICIAL"
    assert json.loads(change.metadata_json)["previousLevelCode"] == "PM-L1"


def test_bulk_set_level_notifies_every_selected_student():
    db = _session()
    admin, _, _ = _setup(db, students=("s1", "s2", "s3"))

    result = studio.BulkOverrideCompetitionEventAssignments(
        db, EventId="event-1", StudentIds=["s1", "s2", "s3"], AssignedLevelCode="MM-L1", OverriddenBy=admin
    )
    assert result["studentsSucceeded"] == 3
    assert result["studentsNotified"] == 3
    for sid in ("s1", "s2", "s3"):
        assert len(_notes(db, sid)) == 1


# --- the DRAFT -> SCHEDULED switch -------------------------------------------

def test_levels_set_while_draft_are_notified_when_the_event_is_scheduled():
    db = _session()
    admin, _, _ = _setup(db, status="DRAFT", students=("s1", "s2"))

    bulk = studio.BulkOverrideCompetitionEventAssignments(
        db, EventId="event-1", StudentIds=["s1", "s2"], AssignedLevelCode="PM-L1", OverriddenBy=admin
    )
    assert bulk["studentsNotified"] == 0
    assert _notes(db, "s1") == [] and _notes(db, "s2") == []

    scheduled = studio.UpdateCompetitionEvent(db, EventId="event-1", Status="SCHEDULED", UpdatedBy=admin)
    assert scheduled["status"] == "SCHEDULED"
    assert scheduled["studentsNotified"] == 2
    assert len(_notes(db, "s1")) == 1 and len(_notes(db, "s2")) == 1

    # Back to DRAFT and SCHEDULED again: nobody is told twice.
    studio.UpdateCompetitionEvent(db, EventId="event-1", Status="DRAFT", UpdatedBy=admin)
    again = studio.UpdateCompetitionEvent(db, EventId="event-1", Status="SCHEDULED", UpdatedBy=admin)
    assert again["studentsNotified"] == 0
    assert len(_notes(db, "s1")) == 1


def test_completing_or_renaming_an_event_notifies_nobody():
    db = _session()
    admin, _, _ = _setup(db, status="DRAFT")
    studio.BulkOverrideCompetitionEventAssignments(
        db, EventId="event-1", StudentIds=["s1"], AssignedLevelCode="PM-L1", OverriddenBy=admin
    )

    renamed = studio.UpdateCompetitionEvent(db, EventId="event-1", Name="Renamed", UpdatedBy=admin)
    assert renamed["studentsNotified"] == 0
    completed = studio.UpdateCompetitionEvent(db, EventId="event-1", Status="COMPLETED", UpdatedBy=admin)
    assert completed["studentsNotified"] == 0
    assert _notes(db, "s1") == []


# --- message text -------------------------------------------------------------

def test_message_states_the_india_slot_time_for_an_india_slot():
    db = _session()
    admin, _, _ = _setup(db)
    _slot(db, "PM-L1", mode="ONLINE_INDIA")
    db.commit()

    studio.OverrideCompetitionEventAssignment(
        db, EventId="event-1", StudentId="s1", AssignedLevelCode="PM-L1", OverriddenBy=admin
    )
    message = _notes(db, "s1")[0].message
    assert message == (
        "Your PM-L1 paper for Test Run is assigned. Your slot: 7 Oct 2026, 11:30 AM IST. "
        "Instructions open 10 minutes before your slot."
    )


def test_message_does_not_state_a_time_for_an_international_slot_or_no_slot():
    db = _session()
    admin, _, _ = _setup(db, students=("s1", "s2"))
    _slot(db, "PM-L1", mode="ONLINE_INTL")
    db.commit()

    studio.OverrideCompetitionEventAssignment(
        db, EventId="event-1", StudentId="s1", AssignedLevelCode="PM-L1", OverriddenBy=admin
    )
    intl = _notes(db, "s1")[0].message
    assert "IST" not in intl and "AM" not in intl
    assert "see your slot time" in intl

    studio.OverrideCompetitionEventAssignment(
        db, EventId="event-1", StudentId="s2", AssignedLevelCode="IM-L1", OverriddenBy=admin
    )
    no_slot = _notes(db, "s2")[0].message
    assert no_slot == "Your IM-L1 paper for Test Run is assigned. Open the Annual Competition page to see your paper."


def test_no_double_hyphen_in_any_text_a_student_reads():
    db = _session()
    admin, _, _ = _setup(db)
    studio.OverrideCompetitionEventAssignment(
        db, EventId="event-1", StudentId="s1", AssignedLevelCode="PM-L1", OverriddenBy=admin
    )
    studio.OverrideCompetitionEventAssignment(
        db, EventId="event-1", StudentId="s1", AssignedLevelCode="MM-L1", OverriddenBy=admin
    )
    for note in _notes(db, "s1"):
        assert "--" not in note.title and "--" not in note.message


def test_a_notification_failure_never_fails_the_assignment(monkeypatch):
    db = _session()
    admin, _, _ = _setup(db)

    def _boom(*args, **kwargs):
        raise RuntimeError("notification store is down")

    monkeypatch.setattr(official, "CreateNotification", _boom)
    result = studio.OverrideCompetitionEventAssignment(
        db, EventId="event-1", StudentId="s1", AssignedLevelCode="PM-L1", OverriddenBy=admin
    )
    assert result["assignedLevelCode"] == "PM-L1"
    assert result["studentsNotified"] == 0
    row = db.query(CompetitionEventAssignment).one()
    assert row.assigned_level_code == "PM-L1"
    # Not marked as told, so the next attempt still notifies.
    assert row.notified_level_code is None
