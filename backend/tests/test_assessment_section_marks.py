"""Admin-set marks per question for each assessment section (2026-11-02, Shailesh).

"while creating the assessments where the admin allots the number of
questions in each section, there we also provide the option for alotting the
marks per question for each section ... still totalling the total marks of
the exam to 100." Decisions: whole numbers only; every section listed, but a
section may be left out (0 questions) in special cases; sections start at
today's marks (1, or 5 for Skill Stacker / Concept Drill); new papers only.
"""
from __future__ import annotations

import json

import pytest
from fastapi import HTTPException

from app.models.models import AssessmentBlueprintSection, AssessmentQuestion
from app.services import assessment_blueprint_service as bp_service
from app.services import assessment_engine_service as engine
from tests.test_assessment_typed_answers import db, setup  # noqa: F401  (fixtures)

# PM-L3 sections: Add/Less (Abacus), Add/Less (Visual), Multiplication,
# BODMAS, Concept Drill (5 marks by default).
KEYS = ["PM_L3_ADD_LESS_ABACUS", "PM_L3_ADD_LESS_VISUAL", "PM_L3_MULTIPLICATION", "PM_L3_DIVISION_BODMAS", "PM_L3_CONCEPT_DRILL"]


def _create(db, setup, rows, status="PUBLISHED"):
    level = setup["level"]
    return bp_service.create_blueprint(
        db, title="Custom Marks", module_id=level.module_id, level_id=level.id,
        total_questions=sum(row["questionCount"] for row in rows), duration_seconds=3600,
        lesson_distribution=rows, instructions=None, created_by_user_id=None, status=status,
    )


def _questions(db, blueprint):
    version = db.query(engine.AssessmentVersion).filter_by(blueprint_id=blueprint.id, status="PUBLISHED").one()
    return version, db.query(AssessmentQuestion).filter_by(assessment_version_id=version.id).order_by(AssessmentQuestion.question_number).all()


def test_custom_marks_are_saved_and_fixed_on_every_question(db, setup):
    # 10x2 + 10x2 + 10x2 + 10x3 + 2x5 = 100 marks from 42 questions.
    rows = [
        {"sectionKey": KEYS[0], "questionCount": 10, "marksPerQuestion": 2},
        {"sectionKey": KEYS[1], "questionCount": 10, "marksPerQuestion": 2},
        {"sectionKey": KEYS[2], "questionCount": 10, "marksPerQuestion": 2},
        {"sectionKey": KEYS[3], "questionCount": 10, "marksPerQuestion": 3},
        {"sectionKey": KEYS[4], "questionCount": 2, "marksPerQuestion": 5},
    ]
    blueprint = _create(db, setup, rows)
    saved = {row.section_key: row.marks_per_question for row in db.query(AssessmentBlueprintSection).filter_by(blueprint_id=blueprint.id)}
    assert saved == {KEYS[0]: 2, KEYS[1]: 2, KEYS[2]: 2, KEYS[3]: 3, KEYS[4]: 5}

    version, questions = _questions(db, blueprint)
    assert len(questions) == 42 and version.total_marks == 100
    by_section = {}
    for question in questions:
        key = json.loads(question.metadata_json)["assessmentSectionKey"]
        by_section.setdefault(key, set()).add(question.marks)
        assert engine.ResolvedAssessmentQuestionMark(db, version, question) == question.marks
    assert by_section == {KEYS[0]: {2.0}, KEYS[1]: {2.0}, KEYS[2]: {2.0}, KEYS[3]: {3.0}, KEYS[4]: {5.0}}

    sections = engine.AssessmentVersionSections(db, version)
    assert [section["marksPerQuestion"] for section in sections] == [2, 2, 2, 3, 5]
    assert sum(section["marks"] for section in sections) == 100


def test_a_correct_answer_earns_the_section_marks(db, setup):
    rows = [
        {"sectionKey": KEYS[0], "questionCount": 10, "marksPerQuestion": 4},
        {"sectionKey": KEYS[1], "questionCount": 10, "marksPerQuestion": 2},
        {"sectionKey": KEYS[2], "questionCount": 10, "marksPerQuestion": 2},
        {"sectionKey": KEYS[3], "questionCount": 10, "marksPerQuestion": 1},
        {"sectionKey": KEYS[4], "questionCount": 2, "marksPerQuestion": 5},
    ]
    blueprint = _create(db, setup, rows)
    version, questions = _questions(db, blueprint)
    setup["assignment"].assessment_version_id = version.id
    setup["assignment"].blueprint_id = blueprint.id
    db.commit()
    attempt = engine.StartAssessmentAttempt(db, setup["student"], setup["assignment"].id)
    first = questions[0]
    engine.SaveAssessmentAnswer(db, setup["student"], attempt.id, first.id, AnswerText=first.correct_answer.split(",")[0].strip() if "," not in first.correct_answer else first.correct_answer)
    result = engine.SubmitAssessmentAttempt(db, setup["student"], attempt.id)
    assert result.max_score == 100
    assert result.total_score == 4  # one correct 4-mark question


def test_a_section_can_be_left_out_and_the_rest_are_numbered_in_order(db, setup):
    rows = [
        {"sectionKey": KEYS[0], "questionCount": 25, "marksPerQuestion": 1},
        {"sectionKey": KEYS[1], "questionCount": 0, "marksPerQuestion": 1},  # left out
        {"sectionKey": KEYS[2], "questionCount": 25, "marksPerQuestion": 1},
        {"sectionKey": KEYS[3], "questionCount": 25, "marksPerQuestion": 2},
        {"sectionKey": KEYS[4], "questionCount": 0, "marksPerQuestion": 5},  # left out
    ]
    blueprint = _create(db, setup, rows)
    version, questions = _questions(db, blueprint)
    assert len(questions) == 75
    sections = engine.AssessmentVersionSections(db, version)
    assert [section["sectionNumber"] for section in sections] == [1, 2, 3]
    assert [section["title"] for section in sections] == ["Add/Less (Abacus)", "Multiplication", "BODMAS"]
    titles = {json.loads(q.metadata_json)["assessmentSectionTitle"] for q in questions}
    assert titles == {"Section 1 - Add/Less (Abacus)", "Section 2 - Multiplication", "Section 3 - BODMAS"}
    payload = bp_service.blueprint_payload(db, blueprint)
    assert [row["included"] for row in payload["sectionDistribution"]] == [True, False, True, True, False]


@pytest.mark.parametrize(
    "bad_rows, code",
    [
        ([{"sectionKey": k, "questionCount": 21, "marksPerQuestion": 1} for k in KEYS], "ASSESSMENT_MARKS_MISMATCH"),
        ([{"sectionKey": k, "questionCount": 20, "marksPerQuestion": "1.5" if k == KEYS[0] else 1} for k in KEYS], "INVALID_SECTION_MARKS"),
        ([{"sectionKey": k, "questionCount": 20, "marksPerQuestion": 0} for k in KEYS], "INVALID_SECTION_MARKS"),
        ([{"sectionKey": k, "questionCount": 0, "marksPerQuestion": 1} for k in KEYS], "ASSESSMENT_NEEDS_A_SECTION"),
        ([{"sectionKey": k, "questionCount": 25, "marksPerQuestion": 1} for k in KEYS[:4]], "FULL_SECTION_COVERAGE_REQUIRED"),
        ([{"sectionKey": k, "questionCount": -1 if k == KEYS[0] else 25, "marksPerQuestion": 1} for k in KEYS], "INVALID_QUESTION_COUNT"),
    ],
)
def test_bad_structures_are_refused(db, setup, bad_rows, code):
    total = max(1, sum(max(0, row["questionCount"]) for row in bad_rows))
    level = setup["level"]
    with pytest.raises(HTTPException) as error:
        bp_service.create_blueprint(
            db, title="Bad", module_id=level.module_id, level_id=level.id, total_questions=total,
            duration_seconds=3600, lesson_distribution=bad_rows, instructions=None, created_by_user_id=None, status="DRAFT",
        )
    assert error.value.detail["code"] == code


def test_rows_without_marks_use_todays_defaults(db, setup):
    # An older screen sends no marks: 1 each, 5 for Concept Drill (20x4 + 4x5 = 100).
    rows = [{"sectionKey": k, "questionCount": 4 if k == KEYS[4] else 20} for k in KEYS]
    blueprint = _create(db, setup, rows)
    saved = {row.section_key: row.marks_per_question for row in db.query(AssessmentBlueprintSection).filter_by(blueprint_id=blueprint.id)}
    assert saved == {KEYS[0]: 1, KEYS[1]: 1, KEYS[2]: 1, KEYS[3]: 1, KEYS[4]: 5}


def test_papers_generated_before_keep_their_old_marks(db, setup):
    # setup's paper was generated by the same engine; clearing the stored marks
    # recreates a pre-change paper: marks then come from the old concept rule.
    version = setup["version"]
    questions = db.query(AssessmentQuestion).filter_by(assessment_version_id=version.id).all()
    for question in questions:
        question.marks = None
    db.commit()
    marks = [engine.ResolvedAssessmentQuestionMark(db, version, q) for q in questions]
    assert sum(marks) == 100
    assert {q.concept_tag for q, m in zip(questions, marks) if m == 5} == {"CONCEPT_DRILL"}


def test_the_admin_request_keeps_the_marks(db, setup):
    from app.api.routes_admin import AssessmentLessonDistributionRequest

    row = AssessmentLessonDistributionRequest(sectionKey=KEYS[0], questionCount=10, marksPerQuestion=3)
    assert row.model_dump()["marksPerQuestion"] == 3
