"""Payments Phase 3 (2026-10-08): payments received at the counter, money
receipts, advances and each student's account.

  * RecordPayment -- tick invoices (part-payment allowed), split methods
    with references, optional discount (with a reason), and optionally keep
    money beyond what is due as the student's advance. Numbered MP-MRCPT-xxx.
  * EditPayment -- everything can be changed, with a reason; the receipt
    keeps its number and the history keeps before and after.
  * CancelPayment -- with a reason; the receipt stays, marked Cancelled.
  * Advance -- a payment's money not applied to any invoice. It is applied
    automatically to the student's next invoices (oldest payment first,
    oldest invoice first), or on demand with ApplyAdvance.

What an invoice has received is always worked out again from its live
allocations (RecomputeInvoice), never adjusted by hand, so it cannot drift.

Concurrency: every change locks the student's row first (then the
invoices), so two admins working on the same student at once are run one
after the other and can never overpay an invoice or spend one advance
twice. A double click is caught by the idempotency key.
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import (
    Level,
    PaymentAllocation,
    PaymentCentre,
    PaymentInvoice,
    PaymentMethodLine,
    PaymentNumberSequence,
    PaymentReceipt,
    Student,
    User,
)
from app.services.payments.audit import WritePaymentAudit
from app.services.payments.money import MAX_AMOUNT_PAISE, FormatIndianRupees, PaiseToRupeesString
from app.services.payments.numbering import EnsureNumberSequences, FormatDocumentNumber, TakeNextNumber

METHOD_LABELS = {
    "CASH": "Cash",
    "UPI": "UPI",
    "CHEQUE": "Cheque",
    "NET_BANKING": "Net Banking",
    "CREDIT_CARD": "Credit Card",
    "DEBIT_CARD": "Debit Card",
    "RAZORPAY": "Razorpay",
    "OTHERS": "Others",
}
COUNTER_METHODS = ("CASH", "UPI", "CHEQUE", "NET_BANKING", "CREDIT_CARD", "DEBIT_CARD", "OTHERS")
REFERENCE_REQUIRED = ("UPI", "CHEQUE", "NET_BANKING")
MAX_METHOD_LINES = 6
MAX_ALLOCATIONS = 60
MAX_RECEIPTS_PER_PDF = 500
STATUS_LABELS = {"RECORDED": "Received", "CANCELLED": "Cancelled"}
STAFF_ROLES = ("SUPER_ADMIN", "ADMIN")


def _Today() -> date:
    from app.services.payments.invoices_service import TodayInIndia

    return TodayInIndia()


def _Paise(Value: Any, Label: str, *, AllowZero: bool = True) -> int:
    if isinstance(Value, bool):
        api_error(422, "AMOUNT_INVALID", f"{Label} is not a valid amount.")
    try:
        Number = int(Value)
    except (TypeError, ValueError):
        api_error(422, "AMOUNT_INVALID", f"{Label} is not a valid amount.")
    if isinstance(Value, float) and Value != Number:
        api_error(422, "AMOUNT_INVALID", f"{Label} is not a valid amount.")
    if Number < 0:
        api_error(422, "AMOUNT_NEGATIVE", f"{Label} cannot be negative.")
    if Number == 0 and not AllowZero:
        api_error(422, "AMOUNT_ZERO", f"{Label} must be more than zero.")
    if Number > MAX_AMOUNT_PAISE:
        api_error(422, "AMOUNT_TOO_LARGE", f"{Label} is too large.")
    return Number


def _Clean(Value: Any, Limit: int) -> str | None:
    Text = re.sub(r"\s+", " ", str(Value or "")).strip()
    return Text[:Limit] or None


# ----------------------------------------------------------------------------
# Live sums
# ----------------------------------------------------------------------------

def _LiveAllocationsQuery(db: Session):
    return (
        db.query(PaymentAllocation)
        .join(PaymentReceipt, PaymentAllocation.payment_id == PaymentReceipt.id)
        .filter(PaymentAllocation.released_at.is_(None), PaymentReceipt.status == "RECORDED")
    )


def RecomputeInvoice(db: Session, Invoice: PaymentInvoice) -> None:
    """paid / discount / status from the invoice's live allocations."""
    db.flush()
    Paid, Discount = (
        _LiveAllocationsQuery(db)
        .filter(PaymentAllocation.invoice_id == Invoice.id)
        .with_entities(func.coalesce(func.sum(PaymentAllocation.amount_paise), 0), func.coalesce(func.sum(PaymentAllocation.discount_paise), 0))
        .one()
    )
    Invoice.paid_paise = int(Paid or 0)
    Invoice.discount_paise = int(Discount or 0)
    if Invoice.status != "CANCELLED":
        Settled = Invoice.paid_paise + Invoice.discount_paise
        Invoice.status = "PAID" if Settled >= Invoice.amount_paise else ("PART_PAID" if Settled > 0 else "PENDING")
    db.flush()


def InvoiceBalance(Invoice: PaymentInvoice) -> int:
    if Invoice.status == "CANCELLED":
        return 0
    return max(0, Invoice.amount_paise - (Invoice.paid_paise or 0) - (Invoice.discount_paise or 0))


def _AllocatedByPayment(db: Session, PaymentIds: list[str]) -> dict[str, int]:
    if not PaymentIds:
        return {}
    Rows = (
        db.query(PaymentAllocation.payment_id, func.coalesce(func.sum(PaymentAllocation.amount_paise), 0))
        .filter(PaymentAllocation.payment_id.in_(PaymentIds), PaymentAllocation.released_at.is_(None))
        .group_by(PaymentAllocation.payment_id)
        .all()
    )
    return {PaymentId: int(Total or 0) for PaymentId, Total in Rows}


def AdvanceRemaining(db: Session, Payment: PaymentReceipt) -> int:
    if Payment.status != "RECORDED":
        return 0
    return max(0, Payment.amount_paise - _AllocatedByPayment(db, [Payment.id]).get(Payment.id, 0))


def _PaymentsWithAdvance(db: Session, StudentId: str) -> list[tuple[PaymentReceipt, int]]:
    Payments = (
        db.query(PaymentReceipt)
        .filter(PaymentReceipt.student_id == StudentId, PaymentReceipt.status == "RECORDED")
        .order_by(PaymentReceipt.payment_date.asc(), PaymentReceipt.created_at.asc(), PaymentReceipt.receipt_number.asc())
        .all()
    )
    Allocated = _AllocatedByPayment(db, [Row.id for Row in Payments])
    return [(Row, Row.amount_paise - Allocated.get(Row.id, 0)) for Row in Payments if Row.amount_paise - Allocated.get(Row.id, 0) > 0]


def StudentAdvanceBalance(db: Session, StudentId: str) -> int:
    return sum(Left for _, Left in _PaymentsWithAdvance(db, StudentId))


def AdvanceBalances(db: Session, StudentIds: list[str]) -> dict[str, int]:
    """Advance per student, for many students in two queries."""
    if not StudentIds:
        return {}
    Payments = (
        db.query(PaymentReceipt.id, PaymentReceipt.student_id, PaymentReceipt.amount_paise)
        .filter(PaymentReceipt.student_id.in_(StudentIds), PaymentReceipt.status == "RECORDED")
        .all()
    )
    Allocated = _AllocatedByPayment(db, [Row[0] for Row in Payments])
    Result: dict[str, int] = defaultdict(int)
    for PaymentId, StudentId, Amount in Payments:
        Result[StudentId] += max(0, Amount - Allocated.get(PaymentId, 0))
    return {Key: Value for Key, Value in Result.items() if Value > 0}


def _LockStudent(db: Session, StudentId: str) -> Student:
    StudentRow = db.query(Student).filter(Student.id == StudentId).with_for_update().first()
    if not StudentRow:
        api_error(404, "STUDENT_NOT_FOUND", "That student was not found.")
    return StudentRow


# ----------------------------------------------------------------------------
# Advance
# ----------------------------------------------------------------------------

def PlanAdvance(Advances: list[int], Balances: list[int]) -> list[tuple[int, int, int]]:
    """Pure FIFO: (advance index, invoice index, amount) applications."""
    Plan = []
    Left = list(Advances)
    Need = list(Balances)
    AdvanceIndex = 0
    for InvoiceIndex in range(len(Need)):
        while Need[InvoiceIndex] > 0 and AdvanceIndex < len(Left):
            Take = min(Left[AdvanceIndex], Need[InvoiceIndex])
            if Take > 0:
                Plan.append((AdvanceIndex, InvoiceIndex, Take))
                Left[AdvanceIndex] -= Take
                Need[InvoiceIndex] -= Take
            if Left[AdvanceIndex] == 0:
                AdvanceIndex += 1
    return Plan


def ApplyAdvance(db: Session, *, StudentId: str, Actor: User | None, InvoiceIds: list[str] | None = None, LockStudent: bool = True) -> int:
    """Applies the student's advance to their unpaid invoices (the given ones,
    or all), oldest invoice first. Never commits. Returns paise applied."""
    if LockStudent:
        _LockStudent(db, StudentId)
    Sources = _PaymentsWithAdvance(db, StudentId)
    if not Sources:
        return 0
    Query = db.query(PaymentInvoice).filter(
        PaymentInvoice.student_id == StudentId, PaymentInvoice.status.in_(("PENDING", "PART_PAID"))
    )
    if InvoiceIds is not None:
        if not InvoiceIds:
            return 0
        Query = Query.filter(PaymentInvoice.id.in_(InvoiceIds))
    Invoices = Query.order_by(PaymentInvoice.invoice_date.asc(), PaymentInvoice.invoice_number.asc()).with_for_update().all()
    Balances = [InvoiceBalance(Row) for Row in Invoices]
    Plan = PlanAdvance([Left for _, Left in Sources], Balances)
    if not Plan:
        return 0
    Applied = 0
    Touched: dict[str, PaymentInvoice] = {}
    PerPayment: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for SourceIndex, InvoiceIndex, Amount in Plan:
        Payment = Sources[SourceIndex][0]
        Invoice = Invoices[InvoiceIndex]
        db.add(PaymentAllocation(payment_id=Payment.id, invoice_id=Invoice.id, amount_paise=Amount, discount_paise=0, kind="ADVANCE", created_by_user_id=Actor.id if Actor else None))
        Touched[Invoice.id] = Invoice
        PerPayment[Payment.id].append({"invoiceNumber": Invoice.invoice_number, "amount": PaiseToRupeesString(Amount)})
        Applied += Amount
    db.flush()
    for Invoice in Touched.values():
        RecomputeInvoice(db, Invoice)
    for Payment, _ in Sources:
        if Payment.id in PerPayment:
            WritePaymentAudit(
                db, EntityType="PAYMENT", EntityId=Payment.id, Action="ADVANCE_APPLIED", Actor=Actor,
                After={"receiptNumber": Payment.receipt_number, "student": json.loads(Payment.snapshot_json)["student"]["name"], "appliedTo": PerPayment[Payment.id], "advanceLeft": PaiseToRupeesString(AdvanceRemaining(db, Payment))},
            )
    return Applied


# ----------------------------------------------------------------------------
# Request checking (record and edit)
# ----------------------------------------------------------------------------

def _ReceiptNumberingReady(db: Session) -> dict[str, Any]:
    EnsureNumberSequences(db)
    Sequence = db.get(PaymentNumberSequence, "RECEIPT")
    return {
        "numberingReady": bool(Sequence.is_configured),
        "nextNumber": FormatDocumentNumber(Sequence.prefix, Sequence.pad_width, Sequence.next_number) if Sequence.is_configured else None,
    }


def _CheckedPayment(db: Session, StudentRow: Student, Request: dict[str, Any], *, Editing: PaymentReceipt | None = None) -> dict[str, Any]:
    from app.services.payments.invoices_service import _ParseDate

    PaymentDate = _ParseDate(Request.get("paymentDate"), "Payment date") or _Today()
    if PaymentDate > _Today():
        api_error(422, "DATE_IN_FUTURE", "The payment date cannot be in the future.")
    if PaymentDate < date(2020, 1, 1):
        api_error(422, "DATE_INVALID", "The payment date looks wrong. Please check the year.")

    # Who received it: an admin (defaults to the person recording).
    ReceivedById = str(Request.get("receivedByUserId") or "").strip() or None
    Receiver = None
    if ReceivedById:
        Receiver = db.get(User, ReceivedById)
        if not Receiver or Receiver.role not in STAFF_ROLES:
            api_error(422, "RECEIVED_BY_INVALID", "Choose who received the payment from the list.")

    # Method lines.
    Methods = []
    for Index, Line in enumerate(Request.get("methods") or []):
        Method = str((Line or {}).get("method") or "").strip().upper()
        if Method not in COUNTER_METHODS and not (Editing and Editing.channel == "ONLINE" and Method == "RAZORPAY"):
            api_error(422, "METHOD_INVALID", "Choose how the money was paid for every line.")
        Amount = _Paise((Line or {}).get("amountPaise"), f"{METHOD_LABELS[Method]} amount", AllowZero=False)
        Reference = _Clean((Line or {}).get("reference"), 120)
        if Method in REFERENCE_REQUIRED and not Reference:
            api_error(422, "REFERENCE_REQUIRED", f"Enter the {METHOD_LABELS[Method]} reference number.")
        Methods.append({"method": Method, "amountPaise": Amount, "reference": Reference, "order": Index})
    if not Methods:
        api_error(422, "METHOD_REQUIRED", "Add how the money was paid (for example Cash or UPI).")
    if len(Methods) > MAX_METHOD_LINES:
        api_error(422, "TOO_MANY_METHODS", f"Use at most {MAX_METHOD_LINES} payment methods.")
    Total = sum(Line["amountPaise"] for Line in Methods)
    if Total > MAX_AMOUNT_PAISE:
        api_error(422, "AMOUNT_TOO_LARGE", "The total is too large.")

    # Invoices being paid.
    Lines: dict[str, dict[str, int]] = {}
    for Line in Request.get("allocations") or []:
        InvoiceId = str((Line or {}).get("invoiceId") or "").strip()
        if not InvoiceId:
            continue
        Amount = _Paise((Line or {}).get("amountPaise", 0), "Amount for an invoice")
        Discount = _Paise((Line or {}).get("discountPaise", 0), "Discount for an invoice")
        if Amount + Discount == 0:
            continue
        Previous = Lines.get(InvoiceId, {"amount": 0, "discount": 0})
        Lines[InvoiceId] = {"amount": Previous["amount"] + Amount, "discount": Previous["discount"] + Discount}
    if len(Lines) > MAX_ALLOCATIONS:
        api_error(422, "TOO_MANY_INVOICES", f"Pay at most {MAX_ALLOCATIONS} invoices at a time.")
    Invoices: dict[str, PaymentInvoice] = {}
    if Lines:
        Rows = db.query(PaymentInvoice).filter(PaymentInvoice.id.in_(list(Lines))).order_by(PaymentInvoice.id).with_for_update().all()
        Invoices = {Row.id: Row for Row in Rows}
    # This payment's own direct allocations do not count against the dues
    # while it is being edited.
    OwnDirect: dict[str, dict[str, int]] = defaultdict(lambda: {"amount": 0, "discount": 0})
    OwnAdvanceUsed = 0
    if Editing:
        for Allocation in db.query(PaymentAllocation).filter(PaymentAllocation.payment_id == Editing.id, PaymentAllocation.released_at.is_(None)).all():
            if Allocation.kind == "DIRECT":
                OwnDirect[Allocation.invoice_id]["amount"] += Allocation.amount_paise
                OwnDirect[Allocation.invoice_id]["discount"] += Allocation.discount_paise
            else:
                OwnAdvanceUsed += Allocation.amount_paise
    for InvoiceId, Line in Lines.items():
        Invoice = Invoices.get(InvoiceId)
        if not Invoice or Invoice.student_id != StudentRow.id:
            api_error(404, "INVOICE_NOT_FOUND", "One of the chosen invoices was not found for this student. Refresh and try again.")
        if Invoice.status == "CANCELLED":
            api_error(409, "INVOICE_CANCELLED", f"{Invoice.invoice_number} is cancelled and cannot be paid.")
        RecomputeInvoice(db, Invoice)
        Open = InvoiceBalance(Invoice) + OwnDirect[InvoiceId]["amount"] + OwnDirect[InvoiceId]["discount"]
        if Line["amount"] + Line["discount"] > Open:
            api_error(
                409, "MORE_THAN_DUE",
                f"{Invoice.invoice_number} has {FormatIndianRupees(Open)} due; {FormatIndianRupees(Line['amount'] + Line['discount'])} cannot be applied to it.",
            )

    Applied = sum(Line["amount"] for Line in Lines.values())
    Discount = sum(Line["discount"] for Line in Lines.values())
    if Applied + OwnAdvanceUsed > Total:
        if OwnAdvanceUsed:
            api_error(
                409, "ADVANCE_ALREADY_USED",
                f"{FormatIndianRupees(OwnAdvanceUsed)} of this payment's advance is already used on later invoices, "
                f"so the amount received must be at least {FormatIndianRupees(Applied + OwnAdvanceUsed)}.",
            )
        api_error(422, "METHODS_SHORT", f"The payment methods add up to {FormatIndianRupees(Total)}, but {FormatIndianRupees(Applied)} is applied to invoices.")
    Advance = Total - Applied - OwnAdvanceUsed
    if Advance > 0 and not Request.get("keepAdvance"):
        api_error(
            422, "EXTRA_NOT_ALLOWED",
            f"{FormatIndianRupees(Advance)} is more than is applied to the invoices. Tick “Keep the extra as advance”, or correct the amounts.",
        )
    DiscountReason = _Clean(Request.get("discountReason"), 300)
    if Discount and not DiscountReason:
        api_error(422, "DISCOUNT_REASON_REQUIRED", "Please give a reason for the discount.")

    return {
        "paymentDate": PaymentDate,
        "payBy": _Clean(Request.get("payBy"), 150),
        "receiver": Receiver,
        "note": _Clean(Request.get("note"), 500),
        "methods": Methods,
        "total": Total,
        "lines": Lines,
        "invoices": Invoices,
        "applied": Applied,
        "discount": Discount,
        "discountReason": DiscountReason if Discount else None,
        "advance": Advance,
    }


# ----------------------------------------------------------------------------
# Payloads
# ----------------------------------------------------------------------------

def _MethodSummary(Lines: list[PaymentMethodLine]) -> str:
    return ", ".join(f"{METHOD_LABELS.get(Line.method, Line.method)} {FormatIndianRupees(Line.amount_paise)}" for Line in Lines)


def PaymentPayload(db: Session, Payment: PaymentReceipt, *, Names: dict[str, str] | None = None, Detailed: bool = True) -> dict[str, Any]:
    Snapshot = json.loads(Payment.snapshot_json)
    Lines = db.query(PaymentMethodLine).filter(PaymentMethodLine.payment_id == Payment.id).order_by(PaymentMethodLine.line_order).all()
    Names = Names if Names is not None else _UserNames(db, {Payment.created_by_user_id, Payment.edited_by_user_id, Payment.cancelled_by_user_id})
    Allocations = (
        db.query(PaymentAllocation, PaymentInvoice)
        .join(PaymentInvoice, PaymentAllocation.invoice_id == PaymentInvoice.id)
        .filter(PaymentAllocation.payment_id == Payment.id)
        .order_by(PaymentAllocation.created_at.asc(), PaymentInvoice.invoice_number.asc())
        .all()
    )
    Live = [(A, I) for A, I in Allocations if A.released_at is None]
    Advance = 0 if Payment.status != "RECORDED" else max(0, Payment.amount_paise - sum(A.amount_paise for A, _ in Live))
    from app.services.payments.invoices_service import PeriodLabel

    Payload = {
        "paymentId": Payment.id,
        "receiptNumber": Payment.receipt_number,
        "studentId": Payment.student_id,
        "studentName": Snapshot["student"]["name"],
        "studentCode": Snapshot["student"]["studentCode"],
        "centreName": (Snapshot.get("centre") or {}).get("name"),
        "paymentDate": Payment.payment_date.isoformat(),
        "payBy": Payment.pay_by,
        "receivedByUserId": Payment.received_by_user_id,
        "receivedByName": Payment.received_by_name,
        "amountPaise": Payment.amount_paise,
        "amountDisplay": FormatIndianRupees(Payment.amount_paise),
        "discountPaise": Payment.discount_paise,
        "discountDisplay": FormatIndianRupees(Payment.discount_paise),
        "discountReason": Payment.discount_reason,
        "advancePaise": Advance,
        "advanceDisplay": FormatIndianRupees(Advance),
        "note": Payment.note,
        "channel": Payment.channel,
        "status": Payment.status,
        "statusLabel": STATUS_LABELS.get(Payment.status, Payment.status),
        "methods": [
            {"method": Line.method, "methodLabel": METHOD_LABELS.get(Line.method, Line.method), "amountPaise": Line.amount_paise, "amountDisplay": FormatIndianRupees(Line.amount_paise), "reference": Line.reference}
            for Line in Lines
        ],
        "methodSummary": _MethodSummary(Lines),
        "invoiceNumbers": sorted({I.invoice_number for _, I in Live}),
        "source": Payment.source,
        "createdAt": Payment.created_at.isoformat() if Payment.created_at else None,
        "createdByName": Names.get(Payment.created_by_user_id),
        "editedAt": Payment.edited_at.isoformat() if Payment.edited_at else None,
        "editedByName": Names.get(Payment.edited_by_user_id),
        "cancelledAt": Payment.cancelled_at.isoformat() if Payment.cancelled_at else None,
        "cancelledByName": Names.get(Payment.cancelled_by_user_id),
        "cancelReason": Payment.cancel_reason,
    }
    if Detailed:
        Payload["allocations"] = [
            {
                "allocationId": A.id,
                "invoiceId": I.id,
                "invoiceNumber": I.invoice_number,
                "feeName": I.fee_name,
                "periodLabel": PeriodLabel(I.billing_month, I.billing_year),
                "amountPaise": A.amount_paise,
                "amountDisplay": FormatIndianRupees(A.amount_paise),
                "discountPaise": A.discount_paise,
                "discountDisplay": FormatIndianRupees(A.discount_paise),
                "kind": A.kind,
                "released": A.released_at is not None,
                "releaseReason": A.release_reason,
                "invoiceStatus": I.status,
                "invoiceBalanceDisplay": FormatIndianRupees(InvoiceBalance(I)),
            }
            for A, I in Allocations
        ]
    return Payload


def _UserNames(db: Session, Ids: set[str | None]) -> dict[str, str]:
    Ids = {Id for Id in Ids if Id}
    if not Ids:
        return {}
    return {Row.id: Row.full_name for Row in db.query(User).filter(User.id.in_(Ids)).all()}


def _AuditShape(db: Session, Payment: PaymentReceipt) -> dict[str, Any]:
    Payload = PaymentPayload(db, Payment, Names={})
    return {
        "receiptNumber": Payment.receipt_number,
        "student": Payload["studentName"],
        "paymentDate": Payload["paymentDate"],
        "amount": PaiseToRupeesString(Payment.amount_paise),
        "discount": PaiseToRupeesString(Payment.discount_paise),
        "discountReason": Payment.discount_reason,
        "methods": Payload["methodSummary"],
        "appliedTo": ", ".join(
            f"{A['invoiceNumber']} {A['amountDisplay']}" + (f" + discount {A['discountDisplay']}" if A["discountPaise"] else "")
            for A in Payload["allocations"] if not A["released"]
        ) or None,
        "advance": PaiseToRupeesString(Payload["advancePaise"]),
        "payBy": Payment.pay_by,
        "receivedBy": Payment.received_by_name,
        "note": Payment.note,
        "status": Payment.status,
    }


# ----------------------------------------------------------------------------
# Record / edit / cancel
# ----------------------------------------------------------------------------

def _Snapshot(db: Session, StudentRow: Student) -> dict[str, Any]:
    from app.services.payments.invoices_service import _BusinessSnapshot, _CentreSnapshot, _StudentSnapshot

    UserRow = db.get(User, StudentRow.user_id)
    Centres = db.query(PaymentCentre).order_by(PaymentCentre.display_order.asc(), PaymentCentre.name.asc()).all()
    LevelRow = db.get(Level, StudentRow.current_level_id) if StudentRow.current_level_id else None
    return {
        "business": _BusinessSnapshot(db),
        "centre": _CentreSnapshot(db, StudentRow.centre_id, Centres),
        "student": _StudentSnapshot(StudentRow, UserRow, LevelRow),
    }


def _WriteDetails(db: Session, Payment: PaymentReceipt, Checked: dict[str, Any], Actor: User | None) -> set[str]:
    """Method lines and direct allocations. Returns the invoices touched."""
    for Line in Checked["methods"]:
        db.add(PaymentMethodLine(payment_id=Payment.id, method=Line["method"], amount_paise=Line["amountPaise"], reference=Line["reference"], line_order=Line["order"]))
    for InvoiceId, Line in Checked["lines"].items():
        db.add(PaymentAllocation(payment_id=Payment.id, invoice_id=InvoiceId, amount_paise=Line["amount"], discount_paise=Line["discount"], kind="DIRECT", created_by_user_id=Actor.id if Actor else None))
    db.flush()
    return set(Checked["lines"])


def RecordPayment(db: Session, *, StudentId: str, Request: dict[str, Any], IdempotencyKey: str, Actor: User | None) -> dict[str, Any]:
    Key = (IdempotencyKey or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,80}", Key):
        api_error(422, "IDEMPOTENCY_KEY_INVALID", "Refresh the page and try again.")
    Previous = db.query(PaymentReceipt).filter(PaymentReceipt.idempotency_key == Key).first()
    if Previous:
        return {**PaymentPayload(db, Previous), "replayed": True}
    StudentRow = _LockStudent(db, StudentId)
    Previous = db.query(PaymentReceipt).filter(PaymentReceipt.idempotency_key == Key).first()
    if Previous:
        db.rollback()
        return {**PaymentPayload(db, Previous), "replayed": True}
    if not _ReceiptNumberingReady(db)["numberingReady"]:
        api_error(409, "PAYMENT_NUMBERING_NOT_SET", "The starting receipt number has not been set yet. Set it in Payments > Payment Settings > Document Numbering first.")
    Checked = _CheckedPayment(db, StudentRow, Request)
    Receiver = Checked["receiver"] or Actor
    Number = TakeNextNumber(db, "RECEIPT")
    Payment = PaymentReceipt(
        receipt_number=Number,
        student_id=StudentRow.id,
        payment_date=Checked["paymentDate"],
        pay_by=Checked["payBy"],
        received_by_user_id=Receiver.id if Receiver else None,
        received_by_name=Receiver.full_name if Receiver else None,
        amount_paise=Checked["total"],
        discount_paise=Checked["discount"],
        discount_reason=Checked["discountReason"],
        note=Checked["note"],
        channel="COUNTER",
        status="RECORDED",
        centre_id=StudentRow.centre_id,
        snapshot_json=json.dumps(_Snapshot(db, StudentRow), sort_keys=True),
        idempotency_key=Key,
        source="ADMIN",
        created_by_user_id=Actor.id if Actor else None,
    )
    db.add(Payment)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        Previous = db.query(PaymentReceipt).filter(PaymentReceipt.idempotency_key == Key).first()
        if Previous:
            return {**PaymentPayload(db, Previous), "replayed": True}
        raise
    for InvoiceId in _WriteDetails(db, Payment, Checked, Actor):
        RecomputeInvoice(db, Checked["invoices"][InvoiceId])
    WritePaymentAudit(db, EntityType="PAYMENT", EntityId=Payment.id, Action="CREATE", Actor=Actor, After=_AuditShape(db, Payment))
    from app.services.payments.online_service import NotifyPaymentReceived

    NotifyPaymentReceived(db, Payment)
    db.commit()
    return {**PaymentPayload(db, Payment), "replayed": False}


def _LockPayment(db: Session, PaymentId: str) -> PaymentReceipt:
    Payment = db.get(PaymentReceipt, PaymentId)
    if not Payment:
        api_error(404, "PAYMENT_NOT_FOUND", "That payment was not found.")
    _LockStudent(db, Payment.student_id)
    Payment = db.query(PaymentReceipt).filter(PaymentReceipt.id == PaymentId).with_for_update().one()
    db.refresh(Payment)
    return Payment


def EditPayment(db: Session, *, PaymentId: str, Request: dict[str, Any], Reason: Any, Actor: User | None) -> dict[str, Any]:
    CleanReason = _Clean(Reason, 500)
    if not CleanReason:
        api_error(422, "REASON_REQUIRED", "Please give a reason for the change.")
    Payment = _LockPayment(db, PaymentId)
    if Payment.status == "CANCELLED":
        api_error(409, "PAYMENT_CANCELLED", f"{Payment.receipt_number} is cancelled and cannot be edited.")
    StudentRow = db.get(Student, Payment.student_id)
    Before = _AuditShape(db, Payment)
    Checked = _CheckedPayment(db, StudentRow, Request, Editing=Payment)
    if Payment.channel == "ONLINE" and Checked["total"] != Payment.amount_paise:
        # Razorpay holds the real amount; only where it is applied can change.
        api_error(422, "ONLINE_AMOUNT_FIXED", f"{Payment.receipt_number} was paid online: the amount received stays {FormatIndianRupees(Payment.amount_paise)}. To return money, refund it in Razorpay and cancel this payment.")
    Touched: dict[str, PaymentInvoice] = dict(Checked["invoices"])
    Now = datetime.now(timezone.utc)
    for Allocation in db.query(PaymentAllocation).filter(PaymentAllocation.payment_id == Payment.id, PaymentAllocation.released_at.is_(None), PaymentAllocation.kind == "DIRECT").all():
        Allocation.released_at = Now
        Allocation.release_reason = "Payment edited"
        Touched.setdefault(Allocation.invoice_id, db.get(PaymentInvoice, Allocation.invoice_id))
    for Line in db.query(PaymentMethodLine).filter(PaymentMethodLine.payment_id == Payment.id).all():
        db.delete(Line)  # the method lines are part of the payment; before/after is in the history
    db.flush()
    Receiver = Checked["receiver"]
    if Receiver is not None:
        Payment.received_by_user_id = Receiver.id
        Payment.received_by_name = Receiver.full_name
    Payment.payment_date = Checked["paymentDate"]
    Payment.pay_by = Checked["payBy"]
    Payment.amount_paise = Checked["total"]
    Payment.discount_paise = Checked["discount"]
    Payment.discount_reason = Checked["discountReason"]
    Payment.note = Checked["note"]
    Payment.edited_at = Now
    Payment.edited_by_user_id = Actor.id if Actor else None
    _WriteDetails(db, Payment, Checked, Actor)
    for Invoice in Touched.values():
        RecomputeInvoice(db, Invoice)
    WritePaymentAudit(db, EntityType="PAYMENT", EntityId=Payment.id, Action="UPDATE", Actor=Actor, Before=Before, After=_AuditShape(db, Payment), Reason=CleanReason)
    db.commit()
    return PaymentPayload(db, Payment)


def CancelPayment(db: Session, *, PaymentId: str, Reason: Any, Actor: User | None) -> dict[str, Any]:
    CleanReason = _Clean(Reason, 500)
    if not CleanReason:
        api_error(422, "REASON_REQUIRED", "Please give a reason for cancelling this payment.")
    Payment = _LockPayment(db, PaymentId)
    if Payment.status == "CANCELLED":
        api_error(409, "PAYMENT_ALREADY_CANCELLED", f"{Payment.receipt_number} is already cancelled.")
    Live = db.query(PaymentAllocation).filter(PaymentAllocation.payment_id == Payment.id, PaymentAllocation.released_at.is_(None)).all()
    AdvanceUsed = [Row for Row in Live if Row.kind == "ADVANCE"]
    if AdvanceUsed:
        Numbers = sorted({db.get(PaymentInvoice, Row.invoice_id).invoice_number for Row in AdvanceUsed})
        api_error(
            409, "ADVANCE_ALREADY_USED",
            f"This payment's advance is already used on {', '.join(Numbers)}. Cancel those invoices first (their amount goes back to advance), or edit this payment instead.",
        )
    Before = _AuditShape(db, Payment)
    Now = datetime.now(timezone.utc)
    Touched = {}
    for Allocation in Live:
        Allocation.released_at = Now
        Allocation.release_reason = "Payment cancelled"
        Touched[Allocation.invoice_id] = db.get(PaymentInvoice, Allocation.invoice_id)
    Payment.status = "CANCELLED"
    Payment.cancelled_at = Now
    Payment.cancelled_by_user_id = Actor.id if Actor else None
    Payment.cancel_reason = CleanReason
    db.flush()
    for Invoice in Touched.values():
        RecomputeInvoice(db, Invoice)
    WritePaymentAudit(db, EntityType="PAYMENT", EntityId=Payment.id, Action="CANCEL", Actor=Actor, Before=Before, After={**Before, "status": "CANCELLED"}, Reason=CleanReason)
    db.commit()
    return PaymentPayload(db, Payment)


def ApplyAdvanceNow(db: Session, *, StudentId: str, Actor: User | None) -> dict[str, Any]:
    Applied = ApplyAdvance(db, StudentId=StudentId, Actor=Actor)
    if not Applied:
        db.rollback()
        api_error(409, "NOTHING_TO_APPLY", "There is no advance to apply, or no unpaid invoice to apply it to.")
    db.commit()
    return {"appliedPaise": Applied, "appliedDisplay": FormatIndianRupees(Applied)}


def ReleaseInvoiceAllocations(db: Session, Invoice: PaymentInvoice) -> int:
    """For a cancelled invoice: what was paid on it goes back to the
    payments' advance. Returns paise moved. Never commits."""
    Now = datetime.now(timezone.utc)
    Moved = 0
    for Allocation in _LiveAllocationsQuery(db).filter(PaymentAllocation.invoice_id == Invoice.id).all():
        Allocation.released_at = Now
        Allocation.release_reason = f"Invoice {Invoice.invoice_number} cancelled"
        Moved += Allocation.amount_paise
    db.flush()
    return Moved


# ----------------------------------------------------------------------------
# Reading
# ----------------------------------------------------------------------------

def GetPayment(db: Session, PaymentId: str) -> dict[str, Any]:
    Payment = db.get(PaymentReceipt, PaymentId)
    if not Payment:
        api_error(404, "PAYMENT_NOT_FOUND", "That payment was not found.")
    return PaymentPayload(db, Payment)


def _FilteredPayments(db: Session, Filters: dict[str, Any]):
    from app.services.payments.invoices_service import _ParseDate

    Query = db.query(PaymentReceipt).join(Student, PaymentReceipt.student_id == Student.id).join(User, Student.user_id == User.id)
    Status = str(Filters.get("status") or "ALL").upper()
    if Status in STATUS_LABELS:
        Query = Query.filter(PaymentReceipt.status == Status)
    Method = str(Filters.get("method") or "").upper()
    if Method in METHOD_LABELS:
        Query = Query.filter(PaymentReceipt.id.in_(db.query(PaymentMethodLine.payment_id).filter(PaymentMethodLine.method == Method)))
    if Filters.get("receivedBy"):
        Query = Query.filter(PaymentReceipt.received_by_user_id == Filters["receivedBy"])
    if Filters.get("centreId"):
        Query = Query.filter(PaymentReceipt.centre_id == Filters["centreId"]) if Filters["centreId"] != "NONE" else Query.filter(PaymentReceipt.centre_id.is_(None))
    if Filters.get("studentId"):
        Query = Query.filter(PaymentReceipt.student_id == Filters["studentId"])
    DateFrom = _ParseDate(Filters.get("dateFrom"), "From date")
    DateTo = _ParseDate(Filters.get("dateTo"), "To date")
    if DateFrom:
        Query = Query.filter(PaymentReceipt.payment_date >= DateFrom)
    if DateTo:
        Query = Query.filter(PaymentReceipt.payment_date <= DateTo)
    Search = str(Filters.get("search") or "").strip()
    if Search:
        Like = f"%{Search.lower()}%"
        Query = Query.filter(
            or_(
                func.lower(User.full_name).like(Like),
                func.lower(Student.student_code).like(Like),
                func.lower(func.coalesce(Student.custom_id, "")).like(Like),
                func.lower(PaymentReceipt.receipt_number).like(Like),
                func.lower(func.coalesce(PaymentReceipt.pay_by, "")).like(Like),
                PaymentReceipt.id.in_(db.query(PaymentMethodLine.payment_id).filter(func.lower(func.coalesce(PaymentMethodLine.reference, "")).like(Like))),
            )
        )
    return Query


def ListPayments(db: Session, *, Filters: dict[str, Any], Page: int = 1, PageSize: int = 50) -> dict[str, Any]:
    Page = max(1, int(Page or 1))
    PageSize = max(1, min(int(PageSize or 50), 200))
    Query = _FilteredPayments(db, Filters)
    TotalCount = Query.count()
    Live = Query.filter(PaymentReceipt.status == "RECORDED")
    Received, Discount = Live.with_entities(func.coalesce(func.sum(PaymentReceipt.amount_paise), 0), func.coalesce(func.sum(PaymentReceipt.discount_paise), 0)).one()
    LiveIds = Live.with_entities(PaymentReceipt.id).subquery()
    ByMethod = (
        db.query(PaymentMethodLine.method, func.coalesce(func.sum(PaymentMethodLine.amount_paise), 0))
        .filter(PaymentMethodLine.payment_id.in_(db.query(LiveIds.c.id)))
        .group_by(PaymentMethodLine.method)
        .all()
    )
    Rows = Query.order_by(PaymentReceipt.payment_date.desc(), PaymentReceipt.receipt_number.desc()).offset((Page - 1) * PageSize).limit(PageSize).all()
    Names = _UserNames(db, {Row.created_by_user_id for Row in Rows} | {Row.edited_by_user_id for Row in Rows} | {Row.cancelled_by_user_id for Row in Rows})
    return {
        "page": Page,
        "pageSize": PageSize,
        "totalCount": TotalCount,
        "totals": {
            "receivedDisplay": FormatIndianRupees(int(Received or 0)),
            "discountDisplay": FormatIndianRupees(int(Discount or 0)),
            "byMethod": [
                {"method": Method, "methodLabel": METHOD_LABELS.get(Method, Method), "amountDisplay": FormatIndianRupees(int(Total or 0)), "amountPaise": int(Total or 0)}
                for Method, Total in sorted(ByMethod, key=lambda Row: -int(Row[1] or 0))
            ],
        },
        "payments": [PaymentPayload(db, Row, Names=Names, Detailed=False) for Row in Rows],
    }


def PaymentsForExport(db: Session, *, Filters: dict[str, Any]) -> list[dict[str, Any]]:
    Rows = _FilteredPayments(db, Filters).order_by(PaymentReceipt.payment_date.asc(), PaymentReceipt.receipt_number.asc()).all()
    return [PaymentPayload(db, Row, Names={}, Detailed=False) for Row in Rows]


def PaymentsForPdf(db: Session, *, PaymentIds: list[str] | None = None, Filters: dict[str, Any] | None = None) -> list[PaymentReceipt]:
    if PaymentIds:
        Ids = [Id for Id in dict.fromkeys(str(Id) for Id in PaymentIds) if Id]
        if len(Ids) > MAX_RECEIPTS_PER_PDF:
            api_error(422, "TOO_MANY_RECEIPTS", f"Choose at most {MAX_RECEIPTS_PER_PDF} receipts for one PDF.")
        Rows = db.query(PaymentReceipt).filter(PaymentReceipt.id.in_(Ids)).all()
        Order = {Id: Index for Index, Id in enumerate(Ids)}
        Rows.sort(key=lambda Row: Order.get(Row.id, 0))
    else:
        Query = _FilteredPayments(db, Filters or {})
        if Query.count() > MAX_RECEIPTS_PER_PDF:
            api_error(422, "TOO_MANY_RECEIPTS", f"That is more than {MAX_RECEIPTS_PER_PDF} receipts. Narrow the filters and try again.")
        Rows = Query.order_by(PaymentReceipt.receipt_number.asc()).all()
    if not Rows:
        api_error(404, "PAYMENT_NOT_FOUND", "No receipts to print.")
    return Rows


def ListStaff(db: Session) -> list[dict[str, Any]]:
    Rows = db.query(User).filter(User.role.in_(STAFF_ROLES), User.is_active == True).order_by(User.full_name.asc()).all()  # noqa: E712
    return [{"userId": Row.id, "name": Row.full_name} for Row in Rows]


# ----------------------------------------------------------------------------
# A student's account
# ----------------------------------------------------------------------------

def StudentAccount(db: Session, StudentId: str) -> dict[str, Any]:
    from app.services.payments.invoices_service import InvoicePayload, TodayInIndia

    StudentRow = db.get(Student, StudentId)
    if not StudentRow:
        api_error(404, "STUDENT_NOT_FOUND", "That student was not found.")
    UserRow = db.get(User, StudentRow.user_id)
    LevelRow = db.get(Level, StudentRow.current_level_id) if StudentRow.current_level_id else None
    Centre = db.get(PaymentCentre, StudentRow.centre_id) if StudentRow.centre_id else None
    Today = TodayInIndia()

    Invoices = (
        db.query(PaymentInvoice)
        .filter(PaymentInvoice.student_id == StudentId)
        .order_by(PaymentInvoice.invoice_date.asc(), PaymentInvoice.invoice_number.asc())
        .all()
    )
    Payments = (
        db.query(PaymentReceipt)
        .filter(PaymentReceipt.student_id == StudentId)
        .order_by(PaymentReceipt.payment_date.asc(), PaymentReceipt.created_at.asc(), PaymentReceipt.receipt_number.asc())
        .all()
    )
    Names = _UserNames(db, {Row.created_by_user_id for Row in Invoices} | {Row.cancelled_by_user_id for Row in Invoices}
                       | {Row.created_by_user_id for Row in Payments} | {Row.edited_by_user_id for Row in Payments} | {Row.cancelled_by_user_id for Row in Payments})
    LiveInvoices = [Row for Row in Invoices if Row.status != "CANCELLED"]
    LivePayments = [Row for Row in Payments if Row.status == "RECORDED"]
    Invoiced = sum(Row.amount_paise for Row in LiveInvoices)
    Received = sum(Row.amount_paise for Row in LivePayments)
    Discount = sum(Row.discount_paise or 0 for Row in LiveInvoices)
    Due = sum(InvoiceBalance(Row) for Row in LiveInvoices)
    Advance = StudentAdvanceBalance(db, StudentId)
    Overdue = sum(InvoiceBalance(Row) for Row in LiveInvoices if Row.due_date and Row.due_date < Today and InvoiceBalance(Row) > 0)

    # Statement: invoices add to the balance, payments and discounts reduce it.
    Events: list[tuple[date, int, str, dict[str, Any]]] = []
    for Row in Invoices:
        Events.append((Row.invoice_date, 0, Row.invoice_number, {
            "type": "INVOICE", "id": Row.id, "number": Row.invoice_number, "date": Row.invoice_date.isoformat(),
            "description": f"{Row.fee_name}" + (f" · {calendar_label(Row)}" if Row.billing_month else ""),
            "chargePaise": Row.amount_paise if Row.status != "CANCELLED" else 0, "creditPaise": 0,
            "cancelled": Row.status == "CANCELLED", "amountDisplay": FormatIndianRupees(Row.amount_paise),
        }))
    DiscountByPayment: dict[str, int] = defaultdict(int)
    for Allocation in _LiveAllocationsQuery(db).filter(PaymentReceipt.student_id == StudentId).all():
        DiscountByPayment[Allocation.payment_id] += Allocation.discount_paise
    for Row in Payments:
        Lines = db.query(PaymentMethodLine).filter(PaymentMethodLine.payment_id == Row.id).order_by(PaymentMethodLine.line_order).all()
        Live = Row.status == "RECORDED"
        Events.append((Row.payment_date, 1, Row.receipt_number, {
            "type": "PAYMENT", "id": Row.id, "number": Row.receipt_number, "date": Row.payment_date.isoformat(),
            "description": _MethodSummary(Lines) + (f" · discount {FormatIndianRupees(DiscountByPayment[Row.id])}" if DiscountByPayment.get(Row.id) else ""),
            "chargePaise": 0, "creditPaise": (Row.amount_paise + DiscountByPayment.get(Row.id, 0)) if Live else 0,
            "cancelled": not Live, "amountDisplay": FormatIndianRupees(Row.amount_paise),
        }))
    Events.sort(key=lambda Item: (Item[0], Item[1], Item[2]))
    Running = 0
    Statement = []
    for _, _, _, Entry in Events:
        Running += Entry["chargePaise"] - Entry["creditPaise"]
        Statement.append({
            **Entry,
            "chargeDisplay": FormatIndianRupees(Entry["chargePaise"]) if Entry["chargePaise"] else None,
            "creditDisplay": FormatIndianRupees(Entry["creditPaise"]) if Entry["creditPaise"] else None,
            "balancePaise": Running,
            "balanceDisplay": FormatIndianRupees(abs(Running)) + (" advance" if Running < 0 else ""),
        })

    Unpaid = [Row for Row in LiveInvoices if InvoiceBalance(Row) > 0]
    return {
        "student": {
            "studentId": StudentRow.id,
            "name": UserRow.full_name if UserRow else "",
            "studentCode": StudentRow.student_code,
            "customId": StudentRow.custom_id,
            "levelCode": LevelRow.level_code if LevelRow else None,
            "centreName": Centre.name if Centre else None,
            "parentName": StudentRow.father_name or StudentRow.mother_name,
            "mobile": StudentRow.father_mobile or StudentRow.mother_mobile or StudentRow.parent_contact,
            "isActive": bool(StudentRow.is_active and (UserRow.is_active if UserRow else True)),
        },
        "totals": {
            "invoicedPaise": Invoiced, "invoicedDisplay": FormatIndianRupees(Invoiced),
            "receivedPaise": Received, "receivedDisplay": FormatIndianRupees(Received),
            "discountPaise": Discount, "discountDisplay": FormatIndianRupees(Discount),
            "duePaise": Due, "dueDisplay": FormatIndianRupees(Due),
            "overduePaise": Overdue, "overdueDisplay": FormatIndianRupees(Overdue),
            "advancePaise": Advance, "advanceDisplay": FormatIndianRupees(Advance),
        },
        **{"receiptNumbering": _ReceiptNumberingReady(db)},
        "unpaidInvoices": [InvoicePayload(Row, Today=Today) for Row in Unpaid],
        "invoices": [InvoicePayload(Row, Today=Today, CreatedByName=Names.get(Row.created_by_user_id), CancelledByName=Names.get(Row.cancelled_by_user_id)) for Row in reversed(Invoices)],
        "payments": [PaymentPayload(db, Row, Names=Names) for Row in reversed(Payments)],
        "statement": list(reversed(Statement)),
    }


def calendar_label(Invoice: PaymentInvoice) -> str:
    from app.services.payments.invoices_service import PeriodLabel

    return PeriodLabel(Invoice.billing_month, Invoice.billing_year) or ""
