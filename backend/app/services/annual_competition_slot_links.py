"""Annual Competition -- which slot each student sits in.

2026-10-08 (Shailesh): "so on updating this i would be able to assign
different slots to different students for the same level right?" Online
students of the same level sit on different days (IM-4: one on 9 Oct
9:30 PM, one on 11 Oct 8:00 PM), so a slot can no longer be worked out
from the level alone.

The rules, in one place, used by every write path:

  * An admin can choose a slot for one student
    (CompetitionEventAssignment.slot_chosen_by_admin = True). The choice is
    kept while that slot is active and still lists the student's level.
  * Otherwise the slot is worked out from the level: exactly one active
    slot lists the level -> that slot; none -> no slot (start any time,
    as before); two or more -> no slot, and the student is "waiting for a
    slot": they cannot start until one is chosen (SlotIsPendingForAssignment,
    checked by the start gate). Before this, two slots on one level left the
    student with no slot and no start-time lock at all.
  * Every slot create/edit/remove re-links the event's students straight
    away (RelinkEventAssignmentSlots), so ticking a level on a slot no
    longer needs every student re-saved.
  * When no active slot lists the level any more, a student who already has
    a slot keeps it (its start time still holds), so deleting a slot never
    silently lets students start at any time.

Only depends on the models, so the studio, assignment and attempt services
can all import it without an import cycle.
"""
from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.models import CompetitionEventAssignment, CompetitionEventSlot


def SlotLevelCodes(SlotRecord: CompetitionEventSlot) -> list[str]:
    try:
        LevelCodes = json.loads(SlotRecord.applicable_level_codes_json or "[]")
    except Exception:
        return []
    return [str(Code) for Code in LevelCodes] if isinstance(LevelCodes, list) else []


def ActiveSlotsForLevel(db: Session, EventId: str, LevelCode: str | None) -> list[CompetitionEventSlot]:
    if not LevelCode:
        return []
    Slots = (
        db.query(CompetitionEventSlot)
        .filter(CompetitionEventSlot.event_id == EventId, CompetitionEventSlot.is_active == True)  # noqa: E712
        .order_by(CompetitionEventSlot.scheduled_start_at.asc())
        .all()
    )
    return [SlotRecord for SlotRecord in Slots if LevelCode in SlotLevelCodes(SlotRecord)]


def AutomaticSlotIdForLevel(db: Session, EventId: str, LevelCode: str | None) -> str | None:
    """Exactly one active slot lists the level -> that slot, else None."""
    Matching = ActiveSlotsForLevel(db, EventId, LevelCode)
    return Matching[0].id if len(Matching) == 1 else None


def SlotFitsAssignment(db: Session, SlotId: str | None, EventId: str, LevelCode: str | None) -> bool:
    if not SlotId or not LevelCode:
        return False
    SlotRecord = db.get(CompetitionEventSlot, SlotId)
    return bool(
        SlotRecord
        and SlotRecord.is_active
        and SlotRecord.event_id == EventId
        and LevelCode in SlotLevelCodes(SlotRecord)
    )


def ApplySlotRules(db: Session, AssignmentRecord: CompetitionEventAssignment, *, LevelChanged: bool = False) -> bool:
    """Sets slot_id (and clears a chosen slot that no longer fits) by the
    rules in the module docstring. Returns True when slot_id changed.
    Never commits."""
    Before = AssignmentRecord.slot_id
    if AssignmentRecord.slot_chosen_by_admin and SlotFitsAssignment(
        db, AssignmentRecord.slot_id, AssignmentRecord.event_id, AssignmentRecord.assigned_level_code
    ):
        return False
    Matching = ActiveSlotsForLevel(db, AssignmentRecord.event_id, AssignmentRecord.assigned_level_code)
    if not Matching and AssignmentRecord.slot_id and not LevelChanged:
        # No active slot lists the level any more (its slot was deleted, or
        # the level was unticked). Keep the slot the student already has, so
        # its start time still holds: removing a slot must never silently
        # let students start at any time. Linked again as soon as a slot
        # lists the level. Not when the student's level itself just
        # changed: the old slot belongs to the old level.
        return False
    AssignmentRecord.slot_chosen_by_admin = False
    AssignmentRecord.slot_id = Matching[0].id if len(Matching) == 1 else None
    return AssignmentRecord.slot_id != Before


def SlotIsPendingForAssignment(db: Session, AssignmentRecord: CompetitionEventAssignment) -> bool:
    """No slot linked, but two or more active slots list the level: the
    admin has to choose one before this student can start."""
    if AssignmentRecord.slot_id:
        return False
    return len(ActiveSlotsForLevel(db, AssignmentRecord.event_id, AssignmentRecord.assigned_level_code)) >= 2


def RelinkEventAssignmentSlots(db: Session, EventId: str) -> list[str]:
    """Applies the slot rules to every active assignment in the event.
    Returns the student ids whose slot changed. Never commits."""
    Changed: list[str] = []
    Assignments = (
        db.query(CompetitionEventAssignment)
        .filter(CompetitionEventAssignment.event_id == EventId, CompetitionEventAssignment.is_active == True)  # noqa: E712
        .all()
    )
    for AssignmentRecord in Assignments:
        if ApplySlotRules(db, AssignmentRecord):
            Changed.append(AssignmentRecord.student_id)
    return Changed
