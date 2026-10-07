"""Sections an Annual Competition level's paper used to have and no longer
does -- 2026-10-07 (Shailesh).

IM-3's Squares section was removed from the paper on 2026-10-07. Attempts
taken before that still hold a fifth section's questions and answers, and
then: "for showing the high score lets remove the scores obtained from the
section which was removed in this pass so the total score will anyways be
out of 300 ... lets recompute the stats there out of 300 only so everything
is consistent ... for the completed attempt views across admin, teacher and
students, lets update the answer sheet and scorecard tabs with 4 section sum
info only and remove the things which is no longer there."

So a retired section is left out of two things, for every attempt whenever
it was taken:
  - scoring (annual_competition_scoring_service._RawMetricsForAttempt):
    score, total, percentage, accuracy, the correct / wrong / unanswered
    counts, time taken and the per-section breakdown;
  - the completed-attempt review (Answer Sheet and Scorecard) for admin,
    teacher and student.
Nothing is deleted: the old section's questions and the student's answers
stay stored exactly as they were, they are simply no longer counted or
shown. The live attempt flow never reads this module -- a student who is
already part-way through an old paper finishes that paper as it stands.

This module has no dependency on the attempt, scoring or studio services,
so all three can import it.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import CompetitionEventLevelPaper, CompetitionEventSectionTimer, CompetitionMockQuestion
from app.services.annual_competition_paper_registry import ANNUAL_COMPETITION_RETIRED_SECTION_TITLES


def _Normalised(Title: str | None) -> str:
    return " ".join(str(Title or "").split()).casefold()


def LevelCodesWithRetiredSections() -> list[str]:
    return [LevelCode for LevelCode, Sections in ANNUAL_COMPETITION_RETIRED_SECTION_TITLES.items() if Sections]


def RetiredSectionNumbersForLevelPaper(db: Session, LevelPaperRecord: CompetitionEventLevelPaper | None) -> set[int]:
    """The section numbers of THIS paper that are retired sections.

    A section number is only ever treated as retired when this paper really
    holds the retired section under its own name -- its section timer, or
    the questions stored for that section number, carry the retired title.
    A paper generated after the removal has no such section at all, and if
    a level is ever given a NEW section under a number that was once
    retired, that new section has a different name and is counted and shown
    like any other.
    """
    if LevelPaperRecord is None:
        return set()
    RetiredTitles = ANNUAL_COMPETITION_RETIRED_SECTION_TITLES.get(LevelPaperRecord.competition_level_code or "") or {}
    if not RetiredTitles:
        return set()
    Numbers = [int(Number) for Number in RetiredTitles]
    TimerTitles = {
        int(SectionNumber): _Normalised(SectionTitle)
        for SectionNumber, SectionTitle in db.query(
            CompetitionEventSectionTimer.section_number, CompetitionEventSectionTimer.section_title
        )
        .filter(
            CompetitionEventSectionTimer.level_paper_id == LevelPaperRecord.id,
            CompetitionEventSectionTimer.section_number.in_(Numbers),
        )
        .all()
    }
    QuestionTitles: dict[int, set[str]] = {}
    if LevelPaperRecord.mock_exam_id:
        for SectionNumber, SectionTitle in (
            db.query(CompetitionMockQuestion.section_number, CompetitionMockQuestion.section_title)
            .filter(
                CompetitionMockQuestion.mock_exam_id == LevelPaperRecord.mock_exam_id,
                CompetitionMockQuestion.section_number.in_(Numbers),
            )
            .distinct()
            .all()
        ):
            QuestionTitles.setdefault(int(SectionNumber or 0), set()).add(_Normalised(SectionTitle))
    Retired: set[int] = set()
    for Number, Title in RetiredTitles.items():
        Wanted = _Normalised(Title)
        if TimerTitles.get(int(Number)) == Wanted or Wanted in QuestionTitles.get(int(Number), set()):
            Retired.add(int(Number))
    return Retired
