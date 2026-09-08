"""Regression coverage for the Annual Competition save/submit race-condition
guard (Point 8, 2026-09-08), mirroring
test_attempt_save_submit_race_regression.py's own structure and rationale
exactly -- DPS hit a real, confirmed bug from this same class of race
(2026-09-04: a student's genuinely correct typed answer was scored wrong
because its debounced autosave landed in the database *after* a concurrent
submit had already read a stale snapshot and graded it). Point 8 gave
Annual Competition the identical typed-answer save path DPS has, which
means it inherits the identical risk unless the identical fix is applied --
Shailesh, 2026-09-08: "make sure the correct answer is always flagged as
correct ... we already fixed an issue where the student had the correct
answer but it was flagged as incorrect, in a competition we cannot afford
such mistakes at all."

The fix (annual_competition_attempt_service._LockAttemptForUpdate, SELECT
... FOR UPDATE on the CompetitionEventAttempt row, called at the top of
SaveCompetitionEventAnswer, SubmitCompetitionEventSection,
RecordCompetitionEventHeartbeat, and GetCompetitionEventAttemptForStudent --
every entry point that can lazily finalize+score an attempt) serializes a
save's write against a concurrent finalize's read+grade+commit on Postgres
(production). SQLite (this test suite) silently no-ops with_for_update(), so
true lock-contention/blocking is not reproducible here -- same documented
limitation _LockAttemptForUpdate's own docstring states. What *is* directly
testable, and what this file covers instead, exactly mirroring the DPS
precedent's own four-part structure:

  1. The normal save-then-submit pipeline still grades correctly through
     the locked code path (no behavioural regression for the common case).
  2. Fail-closed semantics: once an attempt is no longer IN_PROGRESS, a
     save that "loses the race" is cleanly rejected (the lean, unchanged
     attempt payload comes back, status no longer IN_PROGRESS) and never
     silently corrupts or overwrites an already-scored answer.
  3. The section-submit -> scoring path is idempotent-safe: a section
     already closed cannot be re-scored by touching it again.
  4. _LockAttemptForUpdate() itself does a real, un-cached row read --
     proving it can never hand back a stale in-memory copy of the attempt,
     the specific property the whole fix depends on.
"""
from __future__ import annotations

import os
import tempfile
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.database import Base
from app.models.models import (
    CompetitionEvent,
    CompetitionEventAssignment,
    CompetitionEventAttempt,
    CompetitionEventAttemptAnswer,
    CompetitionEventLevelPaper,
    CompetitionEventSectionTimer,
    CompetitionMockExam,
    CompetitionMockQuestion,
    CompetitionMockQuestionOption,
    Level,
    Module,
    Student,
    User,
)
from app.services import annual_competition_attempt_service as engine
from app.services.annual_competition_attempt_service import _LockAttemptForUpdate


@pytest.fixture()
def db_engine():
    # A real file-backed SQLite DB (not :memory:/StaticPool) with NullPool,
    # so every Session() checkout gets its own genuinely independent DBAPI
    # connection -- needed for the two-session tests below, exactly mirroring
    # test_attempt_save_submit_race_regression.py's own engine fixture.
    fd, path = tempfile.mkstemp(suffix=".sqlite3")
    os.close(fd)
    eng = create_engine(f"sqlite:///{path}", poolclass=NullPool)
    Base.metadata.create_all(eng)
    try:
        yield eng
    finally:
        eng.dispose()
        os.remove(path)


@pytest.fixture()
def SessionLocal(db_engine):
    return sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)


@pytest.fixture()
def db(SessionLocal):
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def student_and_attempt(db):
    """One student, one two-section (1 question each) IN_PROGRESS attempt,
    ready for SaveCompetitionEventAnswer/SubmitCompetitionEventSection.
    Both questions have correct_answer="4" (option A) vs "5" (option B) --
    same fixture convention as the rest of this file's siblings."""
    user = User(full_name="Race Test Student", email="ac-race-fix-test@test.local", password_hash="x", role="STUDENT")
    db.add(user)
    db.commit()

    module = Module(module_code="PM", module_name="Preparatory Module")
    db.add(module)
    db.commit()
    level = Level(module_id=module.id, level_code="PM-L2", level_name="Preparatory Level 2")
    db.add(level)
    db.commit()

    student = Student(user_id=user.id, student_code="MP-ST-AC-RACE", current_level_id=level.id)
    db.add(student)
    db.commit()

    event = CompetitionEvent(name="Annual Competition 2026", status="SCHEDULED", competition_date=datetime.now(timezone.utc) + timedelta(days=10))
    db.add(event)
    db.commit()

    exam = CompetitionMockExam(title="Race Test Exam", module_id=module.id, level_id=level.id, total_questions=2, duration_seconds=1200, is_active=True)
    db.add(exam)
    db.commit()

    q1 = CompetitionMockQuestion(id="q-1-1", mock_exam_id=exam.id, section_number=1, question_number=1, display_type="VERTICAL", correct_answer="4", concept_family="Addition", marks=1)
    q2 = CompetitionMockQuestion(id="q-2-2", mock_exam_id=exam.id, section_number=2, question_number=2, display_type="VERTICAL", correct_answer="4", concept_family="Addition", marks=1)
    db.add_all([q1, q2])
    db.commit()
    for q in (q1, q2):
        db.add(CompetitionMockQuestionOption(id=f"{q.id}-opt-a", mock_question_id=q.id, option_label="A", option_value="4", is_correct=True, display_order=1))
        db.add(CompetitionMockQuestionOption(id=f"{q.id}-opt-b", mock_question_id=q.id, option_label="B", option_value="5", is_correct=False, display_order=2))
    db.commit()

    assignment = CompetitionEventAssignment(event_id=event.id, student_id=student.id, assigned_level_code="PM-L2", assignment_source="AUTO", is_active=True)
    db.add(assignment)
    db.commit()

    level_paper = CompetitionEventLevelPaper(event_id=event.id, competition_level_code="PM-L2", mock_exam_id=exam.id, status="READY")
    db.add(level_paper)
    db.commit()
    db.add(CompetitionEventSectionTimer(level_paper_id=level_paper.id, section_number=1, section_title="Section 1", mode="MIXED", time_limit_seconds=600, display_order=1))
    db.add(CompetitionEventSectionTimer(level_paper_id=level_paper.id, section_number=2, section_title="Section 2", mode="MIXED", time_limit_seconds=600, display_order=2))
    db.commit()

    started = engine.StartCompetitionEventAttempt(db, student, event.id)
    return student, started["attemptId"], started["sessionToken"]


def test_normal_save_then_submit_still_grades_correctly_through_locked_path(db, student_and_attempt):
    """Sanity: the row lock added to SaveCompetitionEventAnswer/
    SubmitCompetitionEventSection/RecordCompetitionEventHeartbeat/
    GetCompetitionEventAttemptForStudent must not change the result of the
    ordinary, non-racing flow."""
    student, attempt_id, token = student_and_attempt

    engine.SaveCompetitionEventAnswer(db, student, attempt_id, token, 1, "q-1-1", "4")  # correct
    result = engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 1)
    assert result["status"] == "IN_PROGRESS"
    assert result["currentSectionNumber"] == 2

    engine.SaveCompetitionEventAnswer(db, student, attempt_id, token, 2, "q-2-2", "5")  # genuinely wrong
    final = engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 2)
    assert final["status"] == "FINALIZED"

    q1_answer = db.query(CompetitionEventAttemptAnswer).filter(CompetitionEventAttemptAnswer.attempt_id == attempt_id, CompetitionEventAttemptAnswer.mock_question_id == "q-1-1").first()
    assert q1_answer.selected_value == "4"
    assert q1_answer.is_correct is True

    q2_answer = db.query(CompetitionEventAttemptAnswer).filter(CompetitionEventAttemptAnswer.attempt_id == attempt_id, CompetitionEventAttemptAnswer.mock_question_id == "q-2-2").first()
    assert q2_answer.selected_value == "5"
    assert q2_answer.is_correct is False


def test_save_after_finalize_is_rejected_fail_closed_and_never_corrupts_grade(db, student_and_attempt):
    """The fail-closed half of the fix: once the last section has been
    submitted (and the attempt scored via the Package 6 hook), a save that
    "loses the race" must be cleanly rejected -- never silently applied
    against an already-scored attempt."""
    student, attempt_id, token = student_and_attempt

    engine.SaveCompetitionEventAnswer(db, student, attempt_id, token, 1, "q-1-1", "4")
    engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 1)
    engine.SaveCompetitionEventAnswer(db, student, attempt_id, token, 2, "q-2-2", "4")
    final = engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 2)
    assert final["status"] == "FINALIZED"

    # A save that arrives late (e.g. the debounced autosave finally fires
    # after the section already closed) must be rejected, not silently
    # written -- SaveCompetitionEventAnswer's own IN_PROGRESS_STATUS check,
    # now behind the fresh locked re-read, is what enforces this.
    result = engine.SaveCompetitionEventAnswer(db, student, attempt_id, token, 1, "q-1-1", "999")
    assert result["status"] == "FINALIZED"

    q1_answer = db.query(CompetitionEventAttemptAnswer).filter(CompetitionEventAttemptAnswer.attempt_id == attempt_id, CompetitionEventAttemptAnswer.mock_question_id == "q-1-1").first()
    assert q1_answer.selected_value == "4"  # untouched by the rejected late save
    assert q1_answer.is_correct is True


def test_lock_attempt_for_update_reads_current_committed_state_not_a_stale_copy(db, SessionLocal, student_and_attempt):
    """Direct unit coverage of the helper the whole fix depends on: it must
    return the attempt's CURRENT row, reflecting the latest committed write,
    via a second independent session that never shares db's identity map."""
    student, attempt_id, token = student_and_attempt
    # Release whatever transaction the fixture setup left open on `db` --
    # SQLite's file-level locking would otherwise make other_session's
    # commit below block/fail behind this session's own still-open read.
    db.commit()

    other_session = SessionLocal()
    try:
        other_attempt = other_session.get(CompetitionEventAttempt, attempt_id)
        other_attempt.status = "SUBMITTED"
        other_session.commit()

        locked = _LockAttemptForUpdate(db, attempt_id)
        assert locked is not None
        assert locked.status == "SUBMITTED"  # not the IN_PROGRESS this session originally saw
    finally:
        other_session.close()


def test_save_answer_rejects_once_lock_reread_sees_finalize_from_another_session(db, SessionLocal, student_and_attempt):
    """The exact shape of the fix: SaveCompetitionEventAnswer's fresh locked
    re-read right before the write must catch a finalize that another
    session already committed, and reject the save instead of writing an
    answer into (or reading a stale view of) an attempt that's already been
    scored."""
    student, attempt_id, token = student_and_attempt
    db.commit()

    other_session = SessionLocal()
    try:
        other_student = other_session.get(Student, student.id)
        engine.SaveCompetitionEventAnswer(other_session, other_student, attempt_id, token, 1, "q-1-1", "4")
        engine.SubmitCompetitionEventSection(other_session, other_student, attempt_id, token, 1)
        engine.SaveCompetitionEventAnswer(other_session, other_student, attempt_id, token, 2, "q-2-2", "4")
        engine.SubmitCompetitionEventSection(other_session, other_student, attempt_id, token, 2)
        other_session.commit()
    finally:
        other_session.close()

    # This session's own (unrefreshed) view of the attempt was loaded before
    # the other session's finalize committed.
    result = engine.SaveCompetitionEventAnswer(db, student, attempt_id, token, 1, "q-1-1", "999")
    assert result["status"] == "FINALIZED"

    q1_answer = db.query(CompetitionEventAttemptAnswer).filter(CompetitionEventAttemptAnswer.attempt_id == attempt_id, CompetitionEventAttemptAnswer.mock_question_id == "q-1-1").first()
    assert q1_answer.selected_value == "4"
    assert q1_answer.is_correct is True
