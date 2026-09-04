"""Annual Competition -- Section-Timer + Pause Engine (Package 4).

The highest-risk, most novel piece of the Annual Competition build:
independently timed sections with genuine pause-on-disconnect. Nothing
like this exists anywhere else in this codebase -- DPS, Assessment, and
Competition Mock (competition_mock_attempt_service.py) all use one
whole-attempt wall-clock timer (`expires_at`) with no pause concept at
all. See .mathpath/packages/pkg-04-section-timer-engine.md for the
checklist this was built against, and the "section-timer + pause engine"
section of .mathpath/epics/annual-competition-plan.md for the original
design.

## The heartbeat/pause mechanic, precisely

While a section is ACTIVE, the client is expected to send a heartbeat
every ~5-10s. Each heartbeat compares itself to the section's
*previous* heartbeat (`last_heartbeat_at`) -- never to wall-clock "now"
minus the section's start time -- because remaining time must only ever
move in response to an actual heartbeat, per the plan ("the server only
decrements remaining time between consecutive heartbeats"). This is what
makes a silent, unannounced pause possible with zero extra
infrastructure: if heartbeats simply stop arriving, nothing ever
deducts any more time, and the section just sits however it was left.

The one piece of real design judgment this required (the plan describes
the intent in prose, not as a formula) is exactly how the "grace window"
converts a heartbeat gap into deducted time. Two facts fix the answer:

  1. Package 4's own verification checklist says "heartbeat gap under
     the grace window -> no time lost" AND separately requires normal,
     continuous ~5-10s heartbeating to make the timer actually count
     down (otherwise no section could ever expire from a fixed time
     budget, which the client's own spec requires).
  2. "Resuming ... picks up from the exact persisted remaining time" --
     a real disconnect must not cost the student the whole disconnected
     duration, only a small, bounded amount.

The formula that satisfies both: `EffectiveElapsed = min(RawGap,
HEARTBEAT_GRACE_SECONDS)`. During normal use RawGap (~5-10s) is always
comfortably under the grace window, so EffectiveElapsed == RawGap and
the timer ticks down at the correct, real rate ("no [erroneous] time
lost" versus what actually elapsed). During a real disconnect RawGap
can be arbitrarily large, but EffectiveElapsed is capped at the grace
window -- so a 10-minute disconnect costs the student only
HEARTBEAT_GRACE_SECONDS, exactly matching "picks up from the exact
persisted remaining time." A closing-and-reopening laptop and a genuine
network drop are indistinguishable to the server by design (per the
plan) and this formula treats them identically, on purpose.

## Single-active-session guard

`CompetitionEventAttempt.session_token` is (re)issued every time
`StartCompetitionEventAttempt` is called -- both for a brand new attempt
and for resuming an existing `IN_PROGRESS` one. Any other in-flight
device/tab is left holding the *previous* token, which every mutating
call below (`RecordCompetitionEventHeartbeat`,
`SubmitCompetitionEventSection`) now rejects with
`COMPETITION_ATTEMPT_SESSION_SUPERSEDED`. This is deliberately not a
security boundary (ownership is already checked via `student_id`) --
it is a consistency guard between the same student's own two devices,
closing the multi-device desync gap flagged during plan review. Reads
(`GetCompetitionEventAttemptForStudent`) never check or reissue the
token: only Start/Resume grants write access, matching the plan's
"resume here" remediation -- a rejected stale-token caller's fix is to
call Start again.

## Auto-advance + the FINALIZED vs SUBMITTED distinction

Any request touching an attempt lazily re-checks whether the active
section's `remaining_seconds_at_last_heartbeat` has reached zero (same
"never trust a stale flag, recompute on every touch" pattern as
`EnsureCompetitionAttemptActiveOrSubmit` in
competition_mock_attempt_service.py) and advances/finalizes if so.
Per the lifecycle comment already written on `CompetitionEventAttempt`
in models.py, `FINALIZED` is reserved for once a `CompetitionEventResult`
has been computed -- that is Package 6 (Scoring + Results), not this
package. Everything here only ever reaches `SUBMITTED`; a separate,
later scoring pass is what advances `SUBMITTED -> FINALIZED`.

## The reconciliation sweep

The lazy pattern above only ever *reacts* to a request. A student whose
last section's timer would have run out, but who never sends another
request (closed tab, abandoned the attempt, event day is simply over),
leaves that row `IN_PROGRESS` forever -- there is no scheduler/cron
anywhere in this backend to catch it on its own.
`ReconcileExpiredCompetitionEventAttempts` is the admin-triggered safety
net: for every `IN_PROGRESS` attempt whose active section is currently
*paused* (no heartbeat within the grace window -- the same definition
used everywhere else, no new threshold invented), it force-closes that
section and every section after it (in case the whole attempt was
abandoned partway through), crediting no additional time beyond what
was already on record -- consistent with the pause philosophy: an
abandonment is not retroactively punished beyond the one grace window
it already paid for.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import (
    CompetitionEvent,
    CompetitionEventAssignment,
    CompetitionEventAttempt,
    CompetitionEventAttemptSectionState,
    CompetitionEventLevelPaper,
    CompetitionEventSectionTimer,
    Student,
)

# 30-60s per the plan; 45s is the documented midpoint -- long enough to
# absorb a couple of missed heartbeats from ordinary network jitter,
# short enough that a real pause is detected (and capped) promptly.
HEARTBEAT_GRACE_SECONDS = 45

IN_PROGRESS_STATUS = "IN_PROGRESS"
TERMINAL_ATTEMPT_STATUSES = {"SUBMITTED", "FINALIZED"}


def _NowUtc() -> datetime:
    return datetime.now(timezone.utc)


def _Aware(Value: datetime | None) -> datetime | None:
    if Value is None:
        return None
    if Value.tzinfo is None:
        return Value.replace(tzinfo=timezone.utc)
    return Value


def _GetOwnedAttemptOr404(db: Session, StudentRecord: Student, AttemptId: str) -> CompetitionEventAttempt:
    AttemptRecord = db.get(CompetitionEventAttempt, AttemptId)
    if not AttemptRecord or AttemptRecord.student_id != StudentRecord.id:
        api_error(404, "COMPETITION_ATTEMPT_NOT_FOUND", "Competition attempt not found.")
    return AttemptRecord


def _VerifySessionToken(AttemptRecord: CompetitionEventAttempt, SessionToken: str | None) -> None:
    if not SessionToken or AttemptRecord.session_token != SessionToken:
        api_error(
            409,
            "COMPETITION_ATTEMPT_SESSION_SUPERSEDED",
            "This attempt is active in another session. Start/resume again to continue here.",
        )


def _ActiveSection(db: Session, AttemptRecord: CompetitionEventAttempt) -> CompetitionEventAttemptSectionState | None:
    return (
        db.query(CompetitionEventAttemptSectionState)
        .filter(
            CompetitionEventAttemptSectionState.attempt_id == AttemptRecord.id,
            CompetitionEventAttemptSectionState.status == "ACTIVE",
        )
        .first()
    )


def _AllSectionsOrdered(db: Session, AttemptRecord: CompetitionEventAttempt) -> list[CompetitionEventAttemptSectionState]:
    return (
        db.query(CompetitionEventAttemptSectionState)
        .filter(CompetitionEventAttemptSectionState.attempt_id == AttemptRecord.id)
        .order_by(CompetitionEventAttemptSectionState.section_number.asc())
        .all()
    )


def _ActivateSection(SectionState: CompetitionEventAttemptSectionState, NowUtc: datetime) -> None:
    SectionState.status = "ACTIVE"
    SectionState.started_at = NowUtc
    SectionState.remaining_seconds_at_last_heartbeat = SectionState.time_limit_seconds
    SectionState.last_heartbeat_at = NowUtc


def _AdvanceOrFinalize(
    db: Session,
    AttemptRecord: CompetitionEventAttempt,
    CompletedSection: CompetitionEventAttemptSectionState,
    NowUtc: datetime,
    *,
    Auto: bool,
) -> None:
    """Closes `CompletedSection` and either activates the next section in
    order or, if that was the last one, finalizes the whole attempt to
    SUBMITTED (never FINALIZED -- see module docstring). Looks up "next"
    by ordering rather than `section_number + 1` so this stays correct
    even if a level paper's section numbers were ever non-contiguous."""
    CompletedSection.status = "AUTO_SUBMITTED" if Auto else "COMPLETED"
    CompletedSection.submitted_at = NowUtc
    if CompletedSection.remaining_seconds_at_last_heartbeat is None or CompletedSection.remaining_seconds_at_last_heartbeat < 0:
        CompletedSection.remaining_seconds_at_last_heartbeat = 0

    AllSections = _AllSectionsOrdered(db, AttemptRecord)
    CompletedIndex = next((i for i, s in enumerate(AllSections) if s.section_number == CompletedSection.section_number), None)
    NextSection = AllSections[CompletedIndex + 1] if CompletedIndex is not None and CompletedIndex + 1 < len(AllSections) else None

    if NextSection:
        _ActivateSection(NextSection, NowUtc)
        AttemptRecord.current_section_number = NextSection.section_number
    else:
        AttemptRecord.status = "SUBMITTED"
        AttemptRecord.submitted_at = NowUtc

    # Test sessions in this repo run with autoflush=False (see e.g.
    # test_annual_competition_studio_service.py), and a query that filters
    # on a column just mutated in this same transaction (status=="ACTIVE"
    # in _ActiveSection, called by every caller of this function right
    # after) would otherwise see the DB's stale pre-mutation row instead of
    # what was just set above -- the exact same bug class caught in
    # Package 3 (see annual_competition_studio_service.py's
    # _SeedDefaultSectionTimers comment). Flushing here, once, covers every
    # caller transitively.
    db.flush()


def _EnsureActiveSectionOrAdvance(db: Session, AttemptRecord: CompetitionEventAttempt, NowUtc: datetime) -> None:
    """The lazy "never trust a stale flag" check every attempt-touching
    entry point below runs first. Only ever acts on a *stored* fact
    (remaining_seconds_at_last_heartbeat already at/under zero) -- it
    never derives elapsed time from wall-clock `NowUtc` itself, since
    remaining time only ever moves in response to an actual heartbeat
    (see module docstring)."""
    if AttemptRecord.status != IN_PROGRESS_STATUS:
        return
    ActiveSectionState = _ActiveSection(db, AttemptRecord)
    if not ActiveSectionState:
        return
    if ActiveSectionState.remaining_seconds_at_last_heartbeat is not None and ActiveSectionState.remaining_seconds_at_last_heartbeat <= 0:
        _AdvanceOrFinalize(db, AttemptRecord, ActiveSectionState, NowUtc, Auto=True)


# ---------------------------------------------------------------------------
# Payloads
# ---------------------------------------------------------------------------

def _SectionStatePayload(SectionState: CompetitionEventAttemptSectionState) -> dict[str, Any]:
    return {
        "sectionNumber": SectionState.section_number,
        "status": SectionState.status,
        "timeLimitSeconds": SectionState.time_limit_seconds,
        "remainingSeconds": SectionState.remaining_seconds_at_last_heartbeat,
        "startedAt": SectionState.started_at.isoformat() if SectionState.started_at else None,
        "submittedAt": SectionState.submitted_at.isoformat() if SectionState.submitted_at else None,
    }


def _AttemptPayload(db: Session, AttemptRecord: CompetitionEventAttempt, *, IncludeSessionToken: bool = False) -> dict[str, Any]:
    Sections = _AllSectionsOrdered(db, AttemptRecord)
    Payload: dict[str, Any] = {
        "attemptId": AttemptRecord.id,
        "eventId": AttemptRecord.event_id,
        "assignmentId": AttemptRecord.assignment_id,
        "levelPaperId": AttemptRecord.level_paper_id,
        "status": AttemptRecord.status,
        "currentSectionNumber": AttemptRecord.current_section_number,
        "startedAt": AttemptRecord.started_at.isoformat() if AttemptRecord.started_at else None,
        "submittedAt": AttemptRecord.submitted_at.isoformat() if AttemptRecord.submitted_at else None,
        "sections": [_SectionStatePayload(SectionState) for SectionState in Sections],
    }
    if IncludeSessionToken:
        Payload["sessionToken"] = AttemptRecord.session_token
    return Payload


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def StartCompetitionEventAttempt(db: Session, StudentRecord: Student, EventId: str) -> dict[str, Any]:
    """Starts a student's first attempt for this event, or resumes an
    existing IN_PROGRESS one. Either way, a fresh session_token is issued
    -- this IS the "resume here" remediation the plan describes: whichever
    device most recently called Start/Resume owns write access, and any
    other device's now-stale heartbeats are rejected until it, too, calls
    this again. Slot/event-live time-gating ("can't begin before your
    scheduled time") is deliberately not enforced here -- the plan places
    that in Package 5 (student live-attempt UI), not this isolated engine
    package; see pkg-04-section-timer-engine.md.
    """
    EventRecord = db.get(CompetitionEvent, EventId)
    if not EventRecord:
        api_error(404, "COMPETITION_EVENT_NOT_FOUND", "Annual Competition event not found.")

    AssignmentRecord = (
        db.query(CompetitionEventAssignment)
        .filter(
            CompetitionEventAssignment.event_id == EventId,
            CompetitionEventAssignment.student_id == StudentRecord.id,
            CompetitionEventAssignment.is_active == True,  # noqa: E712
        )
        .first()
    )
    if not AssignmentRecord:
        api_error(404, "COMPETITION_ASSIGNMENT_NOT_FOUND", "You are not assigned to this competition event.")

    NowUtc = _NowUtc()

    ExistingAttempt = (
        db.query(CompetitionEventAttempt)
        .filter(CompetitionEventAttempt.assignment_id == AssignmentRecord.id)
        .order_by(CompetitionEventAttempt.attempt_number.desc())
        .first()
    )
    if ExistingAttempt:
        if ExistingAttempt.status in TERMINAL_ATTEMPT_STATUSES:
            api_error(403, "COMPETITION_ATTEMPT_ALREADY_SUBMITTED", "This competition attempt has already been submitted.")
        # Resume: reissue the session token, then self-correct any state
        # that should already have advanced/finalized while nobody was
        # looking (same lazy check every other entry point runs).
        ExistingAttempt.session_token = secrets.token_urlsafe(32)
        _EnsureActiveSectionOrAdvance(db, ExistingAttempt, NowUtc)
        db.commit()
        db.refresh(ExistingAttempt)
        return _AttemptPayload(db, ExistingAttempt, IncludeSessionToken=True)

    LevelPaperRecord = (
        db.query(CompetitionEventLevelPaper)
        .filter(
            CompetitionEventLevelPaper.event_id == EventId,
            CompetitionEventLevelPaper.competition_level_code == AssignmentRecord.assigned_level_code,
        )
        .first()
    )
    if not LevelPaperRecord or not LevelPaperRecord.mock_exam_id:
        api_error(400, "COMPETITION_LEVEL_PAPER_NOT_READY", "This level's competition paper has not been set up yet.")

    SectionTimers = (
        db.query(CompetitionEventSectionTimer)
        .filter(CompetitionEventSectionTimer.level_paper_id == LevelPaperRecord.id)
        .order_by(CompetitionEventSectionTimer.display_order.asc(), CompetitionEventSectionTimer.section_number.asc())
        .all()
    )
    if not SectionTimers:
        api_error(400, "COMPETITION_LEVEL_PAPER_NOT_READY", "This level's section timers have not been set up yet.")

    AttemptRecord = CompetitionEventAttempt(
        event_id=EventId,
        assignment_id=AssignmentRecord.id,
        level_paper_id=LevelPaperRecord.id,
        student_id=StudentRecord.id,
        attempt_number=1,
        status=IN_PROGRESS_STATUS,
        session_token=secrets.token_urlsafe(32),
        current_section_number=SectionTimers[0].section_number,
        started_at=NowUtc,
    )
    db.add(AttemptRecord)
    db.flush()  # AttemptRecord.id must exist before the section-state rows below reference it

    for Index, Timer in enumerate(SectionTimers):
        SectionState = CompetitionEventAttemptSectionState(
            attempt_id=AttemptRecord.id,
            section_number=Timer.section_number,
            status="PENDING",
            time_limit_seconds=Timer.time_limit_seconds,
        )
        if Index == 0:
            _ActivateSection(SectionState, NowUtc)
        db.add(SectionState)

    db.commit()
    db.refresh(AttemptRecord)
    return _AttemptPayload(db, AttemptRecord, IncludeSessionToken=True)


def GetCompetitionEventAttemptForStudent(db: Session, StudentRecord: Student, AttemptId: str) -> dict[str, Any]:
    AttemptRecord = _GetOwnedAttemptOr404(db, StudentRecord, AttemptId)
    NowUtc = _NowUtc()
    _EnsureActiveSectionOrAdvance(db, AttemptRecord, NowUtc)
    db.commit()
    db.refresh(AttemptRecord)
    return _AttemptPayload(db, AttemptRecord)


def RecordCompetitionEventHeartbeat(
    db: Session, StudentRecord: Student, AttemptId: str, SessionToken: str | None, SectionNumber: int
) -> dict[str, Any]:
    AttemptRecord = _GetOwnedAttemptOr404(db, StudentRecord, AttemptId)
    NowUtc = _NowUtc()
    _EnsureActiveSectionOrAdvance(db, AttemptRecord, NowUtc)
    if AttemptRecord.status != IN_PROGRESS_STATUS:
        db.commit()
        db.refresh(AttemptRecord)
        return _AttemptPayload(db, AttemptRecord)

    _VerifySessionToken(AttemptRecord, SessionToken)

    ActiveSectionState = _ActiveSection(db, AttemptRecord)
    if not ActiveSectionState:
        api_error(409, "COMPETITION_ATTEMPT_NO_ACTIVE_SECTION", "This attempt has no active section.")
    if ActiveSectionState.section_number != SectionNumber:
        api_error(
            409,
            "COMPETITION_SECTION_NOT_ACTIVE",
            f"Section {SectionNumber} is no longer the active section for this attempt.",
        )

    LastHeartbeatAt = _Aware(ActiveSectionState.last_heartbeat_at) or _Aware(ActiveSectionState.started_at) or NowUtc
    RawGapSeconds = max(0.0, (NowUtc - LastHeartbeatAt).total_seconds())
    EffectiveElapsedSeconds = min(RawGapSeconds, float(HEARTBEAT_GRACE_SECONDS))
    PreviousRemaining = ActiveSectionState.remaining_seconds_at_last_heartbeat or 0
    NewRemaining = max(0, int(PreviousRemaining - round(EffectiveElapsedSeconds)))

    ActiveSectionState.remaining_seconds_at_last_heartbeat = NewRemaining
    ActiveSectionState.last_heartbeat_at = NowUtc

    if NewRemaining <= 0:
        _AdvanceOrFinalize(db, AttemptRecord, ActiveSectionState, NowUtc, Auto=True)

    db.commit()
    db.refresh(AttemptRecord)
    return _AttemptPayload(db, AttemptRecord)


def SubmitCompetitionEventSection(
    db: Session, StudentRecord: Student, AttemptId: str, SessionToken: str | None, SectionNumber: int
) -> dict[str, Any]:
    """A student who finishes a section's questions early can move on
    without waiting for the timer to run out. Shares the same session-
    token guard and section-identity check as the heartbeat path."""
    AttemptRecord = _GetOwnedAttemptOr404(db, StudentRecord, AttemptId)
    NowUtc = _NowUtc()
    _EnsureActiveSectionOrAdvance(db, AttemptRecord, NowUtc)
    if AttemptRecord.status != IN_PROGRESS_STATUS:
        db.commit()
        db.refresh(AttemptRecord)
        return _AttemptPayload(db, AttemptRecord)

    _VerifySessionToken(AttemptRecord, SessionToken)

    ActiveSectionState = _ActiveSection(db, AttemptRecord)
    if not ActiveSectionState:
        api_error(409, "COMPETITION_ATTEMPT_NO_ACTIVE_SECTION", "This attempt has no active section.")
    if ActiveSectionState.section_number != SectionNumber:
        api_error(
            409,
            "COMPETITION_SECTION_NOT_ACTIVE",
            f"Section {SectionNumber} is no longer the active section for this attempt.",
        )

    _AdvanceOrFinalize(db, AttemptRecord, ActiveSectionState, NowUtc, Auto=False)

    db.commit()
    db.refresh(AttemptRecord)
    return _AttemptPayload(db, AttemptRecord)


def ReconcileExpiredCompetitionEventAttempts(db: Session) -> dict[str, Any]:
    """Admin-triggered safety net -- see module docstring. Only ever acts
    on an attempt that is IN_PROGRESS *and* currently paused (no heartbeat
    within the grace window right now); an attempt receiving live
    heartbeats this instant is left alone. Naturally idempotent: a second
    run finds nothing left to do, since reconciled attempts are no longer
    IN_PROGRESS."""
    NowUtc = _NowUtc()
    Attempts = db.query(CompetitionEventAttempt).filter(CompetitionEventAttempt.status == IN_PROGRESS_STATUS).all()

    ReconciledAttemptIds: list[str] = []

    for AttemptRecord in Attempts:
        ActiveSectionState = _ActiveSection(db, AttemptRecord)
        if not ActiveSectionState:
            # Defensive: an IN_PROGRESS attempt with no ACTIVE section is a
            # data oddity (e.g. a prior partial write). The standard lazy
            # check self-heals it from whatever is stored, same as every
            # other entry point.
            _EnsureActiveSectionOrAdvance(db, AttemptRecord, NowUtc)
            continue

        LastHeartbeatAt = _Aware(ActiveSectionState.last_heartbeat_at) or _Aware(ActiveSectionState.started_at)
        GapSeconds = (NowUtc - LastHeartbeatAt).total_seconds() if LastHeartbeatAt else None
        IsCurrentlyPaused = GapSeconds is None or GapSeconds > HEARTBEAT_GRACE_SECONDS
        if not IsCurrentlyPaused:
            continue  # actively heartbeating right now -- not this sweep's job

        # Force-close this section and cascade through any remaining ones
        # -- an attempt abandoned mid-way should end up fully SUBMITTED,
        # not left half-advanced with yet another immediately-paused
        # active section.
        _AdvanceOrFinalize(db, AttemptRecord, ActiveSectionState, NowUtc, Auto=True)
        while AttemptRecord.status == IN_PROGRESS_STATUS:
            NextActiveSectionState = _ActiveSection(db, AttemptRecord)
            if not NextActiveSectionState:
                break
            _AdvanceOrFinalize(db, AttemptRecord, NextActiveSectionState, NowUtc, Auto=True)

        ReconciledAttemptIds.append(AttemptRecord.id)

    db.commit()
    return {"reconciledCount": len(ReconciledAttemptIds), "attemptIds": ReconciledAttemptIds}
