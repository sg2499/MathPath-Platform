"""Regression coverage for scripts/backfill_mm_financial_instructions.py
(2026-09-15, Shailesh): "as for the profit and loss sheets if we can
backfill the sheets already assigned to the relevant students but not yet
attempted then it'll be really helpful, as the newly published ones would
obviously have the corrected logic."

Exercises the actual script module (loaded by file path, matching the
convention test_backfill_dps_scientific_notation_regrade.py already
established for this directory) against synthetic DPS/Assessment/Mock data
standing in for the real bug shape: a financial-family question row whose
question_text is missing or garbled, alongside the metadata (concept_family,
answer_kind) every one of these generators always writes regardless of
whether question_text itself was set.
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.models import models
from app.models.models import (
    Assignment,
    AssessmentAssignment,
    AssessmentAttempt,
    AssessmentBlueprint,
    AssessmentQuestion,
    AssessmentVersion,
    Attempt,
    CompetitionMockAssignment,
    CompetitionMockAttempt,
    CompetitionMockExam,
    CompetitionMockQuestion,
    DPS,
    GeneratedQuestion,
    GeneratedQuestionSet,
    Lesson,
    Level,
    Module,
    Student,
    User,
)

_SCRIPT_PATH = Path(__file__).resolve().parent.parent / "scripts" / "backfill_mm_financial_instructions.py"


@pytest.fixture()
def backfill_module():
    spec = importlib.util.spec_from_file_location("backfill_mm_financial_instructions", _SCRIPT_PATH)
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


def _make_user_student(db, code):
    user = User(full_name=code, email=f"{code.lower()}@test.local", password_hash="x", role="STUDENT")
    db.add(user)
    db.commit()
    student = Student(user_id=user.id, student_code=code)
    db.add(student)
    db.commit()
    return student


def _profit_loss_metadata(answer_kind: str) -> str:
    return json.dumps({
        "concept_family": "PROFIT_LOSS",
        "financial_mode": "LOSS" if "LOSS" in answer_kind else "PROFIT",
        "answer_kind": answer_kind,
        "question_text": {"LOSS": "Find Loss", "LOSS_PERCENT": "Find Loss %", "PROFIT_PERCENT": "Find Profit %", "PROFIT": "Find Profit"}[answer_kind],
    })


def _simple_interest_metadata() -> str:
    return json.dumps({"concept_family": "SIMPLE_INTEREST", "financial_mode": "SIMPLE_INTEREST", "question_text": "Find Simple Interest"})


def _unrelated_metadata() -> str:
    return json.dumps({"concept_family": "ADD_LESS"})


@pytest.fixture()
def dps_world(db):
    """One DPS with two Profit/Loss questions (broken question_text) and
    one unrelated ADD_LESS question (must never be touched), assigned to
    two students: `fresh` has no attempt at all (in scope), `attempted` has
    already submitted (must be left untouched).
    """
    module = Module(module_code="MM", module_name="Master Module")
    db.add(module)
    db.commit()
    level = Level(module_id=module.id, level_code="MM-L1", level_name="Master Module Level 1")
    db.add(level)
    db.commit()
    lesson = Lesson(level_id=level.id, lesson_number=16, lesson_title="Lesson 16")
    db.add(lesson)
    db.commit()
    dps = DPS(lesson_id=lesson.id, dps_number=1, dps_title="Profit and Loss Practice", default_duration_seconds=600, publication_status="PUBLISHED")
    db.add(dps)
    db.commit()

    fresh = _make_user_student(db, "MP-ST-FRESH")
    attempted = _make_user_student(db, "MP-ST-ATTEMPTED")

    rows = {}
    for label, student in (("fresh", fresh), ("attempted", attempted)):
        assignment = Assignment(
            assignment_type="DPS", dps_id=dps.id, assigned_to_type="STUDENT", assigned_to_id=student.id,
            title="Profit and Loss Practice", is_active=True,
        )
        db.add(assignment)
        db.commit()
        qset = GeneratedQuestionSet(assignment_id=assignment.id, dps_id=dps.id, student_id=student.id, mode="PRACTICE", seed=f"SEED-{label}")
        db.add(qset)
        db.commit()

        q_loss = GeneratedQuestion(
            question_set_id=qset.id, question_number=1, display_type="FINANCIAL_TABLE",
            question_text=None, operands_json="[3200, 15]", operators_json='["Cost Price", "Loss %"]',
            correct_answer="480", seed=f"{label}-q1", metadata_json=_profit_loss_metadata("LOSS"),
        )
        q_profit_percent = GeneratedQuestion(
            question_set_id=qset.id, question_number=2, display_type="FINANCIAL_TABLE",
            question_text="3200 Selling Price 4500", operands_json="[3200, 4500]", operators_json='["Cost Price", "Selling Price"]',
            correct_answer="40.63", seed=f"{label}-q2", metadata_json=_profit_loss_metadata("PROFIT_PERCENT"),
        )
        q_unrelated = GeneratedQuestion(
            question_set_id=qset.id, question_number=3, display_type="VISUAL_STACK",
            question_text=None, operands_json="[10, 5]", operators_json='["", "+"]',
            correct_answer="15", seed=f"{label}-q3", metadata_json=_unrelated_metadata(),
        )
        db.add_all([q_loss, q_profit_percent, q_unrelated])
        db.commit()
        rows[label] = {"student": student, "dps": dps, "q_loss": q_loss, "q_profit_percent": q_profit_percent, "q_unrelated": q_unrelated}

    now = datetime.now(timezone.utc)
    attempt = Attempt(
        dps_id=dps.id, student_id=attempted.id, mode="PRACTICE", status="SUBMITTED",
        attempt_number=0, started_at=now - timedelta(minutes=10), submitted_at=now,
        expires_at=now + timedelta(seconds=600), duration_seconds=600,
        total_questions=3, attempted_count=3, accuracy_percentage=100,
    )
    db.add(attempt)
    db.commit()

    return rows


def test_dry_run_fixes_only_the_unattempted_students_financial_rows(db, backfill_module, dps_world):
    summary = backfill_module._phase_dps(db, apply=False)
    assert summary["fixed"] == 2  # fresh student's q_loss + q_profit_percent only

    db.expire_all()
    fresh = dps_world["fresh"]
    attempted = dps_world["attempted"]
    # Dry run: nothing written yet.
    assert db.get(GeneratedQuestion, fresh["q_loss"].id).question_text is None
    assert db.get(GeneratedQuestion, attempted["q_loss"].id).question_text is None


def test_apply_fixes_fresh_student_leaves_attempted_student_untouched(db, backfill_module, dps_world):
    backfill_module._phase_dps(db, apply=True)
    db.expire_all()

    fresh = dps_world["fresh"]
    attempted = dps_world["attempted"]

    assert db.get(GeneratedQuestion, fresh["q_loss"].id).question_text == "Find Loss"
    assert db.get(GeneratedQuestion, fresh["q_profit_percent"].id).question_text == "Find Profit %"
    # Unrelated concept family (ADD_LESS) never touched.
    assert db.get(GeneratedQuestion, fresh["q_unrelated"].id).question_text is None

    # The already-attempted student's rows are completely untouched, even
    # though their question_text is identically broken.
    assert db.get(GeneratedQuestion, attempted["q_loss"].id).question_text is None
    assert db.get(GeneratedQuestion, attempted["q_profit_percent"].id).question_text == "3200 Selling Price 4500"

    # Nothing but question_text ever changes.
    assert db.get(GeneratedQuestion, fresh["q_loss"].id).correct_answer == "480"
    assert db.get(GeneratedQuestion, fresh["q_loss"].id).operands_json == "[3200, 15]"


def test_apply_is_idempotent(db, backfill_module, dps_world):
    first = backfill_module._phase_dps(db, apply=True)
    assert first["fixed"] == 2
    second = backfill_module._phase_dps(db, apply=True)
    assert second["fixed"] == 0


def test_inactive_assignment_is_not_touched(db, backfill_module, dps_world):
    fresh = dps_world["fresh"]
    assignment = (
        db.query(Assignment)
        .filter(Assignment.assigned_to_id == fresh["student"].id, Assignment.dps_id == fresh["dps"].id)
        .one()
    )
    assignment.is_active = False
    db.commit()

    summary = backfill_module._phase_dps(db, apply=True)
    assert summary["fixed"] == 0
    db.expire_all()
    assert db.get(GeneratedQuestion, fresh["q_loss"].id).question_text is None


@pytest.fixture()
def assessment_world(db):
    """Two AssessmentVersions sharing the same blueprint: `clean` has an
    assignment and zero attempts anywhere (in scope), `touched` has an
    assignment AND one attempt from some student (must be left completely
    untouched, even for the rows/students that never personally attempted).
    """
    module = Module(module_code="MM", module_name="Master Module")
    db.add(module)
    db.commit()
    level = Level(module_id=module.id, level_code="MM-L1", level_name="Master Module Level 1")
    db.add(level)
    db.commit()
    blueprint = AssessmentBlueprint(
        title="MM-L1 Assessment", module_id=module.id, level_id=level.id,
        total_questions=10, marks_per_question=1, duration_seconds=1200,
    )
    db.add(blueprint)
    db.commit()

    student_a = _make_user_student(db, "MP-ST-ASMT-A")
    student_b = _make_user_student(db, "MP-ST-ASMT-B")

    versions = {}
    for label, version_number in (("clean", 1), ("touched", 2)):
        version = AssessmentVersion(
            blueprint_id=blueprint.id, version_number=version_number, total_questions=1,
            marks_per_question=1, duration_seconds=600,
        )
        db.add(version)
        db.commit()
        question = AssessmentQuestion(
            assessment_version_id=version.id, question_number=1, lesson_question_number=1,
            display_type="FINANCIAL_TABLE", question_text=None if label == "clean" else None,
            operands_json="[5000, 8]", operators_json='["Principal", "Rate"]',
            correct_answer="400", concept_tag="SIMPLE_INTEREST", seed=f"{label}-seed",
            metadata_json=_simple_interest_metadata(),
        )
        db.add(question)
        db.commit()
        versions[label] = {"version": version, "question": question}

    db.add(AssessmentAssignment(assessment_version_id=versions["clean"]["version"].id, blueprint_id=blueprint.id, student_id=student_a.id))
    db.add(AssessmentAssignment(assessment_version_id=versions["touched"]["version"].id, blueprint_id=blueprint.id, student_id=student_a.id))
    db.add(AssessmentAssignment(assessment_version_id=versions["touched"]["version"].id, blueprint_id=blueprint.id, student_id=student_b.id))
    db.commit()

    now = datetime.now(timezone.utc)
    touched_assignment = (
        db.query(AssessmentAssignment)
        .filter(AssessmentAssignment.assessment_version_id == versions["touched"]["version"].id, AssessmentAssignment.student_id == student_b.id)
        .one()
    )
    db.add(AssessmentAttempt(
        assessment_assignment_id=touched_assignment.id, assessment_version_id=versions["touched"]["version"].id,
        student_id=student_b.id, attempt_number=1, status="SUBMITTED",
        started_at=now - timedelta(minutes=5), expires_at=now + timedelta(seconds=600), submitted_at=now,
        duration_seconds=600, total_questions=1,
    ))
    db.commit()

    return versions


def test_assessment_backfill_only_touches_the_version_with_zero_attempts(db, backfill_module, assessment_world):
    summary = backfill_module._phase_assessment(db, apply=True)
    assert summary["fixed"] == 1
    db.expire_all()
    assert db.get(AssessmentQuestion, assessment_world["clean"]["question"].id).question_text == "Find Simple Interest"
    # `touched` version has an attempt from student_b -- student_a's own
    # never-attempted assignment on the SAME version does not carve out an
    # exception; the whole shared version stays untouched.
    assert db.get(AssessmentQuestion, assessment_world["touched"]["question"].id).question_text is None


@pytest.fixture()
def mock_world(db):
    module = Module(module_code="MM", module_name="Master Module")
    db.add(module)
    db.commit()
    level = Level(module_id=module.id, level_code="MM-L1", level_name="Master Module Level 1")
    db.add(level)
    db.commit()
    student = _make_user_student(db, "MP-ST-MOCK")

    exam = CompetitionMockExam(
        title="MM-L1 Mock", module_id=module.id, level_id=level.id,
        total_questions=1, duration_seconds=600,
    )
    db.add(exam)
    db.commit()
    question = CompetitionMockQuestion(
        mock_exam_id=exam.id, question_number=1, display_type="FINANCIAL_TABLE",
        question_text=None, operands_json="[2000, 12]", operators_json='["Selling Price", "Profit %"]',
        correct_answer="1786", concept_family="FIND_COST_PRICE", seed="mock-seed",
        metadata_json=json.dumps({"concept_family": "FIND_COST_PRICE", "financial_mode": "FIND_COST_PRICE"}),
    )
    db.add(question)
    db.commit()
    db.add(CompetitionMockAssignment(mock_exam_id=exam.id, student_id=student.id))
    db.commit()

    return {"exam": exam, "question": question, "student": student}


def test_mock_backfill_fixes_unassigned_never_attempted_exam(db, backfill_module, mock_world):
    summary = backfill_module._phase_mock(db, apply=True)
    assert summary["fixed"] == 1
    db.expire_all()
    assert db.get(CompetitionMockQuestion, mock_world["question"].id).question_text == "Find Cost Price"


def test_mock_backfill_skips_an_exam_with_any_attempt(db, backfill_module, mock_world):
    now = datetime.now(timezone.utc)
    assignment = db.query(CompetitionMockAssignment).filter(CompetitionMockAssignment.mock_exam_id == mock_world["exam"].id).one()
    db.add(CompetitionMockAttempt(
        mock_assignment_id=assignment.id, mock_exam_id=mock_world["exam"].id, student_id=mock_world["student"].id,
        attempt_number=1, status="SUBMITTED", started_at=now - timedelta(minutes=5),
        expires_at=now + timedelta(seconds=600), submitted_at=now, duration_seconds=600,
    ))
    db.commit()

    summary = backfill_module._phase_mock(db, apply=True)
    assert summary["fixed"] == 0
    db.expire_all()
    assert db.get(CompetitionMockQuestion, mock_world["question"].id).question_text is None
