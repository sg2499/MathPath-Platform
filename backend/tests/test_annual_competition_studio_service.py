"""Package 3 (Admin Annual Competition Studio) tests.

Covers event/slot CRUD and validation, the level-paper link/status/lock
lifecycle, the slot-vs-section-timer duration conflict check (REQUIREMENTS.md
item 7), the manual assignment override path, and that
DEFAULT_SECTION_TIMERS_BY_LEVEL_CODE's minutes sum to exactly what
REQUIREMENTS.md documents for every level.

Note on scope: GenerateAndLinkCompetitionEventLevelPaper's happy path calls
the existing, separately-and-already-well-tested GenerateCompetitionMockDraft
(competition_mock_generation_service.py), which needs a full realistic
curriculum seed (lessons/DPS/question config) to run end to end -- that
generation logic itself is not this package's code and is not re-tested
here. What IS this package's code -- level-code validation, the "no
curriculum Level for this code yet" error (MM-L2), default section-timer
seeding, status transitions, and the immutability guard -- is exercised
directly via LinkExistingCompetitionEventLevelPaper, which shares every one
of those code paths with the generate path except the actual generation
call.
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
    CompetitionEventLevelPaper,
    CompetitionEventSlot,
    CompetitionMockExam,
    Level,
    Module,
    Student,
    User,
)
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


def test_known_slot_duration_conflict_is_flagged_im4_mm2():
    """REQUIREMENTS.md item 7: the published 2:00-2:30 PM slot (30 min) is
    too short for IM-4 (35 min) and MM-2 (40 min). This must show up as a
    computed conflict, not just a comment somewhere."""
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
    assert "IM-L4" in conflicted_levels  # needs 35 min, slot is 30
    assert "MM-L2" in conflicted_levels  # needs 40 min, slot is 30
    assert "MM-L1" not in conflicted_levels  # needs exactly 30 min -- fits


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
    assert len(result["sectionTimers"]) == 2  # Abacus 15 + Visual 15
    assert result["totalSectionSeconds"] == 30 * 60


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


def test_generate_for_mm_l2_fails_cleanly_no_curriculum_level():
    """MM-L2 has no seeded Level row on this platform yet (Package 2
    finding) -- generation must fail with a clear, specific error, not a
    stack trace or a silent wrong-level fallback."""
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


# ---------------------------------------------------------------------------
# Default section timers -- self-consistency against REQUIREMENTS.md totals
# ---------------------------------------------------------------------------

EXPECTED_TOTAL_MINUTES = {
    "YLM-L1": 20,
    "PM-L1": 20,
    "PM-L2": 30,
    "PM-L3": 30,
    "PM-L4": 30,
    "IM-L1": 30,
    "IM-L2": 30,
    "IM-L3": 30,
    "IM-L4": 35,
    "MM-L1": 30,
    "MM-L2": 40,
}


@pytest.mark.parametrize("level_code,expected_minutes", sorted(EXPECTED_TOTAL_MINUTES.items()))
def test_default_section_timers_sum_to_requirements_total(level_code, expected_minutes):
    timers = studio.DEFAULT_SECTION_TIMERS_BY_LEVEL_CODE[level_code]
    total_seconds = sum(time_limit_seconds for _n, _t, _m, time_limit_seconds in timers)
    assert total_seconds == expected_minutes * 60


def test_every_valid_level_code_has_default_timers():
    assert set(studio.DEFAULT_SECTION_TIMERS_BY_LEVEL_CODE.keys()) == studio.VALID_COMPETITION_LEVEL_CODES
