"""Package 8 (certificate half) tests.

Covers the actual product decisions Shailesh gave directly (2026-09-05,
in place of a further client round-trip): every finalized participant is
eligible (not just rank-holders), the student-facing download re-checks
`is_released` on every call (never trusts a stale client-side flag, same
discipline every other Annual Competition module in this epic follows),
ownership is enforced so one student can never probe another's attempt id,
and admin can always download regardless of release.

Self-contained fixtures (no cross-file imports), matching this repo's own
per-test-file convention -- copied from test_annual_competition_scoring_
service.py's own question/answer fixtures since a certificate needs a
real, finalized, scored attempt to render from.
"""

import asyncio

import pypdf
import pytest
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import (
    CompetitionEvent,
    CompetitionEventAssignment,
    CompetitionEventLevelPaper,
    CompetitionEventResult,
    CompetitionEventSectionTimer,
    CompetitionMockExam,
    CompetitionMockQuestion,
    CompetitionMockQuestionOption,
    Level,
    Module,
    Student,
    User,
)
from app.services import annual_competition_attempt_service as attempt_engine
from app.services import annual_competition_scoring_service as scoring
from app.services import annual_competition_certificate_service as certificates


def _session():
    db_engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(db_engine)
    Session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    return Session()


def _user(db, uid, name="Test Student"):
    u = User(id=uid, full_name=name, email=f"{uid}@example.test", password_hash="x", role="STUDENT", is_active=True)
    db.add(u)
    return u


def _student(db, sid="student-1", name=None):
    u = _user(db, f"user-{sid}", name=name or "Priya Sharma")
    s = Student(id=sid, user_id=u.id, student_code=f"MP-{sid}", is_active=True)
    db.add(s)
    return s


def _event(db, event_id="event-1"):
    e = CompetitionEvent(
        id=event_id,
        name="Annual Competition 2026",
        status="SCHEDULED",
        competition_date=datetime(2026, 10, 11, tzinfo=timezone.utc),
    )
    db.add(e)
    return e


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


def _question_with_options(db, mock_exam_id, section_number, question_number, qid=None):
    qid = qid or f"q-{section_number}-{question_number}"
    q = CompetitionMockQuestion(
        id=qid, mock_exam_id=mock_exam_id, section_number=section_number, question_number=question_number,
        display_type="VERTICAL", correct_answer="4", concept_family="Addition", marks=1,
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
    return q


def _assignment(db, event_id, student_id, assigned_level_code):
    a = CompetitionEventAssignment(
        id=f"assign-{student_id}", event_id=event_id, student_id=student_id,
        assigned_level_code=assigned_level_code, assignment_source="AUTO", is_active=True,
    )
    db.add(a)
    db.flush()
    return a


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


def _finalized_attempt_for_one_student(db, student_id="student-1", event_id="event-1", level_code="PM-L2", correct=True):
    """Wires one student through a full start -> answer -> submit cycle so
    a real CompetitionEventResult exists to render a certificate from."""
    student = _student(db, student_id)
    event = _event(db, event_id)
    m, l = _module_and_level(db, level_code=level_code)
    exam = _mock_exam(db, l.id, m.id, exam_id=f"exam-{event_id}")
    _question_with_options(db, exam.id, 1, 1)
    _assignment(db, event_id, student.id, level_code)
    _level_paper_with_timers(db, event_id, level_code, exam.id, (600,), level_paper_id=f"paper-{event_id}")
    db.commit()

    started = attempt_engine.StartCompetitionEventAttempt(db, student, event_id)
    attempt_id, token = started["attemptId"], started["sessionToken"]
    option_suffix = "-opt-a" if correct else "-opt-b"
    attempt_engine.SaveCompetitionEventAnswer(db, student, attempt_id, token, 1, "q-1-1", f"q-1-1{option_suffix}")
    attempt_engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 1)

    scoring.RankCompetitionEventResults(db, EventId=event_id, CompetitionLevelCode=level_code)
    return student, attempt_id


def _release(db, event_id="event-1"):
    admin = _user(db, "user-admin", name="Admin")
    db.commit()
    scoring.ReleaseCompetitionEventResults(db, EventId=event_id, CompetitionLevelCode=None, ReleasedBy=admin)


def _collect_pdf_bytes(response: StreamingResponse) -> bytes:
    async def _Collect() -> bytes:
        Chunks: list[bytes] = []
        async for Chunk in response.body_iterator:
            Chunks.append(Chunk if isinstance(Chunk, (bytes, bytearray)) else Chunk.encode())
        return b"".join(Chunks)

    return asyncio.run(_Collect())


# ---------------------------------------------------------------------------
# Student-facing gate
# ---------------------------------------------------------------------------

def test_certificate_rejected_before_release():
    db = _session()
    student, attempt_id = _finalized_attempt_for_one_student(db)
    db.commit()

    with pytest.raises(HTTPException):
        certificates.BuildAnnualCompetitionCertificateForStudent(db, student, attempt_id)


def test_certificate_404_for_attempt_with_no_result_yet():
    """An attempt still IN_PROGRESS has no CompetitionEventResult row at
    all yet -- reported as not-found, not a separate "not ready" error."""
    db = _session()
    student = _student(db)
    event = _event(db)
    m, l = _module_and_level(db)
    exam = _mock_exam(db, l.id, m.id)
    _question_with_options(db, exam.id, 1, 1)
    _assignment(db, event.id, student.id, "PM-L2")
    _level_paper_with_timers(db, event.id, "PM-L2", exam.id, (600, 300))
    db.commit()

    started = attempt_engine.StartCompetitionEventAttempt(db, student, event.id)

    with pytest.raises(HTTPException):
        certificates.BuildAnnualCompetitionCertificateForStudent(db, student, started["attemptId"])


def test_certificate_404_for_unknown_attempt():
    db = _session()
    student = _student(db)
    db.commit()

    with pytest.raises(HTTPException):
        certificates.BuildAnnualCompetitionCertificateForStudent(db, student, "does-not-exist")


def test_certificate_ownership_enforced():
    db = _session()
    student, attempt_id = _finalized_attempt_for_one_student(db)
    other_student = _student(db, "student-2", name="Other Student")
    db.commit()
    _release(db)

    with pytest.raises(HTTPException):
        certificates.BuildAnnualCompetitionCertificateForStudent(db, other_student, attempt_id)


def test_certificate_downloads_once_released():
    db = _session()
    student, attempt_id = _finalized_attempt_for_one_student(db, correct=True)
    _release(db)

    response = certificates.BuildAnnualCompetitionCertificateForStudent(db, student, attempt_id)
    assert isinstance(response, StreamingResponse)
    assert response.media_type == "application/pdf"
    assert "Priya-Sharma" in response.headers["content-disposition"]

    PdfBytes = _collect_pdf_bytes(response)
    assert PdfBytes[:4] == b"%PDF"
    Reader = pypdf.PdfReader(__import__("io").BytesIO(PdfBytes))
    assert len(Reader.pages) == 1
    PageText = Reader.pages[0].extract_text() or ""
    assert "Priya Sharma" in PageText
    assert "PM-L2" in PageText
    assert "Rank 1" in PageText


def test_certificate_shown_for_every_finalized_participant_not_just_top_rank():
    """Confirmed eligibility: every finalized participant, not a rank
    cutoff -- a student who got everything wrong (rank 2 of 2, but still
    finalized) still gets a certificate once released."""
    db = _session()
    student_a, attempt_a = _finalized_attempt_for_one_student(db, student_id="sA", correct=True)
    student_b = _student(db, "sB", name="Second Student")
    event_id = "event-1"
    level_code = "PM-L2"
    _assignment(db, event_id, student_b.id, level_code)
    db.commit()
    started_b = attempt_engine.StartCompetitionEventAttempt(db, student_b, event_id)
    attempt_engine.SaveCompetitionEventAnswer(db, student_b, started_b["attemptId"], started_b["sessionToken"], 1, "q-1-1", "q-1-1-opt-b")
    attempt_engine.SubmitCompetitionEventSection(db, student_b, started_b["attemptId"], started_b["sessionToken"], 1)
    scoring.RankCompetitionEventResults(db, EventId=event_id, CompetitionLevelCode=level_code)
    _release(db)

    response = certificates.BuildAnnualCompetitionCertificateForStudent(db, student_b, started_b["attemptId"])
    PdfBytes = _collect_pdf_bytes(response)
    Reader = pypdf.PdfReader(__import__("io").BytesIO(PdfBytes))
    PageText = Reader.pages[0].extract_text() or ""
    assert "Second Student" in PageText
    assert "Rank 2" in PageText


# ---------------------------------------------------------------------------
# Admin download -- bypasses the release gate
# ---------------------------------------------------------------------------

def test_admin_certificate_bypasses_release_gate():
    db = _session()
    student, attempt_id = _finalized_attempt_for_one_student(db)
    db.commit()  # deliberately never released

    response = certificates.BuildAnnualCompetitionCertificateForAdmin(db, AttemptId=attempt_id)
    assert isinstance(response, StreamingResponse)
    PdfBytes = _collect_pdf_bytes(response)
    assert PdfBytes[:4] == b"%PDF"


def test_admin_certificate_404_for_unknown_attempt():
    db = _session()
    with pytest.raises(HTTPException):
        certificates.BuildAnnualCompetitionCertificateForAdmin(db, AttemptId="does-not-exist")


# ---------------------------------------------------------------------------
# Voided results (Package 10 go-live rollback plan) -- blocked for BOTH
# entry points, unlike the release gate above which only applies to
# students. See _ResolveCertificateData's own comment for why: a voided
# result means "this result is wrong," so no certificate should come out of
# it at all, including an admin's own inspection/print copy.
# ---------------------------------------------------------------------------

def test_student_certificate_blocked_once_result_is_voided():
    db = _session()
    student, attempt_id = _finalized_attempt_for_one_student(db)
    _release(db)
    admin = _user(db, "user-admin-void", name="Admin")
    db.commit()

    scoring.VoidCompetitionEventResult(db, AttemptId=attempt_id, Reason="Wrong paper linked.", VoidedBy=admin)

    with pytest.raises(HTTPException) as exc_info:
        certificates.BuildAnnualCompetitionCertificateForStudent(db, student, attempt_id)
    assert exc_info.value.status_code == 409
    assert exc_info.value.detail["code"] == "COMPETITION_RESULT_VOIDED"


def test_admin_certificate_also_blocked_once_result_is_voided():
    db = _session()
    student, attempt_id = _finalized_attempt_for_one_student(db)
    admin = _user(db, "user-admin-void", name="Admin")
    db.commit()  # deliberately never released -- admin would normally bypass that gate

    scoring.VoidCompetitionEventResult(db, AttemptId=attempt_id, Reason="Technical issue confirmed.", VoidedBy=admin)

    with pytest.raises(HTTPException) as exc_info:
        certificates.BuildAnnualCompetitionCertificateForAdmin(db, AttemptId=attempt_id)
    assert exc_info.value.status_code == 409
    assert exc_info.value.detail["code"] == "COMPETITION_RESULT_VOIDED"


def test_certificate_available_again_once_unvoided():
    db = _session()
    student, attempt_id = _finalized_attempt_for_one_student(db)
    _release(db)
    admin = _user(db, "user-admin-void", name="Admin")
    db.commit()

    scoring.VoidCompetitionEventResult(db, AttemptId=attempt_id, Reason="Investigating.", VoidedBy=admin)
    scoring.UnvoidCompetitionEventResult(db, AttemptId=attempt_id)

    response = certificates.BuildAnnualCompetitionCertificateForStudent(db, student, attempt_id)
    PdfBytes = _collect_pdf_bytes(response)
    assert PdfBytes[:4] == b"%PDF"
