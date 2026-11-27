"""Billing Release 2 (2026-11-27, Shailesh): ledgers and reports (client
document §10, answers and UAT 6, 11).

  * Student ledger: every invoice (debit) and payment (credit) with a
    running balance, for all students or one, by centre and dates, with
    the balance brought forward from before the first date.
  * Invoice register: one row per invoice line, with its discounts, GST
    and the invoice's paid and balance.
  * Monthly tuition: who was billed for a month, at what rate, what has
    been collected and what is unpaid, with each student's invoice.
  * Stock summary, stock movements, and the book queue (inventory_service,
    book_invoices) as Excel too.

Amounts are rupees with two decimals, so the sheets can be summed.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from io import BytesIO
from typing import Any

from openpyxl import Workbook
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import Level, PaymentCentre, PaymentInvoice, PaymentInvoiceLine, PaymentReceipt, Student, User
from app.services.payments.invoice_export import _Rs, _Sheet
from app.services.payments.money import FormatIndianRupees

TYPE_LABELS = {
    "ADMISSION": "Admission",
    "MONTHLY_TUITION": "Monthly tuition",
    "STUDY_MATERIAL": "Study material",
    "SALE": "Sale",
    "LATE_FEE": "Late fee",
    "OTHER": "Other",
}


def _Dates(Filters: dict[str, Any]) -> tuple[date | None, date | None]:
    from app.services.payments.invoices_service import _ParseDate

    From = _ParseDate(Filters.get("dateFrom"), "From date")
    To = _ParseDate(Filters.get("dateTo"), "To date")
    if From and To and From > To:
        api_error(422, "DATES_REVERSED", "The From date is after the To date.")
    return From, To


def _StudentFilter(db: Session, Filters: dict[str, Any]) -> dict[str, tuple[str, str, str | None]]:
    from app.services.demo_students import RealStudents

    Query = RealStudents(db.query(Student, User)).join(User, Student.user_id == User.id)
    if Filters.get("studentId"):
        Query = Query.filter(Student.id == Filters["studentId"])
    Centre = Filters.get("centreId")
    if Centre:
        Query = Query.filter(Student.centre_id.is_(None)) if Centre == "NONE" else Query.filter(Student.centre_id == Centre)
    return {StudentRow.id: (UserRow.full_name, StudentRow.student_code, StudentRow.centre_id) for StudentRow, UserRow in Query.all()}


# --------------------------------------------------------------------------
# Student ledger
# --------------------------------------------------------------------------

def StudentLedger(db: Session, *, Filters: dict[str, Any]) -> dict[str, Any]:
    From, To = _Dates(Filters)
    People = _StudentFilter(db, Filters)
    if not People:
        return {"students": [], "rows": [], "totals": {"debitPaise": 0, "creditPaise": 0, "balancePaise": 0}}
    Ids = list(People)
    Centres = {Row.id: Row.name for Row in db.query(PaymentCentre).all()}
    Entries: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for Invoice in db.query(PaymentInvoice).filter(PaymentInvoice.student_id.in_(Ids)).all():
        Live = Invoice.status != "CANCELLED"
        Entries[Invoice.student_id].append({
            "date": Invoice.invoice_date,
            "order": 0,
            "document": Invoice.invoice_number,
            "kind": "Invoice" if Live else "Invoice (cancelled)",
            "type": TYPE_LABELS.get(Invoice.invoice_type or "OTHER", "Other"),
            "description": Invoice.fee_name + (f" · {Invoice.billing_month:02d}/{Invoice.billing_year}" if Invoice.billing_month else ""),
            "debit": Invoice.amount_paise if Live else 0,
            "credit": 0,
            "note": Invoice.cancel_reason if not Live else None,
        })
    for Payment in db.query(PaymentReceipt).filter(PaymentReceipt.student_id.in_(Ids)).all():
        Live = Payment.status == "RECORDED"
        Entries[Payment.student_id].append({
            "date": Payment.payment_date,
            "order": 1,
            "document": Payment.receipt_number,
            "kind": "Payment" if Live else "Payment (cancelled)",
            "type": "Payment",
            "description": Payment.note or ("Online" if Payment.channel == "ONLINE" else "At the centre"),
            "debit": 0,
            "credit": Payment.amount_paise if Live else 0,
            "note": Payment.cancel_reason if not Live else None,
        })
        if Live and Payment.discount_paise:
            Entries[Payment.student_id].append({
                "date": Payment.payment_date, "order": 2, "document": Payment.receipt_number, "kind": "Discount", "type": "Discount",
                "description": Payment.discount_reason or "Discount at payment", "debit": 0, "credit": Payment.discount_paise, "note": None,
            })
    Rows = []
    Summary = []
    TotalDebit = TotalCredit = 0
    for StudentId in sorted(Ids, key=lambda Id: ((People[Id][0] or "").lower(), People[Id][1] or "")):
        Name, Code, CentreId = People[StudentId]
        Items = sorted(Entries.get(StudentId, []), key=lambda Row: (Row["date"], Row["order"], Row["document"]))
        Opening = sum(Row["debit"] - Row["credit"] for Row in Items if From and Row["date"] < From)
        Balance = Opening
        Shown = [Row for Row in Items if (not From or Row["date"] >= From) and (not To or Row["date"] <= To)]
        if not Shown and not Opening:
            continue
        if From and Opening:
            Rows.append({"studentId": StudentId, "studentName": Name, "studentCode": Code, "centreName": Centres.get(CentreId), "date": From.isoformat(),
                         "document": "", "kind": "Brought forward", "type": "", "description": "Balance before this period", "debitPaise": 0, "creditPaise": 0, "balancePaise": Opening, "note": None})
        Debit = Credit = 0
        for Row in Shown:
            Balance += Row["debit"] - Row["credit"]
            Debit += Row["debit"]
            Credit += Row["credit"]
            Rows.append({
                "studentId": StudentId, "studentName": Name, "studentCode": Code, "centreName": Centres.get(CentreId),
                "date": Row["date"].isoformat(), "document": Row["document"], "kind": Row["kind"], "type": Row["type"],
                "description": Row["description"], "debitPaise": Row["debit"], "creditPaise": Row["credit"], "balancePaise": Balance, "note": Row["note"],
            })
        TotalDebit += Debit
        TotalCredit += Credit
        Summary.append({"studentId": StudentId, "studentName": Name, "studentCode": Code, "centreName": Centres.get(CentreId),
                        "openingPaise": Opening, "debitPaise": Debit, "creditPaise": Credit, "balancePaise": Balance,
                        "balanceDisplay": FormatIndianRupees(abs(Balance)) + (" advance" if Balance < 0 else "")})
    return {"students": Summary, "rows": Rows, "totals": {"debitPaise": TotalDebit, "creditPaise": TotalCredit, "balancePaise": sum(Row["balancePaise"] for Row in Summary)}}


def BuildLedgerWorkbook(Report: dict[str, Any]) -> bytes:
    Book = Workbook()
    _Sheet(
        Book, "Summary",
        [("Student", 26), ("Student ID", 13), ("Centre", 14), ("Brought forward (Rs)", 18), ("Invoiced (Rs)", 14), ("Paid and discount (Rs)", 20), ("Balance (Rs)", 14)],
        [[Row["studentName"], Row["studentCode"], Row["centreName"] or "", _Rs(Row["openingPaise"]), _Rs(Row["debitPaise"]), _Rs(Row["creditPaise"]), _Rs(Row["balancePaise"])] for Row in Report["students"]],
        {4, 5, 6, 7},
        ["Total", "", "", "", _Rs(Report["totals"]["debitPaise"]), _Rs(Report["totals"]["creditPaise"]), _Rs(Report["totals"]["balancePaise"])],
        First=True,
    )
    _Sheet(
        Book, "Ledger",
        [("Date", 12), ("Student", 26), ("Student ID", 13), ("Centre", 14), ("Document", 16), ("Entry", 18), ("Type", 16), ("Description", 34), ("Debit (Rs)", 13), ("Credit (Rs)", 13), ("Balance (Rs)", 13), ("Note", 28)],
        [[Row["date"], Row["studentName"], Row["studentCode"], Row["centreName"] or "", Row["document"], Row["kind"], Row["type"], Row["description"], _Rs(Row["debitPaise"]), _Rs(Row["creditPaise"]), _Rs(Row["balancePaise"]), Row["note"] or ""] for Row in Report["rows"]],
        {9, 10, 11},
    )
    Buffer = BytesIO()
    Book.save(Buffer)
    return Buffer.getvalue()


# --------------------------------------------------------------------------
# Invoice register (one row per line)
# --------------------------------------------------------------------------

def InvoiceRegister(db: Session, *, Filters: dict[str, Any]) -> list[dict[str, Any]]:
    From, To = _Dates(Filters)
    Query = db.query(PaymentInvoice)
    People = _StudentFilter(db, Filters)
    Query = Query.filter(PaymentInvoice.student_id.in_(list(People) or ["-"]))
    if From:
        Query = Query.filter(PaymentInvoice.invoice_date >= From)
    if To:
        Query = Query.filter(PaymentInvoice.invoice_date <= To)
    if Filters.get("invoiceType"):
        Query = Query.filter(PaymentInvoice.invoice_type == str(Filters["invoiceType"]).upper())
    if not Filters.get("includeCancelled"):
        Query = Query.filter(PaymentInvoice.status != "CANCELLED")
    Invoices = Query.order_by(PaymentInvoice.invoice_date.asc(), PaymentInvoice.invoice_number.asc()).all()
    Lines: dict[str, list[PaymentInvoiceLine]] = defaultdict(list)
    if Invoices:
        for Row in db.query(PaymentInvoiceLine).filter(PaymentInvoiceLine.invoice_id.in_([Row.id for Row in Invoices])).order_by(PaymentInvoiceLine.line_no.asc()).all():
            Lines[Row.invoice_id].append(Row)
    Centres = {Row.id: Row.name for Row in db.query(PaymentCentre).all()}
    Out = []
    for Invoice in Invoices:
        Name, Code, _ = People.get(Invoice.student_id, ("", "", None))
        Balance = 0 if Invoice.status == "CANCELLED" else max(0, Invoice.amount_paise - Invoice.paid_paise - (Invoice.discount_paise or 0))
        Common = {
            "invoiceNumber": Invoice.invoice_number, "invoiceDate": Invoice.invoice_date.isoformat(), "studentName": Name, "studentCode": Code,
            "centreName": Centres.get(Invoice.centre_id) or "", "type": TYPE_LABELS.get(Invoice.invoice_type or "OTHER", "Other"),
            "status": Invoice.status, "invoiceTotalPaise": Invoice.amount_paise, "taxablePaise": Invoice.taxable_paise,
            "cgstPaise": Invoice.cgst_paise, "sgstPaise": Invoice.sgst_paise, "paidPaise": Invoice.paid_paise,
            "paymentDiscountPaise": Invoice.discount_paise or 0, "balancePaise": Balance,
            "discountReason": Invoice.invoice_discount_reason or "", "approvedBy": Invoice.discount_approved_by_name or "",
        }
        Rows = Lines.get(Invoice.id)
        if not Rows:
            Out.append({**Common, "lineNo": 1, "item": Invoice.fee_name, "quantity": 1, "ratePaise": Invoice.amount_paise, "lineDiscountPaise": 0,
                        "invoiceDiscountSharePaise": 0, "lineAmountPaise": Invoice.amount_paise, "kit": "", "handedOver": ""})
            continue
        for Row in Rows:
            Out.append({**Common, "lineNo": Row.line_no, "item": Row.description or Row.name, "quantity": Row.quantity, "ratePaise": Row.unit_paise,
                        "lineDiscountPaise": Row.discount_paise, "invoiceDiscountSharePaise": Row.invoice_discount_share_paise, "lineAmountPaise": Row.final_paise,
                        "kit": "Yes" if Row.is_kit else "", "handedOver": Row.handed_over_on.isoformat() if Row.handed_over_on else ""})
    return Out


def BuildRegisterWorkbook(Rows: list[dict[str, Any]]) -> bytes:
    Book = Workbook()
    Heads = [("Invoice No.", 16), ("Date", 12), ("Student", 24), ("Student ID", 13), ("Centre", 13), ("Type", 15), ("Status", 11), ("Line", 6), ("Item", 34), ("Qty", 6),
             ("Rate (Rs)", 11), ("Line discount (Rs)", 15), ("Invoice discount (Rs)", 17), ("Line amount (Rs)", 15), ("Kit", 6), ("Handed over", 12),
             ("Invoice total (Rs)", 15), ("Taxable (Rs)", 13), ("CGST (Rs)", 11), ("SGST (Rs)", 11), ("Paid (Rs)", 12), ("Discount at payment (Rs)", 18), ("Balance (Rs)", 13),
             ("Discount reason", 26), ("Approved by", 18)]
    Data = []
    Seen = set()
    Totals = defaultdict(int)
    for Row in Rows:
        First = Row["invoiceNumber"] not in Seen
        Seen.add(Row["invoiceNumber"])
        Totals["line"] += Row["lineAmountPaise"]
        if First:
            for Key in ("invoiceTotalPaise", "taxablePaise", "cgstPaise", "sgstPaise", "paidPaise", "paymentDiscountPaise", "balancePaise"):
                Totals[Key] += Row[Key] if Row["status"] != "CANCELLED" else 0
        # The invoice's own figures on its first line only, so the columns sum.
        Data.append([
            Row["invoiceNumber"], Row["invoiceDate"], Row["studentName"], Row["studentCode"], Row["centreName"], Row["type"], Row["status"], Row["lineNo"], Row["item"], Row["quantity"],
            _Rs(Row["ratePaise"]), _Rs(Row["lineDiscountPaise"]), _Rs(Row["invoiceDiscountSharePaise"]), _Rs(Row["lineAmountPaise"]), Row["kit"], Row["handedOver"],
            *([_Rs(Row[Key]) for Key in ("invoiceTotalPaise", "taxablePaise", "cgstPaise", "sgstPaise", "paidPaise", "paymentDiscountPaise", "balancePaise")] if First else [""] * 7),
            Row["discountReason"] if First else "", Row["approvedBy"] if First else "",
        ])
    TotalRow = ["Total"] + [""] * 12 + [_Rs(Totals["line"]), "", ""] + [_Rs(Totals[Key]) for Key in ("invoiceTotalPaise", "taxablePaise", "cgstPaise", "sgstPaise", "paidPaise", "paymentDiscountPaise", "balancePaise")] + ["", ""]
    _Sheet(Book, "Invoice register", Heads, Data, {11, 12, 13, 14, 17, 18, 19, 20, 21, 22, 23}, TotalRow, First=True)
    Buffer = BytesIO()
    Book.save(Buffer)
    return Buffer.getvalue()


# --------------------------------------------------------------------------
# Monthly tuition
# --------------------------------------------------------------------------

def MonthlyTuition(db: Session, *, Period: Any, CentreId: Any = None) -> dict[str, Any]:
    from app.services.payments.billing_service import PeriodLabel, _ParsePeriod

    Key = _ParsePeriod(Period)
    People = _StudentFilter(db, {"centreId": CentreId})
    Invoices = (
        db.query(PaymentInvoice)
        .filter(PaymentInvoice.billing_type == "MONTHLY", PaymentInvoice.period_key == Key, PaymentInvoice.status != "CANCELLED", PaymentInvoice.student_id.in_(list(People) or ["-"]))
        .all()
    )
    Tuition: dict[str, PaymentInvoiceLine] = {}
    if Invoices:
        for Row in db.query(PaymentInvoiceLine).filter(PaymentInvoiceLine.invoice_id.in_([Row.id for Row in Invoices]), PaymentInvoiceLine.period_key == Key).all():
            Tuition[Row.invoice_id] = Row
    Levels = {Row.id: Row.level_code for Row in db.query(Level).all()}
    Centres = {Row.id: Row.name for Row in db.query(PaymentCentre).all()}
    StudentLevels = {Row.id: Levels.get(Row.current_level_id) for Row in db.query(Student).filter(Student.id.in_(list(People) or ["-"])).all()}
    Rows = []
    Billed = Collected = Unpaid = 0
    for Invoice in Invoices:
        Name, Code, Centre = People[Invoice.student_id]
        Line = Tuition.get(Invoice.id)
        Fee = Line.final_paise if Line else Invoice.amount_paise
        Settled = (Invoice.paid_paise or 0) + (Invoice.discount_paise or 0)
        # On an admission invoice, the tuition's share of what has been paid.
        Share = Settled if not Line or not Invoice.amount_paise else min(Fee, round(Settled * Fee / Invoice.amount_paise))
        Paid = min(Fee, Share)
        Billed += Fee
        Collected += Paid
        Unpaid += Fee - Paid
        Rows.append({
            "studentId": Invoice.student_id, "studentName": Name, "studentCode": Code, "centreName": Centres.get(Centre) or "",
            "levelCode": StudentLevels.get(Invoice.student_id), "invoiceId": Invoice.id, "invoiceNumber": Invoice.invoice_number,
            "invoiceDate": Invoice.invoice_date.isoformat(), "type": TYPE_LABELS.get(Invoice.invoice_type or "MONTHLY_TUITION", "Monthly tuition"),
            "feeName": Line.name if Line else Invoice.fee_name, "feePaise": Fee, "feeDisplay": FormatIndianRupees(Fee),
            "paidPaise": Paid, "paidDisplay": FormatIndianRupees(Paid), "unpaidPaise": Fee - Paid, "unpaidDisplay": FormatIndianRupees(Fee - Paid),
            "status": Invoice.status,
        })
    Rows.sort(key=lambda Row: (Row["unpaidPaise"] == 0, (Row["studentName"] or "").lower()))
    ByRate: dict[str, dict[str, int]] = defaultdict(lambda: {"count": 0, "billed": 0, "collected": 0})
    for Row in Rows:
        Bucket = ByRate[f"{Row['feeName']} ({Row['feeDisplay']})"]
        Bucket["count"] += 1
        Bucket["billed"] += Row["feePaise"]
        Bucket["collected"] += Row["paidPaise"]
    return {
        "period": Key,
        "periodLabel": PeriodLabel(Key),
        "billedCount": len(Rows),
        "paidCount": sum(1 for Row in Rows if Row["unpaidPaise"] == 0),
        "billedPaise": Billed, "billedDisplay": FormatIndianRupees(Billed),
        "collectedPaise": Collected, "collectedDisplay": FormatIndianRupees(Collected),
        "unpaidPaise": Unpaid, "unpaidDisplay": FormatIndianRupees(Unpaid),
        "byRate": [{"label": Label, "count": Value["count"], "billedDisplay": FormatIndianRupees(Value["billed"]), "collectedDisplay": FormatIndianRupees(Value["collected"])} for Label, Value in sorted(ByRate.items())],
        "rows": Rows,
    }


def BuildTuitionWorkbook(Report: dict[str, Any]) -> bytes:
    Book = Workbook()
    _Sheet(Book, "Summary", [("Rate", 40), ("Students", 10), ("Billed (Rs)", 14), ("Collected (Rs)", 14)],
           [[Row["label"], Row["count"], Row["billedDisplay"], Row["collectedDisplay"]] for Row in Report["byRate"]], set(),
           ["Total", Report["billedCount"], Report["billedDisplay"], Report["collectedDisplay"]], First=True)
    _Sheet(Book, f"Tuition {Report['period']}",
           [("Student", 26), ("Student ID", 13), ("Level", 9), ("Centre", 13), ("Invoice No.", 16), ("Date", 12), ("Type", 15), ("Fee", 30), ("Billed (Rs)", 12), ("Collected (Rs)", 14), ("Unpaid (Rs)", 12), ("Status", 11)],
           [[Row["studentName"], Row["studentCode"], Row["levelCode"] or "", Row["centreName"], Row["invoiceNumber"], Row["invoiceDate"], Row["type"], Row["feeName"], _Rs(Row["feePaise"]), _Rs(Row["paidPaise"]), _Rs(Row["unpaidPaise"]), Row["status"]] for Row in Report["rows"]],
           {9, 10, 11}, ["Total", "", "", "", "", "", "", "", _Rs(Report["billedPaise"]), _Rs(Report["collectedPaise"]), _Rs(Report["unpaidPaise"]), ""])
    Buffer = BytesIO()
    Book.save(Buffer)
    return Buffer.getvalue()


# --------------------------------------------------------------------------
# Stock and the book queue
# --------------------------------------------------------------------------

def BuildStockWorkbook(Summary: dict[str, Any], Movements: list[dict[str, Any]]) -> bytes:
    Book = Workbook()
    Rows = []
    for Item in Summary["items"]:
        for Centre in Item["centres"]:
            Rows.append([Item["name"], Item["sku"] or "", Item["levelCode"] or "", Centre["centreName"], Centre["opening"], Centre["received"], Centre["transferredIn"],
                         Centre["issued"], Centre["returned"], Centre["transferredOut"], Centre["writtenOff"], Centre["quantity"], "Low" if Centre["isLow"] else "",
                         "Yes" if Centre["ledgerMatches"] else "CHECK"])
    _Sheet(Book, "Stock summary", [("Item", 34), ("Code", 12), ("Level", 9), ("Centre", 13), ("Opening", 9), ("Received", 9), ("Transfer in", 11), ("Issued", 8),
                                   ("Returned", 9), ("Transfer out", 12), ("Written off", 11), ("In stock", 9), ("Low", 6), ("Ledger adds up", 14)], Rows, set(), First=True)
    _Sheet(Book, "Movements", [("Date", 12), ("Item", 30), ("Code", 12), ("Centre", 13), ("Movement", 26), ("Quantity", 9), ("Balance after", 13), ("Invoice", 16), ("Student", 24),
                               ("Student ID", 13), ("Supplier", 20), ("Bill No.", 14), ("Unit cost", 11), ("Reason", 28), ("By", 18)],
           [[Row["date"], Row["itemName"], Row["sku"] or "", Row["centreName"], Row["typeLabel"], Row["quantity"], Row["balanceAfter"], Row["invoiceNumber"] or "", Row["studentName"] or "",
             Row["studentCode"] or "", Row["supplier"] or "", Row["billNumber"] or "", Row["unitCostDisplay"] or "", Row["reason"] or "", Row["actorName"] or ""] for Row in Movements], set())
    Buffer = BytesIO()
    Book.save(Buffer)
    return Buffer.getvalue()


def BuildBookQueueWorkbook(Queue: dict[str, Any]) -> bytes:
    Book = Workbook()
    _Sheet(Book, "Book queue", [("Student", 26), ("Student ID", 13), ("Next level", 11), ("Book", 34), ("Price", 12), ("Status", 20), ("Invoice", 16), ("Note", 40), ("Cleared on", 20)],
           [[Row["studentName"], Row["studentCode"], Row["levelCode"] or "", Row["bookName"] or "", Row["priceDisplay"] or "", Row["statusLabel"], Row["invoiceNumber"] or "",
             Row["lastError"] or Row["skipReason"] or "", (Row["clearedOn"] or "")[:10]] for Row in Queue["tasks"]], set(), First=True)
    Buffer = BytesIO()
    Book.save(Buffer)
    return Buffer.getvalue()
