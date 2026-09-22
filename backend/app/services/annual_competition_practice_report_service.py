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
import math
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import CompetitionEventAttempt, CompetitionEventLevelPaper, CompetitionEventResult, Student
from app.services.annual_competition_paper_registry import ANNUAL_COMPETITION_LEVEL_REGISTRY
from app.services.annual_competition_studio_service import (
    DEFAULT_SECTION_TIMERS_BY_LEVEL_CODE,
    VALID_COMPETITION_LEVEL_CODES,
    _ValidateCompetitionLevelCode,
)

# Canonical level display/iteration order -- reuses the paper registry's own
# key order (already exactly the order every level dropdown in this app
# uses, e.g. frontend's ANNUAL_COMPETITION_LEVEL_CODES) rather than defining
# a second, driftable copy. VALID_COMPETITION_LEVEL_CODES itself is a set
# (studio_service.py), which Python does not guarantee stable iteration
# order for, so this list is what _PerLevelBreakdownForStudent actually
# iterates.
_LEVEL_CODE_DISPLAY_ORDER: list[str] = list(ANNUAL_COMPETITION_LEVEL_REGISTRY.keys())


def _RoundToInt(Value: float | int | None) -> int | None:
    """Whole-number display policy across this entire flow (Shailesh,
    2026-09-16, superseding an earlier 1-decimal-place request the same
    day): every average/percentage/score figure this module returns is
    rounded to the nearest integer -- never a 2-decimal float like 16.33 --
    using standard round-half-up (5 rounds up), not Python's built-in
    round() which rounds half-to-even and would silently disagree with that
    rule at exact .5 boundaries. None passes through unchanged: "no data"
    must never render as 0."""
    if Value is None:
        return None
    return math.floor(Value + 0.5) if Value >= 0 else -math.floor(-Value + 0.5)


def _SubmittedAtByAttemptId(db: Session, ResultRecords: list[CompetitionEventResult]) -> dict[str, Any]:
    """Maps attempt_id -> CompetitionEventAttempt.submitted_at for a batch of
    results, in one query. Exists because CompetitionEventResult.computed_at
    (Shailesh, 2026-09-17 bug report -- "the completion date and time ... are
    all the same, which is not possible") gets unconditionally reset to "now"
    on every call to ComputeAndFinalizeCompetitionEventResult, including a
    later RecomputeAnnualCompetitionPracticeResults/RecomputeAnnualCompetition
    Results pass over ALREADY-finalized rows -- so every result that has ever
    been through a recompute (every row that existed before the 2026-09-16
    per_section_score_json backfill) now carries that one backfill run's
    timestamp instead of its own true completion time, collapsing every such
    student's attempts to one identical date/time. Fixed at the source too
    (see ComputeAndFinalizeCompetitionEventResult's own comment -- computed_at
    is now only ever set on first finalize), but that alone can't repair
    already-corrupted historical rows, since the true original computed_at is
    already overwritten and unrecoverable. CompetitionEventAttempt.submitted_at
    is the fix for existing data: set exactly once, at genuine whole-attempt
    submission time (annual_competition_attempt_service.py), and never touched
    by any recompute -- so it is still correct for every historical attempt,
    not just future ones."""
    AttemptIds = [ResultRecord.attempt_id for ResultRecord in ResultRecords if ResultRecord.attempt_id]
    if not AttemptIds:
        return {}
    Rows = (
        db.query(CompetitionEventAttempt.id, CompetitionEventAttempt.submitted_at)
        .filter(CompetitionEventAttempt.id.in_(AttemptIds))
        .all()
    )
    return {AttemptId: SubmittedAt for AttemptId, SubmittedAt in Rows}


def _SectionTitleLookup(CompetitionLevelCode: str) -> dict[int, str]:
    """sectionNumber -> sectionTitle for one competition level, from the same
    canonical DEFAULT_SECTION_TIMERS_BY_LEVEL_CODE registry every practice
    paper's own CompetitionEventSectionTimer rows are generated from
    (annual_competition_studio_service.py) -- so this is authoritative for
    every paper of this level regardless of which specific mock exam/paper
    any one attempt happened to use, which matters here since this module
    aggregates across many different students' many different generated
    papers of the same level. Deliberately NOT a join against the DB's own
    CompetitionEventSectionTimer rows: aggregating many papers can only ever
    show one title per section number anyway, and the registry is the single
    source of truth those rows were stamped from in the first place. Missing/
    unknown level codes return an empty lookup (sectionTitle just stays None
    for every row) rather than raising -- title is decoration, never load-
    bearing for the numbers themselves."""
    return {
        SectionNumber: SectionTitle
        for SectionNumber, SectionTitle, _Mode, _TimeLimitSeconds in DEFAULT_SECTION_TIMERS_BY_LEVEL_CODE.get(
            CompetitionLevelCode, []
        )
    }


def _LevelCanonicalTotalQuestionCount(CompetitionLevelCode: str) -> int | None:
    """The CURRENT total question count for one competition level's paper --
    the sum of every section's questionCount in ANNUAL_COMPETITION_LEVEL_
    REGISTRY (annual_competition_paper_registry.py), the same registry every
    fresh paper is generated from today. Returns None for an unknown level
    code rather than raising, matching _SectionTitleLookup's own defensive
    convention just above.

    Why this exists (Shailesh, 2026-09-22, Practice Leaderboard fix): the
    per-student leaderboard rows used to display each student's own attempt-
    averaged max score (_AggregateAttemptLevelStats' avgMaxScore -- an
    average of each ResultRecord.max_score, i.e. whatever paper size that
    attempt actually had). That is correct for a single attempt's own
    Scorecard, but wrong for a cohort leaderboard: a level's paper size can
    change over time (e.g. the 2026-09-22 YLM-L0/L1 50->100 bump), so two
    students with identical raw performance could show different
    denominators purely from when they attempted, and worse, their avgScore
    values would then no longer be comparable on a shared scale -- exactly
    the ambiguity that made ranking by raw avgScore alone unsafe before this
    fix. The client's own explicit, confirmed decision: always display (and
    rank against) the level's CURRENT canonical total, the same fixed number
    for every student in that level's leaderboard, even for older attempts
    taken under a smaller paper size. GetAnnualCompetitionPracticeReportForLevel
    is the only caller -- a student's own single-attempt Scorecard keeps
    showing that attempt's real, actual max_score, untouched by this."""
    LevelDefinition = ANNUAL_COMPETITION_LEVEL_REGISTRY.get(CompetitionLevelCode)
    if not LevelDefinition:
        return None
    return sum(Section.get("questionCount", 0) for Section in LevelDefinition.get("sections", []))


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
    # Ordered by the ATTEMPT's own submitted_at (join), not CompetitionEventResult
    # .computed_at -- see _SubmittedAtByAttemptId's own docstring below for why
    # computed_at can no longer be trusted to reflect true chronological order
    # for any result that has ever been through a recompute (every existing row
    # was, as of the 2026-09-16 Practice Reports backfill). submitted_at is set
    # exactly once, at genuine attempt-submission time, and no recompute has
    # ever touched it.
    Query = (
        db.query(CompetitionEventResult)
        .join(CompetitionEventAttempt, CompetitionEventAttempt.id == CompetitionEventResult.attempt_id)
        .filter(
            CompetitionEventResult.attempt_type == "PRACTICE",
            CompetitionEventResult.is_voided == False,  # noqa: E712
            CompetitionEventResult.student_id == StudentId,
        )
    )
    if CompetitionLevelCode:
        Query = Query.filter(CompetitionEventResult.competition_level_code == CompetitionLevelCode)
    return Query.order_by(CompetitionEventAttempt.submitted_at.asc()).all()


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
        "avgScore": _RoundToInt(sum(ResultRecord.score or 0.0 for ResultRecord in ResultRecords) / AttemptsCount),
        "avgMaxScore": _RoundToInt(
            sum(ResultRecord.max_score or 0.0 for ResultRecord in ResultRecords) / AttemptsCount
        ),
        "avgPercentage": _RoundToInt(
            sum(ResultRecord.percentage or 0.0 for ResultRecord in ResultRecords) / AttemptsCount
        ),
        "avgAccuracyPercentage": _RoundToInt(
            sum(ResultRecord.accuracy_percentage or 0.0 for ResultRecord in ResultRecords) / AttemptsCount
        ),
        "avgTimeTakenSeconds": _RoundToInt(
            sum(ResultRecord.time_taken_seconds or 0 for ResultRecord in ResultRecords) / AttemptsCount
        ),
    }


def _AggregatePerSectionStats(
    ResultRecords: list[CompetitionEventResult], CompetitionLevelCode: str
) -> list[dict[str, Any]]:
    """Averages per_section_score_json + per_section_time_json across every
    row handed in, section-number by section-number, same attempt-weighted
    rule as _AggregateAttemptLevelStats above. Only meaningful when every
    row shares one paper structure -- both call sites in this module already
    scope ResultRecords to a single competition_level_code before calling
    this, which is also what CompetitionLevelCode here is for: attaching each
    row's real section title from _SectionTitleLookup (Shailesh, 2026-09-17:
    "the section number and section names should appear everywhere relevant"
    -- previously only sectionNumber was ever returned)."""
    TitleBySectionNumber = _SectionTitleLookup(CompetitionLevelCode)
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
                "sectionTitle": TitleBySectionNumber.get(SectionNumber),
                "attemptsCount": len(ScoreEntries),
                "avgScore": _RoundToInt(sum(Entry.get("score", 0.0) for Entry in ScoreEntries) / len(ScoreEntries))
                if ScoreEntries
                else None,
                "avgMaxScore": _RoundToInt(
                    sum(Entry.get("maxScore", 0.0) for Entry in ScoreEntries) / len(ScoreEntries)
                )
                if ScoreEntries
                else None,
                "avgAttemptedCount": _RoundToInt(
                    sum(Entry.get("attemptedCount", 0) for Entry in ScoreEntries) / len(ScoreEntries)
                )
                if ScoreEntries
                else None,
                "avgTotalQuestions": _RoundToInt(
                    sum(Entry.get("totalQuestions", 0) for Entry in ScoreEntries) / len(ScoreEntries)
                )
                if ScoreEntries
                else None,
                "avgAccuracyPercentage": _RoundToInt(sum(AccuracyValues) / len(AccuracyValues))
                if AccuracyValues
                else None,
                "avgTimeTakenSeconds": _RoundToInt(
                    sum(Entry.get("timeTakenSeconds", 0) for Entry in TimeEntries) / len(TimeEntries)
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


def _AttemptTrendRow(ResultRecord: CompetitionEventResult, SubmittedAtByAttemptId: dict[str, Any]) -> dict[str, Any]:
    # score/maxScore/percentage/accuracyPercentage are Float columns (see
    # models.py) and can genuinely carry decimals per attempt even though
    # this is a single attempt, not an average -- rounded here too so the
    # trend table never shows a value like 16.33, matching this module's
    # whole-number display policy everywhere else.
    #
    # "computedAt" is still the field name here (kept for compatibility --
    # nothing needed to change on the frontend for this fix) but its VALUE
    # is now the attempt's own submitted_at first, falling back to
    # ResultRecord.computed_at only if that attempt row is somehow missing --
    # see _SubmittedAtByAttemptId's own docstring for why.
    SubmittedAt = SubmittedAtByAttemptId.get(ResultRecord.attempt_id) or ResultRecord.computed_at
    return {
        "attemptId": ResultRecord.attempt_id,
        "computedAt": SubmittedAt.isoformat() if SubmittedAt else None,
        "score": _RoundToInt(ResultRecord.score),
        "maxScore": _RoundToInt(ResultRecord.max_score),
        "percentage": _RoundToInt(ResultRecord.percentage),
        "accuracyPercentage": _RoundToInt(ResultRecord.accuracy_percentage),
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

    # See _SubmittedAtByAttemptId's own docstring -- computed_at can no
    # longer be trusted as "last attempt time" for any result that has ever
    # been through a recompute, which by now is every row that existed
    # before the 2026-09-16 backfill.
    SubmittedAtByAttemptId = _SubmittedAtByAttemptId(db, AllResultRecords)

    Rows: list[dict[str, Any]] = []
    for LevelCode in _LEVEL_CODE_DISPLAY_ORDER:
        LevelResultRecords = ResultsByLevel.get(LevelCode)
        if not LevelResultRecords:
            continue
        Stats = _AggregateAttemptLevelStats(LevelResultRecords)
        Stats.update(_PracticeBankCompletionStats(db, StudentId=StudentId, CompetitionLevelCode=LevelCode))
        Stats["competitionLevelCode"] = LevelCode
        LastAttemptAt = max(
            (
                SubmittedAtByAttemptId.get(ResultRecord.attempt_id) or ResultRecord.computed_at
                for ResultRecord in LevelResultRecords
                if SubmittedAtByAttemptId.get(ResultRecord.attempt_id) or ResultRecord.computed_at
            ),
            default=None,
        )
        Stats["lastAttemptAt"] = LastAttemptAt.isoformat() if LastAttemptAt else None
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
        Payload["perSection"] = _AggregatePerSectionStats(ResultRecords, CompetitionLevelCode)
        SubmittedAtByAttemptId = _SubmittedAtByAttemptId(db, ResultRecords)
        Payload["trend"] = [_AttemptTrendRow(ResultRecord, SubmittedAtByAttemptId) for ResultRecord in ResultRecords]

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

    PerSection = _AggregatePerSectionStats(ResultRecords, CompetitionLevelCode)
    SubmittedAtByAttemptId = _SubmittedAtByAttemptId(db, ResultRecords)

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
        # Denominator override (Shailesh, 2026-09-22, Practice Leaderboard
        # fix): always display this student's avgScore out of the level's
        # CURRENT canonical total question count -- never the average of
        # each attempt's own (possibly older, smaller) max_score. See
        # _LevelCanonicalTotalQuestionCount's own docstring for the full
        # reasoning. avgPercentage is recomputed to match for consistency
        # (it is no longer used as a sort key -- see the sort below -- but
        # other callers/consumers of this dict should never see a
        # percentage that disagrees with the displayed score/maxScore
        # fraction). Falls back to the attempt-averaged value only if the
        # level code is somehow unrecognized (defensive; cannot happen for
        # a level code that already passed _ValidateCompetitionLevelCode
        # above).
        CanonicalTotal = _LevelCanonicalTotalQuestionCount(CompetitionLevelCode)
        if CanonicalTotal is not None:
            StudentStats["avgMaxScore"] = CanonicalTotal
            if StudentStats["avgScore"] is not None and CanonicalTotal > 0:
                StudentStats["avgPercentage"] = _RoundToInt((StudentStats["avgScore"] / CanonicalTotal) * 100)
        StudentStats.update(_PracticeBankCompletionStats(db, StudentId=SId, CompetitionLevelCode=CompetitionLevelCode))
        StudentStats["studentId"] = StudentRecord.id
        StudentStats["studentName"] = _StudentDisplayName(StudentRecord)
        StudentStats["studentCode"] = StudentRecord.student_code
        LastAttemptAt = max(
            (
                SubmittedAtByAttemptId.get(ResultRecord.attempt_id) or ResultRecord.computed_at
                for ResultRecord in StudentResultRecords
                if SubmittedAtByAttemptId.get(ResultRecord.attempt_id) or ResultRecord.computed_at
            ),
            default=None,
        )
        StudentStats["lastAttemptAt"] = LastAttemptAt.isoformat() if LastAttemptAt else None
        PerStudent.append(StudentStats)

    # Leaderboard default order -- CHANGED 2026-09-22 (Shailesh, Practice
    # Leaderboard fix), superseding the accuracy-first rule this sort used
    # since 2026-09-18. Accuracy (correct/attempted) rewarded a student who
    # attempted only a handful of questions and got them all right over a
    # student who attempted far more of the paper at a slightly lower hit
    # rate -- Shailesh's own words: "very misleading and unfair to the
    # students who are attempting more questions." Ranking now uses avgScore
    # (this student's own average raw score across their attempts)
    # descending instead. This is mathematically sound specifically because
    # avgMaxScore is now the SAME fixed canonical total for every student in
    # this level's leaderboard (see _LevelCanonicalTotalQuestionCount above)
    # -- with an identical denominator across every row, ranking by raw
    # avgScore descending is exactly equivalent to ranking by percentage
    # descending, so no separate percentage computation is needed here
    # purely for ranking purposes. avgAccuracyPercentage is still returned
    # in each row (still displayable) -- it is simply no longer the sort
    # key. Tiebreak chain, in order: avgTimeTakenSeconds ascending (faster
    # wins, same convention as every other leaderboard in this codebase --
    # see leaderboard_service.py's own module docstring), then
    # papersCompletedCount descending (more completed practice papers wins
    # a tie), then studentCode ascending as a final deterministic
    # alphabetical fallback so two students tied on every real metric still
    # get a stable, reproducible order rather than one that can silently
    # flip between two runs. A None avgScore (should not occur for a row
    # with real attempts, but handled defensively, matching this function's
    # existing None-handling convention) sorts last, never mistaken for a
    # genuine zero score.
    PerStudent.sort(
        key=lambda Row: (
            Row["avgScore"] is None,
            -(Row["avgScore"] or 0.0),
            Row["avgTimeTakenSeconds"] is None,
            Row["avgTimeTakenSeconds"] if Row["avgTimeTakenSeconds"] is not None else 0,
            -(Row.get("papersCompletedCount") or 0),
            Row["studentCode"] or "",
        )
    )
    # "rank" (Shailesh, 2026-09-18): an explicit 1-based field, not just
    # array order -- the new Practice Leaderboard tab (frontend) needs a
    # stable, unambiguous rank number per row (e.g. to identify podium
    # positions 1/2/3) rather than re-deriving it from array position, which
    # is exactly the kind of implicit-order dependency this codebase's own
    # leaderboard_service.py explicitly avoids elsewhere. Purely additive --
    # every existing consumer of perStudent (the "Individual Level" report
    # tab) already renders these rows in array order and ignores unknown
    # dict keys, so this cannot change that tab's behavior.
    for Index, Row in enumerate(PerStudent):
        Row["rank"] = Index + 1

    return {
        "competitionLevelCode": CompetitionLevelCode,
        "summary": Summary,
        "perSection": PerSection,
        "perStudent": PerStudent,
    }
