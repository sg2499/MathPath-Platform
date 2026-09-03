"""Student activity feed aggregation, spanning DPS/Practice attempts,
Assessment attempts, and Competition Mock attempts -- one normalized event
shape consumed by the student dashboard's Grind Heatmap.

2026-09-03 (Shailesh): added GetStudentActivityEventsInRange() to back the
Grind Heatmap's new "browse a past month" view. The existing weekly view
(frontend/app/student/dashboard/page.tsx's combinedActivityEvents) builds
this exact same normalized event shape client-side, by merging the results
of three "fetch everything" endpoints (already-unfiltered full history) and
filtering down to the current week in JavaScript -- fine for one week, but
pulling a student's entire multi-year history on every dashboard load just
to show 7 days doesn't scale as students accumulate years of attempts. This
function returns the same event shape via a real date-range filtered query
instead, so browsing an arbitrary past month costs one narrow query per
activity type, not the student's whole history.

The [start, end) boundary is passed in by the caller rather than derived
here from a bare year/month -- the frontend already owns the one place in
this codebase that correctly reasons about the *student's own local
calendar month* (toLocalDateKey/toActivityDateKey in the dashboard page,
deliberately avoiding the UTC-shift bug a naive toISOString() would
introduce). Re-deriving "what month is this" in server/UTC time would
silently reintroduce exactly that class of bug for any student not in UTC.
So this function is not itself timezone-aware by design -- it just filters
strictly between two instants the caller already computed correctly.

Assessments are deliberately NOT date-filtered at the SQL level below (see
_assessment_events' own comment) -- they're comparatively rare per student
(a handful per level, not a daily activity like DPS/Mock), so filtering
that one source in Python after a normal per-student fetch is a reasonable,
precedent-consistent scoping choice rather than added complexity for a
source that was never the scaling concern in the first place.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.models import (
    Attempt,
    DPS,
    AssessmentAttempt,
    AssessmentResult,
    CompetitionMockAttempt,
    CompetitionMockResultSummary,
)

# Mirrors the completed-status sets already used for these same three
# activity types elsewhere (routes_student.py's student_results,
# assessment_engine_service.py's _CompletedAssessmentAttemptHistoryPayload,
# competition_mock_attempt_service.py's COMPLETED_STATUSES) -- kept as
# separate local tuples here rather than importing those private module
# constants, so this file has no reach into other modules' internals.
_DPS_COMPLETED_STATUSES = ("SUBMITTED", "AUTO_SUBMITTED", "COMPLETED")
_ASSESSMENT_COMPLETED_STATUSES = ("SUBMITTED", "AUTO_SUBMITTED", "CLEARED", "NEEDS_RE_ATTEMPT")
_MOCK_COMPLETED_STATUSES = ("SUBMITTED", "AUTO_SUBMITTED", "COMPLETED")


def _dps_events(db: Session, student_id: str, start: datetime, end: datetime) -> list[dict[str, Any]]:
    rows = (
        db.query(Attempt, DPS)
        .outerjoin(DPS, DPS.id == Attempt.dps_id)
        .filter(
            Attempt.student_id == student_id,
            Attempt.status.in_(_DPS_COMPLETED_STATUSES),
            Attempt.submitted_at.isnot(None),
            Attempt.submitted_at >= start,
            Attempt.submitted_at < end,
        )
        .all()
    )
    return [
        {
            "completedAt": attempt.submitted_at.isoformat(),
            "timeTakenSeconds": attempt.time_taken_seconds or 0,
            "expectedDurationSeconds": dps.default_duration_seconds if dps else None,
            "accuracyPercentage": attempt.accuracy_percentage or 0,
            "totalQuestions": attempt.total_questions or 5,
        }
        for attempt, dps in rows
    ]


def _assessment_events(db: Session, student_id: str, start: datetime, end: datetime) -> list[dict[str, Any]]:
    # completedAt is COALESCE(AssessmentResult.completion_date,
    # AssessmentAttempt.submitted_at) -- same fallback
    # _CompletedAssessmentAttemptHistoryPayload uses -- expressed as a real
    # SQL coalesce so the date filter below stays correct even for the rare
    # completed attempt that has no AssessmentResult row yet.
    completed_at_expr = func.coalesce(AssessmentResult.completion_date, AssessmentAttempt.submitted_at)
    rows = (
        db.query(AssessmentAttempt, AssessmentResult, completed_at_expr.label("completed_at"))
        .outerjoin(AssessmentResult, AssessmentResult.assessment_attempt_id == AssessmentAttempt.id)
        .filter(
            AssessmentAttempt.student_id == student_id,
            AssessmentAttempt.status.in_(_ASSESSMENT_COMPLETED_STATUSES),
            completed_at_expr.isnot(None),
            completed_at_expr >= start,
            completed_at_expr < end,
        )
        .all()
    )
    events = []
    for attempt, result, completed_at in rows:
        events.append({
            "completedAt": completed_at.isoformat(),
            "timeTakenSeconds": attempt.time_taken_seconds or 0,
            "expectedDurationSeconds": attempt.duration_seconds,
            "accuracyPercentage": (result.percentage if result else attempt.percentage) or 0,
            "totalQuestions": attempt.total_questions or 5,
        })
    return events


def _mock_events(db: Session, student_id: str, start: datetime, end: datetime) -> list[dict[str, Any]]:
    rows = (
        db.query(CompetitionMockAttempt, CompetitionMockResultSummary)
        .join(CompetitionMockResultSummary, CompetitionMockResultSummary.mock_attempt_id == CompetitionMockAttempt.id)
        .filter(
            CompetitionMockAttempt.student_id == student_id,
            CompetitionMockAttempt.status.in_(_MOCK_COMPLETED_STATUSES),
            CompetitionMockResultSummary.completed_at.isnot(None),
            CompetitionMockResultSummary.completed_at >= start,
            CompetitionMockResultSummary.completed_at < end,
        )
        .all()
    )
    return [
        {
            "completedAt": result.completed_at.isoformat(),
            "timeTakenSeconds": result.time_taken_seconds or 0,
            "expectedDurationSeconds": attempt.duration_seconds,
            "accuracyPercentage": result.accuracy_percentage or 0,
            "totalQuestions": attempt.total_questions or 5,
        }
        for attempt, result in rows
    ]


def GetStudentActivityEventsInRange(db: Session, student_id: str, start: datetime, end: datetime) -> list[dict[str, Any]]:
    """Every completed DPS/Practice, Assessment, and Competition Mock event
    for this student with a completion timestamp in [start, end), normalized
    to the same {completedAt, timeTakenSeconds, expectedDurationSeconds,
    accuracyPercentage, totalQuestions} shape combinedActivityEvents already
    builds client-side for the current week -- see this module's docstring.
    """
    events: list[dict[str, Any]] = []
    events.extend(_dps_events(db, student_id, start, end))
    events.extend(_assessment_events(db, student_id, start, end))
    events.extend(_mock_events(db, student_id, start, end))
    return events
