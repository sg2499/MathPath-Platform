"""Performance Reports > Overview (2026-10-21, Part 2).

One period (7, 30 or 90 days, ending now) against the period before it:
practice activity, DPS cleared, first-try clear rate, accuracy, practice
time, the re-attempt backlog, assessments, promotions, mocks and the annual
competition; the same activity week by week (day by day for 7 days); each
level's students; and a Needs Attention list.

Every DPS count uses the shared DPS state (dps_chain_state_service), the same
as the trackers and the rest of Performance Reports. The caller decides which
students and which part of the learning path are in scope (teacher, module,
level), so this module never guesses at either.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Iterable

from sqlalchemy.orm import Session

from app.models import (
    DPS,
    AssessmentAssignment,
    AssessmentBlueprint,
    AssessmentResult,
    Assignment,
    Attempt,
    CompetitionEventAttempt,
    CompetitionMockAttempt,
    Lesson,
    Level,
    Module,
    Student,
    StudentLevelPromotion,
    User,
)
from app.services.dps_chain_state_service import (
    AWAITING_APPROVAL,
    BENCHMARK_PERCENTAGE,
    BUCKET_CLEARED,
    BUCKET_NEEDS_REATTEMPT,
    BuildDpsChainIndex,
)

PERIODS = {"7d": 7, "30d": 30, "90d": 90}
DEFAULT_PERIOD = "30d"
COMPLETED = {"SUBMITTED", "AUTO_SUBMITTED", "COMPLETED"}
INACTIVE_DAYS = 7
STUCK_TRIES = 3
FALLING_POINTS = 15
FALLING_MIN_ATTEMPTS = 3
ATTENTION_LIMIT = 200


def _Aware(Value: datetime | None) -> datetime | None:
    if Value is None:
        return None
    return Value if Value.tzinfo else Value.replace(tzinfo=timezone.utc)


def _Completed(AttemptItem: Attempt) -> bool:
    return (AttemptItem.status or "").upper() in COMPLETED and _Aware(AttemptItem.submitted_at) is not None


def _Cleared(AttemptItem: Attempt) -> bool:
    return _Completed(AttemptItem) and float(AttemptItem.accuracy_percentage or 0) >= BENCHMARK_PERCENTAGE


def _Mean(Values: list[float]) -> float | None:
    return round(sum(Values) / len(Values)) if Values else None


def _Change(Now: float | int | None, Before: float | int | None) -> dict[str, Any]:
    return {"value": Now, "previous": Before, "change": (None if Now is None or Before is None else round(Now - Before, 1))}


@dataclass
class OverviewScope:
    """Who and what is in scope, resolved by the route (teacher, module, level)."""

    StudentIds: set[str]
    LevelIds: set[str] | None  # None: every level
    DpsIds: set[str] | None  # None: every DPS


def ResolvePeriod(Period: str | None, Now: datetime | None = None) -> tuple[str, datetime, datetime, datetime]:
    Key = Period if Period in PERIODS else DEFAULT_PERIOD
    End = _Aware(Now) or datetime.now(timezone.utc)
    Start = End - timedelta(days=PERIODS[Key])
    PreviousStart = Start - timedelta(days=PERIODS[Key])
    return Key, PreviousStart, Start, End


def _Buckets(Key: str, Start: datetime, End: datetime) -> list[tuple[datetime, datetime]]:
    """Days for 7 days, weeks otherwise, counted back from now; a short
    first week (30 days is four weeks and two days) joins the next one."""
    Step = timedelta(days=1) if Key == "7d" else timedelta(days=7)
    Out: list[tuple[datetime, datetime]] = []
    Cursor = End
    while Cursor > Start:
        Out.append((max(Start, Cursor - Step), Cursor))
        Cursor -= Step
    Out.reverse()
    if len(Out) > 1 and Out[0][1] - Out[0][0] < Step:
        Out[1] = (Out[0][0], Out[1][1])
        Out.pop(0)
    return Out


def BuildPerformanceOverview(
    Db: Session,
    Scope: OverviewScope,
    Period: str | None = None,
    Now: datetime | None = None,
    PromotionReadyIds: Callable[[Iterable[str]], set[str]] | None = None,
) -> dict[str, Any]:
    Key, PreviousStart, Start, End = ResolvePeriod(Period, Now)
    StudentIds = set(Scope.StudentIds)
    Students = {Item.id: Item for Item in (Db.query(Student).filter(Student.id.in_(list(StudentIds))).all() if StudentIds else [])}
    Users = {Item.id: Item for Item in (Db.query(User).filter(User.id.in_([S.user_id for S in Students.values() if S.user_id])).all() if Students else [])}

    # ---- practice attempts in scope, from the start of the previous period
    Attempts: list[Attempt] = []
    if StudentIds:
        Ids = list(StudentIds)
        for Chunk in range(0, len(Ids), 900):
            Query = Db.query(Attempt).filter(Attempt.student_id.in_(Ids[Chunk:Chunk + 900]))
            if Scope.DpsIds is not None:
                if not Scope.DpsIds:
                    continue
                Query = Query.filter(Attempt.dps_id.in_(list(Scope.DpsIds)))
            Attempts.extend(Query.all())
    AssignmentIds = {A.assignment_id for A in Attempts if A.assignment_id}
    AssessmentAssignmentIds = {
        Row.id
        for Chunk in range(0, len(AssignmentIds), 900)
        for Row in Db.query(Assignment.id).filter(Assignment.id.in_(list(AssignmentIds)[Chunk:Chunk + 900]), Assignment.assignment_type == "ASSESSMENT").all()
    } if AssignmentIds else set()
    Practice = [A for A in Attempts if A.dps_id and A.assignment_id not in AssessmentAssignmentIds]

    # each (student, DPS): its attempts in order
    ByConcept: dict[tuple[str, str], list[Attempt]] = defaultdict(list)
    for A in Practice:
        ByConcept[(A.student_id, A.dps_id)].append(A)
    for Rows in ByConcept.values():
        Rows.sort(key=lambda A: (_Aware(A.submitted_at) or _Aware(A.started_at) or datetime.min.replace(tzinfo=timezone.utc)))

    def Within(Value: datetime | None, From: datetime, To: datetime) -> bool:
        Value = _Aware(Value)
        return Value is not None and From <= Value < To

    def PracticeFigures(From: datetime, To: datetime) -> dict[str, Any]:
        Done = [A for A in Practice if _Completed(A) and Within(A.submitted_at, From, To)]
        Cleared = 0
        FirstTries = 0
        FirstTryCleared = 0
        for Rows in ByConcept.values():
            CompletedRows = [A for A in Rows if _Completed(A)]
            FirstClear = next((A for A in CompletedRows if _Cleared(A)), None)
            if FirstClear is not None and Within(FirstClear.submitted_at, From, To):
                Cleared += 1
            if CompletedRows and Within(CompletedRows[0].submitted_at, From, To):
                FirstTries += 1
                FirstTryCleared += 1 if _Cleared(CompletedRows[0]) else 0
        return {
            "attempts": len(Done),
            "activeStudents": len({A.student_id for A in Done}),
            "dpsCleared": Cleared,
            "firstTryClearRate": (round(100 * FirstTryCleared / FirstTries) if FirstTries else None),
            "averageAccuracy": _Mean([float(A.accuracy_percentage or 0) for A in Done]),
            "practiceMinutes": round(sum(int(A.time_taken_seconds or 0) for A in Done) / 60),
        }

    Current = PracticeFigures(Start, End)
    Previous = PracticeFigures(PreviousStart, Start)

    # ---- the shared DPS state now (backlog, tries, approvals)
    Chain = BuildDpsChainIndex(Db, StudentIds=list(StudentIds), StudentsByLevel=_StudentsByLevel(Students.values()), Heal=False) if StudentIds else None
    Concepts = [C for C in (Chain.concepts.values() if Chain else []) if Scope.DpsIds is None or C.dps_id in Scope.DpsIds]
    Backlog = sum(1 for C in Concepts if C.bucket == BUCKET_NEEDS_REATTEMPT)

    # ---- assessments, promotions, mocks, the annual competition
    def AssessmentFigures(From: datetime, To: datetime) -> dict[str, Any]:
        if not StudentIds:
            return {"taken": 0, "passed": 0, "passRate": None}
        Query = (
            Db.query(AssessmentResult, AssessmentBlueprint)
            .join(AssessmentAssignment, AssessmentAssignment.id == AssessmentResult.assessment_assignment_id)
            .join(AssessmentBlueprint, AssessmentBlueprint.id == AssessmentAssignment.blueprint_id)
            .filter(AssessmentAssignment.student_id.in_(list(StudentIds)))
        )
        Rows = [(R, B) for R, B in Query.all() if (Scope.LevelIds is None or B.level_id in Scope.LevelIds) and Within(R.completion_date or R.created_at, From, To)]
        Passed = sum(1 for R, _B in Rows if R.cleared)
        return {"taken": len(Rows), "passed": Passed, "passRate": (round(100 * Passed / len(Rows)) if Rows else None)}

    def Promotions(From: datetime, To: datetime) -> list[StudentLevelPromotion]:
        if not StudentIds:
            return []
        Rows = Db.query(StudentLevelPromotion).filter(StudentLevelPromotion.student_id.in_(list(StudentIds)), StudentLevelPromotion.status == "PROMOTED").all()
        return [P for P in Rows if (Scope.LevelIds is None or P.from_level_id in Scope.LevelIds) and Within(P.promoted_at or P.created_at, From, To)]

    def Mocks(From: datetime, To: datetime) -> dict[str, int]:
        if not StudentIds:
            return {"taken": 0, "students": 0}
        Rows = [M for M in Db.query(CompetitionMockAttempt).filter(CompetitionMockAttempt.student_id.in_(list(StudentIds))).all() if M.submitted_at and Within(M.submitted_at, From, To)]
        return {"taken": len(Rows), "students": len({M.student_id for M in Rows})}

    def Annual(From: datetime, To: datetime) -> dict[str, int]:
        if not StudentIds:
            return {"taken": 0, "students": 0, "official": 0}
        Rows = [E for E in Db.query(CompetitionEventAttempt).filter(CompetitionEventAttempt.student_id.in_(list(StudentIds))).all() if E.submitted_at and Within(E.submitted_at, From, To)]
        return {"taken": len(Rows), "students": len({E.student_id for E in Rows}), "official": sum(1 for E in Rows if (E.attempt_type or "").upper() == "OFFICIAL")}

    AssessNow, AssessBefore = AssessmentFigures(Start, End), AssessmentFigures(PreviousStart, Start)
    PromotedNow, PromotedBefore = Promotions(Start, End), Promotions(PreviousStart, Start)
    MocksNow, MocksBefore = Mocks(Start, End), Mocks(PreviousStart, Start)
    AnnualNow, AnnualBefore = Annual(Start, End), Annual(PreviousStart, Start)

    Tiles = {
        "activeStudents": {**_Change(Current["activeStudents"], Previous["activeStudents"]), "of": len(StudentIds)},
        "dpsCleared": _Change(Current["dpsCleared"], Previous["dpsCleared"]),
        "firstTryClearRate": _Change(Current["firstTryClearRate"], Previous["firstTryClearRate"]),
        "averageAccuracy": _Change(Current["averageAccuracy"], Previous["averageAccuracy"]),
        "practiceMinutes": _Change(Current["practiceMinutes"], Previous["practiceMinutes"]),
        "attempts": _Change(Current["attempts"], Previous["attempts"]),
        "reattemptBacklog": {"value": Backlog, "previous": None, "change": None},
        "assessmentPassRate": {**_Change(AssessNow["passRate"], AssessBefore["passRate"]), "taken": AssessNow["taken"], "passed": AssessNow["passed"]},
        "promotions": _Change(len(PromotedNow), len(PromotedBefore)),
        "mocksTaken": {**_Change(MocksNow["taken"], MocksBefore["taken"]), "students": MocksNow["students"]},
        "annualAttempts": {**_Change(AnnualNow["taken"], AnnualBefore["taken"]), "students": AnnualNow["students"], "official": AnnualNow["official"]},
    }

    # ---- week by week (day by day for 7 days)
    Series = []
    for From, To in _Buckets(Key, Start, End):
        Figures = PracticeFigures(From, To)
        Series.append({
            "from": From.isoformat(),
            "to": To.isoformat(),
            "attempts": Figures["attempts"],
            "dpsCleared": Figures["dpsCleared"],
            "activeStudents": Figures["activeStudents"],
            "averageAccuracy": Figures["averageAccuracy"],
        })

    # ---- each level's students
    ReadyIds = PromotionReadyIds(StudentIds) if PromotionReadyIds and StudentIds else set()
    LevelRows = _LevelFunnel(Db, Students.values(), Scope.LevelIds, ReadyIds, PromotedNow)

    # ---- needs attention
    Attention = _NeedsAttention(Db, Students, Users, Practice, Concepts, ReadyIds, End)

    return {
        "period": {"key": Key, "days": PERIODS[Key], "from": Start.isoformat(), "to": End.isoformat(), "previousFrom": PreviousStart.isoformat(), "previousTo": Start.isoformat()},
        "studentsInScope": len(StudentIds),
        "tiles": Tiles,
        "series": Series,
        "seriesStep": "day" if Key == "7d" else "week",
        "levels": LevelRows,
        "attention": Attention[:ATTENTION_LIMIT],
        "attentionTotal": len(Attention),
        "attentionCounts": _CountKinds(Attention),
        "rules": {
            "benchmark": BENCHMARK_PERCENTAGE,
            "inactiveDays": INACTIVE_DAYS,
            "stuckTries": STUCK_TRIES,
            "fallingPoints": FALLING_POINTS,
        },
    }


def _StudentsByLevel(Students: Iterable[Student]) -> dict[str, list[str]]:
    Out: dict[str, list[str]] = {}
    for Item in Students:
        if Item.current_level_id:
            Out.setdefault(Item.current_level_id, []).append(Item.id)
    return Out


def _LevelFunnel(Db: Session, Students: Iterable[Student], LevelIds: set[str] | None, ReadyIds: set[str], PromotedNow: list[StudentLevelPromotion]) -> list[dict[str, Any]]:
    OnLevel: dict[str, set[str]] = defaultdict(set)
    for Item in Students:
        if Item.current_level_id and (LevelIds is None or Item.current_level_id in LevelIds):
            OnLevel[Item.current_level_id].add(Item.id)
    PromotedOut: dict[str, set[str]] = defaultdict(set)
    for P in PromotedNow:
        PromotedOut[P.from_level_id].add(P.student_id)
    Keys = set(OnLevel) | set(PromotedOut)
    if not Keys:
        return []
    Levels = {L.id: L for L in Db.query(Level).filter(Level.id.in_(list(Keys))).all()}
    Modules = {M.id: M for M in Db.query(Module).filter(Module.id.in_([L.module_id for L in Levels.values()])).all()}
    Rows = []
    for LevelId in Keys:
        LevelItem = Levels.get(LevelId)
        if not LevelItem:
            continue
        ModuleItem = Modules.get(LevelItem.module_id)
        Rows.append({
            "levelId": LevelId,
            "levelCode": LevelItem.level_code,
            "levelName": LevelItem.level_name,
            "moduleCode": ModuleItem.module_code if ModuleItem else None,
            "onLevel": len(OnLevel.get(LevelId, set())),
            "readyToPromote": len(OnLevel.get(LevelId, set()) & ReadyIds),
            "promotedOut": len(PromotedOut.get(LevelId, set())),
            "_order": ((ModuleItem.display_order if ModuleItem else 0), LevelItem.display_order or 0, LevelItem.internal_level_number or 0, LevelItem.level_code or ""),
        })
    Rows.sort(key=lambda Row: Row.pop("_order"))
    return Rows


KIND_ORDER = {"APPROVAL": 0, "STUCK": 1, "READY": 2, "FALLING": 3, "INACTIVE": 4}


def _CountKinds(Items: list[dict]) -> dict[str, int]:
    Counts = {Kind: 0 for Kind in KIND_ORDER}
    for Item in Items:
        Counts[Item["kind"]] = Counts.get(Item["kind"], 0) + 1
    return Counts


def _NeedsAttention(Db: Session, Students: dict[str, Student], Users: dict[str, User], Practice: list[Attempt], Concepts: list, ReadyIds: set[str], Now: datetime) -> list[dict[str, Any]]:
    def Person(StudentId: str) -> dict[str, Any]:
        Item = Students.get(StudentId)
        UserItem = Users.get(Item.user_id) if Item else None
        return {
            "studentId": StudentId,
            "studentCode": Item.student_code if Item else None,
            "studentName": UserItem.full_name if UserItem else None,
            "teacherName": (Item.teacher or None) if Item else None,
        }

    Items: list[dict[str, Any]] = []
    DpsIds = {C.dps_id for C in Concepts}
    DpsRows = {D.id: D for D in Db.query(DPS).filter(DPS.id.in_(list(DpsIds))).all()} if DpsIds else {}
    Lessons = {L.id: L for L in Db.query(Lesson).filter(Lesson.id.in_([D.lesson_id for D in DpsRows.values()])).all()} if DpsRows else {}
    LevelsById = {L.id: L for L in Db.query(Level).filter(Level.id.in_([L.level_id for L in Lessons.values()])).all()} if Lessons else {}

    def Where(DpsId: str) -> dict[str, Any]:
        D = DpsRows.get(DpsId)
        L = Lessons.get(D.lesson_id) if D else None
        V = LevelsById.get(L.level_id) if L else None
        return {"dpsId": DpsId, "dpsNumber": D.dps_number if D else None, "lessonNumber": L.lesson_number if L else None, "levelCode": V.level_code if V else None}

    # waiting for an admin to approve another try; three or more tries used
    for C in Concepts:
        if C.student_id not in Students:
            continue
        if C.state == AWAITING_APPROVAL:
            Items.append({**Person(C.student_id), **Where(C.dps_id), "kind": "APPROVAL", "label": "Waiting For Approval", "detail": f"{C.tries_used} tries used; another try needs your approval", "since": _Iso(C.last_activity_at), "assignmentId": C.awaiting_approval_assignment_id or C.current_assignment_id, "attemptId": C.awaiting_approval_attempt_id})
        elif C.bucket == BUCKET_NEEDS_REATTEMPT and C.tries_used >= STUCK_TRIES:
            Items.append({**Person(C.student_id), **Where(C.dps_id), "kind": "STUCK", "label": f"{C.tries_used} Tries", "detail": f"{C.tries_used} tries without clearing; {C.label}", "since": _Iso(C.last_activity_at), "assignmentId": C.current_assignment_id, "attemptId": C.current_attempt_id})

    # ready to promote
    for StudentId in sorted(ReadyIds):
        if StudentId in Students:
            Items.append({**Person(StudentId), "kind": "READY", "label": "Ready To Promote", "detail": "Level assessment cleared; not promoted yet", "since": None})

    # accuracy falling: the last 7 days against the 7 before
    ByStudent: dict[str, list[Attempt]] = defaultdict(list)
    for A in Practice:
        if _Completed(A):
            ByStudent[A.student_id].append(A)
    Week = timedelta(days=7)
    for StudentId, Rows in ByStudent.items():
        Recent = [float(A.accuracy_percentage or 0) for A in Rows if Now - Week <= _Aware(A.submitted_at) < Now]
        Before = [float(A.accuracy_percentage or 0) for A in Rows if Now - 2 * Week <= _Aware(A.submitted_at) < Now - Week]
        if len(Recent) >= FALLING_MIN_ATTEMPTS and len(Before) >= FALLING_MIN_ATTEMPTS:
            Drop = (sum(Before) / len(Before)) - (sum(Recent) / len(Recent))
            if Drop >= FALLING_POINTS:
                Items.append({**Person(StudentId), "kind": "FALLING", "label": "Accuracy Falling", "detail": f"{round(sum(Recent) / len(Recent))}% this week, down from {round(sum(Before) / len(Before))}%", "since": None, "drop": round(Drop)})

    # no practice for a week (students with practice to do)
    HasWork = {C.student_id for C in Concepts if C.bucket != BUCKET_CLEARED}
    Last: dict[str, datetime] = {}
    for A in Practice:
        Stamp = _Aware(A.submitted_at) or _Aware(A.started_at)
        if Stamp and (A.student_id not in Last or Stamp > Last[A.student_id]):
            Last[A.student_id] = Stamp
    for StudentId, Item in Students.items():
        if StudentId not in HasWork:
            continue
        Seen = Last.get(StudentId)
        if Seen is None:
            Items.append({**Person(StudentId), "kind": "INACTIVE", "label": "No Practice Yet", "detail": "Has practice assigned and has not started", "since": None, "idleDays": None})
        elif Now - Seen >= timedelta(days=INACTIVE_DAYS):
            Days = (Now - Seen).days
            Items.append({**Person(StudentId), "kind": "INACTIVE", "label": f"Idle {Days} Days", "detail": f"Last practice {Days} days ago", "since": Seen.isoformat(), "idleDays": Days})

    Items.sort(key=lambda Item: (KIND_ORDER.get(Item["kind"], 9), -(Item.get("idleDays") or 0), Item.get("studentName") or ""))
    return Items


def _Iso(Value: datetime | None) -> str | None:
    Value = _Aware(Value)
    return Value.isoformat() if Value else None
