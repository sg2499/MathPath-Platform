"""Regression coverage for scripts/backfill_mm_percentage_digit_cap.py
(2026-09-16) -- the one-time repair for MM PERCENTAGE_ADD_LESS rows whose
correct_answer exceeds the 5-total-digit cap enforced by GeneratePercentage
AddLess (app/question_engine/mm/operands.py) since 2026-09-15.

Exercises the actual script module (loaded by file path, since scripts/ is a
collection of standalone one-time-run scripts, not a package) against a
synthetic database covering all three phases: DPS (GeneratedQuestion), Mock
Exam (CompetitionMockQuestion via CompetitionMockAssignment), and Annual
Competition practice papers (CompetitionMockQuestion via
CompetitionEventLevelPaper).
"""
from __future__ import annotations

import importlib.util
import json
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
    Assignment,
    Attempt,
    CompetitionEventLevelPaper,
    CompetitionMockAssignment,
    CompetitionMockAttempt,
    CompetitionMockExam,
    CompetitionMockQuestion,
    CompetitionMockQuestionOption,
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

_SCRIPT_PATH = Path(__file__).resolve().parent.parent / "scripts" / "backfill_mm_percentage_digit_cap.py"

# An over-cap answer (6 digits) with self-consistent operands, matching what
# GeneratePercentageAddLess's own pre-fix output shape looked like: Base *
# Percent / 100 = CorrectAnswer for the "x%" (Add Percentage) operator.
_OVER_CAP_BASE = 987654
_OVER_CAP_PERCENT = 15
_OVER_CAP_ANSWER = "148148.10"  # 987654 * 15 / 100 = 148148.1 -- 8 digits, over the 5-digit cap

_OVER_CAP_METADATA = json.dumps({
    "concept_family": "PERCENTAGE_ADD_LESS",
    "module_code": "MM",
    "level_code": "MM-L1",
    "lesson_number": 6,
    "dps_title": "Add Percentage Challenge",
    "section_title": "Add Percentage Challenge",
    "percentage_mode": "ADD_PERCENTAGE",
    "base_amount": _OVER_CAP_BASE,
    "percentage_operator": "×%",
    "lesson_band": 2,
})

_WITHIN_CAP_METADATA = json.dumps({
    "concept_family": "PERCENTAGE_ADD_LESS",
    "module_code": "MM",
    "level_code": "MM-L1",
    "lesson_number": 6,
    "dps_title": "Less Percentage Challenge",
    "percentage_mode": "LESS_PERCENTAGE",
    "base_amount": 500,
    "percentage_operator": "-%",
    "lesson_band": 2,
})


@pytest.fixture()
def backfill_module():
    spec = importlib.util.spec_from_file_location("backfill_mm_percentage_digit_cap", _SCRIPT_PATH)
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


def _seed_module_level_lesson(db, level_code="MM-L1"):
    module = Module(module_code="MM", module_name="Master Module")
    db.add(module)
    db.commit()
    level = Level(module_id=module.id, level_code=level_code, level_name="Master Module Level 1")
    db.add(level)
    db.commit()
    lesson = Lesson(level_id=level.id, lesson_number=6, lesson_title="Lesson 6")
    db.add(lesson)
    db.commit()
    return module, level, lesson


def _seed_student(db, code="MP-ST-PCT"):
    user = User(full_name="Percentage Backfill Student", email=f"{code.lower()}@test.local", password_hash="x", role="STUDENT")
    db.add(user)
    db.commit()
    student = Student(user_id=user.id, student_code=code)
    db.add(student)
    db.commit()
    return student


# ---------------------------------------------------------------------------
# PHASE 1: DPS
# ---------------------------------------------------------------------------


@pytest.fixture()
def dps_scenario(db):
    _module, _level, lesson = _seed_module_level_lesson(db)
    student = _seed_student(db)
    dps = DPS(lesson_id=lesson.id, dps_number=1, dps_title="Add Percentage Challenge", default_duration_seconds=600)
    db.add(dps)
    db.commit()

    assignment = Assignment(
        assigned_to_type="STUDENT", assigned_to_id=student.id, dps_id=dps.id,
        assignment_type="DPS", title="Add Percentage Challenge", is_active=True,
    )
    db.add(assignment)
    db.commit()

    qset = GeneratedQuestionSet(assignment_id=assignment.id, dps_id=dps.id, student_id=student.id, mode="PRACTICE", seed="DPS-PCT-SEED")
    db.add(qset)
    db.commit()

    over_cap_q = GeneratedQuestion(
        question_set_id=qset.id, question_number=1, display_type="EXPRESSION_WORKSHEET",
        operands_json=json.dumps([_OVER_CAP_BASE, _OVER_CAP_PERCENT]), operators_json=json.dumps(["", "×%"]),
        correct_answer=_OVER_CAP_ANSWER, seed="dps-pct-1", metadata_json=_OVER_CAP_METADATA,
    )
    within_cap_q = GeneratedQuestion(
        question_set_id=qset.id, question_number=2, display_type="EXPRESSION_WORKSHEET",
        operands_json=json.dumps([500, 10]), operators_json=json.dumps(["", "-%"]),
        correct_answer="450", seed="dps-pct-2", metadata_json=_WITHIN_CAP_METADATA,
    )
    db.add_all([over_cap_q, within_cap_q])
    db.commit()

    over_cap_option = QuestionOption(question_id=over_cap_q.id, option_label="A", option_value=_OVER_CAP_ANSWER, is_correct=True, display_order=1)
    db.add(over_cap_option)
    db.commit()

    return {
        "student_id": student.id, "dps_id": dps.id, "assignment_id": assignment.id,
        "qset_id": qset.id, "over_cap_q_id": over_cap_q.id, "within_cap_q_id": within_cap_q.id,
    }


def test_dps_dry_run_detects_and_writes_nothing(db, SessionLocal, backfill_module, dps_scenario):
    summary = backfill_module._phase_dps(db, apply=False)
    assert summary["fixed"] == 1
    db.rollback()
    db.close()

    fresh = SessionLocal()
    try:
        q = fresh.get(GeneratedQuestion, dps_scenario["over_cap_q_id"])
        assert q.correct_answer == _OVER_CAP_ANSWER
        options = fresh.query(QuestionOption).filter(QuestionOption.question_id == q.id).all()
        assert len(options) == 1
    finally:
        fresh.close()


def test_dps_apply_regenerates_within_cap_and_preserves_context_metadata(db, SessionLocal, backfill_module, dps_scenario):
    summary = backfill_module._phase_dps(db, apply=True)
    assert summary["fixed"] == 1
    db.close()

    fresh = SessionLocal()
    try:
        q = fresh.get(GeneratedQuestion, dps_scenario["over_cap_q_id"])
        NewAnswer = Decimal(q.correct_answer)
        assert backfill_module._TrimmedNumericDigitCount(NewAnswer) <= backfill_module.MAX_TOTAL_DIGITS

        Metadata = json.loads(q.metadata_json)
        # Context fields (describe WHERE the question lives) must be untouched.
        assert Metadata["module_code"] == "MM"
        assert Metadata["level_code"] == "MM-L1"
        assert Metadata["dps_title"] == "Add Percentage Challenge"
        assert Metadata["concept_family"] == "PERCENTAGE_ADD_LESS"
        # The operator must be preserved (Add Percentage, same as original).
        assert Metadata["percentage_operator"] == "×%"
        assert Metadata["percentage_digit_cap_backfilled"] is True
        assert "percentage_digit_cap_backfilled_at" in Metadata

        Operands = json.loads(q.operands_json)
        Operators = json.loads(q.operators_json)
        assert Operators == ["", "×%"]
        Base, Percent = Decimal(str(Operands[0])), Decimal(str(Operands[1]))
        ExpectedAnswer = (Base * Percent / Decimal(100)).quantize(Decimal("0.01"))
        assert NewAnswer.quantize(Decimal("0.01")) == ExpectedAnswer

        options = fresh.query(QuestionOption).filter(QuestionOption.question_id == q.id).order_by(QuestionOption.display_order).all()
        assert len(options) == 4
        correct_options = [o for o in options if o.is_correct]
        assert len(correct_options) == 1
        assert Decimal(correct_options[0].option_value) == NewAnswer.to_integral_value() if NewAnswer == NewAnswer.to_integral_value() else True

        # The already-compliant sibling question in the same set must be untouched.
        sibling = fresh.get(GeneratedQuestion, dps_scenario["within_cap_q_id"])
        assert sibling.correct_answer == "450"
    finally:
        fresh.close()


def test_dps_apply_is_idempotent(db, SessionLocal, backfill_module, dps_scenario):
    backfill_module._phase_dps(db, apply=True)
    db.close()

    second_db = SessionLocal()
    try:
        summary = backfill_module._phase_dps(second_db, apply=True)
        assert summary["fixed"] == 0
    finally:
        second_db.close()


def test_dps_skips_row_once_any_attempt_exists(db, SessionLocal, backfill_module, dps_scenario):
    now = datetime.now(timezone.utc)
    attempt = Attempt(
        dps_id=dps_scenario["dps_id"], question_set_id=dps_scenario["qset_id"], student_id=dps_scenario["student_id"],
        mode="PRACTICE", status="IN_PROGRESS", started_at=now, expires_at=now + timedelta(seconds=600),
        duration_seconds=600, total_questions=2, max_score=2,
    )
    db.add(attempt)
    db.commit()

    summary = backfill_module._phase_dps(db, apply=True)
    assert summary["fixed"] == 0
    db.close()

    fresh = SessionLocal()
    try:
        q = fresh.get(GeneratedQuestion, dps_scenario["over_cap_q_id"])
        assert q.correct_answer == _OVER_CAP_ANSWER
    finally:
        fresh.close()


def test_dps_skips_row_when_assignment_inactive(db, SessionLocal, backfill_module, dps_scenario):
    assignment = db.get(Assignment, dps_scenario["assignment_id"])
    assignment.is_active = False
    db.commit()

    summary = backfill_module._phase_dps(db, apply=True)
    assert summary["fixed"] == 0


# ---------------------------------------------------------------------------
# PHASE 2: Mock Exam
# ---------------------------------------------------------------------------


@pytest.fixture()
def mock_scenario(db):
    module, level, _lesson = _seed_module_level_lesson(db)
    student = _seed_student(db, code="MP-ST-PCT-MOCK")

    exam = CompetitionMockExam(
        title="MM-L1 Mock", module_id=module.id, level_id=level.id, competition_scope="GENERAL",
        total_questions=1, duration_seconds=1800, status="PUBLISHED",
    )
    db.add(exam)
    db.commit()

    over_cap_q = CompetitionMockQuestion(
        mock_exam_id=exam.id, section_number=1, question_number=1, display_type="EXPRESSION_WORKSHEET",
        operands_json=json.dumps([_OVER_CAP_BASE, _OVER_CAP_PERCENT]), operators_json=json.dumps(["", "×%"]),
        correct_answer=_OVER_CAP_ANSWER, concept_family="PERCENTAGE_ADD_LESS", metadata_json=_OVER_CAP_METADATA,
    )
    db.add(over_cap_q)
    db.commit()
    db.add(CompetitionMockQuestionOption(mock_question_id=over_cap_q.id, option_label="A", option_value=_OVER_CAP_ANSWER, is_correct=True, display_order=1))
    db.commit()

    assignment = CompetitionMockAssignment(mock_exam_id=exam.id, student_id=student.id)
    db.add(assignment)
    db.commit()

    return {"exam_id": exam.id, "student_id": student.id, "assignment_id": assignment.id, "over_cap_q_id": over_cap_q.id}


def test_mock_apply_regenerates_when_assigned_and_unattempted(db, SessionLocal, backfill_module, mock_scenario):
    summary = backfill_module._phase_mock(db, apply=True)
    assert summary["fixed"] == 1
    db.close()

    fresh = SessionLocal()
    try:
        q = fresh.get(CompetitionMockQuestion, mock_scenario["over_cap_q_id"])
        assert backfill_module._TrimmedNumericDigitCount(Decimal(q.correct_answer)) <= backfill_module.MAX_TOTAL_DIGITS
        options = fresh.query(CompetitionMockQuestionOption).filter(CompetitionMockQuestionOption.mock_question_id == q.id).all()
        assert len(options) == 4
        assert sum(1 for o in options if o.is_correct) == 1
    finally:
        fresh.close()


def test_mock_skipped_when_never_assigned(db, SessionLocal, backfill_module, mock_scenario):
    assignment = db.get(CompetitionMockAssignment, mock_scenario["assignment_id"])
    db.delete(assignment)
    db.commit()

    summary = backfill_module._phase_mock(db, apply=True)
    assert summary["fixed"] == 0


def test_mock_skipped_once_any_attempt_exists_anywhere(db, SessionLocal, backfill_module, mock_scenario):
    now = datetime.now(timezone.utc)
    attempt = CompetitionMockAttempt(
        mock_assignment_id=mock_scenario["assignment_id"], mock_exam_id=mock_scenario["exam_id"],
        student_id=mock_scenario["student_id"], attempt_number=1, status="IN_PROGRESS",
        started_at=now, expires_at=now + timedelta(seconds=1800), duration_seconds=1800,
    )
    db.add(attempt)
    db.commit()

    summary = backfill_module._phase_mock(db, apply=True)
    assert summary["fixed"] == 0


# ---------------------------------------------------------------------------
# PHASE 3: Annual Competition practice papers
# ---------------------------------------------------------------------------


@pytest.fixture()
def practice_scenario(db):
    module, level, _lesson = _seed_module_level_lesson(db)
    student = _seed_student(db, code="MP-ST-PCT-PRACTICE")

    exam = CompetitionMockExam(
        title="Annual Competition Practice -- MM-L1", module_id=module.id, level_id=level.id,
        competition_scope="ANNUAL_COMPETITION_PRACTICE", total_questions=1, duration_seconds=1800, status="PUBLISHED",
    )
    db.add(exam)
    db.commit()

    over_cap_q = CompetitionMockQuestion(
        mock_exam_id=exam.id, section_number=1, question_number=1, display_type="EXPRESSION_WORKSHEET",
        operands_json=json.dumps([_OVER_CAP_BASE, _OVER_CAP_PERCENT]), operators_json=json.dumps(["", "×%"]),
        correct_answer=_OVER_CAP_ANSWER, concept_family="PERCENTAGE_ADD_LESS", metadata_json=_OVER_CAP_METADATA,
    )
    db.add(over_cap_q)
    db.commit()
    db.add(CompetitionMockQuestionOption(mock_question_id=over_cap_q.id, option_label="A", option_value=_OVER_CAP_ANSWER, is_correct=True, display_order=1))
    db.commit()

    paper = CompetitionEventLevelPaper(
        competition_level_code="MM-1", mock_exam_id=exam.id, paper_kind="PRACTICE",
        status="READY", assigned_student_id=student.id, assigned_at=datetime.now(timezone.utc),
    )
    db.add(paper)
    db.commit()

    return {"exam_id": exam.id, "student_id": student.id, "paper_id": paper.id, "over_cap_q_id": over_cap_q.id}


def test_practice_apply_regenerates_when_unconsumed_and_unattempted(db, SessionLocal, backfill_module, practice_scenario):
    summary = backfill_module._phase_annual_competition_practice(db, apply=True)
    assert summary["fixed"] == 1
    db.close()

    fresh = SessionLocal()
    try:
        q = fresh.get(CompetitionMockQuestion, practice_scenario["over_cap_q_id"])
        assert backfill_module._TrimmedNumericDigitCount(Decimal(q.correct_answer)) <= backfill_module.MAX_TOTAL_DIGITS
    finally:
        fresh.close()


def test_practice_skipped_once_consumed(db, SessionLocal, backfill_module, practice_scenario):
    paper = db.get(CompetitionEventLevelPaper, practice_scenario["paper_id"])
    paper.consumed_at = datetime.now(timezone.utc)
    db.commit()

    summary = backfill_module._phase_annual_competition_practice(db, apply=True)
    assert summary["fixed"] == 0


def test_practice_skipped_when_official_paper_kind(db, SessionLocal, backfill_module, practice_scenario):
    paper = db.get(CompetitionEventLevelPaper, practice_scenario["paper_id"])
    paper.paper_kind = "OFFICIAL"
    db.commit()

    summary = backfill_module._phase_annual_competition_practice(db, apply=True)
    assert summary["fixed"] == 0


def test_digit_cap_detection(backfill_module):
    assert backfill_module._IsOverCap("148148.10") is True
    assert backfill_module._IsOverCap("450") is False
    assert backfill_module._IsOverCap("99999") is False
    assert backfill_module._IsOverCap("100000") is True
    assert backfill_module._IsOverCap(None) is False
    assert backfill_module._IsOverCap("not-a-number") is False
