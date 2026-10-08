"""Payments Phase 4 (2026-10-08): the Overview dashboard, the Collections
report and the Dues report.

Collections count money by payment-method line (what actually came in as
Cash, UPI ...), from payments that are not cancelled, by payment date.
Dues are the unpaid balances of live invoices (amount - paid - discount),
aged by how many days past the due date they are.
"""
from __future__ import annotations

import calendar
from collections import defaultdict
from datetime import date, timedelta
from typing import Any

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import (
    Level,
    PaymentAllocation,
    PaymentCentre,
    PaymentInvoice,
    PaymentMethodLine,
    PaymentReceipt,
    Student,
    User,
)
from app.services.payments.money import FormatIndianRupees
from app.services.payments.receipts_service import METHOD_LABELS, AdvanceBalances, PaymentPayload

BUCKETS = [
    ("NOT_DUE", "Not yet due"),
    ("D0_30", "1–30 days overdue"),
    ("D31_60", "31–60 days overdue"),
    ("D61_90", "61–90 days overdue"),
    ("D90_PLUS", "90+ days overdue"),
]
BUCKET_LABELS = dict(BUCKETS)
MAX_REPORT_DAYS = 731
MAX_REPORT_PAYMENTS = 1000


def _Today() -> date:
    from app.services.payments.invoices_service import TodayInIndia

    return TodayInIndia()


def _Money(Paise: int) -> dict[str, Any]:
    return {"paise": int(Paise), "display": FormatIndianRupees(int(Paise))}


def BucketFor(DaysOverdue: int) -> str:
    if DaysOverdue <= 0:
        return "NOT_DUE"
    if DaysOverdue <= 30:
        return "D0_30"
    if DaysOverdue <= 60:
        return "D31_60"
    if DaysOverdue <= 90:
        return "D61_90"
    return "D90_PLUS"


def _MonthStart(Day: date, Back: int = 0) -> date:
    Year, Month = Day.year, Day.month - Back
    while Month <= 0:
        Month += 12
        Year -= 1
    return date(Year, Month, 1)


def _NextMonth(Start: date) -> date:
    return date(Start.year + (Start.month == 12), Start.month % 12 + 1, 1)


# ----------------------------------------------------------------------------
# Collections
# ----------------------------------------------------------------------------

def _CollectionRange(Filters: dict[str, Any]) -> tuple[date, date]:
    from app.services.payments.invoices_service import _ParseDate

    Today = _Today()
    DateFrom = _ParseDate(Filters.get("dateFrom"), "From date") or Today
    DateTo = _ParseDate(Filters.get("dateTo"), "To date") or DateFrom
    if DateTo < DateFrom:
        api_error(422, "DATE_RANGE_INVALID", "The 'to' date cannot be before the 'from' date.")
    if (DateTo - DateFrom).days > MAX_REPORT_DAYS:
        api_error(422, "DATE_RANGE_TOO_LONG", "Choose at most two years at a time.")
    return DateFrom, DateTo


def _CollectionLines(db: Session, DateFrom: date, DateTo: date, Filters: dict[str, Any]):
    Query = (
        db.query(PaymentMethodLine, PaymentReceipt)
        .join(PaymentReceipt, PaymentMethodLine.payment_id == PaymentReceipt.id)
        .filter(PaymentReceipt.status == "RECORDED", PaymentReceipt.payment_date >= DateFrom, PaymentReceipt.payment_date <= DateTo)
    )
    Method = str(Filters.get("method") or "").upper()
    if Method in METHOD_LABELS:
        Query = Query.filter(PaymentMethodLine.method == Method)
    if Filters.get("receivedBy"):
        Query = Query.filter(PaymentReceipt.received_by_user_id == Filters["receivedBy"])
    if Filters.get("centreId"):
        Query = Query.filter(PaymentReceipt.centre_id == Filters["centreId"]) if Filters["centreId"] != "NONE" else Query.filter(PaymentReceipt.centre_id.is_(None))
    return Query.order_by(PaymentReceipt.payment_date.asc(), PaymentReceipt.receipt_number.asc(), PaymentMethodLine.line_order.asc()).all()


def CollectionsReport(db: Session, *, Filters: dict[str, Any], IncludePayments: bool = True) -> dict[str, Any]:
    DateFrom, DateTo = _CollectionRange(Filters)
    Rows = _CollectionLines(db, DateFrom, DateTo, Filters)
    Total = 0
    ByMethod: dict[str, int] = defaultdict(int)
    ByStaff: dict[str, dict[str, Any]] = {}
    ByDay: dict[date, dict[str, Any]] = {}
    Payments: dict[str, PaymentReceipt] = {}
    InFilter: dict[str, int] = defaultdict(int)
    for Line, Payment in Rows:
        Total += Line.amount_paise
        ByMethod[Line.method] += Line.amount_paise
        StaffKey = Payment.received_by_user_id or "-"
        Staff = ByStaff.setdefault(StaffKey, {"name": Payment.received_by_name or "Not recorded", "total": 0, "byMethod": defaultdict(int), "payments": set()})
        Staff["total"] += Line.amount_paise
        Staff["byMethod"][Line.method] += Line.amount_paise
        Staff["payments"].add(Payment.id)
        Day = ByDay.setdefault(Payment.payment_date, {"total": 0, "byMethod": defaultdict(int), "payments": set()})
        Day["total"] += Line.amount_paise
        Day["byMethod"][Line.method] += Line.amount_paise
        Day["payments"].add(Payment.id)
        Payments[Payment.id] = Payment
        InFilter[Payment.id] += Line.amount_paise
    Discount = sum(Row.discount_paise or 0 for Row in Payments.values())
    MethodOrder = [Method for Method, _ in sorted(ByMethod.items(), key=lambda Item: -Item[1])]

    def _Methods(Values: dict[str, int]) -> list[dict[str, Any]]:
        return [{"method": Method, "methodLabel": METHOD_LABELS.get(Method, Method), **_Money(Values.get(Method, 0))} for Method in MethodOrder if Values.get(Method)]

    Result: dict[str, Any] = {
        "dateFrom": DateFrom.isoformat(),
        "dateTo": DateTo.isoformat(),
        "total": _Money(Total),
        "discount": _Money(Discount),
        "paymentCount": len(Payments),
        "byMethod": _Methods(ByMethod),
        "byStaff": [
            {"userId": Key if Key != "-" else None, "name": Value["name"], "paymentCount": len(Value["payments"]), **_Money(Value["total"]), "byMethod": _Methods(Value["byMethod"])}
            for Key, Value in sorted(ByStaff.items(), key=lambda Item: -Item[1]["total"])
        ],
        "byDay": [
            {"date": Day.isoformat(), "paymentCount": len(Value["payments"]), **_Money(Value["total"]), "byMethod": _Methods(Value["byMethod"])}
            for Day, Value in sorted(ByDay.items())
        ],
    }
    if IncludePayments:
        Ordered = sorted(Payments.values(), key=lambda Row: (Row.payment_date, Row.receipt_number), reverse=True)
        Result["paymentsTruncated"] = len(Ordered) > MAX_REPORT_PAYMENTS
        Result["payments"] = [
            {**PaymentPayload(db, Row, Names={}, Detailed=False), "inFilterPaise": InFilter[Row.id], "inFilterDisplay": FormatIndianRupees(InFilter[Row.id])}
            for Row in Ordered[:MAX_REPORT_PAYMENTS]
        ]
    return Result


def CollectionLinesForExport(db: Session, *, Filters: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    import json

    DateFrom, DateTo = _CollectionRange(Filters)
    Report = CollectionsReport(db, Filters=Filters, IncludePayments=False)
    Lines = []
    for Line, Payment in _CollectionLines(db, DateFrom, DateTo, Filters):
        Snapshot = json.loads(Payment.snapshot_json)
        Lines.append({
            "date": Payment.payment_date.isoformat(),
            "receiptNumber": Payment.receipt_number,
            "studentName": Snapshot["student"]["name"],
            "studentCode": Snapshot["student"]["studentCode"],
            "centreName": (Snapshot.get("centre") or {}).get("name"),
            "method": METHOD_LABELS.get(Line.method, Line.method),
            "reference": Line.reference,
            "amountPaise": Line.amount_paise,
            "receivedBy": Payment.received_by_name,
            "payBy": Payment.pay_by,
        })
    return Report, Lines


# ----------------------------------------------------------------------------
# Dues
# ----------------------------------------------------------------------------

def DuesReport(db: Session, *, Filters: dict[str, Any]) -> dict[str, Any]:
    from app.services.payments.invoices_service import PeriodLabel

    Today = _Today()
    Query = (
        db.query(PaymentInvoice, Student, User)
        .join(Student, PaymentInvoice.student_id == Student.id)
        .join(User, Student.user_id == User.id)
        .filter(PaymentInvoice.status.in_(("PENDING", "PART_PAID")))
    )
    if Filters.get("centreId"):
        Query = Query.filter(Student.centre_id == Filters["centreId"]) if Filters["centreId"] != "NONE" else Query.filter(Student.centre_id.is_(None))
    if Filters.get("feeItemId"):
        Query = Query.filter(PaymentInvoice.fee_item_id == Filters["feeItemId"])
    if Filters.get("levelCode"):
        LevelIds = [Row.id for Row in db.query(Level).filter(Level.level_code == Filters["levelCode"]).all()]
        Query = Query.filter(Student.current_level_id.in_(LevelIds or ["-"]))
    if str(Filters.get("activeOnly") or "").lower() in ("1", "true", "yes"):
        Query = Query.filter(Student.is_active == True, User.is_active == True)  # noqa: E712
    Search = str(Filters.get("search") or "").strip()
    if Search:
        Like = f"%{Search.lower()}%"
        Query = Query.filter(
            or_(
                func.lower(User.full_name).like(Like),
                func.lower(Student.student_code).like(Like),
                func.lower(func.coalesce(Student.custom_id, "")).like(Like),
                func.lower(func.coalesce(Student.father_name, "")).like(Like),
                func.lower(func.coalesce(Student.mother_name, "")).like(Like),
                func.lower(func.coalesce(Student.father_mobile, "")).like(Like),
                func.lower(func.coalesce(Student.mother_mobile, "")).like(Like),
                func.lower(PaymentInvoice.invoice_number).like(Like),
            )
        )
    Bucket = str(Filters.get("bucket") or "").upper()
    Rows = Query.order_by(PaymentInvoice.due_date.asc(), PaymentInvoice.invoice_number.asc()).all()

    Levels = {Row.id: Row.level_code for Row in db.query(Level).all()}
    Centres = {Row.id: Row.name for Row in db.query(PaymentCentre).all()}
    Students: dict[str, dict[str, Any]] = {}
    BucketTotals: dict[str, int] = {Key: 0 for Key, _ in BUCKETS}
    InvoiceCount = 0
    for Invoice, StudentRow, UserRow in Rows:
        Balance = max(0, Invoice.amount_paise - (Invoice.paid_paise or 0) - (Invoice.discount_paise or 0))
        if Balance <= 0:
            continue
        Days = (Today - Invoice.due_date).days if Invoice.due_date else 0
        Key = BucketFor(Days)
        if Bucket in BUCKET_LABELS and Key != Bucket:
            continue
        InvoiceCount += 1
        BucketTotals[Key] += Balance
        Entry = Students.setdefault(StudentRow.id, {
            "studentId": StudentRow.id,
            "studentName": UserRow.full_name,
            "studentCode": StudentRow.student_code,
            "customId": StudentRow.custom_id,
            "parentName": StudentRow.father_name or StudentRow.mother_name,
            "mobile": StudentRow.father_mobile or StudentRow.mother_mobile or StudentRow.parent_contact,
            "centreName": Centres.get(StudentRow.centre_id) if StudentRow.centre_id else None,
            "levelCode": Levels.get(StudentRow.current_level_id),
            "isActive": bool(StudentRow.is_active and UserRow.is_active),
            "invoices": [],
            "duePaise": 0,
            "overduePaise": 0,
            "maxDaysOverdue": 0,
            "oldestDueDate": None,
        })
        Entry["invoices"].append({
            "invoiceId": Invoice.id,
            "invoiceNumber": Invoice.invoice_number,
            "feeName": Invoice.fee_name,
            "periodLabel": PeriodLabel(Invoice.billing_month, Invoice.billing_year),
            "invoiceDate": Invoice.invoice_date.isoformat(),
            "dueDate": Invoice.due_date.isoformat() if Invoice.due_date else None,
            "daysOverdue": max(0, Days),
            "bucket": Key,
            "bucketLabel": BUCKET_LABELS[Key],
            "balancePaise": Balance,
            "balanceDisplay": FormatIndianRupees(Balance),
            "amountDisplay": FormatIndianRupees(Invoice.amount_paise),
        })
        Entry["duePaise"] += Balance
        if Days > 0:
            Entry["overduePaise"] += Balance
        Entry["maxDaysOverdue"] = max(Entry["maxDaysOverdue"], max(0, Days))
        if Invoice.due_date and (Entry["oldestDueDate"] is None or Invoice.due_date.isoformat() < Entry["oldestDueDate"]):
            Entry["oldestDueDate"] = Invoice.due_date.isoformat()

    Advances = AdvanceBalances(db, list(Students))
    Result = []
    for Entry in Students.values():
        Entry["bucket"] = BucketFor(Entry["maxDaysOverdue"])
        Entry["bucketLabel"] = BUCKET_LABELS[Entry["bucket"]]
        Entry["dueDisplay"] = FormatIndianRupees(Entry["duePaise"])
        Entry["overdueDisplay"] = FormatIndianRupees(Entry["overduePaise"])
        Entry["advancePaise"] = Advances.get(Entry["studentId"], 0)
        Entry["advanceDisplay"] = FormatIndianRupees(Entry["advancePaise"])
        Result.append(Entry)
    Sort = str(Filters.get("sort") or "due")
    if Sort == "name":
        Result.sort(key=lambda Row: (Row["studentName"] or "").lower())
    elif Sort == "overdue":
        Result.sort(key=lambda Row: (-Row["maxDaysOverdue"], -Row["duePaise"]))
    else:
        Result.sort(key=lambda Row: (-Row["duePaise"], (Row["studentName"] or "").lower()))
    Grand = sum(BucketTotals.values())
    return {
        "asOf": Today.isoformat(),
        "studentCount": len(Result),
        "invoiceCount": InvoiceCount,
        "total": _Money(Grand),
        "overdue": _Money(Grand - BucketTotals["NOT_DUE"]),
        "buckets": [{"bucket": Key, "label": Label, **_Money(BucketTotals[Key])} for Key, Label in BUCKETS],
        "students": Result,
    }


# ----------------------------------------------------------------------------
# Overview
# ----------------------------------------------------------------------------

def _CollectedBetween(db: Session, Start: date, End: date) -> int:
    """Money in (method lines of live payments) from Start up to, not including, End."""
    return int(
        db.query(func.coalesce(func.sum(PaymentMethodLine.amount_paise), 0))
        .join(PaymentReceipt, PaymentMethodLine.payment_id == PaymentReceipt.id)
        .filter(PaymentReceipt.status == "RECORDED", PaymentReceipt.payment_date >= Start, PaymentReceipt.payment_date < End)
        .scalar()
        or 0
    )


def _AdvanceHeld(db: Session) -> int:
    Received = int(db.query(func.coalesce(func.sum(PaymentReceipt.amount_paise), 0)).filter(PaymentReceipt.status == "RECORDED").scalar() or 0)
    Applied = int(
        db.query(func.coalesce(func.sum(PaymentAllocation.amount_paise), 0))
        .join(PaymentReceipt, PaymentAllocation.payment_id == PaymentReceipt.id)
        .filter(PaymentReceipt.status == "RECORDED", PaymentAllocation.released_at.is_(None))
        .scalar()
        or 0
    )
    return max(0, Received - Applied)


def Overview(db: Session) -> dict[str, Any]:
    from app.services.payments.expenses_service import ExpensesTotal

    Today = _Today()
    ThisMonth = _MonthStart(Today)
    LastMonth = _MonthStart(Today, 1)
    TodayReport = CollectionsReport(db, Filters={"dateFrom": Today.isoformat(), "dateTo": Today.isoformat()}, IncludePayments=False)
    Dues = DuesReport(db, Filters={})
    Series = []
    for Back in range(5, -1, -1):
        Start = _MonthStart(Today, Back)
        End = _NextMonth(Start)
        Series.append({
            "month": Start.strftime("%Y-%m"),
            "label": f"{calendar.month_abbr[Start.month]} {Start.year}",
            "collected": _Money(_CollectedBetween(db, Start, End)),
            "spent": _Money(ExpensesTotal(db, Start, End)),
        })
    Recent = db.query(PaymentReceipt).order_by(PaymentReceipt.created_at.desc(), PaymentReceipt.receipt_number.desc()).limit(8).all()
    ThisMonthCollected = _CollectedBetween(db, ThisMonth, Today + timedelta(days=1))
    ThisMonthSpent = ExpensesTotal(db, ThisMonth, Today + timedelta(days=1))
    return {
        "today": Today.isoformat(),
        "todayCollected": TodayReport["total"],
        "todayPaymentCount": TodayReport["paymentCount"],
        "todayByMethod": TodayReport["byMethod"],
        "thisMonthLabel": f"{calendar.month_name[ThisMonth.month]} {ThisMonth.year}",
        "thisMonthCollected": _Money(ThisMonthCollected),
        "lastMonthLabel": f"{calendar.month_name[LastMonth.month]} {LastMonth.year}",
        "lastMonthCollected": _Money(_CollectedBetween(db, LastMonth, ThisMonth)),
        "thisMonthSpent": _Money(ThisMonthSpent),
        "thisMonthNet": _Money(ThisMonthCollected - ThisMonthSpent),
        "due": Dues["total"],
        "overdue": Dues["overdue"],
        "studentsWithDues": Dues["studentCount"],
        "unpaidInvoices": Dues["invoiceCount"],
        "buckets": Dues["buckets"],
        "advanceHeld": _Money(_AdvanceHeld(db)),
        "series": Series,
        "recentPayments": [PaymentPayload(db, Row, Names={}, Detailed=False) for Row in Recent],
    }
