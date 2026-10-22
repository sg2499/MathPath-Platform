"""Performance Reports > Learning Performance roll-ups (2026-10-21, Part 3).

Built from the same attempt rows as the attempt list
(routes_admin._admin_learning_performance_payload), so every number agrees
with the tiles, the list and the Excel:

- a DPS is counted once per student, by its shared DPS state
  (dps_chain_state_service) -- the bucket map the tiles use;
- the period chooses which DPS and attempts count (practised in the
  period); first-try and tries-to-clear look at each DPS's whole history,
  because the first try may have been before the period.

Views: ``content`` (Module > Level > Lesson > DPS, and at one DPS its
students), ``students`` and ``teachers``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from statistics import median
from typing import Any, Callable, Iterable

COMPLETED = {"SUBMITTED", "AUTO_SUBMITTED", "COMPLETED"}
FLAG_MIN_ATTEMPTS = 3
FLAG_FIRST_TRY = 50

Key = tuple[str, str]


def _Completed(Row: dict) -> bool:
    return (Row.get("attemptStatus") or "").upper() in COMPLETED


def _When(Row: dict) -> datetime | None:
    Value = Row.get("submittedAt") or Row.get("startedAt")
    if not Value:
        return None
    try:
        Stamp = datetime.fromisoformat(str(Value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return Stamp if Stamp.tzinfo else Stamp.replace(tzinfo=timezone.utc)


def RowsInPeriod(Rows: Iterable[dict], Start: datetime | None) -> list[dict]:
    if Start is None:
        return list(Rows)
    return [Row for Row in Rows if (_When(Row) or datetime.min.replace(tzinfo=timezone.utc)) >= Start]


@dataclass
class _KeyStats:
    first_try_cleared: bool | None = None  # None: never submitted
    tries_to_clear: int | None = None
    completed: int = 0
    best_accuracy: float | None = None
    latest: dict | None = None
    latest_when: datetime | None = None
    chain: dict = field(default_factory=dict)


def KeyStats(AllRows: Iterable[dict], Benchmark: float) -> dict[Key, _KeyStats]:
    """Each (student, DPS)'s whole history, oldest attempt first."""
    ByKey: dict[Key, list[dict]] = {}
    for Row in AllRows:
        if Row.get("studentId") and Row.get("dpsId"):
            ByKey.setdefault((Row["studentId"], Row["dpsId"]), []).append(Row)
    Out: dict[Key, _KeyStats] = {}
    for KeyValue, Items in ByKey.items():
        Items.sort(key=lambda Row: (_When(Row) or datetime.min.replace(tzinfo=timezone.utc)))
        Stats = _KeyStats()
        for Row in Items:
            When = _When(Row)
            if Stats.latest_when is None or (When and When >= Stats.latest_when):
                Stats.latest, Stats.latest_when = Row, When
            if Row.get("dpsChain") and (Row.get("isCurrentChainRow") or not Stats.chain):
                Stats.chain = Row["dpsChain"]
            if not _Completed(Row):
                continue
            Stats.completed += 1
            Accuracy = float(Row.get("accuracyPercentage") or 0)
            Stats.best_accuracy = Accuracy if Stats.best_accuracy is None else max(Stats.best_accuracy, Accuracy)
            Cleared = Accuracy >= Benchmark
            if Stats.first_try_cleared is None:
                Stats.first_try_cleared = Cleared
            if Cleared and Stats.tries_to_clear is None:
                Stats.tries_to_clear = Stats.completed
        Out[KeyValue] = Stats
    return Out


def _Metrics(PeriodRows: list[dict], Keys: set[Key], Buckets: dict[Key, str], Stats: dict[Key, _KeyStats], Benchmark: float) -> dict[str, Any]:
    Completed = [Row for Row in PeriodRows if _Completed(Row)]
    Accuracies = [float(Row.get("accuracyPercentage") or 0) for Row in Completed]
    Times = [int(Row["timeTakenSeconds"]) for Row in Completed if Row.get("timeTakenSeconds")]
    Tried = [KeyValue for KeyValue in Keys if Stats.get(KeyValue) and Stats[KeyValue].first_try_cleared is not None]
    FirstTry = [KeyValue for KeyValue in Tried if Stats[KeyValue].first_try_cleared]
    Cleared = [KeyValue for KeyValue in Keys if Buckets.get(KeyValue) == "CLEARED"]
    Tries = [Stats[KeyValue].tries_to_clear for KeyValue in Cleared if Stats.get(KeyValue) and Stats[KeyValue].tries_to_clear]
    Whens = [When for When in (_When(Row) for Row in PeriodRows) if When]
    AverageAccuracy = round(sum(Accuracies) / len(Accuracies)) if Accuracies else None
    FirstTryRate = round(100 * len(FirstTry) / len(Tried)) if Tried else None
    Flag = None
    if len(Completed) >= FLAG_MIN_ATTEMPTS:
        if AverageAccuracy is not None and AverageAccuracy < Benchmark:
            Flag = "LOW_ACCURACY"
        elif FirstTryRate is not None and FirstTryRate < FLAG_FIRST_TRY:
            Flag = "LOW_FIRST_TRY"
    return {
        "students": len({KeyValue[0] for KeyValue in Keys}),
        "dpsCovered": len(Keys),
        "dpsCleared": len(Cleared),
        "dpsNeedsReattempt": sum(1 for KeyValue in Keys if Buckets.get(KeyValue) == "NEEDS_REATTEMPT"),
        "firstTryClearRate": FirstTryRate,
        "averageTriesToClear": round(sum(Tries) / len(Tries), 1) if Tries else None,
        "averageAccuracy": AverageAccuracy,
        "medianTimeSeconds": int(median(Times)) if Times else None,
        "attempts": len(PeriodRows),
        "practiceSeconds": sum(int(Row.get("timeTakenSeconds") or 0) for Row in Completed),
        "lastActive": max(Whens).isoformat() if Whens else None,
        "flag": Flag,
    }


def _Group(PeriodRows: list[dict], GroupOf: Callable[[dict], Any]) -> dict[Any, list[dict]]:
    Out: dict[Any, list[dict]] = {}
    for Row in PeriodRows:
        Out.setdefault(GroupOf(Row), []).append(Row)
    return Out


def _Keys(Rows: Iterable[dict]) -> set[Key]:
    return {(Row["studentId"], Row["dpsId"]) for Row in Rows if Row.get("studentId") and Row.get("dpsId")}


CONTENT_LEVELS = ("module", "level", "lesson", "dps")


def ContentLevel(module_id: str | None, level_id: str | None, lesson_id: str | None, dps_id: str | None) -> str:
    """What the drill-down lists at this scope."""
    if dps_id:
        return "student"
    if lesson_id:
        return "dps"
    if level_id:
        return "lesson"
    if module_id:
        return "level"
    return "module"


def _ContentGroup(Kind: str, Row: dict) -> tuple:
    if Kind == "module":
        return (Row.get("moduleId"),)
    if Kind == "level":
        return (Row.get("levelId"),)
    if Kind == "lesson":
        return (Row.get("lessonId"),)
    return (Row.get("dpsId"),)


def _ContentLabel(Kind: str, Row: dict) -> dict[str, Any]:
    if Kind == "module":
        return {"id": Row.get("moduleId"), "code": Row.get("moduleCode"), "name": Row.get("moduleName"), "order": (Row.get("moduleCode") or "",)}
    if Kind == "level":
        return {"id": Row.get("levelId"), "code": Row.get("levelCode"), "name": Row.get("levelName"), "order": (Row.get("levelCode") or "",)}
    if Kind == "lesson":
        Number = Row.get("lessonNumber")
        return {"id": Row.get("lessonId"), "code": f"Lesson {Number}" if Number else None, "name": Row.get("lessonTitle"), "order": (int(Number or 0),)}
    Number = Row.get("dpsNumber")
    return {"id": Row.get("dpsId"), "code": f"DPS {Number}" if Number else None, "name": Row.get("dpsTitle"), "order": (int(Number or 0),)}


def BuildContentRollup(PeriodRows: list[dict], Buckets: dict[Key, str], Stats: dict[Key, _KeyStats], Kind: str, Benchmark: float) -> list[dict]:
    Rows = []
    for _GroupKey, Items in _Group(PeriodRows, lambda Row: _ContentGroup(Kind, Row)).items():
        Label = _ContentLabel(Kind, Items[0])
        if not Label["id"]:
            continue
        Order = Label.pop("order")
        Rows.append({"kind": Kind, **Label, **_Metrics(Items, _Keys(Items), Buckets, Stats, Benchmark), "_order": Order})
    Rows.sort(key=lambda Row: Row.pop("_order"))
    return Rows


def BuildDpsStudents(PeriodRows: list[dict], Buckets: dict[Key, str], Stats: dict[Key, _KeyStats], Benchmark: float) -> list[dict]:
    """At one DPS: each student once, with the shared state of that DPS."""
    Rows = []
    for KeyValue in _Keys(PeriodRows):
        KeyStat = Stats.get(KeyValue) or _KeyStats()
        Latest = KeyStat.latest or {}
        Chain = KeyStat.chain or {}
        Bucket = Buckets.get(KeyValue, "PENDING")
        Fallback = {"CLEARED": ("Cleared", "green"), "NEEDS_REATTEMPT": ("Needs Re-Attempt", "amber")}.get(Bucket, ("In Progress", "slate"))
        Rows.append({
            "studentId": KeyValue[0],
            "studentName": Latest.get("studentName"),
            "studentCode": Latest.get("studentCode"),
            "teacherName": Latest.get("teacherName"),
            "statusLabel": Chain.get("label") or Fallback[0],
            "statusTone": Chain.get("tone") or Fallback[1],
            "bucket": Bucket,
            "tries": KeyStat.completed,
            "triesText": Chain.get("triesText") or (f"{KeyStat.completed} submitted" if KeyStat.completed else "—"),
            "bestAccuracy": round(KeyStat.best_accuracy) if KeyStat.best_accuracy is not None else None,
            "benchmarkMet": KeyStat.best_accuracy is not None and KeyStat.best_accuracy >= Benchmark,
            "lastActive": KeyStat.latest_when.isoformat() if KeyStat.latest_when else None,
            "dpsId": KeyValue[1],
            "assignmentId": Chain.get("awaitingApprovalAssignmentId") or Chain.get("currentAssignmentId"),
            "attemptId": Chain.get("awaitingApprovalAttemptId") or Chain.get("currentAttemptId") or Latest.get("attemptId"),
            "awaitingApproval": bool(Chain.get("awaitingApproval")),
        })
    Order = {"NEEDS_REATTEMPT": 0, "PENDING": 1, "CLEARED": 2}
    Rows.sort(key=lambda Row: (not Row["awaitingApproval"], Order.get(Row["bucket"], 1), (Row["studentName"] or "").lower()))
    return Rows


def BuildStudentRollup(PeriodRows: list[dict], Buckets: dict[Key, str], Stats: dict[Key, _KeyStats], Benchmark: float, CurrentLevel: dict[str, dict] | None = None) -> list[dict]:
    CurrentLevel = CurrentLevel or {}
    Rows = []
    for StudentId, Items in _Group(PeriodRows, lambda Row: Row.get("studentId")).items():
        if not StudentId:
            continue
        First = Items[0]
        Level = CurrentLevel.get(StudentId) or {}
        Rows.append({
            "studentId": StudentId,
            "studentName": First.get("studentName"),
            "studentCode": First.get("studentCode"),
            "teacherId": First.get("teacherId"),
            "teacherName": First.get("teacherName"),
            "currentLevelCode": Level.get("levelCode"),
            "currentLevelName": Level.get("levelName"),
            **_Metrics(Items, _Keys(Items), Buckets, Stats, Benchmark),
        })
    Rows.sort(key=lambda Row: (Row["studentName"] or "").lower())
    return Rows


def BuildTeacherRollup(
    PeriodRows: list[dict],
    AllRows: list[dict],
    Buckets: dict[Key, str],
    Stats: dict[Key, _KeyStats],
    Benchmark: float,
    Teachers: list[dict],
    ReadyByTeacher: dict[str | None, int] | None = None,
    Now: datetime | None = None,
) -> list[dict]:
    """Teachers: each teacher in ``Teachers`` ({teacherId, teacherName,
    teacherCode, roster}) once, even without practice in the period."""
    Now = Now or datetime.now(timezone.utc)
    WeekAgo = Now - timedelta(days=7)
    ReadyByTeacher = ReadyByTeacher or {}
    Grouped = _Group(PeriodRows, lambda Row: Row.get("teacherId"))
    AllGrouped = _Group(AllRows, lambda Row: Row.get("teacherId"))
    Known = {Item["teacherId"] for Item in Teachers}
    Extra = [{"teacherId": None, "teacherName": "Not Assigned", "teacherCode": None, "roster": None}] if None in Grouped and None not in Known else []
    Rows = []
    for Teacher in [*Teachers, *Extra]:
        TeacherId = Teacher["teacherId"]
        Items = Grouped.get(TeacherId, [])
        Everything = AllGrouped.get(TeacherId, [])
        Active = {Row["studentId"] for Row in Everything if _Completed(Row) and (_When(Row) or WeekAgo) > WeekAgo}
        Awaiting = {KeyValue for KeyValue in _Keys(Everything) if (Stats.get(KeyValue) and Stats[KeyValue].chain.get("awaitingApproval"))}
        Rows.append({
            "teacherId": TeacherId,
            "teacherName": Teacher.get("teacherName"),
            "teacherCode": Teacher.get("teacherCode"),
            "roster": Teacher.get("roster"),
            "activeLast7Days": len(Active),
            "approvalsWaiting": len(Awaiting),
            "readyToPromote": ReadyByTeacher.get(TeacherId, 0),
            **_Metrics(Items, _Keys(Items), Buckets, Stats, Benchmark),
        })
    Rows.sort(key=lambda Row: (Row["teacherId"] is None, (Row["teacherName"] or "").lower()))
    return Rows
