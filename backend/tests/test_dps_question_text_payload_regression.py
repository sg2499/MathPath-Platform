"""Regression coverage for the 2026-10 practice-sheet (DPS) question-text fix
(Shailesh: "fix that problem as well so that it is gone forever").

Root cause: attempt_service.py's safe_questions_payload() (the in-progress
test screen) and result_payload() (the student/teacher/admin result review)
sent operands, operators and displayType for every DPS question but never
the question's own stored text. Mocks, assessments and annual papers have
always sent "questionText". Without it the screen rebuilt each sum from
operands/operators alone, which is wrong or incomplete for two families:

- Mixed-operation (BODMAS) sums. Their operators list cannot express the
  real expression, so a stored "8807 - 37 x 69 - 7372 / 97 + 32 + 55^2"
  (answer 9235) was shown with "+" in place of both "-". A full scan of all
  1,006 sheets found 74 such questions on 15 MM-L1 sheets.
- Box questions. The instruction above the box ("Find Profit %", "Find
  Simple Interest", "Odd Numbers" ...) IS the stored text, so on practice
  sheets the box appeared with no instruction at all.

These tests run the real MM-L1 engine through the real persist + payload
functions (not a reimplementation) and lock in that both payloads carry the
stored text verbatim for every question, that every financial box has its
instruction, and that sending it never leaks the answer.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import Attempt, DPS, GeneratedQuestion, Lesson, Level, Student, User
from app.seed.seed_master_module import seed as seed_master_module
from app.services.attempt_service import result_payload, safe_questions_payload, submit_attempt
from app.services.generation_service import persist_question_set


@pytest.fixture(scope="module")
def db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    models.Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    session = SessionLocal()
    seed_master_module(session)
    session.commit()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="module")
def student(db):
    level = db.query(Level).filter(Level.level_code == "MM-L1").one()
    user = User(full_name="Question Text Student", email="dps-question-text@test.local", password_hash="x", role="STUDENT")
    db.add(user)
    db.commit()
    st = Student(user_id=user.id, student_code="MP-ST-QTEXT", current_level_id=level.id)
    db.add(st)
    db.commit()
    return st


def _start_attempt(db, student, lesson_number: int, dps_number: int, seed: str):
    """A real generated question set for one MM-L1 sheet plus an in-progress
    attempt on it -- the same rows the student "start attempt" flow creates."""
    dps = (
        db.query(DPS)
        .join(Lesson, Lesson.id == DPS.lesson_id)
        .join(Level, Level.id == Lesson.level_id)
        .filter(Level.level_code == "MM-L1", Lesson.lesson_number == lesson_number, DPS.dps_number == dps_number)
        .one()
    )
    qset = persist_question_set(db, dps, None, student.id, "PRACTICE", seed)
    questions = (
        db.query(GeneratedQuestion)
        .filter(GeneratedQuestion.question_set_id == qset.id)
        .order_by(GeneratedQuestion.question_number)
        .all()
    )
    now = datetime.now(timezone.utc)
    attempt = Attempt(
        dps_id=dps.id,
        question_set_id=qset.id,
        student_id=student.id,
        mode="PRACTICE",
        status="IN_PROGRESS",
        started_at=now,
        expires_at=now + timedelta(seconds=900),
        duration_seconds=900,
        total_questions=len(questions),
        max_score=len(questions),
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt, questions


# (lesson, dps) -> what the sheet is, from the MM-L1 workbook structure.
BODMAS_SHEETS = [(1, 5), (4, 3)]
FINANCIAL_SHEETS = [(14, 5), (16, 3), (17, 3)]


@pytest.mark.parametrize("lesson_number,dps_number", BODMAS_SHEETS + FINANCIAL_SHEETS)
def test_in_progress_payload_carries_the_stored_question_text(db, student, lesson_number, dps_number):
    attempt, questions = _start_attempt(db, student, lesson_number, dps_number, f"qtext-live-{lesson_number}-{dps_number}")
    payload = safe_questions_payload(db, attempt)

    assert len(payload) == len(questions) > 0
    by_id = {q.id: q for q in questions}
    for entry in payload:
        assert "questionText" in entry, "the practice-sheet test screen must receive the stored question text"
        assert entry["questionText"] == by_id[entry["questionId"]].question_text
    # Sending the question must never send the answer.
    assert "correct" not in json.dumps(payload).lower()


@pytest.mark.parametrize("lesson_number,dps_number", BODMAS_SHEETS + FINANCIAL_SHEETS)
def test_result_review_carries_the_stored_question_text(db, student, lesson_number, dps_number):
    attempt, questions = _start_attempt(db, student, lesson_number, dps_number, f"qtext-result-{lesson_number}-{dps_number}")
    submitted = submit_attempt(db, attempt, auto=False)
    review = result_payload(db, submitted, include_review=True)["questionReview"]

    assert len(review) == len(questions) > 0
    by_id = {q.id: q for q in questions}
    for row in review:
        assert "questionText" in row, "the practice-sheet result review must receive the stored question text"
        assert row["questionText"] == by_id[row["questionId"]].question_text


@pytest.mark.parametrize("lesson_number,dps_number", BODMAS_SHEETS)
def test_mixed_operation_sums_send_their_real_expression(db, student, lesson_number, dps_number):
    """The stored text is the only place a BODMAS sum's real signs live. If it
    is missing or empty the screen falls back to operands/operators, which is
    exactly how "-" turned into "+"."""
    attempt, questions = _start_attempt(db, student, lesson_number, dps_number, f"qtext-bodmas-{lesson_number}-{dps_number}")
    payload = {entry["questionId"]: entry for entry in safe_questions_payload(db, attempt)}

    mixed = [
        q for q in questions
        if (q.display_type or "").upper() == "EXPRESSION_WORKSHEET" and len(json.loads(q.operands_json or "[]")) > 2
    ]
    assert mixed, "expected mixed-operation questions on this sheet"
    for q in mixed:
        text = (payload[q.id]["questionText"] or "").strip()
        assert text, f"question {q.question_number}: a mixed-operation sum must send its expression"
        assert any(ch.isdigit() for ch in text)


@pytest.mark.parametrize("lesson_number,dps_number", FINANCIAL_SHEETS)
def test_every_financial_box_sends_its_instruction(db, student, lesson_number, dps_number):
    """Profit / loss / simple interest boxes: the instruction above the box
    ("Find Profit", "Find Loss %", "Find Simple Interest" ...) must reach the
    screen for every single question."""
    attempt, questions = _start_attempt(db, student, lesson_number, dps_number, f"qtext-box-{lesson_number}-{dps_number}")
    payload = {entry["questionId"]: entry for entry in safe_questions_payload(db, attempt)}

    boxes = [q for q in questions if (q.display_type or "").upper() == "FINANCIAL_TABLE"]
    assert boxes, "expected financial box questions on this sheet"
    for q in boxes:
        text = (payload[q.id]["questionText"] or "").strip()
        assert text.lower().startswith("find "), f"question {q.question_number}: financial box without an instruction ({text!r})"
