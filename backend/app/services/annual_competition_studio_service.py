"""Annual Competition -- Admin Studio service (Package 3).

Everything an admin needs to stand up one CompetitionEvent end to end,
before any student ever sees it: create the event, define/edit its time
slots, generate or link each competition level's official paper (via the
dedicated Annual Competition question-generation engine -- see
annual_competition_paper_registry.py / annual_competition_paper_generation_
service.py -- not the practice Competition Mock engine), set that paper's
per-section timers, and run/review the Package 2 assignment engine. See
.mathpath/packages/pkg-03-admin-studio.md for the checklist this was built
against.

## Which level codes this studio ever generates a paper for

Eleven competition_level_code values are real targets a student can be
assigned to (per the Package 2 assignment engine): YLM-L1, PM-L1..PM-L4,
IM-L1..IM-L4, MM-L1, MM-L2. BM-L1 is deliberately NOT one of them -- a
Bridge Module student is always re-mapped to a PM-tier target by the
assignment engine (REQUIREMENTS.md Section 1); nobody ever competes "as
BM-L1" itself, so there is no official BM-L1 paper to generate here.
_ValidateCompetitionLevelCode() below rejects it explicitly rather than
silently accepting a code that can never be assigned to anyone.

MM-L2 is a real target (students who complete the MM module fully are
eligible for it) but still has no curriculum Level row of its own -- the
Master Module only ever seeds one Level, "MM-L1" (pkg-02-assignment-engine.md
finding #4, still open). GenerateAndLinkCompetitionEventLevelPaper below
resolves MM-L2's curriculum/Module linkage through the real MM-L1 Level row
while generating MM-L2's own gist-specified content, via
GenerateAnnualCompetitionLevelPaper's CompetitionLevelCode override -- see
that function's docstring. This is a wiring detail scoped entirely to paper
generation; it does not create an "MM-L2" curriculum Level anywhere.

## Default section timers -- derived from the Annual Competition paper
## registry (the client gist), not hand-transcribed

DEFAULT_SECTION_TIMERS_BY_LEVEL_CODE below is computed directly from
ANNUAL_COMPETITION_LEVEL_REGISTRY (annual_competition_paper_registry.py),
which is itself transcribed verbatim from the client gist
(MathPath_Competition_Section_Scoring_Developer_Gist.docx, v1.0, 8 Sep 2026)
-- confirmed authoritative over the older internal-dev-spec/doc2-derived
table this file used to hand-transcribe (Shailesh, 2026-09-10: "the gist is
correct"). Deriving this table from the registry, rather than retyping it a
second time, means the persisted CompetitionEventSectionTimer rows can never
silently drift from the sections the generator actually produces. Every
row's minutes sum to that level's documented gist total -- checked by
test_annual_competition_studio_service.py, not just eyeballed.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import (
    CompetitionEvent,
    CompetitionEventAssignment,
    CompetitionEventAttempt,
    CompetitionEventAttemptAnswer,
    CompetitionEventAttemptRetryGrant,
    CompetitionEventAttemptSectionState,
    CompetitionEventLevelPaper,
    CompetitionEventResult,
    CompetitionEventSectionTimer,
    CompetitionEventSlot,
    CompetitionMockExam,
    Level,
    Module,
    Student,
    User,
)
from app.services.annual_competition_paper_generation_service import GenerateAnnualCompetitionLevelPaper
from app.services.annual_competition_paper_registry import ANNUAL_COMPETITION_LEVEL_REGISTRY
# ComputeAssignmentsForRoster (annual_competition_assignment_service) is
# deliberately imported locally inside ListStudentsForPracticeBank below,
# not at module level -- that module imports _ResolveSlotIdForLevelCode
# from THIS module, so a top-level import here would be a circular import.

# Level codes a student can actually be assigned to (Package 2). BM-L1 is
# a current-position-only code and is never a valid target here.
VALID_COMPETITION_LEVEL_CODES = {
    "YLM-L1",
    "PM-L1", "PM-L2", "PM-L3", "PM-L4",
    "IM-L1", "IM-L2", "IM-L3", "IM-L4",
    "MM-L1", "MM-L2",
}

# MM-L2 has no curriculum Level row of its own -- generating its paper
# resolves Module/Level linkage through this real Level's row instead (see
# GenerateAnnualCompetitionLevelPaper's CompetitionLevelCode docstring).
_CURRICULUM_LOOKUP_LEVEL_CODE_OVERRIDES: dict[str, str] = {"MM-L2": "MM-L1"}

# competition_level_code -> [(section_number, section_title, mode, time_limit_seconds), ...]
# Derived from ANNUAL_COMPETITION_LEVEL_REGISTRY -- see module docstring.
DEFAULT_SECTION_TIMERS_BY_LEVEL_CODE: dict[str, list[tuple[int, str, str, int]]] = {
    LevelCode: [
        (
            int(Section["number"]),
            str(Section["title"]),
            str(Section.get("mode") or "MIXED"),
            int(Section["timeLimitSeconds"]),
        )
        for Section in LevelConfig["sections"]
    ]
    for LevelCode, LevelConfig in ANNUAL_COMPETITION_LEVEL_REGISTRY.items()
}


def _ValidateCompetitionLevelCode(CompetitionLevelCode: str) -> None:
    if CompetitionLevelCode not in VALID_COMPETITION_LEVEL_CODES:
        api_error(
            400,
            "INVALID_COMPETITION_LEVEL_CODE",
            f"'{CompetitionLevelCode}' is not a valid Annual Competition target level. "
            "BM-L1 is never a target -- Bridge students are always re-mapped to a PM-tier "
            "level by the assignment engine.",
            {"validCodes": sorted(VALID_COMPETITION_LEVEL_CODES)},
        )


def _GetEventOr404(db: Session, EventId: str) -> CompetitionEvent:
    EventRecord = db.get(CompetitionEvent, EventId)
    if not EventRecord:
        api_error(404, "COMPETITION_EVENT_NOT_FOUND", "The selected Annual Competition event was not found.")
    return EventRecord


def _EventPayload(EventRecord: CompetitionEvent) -> dict[str, Any]:
    return {
        "eventId": EventRecord.id,
        "name": EventRecord.name,
        "status": EventRecord.status,
        "competitionDate": EventRecord.competition_date.isoformat() if EventRecord.competition_date else None,
        "resultsReleaseAt": EventRecord.results_release_at.isoformat() if EventRecord.results_release_at else None,
        "isSuspended": EventRecord.attempts_suspended_at is not None,
        "attemptsSuspendedAt": EventRecord.attempts_suspended_at.isoformat() if EventRecord.attempts_suspended_at else None,
        "suspensionReason": EventRecord.suspension_reason,
        "createdByUserId": EventRecord.created_by_user_id,
        "createdAt": EventRecord.created_at.isoformat() if EventRecord.created_at else None,
        "updatedAt": EventRecord.updated_at.isoformat() if EventRecord.updated_at else None,
    }


def CreateCompetitionEvent(
    db: Session,
    *,
    Name: str,
    CompetitionDate: datetime,
    CreatedBy: User,
    ResultsReleaseAt: datetime | None = None,
) -> dict[str, Any]:
    CleanName = (Name or "").strip()
    if not CleanName:
        api_error(400, "EVENT_NAME_REQUIRED", "Event name is required.")
    EventRecord = CompetitionEvent(
        name=CleanName,
        status="DRAFT",
        competition_date=CompetitionDate,
        results_release_at=ResultsReleaseAt,
        created_by_user_id=CreatedBy.id if CreatedBy else None,
    )
    db.add(EventRecord)
    db.commit()
    db.refresh(EventRecord)
    return _EventPayload(EventRecord)


def UpdateCompetitionEvent(
    db: Session,
    *,
    EventId: str,
    Name: str | None = None,
    Status: str | None = None,
    CompetitionDate: datetime | None = None,
    ResultsReleaseAt: Any = "__UNSET__",
) -> dict[str, Any]:
    EventRecord = _GetEventOr404(db, EventId)
    if Name is not None:
        CleanName = Name.strip()
        if not CleanName:
            api_error(400, "EVENT_NAME_REQUIRED", "Event name cannot be blank.")
        EventRecord.name = CleanName
    if Status is not None:
        EventRecord.status = Status
    if CompetitionDate is not None:
        EventRecord.competition_date = CompetitionDate
    # results_release_at needs a real None vs. "leave unchanged" distinction
    # (setting it locks every linked level paper -- see
    # _IsLevelPaperLocked), so the sentinel default means "field not sent".
    if ResultsReleaseAt != "__UNSET__":
        EventRecord.results_release_at = ResultsReleaseAt
    db.commit()
    db.refresh(EventRecord)
    return _EventPayload(EventRecord)


def SuspendCompetitionEvent(db: Session, *, EventId: str, Reason: str, SuspendedBy: User) -> dict[str, Any]:
    """Package 10 (go-live rollback plan) emergency stop: an admin-only
    action that immediately blocks the ENTIRE student-facing attempt flow
    for this one event -- both starting a brand new attempt and resuming an
    existing in-progress one (StartCompetitionEventAttempt handles both
    through the same function, so one check there covers both) plus the
    pre-attempt instructions screen (GetCompetitionEventInstructions).

    Deliberately does NOT touch anything already in flight at the database
    level: a section a student is mid-way through keeps whatever state it
    already has (no attempt is force-submitted or corrupted by this call) --
    it simply can no longer be *resumed* once the student's own client next
    calls Start (e.g. on a page reload, which is exactly when a student
    experiencing "something's wrong" would naturally retry). This mirrors
    the pause mechanic's own philosophy elsewhere in this epic: react to
    what already happened, never retroactively rewrite it.

    A reason is required -- this is a rare, high-stakes action and the
    go-live runbook expects it to leave an audit trail, the same discipline
    GrantAnnualCompetitionAttemptRetry already enforces for its own reason
    field.
    """
    EventRecord = _GetEventOr404(db, EventId)
    CleanReason = (Reason or "").strip()
    if not CleanReason:
        api_error(400, "COMPETITION_SUSPEND_REASON_REQUIRED", "A reason is required to suspend a competition event.")

    EventRecord.attempts_suspended_at = datetime.now(timezone.utc)
    EventRecord.suspension_reason = CleanReason
    EventRecord.suspended_by_user_id = SuspendedBy.id if SuspendedBy else None
    db.commit()
    db.refresh(EventRecord)
    return _EventPayload(EventRecord)


def LiftCompetitionEventSuspension(db: Session, *, EventId: str) -> dict[str, Any]:
    """Reverses SuspendCompetitionEvent -- students can start/resume again
    immediately. Named "lift", not "resume", so it is never confused with
    resuming an individual student's attempt (StartCompetitionEventAttempt's
    own, unrelated, use of "resume")."""
    EventRecord = _GetEventOr404(db, EventId)
    EventRecord.attempts_suspended_at = None
    EventRecord.suspension_reason = None
    EventRecord.suspended_by_user_id = None
    db.commit()
    db.refresh(EventRecord)
    return _EventPayload(EventRecord)


def DeleteCompetitionEvent(db: Session, *, EventId: str) -> dict[str, Any]:
    """2026-09-08: the Studio's event list had a "ZZ-TEST-DELETE-ME"-named
    rehearsal event sitting in it with no way to actually delete it --
    Shailesh's own throwaway naming convention was the tell that this gap
    was real, not hypothetical. Hard delete, not the isActive-style soft
    delete UpdateCompetitionEventSlot uses for slots -- CompetitionEvent has
    no such flag (only the DRAFT/SCHEDULED/COMPLETED status column, which
    already carries its own separate meaning), and a genuinely throwaway
    test event should actually go away, not linger hidden.

    2026-09-10 (Shailesh): deletion is now allowed unconditionally, even
    once real attempts exist and even after results have been released
    (certificates possibly already issued) -- Shailesh explicitly asked for
    this as an admin escape hatch "just in case of any unavoidable
    circumstances," with no exceptions. This deliberately drops the
    original guard (see git history for the prior "reject once a real
    attempt exists or a locked results date is set" behaviour, which mirrored
    DeleteCompetitionMockExam's own guard) -- that guard was correct for the
    zero-real-attempts case it was designed for, but the admin needs the
    option to go further now. Nothing about DeleteCompetitionMockExam's own
    guard changes: this only affects deleting the CompetitionEvent itself.

    Deletes children explicitly, in dependency order, rather than relying on
    each table's own ondelete=CASCADE firing correctly -- SQLite (this
    suite's test DB) does not enforce foreign keys unless a connection
    explicitly turns PRAGMA foreign_keys on, so a correctness bug here could
    pass its own tests for the wrong reason if left to implicit DB cascade.
    Now that real attempts are no longer guaranteed absent, the full
    attempt-family tree has to be unwound explicitly too, in dependency
    order:
      1. CompetitionEventAttemptSectionState and CompetitionEventAttemptAnswer
         (both keyed off attempt_id) -- deleted first, before their parent
         attempts.
      2. CompetitionEventResult -- has its own direct event_id column, so it
         doesn't need an attempt_id lookup, but still has to go before the
         attempts it points at.
      3. CompetitionEventAttemptRetryGrant -- must be deleted before the
         attempts, because its used_attempt_id FK to
         competition_event_attempts.id has no ondelete=CASCADE of its own.
      4. CompetitionEventAttempt -- must be deleted before the level papers,
         because its level_paper_id FK to competition_event_level_papers.id
         also has no ondelete=CASCADE.
    Only then do the pre-existing steps (section timers, level papers,
    assignments, slots) run, same as before.
    """
    EventRecord = _GetEventOr404(db, EventId)

    AttemptIds = [Row.id for Row in db.query(CompetitionEventAttempt.id).filter(CompetitionEventAttempt.event_id == EventId).all()]
    if AttemptIds:
        db.query(CompetitionEventAttemptSectionState).filter(CompetitionEventAttemptSectionState.attempt_id.in_(AttemptIds)).delete(synchronize_session=False)
        db.query(CompetitionEventAttemptAnswer).filter(CompetitionEventAttemptAnswer.attempt_id.in_(AttemptIds)).delete(synchronize_session=False)
    db.query(CompetitionEventResult).filter(CompetitionEventResult.event_id == EventId).delete(synchronize_session=False)
    db.query(CompetitionEventAttemptRetryGrant).filter(CompetitionEventAttemptRetryGrant.event_id == EventId).delete(synchronize_session=False)
    db.query(CompetitionEventAttempt).filter(CompetitionEventAttempt.event_id == EventId).delete(synchronize_session=False)

    LevelPaperIds = [Row.id for Row in db.query(CompetitionEventLevelPaper.id).filter(CompetitionEventLevelPaper.event_id == EventId).all()]
    if LevelPaperIds:
        db.query(CompetitionEventSectionTimer).filter(CompetitionEventSectionTimer.level_paper_id.in_(LevelPaperIds)).delete(synchronize_session=False)
    db.query(CompetitionEventLevelPaper).filter(CompetitionEventLevelPaper.event_id == EventId).delete(synchronize_session=False)
    db.query(CompetitionEventAssignment).filter(CompetitionEventAssignment.event_id == EventId).delete(synchronize_session=False)
    db.query(CompetitionEventSlot).filter(CompetitionEventSlot.event_id == EventId).delete(synchronize_session=False)
    db.delete(EventRecord)
    db.commit()
    return {"eventId": EventId, "deleted": True}


def GetCompetitionEvent(db: Session, EventId: str) -> dict[str, Any]:
    return _EventPayload(_GetEventOr404(db, EventId))


def ListCompetitionEvents(db: Session) -> list[dict[str, Any]]:
    Events = db.query(CompetitionEvent).order_by(CompetitionEvent.competition_date.asc()).all()
    return [_EventPayload(EventRecord) for EventRecord in Events]


# ---------------------------------------------------------------------------
# Slots
# ---------------------------------------------------------------------------

def _SlotPayload(SlotRecord: CompetitionEventSlot) -> dict[str, Any]:
    import json

    try:
        LevelCodes = json.loads(SlotRecord.applicable_level_codes_json or "[]")
    except Exception:
        LevelCodes = []
    return {
        "slotId": SlotRecord.id,
        "eventId": SlotRecord.event_id,
        "mode": SlotRecord.mode,
        "slotLabel": SlotRecord.slot_label,
        "scheduledStartAt": SlotRecord.scheduled_start_at.isoformat() if SlotRecord.scheduled_start_at else None,
        "scheduledEndAt": SlotRecord.scheduled_end_at.isoformat() if SlotRecord.scheduled_end_at else None,
        "applicableLevelCodes": LevelCodes,
        "durationMinutes": (
            int((SlotRecord.scheduled_end_at - SlotRecord.scheduled_start_at).total_seconds() // 60)
            if SlotRecord.scheduled_start_at and SlotRecord.scheduled_end_at
            else None
        ),
        "isActive": SlotRecord.is_active,
    }


def CreateCompetitionEventSlot(
    db: Session,
    *,
    EventId: str,
    Mode: str,
    ScheduledStartAt: datetime,
    ScheduledEndAt: datetime,
    ApplicableLevelCodes: list[str],
    SlotLabel: str | None = None,
) -> dict[str, Any]:
    import json

    _GetEventOr404(db, EventId)
    if ScheduledEndAt <= ScheduledStartAt:
        api_error(400, "INVALID_SLOT_WINDOW", "Slot end time must be after its start time.")
    for LevelCode in ApplicableLevelCodes or []:
        _ValidateCompetitionLevelCode(LevelCode)
    SlotRecord = CompetitionEventSlot(
        event_id=EventId,
        mode=Mode,
        slot_label=SlotLabel,
        scheduled_start_at=ScheduledStartAt,
        scheduled_end_at=ScheduledEndAt,
        applicable_level_codes_json=json.dumps(list(ApplicableLevelCodes or [])),
        is_active=True,
    )
    db.add(SlotRecord)
    db.commit()
    db.refresh(SlotRecord)
    return _SlotPayload(SlotRecord)


def UpdateCompetitionEventSlot(
    db: Session,
    *,
    SlotId: str,
    Mode: str | None = None,
    SlotLabel: Any = "__UNSET__",
    ScheduledStartAt: datetime | None = None,
    ScheduledEndAt: datetime | None = None,
    ApplicableLevelCodes: list[str] | None = None,
    IsActive: bool | None = None,
) -> dict[str, Any]:
    import json

    SlotRecord = db.get(CompetitionEventSlot, SlotId)
    if not SlotRecord:
        api_error(404, "COMPETITION_SLOT_NOT_FOUND", "The selected slot was not found.")
    if Mode is not None:
        SlotRecord.mode = Mode
    if SlotLabel != "__UNSET__":
        SlotRecord.slot_label = SlotLabel
    NewStart = ScheduledStartAt or SlotRecord.scheduled_start_at
    NewEnd = ScheduledEndAt or SlotRecord.scheduled_end_at
    if NewEnd <= NewStart:
        api_error(400, "INVALID_SLOT_WINDOW", "Slot end time must be after its start time.")
    SlotRecord.scheduled_start_at = NewStart
    SlotRecord.scheduled_end_at = NewEnd
    if ApplicableLevelCodes is not None:
        for LevelCode in ApplicableLevelCodes:
            _ValidateCompetitionLevelCode(LevelCode)
        SlotRecord.applicable_level_codes_json = json.dumps(list(ApplicableLevelCodes))
    if IsActive is not None:
        SlotRecord.is_active = IsActive
    db.commit()
    db.refresh(SlotRecord)
    return _SlotPayload(SlotRecord)


def ListCompetitionEventSlots(db: Session, EventId: str) -> list[dict[str, Any]]:
    _GetEventOr404(db, EventId)
    Slots = (
        db.query(CompetitionEventSlot)
        .filter(CompetitionEventSlot.event_id == EventId, CompetitionEventSlot.is_active == True)
        .order_by(CompetitionEventSlot.scheduled_start_at.asc())
        .all()
    )
    return [_SlotPayload(SlotRecord) for SlotRecord in Slots]


def _ResolveSlotIdForLevelCode(db: Session, EventId: str, AssignedLevelCode: str) -> str | None:
    """2026-09-08: found live, not hypothetically -- neither
    OverrideCompetitionEventAssignment nor RunAnnualCompetitionAssignmentEngine
    ever wrote CompetitionEventAssignment.slot_id, anywhere, for any student.
    _CheckSlotGate (annual_competition_attempt_service.py) only fires when
    slot_id is set, so the entire slot-gated-start feature was silently dead
    for every real assignment -- a student's card always read "No specific
    slot assigned yet -- you can start once the paper is ready" regardless
    of a matching slot existing, exactly what Shailesh saw testing IM-L4 on
    "Test-1" the same day a slot for it was created.

    Fix: auto-match by level code at write time, the same way a human would
    read this data -- an active slot whose applicable_level_codes_json
    contains this level. If exactly one active slot claims this level,
    link to it. If zero claim it, leave slot_id unset (the existing, correct
    "no slot configured yet, start anytime" fallback -- not every event needs
    slots). If more than one claims it, that is a genuine admin
    misconfiguration (the same level assigned to two overlapping slots) --
    refuse to guess which one and leave slot_id unset rather than silently
    picking one, consistent with this project's "no silent guessing"
    convention; ListCompetitionEventSlots already surfaces every slot for an
    admin to fix the overlap by hand.
    """
    import json

    Slots = (
        db.query(CompetitionEventSlot)
        .filter(CompetitionEventSlot.event_id == EventId, CompetitionEventSlot.is_active == True)
        .all()
    )
    MatchingSlotIds = []
    for SlotRecord in Slots:
        try:
            LevelCodes = json.loads(SlotRecord.applicable_level_codes_json or "[]")
        except Exception:
            LevelCodes = []
        if AssignedLevelCode in LevelCodes:
            MatchingSlotIds.append(SlotRecord.id)
    if len(MatchingSlotIds) == 1:
        return MatchingSlotIds[0]
    return None


def SlotsWithInsufficientDuration(db: Session, EventId: str) -> list[dict[str, Any]]:
    """Surfaces REQUIREMENTS.md item 7 (and any future equivalent) as a
    computed check, not a one-time note: any active slot whose window is
    shorter than the longest section-timer total among the levels it
    claims to serve. Purely a read -- flags it, never auto-resolves it,
    since the fix is a real scheduling decision for MathPath to make.
    """
    Slots = ListCompetitionEventSlots(db, EventId)
    LevelPapers = {
        LevelPaper["competitionLevelCode"]: LevelPaper for LevelPaper in ListCompetitionEventLevelPapers(db, EventId)
    }
    Flagged: list[dict[str, Any]] = []
    for Slot in Slots:
        if Slot["durationMinutes"] is None:
            continue
        SlotSeconds = Slot["durationMinutes"] * 60
        for LevelCode in Slot["applicableLevelCodes"]:
            DefaultTimers = DEFAULT_SECTION_TIMERS_BY_LEVEL_CODE.get(LevelCode, [])
            RequiredSeconds = sum(TimeLimitSeconds for _n, _t, _m, TimeLimitSeconds in DefaultTimers)
            LevelPaper = LevelPapers.get(LevelCode)
            if LevelPaper and LevelPaper.get("totalSectionSeconds") is not None:
                RequiredSeconds = LevelPaper["totalSectionSeconds"]
            if RequiredSeconds and RequiredSeconds > SlotSeconds:
                Flagged.append(
                    {
                        "slotId": Slot["slotId"],
                        "slotLabel": Slot["slotLabel"],
                        "levelCode": LevelCode,
                        "slotDurationSeconds": SlotSeconds,
                        "requiredSeconds": RequiredSeconds,
                        "shortBySeconds": RequiredSeconds - SlotSeconds,
                    }
                )
    return Flagged


# ---------------------------------------------------------------------------
# Level papers + section timers
# ---------------------------------------------------------------------------

def _IsLevelPaperLocked(db: Session, LevelPaperRecord: CompetitionEventLevelPaper) -> bool:
    """Mirrors DeleteCompetitionMockExam's guard condition exactly
    (competition_mock_generation_service.py) -- the two must never diverge,
    since that guard is what actually enforces this at the delete/regenerate
    layer. This is the read-side view of the same fact."""
    if not LevelPaperRecord.mock_exam_id:
        return False
    HasAttempts = (
        db.query(CompetitionEventAttempt)
        .filter(CompetitionEventAttempt.level_paper_id == LevelPaperRecord.id)
        .first()
        is not None
    )
    # 2026-09-12 (Shailesh, decoupling): a PRACTICE paper's event_id is now
    # always None -- db.get() with a None pk both warns and is meaningless,
    # so skip the lookup entirely rather than pass None through.
    EventRecord = db.get(CompetitionEvent, LevelPaperRecord.event_id) if LevelPaperRecord.event_id else None
    HasReleaseLockedEvent = bool(EventRecord and EventRecord.results_release_at is not None)
    return HasAttempts or HasReleaseLockedEvent


def _RecomputeLevelPaperStatus(db: Session, LevelPaperRecord: CompetitionEventLevelPaper) -> None:
    if _IsLevelPaperLocked(db, LevelPaperRecord):
        if LevelPaperRecord.status != "LOCKED":
            LevelPaperRecord.status = "LOCKED"
            LevelPaperRecord.locked_at = LevelPaperRecord.locked_at or datetime.now(timezone.utc)
        return
    if not LevelPaperRecord.mock_exam_id:
        LevelPaperRecord.status = "PENDING"
        return
    HasTimers = (
        db.query(CompetitionEventSectionTimer)
        .filter(CompetitionEventSectionTimer.level_paper_id == LevelPaperRecord.id)
        .first()
        is not None
    )
    LevelPaperRecord.status = "READY" if HasTimers else "PENDING"


def _LevelPaperPayload(db: Session, LevelPaperRecord: CompetitionEventLevelPaper) -> dict[str, Any]:
    Timers = (
        db.query(CompetitionEventSectionTimer)
        .filter(CompetitionEventSectionTimer.level_paper_id == LevelPaperRecord.id)
        .order_by(CompetitionEventSectionTimer.display_order.asc(), CompetitionEventSectionTimer.section_number.asc())
        .all()
    )
    TimerPayloads = [
        {
            "sectionTimerId": Timer.id,
            "sectionNumber": Timer.section_number,
            "sectionTitle": Timer.section_title,
            "mode": Timer.mode,
            "timeLimitSeconds": Timer.time_limit_seconds,
        }
        for Timer in Timers
    ]
    MockExam = db.get(CompetitionMockExam, LevelPaperRecord.mock_exam_id) if LevelPaperRecord.mock_exam_id else None
    return {
        "levelPaperId": LevelPaperRecord.id,
        "eventId": LevelPaperRecord.event_id,
        "competitionLevelCode": LevelPaperRecord.competition_level_code,
        "mockExamId": LevelPaperRecord.mock_exam_id,
        "mockExamTitle": MockExam.title if MockExam else None,
        "status": LevelPaperRecord.status,
        "lockedAt": LevelPaperRecord.locked_at.isoformat() if LevelPaperRecord.locked_at else None,
        "sectionTimers": TimerPayloads,
        "totalSectionSeconds": sum(Timer.time_limit_seconds for Timer in Timers) if Timers else None,
    }


def _GetOrCreateLevelPaper(db: Session, EventId: str, CompetitionLevelCode: str) -> CompetitionEventLevelPaper:
    """2026-09-11 (Shailesh, Competition Practice feature): this function is
    only ever called by the two OFFICIAL generate/link entry points below
    (GenerateAndLinkCompetitionEventLevelPaper, LinkExistingCompetitionEventLevelPaper)
    -- it has never been, and still isn't, used for practice-bank papers
    (those are created directly, one row per bank paper, by the batch-assign
    service). The DB-level UniqueConstraint("event_id", "competition_level_code")
    that used to guarantee "one paper per event+level" has been dropped from
    the model (a practice bank needs many PRACTICE-kind rows per event+level),
    so this explicit paper_kind == "OFFICIAL" filter is now what preserves
    that exact one-paper-per-level guarantee for official papers -- it must
    stay in lockstep with the two callers below only ever being used for
    OFFICIAL papers.
    """
    _ValidateCompetitionLevelCode(CompetitionLevelCode)
    LevelPaperRecord = (
        db.query(CompetitionEventLevelPaper)
        .filter(
            CompetitionEventLevelPaper.event_id == EventId,
            CompetitionEventLevelPaper.competition_level_code == CompetitionLevelCode,
            CompetitionEventLevelPaper.paper_kind == "OFFICIAL",
        )
        .first()
    )
    if not LevelPaperRecord:
        LevelPaperRecord = CompetitionEventLevelPaper(
            event_id=EventId,
            competition_level_code=CompetitionLevelCode,
            status="PENDING",
            paper_kind="OFFICIAL",
        )
        db.add(LevelPaperRecord)
        db.flush()
    return LevelPaperRecord


def _SeedDefaultSectionTimers(db: Session, LevelPaperRecord: CompetitionEventLevelPaper) -> None:
    """Replaces this level paper's section timers with REQUIREMENTS.md's
    documented defaults. Only ever called right after a paper is freshly
    generated/linked (never on an already-READY/LOCKED paper), so there is
    nothing real to clobber."""
    db.query(CompetitionEventSectionTimer).filter(
        CompetitionEventSectionTimer.level_paper_id == LevelPaperRecord.id
    ).delete()
    Defaults = DEFAULT_SECTION_TIMERS_BY_LEVEL_CODE.get(LevelPaperRecord.competition_level_code, [])
    for SectionNumber, SectionTitle, Mode, TimeLimitSeconds in Defaults:
        db.add(
            CompetitionEventSectionTimer(
                level_paper_id=LevelPaperRecord.id,
                section_number=SectionNumber,
                section_title=SectionTitle,
                mode=Mode,
                time_limit_seconds=TimeLimitSeconds,
                display_order=SectionNumber,
            )
        )


def GenerateAndLinkCompetitionEventLevelPaper(
    db: Session,
    *,
    EventId: str,
    CompetitionLevelCode: str,
    CreatedBy: User,
) -> dict[str, Any]:
    _GetEventOr404(db, EventId)
    LevelPaperRecord = _GetOrCreateLevelPaper(db, EventId, CompetitionLevelCode)
    # Live check, not the stored column -- a paper can become locked (a real
    # attempt lands, or the event's results_release_at gets set) without any
    # explicit "recompute" call happening in between, so the stored status
    # can be stale. _IsLevelPaperLocked is the same guard condition
    # DeleteCompetitionMockExam enforces.
    if _IsLevelPaperLocked(db, LevelPaperRecord):
        api_error(409, "COMPETITION_LEVEL_PAPER_LOCKED", "This level's official paper is locked and cannot be regenerated.")

    CurriculumLookupLevelCode = _CURRICULUM_LOOKUP_LEVEL_CODE_OVERRIDES.get(CompetitionLevelCode, CompetitionLevelCode)
    LevelRecord = (
        db.query(Level).filter(Level.level_code == CurriculumLookupLevelCode, Level.is_active == True).first()
    )
    if not LevelRecord:
        api_error(
            409,
            "NO_CURRICULUM_LEVEL_FOR_CODE",
            f"'{CompetitionLevelCode}' has no matching curriculum Level yet, so no paper can be generated for it. "
            "This is a known, tracked gap (see pkg-02-assignment-engine.md finding #4 for MM-L2) -- link an "
            "existing mock exam instead, or add the curriculum/registry content first.",
        )

    # Bug fix (Shailesh, 2026-09-14): MockCode used to be a fixed, purely
    # deterministic string (ANNUAL-{eventId}-{levelCode}), with zero
    # per-call uniqueness. CompetitionMockExam has a UNIQUE(level_id,
    # mock_code) constraint, so the first generate for a level always
    # succeeded but clicking "Regenerate Official Paper" a second time on
    # that same level -- exactly the "delete the old papers and regenerate"
    # workflow this feature exists for -- always raised an uncaught
    # IntegrityError, surfaced to the admin as a generic "Something went
    # wrong. Please try again." (main.py's global_exception_handler catches
    # it since it's a raw SQLAlchemy error, not an api_error HTTPException).
    # Reproduced directly against this exact code path before this fix.
    # GenerateAnnualCompetitionLevelPaper's own MockCode-omitted fallback
    # already builds a timestamp+uuid-suffixed code for exactly this
    # reason -- this caller was overriding that safety net with a
    # non-unique value. Keeping the event/level prefix (for admin
    # traceability in the DB) but appending the same kind of unique suffix
    # fixes regeneration without losing that context.
    ExamPayload = GenerateAnnualCompetitionLevelPaper(
        db,
        LevelId=LevelRecord.id,
        CreatedBy=CreatedBy,
        Title=f"Annual Competition -- {CompetitionLevelCode} Official Paper",
        MockCode=f"ANNUAL-{EventId[:8]}-{CompetitionLevelCode}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid4().hex[:6].upper()}",
        CompetitionScope="ANNUAL_COMPETITION",
        CompetitionLevelCode=CompetitionLevelCode,
    )
    LevelPaperRecord.mock_exam_id = ExamPayload["mockExamId"]
    db.flush()
    _SeedDefaultSectionTimers(db, LevelPaperRecord)
    db.flush()  # section timer rows must be visible to _RecomputeLevelPaperStatus's query
    _RecomputeLevelPaperStatus(db, LevelPaperRecord)
    db.commit()
    db.refresh(LevelPaperRecord)
    return _LevelPaperPayload(db, LevelPaperRecord)


def LinkExistingCompetitionEventLevelPaper(
    db: Session,
    *,
    EventId: str,
    CompetitionLevelCode: str,
    MockExamId: str,
) -> dict[str, Any]:
    _GetEventOr404(db, EventId)
    LevelPaperRecord = _GetOrCreateLevelPaper(db, EventId, CompetitionLevelCode)
    if _IsLevelPaperLocked(db, LevelPaperRecord):  # live check -- see comment in GenerateAndLink above
        api_error(409, "COMPETITION_LEVEL_PAPER_LOCKED", "This level's official paper is locked and cannot be relinked.")

    ExamRecord = db.get(CompetitionMockExam, MockExamId)
    if not ExamRecord or not ExamRecord.is_active:
        api_error(404, "COMPETITION_MOCK_NOT_FOUND", "The selected mock exam was not found.")
    ExamLevel = db.get(Level, ExamRecord.level_id)
    if not ExamLevel or ExamLevel.level_code != CompetitionLevelCode:
        api_error(
            400,
            "MOCK_LEVEL_MISMATCH",
            f"That mock exam belongs to level '{ExamLevel.level_code if ExamLevel else '?'}', not '{CompetitionLevelCode}'.",
        )

    LevelPaperRecord.mock_exam_id = MockExamId
    db.flush()
    _SeedDefaultSectionTimers(db, LevelPaperRecord)
    db.flush()  # section timer rows must be visible to _RecomputeLevelPaperStatus's query
    _RecomputeLevelPaperStatus(db, LevelPaperRecord)
    db.commit()
    db.refresh(LevelPaperRecord)
    return _LevelPaperPayload(db, LevelPaperRecord)


def UpdateCompetitionEventSectionTimer(
    db: Session,
    *,
    SectionTimerId: str,
    SectionTitle: str | None = None,
    Mode: str | None = None,
    TimeLimitSeconds: int | None = None,
) -> dict[str, Any]:
    TimerRecord = db.get(CompetitionEventSectionTimer, SectionTimerId)
    if not TimerRecord:
        api_error(404, "SECTION_TIMER_NOT_FOUND", "The selected section timer was not found.")
    LevelPaperRecord = db.get(CompetitionEventLevelPaper, TimerRecord.level_paper_id)
    if LevelPaperRecord and LevelPaperRecord.status == "LOCKED":
        api_error(409, "COMPETITION_LEVEL_PAPER_LOCKED", "This level's official paper is locked; its section timers can no longer be edited.")
    if SectionTitle is not None:
        TimerRecord.section_title = SectionTitle
    if Mode is not None:
        TimerRecord.mode = Mode
    if TimeLimitSeconds is not None:
        if TimeLimitSeconds <= 0:
            api_error(400, "INVALID_TIME_LIMIT", "Section time limit must be a positive number of seconds.")
        TimerRecord.time_limit_seconds = TimeLimitSeconds
    db.commit()
    db.refresh(TimerRecord)
    return {
        "sectionTimerId": TimerRecord.id,
        "sectionNumber": TimerRecord.section_number,
        "sectionTitle": TimerRecord.section_title,
        "mode": TimerRecord.mode,
        "timeLimitSeconds": TimerRecord.time_limit_seconds,
    }


def ListCompetitionEventLevelPapers(db: Session, EventId: str) -> list[dict[str, Any]]:
    """2026-09-11 (Shailesh, Competition Practice feature, Phase C): scoped
    to paper_kind == "OFFICIAL" -- this is the admin Studio's PAPERS tab,
    built on a "one row per level" assumption (GetCompetitionEventStudioOverview
    derives missingLevelPapers from it the same way). Once practice papers
    exist, a student's bank can hold many PRACTICE-kind rows per event+level
    (see BatchAssignAnnualCompetitionPracticePapers below); without this
    filter every one of them would flood this list and break that
    assumption. Practice bank papers have their own listing,
    GetAnnualCompetitionPracticeBankForStudent.
    """
    _GetEventOr404(db, EventId)
    LevelPapers = (
        db.query(CompetitionEventLevelPaper)
        .filter(CompetitionEventLevelPaper.event_id == EventId, CompetitionEventLevelPaper.paper_kind == "OFFICIAL")
        .order_by(CompetitionEventLevelPaper.competition_level_code.asc())
        .all()
    )
    Results = []
    for LevelPaperRecord in LevelPapers:
        _RecomputeLevelPaperStatus(db, LevelPaperRecord)
        Results.append(_LevelPaperPayload(db, LevelPaperRecord))
    db.commit()
    return Results


# ---------------------------------------------------------------------------
# Manual assignment override (Package 2 computes AUTO rows; this is the
# human override path referenced in that service's own docstring/tests).
# ---------------------------------------------------------------------------

def _ResolveStudentByIdOrCode(db: Session, StudentIdentifier: str) -> Student:
    """Accepts either a student's internal id or their human-facing
    student_code (e.g. "MP-ST-005") -- an admin doing this override by hand
    only ever has the code on hand, never the raw id, and there is nowhere
    else in the product that surfaces the raw id to look up. Mirrors the
    same code-or-identifier flexibility auth_service.login() already gives
    students/teachers at sign-in, rather than inventing a new lookup shape.
    Case-insensitive on the code, exact match only (not ilike -- same
    reasoning as login(): a raw student_code containing "%"/"_" must never
    be treated as a SQL wildcard)."""
    Cleaned = (StudentIdentifier or "").strip()
    if not Cleaned:
        api_error(400, "VALIDATION_ERROR", "Student ID or student code is required.")

    StudentRecord = db.get(Student, Cleaned)
    if not StudentRecord:
        StudentRecord = db.query(Student).filter(func.lower(Student.student_code) == Cleaned.lower()).first()
    if not StudentRecord:
        api_error(
            404,
            "COMPETITION_STUDENT_NOT_FOUND",
            f"No student found matching '{StudentIdentifier}' (checked both as an internal ID and as a student code).",
        )
    return StudentRecord


def OverrideCompetitionEventAssignment(
    db: Session,
    *,
    EventId: str,
    StudentId: str,
    AssignedLevelCode: str,
    OverriddenBy: User,
    SlotId: str | None = None,
) -> dict[str, Any]:
    _GetEventOr404(db, EventId)
    _ValidateCompetitionLevelCode(AssignedLevelCode)
    StudentRecord = _ResolveStudentByIdOrCode(db, StudentId)
    if SlotId is not None:
        SlotRecord = db.get(CompetitionEventSlot, SlotId)
        if not SlotRecord or SlotRecord.event_id != EventId:
            api_error(404, "COMPETITION_SLOT_NOT_FOUND", "The selected slot was not found for this event.")
    else:
        # No caller passes an explicit SlotId today (the admin override form
        # has no slot picker) -- auto-match by level code so this path isn't
        # silently dead. See _ResolveSlotIdForLevelCode's own docstring.
        SlotId = _ResolveSlotIdForLevelCode(db, EventId, AssignedLevelCode)

    AssignmentRecord = (
        db.query(CompetitionEventAssignment)
        .filter(CompetitionEventAssignment.event_id == EventId, CompetitionEventAssignment.student_id == StudentRecord.id)
        .first()
    )
    if AssignmentRecord:
        AssignmentRecord.assigned_level_code = AssignedLevelCode
        AssignmentRecord.slot_id = SlotId
        AssignmentRecord.assignment_source = "ADMIN_OVERRIDE"
        AssignmentRecord.overridden_by_user_id = OverriddenBy.id if OverriddenBy else None
        AssignmentRecord.computed_at = datetime.now(timezone.utc)
        AssignmentRecord.is_active = True
    else:
        AssignmentRecord = CompetitionEventAssignment(
            event_id=EventId,
            student_id=StudentRecord.id,
            assigned_level_code=AssignedLevelCode,
            slot_id=SlotId,
            assignment_source="ADMIN_OVERRIDE",
            overridden_by_user_id=OverriddenBy.id if OverriddenBy else None,
            is_active=True,
        )
        db.add(AssignmentRecord)
    db.commit()
    db.refresh(AssignmentRecord)
    return {
        "assignmentId": AssignmentRecord.id,
        "eventId": AssignmentRecord.event_id,
        "studentId": AssignmentRecord.student_id,
        "assignedLevelCode": AssignmentRecord.assigned_level_code,
        "slotId": AssignmentRecord.slot_id,
        "assignmentSource": AssignmentRecord.assignment_source,
        "overriddenByUserId": AssignmentRecord.overridden_by_user_id,
    }


# ---------------------------------------------------------------------------
# Practice bank (Competition Practice feature, Phase C)
#
# An admin batch-generates N freshly-generated, always-different practice
# papers into one student's bank at once (in multiples of 5 -- Shailesh's
# own words: "assigning multiple papers in multiples of 5 like 5, 10 or 15
# papers at once ... so that we do not have to assign it every day and the
# student has a bank of papers which they can go on practicing"), rather
# than a student self-serve-generating on demand. Each bank paper is its
# own CompetitionEventLevelPaper row (paper_kind == "PRACTICE",
# assigned_student_id set, never shared across students -- unlike the one
# OFFICIAL row shared by everyone on a level) pointing at its own freshly
# generated CompetitionMockExam, produced by the exact same paper-generation
# engine and reused GenerateAndLinkCompetitionEventLevelPaper flow uses for
# the OFFICIAL paper -- confirmed genuinely non-deterministic per call (a
# fresh PaperSeed = uuid4().hex every time, see
# annual_competition_paper_generation_service.py), so no two bank papers,
# and no bank paper and the official paper, are ever the same content.
# consumed_at stays NULL here -- it is set by the practice attempt-submit
# flow (a later phase), the moment a student finishes one of these papers,
# which is also this feature's permanent "no retakes" marker: a consumed
# paper is never re-offered.
# ---------------------------------------------------------------------------

# Deliberately conservative: this action generates each paper synchronously,
# in the same request/transaction, because this repo has no background job/
# queue infrastructure at all (confirmed during the original Package 4
# design -- "no scheduler/cron exists anywhere in this backend"). Empirically
# the heaviest level (MM-L2, 450 questions) takes well under a second per
# paper to generate, so 25 papers stays comfortably inside a normal HTTP
# request/proxy timeout; an admin who wants more than 25 at once simply
# calls this action again to top up the bank further.
PRACTICE_BATCH_MIN_QUANTITY = 5
PRACTICE_BATCH_MAX_QUANTITY = 25

# 2026-09-12 (Shailesh, Competition Practice feature -- bulk assignment):
# "assigning to all, numerous or selected students together relevant to
# their respective levels" -- a caller can now pass many StudentIds in one
# call instead of one HTTP round trip per student. Capped independently of
# PRACTICE_BATCH_MAX_QUANTITY (papers per student) because the two multiply:
# this function still generates every paper synchronously, in-request, with
# no background job/queue infrastructure in this backend (same constraint
# PRACTICE_BATCH_MAX_QUANTITY's own docstring already explains). 25 students
# x 25 papers = 625 synchronous generations is already a lot for one HTTP
# request/proxy timeout; the frontend chunks a larger selection ("assign to
# all 200 students") into multiple sequential calls of this size rather than
# ever sending all 200 at once.
PRACTICE_BULK_MAX_STUDENTS_PER_CALL = 25


def _ValidatePracticeBatchQuantity(Quantity: int) -> None:
    if not isinstance(Quantity, int) or isinstance(Quantity, bool) or Quantity < PRACTICE_BATCH_MIN_QUANTITY or Quantity % 5 != 0:
        api_error(
            400,
            "INVALID_PRACTICE_BATCH_QUANTITY",
            f"Quantity must be a whole multiple of 5, at least {PRACTICE_BATCH_MIN_QUANTITY} (e.g. 5, 10, 15).",
        )
    if Quantity > PRACTICE_BATCH_MAX_QUANTITY:
        api_error(
            400,
            "INVALID_PRACTICE_BATCH_QUANTITY",
            f"Quantity cannot exceed {PRACTICE_BATCH_MAX_QUANTITY} papers in one batch -- call this action again to "
            "top up the bank further.",
        )


def _GeneratePracticePapersForOneStudent(
    db: Session, *, LevelRecord: Level, CompetitionLevelCode: str, StudentRecord: Student, Quantity: int, AssignedBy: User, NowUtc: datetime
) -> list[CompetitionEventLevelPaper]:
    CreatedPapers: list[CompetitionEventLevelPaper] = []
    for _Index in range(Quantity):
        ExamPayload = GenerateAnnualCompetitionLevelPaper(
            db,
            LevelId=LevelRecord.id,
            CreatedBy=AssignedBy,
            Title=f"Annual Competition Practice -- {CompetitionLevelCode} for {StudentRecord.student_code}",
            MockCode=f"ANNUAL-PRACTICE-{CompetitionLevelCode}-{uuid4().hex[:10].upper()}",
            CompetitionScope="ANNUAL_COMPETITION_PRACTICE",
            CompetitionLevelCode=CompetitionLevelCode,
        )
        # 2026-09-12 (Shailesh, full event decoupling): event_id is
        # deliberately left unset -- practice papers no longer belong to any
        # CompetitionEvent at all ("the practice papers should not be
        # related to any event whatsoever, its only for practice leading to
        # the main event"). See CompetitionEventLevelPaper.event_id's own
        # model comment for why the column is nullable now.
        #
        # 2026-09-14 (Shailesh, paper-naming stability fix): every paper
        # created within ONE batch call used to share the exact same NowUtc
        # value verbatim, which made assigned_at ties across a batch
        # possible/likely -- fine for the bank's own "oldest first" FIFO
        # consumption order (a stable DB row order still applies even on a
        # tie), but not stable enough to be a numbering key, which is what
        # "Practice Paper N" needs (see ComputePracticePaperOrdinals below --
        # ties would make the assigned displayed number able to differ
        # between two reads of the same data). Staggering by microseconds
        # within the batch loop makes assigned_at itself a fully unique,
        # deterministic, always-increasing sort key with no schema change
        # and no behavior change to FIFO consumption (which already reads as
        # "oldest assigned_at first").
        PracticePaperRecord = CompetitionEventLevelPaper(
            competition_level_code=CompetitionLevelCode,
            mock_exam_id=ExamPayload["mockExamId"],
            paper_kind="PRACTICE",
            assigned_student_id=StudentRecord.id,
            assigned_by_user_id=AssignedBy.id if AssignedBy else None,
            assigned_at=NowUtc + timedelta(microseconds=_Index),
        )
        db.add(PracticePaperRecord)
        db.flush()
        _SeedDefaultSectionTimers(db, PracticePaperRecord)
        db.flush()  # section timer rows must be visible to _RecomputeLevelPaperStatus's query
        _RecomputeLevelPaperStatus(db, PracticePaperRecord)
        CreatedPapers.append(PracticePaperRecord)
    return CreatedPapers


def ComputePracticePaperOrdinals(db: Session, Scopes: set[tuple[str, str]]) -> dict[str, int]:
    """Shared, single source of truth for the "Practice Paper N" label
    (Shailesh, 2026-09-14): "the consistency in naming must be followed and
    it should not appear absurdly and without context" -- if a student gets
    assigned 10 papers in one batch, then 15 more in a later batch, the
    second batch must continue 11, 12, ... not restart at 1. That requires
    numbering every paper by its position across ALL practice papers ever
    assigned to that (student, competitionLevelCode) pair, ordered by
    assigned_at ascending (now a fully stable, unique key -- see the
    microsecond-stagger fix in _GeneratePracticePapersForOneStudent above),
    never by anything scoped to one call/page/batch.

    Scopes is a set of (assigned_student_id, competition_level_code) pairs
    to compute ordinals for. Returns {level_paper_id: ordinal} (1-based)
    covering every PRACTICE paper in each requested scope. Every surface
    that shows a practice paper/attempt/result to a student, teacher, or
    admin calls this same function (GetAnnualCompetitionPracticeBankForStudent
    below, ListMyAnnualCompetitionPracticeAttempts, ListAnnualCompetitionPracticeResultsForAdmin,
    ListAnnualCompetitionPracticeResultsForRoster) so the numbering can never
    drift between them -- there is deliberately no per-caller numbering
    logic anywhere else.
    """
    if not Scopes:
        return {}
    StudentIds = {StudentId for StudentId, _ in Scopes}
    LevelCodes = {LevelCode for _, LevelCode in Scopes}
    Rows = (
        db.query(CompetitionEventLevelPaper)
        .filter(
            CompetitionEventLevelPaper.paper_kind == "PRACTICE",
            CompetitionEventLevelPaper.assigned_student_id.in_(StudentIds),
            CompetitionEventLevelPaper.competition_level_code.in_(LevelCodes),
        )
        .order_by(CompetitionEventLevelPaper.assigned_at.asc(), CompetitionEventLevelPaper.id.asc())
        .all()
    )
    # The two .in_() filters above are an (any student in Scopes) x (any
    # level in Scopes) superset -- e.g. asking for (StudentA, YLM-L1) can
    # also pull back (StudentB, YLM-L1) rows. Re-checking exact scope
    # membership here is what narrows it back down to precisely what was
    # asked for.
    Counters: dict[tuple[str, str], int] = {}
    Ordinals: dict[str, int] = {}
    for PaperRecord in Rows:
        Scope = (PaperRecord.assigned_student_id, PaperRecord.competition_level_code)
        if Scope not in Scopes:
            continue
        Counters[Scope] = Counters.get(Scope, 0) + 1
        Ordinals[PaperRecord.id] = Counters[Scope]
    return Ordinals


def BatchAssignAnnualCompetitionPracticePapers(
    db: Session, *, CompetitionLevelCode: str, StudentIds: list[str], Quantity: int, AssignedBy: User
) -> dict[str, Any]:
    """Admin action: generates Quantity fresh practice papers and adds them
    to EVERY listed student's bank for this level -- one, several, or up to
    PRACTICE_BULK_MAX_STUDENTS_PER_CALL students at once. Safe to call
    repeatedly for the same student/level -- each call only ever ADDS new,
    additional bank papers; it never touches, consumes, or removes any
    paper already in the bank (existing rows are never queried here at
    all). Fully independent of any CompetitionEvent (2026-09-12 decoupling)
    -- practice papers are keyed on student + level only.

    Each student is processed independently and committed on its own: one
    bad student id (e.g. already deleted) does not lose papers already
    generated for students processed earlier in the same call. The
    response reports both the students that succeeded and any that failed,
    so a partial failure is never silently swallowed.
    """
    _ValidateCompetitionLevelCode(CompetitionLevelCode)
    _ValidatePracticeBatchQuantity(Quantity)

    CleanedStudentIds = [Id for Id in dict.fromkeys([str(Item or "").strip() for Item in (StudentIds or [])]) if Id]
    if not CleanedStudentIds:
        api_error(400, "VALIDATION_ERROR", "At least one student is required.")
    if len(CleanedStudentIds) > PRACTICE_BULK_MAX_STUDENTS_PER_CALL:
        api_error(
            400,
            "PRACTICE_BULK_TOO_MANY_STUDENTS",
            f"This action assigns to at most {PRACTICE_BULK_MAX_STUDENTS_PER_CALL} students per call -- "
            "call it again for the remaining students.",
            {"maxStudentsPerCall": PRACTICE_BULK_MAX_STUDENTS_PER_CALL},
        )

    # Same curriculum-lookup override and "no curriculum Level yet" guard
    # GenerateAndLinkCompetitionEventLevelPaper already applies for the
    # OFFICIAL paper (e.g. MM-L2 has no Level row of its own) -- a practice
    # paper for that level needs the identical Module/Level linkage for its
    # own CompetitionMockExam rows.
    CurriculumLookupLevelCode = _CURRICULUM_LOOKUP_LEVEL_CODE_OVERRIDES.get(CompetitionLevelCode, CompetitionLevelCode)
    LevelRecord = (
        db.query(Level).filter(Level.level_code == CurriculumLookupLevelCode, Level.is_active == True).first()  # noqa: E712
    )
    if not LevelRecord:
        api_error(
            409,
            "NO_CURRICULUM_LEVEL_FOR_CODE",
            f"'{CompetitionLevelCode}' has no matching curriculum Level yet, so no practice paper can be generated for it.",
        )

    NowUtc = datetime.now(timezone.utc)
    Succeeded: list[dict[str, Any]] = []
    Failed: list[dict[str, Any]] = []
    for StudentIdentifier in CleanedStudentIds:
        try:
            StudentRecord = _ResolveStudentByIdOrCode(db, StudentIdentifier)
            CreatedPapers = _GeneratePracticePapersForOneStudent(
                db,
                LevelRecord=LevelRecord,
                CompetitionLevelCode=CompetitionLevelCode,
                StudentRecord=StudentRecord,
                Quantity=Quantity,
                AssignedBy=AssignedBy,
                NowUtc=NowUtc,
            )
            db.commit()
            for PracticePaperRecord in CreatedPapers:
                db.refresh(PracticePaperRecord)
            Succeeded.append(
                {
                    "studentId": StudentRecord.id,
                    "studentCode": StudentRecord.student_code,
                    "quantityAssigned": Quantity,
                }
            )
        except Exception as Error:  # noqa: BLE001 -- one bad student must never abort the rest of the batch
            db.rollback()
            Failed.append({"studentIdentifier": StudentIdentifier, "reason": str(getattr(Error, "detail", None) or Error)})

    return {
        "competitionLevelCode": CompetitionLevelCode,
        "quantityPerStudent": Quantity,
        "studentsRequested": len(CleanedStudentIds),
        "studentsSucceeded": len(Succeeded),
        "studentsFailed": len(Failed),
        "totalPapersAssigned": len(Succeeded) * Quantity,
        "succeeded": Succeeded,
        "failed": Failed,
    }


def ListMyAnnualCompetitionPracticeScopes(db: Session, StudentRecord: Student) -> dict[str, Any]:
    """Student-facing discovery endpoint. Originally scoped by (event,
    level) (Phase G); 2026-09-12 (Shailesh, full event decoupling): "the
    practice papers should not be related to any event whatsoever" -- this
    now answers "which levels do I have ANY practice papers for," grouped
    by competition_level_code alone, independent of official assignment
    AND independent of any event. One row per distinct level, not one row
    per paper (GetAnnualCompetitionPracticeBankForStudent below stays the
    per-paper detail view once a level is known).
    """
    Rows = (
        db.query(CompetitionEventLevelPaper)
        .filter(
            CompetitionEventLevelPaper.paper_kind == "PRACTICE",
            CompetitionEventLevelPaper.assigned_student_id == StudentRecord.id,
        )
        .all()
    )

    ScopesByLevel: dict[str, dict[str, Any]] = {}
    for PaperRecord in Rows:
        Key = PaperRecord.competition_level_code
        if Key not in ScopesByLevel:
            ScopesByLevel[Key] = {
                "competitionLevelCode": PaperRecord.competition_level_code,
                "totalAssigned": 0,
                "consumedCount": 0,
            }
        ScopesByLevel[Key]["totalAssigned"] += 1
        if PaperRecord.consumed_at is not None:
            ScopesByLevel[Key]["consumedCount"] += 1

    Scopes = list(ScopesByLevel.values())
    for Scope in Scopes:
        Scope["remainingCount"] = Scope["totalAssigned"] - Scope["consumedCount"]
    Scopes.sort(key=lambda S: S["competitionLevelCode"])

    return {"scopes": Scopes}


def GetAnnualCompetitionPracticeBankForStudent(
    db: Session, *, StudentId: str, CompetitionLevelCode: str | None = None
) -> dict[str, Any]:
    """Admin's bank-status/history view: every practice paper ever assigned
    to this student (optionally scoped to one level), consumed or not,
    oldest-assigned first -- so an admin can see at a glance how many are
    left before deciding whether to top up the bank. consumed_at (set by
    the practice attempt-submit flow) is the source of truth for "done";
    this function only ever reads it, never infers or recomputes it. Fully
    independent of any CompetitionEvent (2026-09-12 decoupling).
    """
    StudentRecord = _ResolveStudentByIdOrCode(db, StudentId)

    Query = db.query(CompetitionEventLevelPaper).filter(
        CompetitionEventLevelPaper.paper_kind == "PRACTICE",
        CompetitionEventLevelPaper.assigned_student_id == StudentRecord.id,
    )
    if CompetitionLevelCode:
        Query = Query.filter(CompetitionEventLevelPaper.competition_level_code == CompetitionLevelCode)
    # 2026-09-14 (Shailesh, ordering bug -- "Practice Paper 4, 3, 5, 2, 1"):
    # this listing's own row order must match ComputePracticePaperOrdinals's
    # tie-break exactly (assigned_at.asc(), THEN id.asc()), or a batch of
    # papers sharing one identical assigned_at (pre microsecond-stagger-fix
    # data) can display in a different order than the "Practice Paper N"
    # label computed for the same rows below -- exactly the scattered order
    # Shailesh reported. Was previously assigned_at.asc() only.
    PracticePapers = Query.order_by(
        CompetitionEventLevelPaper.assigned_at.asc(), CompetitionEventLevelPaper.id.asc()
    ).all()

    # See ComputePracticePaperOrdinals's own docstring -- computed here from
    # every distinct (student, level) scope actually present in this
    # listing (usually just one, since this function is normally called for
    # one student, but a level-agnostic call still numbers each level
    # independently, correctly).
    Ordinals = ComputePracticePaperOrdinals(
        db, {(PaperRecord.assigned_student_id, PaperRecord.competition_level_code) for PaperRecord in PracticePapers}
    )

    # See ComputePracticePaperOrdinals's own docstring -- computed here from
    # every distinct (student, level) scope actually present in this
    # listing (usually just one, since this function is normally called for
    # one student, but a level-agnostic call still numbers each level
    # independently, correctly).
    Ordinals = ComputePracticePaperOrdinals(
        db, {(PaperRecord.assigned_student_id, PaperRecord.competition_level_code) for PaperRecord in PracticePapers}
    )

    Rows: list[dict[str, Any]] = []
    ConsumedCount = 0
    for PaperRecord in PracticePapers:
        IsConsumed = PaperRecord.consumed_at is not None
        if IsConsumed:
            ConsumedCount += 1
        Ordinal = Ordinals.get(PaperRecord.id)
        Rows.append(
            {
                "levelPaperId": PaperRecord.id,
                "competitionLevelCode": PaperRecord.competition_level_code,
                "status": PaperRecord.status,
                "assignedAt": PaperRecord.assigned_at.isoformat() if PaperRecord.assigned_at else None,
                "consumedAt": PaperRecord.consumed_at.isoformat() if PaperRecord.consumed_at else None,
                "isConsumed": IsConsumed,
                "paperOrdinal": Ordinal,
                "paperLabel": f"Practice Paper {Ordinal}" if Ordinal else "Practice Paper",
            }
        )

    return {
        "studentId": StudentRecord.id,
        "studentCode": StudentRecord.student_code,
        "competitionLevelCode": CompetitionLevelCode,
        "totalAssigned": len(Rows),
        "consumedCount": ConsumedCount,
        "remainingCount": len(Rows) - ConsumedCount,
        "papers": Rows,
    }


def DeleteAnnualCompetitionPracticeAttempt(db: Session, *, LevelPaperId: str) -> dict[str, Any]:
    """Admin per-row delete, Practice view (2026-09-14, Shailesh): removes
    one practice paper entirely -- the CompetitionEventLevelPaper row
    itself, plus its attempt/result/answers/section-states if it was ever
    started or submitted. Works identically for a pending (never attempted)
    row and a submitted one: a pending row has no attempt to unwind, so
    that whole block below is simply skipped.

    Mirrors DeleteCompetitionEvent's own explicit, dependency-ordered
    cascade (this module, above) rather than relying on implicit DB
    cascade -- same reasoning: SQLite (this suite's test DB) does not
    enforce foreign keys unless a connection explicitly turns
    PRAGMA foreign_keys on, so a correctness bug here could pass its own
    tests for the wrong reason if left to implicit cascade.

    2026-09-14 (Shailesh, explicit): a deleted paper is genuinely gone, not
    reset to "pending" for reassignment -- "if that paper ever gets
    assigned to the same student later someday not a problem as so many
    papers are there no one will remember the exact questions." If this
    student is later given a fresh practice paper for the same level, it is
    a brand new CompetitionEventLevelPaper row, entirely independent of the
    one deleted here.
    """
    PaperRecord = db.get(CompetitionEventLevelPaper, LevelPaperId)
    if not PaperRecord or PaperRecord.paper_kind != "PRACTICE":
        api_error(404, "PRACTICE_PAPER_NOT_FOUND", "Practice paper not found.")

    AttemptRecord = (
        db.query(CompetitionEventAttempt)
        .filter(CompetitionEventAttempt.level_paper_id == LevelPaperId, CompetitionEventAttempt.attempt_type == "PRACTICE")
        .first()
    )
    if AttemptRecord:
        db.query(CompetitionEventAttemptSectionState).filter(
            CompetitionEventAttemptSectionState.attempt_id == AttemptRecord.id
        ).delete(synchronize_session=False)
        db.query(CompetitionEventAttemptAnswer).filter(
            CompetitionEventAttemptAnswer.attempt_id == AttemptRecord.id
        ).delete(synchronize_session=False)
        db.query(CompetitionEventResult).filter(CompetitionEventResult.attempt_id == AttemptRecord.id).delete(synchronize_session=False)
        db.query(CompetitionEventAttemptRetryGrant).filter(
            CompetitionEventAttemptRetryGrant.used_attempt_id == AttemptRecord.id
        ).delete(synchronize_session=False)
        db.delete(AttemptRecord)

    db.delete(PaperRecord)
    db.commit()
    return {"levelPaperId": LevelPaperId, "deleted": True}


def DeleteAllAnnualCompetitionPracticeRecordsForStudent(db: Session, *, StudentId: str) -> dict[str, Any]:
    """Admin per-student-block delete, Practice view (2026-09-14, Shailesh):
    removes every PRACTICE record for one student -- every practice
    CompetitionEventLevelPaper they were ever assigned (consumed or not)
    plus each one's attempt/result/answers/section-states, the same
    cascade DeleteAnnualCompetitionPracticeAttempt uses per paper, just
    batched across every paper_kind == "PRACTICE" row this student has.

    2026-09-14 (Shailesh, explicit): "delete all records is valid for
    practice flow ... only" -- deliberately scoped to paper_kind ==
    "PRACTICE" only. This student's OFFICIAL Annual Competition
    assignment/attempt/result, if any, is completely untouched; nothing
    here ever filters or deletes by paper_kind == "OFFICIAL".
    """
    StudentRecord = _ResolveStudentByIdOrCode(db, StudentId)

    PaperIds = [
        Row.id
        for Row in db.query(CompetitionEventLevelPaper.id)
        .filter(
            CompetitionEventLevelPaper.paper_kind == "PRACTICE",
            CompetitionEventLevelPaper.assigned_student_id == StudentRecord.id,
        )
        .all()
    ]
    if not PaperIds:
        return {"studentId": StudentRecord.id, "deletedPaperCount": 0}

    AttemptIds = [
        Row.id
        for Row in db.query(CompetitionEventAttempt.id)
        .filter(CompetitionEventAttempt.level_paper_id.in_(PaperIds), CompetitionEventAttempt.attempt_type == "PRACTICE")
        .all()
    ]
    if AttemptIds:
        db.query(CompetitionEventAttemptSectionState).filter(
            CompetitionEventAttemptSectionState.attempt_id.in_(AttemptIds)
        ).delete(synchronize_session=False)
        db.query(CompetitionEventAttemptAnswer).filter(
            CompetitionEventAttemptAnswer.attempt_id.in_(AttemptIds)
        ).delete(synchronize_session=False)
        db.query(CompetitionEventResult).filter(CompetitionEventResult.attempt_id.in_(AttemptIds)).delete(synchronize_session=False)
        db.query(CompetitionEventAttemptRetryGrant).filter(
            CompetitionEventAttemptRetryGrant.used_attempt_id.in_(AttemptIds)
        ).delete(synchronize_session=False)
        db.query(CompetitionEventAttempt).filter(CompetitionEventAttempt.id.in_(AttemptIds)).delete(synchronize_session=False)

    db.query(CompetitionEventLevelPaper).filter(CompetitionEventLevelPaper.id.in_(PaperIds)).delete(synchronize_session=False)
    db.commit()
    return {"studentId": StudentRecord.id, "deletedPaperCount": len(PaperIds)}


def ListStudentsForPracticeBank(db: Session) -> dict[str, Any]:
    """2026-09-12 (Shailesh, Competition Practice feature -- bulk
    assignment): the roster the admin's new Practice Bank student picker
    lists from -- every active student, tagged with the Annual Competition
    level they are CURRENTLY eligible for, computed via the same pure,
    already-tested assignment-engine function the OFFICIAL preview/run flow
    uses (ComputeAssignmentsForRoster) -- reused rather than re-derived, so
    "eligible level" can never quietly drift between the OFFICIAL assignment
    engine and this practice picker. This is a live computation, not a
    stored assignment: a student with no rule match yet (no_rule_matched)
    is still listed, just with eligibleCompetitionLevelCode=None, so the
    admin can see them and decide manually rather than have them silently
    disappear from the list.
    """
    # Local import: see the module-level note above the import block on why
    # this cannot be a top-level import (annual_competition_assignment_
    # service.py imports back from this module).
    from app.services.annual_competition_assignment_service import ComputeAssignmentsForRoster

    Students = db.query(Student).filter(Student.is_active == True).order_by(Student.student_code.asc()).all()  # noqa: E712
    Computations = ComputeAssignmentsForRoster(db, Students)
    ComputationByStudentId = {Computation.student_id: Computation for Computation in Computations}

    Rows: list[dict[str, Any]] = []
    for StudentRecord in Students:
        Computation = ComputationByStudentId.get(StudentRecord.id)
        EligibleLevelCode = (
            Computation.assigned_level_code
            if Computation and not Computation.no_rule_matched and Computation.assigned_level_code in VALID_COMPETITION_LEVEL_CODES
            else None
        )
        Rows.append(
            {
                "studentId": StudentRecord.id,
                "studentCode": StudentRecord.student_code,
                "studentName": StudentRecord.user.full_name if StudentRecord.user else None,
                "currentModuleCode": Computation.current_module_code if Computation else None,
                "currentLevelCode": Computation.current_level_code if Computation else None,
                "eligibleCompetitionLevelCode": EligibleLevelCode,
            }
        )

    return {"totalStudents": len(Rows), "students": Rows}


def GetCompetitionEventStudioOverview(db: Session, EventId: str) -> dict[str, Any]:
    """One call to load everything the studio screen needs: event, slots,
    level papers (with timers + live-recomputed status), and the flagged
    slot/section-timer duration mismatches (REQUIREMENTS.md item 7).
    """
    EventPayload = GetCompetitionEvent(db, EventId)
    Slots = ListCompetitionEventSlots(db, EventId)
    LevelPapers = ListCompetitionEventLevelPapers(db, EventId)
    LevelPapersByCode = {LevelPaper["competitionLevelCode"]: LevelPaper for LevelPaper in LevelPapers}
    MissingLevelCodes = sorted(VALID_COMPETITION_LEVEL_CODES - set(LevelPapersByCode.keys()))
    return {
        "event": EventPayload,
        "slots": Slots,
        "levelPapers": LevelPapers,
        "missingLevelPapers": MissingLevelCodes,
        "slotDurationConflicts": SlotsWithInsufficientDuration(db, EventId),
    }
