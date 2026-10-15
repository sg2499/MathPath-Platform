"""Annual Competition practice papers -- one daily notice for admin and
teachers (2026-10-14, Phase 2 part 4; Shailesh chose "Option 1").

Before this, every submitted practice paper sent each admin and the
student's teacher a separate "<Student> Submitted A Practice Paper" notice
(1,685 of admin's 2,767 unread on 14 Oct). Now each person gets ONE notice
per day (India time) that is updated as papers come in:

    "Annual Practice: 23 Students, 41 Papers (14 Oct)"

Its metadata holds the full list -- student, paper, score, accuracy, time --
which the bell shows when the notice is opened; each name opens that
student's practice results, and "View All" opens the Results tab filtered
to that day. A new paper marks the notice unread again and moves it to the
top. The student's own "Practice Paper Submitted" notice is unchanged.

Demo accounts (app/services/demo_students.py) go into a separate digest
whose student_id is a demo account, so it shows only while "Show Demo
Accounts" is on.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Notification
from app.services.notification_service import _json_dumps, _json_loads

DIGEST_TYPE = "ANNUAL_PRACTICE_DAILY_DIGEST"
DIGEST_CATEGORY = "ANNUAL_COMPETITION_PRACTICE"
_IST = timezone(timedelta(hours=5, minutes=30))


def _Aware(Value: datetime | None) -> datetime:
    if Value is None:
        return datetime.now(timezone.utc)
    return Value if Value.tzinfo else Value.replace(tzinfo=timezone.utc)


def _DayLabel(Day: str) -> str:
    Parsed = datetime.strptime(Day, "%Y-%m-%d")
    return f"{Parsed.day} {Parsed.strftime('%b')}"


def DigestId(RecipientUserId: str, Day: str, IsDemo: bool) -> str:
    return f"apd-{Day}-{RecipientUserId}" + ("-demo" if IsDemo else "")


def _Summary(Entries: list[dict[str, Any]], Day: str) -> tuple[str, str, int, int]:
    Students = {Entry.get("studentId") or Entry.get("studentCode") for Entry in Entries}
    StudentCount, PaperCount = len(Students), len(Entries)
    Title = (
        f"Annual Practice: {StudentCount} Student{'' if StudentCount == 1 else 's'}, "
        f"{PaperCount} Paper{'' if PaperCount == 1 else 's'} ({_DayLabel(Day)})"
    )
    Latest = Entries[-1]
    Message = (
        f"Latest: {Latest.get('studentName')}, {Latest.get('paperLabel')} ({Latest.get('levelLabel')}), "
        f"{Latest.get('score')} ({Latest.get('accuracy')}%). Open to see every paper."
    )
    return Title, Message, StudentCount, PaperCount


def AddToDailyPracticeDigest(
    db: Session,
    *,
    recipient_user_id: str,
    recipient_role: str,
    entry: dict[str, Any],
    submitted_at: datetime | None,
    is_demo: bool,
    target_route: str,
) -> Notification:
    """Add one submitted paper to the recipient's notice for that day,
    creating the notice the first time. Safe to call twice for the same
    attempt (the paper is listed once)."""
    Day = _Aware(submitted_at).astimezone(_IST).strftime("%Y-%m-%d")
    Id = DigestId(recipient_user_id, Day, is_demo)
    Now = datetime.now(timezone.utc)

    Row = db.query(Notification).filter(Notification.id == Id).with_for_update().first()
    if Row is None:
        Title, Message, StudentCount, PaperCount = _Summary([entry], Day)
        Fresh = Notification(
            id=Id,
            recipient_user_id=recipient_user_id,
            recipient_role=(recipient_role or "").upper(),
            actor_role="STUDENT",
            # A digest covers many students; only a demo digest names one, so
            # the "Show Demo Accounts" switch can hide it.
            student_id=entry.get("studentId") if is_demo else None,
            type=DIGEST_TYPE,
            category=DIGEST_CATEGORY,
            title=Title,
            message=Message,
            target_route=target_route,
            target_tab="PRACTICE",
            target_sub_tab="RESULTS",
            color_variant="INFO",
            metadata_json=_json_dumps({
                "event": DIGEST_TYPE,
                "day": Day,
                "dayLabel": _DayLabel(Day),
                "studentCount": StudentCount,
                "paperCount": PaperCount,
                "entries": [entry],
                "targetAction": "annual-practice-digest",
            }),
        )
        try:
            with db.begin_nested():
                db.add(Fresh)
                db.flush()
            return Fresh
        except IntegrityError:
            # Another submission created today's notice at the same moment.
            Row = db.query(Notification).filter(Notification.id == Id).with_for_update().first()
            if Row is None:
                raise

    Metadata = _json_loads(Row.metadata_json) or {}
    Entries = list(Metadata.get("entries") or [])
    if not any(Existing.get("attemptId") == entry.get("attemptId") for Existing in Entries):
        Entries.append(entry)
    Title, Message, StudentCount, PaperCount = _Summary(Entries, Day)
    Metadata.update({"entries": Entries, "studentCount": StudentCount, "paperCount": PaperCount, "day": Day, "dayLabel": _DayLabel(Day)})
    Row.metadata_json = _json_dumps(Metadata)
    Row.title = Title
    Row.message = Message
    # New papers bring the notice back to the top, unread.
    Row.is_read = False
    Row.read_at = None
    Row.created_at = Now
    db.flush()
    return Row
