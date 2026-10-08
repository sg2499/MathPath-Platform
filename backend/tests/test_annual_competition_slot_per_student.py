"""2026-10-08 (Shailesh): "so on updating this i would be able to assign
different slots to different students for the same level right?"

Online students of one level sit on different days (IM-4: 9 Oct 9:30 PM for
one student, 11 Oct 8:00 PM for another). Every test goes through the real
admin actions (create/edit/delete slot, Apply level, choose slot, engine
run) and the real student entry points (start gate, assignment list,
instructions), so the wiring is what is proven.
"""

import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import (
    CompetitionEvent,
    CompetitionEventAssignment,
    CompetitionEventRoster,
    Level,
    Module,
    Notification,
    Student,
    User,
)
from app.services import annual_competition_assignment_service as engine
from app.services import annual_competition_attempt_service as attempts
from app.services import annual_competition_monitoring_service as monitoring
from app.services import annual_competition_studio_service as studio
from app.services.annual_competition_attempt_service import _CheckSlotGate

LATER = datetime.now(timezone.utc) + timedelta(days=1)
MUCH_LATER = datetime.now(timezone.utc) + timedelta(days=3)


def _session():
    db_engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(db_engine)
    Session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    return Session()


def _setup(db, status="SCHEDULED", students=("s1", "s2")):
    admin = User(id="user-admin", full_name="Admin", email="admin@example.test", password_hash="x", role="ADMIN", is_active=True)
    db.add(admin)
    pm = Module(id="module-PM", module_code="PM", module_name="Preparatory Module", is_active=True)
    db.add(pm)
    db.flush()
    level = Level(id="level-PM-L2", module_id=pm.id, level_code="PM-L2", level_name="Preparatory Level 2", is_active=True)
    db.add(level)
    db.add(CompetitionEvent(id="event-1", name="Test Run", status=status, competition_date=datetime.now(timezone.utc)))
    for sid in students:
        u = User(id=f"user-{sid}", full_name=f"Student {sid}", email=f"{sid}@example.test", password_hash="x", role="STUDENT", is_active=True)
        db.add(u)
        db.flush()
        db.add(Student(id=sid, user_id=u.id, student_code=f"MP-{sid.upper()}", current_module_id=pm.id, current_level_id=level.id, is_active=True))
        db.add(CompetitionEventRoster(id=f"roster-{sid}", event_id="event-1", student_id=sid))
    db.commit()
    return admin


def _slot(db, levels, start=LATER, label=None):
    return studio.CreateCompetitionEventSlot(
        db,
        EventId="event-1",
        Mode="ONLINE_INDIA",
        ScheduledStartAt=start,
        ScheduledEndAt=start + timedelta(minutes=40),
        ApplicableLevelCodes=list(levels),
        SlotLabel=label,
    )["slotId"]


def _level(db, admin, sid, level_code):
    return studio.OverrideCompetitionEventAssignment(
        db, EventId="event-1", StudentId=sid, AssignedLevelCode=level_code, OverriddenBy=admin
    )


def _choose(db, admin, sid, slot_id):
    return studio.SetCompetitionEventAssignmentSlot(db, EventId="event-1", StudentId=sid, SlotId=slot_id, SetBy=admin)


def _assignment(db, sid):
    db.expire_all()
    return db.query(CompetitionEventAssignment).filter_by(event_id="event-1", student_id=sid).one()


def _gate_code(db, sid):
    try:
        _CheckSlotGate(db, _assignment(db, sid), datetime.now(timezone.utc))
    except HTTPException as exc:
        return exc.detail["code"]
    return None


def _notes(db, sid):
    return (
        db.query(Notification)
        .filter(Notification.recipient_user_id == f"user-{sid}")
        .order_by(Notification.created_at.asc(), Notification.id.asc())
        .all()
    )


# --- the student sheet case --------------------------------------------------

def test_two_students_of_one_level_sit_in_different_slots():
    db = _session()
    admin = _setup(db)
    nine = _slot(db, ["IM-L3", "IM-L4", "MM-L1"], start=LATER, label="9th October - 9:30 PM")
    eleven = _slot(db, ["IM-L2", "IM-L4"], start=MUCH_LATER, label="11th October - 8:00 PM")
    _level(db, admin, "s1", "IM-L4")
    _level(db, admin, "s2", "IM-L4")

    # Two slots list IM-L4 and none is chosen: both wait, and cannot start.
    assert _assignment(db, "s1").slot_id is None
    assert _gate_code(db, "s1") == "COMPETITION_SLOT_NOT_SET"
    assert _gate_code(db, "s2") == "COMPETITION_SLOT_NOT_SET"

    first = _choose(db, admin, "s1", nine)
    second = _choose(db, admin, "s2", eleven)
    assert first["slotId"] == nine and first["slotChosenByAdmin"] is True and first["slotPending"] is False
    assert second["slotId"] == eleven

    # Each is held to their own slot's start time.
    assert _gate_code(db, "s1") == "COMPETITION_SLOT_NOT_OPEN_YET"
    assert _gate_code(db, "s2") == "COMPETITION_SLOT_NOT_OPEN_YET"
    assert _assignment(db, "s1").slot_id == nine
    assert _assignment(db, "s2").slot_id == eleven


def test_once_the_chosen_slot_opens_the_student_can_start():
    db = _session()
    admin = _setup(db, students=("s1",))
    opened = _slot(db, ["IM-L4"], start=datetime.now(timezone.utc) - timedelta(minutes=1))
    _slot(db, ["IM-L4"], start=MUCH_LATER)
    _level(db, admin, "s1", "IM-L4")
    _choose(db, admin, "s1", opened)
    assert _gate_code(db, "s1") is None


def test_a_slot_that_does_not_list_the_level_cannot_be_chosen():
    db = _session()
    admin = _setup(db, students=("s1",))
    other = _slot(db, ["MM-L2"])
    _level(db, admin, "s1", "IM-L4")
    with pytest.raises(HTTPException) as exc:
        _choose(db, admin, "s1", other)
    assert exc.value.detail["code"] == "COMPETITION_SLOT_LEVEL_MISMATCH"
    # Nothing was written.
    assert _assignment(db, "s1").slot_id is None
    assert not _assignment(db, "s1").slot_chosen_by_admin


def test_choosing_a_slot_needs_a_level_first():
    db = _session()
    admin = _setup(db, students=("s1",))
    slot = _slot(db, ["IM-L4"])
    with pytest.raises(HTTPException) as exc:
        _choose(db, admin, "s1", slot)
    assert exc.value.detail["code"] == "COMPETITION_ASSIGNMENT_NOT_FOUND"


def test_clearing_the_choice_goes_back_to_the_automatic_slot():
    db = _session()
    admin = _setup(db, students=("s1",))
    a = _slot(db, ["IM-L4"])
    b = _slot(db, ["IM-L4"], start=MUCH_LATER)
    _level(db, admin, "s1", "IM-L4")
    _choose(db, admin, "s1", b)
    cleared = _choose(db, admin, "s1", None)
    # Two slots still list IM-L4, so "automatic" means waiting again.
    assert cleared["slotId"] is None and cleared["slotPending"] is True and cleared["slotChosenByAdmin"] is False
    # Remove the second slot: the one remaining slot is now automatic.
    studio.UpdateCompetitionEventSlot(db, SlotId=b, IsActive=False)
    assert _assignment(db, "s1").slot_id == a


# --- the choice survives every other write path ------------------------------

def test_re_saving_the_same_level_keeps_the_chosen_slot():
    db = _session()
    admin = _setup(db, students=("s1",))
    _slot(db, ["IM-L4"])
    b = _slot(db, ["IM-L4"], start=MUCH_LATER)
    _level(db, admin, "s1", "IM-L4")
    _choose(db, admin, "s1", b)
    _level(db, admin, "s1", "IM-L4")
    assert _assignment(db, "s1").slot_id == b
    assert _assignment(db, "s1").slot_chosen_by_admin is True
    studio.BulkOverrideCompetitionEventAssignments(db, EventId="event-1", StudentIds=["s1"], AssignedLevelCode="IM-L4", OverriddenBy=admin)
    assert _assignment(db, "s1").slot_id == b


def test_moving_to_a_level_the_chosen_slot_does_not_list_clears_the_choice():
    db = _session()
    admin = _setup(db, students=("s1",))
    nine = _slot(db, ["IM-L4", "MM-L1"])
    _slot(db, ["IM-L4"], start=MUCH_LATER)
    mm2 = _slot(db, ["MM-L2"], start=MUCH_LATER)
    _level(db, admin, "s1", "IM-L4")
    _choose(db, admin, "s1", nine)

    # MM-L1 is on the chosen slot too: kept.
    _level(db, admin, "s1", "MM-L1")
    assert _assignment(db, "s1").slot_id == nine

    # MM-L2 is not: the choice is cleared and the one MM-L2 slot is used.
    _level(db, admin, "s1", "MM-L2")
    record = _assignment(db, "s1")
    assert record.slot_id == mm2
    assert not record.slot_chosen_by_admin


def test_engine_run_keeps_a_chosen_slot_and_links_new_students_automatically():
    db = _session()
    admin = _setup(db)
    one = _slot(db, ["PM-L1"])
    engine.RunAnnualCompetitionAssignmentEngine(db, EventId="event-1", RunBy=admin)
    assert _assignment(db, "s1").slot_id == one
    two = _slot(db, ["PM-L1"], start=MUCH_LATER)
    # The new second slot puts both students in "waiting".
    assert _assignment(db, "s1").slot_id is None
    _choose(db, admin, "s1", two)
    engine.RunAnnualCompetitionAssignmentEngine(db, EventId="event-1", RunBy=admin)
    assert _assignment(db, "s1").slot_id == two
    assert _assignment(db, "s2").slot_id is None


# --- slot edits re-link straight away -----------------------------------------

def test_creating_and_editing_slots_relinks_students_without_re_saving_levels():
    db = _session()
    admin = _setup(db, students=("s1",))
    _level(db, admin, "s1", "IM-L3")
    assert _assignment(db, "s1").slot_id is None  # no slot yet: start any time, as before

    a = _slot(db, ["IM-L3"], label="ABC")
    assert _assignment(db, "s1").slot_id == a

    b = _slot(db, ["IM-L3", "IM-L4"], start=MUCH_LATER, label="9th October - 9:30 PM")
    assert _assignment(db, "s1").slot_id is None
    assert _gate_code(db, "s1") == "COMPETITION_SLOT_NOT_SET"

    # Untick IM-L3 on the second slot: back to the one slot that lists it.
    studio.UpdateCompetitionEventSlot(db, SlotId=b, ApplicableLevelCodes=["IM-L4"])
    assert _assignment(db, "s1").slot_id == a


def test_a_chosen_slot_that_is_deleted_moves_the_student_on():
    db = _session()
    admin = _setup(db, students=("s1",))
    a = _slot(db, ["IM-L4"])
    b = _slot(db, ["IM-L4"], start=MUCH_LATER)
    _level(db, admin, "s1", "IM-L4")
    _choose(db, admin, "s1", b)
    studio.UpdateCompetitionEventSlot(db, SlotId=b, IsActive=False)
    record = _assignment(db, "s1")
    assert record.slot_id == a
    assert not record.slot_chosen_by_admin


def test_deleting_the_only_slot_for_a_level_keeps_the_start_time_lock():
    db = _session()
    admin = _setup(db, students=("s1",))
    only = _slot(db, ["IM-L4"])
    _level(db, admin, "s1", "IM-L4")
    studio.UpdateCompetitionEventSlot(db, SlotId=only, IsActive=False)
    assert _assignment(db, "s1").slot_id == only
    assert _gate_code(db, "s1") == "COMPETITION_SLOT_NOT_OPEN_YET"


def test_moving_to_a_level_with_no_slot_drops_the_old_levels_slot():
    db = _session()
    admin = _setup(db, students=("s1",))
    _slot(db, ["IM-L4"])
    _level(db, admin, "s1", "IM-L4")
    assert _assignment(db, "s1").slot_id is not None
    # No slot lists MM-L2: the IM-L4 slot does not follow the student there.
    _level(db, admin, "s1", "MM-L2")
    assert _assignment(db, "s1").slot_id is None
    assert _gate_code(db, "s1") is None


def test_a_slot_edit_never_touches_another_events_students():
    db = _session()
    admin = _setup(db, students=("s1",))
    _slot(db, ["IM-L4"])
    _level(db, admin, "s1", "IM-L4")
    db.add(CompetitionEvent(id="event-2", name="Other", status="SCHEDULED", competition_date=datetime.now(timezone.utc)))
    db.commit()
    studio.CreateCompetitionEventSlot(
        db, EventId="event-2", Mode="ONLINE_INDIA", ScheduledStartAt=LATER, ScheduledEndAt=LATER + timedelta(minutes=40), ApplicableLevelCodes=["IM-L4"]
    )
    assert _assignment(db, "s1").slot_id is not None


# --- what the student, the admin and the live board see ----------------------

def test_student_card_instructions_preview_and_live_board_show_a_missing_slot():
    db = _session()
    admin = _setup(db, students=("s1",))
    _slot(db, ["IM-L4"])
    second = _slot(db, ["IM-L4"], start=MUCH_LATER)
    _level(db, admin, "s1", "IM-L4")
    student = db.get(Student, "s1")

    card = attempts.ListMyAnnualCompetitionAssignments(db, student)["assignments"][0]
    assert card["slot"] is None and card["slotPending"] is True

    preview = engine.PreviewAnnualCompetitionAssignments(db, EventId="event-1")
    row = preview["rows"][0]
    assert row["existingSlotPending"] is True and row["existingSlotId"] is None
    assert preview["studentsWaitingForSlotCount"] == 1

    board = monitoring.GetAnnualCompetitionLiveMonitoring(db, EventId="event-1")
    assert board["rows"][0]["slotPending"] is True

    _choose(db, admin, "s1", second)
    card = attempts.ListMyAnnualCompetitionAssignments(db, student)["assignments"][0]
    assert card["slot"]["slotId"] == second and card["slotPending"] is False
    row = engine.PreviewAnnualCompetitionAssignments(db, EventId="event-1")["rows"][0]
    assert row["existingSlotId"] == second and row["existingSlotChosenByAdmin"] is True
    assert monitoring.GetAnnualCompetitionLiveMonitoring(db, EventId="event-1")["rows"][0]["slotPending"] is False


def test_a_level_with_no_slot_at_all_still_starts_any_time():
    db = _session()
    admin = _setup(db, students=("s1",))
    _level(db, admin, "s1", "IM-L4")
    assert _gate_code(db, "s1") is None
    card = attempts.ListMyAnnualCompetitionAssignments(db, db.get(Student, "s1"))["assignments"][0]
    assert card["slotPending"] is False


# --- notifications -----------------------------------------------------------

def _slot_notes(db, sid):
    # Notifications written in one test can share a timestamp, so they are
    # picked out by type and title rather than by order.
    return [n for n in _notes(db, sid) if n.type == "ANNUAL_OFFICIAL_SLOT_CHANGED"]


def test_student_is_told_when_their_slot_is_set_and_when_it_changes_once_each():
    db = _session()
    admin = _setup(db, students=("s1",))
    a = _slot(db, ["IM-L4"], label="9th October - 9:30 PM")
    b = _slot(db, ["IM-L4"], start=MUCH_LATER, label="11th October - 8:00 PM")
    _level(db, admin, "s1", "IM-L4")
    assert [n.type for n in _notes(db, "s1")] == ["ANNUAL_OFFICIAL_ASSIGNED"]

    result = _choose(db, admin, "s1", a)
    assert result["studentsNotified"] == 1
    set_notes = _slot_notes(db, "s1")
    assert len(set_notes) == 1
    note = set_notes[0]
    assert note.title == "Your Annual Competition Slot Is Set"
    assert "IST" in note.message
    assert note.category == "ANNUAL_COMPETITION_OFFICIAL"
    assert note.target_route == "/student/competition/annual" and note.target_tab == "OFFICIAL"
    metadata = json.loads(note.metadata_json)
    assert metadata["slotId"] == a and "levelCode" not in metadata

    # Choosing the same slot again tells nobody.
    assert _choose(db, admin, "s1", a)["studentsNotified"] == 0

    _choose(db, admin, "s1", b)
    titles = sorted(n.title for n in _slot_notes(db, "s1"))
    assert titles == ["Your Annual Competition Slot Has Changed", "Your Annual Competition Slot Is Set"]
    assert len(_notes(db, "s1")) == 3

    # Going back to "waiting" is not announced.
    _choose(db, admin, "s1", None)
    assert len(_notes(db, "s1")) == 3


def test_a_slot_edit_that_moves_students_tells_them():
    db = _session()
    admin = _setup(db, students=("s1",))
    a = _slot(db, ["IM-L4"])
    _level(db, admin, "s1", "IM-L4")
    assert len(_notes(db, "s1")) == 1  # assigned, with its slot
    b = _slot(db, ["IM-L3"], start=MUCH_LATER)
    studio.UpdateCompetitionEventSlot(db, SlotId=a, ApplicableLevelCodes=["IM-L3"])
    studio.UpdateCompetitionEventSlot(db, SlotId=b, ApplicableLevelCodes=["IM-L4"])
    assert _assignment(db, "s1").slot_id == b
    assert [n.title for n in _slot_notes(db, "s1")] == ["Your Annual Competition Slot Has Changed"]


def test_no_slot_notifications_while_the_event_is_draft():
    db = _session()
    admin = _setup(db, status="DRAFT", students=("s1",))
    _slot(db, ["IM-L4"])
    b = _slot(db, ["IM-L4"], start=MUCH_LATER)
    _level(db, admin, "s1", "IM-L4")
    _choose(db, admin, "s1", b)
    assert _notes(db, "s1") == []
    # Switching to SCHEDULED tells them once, with the chosen slot.
    studio.UpdateCompetitionEvent(db, EventId="event-1", Status="SCHEDULED", UpdatedBy=admin)
    notes = _notes(db, "s1")
    assert [n.type for n in notes] == ["ANNUAL_OFFICIAL_ASSIGNED"]
    # ... and choosing nothing new afterwards adds nothing.
    _choose(db, admin, "s1", b)
    assert len(_notes(db, "s1")) == 1


def test_the_admin_route_is_registered():
    from app.main import app

    paths = {getattr(route, "path", "") for route in app.routes}
    assert any(path.endswith("/annual-competition/events/{event_id}/assignments/slot") for path in paths)
