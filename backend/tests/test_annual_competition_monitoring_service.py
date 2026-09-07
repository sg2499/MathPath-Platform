"""Package 7 (Teacher/Admin Monitoring) tests.

Covers the two concerns in annual_competition_monitoring_service.py:
live status derivation (NOT_STARTED/IN_PROGRESS/STUCK/FINALIZED, reusing
the exact same heartbeat-grace threshold Package 4's reconciliation sweep
already uses) and the roster-scoped, release-gated post-event results
review (mirroring Package 6's own release-gate tests, just applied across
a roster instead of a single student/attempt). Also a lightweight RBAC
check that every new teacher-facing route is a GET, per pkg-07 checklist
item 3 ("Teacher role has no write path here").
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import (
    CompetitionEvent,
    CompetitionEventAssignment,
    CompetitionEventAttempt,
    CompetitionEventAttemptSectionState,
    CompetitionEventLevelPaper,
    CompetitionEventResult,
    CompetitionEventSectionTimer,
    CompetitionEventSlot,
    CompetitionMockExam,
    Level,
    Module,
    Student,
    User,
)
from app.services import annual_competition_attempt_service as attempt_engine
from app.services import annual_competition_monitoring_service as engine


def _session():
    db_engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(db_engine)
    Session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    return Session()


def _user(db, uid, name="Test Student"):
    u = User(id=uid, full_name=name, email=f"{uid}@example.test", password_hash="x", role="STUDENT", is_active=True)
    db.add(u)
    return u


def _student(db, sid="student-1", class_name=None, section=None):
    u = _user(db, f"user-{sid}", name=sid)
    s = Student(id=sid, user_id=u.id, student_code=f"MP-{sid}", is_active=True, class_name=class_name, section=section)
    db.add(s)
    return s


def _event(db, event_id="event-1", status="SCHEDULED"):
    e = CompetitionEvent(
        id=event_id,
        name="Annual Competition 2026",
        status=status,
        competition_date=datetime.now(timezone.utc) + timedelta(days=10),
    )
    db.add(e)
    return e


def _slot(db, event_id, slot_id="slot-1", start_offset_hours=0):
    Start = datetime.now(timezone.utc) + timedelta(hours=start_offset_hours)
    s = CompetitionEventSlot(
        id=slot_id, event_id=event_id, mode="OFFLINE", slot_label=f"Slot {slot_id}",
        scheduled_start_at=Start, scheduled_end_at=Start + timedelta(hours=1),
    )
    db.add(s)
    db.flush()
    return s


def _module_and_level(db, module_code="PM", level_code="PM-L2", level_name="Preparatory Level 2"):
    m = db.query(Module).filter(Module.module_code == module_code).first()
    if not m:
        m = Module(id=f"module-{module_code}", module_code=module_code, module_name=module_code, is_active=True)
        db.add(m)
        db.flush()
    l = db.query(Level).filter(Level.module_id == m.id, Level.level_code == level_code).first()
    if not l:
        l = Level(id=f"level-{level_code}", module_id=m.id, level_code=level_code, level_name=level_name, is_active=True)
        db.add(l)
        db.flush()
    return m, l


def _mock_exam(db, level_id, module_id, exam_id="exam-1"):
    e = CompetitionMockExam(
        id=exam_id, title="Test Exam", module_id=module_id, level_id=level_id,
        total_questions=20, duration_seconds=1200, is_active=True,
    )
    db.add(e)
    db.flush()
    return e


def _assignment(db, event_id, student_id, assigned_level_code, assignment_id="assign-1", slot_id=None):
    a = CompetitionEventAssignment(
        id=assignment_id, event_id=event_id, student_id=student_id,
        assigned_level_code=assigned_level_code, assignment_source="AUTO", is_active=True, slot_id=slot_id,
    )
    db.add(a)
    db.flush()
    return a


def _level_paper_with_timers(db, event_id, level_code, mock_exam_id, section_seconds, level_paper_id="paper-1"):
    # (event_id, competition_level_code) is unique -- when two students on
    # the same event share a level_code (the "shared paper" case), reuse
    # the existing level paper instead of trying to insert a second one,
    # same existence-check pattern test_annual_competition_scoring_service.py
    # already uses for its own shared-paper ranking tests.
    p = (
        db.query(CompetitionEventLevelPaper)
        .filter(CompetitionEventLevelPaper.event_id == event_id, CompetitionEventLevelPaper.competition_level_code == level_code)
        .first()
    )
    if p:
        return p
    p = CompetitionEventLevelPaper(
        id=level_paper_id, event_id=event_id, competition_level_code=level_code,
        mock_exam_id=mock_exam_id, status="READY",
    )
    db.add(p)
    db.flush()
    for i, seconds in enumerate(section_seconds, start=1):
        t = CompetitionEventSectionTimer(
            id=f"{level_paper_id}-timer-{i}", level_paper_id=p.id, section_number=i,
            section_title=f"Section {i}", mode="MIXED", time_limit_seconds=seconds, display_order=i,
        )
        db.add(t)
    db.flush()
    return p


def _full_setup(db, sid="student-1", section_seconds=(600,), level_code="PM-L2", event_id="event-1", slot_id=None, assignment_id="assign-1"):
    """Wires one student assigned to a level paper, ready to start an
    attempt. Returns (student, event)."""
    student = _student(db, sid=sid)
    event = db.get(CompetitionEvent, event_id) or _event(db, event_id=event_id)
    m, l = _module_and_level(db, level_code=level_code)
    exam = _mock_exam(db, l.id, m.id, exam_id=f"exam-{assignment_id}")
    _assignment(db, event.id, student.id, level_code, assignment_id=assignment_id, slot_id=slot_id)
    _level_paper_with_timers(db, event.id, level_code, exam.id, list(section_seconds), level_paper_id=f"paper-{assignment_id}")
    db.commit()
    return student, event


# ---------------------------------------------------------------------------
# Live status derivation
# ---------------------------------------------------------------------------

def test_not_started_when_no_attempt_exists():
    db = _session()
    student, event = _full_setup(db)

    result = engine.GetAnnualCompetitionLiveMonitoring(db, EventId=event.id)

    assert result["summary"]["totalCount"] == 1
    row = result["rows"][0]
    assert row["liveStatus"] == "NOT_STARTED"
    assert row["attemptId"] is None
    assert result["summary"]["notStartedCount"] == 1
    assert result["summary"]["stuckCount"] == 0


def test_in_progress_with_fresh_heartbeat():
    db = _session()
    student, event = _full_setup(db, section_seconds=(600,))
    attempt_engine.StartCompetitionEventAttempt(db, student, event.id)

    result = engine.GetAnnualCompetitionLiveMonitoring(db, EventId=event.id)

    row = result["rows"][0]
    assert row["liveStatus"] == "IN_PROGRESS"
    assert row["currentSectionNumber"] == 1
    assert row["remainingSecondsAtLastHeartbeat"] == 600
    assert row["heartbeatGapSeconds"] is not None and row["heartbeatGapSeconds"] < attempt_engine.HEARTBEAT_GRACE_SECONDS
    assert result["summary"]["inProgressCount"] == 1


def test_stuck_when_heartbeat_gap_exceeds_grace_window():
    db = _session()
    student, event = _full_setup(db, section_seconds=(600,))
    started = attempt_engine.StartCompetitionEventAttempt(db, student, event.id)

    section = (
        db.query(CompetitionEventAttemptSectionState)
        .filter_by(attempt_id=started["attemptId"], section_number=1)
        .first()
    )
    # Same threshold ReconcileExpiredCompetitionEventAttempts uses to decide
    # "currently paused" -- comfortably past it.
    section.last_heartbeat_at = datetime.now(timezone.utc) - timedelta(hours=1)
    db.commit()

    result = engine.GetAnnualCompetitionLiveMonitoring(db, EventId=event.id)

    row = result["rows"][0]
    assert row["liveStatus"] == "STUCK"
    assert row["heartbeatGapSeconds"] > attempt_engine.HEARTBEAT_GRACE_SECONDS
    assert result["summary"]["stuckCount"] == 1
    assert result["summary"]["inProgressCount"] == 0


def test_finalized_status_reflected_after_real_submit():
    db = _session()
    student, event = _full_setup(db, section_seconds=(600,))
    started = attempt_engine.StartCompetitionEventAttempt(db, student, event.id)
    attempt_engine.SubmitCompetitionEventSection(db, student, started["attemptId"], started["sessionToken"], 1)

    result = engine.GetAnnualCompetitionLiveMonitoring(db, EventId=event.id)

    row = result["rows"][0]
    # Package 6's hook takes every last-section close straight to FINALIZED
    # -- see test_annual_competition_attempt_service.py's own updated
    # assertions. Confirms the live view reads that, not a stale SUBMITTED.
    assert row["liveStatus"] == "FINALIZED"
    assert row["attemptStatus"] == "FINALIZED"
    assert result["summary"]["finalizedCount"] == 1


def test_submitted_status_mapped_correctly_if_ever_persisted():
    """SUBMITTED is a real, documented point in the lifecycle
    (NOT_STARTED -> IN_PROGRESS -> SUBMITTED -> FINALIZED) even though
    today's only write path collapses straight through it to FINALIZED in
    the same transaction. Constructs the row directly to prove the
    monitoring mapper itself still handles it correctly, independent of
    whether any current caller can produce it."""
    db = _session()
    student, event = _full_setup(db, section_seconds=(600,))
    attempt = CompetitionEventAttempt(
        id="attempt-submitted", event_id=event.id, assignment_id="assign-1", level_paper_id="paper-assign-1",
        student_id=student.id, attempt_number=1, status="SUBMITTED", started_at=datetime.now(timezone.utc),
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(attempt)
    db.commit()

    result = engine.GetAnnualCompetitionLiveMonitoring(db, EventId=event.id)

    row = result["rows"][0]
    assert row["liveStatus"] == "SUBMITTED"


# ---------------------------------------------------------------------------
# Roster scoping (teacher view) + slot filter
# ---------------------------------------------------------------------------

def test_roster_scoping_empty_list_returns_empty_without_querying_everyone():
    db = _session()
    student, event = _full_setup(db)

    result = engine.GetAnnualCompetitionLiveMonitoring(db, EventId=event.id, StudentIdsFilter=[])

    assert result["summary"]["totalCount"] == 0
    assert result["rows"] == []


def test_roster_scoping_filters_to_given_students_only():
    db = _session()
    student_a, event = _full_setup(db, sid="student-a", assignment_id="assign-a")
    student_b, _ = _full_setup(db, sid="student-b", assignment_id="assign-b", event_id=event.id)

    result = engine.GetAnnualCompetitionLiveMonitoring(db, EventId=event.id, StudentIdsFilter=[student_a.id])

    assert result["summary"]["totalCount"] == 1
    assert result["rows"][0]["studentId"] == student_a.id


def test_admin_view_sees_every_student_when_filter_is_none():
    db = _session()
    student_a, event = _full_setup(db, sid="student-a", assignment_id="assign-a")
    student_b, _ = _full_setup(db, sid="student-b", assignment_id="assign-b", event_id=event.id)

    result = engine.GetAnnualCompetitionLiveMonitoring(db, EventId=event.id, StudentIdsFilter=None)

    assert result["summary"]["totalCount"] == 2


def test_slot_filter_scopes_to_one_slot():
    db = _session()
    event = _event(db)
    db.flush()
    slot_1 = _slot(db, event.id, slot_id="slot-1", start_offset_hours=1)
    slot_2 = _slot(db, event.id, slot_id="slot-2", start_offset_hours=2)
    student_a, _ = _full_setup(db, sid="student-a", assignment_id="assign-a", event_id=event.id, slot_id=slot_1.id)
    student_b, _ = _full_setup(db, sid="student-b", assignment_id="assign-b", event_id=event.id, slot_id=slot_2.id)

    result = engine.GetAnnualCompetitionLiveMonitoring(db, EventId=event.id, SlotId=slot_1.id)

    assert result["summary"]["totalCount"] == 1
    assert result["rows"][0]["studentId"] == student_a.id
    assert result["rows"][0]["slot"]["slotId"] == slot_1.id


# ---------------------------------------------------------------------------
# Post-event review: release gate, roster-scoped
# ---------------------------------------------------------------------------

def _finalized_attempt_with_result(db, student, event, assignment_id, *, is_released, rank=None, level_paper_id=None):
    attempt = CompetitionEventAttempt(
        id=f"attempt-{assignment_id}", event_id=event.id, assignment_id=assignment_id,
        level_paper_id=level_paper_id or f"paper-{assignment_id}", student_id=student.id, attempt_number=1,
        status="FINALIZED", started_at=datetime.now(timezone.utc), submitted_at=datetime.now(timezone.utc),
    )
    db.add(attempt)
    db.flush()
    result = CompetitionEventResult(
        id=f"result-{assignment_id}", attempt_id=attempt.id, event_id=event.id, assignment_id=assignment_id,
        student_id=student.id, competition_level_code="PM-L2", score=18, max_score=20, percentage=90,
        accuracy_percentage=90, correct_count=18, wrong_count=2, unanswered_count=0, time_taken_seconds=500,
        rank=rank, is_released=is_released, released_at=datetime.now(timezone.utc) if is_released else None,
    )
    db.add(result)
    db.commit()
    return attempt, result


def test_roster_results_hide_metrics_until_released():
    db = _session()
    student, event = _full_setup(db)
    _finalized_attempt_with_result(db, student, event, "assign-1", is_released=False)

    result = engine.ListAnnualCompetitionResultsForRoster(db, EventId=event.id, StudentIdsFilter=[student.id])

    row = result["rows"][0]
    assert row["released"] is False
    assert row["result"] is None


def test_roster_results_show_full_metrics_once_released():
    db = _session()
    student, event = _full_setup(db)
    _finalized_attempt_with_result(db, student, event, "assign-1", is_released=True, rank=1)

    result = engine.ListAnnualCompetitionResultsForRoster(db, EventId=event.id, StudentIdsFilter=[student.id])

    row = result["rows"][0]
    assert row["released"] is True
    assert row["result"]["rank"] == 1
    assert row["result"]["accuracyPercentage"] == 90


def test_roster_results_not_started_student_has_no_result():
    db = _session()
    student, event = _full_setup(db)

    result = engine.ListAnnualCompetitionResultsForRoster(db, EventId=event.id, StudentIdsFilter=[student.id])

    row = result["rows"][0]
    assert row["released"] is False
    assert row["result"] is None
    assert row["attemptStatus"] == "NOT_STARTED"


def test_roster_results_empty_filter_short_circuits():
    db = _session()
    student, event = _full_setup(db)

    result = engine.ListAnnualCompetitionResultsForRoster(db, EventId=event.id, StudentIdsFilter=[])

    assert result["totalResults"] == 0
    assert result["rows"] == []


# ---------------------------------------------------------------------------
# Event picker
# ---------------------------------------------------------------------------

def test_non_draft_events_excludes_draft():
    db = _session()
    _event(db, event_id="draft-event", status="DRAFT")
    _event(db, event_id="scheduled-event", status="SCHEDULED")
    db.commit()

    result = engine.ListNonDraftAnnualCompetitionEvents(db)

    event_ids = {e["eventId"] for e in result["events"]}
    assert "scheduled-event" in event_ids
    assert "draft-event" not in event_ids


# ---------------------------------------------------------------------------
# RBAC: teacher routes are read-only (pkg-07 checklist item 3)
# ---------------------------------------------------------------------------

def test_teacher_annual_competition_routes_are_all_get_only():
    from app.api.routes_teacher import router as teacher_router

    annual_routes = [r for r in teacher_router.routes if "/competition/annual" in getattr(r, "path", "")]
    assert len(annual_routes) == 3, "expected exactly the 3 new pkg-07 teacher routes"
    for route in annual_routes:
        assert route.methods == {"GET"}, f"{route.path} must be GET-only -- teacher has no write path here"
