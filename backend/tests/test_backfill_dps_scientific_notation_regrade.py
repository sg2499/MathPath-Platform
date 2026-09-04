"""Regression coverage for scripts/backfill_dps_scientific_notation_regrade.py
(2026-09-04) -- the one-time repair for existing GeneratedQuestion rows
whose correct_answer was stored as scientific notation (see
app/question_engine/number_format.py and
tests/test_dps_scientific_notation_answer_grading_regression.py for the
full root-cause story).

This exercises the actual script module (loaded by file path, since
scripts/ is a collection of standalone one-time-run scripts, not a
package) against a synthetic database standing in for exactly the reported
scenario: a completed DPS attempt where a student typed the exact correct
answer for a small-magnitude Answer Position question, but it was stored
wrong because GeneratedQuestion.correct_answer was corrupted scientific-
notation text.
"""
from __future__ import annotations

import importlib.util
import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.models import models
from app.models.models import (
    Attempt,
    AttemptAnswer,
    DPS,
    GeneratedQuestion,
    GeneratedQuestionSet,
    Lesson,
    Level,
    Module,
    QuestionOption,
    Student,
    User,
)

_SCRIPT_PATH = Path(__file__).resolve().parent.parent / "scripts" / "backfill_dps_scientific_notation_regrade.py"


@pytest.fixture()
def backfill_module():
    spec = importlib.util.spec_from_file_location("backfill_dps_scientific_notation_regrade", _SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def engine():
    fd, path = tempfile.mkstemp(suffix=".sqlite3")
    os.close(fd)
    eng = create_engine(f"sqlite:///{path}", poolclass=NullPool)
    models.Base.metadata.create_all(eng)
    try:
        yield eng
    finally:
        eng.dispose()
        os.remove(path)


@pytest.fixture()
def SessionLocal(engine):
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


@pytest.fixture()
def db(SessionLocal):
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def seeded_scenario(db):
    """Builds exactly the reported bug shape: one completed DPS attempt
    with a corrupted small-magnitude Answer Position question the student
    answered correctly but was scored wrong, alongside a genuinely wrong
    answer on an uncorrupted question (must stay wrong), plus an MCQ
    option carrying the same corrupted text (must be repaired by PHASE 1
    like any other question table, even though DPS itself is typed-answer
    and never reads options for grading)."""
    user = User(full_name="Backfill Test Student", email="backfill-sci-notation-test@test.local", password_hash="x", role="STUDENT")
    db.add(user)
    db.commit()
    module = Module(module_code="IM", module_name="Intermediate Module")
    db.add(module)
    db.commit()
    level = Level(module_id=module.id, level_code="IM-L4", level_name="Intermediate Module Level 4")
    db.add(level)
    db.commit()
    lesson = Lesson(level_id=level.id, lesson_number=5, lesson_title="Lesson 5")
    db.add(lesson)
    db.commit()
    student = Student(user_id=user.id, student_code="MP-ST-BACKFILL", current_level_id=level.id)
    db.add(student)
    db.commit()

    dps = DPS(lesson_id=lesson.id, dps_number=3, dps_title="DPS 3", default_duration_seconds=600)
    db.add(dps)
    db.commit()

    qset = GeneratedQuestionSet(dps_id=dps.id, student_id=student.id, mode="PRACTICE", seed="BACKFILL-SEED")
    db.add(qset)
    db.commit()

    corrupted_q = GeneratedQuestion(
        question_set_id=qset.id, question_number=1, display_type="ANSWER_POSITION",
        operands_json="[]", operators_json="[]", correct_answer="1.61e-05", seed="bq1",
    )
    genuinely_wrong_q = GeneratedQuestion(
        question_set_id=qset.id, question_number=2, display_type="VERTICAL",
        operands_json="[]", operators_json="[]", correct_answer="4", seed="bq2",
    )
    db.add_all([corrupted_q, genuinely_wrong_q])
    db.commit()

    # An MCQ option carrying the same corrupted text (option_value), to
    # prove PHASE 1 repairs question_options too, not just correct_answer.
    corrupted_option = QuestionOption(
        question_id=corrupted_q.id, option_label="A", option_value="1.61e-05",
        is_correct=True, display_order=1,
    )
    db.add(corrupted_option)
    db.commit()

    now = datetime.now(timezone.utc)
    attempt = Attempt(
        dps_id=dps.id, question_set_id=qset.id, student_id=student.id, mode="PRACTICE",
        status="SUBMITTED", started_at=now - timedelta(minutes=10), submitted_at=now,
        expires_at=now + timedelta(seconds=600), duration_seconds=600,
        total_questions=2, max_score=2, total_score=0, correct_count=0, wrong_count=2,
        unanswered_count=0, attempted_count=2, accuracy_percentage=0,
    )
    db.add(attempt)
    db.commit()

    # The student typed the EXACT correct plain-decimal answer for the
    # corrupted question -- stored wrong because "0.0000161" could never
    # match "1.61e-05" via answers_match(). And a genuinely different
    # (wrong) answer for the uncorrupted question.
    correct_answer_text = "0.0000161"
    ans1 = AttemptAnswer(attempt_id=attempt.id, question_id=corrupted_q.id, selected_value=correct_answer_text, is_correct=False, marks_awarded=0)
    ans2 = AttemptAnswer(attempt_id=attempt.id, question_id=genuinely_wrong_q.id, selected_value="999", is_correct=False, marks_awarded=0)
    db.add_all([ans1, ans2])
    db.commit()

    # Capture plain string ids now, while the session is still open -- the
    # tests below close/reopen sessions, and touching an expired ORM
    # attribute on a detached instance raises DetachedInstanceError.
    return {
        "attempt_id": attempt.id,
        "corrupted_q_id": corrupted_q.id,
        "genuinely_wrong_q_id": genuinely_wrong_q.id,
        "corrupted_option_id": corrupted_option.id,
        "correct_answer_text": correct_answer_text,
    }


def test_dry_run_previews_correctly_and_writes_nothing(db, SessionLocal, backfill_module, seeded_scenario):
    phase1_summary = backfill_module._phase1_repair_question_text(db, apply=False)
    any_repaired = bool(phase1_summary.get((GeneratedQuestion.__name__, "correct_answer")))
    assert any_repaired is True
    backfill_module._phase2_regrade_dps_attempts(db, apply=False, any_dps_question_repaired=any_repaired)
    db.rollback()
    db.close()

    # A fresh session/connection must show absolutely nothing changed.
    fresh = SessionLocal()
    try:
        q = fresh.get(GeneratedQuestion, seeded_scenario["corrupted_q_id"])
        assert q.correct_answer == "1.61e-05"
        opt = fresh.get(QuestionOption, seeded_scenario["corrupted_option_id"])
        assert opt.option_value == "1.61e-05"
        attempt = fresh.get(Attempt, seeded_scenario["attempt_id"])
        assert attempt.correct_count == 0
        assert attempt.total_score == 0
        ans1 = (
            fresh.query(AttemptAnswer)
            .filter(AttemptAnswer.attempt_id == attempt.id, AttemptAnswer.question_id == seeded_scenario["corrupted_q_id"])
            .first()
        )
        assert ans1.is_correct is False
    finally:
        fresh.close()


def test_apply_repairs_text_and_upgrades_the_correctly_answered_question(db, SessionLocal, backfill_module, seeded_scenario):
    phase1_summary = backfill_module._phase1_repair_question_text(db, apply=True)
    any_repaired = bool(phase1_summary.get((GeneratedQuestion.__name__, "correct_answer")))
    assert any_repaired is True
    backfill_module._phase2_regrade_dps_attempts(db, apply=True, any_dps_question_repaired=any_repaired)
    db.close()

    fresh = SessionLocal()
    try:
        q = fresh.get(GeneratedQuestion, seeded_scenario["corrupted_q_id"])
        assert q.correct_answer == "0.0000161"
        assert "e" not in q.correct_answer.lower()

        # The MCQ option's text is repaired too, independently of DPS grading
        # (DPS itself is typed-answer -- options aren't used for grading --
        # this just proves PHASE 1 covers question_options as well).
        opt = fresh.get(QuestionOption, seeded_scenario["corrupted_option_id"])
        assert opt.option_value == "0.0000161"

        attempt = fresh.get(Attempt, seeded_scenario["attempt_id"])
        # Exactly one question upgraded (the corrupted one, correctly
        # answered); the genuinely wrong answer must remain wrong.
        assert attempt.correct_count == 1
        assert attempt.wrong_count == 1
        assert attempt.total_score == 1
        assert attempt.max_score == 2
        assert attempt.accuracy_percentage == 50

        ans1 = (
            fresh.query(AttemptAnswer)
            .filter(AttemptAnswer.attempt_id == attempt.id, AttemptAnswer.question_id == seeded_scenario["corrupted_q_id"])
            .first()
        )
        assert ans1.is_correct is True
        assert ans1.marks_awarded == 1
        assert ans1.selected_value == q.correct_answer  # genuinely, not just cosmetically, identical now

        ans2 = (
            fresh.query(AttemptAnswer)
            .filter(AttemptAnswer.attempt_id == attempt.id, AttemptAnswer.question_id == seeded_scenario["genuinely_wrong_q_id"])
            .first()
        )
        assert ans2.is_correct is False
        assert ans2.marks_awarded == 0
    finally:
        fresh.close()


def test_apply_is_idempotent(db, SessionLocal, backfill_module, seeded_scenario):
    backfill_module._phase1_repair_question_text(db, apply=True)
    backfill_module._phase2_regrade_dps_attempts(db, apply=True, any_dps_question_repaired=True)
    db.close()

    # A second full run against the now-repaired data must find nothing
    # left to do, and must not change anything further.
    second_db = SessionLocal()
    try:
        phase1_summary = backfill_module._phase1_repair_question_text(second_db, apply=True)
        assert phase1_summary.get((GeneratedQuestion.__name__, "correct_answer")) == []
        backfill_module._phase2_regrade_dps_attempts(second_db, apply=True, any_dps_question_repaired=False)
        second_db.close()
    finally:
        pass

    fresh = SessionLocal()
    try:
        attempt = fresh.get(Attempt, seeded_scenario["attempt_id"])
        assert attempt.correct_count == 1
        assert attempt.total_score == 1
    finally:
        fresh.close()


def test_is_corrupted_scientific_notation_detection(backfill_module):
    detect = backfill_module._is_corrupted_scientific_notation
    assert detect("1.61e-05") is True
    assert detect("-2.3E+4") is True
    assert detect("0.0000161") is False
    assert detect("42") is False
    assert detect("73, 1") is False  # PM-L4 quotient/remainder pair -- must never be touched
    assert detect(None) is False
    assert detect("") is False
    assert detect("not a number") is False
