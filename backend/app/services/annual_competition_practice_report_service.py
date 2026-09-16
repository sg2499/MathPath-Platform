"""Annual Competition -- Practice Reports (package 2, Shailesh, 2026-09-16).

Aggregation layer for the new "Practice Reports" feature: per-student and
per-level analytics over Annual Competition PRACTICE attempts (avg score,
avg accuracy, avg time, per-section breakdowns), built on top of package 1's
per_section_score_json / per_section_time_json columns on
CompetitionEventResult (annual_competition_scoring_service.py). Nothing in
this file writes to the database -- purely read/aggregate, exactly like
annual_competition_monitoring_service.py's live-view functions.

## Why a new file, not added to annual_competition_scoring_service.py

That module owns computing and storing one CompetitionEventResult row per
attempt (package 6's own scope, see its module docstring). This module
consumes many already-computed rows and summarizes them -- a genuinely
different responsibility, same split this codebase already draws elsewhere
(e.g. annual_competition_monitoring_service.py's live/roster views versus
the scoring engine that feeds them).

## The averaging rule, used everywhere in this file, deliberately

Every "avg" figure below is an ATTEMPT-WEIGHTED arithmetic mean: each
qualifying PRACTICE attempt counts exactly once, regardless of how many
questions it had or which student it belongs to. Concretely:
  - avgAccuracyPercentage is the mean of each attempt's OWN accuracy_
    percentage (itself already correct/attempted for that one attempt) --
    never a pooled correct/attempted recomputed across every attempt
    combined. Pooling would silently let one large-question-count attempt
    dominate the average; attempt-weighting treats "how did this attempt
    go" as the unit of measurement throughout, which is what "average
    score/accuracy/time across N attempts" means in ordinary usage.
  - The same rule applies to the per-section breakdown (_AggregatePerSectionStats)
    and to the per-level cohort summary/per-student rows in
    GetAnnualCompetitionPracticeReportForLevel: one attempt, one data point,
    everywhere.
This is a real design choice, not an accident -- an admin who wants a
STUDENT-weighted cohort average (so one prolific practicer can't move the
level average more than a student who tried once) would need a different
function. Flagged here for visibility rather than buried in one function's
docstring.

## Roster scoping convention

Mirrors annual_competition_monitoring_service.py's own established pattern
exactly: `StudentIdsFilter: list[str] | None` where `None` means
unrestricted (admin's own view) and an explicit list restricts to that
roster (a teacher's own students, resolved by the caller/route before
calling in). An explicitly EMPTY list means "this teacher has no active
students" and short-circuits before issuing any query, matching
ListAnnualCompetitionPracticeResultsForRoster's own convention.

## Level filtering, per Shailesh's own 2026-09-16 clarification

"the same student would not be in the same level [across annual cycles] ...
it would still be better to have a level filter for the student data
analytics" -- so GetAnnualCompetitionPracticeReportForStudent's
CompetitionLevelCode is OPTIONAL: omitted, it returns a blended overall
summary plus a per-level breakdown table (one row per level the student has
ever practiced, in the same canonical order every level dropdown in this
app already uses); supplied, it scopes everything -- including the
per-section table and the attempt-by-attempt trend, both of which are only
meaningful within one level's shared paper structure -- to that one level,
and adds a comparison against that level's own cohort average. There is no
"all levels" option on the level-scoped report itself
(GetAnnualCompetitionPracticeReportForLevel) -- averaging a cohort across
different levels' different papers would not mean anything, so a level code
is required there, exactly as Shailesh separately confirmed ("for the level
scoped analytics there we will ofc need level filters").
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import CompetitionEventLevelPaper, CompetitionEventResult, Student
from app.services.annual_competition_paper_registry import ANNUAL_COMPETITION_LEVEL_REGISTRY
from app.services.annual_competition_studio_service import VALID_COMPETITION_LEVEL_CODES, _ValidateCompetitionLevelCode

# Canonical level display/iteration order -- reuses the paper registry's own
# key order (already exactly the order every level dropdown in this app
# uses, e.g. frontend's ANNUAL_COMPETITION_LEVEL_CODES) rather than defining
# a second, driftable copy. VALID_COMPETITION_LEVEL_CODES itself is a set
# (studio_service.py), which Python does not guarantee stable iteration
# order for, so this list is what _PerLevelBreakdownForStudent actually
# iterates.
_LEVEL_CODE_DISPLAY_ORDER: list[str] = list(ANNUAL_COMPETITION_LEVEL_REGISTRY.keys())


def _SafeJsonList(RawJson: str | None) -> list[dict[str, Any]]:
    if not RawJson:
        return []
    try:
        Parsed = json.loads(RawJson)
    except (TypeError, ValueError):
        return []
    return Parsed if isinstance(Parsed, list) else []


def _StudentDisplayName(StudentRecord: Student) -> str:
    return StudentRecord.user.full_name if StudentRecord.user else StudentRecord.student_code


def _ResultRowsForStudent(
    db: Session, StudentId: str, *, CompetitionLevelCode: str | None = None
) -> list[CompetitionEventResult]:
    Query = db.query(CompetitionEventResult).filter(
        CompetitionEventResult.attempt_type == "PRACTICE",
        CompetitionEventResult.is_voided == False,  # noqa: E712
        CompetitionEventResult.student_id == StudentId,
    )
    if CompetitionLevelCode:
        Query = Query.filter(CompetitionEventResult.competition_level_code == CompetitionLevelCode)
    return Query.order_by(CompetitionEventResult.computed_at.asc()).all()


def _ResultRowsForLevel(
    db: Session, CompetitionLevelCode: str, *, StudentIdsFilter: list[str] | None = None
) -> list[CompetitionEventResult]:
    if StudentIdsFilter is not None and not StudentIdsFilter:
        return []
    Query = db.query(CompetitionEventResult).filter(
        CompetitionEventResult.attempt_type == "PRACTICE",
        CompetitionEventResult.is_voided == False,  # noqa: E712
        CompetitionEventResult.competition_level_code == CompetitionLevelCode,
    )
    if StudentIdsFilter is not None:
        Query = Query.filter(CompetitionEventResult.student_id.in_(StudentIdsFilter))
    return Query.all()


def _PracticeBankCompletionStats(
    db: Session,
    *,
    StudentId: str | None = None,
    CompetitionLevelCode: str | None = None,
    StudentIdsFilter: list[str] | None = None,
) -> dict[str, Any]:
    """Bank-wide completion, independent of the score/time aggregation below
    -- counts CompetitionEventLevelPaper rows (the bank itself, the same
    source ListAnnualCompetitionPracticeResultsForAdmin/ForRoster already
    read from in annual_competition_scoring_service.py / annual_competition_
    monitoring_service.py), not CompetitionEventResult rows, so a paper
    that's been assigned but never attempted is still counted as assigned
    without needing a result to exist at all."""
    if StudentIdsFilter is not None and not StudentIdsFilter:
        return {"papersAssignedCount": 0, "papersCompletedCount": 0}

    Query = db.query(CompetitionEventLevelPaper).filter(CompetitionEventLevelPaper.paper_kind == "PRACTICE")
    if StudentId:
        Query = Query.filter(CompetitionEventLevelPaper.assigned_student_id == StudentId)
    elif StudentIdsFilter is not None:
        Query = Query.filter(CompetitionEventLevelPaper.assigned_student_id.in_(StudentIdsFilter))
    if CompetitionLevelCode:
        Query = Query.filter(CompetitionEventLevelPaper.competition_level_code == CompetitionLevelCode)

    PaperRecords = Query.all()
    CompletedCount = sum(1 for PaperRecord in PaperRecords if PaperRecord.consumed_at is not None)
    return {"papersAssignedCount": len(PaperRecords), "papersCompletedCount": CompletedCount}


def _AggregateAttemptLevelStats(ResultRecords: list[CompetitionEventResult]) -> dict[str, Any]:
    """Attempt-weighted averages -- see this module's own docstring for why.
    Returns None for every avg when ResultRecords is empty (never 0 -- a
    student/level with zero finalized attempts has no average, not a
    zero one)."""
    AttemptsCount = len(ResultRecords)
    if AttemptsCount == 0:
        return {
            "attemptsCount": 0,
            "avgScore": None,
            "avgMaxScore": None,
            "avgPercentage": None,
            "avgAccuracyPercentage": None,
            "avgTimeTakenSeconds": None,
        }
    return {
        "attemptsCount": AttemptsCount,
        "avgScore": round(sum(ResultRecord.score or 0.0 for ResultRecord in ResultRecords) / AttemptsCount, 2),
        "avgMaxScore": round(sum(ResultRecord.max_score or 0.0 for ResultRecord in ResultRecords) / AttemptsCount, 2),
        "avgPercentage": round(sum(ResultRecord.percentage or 0.0 for ResultRecord in ResultRecords) / AttemptsCount, 2),
        "avgAccuracyPercentage": round(
            sum(ResultRecord.accuracy_percentage or 0.0 for ResultRecord in ResultRecords) / AttemptsCount, 2
        ),
        "avgTimeTakenSeconds": round(
            sum(ResultRecord.time_taken_seconds or 0 for ResultRecord in ResultRecords) / AttemptsCount, 2
        ),
    }


def _AggregatePerSectionStats(ResultRecords: list[CompetitionEventResult]) -> list[dict[str, Any]]:
    """Averages per_section_score_json + per_section_time_json across every
    row handed in, section-number by section-number, same attempt-weighted
    rule as _AggregateAttemptLevelStats above. Only meaningful when every
    row shares one paper structure -- both call sites in this module already
    scope ResultRecords to a single competition_level_code before calling
    this."""
    ScoreEntriesBySection: dict[int, list[dict[str, Any]]] = {}
    TimeEntriesBySection: dict[int, list[dict[str, Any]]] = {}
    for ResultRecord in ResultRecords:
        for Entry in _SafeJsonList(ResultRecord.per_section_score_json):
            SectionNumber = Entry.get("sectionNumber")
            if SectionNumber is None:
                continue
            ScoreEntriesBySection.setdefault(SectionNumber, []).append(Entry)
        for Entry in _SafeJsonList(ResultRecord.per_section_time_json):
            SectionNumber = Entry.get("sectionNumber")
            if SectionNumber is None:
                continue
            TimeEntriesBySection.setdefault(SectionNumber, []).append(Entry)

    SectionNumbers = sorted(set(ScoreEntriesBySection.keys()) | set(TimeEntriesBySection.keys()))
    Rows: list[dict[str, Any]] = []
    for SectionNumber in SectionNumbers:
        ScoreEntries = ScoreEntriesBySection.get(SectionNumber, [])
        TimeEntries = TimeEntriesBySection.get(SectionNumber, [])
        # One accuracy data point per attempt that actually attempted
        # something in this section -- an attempt that left the whole
        # section unanswered contributes no data point at all, rather than
        # a misleading 0%, mirroring how accuracyPercentage itself is never
        # computed against zero attempted questions elsewhere in this
        # feature (see annual_competition_scoring_service.py's own
        # accuracy-fix comment).
        AccuracyValues = [
            (Entry.get("correctCount", 0) / Entry["attemptedCount"]) * 100
            for Entry in ScoreEntries
            if Entry.get("attemptedCount", 0) > 0
        ]
        Rows.append(
            {
                "sectionNumber": SectionNumber,
                "attemptsCount": len(ScoreEntries),
                "avgScore": round(sum(Entry.get("score", 0.0) for Entry in ScoreEntries) / len(ScoreEntries), 2)
                if ScoreEntries
                else None,
                "avgMaxScore": round(sum(Entry.get("maxScore", 0.0) for Entry in ScoreEntries) / len(ScoreEntries), 2)
                if ScoreEntries
                else None,
                "avgAttemptedCount": round(
                    sum(Entry.get("attemptedCount", 0) for Entry in ScoreEntries) / len(ScoreEntries), 2
                )
                if ScoreEntries
                else None,
                "avgTotalQuestions": round(
                    sum(Entry.get("totalQuestions", 0) for Entry in ScoreEntries) / len(ScoreEntries), 2
                )
                if ScoreEntries
                else None,
                "avgAccuracyPercentage": round(sum(AccuracyValues) / len(AccuracyValues), 2) if AccuracyValues else None,
                "avgTimeTakenSeconds": round(
                    sum(Entry.get("timeTakenSeconds", 0) for Entry in TimeEntries) / len(TimeEntries), 2
                )
                if TimeEntries
                else None,
                # Frozen per section at attempt-start (CompetitionEventAttemptSectionState
                # snapshots CompetitionEventSectionTimer.time_limit_seconds) -- every
                # attempt of the same level/section shares the same value, so
                # the first entry is representative, not an approximation.
                "timeLimitSeconds": TimeEntries[0].get("timeLimitSeconds") if TimeEntries else None,
            }
        )
    return Rows


def _AttemptTrendRow(ResultRecord: CompetitionEventResult) -> dict[str, Any]:
    return {
        "attemptId": ResultRecord.attempt_id,
        "computedAt": ResultRecord.computed_at.isoformat() if ResultRecord.computed_at else None,
        "score": ResultRecord.score,
        "maxScore": ResultRecord.max_score,
        "percentage": ResultRecord.percentage,
        "accuracyPercentage": ResultRecord.accuracy_percentage,
        "timeTakenSeconds": ResultRecord.time_taken_seconds,
    }


def _PerLevelBreakdownForStudent(db: Session, StudentId: str) -> list[dict[str, Any]]:
    """The "All Levels" view's per-level table -- one row per level this
    student has ever practiced, each independently aggregated (never
    blended with another level's rows, since paper structures differ level
    to level), in the same canonical order every level dropdown elsewhere
    in this app already uses."""
    AllResultRecords = db.query(CompetitionEventResult).filter(
        CompetitionEventResult.attempt_type == "PRACTICE",
        CompetitionEventResult.is_voided == False,  # noqa: E712
        CompetitionEventResult.student_id == StudentId,
    ).all()

    ResultsByLevel: dict[str, list[CompetitionEventResult]] = {}
    for ResultRecord in AllResultRecords:
        ResultsByLevel.setdefault(ResultRecord.competition_level_code, []).append(ResultRecord)

    Rows: list[dict[str, Any]] = []
    for LevelCode in _LEVEL_CODE_DISPLAY_ORDER:
        LevelResultRecords = ResultsByLevel.get(LevelCode)
        if not LevelResultRecords:
            continue
        Stats = _AggregateAttemptLevelStats(LevelResultRecords)
        Stats.update(_PracticeBankCompletionStats(db, StudentId=StudentId, CompetitionLevelCode=LevelCode))
        Stats["competitionLevelCode"] = LevelCode
        LastComputedAt = max(
            (ResultRecord.computed_at for ResultRecord in LevelResultRecords if ResultRecord.computed_at), default=None
        )
        Stats["lastAttemptAt"] = LastComputedAt.isoformat() if LastComputedAt else None
        Rows.append(Stats)
    return Rows


def GetAnnualCompetitionPracticeReportForStudent(
    db: Session, *, StudentId: str, CompetitionLevelCode: str | None = None
) -> dict[str, Any]:
    """The per-student Practice Reports view. See module docstring for the
    CompetitionLevelCode-optional design (2026-09-16 clarification)."""
    StudentRecord = db.get(Student, StudentId)
    if not StudentRecord:
        api_error(404, "STUDENT_NOT_FOUND", "Student not found.")
    if CompetitionLevelCode:
        _ValidateCompetitionLevelCode(CompetitionLevelCode)

    ResultRecords = _ResultRowsForStudent(db, StudentId, CompetitionLevelCode=CompetitionLevelCode)
    Summary = _AggregateAttemptLevelStats(ResultRecords)
    Summary.update(_PracticeBankCompletionStats(db, StudentId=StudentId, CompetitionLevelCode=CompetitionLevelCode))

    Payload: dict[str, Any] = {
        "studentId": StudentRecord.id,
        "studentName": _StudentDisplayName(StudentRecord),
        "studentCode": StudentRecord.student_code,
        "competitionLevelCode": CompetitionLevelCode,
        "summary": Summary,
        "perSection": [],
        "trend": [],
        "byLevel": [],
        "levelComparison": None,
    }

    if CompetitionLevelCode:
        Payload["perSection"] = _AggregatePerSectionStats(ResultRecords)
        Payload["trend"] = [_AttemptTrendRow(ResultRecord) for ResultRecord in ResultRecords]

        CohortResultRecords = _ResultRowsForLevel(db, CompetitionLevelCode)
        CohortSummary = _AggregateAttemptLevelStats(CohortResultRecords)
        Payload["levelComparison"] = {
            "cohortAttemptsCount": CohortSummary["attemptsCount"],
            "cohortStudentsCount": len({ResultRecord.student_id for ResultRecord in CohortResultRecords}),
            "cohortAvgScore": CohortSummary["avgScore"],
            "cohortAvgMaxScore": CohortSummary["avgMaxScore"],
            "cohortAvgPercentage": CohortSummary["avgPercentage"],
            "cohortAvgAccuracyPercentage": CohortSummary["avgAccuracyPercentage"],
            "cohortAvgTimeTakenSeconds": CohortSummary["avgTimeTakenSeconds"],
        }
    else:
        Payload["byLevel"] = _PerLevelBreakdownForStudent(db, StudentId)

    return Payload


def GetAnnualCompetitionPracticeReportForLevel(
    db: Session, *, CompetitionLevelCode: str, StudentIdsFilter: list[str] | None = None
) -> dict[str, Any]:
    """The per-level (cohort) Practice Reports view. CompetitionLevelCode is
    required -- see module docstring for why there is no "all levels" mode
    here, unlike the per-student report. StudentIdsFilter follows this
    module's own roster convention (module docstring)."""
    _ValidateCompetitionLevelCode(CompetitionLevelCode)

    ResultRecords = _ResultRowsForLevel(db, CompetitionLevelCode, StudentIdsFilter=StudentIdsFilter)

    Summary = _AggregateAttemptLevelStats(ResultRecords)
    Summary["studentsWithAttemptsCount"] = len({ResultRecord.student_id for ResultRecord in ResultRecords})
    Summary.update(
        _PracticeBankCompletionStats(db, CompetitionLevelCode=CompetitionLevelCode, StudentIdsFilter=StudentIdsFilter)
    )

    PerSection = _AggregatePerSectionStats(ResultRecords)

    ResultsByStudent: dict[str, list[CompetitionEventResult]] = {}
    for ResultRecord in ResultRecords:
        ResultsByStudent.setdefault(ResultRecord.student_id, []).append(ResultRecord)
    StudentIds = list(ResultsByStudent.keys())
    StudentsById = {
        StudentRecord.id: StudentRecord for StudentRecord in db.query(Student).filter(Student.id.in_(StudentIds)).all()
    } if StudentIds else {}

    PerStudent: list[dict[str, Any]] = []
    for SId, StudentResultRecords in ResultsByStudent.items():
        StudentRecord = StudentsById.get(SId)
        if not StudentRecord:
            continue
        StudentStats = _AggregateAttemptLevelStats(StudentResultRecords)
        StudentStats.update(_PracticeBankCompletionStats(db, StudentId=SId, CompetitionLevelCode=CompetitionLevelCode))
        StudentStats["studentId"] = StudentRecord.id
        StudentStats["studentName"] = _StudentDisplayName(StudentRecord)
        StudentStats["studentCode"] = StudentRecord.student_code
        LastComputedAt = max(
            (ResultRecord.computed_at for ResultRecord in StudentResultRecords if ResultRecord.computed_at), default=None
        )
        StudentStats["lastAttemptAt"] = LastComputedAt.isoformat() if LastComputedAt else None
        PerStudent.append(StudentStats)

    # Leaderboard-style default order: highest avg accuracy first. A None
    # (zero attempted questions across every attempt -- unusual but
    # possible) sorts last, never mistaken for a genuine 0%.
    PerStudent.sort(
        key=lambda Row: (Row["avgAccuracyPercentage"] is None, -(Row["avgAccuracyPercentage"] or 0.0))
    )

    return {
        "competitionLevelCode": CompetitionLevelCode,
        "summary": Summary,
        "perSection": PerSection,
        "perStudent": PerStudent,
    }
