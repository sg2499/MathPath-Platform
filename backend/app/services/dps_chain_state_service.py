"""One shared answer to "where does this student stand on this DPS?"

2026-10-13 (Shailesh: teachers found "Needs Re-Attempt" confusing -- it was
one label for four different situations, and they had to open each student
to see whether a re-attempt needed admin approval). Every admin and teacher
practice table now reads the state of each DPS from here, so a card, the
list behind it and the student's own view can never disagree.

The rules (unchanged, only made visible):
  - A DPS gets the original attempt plus 2 automatic re-attempts (3 tries).
  - If Re-Attempt 2 also falls below the benchmark, only an admin can open
    the next sheet. An approved extra sheet that is also failed needs
    approval again.

A "concept" is one student on one DPS. Its current step is the newest
active assignment for it (the highest re-attempt number, then the newest);
its state comes from that step's latest attempt.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy.orm import Session

from app.models import Assignment, Attempt
from app.services.attempt_chain_service import (
    ATTEMPT_SOURCE_MANUAL_RETRY,
    BENCHMARK_STATUS_MANUAL_INTERVENTION_REQUIRED,
    DEFAULT_AUTO_RETRY_LIMIT,
    ResolveAttemptGroupId,
)

BENCHMARK_PERCENTAGE = 70.0
COMPLETED_STATUSES = {"SUBMITTED", "AUTO_SUBMITTED", "COMPLETED"}
INCLUDED_TRIES = DEFAULT_AUTO_RETRY_LIMIT + 1  # original + 2 automatic re-attempts

# States
NOT_STARTED = "NOT_STARTED"
IN_PROGRESS = "IN_PROGRESS"
CLEARED = "CLEARED"
REATTEMPT_OPEN = "REATTEMPT_OPEN"
REATTEMPT_IN_PROGRESS = "REATTEMPT_IN_PROGRESS"
AWAITING_APPROVAL = "AWAITING_APPROVAL"
APPROVED_REATTEMPT_OPEN = "APPROVED_REATTEMPT_OPEN"
APPROVED_REATTEMPT_IN_PROGRESS = "APPROVED_REATTEMPT_IN_PROGRESS"
REATTEMPT_NOT_ASSIGNED = "REATTEMPT_NOT_ASSIGNED"

# Buckets every card and filter uses
BUCKET_PENDING = "PENDING"
BUCKET_CLEARED = "CLEARED"
BUCKET_NEEDS_REATTEMPT = "NEEDS_REATTEMPT"

STATE_BUCKET = {
    NOT_STARTED: BUCKET_PENDING,
    IN_PROGRESS: BUCKET_PENDING,
    CLEARED: BUCKET_CLEARED,
    REATTEMPT_OPEN: BUCKET_NEEDS_REATTEMPT,
    REATTEMPT_IN_PROGRESS: BUCKET_NEEDS_REATTEMPT,
    AWAITING_APPROVAL: BUCKET_NEEDS_REATTEMPT,
    APPROVED_REATTEMPT_OPEN: BUCKET_NEEDS_REATTEMPT,
    APPROVED_REATTEMPT_IN_PROGRESS: BUCKET_NEEDS_REATTEMPT,
    REATTEMPT_NOT_ASSIGNED: BUCKET_NEEDS_REATTEMPT,
}

STATE_TONE = {
    NOT_STARTED: "amber",
    IN_PROGRESS: "blue",
    CLEARED: "green",
    REATTEMPT_OPEN: "purple",
    REATTEMPT_IN_PROGRESS: "blue",
    AWAITING_APPROVAL: "red",
    APPROVED_REATTEMPT_OPEN: "purple",
    APPROVED_REATTEMPT_IN_PROGRESS: "blue",
    REATTEMPT_NOT_ASSIGNED: "red",
}


def _Aware(Value: datetime | None) -> datetime:
    if Value is None:
        return datetime.min.replace(tzinfo=timezone.utc)
    if Value.tzinfo is None:
        return Value.replace(tzinfo=timezone.utc)
    return Value


def IsCompleted(AttemptItem: Attempt | None) -> bool:
    return bool(AttemptItem) and str(AttemptItem.status or "").upper() in COMPLETED_STATUSES


def IsCleared(AttemptItem: Attempt | None, Benchmark: float = BENCHMARK_PERCENTAGE) -> bool:
    if not IsCompleted(AttemptItem):
        return False
    try:
        Accuracy = float(AttemptItem.accuracy_percentage or 0)
    except (TypeError, ValueError):
        Accuracy = 0.0
    return Accuracy >= Benchmark or str(AttemptItem.benchmark_status or "").upper() == "CLEARED"


def IsAwaitingApproval(AttemptItem: Attempt | None) -> bool:
    if not IsCompleted(AttemptItem) or IsCleared(AttemptItem):
        return False
    return bool(AttemptItem.requires_manual_intervention) or str(AttemptItem.benchmark_status or "").upper() == BENCHMARK_STATUS_MANUAL_INTERVENTION_REQUIRED


def StepLabel(Number: int | None) -> str:
    Value = int(Number or 0)
    return "Original" if Value <= 0 else f"Re-Attempt {Value}"


def _AttemptOrder(AttemptItem: Attempt):
    return (_Aware(AttemptItem.started_at), _Aware(AttemptItem.submitted_at), str(AttemptItem.id))


def _AssignmentOrder(AssignmentItem: Assignment):
    return (int(AssignmentItem.retry_attempt_number or 0), _Aware(AssignmentItem.created_at), str(AssignmentItem.id))


@dataclass
class ConceptState:
    student_id: str
    dps_id: str
    state: str
    label: str
    step: int
    tries_used: int
    tries_allowed: int
    approved_extra: int
    current_assignment_id: str | None
    current_attempt_id: str | None
    awaiting_approval_attempt_id: str | None = None
    awaiting_approval_assignment_id: str | None = None
    cleared_on: int | None = None
    last_activity_at: datetime | None = None
    assignment_ids: list[str] = field(default_factory=list)

    @property
    def key(self) -> str:
        return f"{self.student_id}::{self.dps_id}"

    @property
    def bucket(self) -> str:
        return STATE_BUCKET[self.state]

    def payload(self) -> dict:
        return {
            "key": self.key,
            "state": self.state,
            "bucket": self.bucket,
            "label": self.label,
            "tone": STATE_TONE[self.state],
            "step": self.step,
            "stepLabel": StepLabel(self.step),
            "triesUsed": self.tries_used,
            "triesAllowed": self.tries_allowed,
            "approvedExtra": self.approved_extra,
            "triesText": f"{self.tries_used} of {self.tries_allowed} used"
            + (f" · {self.approved_extra} approved" if self.approved_extra else ""),
            "currentAssignmentId": self.current_assignment_id,
            "currentAttemptId": self.current_attempt_id,
            "awaitingApproval": self.state == AWAITING_APPROVAL,
            "awaitingApprovalAttemptId": self.awaiting_approval_attempt_id,
            "awaitingApprovalAssignmentId": self.awaiting_approval_assignment_id,
            "clearedOn": self.cleared_on,
            "needsReattempt": self.bucket == BUCKET_NEEDS_REATTEMPT,
        }


def _Label(State: str, Step: int, ClearedOn: int | None) -> str:
    if State == NOT_STARTED:
        return "Not Started"
    if State == IN_PROGRESS:
        return "In Progress"
    if State == CLEARED:
        return "Cleared" if not ClearedOn else f"Cleared On Re-Attempt {ClearedOn}"
    if State == REATTEMPT_OPEN:
        return f"Re-Attempt {Step} Open"
    if State == REATTEMPT_IN_PROGRESS:
        return f"Re-Attempt {Step} In Progress"
    if State == AWAITING_APPROVAL:
        return "Awaiting Admin Approval"
    if State == APPROVED_REATTEMPT_OPEN:
        return f"Approved Re-Attempt {Step} Open"
    if State == APPROVED_REATTEMPT_IN_PROGRESS:
        return f"Approved Re-Attempt {Step} In Progress"
    return "Re-Attempt Not Yet Assigned"


def BuildConceptState(StudentId: str, DpsId: str, Assignments: list[Assignment], AttemptsByAssignment: dict[str, list[Attempt]], Benchmark: float = BENCHMARK_PERCENTAGE) -> ConceptState:
    Ordered = sorted(Assignments, key=_AssignmentOrder)
    Current = Ordered[-1]
    Step = int(Current.retry_attempt_number or 0)
    IsApprovedStep = str(Current.assignment_source or "").upper() == ATTEMPT_SOURCE_MANUAL_RETRY or Step > DEFAULT_AUTO_RETRY_LIMIT
    CurrentAttempts = sorted(AttemptsByAssignment.get(Current.id, []), key=_AttemptOrder)
    CurrentAttempt = CurrentAttempts[-1] if CurrentAttempts else None

    AllAttempts = [Item for Assignment_ in Ordered for Item in AttemptsByAssignment.get(Assignment_.id, [])]
    Completed = sorted([Item for Item in AllAttempts if IsCompleted(Item)], key=lambda Item: _Aware(Item.submitted_at or Item.started_at))
    LatestCompleted = Completed[-1] if Completed else None

    # Tries count within the current step's re-attempt chain (the 3-try rule
    # is per chain); approved extra sheets are the admin-approved steps in it.
    CurrentGroup = ResolveAttemptGroupId(Current, StudentId)
    GroupAssignments = [Item for Item in Ordered if ResolveAttemptGroupId(Item, StudentId) == CurrentGroup]
    GroupAssignmentIds = {Item.id for Item in GroupAssignments}
    TriesUsed = sum(1 for Item in Completed if Item.assignment_id in GroupAssignmentIds)
    ApprovedExtra = sum(1 for Item in GroupAssignments if str(Item.assignment_source or "").upper() == ATTEMPT_SOURCE_MANUAL_RETRY)
    TriesAllowed = max(INCLUDED_TRIES + ApprovedExtra, TriesUsed)

    ClearedOn = None
    AwaitingAttemptId = None
    AwaitingAssignmentId = None
    if CurrentAttempt is None:
        if Step > 0:
            State = APPROVED_REATTEMPT_OPEN if IsApprovedStep else REATTEMPT_OPEN
        elif LatestCompleted is not None and IsCleared(LatestCompleted, Benchmark):
            # The same DPS assigned again after it was already cleared.
            State = CLEARED
        elif LatestCompleted is not None:
            # Assigned again by hand after a failed attempt: still owed.
            State = REATTEMPT_OPEN
        else:
            State = NOT_STARTED
    elif not IsCompleted(CurrentAttempt):
        if Step > 0:
            State = APPROVED_REATTEMPT_IN_PROGRESS if IsApprovedStep else REATTEMPT_IN_PROGRESS
        else:
            State = IN_PROGRESS
    elif IsCleared(CurrentAttempt, Benchmark):
        State = CLEARED
    elif IsAwaitingApproval(CurrentAttempt):
        State = AWAITING_APPROVAL
        AwaitingAttemptId = CurrentAttempt.id
        AwaitingAssignmentId = Current.id
    else:
        State = REATTEMPT_NOT_ASSIGNED

    if State == CLEARED:
        ClearingAttempt = CurrentAttempt if CurrentAttempt is not None and IsCleared(CurrentAttempt, Benchmark) else LatestCompleted
        ClearingAssignment = next((Item for Item in Ordered if ClearingAttempt is not None and Item.id == ClearingAttempt.assignment_id), None)
        ClearedNumber = int(ClearingAssignment.retry_attempt_number or 0) if ClearingAssignment else 0
        ClearedOn = ClearedNumber or None

    LastActivity = max(
        [_Aware(Item.submitted_at or Item.started_at) for Item in AllAttempts] + [_Aware(Item.created_at) for Item in Ordered],
        default=None,
    )
    ShownAttempt = CurrentAttempt
    if State == CLEARED and CurrentAttempt is None and LatestCompleted is not None:
        ShownAttempt = LatestCompleted

    return ConceptState(
        student_id=StudentId,
        dps_id=DpsId,
        state=State,
        label=_Label(State, Step, ClearedOn),
        step=Step,
        tries_used=TriesUsed,
        tries_allowed=TriesAllowed,
        approved_extra=ApprovedExtra,
        current_assignment_id=(ShownAttempt.assignment_id if ShownAttempt is not None and State == CLEARED and CurrentAttempt is None else Current.id),
        current_attempt_id=ShownAttempt.id if ShownAttempt is not None else None,
        awaiting_approval_attempt_id=AwaitingAttemptId,
        awaiting_approval_assignment_id=AwaitingAssignmentId,
        cleared_on=ClearedOn,
        last_activity_at=LastActivity,
        assignment_ids=[Item.id for Item in Ordered],
    )


class DpsChainIndex:
    """Concept states for a set of students, built from two queries."""

    def __init__(self, Concepts: dict[tuple[str, str], ConceptState], AssignmentConcept: dict[tuple[str, str], tuple[str, str]], AttemptsByAssignment: dict[str, list[Attempt]]):
        self.concepts = Concepts
        self._assignment_concept = AssignmentConcept
        self._attempts_by_assignment = AttemptsByAssignment

    def for_assignment(self, AssignmentId: str, StudentId: str) -> ConceptState | None:
        Key = self._assignment_concept.get((AssignmentId, StudentId))
        return self.concepts.get(Key) if Key else None

    def row_fields(self, AssignmentId: str, StudentId: str) -> dict:
        """Fields added to one practice-tracker row (one assignment, one student)."""
        Concept = self.for_assignment(AssignmentId, StudentId)
        if Concept is None:
            return {}
        IsCurrent = AssignmentId == Concept.current_assignment_id
        return {
            "dpsChain": Concept.payload(),
            "isCurrentChainRow": IsCurrent,
            "chainRowLabel": Concept.label if IsCurrent else self._history_label(AssignmentId, StudentId, Concept),
            "chainRowTone": STATE_TONE[Concept.state] if IsCurrent else self._history_tone(AssignmentId, StudentId),
        }

    def attempt_fields(self, AttemptId: str | None, AssignmentId: str, StudentId: str) -> dict:
        """Fields added to one attempt-history entry."""
        Concept = self.for_assignment(AssignmentId, StudentId)
        if Concept is None or not AttemptId:
            return {}
        AttemptItem = next((Item for Item in self._attempts_by_assignment.get(AssignmentId, []) if Item.id == AttemptId), None)
        IsCurrent = AttemptId == Concept.current_attempt_id
        if IsCurrent:
            Label, Tone = Concept.label, STATE_TONE[Concept.state]
        elif AttemptItem is not None and not IsCompleted(AttemptItem):
            Label, Tone = "Not Submitted", "slate"
        elif AttemptItem is not None and IsCleared(AttemptItem):
            Label, Tone = "Cleared", "green"
        else:
            Label, Tone = "Below Benchmark", "slate"
        return {
            "dpsChain": Concept.payload(),
            "isCurrentChainRow": IsCurrent,
            "chainRowLabel": Label,
            "chainRowTone": Tone,
        }

    def _latest_attempt(self, AssignmentId: str, StudentId: str) -> Attempt | None:
        Attempts = sorted([Item for Item in self._attempts_by_assignment.get(AssignmentId, []) if Item.student_id == StudentId], key=_AttemptOrder)
        return Attempts[-1] if Attempts else None

    def _history_label(self, AssignmentId: str, StudentId: str, Concept: ConceptState) -> str:
        Latest = self._latest_attempt(AssignmentId, StudentId)
        if Latest is None:
            return "Not Attempted"
        if not IsCompleted(Latest):
            return "Not Submitted"
        if IsCleared(Latest):
            return "Cleared"
        return "Below Benchmark"

    def _history_tone(self, AssignmentId: str, StudentId: str) -> str:
        Latest = self._latest_attempt(AssignmentId, StudentId)
        return "green" if Latest is not None and IsCleared(Latest) else "slate"

    def awaiting_approval(self) -> list[ConceptState]:
        return [Concept for Concept in self.concepts.values() if Concept.state == AWAITING_APPROVAL]


def _StudentIdsFor(AssignmentItem: Assignment, StudentsByLevel: dict[str, list[str]], StudentIdSet: set[str] | None) -> list[str]:
    if AssignmentItem.assigned_to_type == "STUDENT":
        if StudentIdSet is None or AssignmentItem.assigned_to_id in StudentIdSet:
            return [AssignmentItem.assigned_to_id]
        return []
    if AssignmentItem.assigned_to_type == "LEVEL":
        return list(StudentsByLevel.get(AssignmentItem.assigned_to_id, []))
    return []


def HealExpiredPracticeAttempts(db: Session, StudentIds: Iterable[str] | None = None) -> int:
    """Submit every practice attempt whose timer ran out but is still marked
    in progress (the same self-heal every result view does), BEFORE anything
    reads states or lists assignments -- otherwise a page could build its
    state while the same request auto-submits the sheet (and opens its next
    re-attempt) halfway through. Returns how many were settled."""
    from app.services.attempt_service import ensure_active_or_auto_submit

    Now = datetime.now(timezone.utc)
    Query = db.query(Attempt).filter(Attempt.status == "IN_PROGRESS", Attempt.expires_at < Now, Attempt.assignment_id.isnot(None))
    if StudentIds is not None:
        Ids = list(StudentIds)
        if not Ids:
            return 0
        Query = Query.filter(Attempt.student_id.in_(Ids))
    Settled = 0
    for AttemptItem in Query.all():
        Before = AttemptItem.status
        ensure_active_or_auto_submit(db, AttemptItem)
        Settled += 1 if AttemptItem.status != Before else 0
    return Settled


def BuildDpsChainIndex(
    db: Session,
    *,
    StudentIds: Iterable[str] | None = None,
    StudentsByLevel: dict[str, list[str]] | None = None,
    Benchmark: float = BENCHMARK_PERCENTAGE,
    Heal: bool = True,
) -> DpsChainIndex:
    """Index every active practice assignment for the given students (all
    students when StudentIds is None). StudentsByLevel expands LEVEL
    assignments the same way the trackers do."""
    StudentIdSet = set(StudentIds) if StudentIds is not None else None
    if Heal:
        HealExpiredPracticeAttempts(db, StudentIdSet)
    Query = db.query(Assignment).filter(Assignment.assignment_type != "ASSESSMENT", Assignment.is_active == True, Assignment.dps_id.isnot(None))
    if StudentIdSet is not None:
        if not StudentIdSet:
            return DpsChainIndex({}, {}, {})
        LevelIds = list((StudentsByLevel or {}).keys())
        from sqlalchemy import and_, or_

        Clauses = [and_(Assignment.assigned_to_type == "STUDENT", Assignment.assigned_to_id.in_(list(StudentIdSet)))]
        if LevelIds:
            Clauses.append(and_(Assignment.assigned_to_type == "LEVEL", Assignment.assigned_to_id.in_(LevelIds)))
        Query = Query.filter(or_(*Clauses))
    Assignments = Query.all()
    AssignmentIds = [Item.id for Item in Assignments]

    AttemptsByAssignment: dict[str, list[Attempt]] = {}
    if AssignmentIds:
        for Chunk in range(0, len(AssignmentIds), 900):
            for AttemptItem in db.query(Attempt).filter(Attempt.assignment_id.in_(AssignmentIds[Chunk:Chunk + 900])).all():
                AttemptsByAssignment.setdefault(AttemptItem.assignment_id, []).append(AttemptItem)

    Grouped: dict[tuple[str, str], list[Assignment]] = {}
    AssignmentConcept: dict[tuple[str, str], tuple[str, str]] = {}
    for AssignmentItem in Assignments:
        for StudentId in _StudentIdsFor(AssignmentItem, StudentsByLevel or {}, StudentIdSet):
            Key = (StudentId, AssignmentItem.dps_id)
            Grouped.setdefault(Key, []).append(AssignmentItem)
            AssignmentConcept[(AssignmentItem.id, StudentId)] = Key

    Concepts: dict[tuple[str, str], ConceptState] = {}
    for (StudentId, DpsId), Items in Grouped.items():
        # LEVEL assignments are shared; keep only this student's attempts.
        StudentAttempts = {Item.id: [Row for Row in AttemptsByAssignment.get(Item.id, []) if Row.student_id == StudentId] for Item in Items}
        Concepts[(StudentId, DpsId)] = BuildConceptState(StudentId, DpsId, Items, StudentAttempts, Benchmark)

    return DpsChainIndex(Concepts, AssignmentConcept, AttemptsByAssignment)
