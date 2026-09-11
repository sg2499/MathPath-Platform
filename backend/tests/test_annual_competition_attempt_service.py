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


def _level_paper_with_timers(db, event_id, level_code, mock_exam_id, section_seconds, level_paper_id="paper-1", paper_kind="OFFICIAL"):
    """section_seconds: list of time_limit_seconds, one per section (1-indexed)."""
    p = CompetitionEventLevelPaper(
        id=level_paper_id, event_id=event_id, competition_level_code=level_code,
        mock_exam_id=mock_exam_id, status="READY", paper_kind=paper_kind,
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


def test_start_payload_includes_competition_level_code():
    """2026-09-11 (Shailesh, Competition Practice feature, Phase G):
    regression test for the _AttemptPayload fix -- every attempt payload
    (OFFICIAL here, PRACTICE in test_practice_start_payload_includes_
    competition_level_code below) must expose competitionLevelCode so a
    client can resume a PRACTICE attempt (StartAnnualCompetitionPractice
    Attempt requires the level code even to resume) without an extra
    round trip. Also checked via a plain get (not just start) to confirm
    _AttemptPayload's lookup is exercised on every code path that funnels
    through it, not just attempt creation."""
    db = _session()
    student, event = _full_setup(db, section_seconds=(600,), level_code="PM-L2")

    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    assert started["competitionLevelCode"] == "PM-L2"

    fetched = engine.GetCompetitionEventAttemptForStudent(db, student, started["attemptId"])
    assert fetched["competitionLevelCode"] == "PM-L2"


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


def test_start_resolves_to_official_paper_even_when_a_practice_bank_paper_exists():
    """2026-09-11 (Shailesh, Competition Practice feature, Phase B):
    _BuildFreshAttempt's level-paper lookup now filters paper_kind ==
    "OFFICIAL" -- confirms a coexisting PRACTICE-kind bank paper for the
    exact same event+level (deliberately given a different, shorter
    section duration here) is never picked up for an OFFICIAL attempt."""
    db = _session()
    student, event = _full_setup(db, section_seconds=(600,), level_code="PM-L2")  # OFFICIAL: 600s section
    level = db.query(Level).filter_by(level_code="PM-L2").one()
    module = db.query(Module).filter_by(module_code="PM").one()
    practice_exam = _mock_exam(db, level.id, module.id, exam_id="practice-exam-1")
    _level_paper_with_timers(
        db, event.id, "PM-L2", practice_exam.id, [60], level_paper_id="practice-paper-1", paper_kind="PRACTICE",
    )
    db.commit()

    started = engine.StartCompetitionEventAttempt(db, student, event.id)

    attempt = db.get(CompetitionEventAttempt, started["attemptId"])
    official_paper = db.query(CompetitionEventLevelPaper).filter_by(event_id=event.id, paper_kind="OFFICIAL").one()
    assert attempt.level_paper_id == official_paper.id
    assert attempt.level_paper_id != "practice-paper-1"
    active_section = db.query(CompetitionEventAttemptSectionState).filter_by(attempt_id=attempt.id, section_number=1).one()
    assert active_section.time_limit_seconds == 600  # the OFFICIAL section duration, not practice's 60


# ---------------------------------------------------------------------------
# Suspension (Package 10 go-live rollback plan) -- emergency stop for the
# whole student-facing attempt flow on one event. See SuspendCompetitionEvent's
# own docstring in annual_competition_studio_service.py for the full design
# rationale; these tests exercise the guard from the attempt-engine side,
# toggling CompetitionEvent.attempts_suspended_at directly (matching this
# file's own stated scope of running against synthetic attempts only,
# without pulling in the studio service).
# ---------------------------------------------------------------------------

def test_start_rejected_when_event_suspended():
    db = _session()
    student, event = _full_setup(db)
    event.attempts_suspended_at = datetime.now(timezone.utc)
    event.suspension_reason = "Wrong paper linked, investigating."
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        engine.StartCompetitionEventAttempt(db, student, event.id)
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["code"] == "COMPETITION_EVENT_SUSPENDED"


def test_resume_also_rejected_when_event_suspended_after_start():
    """The kill switch blocks BOTH a brand new attempt and resuming an
    existing one -- Start/Resume share the same function, so suspending
    mid-event also stops a student reloading their page from getting back
    in, matching the explicit design choice for this package."""
    db = _session()
    student, event = _full_setup(db, section_seconds=(600, 300))
    first = engine.StartCompetitionEventAttempt(db, student, event.id)
    assert first["status"] == "IN_PROGRESS"

    event.attempts_suspended_at = datetime.now(timezone.utc)
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        engine.StartCompetitionEventAttempt(db, student, event.id)
    assert exc_info.value.detail["code"] == "COMPETITION_EVENT_SUSPENDED"


def test_instructions_screen_also_blocked_when_suspended():
    db = _session()
    student, event = _full_setup(db)
    event.attempts_suspended_at = datetime.now(timezone.utc)
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        engine.GetCompetitionEventInstructions(db, student, event.id)
    assert exc_info.value.detail["code"] == "COMPETITION_EVENT_SUSPENDED"


def test_start_works_again_once_suspension_lifted():
    db = _session()
    student, event = _full_setup(db)
    event.attempts_suspended_at = datetime.now(timezone.utc)
    db.commit()

    with pytest.raises(HTTPException):
        engine.StartCompetitionEventAttempt(db, student, event.id)

    event.attempts_suspended_at = None
    db.commit()

    result = engine.StartCompetitionEventAttempt(db, student, event.id)
    assert result["status"] == "IN_PROGRESS"


def test_heartbeat_on_an_already_active_session_is_not_blocked_by_suspension():
    """Deliberately confirms the scope boundary documented on
    _CheckEventNotSuspended: a suspension takes effect the next time a
    student's client calls Start, not mid-heartbeat for a session that's
    already resumed and live -- nothing already in flight is torn down by
    a suspension raised after the student is already on the attempt screen."""
    db = _session()
    student, event = _full_setup(db, section_seconds=(600,))
    started = engine.StartCompetitionEventAttempt(db, student, event.id)

    event.attempts_suspended_at = datetime.now(timezone.utc)
    db.commit()

    result = engine.RecordCompetitionEventHeartbeat(db, student, started["attemptId"], started["sessionToken"], 1)
    assert result["status"] == "IN_PROGRESS"


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

    result = engine.ReconcileExpiredCompetitionEventAttempts(db, EventId=event.id)
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

    result = engine.ReconcileExpiredCompetitionEventAttempts(db, EventId=event.id)
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

    first = engine.ReconcileExpiredCompetitionEventAttempts(db, EventId=event.id)
    second = engine.ReconcileExpiredCompetitionEventAttempts(db, EventId=event.id)
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


def test_list_assignments_hides_retry_grant_before_it_is_granted():
    """Baseline for the two tests below: hasActiveRetryGrant is false for a
    freshly-submitted attempt with no grant at all."""
    db = _session()
    student, event = _full_setup(db, section_seconds=(600,))
    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    engine.SubmitCompetitionEventSection(db, student, started["attemptId"], started["sessionToken"], 1)

    assignments = engine.ListMyAnnualCompetitionAssignments(db, student)["assignments"]
    assert assignments[0]["latestAttemptStatus"] == "FINALIZED"
    assert assignments[0]["hasActiveRetryGrant"] is False


def test_list_assignments_surfaces_retry_grant_on_the_student_portal():
    """Root-cause fix (Shailesh, 2026-09-09): "granting retry does not
    reflect the retry attempt on the student portal in the annual
    competition tab." Before this fix, _AssignmentWithAttemptPayload had no
    way to express "a retry exists" -- latestAttemptStatus stayed FINALIZED
    forever, which the frontend rendered as a dead-end "Submitted" card
    with no button. Granting a retry must flip hasActiveRetryGrant to true
    for that assignment WITHOUT changing latestAttemptStatus itself (the
    old attempt really is still finalized -- only the grant is new)."""
    db = _session()
    student, event = _full_setup(db, section_seconds=(600,))
    first = engine.StartCompetitionEventAttempt(db, student, event.id)
    engine.SubmitCompetitionEventSection(db, student, first["attemptId"], first["sessionToken"], 1)
    admin = _admin_user(db)

    engine.GrantAnnualCompetitionAttemptRetry(
        db, AttemptId=first["attemptId"], GrantedBy=admin, Reason="Laptop died during the exam window."
    )

    assignments = engine.ListMyAnnualCompetitionAssignments(db, student)["assignments"]
    assert assignments[0]["latestAttemptStatus"] == "FINALIZED"
    assert assignments[0]["hasActiveRetryGrant"] is True

    # Once the grant is actually used (the retry attempt starts), it must
    # stop showing as an available grant -- otherwise the student would
    # see "Retry Granted" indefinitely even while already mid-retry.
    engine.StartCompetitionEventAttempt(db, student, event.id)
    assignments_after_start = engine.ListMyAnnualCompetitionAssignments(db, student)["assignments"]
    assert assignments_after_start[0]["latestAttemptStatus"] == "IN_PROGRESS"
    assert assignments_after_start[0]["hasActiveRetryGrant"] is False


def test_instructions_reflect_retry_grant_with_accurate_copy():
    """Same root cause, the instructions screen's half: once a retry is
    reachable again, its static "you get one attempt" copy would be
    actively wrong for a retry-granted student -- isRetry must be true and
    the instructions list must say so instead."""
    db = _session()
    student, event = _full_setup(db, section_seconds=(600,))
    first = engine.StartCompetitionEventAttempt(db, student, event.id)
    engine.SubmitCompetitionEventSection(db, student, first["attemptId"], first["sessionToken"], 1)
    admin = _admin_user(db)
    engine.GrantAnnualCompetitionAttemptRetry(
        db, AttemptId=first["attemptId"], GrantedBy=admin, Reason="Laptop died during the exam window."
    )

    instructions = engine.GetCompetitionEventInstructions(db, student, event.id)
    assert instructions["isRetry"] is True
    assert any("retry" in line.lower() for line in instructions["instructions"])
    assert not any(line == "You get one attempt at this competition." for line in instructions["instructions"])


def test_instructions_show_default_copy_with_no_retry_grant():
    db = _session()
    student, event = _full_setup(db, section_seconds=(600,))

    instructions = engine.GetCompetitionEventInstructions(db, student, event.id)
    assert instructions["isRetry"] is False
    assert "You get one attempt at this competition." in instructions["instructions"]


def test_instructions_resolve_to_official_paper_even_when_a_practice_bank_paper_exists():
    """Same paper_kind == "OFFICIAL" guard as _BuildFreshAttempt's own,
    applied to the pre-attempt instructions screen (see that function's
    identical lookup in GetCompetitionEventInstructions)."""
    db = _session()
    student, event = _full_setup(db, section_seconds=(600,), level_code="PM-L2")  # OFFICIAL: 600s section
    level = db.query(Level).filter_by(level_code="PM-L2").one()
    module = db.query(Module).filter_by(module_code="PM").one()
    practice_exam = _mock_exam(db, level.id, module.id, exam_id="practice-exam-1")
    _level_paper_with_timers(
        db, event.id, "PM-L2", practice_exam.id, [60], level_paper_id="practice-paper-1", paper_kind="PRACTICE",
    )
    db.commit()

    instructions = engine.GetCompetitionEventInstructions(db, student, event.id)
    assert instructions["sections"][0]["timeLimitSeconds"] == 600  # OFFICIAL, not practice's 60


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


# ---------------------------------------------------------------------------
# Competition Practice (Phase D) -- StartAnnualCompetitionPracticeAttempt's
# own start/resume flow, and the shared mid-attempt engine's zero-change
# reuse for a PRACTICE attempt. See _BuildFreshPracticeAttempt's and
# StartAnnualCompetitionPracticeAttempt's own docstrings in
# annual_competition_attempt_service.py for the full design rationale --
# no assignment, no slot, never blocked by event-COMPLETED, no-retake
# enforced by construction (a consumed bank paper is simply never
# returned again) rather than a separate runtime check.
# ---------------------------------------------------------------------------

def _practice_bank_paper(db, event_id, level_code, mock_exam_id, section_seconds, student_id, level_paper_id="practice-paper-1", assigned_at=None):
    """Practice sibling of _level_paper_with_timers above: paper_kind
    "PRACTICE", assigned to one specific student, consumed_at left NULL
    (unconsumed -- eligible for the bank query)."""
    p = CompetitionEventLevelPaper(
        id=level_paper_id, event_id=event_id, competition_level_code=level_code,
        mock_exam_id=mock_exam_id, status="READY", paper_kind="PRACTICE",
        assigned_student_id=student_id, assigned_at=assigned_at or datetime.now(timezone.utc),
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


def test_practice_start_pulls_oldest_unconsumed_bank_paper():
    db = _session()
    student = _student(db)
    event = _event(db)
    m, l = _module_and_level(db, level_code="PM-L2")
    exam_old = _mock_exam(db, l.id, m.id, exam_id="exam-old")
    exam_new = _mock_exam(db, l.id, m.id, exam_id="exam-new")
    _practice_bank_paper(
        db, event.id, "PM-L2", exam_old.id, [300], student.id,
        level_paper_id="practice-old", assigned_at=datetime.now(timezone.utc) - timedelta(days=1),
    )
    _practice_bank_paper(
        db, event.id, "PM-L2", exam_new.id, [300], student.id,
        level_paper_id="practice-new", assigned_at=datetime.now(timezone.utc),
    )
    db.commit()

    result = engine.StartAnnualCompetitionPracticeAttempt(db, student, event.id, "PM-L2")

    attempt = db.get(CompetitionEventAttempt, result["attemptId"])
    assert attempt.level_paper_id == "practice-old"


def test_practice_start_creates_attempt_with_correct_shape():
    db = _session()
    student = _student(db)
    event = _event(db)
    m, l = _module_and_level(db, level_code="PM-L2")
    exam = _mock_exam(db, l.id, m.id, exam_id="exam-practice")
    _practice_bank_paper(db, event.id, "PM-L2", exam.id, [300, 180], student.id)
    db.commit()

    result = engine.StartAnnualCompetitionPracticeAttempt(db, student, event.id, "PM-L2")

    assert result["attemptType"] == "PRACTICE"
    assert result["status"] == "IN_PROGRESS"
    assert result["currentSectionNumber"] == 1
    assert result["sessionToken"]
    assert len(result["sections"]) == 2
    assert result["sections"][0]["status"] == "ACTIVE"
    assert result["sections"][0]["remainingSeconds"] == 300
    assert result["sections"][1]["status"] == "PENDING"

    attempt = db.get(CompetitionEventAttempt, result["attemptId"])
    assert attempt.assignment_id is None
    assert attempt.attempt_number == 1


def test_practice_start_payload_includes_competition_level_code():
    """2026-09-11 (Shailesh, Competition Practice feature, Phase G): the
    PRACTICE counterpart of test_start_payload_includes_competition_level_
    code above -- this is the case that actually matters, since
    StartAnnualCompetitionPracticeAttempt requires CompetitionLevelCode as
    an argument even to resume, so the client needs this field back from
    the very first PRACTICE payload it ever sees."""
    db = _session()
    student = _student(db)
    event = _event(db)
    m, l = _module_and_level(db, level_code="PM-L2")
    exam = _mock_exam(db, l.id, m.id, exam_id="exam-practice-code-check")
    _practice_bank_paper(db, event.id, "PM-L2", exam.id, [300], student.id)
    db.commit()

    result = engine.StartAnnualCompetitionPracticeAttempt(db, student, event.id, "PM-L2")
    assert result["competitionLevelCode"] == "PM-L2"

    fetched = engine.GetCompetitionEventAttemptForStudent(db, student, result["attemptId"])
    assert fetched["competitionLevelCode"] == "PM-L2"


def test_practice_start_resumes_in_progress_attempt_instead_of_pulling_new_paper():
    db = _session()
    student = _student(db)
    event = _event(db)
    m, l = _module_and_level(db, level_code="PM-L2")
    exam_1 = _mock_exam(db, l.id, m.id, exam_id="exam-1")
    exam_2 = _mock_exam(db, l.id, m.id, exam_id="exam-2")
    _practice_bank_paper(db, event.id, "PM-L2", exam_1.id, [300], student.id, level_paper_id="practice-1")
    _practice_bank_paper(
        db, event.id, "PM-L2", exam_2.id, [300], student.id,
        level_paper_id="practice-2", assigned_at=datetime.now(timezone.utc) + timedelta(minutes=1),
    )
    db.commit()

    first = engine.StartAnnualCompetitionPracticeAttempt(db, student, event.id, "PM-L2")
    second = engine.StartAnnualCompetitionPracticeAttempt(db, student, event.id, "PM-L2")

    assert first["attemptId"] == second["attemptId"]
    assert first["sessionToken"] != second["sessionToken"]

    # The old token is stale now, same "resume here" remediation OFFICIAL uses.
    with pytest.raises(HTTPException):
        engine.RecordCompetitionEventHeartbeat(db, student, first["attemptId"], first["sessionToken"], 1)

    # The second (newer) bank paper was never touched by any of this.
    still_unused = db.get(CompetitionEventLevelPaper, "practice-2")
    assert still_unused.consumed_at is None
    assert db.query(CompetitionEventAttempt).filter_by(level_paper_id="practice-2").count() == 0


def test_practice_start_empty_bank_is_404():
    db = _session()
    student = _student(db)
    event = _event(db)
    _module_and_level(db, level_code="PM-L2")
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        engine.StartAnnualCompetitionPracticeAttempt(db, student, event.id, "PM-L2")
    assert exc_info.value.status_code == 404
    assert exc_info.value.detail["code"] == "COMPETITION_PRACTICE_BANK_EMPTY"


def test_practice_start_unknown_event_is_404():
    db = _session()
    student = _student(db)
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        engine.StartAnnualCompetitionPracticeAttempt(db, student, "does-not-exist", "PM-L2")
    assert exc_info.value.status_code == 404
    assert exc_info.value.detail["code"] == "COMPETITION_EVENT_NOT_FOUND"


def test_practice_start_rejected_when_event_suspended():
    db = _session()
    student = _student(db)
    event = _event(db)
    m, l = _module_and_level(db, level_code="PM-L2")
    exam = _mock_exam(db, l.id, m.id)
    _practice_bank_paper(db, event.id, "PM-L2", exam.id, [300], student.id)
    event.attempts_suspended_at = datetime.now(timezone.utc)
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        engine.StartAnnualCompetitionPracticeAttempt(db, student, event.id, "PM-L2")
    assert exc_info.value.detail["code"] == "COMPETITION_EVENT_SUSPENDED"


def test_practice_start_allowed_even_when_event_completed():
    """The key official/practice differentiator this phase's design turns
    on: _CheckEventNotCompleted is deliberately never called from
    StartAnnualCompetitionPracticeAttempt (Shailesh: "the students can
    attempt the practice papers anytime") -- unlike OFFICIAL's own
    StartCompetitionEventAttempt, which _CheckEventNotCompleted actively
    blocks once status flips to COMPLETED."""
    db = _session()
    student = _student(db)
    event = _event(db)
    event.status = "COMPLETED"
    m, l = _module_and_level(db, level_code="PM-L2")
    exam = _mock_exam(db, l.id, m.id)
    _practice_bank_paper(db, event.id, "PM-L2", exam.id, [300], student.id)
    db.commit()

    result = engine.StartAnnualCompetitionPracticeAttempt(db, student, event.id, "PM-L2")
    assert result["status"] == "IN_PROGRESS"


def test_grant_retry_rejected_for_practice_attempt():
    db = _session()
    student = _student(db)
    event = _event(db)
    m, l = _module_and_level(db, level_code="PM-L2")
    exam = _mock_exam(db, l.id, m.id)
    _practice_bank_paper(db, event.id, "PM-L2", exam.id, [300], student.id)
    db.commit()
    started = engine.StartAnnualCompetitionPracticeAttempt(db, student, event.id, "PM-L2")
    engine.SubmitCompetitionEventSection(db, student, started["attemptId"], started["sessionToken"], 1)
    admin = _admin_user(db)

    with pytest.raises(HTTPException) as exc_info:
        engine.GrantAnnualCompetitionAttemptRetry(db, AttemptId=started["attemptId"], GrantedBy=admin, Reason="Any reason.")
    assert exc_info.value.status_code == 409
    assert exc_info.value.detail["code"] == "COMPETITION_RETRY_NOT_APPLICABLE_TO_PRACTICE"


def test_practice_attempt_shares_heartbeat_save_and_get_routes_unchanged():
    """Regression proof: the mid-attempt engine (get/heartbeat/submit-
    section) is purely AttemptId-keyed and needed zero code changes for
    Phase D -- confirmed here by driving a full two-section practice
    attempt through exactly the same functions the OFFICIAL tests above
    use, start to finalize."""
    db = _session()
    student = _student(db)
    event = _event(db)
    m, l = _module_and_level(db, level_code="PM-L2")
    exam = _mock_exam(db, l.id, m.id)
    _practice_bank_paper(db, event.id, "PM-L2", exam.id, [600, 300], student.id)
    db.commit()

    started = engine.StartAnnualCompetitionPracticeAttempt(db, student, event.id, "PM-L2")
    attempt_id, token = started["attemptId"], started["sessionToken"]

    fetched = engine.GetCompetitionEventAttemptForStudent(db, student, attempt_id)
    assert fetched["attemptType"] == "PRACTICE"

    heartbeat = engine.RecordCompetitionEventHeartbeat(db, student, attempt_id, token, 1)
    assert heartbeat["status"] == "IN_PROGRESS"

    first_section = engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 1)
    assert first_section["sections"][0]["status"] == "COMPLETED"
    assert first_section["currentSectionNumber"] == 2

    final = engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 2)
    assert final["status"] == "FINALIZED"


def test_practice_abandoned_in_progress_attempt_is_not_consumed_and_still_resumes():
    db = _session()
    student = _student(db)
    event = _event(db)
    m, l = _module_and_level(db, level_code="PM-L2")
    exam = _mock_exam(db, l.id, m.id)
    _practice_bank_paper(db, event.id, "PM-L2", exam.id, [600], student.id, level_paper_id="practice-1")
    db.commit()

    started = engine.StartAnnualCompetitionPracticeAttempt(db, student, event.id, "PM-L2")

    paper = db.get(CompetitionEventLevelPaper, "practice-1")
    assert paper.consumed_at is None

    resumed = engine.StartAnnualCompetitionPracticeAttempt(db, student, event.id, "PM-L2")
    assert resumed["attemptId"] == started["attemptId"]
    assert resumed["status"] == "IN_PROGRESS"


# ---------------------------------------------------------------------------
# ListMyAnnualCompetitionPracticeAttempts (Phase E) -- the student-facing
# "what have I already submitted, and how did I do" history list. Sibling
# of GetAnnualCompetitionPracticeBankForStudent (Phase C, "how many are
# left"), tested in test_annual_competition_studio_service.py.
# ---------------------------------------------------------------------------

def test_practice_history_lists_a_finalized_attempt_with_its_result():
    db = _session()
    student = _student(db)
    event = _event(db)
    m, l = _module_and_level(db, level_code="PM-L2")
    exam = _mock_exam(db, l.id, m.id)
    _practice_bank_paper(db, event.id, "PM-L2", exam.id, [600], student.id, level_paper_id="practice-1")
    db.commit()

    started = engine.StartAnnualCompetitionPracticeAttempt(db, student, event.id, "PM-L2")
    engine.SubmitCompetitionEventSection(db, student, started["attemptId"], started["sessionToken"], 1)

    history = engine.ListMyAnnualCompetitionPracticeAttempts(db, student, event.id)
    assert history["totalAttempts"] == 1
    row = history["attempts"][0]
    assert row["attemptId"] == started["attemptId"]
    assert row["competitionLevelCode"] == "PM-L2"
    assert row["status"] == "FINALIZED"
    assert row["result"] is not None  # zero graded questions here, but a result row still exists


def test_practice_history_includes_a_still_in_progress_attempt():
    """A resumable half-done paper shows up too -- not only finished ones."""
    db = _session()
    student = _student(db)
    event = _event(db)
    m, l = _module_and_level(db, level_code="PM-L2")
    exam = _mock_exam(db, l.id, m.id)
    _practice_bank_paper(db, event.id, "PM-L2", exam.id, [600, 300], student.id, level_paper_id="practice-1")
    db.commit()

    started = engine.StartAnnualCompetitionPracticeAttempt(db, student, event.id, "PM-L2")

    history = engine.ListMyAnnualCompetitionPracticeAttempts(db, student, event.id)
    assert history["totalAttempts"] == 1
    row = history["attempts"][0]
    assert row["attemptId"] == started["attemptId"]
    assert row["status"] == "IN_PROGRESS"
    assert row["result"] is None


def test_practice_history_lists_newest_attempt_first():
    db = _session()
    student = _student(db)
    event = _event(db)
    m, l = _module_and_level(db, level_code="PM-L2")
    exam_1 = _mock_exam(db, l.id, m.id, exam_id="exam-1")
    exam_2 = _mock_exam(db, l.id, m.id, exam_id="exam-2")
    _practice_bank_paper(
        db, event.id, "PM-L2", exam_1.id, [600], student.id,
        level_paper_id="practice-1", assigned_at=datetime.now(timezone.utc) - timedelta(days=1),
    )
    _practice_bank_paper(
        db, event.id, "PM-L2", exam_2.id, [600], student.id,
        level_paper_id="practice-2", assigned_at=datetime.now(timezone.utc),
    )
    db.commit()

    first = engine.StartAnnualCompetitionPracticeAttempt(db, student, event.id, "PM-L2")
    engine.SubmitCompetitionEventSection(db, student, first["attemptId"], first["sessionToken"], 1)
    second = engine.StartAnnualCompetitionPracticeAttempt(db, student, event.id, "PM-L2")

    history = engine.ListMyAnnualCompetitionPracticeAttempts(db, student, event.id)
    assert history["totalAttempts"] == 2
    assert history["attempts"][0]["attemptId"] == second["attemptId"]  # started later, listed first
    assert history["attempts"][1]["attemptId"] == first["attemptId"]


def test_practice_history_filters_by_level_code():
    db = _session()
    student = _student(db)
    event = _event(db)
    m1, l1 = _module_and_level(db, module_code="PM", level_code="PM-L2")
    m2, l2 = _module_and_level(db, module_code="IM", level_code="IM-L1")
    exam_1 = _mock_exam(db, l1.id, m1.id, exam_id="exam-pm")
    exam_2 = _mock_exam(db, l2.id, m2.id, exam_id="exam-im")
    _practice_bank_paper(db, event.id, "PM-L2", exam_1.id, [600], student.id, level_paper_id="practice-pm")
    _practice_bank_paper(db, event.id, "IM-L1", exam_2.id, [600], student.id, level_paper_id="practice-im")
    db.commit()

    engine.StartAnnualCompetitionPracticeAttempt(db, student, event.id, "PM-L2")
    engine.StartAnnualCompetitionPracticeAttempt(db, student, event.id, "IM-L1")

    pm_only = engine.ListMyAnnualCompetitionPracticeAttempts(db, student, event.id, CompetitionLevelCode="PM-L2")
    assert pm_only["totalAttempts"] == 1
    assert pm_only["attempts"][0]["competitionLevelCode"] == "PM-L2"


def test_practice_history_never_shows_another_students_attempt():
    db = _session()
    student = _student(db)
    other_student = _student(db, sid="student-2")
    event = _event(db)
    m, l = _module_and_level(db, level_code="PM-L2")
    exam = _mock_exam(db, l.id, m.id)
    _practice_bank_paper(db, event.id, "PM-L2", exam.id, [600], student.id, level_paper_id="practice-1")
    db.commit()
    engine.StartAnnualCompetitionPracticeAttempt(db, student, event.id, "PM-L2")

    history = engine.ListMyAnnualCompetitionPracticeAttempts(db, other_student, event.id)
    assert history["totalAttempts"] == 0


def test_practice_history_unknown_event_is_404():
    db = _session()
    student = _student(db)
    db.commit()
    with pytest.raises(HTTPException) as exc_info:
        engine.ListMyAnnualCompetitionPracticeAttempts(db, student, "does-not-exist")
    assert exc_info.value.status_code == 404
