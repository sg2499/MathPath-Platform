"""Billing Release 2 (2026-11-27, Shailesh): invoices with several lines.

  * CreateInvoice -- New Invoice for one student: any active fee items,
    each with a quantity and an optional discount (fixed rupees or a
    percent), an optional discount on the whole invoice, and optionally the
    payment taken at the same time (client document §5-§7, answers C3, C4,
    C9, I1, I2). Discounts need a reason and record who approved them.
  * Admission -- the same, for a new student's admission package
    (Registration + the first month's tuition + the level's book + the free
    kit at ₹0), only with a payment (C3), once per student. The invoice date
    becomes the admission date (A2), which also decides the fee group.
  * AddLateFee -- ₹100 on a monthly fee left unpaid (or paid) after the
    25th of its month, added by hand, once per invoice (D3).
  * RecordHandover -- the day a book or kit item was handed over (C8); a
    book only once its invoice is paid (E3).

GST is worked out once, on the invoice's total (H8). A kit line is ₹0 but
still takes one from stock (H3, UAT 7). Stock is checked and taken in the
same transaction as the invoice, so a sale that would take more than is in
stock is refused and nothing changes (C5, UAT 5).

Lock order, the same everywhere so two admins can never deadlock: invoice
number sequence, then the student, then the invoices, then stock balances,
then the receipt number sequence.
"""
from __future__ import annotations

import calendar
import json
import re
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import (
    FeeItem,
    Level,
    PaymentCentre,
    PaymentInvoice,
    PaymentInvoiceBatch,
    PaymentInvoiceLine,
    PaymentReceipt,
    Student,
    User,
)
from app.services.payments.articles_service import ARTICLE_KINDS, INVOICE_TYPES, InvoiceTypeForKinds, KindOf, LateFeeItem, PriceOn
from app.services.payments.audit import WritePaymentAudit
from app.services.payments.money import MAX_AMOUNT_PAISE, FormatIndianRupees, PaiseToRupeesString, ParseRupeesToPaise, SplitInclusiveGst

MAX_LINES = 30
MAX_LINE_QUANTITY = 500
LATE_FEE_DAY = 25
DISCOUNT_TYPES = ("FIXED", "PERCENT")


def _Today() -> date:
    from app.services.payments.invoices_service import TodayInIndia

    return TodayInIndia()


def _Clean(Value: Any, Limit: int) -> str | None:
    Text = re.sub(r"\s+", " ", str(Value or "")).strip()
    return Text[:Limit] or None


def _RoundHalfUp(Numerator: int, Denominator: int) -> int:
    return int((Decimal(Numerator) / Decimal(Denominator)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


# --------------------------------------------------------------------------
# Pricing (no database writes)
# --------------------------------------------------------------------------

def ParseDiscount(Raw: Any, Gross: int, Label: str) -> tuple[str | None, int | None, int]:
    """(type, value, paise). FIXED value is paise; PERCENT value is basis
    points (10% = 1000)."""
    if not Raw:
        return None, None, 0
    Type = str((Raw or {}).get("type") or "").strip().upper()
    Value = (Raw or {}).get("value")
    if Type == "" or Value in (None, ""):
        return None, None, 0
    if Type not in DISCOUNT_TYPES:
        api_error(422, "DISCOUNT_TYPE_INVALID", f"{Label}: choose a discount in rupees or a percent.")
    if Type == "FIXED":
        Paise = ParseRupeesToPaise(Value, FieldLabel=f"{Label} discount", AllowZero=True)
        if Paise > Gross:
            api_error(422, "DISCOUNT_TOO_LARGE", f"{Label}: the discount ({FormatIndianRupees(Paise)}) is more than the amount ({FormatIndianRupees(Gross)}).")
        return (Type, Paise, Paise) if Paise else (None, None, 0)
    try:
        Percent = Decimal(str(Value).strip().rstrip("%"))
    except (InvalidOperation, ValueError):
        api_error(422, "DISCOUNT_INVALID", f"{Label}: the percent must be a number.")
    if Percent < 0 or Percent > 100 or Percent != Percent.quantize(Decimal("0.01")):
        api_error(422, "DISCOUNT_INVALID", f"{Label}: the percent must be between 0 and 100, with at most two decimals.")
    Bps = int(Percent * 100)
    Paise = _RoundHalfUp(Gross * Bps, 10000)
    return (Type, Bps, Paise) if Paise else (None, None, 0)


def AllocateShares(Total: int, Weights: list[int]) -> list[int]:
    """Splits Total across the weights in proportion, whole paise, the
    remainders going to the largest fractions (they always add to Total)."""
    Sum = sum(Weights)
    if Total <= 0 or Sum <= 0:
        return [0 for _ in Weights]
    Exact = [Decimal(Total) * Decimal(Weight) / Decimal(Sum) for Weight in Weights]
    Shares = [int(Value) for Value in Exact]
    Left = Total - sum(Shares)
    Order = sorted(range(len(Weights)), key=lambda Index: (Exact[Index] - Shares[Index], Weights[Index]), reverse=True)
    for Index in Order[:Left]:
        Shares[Index] += 1
    return Shares


def DiscountText(Type: str | None, Value: int | None) -> str | None:
    if not Type or Value is None:
        return None
    if Type == "PERCENT":
        return f"{Decimal(Value) / 100:g}%"
    return FormatIndianRupees(Value)


def PriceLines(Specs: list[dict[str, Any]], InvoiceDiscount: Any) -> dict[str, Any]:
    """Specs: [{item, quantity, unitPaise, discount, isKit, periodKey,
    periodLabel, description, stockCentreId}] -> every number on the invoice."""
    Lines = []
    for Index, Spec in enumerate(Specs):
        Item: FeeItem = Spec["item"]
        Quantity = Spec["quantity"]
        Unit = 0 if Spec.get("isKit") else Spec["unitPaise"]
        Gross = Unit * Quantity
        Type, Value, Discount = ParseDiscount(Spec.get("discount"), Gross, Item.name) if not Spec.get("isKit") else (None, None, 0)
        Lines.append({
            **Spec,
            "lineNo": Index + 1,
            "unitPaise": Unit,
            "grossPaise": Gross,
            "discountType": Type,
            "discountValue": Value,
            "discountPaise": Discount,
            "netPaise": Gross - Discount,
        })
    Subtotal = sum(Line["netPaise"] for Line in Lines)
    InvType, InvValue, InvDiscount = ParseDiscount(InvoiceDiscount, Subtotal, "Invoice")
    Shares = AllocateShares(InvDiscount, [Line["netPaise"] for Line in Lines])
    for Line, Share in zip(Lines, Shares):
        Line["sharePaise"] = Share
        Line["finalPaise"] = Line["netPaise"] - Share
    Total = sum(Line["finalPaise"] for Line in Lines)
    if Total > MAX_AMOUNT_PAISE:
        api_error(422, "AMOUNT_TOO_LARGE", "The invoice total is too large.")
    WithGst = [Line for Line in Lines if Line["item"].gst_included and (Line["item"].gst_rate_bps or 0) > 0]
    Rates = {Line["item"].gst_rate_bps for Line in WithGst}
    if len(Rates) > 1:
        api_error(422, "MIXED_GST_RATES", "These items have different GST rates. Put them on separate invoices.")
    Rate = Rates.pop() if Rates else 0
    GstTotal = sum(Line["finalPaise"] for Line in WithGst)
    Split = SplitInclusiveGst(GstTotal, Rate, GstIncluded=bool(Rate))
    NoGst = Total - GstTotal
    return {
        "lines": Lines,
        "subtotalPaise": Subtotal,
        "invoiceDiscountType": InvType,
        "invoiceDiscountValue": InvValue,
        "invoiceDiscountPaise": InvDiscount,
        "totalPaise": Total,
        "taxablePaise": Split["taxablePaise"] + NoGst,
        "cgstPaise": Split["cgstPaise"],
        "sgstPaise": Split["sgstPaise"],
        "gstRateBps": Rate,
        "gstIncluded": bool(Rate),
        "hasDiscount": bool(InvDiscount or any(Line["discountPaise"] for Line in Lines)),
    }


def _PeriodLabel(PeriodKey: str | None) -> str | None:
    if not PeriodKey:
        return None
    return f"{calendar.month_name[int(PeriodKey[5:])]} {PeriodKey[:4]}"


def _LineDescription(Item: FeeItem, LevelCode: str | None, PeriodKey: str | None, IsKit: bool) -> str:
    Parts = [Item.name]
    if KindOf(Item) == "BOOK" and Item.level_code:
        Parts.append(Item.level_code)
    elif KindOf(Item) == "TUITION" and LevelCode:
        Parts.append(LevelCode)
    if PeriodKey:
        Parts.append(_PeriodLabel(PeriodKey))
    if IsKit:
        Parts.append("free with admission")
    return " · ".join(Part for Part in Parts if Part)


def _Title(InvoiceType: str, Lines: list[dict[str, Any]]) -> str:
    if InvoiceType == "ADMISSION":
        return "Admission Package"
    if len(Lines) == 1:
        return Lines[0]["item"].name
    return f"{Lines[0]['item'].name} + {len(Lines) - 1} more"


# --------------------------------------------------------------------------
# Building one invoice (never commits)
# --------------------------------------------------------------------------

def _Approver(db: Session, ApprovedById: Any, Actor: User | None) -> User | None:
    from app.services.payments.receipts_service import STAFF_ROLES

    Id = str(ApprovedById or "").strip()
    if not Id:
        return Actor
    Row = db.get(User, Id)
    if not Row or Row.role not in STAFF_ROLES:
        api_error(422, "APPROVER_INVALID", "Choose who approved the discount from the list.")
    return Row


def _MonthTaken(db: Session, StudentId: str, PeriodKey: str) -> PaymentInvoice | None:
    return (
        db.query(PaymentInvoice)
        .filter(PaymentInvoice.student_id == StudentId, PaymentInvoice.billing_type == "MONTHLY", PaymentInvoice.period_key == PeriodKey, PaymentInvoice.status != "CANCELLED")
        .first()
    )


def _SourceTaken(db: Session, SourceKey: str | None) -> PaymentInvoice | None:
    if not SourceKey:
        return None
    return db.query(PaymentInvoice).filter(PaymentInvoice.source_key == SourceKey, PaymentInvoice.status != "CANCELLED").first()


def BuildInvoice(
    db: Session,
    *,
    StudentRow: Student,
    Priced: dict[str, Any],
    InvoiceDate: date,
    DueDate: date,
    InvoiceType: str | None = None,
    SourceKey: str | None = None,
    ParentInvoiceId: str | None = None,
    DiscountReason: str | None = None,
    Approver: User | None = None,
    BatchId: str | None = None,
    Actor: User | None,
) -> tuple[PaymentInvoice, list[PaymentInvoiceLine]]:
    """Writes the invoice, its lines and its stock movements. The caller
    holds the invoice sequence and the student row locks."""
    from app.services.payments.inventory_service import IssueForInvoice
    from app.services.payments.invoices_service import _BusinessSnapshot, _CentreSnapshot, _StudentSnapshot
    from app.services.payments.numbering import TakeNextNumber

    Lines = Priced["lines"]
    if not Lines:
        api_error(422, "LINES_REQUIRED", "Add at least one item to the invoice.")
    Kinds = [KindOf(Line["item"]) for Line in Lines]
    Type = InvoiceType or InvoiceTypeForKinds(Kinds)
    Tuition = [Line for Line in Lines if Line.get("periodKey")]
    if len(Tuition) > 1:
        api_error(422, "ONE_MONTH_ONLY", "An invoice can carry one month's tuition.")
    PeriodKey = Tuition[0]["periodKey"] if Tuition else None
    if PeriodKey:
        Taken = _MonthTaken(db, StudentRow.id, PeriodKey)
        if Taken:
            api_error(409, "MONTH_ALREADY_BILLED", f"{_PeriodLabel(PeriodKey)} tuition is already on {Taken.invoice_number} ({Taken.fee_name}).")
    Taken = _SourceTaken(db, SourceKey)
    if Taken:
        api_error(409, "ALREADY_RAISED", f"This was already raised on {Taken.invoice_number}.")
    if Priced["hasDiscount"] and not DiscountReason:
        api_error(422, "DISCOUNT_REASON_REQUIRED", "Please give a reason for the discount.")
    # Stock first (locked), so a short sale is refused before anything is written.
    from app.services.payments.inventory_service import CheckAvailable, ShortMessage

    Needs: dict[tuple[str, str], int] = {}
    for Line in Lines:
        if Line["item"].is_stock and Line.get("stockCentreId"):
            Key = (Line["item"].id, Line["stockCentreId"])
            Needs[Key] = Needs.get(Key, 0) + Line["quantity"]
    Short = CheckAvailable(db, Needs, Lock=True)
    if Short:
        api_error(409, "OUT_OF_STOCK", ShortMessage(Short))

    UserRow = db.get(User, StudentRow.user_id)
    LevelRow = db.get(Level, StudentRow.current_level_id) if StudentRow.current_level_id else None
    Centres = db.query(PaymentCentre).order_by(PaymentCentre.display_order.asc(), PaymentCentre.name.asc()).all()
    Main = Tuition[0] if Tuition else (Lines[0] if len(Lines) == 1 else None)
    Title = _Title(Type, Lines)
    StockCentres = {Line.get("stockCentreId") for Line in Lines if Line.get("stockCentreId")}
    Snapshot = {
        "business": _BusinessSnapshot(db),
        "centre": _CentreSnapshot(db, StudentRow.centre_id, Centres),
        "student": _StudentSnapshot(StudentRow, UserRow, LevelRow),
        "lines": [
            {
                "lineNo": Line["lineNo"],
                "name": Line["item"].name,
                "description": Line["description"],
                "kind": KindOf(Line["item"]),
                "quantity": Line["quantity"],
                "unitPaise": Line["unitPaise"],
                "grossPaise": Line["grossPaise"],
                "discountPaise": Line["discountPaise"],
                "discountText": DiscountText(Line["discountType"], Line["discountValue"]),
                "netPaise": Line["netPaise"],
                "isKit": bool(Line.get("isKit")),
                "gstIncluded": bool(Line["item"].gst_included),
            }
            for Line in Lines
        ],
        "subtotalPaise": Priced["subtotalPaise"],
        "invoiceDiscountPaise": Priced["invoiceDiscountPaise"],
        "invoiceDiscountText": DiscountText(Priced["invoiceDiscountType"], Priced["invoiceDiscountValue"]),
    }
    try:
        with db.begin_nested():
            Number = TakeNextNumber(db, "INVOICE")
            Invoice = PaymentInvoice(
                invoice_number=Number,
                student_id=StudentRow.id,
                fee_item_id=Main["item"].id if Main else None,
                batch_id=BatchId,
                fee_name=Title[:150],
                billing_type="MONTHLY" if PeriodKey else "ONE_TIME",
                billing_month=int(PeriodKey[5:]) if PeriodKey else None,
                billing_year=int(PeriodKey[:4]) if PeriodKey else None,
                period_key=PeriodKey,
                description=" + ".join(Line["description"] for Line in Lines)[:2000],
                invoice_date=InvoiceDate,
                due_date=DueDate,
                amount_paise=Priced["totalPaise"],
                taxable_paise=Priced["taxablePaise"],
                cgst_paise=Priced["cgstPaise"],
                sgst_paise=Priced["sgstPaise"],
                gst_rate_bps=Priced["gstRateBps"],
                gst_included=Priced["gstIncluded"],
                paid_paise=0,
                status="PENDING",
                level_code=LevelRow.level_code if LevelRow else None,
                centre_id=StudentRow.centre_id,
                snapshot_json=json.dumps(Snapshot, sort_keys=True),
                source="ADMIN",
                invoice_type=Type,
                gross_paise=Priced["subtotalPaise"],
                invoice_discount_paise=Priced["invoiceDiscountPaise"],
                invoice_discount_type=Priced["invoiceDiscountType"],
                invoice_discount_value=Priced["invoiceDiscountValue"],
                invoice_discount_reason=DiscountReason if Priced["hasDiscount"] else None,
                discount_approved_by_user_id=(Approver.id if Approver else None) if Priced["hasDiscount"] else None,
                discount_approved_by_name=(Approver.full_name if Approver else None) if Priced["hasDiscount"] else None,
                source_key=SourceKey,
                parent_invoice_id=ParentInvoiceId,
                stock_centre_id=next(iter(StockCentres)) if len(StockCentres) == 1 else None,
                line_count=len(Lines),
                created_by_user_id=Actor.id if Actor else None,
            )
            db.add(Invoice)
            db.flush()
    except IntegrityError:
        # Raised by someone else a moment ago (the same month, or the same
        # admission / book / late fee). The savepoint gave the number back.
        if PeriodKey and _MonthTaken(db, StudentRow.id, PeriodKey):
            api_error(409, "MONTH_ALREADY_BILLED", f"{_PeriodLabel(PeriodKey)} tuition was invoiced by someone else a moment ago.")
        api_error(409, "ALREADY_RAISED", "This invoice was raised by someone else a moment ago. Refresh to see it.")
    Rows = []
    for Line in Lines:
        Item = Line["item"]
        Row = PaymentInvoiceLine(
            invoice_id=Invoice.id,
            line_no=Line["lineNo"],
            fee_item_id=Item.id,
            name=Item.name,
            description=Line["description"],
            article_kind=KindOf(Item),
            quantity=Line["quantity"],
            unit_paise=Line["unitPaise"],
            gross_paise=Line["grossPaise"],
            discount_type=Line["discountType"],
            discount_value=Line["discountValue"],
            discount_paise=Line["discountPaise"],
            net_paise=Line["netPaise"],
            invoice_discount_share_paise=Line["sharePaise"],
            final_paise=Line["finalPaise"],
            gst_included=bool(Item.gst_included),
            gst_rate_bps=Item.gst_rate_bps or 0,
            is_stock=bool(Item.is_stock),
            is_kit=bool(Line.get("isKit")),
            period_key=Line.get("periodKey"),
            stock_centre_id=Line.get("stockCentreId") if Item.is_stock else None,
        )
        db.add(Row)
        Rows.append(Row)
    db.flush()
    IssueForInvoice(db, Invoice, Rows, Actor)
    from app.services.payments.invoices_service import _InvoiceAuditShape

    After = _InvoiceAuditShape(Invoice)
    After["items"] = [f"{Line['quantity']} × {Line['item'].name}" + (" (kit)" if Line.get("isKit") else "") for Line in Lines]
    if Priced["hasDiscount"]:
        After["discountReason"] = DiscountReason
        After["approvedBy"] = Approver.full_name if Approver else None
    WritePaymentAudit(db, EntityType="INVOICE", EntityId=Invoice.id, Action="CREATE", Actor=Actor, After=After)
    return Invoice, Rows


# --------------------------------------------------------------------------
# New Invoice / Admission
# --------------------------------------------------------------------------

def _ParseLineSpecs(db: Session, StudentRow: Student, RawLines: list[Any], InvoiceDate: date, *, Admission: bool) -> list[dict[str, Any]]:
    from app.services.payments.inventory_service import StockCentreId

    Raw = [Line for Line in (RawLines or []) if Line and (Line or {}).get("feeItemId")]
    if not Raw:
        api_error(422, "LINES_REQUIRED", "Add at least one item to the invoice.")
    if len(Raw) > MAX_LINES:
        api_error(422, "TOO_MANY_LINES", f"An invoice can have at most {MAX_LINES} lines.")
    LevelRow = db.get(Level, StudentRow.current_level_id) if StudentRow.current_level_id else None
    StockCentre = StockCentreId(db, StudentRow.centre_id)
    Specs = []
    for Line in Raw:
        Item = db.get(FeeItem, str(Line.get("feeItemId")))
        if not Item:
            api_error(404, "FEE_ITEM_NOT_FOUND", "One of the items no longer exists. Refresh and try again.")
        if not Item.is_active:
            api_error(422, "FEE_ITEM_INACTIVE", f"{Item.name} is switched off. Switch it on in Fee Setup to invoice it.")
        Kind = KindOf(Item)
        if Kind == "REGISTRATION" and not Admission:
            api_error(422, "REGISTRATION_ON_ADMISSION", "Registration is charged on the admission invoice (Invoices > New Admission).")
        if Kind == "LATE_FEE":
            api_error(422, "LATE_FEE_FROM_INVOICE", "Add a late fee from the monthly fee's invoice (Add Late Fee).")
        IsKit = bool(Line.get("isKit"))
        if IsKit and Kind != "MERCH":
            api_error(422, "KIT_IS_MERCH", f"{Item.name} cannot be a free kit item.")
        if IsKit and not Admission:
            api_error(422, "KIT_ON_ADMISSION", "The free kit comes with the admission invoice only.")
        try:
            Quantity = int(Line.get("quantity") or 1)
        except (TypeError, ValueError):
            api_error(422, "QUANTITY_INVALID", f"{Item.name}: the quantity must be a whole number.")
        if Quantity < 1 or Quantity > MAX_LINE_QUANTITY:
            api_error(422, "QUANTITY_INVALID", f"{Item.name}: the quantity must be between 1 and {MAX_LINE_QUANTITY}.")
        if IsKit:
            Quantity = 1
        PeriodKey = None
        if Item.billing_type == "MONTHLY":
            if Quantity != 1:
                api_error(422, "QUANTITY_INVALID", "A monthly fee is for one month at a time.")
            Month, Year = Line.get("billingMonth"), Line.get("billingYear")
            if Month in (None, "") or Year in (None, ""):
                Month, Year = InvoiceDate.month, InvoiceDate.year
            try:
                Month, Year = int(Month), int(Year)
            except (TypeError, ValueError):
                api_error(422, "BILLING_PERIOD_REQUIRED", "Choose the month for the monthly fee.")
            if not 1 <= Month <= 12 or not 2020 <= Year <= 2100:
                api_error(422, "BILLING_PERIOD_REQUIRED", "Choose a valid month for the monthly fee.")
            PeriodKey = f"{Year:04d}-{Month:02d}"
        Specs.append({
            "item": Item,
            "quantity": Quantity,
            "unitPaise": PriceOn(db, Item, InvoiceDate),
            "discount": {"type": Line.get("discountType"), "value": Line.get("discountValue")},
            "isKit": IsKit,
            "periodKey": PeriodKey,
            "description": _LineDescription(Item, LevelRow.level_code if LevelRow else None, PeriodKey, IsKit),
            "stockCentreId": StockCentre if Item.is_stock else None,
        })
    return Specs


def _CheckedDates(Request: dict[str, Any], *, Admission: bool) -> tuple[date, date]:
    from app.services.payments.invoices_service import DEFAULT_DUE_DAYS, _ParseDate

    InvoiceDate = _ParseDate(Request.get("invoiceDate"), "Invoice date") or _Today()
    if InvoiceDate > _Today() + timedelta(days=366) or InvoiceDate < date(2020, 1, 1):
        api_error(422, "DATE_INVALID", "The invoice date looks wrong. Please check the year.")
    if Admission and InvoiceDate > _Today():
        api_error(422, "DATE_IN_FUTURE", "An admission invoice is raised when the payment is received, so it cannot be dated later than today.")
    DueDate = _ParseDate(Request.get("dueDate"), "Due date") or (InvoiceDate if Admission else InvoiceDate + timedelta(days=DEFAULT_DUE_DAYS))
    if DueDate < InvoiceDate:
        api_error(422, "DUE_BEFORE_INVOICE", "The due date cannot be before the invoice date.")
    return InvoiceDate, DueDate


def _PaymentTotal(Payment: dict[str, Any] | None) -> int:
    from app.services.payments.receipts_service import _Paise

    Total = 0
    for Line in (Payment or {}).get("methods") or []:
        Total += _Paise((Line or {}).get("amountPaise", 0), "Payment amount")
    return Total


def PreviewInvoice(db: Session, *, Request: dict[str, Any], Admission: bool = False) -> dict[str, Any]:
    """What New Invoice / New Admission would raise: lines, totals, GST, and
    anything that would stop it (stock, month already billed)."""
    from app.services.payments.inventory_service import CheckAvailable

    StudentRow = db.get(Student, str(Request.get("studentId") or ""))
    if not StudentRow:
        api_error(404, "STUDENT_NOT_FOUND", "Choose a student.")
    InvoiceDate, DueDate = _CheckedDates(Request, Admission=Admission)
    Specs = _ParseLineSpecs(db, StudentRow, Request.get("lines") or [], InvoiceDate, Admission=Admission)
    Priced = PriceLines(Specs, Request.get("invoiceDiscount"))
    Problems = []
    Needs: dict[tuple[str, str], int] = {}
    for Line in Priced["lines"]:
        if Line["item"].is_stock and Line.get("stockCentreId"):
            Key = (Line["item"].id, Line["stockCentreId"])
            Needs[Key] = Needs.get(Key, 0) + Line["quantity"]
    Short = CheckAvailable(db, Needs, Lock=False)
    if Short:
        from app.services.payments.inventory_service import ShortMessage

        Problems.append(ShortMessage(Short))
    for Line in Priced["lines"]:
        if Line.get("periodKey"):
            Taken = _MonthTaken(db, StudentRow.id, Line["periodKey"])
            if Taken:
                Problems.append(f"{_PeriodLabel(Line['periodKey'])} tuition is already on {Taken.invoice_number}.")
    if Admission:
        Taken = _SourceTaken(db, f"ADMISSION:{StudentRow.id}")
        if Taken:
            Problems.append(f"This student's admission invoice is {Taken.invoice_number}.")
    return {
        "invoiceDate": InvoiceDate.isoformat(),
        "dueDate": DueDate.isoformat(),
        **_PricedPayload(Priced),
        "short": Short,
        "problems": Problems,
    }


def _PricedPayload(Priced: dict[str, Any]) -> dict[str, Any]:
    return {
        "lines": [
            {
                "lineNo": Line["lineNo"],
                "feeItemId": Line["item"].id,
                "name": Line["item"].name,
                "description": Line["description"],
                "kind": KindOf(Line["item"]),
                "quantity": Line["quantity"],
                "unitPaise": Line["unitPaise"],
                "unitDisplay": FormatIndianRupees(Line["unitPaise"]),
                "grossPaise": Line["grossPaise"],
                "discountPaise": Line["discountPaise"],
                "discountDisplay": FormatIndianRupees(Line["discountPaise"]),
                "discountText": DiscountText(Line["discountType"], Line["discountValue"]),
                "netPaise": Line["netPaise"],
                "netDisplay": FormatIndianRupees(Line["netPaise"]),
                "isKit": bool(Line.get("isKit")),
                "isStock": bool(Line["item"].is_stock),
                "periodKey": Line.get("periodKey"),
            }
            for Line in Priced["lines"]
        ],
        "subtotalPaise": Priced["subtotalPaise"],
        "subtotalDisplay": FormatIndianRupees(Priced["subtotalPaise"]),
        "invoiceDiscountPaise": Priced["invoiceDiscountPaise"],
        "invoiceDiscountDisplay": FormatIndianRupees(Priced["invoiceDiscountPaise"]),
        "totalPaise": Priced["totalPaise"],
        "totalDisplay": FormatIndianRupees(Priced["totalPaise"]),
        "taxableDisplay": FormatIndianRupees(Priced["taxablePaise"]),
        "cgstDisplay": FormatIndianRupees(Priced["cgstPaise"]),
        "sgstDisplay": FormatIndianRupees(Priced["sgstPaise"]),
        "gstRatePercent": Priced["gstRateBps"] / 100,
        "hasDiscount": Priced["hasDiscount"],
    }


def CreateInvoice(db: Session, *, Request: dict[str, Any], IdempotencyKey: str, Actor: User | None, Admission: bool = False) -> dict[str, Any]:
    from app.services.payments.invoices_service import GetInvoice
    from app.services.payments.numbering import LockSequence
    from app.services.payments.receipts_service import AdvanceBalances, ApplyAdvance, PaymentPayload, RecordPaymentInTransaction, _LockStudent

    Key = (IdempotencyKey or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,70}", Key):
        api_error(422, "IDEMPOTENCY_KEY_INVALID", "Refresh the page and try again.")

    def _Replay(BatchRow: PaymentInvoiceBatch) -> dict[str, Any]:
        Invoice = db.query(PaymentInvoice).filter(PaymentInvoice.batch_id == BatchRow.id).first()
        Payment = db.query(PaymentReceipt).filter(PaymentReceipt.idempotency_key == f"{Key}-pay").first()
        return {"invoice": GetInvoice(db, Invoice.id) if Invoice else None, "payment": PaymentPayload(db, Payment) if Payment else None, "replayed": True}

    Previous = db.query(PaymentInvoiceBatch).filter(PaymentInvoiceBatch.idempotency_key == Key).first()
    if Previous:
        return _Replay(Previous)
    StudentId = str(Request.get("studentId") or "").strip()
    if not StudentId:
        api_error(422, "STUDENT_REQUIRED", "Choose a student.")
    Sequence = LockSequence(db, "INVOICE")
    if not Sequence.is_configured:
        api_error(409, "PAYMENT_NUMBERING_NOT_SET", "The starting invoice number has not been set yet. Set it in Payments > Payment Settings first.")
    StudentRow = _LockStudent(db, StudentId)
    Previous = db.query(PaymentInvoiceBatch).filter(PaymentInvoiceBatch.idempotency_key == Key).first()
    if Previous:
        db.rollback()
        return _Replay(Previous)
    UserRow = db.get(User, StudentRow.user_id)
    if not (StudentRow.is_active and UserRow and UserRow.is_active):
        api_error(422, "STUDENT_INACTIVE", "This student is inactive. Make them active before invoicing.")

    InvoiceDate, DueDate = _CheckedDates(Request, Admission=Admission)
    Specs = _ParseLineSpecs(db, StudentRow, Request.get("lines") or [], InvoiceDate, Admission=Admission)
    Priced = PriceLines(Specs, Request.get("invoiceDiscount"))
    Reason = _Clean(Request.get("discountReason"), 300)
    Approver = _Approver(db, Request.get("approvedByUserId"), Actor) if Priced["hasDiscount"] else None
    Payment = Request.get("payment") or None
    Paying = _PaymentTotal(Payment)
    if Admission and Paying <= 0 and Priced["totalPaise"] > 0:
        api_error(422, "ADMISSION_PAYMENT_REQUIRED", "An admission invoice is raised when the payment is received. Enter the amount paid.")
    SourceKey = f"ADMISSION:{StudentRow.id}" if Admission else None

    BatchRow = PaymentInvoiceBatch(
        idempotency_key=Key,
        params_json=json.dumps({"kind": "ADMISSION" if Admission else "NEW_INVOICE", "invoiceDate": InvoiceDate.isoformat(), "lines": len(Specs)}),
        created_by_user_id=Actor.id if Actor else None,
    )
    db.add(BatchRow)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        Previous = db.query(PaymentInvoiceBatch).filter(PaymentInvoiceBatch.idempotency_key == Key).first()
        if Previous:
            return _Replay(Previous)
        raise
    Invoice, Rows = BuildInvoice(
        db, StudentRow=StudentRow, Priced=Priced, InvoiceDate=InvoiceDate, DueDate=DueDate,
        InvoiceType="ADMISSION" if Admission else None, SourceKey=SourceKey, DiscountReason=Reason, Approver=Approver,
        BatchId=BatchRow.id, Actor=Actor,
    )
    BatchRow.invoice_count = 1
    BatchRow.total_paise = Invoice.amount_paise

    PaymentRow = None
    if Paying > 0:
        Applied = min(Paying, Invoice.amount_paise)
        PaymentRequest = {
            "paymentDate": Payment.get("paymentDate") or InvoiceDate.isoformat(),
            "payBy": Payment.get("payBy"),
            "receivedByUserId": Payment.get("receivedByUserId"),
            "note": Payment.get("note"),
            "methods": Payment.get("methods") or [],
            "allocations": [{"invoiceId": Invoice.id, "amountPaise": Applied, "discountPaise": 0}] if Applied else [],
            "keepAdvance": bool(Payment.get("keepAdvance")),
        }
        PaymentRow = RecordPaymentInTransaction(db, StudentRow=StudentRow, Request=PaymentRequest, IdempotencyKey=f"{Key}-pay", Actor=Actor)
        if PaymentRow is None:
            Previous = db.query(PaymentInvoiceBatch).filter(PaymentInvoiceBatch.idempotency_key == Key).first()
            if Previous:
                return _Replay(Previous)
            api_error(409, "TRY_AGAIN", "Someone else saved this a moment ago. Refresh and try again.")
    elif AdvanceBalances(db, [StudentRow.id]):
        ApplyAdvance(db, StudentId=StudentRow.id, Actor=Actor, InvoiceIds=[Invoice.id], LockStudent=False)

    if Admission:
        _SetAdmissionDate(db, StudentRow, UserRow, InvoiceDate, Invoice, Actor)
    from app.services.payments.book_invoices import BooksInvoicedByHand

    BooksInvoicedByHand(db, StudentRow.id, Invoice, Rows)
    from app.services.payments.online_service import NotifyInvoicesRaised, NotifyPaymentReceived

    NotifyInvoicesRaised(db, {StudentRow.id: [Invoice.id]})
    if PaymentRow is not None:
        NotifyPaymentReceived(db, PaymentRow)
    db.commit()
    return {"invoice": GetInvoice(db, Invoice.id), "payment": PaymentPayload(db, PaymentRow) if PaymentRow else None, "replayed": False}


def _SetAdmissionDate(db: Session, StudentRow: Student, UserRow: User | None, Day: date, Invoice: PaymentInvoice, Actor: User | None) -> None:
    """Client answer A2: the admission date is the day the admission invoice
    is raised. Kept in the history with the fee group before and after."""
    from app.services.payments.billing_service import GROUPS, ParseAdmissionDate, RateGroupsFor

    Old = StudentRow.admission_date
    Parsed = ParseAdmissionDate(Old)
    if Parsed == Day:
        if Old != Day.isoformat():
            StudentRow.admission_date = Day.isoformat()
        return
    Before = RateGroupsFor(db, [StudentRow.id]).get(StudentRow.id, {})
    StudentRow.admission_date = Day.isoformat()
    db.flush()
    After = RateGroupsFor(db, [StudentRow.id]).get(StudentRow.id, {})
    Name = UserRow.full_name if UserRow else None
    WritePaymentAudit(
        db, EntityType="STUDENT", EntityId=StudentRow.id, Action="ADMISSION_DATE", Actor=Actor,
        Before={"student": Name, "studentCode": StudentRow.student_code, "admissionDate": Old, "rateGroup": GROUPS.get(Before.get("group", ""))},
        After={"student": Name, "studentCode": StudentRow.student_code, "admissionDate": Day.isoformat(), "rateGroup": GROUPS.get(After.get("group", ""))},
        Reason=f"Admission invoice {Invoice.invoice_number}",
    )


def AdmissionTemplate(db: Session, *, StudentId: str, InvoiceDate: Any = None) -> dict[str, Any]:
    """What a new student's admission invoice starts with (client document
    §5): Registration, the first month's tuition at the rate the admission
    date gives, the book for their level, and the free kit (not for an
    international student unless they want it, B4)."""
    from app.services.payments.articles_service import BookForLevel
    from app.services.payments.billing_service import EnsureBillingSettings, ModesFor, NewRateFrom, _FeeFor, _FeeItems
    from app.services.payments.invoices_service import _ParseDate
    from app.services.payments.inventory_service import AvailabilityFor

    StudentRow = db.get(Student, StudentId)
    if not StudentRow:
        api_error(404, "STUDENT_NOT_FOUND", "That student was not found.")
    UserRow = db.get(User, StudentRow.user_id)
    Day = _ParseDate(InvoiceDate, "Invoice date") or _Today()
    LevelRow = db.get(Level, StudentRow.current_level_id) if StudentRow.current_level_id else None
    Settings = EnsureBillingSettings(db)
    Mode = ModesFor(db, [StudentRow.id]).get(StudentRow.id, "INDIA")
    Group = "NEW" if Day >= NewRateFrom(Settings) else "EXISTING"
    Notes: list[str] = []
    Lines: list[dict[str, Any]] = []
    Registration = (
        db.query(FeeItem)
        .filter(FeeItem.article_kind == "REGISTRATION", FeeItem.is_active == True)  # noqa: E712
        .order_by(FeeItem.display_order.asc())
        .first()
    )
    if Registration:
        Lines.append({"feeItemId": Registration.id, "quantity": 1})
    else:
        Notes.append("No registration item is set up. Mark one as Registration in Fee Setup.")
    if Mode == "EXEMPT":
        Notes.append("This student is set to No monthly fee, so no tuition is added.")
    else:
        Tuition = _FeeFor(_FeeItems(db, Settings), Mode, Group)
        if Tuition and Tuition.is_active:
            Lines.append({"feeItemId": Tuition.id, "quantity": 1, "billingMonth": Day.month, "billingYear": Day.year})
        else:
            Notes.append(f"The {'new ' if Group == 'NEW' else ''}{Mode.title()} monthly fee is not chosen in Payment Settings > Billing; add the tuition line by hand.")
    Book = BookForLevel(db, LevelRow.level_code if LevelRow else None)
    if Book:
        Lines.append({"feeItemId": Book.id, "quantity": 1})
    elif LevelRow:
        Notes.append(f"No book is set up for {LevelRow.level_code}. Set the level on its book in Fee Setup.")
    else:
        Notes.append("The student has no level yet, so no book is added.")
    KitItems = db.query(FeeItem).filter(FeeItem.in_kit == True, FeeItem.is_active == True).order_by(FeeItem.display_order.asc()).all()  # noqa: E712
    for Item in KitItems:
        Lines.append({"feeItemId": Item.id, "quantity": 1, "isKit": True, "included": Mode != "INTERNATIONAL"})
    if Mode == "INTERNATIONAL" and KitItems:
        Notes.append("International student: the kit is left out unless they want it.")
    Existing = _SourceTaken(db, f"ADMISSION:{StudentRow.id}")
    return {
        "studentId": StudentRow.id,
        "studentName": UserRow.full_name if UserRow else "",
        "studentCode": StudentRow.student_code,
        "levelCode": LevelRow.level_code if LevelRow else None,
        "billingMode": Mode,
        "rateGroup": Group,
        "admissionDate": StudentRow.admission_date,
        "invoiceDate": Day.isoformat(),
        "lines": Lines,
        "notes": Notes,
        "existingAdmission": {"invoiceId": Existing.id, "invoiceNumber": Existing.invoice_number} if Existing else None,
        "stock": AvailabilityFor(db, CentreId=StudentRow.centre_id),
    }


# --------------------------------------------------------------------------
# Late fee
# --------------------------------------------------------------------------

def _LastPaymentDate(db: Session, Invoice: PaymentInvoice) -> date | None:
    from app.models import PaymentAllocation

    Row = (
        db.query(PaymentReceipt.payment_date)
        .join(PaymentAllocation, PaymentAllocation.payment_id == PaymentReceipt.id)
        .filter(PaymentAllocation.invoice_id == Invoice.id, PaymentAllocation.released_at.is_(None), PaymentReceipt.status == "RECORDED")
        .order_by(PaymentReceipt.payment_date.desc())
        .first()
    )
    return Row[0] if Row else None


def LateFeeCheck(db: Session, Invoice: PaymentInvoice) -> dict[str, Any]:
    """Whether a late fee can be added to this invoice, and why not."""
    if Invoice.billing_type != "MONTHLY" or not Invoice.period_key:
        return {"allowed": False, "reason": "A late fee is only for a monthly fee."}
    if Invoice.status == "CANCELLED":
        return {"allowed": False, "reason": "The invoice is cancelled."}
    Existing = _SourceTaken(db, f"LATE:{Invoice.id}")
    if Existing:
        return {"allowed": False, "reason": f"Late fee already added ({Existing.invoice_number}).", "lateFeeInvoiceId": Existing.id}
    Cutoff = date(int(Invoice.period_key[:4]), int(Invoice.period_key[5:]), LATE_FEE_DAY)
    if Invoice.status == "PAID":
        Paid = _LastPaymentDate(db, Invoice)
        if Paid and Paid > Cutoff:
            return {"allowed": True, "reason": f"Paid on {Paid.strftime('%d %b %Y')}, after the {LATE_FEE_DAY}th."}
        return {"allowed": False, "reason": f"Paid by the {LATE_FEE_DAY}th."}
    if _Today() > Cutoff:
        return {"allowed": True, "reason": f"Not paid by {Cutoff.strftime('%d %b %Y')}."}
    return {"allowed": False, "reason": f"Can be added after {Cutoff.strftime('%d %b %Y')} if it is still unpaid."}


def AddLateFee(db: Session, *, InvoiceId: str, Actor: User | None) -> dict[str, Any]:
    from app.services.payments.invoices_service import DEFAULT_DUE_DAYS, GetInvoice
    from app.services.payments.numbering import LockSequence
    from app.services.payments.receipts_service import AdvanceBalances, ApplyAdvance, _LockStudent

    Found = db.get(PaymentInvoice, InvoiceId)
    if not Found:
        api_error(404, "INVOICE_NOT_FOUND", "That invoice was not found.")
    Sequence = LockSequence(db, "INVOICE")
    if not Sequence.is_configured:
        api_error(409, "PAYMENT_NUMBERING_NOT_SET", "The starting invoice number has not been set yet.")
    StudentRow = _LockStudent(db, Found.student_id)
    Parent = db.query(PaymentInvoice).filter(PaymentInvoice.id == InvoiceId).with_for_update().one()
    db.refresh(Parent)
    Check = LateFeeCheck(db, Parent)
    if not Check["allowed"]:
        api_error(409, "LATE_FEE_NOT_ALLOWED", Check["reason"])
    Item = LateFeeItem(db)
    Today = _Today()
    Spec = {
        "item": Item,
        "quantity": 1,
        "unitPaise": PriceOn(db, Item, Today),
        "discount": None,
        "isKit": False,
        "periodKey": None,
        "description": f"{Item.name} · {_PeriodLabel(Parent.period_key)} fee ({Parent.invoice_number})",
        "stockCentreId": None,
    }
    Priced = PriceLines([Spec], None)
    Invoice, _ = BuildInvoice(
        db, StudentRow=StudentRow, Priced=Priced, InvoiceDate=Today, DueDate=Today + timedelta(days=DEFAULT_DUE_DAYS),
        InvoiceType="LATE_FEE", SourceKey=f"LATE:{Parent.id}", ParentInvoiceId=Parent.id, Actor=Actor,
    )
    if AdvanceBalances(db, [StudentRow.id]):
        ApplyAdvance(db, StudentId=StudentRow.id, Actor=Actor, InvoiceIds=[Invoice.id], LockStudent=False)
    from app.services.payments.online_service import NotifyInvoicesRaised

    NotifyInvoicesRaised(db, {StudentRow.id: [Invoice.id]})
    db.commit()
    return GetInvoice(db, Invoice.id)


# --------------------------------------------------------------------------
# Handover
# --------------------------------------------------------------------------

def RecordHandover(db: Session, *, InvoiceId: str, LineId: str, Day: Any, Actor: User | None) -> dict[str, Any]:
    from app.services.payments.invoices_service import GetInvoice, _ParseDate

    Invoice = db.query(PaymentInvoice).filter(PaymentInvoice.id == InvoiceId).with_for_update().first()
    if not Invoice:
        api_error(404, "INVOICE_NOT_FOUND", "That invoice was not found.")
    Line = db.query(PaymentInvoiceLine).filter(PaymentInvoiceLine.id == LineId, PaymentInvoiceLine.invoice_id == Invoice.id).with_for_update().first()
    if not Line:
        api_error(404, "LINE_NOT_FOUND", "That line was not found on the invoice.")
    if Invoice.status == "CANCELLED":
        api_error(409, "INVOICE_CANCELLED", f"{Invoice.invoice_number} is cancelled.")
    if Line.article_kind not in ("BOOK", "MERCH") and not Line.is_stock:
        api_error(422, "NOTHING_TO_HAND_OVER", f"{Line.name} is not something handed over.")
    if Line.handed_over_on:
        api_error(409, "ALREADY_HANDED_OVER", f"{Line.name} was handed over on {Line.handed_over_on.strftime('%d %b %Y')}.")
    if Line.article_kind == "BOOK" and Invoice.status != "PAID":
        api_error(409, "BOOK_NOT_PAID", "A book is handed over once its invoice is paid in full.")
    HandedOn = _ParseDate(Day, "Handover date") or _Today()
    if HandedOn > _Today():
        api_error(422, "DATE_IN_FUTURE", "The handover date cannot be in the future.")
    if HandedOn < Invoice.invoice_date:
        api_error(422, "DATE_INVALID", "The handover date cannot be before the invoice date.")
    Line.handed_over_on = HandedOn
    Line.handed_over_by_user_id = Actor.id if Actor else None
    Line.handed_over_by_name = Actor.full_name if Actor else None
    db.flush()
    Student_ = json.loads(Invoice.snapshot_json).get("student", {})
    WritePaymentAudit(
        db, EntityType="INVOICE", EntityId=Invoice.id, Action="HANDOVER", Actor=Actor,
        After={"invoiceNumber": Invoice.invoice_number, "student": Student_.get("name"), "item": f"{Line.quantity} × {Line.name}", "date": HandedOn.isoformat()},
    )
    db.commit()
    return GetInvoice(db, Invoice.id)


# --------------------------------------------------------------------------
# Reading
# --------------------------------------------------------------------------

def LinePayloads(db: Session, Invoice: PaymentInvoice) -> list[dict[str, Any]]:
    Rows = db.query(PaymentInvoiceLine).filter(PaymentInvoiceLine.invoice_id == Invoice.id).order_by(PaymentInvoiceLine.line_no.asc()).all()
    Centres = {Row.id: Row.name for Row in db.query(PaymentCentre).all()}
    if not Rows:
        # An invoice from before Release 2: its one line, from the invoice.
        Item = db.get(FeeItem, Invoice.fee_item_id) if Invoice.fee_item_id else None
        return [{
            "lineId": None,
            "lineNo": 1,
            "feeItemId": Invoice.fee_item_id,
            "name": Invoice.fee_name,
            "description": Invoice.description,
            "kind": KindOf(Item) if Item else ("TUITION" if Invoice.billing_type == "MONTHLY" else "OTHER"),
            "kindLabel": ARTICLE_KINDS[KindOf(Item) if Item else ("TUITION" if Invoice.billing_type == "MONTHLY" else "OTHER")],
            "quantity": 1,
            "unitPaise": Invoice.amount_paise,
            "unitDisplay": FormatIndianRupees(Invoice.amount_paise),
            "discountPaise": 0,
            "discountDisplay": FormatIndianRupees(0),
            "discountText": None,
            "netPaise": Invoice.amount_paise,
            "netDisplay": FormatIndianRupees(Invoice.amount_paise),
            "finalPaise": Invoice.amount_paise,
            "isKit": False,
            "isStock": False,
            "periodKey": Invoice.period_key,
            "stockCentreName": None,
            "handedOverOn": None,
            "handedOverByName": None,
            "canHandOver": False,
        }]
    Out = []
    for Row in Rows:
        Handable = Row.article_kind in ("BOOK", "MERCH") or Row.is_stock
        Out.append({
            "lineId": Row.id,
            "lineNo": Row.line_no,
            "feeItemId": Row.fee_item_id,
            "name": Row.name,
            "description": Row.description,
            "kind": Row.article_kind or "OTHER",
            "kindLabel": ARTICLE_KINDS.get(Row.article_kind or "OTHER", "Other"),
            "quantity": Row.quantity,
            "unitPaise": Row.unit_paise,
            "unitDisplay": FormatIndianRupees(Row.unit_paise),
            "discountPaise": Row.discount_paise,
            "discountDisplay": FormatIndianRupees(Row.discount_paise),
            "discountText": DiscountText(Row.discount_type, Row.discount_value),
            "netPaise": Row.net_paise,
            "netDisplay": FormatIndianRupees(Row.net_paise),
            "finalPaise": Row.final_paise,
            "isKit": bool(Row.is_kit),
            "isStock": bool(Row.is_stock),
            "periodKey": Row.period_key,
            "stockCentreName": Centres.get(Row.stock_centre_id) if Row.stock_centre_id else None,
            "handedOverOn": Row.handed_over_on.isoformat() if Row.handed_over_on else None,
            "handedOverByName": Row.handed_over_by_name,
            "canHandOver": bool(Handable and not Row.handed_over_on and Invoice.status != "CANCELLED" and (Row.article_kind != "BOOK" or Invoice.status == "PAID")),
            "handOverBlockedReason": ("Paid in full first" if Handable and Row.article_kind == "BOOK" and Invoice.status != "PAID" and Invoice.status != "CANCELLED" and not Row.handed_over_on else None),
        })
    return Out


def InvoiceExtras(db: Session, Invoice: PaymentInvoice) -> dict[str, Any]:
    Late = db.query(PaymentInvoice).filter(PaymentInvoice.parent_invoice_id == Invoice.id).order_by(PaymentInvoice.created_at.desc()).all()
    Parent = db.get(PaymentInvoice, Invoice.parent_invoice_id) if Invoice.parent_invoice_id else None
    Check = LateFeeCheck(db, Invoice) if Invoice.billing_type == "MONTHLY" else {"allowed": False, "reason": None}
    return {
        "lines": LinePayloads(db, Invoice),
        "lateFees": [{"invoiceId": Row.id, "invoiceNumber": Row.invoice_number, "status": Row.status, "amountDisplay": FormatIndianRupees(Row.amount_paise)} for Row in Late],
        "parentInvoice": {"invoiceId": Parent.id, "invoiceNumber": Parent.invoice_number, "feeName": Parent.fee_name} if Parent else None,
        "lateFee": {"allowed": bool(Check.get("allowed")), "reason": Check.get("reason")},
        "invoiceTypes": INVOICE_TYPES,
    }
