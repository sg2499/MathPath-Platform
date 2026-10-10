"""Payments revamp R1 (2026-10-09): the Payments Home desk and the ⌘K
search used across the Payments pages.

  * PaymentsHome -- what the office needs at a glance: today's money by
    method, this month, what is due and overdue, what needs attention
    (online payments still being confirmed or not recorded, failed tries
    today, the biggest overdue accounts, setup gaps), and the latest
    payments and online payments.
  * Search -- one box for students (name, ID, parent, mobile), invoices,
    receipts (number or reference), Razorpay order or payment ids, and
    (revamp R6) expenses by number, bill number, item or vendor.

Read only: nothing here changes data.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models import (
    OnlinePaymentOrder,
    PaymentCentre,
    PaymentInvoice,
    PaymentMethodLine,
    PaymentReceipt,
    Student,
    User,
)
from app.services.payments.money import FormatIndianRupees

SEARCH_MIN_LENGTH = 2
SEARCH_LIMIT = 6


def _Money(Paise: int) -> dict[str, Any]:
    return {"paise": int(Paise), "display": FormatIndianRupees(int(Paise))}


def PaymentsHome(db: Session) -> dict[str, Any]:
    from app.services.payments.online_service import OnlineSettingsPayload, OrderPayload, _DisplayStatus
    from app.services.payments.receipts_service import _ReceiptNumberingReady
    from app.services.payments.reports_service import Overview
    from app.services.payments.invoices_service import TodayInIndia, _InvoiceNumbering

    from app.services.payments.reports_service import DuesReport

    Base = Overview(db)
    Dues = DuesReport(db, Filters={"sort": "overdue"})
    Overdue = [Row for Row in Dues["students"] if Row["overduePaise"] > 0]
    Overdue.sort(key=lambda Row: (-Row["overduePaise"], -Row["maxDaysOverdue"]))

    # Online payments that need someone to look.
    Since = datetime.now(timezone.utc) - timedelta(days=30)
    Watch = (
        db.query(OnlinePaymentOrder)
        .filter(
            OnlinePaymentOrder.created_at >= Since,
            or_(
                OnlinePaymentOrder.status == "ATTENTION",
                (OnlinePaymentOrder.status.in_(("CREATED", "FAILED")) & OnlinePaymentOrder.razorpay_payment_id.isnot(None)),
            ),
        )
        .order_by(OnlinePaymentOrder.created_at.desc())
        .limit(10)
        .all()
    )
    Today = TodayInIndia()
    from app.services.payments.invoices_service import INDIA

    DayStart = datetime.combine(Today, datetime.min.time(), INDIA)
    FailedToday = (
        db.query(func.count(OnlinePaymentOrder.id))
        .filter(OnlinePaymentOrder.status == "FAILED", OnlinePaymentOrder.razorpay_payment_id.is_(None), OnlinePaymentOrder.updated_at >= DayStart)
        .scalar()
    ) or 0
    RecentOnline = db.query(OnlinePaymentOrder).order_by(OnlinePaymentOrder.created_at.desc()).limit(5).all()

    Online = OnlineSettingsPayload(db)
    Setup = []
    if not _ReceiptNumberingReady(db)["numberingReady"]:
        Setup.append({"key": "receipt-numbering", "text": "Set the starting receipt number before recording payments.", "href": "/admin/payments/settings?tab=numbering"})
    if not _InvoiceNumbering(db)["numberingReady"]:
        Setup.append({"key": "invoice-numbering", "text": "Set the starting invoice number before generating invoices.", "href": "/admin/payments/settings?tab=numbering"})
    if Online["onlinePaymentsEnabled"] and not Online["onlinePaymentsLive"]:
        Setup.append({"key": "online", "text": "Online payments are switched on but not working.", "href": "/admin/payments/settings?tab=online"})
    WithoutCentre = db.query(func.count(Student.id)).filter(Student.centre_id.is_(None), Student.is_active == True).scalar() or 0  # noqa: E712
    if WithoutCentre:
        Setup.append({"key": "centres", "text": f"{WithoutCentre} active student{'s' if WithoutCentre != 1 else ''} have no centre, so their invoices print every centre's address.", "href": "/admin/payments/settings?tab=centres"})

    from app.services.payments.dayclose_service import HomeDayClose

    DayClose = HomeDayClose(db)
    from app.services.payments.billing_service import EnsureMonthlyDrafts, HomeBilling

    # The automatic monthly drafts also run here, in case the background
    # check has not yet (for example, right after a restart on the 1st).
    try:
        EnsureMonthlyDrafts(db)
    except Exception:  # never let Home fail because of it
        db.rollback()
    Billing = HomeBilling(db)
    from app.services.payments.followups_service import HomeFollowUps

    FollowUpsSummary = HomeFollowUps(db)
    from app.services.payments.insights_service import Activity, HomeInsights

    InsightsSummary = HomeInsights(db)
    LatestActivity = Activity(db, Limit=8)["items"]
    return {
        "today": Base["today"],
        "dayClose": DayClose,
        "billing": Billing,
        "followUps": FollowUpsSummary,
        "insights": InsightsSummary,
        "activity": LatestActivity,
        "todayCollected": Base["todayCollected"],
        "todayPaymentCount": Base["todayPaymentCount"],
        "todayByMethod": Base["todayByMethod"],
        "thisMonthLabel": Base["thisMonthLabel"],
        "thisMonthCollected": Base["thisMonthCollected"],
        "lastMonthLabel": Base["lastMonthLabel"],
        "lastMonthCollected": Base["lastMonthCollected"],
        "due": Base["due"],
        "overdue": Base["overdue"],
        "studentsWithDues": Base["studentsWithDues"],
        "studentsOverdue": len(Overdue),
        "unpaidInvoices": Base["unpaidInvoices"],
        "advanceHeld": Base["advanceHeld"],
        "attention": {
            "online": [OrderPayload(db, Row) for Row in Watch],
            "failedToday": int(FailedToday),
            "overdueStudents": [
                {
                    "studentId": Row["studentId"],
                    "studentName": Row["studentName"],
                    "studentCode": Row["studentCode"],
                    "mobile": Row["mobile"],
                    "overdue": _Money(Row["overduePaise"]),
                    "due": _Money(Row["duePaise"]),
                    "maxDaysOverdue": Row["maxDaysOverdue"],
                    "invoiceCount": len(Row["invoices"]),
                }
                for Row in Overdue[:6]
            ],
            "setup": Setup,
        },
        "online": {
            "live": Online["onlinePaymentsLive"],
            "enabled": Online["onlinePaymentsEnabled"],
            "keyMode": Online["keyMode"],
            "recent": [{**OrderPayload(db, Row), "displayStatus": _DisplayStatus(Row)} for Row in RecentOnline],
        },
        "recentPayments": Base["recentPayments"][:6],
    }


# ----------------------------------------------------------------------------
# ⌘K search
# ----------------------------------------------------------------------------

def _Digits(Text: str) -> str:
    return "".join(Character for Character in Text if Character.isdigit())


def Search(db: Session, Query: Any) -> dict[str, Any]:
    from app.services.payments.invoices_service import InvoicePayload, TodayInIndia
    from app.services.payments.receipts_service import AdvanceBalances, InvoiceBalance

    Text = " ".join(str(Query or "").split())[:80]
    Empty = {"query": Text, "students": [], "invoices": [], "receipts": [], "online": [], "expenses": []}
    if len(Text) < SEARCH_MIN_LENGTH:
        return Empty
    Like = f"%{Text.lower()}%"
    Digits = _Digits(Text)
    PhoneLike = f"%{Digits[-10:]}%" if len(Digits) >= 5 else None

    # Students
    StudentFilters = [
        func.lower(User.full_name).like(Like),
        func.lower(Student.student_code).like(Like),
        func.lower(func.coalesce(Student.custom_id, "")).like(Like),
        func.lower(func.coalesce(Student.father_name, "")).like(Like),
        func.lower(func.coalesce(Student.mother_name, "")).like(Like),
    ]
    if PhoneLike:
        StudentFilters += [
            func.coalesce(Student.father_mobile, "").like(PhoneLike),
            func.coalesce(Student.mother_mobile, "").like(PhoneLike),
            func.coalesce(Student.parent_contact, "").like(PhoneLike),
        ]
    StudentRows = (
        db.query(Student, User)
        .join(User, Student.user_id == User.id)
        .filter(or_(*StudentFilters))
        .order_by(Student.is_active.desc(), func.lower(User.full_name).asc())
        .limit(SEARCH_LIMIT)
        .all()
    )
    Ids = [Row.id for Row, _ in StudentRows]
    DueByStudent: dict[str, int] = {}
    if Ids:
        for Invoice in db.query(PaymentInvoice).filter(PaymentInvoice.student_id.in_(Ids), PaymentInvoice.status.in_(("PENDING", "PART_PAID"))).all():
            DueByStudent[Invoice.student_id] = DueByStudent.get(Invoice.student_id, 0) + InvoiceBalance(Invoice)
    Advances = AdvanceBalances(db, Ids)
    Centres = {Row.id: Row.name for Row in db.query(PaymentCentre).all()}
    Students = [
        {
            "studentId": StudentRow.id,
            "name": UserRow.full_name,
            "studentCode": StudentRow.student_code,
            "customId": StudentRow.custom_id,
            "parentName": StudentRow.father_name or StudentRow.mother_name,
            "mobile": StudentRow.father_mobile or StudentRow.mother_mobile or StudentRow.parent_contact,
            "centreName": Centres.get(StudentRow.centre_id) if StudentRow.centre_id else None,
            "isActive": bool(StudentRow.is_active and UserRow.is_active),
            "due": _Money(DueByStudent.get(StudentRow.id, 0)),
            "advance": _Money(Advances.get(StudentRow.id, 0)),
        }
        for StudentRow, UserRow in StudentRows
    ]

    # Invoices (by number)
    Today = TodayInIndia()
    InvoiceRows = (
        db.query(PaymentInvoice)
        .filter(func.lower(PaymentInvoice.invoice_number).like(Like))
        .order_by(PaymentInvoice.invoice_date.desc(), PaymentInvoice.invoice_number.desc())
        .limit(SEARCH_LIMIT)
        .all()
    )
    Invoices = []
    for Row in InvoiceRows:
        Payload = InvoicePayload(Row, Today=Today)
        Invoices.append({Key: Payload[Key] for Key in ("invoiceId", "invoiceNumber", "studentId", "studentName", "studentCode", "feeName", "periodLabel", "amountDisplay", "balanceDisplay", "status", "statusLabel", "isOverdue")})

    # Receipts (by number or method reference)
    ReceiptRows = (
        db.query(PaymentReceipt)
        .filter(
            or_(
                func.lower(PaymentReceipt.receipt_number).like(Like),
                PaymentReceipt.id.in_(db.query(PaymentMethodLine.payment_id).filter(func.lower(func.coalesce(PaymentMethodLine.reference, "")).like(Like))),
            )
        )
        .order_by(PaymentReceipt.payment_date.desc(), PaymentReceipt.receipt_number.desc())
        .limit(SEARCH_LIMIT)
        .all()
    )
    import json

    Receipts = []
    for Row in ReceiptRows:
        Snapshot = json.loads(Row.snapshot_json)
        Lines = db.query(PaymentMethodLine).filter(PaymentMethodLine.payment_id == Row.id).order_by(PaymentMethodLine.line_order).all()
        Receipts.append({
            "paymentId": Row.id,
            "receiptNumber": Row.receipt_number,
            "studentId": Row.student_id,
            "studentName": Snapshot["student"]["name"],
            "studentCode": Snapshot["student"]["studentCode"],
            "paymentDate": Row.payment_date.isoformat(),
            "amountDisplay": FormatIndianRupees(Row.amount_paise),
            "status": Row.status,
            "channel": Row.channel,
            "references": [Line.reference for Line in Lines if Line.reference],
        })

    # Razorpay ids
    Online = []
    if "order_" in Text.lower() or "pay_" in Text.lower() or len(Text) >= 6:
        OrderRows = (
            db.query(OnlinePaymentOrder)
            .filter(
                or_(
                    func.lower(OnlinePaymentOrder.razorpay_order_id).like(Like),
                    func.lower(func.coalesce(OnlinePaymentOrder.razorpay_payment_id, "")).like(Like),
                )
            )
            .order_by(OnlinePaymentOrder.created_at.desc())
            .limit(SEARCH_LIMIT)
            .all()
        )
        from app.services.payments.online_service import OrderPayload

        for Row in OrderRows:
            Payload = OrderPayload(db, Row)
            Online.append({Key: Payload[Key] for Key in ("orderRef", "razorpayOrderId", "razorpayPaymentId", "studentId", "studentName", "amountDisplay", "status", "statusLabel", "receiptNumber")})

    # Expenses (revamp R6): by number, bill number, item or vendor.
    from app.models import Expense

    ExpenseRows = (
        db.query(Expense)
        .filter(
            or_(
                func.lower(Expense.expense_number).like(Like),
                func.lower(func.coalesce(Expense.bill_number, "")).like(Like),
                func.lower(Expense.item).like(Like),
                func.lower(func.coalesce(Expense.vendor, "")).like(Like),
            )
        )
        .order_by(Expense.expense_date.desc(), Expense.expense_number.desc())
        .limit(SEARCH_LIMIT)
        .all()
    )
    Expenses = [
        {
            "expenseId": Row.id,
            "expenseNumber": Row.expense_number,
            "expenseDate": Row.expense_date.isoformat(),
            "item": Row.item,
            "vendor": Row.vendor,
            "categoryName": Row.category_name,
            "amountDisplay": FormatIndianRupees(Row.amount_paise),
            "status": Row.status,
        }
        for Row in ExpenseRows
    ]

    return {"query": Text, "students": Students, "invoices": Invoices, "receipts": Receipts, "online": Online, "expenses": Expenses}
