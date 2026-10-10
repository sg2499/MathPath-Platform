"""Payments revamp R6 (2026-10-09, Shailesh): insights, unusual activity and
the activity feed. Roles and approvals were declined (one admin), so this
step is insights only.

  * Collection: what share of each month's billing has been collected, how
    long invoices take to be paid (and how many are paid on time), the
    overdue amount at each month end, and the ten biggest dues.
  * This month's forecast: billed this month minus collected against it =
    still to come, split into overdue, due by the month end, and due later.
  * Unusual activity: a large discount on one payment, several
    cancellations by one person in a day, and payments dated well before
    they were entered. The limits are editable (Payment Settings >
    Insights). An item can be marked "reviewed" with a note; it then moves
    to the Reviewed list. Nothing is ever hidden for good.
  * The activity feed: the payments history (payment_audit_log) as plain
    sentences -- who did what, when -- with runs of the same action (a
    batch of invoices, a batch of student centres) folded into one line.

Read only, apart from the settings and the review marks.
"""
from __future__ import annotations

import calendar
import json
import re
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import (
    PaymentAllocation,
    PaymentAuditLog,
    PaymentInsightReview,
    PaymentInsightSettings,
    PaymentInvoice,
    PaymentReceipt,
    User,
)
from app.services.payments.audit import WritePaymentAudit
from app.services.payments.money import FormatIndianRupees

TREND_MONTHS = 6
PAID_WINDOW_DAYS = 90
TOP_DUES = 10
UNUSUAL_WINDOWS = (7, 30, 90)
DEFAULT_UNUSUAL_DAYS = 30
ACTIVITY_PAGE = 40
ACTIVITY_MAX_PAGE = 100
GROUP_GAP = timedelta(minutes=5)
REVIEW_KEY = re.compile(r"^(DISCOUNT|CANCELLATIONS|BACKDATED):[A-Za-z0-9:_\-\.]{1,180}$")

SETTING_LIMITS = {
    "discountAmount": (1, 100000),  # rupees
    "discountPercent": (1, 100),
    "cancellationsPerDay": (2, 50),
    "backdatedDays": (1, 365),
}

# Activity filters: which history rows each one shows.
ACTIVITY_TYPES = {
    "PAYMENTS": ("PAYMENT", "DAY_CLOSE", "PAY_LINK"),
    "INVOICES": ("INVOICE", "BILLING", "INVOICE_DRAFT", "HISTORY_IMPORT"),
    "EXPENSES": ("EXPENSE", "EXPENSE_CATEGORY"),
    "SETTINGS": (
        "FEE_ITEM", "CENTRE", "BUSINESS_PROFILE", "NUMBER_SEQUENCE", "ONLINE_SETTINGS", "REMINDER_TEMPLATE",
        "STUDENT_CENTRE", "INSIGHT_SETTINGS", "INSIGHT_REVIEW",
    ),
}
# Rows that are folded together when the same person does them in a run.
GROUPABLE = {("INVOICE", "CREATE"), ("INVOICE", "CANCEL"), ("STUDENT_CENTRE", "SET_CENTRE"), ("PAYMENT", "ADVANCE_APPLIED")}


def _Today() -> date:
    from app.services.payments.invoices_service import TodayInIndia

    return TodayInIndia()


def _Now() -> datetime:
    return datetime.now(timezone.utc)


def _Aware(Value: datetime | None) -> datetime | None:
    if Value is None:
        return None
    return Value if Value.tzinfo else Value.replace(tzinfo=timezone.utc)


def _IndiaDay(Value: datetime) -> date:
    from app.services.payments.invoices_service import INDIA

    return _Aware(Value).astimezone(INDIA).date()


def _Iso(Value: datetime | None) -> str | None:
    return _Aware(Value).isoformat() if Value else None


def _Money(Paise: int) -> dict[str, Any]:
    return {"paise": int(Paise), "display": FormatIndianRupees(int(Paise))}


def _Percent(Part: int, Whole: int) -> int | None:
    if Whole <= 0:
        return None
    return max(0, min(100, round(Part * 100 / Whole)))


def _MonthStart(Day: date, Back: int = 0) -> date:
    Year, Month = Day.year, Day.month - Back
    while Month <= 0:
        Month += 12
        Year -= 1
    return date(Year, Month, 1)


def _NextMonth(Start: date) -> date:
    return date(Start.year + (Start.month == 12), Start.month % 12 + 1, 1)


def _MonthLabel(Start: date, Short: bool = False) -> str:
    return f"{(calendar.month_abbr if Short else calendar.month_name)[Start.month]} {Start.year}"


def _ShortDate(Day: date) -> str:
    return f"{Day.day} {calendar.month_abbr[Day.month]}"


def _RupeesText(Value: Any) -> str:
    """'1200.00' (as the history stores amounts) -> '₹1,200.00'."""
    try:
        return FormatIndianRupees(int((Decimal(str(Value)) * 100).to_integral_value()))
    except (InvalidOperation, ValueError, TypeError):
        return str(Value or "")


# ----------------------------------------------------------------------------
# Settings
# ----------------------------------------------------------------------------

def EnsureSettings(db: Session) -> PaymentInsightSettings:
    Row = db.get(PaymentInsightSettings, "default")
    if not Row:
        Row = PaymentInsightSettings(id="default", discount_amount_paise=50000, discount_percent=20, cancellations_per_day=3, backdated_days=7)
        db.add(Row)
        db.flush()
    return Row


def _ReadSettings(db: Session) -> PaymentInsightSettings:
    """The saved limits, or the defaults (not saved) when none are yet."""
    return db.get(PaymentInsightSettings, "default") or PaymentInsightSettings(
        id="default", discount_amount_paise=50000, discount_percent=20, cancellations_per_day=3, backdated_days=7
    )


def SettingsPayload(Row: PaymentInsightSettings) -> dict[str, Any]:
    return {
        "discountAmount": _Money(Row.discount_amount_paise),
        "discountPercent": int(Row.discount_percent),
        "cancellationsPerDay": int(Row.cancellations_per_day),
        "backdatedDays": int(Row.backdated_days),
        "updatedAt": _Iso(Row.updated_at),
    }


def GetSettings(db: Session) -> dict[str, Any]:
    return SettingsPayload(_ReadSettings(db))


def _WholeNumber(Value: Any, Key: str, Label: str) -> int:
    Low, High = SETTING_LIMITS[Key]
    try:
        Number = Decimal(str(Value).strip().replace(",", ""))
    except (InvalidOperation, ValueError):
        api_error(422, "INSIGHT_SETTING_INVALID", f"{Label} must be a number.")
    if Number != Number.to_integral_value():
        api_error(422, "INSIGHT_SETTING_INVALID", f"{Label} must be a whole number.")
    Whole = int(Number)
    if Whole < Low or Whole > High:
        api_error(422, "INSIGHT_SETTING_INVALID", f"{Label} must be between {Low:,} and {High:,}.")
    return Whole


def UpdateSettings(db: Session, *, Fields: dict[str, Any], Actor: User | None) -> dict[str, Any]:
    Row = EnsureSettings(db)
    Before = SettingsPayload(Row)
    if "discountAmount" in Fields:
        Row.discount_amount_paise = _WholeNumber(Fields["discountAmount"], "discountAmount", "The discount amount") * 100
    if "discountPercent" in Fields:
        Row.discount_percent = _WholeNumber(Fields["discountPercent"], "discountPercent", "The discount share")
    if "cancellationsPerDay" in Fields:
        Row.cancellations_per_day = _WholeNumber(Fields["cancellationsPerDay"], "cancellationsPerDay", "Cancellations in a day")
    if "backdatedDays" in Fields:
        Row.backdated_days = _WholeNumber(Fields["backdatedDays"], "backdatedDays", "Days backdated")
    Row.updated_by_user_id = Actor.id if Actor else None
    Row.updated_at = _Now()
    db.flush()
    After = SettingsPayload(Row)
    Compare = lambda Shape: {"discountAmount": Shape["discountAmount"]["display"], "discountPercent": Shape["discountPercent"], "cancellationsPerDay": Shape["cancellationsPerDay"], "backdatedDays": Shape["backdatedDays"]}  # noqa: E731
    if Compare(Before) != Compare(After):
        WritePaymentAudit(db, EntityType="INSIGHT_SETTINGS", EntityId="default", Action="UPDATE", Actor=Actor, Before=Compare(Before), After=Compare(After))
    db.commit()
    return After


# ----------------------------------------------------------------------------
# Collection
# ----------------------------------------------------------------------------

def _LiveAllocations(db: Session):
    """Money and discount that settle invoices: allocations of payments that
    stand (not cancelled) and were not released (moved off on an edit)."""
    return (
        db.query(PaymentAllocation.invoice_id, PaymentAllocation.amount_paise, PaymentAllocation.discount_paise, PaymentReceipt.payment_date)
        .join(PaymentReceipt, PaymentAllocation.payment_id == PaymentReceipt.id)
        .filter(PaymentReceipt.status == "RECORDED", PaymentAllocation.released_at.is_(None))
    )


def _InvoicesWithSettlements(db: Session, Since: date | None = None) -> tuple[list[PaymentInvoice], dict[str, list[tuple[date, int]]]]:
    Query = db.query(PaymentInvoice)
    if Since:
        Query = Query.filter(PaymentInvoice.invoice_date >= Since)
    Invoices = Query.all()
    Ids = {Row.id for Row in Invoices}
    Settled: dict[str, list[tuple[date, int]]] = defaultdict(list)
    if Ids:
        for InvoiceId, Amount, Discount, PaidOn in _LiveAllocations(db).all():
            if InvoiceId in Ids:
                Settled[InvoiceId].append((PaidOn, int(Amount or 0) + int(Discount or 0)))
    return Invoices, Settled


def _LiveOn(Invoice: PaymentInvoice, Day: date) -> bool:
    """The invoice existed and was not cancelled at the end of Day."""
    if Invoice.invoice_date > Day:
        return False
    if Invoice.status == "CANCELLED":
        return bool(Invoice.cancelled_at) and _IndiaDay(Invoice.cancelled_at) > Day
    return True


def _OverdueOn(Invoices: list[PaymentInvoice], Settled: dict[str, list[tuple[date, int]]], Day: date) -> tuple[int, int]:
    """Overdue amount (and invoices) at the end of Day: invoices past their
    due date, less what had been paid or discounted by then."""
    Total = 0
    Count = 0
    for Invoice in Invoices:
        if not Invoice.due_date or Invoice.due_date >= Day or not _LiveOn(Invoice, Day):
            continue
        Paid = sum(Amount for PaidOn, Amount in Settled.get(Invoice.id, ()) if PaidOn <= Day)
        Balance = max(0, Invoice.amount_paise - Paid)
        if Balance > 0:
            Total += Balance
            Count += 1
    return Total, Count


def _SettledDay(Invoice: PaymentInvoice, Settled: dict[str, list[tuple[date, int]]]) -> date | None:
    """The day the last payment that cleared a fully-paid invoice was dated."""
    if Invoice.status != "PAID":
        return None
    Dates = [PaidOn for PaidOn, _ in Settled.get(Invoice.id, ())]
    return max(Dates) if Dates else None


def _MonthBilling(Invoices: list[PaymentInvoice], Start: date, End: date) -> dict[str, int]:
    Billed = Discount = Paid = Count = 0
    for Invoice in Invoices:
        if Invoice.status == "CANCELLED" or not (Start <= Invoice.invoice_date < End):
            continue
        Count += 1
        Billed += Invoice.amount_paise
        Discount += Invoice.discount_paise or 0
        Paid += Invoice.paid_paise or 0
    return {"billed": Billed, "discount": Discount, "paid": Paid, "count": Count}


def Insights(db: Session, *, UnusualDays: int | None = None, IncludeReviewed: bool = True) -> dict[str, Any]:
    from app.services.payments.reports_service import DuesReport, _CollectedBetween

    Today = _Today()
    ThisMonth = _MonthStart(Today)
    MonthEnd = _NextMonth(ThisMonth) - timedelta(days=1)
    TrendStart = _MonthStart(Today, TREND_MONTHS - 1)
    # Every invoice that could be overdue at some point in the trend, plus
    # every invoice billed in it.
    Invoices, Settled = _InvoicesWithSettlements(db)

    # Month by month: collection rate and overdue at the month end.
    Months = []
    for Back in range(TREND_MONTHS - 1, -1, -1):
        Start = _MonthStart(Today, Back)
        End = _NextMonth(Start)
        Stats = _MonthBilling(Invoices, Start, End)
        Net = Stats["billed"] - Stats["discount"]
        AsOf = min(End - timedelta(days=1), Today)
        Overdue, OverdueCount = _OverdueOn(Invoices, Settled, AsOf)
        PaidHere = [(Day, Invoice) for Invoice in Invoices if (Day := _SettledDay(Invoice, Settled)) and Start <= Day < End]
        Days = [max(0, (Day - Invoice.invoice_date).days) for Day, Invoice in PaidHere]
        Months.append({
            "month": Start.strftime("%Y-%m"),
            "label": _MonthLabel(Start, Short=True),
            "longLabel": _MonthLabel(Start),
            "invoiceCount": Stats["count"],
            "billed": _Money(Net),
            "collected": _Money(Stats["paid"]),
            "rate": _Percent(Stats["paid"], Net),
            "moneyIn": _Money(_CollectedBetween(db, Start, End)),
            "overdueAt": AsOf.isoformat(),
            "overdue": _Money(Overdue),
            "overdueInvoices": OverdueCount,
            "averageDaysToPay": round(sum(Days) / len(Days)) if Days else None,
        })

    # Days to pay: invoices fully paid in the last 90 days.
    Since = Today - timedelta(days=PAID_WINDOW_DAYS)
    Paid = [(Day, Invoice) for Invoice in Invoices if (Day := _SettledDay(Invoice, Settled)) and Day > Since]
    DaysToPay = [max(0, (Day - Invoice.invoice_date).days) for Day, Invoice in Paid]
    OnTime = sum(1 for Day, Invoice in Paid if not Invoice.due_date or Day <= Invoice.due_date)

    # This month's forecast.
    Now = _MonthBilling(Invoices, ThisMonth, _NextMonth(ThisMonth))
    StillOverdue = DueByMonthEnd = DueLater = 0
    for Invoice in Invoices:
        if Invoice.status == "CANCELLED" or not (ThisMonth <= Invoice.invoice_date <= MonthEnd):
            continue
        Balance = max(0, Invoice.amount_paise - (Invoice.paid_paise or 0) - (Invoice.discount_paise or 0))
        if not Balance:
            continue
        if Invoice.due_date and Invoice.due_date < Today:
            StillOverdue += Balance
        elif not Invoice.due_date or Invoice.due_date <= MonthEnd:
            DueByMonthEnd += Balance
        else:
            DueLater += Balance
    NetBilled = Now["billed"] - Now["discount"]

    Dues = DuesReport(db, Filters={"sort": "due"})
    Top = [
        {
            "studentId": Row["studentId"],
            "studentName": Row["studentName"],
            "studentCode": Row["studentCode"],
            "centreName": Row["centreName"],
            "isActive": Row["isActive"],
            "due": _Money(Row["duePaise"]),
            "overdue": _Money(Row["overduePaise"]),
            "maxDaysOverdue": Row["maxDaysOverdue"],
            "invoiceCount": len(Row["invoices"]),
            "share": _Percent(Row["duePaise"], Dues["total"]["paise"]),
        }
        for Row in Dues["students"][:TOP_DUES]
    ]

    Current = Months[-1]
    Previous = Months[-2] if len(Months) > 1 else None
    return {
        "today": Today.isoformat(),
        "thisMonthLabel": _MonthLabel(ThisMonth),
        "collection": {
            "rate": Current["rate"],
            "previousRate": Previous["rate"] if Previous else None,
            "previousLabel": Previous["longLabel"] if Previous else None,
            "billed": Current["billed"],
            "collected": Current["collected"],
            "averageDaysToPay": round(sum(DaysToPay) / len(DaysToPay)) if DaysToPay else None,
            "medianDaysToPay": sorted(DaysToPay)[len(DaysToPay) // 2] if DaysToPay else None,
            "paidInvoices": len(Paid),
            "onTimePercent": _Percent(OnTime, len(Paid)),
            "windowDays": PAID_WINDOW_DAYS,
        },
        "forecast": {
            "billed": _Money(NetBilled),
            "invoiceCount": Now["count"],
            "collected": _Money(Now["paid"]),
            "stillToCome": _Money(max(0, NetBilled - Now["paid"])),
            "overdue": _Money(StillOverdue),
            "dueByMonthEnd": _Money(DueByMonthEnd),
            "dueLater": _Money(DueLater),
            "monthEnd": MonthEnd.isoformat(),
            "moneyInThisMonth": Current["moneyIn"],
        },
        "overdueNow": Dues["overdue"],
        "dueNow": Dues["total"],
        "months": Months,
        "topDues": Top,
        "topDuesShare": _Percent(sum(Row["due"]["paise"] for Row in Top), Dues["total"]["paise"]),
        "studentsWithDues": Dues["studentCount"],
        "unusual": Unusual(db, Days=UnusualDays, IncludeReviewed=IncludeReviewed),
    }


# ----------------------------------------------------------------------------
# Unusual activity
# ----------------------------------------------------------------------------

def _UserNames(db: Session, Ids: set[str | None]) -> dict[str, str]:
    Clean = {Id for Id in Ids if Id}
    if not Clean:
        return {}
    return {Row.id: Row.full_name for Row in db.query(User).filter(User.id.in_(Clean)).all()}


def _StudentName(Payment: PaymentReceipt) -> tuple[str, str]:
    try:
        Student = json.loads(Payment.snapshot_json).get("student") or {}
    except (TypeError, ValueError):
        Student = {}
    return Student.get("name") or "", Student.get("studentCode") or ""


def _PaymentHref(PaymentId: str) -> str:
    return f"/admin/payments/collections?tab=payments&open={PaymentId}"


def Unusual(db: Session, *, Days: int | None = None, IncludeReviewed: bool = True) -> dict[str, Any]:
    from app.services.payments.invoices_service import INDIA

    Settings = _ReadSettings(db)
    Window = int(Days) if Days in UNUSUAL_WINDOWS else DEFAULT_UNUSUAL_DAYS
    Today = _Today()
    FirstDay = Today - timedelta(days=Window - 1)
    Since = datetime.combine(FirstDay, datetime.min.time(), INDIA).astimezone(timezone.utc)
    Items: list[dict[str, Any]] = []

    # Payments entered or edited in the window (counter payments only for
    # backdating; online payments are dated by Razorpay).
    Payments = (
        db.query(PaymentReceipt)
        .filter(PaymentReceipt.status == "RECORDED")
        .filter((PaymentReceipt.created_at >= Since) | (PaymentReceipt.edited_at >= Since))
        .all()
    )
    Names = _UserNames(db, {Row.created_by_user_id for Row in Payments} | {Row.edited_by_user_id for Row in Payments})
    for Payment in Payments:
        Entered = max(_Aware(Payment.created_at), _Aware(Payment.edited_at) or _Aware(Payment.created_at))
        By = Names.get(Payment.edited_by_user_id if Payment.edited_at and _Aware(Payment.edited_at) >= Since else Payment.created_by_user_id) or Payment.received_by_name or "Not recorded"
        StudentName, StudentCode = _StudentName(Payment)
        Discount = int(Payment.discount_paise or 0)
        # Old-platform history (source LEGACY) was given there, not here.
        if Discount and Payment.source != "LEGACY":
            Share = Discount * 100 / max(1, Payment.amount_paise + Discount)
            if Discount > Settings.discount_amount_paise or Share > Settings.discount_percent:
                Items.append({
                    "key": f"DISCOUNT:{Payment.id}:{Discount}",
                    "kind": "DISCOUNT",
                    "kindLabel": "Large discount",
                    "at": _Iso(Entered),
                    "actorName": By,
                    "title": f"{FormatIndianRupees(Discount)} discount on {Payment.receipt_number} ({round(Share)}% of what it settled)",
                    "detail": f"{StudentName}" + (f" ({StudentCode})" if StudentCode else "") + (f" · Reason: {Payment.discount_reason}" if Payment.discount_reason else " · No reason given"),
                    "href": _PaymentHref(Payment.id),
                    "studentId": Payment.student_id,
                    "amount": _Money(Discount),
                })
        if Payment.channel != "ONLINE" and not Payment.legacy_id and (Payment.source or "ADMIN") == "ADMIN":
            EnteredDay = _IndiaDay(Entered)
            Gap = (EnteredDay - Payment.payment_date).days
            if Gap > Settings.backdated_days and EnteredDay >= FirstDay:
                Items.append({
                    "key": f"BACKDATED:{Payment.id}:{Payment.payment_date.isoformat()}",
                    "kind": "BACKDATED",
                    "kindLabel": "Backdated payment",
                    "at": _Iso(Entered),
                    "actorName": By,
                    "title": f"{Payment.receipt_number} dated {_ShortDate(Payment.payment_date)}, entered {_ShortDate(EnteredDay)} ({Gap} days later)",
                    "detail": f"{StudentName}" + (f" ({StudentCode})" if StudentCode else "") + f" · {FormatIndianRupees(Payment.amount_paise)}",
                    "href": _PaymentHref(Payment.id),
                    "studentId": Payment.student_id,
                    "amount": _Money(Payment.amount_paise),
                })

    # Cancellations by one person in one day.
    Cancels = (
        db.query(PaymentAuditLog)
        .filter(PaymentAuditLog.action == "CANCEL", PaymentAuditLog.entity_type.in_(("PAYMENT", "INVOICE", "EXPENSE")), PaymentAuditLog.created_at >= Since)
        .order_by(PaymentAuditLog.created_at.asc())
        .all()
    )
    Groups: dict[tuple[str, date], list[PaymentAuditLog]] = defaultdict(list)
    for Row in Cancels:
        Groups[(Row.actor_user_id or f"name-{Row.actor_name or '-'}", _IndiaDay(Row.created_at))].append(Row)
    for (ActorKey, Day), Rows in Groups.items():
        if len(Rows) < Settings.cancellations_per_day:
            continue
        Numbers = []
        for Row in Rows:
            Shape = json.loads(Row.before_json) if Row.before_json else {}
            Numbers.append(Shape.get("receiptNumber") or Shape.get("invoiceNumber") or Shape.get("expenseNumber") or Row.entity_type.title())
        Kinds = defaultdict(int)
        for Row in Rows:
            Kinds[{"PAYMENT": "payment", "INVOICE": "invoice", "EXPENSE": "expense"}[Row.entity_type]] += 1
        Mix = ", ".join(f"{Kinds[Kind]} {Kind}{'s' if Kinds[Kind] != 1 else ''}" for Kind in ("payment", "invoice", "expense") if Kinds.get(Kind))
        Safe = re.sub(r"[^A-Za-z0-9_\-]", "_", ActorKey)[:80]
        Items.append({
            "key": f"CANCELLATIONS:{Safe}:{Day.isoformat()}",
            "kind": "CANCELLATIONS",
            "kindLabel": "Many cancellations",
            "at": _Iso(Rows[-1].created_at),
            "actorName": Rows[-1].actor_name or "Not recorded",
            "title": f"{len(Rows)} cancellations by {Rows[-1].actor_name or 'one person'} on {_ShortDate(Day)} ({Mix})",
            "detail": ", ".join(Numbers[:8]) + (f" and {len(Numbers) - 8} more" if len(Numbers) > 8 else ""),
            "href": f"/admin/payments/reports?tab=activity&type=CANCELLATIONS" + (f"&person={Rows[-1].actor_user_id}" if Rows[-1].actor_user_id else ""),
            "studentId": None,
            "amount": None,
        })

    Reviews = {Row.key: Row for Row in db.query(PaymentInsightReview).filter(PaymentInsightReview.key.in_([Item["key"] for Item in Items] or ["-"])).all()}
    for Item in Items:
        Review = Reviews.get(Item["key"])
        Item["reviewed"] = {"byName": Review.reviewed_by_name, "at": _Iso(Review.created_at), "note": Review.note} if Review else None
    Items.sort(key=lambda Item: Item["at"] or "", reverse=True)
    Open = [Item for Item in Items if not Item["reviewed"]]
    return {
        "days": Window,
        "windows": list(UNUSUAL_WINDOWS),
        "settings": SettingsPayload(Settings),
        "openCount": len(Open),
        "reviewedCount": len(Items) - len(Open),
        "items": Items if IncludeReviewed else Open,
    }


def MarkReviewed(db: Session, *, Key: Any, Note: Any, Actor: User | None) -> dict[str, Any]:
    KeyText = str(Key or "").strip()
    if not REVIEW_KEY.match(KeyText):
        api_error(422, "INSIGHT_KEY_INVALID", "That item could not be found. Refresh and try again.")
    NoteText = " ".join(str(Note or "").split())[:300] or None
    Row = db.get(PaymentInsightReview, KeyText)
    if Row:
        Row.note = NoteText
    else:
        Row = PaymentInsightReview(key=KeyText, note=NoteText, reviewed_by_user_id=Actor.id if Actor else None, reviewed_by_name=Actor.full_name if Actor else None, created_at=_Now())
        db.add(Row)
    db.flush()
    WritePaymentAudit(db, EntityType="INSIGHT_REVIEW", EntityId=KeyText[:200], Action="REVIEW", Actor=Actor, After={"key": KeyText, "note": NoteText})
    db.commit()
    return {"key": KeyText, "reviewed": {"byName": Row.reviewed_by_name, "at": _Iso(Row.created_at), "note": Row.note}}


def UndoReviewed(db: Session, *, Key: Any, Actor: User | None) -> dict[str, Any]:
    KeyText = str(Key or "").strip()
    Row = db.get(PaymentInsightReview, KeyText) if REVIEW_KEY.match(KeyText) else None
    if not Row:
        api_error(404, "INSIGHT_REVIEW_NOT_FOUND", "That item is not marked as reviewed.")
    db.delete(Row)
    WritePaymentAudit(db, EntityType="INSIGHT_REVIEW", EntityId=KeyText[:200], Action="UNREVIEW", Actor=Actor, Before={"key": KeyText})
    db.commit()
    return {"key": KeyText, "reviewed": None}


def HomeInsights(db: Session) -> dict[str, Any]:
    """What Home shows: this month's collection rate and the open
    unusual-activity count."""
    Today = _Today()
    Start = _MonthStart(Today)
    Rows = db.query(PaymentInvoice).filter(PaymentInvoice.invoice_date >= Start, PaymentInvoice.invoice_date < _NextMonth(Start), PaymentInvoice.status != "CANCELLED").all()
    Billed = sum(Row.amount_paise - (Row.discount_paise or 0) for Row in Rows)
    Paid = sum(Row.paid_paise or 0 for Row in Rows)
    Flags = Unusual(db, IncludeReviewed=False)
    return {
        "monthLabel": _MonthLabel(Start),
        "rate": _Percent(Paid, Billed),
        "billed": _Money(Billed),
        "collected": _Money(Paid),
        "unusualOpen": Flags["openCount"],
        "unusualDays": Flags["days"],
    }


# ----------------------------------------------------------------------------
# Activity feed
# ----------------------------------------------------------------------------

def _Shape(Row: PaymentAuditLog, Which: str) -> dict[str, Any]:
    Raw = Row.after_json if Which == "after" else Row.before_json
    try:
        return json.loads(Raw) if Raw else {}
    except (TypeError, ValueError):
        return {}


def _Period(Key: str) -> str:
    try:
        Year, Month = Key.split("-")
        return f"{calendar.month_name[int(Month)]} {Year}"
    except (ValueError, IndexError):
        return Key


SETTING_LABELS = {
    "FEE_ITEM": "Fee Setup",
    "CENTRE": "a centre",
    "BUSINESS_PROFILE": "business details",
    "NUMBER_SEQUENCE": "document numbering",
    "ONLINE_SETTINGS": "online payment settings",
    "REMINDER_TEMPLATE": "a reminder message",
    "EXPENSE_CATEGORY": "an expense category",
    "INSIGHT_SETTINGS": "the unusual-activity limits",
    "BILLING": "billing settings",
}


def _Describe(Row: PaymentAuditLog) -> dict[str, Any]:
    """One history row as a sentence, an icon key and a link."""
    After = _Shape(Row, "after")
    Before = _Shape(Row, "before")
    Shape = After or Before
    Kind, Action = Row.entity_type, Row.action
    Text, Href, Icon, Amount = None, None, "settings", None

    if Kind == "PAYMENT":
        Icon = "payment"
        Href = _PaymentHref(Row.entity_id)
        Number, Student = Shape.get("receiptNumber") or "a payment", Shape.get("student") or ""
        if Action == "CREATE":
            Amount = _RupeesText(Shape.get("amount"))
            Text = f"Recorded {Number}: {Amount} from {Student}" + (f" ({Shape['methods']})" if Shape.get("methods") else "")
            if Shape.get("discount") and str(Shape.get("discount")) not in ("0", "0.00"):
                Text += f", discount {_RupeesText(Shape['discount'])}"
        elif Action == "UPDATE":
            Text = f"Edited {Number} ({Student})"
        elif Action == "CANCEL":
            Icon, Amount = "cancel", _RupeesText(Before.get("amount"))
            Text = f"Cancelled {Number}: {Amount} from {Student}"
        elif Action == "ADVANCE_APPLIED":
            Text = f"Used advance from {Number} ({Student}) against new invoices"
    elif Kind == "INVOICE":
        Icon = "invoice"
        Number = Shape.get("invoiceNumber") or "an invoice"
        Href = f"/admin/payments/invoices?tab=all&search={Number}&open={Row.entity_id}"
        Fee = Shape.get("feeName") or ""
        Period = f" · {Shape['period']}" if Shape.get("period") else ""
        if Action == "CREATE":
            Amount = _RupeesText(Shape.get("amount"))
            Text = f"Raised {Number}: {Fee}{Period} for {Shape.get('student') or ''}, {Amount}"
        elif Action == "CANCEL":
            Icon, Amount = "cancel", _RupeesText(Before.get("amount"))
            Text = f"Cancelled invoice {Number}: {Fee}{Period} for {Before.get('student') or ''}"
    elif Kind == "EXPENSE":
        Icon = "expense"
        Number = Shape.get("expenseNumber") or "an expense"
        Href = f"/admin/payments/expenses?tab=expenses&open={Row.entity_id}"
        Amount = _RupeesText(Shape.get("amount"))
        Item = Shape.get("item") or Shape.get("category") or ""
        Text = {"CREATE": f"Added expense {Number}: {Item}, {Amount}", "UPDATE": f"Edited expense {Number} ({Item})", "CANCEL": f"Cancelled expense {Number}: {Item}, {Amount}"}.get(Action)
        if Action == "CANCEL":
            Icon = "cancel"
    elif Kind == "DAY_CLOSE":
        Icon = "dayclose"
        Href = f"/admin/payments/collections?tab=day-close&date={Row.entity_id}"
        try:
            Day = _ShortDate(date.fromisoformat(Row.entity_id))
        except ValueError:
            Day = Row.entity_id
        if Action == "CLOSE":
            Difference = int(After.get("differencePaise") or 0)
            Text = f"Closed {Day}: cash " + ("matched" if not Difference else (f"{FormatIndianRupees(abs(Difference))} more" if Difference > 0 else f"{FormatIndianRupees(abs(Difference))} short"))
        else:
            Text = f"Reopened {Day}"
    elif Kind == "PAY_LINK":
        Icon = "link"
        Text = f"Created a pay link for {After.get('student') or 'a student'}" if Action == "CREATE" else "Switched off a pay link"
    elif Kind == "BILLING":
        Icon = "invoice"
        Period = _Period(Row.entity_id) if re.match(r"^\d{4}-\d{2}$", Row.entity_id or "") else ""
        Href = f"/admin/payments/invoices?tab=monthly&period={Row.entity_id}" if Period else "/admin/payments/settings?tab=billing"
        if Action == "RELEASE":
            Text = f"Released {Period} billing: {After.get('released', 0)} invoices"
        elif Action == "DRAFT":
            Text = f"Added {After.get('drafts', 0)} {Period} drafts"
        elif Action == "AUTO_DRAFT":
            Text = f"Drafted {Period} billing automatically ({After.get('drafts', 0)} students)"
        elif Action == "SET_MODE":
            Text = f"Set {After.get('changed', 0)} students to {str(After.get('mode') or '').title()} billing"
        elif Action == "PREFILL":
            Text = "Marked international students from their competition slots"
        else:
            Icon, Text = "settings", "Changed billing settings"
    elif Kind == "INVOICE_DRAFT":
        Icon = "invoice"
        Period = _Period(After.get("period") or "")
        Href = f"/admin/payments/invoices?tab=monthly&period={After.get('period')}" if After.get("period") else None
        Text = f"Took a student off {Period} billing" if Action == "DROP" else f"Put a student back on {Period} billing"
    elif Kind == "STUDENT_CENTRE":
        Text = f"Moved {After.get('student') or 'a student'} to {After.get('centre') or 'no centre'}"
        Href = "/admin/payments/settings?tab=centres"
    elif Kind == "HISTORY_IMPORT":
        Icon = "invoice"
        Href = "/admin/payments/invoices?tab=all"
        Text = f"Brought in the old platform's payment history: {After.get('invoices', 0)} invoices and {After.get('payments', 0)} payments" + (f", {After.get('studentsAdded')} former students added" if After.get("studentsAdded") else "")
    elif Kind == "INSIGHT_REVIEW":
        Icon = "insight"
        Text = "Marked an unusual item as reviewed" if Action == "REVIEW" else "Moved an unusual item back to open"
        Href = "/admin/payments/reports?tab=insights"
    elif Kind == "FEE_ITEM":
        Name = Shape.get("name")
        Text = {"CREATE": f"Added fee item {Name}", "UPDATE": f"Changed fee item {Name}", "ACTIVATE": f"Switched on fee item {Name}", "DEACTIVATE": f"Switched off fee item {Name}", "REORDER": "Reordered the fee items"}.get(Action)
        Href = "/admin/payments/settings?tab=fees"
    elif Kind == "CENTRE":
        Text = f"{'Added' if Action == 'CREATE' else 'Changed'} centre {Shape.get('name') or ''}".strip()
        Href = "/admin/payments/settings?tab=centres"
    elif Kind == "NUMBER_SEQUENCE":
        Text = f"Set the next {Row.entity_id.lower()} number"
        Href = "/admin/payments/settings?tab=numbering"

    if not Text:
        Label = SETTING_LABELS.get(Kind, Kind.replace("_", " ").lower())
        Text = f"Changed {Label}"
    return {"text": Text, "href": Href, "icon": Icon, "amount": Amount}


def _ActivityQuery(db: Session, Type: str, PersonId: str | None):
    Query = db.query(PaymentAuditLog)
    if Type == "CANCELLATIONS":
        Query = Query.filter(PaymentAuditLog.action == "CANCEL")
    elif Type in ACTIVITY_TYPES:
        Query = Query.filter(PaymentAuditLog.entity_type.in_(ACTIVITY_TYPES[Type]))
    if PersonId:
        Query = Query.filter(PaymentAuditLog.actor_user_id == PersonId)
    return Query


def Activity(db: Session, *, Type: Any = None, PersonId: Any = None, Before: Any = None, Limit: Any = None) -> dict[str, Any]:
    TypeKey = str(Type or "ALL").upper()
    if TypeKey not in ACTIVITY_TYPES and TypeKey not in ("ALL", "CANCELLATIONS"):
        TypeKey = "ALL"
    Person = str(PersonId or "").strip() or None
    try:
        Size = max(1, min(int(Limit or ACTIVITY_PAGE), ACTIVITY_MAX_PAGE))
    except (TypeError, ValueError):
        Size = ACTIVITY_PAGE
    Query = _ActivityQuery(db, TypeKey, Person)
    if Before:
        try:
            Cursor = datetime.fromisoformat(str(Before).replace("Z", "+00:00"))
        except ValueError:
            api_error(422, "ACTIVITY_CURSOR_INVALID", "Refresh the page and try again.")
        if Cursor.tzinfo is None:
            Cursor = Cursor.replace(tzinfo=timezone.utc)
        # SQLite stores these naive (UTC); compare like with like.
        if db.bind is not None and db.bind.dialect.name == "sqlite":
            Cursor = Cursor.astimezone(timezone.utc).replace(tzinfo=None)
        Query = Query.filter(PaymentAuditLog.created_at < Cursor)
    Raw = Query.order_by(PaymentAuditLog.created_at.desc(), PaymentAuditLog.id.desc()).limit(Size * 6 + 1).all()

    Items: list[dict[str, Any]] = []
    Consumed = 0
    Index = 0
    while Index < len(Raw) and len(Items) < Size:
        Row = Raw[Index]
        Run = [Row]
        if (Row.entity_type, Row.action) in GROUPABLE:
            Next = Index + 1
            while Next < len(Raw):
                Other = Raw[Next]
                if (Other.entity_type, Other.action) != (Row.entity_type, Row.action) or (Other.actor_user_id, Other.actor_name) != (Row.actor_user_id, Row.actor_name):
                    break
                if _Aware(Run[-1].created_at) - _Aware(Other.created_at) > GROUP_GAP:
                    break
                Run.append(Other)
                Next += 1
        Index += len(Run)
        Consumed = Index
        Described = _Describe(Row)
        Item = {
            "id": Row.id,
            "at": _Iso(Row.created_at),
            "actorName": Row.actor_name or "Not recorded",
            "actorId": Row.actor_user_id,
            "entityType": Row.entity_type,
            "action": Row.action,
            "reason": Row.reason,
            "count": len(Run),
            **Described,
        }
        if len(Run) > 1:
            Item.update(_DescribeRun(Run))
        Items.append(Item)
    More = Consumed < len(Raw)
    People = (
        db.query(PaymentAuditLog.actor_user_id, PaymentAuditLog.actor_name)
        .filter(PaymentAuditLog.actor_user_id.isnot(None))
        .group_by(PaymentAuditLog.actor_user_id, PaymentAuditLog.actor_name)
        .all()
    )
    Seen: dict[str, str] = {}
    for UserId, Name in People:
        Seen.setdefault(UserId, Name or "Not recorded")
    return {
        "type": TypeKey,
        "personId": Person,
        "items": Items,
        "nextBefore": _Iso(Raw[Consumed - 1].created_at) if More and Consumed else None,
        "people": sorted(({"userId": Key, "name": Value} for Key, Value in Seen.items()), key=lambda Row: Row["name"].lower()),
    }


def _DescribeRun(Run: list[PaymentAuditLog]) -> dict[str, Any]:
    Kind, Action = Run[0].entity_type, Run[0].action
    Shapes = [(_Shape(Row, "after") or _Shape(Row, "before")) for Row in Run]
    Count = len(Run)
    if Kind == "INVOICE":
        Numbers = sorted(Shape.get("invoiceNumber") or "" for Shape in Shapes)
        Total = 0
        for Shape in Shapes:
            try:
                Total += int((Decimal(str(Shape.get("amount") or "0")) * 100).to_integral_value())
            except InvalidOperation:
                pass
        Range = f"{Numbers[0]} to {Numbers[-1]}" if Numbers and Numbers[0] != Numbers[-1] else (Numbers[0] if Numbers else "")
        Verb = "Raised" if Action == "CREATE" else "Cancelled"
        return {"text": f"{Verb} {Count} invoices ({Range}), {FormatIndianRupees(Total)}", "href": "/admin/payments/invoices?tab=all", "amount": FormatIndianRupees(Total)}
    if Kind == "STUDENT_CENTRE":
        Centres = {Shape.get("centre") or "no centre" for Shape in Shapes}
        return {"text": f"Moved {Count} students to {', '.join(sorted(Centres))}", "href": "/admin/payments/settings?tab=centres"}
    if Kind == "PAYMENT":
        return {"text": f"Used advance from {Count} payments against new invoices"}
    return {}
