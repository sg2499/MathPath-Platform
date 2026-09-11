"""Annual Competition -- scoring + results engine (Package 6).

Computes and stores one `CompetitionEventResult` row per attempt, ranks
those results within their shared level paper, and gates their visibility
to students/parents independently of when they were computed. The data
model itself (`CompetitionEventResult`) was already fully built in Package
1 -- see models.py's own docstring on that class -- so this package is
purely the service layer that fills it in and gates it, with zero schema
changes.

## Why computation is triggered from annual_competition_attempt_service.py,
## not called separately by every route that can finish an attempt

Per the lifecycle comment already written on `CompetitionEventAttempt` in
models.py, `FINALIZED` means "a `CompetitionEventResult` has been computed
for this attempt." `_AdvanceOrFinalize` in
annual_competition_attempt_service.py is the ONE place every path to a
last-section close funnels through -- a manual section submit, a
heartbeat-driven auto-advance when time runs out, and the admin-triggered
reconciliation sweep all call it. `ComputeAndFinalizeCompetitionEventResult`
below is invoked from inside that single function (via a local import, to
avoid this module needing to be loaded for every other attempt operation
and to keep annual_competition_attempt_service.py's own top-level import
list unchanged), so every attempt gets scored the same way with nothing
left to catch later -- the same "single funnel, no path left uncovered"
reasoning Package 4 already used for auto-advance itself.

## The confirmed scoring formula (REQUIREMENTS.md outstanding item 4)

Client's answer, verbatim: "accuracy and completion time, If tie to check
who made mistake first the latter will win then. If unanswered no marks to
be given." Read as:
- Unanswered questions earn zero score, exactly like a wrong answer, but
  are tracked as their own count (never folded into wrong_count) -- same
  distinction Competition Mock's own scoring already makes
  (competition_mock_attempt_service.py's SubmitCompetitionMockAttempt).
- Ranking is by accuracy% (not raw score) descending, then completion time
  ascending -- exactly the two factors the client named, in that order.
- "If tie[d], check who made a mistake first, the latter will win": between
  two students tied on both accuracy AND time, the one whose FIRST wrong
  answer came LATER in the shared question order (identical order for
  every student on the same level's paper -- see the "Paper fairness" note
  in REQUIREMENTS.md) held it together longer and wins. A student with no
  wrong answer at all outranks anyone who has one, modeled as a sentinel
  later than any real question number -- see _DefaultRankingSortKey.
- "Completion time" is each section's ACTIVE time used
  (`time_limit_seconds - remaining_seconds_at_last_heartbeat`), summed
  across sections -- never the attempt's raw wall-clock
  `submitted_at - started_at`, which would include any genuine pause time
  the Package 4 pause mechanic exists specifically to exclude from a
  student's competitive time.

Per pkg-06's own checklist ("a swappable ranking function ... not inlined
into the computation path"), the formula above lives in exactly one place
(_DefaultRankingSortKey) so a future change is a one-function swap with no
data migration -- raw metrics are captured unconditionally regardless of
which formula is active, matching the checklist's item 1.

## Ranking and release are two independent actions, deliberately

RankCompetitionEventResults never touches is_released; ReleaseCompetition-
EventResults always re-ranks first (so a released result is never shown
without a rank) but the two remain independently callable -- an admin
previewing standings before deciding to release needs the first without
the second. Re-running ComputeAndFinalizeCompetitionEventResult (e.g. after
a genuine technical-issue retry, REQUIREMENTS.md item 6) never touches
is_released/released_at/released_by_user_id/rank either -- only raw metrics
are recomputed, so a result already shown to anyone is never silently
un-released or re-ranked as a side effect (pkg-06 checklist item 4).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import (
    CompetitionEvent,
    CompetitionEventAttempt,
    CompetitionEventAttemptAnswer,
    CompetitionEventAttemptSectionState,
    CompetitionEventLevelPaper,
    CompetitionEventResult,
    CompetitionMockQuestion,
    CompetitionMockQuestionOption,
    Student,
    User,
)


def _NowUtc() -> datetime:
    return datetime.now(timezone.utc)


def _CompetitionLevelCodeForAttempt(db: Session, AttemptRecord: CompetitionEventAttempt) -> str:
    LevelPaperRecord = db.get(CompetitionEventLevelPaper, AttemptRecord.level_paper_id)
    return LevelPaperRecord.competition_level_code if LevelPaperRecord else ""


def _AllSectionStatesOrdered(db: Session, AttemptRecord: CompetitionEventAttempt) -> list[CompetitionEventAttemptSectionState]:
    return (
        db.query(CompetitionEventAttemptSectionState)
        .filter(CompetitionEventAttemptSectionState.attempt_id == AttemptRecord.id)
        .order_by(CompetitionEventAttemptSectionState.section_number.asc())
        .all()
    )


def _RawMetricsForAttempt(db: Session, AttemptRecord: CompetitionEventAttempt) -> dict[str, Any]:
    """Pure computation, no DB writes. See module docstring for the
    confirmed scoring rule this implements."""
    LevelPaperRecord = db.get(CompetitionEventLevelPaper, AttemptRecord.level_paper_id)
    MockExamId = LevelPaperRecord.mock_exam_id if LevelPaperRecord else None

    # Root-cause fix (Shailesh, 2026-09-09): scope question lookup to only
    # the sections THIS ATTEMPT actually included -- its own
    # CompetitionEventAttemptSectionState rows, seeded once from
    # CompetitionEventSectionTimer at attempt-start (see _BuildFreshAttempt)
    # -- never to every CompetitionMockQuestion under the paper's
    # mock_exam_id. The "official paper" is generated by the reused,
    # generic Competition Mock engine, which can (and, for IM-L4 today,
    # does) define more sections for a level than the client's confirmed
    # real-event section-timer table includes for the actual competition --
    # e.g. IM-L4's generic registry has 8 sections (...BODMAS/Solve
    # Equation, Positional & Placement, Skill Stacker/Concept Drill
    # included) but DEFAULT_SECTION_TIMERS_BY_LEVEL_CODE["IM-L4"] only
    # defines the first 5, so a student's attempt only ever activates
    # sections 1-5 (_BuildFreshAttempt seeds exactly one section-state per
    # section-timer row, nothing more). Counting the extra sections'
    # questions toward MaxScore/TotalQuestions is exactly what produced the
    # "22 unanswered despite everything answered" bug Shailesh reported
    # (those 22 belonged to sections the student was structurally never
    # shown) and the misleading "X/52"-style denominator (52 = the generic
    # engine's full section total, not the number of questions this
    # specific attempt ever presented). Computed once here and reused below
    # for per-section time, instead of calling _AllSectionStatesOrdered
    # twice.
    SectionStates = _AllSectionStatesOrdered(db, AttemptRecord)
    AttemptSectionNumbers = {SectionState.section_number for SectionState in SectionStates}
    QuestionRecords = (
        db.query(CompetitionMockQuestion)
        .filter(
            CompetitionMockQuestion.mock_exam_id == MockExamId,
            CompetitionMockQuestion.section_number.in_(AttemptSectionNumbers),
        )
        .order_by(CompetitionMockQuestion.question_number.asc())
        .all()
        if MockExamId and AttemptSectionNumbers
        else []
    )
    AnswersByQuestionId = {
        Answer.mock_question_id: Answer
        for Answer in db.query(CompetitionEventAttemptAnswer).filter(CompetitionEventAttemptAnswer.attempt_id == AttemptRecord.id).all()
    }

    CorrectCount = 0
    WrongCount = 0
    UnansweredCount = 0
    Score = 0.0
    MaxScore = 0.0

    for QuestionRecord in QuestionRecords:
        # Point 10 fix (Shailesh, 2026-09-08): 1 mark per question, out of
        # the paper's real question count -- never QuestionRecord.marks,
        # which reflects the reused Competition Mock generation engine's
        # admin-chosen "total marks" weighting (defaults to 100 regardless
        # of question count). That weighting is what produced the wrong
        # "28/100"-style scores Shailesh flagged: the client's own answer
        # ("1 mark per correct response") means score must equal the
        # correct count and max score must equal the question count,
        # always -- this is naturally future-proof once real per-level
        # question counts are confirmed and papers regenerated, since
        # MaxScore is just however many questions this specific paper has.
        MaxScore += 1.0
        AnswerRecord = AnswersByQuestionId.get(QuestionRecord.id)
        StudentAnswerText = (AnswerRecord.selected_value or "").strip() if AnswerRecord else ""

        # Same legacy-answer fallback already applied to the admin review
        # screen's own per-question display (_AttemptReviewSectionPayload
        # in annual_competition_attempt_service.py) -- an attempt answered
        # before the typed-answer switch has selected_option_id set and
        # selected_value NULL forever (no backfill; see
        # ensure_annual_competition_answer_text_column's own docstring).
        # Without this fallback here too, a legacy attempt's stored SCORE
        # (not just its review display) undercounts every question it
        # actually answered as unanswered -- exactly the "22 unanswered"
        # discrepancy Shailesh reported between the review screen (already
        # fixed) and the result summary (this function, not yet fixed
        # until now). The option's own is_correct flag is the ground
        # truth for these, exactly as the review screen already
        # established -- never a fresh answers_match() re-check.
        LegacyOptionIsCorrect: bool | None = None
        if not StudentAnswerText and AnswerRecord and AnswerRecord.selected_option_id:
            OptionRecord = db.get(CompetitionMockQuestionOption, AnswerRecord.selected_option_id)
            if OptionRecord:
                StudentAnswerText = (OptionRecord.option_value or "").strip()
                LegacyOptionIsCorrect = bool(OptionRecord.is_correct)

        if not StudentAnswerText:
            UnansweredCount += 1
            continue

        IsCorrect = LegacyOptionIsCorrect if LegacyOptionIsCorrect is not None else bool(AnswerRecord.is_correct)
        if IsCorrect:
            CorrectCount += 1
            Score += 1.0
        else:
            WrongCount += 1

    TotalQuestions = len(QuestionRecords)
    Percentage = round((Score / MaxScore) * 100, 2) if MaxScore else 0.0
    AccuracyPercentage = round((CorrectCount / TotalQuestions) * 100, 2) if TotalQuestions else 0.0

    # SectionStates already fetched above, before the QuestionRecords query
    # -- reused here rather than re-queried, so the same attempt-scoped
    # section list drives both the score denominator and the time totals.
    PerSectionTime: list[dict[str, Any]] = []
    TotalTimeTakenSeconds = 0
    for SectionState in SectionStates:
        RemainingAtEnd = SectionState.remaining_seconds_at_last_heartbeat
        if RemainingAtEnd is None or RemainingAtEnd < 0:
            RemainingAtEnd = 0
        TimeTakenThisSection = max(SectionState.time_limit_seconds - RemainingAtEnd, 0)
        TotalTimeTakenSeconds += TimeTakenThisSection
        PerSectionTime.append(
            {
                "sectionNumber": SectionState.section_number,
                "timeLimitSeconds": SectionState.time_limit_seconds,
                "timeTakenSeconds": TimeTakenThisSection,
            }
        )

    return {
        "correctCount": CorrectCount,
        "wrongCount": WrongCount,
        "unansweredCount": UnansweredCount,
        "totalQuestions": TotalQuestions,
        "score": round(Score, 2),
        "maxScore": round(MaxScore, 2),
        "percentage": Percentage,
        "accuracyPercentage": AccuracyPercentage,
        "timeTakenSeconds": TotalTimeTakenSeconds,
        "perSectionTime": PerSectionTime,
    }


def ComputeAndFinalizeCompetitionEventResult(db: Session, AttemptRecord: CompetitionEventAttempt) -> CompetitionEventResult:
    """The Package 6 hook -- see module docstring for why this is called
    from exactly one place. Upserts CompetitionEventResult and advances the
    attempt to FINALIZED. Safe to call again later (e.g. after a genuine
    technical-issue retry attempt is re-finalized) without disturbing a
    result already shown to anyone -- see module docstring.

    2026-09-11 (Shailesh, Competition Practice feature, Phase D): this is
    the ONE place both OFFICIAL and PRACTICE attempts get scored (the
    single-funnel design Phase B's protections were built around), so it is
    also the one place that has to set attempt_type correctly on the result
    row -- CompetitionEventResult.attempt_type has a Python-side model
    default of "OFFICIAL" (models.py), so leaving it unset here would
    silently mis-tag every practice result as OFFICIAL and undo every one
    of Phase B's attempt_type == "OFFICIAL" filters. Two more practice-only
    effects live here, both on FIRST creation only (never on a later
    recompute -- see below):
      - is_released=True immediately: practice is deliberately ungated (the
        client only asked for OFFICIAL results to stay hidden until
        release; practice's whole point is instant self-visible feedback,
        confirmed by Shailesh) -- GetCompetitionEventResultForStudent needs
        zero code changes because of this one flag.
      - the practice bank paper this attempt was built on gets
        consumed_at stamped -- see CompetitionEventLevelPaper.consumed_at's
        own docstring and StartAnnualCompetitionPracticeAttempt's bank
        query, which is what actually enforces "no retakes" by simply never
        offering a consumed paper again.
    """
    Metrics = _RawMetricsForAttempt(db, AttemptRecord)

    ResultRecord = db.query(CompetitionEventResult).filter(CompetitionEventResult.attempt_id == AttemptRecord.id).first()
    IsFirstFinalize = ResultRecord is None
    if not ResultRecord:
        ResultRecord = CompetitionEventResult(
            attempt_id=AttemptRecord.id,
            event_id=AttemptRecord.event_id,
            assignment_id=AttemptRecord.assignment_id,
            student_id=AttemptRecord.student_id,
            attempt_type=AttemptRecord.attempt_type,
            competition_level_code=_CompetitionLevelCodeForAttempt(db, AttemptRecord),
        )
        db.add(ResultRecord)
        if AttemptRecord.attempt_type == "PRACTICE":
            # Only on first creation -- mirrors this module's own "never
            # touch is_released/released_at on a later recompute" rule for
            # OFFICIAL results (module docstring), just applied to practice's
            # own always-released state instead of a manual admin release.
            ResultRecord.is_released = True
            ResultRecord.released_at = _NowUtc()

    ResultRecord.score = Metrics["score"]
    ResultRecord.max_score = Metrics["maxScore"]
    ResultRecord.percentage = Metrics["percentage"]
    ResultRecord.accuracy_percentage = Metrics["accuracyPercentage"]
    ResultRecord.correct_count = Metrics["correctCount"]
    ResultRecord.wrong_count = Metrics["wrongCount"]
    ResultRecord.unanswered_count = Metrics["unansweredCount"]
    ResultRecord.time_taken_seconds = Metrics["timeTakenSeconds"]
    ResultRecord.per_section_time_json = json.dumps(Metrics["perSectionTime"])
    ResultRecord.computed_at = _NowUtc()

    AttemptRecord.status = "FINALIZED"

    if AttemptRecord.attempt_type == "PRACTICE" and IsFirstFinalize:
        LevelPaperRecord = db.get(CompetitionEventLevelPaper, AttemptRecord.level_paper_id)
        if LevelPaperRecord and LevelPaperRecord.consumed_at is None:
            LevelPaperRecord.consumed_at = _NowUtc()

    db.flush()
    return ResultRecord


def RecomputeAnnualCompetitionResults(db: Session, *, EventId: str, CompetitionLevelCode: str | None = None) -> dict[str, Any]:
    """Admin action (Point 10, Shailesh, 2026-09-08): refreshes already-
    finalized results under whatever the current scoring formula is.
    Exists because CompetitionEventResult is computed once and frozen at
    finalize time -- the marks-weighting and legacy-answer fixes landed
    alongside this function only affect attempts finalized AFTER the fix
    ships, unless something re-runs the computation for attempts already
    finalized under the old, wrong formula. Safe and idempotent: reuses
    ComputeAndFinalizeCompetitionEventResult per attempt, which (see this
    module's own docstring) never touches is_released/released_at/rank --
    only raw metrics are recomputed, so a result already shown to anyone
    is never silently un-released or un-ranked as a side effect. Voided
    results are skipped entirely, matching _RankResultsForLevel's own
    "never touch a voided row" rule.
    """
    EventRecord = db.get(CompetitionEvent, EventId)
    if not EventRecord:
        api_error(404, "COMPETITION_EVENT_NOT_FOUND", "Annual Competition event not found.")

    Query = db.query(CompetitionEventResult).filter(
        CompetitionEventResult.event_id == EventId,
        CompetitionEventResult.is_voided == False,  # noqa: E712
    )
    if CompetitionLevelCode:
        Query = Query.filter(CompetitionEventResult.competition_level_code == CompetitionLevelCode)
    ResultRecords = Query.all()

    RecomputedCount = 0
    for ResultRecord in ResultRecords:
        AttemptRecord = db.get(CompetitionEventAttempt, ResultRecord.attempt_id)
        if not AttemptRecord:
            continue
        ComputeAndFinalizeCompetitionEventResult(db, AttemptRecord)
        RecomputedCount += 1

    db.commit()
    return {"eventId": EventId, "competitionLevelCode": CompetitionLevelCode, "recomputedCount": RecomputedCount}


def _FirstMistakeQuestionNumberForAttempt(db: Session, AttemptId: str) -> int | None:
    """Re-derived at ranking time rather than stored on CompetitionEventResult
    -- cheap (one query per result, only when an admin triggers ranking,
    never per student request) and avoids reopening Package 1's already-
    shipped schema for a value every other package already has the raw
    data to recompute on demand."""
    FirstWrongRow = (
        db.query(CompetitionMockQuestion.question_number)
        .join(CompetitionEventAttemptAnswer, CompetitionEventAttemptAnswer.mock_question_id == CompetitionMockQuestion.id)
        .filter(
            CompetitionEventAttemptAnswer.attempt_id == AttemptId,
            CompetitionEventAttemptAnswer.is_correct == False,  # noqa: E712 -- SQLAlchemy filter, not a Python bool comparison
        )
        .order_by(CompetitionMockQuestion.question_number.asc())
        .first()
    )
    return FirstWrongRow[0] if FirstWrongRow else None


def _DefaultRankingSortKey(db: Session, ResultRecord: CompetitionEventResult) -> tuple[float, int, float]:
    """The confirmed formula (module docstring), isolated in this one
    function per pkg-06's own checklist ("a swappable ranking function").
    Ascending sort on the returned tuple gives rank 1 to the best result.
    """
    FirstMistakeQuestionNumber = _FirstMistakeQuestionNumberForAttempt(db, ResultRecord.attempt_id)
    NoMistakeSentinel = float("inf")  # never having made a mistake beats any real question number
    TieBreakValue = -(FirstMistakeQuestionNumber if FirstMistakeQuestionNumber is not None else NoMistakeSentinel)
    return (-(ResultRecord.accuracy_percentage or 0.0), ResultRecord.time_taken_seconds or 0, TieBreakValue)


def _RankResultsForLevel(db: Session, EventId: str, CompetitionLevelCode: str) -> int:
    """No commit -- pure mutation, so callers can compose this with other
    writes into one atomic transaction (see ReleaseCompetitionEventResults).

    Voided results (Package 10 go-live rollback plan -- see
    VoidCompetitionEventResult's own docstring below) are excluded from the
    query entirely, not just skipped while iterating: a voided result must
    never receive or keep a rank, and every other student's rank must close
    the gap it leaves behind, exactly as if that result didn't exist for
    ranking purposes. VoidCompetitionEventResult itself already nulls out
    `rank` the instant a result is voided, so nothing here needs to touch a
    voided row at all.

    2026-09-11 (Shailesh, Competition Practice feature, Phase B): also
    excludes attempt_type == "PRACTICE" results the same way -- practice is
    unlimited, ungated, and explicitly never competitive (see
    CompetitionEventAttempt.attempt_type's own docstring in models.py), so a
    practice result must never receive a rank or affect anyone else's,
    exactly like a voided one.
    """
    ResultRecords = (
        db.query(CompetitionEventResult)
        .filter(
            CompetitionEventResult.event_id == EventId,
            CompetitionEventResult.competition_level_code == CompetitionLevelCode,
            CompetitionEventResult.is_voided == False,  # noqa: E712
            CompetitionEventResult.attempt_type == "OFFICIAL",
        )
        .all()
    )
    RankedRecords = sorted(ResultRecords, key=lambda ResultRecord: _DefaultRankingSortKey(db, ResultRecord))
    for Index, ResultRecord in enumerate(RankedRecords):
        ResultRecord.rank = Index + 1
    db.flush()
    return len(RankedRecords)


def RankCompetitionEventResults(db: Session, *, EventId: str, CompetitionLevelCode: str) -> dict[str, Any]:
    """Standalone admin action: recomputes `rank` for every result on this
    event+level, without releasing anything. Ranking is only ever
    meaningful within the same level's shared paper (every student on a
    level answers the identical questions in the identical order -- Package
    1's "paper fairness"), never across different levels.
    """
    RankedCount = _RankResultsForLevel(db, EventId, CompetitionLevelCode)
    db.commit()
    return {"eventId": EventId, "competitionLevelCode": CompetitionLevelCode, "rankedCount": RankedCount}


def ReleaseCompetitionEventResults(
    db: Session, *, EventId: str, CompetitionLevelCode: str | None, ReleasedBy: User
) -> dict[str, Any]:
    """Admin manual "release now" override (pkg-06 checklist item 3), for
    the 1 Nov 2026 Results & Prize Distribution event. Scoped to one level,
    or every level of the event at once when CompetitionLevelCode is None.
    Always (re-)ranks the level(s) being released first, in the SAME
    transaction, so a released result is never shown without a rank.

    2026-09-11 (Shailesh, Competition Practice feature, Phase B): scoped to
    attempt_type == "OFFICIAL" throughout -- this is specifically the
    official results-release action; a practice result is never released
    through this path (it's set is_released=True at creation time instead,
    see ComputeAndFinalizeCompetitionEventResult's practice branch) and must
    never appear in levelsReleased/newlyReleasedCount here.
    """
    EventRecord = db.get(CompetitionEvent, EventId)
    if not EventRecord:
        api_error(404, "COMPETITION_EVENT_NOT_FOUND", "The selected Annual Competition event was not found.")

    LevelCodesQuery = db.query(CompetitionEventResult.competition_level_code).filter(
        CompetitionEventResult.event_id == EventId,
        CompetitionEventResult.attempt_type == "OFFICIAL",
    )
    if CompetitionLevelCode:
        LevelCodesQuery = LevelCodesQuery.filter(CompetitionEventResult.competition_level_code == CompetitionLevelCode)
    LevelCodes = sorted({Row[0] for Row in LevelCodesQuery.distinct().all()})

    for LevelCode in LevelCodes:
        _RankResultsForLevel(db, EventId, LevelCode)

    ResultsQuery = db.query(CompetitionEventResult).filter(
        CompetitionEventResult.event_id == EventId,
        CompetitionEventResult.is_voided == False,  # noqa: E712 -- a voided result is never released, see VoidCompetitionEventResult
        CompetitionEventResult.attempt_type == "OFFICIAL",
    )
    if CompetitionLevelCode:
        ResultsQuery = ResultsQuery.filter(CompetitionEventResult.competition_level_code == CompetitionLevelCode)
    NowUtc = _NowUtc()
    NewlyReleasedCount = 0
    for ResultRecord in ResultsQuery.all():
        if not ResultRecord.is_released:
            ResultRecord.is_released = True
            ResultRecord.released_at = NowUtc
            ResultRecord.released_by_user_id = ReleasedBy.id
            NewlyReleasedCount += 1

    db.commit()
    return {
        "eventId": EventId,
        "competitionLevelCode": CompetitionLevelCode,
        "levelsReleased": LevelCodes,
        "newlyReleasedCount": NewlyReleasedCount,
    }


def _ResultPayload(ResultRecord: CompetitionEventResult) -> dict[str, Any]:
    return {
        "resultId": ResultRecord.id,
        "competitionLevelCode": ResultRecord.competition_level_code,
        "score": ResultRecord.score,
        "maxScore": ResultRecord.max_score,
        "percentage": ResultRecord.percentage,
        "accuracyPercentage": ResultRecord.accuracy_percentage,
        "correctCount": ResultRecord.correct_count,
        "wrongCount": ResultRecord.wrong_count,
        "unansweredCount": ResultRecord.unanswered_count,
        "timeTakenSeconds": ResultRecord.time_taken_seconds,
        "perSectionTime": json.loads(ResultRecord.per_section_time_json) if ResultRecord.per_section_time_json else [],
        "rank": ResultRecord.rank,
        "releasedAt": ResultRecord.released_at.isoformat() if ResultRecord.released_at else None,
        "isVoided": ResultRecord.is_voided,
        "voidedReason": ResultRecord.voided_reason,
        "voidedAt": ResultRecord.voided_at.isoformat() if ResultRecord.voided_at else None,
    }


def VoidCompetitionEventResult(db: Session, *, AttemptId: str, Reason: str, VoidedBy: User) -> dict[str, Any]:
    """Package 10 (go-live rollback plan): excludes one specific result from
    ranking, student/parent visibility, and certificates -- without
    touching anything else for that event. See CompetitionEventResult's own
    docstring in app/models/models.py for why this is a separate flag from
    is_released rather than just unreleasing it: unreleasing alone would
    still leave the (wrong) result counted in every other student's rank,
    which is exactly the failure mode this exists to prevent.

    Immediately re-ranks the affected level in the same transaction (same
    discipline ReleaseCompetitionEventResults already follows for its own
    re-rank), so every other student's rank on that level is correct right
    away rather than waiting for the next unrelated ranking run. Does NOT
    touch the underlying CompetitionEventAttempt or its answers -- the raw
    data stays intact for audit; only this result's visibility and ranking
    participation change. Pairs naturally with the already-built
    GrantAnnualCompetitionAttemptRetry when the right fix is "let this
    student redo it," but voiding does not grant a retry on its own -- they
    are separate admin decisions.
    """
    ResultRecord = db.query(CompetitionEventResult).filter(CompetitionEventResult.attempt_id == AttemptId).first()
    if not ResultRecord:
        api_error(404, "COMPETITION_RESULT_NOT_FOUND", "No competition result exists for this attempt yet.")

    CleanReason = (Reason or "").strip()
    if not CleanReason:
        api_error(400, "COMPETITION_VOID_REASON_REQUIRED", "A reason is required to void a competition result.")

    ResultRecord.is_voided = True
    ResultRecord.voided_reason = CleanReason
    ResultRecord.voided_at = _NowUtc()
    ResultRecord.voided_by_user_id = VoidedBy.id if VoidedBy else None
    ResultRecord.rank = None
    # _RankResultsForLevel runs its own separate query filtering on
    # is_voided; without flushing first, that query would still see this
    # row's pre-change is_voided=False (autoflush is off in this repo's own
    # test sessions -- see e.g. test_annual_competition_studio_service.py),
    # include it again, and overwrite the rank=None set above right back to
    # a real rank.
    db.flush()

    _RankResultsForLevel(db, ResultRecord.event_id, ResultRecord.competition_level_code)
    db.commit()
    db.refresh(ResultRecord)
    return _ResultPayload(ResultRecord)


def UnvoidCompetitionEventResult(db: Session, *, AttemptId: str) -> dict[str, Any]:
    """Reverses VoidCompetitionEventResult -- the result re-enters ranking
    (re-ranked immediately, same as voiding) and becomes visible again
    exactly as it would have been had it never been voided: still gated by
    is_released, never automatically re-released as a side effect of this
    call (mirrors is_released/rank's own documented independence)."""
    ResultRecord = db.query(CompetitionEventResult).filter(CompetitionEventResult.attempt_id == AttemptId).first()
    if not ResultRecord:
        api_error(404, "COMPETITION_RESULT_NOT_FOUND", "No competition result exists for this attempt yet.")

    ResultRecord.is_voided = False
    ResultRecord.voided_reason = None
    ResultRecord.voided_at = None
    ResultRecord.voided_by_user_id = None
    db.flush()  # same reason as VoidCompetitionEventResult's own flush above

    _RankResultsForLevel(db, ResultRecord.event_id, ResultRecord.competition_level_code)
    db.commit()
    db.refresh(ResultRecord)
    return _ResultPayload(ResultRecord)


def GetCompetitionEventResultForStudent(db: Session, StudentRecord: Student, AttemptId: str) -> dict[str, Any]:
    """Student/parent-facing. REQUIREMENTS.md item 5 ("kept undisclosed
    till the date of announcement") is read as a full lock-down (see
    REQUIREMENTS.md's own note on this) -- an unreleased result returns a
    lean "not released yet" shape, never the actual metrics, regardless of
    whether a CompetitionEventResult row already exists or is even ranked.
    """
    AttemptRecord = db.get(CompetitionEventAttempt, AttemptId)
    if not AttemptRecord or AttemptRecord.student_id != StudentRecord.id:
        api_error(404, "COMPETITION_ATTEMPT_NOT_FOUND", "Competition attempt not found.")

    ResultRecord = db.query(CompetitionEventResult).filter(CompetitionEventResult.attempt_id == AttemptRecord.id).first()
    # A voided result (Package 10 go-live rollback plan) is reported exactly
    # like an unreleased one -- never the actual metrics, and never a hint
    # that anything unusual happened. This is a deliberate choice, not an
    # oversight: distinguishing "not released yet" from "voided" in this
    # response would itself leak information about an admin-only action to
    # the one person (the student) it's least appropriate to surface to.
    if not ResultRecord or not ResultRecord.is_released or ResultRecord.is_voided:
        return {
            "attemptId": AttemptRecord.id,
            "attemptStatus": AttemptRecord.status,
            "released": False,
            "result": None,
        }

    return {
        "attemptId": AttemptRecord.id,
        "attemptStatus": AttemptRecord.status,
        "released": True,
        "result": _ResultPayload(ResultRecord),
    }


def ListCompetitionEventResultsForAdmin(db: Session, *, EventId: str, CompetitionLevelCode: str | None = None) -> dict[str, Any]:
    """Admin can always see a result regardless of is_released (pkg-06
    checklist item 3). Ordered by rank when already ranked, otherwise by
    what ranking would assign, so a pre-ranking admin preview still reads
    in a sensible order. No frontend surface yet -- API only for now,
    exactly the same deliberate deferral Package 2's preview/run endpoints
    already documented ("no frontend/admin UI for the preview... per
    Package 3's scope"); a monitoring/results-review screen is Package 7's
    territory, not this one.

    2026-09-11 (Shailesh, Competition Practice feature, Phase B): scoped to
    attempt_type == "OFFICIAL" -- this is the official competitive results
    list; practice results get their own, separately-scoped admin surface
    in a later phase, never mixed into this one.
    """
    EventRecord = db.get(CompetitionEvent, EventId)
    if not EventRecord:
        api_error(404, "COMPETITION_EVENT_NOT_FOUND", "The selected Annual Competition event was not found.")

    Query = db.query(CompetitionEventResult).filter(
        CompetitionEventResult.event_id == EventId,
        CompetitionEventResult.attempt_type == "OFFICIAL",
    )
    if CompetitionLevelCode:
        Query = Query.filter(CompetitionEventResult.competition_level_code == CompetitionLevelCode)
    ResultRecords = Query.all()
    ResultRecords.sort(key=lambda ResultRecord: (ResultRecord.rank if ResultRecord.rank is not None else 10**9, _DefaultRankingSortKey(db, ResultRecord)))

    Rows: list[dict[str, Any]] = []
    for ResultRecord in ResultRecords:
        StudentRecord = db.get(Student, ResultRecord.student_id)
        Rows.append(
            {
                **_ResultPayload(ResultRecord),
                "attemptId": ResultRecord.attempt_id,
                "studentId": ResultRecord.student_id,
                "studentCode": StudentRecord.student_code if StudentRecord else None,
                "studentName": (StudentRecord.user.full_name if StudentRecord and StudentRecord.user else None),
                "isReleased": ResultRecord.is_released,
            }
        )

    return {
        "eventId": EventId,
        "competitionLevelCode": CompetitionLevelCode,
        "totalResults": len(Rows),
        "rows": Rows,
    }


def ListAnnualCompetitionPracticeResultsForAdmin(
    db: Session, *, EventId: str, CompetitionLevelCode: str | None = None, StudentId: str | None = None
) -> dict[str, Any]:
    """Practice's own admin results surface (Phase E) -- deliberately
    separate from ListCompetitionEventResultsForAdmin above, exactly as
    that function's own Phase B docstring already promised ("practice
    results get their own, separately-scoped admin surface in a later
    phase, never mixed into this one").

    Practice is never ranked -- RankCompetitionEventResults/
    ReleaseCompetitionEventResults both stay attempt_type == "OFFICIAL"-only
    (Phase B) -- so there is no rank to sort by here; newest-first
    (computed_at desc) reads naturally for "recent practice activity"
    instead of a competitive standings order. A student can also have MANY
    practice results for one event (one per consumed bank paper, unlike
    OFFICIAL's single result per assignment) -- StudentId optionally narrows
    to one student's own history, e.g. from a student detail page in the
    admin Studio.
    """
    EventRecord = db.get(CompetitionEvent, EventId)
    if not EventRecord:
        api_error(404, "COMPETITION_EVENT_NOT_FOUND", "The selected Annual Competition event was not found.")

    Query = db.query(CompetitionEventResult).filter(
        CompetitionEventResult.event_id == EventId,
        CompetitionEventResult.attempt_type == "PRACTICE",
    )
    if CompetitionLevelCode:
        Query = Query.filter(CompetitionEventResult.competition_level_code == CompetitionLevelCode)
    if StudentId:
        Query = Query.filter(CompetitionEventResult.student_id == StudentId)
    ResultRecords = Query.order_by(CompetitionEventResult.computed_at.desc()).all()

    Rows: list[dict[str, Any]] = []
    for ResultRecord in ResultRecords:
        StudentRecord = db.get(Student, ResultRecord.student_id)
        Rows.append(
            {
                **_ResultPayload(ResultRecord),
                "attemptId": ResultRecord.attempt_id,
                "studentId": ResultRecord.student_id,
                "studentCode": StudentRecord.student_code if StudentRecord else None,
                "studentName": (StudentRecord.user.full_name if StudentRecord and StudentRecord.user else None),
            }
        )

    return {
        "eventId": EventId,
        "competitionLevelCode": CompetitionLevelCode,
        "studentId": StudentId,
        "totalResults": len(Rows),
        "rows": Rows,
    }
