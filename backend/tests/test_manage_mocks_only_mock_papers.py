"""Manage Mocks lists mock papers only, every one of them (2026-11-02, Shailesh).

"make sure there is no limit for the manage mocks tab and all the mocks that
are in the system must be visible at all times no matter what, and no annual
competition papers be it official or practice should ever show up there."

Annual Competition papers share the competition_mock_exams table, told apart
by competition_scope (app/services/mock_paper_scope.py). These tests lock in:
- the Manage Mocks list returns every mock (no row cap) and no annual paper,
  including old annual papers whose difficulty_band is "COMPETITION";
- View, Assign, Archive and Delete on the mock side (the Manage Mocks
  endpoints) refuse an annual paper, while the Annual Competition's own
  maintenance scripts can still clear superseded annual papers;
- the teacher mock leaderboard picker leaves annual papers out;
- mock papers themselves behave exactly as before.
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import routes_admin, routes_teacher
from app.models import models
from app.models.models import CompetitionMockExam, Level, Module, Teacher, User
from app.services.competition_mock_assignment_service import _ValidatedMockExams
from app.services.competition_mock_generation_service import DeleteCompetitionMockExam, ListCompetitionMockDrafts
from app.services.mock_paper_scope import IsAnnualCompetitionPaper


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    models.Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)()
    try:
        yield session
    finally:
        session.close()


def _setup(db):
    module = Module(module_code="MM", module_name="Master Module", display_order=1, is_active=True)
    db.add(module)
    db.flush()
    level = Level(module_id=module.id, level_code="MM-L1", level_name="MM-L1", internal_level_number=1, display_order=1, is_active=True)
    db.add(level)
    db.flush()
    return module, level


def _paper(db, module, level, title, scope="GENERAL", band="COMPETITION", status="DRAFT"):
    exam = CompetitionMockExam(
        title=title, module_id=module.id, level_id=level.id, competition_scope=scope, difficulty_band=band,
        total_questions=10, total_marks=10, duration_seconds=600, status=status, is_active=True,
    )
    db.add(exam)
    db.flush()
    return exam


def _annual_set(db, module, level):
    return [
        _paper(db, module, level, "Annual Competition — MM-L2 Official Paper", "ANNUAL_COMPETITION", "ANNUAL_COMPETITION"),
        _paper(db, module, level, "MM-L1 Annual Competition Paper 1", "ANNUAL_COMPETITION_PRACTICE", "ANNUAL_COMPETITION"),
        # An older annual paper whose band was left at COMPETITION: still annual.
        _paper(db, module, level, "Annual Competition — MM-L1 Official Paper", "ANNUAL_COMPETITION", "COMPETITION"),
    ]


def test_list_has_every_mock_and_no_annual_paper(db):
    module, level = _setup(db)
    mocks = [_paper(db, module, level, f"Mock {i}") for i in range(1, 541)]
    for _ in range(200):
        _annual_set(db, module, level)
    db.commit()

    for level_filter in (None, level.id):
        rows = ListCompetitionMockDrafts(db, LevelId=level_filter)
        assert len(rows) == 540  # every mock, well past the old 500-row cap
        assert {row["mockExamId"] for row in rows} == {mock.id for mock in mocks}
        assert not [row for row in rows if str(row["competitionScope"]).upper().startswith("ANNUAL")]


def test_missing_scope_counts_as_a_mock(db):
    module, level = _setup(db)
    legacy = _paper(db, module, level, "Old Mock", scope=None)
    db.commit()
    assert IsAnnualCompetitionPaper(legacy) is False
    assert [row["mockExamId"] for row in ListCompetitionMockDrafts(db)] == [legacy.id]


def test_mock_actions_refuse_annual_papers(db):
    module, level = _setup(db)
    annual = _annual_set(db, module, level)
    db.commit()
    for paper in annual:
        with pytest.raises(HTTPException) as error:
            routes_admin.admin_get_competition_mock_exam(paper.id, db, None)
        assert "Annual Competition" in error.value.detail["message"]
        with pytest.raises(HTTPException):
            routes_admin.admin_archive_competition_mock_exam(paper.id, db, None)
        with pytest.raises(HTTPException):
            routes_admin.admin_delete_competition_mock_exam(paper.id, db, None)
        with pytest.raises(HTTPException):
            _ValidatedMockExams(db, [paper.id])
        db.refresh(paper)
        assert paper.is_active is True and paper.status == "DRAFT"  # untouched


def test_mock_actions_still_work_on_mocks(db):
    module, level = _setup(db)
    keep = _paper(db, module, level, "Mock A")
    gone = _paper(db, module, level, "Mock B")
    db.commit()
    assert routes_admin.admin_get_competition_mock_exam(keep.id, db, None)["mockExamId"] == keep.id
    assert [exam.id for exam in _ValidatedMockExams(db, [keep.id])] == [keep.id]
    assert routes_admin.admin_archive_competition_mock_exam(keep.id, db, None)["mockExam"]["status"] == "ARCHIVED"
    routes_admin.admin_delete_competition_mock_exam(gone.id, db, None)
    assert db.get(CompetitionMockExam, gone.id) is None


def test_teacher_mock_picker_leaves_annual_papers_out(db):
    module, level = _setup(db)
    mock = _paper(db, module, level, "Mock A")
    _annual_set(db, module, level)
    user = User(full_name="Teacher", role="TEACHER", email="t@test.local", password_hash="x")
    db.add(user)
    db.flush()
    teacher = Teacher(user_id=user.id, teacher_code="T-1")
    db.add(teacher)
    db.commit()
    exams = routes_teacher.teacher_mock_leaderboard_hierarchy(db, teacher)["exams"]
    assert [exam["id"] for exam in exams] == [mock.id]


def test_annual_maintenance_can_still_clear_old_annual_papers(db):
    module, level = _setup(db)
    practice = _paper(db, module, level, "MM-L1 Annual Competition Paper 1", "ANNUAL_COMPETITION_PRACTICE", "ANNUAL_COMPETITION")
    db.commit()
    DeleteCompetitionMockExam(db, MockExamId=practice.id)
    assert db.get(CompetitionMockExam, practice.id) is None
