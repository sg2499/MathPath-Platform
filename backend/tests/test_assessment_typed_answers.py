"""Typed answers for level assessments (2026-10-11, Shailesh).

Assessments are answered in the same typed answer box as practice sheets and
the Annual Competition. These tests lock in:

- the student question payload never carries options (one of them is the
  answer), and a saved answer comes back as its text;
- a typed answer is graded with answer_matching.answers_match, the same rule
  practice sheets and the Annual Competition use; clearing an answer removes it;
- an old multiple-choice answer (option id) is still graded as before;
- the attempt and the brief carry the paper's sections in question order;
- PM-L3's assessment Section 4 is BODMAS only, while mocks keep Division &
  BODMAS (shared registry untouched).
"""
from __future__ import annotations

import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import (
    AssessmentAssignment,
    AssessmentAttemptAnswer,
    AssessmentQuestion,
    AssessmentQuestionOption,
    Level,
    Module,
    Student,
    User,
)
from app.seed.seed_preparatory_module_l3 import seed as seed_pm_l3
from app.services import assessment_blueprint_service as bp_service
from app.services.assessment_engine_service import (
    AssessmentAttemptPayload,
    AssessmentResultPayload,
    GenerateAssessmentVersion,
    SaveAssessmentAnswer,
    StartAssessmentAttempt,
    StudentAssessmentStartPayload,
    SubmitAssessmentAttempt,
)
from app.services.answer_matching import answers_match
from app.services.pm_competition_mock_generation_service import PM_COMPETITION_LEVEL_REGISTRY

DISTRIBUTION = [
    {"sectionKey": "PM_L3_ADD_LESS_ABACUS", "questionCount": 20},
    {"sectionKey": "PM_L3_ADD_LESS_VISUAL", "questionCount": 20},
    {"sectionKey": "PM_L3_MULTIPLICATION", "questionCount": 20},
    {"sectionKey": "PM_L3_DIVISION_BODMAS", "questionCount": 20},
    {"sectionKey": "PM_L3_CONCEPT_DRILL", "questionCount": 4},
]


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    models.Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def setup(db):
    seed_pm_l3(db)
    db.commit()
    module = db.query(Module).filter(Module.module_code == "PM").first()
    level = db.query(Level).filter(Level.module_id == module.id, Level.level_code == "PM-L3").first()
    admin = User(full_name="Admin", role="SUPER_ADMIN", email="admin@test.local", password_hash="x")
    student_user = User(full_name="Student", role="STUDENT", email="st@test.local", password_hash="x")
    db.add_all([admin, student_user])
    db.flush()
    student = Student(user_id=student_user.id, student_code="ST-T1", current_module_id=module.id, current_level_id=level.id)
    db.add(student)
    db.flush()
    blueprint = bp_service.create_blueprint(
        db, title="PM-L3 Assessment", module_id=module.id, level_id=level.id, total_questions=84,
        duration_seconds=3600, lesson_distribution=DISTRIBUTION, instructions=None,
        created_by_user_id=admin.id, status="PUBLISHED",
    )
    version = GenerateAssessmentVersion(db, blueprint, admin.id, "PUBLISHED")
    assignment = AssessmentAssignment(
        assessment_version_id=version.id, blueprint_id=blueprint.id, student_id=student.id, assigned_by_user_id=admin.id,
    )
    db.add(assignment)
    db.commit()
    return {"level": level, "student": student, "blueprint": blueprint, "version": version, "assignment": assignment}


def _questions(db, version):
    return db.query(AssessmentQuestion).filter(AssessmentQuestion.assessment_version_id == version.id).order_by(AssessmentQuestion.question_number).all()


def test_pm_l3_assessment_section4_is_bodmas_only(db, setup):
    questions = _questions(db, setup["version"])
    section4 = [q for q in questions if json.loads(q.metadata_json or "{}").get("assessmentSectionKey") == "PM_L3_DIVISION_BODMAS"]
    assert len(section4) == 20
    assert {q.concept_tag for q in section4} == {"BODMAS"}
    assert {json.loads(q.metadata_json)["assessmentSectionTitle"] for q in section4} == {"Section 4 - BODMAS"}
    assert not [q for q in questions if q.concept_tag == "PM_L3_DIVISION"]


def test_pm_l3_mock_registry_still_has_division_and_bodmas():
    config = PM_COMPETITION_LEVEL_REGISTRY["PM-L3"]
    titles = {d["key"]: d["title"] for d in config["sectionDefinitions"]}
    assert titles["PM_L3_DIVISION_BODMAS"] == "Section 4 - Division & BODMAS"
    assert [c["conceptFamily"] for c in config["sectionConceptPools"]["PM_L3_DIVISION_BODMAS"]] == ["PM_L3_DIVISION", "BODMAS"]


def test_every_generated_answer_is_typeable(db, setup):
    for q in _questions(db, setup["version"]):
        assert answers_match(q.correct_answer, str(q.correct_answer)), (q.question_number, q.correct_answer)


def test_brief_and_attempt_carry_sections_and_no_options(db, setup):
    brief = StudentAssessmentStartPayload(db, setup["student"], setup["assignment"].id)
    assert brief["details"]["answerType"] == "TYPED"
    assert [s["title"] for s in brief["sections"]] == [
        "Add/Less (Abacus)", "Add/Less (Visual)", "Multiplication", "BODMAS", "Concept Drill",
    ]
    assert [s["questionCount"] for s in brief["sections"]] == [20, 20, 20, 20, 4]
    assert brief["sections"][0]["firstQuestionNumber"] == 1 and brief["sections"][-1]["lastQuestionNumber"] == 84
    assert brief["sections"][-1]["marksPerQuestion"] == 5
    assert sum(s["marks"] for s in brief["sections"]) == 100
    assert not any("option" in line.lower() for line in brief["instructions"])

    attempt = StartAssessmentAttempt(db, setup["student"], setup["assignment"].id)
    payload = AssessmentAttemptPayload(db, attempt)
    assert payload["answerMode"] == "TYPED"
    assert len(payload["sections"]) == 5
    assert len(payload["questions"]) == 84
    for q in payload["questions"]:
        assert "options" not in q
        assert q["savedAnswerText"] is None


def test_typed_answers_save_clear_and_grade(db, setup):
    student = setup["student"]
    attempt = StartAssessmentAttempt(db, student, setup["assignment"].id)
    questions = _questions(db, setup["version"])
    right, wrong, cleared = questions[0], questions[1], questions[2]

    SaveAssessmentAnswer(db, student, attempt.id, right.id, AnswerText=f" {right.correct_answer} ")
    SaveAssessmentAnswer(db, student, attempt.id, wrong.id, AnswerText="999999")
    SaveAssessmentAnswer(db, student, attempt.id, cleared.id, AnswerText=str(cleared.correct_answer))
    result = SaveAssessmentAnswer(db, student, attempt.id, cleared.id, AnswerText="")
    assert result["cleared"] is True
    assert db.query(AssessmentAttemptAnswer).filter_by(assessment_attempt_id=attempt.id).count() == 2

    payload = AssessmentAttemptPayload(db, attempt)
    saved = {q["questionId"]: q["savedAnswerText"] for q in payload["questions"]}
    assert saved[right.id] == str(right.correct_answer).strip()
    assert saved[wrong.id] == "999999"
    assert saved[cleared.id] is None

    SubmitAssessmentAttempt(db, student, attempt.id)
    db.refresh(attempt)
    assert attempt.correct_count == 1
    assert attempt.attempted_count == 2

    review = AssessmentResultPayload(db, attempt)
    rows = {r["questionNumber"]: r for r in review["questionReview"]}
    assert rows[1]["isCorrect"] is True and rows[1]["answerMode"] == "TYPED"
    assert rows[2]["selectedAnswer"] == "999999" and rows[2]["isCorrect"] is False
    assert rows[2]["correctAnswer"] == str(wrong.correct_answer)
    assert rows[1]["sectionTitle"] == "Add/Less (Abacus)"


def test_too_long_answer_is_refused(db, setup):
    attempt = StartAssessmentAttempt(db, setup["student"], setup["assignment"].id)
    question = _questions(db, setup["version"])[0]
    with pytest.raises(Exception):
        SaveAssessmentAnswer(db, setup["student"], attempt.id, question.id, AnswerText="1" * 41)


def test_old_option_answer_still_graded(db, setup):
    student = setup["student"]
    attempt = StartAssessmentAttempt(db, student, setup["assignment"].id)
    question = _questions(db, setup["version"])[0]
    option = db.query(AssessmentQuestionOption).filter_by(assessment_question_id=question.id, is_correct=True).first()
    if option is None:
        pytest.skip("this version stored no options")
    SaveAssessmentAnswer(db, student, attempt.id, question.id, SelectedOptionId=option.id)
    SubmitAssessmentAttempt(db, student, attempt.id)
    db.refresh(attempt)
    assert attempt.correct_count == 1


def test_assessment_payload_sends_no_generator_notes(db, setup):
    from app.services.student_question_safety import STUDENT_SAFE_METADATA_KEYS
    attempt = StartAssessmentAttempt(db, setup["student"], setup["assignment"].id)
    for q in AssessmentAttemptPayload(db, attempt)["questions"]:
        assert set(q["metadata"]) <= STUDENT_SAFE_METADATA_KEYS
        assert q["answerFormat"] is None  # PM-L3 has no remainder answers


def test_review_rows_carry_marks(db, setup):
    student = setup["student"]
    attempt = StartAssessmentAttempt(db, student, setup["assignment"].id)
    questions = _questions(db, setup["version"])
    drill = next(q for q in questions if q.concept_tag == "CONCEPT_DRILL")
    SaveAssessmentAnswer(db, student, attempt.id, drill.id, AnswerText=str(drill.correct_answer))
    SubmitAssessmentAttempt(db, student, attempt.id)
    rows = {r["questionNumber"]: r for r in AssessmentResultPayload(db, attempt)["questionReview"]}
    assert rows[drill.question_number]["marks"] == 5 and rows[drill.question_number]["marksAwarded"] == 5
    assert rows[1]["marks"] == 1 and rows[1]["marksAwarded"] == 0 and rows[1]["isUnanswered"] is True
    assert sum(r["marks"] for r in rows.values()) == 100
