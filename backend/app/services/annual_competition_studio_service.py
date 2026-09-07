"""Annual Competition -- Admin Studio service (Package 3).

Everything an admin needs to stand up one CompetitionEvent end to end,
before any student ever sees it: create the event, define/edit its time
slots, generate or link each competition level's official paper (reusing
the existing, already-shipped Competition Mock generation engine), set
that paper's per-section timers, and run/review the Package 2 assignment
engine. See .mathpath/packages/pkg-03-admin-studio.md for the checklist
this was built against.

## Which level codes this studio ever generates a paper for

Eleven competition_level_code values are real targets a student can be
assigned to (per the Package 2 assignment engine): YLM-L1, PM-L1..PM-L4,
IM-L1..IM-L4, MM-L1, MM-L2. BM-L1 is deliberately NOT one of them -- a
Bridge Module student is always re-mapped to a PM-tier target by the
assignment engine (REQUIREMENTS.md Section 1); nobody ever competes "as
BM-L1" itself, so there is no official BM-L1 paper to generate here.
_ValidateCompetitionLevelCode() below rejects it explicitly rather than
silently accepting a code that can never be assigned to anyone.

## Default section timers -- REQUIREMENTS.md Section 3.4, transcribed
## verbatim, not re-derived

DEFAULT_SECTION_TIMERS_BY_LEVEL_CODE below is the client's own
level-by-level section table (minutes converted to seconds), keyed on the
same real level codes as Package 2's mapping table. This is intentionally
NOT sourced from the internal dev spec's "Level 1..8 / MM1/MM2" table --
REQUIREMENTS.md already flags those two tables as not numerically
equivalent (e.g. dev-spec "Level 4" = 20 min across 3 sections vs. the
client's real PL-4 = 30 min across 3 sections). Only the real-event table
is used here. Every row's minutes sum to that level's documented total --
checked by test_annual_competition_studio_service.py, not just eyeballed.

MM-L2 is included here even though no Level/registry entry exists for it
yet (see Package 2's findings) -- so the moment Package "add MM-L2 to the
registry" work happens, this studio already has the right section-timer
default ready and does not need to be revisited.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import (
    CompetitionEvent,
    CompetitionEventAssignment,
    CompetitionEventAttempt,
    CompetitionEventLevelPaper,
    CompetitionEventSectionTimer,
    CompetitionEventSlot,
    CompetitionMockExam,
    Level,
    Module,
    Student,
    User,
)
from app.services.competition_mock_generation_service import GenerateCompetitionMockDraft, CompetitionMockExamPayload

# Level codes a student can actually be assigned to (Package 2). BM-L1 is
# a current-position-only code and is never a valid target here.
VALID_COMPETITION_LEVEL_CODES = {
    "YLM-L1",
    "PM-L1", "PM-L2", "PM-L3", "PM-L4",
    "IM-L1", "IM-L2", "IM-L3", "IM-L4",
    "MM-L1", "MM-L2",
}

# competition_level_code -> [(section_number, section_title, mode, time_limit_seconds), ...]
DEFAULT_SECTION_TIMERS_BY_LEVEL_CODE: dict[str, list[tuple[int, str, str, int]]] = {
    "YLM-L1": [(1, "Direct Sums", "MIXED", 20 * 60)],
    "PM-L1": [(1, "Direct Sums", "MIXED", 20 * 60)],
    "PM-L2": [(1, "Abacus", "ABACUS", 15 * 60), (2, "Visual", "VISUAL", 15 * 60)],
    "PM-L3": [
        (1, "Abacus", "ABACUS", 10 * 60),
        (2, "Visual", "VISUAL", 10 * 60),
        (3, "Multiplication", "MULTIPLICATION", 10 * 60),
    ],
    "PM-L4": [
        (1, "Abacus", "ABACUS", 10 * 60),
        (2, "Visual", "VISUAL", 10 * 60),
        (3, "Mixed Multiplication/Division", "MIXED_MULT_DIV", 10 * 60),
    ],
    "IM-L1": [
        (1, "Abacus", "ABACUS", 10 * 60),
        (2, "Visual", "VISUAL", 10 * 60),
        (3, "Multiplication/Division", "MULT_DIV", 10 * 60),
    ],
    "IM-L2": [
        (1, "Abacus", "ABACUS", 10 * 60),
        (2, "Visual", "VISUAL", 10 * 60),
        (3, "Multiplication/Division", "MULT_DIV", 10 * 60),
    ],
    "IM-L3": [
        (1, "Abacus", "ABACUS", 8 * 60),
        (2, "Visual", "VISUAL", 8 * 60),
        (3, "Multiplication", "MULTIPLICATION", 7 * 60),
        (4, "Division", "DIVISION", 7 * 60),
    ],
    "IM-L4": [
        (1, "Abacus", "ABACUS", 8 * 60),
        (2, "Visual", "VISUAL", 8 * 60),
        (3, "Multiplication", "MULTIPLICATION", 7 * 60),
        (4, "Division", "DIVISION", 7 * 60),
        (5, "Squares", "SQUARES", 5 * 60),
    ],
    "MM-L1": [
        (1, "Abacus", "ABACUS", 5 * 60),
        (2, "Visual", "VISUAL", 5 * 60),
        (3, "Multiplication", "MULTIPLICATION", 5 * 60),
        (4, "Division", "DIVISION", 5 * 60),
        (5, "Squares", "SQUARES", 5 * 60),
        (6, "Percentage", "PERCENTAGE", 5 * 60),
    ],
    "MM-L2": [
        (1, "Abacus", "ABACUS", 5 * 60),
        (2, "Visual", "VISUAL", 5 * 60),
        (3, "Multiplication", "MULTIPLICATION", 5 * 60),
        (4, "Division", "DIVISION", 5 * 60),
        (5, "Squares & Cubes", "SQUARES_CUBES", 5 * 60),
        (6, "Percentage", "PERCENTAGE", 5 * 60),
        (7, "Square/Cube Roots", "SQUARE_CUBE_ROOTS", 10 * 60),
    ],
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
    EventRecord = db.get(CompetitionEvent, LevelPaperRecord.event_id)
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
    _ValidateCompetitionLevelCode(CompetitionLevelCode)
    LevelPaperRecord = (
        db.query(CompetitionEventLevelPaper)
        .filter(
            CompetitionEventLevelPaper.event_id == EventId,
            CompetitionEventLevelPaper.competition_level_code == CompetitionLevelCode,
        )
        .first()
    )
    if not LevelPaperRecord:
        LevelPaperRecord = CompetitionEventLevelPaper(
            event_id=EventId,
            competition_level_code=CompetitionLevelCode,
            status="PENDING",
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

    LevelRecord = (
        db.query(Level).filter(Level.level_code == CompetitionLevelCode, Level.is_active == True).first()
    )
    if not LevelRecord:
        api_error(
            409,
            "NO_CURRICULUM_LEVEL_FOR_CODE",
            f"'{CompetitionLevelCode}' has no matching curriculum Level yet, so no paper can be generated for it. "
            "This is a known, tracked gap (see pkg-02-assignment-engine.md finding #4 for MM-L2) -- link an "
            "existing mock exam instead, or add the curriculum/registry content first.",
        )

    Defaults = DEFAULT_SECTION_TIMERS_BY_LEVEL_CODE.get(CompetitionLevelCode, [])
    DurationSeconds = sum(TimeLimitSeconds for _n, _t, _m, TimeLimitSeconds in Defaults) or None

    ExamPayload = GenerateCompetitionMockDraft(
        db,
        LevelId=LevelRecord.id,
        CreatedBy=CreatedBy,
        Title=f"Annual Competition -- {CompetitionLevelCode} Official Paper",
        MockCode=f"ANNUAL-{EventId[:8]}-{CompetitionLevelCode}",
        DurationSeconds=DurationSeconds,
        CompetitionScope="ANNUAL_COMPETITION",
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
    _GetEventOr404(db, EventId)
    LevelPapers = (
        db.query(CompetitionEventLevelPaper)
        .filter(CompetitionEventLevelPaper.event_id == EventId)
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
