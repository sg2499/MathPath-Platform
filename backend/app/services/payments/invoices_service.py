"""Payments Phase 2 (2026-10-08): invoices.

  * PreviewInvoices / GenerateInvoices -- one invoice per student per fee
    item. The preview shows exactly what Generate will create and what it
    will skip (and why); Generate recomputes it inside one transaction, so
    the two always agree.
  * Duplicates can never be created:
      - monthly fee: one live invoice per student, fee item and month
        (also enforced by a partial unique index in the database);
      - one-time item: skipped if the student already has a live invoice for
        it, unless the admin ticks "allow a second one".
  * An idempotency key per Generate press: a double click or a retried
    request returns the same batch instead of creating a second set.
  * Every invoice keeps its own copy of what is printed (snapshot_json), so
    later edits elsewhere never change an issued invoice.
  * Numbers come from numbering.TakeNextNumber (row lock, never reused).
  * Cancel needs a reason; a cancelled invoice stays, marked Cancelled.
"""
from __future__ import annotations

import calendar
import json
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import (
    Batch,
    FeeItem,
    Level,
    Module,
    PaymentBusinessProfile,
    PaymentCentre,
    PaymentInvoice,
    PaymentInvoiceBatch,
    PaymentNumberSequence,
    Student,
    StudentBatch,
    Teacher,
    User,
)
from app.services.payments.audit import WritePaymentAudit
from app.services.payments.money import FormatIndianRupees, PaiseToRupeesString, SplitInclusiveGst
from app.services.payments.numbering import EnsureNumberSequences, FormatDocumentNumber, LockSequence, TakeNextNumber
from app.services.payments.setup_service import EnsurePaymentDefaults

INDIA = ZoneInfo("Asia/Kolkata")
DEFAULT_DUE_DAYS = 10
MAX_STUDENTS_PER_RUN = 1000
MAX_FEE_ITEMS_PER_RUN = 20
MAX_INVOICES_PER_PDF = 500
LIVE_STATUSES = ("PENDING", "PART_PAID", "PAID")
STATUS_LABELS = {"PENDING": "Pending", "PART_PAID": "Part-paid", "PAID": "Paid", "CANCELLED": "Cancelled"}


def TodayInIndia() -> date:
    return datetime.now(INDIA).date()


def PeriodLabel(Month: int | None, Year: int | None) -> str | None:
    if not Month or not Year:
        return None
    return f"{calendar.month_name[Month]} {Year}"


def _ParseDate(Value: Any, Label: str) -> date | None:
    if Value is None or (isinstance(Value, str) and not Value.strip()):
        return None
    if isinstance(Value, date):
        return Value
    try:
        return date.fromisoformat(str(Value).strip()[:10])
    except ValueError:
        api_error(422, "DATE_INVALID", f"{Label} must be a date like 2026-11-01.")


# --------------------------------------------------------------------------
# Request checking
# --------------------------------------------------------------------------

def _CheckedRequest(db: Session, Request: dict[str, Any]) -> dict[str, Any]:
    FeeItemIds = [Id for Id in dict.fromkeys(str(Id).strip() for Id in (Request.get("feeItemIds") or [])) if Id]
    if not FeeItemIds:
        api_error(422, "NO_FEE_ITEMS_SELECTED", "Choose at least one fee item to invoice.")
    if len(FeeItemIds) > MAX_FEE_ITEMS_PER_RUN:
        api_error(422, "TOO_MANY_FEE_ITEMS", f"Choose at most {MAX_FEE_ITEMS_PER_RUN} fee items at a time.")
    Items = db.query(FeeItem).filter(FeeItem.id.in_(FeeItemIds)).all()
    ById = {Item.id: Item for Item in Items}
    Missing = [Id for Id in FeeItemIds if Id not in ById]
    if Missing:
        api_error(404, "FEE_ITEM_NOT_FOUND", "One of the chosen fee items no longer exists. Refresh and try again.")
    Inactive = [Item.name for Item in Items if not Item.is_active]
    if Inactive:
        api_error(422, "FEE_ITEM_INACTIVE", f"{', '.join(Inactive)} is switched off. Switch it on in Fee Setup to invoice it.")
    Items = sorted(Items, key=lambda Item: (Item.display_order, Item.name))

    HasMonthly = any(Item.billing_type == "MONTHLY" for Item in Items)
    Month = Year = None
    if HasMonthly:
        try:
            Month = int(Request.get("billingMonth"))
            Year = int(Request.get("billingYear"))
        except (TypeError, ValueError):
            api_error(422, "BILLING_PERIOD_REQUIRED", "Choose the month and year for the monthly fee.")
        if not 1 <= Month <= 12 or not 2020 <= Year <= 2100:
            api_error(422, "BILLING_PERIOD_REQUIRED", "Choose a valid month and year for the monthly fee.")

    InvoiceDate = _ParseDate(Request.get("invoiceDate"), "Invoice date") or TodayInIndia()
    DueDate = _ParseDate(Request.get("dueDate"), "Due date") or (InvoiceDate + timedelta(days=DEFAULT_DUE_DAYS))
    if DueDate < InvoiceDate:
        api_error(422, "DUE_BEFORE_INVOICE", "The due date cannot be before the invoice date.")
    if InvoiceDate > TodayInIndia() + timedelta(days=366) or InvoiceDate < date(2020, 1, 1):
        api_error(422, "DATE_INVALID", "The invoice date looks wrong. Please check the year.")

    StudentIds = [Id for Id in dict.fromkeys(str(Id).strip() for Id in (Request.get("studentIds") or [])) if Id]
    if not StudentIds:
        api_error(422, "NO_STUDENTS_SELECTED", "Choose at least one student.")
    if len(StudentIds) > MAX_STUDENTS_PER_RUN:
        api_error(422, "TOO_MANY_STUDENTS", f"Choose at most {MAX_STUDENTS_PER_RUN:,} students at a time.")

    return {
        "items": Items,
        "month": Month,
        "year": Year,
        "invoiceDate": InvoiceDate,
        "dueDate": DueDate,
        "studentIds": StudentIds,
        "allowRepeatOneTime": bool(Request.get("allowRepeatOneTime")),
    }


def _PeriodKey(Item: FeeItem, Month: int | None, Year: int | None) -> str | None:
    return f"{Year:04d}-{Month:02d}" if Item.billing_type == "MONTHLY" and Month and Year else None


# --------------------------------------------------------------------------
# Plan (shared by preview and generate)
# --------------------------------------------------------------------------

def _Plan(db: Session, Checked: dict[str, Any]) -> dict[str, Any]:
    Rows = (
        db.query(Student, User)
        .join(User, Student.user_id == User.id)
        .filter(Student.id.in_(Checked["studentIds"]))
        .all()
    )
    Found = {Row.id: (Row, UserRow) for Row, UserRow in Rows}
    Missing = [Id for Id in Checked["studentIds"] if Id not in Found]
    if Missing:
        api_error(404, "STUDENT_NOT_FOUND", f"{len(Missing)} of the chosen students were not found. Refresh and try again.")

    ItemIds = [Item.id for Item in Checked["items"]]
    Existing = (
        db.query(PaymentInvoice.student_id, PaymentInvoice.fee_item_id, PaymentInvoice.period_key, PaymentInvoice.invoice_number)
        .filter(
            PaymentInvoice.student_id.in_(Checked["studentIds"]),
            PaymentInvoice.fee_item_id.in_(ItemIds),
            PaymentInvoice.status != "CANCELLED",
        )
        .all()
    )
    MonthlyTaken = {(S, F, P): N for S, F, P, N in Existing if P}
    OneTimeTaken: dict[tuple[str, str], str] = {}
    for S, F, P, N in Existing:
        if not P:
            OneTimeTaken.setdefault((S, F), N)

    Ordered = sorted(Found.values(), key=lambda Pair: ((Pair[1].full_name or "").lower(), Pair[0].student_code or ""))
    Creates: list[dict[str, Any]] = []
    Skips: list[dict[str, Any]] = []
    for StudentRow, UserRow in Ordered:
        Base = {"studentId": StudentRow.id, "studentName": UserRow.full_name, "studentCode": StudentRow.student_code}
        for Item in Checked["items"]:
            PeriodKey = _PeriodKey(Item, Checked["month"], Checked["year"])
            Label = PeriodLabel(Checked["month"], Checked["year"]) if PeriodKey else None
            Line = {**Base, "feeItemId": Item.id, "feeName": Item.name, "periodLabel": Label, "amountPaise": Item.amount_paise}
            if not (StudentRow.is_active and UserRow.is_active):
                Skips.append({**Line, "reason": "Student is inactive"})
            elif PeriodKey and (StudentRow.id, Item.id, PeriodKey) in MonthlyTaken:
                Skips.append({**Line, "reason": f"Already has {Item.name} for {Label} ({MonthlyTaken[(StudentRow.id, Item.id, PeriodKey)]})"})
            elif not PeriodKey and (StudentRow.id, Item.id) in OneTimeTaken and not Checked["allowRepeatOneTime"]:
                Skips.append({**Line, "reason": f"Already has {Item.name} ({OneTimeTaken[(StudentRow.id, Item.id)]})"})
            else:
                Creates.append({**Line, "_student": StudentRow, "_user": UserRow, "_item": Item, "_periodKey": PeriodKey})
    return {"creates": Creates, "skips": Skips}


def _Public(Line: dict[str, Any]) -> dict[str, Any]:
    Out = {Key: Value for Key, Value in Line.items() if not Key.startswith("_")}
    Out["amountDisplay"] = FormatIndianRupees(Line["amountPaise"])
    return Out


def _InvoiceNumbering(db: Session) -> dict[str, Any]:
    EnsureNumberSequences(db)
    Sequence = db.get(PaymentNumberSequence, "INVOICE")
    return {
        "numberingReady": bool(Sequence.is_configured),
        "nextNumber": FormatDocumentNumber(Sequence.prefix, Sequence.pad_width, Sequence.next_number) if Sequence.is_configured else None,
    }


def PreviewInvoices(db: Session, *, Request: dict[str, Any]) -> dict[str, Any]:
    from app.services.payments.receipts_service import AdvanceBalances

    Checked = _CheckedRequest(db, Request)
    Plan = _Plan(db, Checked)
    Total = sum(Line["amountPaise"] for Line in Plan["creates"])
    # An advance a student already holds is applied to their new invoices.
    Advances = AdvanceBalances(db, sorted({Line["studentId"] for Line in Plan["creates"]}))
    AdvanceApplied = 0
    for Line in Plan["creates"]:
        Take = min(Advances.get(Line["studentId"], 0), Line["amountPaise"])
        Line["advancePaise"] = Take
        Line["advanceDisplay"] = FormatIndianRupees(Take) if Take else None
        if Take:
            Advances[Line["studentId"]] -= Take
            AdvanceApplied += Take
    return {
        **_InvoiceNumbering(db),
        "advanceAppliedPaise": AdvanceApplied,
        "advanceAppliedDisplay": FormatIndianRupees(AdvanceApplied),
        "advanceStudents": len({Line["studentId"] for Line in Plan["creates"] if Line.get("advancePaise")}),
        "invoiceDate": Checked["invoiceDate"].isoformat(),
        "dueDate": Checked["dueDate"].isoformat(),
        "periodLabel": PeriodLabel(Checked["month"], Checked["year"]),
        "studentsSelected": len(Checked["studentIds"]),
        "studentsInvoiced": len({Line["studentId"] for Line in Plan["creates"]}),
        "invoiceCount": len(Plan["creates"]),
        "skippedCount": len(Plan["skips"]),
        "totalPaise": Total,
        "totalDisplay": FormatIndianRupees(Total),
        "invoices": [_Public(Line) for Line in Plan["creates"]],
        "skipped": [_Public(Line) for Line in Plan["skips"]],
    }


# --------------------------------------------------------------------------
# Snapshot
# --------------------------------------------------------------------------

def _BusinessSnapshot(db: Session) -> dict[str, Any]:
    EnsurePaymentDefaults(db)
    Profile = db.get(PaymentBusinessProfile, "default")
    return {
        "legalName": Profile.legal_name,
        "brandName": Profile.brand_name,
        "gstin": Profile.gstin,
        "registeredAddress": Profile.registered_address,
        "email": Profile.email,
        "phone": Profile.phone,
        "footer": Profile.invoice_footer,
    }


def _CentreSnapshot(db: Session, CentreId: str | None, AllCentres: list[PaymentCentre]) -> dict[str, Any]:
    Centre = next((Row for Row in AllCentres if Row.id == CentreId), None) if CentreId else None
    if Centre:
        return {"name": Centre.name, "address": Centre.address, "phone": Centre.phone, "all": None}
    # No centre on the student: print every active centre's address, as the
    # old invoices did.
    return {
        "name": None,
        "address": None,
        "phone": None,
        "all": [{"name": Row.name, "address": Row.address} for Row in AllCentres if Row.is_active and Row.address],
    }


def _StudentSnapshot(StudentRow: Student, UserRow: User, LevelRow: Level | None) -> dict[str, Any]:
    ParentName = StudentRow.father_name or StudentRow.mother_name
    Mobile = StudentRow.father_mobile or StudentRow.mother_mobile or StudentRow.parent_contact
    Email = StudentRow.father_email or StudentRow.mother_email
    return {
        "name": UserRow.full_name,
        "studentCode": StudentRow.student_code,
        "customId": StudentRow.custom_id,
        "parentName": ParentName,
        "mobile": Mobile,
        "email": Email,
        "address": StudentRow.present_address or StudentRow.permanent_address,
        "levelCode": LevelRow.level_code if LevelRow else None,
        "levelName": LevelRow.level_name if LevelRow else None,
    }


def _Description(FeeName: str, LevelCode: str | None, Label: str | None) -> str:
    Parts = ["Math Path Abacus"]
    if LevelCode:
        Parts.append(LevelCode)
    Parts.append(FeeName)
    if Label:
        Parts.append(Label)
    return " · ".join(Parts)


# --------------------------------------------------------------------------
# Generate
# --------------------------------------------------------------------------

def _InvoiceAuditShape(Invoice: PaymentInvoice) -> dict[str, Any]:
    return {
        "invoiceNumber": Invoice.invoice_number,
        "student": json.loads(Invoice.snapshot_json)["student"]["name"],
        "feeName": Invoice.fee_name,
        "period": PeriodLabel(Invoice.billing_month, Invoice.billing_year),
        "amount": PaiseToRupeesString(Invoice.amount_paise),
        "invoiceDate": Invoice.invoice_date.isoformat(),
        "dueDate": Invoice.due_date.isoformat() if Invoice.due_date else None,
        "status": Invoice.status,
    }


def _BatchResult(db: Session, BatchRow: PaymentInvoiceBatch, Skips: list[dict[str, Any]] | None = None, Replayed: bool = False) -> dict[str, Any]:
    Invoices = (
        db.query(PaymentInvoice)
        .filter(PaymentInvoice.batch_id == BatchRow.id)
        .order_by(PaymentInvoice.invoice_number.asc())
        .all()
    )
    return {
        "batchId": BatchRow.id,
        "replayed": Replayed,
        "invoiceCount": BatchRow.invoice_count,
        "skippedCount": BatchRow.skipped_count,
        "totalPaise": BatchRow.total_paise,
        "totalDisplay": FormatIndianRupees(BatchRow.total_paise),
        "firstNumber": Invoices[0].invoice_number if Invoices else None,
        "lastNumber": Invoices[-1].invoice_number if Invoices else None,
        "skipped": [_Public(Line) for Line in (Skips or [])],
        "advanceAppliedPaise": _AdvanceOnBatch(db, [Row.id for Row in Invoices]),
        "advanceAppliedDisplay": FormatIndianRupees(_AdvanceOnBatch(db, [Row.id for Row in Invoices])),
    }


def _AdvanceOnBatch(db: Session, InvoiceIds: list[str]) -> int:
    from app.models import PaymentAllocation

    if not InvoiceIds:
        return 0
    Total = (
        db.query(func.coalesce(func.sum(PaymentAllocation.amount_paise), 0))
        .filter(PaymentAllocation.invoice_id.in_(InvoiceIds), PaymentAllocation.kind == "ADVANCE", PaymentAllocation.released_at.is_(None))
        .scalar()
    )
    return int(Total or 0)


def GenerateInvoices(db: Session, *, Request: dict[str, Any], IdempotencyKey: str, Actor: User | None) -> dict[str, Any]:
    Key = (IdempotencyKey or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,80}", Key):
        api_error(422, "IDEMPOTENCY_KEY_INVALID", "Refresh the page and try again.")
    Previous = db.query(PaymentInvoiceBatch).filter(PaymentInvoiceBatch.idempotency_key == Key).first()
    if Previous:
        return _BatchResult(db, Previous, Replayed=True)
    Checked = _CheckedRequest(db, Request)
    # One Generate at a time: the invoice-number row lock is held from here
    # to the commit, so a second admin's run waits, then sees this run's
    # invoices and skips them (this is what stops a one-time item being
    # invoiced twice; monthly fees are also guarded by the unique index).
    Sequence = LockSequence(db, "INVOICE")
    Previous = db.query(PaymentInvoiceBatch).filter(PaymentInvoiceBatch.idempotency_key == Key).first()
    if Previous:
        db.rollback()
        return _BatchResult(db, Previous, Replayed=True)
    if not Sequence.is_configured:
        api_error(409, "PAYMENT_NUMBERING_NOT_SET", "The starting invoice number has not been set yet. Set it in Payments > Payment Settings first.")
    Plan = _Plan(db, Checked)
    if not Plan["creates"]:
        api_error(409, "NOTHING_TO_INVOICE", "There is nothing new to invoice: every chosen student already has these invoices.")

    Business = _BusinessSnapshot(db)
    Centres = db.query(PaymentCentre).order_by(PaymentCentre.display_order.asc(), PaymentCentre.name.asc()).all()
    Levels = {Row.id: Row for Row in db.query(Level).all()}
    BatchRow = PaymentInvoiceBatch(
        idempotency_key=Key,
        params_json=json.dumps(
            {
                "feeItems": [Item.name for Item in Checked["items"]],
                "period": PeriodLabel(Checked["month"], Checked["year"]),
                "invoiceDate": Checked["invoiceDate"].isoformat(),
                "dueDate": Checked["dueDate"].isoformat(),
                "studentsSelected": len(Checked["studentIds"]),
                "allowRepeatOneTime": Checked["allowRepeatOneTime"],
            }
        ),
        created_by_user_id=Actor.id if Actor else None,
    )
    db.add(BatchRow)
    try:
        db.flush()
    except IntegrityError:
        # The same key was saved by a parallel request a moment ago.
        db.rollback()
        Previous = db.query(PaymentInvoiceBatch).filter(PaymentInvoiceBatch.idempotency_key == Key).first()
        if Previous:
            return _BatchResult(db, Previous, Replayed=True)
        raise

    Skips = list(Plan["skips"])
    Created = 0
    Total = 0
    CreatedByStudent: dict[str, list[str]] = {}
    for Line in Plan["creates"]:
        StudentRow, UserRow, Item = Line["_student"], Line["_user"], Line["_item"]
        LevelRow = Levels.get(StudentRow.current_level_id)
        Split = SplitInclusiveGst(Item.amount_paise, Item.gst_rate_bps, GstIncluded=Item.gst_included)
        Snapshot = {
            "business": Business,
            "centre": _CentreSnapshot(db, StudentRow.centre_id, Centres),
            "student": _StudentSnapshot(StudentRow, UserRow, LevelRow),
        }
        try:
            with db.begin_nested():
                Number = TakeNextNumber(db, "INVOICE")
                Invoice = PaymentInvoice(
                    invoice_number=Number,
                    student_id=StudentRow.id,
                    fee_item_id=Item.id,
                    batch_id=BatchRow.id,
                    fee_name=Item.name,
                    billing_type=Item.billing_type,
                    billing_month=Checked["month"] if Line["_periodKey"] else None,
                    billing_year=Checked["year"] if Line["_periodKey"] else None,
                    period_key=Line["_periodKey"],
                    description=_Description(Item.name, LevelRow.level_code if LevelRow else None, Line["periodLabel"]),
                    invoice_date=Checked["invoiceDate"],
                    due_date=Checked["dueDate"],
                    amount_paise=Item.amount_paise,
                    taxable_paise=Split["taxablePaise"],
                    cgst_paise=Split["cgstPaise"],
                    sgst_paise=Split["sgstPaise"],
                    gst_rate_bps=Item.gst_rate_bps if Item.gst_included else 0,
                    gst_included=bool(Item.gst_included),
                    paid_paise=0,
                    status="PENDING",
                    level_code=LevelRow.level_code if LevelRow else None,
                    centre_id=StudentRow.centre_id,
                    snapshot_json=json.dumps(Snapshot, sort_keys=True),
                    source="ADMIN",
                    created_by_user_id=Actor.id if Actor else None,
                )
                db.add(Invoice)
                db.flush()
        except IntegrityError:
            # Another admin invoiced this student for this month a moment
            # ago. The savepoint rollback also gives the number back.
            Skips.append({**Line, "reason": "Invoiced by someone else a moment ago"})
            continue
        WritePaymentAudit(db, EntityType="INVOICE", EntityId=Invoice.id, Action="CREATE", Actor=Actor, After=_InvoiceAuditShape(Invoice))
        Created += 1
        Total += Item.amount_paise
        CreatedByStudent.setdefault(StudentRow.id, []).append(Invoice.id)

    if Created == 0:
        db.rollback()
        api_error(409, "NOTHING_TO_INVOICE", "There is nothing new to invoice: every chosen student already has these invoices.")
    BatchRow.invoice_count = Created
    BatchRow.skipped_count = len(Skips)
    BatchRow.total_paise = Total
    # 2026-10-08 (Phase 3): an advance the student holds is applied to the
    # new invoices straight away (oldest payment first). Students are locked
    # in id order, the same order everywhere, so this cannot deadlock.
    from app.services.payments.receipts_service import AdvanceBalances, ApplyAdvance

    WithAdvance = AdvanceBalances(db, sorted(CreatedByStudent))
    for StudentId in sorted(WithAdvance):
        ApplyAdvance(db, StudentId=StudentId, Actor=Actor, InvoiceIds=CreatedByStudent[StudentId])
    # 2026-10-09 (Phase 5): each student is told about their new invoices,
    # only while the student Fees tab is switched on.
    from app.services.payments.online_service import NotifyInvoicesRaised

    NotifyInvoicesRaised(db, CreatedByStudent)
    db.commit()
    return _BatchResult(db, BatchRow, Skips)


# --------------------------------------------------------------------------
# Reading
# --------------------------------------------------------------------------

def _IsOverdue(Invoice: PaymentInvoice, Today: date) -> bool:
    return Invoice.status in ("PENDING", "PART_PAID") and Invoice.due_date is not None and Invoice.due_date < Today


def InvoicePayload(Invoice: PaymentInvoice, *, Today: date | None = None, CreatedByName: str | None = None, CancelledByName: str | None = None) -> dict[str, Any]:
    Today = Today or TodayInIndia()
    Snapshot = json.loads(Invoice.snapshot_json)
    Balance = max(0, Invoice.amount_paise - Invoice.paid_paise - (Invoice.discount_paise or 0)) if Invoice.status != "CANCELLED" else 0
    return {
        "invoiceId": Invoice.id,
        "invoiceNumber": Invoice.invoice_number,
        "studentId": Invoice.student_id,
        "studentName": Snapshot["student"]["name"],
        "studentCode": Snapshot["student"]["studentCode"],
        "feeItemId": Invoice.fee_item_id,
        "feeName": Invoice.fee_name,
        "billingType": Invoice.billing_type,
        "periodLabel": PeriodLabel(Invoice.billing_month, Invoice.billing_year),
        "description": Invoice.description,
        "invoiceDate": Invoice.invoice_date.isoformat(),
        "dueDate": Invoice.due_date.isoformat() if Invoice.due_date else None,
        "amountPaise": Invoice.amount_paise,
        "amountDisplay": FormatIndianRupees(Invoice.amount_paise),
        "taxablePaise": Invoice.taxable_paise,
        "cgstPaise": Invoice.cgst_paise,
        "sgstPaise": Invoice.sgst_paise,
        "taxableDisplay": FormatIndianRupees(Invoice.taxable_paise),
        "cgstDisplay": FormatIndianRupees(Invoice.cgst_paise),
        "sgstDisplay": FormatIndianRupees(Invoice.sgst_paise),
        "gstIncluded": bool(Invoice.gst_included),
        "paidPaise": Invoice.paid_paise,
        "paidDisplay": FormatIndianRupees(Invoice.paid_paise),
        "discountPaise": Invoice.discount_paise or 0,
        "discountDisplay": FormatIndianRupees(Invoice.discount_paise or 0),
        "balancePaise": Balance,
        "balanceDisplay": FormatIndianRupees(Balance),
        "status": Invoice.status,
        "statusLabel": STATUS_LABELS.get(Invoice.status, Invoice.status),
        "isOverdue": _IsOverdue(Invoice, Today),
        "levelCode": Invoice.level_code,
        "centreName": Snapshot.get("centre", {}).get("name"),
        "source": Invoice.source,
        "batchId": Invoice.batch_id,
        "createdAt": Invoice.created_at.isoformat() if Invoice.created_at else None,
        "createdByName": CreatedByName,
        "cancelledAt": Invoice.cancelled_at.isoformat() if Invoice.cancelled_at else None,
        "cancelledByName": CancelledByName,
        "cancelReason": Invoice.cancel_reason,
    }


def _FilteredQuery(db: Session, Filters: dict[str, Any]):
    Query = db.query(PaymentInvoice).join(Student, PaymentInvoice.student_id == Student.id).join(User, Student.user_id == User.id)
    Today = TodayInIndia()
    Status = str(Filters.get("status") or "ALL").upper()
    if Status in STATUS_LABELS:
        Query = Query.filter(PaymentInvoice.status == Status)
    elif Status == "UNPAID":
        Query = Query.filter(PaymentInvoice.status.in_(("PENDING", "PART_PAID")))
    elif Status == "OVERDUE":
        Query = Query.filter(PaymentInvoice.status.in_(("PENDING", "PART_PAID")), PaymentInvoice.due_date < Today)
    if Filters.get("feeItemId"):
        Query = Query.filter(PaymentInvoice.fee_item_id == Filters["feeItemId"])
    Period = str(Filters.get("period") or "").strip()
    if re.fullmatch(r"\d{4}-\d{2}", Period):
        Query = Query.filter(PaymentInvoice.period_key == Period)
    if Filters.get("centreId"):
        Query = Query.filter(PaymentInvoice.centre_id == Filters["centreId"]) if Filters["centreId"] != "NONE" else Query.filter(PaymentInvoice.centre_id.is_(None))
    if Filters.get("studentId"):
        Query = Query.filter(PaymentInvoice.student_id == Filters["studentId"])
    if Filters.get("batchId"):
        Query = Query.filter(PaymentInvoice.batch_id == Filters["batchId"])
    DateFrom = _ParseDate(Filters.get("dateFrom"), "From date")
    DateTo = _ParseDate(Filters.get("dateTo"), "To date")
    if DateFrom:
        Query = Query.filter(PaymentInvoice.invoice_date >= DateFrom)
    if DateTo:
        Query = Query.filter(PaymentInvoice.invoice_date <= DateTo)
    Search = str(Filters.get("search") or "").strip()
    if Search:
        Like = f"%{Search.lower()}%"
        Query = Query.filter(
            or_(
                func.lower(User.full_name).like(Like),
                func.lower(Student.student_code).like(Like),
                func.lower(func.coalesce(Student.custom_id, "")).like(Like),
                func.lower(PaymentInvoice.invoice_number).like(Like),
            )
        )
    return Query


def _UserNames(db: Session, Ids: set[str]) -> dict[str, str]:
    Ids = {Id for Id in Ids if Id}
    if not Ids:
        return {}
    return {Row.id: Row.full_name for Row in db.query(User).filter(User.id.in_(Ids)).all()}


def ListInvoices(db: Session, *, Filters: dict[str, Any], Page: int = 1, PageSize: int = 50) -> dict[str, Any]:
    Page = max(1, int(Page or 1))
    PageSize = max(1, min(int(PageSize or 50), 200))
    Query = _FilteredQuery(db, Filters)
    TotalCount = Query.count()
    Totals = (
        Query.with_entities(
            func.coalesce(func.sum(PaymentInvoice.amount_paise), 0),
            func.coalesce(func.sum(PaymentInvoice.paid_paise), 0),
            func.coalesce(func.sum(PaymentInvoice.discount_paise), 0),
        )
        .filter(PaymentInvoice.status != "CANCELLED")
        .one()
    )
    Rows = (
        Query.order_by(PaymentInvoice.invoice_date.desc(), PaymentInvoice.invoice_number.desc())
        .offset((Page - 1) * PageSize)
        .limit(PageSize)
        .all()
    )
    Today = TodayInIndia()
    Names = _UserNames(db, {Row.created_by_user_id for Row in Rows} | {Row.cancelled_by_user_id for Row in Rows})
    Amount, Paid, Discount = int(Totals[0] or 0), int(Totals[1] or 0), int(Totals[2] or 0)
    return {
        "page": Page,
        "pageSize": PageSize,
        "totalCount": TotalCount,
        "totals": {
            "amountDisplay": FormatIndianRupees(Amount),
            "paidDisplay": FormatIndianRupees(Paid),
            "discountDisplay": FormatIndianRupees(Discount),
            "balanceDisplay": FormatIndianRupees(max(0, Amount - Paid - Discount)),
        },
        "invoices": [
            InvoicePayload(Row, Today=Today, CreatedByName=Names.get(Row.created_by_user_id), CancelledByName=Names.get(Row.cancelled_by_user_id))
            for Row in Rows
        ],
    }


def GetInvoice(db: Session, InvoiceId: str) -> dict[str, Any]:
    Invoice = db.get(PaymentInvoice, InvoiceId)
    if not Invoice:
        api_error(404, "INVOICE_NOT_FOUND", "That invoice was not found.")
    Names = _UserNames(db, {Invoice.created_by_user_id, Invoice.cancelled_by_user_id})
    Payload = InvoicePayload(Invoice, CreatedByName=Names.get(Invoice.created_by_user_id), CancelledByName=Names.get(Invoice.cancelled_by_user_id))
    Payload["snapshot"] = json.loads(Invoice.snapshot_json)
    return Payload


def CancelInvoice(db: Session, *, InvoiceId: str, Reason: Any, Actor: User | None) -> dict[str, Any]:
    CleanReason = re.sub(r"\s+", " ", str(Reason or "")).strip()
    if not CleanReason:
        api_error(422, "REASON_REQUIRED", "Please give a reason for cancelling this invoice.")
    from app.services.payments.receipts_service import RecomputeInvoice, ReleaseInvoiceAllocations, _LockStudent

    Found = db.get(PaymentInvoice, InvoiceId)
    if not Found:
        api_error(404, "INVOICE_NOT_FOUND", "That invoice was not found.")
    # Student first, then the invoice: the same order as payments use.
    _LockStudent(db, Found.student_id)
    Invoice = db.query(PaymentInvoice).filter(PaymentInvoice.id == InvoiceId).with_for_update().one()
    db.refresh(Invoice)
    if Invoice.status == "CANCELLED":
        api_error(409, "INVOICE_ALREADY_CANCELLED", f"{Invoice.invoice_number} is already cancelled.")
    Before = _InvoiceAuditShape(Invoice)
    # Anything already paid on it becomes the student's advance (2026-10-08,
    # Phase 3); a discount on it simply falls away.
    Moved = ReleaseInvoiceAllocations(db, Invoice)
    Invoice.status = "CANCELLED"
    Invoice.cancel_reason = CleanReason[:500]
    Invoice.cancelled_at = datetime.now(timezone.utc)
    Invoice.cancelled_by_user_id = Actor.id if Actor else None
    db.flush()
    RecomputeInvoice(db, Invoice)
    After = _InvoiceAuditShape(Invoice)
    if Moved:
        After["movedToAdvance"] = PaiseToRupeesString(Moved)
    WritePaymentAudit(db, EntityType="INVOICE", EntityId=Invoice.id, Action="CANCEL", Actor=Actor, Before=Before, After=After, Reason=CleanReason)
    db.commit()
    Result = GetInvoice(db, Invoice.id)
    Result["movedToAdvancePaise"] = Moved
    Result["movedToAdvanceDisplay"] = FormatIndianRupees(Moved)
    return Result


def InvoicesForPdf(db: Session, *, InvoiceIds: list[str] | None = None, Filters: dict[str, Any] | None = None) -> list[PaymentInvoice]:
    if InvoiceIds:
        Ids = [Id for Id in dict.fromkeys(str(Id) for Id in InvoiceIds) if Id]
        if len(Ids) > MAX_INVOICES_PER_PDF:
            api_error(422, "TOO_MANY_INVOICES", f"Choose at most {MAX_INVOICES_PER_PDF} invoices for one PDF.")
        Rows = db.query(PaymentInvoice).filter(PaymentInvoice.id.in_(Ids)).all()
        Order = {Id: Index for Index, Id in enumerate(Ids)}
        Rows.sort(key=lambda Row: Order.get(Row.id, 0))
    else:
        Query = _FilteredQuery(db, Filters or {})
        if Query.count() > MAX_INVOICES_PER_PDF:
            api_error(422, "TOO_MANY_INVOICES", f"That is more than {MAX_INVOICES_PER_PDF} invoices. Narrow the filters and try again.")
        Rows = Query.order_by(PaymentInvoice.invoice_number.asc()).all()
    if not Rows:
        api_error(404, "INVOICE_NOT_FOUND", "No invoices to print.")
    return Rows


def InvoicesForExport(db: Session, *, Filters: dict[str, Any]) -> list[dict[str, Any]]:
    Rows = _FilteredQuery(db, Filters).order_by(PaymentInvoice.invoice_date.asc(), PaymentInvoice.invoice_number.asc()).all()
    Today = TodayInIndia()
    return [InvoicePayload(Row, Today=Today) for Row in Rows]


# --------------------------------------------------------------------------
# Who can be invoiced (for the Generate screen)
# --------------------------------------------------------------------------

def ListStudentsForInvoicing(db: Session) -> list[dict[str, Any]]:
    Rows = db.query(Student, User).join(User, Student.user_id == User.id).order_by(User.full_name.asc()).all()
    Levels = {Row.id: Row for Row in db.query(Level).all()}
    Modules = {Row.id: Row for Row in db.query(Module).all()}
    TeacherNames = {TeacherRow.id: TeacherUser.full_name for TeacherRow, TeacherUser in db.query(Teacher, User).join(User, Teacher.user_id == User.id).all()}
    Centres = {Row.id: Row.name for Row in db.query(PaymentCentre).all()}
    BatchNames = {Row.id: Row.batch_name for Row in db.query(Batch).all()}
    BatchesByStudent: dict[str, list[dict[str, str]]] = {}
    for Link in db.query(StudentBatch).filter(StudentBatch.is_active == True).all():  # noqa: E712
        if Link.batch_id in BatchNames:
            BatchesByStudent.setdefault(Link.student_id, []).append({"batchId": Link.batch_id, "batchName": BatchNames[Link.batch_id]})
    Result = []
    for Row, UserRow in Rows:
        LevelRow = Levels.get(Row.current_level_id)
        ModuleRow = Modules.get(Row.current_module_id)
        Result.append(
            {
                "studentId": Row.id,
                "studentName": UserRow.full_name,
                "studentCode": Row.student_code,
                "customId": Row.custom_id,
                "levelCode": LevelRow.level_code if LevelRow else None,
                "moduleCode": ModuleRow.module_code if ModuleRow else None,
                "teacherName": TeacherNames.get(Row.teacher_id) or Row.teacher,
                "centreId": Row.centre_id,
                "centreName": Centres.get(Row.centre_id) if Row.centre_id else None,
                "batches": BatchesByStudent.get(Row.id, []),
                "isActive": bool(Row.is_active and UserRow.is_active),
            }
        )
    return Result
