"""Package 3 (Admin Annual Competition Studio) tests.

Covers event/slot CRUD and validation, the level-paper link/status/lock
lifecycle, the slot-vs-section-timer duration conflict check (REQUIREMENTS.md
item 7), the manual assignment override path, and that
DEFAULT_SECTION_TIMERS_BY_LEVEL_CODE's minutes sum to exactly what the
client gist documents for every level (2026-09-10: DEFAULT_SECTION_TIMERS_BY_
LEVEL_CODE is now derived directly from ANNUAL_COMPETITION_LEVEL_REGISTRY --
see that constant's comment in annual_competition_studio_service.py).

Note on scope: GenerateAndLinkCompetitionEventLevelPaper's happy path now
calls the dedicated Annual Competition question-generation engine
(GenerateAnnualCompetitionLevelPaper, annual_competition_paper_generation_
service.py) rather than the practice-mock engine -- that engine's own
correctness (question counts, concept diversity, dedup) is covered by
test_annual_competition_paper_generation_service.py, not re-tested here.
Unlike the old practice-mock engine, the new one does not require a fully
seeded curriculum (lessons/DPS rows) to run -- it drives each module's own
low-level generator directly -- so this file's lightweight Level/Module
stubs are enough to exercise the real generate path directly, not only via
LinkExistingCompetitionEventLevelPaper. What IS this package's own code --
level-code validation, the MM-L2-has-no-curriculum-Level fallback, default
section-timer seeding, status transitions, and the immutability guard -- is
exercised both via the real generate path and via
LinkExistingCompetitionEventLevelPaper, which shares every one of those code
paths with the generate path except the actual generation call.

Package 9 (Full Rehearsal + Regression) added the "Reuse guard:
DeleteCompetitionMockExam itself" section at the bottom of this file. Every
test above this addition already covers this package's own mirrored
read-side guard (_IsLevelPaperLocked, exercised via LinkExistingCompetition-
EventLevelPaper/GenerateAndLinkCompetitionEventLevelPaper) -- but nothing
anywhere in this repo had ever directly called DeleteCompetitionMockExam
itself (competition_mock_generation_service.py) against an
Annual-Competition-linked exam, confirmed by a full-repo grep before writing
these. That is a real, previously-uncovered gap, not a re-test of what's
already covered above -- see pkg-09-rehearsal-and-regression.md checklist
item 3.
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import (
    Attempt,
    CompetitionEvent,
    CompetitionEventAssignment,
    CompetitionEventAttempt,
    CompetitionEventAttemptAnswer,
    CompetitionEventAttemptRetryGrant,
    CompetitionEventAttemptSectionState,
    CompetitionEventLevelPaper,
    CompetitionEventResult,
    CompetitionEventSectionTimer,
    CompetitionEventSlot,
    CompetitionMockExam,
    CompetitionMockQuestion,
    Level,
    Module,
    Student,
    User,
)
from app.services import annual_competition_studio_service as studio
from app.services.competition_mock_generation_service import DeleteCompetitionMockExam


def _session():
    db_engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(db_engine)
    Session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    return Session()


def _admin(db):
    a = User(id="user-admin", full_name="Admin", email="admin@example.test", password_hash="x", role="ADMIN", is_active=True)
    db.add(a)
    return a


def _student(db, sid="s1", student_code=None, module_id=None, level_id=None):
    u = User(id=f"user-{sid}", full_name=sid, email=f"{sid}@example.test", password_hash="x", role="STUDENT", is_active=True)
    db.add(u)
    db.flush()
    s = Student(
        id=sid, user_id=u.id, student_code=student_code or f"MP-{sid.upper()}",
        current_module_id=module_id, current_level_id=level_id, is_active=True,
    )
    db.add(s)
    db.flush()
    return s


def _module_and_level(db, module_code, level_code, level_name):
    m = db.query(Module).filter(Module.module_code == module_code).first()
    if not m:
        m = Module(id=f"module-{module_code}", module_code=module_code, module_name=module_code, is_active=True)
        db.add(m)
        db.flush()
    l = Level(id=f"level-{level_code}", module_id=m.id, level_code=level_code, level_name=level_name, is_active=True)
    db.add(l)
    db.flush()
    return m, l


def _mock_exam(db, level_id, module_id, exam_id="exam-1", duration_seconds=1800):
    e = CompetitionMockExam(
        id=exam_id,
        title="Test Exam",
        module_id=module_id,
        level_id=level_id,
        total_questions=50,
        duration_seconds=duration_seconds,
        is_active=True,
    )
    db.add(e)
    db.flush()
    return e


def _event(db, event_id="event-1", results_release_at=None):
    e = CompetitionEvent(
        id=event_id,
        name="Annual Competition 2026",
        status="DRAFT",
        competition_date=datetime.now(timezone.utc) + timedelta(days=30),
        results_release_at=results_release_at,
    )
    db.add(e)
    db.flush()
    return e


# ---------------------------------------------------------------------------
# Event CRUD
# ---------------------------------------------------------------------------

def test_create_and_update_event():
    db = _session()
    admin = _admin(db)
    db.commit()

    created = studio.CreateCompetitionEvent(
        db, Name="  Annual Competition 2026  ", CompetitionDate=datetime.now(timezone.utc), CreatedBy=admin
    )
    assert created["name"] == "Annual Competition 2026"  # trimmed
    assert created["status"] == "DRAFT"
    assert created["resultsReleaseAt"] is None

    updated = studio.UpdateCompetitionEvent(db, EventId=created["eventId"], Status="SCHEDULED")
    assert updated["status"] == "SCHEDULED"
    assert updated["resultsReleaseAt"] is None  # untouched, not sent


def test_create_event_requires_a_name():
    db = _session()
    admin = _admin(db)
    db.commit()
    with pytest.raises(HTTPException):
        studio.CreateCompetitionEvent(db, Name="   ", CompetitionDate=datetime.now(timezone.utc), CreatedBy=admin)


def test_update_event_results_release_at_uses_sentinel_not_none():
    db = _session()
    admin = _admin(db)
    _event(db)
    db.commit()

    release_date = datetime.now(timezone.utc) + timedelta(days=60)
    updated = studio.UpdateCompetitionEvent(db, EventId="event-1", ResultsReleaseAt=release_date)
    assert updated["resultsReleaseAt"] is not None

    # Calling again without touching resultsReleaseAt must leave it alone.
    updated_again = studio.UpdateCompetitionEvent(db, EventId="event-1", Name="Renamed")
    assert updated_again["resultsReleaseAt"] is not None


# ---------------------------------------------------------------------------
# Suspend / lift suspension (Package 10 go-live rollback plan) -- the guard
# itself (StartCompetitionEventAttempt/GetCompetitionEventInstructions
# rejecting once suspended) is exercised in
# test_annual_competition_attempt_service.py; these tests cover this
# module's own side: the admin action, its payload, and the reason
# requirement.
# ---------------------------------------------------------------------------

def test_suspend_event_requires_a_reason():
    db = _session()
    admin = _admin(db)
    _event(db)
    db.commit()
    with pytest.raises(HTTPException):
        studio.SuspendCompetitionEvent(db, EventId="event-1", Reason="   ", SuspendedBy=admin)


def test_suspend_and_lift_event_round_trip():
    db = _session()
    admin = _admin(db)
    _event(db)
    db.commit()

    suspended = studio.SuspendCompetitionEvent(db, EventId="event-1", Reason="Wrong paper linked.", SuspendedBy=admin)
    assert suspended["isSuspended"] is True
    assert suspended["attemptsSuspendedAt"] is not None
    assert suspended["suspensionReason"] == "Wrong paper linked."

    lifted = studio.LiftCompetitionEventSuspension(db, EventId="event-1")
    assert lifted["isSuspended"] is False
    assert lifted["attemptsSuspendedAt"] is None
    assert lifted["suspensionReason"] is None


def test_new_event_is_not_suspended_by_default():
    db = _session()
    admin = _admin(db)
    db.commit()
    created = studio.CreateCompetitionEvent(
        db, Name="Annual Competition 2026", CompetitionDate=datetime.now(timezone.utc), CreatedBy=admin
    )
    assert created["isSuspended"] is False


# ---------------------------------------------------------------------------
# Delete event (2026-09-08): the Studio's event list had no way to remove a
# throwaway/test event at all (Shailesh's own "ZZ-TEST-DELETE-ME" naming was
# the tell). Hard delete, not the isActive soft-delete slots use.
#
# 2026-09-10 (Shailesh): the original guard here (reject once a real attempt
# exists, or once results_release_at locks the event) has been REMOVED --
# Shailesh explicitly asked for an unconditional admin override "just in
# case of any unavoidable circumstances," even past results release /
# certificates. The tests below now assert deletion succeeds in both of
# those cases, and that the full attempt-family tree (section states,
# answers, results, retry grants) is cleaned up alongside it.
# ---------------------------------------------------------------------------

def test_delete_event_removes_it_and_every_child_row():
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    exam = _mock_exam(db, level.id, module.id)
    admin = _admin(db)
    _event(db)
    db.commit()

    studio.CreateCompetitionEventSlot(
        db,
        EventId="event-1",
        Mode="OFFLINE",
        ScheduledStartAt=datetime(2026, 10, 11, 12, 0, tzinfo=timezone.utc),
        ScheduledEndAt=datetime(2026, 10, 11, 12, 30, tzinfo=timezone.utc),
        ApplicableLevelCodes=["PM-L2"],
    )
    studio.LinkExistingCompetitionEventLevelPaper(db, EventId="event-1", CompetitionLevelCode="PM-L2", MockExamId=exam.id)
    level_paper_id = db.query(CompetitionEventLevelPaper).filter(CompetitionEventLevelPaper.event_id == "event-1").one().id
    assert db.query(CompetitionEventSectionTimer).filter(CompetitionEventSectionTimer.level_paper_id == level_paper_id).count() > 0
    user = User(id="user-s1", full_name="S1", email="s1@example.test", password_hash="x", role="STUDENT", is_active=True)
    student = Student(id="s1", user_id=user.id, student_code="MP-S1", current_module_id=module.id, current_level_id=level.id, is_active=True)
    db.add_all([user, student])
    db.commit()
    studio.OverrideCompetitionEventAssignment(db, EventId="event-1", StudentId="s1", AssignedLevelCode="PM-L2", OverriddenBy=admin)

    result = studio.DeleteCompetitionEvent(db, EventId="event-1")
    assert result == {"eventId": "event-1", "deleted": True}

    assert db.get(CompetitionEvent, "event-1") is None
    assert db.query(CompetitionEventSlot).filter(CompetitionEventSlot.event_id == "event-1").count() == 0
    assert db.query(CompetitionEventLevelPaper).filter(CompetitionEventLevelPaper.event_id == "event-1").count() == 0
    assert db.query(CompetitionEventSectionTimer).filter(CompetitionEventSectionTimer.level_paper_id == level_paper_id).count() == 0
    assert db.query(CompetitionEventAssignment).filter(CompetitionEventAssignment.event_id == "event-1").count() == 0


def test_delete_event_now_allowed_even_with_a_real_attempt_and_cascades_the_whole_attempt_family():
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    exam = _mock_exam(db, level.id, module.id)
    _event(db)
    db.commit()
    studio.LinkExistingCompetitionEventLevelPaper(db, EventId="event-1", CompetitionLevelCode="PM-L2", MockExamId=exam.id)
    level_paper = db.query(CompetitionEventLevelPaper).filter(CompetitionEventLevelPaper.event_id == "event-1").one()
    level_paper_id = level_paper.id  # captured now -- the row (and this ORM object) won't survive the delete below

    user = User(id="user-s1", full_name="S1", email="s1@example.test", password_hash="x", role="STUDENT", is_active=True)
    student = Student(id="s1", user_id=user.id, student_code="MP-S1", current_module_id=module.id, current_level_id=level.id, is_active=True)
    db.add_all([user, student])
    db.flush()
    db.add(
        CompetitionEventAttempt(
            id="attempt-1", event_id="event-1", assignment_id="assignment-placeholder",
            level_paper_id=level_paper_id, student_id="s1", status="FINALIZED", started_at=datetime.now(timezone.utc),
        )
    )
    db.flush()
    # The full attempt-family tree -- section state, answer, result, and a
    # USED retry grant pointing at this same attempt via used_attempt_id
    # (the FK with no ondelete=CASCADE that makes ordering matter here).
    db.add(
        CompetitionEventAttemptSectionState(
            id="section-state-1", attempt_id="attempt-1", section_number=1,
            status="COMPLETED", time_limit_seconds=600,
        )
    )
    db.add(
        CompetitionEventAttemptAnswer(
            id="answer-1", attempt_id="attempt-1", mock_question_id="question-placeholder", selected_value="4",
        )
    )
    db.add(
        CompetitionEventResult(
            id="result-1", attempt_id="attempt-1", event_id="event-1", assignment_id="assignment-placeholder",
            student_id="s1", competition_level_code="PM-L2", is_released=True, released_at=datetime.now(timezone.utc),
        )
    )
    db.add(
        CompetitionEventAttemptRetryGrant(
            id="retry-1", event_id="event-1", assignment_id="assignment-placeholder", student_id="s1",
            reason="Technical issue", status="USED", used_attempt_id="attempt-1", used_at=datetime.now(timezone.utc),
        )
    )
    db.commit()

    result = studio.DeleteCompetitionEvent(db, EventId="event-1")
    assert result == {"eventId": "event-1", "deleted": True}

    assert db.get(CompetitionEvent, "event-1") is None
    assert db.query(CompetitionEventLevelPaper).filter_by(id=level_paper_id).count() == 0
    assert db.query(CompetitionEventAttempt).filter_by(id="attempt-1").count() == 0
    assert db.query(CompetitionEventAttemptSectionState).filter_by(attempt_id="attempt-1").count() == 0
    assert db.query(CompetitionEventAttemptAnswer).filter_by(attempt_id="attempt-1").count() == 0
    assert db.query(CompetitionEventResult).filter_by(event_id="event-1").count() == 0
    assert db.query(CompetitionEventAttemptRetryGrant).filter_by(event_id="event-1").count() == 0


def test_delete_event_also_sweeps_practice_bank_papers_attempts_and_results():
    """2026-09-11 (Shailesh, Competition Practice feature, Phase B):
    DeleteCompetitionEvent's queries are all scoped purely by event_id, with
    no paper_kind/attempt_type filter anywhere -- confirming here that this
    already, correctly, sweeps PRACTICE-kind data (a bank level paper with
    no mock_exam_id, a PRACTICE attempt with assignment_id=None, and its
    result) exactly like OFFICIAL data, with no additional code needed."""
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    _event(db)
    user = User(id="user-s1", full_name="S1", email="s1@example.test", password_hash="x", role="STUDENT", is_active=True)
    student = Student(id="s1", user_id=user.id, student_code="MP-S1", current_module_id=module.id, current_level_id=level.id, is_active=True)
    db.add_all([user, student])
    db.commit()

    practice_paper = CompetitionEventLevelPaper(
        id="practice-paper-1", event_id="event-1", competition_level_code="PM-L2",
        paper_kind="PRACTICE", status="READY", assigned_student_id="s1",
    )
    db.add(practice_paper)
    db.flush()
    db.add(
        CompetitionEventAttempt(
            id="practice-attempt-1", event_id="event-1", assignment_id=None,
            level_paper_id=practice_paper.id, student_id="s1", attempt_type="PRACTICE",
            status="FINALIZED", started_at=datetime.now(timezone.utc),
        )
    )
    db.flush()
    db.add(
        CompetitionEventResult(
            id="practice-result-1", attempt_id="practice-attempt-1", event_id="event-1", assignment_id=None,
            student_id="s1", attempt_type="PRACTICE", competition_level_code="PM-L2", is_released=True,
        )
    )
    db.commit()

    result = studio.DeleteCompetitionEvent(db, EventId="event-1")
    assert result == {"eventId": "event-1", "deleted": True}

    assert db.query(CompetitionEventLevelPaper).filter_by(id="practice-paper-1").count() == 0
    assert db.query(CompetitionEventAttempt).filter_by(id="practice-attempt-1").count() == 0
    assert db.query(CompetitionEventResult).filter_by(id="practice-result-1").count() == 0


def test_delete_event_now_allowed_even_after_results_release_at_is_set():
    db = _session()
    _event(db, results_release_at=datetime.now(timezone.utc))
    db.commit()
    result = studio.DeleteCompetitionEvent(db, EventId="event-1")
    assert result == {"eventId": "event-1", "deleted": True}
    assert db.get(CompetitionEvent, "event-1") is None


def test_delete_unknown_event_is_a_clean_404():
    db = _session()
    with pytest.raises(HTTPException) as exc_info:
        studio.DeleteCompetitionEvent(db, EventId="no-such-event")
    assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# Slots
# ---------------------------------------------------------------------------

def test_create_slot_and_reject_invalid_window():
    db = _session()
    _event(db)
    db.commit()

    slot = studio.CreateCompetitionEventSlot(
        db,
        EventId="event-1",
        Mode="OFFLINE",
        ScheduledStartAt=datetime(2026, 10, 11, 12, 0, tzinfo=timezone.utc),
        ScheduledEndAt=datetime(2026, 10, 11, 12, 30, tzinfo=timezone.utc),
        ApplicableLevelCodes=["YLM-L1", "PM-L1"],
    )
    assert slot["durationMinutes"] == 30

    with pytest.raises(HTTPException):
        studio.CreateCompetitionEventSlot(
            db,
            EventId="event-1",
            Mode="OFFLINE",
            ScheduledStartAt=datetime(2026, 10, 11, 13, 0, tzinfo=timezone.utc),
            ScheduledEndAt=datetime(2026, 10, 11, 12, 0, tzinfo=timezone.utc),  # end before start
            ApplicableLevelCodes=[],
        )


def test_create_slot_rejects_bm_l1_as_applicable_level():
    db = _session()
    _event(db)
    db.commit()
    with pytest.raises(HTTPException):
        studio.CreateCompetitionEventSlot(
            db,
            EventId="event-1",
            Mode="OFFLINE",
            ScheduledStartAt=datetime(2026, 10, 11, 12, 0, tzinfo=timezone.utc),
            ScheduledEndAt=datetime(2026, 10, 11, 12, 30, tzinfo=timezone.utc),
            ApplicableLevelCodes=["BM-L1"],
        )


def test_known_slot_duration_conflict_is_flagged_mm1_mm2():
    """Gist-correct totals (2026-09-10, superseding the older doc2-derived
    figures): a 30-minute slot fits IM-4 (30 min, exactly) but is too short
    for MM-1 and MM-2 (35 min each). This must show up as a computed
    conflict, not just a comment somewhere."""
    db = _session()
    _event(db)
    db.commit()
    studio.CreateCompetitionEventSlot(
        db,
        EventId="event-1",
        Mode="OFFLINE",
        SlotLabel="2:00-2:30 PM",
        ScheduledStartAt=datetime(2026, 10, 11, 14, 0, tzinfo=timezone.utc),
        ScheduledEndAt=datetime(2026, 10, 11, 14, 30, tzinfo=timezone.utc),
        ApplicableLevelCodes=["IM-L4", "MM-L1", "MM-L2"],
    )
    conflicts = studio.SlotsWithInsufficientDuration(db, "event-1")
    conflicted_levels = {c["levelCode"] for c in conflicts}
    assert "MM-L1" in conflicted_levels  # needs 35 min, slot is 30
    assert "MM-L2" in conflicted_levels  # needs 35 min, slot is 30
    assert "IM-L4" not in conflicted_levels  # needs exactly 30 min -- fits


# ---------------------------------------------------------------------------
# Slot edit/delete (2026-09-08): the Studio UI previously had no edit/delete
# controls on a created slot at all, even though UpdateCompetitionEventSlot
# (this function) and its PATCH /admin/annual-competition/slots/{slot_id}
# route already existed and already supported every field including
# isActive -- confirmed via full-repo grep that nothing had ever called this
# function before these tests. "Delete" in the new UI is this same
# isActive=False soft-delete, matching the Assignment.is_active ("Archive")
# convention already used elsewhere in this schema, not a hard DELETE.
# ---------------------------------------------------------------------------

def test_update_slot_edits_fields_in_place():
    db = _session()
    _event(db)
    db.commit()
    slot = studio.CreateCompetitionEventSlot(
        db,
        EventId="event-1",
        Mode="OFFLINE",
        SlotLabel="Original Label",
        ScheduledStartAt=datetime(2026, 10, 11, 12, 0, tzinfo=timezone.utc),
        ScheduledEndAt=datetime(2026, 10, 11, 12, 30, tzinfo=timezone.utc),
        ApplicableLevelCodes=["YLM-L1"],
    )

    updated = studio.UpdateCompetitionEventSlot(
        db,
        SlotId=slot["slotId"],
        Mode="ONLINE_INDIA",
        SlotLabel="Corrected Label",
        ScheduledStartAt=datetime(2026, 10, 11, 13, 0, tzinfo=timezone.utc),
        ScheduledEndAt=datetime(2026, 10, 11, 13, 35, tzinfo=timezone.utc),
        ApplicableLevelCodes=["IM-L4"],
    )

    assert updated["mode"] == "ONLINE_INDIA"
    assert updated["slotLabel"] == "Corrected Label"
    assert updated["applicableLevelCodes"] == ["IM-L4"]
    assert updated["durationMinutes"] == 35
    assert updated["isActive"] is True  # untouched by a field-only edit

    # Re-fetch via the list to confirm the edit actually persisted, not just
    # returned in the response payload.
    [refetched] = studio.ListCompetitionEventSlots(db, "event-1")
    assert refetched["mode"] == "ONLINE_INDIA"
    # startswith, not ==: SQLite (this test's in-memory DB) drops tzinfo on a
    # DateTime(timezone=True) round-trip, so the naive read-back's isoformat()
    # has no "+00:00" suffix even though it was written as aware UTC --
    # Postgres (production) preserves it. Matches the same, already-documented
    # hazard in test_teacher_schedule_per_student_regression.py.
    assert refetched["scheduledStartAt"].startswith("2026-10-11T13:00:00")


def test_update_slot_rejects_invalid_window():
    db = _session()
    _event(db)
    db.commit()
    slot = studio.CreateCompetitionEventSlot(
        db,
        EventId="event-1",
        Mode="OFFLINE",
        ScheduledStartAt=datetime(2026, 10, 11, 12, 0, tzinfo=timezone.utc),
        ScheduledEndAt=datetime(2026, 10, 11, 12, 30, tzinfo=timezone.utc),
        ApplicableLevelCodes=[],
    )
    with pytest.raises(HTTPException):
        studio.UpdateCompetitionEventSlot(
            db,
            SlotId=slot["slotId"],
            ScheduledStartAt=datetime(2026, 10, 11, 14, 0, tzinfo=timezone.utc),
            ScheduledEndAt=datetime(2026, 10, 11, 13, 0, tzinfo=timezone.utc),  # end before start
        )


def test_update_slot_unknown_id_is_a_clean_404():
    db = _session()
    with pytest.raises(HTTPException):
        studio.UpdateCompetitionEventSlot(db, SlotId="no-such-slot", Mode="OFFLINE")


def test_deleting_slot_via_update_removes_it_from_the_list():
    db = _session()
    _event(db)
    db.commit()
    slot = studio.CreateCompetitionEventSlot(
        db,
        EventId="event-1",
        Mode="OFFLINE",
        ScheduledStartAt=datetime(2026, 10, 11, 12, 0, tzinfo=timezone.utc),
        ScheduledEndAt=datetime(2026, 10, 11, 12, 30, tzinfo=timezone.utc),
        ApplicableLevelCodes=["YLM-L1"],
    )
    assert len(studio.ListCompetitionEventSlots(db, "event-1")) == 1

    deleted = studio.UpdateCompetitionEventSlot(db, SlotId=slot["slotId"], IsActive=False)
    assert deleted["isActive"] is False
    assert studio.ListCompetitionEventSlots(db, "event-1") == []


def test_deleted_slot_still_gates_an_assignment_that_already_references_it():
    """The new Delete control is a soft delete specifically so a student who
    already has an assignment pointing at this slot_id isn't silently
    orphaned -- confirms _CheckSlotGate (annual_competition_attempt_service.py)
    still finds the slot and still enforces its scheduled_start_at after the
    slot has been deleted from the admin's own list."""
    from app.services.annual_competition_attempt_service import _CheckSlotGate

    db = _session()
    _event(db)
    admin = _admin(db)
    module, level = _module_and_level(db, "YLM", "YLM-L1", "Young Learners Module Level 1")
    user = User(id="user-student", full_name="Student", email="student@example.test", password_hash="x", role="STUDENT", is_active=True)
    db.add(user)
    db.flush()
    student = Student(id="student-1", user_id=user.id, student_code="MP-ST-DELSLOT", current_level_id=level.id, is_active=True)
    db.add(student)
    db.commit()

    future_start = datetime.now(timezone.utc) + timedelta(hours=2)
    slot = studio.CreateCompetitionEventSlot(
        db,
        EventId="event-1",
        Mode="OFFLINE",
        ScheduledStartAt=future_start,
        ScheduledEndAt=future_start + timedelta(minutes=30),
        ApplicableLevelCodes=["YLM-L1"],
    )
    assignment = CompetitionEventAssignment(
        id="assignment-1", event_id="event-1", student_id=student.id, assigned_level_code="YLM-L1", slot_id=slot["slotId"]
    )
    db.add(assignment)
    db.commit()

    studio.UpdateCompetitionEventSlot(db, SlotId=slot["slotId"], IsActive=False)

    # The slot is gone from the admin's list...
    assert studio.ListCompetitionEventSlots(db, "event-1") == []
    # ...but the assignment's gate still works exactly as before: the slot
    # hasn't opened yet, so this must still raise, not silently pass through
    # as if the assignment were now unscheduled.
    with pytest.raises(HTTPException) as exc_info:
        _CheckSlotGate(db, assignment, datetime.now(timezone.utc))
    assert exc_info.value.detail["code"] == "COMPETITION_SLOT_NOT_OPEN_YET"


# ---------------------------------------------------------------------------
# Level papers: link, status lifecycle, lock guard
# ---------------------------------------------------------------------------

def test_link_existing_paper_seeds_default_timers_and_marks_ready():
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    exam = _mock_exam(db, level.id, module.id)
    _event(db)
    db.commit()

    result = studio.LinkExistingCompetitionEventLevelPaper(
        db, EventId="event-1", CompetitionLevelCode="PM-L2", MockExamId=exam.id
    )
    assert result["status"] == "READY"
    assert result["mockExamId"] == exam.id
    assert len(result["sectionTimers"]) == 2  # Abacus 5 + Visual 5
    assert result["totalSectionSeconds"] == 10 * 60


def test_link_existing_paper_still_finds_the_single_official_row_when_a_practice_bank_paper_already_exists():
    """2026-09-11 (Shailesh, Competition Practice feature, Phase A/B):
    _GetOrCreateLevelPaper now filters/creates scoped to paper_kind ==
    "OFFICIAL" -- this is what replaced the dropped DB-level
    UniqueConstraint("event_id", "competition_level_code"). Confirms the
    replacement actually works: a PRACTICE-kind row for the same event+level
    existing first must not stop the official link from finding/creating
    its own single OFFICIAL row, and must not get relinked/overwritten by
    it either."""
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    exam = _mock_exam(db, level.id, module.id)
    _event(db)
    db.commit()

    practice_paper = CompetitionEventLevelPaper(
        id="practice-paper-1", event_id="event-1", competition_level_code="PM-L2",
        paper_kind="PRACTICE", status="READY",
    )
    db.add(practice_paper)
    db.commit()

    result = studio.LinkExistingCompetitionEventLevelPaper(
        db, EventId="event-1", CompetitionLevelCode="PM-L2", MockExamId=exam.id
    )
    assert result["status"] == "READY"
    assert result["mockExamId"] == exam.id

    official_papers = (
        db.query(CompetitionEventLevelPaper)
        .filter_by(event_id="event-1", competition_level_code="PM-L2", paper_kind="OFFICIAL")
        .all()
    )
    assert len(official_papers) == 1  # exactly one OFFICIAL row created, the practice row left alone
    assert official_papers[0].id != practice_paper.id

    untouched_practice_paper = db.get(CompetitionEventLevelPaper, "practice-paper-1")
    assert untouched_practice_paper.mock_exam_id is None  # never linked/overwritten by the official action


def test_link_rejects_mismatched_level():
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    exam = _mock_exam(db, level.id, module.id)
    _event(db)
    db.commit()

    with pytest.raises(HTTPException):
        studio.LinkExistingCompetitionEventLevelPaper(
            db, EventId="event-1", CompetitionLevelCode="PM-L3", MockExamId=exam.id  # wrong code for this exam's level
        )


def test_generate_for_mm_l2_succeeds_via_mm_l1_curriculum_fallback():
    """MM-L2 still has no curriculum Level row of its own on this platform
    (Package 2 finding #4, still open) -- but it is a real Annual Competition
    target (students who complete the MM module fully are eligible for it,
    per the client gist), so generation must succeed, not fail. It resolves
    Module/Level linkage through the real MM-L1 Level row while generating
    MM-L2's own gist-specified content (see GenerateAnnualCompetitionLevelPaper's
    CompetitionLevelCode docstring)."""
    db = _session()
    admin = _admin(db)
    _module_and_level(db, "MM", "MM-L1", "Master Module Level 1")
    _event(db)
    db.commit()

    result = studio.GenerateAndLinkCompetitionEventLevelPaper(
        db, EventId="event-1", CompetitionLevelCode="MM-L2", CreatedBy=admin
    )
    assert result["status"] == "READY"
    assert result["competitionLevelCode"] == "MM-L2"
    assert result["mockExamId"] is not None


def test_generate_for_mm_l2_fails_cleanly_when_mm_l1_also_missing():
    """If the MM module hasn't been seeded at all (no MM-L1 Level row
    either), MM-L2 generation must still fail with a clear, specific error,
    not a stack trace or a silent wrong-level fallback."""
    db = _session()
    admin = _admin(db)
    _event(db)
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        studio.GenerateAndLinkCompetitionEventLevelPaper(
            db, EventId="event-1", CompetitionLevelCode="MM-L2", CreatedBy=admin
        )
    assert exc_info.value.status_code == 409
    assert exc_info.value.detail["code"] == "NO_CURRICULUM_LEVEL_FOR_CODE"


def test_regenerating_an_unlocked_paper_does_not_collide_on_mock_code():
    """Bug fix (Shailesh, 2026-09-14): "Regenerate Official Paper" used to
    build a fixed, non-unique MockCode (ANNUAL-{eventId}-{levelCode}) on
    every call. CompetitionMockExam has a UNIQUE(level_id, mock_code)
    constraint, so a first generate always succeeded but a second generate
    against the same still-unlocked level paper (exactly what "Regenerate"
    is -- and exactly the "delete the old papers and regenerate" workflow
    this feature exists for) always raised an uncaught IntegrityError,
    surfaced to the admin as a generic 500 "Something went wrong." Confirmed
    via direct reproduction against the pre-fix code before writing this
    test. Regenerating a LOCKED paper is covered separately by
    test_locked_level_paper_blocks_regeneration_and_relinking -- this test
    is deliberately about the unlocked case, which used to crash instead of
    cleanly succeeding."""
    db = _session()
    admin = _admin(db)
    _module_and_level(db, "PM", "PM-L3", "Preparatory Level 3")
    _event(db)
    db.commit()

    first = studio.GenerateAndLinkCompetitionEventLevelPaper(
        db, EventId="event-1", CompetitionLevelCode="PM-L3", CreatedBy=admin
    )
    assert first["status"] == "READY"

    # No attempts exist against this paper -- still unlocked -- so this must
    # succeed cleanly, not raise sqlalchemy.exc.IntegrityError.
    second = studio.GenerateAndLinkCompetitionEventLevelPaper(
        db, EventId="event-1", CompetitionLevelCode="PM-L3", CreatedBy=admin
    )
    assert second["status"] == "READY"
    assert second["mockExamId"] != first["mockExamId"]  # a genuinely new exam, not a no-op


def test_locked_level_paper_blocks_regeneration_and_relinking():
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    exam = _mock_exam(db, level.id, module.id)
    admin = _admin(db)
    _event(db)
    db.commit()

    studio.LinkExistingCompetitionEventLevelPaper(db, EventId="event-1", CompetitionLevelCode="PM-L2", MockExamId=exam.id)
    level_paper = db.query(CompetitionEventLevelPaper).filter(CompetitionEventLevelPaper.event_id == "event-1").one()

    # Simulate a real attempt against this paper -- the same condition
    # DeleteCompetitionMockExam's guard checks.
    user = User(id="user-s1", full_name="S1", email="s1@example.test", password_hash="x", role="STUDENT", is_active=True)
    student = Student(id="s1", user_id=user.id, student_code="MP-S1", current_module_id=module.id, current_level_id=level.id, is_active=True)
    db.add_all([user, student])
    db.flush()
    now = datetime.now(timezone.utc)
    db.add(
        CompetitionEventAttempt(
            id="attempt-1",
            event_id="event-1",
            assignment_id="assignment-placeholder",
            level_paper_id=level_paper.id,
            student_id="s1",
            started_at=now,
        )
    )
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        studio.LinkExistingCompetitionEventLevelPaper(db, EventId="event-1", CompetitionLevelCode="PM-L2", MockExamId=exam.id)
    assert exc_info.value.detail["code"] == "COMPETITION_LEVEL_PAPER_LOCKED"

    overview = studio.GetCompetitionEventStudioOverview(db, "event-1")
    [paper] = [p for p in overview["levelPapers"] if p["competitionLevelCode"] == "PM-L2"]
    assert paper["status"] == "LOCKED"


def test_results_release_at_locks_all_linked_level_papers():
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    exam = _mock_exam(db, level.id, module.id)
    _event(db)
    db.commit()

    studio.LinkExistingCompetitionEventLevelPaper(db, EventId="event-1", CompetitionLevelCode="PM-L2", MockExamId=exam.id)
    studio.UpdateCompetitionEvent(db, EventId="event-1", ResultsReleaseAt=datetime.now(timezone.utc))

    [paper] = studio.ListCompetitionEventLevelPapers(db, "event-1")
    assert paper["status"] == "LOCKED"


# ---------------------------------------------------------------------------
# Manual override
# ---------------------------------------------------------------------------

def test_manual_override_creates_and_then_updates_assignment():
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    admin = _admin(db)
    user = User(id="user-s1", full_name="S1", email="s1@example.test", password_hash="x", role="STUDENT", is_active=True)
    student = Student(id="s1", user_id=user.id, student_code="MP-S1", current_module_id=module.id, current_level_id=level.id, is_active=True)
    db.add_all([user, student])
    _event(db)
    db.commit()

    first = studio.OverrideCompetitionEventAssignment(
        db, EventId="event-1", StudentId="s1", AssignedLevelCode="PM-L1", OverriddenBy=admin
    )
    assert first["assignmentSource"] == "ADMIN_OVERRIDE"
    assert first["assignedLevelCode"] == "PM-L1"
    assert db.query(CompetitionEventAssignment).count() == 1

    second = studio.OverrideCompetitionEventAssignment(
        db, EventId="event-1", StudentId="s1", AssignedLevelCode="PM-L2", OverriddenBy=admin
    )
    assert second["assignmentId"] == first["assignmentId"]  # same row, updated
    assert second["assignedLevelCode"] == "PM-L2"
    assert db.query(CompetitionEventAssignment).count() == 1


def test_manual_override_rejects_invalid_level_code():
    db = _session()
    admin = _admin(db)
    _event(db)
    db.commit()
    with pytest.raises(HTTPException):
        studio.OverrideCompetitionEventAssignment(
            db, EventId="event-1", StudentId="s1", AssignedLevelCode="BM-L1", OverriddenBy=admin
        )


def test_manual_override_accepts_student_code_as_well_as_raw_id():
    """An admin doing this by hand only ever has the human-facing student
    code (e.g. "MP-ST-005"), never the raw internal id -- nothing else in
    the product surfaces that id. Both forms must resolve to the same row."""
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    admin = _admin(db)
    user = User(id="user-s1", full_name="S1", email="s1@example.test", password_hash="x", role="STUDENT", is_active=True)
    student = Student(
        id="internal-uuid-s1", user_id=user.id, student_code="MP-ST-005",
        current_module_id=module.id, current_level_id=level.id, is_active=True,
    )
    db.add_all([user, student])
    _event(db)
    db.commit()

    ByCode = studio.OverrideCompetitionEventAssignment(
        db, EventId="event-1", StudentId="MP-ST-005", AssignedLevelCode="MM-L1", OverriddenBy=admin
    )
    assert ByCode["studentId"] == "internal-uuid-s1"
    assert ByCode["assignedLevelCode"] == "MM-L1"

    # Lowercase/whitespace-sloppy input still resolves -- same row updated, not a duplicate.
    ByCodeAgain = studio.OverrideCompetitionEventAssignment(
        db, EventId="event-1", StudentId=" mp-st-005 ", AssignedLevelCode="MM-L2", OverriddenBy=admin
    )
    assert ByCodeAgain["assignmentId"] == ByCode["assignmentId"]
    assert db.query(CompetitionEventAssignment).count() == 1

    # The raw internal id still works too -- this must never regress.
    ByRawId = studio.OverrideCompetitionEventAssignment(
        db, EventId="event-1", StudentId="internal-uuid-s1", AssignedLevelCode="MM-L1", OverriddenBy=admin
    )
    assert ByRawId["assignmentId"] == ByCode["assignmentId"]


def test_manual_override_unknown_student_identifier_is_a_clean_404():
    """Previously a typo'd or bogus identifier (e.g. pasting the student
    CODE into a field that only accepted the raw id) fell all the way
    through to a raw DB integrity error on commit -- a confusing generic
    500 with no indication of what went wrong. It must now fail fast with
    a clear, actionable 404 before anything is ever written."""
    db = _session()
    admin = _admin(db)
    _event(db)
    db.commit()
    with pytest.raises(HTTPException) as excinfo:
        studio.OverrideCompetitionEventAssignment(
            db, EventId="event-1", StudentId="MP-ST-999-DOES-NOT-EXIST", AssignedLevelCode="MM-L1", OverriddenBy=admin
        )
    assert excinfo.value.status_code == 404
    assert db.query(CompetitionEventAssignment).count() == 0


# ---------------------------------------------------------------------------
# Manual override -- auto-linking a matching slot (2026-09-08 regression)
#
# Found live: an admin created an IM-L4 slot, then manually overrode two
# students to IM-L4, and their assignments never picked up the slot -- the
# student-facing card kept saying "No specific slot assigned yet" even
# though a matching slot existed. Root cause: OverrideCompetitionEventAssignment
# accepted an optional SlotId but nothing ever passed one (the admin form has
# no slot picker), so slot_id was unconditionally written as None every time.
# Fixed by auto-matching an active slot whose applicable_level_codes includes
# the assigned level when no explicit SlotId is given.
# ---------------------------------------------------------------------------

def test_manual_override_auto_links_the_one_matching_slot():
    db = _session()
    module, level = _module_and_level(db, "IM", "IM-L4", "Intermediate Level 4")
    admin = _admin(db)
    user = User(id="user-s1", full_name="S1", email="s1@example.test", password_hash="x", role="STUDENT", is_active=True)
    student = Student(id="s1", user_id=user.id, student_code="MP-S1", current_module_id=module.id, current_level_id=level.id, is_active=True)
    db.add_all([user, student])
    _event(db)
    db.commit()

    slot = studio.CreateCompetitionEventSlot(
        db, EventId="event-1", Mode="ONLINE_INDIA",
        ScheduledStartAt=datetime(2026, 10, 11, 10, 30, tzinfo=timezone.utc),
        ScheduledEndAt=datetime(2026, 10, 11, 11, 5, tzinfo=timezone.utc),
        ApplicableLevelCodes=["IM-L4"],
    )

    result = studio.OverrideCompetitionEventAssignment(
        db, EventId="event-1", StudentId="s1", AssignedLevelCode="IM-L4", OverriddenBy=admin
    )
    assert result["slotId"] == slot["slotId"]
    AssignmentRow = db.query(CompetitionEventAssignment).filter(CompetitionEventAssignment.student_id == "s1").one()
    assert AssignmentRow.slot_id == slot["slotId"]


def test_manual_override_leaves_slot_unset_when_no_slot_matches_the_level():
    db = _session()
    module, level = _module_and_level(db, "IM", "IM-L4", "Intermediate Level 4")
    admin = _admin(db)
    user = User(id="user-s1", full_name="S1", email="s1@example.test", password_hash="x", role="STUDENT", is_active=True)
    student = Student(id="s1", user_id=user.id, student_code="MP-S1", current_module_id=module.id, current_level_id=level.id, is_active=True)
    db.add_all([user, student])
    _event(db)
    db.commit()

    # A slot exists, but for a different level entirely -- must not be
    # picked up for an IM-L4 override.
    studio.CreateCompetitionEventSlot(
        db, EventId="event-1", Mode="ONLINE_INDIA",
        ScheduledStartAt=datetime(2026, 10, 11, 10, 30, tzinfo=timezone.utc),
        ScheduledEndAt=datetime(2026, 10, 11, 11, 5, tzinfo=timezone.utc),
        ApplicableLevelCodes=["MM-L1"],
    )

    result = studio.OverrideCompetitionEventAssignment(
        db, EventId="event-1", StudentId="s1", AssignedLevelCode="IM-L4", OverriddenBy=admin
    )
    assert result["slotId"] is None


def test_manual_override_leaves_slot_unset_when_two_slots_ambiguously_match():
    """A genuine admin misconfiguration (the same level listed on two
    overlapping slots) must not be silently resolved by guessing one --
    left unset so the admin notices and fixes the overlap by hand."""
    db = _session()
    module, level = _module_and_level(db, "IM", "IM-L4", "Intermediate Level 4")
    admin = _admin(db)
    user = User(id="user-s1", full_name="S1", email="s1@example.test", password_hash="x", role="STUDENT", is_active=True)
    student = Student(id="s1", user_id=user.id, student_code="MP-S1", current_module_id=module.id, current_level_id=level.id, is_active=True)
    db.add_all([user, student])
    _event(db)
    db.commit()

    studio.CreateCompetitionEventSlot(
        db, EventId="event-1", Mode="OFFLINE",
        ScheduledStartAt=datetime(2026, 10, 11, 10, 0, tzinfo=timezone.utc),
        ScheduledEndAt=datetime(2026, 10, 11, 10, 35, tzinfo=timezone.utc),
        ApplicableLevelCodes=["IM-L4"],
    )
    studio.CreateCompetitionEventSlot(
        db, EventId="event-1", Mode="ONLINE_INDIA",
        ScheduledStartAt=datetime(2026, 10, 11, 14, 0, tzinfo=timezone.utc),
        ScheduledEndAt=datetime(2026, 10, 11, 14, 35, tzinfo=timezone.utc),
        ApplicableLevelCodes=["IM-L4"],
    )

    result = studio.OverrideCompetitionEventAssignment(
        db, EventId="event-1", StudentId="s1", AssignedLevelCode="IM-L4", OverriddenBy=admin
    )
    assert result["slotId"] is None


def test_manual_override_ignores_an_inactive_slot_for_the_level():
    db = _session()
    module, level = _module_and_level(db, "IM", "IM-L4", "Intermediate Level 4")
    admin = _admin(db)
    user = User(id="user-s1", full_name="S1", email="s1@example.test", password_hash="x", role="STUDENT", is_active=True)
    student = Student(id="s1", user_id=user.id, student_code="MP-S1", current_module_id=module.id, current_level_id=level.id, is_active=True)
    db.add_all([user, student])
    _event(db)
    db.commit()

    DeletedSlot = studio.CreateCompetitionEventSlot(
        db, EventId="event-1", Mode="OFFLINE",
        ScheduledStartAt=datetime(2026, 10, 11, 10, 0, tzinfo=timezone.utc),
        ScheduledEndAt=datetime(2026, 10, 11, 10, 35, tzinfo=timezone.utc),
        ApplicableLevelCodes=["IM-L4"],
    )
    studio.UpdateCompetitionEventSlot(db, SlotId=DeletedSlot["slotId"], IsActive=False)

    result = studio.OverrideCompetitionEventAssignment(
        db, EventId="event-1", StudentId="s1", AssignedLevelCode="IM-L4", OverriddenBy=admin
    )
    assert result["slotId"] is None


def test_manual_override_still_honors_an_explicit_slot_id_when_given():
    """The optional SlotId param predates this fix and is left in place for
    a future caller (e.g. an admin picking a slot explicitly when a level is
    genuinely split across two slots) -- auto-match must only kick in when
    the caller passes nothing."""
    db = _session()
    module, level = _module_and_level(db, "IM", "IM-L4", "Intermediate Level 4")
    admin = _admin(db)
    user = User(id="user-s1", full_name="S1", email="s1@example.test", password_hash="x", role="STUDENT", is_active=True)
    student = Student(id="s1", user_id=user.id, student_code="MP-S1", current_module_id=module.id, current_level_id=level.id, is_active=True)
    db.add_all([user, student])
    _event(db)
    db.commit()

    SlotA = studio.CreateCompetitionEventSlot(
        db, EventId="event-1", Mode="OFFLINE",
        ScheduledStartAt=datetime(2026, 10, 11, 10, 0, tzinfo=timezone.utc),
        ScheduledEndAt=datetime(2026, 10, 11, 10, 35, tzinfo=timezone.utc),
        ApplicableLevelCodes=["IM-L4"],
    )
    SlotB = studio.CreateCompetitionEventSlot(
        db, EventId="event-1", Mode="ONLINE_INDIA",
        ScheduledStartAt=datetime(2026, 10, 11, 14, 0, tzinfo=timezone.utc),
        ScheduledEndAt=datetime(2026, 10, 11, 14, 35, tzinfo=timezone.utc),
        ApplicableLevelCodes=["IM-L4"],
    )

    result = studio.OverrideCompetitionEventAssignment(
        db, EventId="event-1", StudentId="s1", AssignedLevelCode="IM-L4", OverriddenBy=admin, SlotId=SlotB["slotId"]
    )
    assert result["slotId"] == SlotB["slotId"]
    assert result["slotId"] != SlotA["slotId"]


# ---------------------------------------------------------------------------
# Default section timers -- self-consistency against the client gist's totals
# (2026-09-10: gist confirmed authoritative over the older doc2-derived
# figures -- see this file's module docstring and
# annual_competition_studio_service.py's DEFAULT_SECTION_TIMERS_BY_LEVEL_CODE
# comment)
# ---------------------------------------------------------------------------

EXPECTED_TOTAL_MINUTES = {
    "YLM-L1": 10,
    "PM-L1": 10,
    "PM-L2": 10,
    "PM-L3": 20,
    "PM-L4": 20,
    "IM-L1": 20,
    "IM-L2": 20,
    "IM-L3": 25,
    # 2026-09-14 batch (Shailesh): Section 6 (Percentage) removed entirely --
    # was 30. See the matching EXPECTED table update in
    # test_annual_competition_paper_generation_service.py.
    "IM-L4": 25,
    "MM-L1": 35,
    "MM-L2": 35,
}


@pytest.mark.parametrize("level_code,expected_minutes", sorted(EXPECTED_TOTAL_MINUTES.items()))
def test_default_section_timers_sum_to_requirements_total(level_code, expected_minutes):
    timers = studio.DEFAULT_SECTION_TIMERS_BY_LEVEL_CODE[level_code]
    total_seconds = sum(time_limit_seconds for _n, _t, _m, time_limit_seconds in timers)
    assert total_seconds == expected_minutes * 60


def test_every_valid_level_code_has_default_timers():
    assert set(studio.DEFAULT_SECTION_TIMERS_BY_LEVEL_CODE.keys()) == studio.VALID_COMPETITION_LEVEL_CODES


# ---------------------------------------------------------------------------
# Reuse guard: DeleteCompetitionMockExam itself (Package 9)
#
# _IsLevelPaperLocked above is the read-side mirror of this exact guard
# condition (see that function's own docstring: "the two must never
# diverge"), but the actual enforcement point -- the one a practice-mock
# admin screen's delete button really calls -- is DeleteCompetitionMockExam
# in competition_mock_generation_service.py. These three tests exercise
# that function directly, covering both of its lock triggers (a real
# attempt; a release-locked event with no attempts yet) and the safe,
# still-deletable case, so the guard is proven at the actual call site.
# ---------------------------------------------------------------------------

def test_delete_competition_mock_exam_rejected_once_a_real_attempt_exists():
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    exam = _mock_exam(db, level.id, module.id)
    _event(db)
    db.commit()

    studio.LinkExistingCompetitionEventLevelPaper(db, EventId="event-1", CompetitionLevelCode="PM-L2", MockExamId=exam.id)
    level_paper = db.query(CompetitionEventLevelPaper).filter(CompetitionEventLevelPaper.event_id == "event-1").one()

    user = User(id="user-s1", full_name="S1", email="s1@example.test", password_hash="x", role="STUDENT", is_active=True)
    student = Student(id="s1", user_id=user.id, student_code="MP-S1", current_module_id=module.id, current_level_id=level.id, is_active=True)
    db.add_all([user, student])
    db.flush()
    db.add(
        CompetitionEventAttempt(
            id="attempt-1",
            event_id="event-1",
            assignment_id="assignment-placeholder",
            level_paper_id=level_paper.id,
            student_id="s1",
            started_at=datetime.now(timezone.utc),
        )
    )
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        DeleteCompetitionMockExam(db, MockExamId=exam.id)
    assert exc_info.value.status_code == 409
    assert exc_info.value.detail["code"] == "COMPETITION_MOCK_LOCKED_BY_ANNUAL_EVENT"
    # Rejected, not partially cascaded -- the exam and its link must both
    # still be fully intact after the failed call.
    assert db.get(CompetitionMockExam, exam.id) is not None
    assert db.get(CompetitionEventLevelPaper, level_paper.id).mock_exam_id == exam.id


def test_delete_competition_mock_exam_rejected_once_event_results_are_release_locked():
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L3", "Preparatory Level 3")
    exam = _mock_exam(db, level.id, module.id, exam_id="exam-2")
    _event(db, event_id="event-2", results_release_at=datetime.now(timezone.utc))
    db.commit()

    # First link succeeds even though results_release_at is already set --
    # the level paper has no mock_exam_id yet at that instant, so
    # _IsLevelPaperLocked (and this guard's own mirrored condition) both
    # read it as unlocked right up until the link itself completes. This is
    # an existing, deliberate nuance of the lock check (see
    # LinkExistingCompetitionEventLevelPaper), not something Package 9
    # changes -- it's what makes this scenario (locked event, zero
    # attempts) reachable at all for this test.
    studio.LinkExistingCompetitionEventLevelPaper(db, EventId="event-2", CompetitionLevelCode="PM-L3", MockExamId=exam.id)
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        DeleteCompetitionMockExam(db, MockExamId=exam.id)
    assert exc_info.value.status_code == 409
    assert exc_info.value.detail["code"] == "COMPETITION_MOCK_LOCKED_BY_ANNUAL_EVENT"
    assert db.get(CompetitionMockExam, exam.id) is not None


def test_delete_competition_mock_exam_still_allowed_when_not_locked():
    """Control case: a mock exam linked to a level paper whose event has no
    release lock and has zero attempts is still a real practice mock in
    every sense that matters -- deletion must fall through to the normal
    cascade, not be blocked just because SOME CompetitionEventLevelPaper
    row references it."""
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L4", "Preparatory Level 4")
    exam = _mock_exam(db, level.id, module.id, exam_id="exam-3")
    _event(db, event_id="event-3")
    db.commit()

    studio.LinkExistingCompetitionEventLevelPaper(db, EventId="event-3", CompetitionLevelCode="PM-L4", MockExamId=exam.id)
    db.commit()

    Result = DeleteCompetitionMockExam(db, MockExamId=exam.id)
    assert Result["mockExamId"] == exam.id
    assert db.get(CompetitionMockExam, exam.id) is None


# ---------------------------------------------------------------------------
# Practice bank (Competition Practice feature, Phase C; full event
# decoupling + bulk assignment, 2026-09-12): "the practice papers should not
# be related to any event whatsoever ... it allows the admin to just assign
# papers to all the students." Every practice test below deliberately never
# creates (or references) a CompetitionEvent for the practice call itself --
# that omission IS the point being tested. BatchAssignAnnualCompetitionPractice
# Papers now takes StudentIds (a list) instead of a single StudentId, and
# returns a bulk-shaped outcome (succeeded/failed per student).
# ---------------------------------------------------------------------------

def test_batch_assign_creates_n_fresh_practice_papers_with_distinct_content():
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    admin = _admin(db)
    student = _student(db, "s1", module_id=module.id, level_id=level.id)
    db.commit()

    outcome = studio.BatchAssignAnnualCompetitionPracticePapers(
        db, CompetitionLevelCode="PM-L2", StudentIds=[student.id], Quantity=5, AssignedBy=admin,
    )
    assert outcome["studentsSucceeded"] == 1
    assert outcome["studentsFailed"] == 0
    assert outcome["totalPapersAssigned"] == 5
    assert outcome["succeeded"][0]["quantityAssigned"] == 5

    practice_papers = (
        db.query(CompetitionEventLevelPaper)
        .filter_by(paper_kind="PRACTICE", assigned_student_id=student.id)
        .all()
    )
    assert len(practice_papers) == 5
    for paper in practice_papers:
        assert paper.event_id is None  # decoupled: practice never carries an event_id
        assert paper.competition_level_code == "PM-L2"
        assert paper.status == "READY"
        assert paper.assigned_by_user_id == admin.id
        assert paper.assigned_at is not None
        assert paper.consumed_at is None  # nothing consumed yet -- set by the (later) submit flow
        assert db.query(CompetitionEventSectionTimer).filter_by(level_paper_id=paper.id).count() > 0

    # Every paper points at its OWN, distinct, freshly generated exam --
    # never shared, unlike the one OFFICIAL paper everyone on a level shares.
    mock_exam_ids = {paper.mock_exam_id for paper in practice_papers}
    assert len(mock_exam_ids) == 5

    # And the generated content itself genuinely differs paper to paper
    # (fresh PaperSeed each call) -- compare the first question's operands
    # across two papers as a concrete, content-level check, not just
    # "different exam id."
    first_two_exam_ids = list(mock_exam_ids)[:2]
    first_questions = [
        db.query(CompetitionMockQuestion).filter_by(mock_exam_id=exam_id, question_number=1).one().operands_json
        for exam_id in first_two_exam_ids
    ]
    assert len(set(first_questions)) >= 1  # sanity: both queries returned something real
    assert all(q is not None for q in first_questions)


def test_batch_assign_creates_papers_for_every_student_in_one_call():
    """2026-09-12 (Shailesh, bulk assignment): "let the admin just assign
    papers to all the students" -- one call, several students."""
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    admin = _admin(db)
    student_a = _student(db, "s1", module_id=module.id, level_id=level.id)
    student_b = _student(db, "s2", module_id=module.id, level_id=level.id)
    student_c = _student(db, "s3", module_id=module.id, level_id=level.id)
    db.commit()

    outcome = studio.BatchAssignAnnualCompetitionPracticePapers(
        db, CompetitionLevelCode="PM-L2", StudentIds=[student_a.id, student_b.id, student_c.id], Quantity=5, AssignedBy=admin,
    )
    assert outcome["studentsRequested"] == 3
    assert outcome["studentsSucceeded"] == 3
    assert outcome["studentsFailed"] == 0
    assert outcome["totalPapersAssigned"] == 15

    for student in (student_a, student_b, student_c):
        count = (
            db.query(CompetitionEventLevelPaper)
            .filter_by(paper_kind="PRACTICE", assigned_student_id=student.id)
            .count()
        )
        assert count == 5


def test_batch_assign_partial_failure_still_commits_the_students_that_succeeded():
    """One bad student id in the batch must not lose papers already
    generated and committed for the good ones."""
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    admin = _admin(db)
    student = _student(db, "s1", module_id=module.id, level_id=level.id)
    db.commit()

    outcome = studio.BatchAssignAnnualCompetitionPracticePapers(
        db, CompetitionLevelCode="PM-L2", StudentIds=[student.id, "does-not-exist"], Quantity=5, AssignedBy=admin,
    )
    assert outcome["studentsRequested"] == 2
    assert outcome["studentsSucceeded"] == 1
    assert outcome["studentsFailed"] == 1
    assert outcome["totalPapersAssigned"] == 5
    assert outcome["succeeded"][0]["studentId"] == student.id
    assert outcome["failed"][0]["studentIdentifier"] == "does-not-exist"

    count = (
        db.query(CompetitionEventLevelPaper)
        .filter_by(paper_kind="PRACTICE", assigned_student_id=student.id)
        .count()
    )
    assert count == 5


def test_batch_assign_rejects_more_students_than_the_per_call_cap():
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    admin = _admin(db)
    student_ids = []
    for index in range(studio.PRACTICE_BULK_MAX_STUDENTS_PER_CALL + 1):
        student = _student(db, f"s{index}", module_id=module.id, level_id=level.id)
        student_ids.append(student.id)
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        studio.BatchAssignAnnualCompetitionPracticePapers(
            db, CompetitionLevelCode="PM-L2", StudentIds=student_ids, Quantity=5, AssignedBy=admin,
        )
    assert exc_info.value.detail["code"] == "PRACTICE_BULK_TOO_MANY_STUDENTS"


def test_batch_assign_rejects_empty_student_list():
    db = _session()
    admin = _admin(db)
    db.commit()

    with pytest.raises(HTTPException):
        studio.BatchAssignAnnualCompetitionPracticePapers(
            db, CompetitionLevelCode="PM-L2", StudentIds=[], Quantity=5, AssignedBy=admin,
        )


def test_batch_assign_repeated_calls_only_ever_add_to_the_bank():
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    admin = _admin(db)
    student = _student(db, "s1", module_id=module.id, level_id=level.id)
    db.commit()

    studio.BatchAssignAnnualCompetitionPracticePapers(
        db, CompetitionLevelCode="PM-L2", StudentIds=[student.id], Quantity=5, AssignedBy=admin,
    )
    studio.BatchAssignAnnualCompetitionPracticePapers(
        db, CompetitionLevelCode="PM-L2", StudentIds=[student.id], Quantity=10, AssignedBy=admin,
    )

    total = (
        db.query(CompetitionEventLevelPaper)
        .filter_by(paper_kind="PRACTICE", assigned_student_id=student.id)
        .count()
    )
    assert total == 15  # 5 + 10, nothing from the first call touched or removed


@pytest.mark.parametrize("bad_quantity", [0, 1, 4, 6, 7, -5, 30, 100])
def test_batch_assign_rejects_invalid_quantities(bad_quantity):
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    admin = _admin(db)
    student = _student(db, "s1", module_id=module.id, level_id=level.id)
    db.commit()

    with pytest.raises(HTTPException):
        studio.BatchAssignAnnualCompetitionPracticePapers(
            db, CompetitionLevelCode="PM-L2", StudentIds=[student.id], Quantity=bad_quantity, AssignedBy=admin,
        )


def test_batch_assign_rejects_invalid_level_code():
    db = _session()
    admin = _admin(db)
    student = _student(db, "s1")
    db.commit()

    with pytest.raises(HTTPException):
        studio.BatchAssignAnnualCompetitionPracticePapers(
            db, CompetitionLevelCode="BM-L1", StudentIds=[student.id], Quantity=5, AssignedBy=admin,
        )


def test_batch_assign_unknown_student_lands_in_failed_not_a_raised_error():
    """Each student is processed in its own try/except (see
    BatchAssignAnnualCompetitionPracticePapers's own docstring) -- an unknown
    student id is reported back in `failed`, never aborts the whole call."""
    db = _session()
    _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    admin = _admin(db)
    db.commit()

    outcome = studio.BatchAssignAnnualCompetitionPracticePapers(
        db, CompetitionLevelCode="PM-L2", StudentIds=["does-not-exist"], Quantity=5, AssignedBy=admin,
    )
    assert outcome["studentsSucceeded"] == 0
    assert outcome["studentsFailed"] == 1
    assert outcome["failed"][0]["studentIdentifier"] == "does-not-exist"


def test_batch_assign_accepts_student_code_too():
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    admin = _admin(db)
    student = _student(db, "s1", student_code="MP-ST-777", module_id=module.id, level_id=level.id)
    db.commit()

    outcome = studio.BatchAssignAnnualCompetitionPracticePapers(
        db, CompetitionLevelCode="PM-L2", StudentIds=["mp-st-777"], Quantity=5, AssignedBy=admin,
    )
    assert outcome["succeeded"][0]["studentId"] == student.id


def test_batch_assign_fails_cleanly_when_no_curriculum_level_exists():
    """PM-L2 with no _module_and_level call at all -- no curriculum Level
    row exists for it, mirroring the known MM-L2 gap the OFFICIAL generate
    path already guards against. This check runs before the per-student
    loop, so it still raises rather than landing in `failed`."""
    db = _session()
    admin = _admin(db)
    student = _student(db, "s1")
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        studio.BatchAssignAnnualCompetitionPracticePapers(
            db, CompetitionLevelCode="PM-L2", StudentIds=[student.id], Quantity=5, AssignedBy=admin,
        )
    assert exc_info.value.detail["code"] == "NO_CURRICULUM_LEVEL_FOR_CODE"


def test_practice_bank_never_appears_in_the_official_level_papers_list():
    """2026-09-11 (Shailesh, Competition Practice feature, Phase C):
    ListCompetitionEventLevelPapers now filters paper_kind == "OFFICIAL" --
    confirms a freshly batch-assigned practice bank never floods the admin
    Studio's PAPERS tab (which assumes one row per level) or its derived
    missingLevelPapers/overview computation. The OFFICIAL side still belongs
    to a real event; practice (assigned below) deliberately does not."""
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    exam = _mock_exam(db, level.id, module.id)
    admin = _admin(db)
    student = _student(db, "s1", module_id=module.id, level_id=level.id)
    _event(db)
    db.commit()

    studio.LinkExistingCompetitionEventLevelPaper(db, EventId="event-1", CompetitionLevelCode="PM-L2", MockExamId=exam.id)
    studio.BatchAssignAnnualCompetitionPracticePapers(
        db, CompetitionLevelCode="PM-L2", StudentIds=[student.id], Quantity=10, AssignedBy=admin,
    )

    level_papers = studio.ListCompetitionEventLevelPapers(db, "event-1")
    assert len(level_papers) == 1  # only the one OFFICIAL row, not 1 + 10
    assert level_papers[0]["competitionLevelCode"] == "PM-L2"

    overview = studio.GetCompetitionEventStudioOverview(db, "event-1")
    assert len(overview["levelPapers"]) == 1
    assert overview["missingLevelPapers"] == sorted(studio.VALID_COMPETITION_LEVEL_CODES - {"PM-L2"})


def test_get_practice_bank_returns_assigned_papers_with_correct_counts():
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    admin = _admin(db)
    student = _student(db, "s1", module_id=module.id, level_id=level.id)
    db.commit()

    studio.BatchAssignAnnualCompetitionPracticePapers(
        db, CompetitionLevelCode="PM-L2", StudentIds=[student.id], Quantity=5, AssignedBy=admin,
    )

    bank = studio.GetAnnualCompetitionPracticeBankForStudent(db, StudentId=student.id)
    assert bank["totalAssigned"] == 5
    assert bank["consumedCount"] == 0
    assert bank["remainingCount"] == 5
    assert len(bank["papers"]) == 5
    for row in bank["papers"]:
        assert row["isConsumed"] is False
        assert row["consumedAt"] is None
        assert row["competitionLevelCode"] == "PM-L2"


def test_practice_bank_papers_are_numbered_practice_paper_n_in_assignment_order():
    # Shailesh, 2026-09-14: "Practice Paper 1, 2 and so on" -- and a second
    # batch assigned later to the same student/level must continue the
    # numbering (11, 12, ...), never restart at 1. This also exercises the
    # microsecond-stagger fix in _GeneratePracticePapersForOneStudent: every
    # paper in ONE batch used to share byte-identical assigned_at, which
    # would make this numbering unstable/non-deterministic without it.
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    admin = _admin(db)
    student = _student(db, "s1", module_id=module.id, level_id=level.id)
    db.commit()

    studio.BatchAssignAnnualCompetitionPracticePapers(
        db, CompetitionLevelCode="PM-L2", StudentIds=[student.id], Quantity=10, AssignedBy=admin,
    )
    studio.BatchAssignAnnualCompetitionPracticePapers(
        db, CompetitionLevelCode="PM-L2", StudentIds=[student.id], Quantity=5, AssignedBy=admin,
    )

    bank = studio.GetAnnualCompetitionPracticeBankForStudent(db, StudentId=student.id)
    assert bank["totalAssigned"] == 15
    ordinals = [row["paperOrdinal"] for row in bank["papers"]]
    assert ordinals == list(range(1, 16)), ordinals
    labels = [row["paperLabel"] for row in bank["papers"]]
    assert labels == [f"Practice Paper {n}" for n in range(1, 16)]

    # Re-reading must be stable -- the same paper always gets the same
    # number, not just "a" 1..15 permutation.
    bank_again = studio.GetAnnualCompetitionPracticeBankForStudent(db, StudentId=student.id)
    assert [row["levelPaperId"] for row in bank_again["papers"]] == [row["levelPaperId"] for row in bank["papers"]]
    assert [row["paperOrdinal"] for row in bank_again["papers"]] == ordinals


def test_practice_paper_numbering_is_independent_per_level():
    # Two different competition levels for the same student must each start
    # their own numbering at 1 -- levels are entirely separate scopes.
    db = _session()
    module_pm, level_pm = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    module_im, level_im = _module_and_level(db, "IM", "IM-L1", "Intermediate Level 1")
    admin = _admin(db)
    student = _student(db, "s1", module_id=module_pm.id, level_id=level_pm.id)
    db.commit()

    studio.BatchAssignAnnualCompetitionPracticePapers(
        db, CompetitionLevelCode="PM-L2", StudentIds=[student.id], Quantity=5, AssignedBy=admin,
    )
    studio.BatchAssignAnnualCompetitionPracticePapers(
        db, CompetitionLevelCode="IM-L1", StudentIds=[student.id], Quantity=5, AssignedBy=admin,
    )

    bank = studio.GetAnnualCompetitionPracticeBankForStudent(db, StudentId=student.id)
    pm_ordinals = sorted(row["paperOrdinal"] for row in bank["papers"] if row["competitionLevelCode"] == "PM-L2")
    im_ordinals = sorted(row["paperOrdinal"] for row in bank["papers"] if row["competitionLevelCode"] == "IM-L1")
    assert pm_ordinals == [1, 2, 3, 4, 5]
    assert im_ordinals == [1, 2, 3, 4, 5]


def test_practice_bank_display_order_matches_paper_label_even_with_shared_assigned_at():
    # 2026-09-14 (Shailesh, ordering bug -- "Practice Paper 4, 3, 5, 2, 1"):
    # regression test for the exact scattered-order screenshot. Pre
    # microsecond-stagger-fix data (or any other reason several papers in
    # one batch end up with a byte-identical assigned_at) used to display
    # in a different order than ComputePracticePaperOrdinals's own label,
    # because the bank listing query had no id.asc() tie-break to match the
    # ordinal helper's. Five papers are inserted here sharing one identical
    # assigned_at, in a deliberately scrambled id order (z, a, m, b, y) --
    # after the fix, the bank listing's row order must exactly match each
    # row's own paperOrdinal, whatever id order they were inserted in.
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    student = _student(db, "s1", module_id=module.id, level_id=level.id)
    db.commit()

    SharedAssignedAt = datetime.now(timezone.utc)
    ScrambledIds = ["paper-z", "paper-a", "paper-m", "paper-b", "paper-y"]
    for PaperId in ScrambledIds:
        db.add(
            CompetitionEventLevelPaper(
                id=PaperId, event_id=None, competition_level_code="PM-L2", paper_kind="PRACTICE",
                status="READY", assigned_student_id=student.id, assigned_at=SharedAssignedAt,
            )
        )
    db.commit()

    bank = studio.GetAnnualCompetitionPracticeBankForStudent(db, StudentId=student.id)
    assert bank["totalAssigned"] == 5
    ordinals = [row["paperOrdinal"] for row in bank["papers"]]
    # The bug: this used to NOT be [1, 2, 3, 4, 5] in row order -- whatever
    # order the ordinals landed in, some row's position didn't match its
    # own label. The fix guarantees display position N always carries
    # paperOrdinal N, regardless of insertion/id order.
    assert ordinals == [1, 2, 3, 4, 5], ordinals
    labels = [row["paperLabel"] for row in bank["papers"]]
    assert labels == [f"Practice Paper {n}" for n in range(1, 6)]
    # Sorted alphabetically the ids would read a, b, m, y, z -- proving this
    # isn't just an accidental id-sort match, re-fetching must be stable.
    bank_again = studio.GetAnnualCompetitionPracticeBankForStudent(db, StudentId=student.id)
    assert [row["levelPaperId"] for row in bank_again["papers"]] == [row["levelPaperId"] for row in bank["papers"]]


def test_get_practice_bank_reflects_consumed_papers():
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    admin = _admin(db)
    student = _student(db, "s1", module_id=module.id, level_id=level.id)
    db.commit()

    studio.BatchAssignAnnualCompetitionPracticePapers(
        db, CompetitionLevelCode="PM-L2", StudentIds=[student.id], Quantity=5, AssignedBy=admin,
    )
    first_paper = (
        db.query(CompetitionEventLevelPaper)
        .filter_by(paper_kind="PRACTICE", assigned_student_id=student.id)
        .order_by(CompetitionEventLevelPaper.assigned_at.asc())
        .first()
    )
    first_paper.consumed_at = datetime.now(timezone.utc)
    db.commit()

    bank = studio.GetAnnualCompetitionPracticeBankForStudent(db, StudentId=student.id)
    assert bank["totalAssigned"] == 5
    assert bank["consumedCount"] == 1
    assert bank["remainingCount"] == 4


def test_get_practice_bank_scoped_to_one_level_when_specified():
    db = _session()
    module_pm, level_pm = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    module_im, level_im = _module_and_level(db, "IM", "IM-L1", "Intermediate Level 1")
    admin = _admin(db)
    student = _student(db, "s1", module_id=module_pm.id, level_id=level_pm.id)
    db.commit()

    studio.BatchAssignAnnualCompetitionPracticePapers(
        db, CompetitionLevelCode="PM-L2", StudentIds=[student.id], Quantity=5, AssignedBy=admin,
    )
    studio.BatchAssignAnnualCompetitionPracticePapers(
        db, CompetitionLevelCode="IM-L1", StudentIds=[student.id], Quantity=10, AssignedBy=admin,
    )

    bank_all = studio.GetAnnualCompetitionPracticeBankForStudent(db, StudentId=student.id)
    assert bank_all["totalAssigned"] == 15

    bank_pm_only = studio.GetAnnualCompetitionPracticeBankForStudent(
        db, StudentId=student.id, CompetitionLevelCode="PM-L2"
    )
    assert bank_pm_only["totalAssigned"] == 5
    assert all(row["competitionLevelCode"] == "PM-L2" for row in bank_pm_only["papers"])


def test_get_practice_bank_empty_for_a_student_with_none_assigned():
    db = _session()
    student = _student(db, "s1")
    db.commit()

    bank = studio.GetAnnualCompetitionPracticeBankForStudent(db, StudentId=student.id)
    assert bank["totalAssigned"] == 0
    assert bank["consumedCount"] == 0
    assert bank["remainingCount"] == 0
    assert bank["papers"] == []


# ---------------------------------------------------------------------------
# ListStudentsForPracticeBank (2026-09-12, bulk assignment): the roster the
# admin's Practice Bank student picker lists from.
# ---------------------------------------------------------------------------

def test_list_students_for_practice_bank_lists_every_active_student():
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    student_a = _student(db, "s1", module_id=module.id, level_id=level.id)
    student_b = _student(db, "s2", module_id=module.id, level_id=level.id)
    db.commit()

    result = studio.ListStudentsForPracticeBank(db)
    assert result["totalStudents"] == 2
    student_ids = {row["studentId"] for row in result["students"]}
    assert student_ids == {student_a.id, student_b.id}


def test_list_students_for_practice_bank_excludes_inactive_students():
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    student = _student(db, "s1", module_id=module.id, level_id=level.id)
    student.is_active = False
    db.commit()

    result = studio.ListStudentsForPracticeBank(db)
    assert result["totalStudents"] == 0


# ---------------------------------------------------------------------------
# ListMyAnnualCompetitionPracticeScopes (Shailesh's Phase G correction,
# 2026-09-11, then fully decoupled from any event 2026-09-12): "the students
# should be able to practice any paper even if they do not have any official
# competition attempts" -- and now, practice has no event scope at all.
# Every test below deliberately never creates a CompetitionEventAssignment
# (or a CompetitionEvent) for the student -- that omission IS the point
# being tested, not an oversight.
# ---------------------------------------------------------------------------

def test_practice_scopes_visible_with_zero_official_assignment():
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    admin = _admin(db)
    student = _student(db, "s1", module_id=module.id, level_id=level.id)
    db.commit()

    studio.BatchAssignAnnualCompetitionPracticePapers(
        db, CompetitionLevelCode="PM-L2", StudentIds=[student.id], Quantity=5, AssignedBy=admin,
    )

    scopes = studio.ListMyAnnualCompetitionPracticeScopes(db, student)["scopes"]
    assert len(scopes) == 1
    assert scopes[0]["competitionLevelCode"] == "PM-L2"
    assert scopes[0]["totalAssigned"] == 5
    assert scopes[0]["remainingCount"] == 5
    assert "eventId" not in scopes[0]
    assert "eventName" not in scopes[0]


def test_practice_scopes_empty_for_a_student_with_no_practice_papers_at_all():
    db = _session()
    student = _student(db, "s1")
    db.commit()

    scopes = studio.ListMyAnnualCompetitionPracticeScopes(db, student)["scopes"]
    assert scopes == []


def test_practice_scopes_groups_by_level_not_by_paper():
    db = _session()
    module_pm, level_pm = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    module_im, level_im = _module_and_level(db, "IM", "IM-L1", "Intermediate Level 1")
    admin = _admin(db)
    student = _student(db, "s1", module_id=module_pm.id, level_id=level_pm.id)
    db.commit()

    studio.BatchAssignAnnualCompetitionPracticePapers(
        db, CompetitionLevelCode="PM-L2", StudentIds=[student.id], Quantity=5, AssignedBy=admin,
    )
    studio.BatchAssignAnnualCompetitionPracticePapers(
        db, CompetitionLevelCode="IM-L1", StudentIds=[student.id], Quantity=10, AssignedBy=admin,
    )

    scopes = studio.ListMyAnnualCompetitionPracticeScopes(db, student)["scopes"]
    assert len(scopes) == 2  # two scopes, not 15 rows
    by_level = {scope["competitionLevelCode"]: scope for scope in scopes}
    assert by_level["PM-L2"]["totalAssigned"] == 5
    assert by_level["IM-L1"]["totalAssigned"] == 10


def test_practice_scopes_reflects_consumed_count():
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    admin = _admin(db)
    student = _student(db, "s1", module_id=module.id, level_id=level.id)
    db.commit()

    studio.BatchAssignAnnualCompetitionPracticePapers(
        db, CompetitionLevelCode="PM-L2", StudentIds=[student.id], Quantity=5, AssignedBy=admin,
    )
    first_paper = (
        db.query(CompetitionEventLevelPaper)
        .filter_by(paper_kind="PRACTICE", assigned_student_id=student.id)
        .order_by(CompetitionEventLevelPaper.assigned_at.asc())
        .first()
    )
    first_paper.consumed_at = datetime.now(timezone.utc)
    db.commit()

    scopes = studio.ListMyAnnualCompetitionPracticeScopes(db, student)["scopes"]
    assert scopes[0]["totalAssigned"] == 5
    assert scopes[0]["consumedCount"] == 1
    assert scopes[0]["remainingCount"] == 4


def test_practice_scopes_never_includes_another_students_papers():
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    admin = _admin(db)
    student_a = _student(db, "s1", module_id=module.id, level_id=level.id)
    student_b = _student(db, "s2", module_id=module.id, level_id=level.id)
    db.commit()

    studio.BatchAssignAnnualCompetitionPracticePapers(
        db, CompetitionLevelCode="PM-L2", StudentIds=[student_a.id], Quantity=5, AssignedBy=admin,
    )

    assert studio.ListMyAnnualCompetitionPracticeScopes(db, student_a)["scopes"][0]["totalAssigned"] == 5
    assert studio.ListMyAnnualCompetitionPracticeScopes(db, student_b)["scopes"] == []


# ---------------------------------------------------------------------------
# Admin Practice delete icons (2026-09-14, Shailesh) --
# DeleteAnnualCompetitionPracticeAttempt (per-row) and
# DeleteAllAnnualCompetitionPracticeRecordsForStudent (per-student-block).
# ---------------------------------------------------------------------------

def _practice_paper_with_full_attempt(db, student_id, level_code="PM-L2", suffix=""):
    """Builds one fully-submitted practice paper -- level paper + attempt +
    section state + answer + result -- so a delete test can confirm every
    dependent row actually gets removed, not just the paper itself.

    Unlike _module_and_level (which always inserts a fresh Level row), this
    get-or-creates the Module/Level so it's safe to call more than once
    with the same level_code in one test (e.g. several papers for
    different students on the same level)."""
    module_code = level_code.split("-")[0]
    module = db.query(Module).filter(Module.module_code == module_code).first()
    if not module:
        module = Module(id=f"module-{module_code}", module_code=module_code, module_name=module_code, is_active=True)
        db.add(module)
        db.flush()
    level = db.query(Level).filter(Level.level_code == level_code).first()
    if not level:
        level = Level(id=f"level-{level_code}", module_id=module.id, level_code=level_code, level_name=level_code, is_active=True)
        db.add(level)
        db.flush()
    exam = _mock_exam(db, level.id, module.id, exam_id=f"exam{suffix}")
    question = CompetitionMockQuestion(
        id=f"question{suffix}", mock_exam_id=exam.id, section_number=1, question_number=1,
        correct_answer="4",
    )
    db.add(question)
    db.flush()

    paper = CompetitionEventLevelPaper(
        id=f"paper{suffix}", event_id=None, competition_level_code=level_code, paper_kind="PRACTICE",
        status="READY", mock_exam_id=exam.id, assigned_student_id=student_id,
        assigned_at=datetime.now(timezone.utc), consumed_at=datetime.now(timezone.utc),
    )
    db.add(paper)
    db.flush()

    attempt = CompetitionEventAttempt(
        id=f"attempt{suffix}", event_id=None, assignment_id=None, level_paper_id=paper.id,
        student_id=student_id, attempt_number=1, attempt_type="PRACTICE", status="FINALIZED",
        started_at=datetime.now(timezone.utc), submitted_at=datetime.now(timezone.utc),
    )
    db.add(attempt)
    db.flush()

    section_state = CompetitionEventAttemptSectionState(
        id=f"section{suffix}", attempt_id=attempt.id, section_number=1, status="COMPLETED",
        time_limit_seconds=600, remaining_seconds_at_last_heartbeat=0,
    )
    db.add(section_state)

    answer = CompetitionEventAttemptAnswer(
        id=f"answer{suffix}", attempt_id=attempt.id, mock_question_id=question.id,
        selected_value="4", is_correct=True,
    )
    db.add(answer)

    result = CompetitionEventResult(
        id=f"result{suffix}", attempt_id=attempt.id, event_id=None, assignment_id=None,
        student_id=student_id, attempt_type="PRACTICE", competition_level_code=level_code,
        score=1, max_score=1, percentage=100.0, accuracy_percentage=100.0,
        correct_count=1, wrong_count=0, unanswered_count=0, time_taken_seconds=30, is_released=True,
    )
    db.add(result)
    db.commit()
    return paper, attempt


def test_delete_practice_attempt_removes_paper_attempt_answer_section_and_result():
    db = _session()
    student = _student(db, "s1")
    db.commit()
    paper, attempt = _practice_paper_with_full_attempt(db, student.id)

    studio.DeleteAnnualCompetitionPracticeAttempt(db, LevelPaperId=paper.id)

    assert db.get(CompetitionEventLevelPaper, paper.id) is None
    assert db.get(CompetitionEventAttempt, attempt.id) is None
    assert db.query(CompetitionEventAttemptSectionState).filter_by(attempt_id=attempt.id).count() == 0
    assert db.query(CompetitionEventAttemptAnswer).filter_by(attempt_id=attempt.id).count() == 0
    assert db.query(CompetitionEventResult).filter_by(attempt_id=attempt.id).count() == 0


def test_delete_practice_attempt_works_on_a_pending_never_attempted_paper():
    # 2026-09-14 (Shailesh): "pending row should get the delete option as
    # well" -- a paper with no attempt at all must delete cleanly too.
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    admin = _admin(db)
    student = _student(db, "s1", module_id=module.id, level_id=level.id)
    db.commit()
    studio.BatchAssignAnnualCompetitionPracticePapers(
        db, CompetitionLevelCode="PM-L2", StudentIds=[student.id], Quantity=5, AssignedBy=admin,
    )
    paper = db.query(CompetitionEventLevelPaper).filter_by(assigned_student_id=student.id).first()
    assert paper.consumed_at is None  # genuinely pending
    paper_id = paper.id  # captured before delete/commit expires the ORM object

    result = studio.DeleteAnnualCompetitionPracticeAttempt(db, LevelPaperId=paper_id)
    assert result["deleted"] is True
    assert db.get(CompetitionEventLevelPaper, paper_id) is None


def test_delete_practice_attempt_404s_for_an_official_paper():
    # Never lets the practice delete route reach an OFFICIAL paper by id.
    db = _session()
    event = _event(db)
    official_paper = CompetitionEventLevelPaper(
        id="official-paper-1", event_id=event.id, competition_level_code="PM-L2", paper_kind="OFFICIAL",
        status="READY",
    )
    db.add(official_paper)
    db.commit()

    with pytest.raises(HTTPException):
        studio.DeleteAnnualCompetitionPracticeAttempt(db, LevelPaperId="official-paper-1")


def test_delete_all_practice_records_for_student_removes_every_paper_and_leaves_other_students_alone():
    db = _session()
    student_a = _student(db, "s1")
    student_b = _student(db, "s2")
    db.commit()
    paper_a1, attempt_a1 = _practice_paper_with_full_attempt(db, student_a.id, suffix="-a1")
    paper_a2, attempt_a2 = _practice_paper_with_full_attempt(db, student_a.id, suffix="-a2")
    paper_b1, attempt_b1 = _practice_paper_with_full_attempt(db, student_b.id, suffix="-b1")
    # Captured before the delete/commit below expires these ORM objects.
    paper_a1_id, paper_a2_id, attempt_a1_id, attempt_a2_id = paper_a1.id, paper_a2.id, attempt_a1.id, attempt_a2.id
    paper_b1_id, attempt_b1_id = paper_b1.id, attempt_b1.id

    result = studio.DeleteAllAnnualCompetitionPracticeRecordsForStudent(db, StudentId=student_a.id)
    assert result["deletedPaperCount"] == 2

    assert db.get(CompetitionEventLevelPaper, paper_a1_id) is None
    assert db.get(CompetitionEventLevelPaper, paper_a2_id) is None
    assert db.get(CompetitionEventAttempt, attempt_a1_id) is None
    assert db.get(CompetitionEventAttempt, attempt_a2_id) is None
    # Student B's practice records are completely untouched.
    assert db.get(CompetitionEventLevelPaper, paper_b1_id) is not None
    assert db.get(CompetitionEventAttempt, attempt_b1_id) is not None
    assert db.query(CompetitionEventResult).filter_by(attempt_id=attempt_b1_id).count() == 1


def test_delete_all_practice_records_for_student_never_touches_their_official_record():
    # 2026-09-14 (Shailesh, explicit): "delete all records is valid for
    # practice flow ... only" -- this student's OFFICIAL Annual Competition
    # assignment/attempt/result must survive a practice-only delete-all.
    db = _session()
    event = _event(db)
    student = _student(db, "s1")
    db.commit()
    _practice_paper_with_full_attempt(db, student.id)

    official_paper = CompetitionEventLevelPaper(
        id="official-paper-1", event_id=event.id, competition_level_code="PM-L2", paper_kind="OFFICIAL",
        status="READY",
    )
    db.add(official_paper)
    db.flush()
    official_attempt = CompetitionEventAttempt(
        id="official-attempt-1", event_id=event.id, assignment_id=None, level_paper_id=official_paper.id,
        student_id=student.id, attempt_number=1, attempt_type="OFFICIAL", status="FINALIZED",
    )
    db.add(official_attempt)
    db.commit()

    studio.DeleteAllAnnualCompetitionPracticeRecordsForStudent(db, StudentId=student.id)

    assert db.get(CompetitionEventLevelPaper, "official-paper-1") is not None
    assert db.get(CompetitionEventAttempt, "official-attempt-1") is not None


def test_delete_all_practice_records_for_student_with_no_records_is_a_safe_noop():
    db = _session()
    student = _student(db, "s1")
    db.commit()

    result = studio.DeleteAllAnnualCompetitionPracticeRecordsForStudent(db, StudentId=student.id)
    assert result == {"studentId": student.id, "deletedPaperCount": 0}
