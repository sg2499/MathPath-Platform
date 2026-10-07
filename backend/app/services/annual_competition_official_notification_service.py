"""Annual Competition -- "your official paper is assigned" notifications.

2026-10-07 (Shailesh): "as long as a student is getting assigned a paper they
should get notified and the redirection should be accurate ... how it's
getting assigned shouldn't matter." Before this, the OFFICIAL flow sent no
notification at all (see annual_competition_practice_notification_service.py's
own module docstring -- only the practice bank did).

One rule, applied everywhere a student can end up with a level:

    A student is notified the first moment BOTH are true:
      * the event is SCHEDULED (or LIVE), and
      * the student has an active assignment (a level) in it.

Why SCHEDULED and not "any time a level is written": a DRAFT event is
deliberately invisible to students (ListStudentCompetitionEventAssignments
filters it out), so a notification sent while the event is still DRAFT would
land the student on a page with no paper on it. Levels written while DRAFT
are therefore notified when the event is switched to SCHEDULED instead
(NotifyAnnualCompetitionOfficialAssignmentsForEvent, called from
UpdateCompetitionEvent). Nobody who is assigned is ever missed, and nobody is
sent to an empty page.

How "first moment" is remembered: CompetitionEventAssignment.notified_level_code
holds the level the student was last told about. That makes every call here
idempotent, so the three write paths (assignment engine, single Apply, bulk
Set Level) and the DRAFT -> SCHEDULED switch can all simply call in without
coordinating with each other:

  * notified_level_code is NULL            -> "Annual Competition Paper Assigned"
  * notified_level_code == assigned level  -> nothing (already told)
  * notified_level_code != assigned level  -> "Your Annual Competition Level Has
                                              Changed" (their paper and slot
                                              change with it)

Students only, by Shailesh's own description of this request (the practice
bank's assignment notification also goes to the teacher and other admins;
this one deliberately does not).

Own category ANNUAL_COMPETITION_OFFICIAL so NotificationsBell.tsx can route it
to the Official tab on its own, without touching the PRACTICE matchers. The
metadata key is `assignedLevelCode`, never `levelCode`: the bell forwards a
`levelCode` metadata value as a query parameter, which the student page reads
as "expand this level's PRACTICE block".
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models import (
    CompetitionEvent,
    CompetitionEventAssignment,
    CompetitionEventResult,
    CompetitionEventSlot,
    Student,
    User,
)
from app.services.annual_competition_paper_registry import FormatCompetitionLevelLabel
from app.services.notification_service import CreateNotification

ANNUAL_COMPETITION_OFFICIAL_CATEGORY = "ANNUAL_COMPETITION_OFFICIAL"
ANNUAL_OFFICIAL_ASSIGNED_TYPE = "ANNUAL_OFFICIAL_ASSIGNED"
ANNUAL_OFFICIAL_LEVEL_CHANGED_TYPE = "ANNUAL_OFFICIAL_LEVEL_CHANGED"
ANNUAL_OFFICIAL_RESULT_RELEASED_TYPE = "ANNUAL_OFFICIAL_RESULT_RELEASED"

# The event statuses in which a student can both see the event and still sit
# it (CompetitionEvent.status: DRAFT -> SCHEDULED -> LIVE -> COMPLETED). DRAFT
# is hidden from students; COMPLETED blocks every attempt.
NOTIFIABLE_EVENT_STATUSES = frozenset({"SCHEDULED", "LIVE"})

STUDENT_TARGET_ROUTE = "/student/competition/annual"
STUDENT_TARGET_TAB = "OFFICIAL"

# Slot modes whose students are in India, so a slot time can be written in
# India time. ONLINE_INTL students are in other time zones: their message
# sends them to the page, which shows the slot in their own local time.
_INDIA_SLOT_MODES = {"OFFLINE", "ONLINE_INDIA"}
_INDIA_TIMEZONE = ZoneInfo("Asia/Kolkata")
_INSTRUCTIONS_SENTENCE = "Instructions open 10 minutes before your slot."


def _SlotSentence(SlotRecord: CompetitionEventSlot | None) -> str:
    """ "Your slot: 7 Oct 2026, 11:30 AM IST. Instructions open ..." or, when
    the student has no slot or is outside India, a sentence that does not
    state a time it cannot state correctly."""
    if not SlotRecord or not SlotRecord.scheduled_start_at:
        return "Open the Annual Competition page to see your paper."
    if str(SlotRecord.mode or "").upper() not in _INDIA_SLOT_MODES:
        return f"Open the Annual Competition page to see your slot time. {_INSTRUCTIONS_SENTENCE}"
    StartAt = SlotRecord.scheduled_start_at
    if StartAt.tzinfo is None:
        StartAt = StartAt.replace(tzinfo=timezone.utc)
    Local = StartAt.astimezone(_INDIA_TIMEZONE)
    Hour = Local.hour % 12 or 12
    Meridiem = "AM" if Local.hour < 12 else "PM"
    When = f"{Local.day} {Local.strftime('%b %Y')}, {Hour}:{Local.minute:02d} {Meridiem} IST"
    return f"Your slot: {When}. {_INSTRUCTIONS_SENTENCE}"


def NotifyAnnualCompetitionOfficialAssignment(
    db: Session,
    *,
    AssignmentRecord: CompetitionEventAssignment,
    EventRecord: CompetitionEvent | None = None,
    ActorUserId: str | None = None,
) -> str | None:
    """Notifies one student about their official assignment if (and only if)
    they have not already been told about this exact level for this event.

    Returns "ASSIGNED", "LEVEL_CHANGED", or None when nothing was sent.
    Flushes but never commits: the caller owns the transaction."""
    if not AssignmentRecord or not AssignmentRecord.is_active:
        return None
    EventRecord = EventRecord or db.get(CompetitionEvent, AssignmentRecord.event_id)
    if not EventRecord or EventRecord.status not in NOTIFIABLE_EVENT_STATUSES:
        return None

    AssignedLevelCode = AssignmentRecord.assigned_level_code
    if not AssignedLevelCode or AssignmentRecord.notified_level_code == AssignedLevelCode:
        return None

    StudentRecord = db.get(Student, AssignmentRecord.student_id)
    StudentUser = db.get(User, StudentRecord.user_id) if StudentRecord and StudentRecord.user_id else None
    if not StudentUser:
        # Nobody to deliver to. Left un-marked on purpose, so a later call
        # (once the student has a login) still notifies them.
        return None

    IsLevelChange = AssignmentRecord.notified_level_code is not None
    LevelLabel = FormatCompetitionLevelLabel(AssignedLevelCode)
    SlotRecord = db.get(CompetitionEventSlot, AssignmentRecord.slot_id) if AssignmentRecord.slot_id else None
    SlotSentence = _SlotSentence(SlotRecord)

    if IsLevelChange:
        Kind = "LEVEL_CHANGED"
        Type = ANNUAL_OFFICIAL_LEVEL_CHANGED_TYPE
        Title = "Your Annual Competition Level Has Changed"
        Message = f"Your paper for {EventRecord.name} is now {LevelLabel}. {SlotSentence}"
    else:
        Kind = "ASSIGNED"
        Type = ANNUAL_OFFICIAL_ASSIGNED_TYPE
        Title = "Annual Competition Paper Assigned"
        Message = f"Your {LevelLabel} paper for {EventRecord.name} is assigned. {SlotSentence}"

    Metadata: dict[str, Any] = {
        "event": Type,
        "eventId": EventRecord.id,
        "eventName": EventRecord.name,
        "assignedLevelCode": AssignedLevelCode,
        "previousLevelCode": AssignmentRecord.notified_level_code,
        "slotId": AssignmentRecord.slot_id,
        "targetAction": "open-official-competition",
    }

    CreateNotification(
        db,
        recipient_user_id=StudentUser.id,
        recipient_role="STUDENT",
        actor_user_id=ActorUserId,
        actor_role="ADMIN" if ActorUserId else None,
        student_id=StudentRecord.id,
        type=Type,
        category=ANNUAL_COMPETITION_OFFICIAL_CATEGORY,
        title=Title,
        message=Message,
        target_route=STUDENT_TARGET_ROUTE,
        target_tab=STUDENT_TARGET_TAB,
        metadata=Metadata,
    )

    AssignmentRecord.notified_level_code = AssignedLevelCode
    AssignmentRecord.notified_at = datetime.now(timezone.utc)
    db.flush()
    return Kind


def NotifyAnnualCompetitionOfficialAssignmentsForStudents(
    db: Session,
    *,
    EventId: str,
    StudentIds: list[str] | None = None,
    ActorUserId: str | None = None,
) -> int:
    """Notifies every not-yet-told student with an active assignment in this
    event (optionally narrowed to StudentIds). Returns how many notifications
    were sent. Safe to call at any time and any number of times: an event
    that is not SCHEDULED, or a student already told, sends nothing."""
    EventRecord = db.get(CompetitionEvent, EventId)
    if not EventRecord or EventRecord.status not in NOTIFIABLE_EVENT_STATUSES:
        return 0
    Query = db.query(CompetitionEventAssignment).filter(
        CompetitionEventAssignment.event_id == EventId,
        CompetitionEventAssignment.is_active == True,  # noqa: E712
    )
    if StudentIds is not None:
        if not StudentIds:
            return 0
        Query = Query.filter(CompetitionEventAssignment.student_id.in_(StudentIds))
    Sent = 0
    for AssignmentRecord in Query.all():
        if NotifyAnnualCompetitionOfficialAssignment(
            db, AssignmentRecord=AssignmentRecord, EventRecord=EventRecord, ActorUserId=ActorUserId
        ):
            Sent += 1
    return Sent


def SendAnnualCompetitionOfficialAssignmentNotifications(
    db: Session,
    *,
    EventId: str,
    StudentIds: list[str] | None = None,
    ActorUserId: str | None = None,
) -> int:
    """The entry point the write paths use, AFTER their own commit: sends,
    commits, and never raises. A notification failure must never turn an
    assignment that was really saved into an error reported to the admin
    (same separation BatchAssignAnnualCompetitionPracticePapers uses)."""
    try:
        Sent = NotifyAnnualCompetitionOfficialAssignmentsForStudents(
            db, EventId=EventId, StudentIds=StudentIds, ActorUserId=ActorUserId
        )
        db.commit()
        return Sent
    except Exception:  # noqa: BLE001 -- see docstring
        db.rollback()
        return 0


# ---------------------------------------------------------------------------
# "Your result is out" (2026-10-07, Shailesh)
#
# "once the results are published that should also trigger a notification
# stating that the results have been published without mentioning the details
# about the result, keep that part a suspense and redirect the student to the
# result page where they go in and see for themselves."
#
# Sent from ReleaseCompetitionEventResults, and only for results that call
# has JUST released (is_released flips from False to True exactly once), so
# releasing a second level, or pressing Release again, never repeats it for a
# student already told. Students only. Nothing about the result is in the
# title, the message or the metadata -- no score, rank, accuracy or time --
# so nothing leaks through the bell before the student opens their own page.
# ---------------------------------------------------------------------------
def _ResultReleasedTargetRoute(AttemptId: str) -> str:
    return f"/student/competition/annual/attempt/{AttemptId}"


def NotifyAnnualCompetitionResultsReleased(
    db: Session,
    *,
    ResultIds: list[str],
    ActorUserId: str | None = None,
) -> int:
    """One notification per released OFFICIAL result in ResultIds. Returns how
    many were sent. Flushes but never commits: the caller owns the
    transaction."""
    if not ResultIds:
        return 0
    Results = db.query(CompetitionEventResult).filter(CompetitionEventResult.id.in_(ResultIds)).all()
    EventNameById: dict[str, str] = {}
    Sent = 0
    for ResultRecord in Results:
        if ResultRecord.attempt_type != "OFFICIAL" or not ResultRecord.is_released or not ResultRecord.attempt_id:
            continue
        StudentRecord = db.get(Student, ResultRecord.student_id)
        StudentUser = db.get(User, StudentRecord.user_id) if StudentRecord and StudentRecord.user_id else None
        if not StudentUser:
            continue
        if ResultRecord.event_id not in EventNameById:
            EventRecord = db.get(CompetitionEvent, ResultRecord.event_id) if ResultRecord.event_id else None
            EventNameById[ResultRecord.event_id] = EventRecord.name if EventRecord else "the Annual Competition"
        EventName = EventNameById[ResultRecord.event_id]
        CreateNotification(
            db,
            recipient_user_id=StudentUser.id,
            recipient_role="STUDENT",
            actor_user_id=ActorUserId,
            actor_role="ADMIN" if ActorUserId else None,
            student_id=StudentRecord.id,
            attempt_id=ResultRecord.attempt_id,
            type=ANNUAL_OFFICIAL_RESULT_RELEASED_TYPE,
            category=ANNUAL_COMPETITION_OFFICIAL_CATEGORY,
            title="Your Annual Competition Result Is Out",
            message=f"Results for {EventName} have been published. Open yours to see how you did.",
            target_route=_ResultReleasedTargetRoute(ResultRecord.attempt_id),
            metadata={
                "event": ANNUAL_OFFICIAL_RESULT_RELEASED_TYPE,
                "eventId": ResultRecord.event_id,
                "eventName": EventName,
                "attemptId": ResultRecord.attempt_id,
                "targetAction": "open-official-result",
            },
        )
        Sent += 1
    db.flush()
    return Sent


def SendAnnualCompetitionResultsReleasedNotifications(
    db: Session,
    *,
    ResultIds: list[str],
    ActorUserId: str | None = None,
) -> int:
    """The entry point ReleaseCompetitionEventResults uses AFTER its own
    commit: sends, commits, and never raises. A notification failure must
    never turn a release that really happened into an error."""
    try:
        Sent = NotifyAnnualCompetitionResultsReleased(db, ResultIds=ResultIds, ActorUserId=ActorUserId)
        db.commit()
        return Sent
    except Exception:  # noqa: BLE001 -- see docstring
        db.rollback()
        return 0
