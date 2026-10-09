"""Payments revamp R4 (2026-10-09, Shailesh): follow-ups -- getting money in.

  * The follow-up list is every student who owes money (the Dues report),
    most urgent first: overdue amount weighted by how many days overdue.
  * Per student: log a contact (call, in person, message, other) with a note
    and an optional promise-to-pay date; add notes; copy a reminder; send it
    in the app (under the student's bell, while the Fees tab is on). Every
    entry is kept (payment_follow_ups), never edited or deleted.
  * A promise is "kept" once a payment is recorded after it was made, "due
    today" on its date, and "missed" after its date with nothing paid.
  * Three reminder templates the admin words (Gentle, Firm, Final), filled
    per student. The list suggests one from how overdue the student is.
  * Bulk: remind in the app, or log one contact, for many students at once.
    Nobody is reminded in the app twice within 24 hours.
  * No WhatsApp: it comes with the official integration, built last.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import PaymentFollowUp, PaymentReceipt, PaymentReminderTemplate, Student, User
from app.services.payments.audit import WritePaymentAudit
from app.services.payments.money import FormatIndianRupees

CHANNELS = {"CALL": "Call", "IN_PERSON": "In person", "MESSAGE": "Message", "OTHER": "Other", "IN_APP": "In-app reminder"}
CONTACT_CHANNELS = ("CALL", "IN_PERSON", "MESSAGE", "OTHER")
TEMPLATE_KEYS = ("GENTLE", "FIRM", "FINAL")
TEMPLATE_TITLES = {"GENTLE": "Gentle", "FIRM": "Firm", "FINAL": "Final"}
PLACEHOLDERS = {
    "parent": "Parent's name (or \"Parent\")",
    "student": "Student's name",
    "student_id": "Student ID",
    "amount_due": "Total due",
    "overdue": "Amount overdue",
    "oldest_due_date": "Oldest due date",
    "invoices": "One line per unpaid invoice",
    "pay_link": "The parent pay link (the line is left out when there is none)",
    "business": "Your business name",
}
DEFAULT_TEMPLATES = {
    "GENTLE": (
        "Dear {parent},\n\n"
        "This is a gentle reminder from {business} that {amount_due} is due for {student} ({student_id}):\n"
        "{invoices}\n\n"
        "Pay online: {pay_link}\n"
        "Please pay at the centre or let us know if you have already paid. Thank you."
    ),
    "FIRM": (
        "Dear {parent},\n\n"
        "Our records show {overdue} is overdue for {student} ({student_id}), the oldest since {oldest_due_date}:\n"
        "{invoices}\n\n"
        "Pay online: {pay_link}\n"
        "Please clear the dues this week, or call us if there is a problem. Thank you, {business}."
    ),
    "FINAL": (
        "Dear {parent},\n\n"
        "This is a final reminder: {overdue} for {student} ({student_id}) has been overdue since {oldest_due_date}:\n"
        "{invoices}\n\n"
        "Pay online: {pay_link}\n"
        "Please pay within 3 days or speak to us. Classes may be paused for long-pending dues. {business}."
    ),
}
REMIND_GAP = timedelta(hours=24)
RECENT_DAYS = 2
MAX_BULK = 500


def _Today() -> date:
    from app.services.payments.invoices_service import TodayInIndia

    return TodayInIndia()


def _Now() -> datetime:
    return datetime.now(timezone.utc)


def _IndiaDay(Value: datetime) -> date:
    from app.services.payments.invoices_service import INDIA

    return Value.astimezone(INDIA).date()


def _Aware(Value: datetime | None) -> datetime | None:
    if not Value:
        return None
    return Value if Value.tzinfo else Value.replace(tzinfo=timezone.utc)


def _Iso(Value: datetime | None) -> str | None:
    Value = _Aware(Value)
    return Value.isoformat() if Value else None


def _Money(Paise: int) -> dict[str, Any]:
    return {"paise": int(Paise), "display": FormatIndianRupees(int(Paise))}


def _Clean(Value: Any, Limit: int) -> str | None:
    Text = str(Value or "").strip()
    Text = re.sub(r"[ \t]+", " ", Text)
    return Text[:Limit] or None


def SuggestedTemplate(MaxDaysOverdue: int) -> str:
    if MaxDaysOverdue > 60:
        return "FINAL"
    if MaxDaysOverdue > 30:
        return "FIRM"
    return "GENTLE"


# ----------------------------------------------------------------------------
# Templates
# ----------------------------------------------------------------------------

def EnsureTemplates(db: Session) -> dict[str, PaymentReminderTemplate]:
    Rows = {Row.key: Row for Row in db.query(PaymentReminderTemplate).all()}
    for Key in TEMPLATE_KEYS:
        if Key not in Rows:
            Rows[Key] = PaymentReminderTemplate(key=Key, body=DEFAULT_TEMPLATES[Key])
            db.add(Rows[Key])
    db.flush()
    return Rows


def ListTemplates(db: Session) -> dict[str, Any]:
    Rows = EnsureTemplates(db)
    return {
        "templates": [
            {"key": Key, "title": TEMPLATE_TITLES[Key], "body": Rows[Key].body, "isDefault": Rows[Key].body == DEFAULT_TEMPLATES[Key], "updatedAt": _Iso(Rows[Key].updated_at)}
            for Key in TEMPLATE_KEYS
        ],
        "placeholders": [{"key": Key, "label": Label} for Key, Label in PLACEHOLDERS.items()],
        "suggestion": "Gentle up to 30 days overdue, Firm for 31–60 days, Final after 60 days.",
    }


def _TemplateKey(Value: Any) -> str:
    Key = str(Value or "").upper()
    if Key not in TEMPLATE_KEYS:
        api_error(422, "TEMPLATE_INVALID", "Choose Gentle, Firm or Final.")
    return Key


def UpdateTemplate(db: Session, *, Key: Any, Body: Any, Actor: User | None) -> dict[str, Any]:
    TemplateKey = _TemplateKey(Key)
    Text = str(Body or "").replace("\r\n", "\n").strip()
    if not Text:
        api_error(422, "TEMPLATE_EMPTY", "Write the reminder message.")
    if len(Text) > 1500:
        api_error(422, "TEMPLATE_TOO_LONG", "Keep the reminder under 1,500 characters.")
    Unknown = sorted({Name for Name in re.findall(r"\{([a-z_]+)\}", Text) if Name not in PLACEHOLDERS})
    if Unknown:
        api_error(422, "TEMPLATE_UNKNOWN_PLACEHOLDER", f"Unknown placeholder: {', '.join('{' + Name + '}' for Name in Unknown)}. Use the ones listed under the box.")
    Rows = EnsureTemplates(db)
    Before = Rows[TemplateKey].body
    Rows[TemplateKey].body = Text
    Rows[TemplateKey].updated_by_user_id = Actor.id if Actor else None
    Rows[TemplateKey].updated_at = _Now()
    WritePaymentAudit(db, EntityType="REMINDER_TEMPLATE", EntityId=TemplateKey, Action="UPDATE", Actor=Actor, Before={"body": Before}, After={"body": Text})
    db.commit()
    return ListTemplates(db)


def ResetTemplate(db: Session, *, Key: Any, Actor: User | None) -> dict[str, Any]:
    return UpdateTemplate(db, Key=Key, Body=DEFAULT_TEMPLATES[_TemplateKey(Key)], Actor=Actor)


def _PayLinkUrl(db: Session, StudentId: str, Origin: str | None) -> str | None:
    from app.services.payments.online_service import CurrentPayLink

    Link = CurrentPayLink(db, StudentId)
    if not Link or not Origin:
        return None
    return f"{Origin.rstrip('/')}/pay/{Link.token}"


def _CleanOrigin(Value: Any) -> str | None:
    Text = str(Value or "").strip().rstrip("/")
    return Text if re.fullmatch(r"https?://[A-Za-z0-9.\-]+(:\d{1,5})?", Text) else None


def RenderReminder(db: Session, *, Row: dict[str, Any], TemplateKey: str, Origin: str | None, InApp: bool = False) -> str:
    """Fill a template for one student of the follow-up list (a Dues row)."""
    from app.services.payments.invoice_pdf import _FormatDate
    from app.services.payments.invoices_service import _BusinessSnapshot

    Body = EnsureTemplates(db)[TemplateKey].body
    Business = _BusinessSnapshot(db)
    Lines = []
    for Invoice in Row["invoices"]:
        Due = f", due {_FormatDate(date.fromisoformat(Invoice['dueDate']))}" if Invoice.get("dueDate") else ""
        Lines.append(f"• {Invoice['feeName']}{' (' + Invoice['periodLabel'] + ')' if Invoice.get('periodLabel') else ''}: {Invoice['balanceDisplay']}{Due}")
    PayLink = _PayLinkUrl(db, Row["studentId"], Origin)
    Values = {
        "parent": Row.get("parentName") or "Parent",
        "student": Row["studentName"],
        "student_id": Row["studentCode"],
        "amount_due": Row["dueDisplay"],
        "overdue": Row["overdueDisplay"] if Row.get("overduePaise") else Row["dueDisplay"],
        "oldest_due_date": _FormatDate(date.fromisoformat(Row["oldestDueDate"])) if Row.get("oldestDueDate") else "",
        "invoices": "\n".join(Lines),
        "pay_link": PayLink or ("the Fees page in the MathPath app" if InApp else ""),
        "business": Business.get("brandName") or Business.get("legalName") or "MathPath",
    }
    Out = []
    for Line in Body.split("\n"):
        if "{pay_link}" in Line and not Values["pay_link"]:
            continue
        Out.append(re.sub(r"\{([a-z_]+)\}", lambda Match: str(Values.get(Match.group(1), Match.group(0))), Line))
    return re.sub(r"\n{3,}", "\n\n", "\n".join(Out)).strip()


# ----------------------------------------------------------------------------
# State per student
# ----------------------------------------------------------------------------

def _EntryPayload(Row: PaymentFollowUp) -> dict[str, Any]:
    return {
        "id": Row.id,
        "kind": Row.kind,
        "channel": Row.channel,
        "channelLabel": CHANNELS.get(Row.channel or "", None),
        "note": Row.note,
        "promiseDate": Row.promise_date.isoformat() if Row.promise_date else None,
        "templateKey": Row.template_key,
        "templateTitle": TEMPLATE_TITLES.get(Row.template_key or "", None),
        "byName": Row.created_by_name,
        "at": _Iso(Row.created_at),
    }


def _States(db: Session, StudentIds: list[str]) -> dict[str, dict[str, Any]]:
    if not StudentIds:
        return {}
    Today = _Today()
    Entries: dict[str, list[PaymentFollowUp]] = {}
    for Row in db.query(PaymentFollowUp).filter(PaymentFollowUp.student_id.in_(StudentIds)).order_by(PaymentFollowUp.created_at.desc(), PaymentFollowUp.id.desc()).all():
        Entries.setdefault(Row.student_id, []).append(Row)
    Payments: dict[str, list[PaymentReceipt]] = {}
    for Payment in db.query(PaymentReceipt).filter(PaymentReceipt.student_id.in_(StudentIds), PaymentReceipt.status == "RECORDED").all():
        Payments.setdefault(Payment.student_id, []).append(Payment)

    def _PaidSince(StudentId: str, Since: datetime) -> bool:
        """A payment dated after the day of the promise, or on that day and
        recorded after it."""
        SinceDay = _IndiaDay(Since)
        for Payment in Payments.get(StudentId, []):
            if Payment.payment_date > SinceDay:
                return True
            if Payment.payment_date == SinceDay and Payment.created_at and _Aware(Payment.created_at) > Since:
                return True
        return False

    Result = {}
    for StudentId in StudentIds:
        Rows = Entries.get(StudentId, [])
        Contacts = [Row for Row in Rows if Row.kind in ("CONTACT", "REMINDER")]
        Last = Contacts[0] if Contacts else None
        LastInApp = next((Row for Row in Rows if Row.kind == "REMINDER" and Row.channel == "IN_APP"), None)
        PromiseRow = next((Row for Row in Rows if Row.promise_date), None)
        Promise = None
        if PromiseRow:
            Kept = _PaidSince(StudentId, _Aware(PromiseRow.created_at))
            State = "KEPT" if Kept else ("MISSED" if PromiseRow.promise_date < Today else "TODAY" if PromiseRow.promise_date == Today else "UPCOMING")
            Promise = {"date": PromiseRow.promise_date.isoformat(), "state": State, "madeAt": _Iso(PromiseRow.created_at), "byName": PromiseRow.created_by_name}
        DaysSince = (Today - _IndiaDay(_Aware(Last.created_at))).days if Last else None
        Result[StudentId] = {
            "lastContact": _EntryPayload(Last) if Last else None,
            "daysSinceContact": DaysSince,
            "lastInAppAt": _Iso(LastInApp.created_at) if LastInApp else None,
            "remindedRecently": bool(LastInApp and _Now() - _Aware(LastInApp.created_at) < REMIND_GAP),
            "promise": Promise,
            "entryCount": len(Rows),
        }
    return Result


def _DuesRows(db: Session, Search: str | None = None) -> list[dict[str, Any]]:
    from app.services.payments.reports_service import DuesReport

    return DuesReport(db, Filters={"search": Search or None})["students"]


# ----------------------------------------------------------------------------
# The list
# ----------------------------------------------------------------------------

VIEWS = {
    "ALL": "Everyone who owes",
    "OVERDUE": "Overdue",
    "TODAY": "Promised for today",
    "MISSED": "Promise missed",
    "NEVER": "Never contacted",
    "RECENT": "Contacted recently",
}


def _InView(View: str, Row: dict[str, Any]) -> bool:
    State = Row["followUp"]
    Promise = State["promise"]
    if View == "OVERDUE":
        return Row["overduePaise"] > 0
    if View == "TODAY":
        return bool(Promise and Promise["state"] == "TODAY")
    if View == "MISSED":
        return bool(Promise and Promise["state"] == "MISSED")
    if View == "NEVER":
        return State["lastContact"] is None
    if View == "RECENT":
        return State["daysSinceContact"] is not None and State["daysSinceContact"] < RECENT_DAYS
    return True


def FollowUps(db: Session, *, View: Any = None, Search: Any = None) -> dict[str, Any]:
    ViewKey = str(View or "ALL").upper()
    if ViewKey not in VIEWS:
        ViewKey = "ALL"
    Rows = _DuesRows(db, _Clean(Search, 80))
    States = _States(db, [Row["studentId"] for Row in Rows])
    for Row in Rows:
        Row["followUp"] = States[Row["studentId"]]
        Row["suggestedTemplate"] = SuggestedTemplate(Row["maxDaysOverdue"])
        # Most urgent first: overdue rupees weighted by days overdue.
        Row["priority"] = (Row["overduePaise"] / 100) * max(Row["maxDaysOverdue"], 0)
    Rows.sort(key=lambda Row: (-Row["priority"], -Row["duePaise"], (Row["studentName"] or "").lower()))
    Counts = {Key: sum(1 for Row in Rows if _InView(Key, Row)) for Key in VIEWS}
    Shown = [Row for Row in Rows if _InView(ViewKey, Row)]
    from app.services.payments.online_service import StudentFeesEnabled

    return {
        "asOf": _Today().isoformat(),
        "view": ViewKey,
        "views": [{"key": Key, "label": Label, "count": Counts[Key]} for Key, Label in VIEWS.items()],
        "inAppAvailable": StudentFeesEnabled(db),
        "total": _Money(sum(Row["duePaise"] for Row in Shown)),
        "overdue": _Money(sum(Row["overduePaise"] for Row in Shown)),
        "students": Shown,
    }


def StudentFollowUp(db: Session, StudentId: str) -> dict[str, Any]:
    StudentRow = db.get(Student, StudentId)
    if not StudentRow:
        api_error(404, "STUDENT_NOT_FOUND", "That student was not found.")
    Entries = db.query(PaymentFollowUp).filter(PaymentFollowUp.student_id == StudentId).order_by(PaymentFollowUp.created_at.desc(), PaymentFollowUp.id.desc()).limit(100).all()
    Due = next((Row for Row in _DuesRows(db) if Row["studentId"] == StudentId), None)
    from app.services.payments.online_service import StudentFeesEnabled

    return {
        "studentId": StudentId,
        **_States(db, [StudentId])[StudentId],
        "suggestedTemplate": SuggestedTemplate(Due["maxDaysOverdue"]) if Due else "GENTLE",
        "due": _Money(Due["duePaise"]) if Due else _Money(0),
        "overdue": _Money(Due["overduePaise"]) if Due else _Money(0),
        "mobile": Due["mobile"] if Due else (StudentRow.father_mobile or StudentRow.mother_mobile or StudentRow.parent_contact),
        "inAppAvailable": StudentFeesEnabled(db),
        "entries": [_EntryPayload(Row) for Row in Entries],
    }


def ReminderPreview(db: Session, *, StudentId: str, TemplateKey: Any, Origin: Any) -> dict[str, Any]:
    Key = _TemplateKey(TemplateKey)
    Row = next((Item for Item in _DuesRows(db) if Item["studentId"] == StudentId), None)
    if not Row:
        api_error(409, "NOTHING_DUE", "This student owes nothing, so there is nothing to remind about.")
    return {"studentId": StudentId, "templateKey": Key, "text": RenderReminder(db, Row=Row, TemplateKey=Key, Origin=_CleanOrigin(Origin)), "suggestedTemplate": SuggestedTemplate(Row["maxDaysOverdue"])}


# ----------------------------------------------------------------------------
# Writing
# ----------------------------------------------------------------------------

def _Ids(StudentIds: Any) -> list[str]:
    Ids = [Id for Id in dict.fromkeys(str(Id).strip() for Id in (StudentIds or [])) if Id]
    if not Ids:
        api_error(422, "NO_STUDENTS_SELECTED", "Choose at least one student.")
    if len(Ids) > MAX_BULK:
        api_error(422, "TOO_MANY_STUDENTS", f"Choose at most {MAX_BULK} students at a time.")
    return Ids


def _Promise(Value: Any) -> date | None:
    from app.services.payments.invoices_service import _ParseDate

    Day = _ParseDate(Value, "Promise date") if Value else None
    if Day and (Day < _Today() or Day > _Today() + timedelta(days=90)):
        api_error(422, "PROMISE_DATE_INVALID", "A promise date must be today or within the next 90 days.")
    return Day


def LogContact(db: Session, *, StudentIds: Any, Channel: Any, Note: Any, PromiseDate: Any, Actor: User | None) -> dict[str, Any]:
    Ids = _Ids(StudentIds)
    ChannelKey = str(Channel or "").upper()
    if ChannelKey not in CONTACT_CHANNELS:
        api_error(422, "CHANNEL_INVALID", "Choose how you contacted them: call, in person, message or other.")
    NoteText = _Clean(Note, 500)
    Promise = _Promise(PromiseDate)
    Found = {Row.id for Row in db.query(Student.id).filter(Student.id.in_(Ids)).all()}
    if len(Found) != len(Ids):
        api_error(404, "STUDENT_NOT_FOUND", "Some of the chosen students were not found. Refresh and try again.")
    Now = _Now()
    for Index, StudentId in enumerate(Ids):
        db.add(PaymentFollowUp(
            student_id=StudentId, kind="CONTACT", channel=ChannelKey, note=NoteText, promise_date=Promise,
            created_by_user_id=Actor.id if Actor else None, created_by_name=Actor.full_name if Actor else None,
            created_at=Now + timedelta(microseconds=Index),
        ))
    db.commit()
    return {"logged": len(Ids), "channelLabel": CHANNELS[ChannelKey], "promiseDate": Promise.isoformat() if Promise else None}


def AddNote(db: Session, *, StudentId: str, Note: Any, Actor: User | None) -> dict[str, Any]:
    NoteText = _Clean(Note, 1000)
    if not NoteText:
        api_error(422, "NOTE_REQUIRED", "Write the note.")
    if not db.get(Student, StudentId):
        api_error(404, "STUDENT_NOT_FOUND", "That student was not found.")
    db.add(PaymentFollowUp(student_id=StudentId, kind="NOTE", note=NoteText, created_by_user_id=Actor.id if Actor else None, created_by_name=Actor.full_name if Actor else None, created_at=_Now()))
    db.commit()
    return StudentFollowUp(db, StudentId)


def RemindInApp(db: Session, *, StudentIds: Any, TemplateKey: Any, Origin: Any, Actor: User | None) -> dict[str, Any]:
    from app.services.payments.online_service import NotifyStudent, StudentFeesEnabled

    Ids = _Ids(StudentIds)
    Key = _TemplateKey(TemplateKey)
    if not StudentFeesEnabled(db):
        api_error(409, "FEES_TAB_OFF", "In-app reminders need \"Show fees to students\" switched on (Payment Settings › Online Payments).")
    OriginText = _CleanOrigin(Origin)
    Dues = {Row["studentId"]: Row for Row in _DuesRows(db)}
    States = _States(db, Ids)
    Names = {Row.id: UserRow.full_name for Row, UserRow in db.query(Student, User).join(User, Student.user_id == User.id).filter(Student.id.in_(Ids)).all()}
    Sent, Skipped = [], []
    Now = _Now()
    for Index, StudentId in enumerate(Ids):
        Name = Names.get(StudentId, "A student")
        Row = Dues.get(StudentId)
        if StudentId not in Names:
            Skipped.append({"studentId": StudentId, "studentName": Name, "reason": "Student not found"})
            continue
        if not Row:
            Skipped.append({"studentId": StudentId, "studentName": Name, "reason": "Owes nothing"})
            continue
        if States[StudentId]["remindedRecently"]:
            Skipped.append({"studentId": StudentId, "studentName": Name, "reason": "Already reminded in the app in the last 24 hours"})
            continue
        Text = RenderReminder(db, Row=Row, TemplateKey=Key, Origin=OriginText, InApp=True)
        NotifyStudent(
            db, db.get(Student, StudentId), Type="FEES_REMINDER", Tone="AMBER",
            Title="Fee reminder" if Key == "GENTLE" else "Fees overdue" if Key == "FIRM" else "Final fee reminder",
            Message=Text, Metadata={"template": Key, "duePaise": Row["duePaise"]},
        )
        db.add(PaymentFollowUp(
            student_id=StudentId, kind="REMINDER", channel="IN_APP", template_key=Key, note=f"{TEMPLATE_TITLES[Key]} reminder sent in the app ({Row['dueDisplay']} due)",
            created_by_user_id=Actor.id if Actor else None, created_by_name=Actor.full_name if Actor else None,
            created_at=Now + timedelta(microseconds=Index),
        ))
        Sent.append({"studentId": StudentId, "studentName": Name})
    db.commit()
    return {"sent": len(Sent), "skipped": Skipped, "templateTitle": TEMPLATE_TITLES[Key], "students": Sent}


def HomeFollowUps(db: Session) -> dict[str, Any]:
    Rows = _DuesRows(db)
    States = _States(db, [Row["studentId"] for Row in Rows])
    Today = [Row for Row in Rows if (States[Row["studentId"]]["promise"] or {}).get("state") == "TODAY"]
    Missed = [Row for Row in Rows if (States[Row["studentId"]]["promise"] or {}).get("state") == "MISSED"]
    return {
        "promisedToday": len(Today),
        "promisedTodayAmount": _Money(sum(Row["duePaise"] for Row in Today)),
        "promiseMissed": len(Missed),
        "neverContactedOverdue": sum(1 for Row in Rows if Row["overduePaise"] > 0 and States[Row["studentId"]]["lastContact"] is None),
    }
