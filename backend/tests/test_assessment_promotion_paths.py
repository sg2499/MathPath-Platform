"""Promotion after a cleared level assessment (2026-10-11, Shailesh).

Locks in, for all 11 levels, where a cleared assessment sends the student
(the three enrolment paths: YLM-L1 -> PM-L2, PM-L1 -> ... -> PM-L4 -> IM-L1,
BM-L1 -> IM-L1, then IM -> MM), and the guards:

- a result for a level the student has already left never promotes them
  again (it used to move a student backwards or sideways);
- the test account MP-ST-001 is never promoted, can retake any assessment,
  and is given every published assessment.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import (
    AssessmentAssignment,
    AssessmentAttempt,
    AssessmentBlueprint,
    AssessmentQuestion,
    AssessmentResult,
    AssessmentReattemptApproval,
    AssessmentVersion,
    Level,
    Module,
    Student,
    User,
)
from app.services import schema_migration
from app.services.assessment_engine_service import (
    AssessmentProgressionPayload,
    EnsureOpenAccessAssessmentAssignments,
    PromoteAssessmentStudentToNextLevel,
    StartAssessmentAttempt,
    StudentAssessmentStartPayload,
    SubmitAssessmentAttempt,
)

MODULES = [("YLM", 1, ["YLM-L1"]), ("PM", 2, ["PM-L1", "PM-L2", "PM-L3", "PM-L4"]), ("BM", 3, ["BM-L1"]),
           ("IM", 4, ["IM-L1", "IM-L2", "IM-L3", "IM-L4"]), ("MM", 5, ["MM-L1"])]

EXPECTED_NEXT = {
    "YLM-L1": "PM-L2",
    "PM-L1": "PM-L2", "PM-L2": "PM-L3", "PM-L3": "PM-L4", "PM-L4": "IM-L1",
    "BM-L1": "IM-L1",
    "IM-L1": "IM-L2", "IM-L2": "IM-L3", "IM-L3": "IM-L4", "IM-L4": "MM-L1",
    "MM-L1": None,
}
NOW = datetime(2026, 10, 1, tzinfo=timezone.utc)


@pytest.fixture()
def db(monkeypatch):
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    models.Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)()
    for code, order, level_codes in MODULES:
        module = Module(module_code=code, module_name=code, display_order=order, is_active=True)
        session.add(module)
        session.flush()
        for number, level_code in enumerate(level_codes, start=1):
            session.add(Level(module_id=module.id, level_code=level_code, level_name=level_code,
                              internal_level_number=number, display_order=number, is_active=True))
    session.add(User(full_name="Admin", role="SUPER_ADMIN", email="admin@test.local", password_hash="x"))
    session.commit()
    # The real startup sync, run against this database.
    monkeypatch.setattr(schema_migration, "engine", engine)
    schema_migration.ensure_level_next_level_id_column()
    session.expire_all()
    try:
        yield session
    finally:
        session.close()


def _levels(db):
    return {level.level_code: level for level in db.query(Level).all()}


def _student(db, level, code):
    user = User(full_name=code, role="STUDENT", email=f"{code.lower()}@test.local", password_hash="x")
    db.add(user)
    db.flush()
    student = Student(user_id=user.id, student_code=code, current_module_id=level.module_id, current_level_id=level.id)
    db.add(student)
    db.flush()
    return student


def _published(db, level, questions=1):
    blueprint = AssessmentBlueprint(title=f"{level.level_code} Assessment", module_id=level.module_id, level_id=level.id,
                                    total_questions=questions, marks_per_question=100 / questions, total_marks=100,
                                    duration_seconds=600, status="PUBLISHED", is_active=True)
    db.add(blueprint)
    db.flush()
    version = AssessmentVersion(blueprint_id=blueprint.id, version_number=1, status="PUBLISHED", total_questions=questions,
                                marks_per_question=100 / questions, total_marks=100, duration_seconds=600, is_active=True)
    db.add(version)
    db.flush()
    for number in range(1, questions + 1):
        db.add(AssessmentQuestion(assessment_version_id=version.id, question_number=number, lesson_question_number=number, display_type="EXPRESSION_WORKSHEET",
                                  question_text="2 + 3", correct_answer="5", seed=f"T-{number}"))
    db.flush()
    return blueprint, version


def _cleared(db, student, level):
    blueprint, version = _published(db, level)
    assignment = AssessmentAssignment(assessment_version_id=version.id, blueprint_id=blueprint.id, student_id=student.id,
                                      status="CLEARED", is_active=True)
    db.add(assignment)
    db.flush()
    attempt = AssessmentAttempt(assessment_assignment_id=assignment.id, assessment_version_id=version.id, student_id=student.id,
                                attempt_number=1, status="CLEARED", result_status="CLEARED", started_at=NOW, expires_at=NOW,
                                submitted_at=NOW, duration_seconds=600, total_questions=1, max_score=100)
    db.add(attempt)
    db.flush()
    db.add(AssessmentResult(assessment_attempt_id=attempt.id, assessment_assignment_id=assignment.id,
                            assessment_version_id=version.id, blueprint_id=blueprint.id, student_id=student.id,
                            score=90, max_score=100, percentage=90, performance_band="EXCELLENT", result_status="CLEARED",
                            cleared=True, level_cleared=True, completion_date=NOW))
    db.commit()
    return assignment


@pytest.mark.parametrize("from_code", list(EXPECTED_NEXT))
def test_cleared_assessment_promotes_to_the_right_level(db, from_code):
    levels = _levels(db)
    student = _student(db, levels[from_code], f"ST-{from_code}")
    assignment = _cleared(db, student, levels[from_code])
    expected = EXPECTED_NEXT[from_code]
    if expected is None:
        with pytest.raises(HTTPException) as error:
            PromoteAssessmentStudentToNextLevel(db, assignment.id)
        assert error.value.detail["code"] == "NEXT_LEVEL_SETUP_REQUIRED"
        return
    result = PromoteAssessmentStudentToNextLevel(db, assignment.id)
    db.refresh(student)
    assert result["promoted"] is True
    assert student.current_level_id == levels[expected].id
    assert student.current_module_id == levels[expected].module_id


def test_result_for_a_level_already_left_never_promotes(db):
    levels = _levels(db)
    student = _student(db, levels["IM-L1"], "ST-STALE")
    assignment = _cleared(db, student, levels["IM-L1"])
    # Moved on by hand to IM-L3 before anyone pressed Promote on the IM-L1 result.
    student.current_level_id = levels["IM-L3"].id
    db.commit()
    progression = AssessmentProgressionPayload(db, assignment, LevelItem=levels["IM-L1"])
    assert progression["promotionCanProceed"] is False
    with pytest.raises(HTTPException) as error:
        PromoteAssessmentStudentToNextLevel(db, assignment.id)
    assert error.value.detail["code"] == "PROMOTION_LEVEL_MISMATCH"
    db.refresh(student)
    assert student.current_level_id == levels["IM-L3"].id


def test_second_promotion_from_same_result_is_a_no_op(db):
    levels = _levels(db)
    student = _student(db, levels["PM-L2"], "ST-TWICE")
    assignment = _cleared(db, student, levels["PM-L2"])
    assert PromoteAssessmentStudentToNextLevel(db, assignment.id)["promoted"] is True
    again = PromoteAssessmentStudentToNextLevel(db, assignment.id)
    assert again["promoted"] is False and again["alreadyPromoted"] is True
    db.refresh(student)
    assert student.current_level_id == levels["PM-L3"].id


def test_test_account_is_never_promoted(db):
    levels = _levels(db)
    tester = _student(db, levels["PM-L1"], "MP-ST-001")
    assignment = _cleared(db, tester, levels["PM-L1"])
    progression = AssessmentProgressionPayload(db, assignment, LevelItem=levels["PM-L1"])
    assert progression["promotionCanProceed"] is False
    with pytest.raises(HTTPException) as error:
        PromoteAssessmentStudentToNextLevel(db, assignment.id)
    assert error.value.detail["code"] == "TEST_ACCOUNT_NOT_PROMOTED"
    db.refresh(tester)
    assert tester.current_level_id == levels["PM-L1"].id


def test_test_account_gets_every_published_assessment_and_can_retake(db):
    levels = _levels(db)
    tester = _student(db, levels["PM-L1"], "MP-ST-001")
    other = _student(db, levels["PM-L1"], "ST-OTHER")
    for code in ("YLM-L1", "PM-L3", "IM-L2"):
        _published(db, levels[code])
    db.commit()

    assert EnsureOpenAccessAssessmentAssignments(db, other) == 0
    assert EnsureOpenAccessAssessmentAssignments(db, tester) == 3
    assert EnsureOpenAccessAssessmentAssignments(db, tester) == 0  # never duplicated

    assignment = db.query(AssessmentAssignment).filter_by(student_id=tester.id).first()
    first = StartAssessmentAttempt(db, tester, assignment.id)
    SubmitAssessmentAttempt(db, tester, first.id)  # 0% -> needs a re-attempt
    db.refresh(first)
    assert first.status == "NEEDS_RE_ATTEMPT"
    assert db.query(AssessmentReattemptApproval).count() == 0  # no approval request for the test account

    brief = StudentAssessmentStartPayload(db, tester, assignment.id)
    assert brief["action"] == "View Result" and brief["canRetake"] is True
    second = StartAssessmentAttempt(db, tester, assignment.id)
    assert second.id != first.id and second.attempt_number == 2 and second.status == "IN_PROGRESS"


def test_regular_student_cannot_retake_without_approval(db):
    levels = _levels(db)
    student = _student(db, levels["PM-L1"], "ST-REG")
    blueprint, version = _published(db, levels["PM-L1"])
    assignment = AssessmentAssignment(assessment_version_id=version.id, blueprint_id=blueprint.id, student_id=student.id, is_active=True)
    db.add(assignment)
    db.commit()
    attempt = StartAssessmentAttempt(db, student, assignment.id)
    SubmitAssessmentAttempt(db, student, attempt.id)
    assert StudentAssessmentStartPayload(db, student, assignment.id)["canRetake"] is False
    with pytest.raises(HTTPException) as error:
        StartAssessmentAttempt(db, student, assignment.id)
    assert error.value.detail["code"] == "ASSESSMENT_ALREADY_ATTEMPTED"
