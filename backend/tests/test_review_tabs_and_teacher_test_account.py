"""Result review data and teacher access for the test account (2026-10-11).

- Every result review row says which section it belongs to and what it was
  worth, so the result pages can show section blocks and a section-wise
  scorecard: practice sheets (section marks override respected) and level
  assessments (concept-weighted marks).
- A teacher who has the test account MP-ST-001 in class sees every published
  level's assessment and can assign any of them to it, with no level,
  readiness or one-per-level rule; an assessment it already holds is taken
  over (no duplicate). The teacher's other students keep every rule.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import routes_teacher
from app.models import models
from app.models.models import (
    AssessmentAssignment,
    AssessmentBlueprint,
    AssessmentQuestion,
    AssessmentVersion,
    Attempt,
    AttemptAnswer,
    DPS,
    DPSSection,
    GeneratedQuestion,
    Lesson,
    Level,
    Module,
    Student,
    Teacher,
    User,
)
from app.seed.seed_master_module import seed as seed_master_module
from app.services.attempt_service import result_payload
from app.services.generation_service import persist_question_set

NOW = datetime(2026, 10, 1, tzinfo=timezone.utc)


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    models.Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)()
    try:
        yield session
    finally:
        session.close()


def _user(db, name, role):
    user = User(full_name=name, role=role, email=f"{name.replace(' ', '.').lower()}@test.local", password_hash="x")
    db.add(user)
    db.flush()
    return user


# ---------- practice sheet review rows ----------

def test_practice_review_rows_carry_section_and_marks(db):
    seed_master_module(db)
    db.commit()
    student = Student(user_id=_user(db, "Practice Student", "STUDENT").id, student_code="ST-PR")
    db.add(student)
    db.flush()
    # An MM-L1 sheet with more than one section, one of them weighted.
    sheets = (
        db.query(DPS).join(Lesson, Lesson.id == DPS.lesson_id).join(Level, Level.id == Lesson.level_id)
        .filter(Level.level_code == "MM-L1").order_by(Lesson.lesson_number, DPS.dps_number).all()
    )
    dps = next(d for d in sheets if db.query(DPSSection).filter_by(dps_id=d.id).count() > 1)
    sections = {s.id: s for s in db.query(DPSSection).filter_by(dps_id=dps.id).all()}
    weighted = next(iter(sections.values()))
    weighted.marks_per_question = 5
    db.commit()
    for tries in range(5):
        try:
            qset = persist_question_set(db, dps, None, student.id, "PRACTICE", f"REVIEW-{tries}")
            break
        except ValueError:
            db.rollback()
    questions = db.query(GeneratedQuestion).filter_by(question_set_id=qset.id).order_by(GeneratedQuestion.question_number).all()
    attempt = Attempt(dps_id=dps.id, question_set_id=qset.id, student_id=student.id, mode="PRACTICE", status="SUBMITTED",
                      started_at=NOW, expires_at=NOW + timedelta(seconds=900), duration_seconds=900,
                      total_questions=len(questions), max_score=len(questions))
    db.add(attempt)
    db.flush()
    right = questions[0]
    db.add(AttemptAnswer(attempt_id=attempt.id, question_id=right.id, selected_value=str(right.correct_answer), is_correct=True))
    db.commit()

    rows = result_payload(db, attempt)["questionReview"]
    assert len(rows) == len(questions)
    by_id = {row["questionId"]: row for row in rows}
    for q in questions:
        row = by_id[q.id]
        section = sections.get(q.dps_section_id)
        assert row["sectionNumber"] == (section.section_number if section else None)
        assert row["sectionTitle"] == (section.section_title if section else None)
        expected_marks = 5.0 if section is weighted else float(dps.marks_per_question or 1)
        assert row["marks"] == expected_marks
    assert by_id[right.id]["marksAwarded"] == by_id[right.id]["marks"]
    assert by_id[right.id]["isUnanswered"] is False
    others = [row for row in rows if row["questionId"] != right.id]
    assert all(row["marksAwarded"] == 0 and row["isUnanswered"] for row in others)


# ---------- teacher and the test account ----------

def _setup_teacher(db):
    modules = {}
    for code, order in (("YLM", 1), ("PM", 2), ("IM", 4)):
        modules[code] = Module(module_code=code, module_name=code, display_order=order, is_active=True)
        db.add(modules[code])
    db.flush()
    levels = {}
    for code, module, number in (("YLM-L1", "YLM", 1), ("PM-L1", "PM", 1), ("PM-L3", "PM", 3), ("IM-L2", "IM", 2)):
        levels[code] = Level(module_id=modules[module].id, level_code=code, level_name=code, internal_level_number=number, display_order=number, is_active=True)
        db.add(levels[code])
    db.flush()
    teacher_user = _user(db, "Ashalatha Gupta", "TEACHER")
    teacher = Teacher(user_id=teacher_user.id, teacher_code="MP-TR-002")
    db.add(teacher)
    db.flush()

    def student(code, level):
        s = Student(user_id=_user(db, f"Student {code}", "STUDENT").id, student_code=code, teacher_id=teacher.id,
                    current_level_id=levels[level].id, current_module_id=levels[level].module_id, is_active=True)
        db.add(s)
        db.flush()
        return s

    tester = student("MP-ST-001", "PM-L1")
    regular = student("MP-ST-050", "PM-L1")
    versions = {}
    for code in ("YLM-L1", "PM-L1", "PM-L3", "IM-L2"):
        level = levels[code]
        bp = AssessmentBlueprint(title=f"{code} Assessment", module_id=level.module_id, level_id=level.id, total_questions=1,
                                 marks_per_question=100, total_marks=100, duration_seconds=600, status="PUBLISHED", is_active=True)
        db.add(bp)
        db.flush()
        v = AssessmentVersion(blueprint_id=bp.id, version_number=1, status="PUBLISHED", total_questions=1, marks_per_question=100,
                              total_marks=100, duration_seconds=600, is_active=True)
        db.add(v)
        db.flush()
        db.add(AssessmentQuestion(assessment_version_id=v.id, question_number=1, lesson_question_number=1, display_type="EXPRESSION_WORKSHEET",
                                  question_text="2 + 3", correct_answer="5", seed=f"T-{code}"))
        versions[code] = v
    db.commit()
    return teacher, tester, regular, levels, versions


def test_teacher_with_test_account_sees_every_level(db):
    teacher, tester, regular, levels, versions = _setup_teacher(db)
    titles = {item["levelCode"] for item in routes_teacher.teacher_available_assessments(None, None, db, teacher)["items"]}
    assert titles == {"YLM-L1", "PM-L1", "PM-L3", "IM-L2"}

    options = routes_teacher.teacher_assign_assessment_options(None, levels["IM-L2"].id, db, teacher)
    rows = {row["studentCode"]: row for row in options["students"]}
    assert "MP-ST-001" in rows and rows["MP-ST-001"]["testAccount"] is True and rows["MP-ST-001"]["canAssign"] is True
    assert "MP-ST-050" not in rows  # not on IM-L2
    assert {v["levelCode"] for v in options["availableAssessments"]} == {"IM-L2"}


def test_teacher_without_test_account_keeps_own_levels(db):
    teacher, tester, regular, levels, versions = _setup_teacher(db)
    tester.teacher_id = None
    db.commit()
    titles = {item["levelCode"] for item in routes_teacher.teacher_available_assessments(None, None, db, teacher)["items"]}
    assert titles == {"PM-L1"}


def test_assign_any_level_to_test_account_and_take_over_existing(db, monkeypatch):
    monkeypatch.setattr(routes_teacher, "NotifyAssessmentAssignmentsCreated", lambda *a, **k: None)
    teacher, tester, regular, levels, versions = _setup_teacher(db)
    # The test account already holds the PM-L3 version (automatic assignment).
    # ...and it was cancelled at some point: assigning brings it back.
    auto = AssessmentAssignment(assessment_version_id=versions["PM-L3"].id, blueprint_id=versions["PM-L3"].blueprint_id,
                                student_id=tester.id, is_active=False, status="CANCELLED")
    db.add(auto)
    db.commit()

    request = routes_teacher.TeacherAssignAssessmentRequest(assessmentVersionId=versions["PM-L3"].id, studentIds=[tester.id, regular.id])
    result = routes_teacher.teacher_assign_assessment(request, db, teacher)
    assert result["assignmentIds"] == [auto.id]
    assert [r["studentId"] for r in result["rejected"]] == [regular.id]  # PM-L3 is not the regular student's level
    db.refresh(auto)
    assert auto.teacher_id == teacher.id and auto.is_active is True and auto.status == "ASSIGNED"
    assert db.query(AssessmentAssignment).filter_by(student_id=tester.id).count() == 1

    request = routes_teacher.TeacherAssignAssessmentRequest(assessmentVersionId=versions["IM-L2"].id, studentIds=[tester.id])
    result = routes_teacher.teacher_assign_assessment(request, db, teacher)
    created = db.get(AssessmentAssignment, result["assignmentIds"][0])
    assert created.student_id == tester.id and created.assessment_version_id == versions["IM-L2"].id and created.teacher_id == teacher.id


def test_regular_student_still_needs_matching_level(db, monkeypatch):
    monkeypatch.setattr(routes_teacher, "NotifyAssessmentAssignmentsCreated", lambda *a, **k: None)
    teacher, tester, regular, levels, versions = _setup_teacher(db)
    request = routes_teacher.TeacherAssignAssessmentRequest(assessmentVersionId=versions["IM-L2"].id, studentIds=[regular.id])
    with pytest.raises(HTTPException) as error:
        routes_teacher.teacher_assign_assessment(request, db, teacher)
    assert error.value.detail["code"] == "ASSESSMENT_ASSIGNMENT_BLOCKED"
