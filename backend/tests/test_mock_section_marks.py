"""Mock Studio: marks set per section (2026-11-09, Shailesh).

"just as we gave the freedom for section marking for each question for the
assessment workflow lets do the same thing for the mock workflow". Decisions:
Total Marks stays the admin's choice (10-100); 10-100 questions; the old
lopsided starting layouts are fixed; new mocks only.
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.routes_admin import CompetitionMockGenerateRequest
from app.models import models
from app.models.models import CompetitionMockExam, CompetitionMockQuestion, Level, Module, User
from app.seed.seed_bridge_module_l1 import seed as seed_bm
from app.seed.seed_preparatory_module import seed as seed_pm_l1
from app.services.competition_mock_generation_service import (
    CompetitionMockSectionPlan,
    GenerateCompetitionMockDraft,
    _DefaultMockSectionLayout,
)


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    models.Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)()
    try:
        yield session
    finally:
        session.close()


def _admin(db):
    admin = db.query(User).filter(User.role.in_(["ADMIN", "SUPER_ADMIN"])).first()
    if admin is None:
        admin = User(full_name="Admin", role="SUPER_ADMIN", email="admin@test.local", password_hash="x")
        db.add(admin)
        db.flush()
    return admin


@pytest.fixture()
def bm(db):
    seed_bm(db)
    db.commit()
    module = db.query(Module).filter(Module.module_code == "BM").first()
    return db.query(Level).filter(Level.module_id == module.id, Level.level_code == "BM-L1").first(), _admin(db)


@pytest.fixture()
def pm1(db):
    seed_pm_l1(db)
    db.commit()
    return db.query(Level).filter(Level.level_code == "PM-L1").first(), _admin(db)


def _rows(plan, **changes):
    rows = [{"sectionKey": s["sectionKey"], "questionCount": s["questionCount"], "marksPerQuestion": s["defaultMarksPerQuestion"]} for s in plan["sections"]]
    for index, (count, marks) in changes.items():
        i = int(index[1:])
        if count is not None:
            rows[i]["questionCount"] = count
        if marks is not None:
            rows[i]["marksPerQuestion"] = marks
    return rows


def _questions(db, exam_id):
    return db.query(CompetitionMockQuestion).filter(CompetitionMockQuestion.mock_exam_id == exam_id).order_by(CompetitionMockQuestion.question_number).all()


# --- starting layout -------------------------------------------------------

def test_default_layout_is_no_longer_lopsided(db, bm):
    level, _ = bm
    plan = CompetitionMockSectionPlan(db, LevelId=level.id, TotalMarks=100)
    rows = [(s["questionCount"], s["defaultMarksPerQuestion"], s["included"]) for s in plan["sections"]]
    assert rows == [(18, 1, True)] * 5 + [(2, 5, True)]
    assert plan["totalQuestions"] == 92


@pytest.mark.parametrize("target", [10, 11, 15, 20, 30, 49, 50, 73, 100])
def test_default_layout_always_adds_up_with_10_to_100_questions(target):
    sections = [{"key": f"S{i}"} for i in range(1, 9)]
    marks = {f"S{i}": 1 for i in range(1, 8)} | {"S8": 5}
    counts = _DefaultMockSectionLayout(sections, marks, target)
    assert sum(counts[k] * marks[k] for k in counts) == target
    assert 10 <= sum(counts.values()) <= 100
    # The 5-mark section never swallows the paper.
    assert counts["S8"] <= 2


def test_small_total_starts_with_high_mark_section_left_out(db, bm):
    level, _ = bm
    plan = CompetitionMockSectionPlan(db, LevelId=level.id, TotalMarks=10)
    last = plan["sections"][-1]
    assert (last["questionCount"], last["included"]) == (0, False)
    assert sum(s["questionCount"] for s in plan["sections"]) == 10


def test_flat_level_shares_total_marks_evenly(db, pm1):
    level, _ = pm1
    plan = CompetitionMockSectionPlan(db, LevelId=level.id, TotalQuestions=40, TotalMarks=40)
    assert [s["questionCount"] for s in plan["sections"]] == [14, 13, 13]
    assert {s["defaultMarksPerQuestion"] for s in plan["sections"]} == {1}


# --- generation with the section table --------------------------------------

def test_custom_marks_and_left_out_section(db, bm):
    level, admin = bm
    plan = CompetitionMockSectionPlan(db, LevelId=level.id, TotalMarks=100)
    # Section 1 at 2 marks, Section 2 left out, Concept Drill at 4 marks.
    rows = _rows(plan, s0=(10, 2), s1=(0, None), s5=(5, 4))  # 20 + 18*3 + 20 = 94
    rows[4]["questionCount"] = 24                            # 20 + 18*2 + 24 + 20 = 100
    exam = GenerateCompetitionMockDraft(db, LevelId=level.id, CreatedBy=admin, TotalMarks=100, SectionPlan=rows, Title="custom")
    assert exam["totalMarks"] == 100
    assert exam["totalQuestions"] == 10 + 18 + 18 + 24 + 5
    shown = {}
    for q in _questions(db, exam["mockExamId"]):
        shown.setdefault(q.section_number, (q.section_title, q.marks, []))[2].append(q)
    assert sorted(shown) == [1, 2, 3, 4, 5]                  # numbered with no gap
    assert [(shown[n][1], len(shown[n][2])) for n in sorted(shown)] == [(2, 10), (1, 18), (1, 18), (1, 24), (4, 5)]
    for n, (title, _marks, _qs) in shown.items():
        assert title.startswith(f"Section {n} - "), title     # title carries the shown number
    record = db.get(CompetitionMockExam, exam["mockExamId"])
    assert '"marksMode": "SECTION_SET"' in record.generation_config_json


def test_flat_level_with_custom_marks(db, pm1):
    level, admin = pm1
    plan = CompetitionMockSectionPlan(db, LevelId=level.id, TotalQuestions=40, TotalMarks=40)
    rows = _rows(plan, s0=(10, 2), s1=(10, 1), s2=(10, 1))    # 20 + 10 + 10 = 40
    exam = GenerateCompetitionMockDraft(db, LevelId=level.id, CreatedBy=admin, TotalMarks=40, SectionPlan=rows)
    marks = [q.marks for q in _questions(db, exam["mockExamId"])]
    assert exam["totalQuestions"] == 30 and exam["totalMarks"] == 40 and sum(marks) == 40
    assert sorted(set(marks)) == [1, 2]


def test_uniform_marks_are_recorded_on_the_exam(db, pm1):
    level, admin = pm1
    plan = CompetitionMockSectionPlan(db, LevelId=level.id, TotalQuestions=40, TotalMarks=40)
    rows = _rows(plan, s0=(7, 2), s1=(7, 2), s2=(6, 2))
    exam = GenerateCompetitionMockDraft(db, LevelId=level.id, CreatedBy=admin, TotalMarks=40, SectionPlan=rows)
    assert exam["marksPerQuestion"] == 2


BAD_CASES = [
    ("fraction marks", dict(s0=(None, 1.5)), "INVALID_SECTION_MARKS"),
    ("zero marks", dict(s0=(None, 0)), "INVALID_SECTION_MARKS"),
    ("over 100 marks", dict(s0=(None, 101)), "INVALID_SECTION_MARKS"),
    ("text marks", dict(s0=(None, "two")), "INVALID_SECTION_MARKS"),
    ("negative count", dict(s0=(-1, None)), "INVALID_QUESTION_COUNT"),
    ("fraction count", dict(s0=(2.5, None)), "INVALID_QUESTION_COUNT"),
    ("total off by one", dict(s0=(19, None)), "COMPETITION_MOCK_MARKS_INVALID"),
]


@pytest.mark.parametrize("label,changes,code", BAD_CASES, ids=[c[0] for c in BAD_CASES])
def test_bad_tables_are_refused_and_nothing_saved(db, bm, label, changes, code):
    level, admin = bm
    plan = CompetitionMockSectionPlan(db, LevelId=level.id, TotalMarks=100)
    with pytest.raises(HTTPException) as error:
        GenerateCompetitionMockDraft(db, LevelId=level.id, CreatedBy=admin, TotalMarks=100, SectionPlan=_rows(plan, **changes))
    assert error.value.detail["code"] == code
    assert db.query(CompetitionMockExam).count() == 0


def test_structure_rules(db, bm):
    level, admin = bm
    plan = CompetitionMockSectionPlan(db, LevelId=level.id, TotalMarks=100)
    rows = _rows(plan)

    def code(table, total=100):
        with pytest.raises(HTTPException) as error:
            GenerateCompetitionMockDraft(db, LevelId=level.id, CreatedBy=admin, TotalMarks=total, SectionPlan=table)
        return error.value.detail["code"]

    assert code(rows[:-1]) == "FULL_SECTION_COVERAGE_REQUIRED"
    assert code(rows + [dict(rows[0])]) == "DUPLICATE_MOCK_SECTION"
    assert code(rows + [{"sectionKey": "NOT_A_SECTION", "questionCount": 0, "marksPerQuestion": 1}]) == "UNKNOWN_MOCK_SECTION"
    assert code([dict(r, questionCount=0) for r in rows]) == "MOCK_NEEDS_A_SECTION"
    # 9 questions (under the minimum of 10) even though the marks add up.
    few = [dict(r, questionCount=0) for r in rows]
    few[0].update(questionCount=9, marksPerQuestion=10)
    few[1].update(questionCount=0)
    few[5].update(questionCount=0)
    few[2].update(questionCount=0)
    assert code(few, total=90) == "INVALID_QUESTION_COUNT"
    # 101 questions.
    many = [dict(r, questionCount=0, marksPerQuestion=1) for r in rows]
    many[0]["questionCount"] = 101
    assert code(many, total=100) == "INVALID_QUESTION_COUNT"
    assert code(rows, total=5) == "INVALID_TOTAL_MARKS"
    assert code(rows, total=None) == "INVALID_TOTAL_MARKS"
    assert db.query(CompetitionMockExam).count() == 0


def test_older_callers_without_a_section_table_are_unchanged(db, bm):
    level, admin = bm
    exam = GenerateCompetitionMockDraft(db, LevelId=level.id, CreatedBy=admin, TotalMarks=100)
    marks = {q.marks for q in _questions(db, exam["mockExamId"])}
    assert marks <= {1.0, 5.0} and exam["totalMarks"] == 100
    record = db.get(CompetitionMockExam, exam["mockExamId"])
    assert '"marksMode": "CONCEPT_RULE"' in record.generation_config_json


def test_request_model_keeps_the_section_table():
    payload = CompetitionMockGenerateRequest(levelId="x", totalMarks=50, sectionPlan=[{"sectionKey": "A", "questionCount": 3, "marksPerQuestion": 2}])
    assert payload.sectionPlan[0].model_dump() == {"sectionKey": "A", "questionCount": 3, "marksPerQuestion": 2}
