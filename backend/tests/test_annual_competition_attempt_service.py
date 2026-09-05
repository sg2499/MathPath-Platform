"""Package 4 (Section-Timer + Pause Engine) tests.

Everything here runs against synthetic attempts only -- no student UI
involved, per pkg-04-section-timer-engine.md's own scope. Covers the
heartbeat/grace-window mechanic (both directions: under grace -> full
real deduction, over grace -> capped deduction), the single-active-
session guard, section auto-advance + whole-attempt finalization, the
lazy "any touching request self-corrects" pattern, and the reconciliation
sweep (including that it leaves a currently-live attempt alone and is
idempotent).
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import (
    CompetitionEvent,
    CompetitionEventAssignment,
    CompetitionEventAttempt,
    CompetitionEventAttemptSectionState,
    CompetitionEventLevelPaper,
    CompetitionEventSectionTimer,
    CompetitionMockExam,
    Level,
    Module,
    Student,
    User,
)
from app.services import annual_competition_attempt_service as engine


def _session():
    db_engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(db_engine)
    Session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    return Session()


def _user(db, uid, name="Test Student"):
    u = User(id=uid, full_name=name, email=f"{uid}@example.test", password_hash="x", role="STUDENT", is_active=True)
    db.add(u)
    return u


def _student(db, sid="student-1"):
    u = _user(db, f"user-{sid}", name=sid)
    s = Student(id=sid, user_id=u.id, student_code=f"MP-{sid}", is_active=True)
    db.add(s)
    return s


def _event(db, event_id="event-1"):
    e = CompetitionEvent(
        id=event_id,
        name="Annual Competition 2026",
        status="SCHEDULED",
        competition_date=datetime.now(timezone.utc) + timedelta(days=10),
    )
    db.add(e)
    return e


def _module_and_level(db, module_code="PM", level_code="PM-L2", level_name="Preparatory Level 2"):
    m = db.query(Module).filter(Module.module_code == module_code).first()
    if not m:
        m = Module(id=f"module-{module_code}", module_code=module_code, module_name=module_code, is_active=True)
        db.add(m)
        db.flush()
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


def _assignment(db, event_id, student_id, assigned_level_code, assignment_id="assign-1"):
    a = CompetitionEventAssignment(
        id=assignment_id, event_id=event_id, student_id=student_id,
        assigned_level_code=assigned_level_code, assignment_source="AUTO", is_active=True,
    )
    db.add(a)
    db.flush()
    return a


def _level_paper_with_timers(db, event_id, level_code, mock_exam_id, section_seconds, level_paper_id="paper-1"):
    """section_seconds: list of time_limit_seconds, one per section (1-indexed)."""
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


def _full_setup(db, section_seconds=(600,), level_code="PM-L2"):
    """Wires a student assigned to a one-or-more-section level paper, ready
    to start an attempt. Returns (student, event)."""
    student = _student(db)
    event = _event(db)
    m, l = _module_and_level(db, level_code=level_code)
    exam = _mock_exam(db, l.id, m.id)
    _assignment(db, event.id, student.id, level_code)
    _level_paper_with_timers(db, event.id, level_code, exam.id, list(section_seconds))
    db.commit()
    return student, event


# ---------------------------------------------------------------------------
# Start / resume
# ---------------------------------------------------------------------------

def test_start_creates_attempt_and_activates_first_section():
    db = _session()
    student, event = _full_setup(db, section_seconds=(600, 300))

    result = engine.StartCompetitionEventAttempt(db, student, event.id)

    assert result["status"] == "IN_PROGRESS"
    assert result["currentSectionNumber"] == 1
    assert result["sessionToken"]
    assert len(result["sections"]) == 2
    section_1 = result["sections"][0]
    assert section_1["status"] == "ACTIVE"
    assert section_1["remainingSeconds"] == 600
    section_2 = result["sections"][1]
    assert section_2["status"] == "PENDING"
    assert section_2["remainingSeconds"] is None


def test_start_without_assignment_is_404():
    db = _session()
    student = _student(db)
    event = _event(db)
    db.commit()
    with pytest.raises(HTTPException):
        engine.StartCompetitionEventAttempt(db, student, event.id)


def test_start_without_ready_level_paper_is_400():
    db = _session()
    student = _student(db)
    event = _event(db)
    _assignment(db, event.id, student.id, "PM-L2")
    db.commit()
    with pytest.raises(HTTPException):
        engine.StartCompetitionEventAttempt(db, student, event.id)


def test_start_again_while_in_progress_resumes_and_reissues_token():
    db = _session()
    student, event = _full_setup(db)

    first = engine.StartCompetitionEventAttempt(db, student, event.id)
    second = engine.StartCompetitionEventAttempt(db, student, event.id)

    assert first["attemptId"] == second["attemptId"]
    assert first["sessionToken"] != second["sessionToken"]

    # The old token is now stale for mutating calls.
    with pytest.raises(HTTPException):
        engine.RecordCompetitionEventHeartbeat(db, student, first["attemptId"], first["sessionToken"], 1)

    # The new one still works.
    heartbeat = engine.RecordCompetitionEventHeartbeat(db, student, second["attemptId"], second["sessionToken"], 1)
    assert heartbeat["status"] == "IN_PROGRESS"


def test_start_after_submitted_is_rejected():
    db = _session()
    student, event = _full_setup(db, section_seconds=(600,))
    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    engine.SubmitCompetitionEventSection(db, student, started["attemptId"], started["sessionToken"], 1)

    with pytest.raises(HTTPException):
        engine.StartCompetitionEventAttempt(db, student, event.id)


def test_ownership_is_enforced_on_get():
    db = _session()
    student, event = _full_setup(db)
    other_student = _student(db, sid="student-2")
    db.commit()
    started = engine.StartCompetitionEventAttempt(db, student, event.id)

    with pytest.raises(HTTPException):
        engine.GetCompetitionEventAttemptForStudent(db, other_student, started["attemptId"])


# ---------------------------------------------------------------------------
# Heartbeat / grace window
# ---------------------------------------------------------------------------

def test_heartbeat_gap_under_grace_window_deducts_real_elapsed_time():
    db = _session()
    student, event = _full_setup(db, section_seconds=(600,))
    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    attempt_id, token = started["attemptId"], started["sessionToken"]

    # Back-date the last heartbeat by 10s -- well under the 45s grace window.
    section = db.query(CompetitionEventAttemptSectionState).filter_by(attempt_id=attempt_id, section_number=1).first()
    section.last_heartbeat_at = datetime.now(timezone.utc) - timedelta(seconds=10)
    db.commit()

    result = engine.RecordCompetitionEventHeartbeat(db, student, attempt_id, token, 1)
    remaining = result["sections"][0]["remainingSeconds"]
    # Exactly the real gap should be deducted -- no more, no less.
    assert 588 <= remaining <= 591


def test_heartbeat_gap_over_grace_window_caps_deduction():
    db = _session()
    student, event = _full_setup(db, section_seconds=(600,))
    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    attempt_id, token = started["attemptId"], started["sessionToken"]

    # Simulate a real 10-minute disconnect.
    section = db.query(CompetitionEventAttemptSectionState).filter_by(attempt_id=attempt_id, section_number=1).first()
    section.last_heartbeat_at = datetime.now(timezone.utc) - timedelta(minutes=10)
    db.commit()

    result = engine.RecordCompetitionEventHeartbeat(db, student, attempt_id, token, 1)
    remaining = result["sections"][0]["remainingSeconds"]
    # Only the grace window's worth should be charged, never the full 600s gap.
    assert remaining == 600 - engine.HEARTBEAT_GRACE_SECONDS


def test_heartbeat_with_stale_session_token_is_rejected():
    db = _session()
    student, event = _full_setup(db)
    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    with pytest.raises(HTTPException):
        engine.RecordCompetitionEventHeartbeat(db, student, started["attemptId"], "not-the-real-token", 1)


def test_heartbeat_for_wrong_section_number_is_rejected():
    db = _session()
    student, event = _full_setup(db, section_seconds=(600, 300))
    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    with pytest.raises(HTTPException):
        engine.RecordCompetitionEventHeartbeat(db, student, started["attemptId"], started["sessionToken"], 2)


# ---------------------------------------------------------------------------
# Auto-advance + finalization
# ---------------------------------------------------------------------------

def test_section_auto_advances_at_exactly_zero_remaining():
    db = _session()
    student, event = _full_setup(db, section_seconds=(600, 300))
    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    attempt_id, token = started["attemptId"], started["sessionToken"]

    section = db.query(CompetitionEventAttemptSectionState).filter_by(attempt_id=attempt_id, section_number=1).first()
    section.remaining_seconds_at_last_heartbeat = 5
    section.last_heartbeat_at = datetime.now(timezone.utc) - timedelta(seconds=5)
    db.commit()

    result = engine.RecordCompetitionEventHeartbeat(db, student, attempt_id, token, 1)
    assert result["status"] == "IN_PROGRESS"
    assert result["currentSectionNumber"] == 2
    assert result["sections"][0]["status"] == "AUTO_SUBMITTED"
    assert result["sections"][0]["remainingSeconds"] == 0
    assert result["sections"][1]["status"] == "ACTIVE"
    assert result["sections"][1]["remainingSeconds"] == 300


def test_whole_attempt_finalizes_on_last_section_timeout():
    db = _session()
    student, event = _full_setup(db, section_seconds=(600,))
    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    attempt_id, token = started["attemptId"], started["sessionToken"]

    section = db.query(CompetitionEventAttemptSectionState).filter_by(attempt_id=attempt_id, section_number=1).first()
    section.remaining_seconds_at_last_heartbeat = 2
    section.last_heartbeat_at = datetime.now(timezone.utc) - timedelta(seconds=2)
    db.commit()

    result = engine.RecordCompetitionEventHeartbeat(db, student, attempt_id, token, 1)
    # FINALIZED, not just SUBMITTED: Package 6's scoring hook now runs
    # synchronously in the same _AdvanceOrFinalize call that closes the
    # last section -- see annual_competition_scoring_service.py.
    assert result["status"] == "FINALIZED"
    assert result["submittedAt"] is not None
    assert result["sections"][0]["status"] == "AUTO_SUBMITTED"


def test_manual_submit_section_advances_early_as_completed_not_auto():
    db = _session()
    student, event = _full_setup(db, section_seconds=(600, 300))
    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    attempt_id, token = started["attemptId"], started["sessionToken"]

    result = engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 1)
    assert result["sections"][0]["status"] == "COMPLETED"
    assert result["currentSectionNumber"] == 2
    assert result["sections"][1]["status"] == "ACTIVE"


def test_manual_submit_section_finalizes_whole_attempt_on_last_section():
    db = _session()
    student, event = _full_setup(db, section_seconds=(600,))
    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    result = engine.SubmitCompetitionEventSection(db, student, started["attemptId"], started["sessionToken"], 1)
    # FINALIZED, not just SUBMITTED -- see the timeout variant of this test
    # above for why.
    assert result["status"] == "FINALIZED"
    assert result["sections"][0]["status"] == "COMPLETED"


def test_get_attempt_lazily_self_corrects_without_a_heartbeat():
    """The plan's 'any request touching an attempt' check -- a plain read
    must also notice and apply an already-earned advance/finalize, not
    just the heartbeat/submit endpoints."""
    db = _session()
    student, event = _full_setup(db, section_seconds=(600, 300))
    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    attempt_id = started["attemptId"]

    section = db.query(CompetitionEventAttemptSectionState).filter_by(attempt_id=attempt_id, section_number=1).first()
    section.remaining_seconds_at_last_heartbeat = 0
    db.commit()

    result = engine.GetCompetitionEventAttemptForStudent(db, student, attempt_id)
    assert result["currentSectionNumber"] == 2
    assert result["sections"][0]["status"] == "AUTO_SUBMITTED"


# ---------------------------------------------------------------------------
# Reconciliation sweep
# ---------------------------------------------------------------------------

def test_reconciliation_leaves_a_live_heartbeating_attempt_alone():
    db = _session()
    student, event = _full_setup(db, section_seconds=(600,))
    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    attempt_id = started["attemptId"]

    section = db.query(CompetitionEventAttemptSectionState).filter_by(attempt_id=attempt_id, section_number=1).first()
    section.last_heartbeat_at = datetime.now(timezone.utc) - timedelta(seconds=5)  # well under grace
    db.commit()

    result = engine.ReconcileExpiredCompetitionEventAttempts(db)
    assert result["reconciledCount"] == 0

    db.refresh(section)
    assert section.status == "ACTIVE"


def test_reconciliation_force_closes_an_abandoned_attempt_through_all_sections():
    db = _session()
    student, event = _full_setup(db, section_seconds=(600, 300))
    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    attempt_id = started["attemptId"]

    section = db.query(CompetitionEventAttemptSectionState).filter_by(attempt_id=attempt_id, section_number=1).first()
    section.last_heartbeat_at = datetime.now(timezone.utc) - timedelta(hours=3)  # long abandoned
    db.commit()

    result = engine.ReconcileExpiredCompetitionEventAttempts(db)
    assert result["reconciledCount"] == 1
    assert attempt_id in result["attemptIds"]

    attempt = db.get(CompetitionEventAttempt, attempt_id)
    # FINALIZED, not just SUBMITTED -- the reconciliation sweep shares the
    # same _AdvanceOrFinalize call as every other path to a last-section
    # close, so it also triggers Package 6's scoring hook.
    assert attempt.status == "FINALIZED"
    sections = db.query(CompetitionEventAttemptSectionState).filter_by(attempt_id=attempt_id).order_by(
        CompetitionEventAttemptSectionState.section_number
    ).all()
    assert sections[0].status == "AUTO_SUBMITTED"
    assert sections[1].status == "AUTO_SUBMITTED"


def test_reconciliation_is_idempotent():
    db = _session()
    student, event = _full_setup(db, section_seconds=(600,))
    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    attempt_id = started["attemptId"]

    section = db.query(CompetitionEventAttemptSectionState).filter_by(attempt_id=attempt_id, section_number=1).first()
    section.last_heartbeat_at = datetime.now(timezone.utc) - timedelta(hours=1)
    db.commit()

    first = engine.ReconcileExpiredCompetitionEventAttempts(db)
    second = engine.ReconcileExpiredCompetitionEventAttempts(db)
    assert first["reconciledCount"] == 1
    assert second["reconciledCount"] == 0


# ---------------------------------------------------------------------------
# Retry grants (REQUIREMENTS.md item 6 -- admin "technical issue" override)
# ---------------------------------------------------------------------------

def _admin_user(db, uid="admin-1"):
    u = User(id=uid, full_name="Admin User", email=f"{uid}@example.test", password_hash="x", role="ADMIN", is_active=True)
    db.add(u)
    db.commit()
    return u


def test_grant_retry_rejected_while_attempt_still_in_progress():
    db = _session()
    student, event = _full_setup(db, section_seconds=(600,))
    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    admin = _admin_user(db)

    with pytest.raises(HTTPException):
        engine.GrantAnnualCompetitionAttemptRetry(db, AttemptId=started["attemptId"], GrantedBy=admin, Reason="Server crashed mid-section.")


def test_grant_retry_requires_a_non_blank_reason():
    db = _session()
    student, event = _full_setup(db, section_seconds=(600,))
    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    engine.SubmitCompetitionEventSection(db, student, started["attemptId"], started["sessionToken"], 1)
    admin = _admin_user(db)

    with pytest.raises(HTTPException):
        engine.GrantAnnualCompetitionAttemptRetry(db, AttemptId=started["attemptId"], GrantedBy=admin, Reason="   ")


def test_grant_retry_against_unknown_attempt_is_404():
    db = _session()
    _full_setup(db)
    admin = _admin_user(db)

    with pytest.raises(HTTPException):
        engine.GrantAnnualCompetitionAttemptRetry(db, AttemptId="does-not-exist", GrantedBy=admin, Reason="Any reason.")


def test_start_after_submitted_still_rejected_without_a_grant():
    """Unchanged existing behavior: the single-attempt rule stays absolute
    when no admin retry grant exists -- this is the exact scenario
    test_start_after_submitted_is_rejected above already covers; repeated
    here under the retry-grant section for clarity that adding grants
    never weakens the default-rejected path."""
    db = _session()
    student, event = _full_setup(db, section_seconds=(600,))
    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    engine.SubmitCompetitionEventSection(db, student, started["attemptId"], started["sessionToken"], 1)

    with pytest.raises(HTTPException):
        engine.StartCompetitionEventAttempt(db, student, event.id)


def test_granted_retry_lets_start_create_a_second_attempt():
    db = _session()
    student, event = _full_setup(db, section_seconds=(600,))
    first = engine.StartCompetitionEventAttempt(db, student, event.id)
    engine.SubmitCompetitionEventSection(db, student, first["attemptId"], first["sessionToken"], 1)
    admin = _admin_user(db)

    grant = engine.GrantAnnualCompetitionAttemptRetry(
        db, AttemptId=first["attemptId"], GrantedBy=admin, Reason="Laptop died during the exam window."
    )
    assert grant["status"] == "APPROVED"
    assert grant["usedAt"] is None

    second = engine.StartCompetitionEventAttempt(db, student, event.id)
    assert second["attemptId"] != first["attemptId"]
    assert second["status"] == "IN_PROGRESS"
    assert second["sections"][0]["status"] == "ACTIVE"

    old_attempt = db.get(CompetitionEventAttempt, first["attemptId"])
    new_attempt = db.get(CompetitionEventAttempt, second["attemptId"])
    assert old_attempt.attempt_number == 1
    assert new_attempt.attempt_number == 2
    # The old, already-scored attempt is left completely untouched.
    assert old_attempt.status == "FINALIZED"

    grants = engine.ListAnnualCompetitionAttemptRetryGrants(db, EventId=event.id)["grants"]
    assert len(grants) == 1
    assert grants[0]["status"] == "USED"
    assert grants[0]["usedAttemptId"] == second["attemptId"]


def test_granted_retry_is_consumed_and_not_reusable_for_a_third_attempt():
    db = _session()
    student, event = _full_setup(db, section_seconds=(600,))
    first = engine.StartCompetitionEventAttempt(db, student, event.id)
    engine.SubmitCompetitionEventSection(db, student, first["attemptId"], first["sessionToken"], 1)
    admin = _admin_user(db)
    engine.GrantAnnualCompetitionAttemptRetry(db, AttemptId=first["attemptId"], GrantedBy=admin, Reason="Technical issue.")
    second = engine.StartCompetitionEventAttempt(db, student, event.id)
    engine.SubmitCompetitionEventSection(db, student, second["attemptId"], second["sessionToken"], 1)

    # The grant was consumed by the second attempt -- a third start with no
    # new grant is rejected exactly like the very first rejection.
    with pytest.raises(HTTPException):
        engine.StartCompetitionEventAttempt(db, student, event.id)


def test_cannot_grant_a_second_retry_while_one_is_still_unused():
    db = _session()
    student, event = _full_setup(db, section_seconds=(600,))
    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    engine.SubmitCompetitionEventSection(db, student, started["attemptId"], started["sessionToken"], 1)
    admin = _admin_user(db)

    engine.GrantAnnualCompetitionAttemptRetry(db, AttemptId=started["attemptId"], GrantedBy=admin, Reason="First technical issue.")

    with pytest.raises(HTTPException):
        engine.GrantAnnualCompetitionAttemptRetry(db, AttemptId=started["attemptId"], GrantedBy=admin, Reason="Second reason.")
