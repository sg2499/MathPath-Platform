"""Which competition_mock_exams rows are real mock papers (2026-11-02, Shailesh).

Annual Competition papers -- every level's official paper and every practice
paper -- are stored in the same competition_mock_exams table as Competition
Mock papers (GenerateAnnualCompetitionLevelPaper creates a CompetitionMockExam
so the paper engine can be shared). They are told apart by competition_scope:

    GENERAL (or empty)            a Competition Mock paper
    ANNUAL_COMPETITION            an Annual Competition official paper
    ANNUAL_COMPETITION_PRACTICE   an Annual Competition practice paper

Shailesh: "no annual competition papers be it official or practice should
ever show up" in Manage Mocks, and every mock "must be visible at all times
no matter what". Every mock-side list and action therefore goes through this
module. Any scope that starts with ANNUAL counts as an Annual Competition
paper, so a future annual scope is excluded without another change here.
difficulty_band is NOT used: some older annual papers carry "COMPETITION".
"""
from __future__ import annotations

from sqlalchemy import func, or_

from app.core.errors import api_error
from app.models import CompetitionMockExam

ANNUAL_COMPETITION_SCOPE_PREFIX = "ANNUAL"


def IsAnnualCompetitionPaper(ExamRecord: CompetitionMockExam | None) -> bool:
    Scope = str(getattr(ExamRecord, "competition_scope", "") or "").strip().upper()
    return Scope.startswith(ANNUAL_COMPETITION_SCOPE_PREFIX)


def MockPaperCondition():
    """SQL condition that keeps only Competition Mock papers."""
    Scope = func.upper(func.coalesce(CompetitionMockExam.competition_scope, ""))
    return or_(CompetitionMockExam.competition_scope.is_(None), ~Scope.like(f"{ANNUAL_COMPETITION_SCOPE_PREFIX}%"))


def EnsureMockPaper(ExamRecord: CompetitionMockExam | None) -> None:
    """Mock-side actions (view, assign, archive, delete) refuse an Annual
    Competition paper. Those papers are managed in the Annual Competition
    Studio only."""
    if ExamRecord is not None and IsAnnualCompetitionPaper(ExamRecord):
        api_error(
            404,
            "COMPETITION_MOCK_NOT_FOUND",
            "This is an Annual Competition paper, not a mock. Manage it in the Annual Competition Studio.",
        )
