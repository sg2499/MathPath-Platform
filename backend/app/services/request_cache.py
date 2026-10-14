"""Per-request read caches for the big list screens (2026-10-14 speed work).

The admin and teacher list screens (Practice Control, the teacher tracker,
learning performance, available DPS) built every row with its own small
queries: the same DPS / lesson / level / student / user rows were fetched
again for every row (a SQLAlchemy session only keeps rows alive while
something still references them), and each row ran its own "attempts for
this assignment" and "DPS count for this level" queries. With live data
that was thousands of queries and 5-20 seconds per screen.

A route opts in by calling EnableRequestCache(db) at the top. Everything
here is read-only and lives on the request's own session, so it disappears
when the request ends. Helpers return None when the cache is off, and the
callers then fall back to their original query, so every other caller
behaves exactly as before.
"""
from __future__ import annotations

from datetime import datetime
from typing import Iterable

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import DPS, Attempt, AssignmentReattemptPermission, Lesson

_CACHE_KEY = "mp_request_cache"


def EnableRequestCache(Db: Session) -> dict:
    Cache = Db.info.get(_CACHE_KEY)
    if Cache is None:
        Cache = {"pinned": []}
        Db.info[_CACHE_KEY] = Cache
    return Cache


def RequestCache(Db: Session) -> dict | None:
    return Db.info.get(_CACHE_KEY)


def PinRows(Db: Session, *Models) -> None:
    """Load every row of these (small) tables once and keep a reference, so
    the per-row Db.get() calls are answered from the session instead of the
    database."""
    Cache = EnableRequestCache(Db)
    for Model in Models:
        Cache["pinned"].extend(Db.query(Model).all())


def LevelDpsCount(Db: Session, LevelId: str | None) -> int | None:
    """Same number as the old per-level count (every DPS under every lesson
    of the level, active or not), from one grouped query per request."""
    Cache = RequestCache(Db)
    if Cache is None:
        return None
    if not LevelId:
        return 0
    Counts = Cache.get("level_dps_counts")
    if Counts is None:
        Counts = {
            LevelIdValue: int(CountValue or 0)
            for LevelIdValue, CountValue in (
                Db.query(Lesson.level_id, func.count(DPS.id))
                .join(Lesson, DPS.lesson_id == Lesson.id)
                .group_by(Lesson.level_id)
                .all()
            )
        }
        Cache["level_dps_counts"] = Counts
    return Counts.get(LevelId, 0)


def _Chunks(Values: list, Size: int = 1000) -> Iterable[list]:
    for Index in range(0, len(Values), Size):
        yield Values[Index:Index + Size]


def PrimeAssignmentAttempts(Db: Session, AssignmentIds: Iterable[str], ExcludeStudentIds: set[str] | None = None) -> None:
    """Load every attempt of these assignments in a few queries (leaving out
    attempts by ExcludeStudentIds, e.g. demo accounts on a level-wide sheet)."""
    Cache = EnableRequestCache(Db)
    ByAssignment: dict[str, list[Attempt]] = Cache.setdefault("attempts_by_assignment", {})
    Wanted = sorted({Value for Value in AssignmentIds if Value} - set(ByAssignment.keys()))
    for AssignmentId in Wanted:
        ByAssignment[AssignmentId] = []
    for Chunk in _Chunks(Wanted):
        for AttemptRow in Db.query(Attempt).filter(Attempt.assignment_id.in_(Chunk)).all():
            if ExcludeStudentIds and AttemptRow.student_id in ExcludeStudentIds:
                continue
            ByAssignment.setdefault(AttemptRow.assignment_id, []).append(AttemptRow)


def AttemptsForAssignment(Db: Session, AssignmentId: str) -> list[Attempt] | None:
    Cache = RequestCache(Db)
    ByAssignment = Cache.get("attempts_by_assignment") if Cache else None
    if ByAssignment is None or AssignmentId not in ByAssignment:
        return None
    return list(ByAssignment[AssignmentId])


def _AscNullsLast(Value):
    return (Value is None, Value if Value is not None else 0)


def _HistoryOrder(AttemptRow: Attempt):
    # ORDER BY attempt_number ASC NULLS LAST, started_at ASC NULLS LAST,
    #          submitted_at ASC NULLS LAST, id ASC
    return (
        _AscNullsLast(AttemptRow.attempt_number),
        _AscNullsLast(AttemptRow.started_at),
        _AscNullsLast(AttemptRow.submitted_at),
        str(AttemptRow.id),
    )


def AttemptsForAssignmentStudentInOrder(Db: Session, AssignmentId: str, StudentId: str) -> list[Attempt] | None:
    """The attempt-history order used by both trackers."""
    Rows = AttemptsForAssignment(Db, AssignmentId)
    if Rows is None:
        return None
    return sorted((Row for Row in Rows if Row.student_id == StudentId), key=_HistoryOrder)


def _StartedTimestamp(Value: datetime | None) -> float:
    return Value.timestamp() if Value is not None else 0.0


def LatestAttemptForAssignmentStudent(Db: Session, AssignmentId: str, StudentId: str) -> tuple[bool, Attempt | None]:
    """(found_in_cache, attempt) for ORDER BY started_at DESC LIMIT 1, where
    Postgres puts NULL started_at first in a DESC sort."""
    Rows = AttemptsForAssignment(Db, AssignmentId)
    if Rows is None:
        return False, None
    Mine = [Row for Row in Rows if Row.student_id == StudentId]
    if not Mine:
        return True, None
    Mine.sort(key=lambda Row: (Row.started_at is not None, -_StartedTimestamp(Row.started_at)))
    return True, Mine[0]


def PrimeOpenReattemptPermissions(Db: Session, AssignmentIds: Iterable[str]) -> None:
    Cache = EnableRequestCache(Db)
    ByPair: dict[tuple[str, str], list] = {}
    Wanted = sorted({Value for Value in AssignmentIds if Value})
    for Chunk in _Chunks(Wanted):
        for Row in (
            Db.query(AssignmentReattemptPermission)
            .filter(
                AssignmentReattemptPermission.assignment_id.in_(Chunk),
                AssignmentReattemptPermission.status == "APPROVED",
                AssignmentReattemptPermission.used_at.is_(None),
            )
            .all()
        ):
            ByPair.setdefault((Row.assignment_id, Row.student_id), []).append(Row)
    for Rows in ByPair.values():
        Rows.sort(key=lambda Row: _AscNullsLast(Row.allowed_at))
    Cache["open_reattempt_permissions"] = ByPair
    Cache["open_reattempt_permission_assignments"] = set(Wanted)


def OpenReattemptPermission(Db: Session, AssignmentId: str, StudentId: str) -> tuple[bool, object | None]:
    """(found_in_cache, permission) for the oldest open APPROVED permission."""
    Cache = RequestCache(Db)
    if not Cache or AssignmentId not in Cache.get("open_reattempt_permission_assignments", set()):
        return False, None
    Rows = Cache["open_reattempt_permissions"].get((AssignmentId, StudentId)) or []
    return True, (Rows[0] if Rows else None)
