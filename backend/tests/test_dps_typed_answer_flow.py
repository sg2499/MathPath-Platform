"""End-to-end coverage for the DPS typed-answer flow (save_answer ->
submit_attempt -> result_payload / safe_questions_payload), on top of a real
in-memory schema -- not a reimplementation, the actual functions
attempt_service.py exposes to the routes. See OPEN_ISSUES.md 2026-08-03e:
DPS questions are typed free-text answers now, not MCQ picks, because
students were answering randomly without solving.

This exists alongside test_answer_matching.py's exhaustive unit coverage of
answers_match() in isolation -- this file instead proves the full pipeline
wires together correctly: a messy-but-correct typed answer is graded
correct end-to-end, a genuinely wrong one is graded wrong, an unanswered
question is counted unanswered, and the correct answer is never leaked to
the client while an attempt is still in progress.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import (
    Attempt,
    DPS,
    GeneratedQuestion,
    GeneratedQuestionSet,
    Lesson,
    Level,
    Module,
    Student,
    User,
)
from app.services.attempt_service import (
    safe_questions_payload,
    save_answer,
    submit_attempt,
    result_payload,
)


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    models.Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def student(db):
    user = User(full_name="Test Student", email="dps-typed-answer-test@test.local", password_hash="x", role="STUDENT")
    db.add(user)
    db.commit()
    module = Module(module_code="MM", module_name="Master Module")
    db.add(module)
    db.commit()
    level = Level(module_id=module.id, level_code="MM-L1", level_name="Master Module Level 1")
    db.add(level)
    db.commit()
    lesson = Lesson(level_id=level.id, lesson_number=1, lesson_title="Lesson 1")
    db.add(lesson)
    db.commit()
    st = Student(user_id=user.id, student_code="MP-ST-TYPED", current_level_id=level.id)
    db.add(st)
    db.commit()
    return st


@pytest.fixture()
def attempt_with_three_questions(db, student):
    """One attempt, three questions, each with a known correct_answer, no
    QuestionOption rows at all -- grading must work purely off
    GeneratedQuestion.correct_answer + AttemptAnswer.selected_value now."""
    lesson = db.query(Lesson).first()
    dps = DPS(lesson_id=lesson.id, dps_number=1, dps_title="DPS 1", default_duration_seconds=600)
    db.add(dps)
    db.commit()

    qset = GeneratedQuestionSet(dps_id=dps.id, student_id=student.id, mode="PRACTICE", seed="TEST-SEED")
    db.add(qset)
    db.commit()

    q1 = GeneratedQuestion(question_set_id=qset.id, question_number=1, display_type="VERTICAL",
                            operands_json="[20,22]", operators_json='["+"]', correct_answer="42", seed="s1")
    q2 = GeneratedQuestion(question_set_id=qset.id, question_number=2, display_type="VERTICAL",
                            operands_json="[10,6.25]", operators_json='["+"]', correct_answer="16.25", seed="s2")
    q3 = GeneratedQuestion(question_set_id=qset.id, question_number=3, display_type="VERTICAL",
                            operands_json="[5,5]", operators_json='["+"]', correct_answer="10", seed="s3")
    db.add_all([q1, q2, q3])
    db.commit()

    now = datetime.now(timezone.utc)
    attempt = Attempt(
        dps_id=dps.id,
        question_set_id=qset.id,
        student_id=student.id,
        mode="PRACTICE",
        status="IN_PROGRESS",
        started_at=now,
        expires_at=now + timedelta(seconds=600),
        duration_seconds=600,
        total_questions=3,
        max_score=3,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt, [q1, q2, q3]


def test_messy_but_correct_answer_is_graded_correct_end_to_end(db, student, attempt_with_three_questions):
    attempt, (q1, q2, q3) = attempt_with_three_questions

    # q1: correct_answer "42", student types it with a stray space and a
    # leading zero -- a real "silly typing mistake", must still be correct.
    save_answer(db, student, attempt.id, q1.id, " 042 ")
    # q2: correct_answer "16.25", student types a padded decimal.
    save_answer(db, student, attempt.id, q2.id, "16.250")
    # q3: correct_answer "10", student types a genuinely wrong value.
    save_answer(db, student, attempt.id, q3.id, "11")

    submitted = submit_attempt(db, attempt, auto=False)

    assert submitted.correct_count == 2
    assert submitted.wrong_count == 1
    assert submitted.unanswered_count == 0
    assert submitted.total_score == 2
    assert submitted.max_score == 3

    payload = result_payload(db, submitted, include_review=True)
    review_by_number = {r["questionNumber"]: r for r in payload["questionReview"]}

    assert review_by_number[1]["isCorrect"] is True
    assert review_by_number[1]["studentAnswer"] == "042"  # trimmed, not reformatted -- what the student actually typed
    assert review_by_number[1]["correctAnswer"] == "42"

    assert review_by_number[2]["isCorrect"] is True
    assert review_by_number[3]["isCorrect"] is False
    assert review_by_number[3]["studentAnswer"] == "11"
    assert review_by_number[3]["correctAnswer"] == "10"


def test_unanswered_question_counts_as_unanswered_not_wrong(db, student, attempt_with_three_questions):
    attempt, (q1, q2, q3) = attempt_with_three_questions

    save_answer(db, student, attempt.id, q1.id, "42")
    # q2 and q3 left untouched entirely (never called save_answer at all).

    submitted = submit_attempt(db, attempt, auto=False)

    assert submitted.correct_count == 1
    assert submitted.wrong_count == 0
    assert submitted.unanswered_count == 2


def test_clearing_a_saved_answer_reverts_it_to_unanswered(db, student, attempt_with_three_questions):
    attempt, (q1, q2, q3) = attempt_with_three_questions

    save_answer(db, student, attempt.id, q1.id, "42")
    # Student changes their mind and clears the box before submitting.
    save_answer(db, student, attempt.id, q1.id, "")

    submitted = submit_attempt(db, attempt, auto=False)
    assert submitted.correct_count == 0
    assert submitted.unanswered_count == 3


def test_in_progress_payload_never_leaks_correct_answer(db, student, attempt_with_three_questions):
    attempt, (q1, q2, q3) = attempt_with_three_questions
    save_answer(db, student, attempt.id, q1.id, "42")

    payload = safe_questions_payload(db, attempt)
    serialized = str(payload)

    # The in-progress payload must never contain any correct_answer value,
    # under any key name -- it's sent to the client while the attempt is
    # still active.
    assert "correct" not in serialized.lower()
    q1_entry = next(p for p in payload if p["questionId"] == q1.id)
    assert q1_entry["savedAnswerText"] == "42"


def test_answered_count_only_counts_non_empty_saves(db, student, attempt_with_three_questions):
    attempt, (q1, q2, q3) = attempt_with_three_questions

    result = save_answer(db, student, attempt.id, q1.id, "42")
    assert result["answeredCount"] == 1

    result = save_answer(db, student, attempt.id, q2.id, "   ")
    assert result["answeredCount"] == 1  # whitespace-only save doesn't count as answered

    result = save_answer(db, student, attempt.id, q3.id, "10")
    assert result["answeredCount"] == 2
