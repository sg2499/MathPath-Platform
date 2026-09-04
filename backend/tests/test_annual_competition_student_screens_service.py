"""Package 5 (Student Live-Attempt UI, backend half) tests.

Covers everything Package 4's own test suite explicitly scoped out (see
pkg-04-section-timer-engine.md "What's NOT built yet"): slot-gated start,
answer capture (CompetitionEventAttemptAnswer), and the two new student
discovery/instructions endpoints. Deliberately a separate file from
test_annual_competition_attempt_service.py -- that file's own docstring
says its scope is the timer/pause engine only, "no student UI involved."

Self-contained fixtures (no cross-file imports), matching this repo's own
per-test-file convention.
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
    CompetitionEventAttemptAnswer,
    CompetitionEventAttemptSectionState,
    CompetitionEventLevelPaper,
    CompetitionEventSectionTimer,
    CompetitionEventSlot,
    CompetitionMockExam,
    CompetitionMockQuestion,
    CompetitionMockQuestionOption,
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


def _event(db, event_id="event-1", status="SCHEDULED"):
    e = CompetitionEvent(
        id=event_id,
        name="Annual Competition 2026",
        status=status,
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


def _question_with_options(db, mock_exam_id, section_number, question_number, concept_family="Addition", qid=None):
    qid = qid or f"q-{section_number}-{question_number}"
    q = CompetitionMockQuestion(
        id=qid, mock_exam_id=mock_exam_id, section_number=section_number, question_number=question_number,
        display_type="VERTICAL", correct_answer="4", concept_family=concept_family, marks=1,
    )
    db.add(q)
    db.flush()
    correct = CompetitionMockQuestionOption(
        id=f"{qid}-opt-a", mock_question_id=q.id, option_label="A", option_value="4", is_correct=True, display_order=1,
    )
    wrong = CompetitionMockQuestionOption(
        id=f"{qid}-opt-b", mock_question_id=q.id, option_label="B", option_value="5", is_correct=False, display_order=2,
    )
    db.add(correct)
    db.add(wrong)
    db.flush()
    return q, correct, wrong


def _assignment(db, event_id, student_id, assigned_level_code, assignment_id="assign-1", slot_id=None):
    a = CompetitionEventAssignment(
        id=assignment_id, event_id=event_id, student_id=student_id,
        assigned_level_code=assigned_level_code, assignment_source="AUTO", is_active=True, slot_id=slot_id,
    )
    db.add(a)
    db.flush()
    return a


def _slot(db, event_id, scheduled_start_at, scheduled_end_at=None, slot_id="slot-1"):
    s = CompetitionEventSlot(
        id=slot_id, event_id=event_id, mode="ONLINE_INDIA", slot_label="2:00 PM",
        scheduled_start_at=scheduled_start_at,
        scheduled_end_at=scheduled_end_at or (scheduled_start_at + timedelta(minutes=30)),
    )
    db.add(s)
    db.flush()
    return s


def _level_paper_with_timers(db, event_id, level_code, mock_exam_id, section_seconds, level_paper_id="paper-1"):
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


def _full_setup(db, section_seconds=(600,), level_code="PM-L2", slot_id=None, with_questions=True):
    """Wires a student assigned to a one-or-more-section level paper, ready
    to start an attempt. Returns (student, event, exam)."""
    student = _student(db)
    event = _event(db)
    m, l = _module_and_level(db, level_code=level_code)
    exam = _mock_exam(db, l.id, m.id)
    _assignment(db, event.id, student.id, level_code, slot_id=slot_id)
    _level_paper_with_timers(db, event.id, level_code, exam.id, list(section_seconds))
    if with_questions:
        for section_number, _seconds in enumerate(section_seconds, start=1):
            _question_with_options(db, exam.id, section_number, question_number=(section_number - 1) * 10 + 1)
            _question_with_options(db, exam.id, section_number, question_number=(section_number - 1) * 10 + 2)
    db.commit()
    return student, event, exam


# ---------------------------------------------------------------------------
# Slot-gated start
# ---------------------------------------------------------------------------

def test_start_before_scheduled_slot_start_is_blocked():
    db = _session()
    future_start = datetime.now(timezone.utc) + timedelta(hours=2)
    slot = _slot(db, "event-1", future_start)
    db.commit()
    student, event, exam = _full_setup(db, slot_id=slot.id)

    with pytest.raises(HTTPException) as excinfo:
        engine.StartCompetitionEventAttempt(db, student, event.id)
    assert excinfo.value.status_code == 403


def test_start_after_scheduled_slot_start_is_allowed():
    db = _session()
    past_start = datetime.now(timezone.utc) - timedelta(minutes=5)
    slot = _slot(db, "event-1", past_start)
    db.commit()
    student, event, exam = _full_setup(db, slot_id=slot.id)

    result = engine.StartCompetitionEventAttempt(db, student, event.id)
    assert result["status"] == "IN_PROGRESS"


def test_start_with_no_slot_set_is_never_gated():
    """The common case today -- see StartCompetitionEventAttempt's own
    docstring on why slot_id is usually unset."""
    db = _session()
    student, event, exam = _full_setup(db)  # no slot_id
    result = engine.StartCompetitionEventAttempt(db, student, event.id)
    assert result["status"] == "IN_PROGRESS"


def test_resume_is_never_slot_gated_even_if_slot_now_in_future():
    db = _session()
    past_start = datetime.now(timezone.utc) - timedelta(minutes=5)
    slot = _slot(db, "event-1", past_start)
    db.commit()
    student, event, exam = _full_setup(db, slot_id=slot.id)
    started = engine.StartCompetitionEventAttempt(db, student, event.id)

    # Move the slot into the future -- a resume must still succeed.
    slot.scheduled_start_at = datetime.now(timezone.utc) + timedelta(hours=1)
    db.commit()
    resumed = engine.StartCompetitionEventAttempt(db, student, event.id)
    assert resumed["attemptId"] == started["attemptId"]
    assert resumed["status"] == "IN_PROGRESS"


# ---------------------------------------------------------------------------
# Question-serving payload (GetCompetitionEventAttemptForStudent)
# ---------------------------------------------------------------------------

def test_get_attempt_includes_active_section_questions_only():
    db = _session()
    student, event, exam = _full_setup(db, section_seconds=(600, 300))
    started = engine.StartCompetitionEventAttempt(db, student, event.id)

    result = engine.GetCompetitionEventAttemptForStudent(db, student, started["attemptId"])
    questions = result["activeSectionQuestions"]
    assert len(questions) == 2
    assert all(q["questionId"].startswith("q-1-") for q in questions)
    assert questions[0]["savedOptionId"] is None
    for q in questions:
        assert "options" in q
        assert all("optionId" in o and "optionLabel" in o for o in q["options"])
        # is_correct must never leak to the student mid-attempt.
        assert all("isCorrect" not in o and "is_correct" not in o for o in q["options"])


# ---------------------------------------------------------------------------
# SaveCompetitionEventAnswer
# ---------------------------------------------------------------------------

def test_save_answer_upserts_and_reflects_in_saved_option_id():
    db = _session()
    student, event, exam = _full_setup(db)
    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    attempt_id, token = started["attemptId"], started["sessionToken"]

    result = engine.SaveCompetitionEventAnswer(db, student, attempt_id, token, 1, "q-1-1", "q-1-1-opt-a")
    saved_question = next(q for q in result["activeSectionQuestions"] if q["questionId"] == "q-1-1")
    assert saved_question["savedOptionId"] == "q-1-1-opt-a"

    answer_row = (
        db.query(CompetitionEventAttemptAnswer)
        .filter(CompetitionEventAttemptAnswer.attempt_id == attempt_id, CompetitionEventAttemptAnswer.mock_question_id == "q-1-1")
        .first()
    )
    assert answer_row.selected_option_id == "q-1-1-opt-a"
    assert answer_row.is_correct is True

    # Re-answering the same question upserts rather than duplicating.
    engine.SaveCompetitionEventAnswer(db, student, attempt_id, token, 1, "q-1-1", "q-1-1-opt-b")
    count = (
        db.query(CompetitionEventAttemptAnswer)
        .filter(CompetitionEventAttemptAnswer.attempt_id == attempt_id, CompetitionEventAttemptAnswer.mock_question_id == "q-1-1")
        .count()
    )
    assert count == 1
    db.refresh(answer_row)
    assert answer_row.selected_option_id == "q-1-1-opt-b"
    assert answer_row.is_correct is False


def test_save_answer_with_stale_session_token_is_rejected():
    db = _session()
    student, event, exam = _full_setup(db)
    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    with pytest.raises(HTTPException):
        engine.SaveCompetitionEventAnswer(db, student, started["attemptId"], "not-the-real-token", 1, "q-1-1", "q-1-1-opt-a")


def test_save_answer_for_wrong_section_number_is_rejected():
    db = _session()
    student, event, exam = _full_setup(db, section_seconds=(600, 300))
    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    with pytest.raises(HTTPException):
        engine.SaveCompetitionEventAnswer(db, student, started["attemptId"], started["sessionToken"], 2, "q-1-1", "q-1-1-opt-a")


def test_save_answer_for_question_outside_active_section_is_rejected():
    """A question that belongs to section 2's pool must be rejected while
    section 1 is active, even with a correct sessionToken/sectionNumber --
    unlike Competition Mock's flat list, there is no cross-section review."""
    db = _session()
    student, event, exam = _full_setup(db, section_seconds=(600, 300))
    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    with pytest.raises(HTTPException):
        engine.SaveCompetitionEventAnswer(db, student, started["attemptId"], started["sessionToken"], 1, "q-2-1", "q-2-1-opt-a")


def test_save_answer_with_option_from_a_different_question_is_rejected():
    db = _session()
    student, event, exam = _full_setup(db)
    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    with pytest.raises(HTTPException):
        engine.SaveCompetitionEventAnswer(db, student, started["attemptId"], started["sessionToken"], 1, "q-1-1", "q-1-2-opt-a")


def test_save_answer_after_attempt_submitted_returns_lean_payload_not_error():
    db = _session()
    student, event, exam = _full_setup(db, section_seconds=(600,))
    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    engine.SubmitCompetitionEventSection(db, student, started["attemptId"], started["sessionToken"], 1)

    result = engine.SaveCompetitionEventAnswer(
        db, student, started["attemptId"], started["sessionToken"], 1, "q-1-1", "q-1-1-opt-a"
    )
    assert result["status"] == "SUBMITTED"


# ---------------------------------------------------------------------------
# ListMyAnnualCompetitionAssignments
# ---------------------------------------------------------------------------

def test_list_assignments_shows_not_started_before_any_attempt():
    db = _session()
    student, event, exam = _full_setup(db)

    result = engine.ListMyAnnualCompetitionAssignments(db, student)
    assert len(result["assignments"]) == 1
    row = result["assignments"][0]
    assert row["eventId"] == event.id
    assert row["assignedLevelCode"] == "PM-L2"
    assert row["latestAttemptStatus"] == "NOT_STARTED"
    assert row["slot"] is None


def test_list_assignments_reflects_in_progress_after_start():
    db = _session()
    student, event, exam = _full_setup(db)
    started = engine.StartCompetitionEventAttempt(db, student, event.id)

    result = engine.ListMyAnnualCompetitionAssignments(db, student)
    row = result["assignments"][0]
    assert row["latestAttemptId"] == started["attemptId"]
    assert row["latestAttemptStatus"] == "IN_PROGRESS"


def test_list_assignments_excludes_draft_events():
    db = _session()
    student = _student(db)
    draft_event = _event(db, event_id="draft-event", status="DRAFT")
    _assignment(db, draft_event.id, student.id, "PM-L2")
    db.commit()

    result = engine.ListMyAnnualCompetitionAssignments(db, student)
    assert result["assignments"] == []


def test_list_assignments_includes_slot_when_set():
    db = _session()
    slot = _slot(db, "event-1", datetime.now(timezone.utc) + timedelta(days=1))
    db.commit()
    student, event, exam = _full_setup(db, slot_id=slot.id)

    result = engine.ListMyAnnualCompetitionAssignments(db, student)
    row = result["assignments"][0]
    assert row["slot"]["slotId"] == slot.id
    assert row["slot"]["mode"] == "ONLINE_INDIA"


# ---------------------------------------------------------------------------
# GetCompetitionEventInstructions
# ---------------------------------------------------------------------------

def test_instructions_returns_section_metadata_from_timers_and_questions():
    db = _session()
    student, event, exam = _full_setup(db, section_seconds=(600, 300))

    result = engine.GetCompetitionEventInstructions(db, student, event.id)
    assert result["eventId"] == event.id
    assert result["assignedLevelCode"] == "PM-L2"
    assert result["totalDurationSeconds"] == 900
    assert len(result["sections"]) == 2
    section_1 = result["sections"][0]
    assert section_1["sectionNumber"] == 1
    assert section_1["timeLimitSeconds"] == 600
    assert section_1["questionCount"] == 2
    assert section_1["conceptFamily"] == "Addition"


def test_instructions_without_assignment_is_404():
    db = _session()
    student = _student(db)
    event = _event(db)
    db.commit()
    with pytest.raises(HTTPException) as excinfo:
        engine.GetCompetitionEventInstructions(db, student, event.id)
    assert excinfo.value.status_code == 404


def test_instructions_without_ready_level_paper_is_400():
    db = _session()
    student = _student(db)
    event = _event(db)
    _assignment(db, event.id, student.id, "PM-L2")
    db.commit()
    with pytest.raises(HTTPException) as excinfo:
        engine.GetCompetitionEventInstructions(db, student, event.id)
    assert excinfo.value.status_code == 400
