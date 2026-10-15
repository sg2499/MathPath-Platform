"""Payments: bring the old platform's newer payments across (Phase 2 part 6,
2026-10-15, Shailesh). Run from scripts/topup_old_payments.py on the server.

The 10 Oct import (history_import.py) brought every old invoice and payment
up to receipt MP-MRCPT-831. The old platform keeps taking payments until the
end of October; the new platform starts taking them in November. This
top-up brings across whatever the old platform recorded since, and it can be
run again at any time: it only adds what is not here yet.

Decisions it carries (Shailesh, 15 Oct):
  * Money only. Payments, new old-platform invoices and invoices the old
    platform removed are copied; a student's active/inactive status is not.
  * Students: an old student who has money in this top-up and is not on
    this site stops the run (add them on the new platform first). An active
    old student with no money yet who is not here is listed, not added
    (new admissions are added on the new platform with a login, level and
    teacher). Inactive old students with no payment history are ignored.

Sources (a folder of CSV files, never committed):
  * old-collections.csv -- the old Collections report (any date range that
    covers everything since the last top-up; a full-year report is fine).
    Columns: payment_id, invoice_no, date, student ("<old id> | <name>"),
    cash, razorpay, upi, net_banking, grand_total, trans_ref,
    pg_payment_id, order_id, updated_by.
  * old-dues.csv -- the old Dues report as it stands now. Columns:
    invoice_no, date, student, father, mobile, due_group, total_due.
  * old-students.csv -- the old Student Details lists. Columns: old_id,
    name, father, mobile, status (Active / Inactive).
  * old-invoices.csv (only when needed) -- old invoices that are new since
    the last run AND already fully paid, so the Dues report does not show
    them; and any discount the old platform gave when a new receipt paid an
    invoice (the Collections report does not show discounts). Columns:
    invoice_no, date, old_id, fee_group, amount, discount (discount may be
    blank). For an invoice already here only the discount is used.

What it does, in one transaction (a dry run rolls it back):
  1. Matches the old students it needs to students here (name and a parent
     mobile, as on 10 Oct), and checks each against the student its old
     invoices already belong to.
  2. New old invoices (numbers not here yet): created with the old number
     (MP-INV-000<n>), the old date and fee, marked as old-platform history.
  3. New receipts (numbers not here yet): created with the old number, date,
     method split, reference and Razorpay ids, and set against the invoices
     the old report names. A receipt the old platform recorded against
     "PreviousDue" (no invoice number) pays the student's oldest unpaid
     old-platform invoices.
  4. Old-platform invoices that are still unpaid here but are no longer due
     on the old platform and were not paid by a receipt: cancelled, with the
     reason "Removed on the old platform".
  5. Invoice and receipt numbering moves past the old platform's highest.
  6. Checks, which must all pass before anything is written:
       - the old Dues total (less its two test records) equals --expected-due;
       - every student's old-platform balance here equals their due on the
         old platform, to the paisa;
       - no receipt is set against an invoice that is already paid here;
       - collections added equal the old report's rows added.
Only old-platform records (source LEGACY) are compared, read or changed, so
it is still safe to run after the new platform has started billing.
"""
from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models import (
    FeeItem,
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
from app.services.payments.history_import import (
    DUE_DAYS,
    INDIA_OFFSET,
    LEGACY,
    LETTERS,
    FeeSpec,
    FeeSpecFor,
    ImportProblem,
    _Date,
    _Digits,
    _MethodLines,
    _NameKey,
    _NewMobiles,
    _Paise,
    _PeriodFor,
    _Text,
)
from app.services.payments.money import FormatIndianRupees, SplitInclusiveGst

# The old platform's two test records (Shailesh, 10 Oct): old id and name as
# the reports show them (old ids are not unique on the old platform).
EXCLUDED_OLD = {("1", "Dummy"): "test record Dummy", ("6", "ST5"): "test record ST5"}
TOPUP_LEGACY_PREFIX = "old:topup:"
REMOVED_REASON = "Removed on the old platform"

COLLECTION_COLUMNS = ("payment_id", "invoice_no", "date", "student", "cash", "razorpay", "upi", "net_banking", "grand_total")
DUES_COLUMNS = ("invoice_no", "date", "student", "due_group", "total_due")
STUDENT_COLUMNS = ("old_id", "name", "mobile", "status")
INVOICE_COLUMNS = ("invoice_no", "date", "old_id", "fee_group", "amount")  # + optional "discount"


# ----------------------------------------------------------------------------
# Reading the files
# ----------------------------------------------------------------------------

def _ReadCsv(PathValue: Path, Needed: tuple[str, ...]) -> list[dict[str, str]]:
    with PathValue.open(newline="", encoding="utf-8-sig") as Handle:
        Reader = csv.DictReader(Handle)
        Missing = [Column for Column in Needed if Column not in (Reader.fieldnames or [])]
        if Missing:
            raise ImportProblem(f"{PathValue.name} is missing the column(s): {', '.join(Missing)}")
        return [dict(Row) for Row in Reader]


def _OldId(StudentCell: str) -> str:
    return str(StudentCell or "").split("|")[0].strip()


def _Key(OldId: str, Name: str) -> str:
    """The old platform gives a few students the same old ID (Mugdha Dey and
    Ambareesh Saha; Nitya and Laksh Varma), and its reports show only
    "<old id> | <name>", so a student is the old ID AND the name."""
    return f"{str(OldId or '').strip()}|{_NameKey(Name)}"


def _Excluded(OldId: str, Name: str) -> str | None:
    for (Id, Known), Label in EXCLUDED_OLD.items():
        if str(OldId or "").strip() == Id and _NameKey(Name) == _NameKey(Known):
            return Label
    return None


def _Amount(Value: Any) -> int:
    """An amount as the old reports print it ('₹ 1,100.00', '1100', '-')."""
    return _Paise(str(Value or "").replace("₹", "").replace(" ", ""))


def _OldName(StudentCell: str) -> str:
    Parts = str(StudentCell or "").split("|", 1)
    return Parts[1].strip() if len(Parts) > 1 else ""


def _Numbers(Cell: str) -> list[str]:
    """'763,1015' -> ['763', '1015']; 'None' / '' -> []."""
    return [Part for Part in re.split(r"[,\s]+", str(Cell or "")) if Part.isdigit()]


def _Groups(Cell: str) -> list[tuple[str, int]]:
    """The Dues report's group cell: 'Monthly Fees - Sep-1100 Monthly Fees -
    Oct-1100' -> [('Monthly Fees - Sep', 110000), ('Monthly Fees - Oct', 110000)]."""
    Found = re.findall(r"\s*(.+?)-(\d+(?:\.\d+)?)(?=\s+\S|\s*$)", str(Cell or "").strip())
    return [(Name.strip(), _Amount(Amount)) for Name, Amount in Found]


@dataclass
class OldReceipt:
    number: str
    old_id: str
    name: str
    paid_on: date
    amount: int
    vouchers: list[str]
    row: dict[str, str]


@dataclass
class OldDueLine:
    voucher: str
    old_id: str
    name: str
    invoice_date: date
    group: str
    amount: int


@dataclass
class OldStudent:
    key: str
    old_id: str
    name: str
    father: str | None
    mobile: str
    active: bool


@dataclass
class TopupData:
    receipts: list[OldReceipt]
    dues: list[OldDueLine]
    dues_total: int
    students: dict[str, OldStudent]
    paid_invoices: dict[str, list[dict[str, Any]]]
    left_out: list[str] = field(default_factory=list)
    # Old invoice number -> discount (paise) the old platform gave on it.
    discounts: dict[str, int] = field(default_factory=dict)


def LoadTopupData(Folder: Path) -> TopupData:
    Folder = Path(Folder)
    for Name in ("old-collections.csv", "old-dues.csv", "old-students.csv"):
        if not (Folder / Name).exists():
            raise ImportProblem(f"Missing in {Folder}: {Name}")
    LeftOut: list[str] = []

    Receipts: list[OldReceipt] = []
    for Row in _ReadCsv(Folder / "old-collections.csv", COLLECTION_COLUMNS):
        Number = str(Row.get("payment_id") or "").strip()
        if not Number.isdigit():
            continue  # the "Total" line
        OldId = _OldId(Row["student"])
        Why = _Excluded(OldId, _OldName(Row["student"]))
        if Why:
            LeftOut.append(f"receipt {Number}: {Why}")
            continue
        PaidOn = _Date(Row["date"])
        if PaidOn is None:
            raise ImportProblem(f"Receipt {Number}: no date.")
        # Amounts as plain numbers for the method split (the report may print '₹').
        Clean = {**Row, **{Column: str(_Amount(Row.get(Column)) / 100) for Column in ("cash", "razorpay", "upi", "net_banking", "grand_total")}}
        Receipts.append(OldReceipt(Number, _Key(OldId, _OldName(Row["student"])), _OldName(Row["student"]), PaidOn, _Amount(Row["grand_total"]), _Numbers(Row["invoice_no"]), Clean))

    Dues: list[OldDueLine] = []
    Total = 0
    AllRows = 0
    FileTotal = None
    for Row in _ReadCsv(Folder / "old-dues.csv", DUES_COLUMNS):
        Vouchers = _Numbers(Row["invoice_no"])
        if not Vouchers:
            # The report's own "TOTAL DUE : ₹ 60302.00" line, if it was kept.
            Found = re.search(r"total\s*due\D*([\d,]+(?:\.\d+)?)", " ".join(str(Value or "") for Value in Row.values()), re.I)
            if Found:
                FileTotal = _Amount(Found.group(1))
            continue
        OldId = _OldId(Row["student"])
        Due = _Amount(Row["total_due"])
        AllRows += Due
        Why = _Excluded(OldId, _OldName(Row["student"]))
        if Why:
            LeftOut.append(f"due {', '.join(Vouchers)}: {Why} ({FormatIndianRupees(Due)})")
            continue
        Groups = _Groups(Row["due_group"])
        Dates = [_Date(Part) for Part in re.split(r"[,\s]+", str(Row["date"] or "")) if Part.strip()]
        if not Groups or sum(Amount for _, Amount in Groups) != Due:
            raise ImportProblem(f"Dues row {Row['invoice_no']} ({Row['student']}): could not read the fee lines from '{Row['due_group']}'.")
        # One voucher per group when the report joins several invoices;
        # otherwise every group is a line of the one invoice.
        Pairs = list(zip(Vouchers, Groups)) if len(Vouchers) == len(Groups) else [(Vouchers[0], Group) for Group in Groups]
        if len(Vouchers) not in (1, len(Groups)):
            raise ImportProblem(f"Dues row {Row['invoice_no']}: {len(Vouchers)} invoices but {len(Groups)} fee lines.")
        for Index, (Voucher, (Group, Amount)) in enumerate(Pairs):
            When = Dates[Index] if Index < len(Dates) and Dates[Index] else (Dates[0] if Dates else None)
            if When is None:
                raise ImportProblem(f"Dues row {Row['invoice_no']}: no invoice date.")
            Dues.append(OldDueLine(Voucher, _Key(OldId, _OldName(Row["student"])), _OldName(Row["student"]), When, Group, Amount))
        Total += Due
    if FileTotal is not None and FileTotal != AllRows:
        raise ImportProblem(f"old-dues.csv: the rows add up to {FormatIndianRupees(AllRows)} but the report's TOTAL DUE says {FormatIndianRupees(FileTotal)}; the file is incomplete.")

    Students: dict[str, OldStudent] = {}
    for Row in _ReadCsv(Folder / "old-students.csv", STUDENT_COLUMNS):
        OldId = str(Row["old_id"] or "").strip()
        Name = _Text(Row["name"]) or ""
        if not OldId or _Excluded(OldId, Name):
            continue
        Students[_Key(OldId, Name)] = OldStudent(_Key(OldId, Name), OldId, Name, _Text(Row.get("father")), _Digits(Row["mobile"]), str(Row["status"]).strip().lower().startswith("a"))

    Paid: dict[str, list[dict[str, Any]]] = defaultdict(list)
    Discounts: dict[str, int] = defaultdict(int)
    if (Folder / "old-invoices.csv").exists():
        for Row in _ReadCsv(Folder / "old-invoices.csv", INVOICE_COLUMNS):
            Voucher = str(Row["invoice_no"]).strip()
            if not Voucher.isdigit():
                continue
            When = _Date(Row["date"])
            if When is None:
                raise ImportProblem(f"old-invoices.csv, invoice {Voucher}: no date.")
            OldId = str(Row["old_id"]).strip()
            if _Text(Row.get("name")):
                Owner = _Key(OldId, Row["name"])
            else:
                Same = [Key for Key in Students if Key.split("|")[0] == OldId]
                if len(Same) != 1:
                    raise ImportProblem(f"old-invoices.csv, invoice {Voucher}: old ID {OldId} is {'shared by more than one student' if Same else 'not in old-students.csv'}; add a 'name' column with the student's name.")
                Owner = Same[0]
            Paid[Voucher].append({"old_id": Owner, "date": When, "group": str(Row["fee_group"]).strip(), "amount": _Amount(Row["amount"])})
            Discount = _Amount(Row.get("discount"))
            if Discount < 0:
                raise ImportProblem(f"old-invoices.csv, invoice {Voucher}: a discount cannot be negative.")
            Discounts[Voucher] += Discount
    return TopupData(Receipts, Dues, Total, Students, Paid, LeftOut, dict(Discounts))


# ----------------------------------------------------------------------------
# What is here already
# ----------------------------------------------------------------------------

def _VoucherOf(InvoiceNumber: str) -> str | None:
    Found = re.match(r"^MP-INV-000(\d+)(?:-[A-Z])?$", InvoiceNumber or "")
    return Found.group(1) if Found else None


def _ReceiptBase(ReceiptNumber: str) -> str | None:
    Found = re.match(r"^MP-MRCPT-(\d+)(?:-[A-Z])?$", ReceiptNumber or "")
    return Found.group(1) if Found else None


@dataclass
class Here:
    invoices_by_voucher: dict[str, list[PaymentInvoice]]
    receipts_by_number: dict[str, list[PaymentReceipt]]
    student_of_voucher: dict[str, str]


def _WhatIsHere(db: Session) -> Here:
    ByVoucher: dict[str, list[PaymentInvoice]] = defaultdict(list)
    for Invoice in db.query(PaymentInvoice).filter(PaymentInvoice.source == LEGACY).all():
        Voucher = _VoucherOf(Invoice.invoice_number)
        if Voucher:
            ByVoucher[Voucher].append(Invoice)
    for Lines in ByVoucher.values():
        Lines.sort(key=lambda Row: Row.invoice_number)
    ByNumber: dict[str, list[PaymentReceipt]] = defaultdict(list)
    # Old-platform receipts only: the new platform numbers its own receipts
    # in the same MP-MRCPT-<n> style, and one of those must never make an old
    # receipt look "already here".
    for Receipt in db.query(PaymentReceipt).filter(PaymentReceipt.source == LEGACY, PaymentReceipt.receipt_number.like("MP-MRCPT-%")).all():
        Base = _ReceiptBase(Receipt.receipt_number)
        if Base:
            ByNumber[Base].append(Receipt)
    return Here(ByVoucher, ByNumber, {Voucher: Lines[0].student_id for Voucher, Lines in ByVoucher.items()})


# ----------------------------------------------------------------------------
# Students
# ----------------------------------------------------------------------------

def _MatchStudents(db: Session, Data: TopupData, Needed: set[str], HereNow: Here, Hints: dict[str, set[str]]) -> tuple[dict[str, Student], list[str], list[str]]:
    """Old id -> student here. Same name and a shared parent mobile; failing
    that, the student the old invoices already belong to (Hints), when the
    name is nearly the same. Returns matches, notes and problems."""
    Rows = db.query(Student, User).join(User, Student.user_id == User.id).all()
    ByName: dict[str, list[Student]] = defaultdict(list)
    Names: dict[str, str] = {}
    for StudentRow, UserRow in Rows:
        ByName[_NameKey(UserRow.full_name)].append(StudentRow)
        Names[StudentRow.id] = UserRow.full_name or ""
    ById = {StudentRow.id: StudentRow for StudentRow, _ in Rows}
    Matches: dict[str, Student] = {}
    Notes: list[str] = []
    Problems: list[str] = []
    for OldId in sorted(Needed):
        Old = Data.students.get(OldId)
        HintIds = Hints.get(OldId, set())
        if len(HintIds) > 1:
            Problems.append(f"Old student {OldId.split('|')[0]} ({Old.name if Old else '?'}): their old invoices belong to {len(HintIds)} different students here.")
            continue
        Choice = None
        if Old:
            Named = [Row for Row in ByName.get(_NameKey(Old.name), []) if Old.mobile and Old.mobile in _NewMobiles(Row)]
            if len(Named) == 1:
                Choice = Named[0]
        if Choice is None and HintIds:
            Hinted = ById[next(iter(HintIds))]
            OldName = Old.name if Old else ""
            if not Old or SequenceMatcher(None, _NameKey(Names[Hinted.id]), _NameKey(OldName)).ratio() >= 0.85:
                Choice = Hinted
                if Old and _NameKey(Names[Hinted.id]) != _NameKey(OldName):
                    Notes.append(f"old '{OldName}' = '{Names[Hinted.id]}' ({Hinted.student_code}): their old invoices are already on this student")
        if Choice is None:
            Label = f"{Old.name} (old id {Old.old_id}, {'active' if Old.active else 'inactive'} on the old platform)" if Old else f"old id {OldId.split('|')[0]}"
            Problems.append(f"{Label} has money in this top-up but is not on this site. Add them on the new platform first (Students > Add), then run this again.")
            continue
        if HintIds and Choice.id not in HintIds:
            Problems.append(f"{Names[Choice.id]} ({Choice.student_code}): matched by name and mobile, but their old invoices belong to another student here.")
            continue
        Matches[OldId] = Choice
    return Matches, Notes, Problems


def _NotHereButActive(db: Session, Data: TopupData, Matched: set[str]) -> list[str]:
    """Active old students with no student here (new admissions on the old
    platform). Listed so they can be added on the new platform."""
    Rows = db.query(Student, User).join(User, Student.user_id == User.id).all()
    Keys = {(_NameKey(UserRow.full_name)) for _, UserRow in Rows}
    Mobiles = set()
    for StudentRow, _ in Rows:
        Mobiles |= _NewMobiles(StudentRow)
    Out = []
    for Old in Data.students.values():
        if not Old.active or Old.key in Matched:
            continue
        if _NameKey(Old.name) in Keys:
            continue
        if Old.mobile and Old.mobile in Mobiles and any(SequenceMatcher(None, Key, _NameKey(Old.name)).ratio() >= 0.85 for Key in Keys):
            continue
        Out.append(f"{Old.name or '(no name)'} (old id {Old.old_id})")
    return Out


# ----------------------------------------------------------------------------
# The run
# ----------------------------------------------------------------------------

@dataclass
class TopupResult:
    lines: list[str]
    problems: list[str]
    summary: dict[str, Any]


def _FeeItemFor(db: Session, Spec: FeeSpec, Amount: int, GroupName: str) -> FeeItem:
    from app.services.payments.setup_service import NameKey
    from sqlalchemy import func

    Existing = db.query(FeeItem).filter(FeeItem.name_key == NameKey(Spec.name)).first()
    if Existing:
        Names = set(json.loads(Existing.legacy_names_json or "[]"))
        if GroupName not in Names:
            Existing.legacy_names_json = json.dumps(sorted(Names | {GroupName}))
        return Existing
    Item = FeeItem(
        name=Spec.name,
        name_key=NameKey(Spec.name),
        description="From the old platform.",
        amount_paise=Spec.amount if Spec.billing == "MONTHLY" else Amount,
        gst_included=True,
        gst_rate_bps=1800,
        billing_type=Spec.billing,
        display_order=(db.query(func.max(FeeItem.display_order)).scalar() or 0) + 1,
        is_active=True,
        legacy_names_json=json.dumps([GroupName]),
    )
    db.add(Item)
    db.flush()
    return Item


def RunTopup(db: Session, Data: TopupData, *, ExpectedDuePaise: int, Today: date | None = None) -> TopupResult:
    """Everything in the caller's transaction; the caller commits (apply) or
    rolls back (dry run)."""
    from app.services.payments.invoices_service import PeriodLabel, _BusinessSnapshot, _CentreSnapshot, _StudentSnapshot
    from app.services.payments.receipts_service import InvoiceBalance, RecomputeInvoice

    Out: list[str] = []
    Problems: list[str] = []
    Notes: list[str] = []
    Today = Today or datetime.now(INDIA_OFFSET).date()
    if not db.query(PaymentInvoice).filter(PaymentInvoice.source == LEGACY).first():
        raise ImportProblem("The 10 Oct history import has not been run on this database (no old-platform records). Nothing was done.")

    HereNow = _WhatIsHere(db)
    Out += [f"  left out: {Line}" for Line in Data.left_out]

    # -- Which receipts are new. A number the old platform used twice is
    #    here as <n> and <n>-B; more rows than that would be a new duplicate.
    ReportByNumber: dict[str, list[OldReceipt]] = defaultdict(list)
    for Receipt in Data.receipts:
        ReportByNumber[Receipt.number].append(Receipt)
    NewReceipts: list[tuple[str, OldReceipt]] = []
    for Number, Rows in sorted(ReportByNumber.items(), key=lambda Item: int(Item[0])):
        HereCount = len(HereNow.receipts_by_number.get(Number, []))
        if HereCount > len(Rows):
            continue
        if HereCount and HereCount < len(Rows):
            Problems.append(f"Receipt {Number} is on the old platform {len(Rows)} times but here {HereCount} time(s); the old platform has reused a number. Send this output to Claude.")
            continue
        if HereCount:
            continue
        for Index, Row in enumerate(sorted(Rows, key=lambda Item: (Item.paid_on, Item.old_id))):
            NewReceipts.append((f"MP-MRCPT-{Number}" + ("" if Index == 0 else f"-{LETTERS[Index - 1]}"), Row))

    # -- Which old invoices are new (not here yet).
    DueByVoucher: dict[str, list[OldDueLine]] = defaultdict(list)
    for Line in Data.dues:
        DueByVoucher[Line.voucher].append(Line)
    Referenced = {Voucher for _, Receipt in NewReceipts for Voucher in Receipt.vouchers} | set(DueByVoucher)
    NewVouchers = sorted((Voucher for Voucher in Referenced if Voucher not in HereNow.invoices_by_voucher), key=int)

    # -- Students needed, with hints from invoices already here.
    Hints: dict[str, set[str]] = defaultdict(set)
    for Line in Data.dues:
        if Line.voucher in HereNow.student_of_voucher:
            Hints[Line.old_id].add(HereNow.student_of_voucher[Line.voucher])
    for _, Receipt in NewReceipts:
        for Voucher in Receipt.vouchers:
            if Voucher in HereNow.student_of_voucher:
                Hints[Receipt.old_id].add(HereNow.student_of_voucher[Voucher])
    Needed = {Line.old_id for Line in Data.dues} | {Receipt.old_id for _, Receipt in NewReceipts}
    for Voucher in NewVouchers:
        for Paid in Data.paid_invoices.get(Voucher, []):
            Needed.add(Paid["old_id"])
    Students, MatchNotes, MatchProblems = _MatchStudents(db, Data, Needed, HereNow, Hints)
    Problems += MatchProblems
    Notes += MatchNotes
    if MatchProblems:
        return TopupResult(Out + ["Students: stopped, see the checks below."], Problems, {})

    # -- Invoices to create.
    Business = _BusinessSnapshot(db)
    Centres = db.query(PaymentCentre).order_by(PaymentCentre.display_order.asc(), PaymentCentre.name.asc()).all()
    Levels = {Row.id: Row for Row in db.query(Level).all()}
    Users = {Row.id: Row for Row in db.query(User).filter(User.id.in_([Row.user_id for Row in Students.values()] or ["-"])).all()}

    def Snapshot(StudentRow: Student) -> dict[str, Any]:
        return {
            "business": Business,
            "centre": _CentreSnapshot(db, StudentRow.centre_id, Centres),
            "student": _StudentSnapshot(StudentRow, Users[StudentRow.user_id], Levels.get(StudentRow.current_level_id)),
        }

    Created: dict[str, list[PaymentInvoice]] = {}
    for Voucher in NewVouchers:
        # The fee comes from old-invoices.csv when it lists the invoice: the
        # Dues report shows only what is still due on a part-paid invoice.
        Lines = Data.paid_invoices.get(Voucher, [])
        if not Lines:
            Lines = [{"old_id": Line.old_id, "date": Line.invoice_date, "group": Line.group, "amount": Line.amount} for Line in DueByVoucher.get(Voucher, [])]
        if not Lines:
            Payers = [Receipt for _, Receipt in NewReceipts if Voucher in Receipt.vouchers]
            Who = ", ".join(f"receipt {Receipt.number} ({Receipt.name}, {FormatIndianRupees(Receipt.amount)})" for Receipt in Payers)
            Problems.append(f"Old invoice {Voucher} is new and already paid ({Who}), so the Dues report does not show it. Add its date, fee and amount to old-invoices.csv.")
            continue
        Owners = {Line["old_id"] for Line in Lines}
        if len(Owners) != 1:
            Problems.append(f"Old invoice {Voucher} belongs to more than one student.")
            continue
        StudentRow = Students[next(iter(Owners))]
        Made = []
        for Index, Line in enumerate(Lines):
            Number = f"MP-INV-000{Voucher}" + ("" if Index == 0 else f"-{LETTERS[Index - 1]}")
            if db.query(PaymentInvoice.id).filter(PaymentInvoice.invoice_number == Number).first():
                Problems.append(f"Invoice number {Number} is already used here by a new-platform invoice; the old platform's invoice {Voucher} cannot take it. Send this output to Claude.")
                continue
            Spec = FeeSpecFor(Line["group"], Line["amount"])
            Item = _FeeItemFor(db, Spec, Line["amount"], Line["group"])
            Period = _PeriodFor(Spec.month, Line["date"]) if Spec.month else None
            PeriodKey = f"{Period[0]:04d}-{Period[1]:02d}" if Period else None
            if PeriodKey and db.query(PaymentInvoice.id).filter(
                PaymentInvoice.student_id == StudentRow.id, PaymentInvoice.fee_item_id == Item.id,
                PaymentInvoice.period_key == PeriodKey, PaymentInvoice.status != "CANCELLED",
            ).first():
                Notes.append(f"{Number}: {Users[StudentRow.user_id].full_name} already has a {Item.name} for {PeriodLabel(Period[1], Period[0])} here; kept, without the month link.")
                PeriodKey = None
            Split = SplitInclusiveGst(Line["amount"], 1800, GstIncluded=True)
            Label = PeriodLabel(Period[1], Period[0]) if PeriodKey else None
            Snap = Snapshot(StudentRow)
            Snap["legacy"] = {"oldInvoice": Number, "oldGroup": Line["group"], "dateApproximate": False, "broughtAcross": Today.isoformat()}
            Invoice = PaymentInvoice(
                invoice_number=Number,
                student_id=StudentRow.id,
                fee_item_id=Item.id,
                fee_name=Item.name,
                billing_type=Item.billing_type,
                billing_month=Period[1] if PeriodKey else None,
                billing_year=Period[0] if PeriodKey else None,
                period_key=PeriodKey,
                description=" · ".join(Part for Part in ["Math Path Abacus", Item.name, Label, "old platform"] if Part),
                invoice_date=Line["date"],
                due_date=Line["date"] + timedelta(days=DUE_DAYS),
                amount_paise=Line["amount"],
                taxable_paise=Split["taxablePaise"],
                cgst_paise=Split["cgstPaise"],
                sgst_paise=Split["sgstPaise"],
                gst_rate_bps=1800,
                gst_included=True,
                paid_paise=0,
                discount_paise=0,
                status="PENDING",
                level_code=Snap["student"].get("levelCode"),
                centre_id=StudentRow.centre_id,
                snapshot_json=json.dumps(Snap, sort_keys=True),
                source=LEGACY,
                legacy_id=f"old:V{Voucher}:L{Index}",
                created_at=datetime.combine(Line["date"], time(9, 0), INDIA_OFFSET).astimezone(timezone.utc),
            )
            db.add(Invoice)
            Made.append(Invoice)
        db.flush()
        Created[Voucher] = Made
        HereNow.invoices_by_voucher[Voucher] = Made
        HereNow.student_of_voucher[Voucher] = StudentRow.id
        Out.append(f"  new invoice {Made[0].invoice_number if Made else Voucher}: {Users[StudentRow.user_id].full_name} ({StudentRow.student_code}), " + ", ".join(f"{Line['group']} {FormatIndianRupees(Line['amount'])}" for Line in Lines) + f", {Lines[0]['date'].isoformat()}")

    if Problems:
        return TopupResult(Out, Problems, {})

    # -- Old-platform invoices the new platform has since acted on (a payment
    #    taken here, or cancelled by a person): the old Dues report cannot
    #    know about those, so they are left alone and left out of the checks.
    Touched = _TouchedByNewPlatform(db)
    DueByVoucherSet = set(DueByVoucher)

    # -- Receipts.
    Collected = 0
    # Discounts from old-invoices.csv, less what earlier top-ups already put
    # on those invoices (the same file is used again on later runs).
    AppliedBefore = _TopupDiscounts(db)
    DiscountLeft: dict[str, int] = {}
    for Voucher, Value in Data.discounts.items():
        Before = AppliedBefore.get(Voucher, 0)
        if Value < Before:
            Problems.append(f"old-invoices.csv gives invoice {Voucher} a discount of {FormatIndianRupees(Value)}, but an earlier top-up already gave {FormatIndianRupees(Before)}; keep the full discount in the file. Send this output to Claude.")
        DiscountLeft[Voucher] = max(0, Value - Before)
    Advance: dict[str, int] = defaultdict(int)
    Paid: set[str] = set()
    for Number, Old in sorted(NewReceipts, key=lambda Item: (Item[1].paid_on, Item[0])):
        StudentRow = Students[Old.old_id]
        if db.query(PaymentReceipt.id).filter(PaymentReceipt.receipt_number == Number).first():
            Problems.append(f"Receipt number {Number} is already used here by a new-platform receipt; the old platform's receipt {Old.number} ({Old.name}, {FormatIndianRupees(Old.amount)}) cannot take it. Send this output to Claude.")
            continue
        Lines, Dropped = _MethodLines({**Old.row, "payment_id": Old.number}, Old.amount)
        if Dropped:
            Notes.append(f"{Number}: left out the extra {FormatIndianRupees(Dropped)} on top of the {FormatIndianRupees(Old.amount)} paid.")
        Online = any(Method == "RAZORPAY" for Method, _, _ in Lines)
        Receipt = PaymentReceipt(
            receipt_number=Number,
            student_id=StudentRow.id,
            payment_date=Old.paid_on,
            pay_by=None,
            received_by_user_id=None,
            received_by_name="Razorpay" if Online else (_Text(Old.row.get("updated_by")) or None),
            amount_paise=Old.amount,
            discount_paise=0,
            note=f"From the old platform (receipt {Number}; brought across on {Today.strftime('%d %b %Y')}).",
            channel="ONLINE" if Online else "COUNTER",
            status="RECORDED",
            centre_id=StudentRow.centre_id,
            snapshot_json=json.dumps(Snapshot(StudentRow), sort_keys=True),
            source=LEGACY,
            legacy_id=f"{TOPUP_LEGACY_PREFIX}{Number}",
            created_at=datetime.combine(Old.paid_on, time(12, 0), INDIA_OFFSET).astimezone(timezone.utc),
        )
        db.add(Receipt)
        db.flush()
        for Order, (Method, Value, Reference) in enumerate(Lines):
            db.add(PaymentMethodLine(payment_id=Receipt.id, method=Method, amount_paise=Value, reference=Reference, line_order=Order))

        # The invoices it pays: the ones the old report names, or (for a
        # "PreviousDue" payment with no invoice) the student's oldest unpaid
        # old-platform invoices.
        if Old.vouchers:
            Targets = []
            for Voucher in Old.vouchers:
                Lines_ = HereNow.invoices_by_voucher.get(Voucher, [])
                if not Lines_:
                    Problems.append(f"{Number}: pays old invoice {Voucher}, which is not here.")
                for Invoice in Lines_:
                    if Invoice.student_id != StudentRow.id:
                        Problems.append(f"{Number}: pays old invoice {Voucher}, which belongs to another student here.")
                    Targets.append(Invoice)
        else:
            # Invoices the old Dues report no longer shows come first (that is
            # what the payment cleared), then the oldest.
            Targets = sorted(
                (
                    Invoice for Invoice in db.query(PaymentInvoice)
                    .filter(PaymentInvoice.student_id == StudentRow.id, PaymentInvoice.source == LEGACY, PaymentInvoice.status.in_(("PENDING", "PART_PAID")))
                    .all()
                    if Invoice.id not in Touched
                ),
                key=lambda Invoice: (_VoucherOf(Invoice.invoice_number) in DueByVoucherSet, Invoice.invoice_date, int(_VoucherOf(Invoice.invoice_number) or 0), Invoice.invoice_number),
            )
            Notes.append(f"{Number} ({Old.name}): no invoice on the old report (old 'PreviousDue'); set against: " + (", ".join(Invoice.invoice_number for Invoice in Targets[:3]) or "none"))
        Money = Old.amount
        DiscountGiven = 0
        for Invoice in Targets:
            db.flush()
            RecomputeInvoice(db, Invoice)
            Need = InvoiceBalance(Invoice)
            if Need <= 0:
                if Old.vouchers:
                    Problems.append(f"{Number} ({Old.name}): pays {Invoice.invoice_number}, which is already paid here.")
                continue
            # A discount the old platform gave on this invoice (from
            # old-invoices.csv), used once, on the first line it fits.
            if Money <= 0:
                break
            # Only on an invoice this receipt names: a "PreviousDue" receipt
            # never carries another invoice's discount.
            Voucher = _VoucherOf(Invoice.invoice_number)
            Off = max(0, min(DiscountLeft.get(Voucher, 0), Need)) if Voucher in Old.vouchers else 0
            Pay = min(Need - Off, Money)
            db.add(PaymentAllocation(payment_id=Receipt.id, invoice_id=Invoice.id, amount_paise=Pay, discount_paise=Off, kind="DIRECT"))
            if Off:
                DiscountLeft[Voucher] -= Off
                DiscountGiven += Off
            Money -= Pay
            db.flush()
            RecomputeInvoice(db, Invoice)
            Paid.add(Invoice.id)
        if DiscountGiven:
            Receipt.discount_paise = DiscountGiven
            Receipt.discount_reason = "Discount given on the old platform."
            Notes.append(f"{Number} ({Old.name}): discount {FormatIndianRupees(DiscountGiven)} given on the old platform.")
        if Money:
            Advance[StudentRow.id] += Money
            Notes.append(f"{Number} ({Old.name}): {FormatIndianRupees(Money)} more than the invoices it pays; kept as advance.")
        Collected += Old.amount
        Out.append(f"  new receipt {Number}: {Old.name} ({StudentRow.student_code}), {Old.paid_on.isoformat()}, {FormatIndianRupees(Old.amount)} " + "+".join(f"{Method.title().replace('_', ' ')}" for Method, _, _ in Lines) + (f" -> {', '.join(Invoice.invoice_number for Invoice in Targets)}" if Targets else ""))

    Unused = {Voucher: Value for Voucher, Value in DiscountLeft.items() if Value > 0}
    if Unused:
        Problems.append("Discount(s) in old-invoices.csv not used by any new receipt: " + ", ".join(f"invoice {Voucher} {FormatIndianRupees(Value)}" for Voucher, Value in sorted(Unused.items())))

    # -- Invoices the old platform no longer shows as due.
    OldDueVouchers = set(DueByVoucher)
    Cancelled: list[PaymentInvoice] = []
    Demo = _DemoIds(db)
    Open = (
        db.query(PaymentInvoice)
        .filter(PaymentInvoice.source == LEGACY, PaymentInvoice.status.in_(("PENDING", "PART_PAID")))
        .all()
    )
    for Invoice in Open:
        if Invoice.student_id in Demo or Invoice.id in Touched:
            continue
        RecomputeInvoice(db, Invoice)
        if InvoiceBalance(Invoice) <= 0:
            continue
        Voucher = _VoucherOf(Invoice.invoice_number)
        if Voucher in OldDueVouchers:
            continue
        if Invoice.paid_paise or Invoice.discount_paise:
            Problems.append(f"{Invoice.invoice_number}: part-paid here but no longer due on the old platform; not cancelled. Send this output to Claude.")
            continue
        Invoice.status = "CANCELLED"
        Invoice.cancel_reason = f"{REMOVED_REASON} (checked {Today.strftime('%d %b %Y')})."
        Invoice.cancelled_at = datetime.now(timezone.utc)
        Invoice.cancelled_by_user_id = None
        Cancelled.append(Invoice)
        WritePaymentAudit(db, EntityType="INVOICE", EntityId=Invoice.id, Action="CANCEL", Actor=None, ActorName="MathPath",
                          Before={"invoiceNumber": Invoice.invoice_number, "status": "PENDING"}, After={"invoiceNumber": Invoice.invoice_number, "status": "CANCELLED"},
                          Reason=Invoice.cancel_reason)
    db.flush()
    Names = {Row.id: (Row.student_code, Users.get(Row.user_id).full_name if Users.get(Row.user_id) else None) for Row in db.query(Student).filter(Student.id.in_([Invoice.student_id for Invoice in Cancelled] or ["-"])).all()}
    for Invoice in Cancelled:
        Code, Name = Names.get(Invoice.student_id, ("?", None))
        if not Name:
            UserRow = db.query(User).join(Student, Student.user_id == User.id).filter(Student.id == Invoice.student_id).first()
            Name = UserRow.full_name if UserRow else "?"
        Out.append(f"  cancelled {Invoice.invoice_number}: {Name} ({Code}), {Invoice.fee_name} {FormatIndianRupees(Invoice.amount_paise)} -- {REMOVED_REASON.lower()}")

    # -- Numbering past the old platform's highest.
    HighestInvoice = max([int(Voucher) for Voucher in HereNow.invoices_by_voucher] or [0])
    HighestReceipt = max([int(Base) for Base in HereNow.receipts_by_number] + [int(Number) for Number in ReportByNumber] or [0])
    Moved = []
    for SequenceKey, Next in (("INVOICE", HighestInvoice + 1), ("RECEIPT", HighestReceipt + 1)):
        Sequence = db.get(PaymentNumberSequence, SequenceKey)
        if Sequence is None:
            raise ImportProblem(f"{SequenceKey} numbering is not set up on this site.")
        if Sequence.next_number < Next:
            Moved.append(f"{SequenceKey.title()} {Sequence.next_number} -> {Next}")
            Sequence.next_number = Next
    db.flush()
    from app.services.payments.numbering import FormatDocumentNumber

    Out.append(
        "Next numbers: "
        + ", ".join(f"{Row.key.title()} {FormatDocumentNumber(Row.prefix, Row.pad_width, Row.next_number)}" for Row in db.query(PaymentNumberSequence).filter(PaymentNumberSequence.key.in_(("INVOICE", "RECEIPT"))).order_by(PaymentNumberSequence.key).all())
        + (f" (moved: {'; '.join(Moved)})" if Moved else "")
    )

    # -- Checks.
    Summary = _Check(db, Data, Students, Demo, ExpectedDuePaise, Touched, Out, Problems)
    Summary.update({
        "receiptsAdded": len(NewReceipts),
        "collectedPaise": Collected,
        "invoicesAdded": sum(len(Rows) for Rows in Created.values()),
        "invoicesCancelled": len(Cancelled),
        "advancePaise": sum(Advance.values()),
    })

    Out.insert(0, (
        f"Receipts added: {len(NewReceipts)} ({FormatIndianRupees(Collected)}); "
        f"invoices added: {Summary['invoicesAdded']}; invoices cancelled: {len(Cancelled)}"
        + ("" if NewReceipts or Created or Cancelled else "  -- nothing new to bring across")
    ))
    Out += [f"  note: {Note}" for Note in Notes]
    if Summary["advancePaise"]:
        Out.append(f"Advance from this top-up: {FormatIndianRupees(Summary['advancePaise'])}")
    Missing = _NotHereButActive(db, Data, set(Students))
    if Missing:
        Out.append("Active on the old platform but not on this site (no money yet; add them on the new platform when they join): " + ", ".join(Missing))

    if NewReceipts or Created or Cancelled:
        WritePaymentAudit(
            db, EntityType="HISTORY_IMPORT", EntityId="old-platform", Action="TOPUP", Actor=None, ActorName="MathPath",
            After={"invoices": Summary["invoicesAdded"], "payments": len(NewReceipts), "cancelled": len(Cancelled), "collectedPaise": Collected, "duePaise": Summary["duePaise"]},
        )
    db.flush()
    return TopupResult(Out, Problems, Summary)


def _TouchedByNewPlatform(db: Session) -> set[str]:
    """Ids of old-platform invoices the new platform has acted on: paid (in
    part) by a new-platform receipt, or cancelled by a person."""
    from app.services.payments.receipts_service import _LiveAllocationsQuery

    Ids = {
        Row[0]
        for Row in _LiveAllocationsQuery(db)
        .join(PaymentInvoice, PaymentAllocation.invoice_id == PaymentInvoice.id)
        .filter(PaymentInvoice.source == LEGACY, (PaymentReceipt.source.is_(None)) | (PaymentReceipt.source != LEGACY))
        .with_entities(PaymentAllocation.invoice_id)
        .all()
    }
    Ids |= {Row[0] for Row in db.query(PaymentInvoice.id).filter(PaymentInvoice.source == LEGACY, PaymentInvoice.status == "CANCELLED", PaymentInvoice.cancelled_by_user_id.isnot(None)).all()}
    return Ids


def _TopupDiscounts(db: Session) -> dict[str, int]:
    """Old invoice number -> discount earlier top-ups already put on it."""
    from app.services.payments.receipts_service import _LiveAllocationsQuery

    Out: dict[str, int] = defaultdict(int)
    for Number, Discount in (
        _LiveAllocationsQuery(db)
        .join(PaymentInvoice, PaymentAllocation.invoice_id == PaymentInvoice.id)
        .filter(PaymentReceipt.legacy_id.like(f"{TOPUP_LEGACY_PREFIX}%"), PaymentAllocation.discount_paise > 0)
        .with_entities(PaymentInvoice.invoice_number, PaymentAllocation.discount_paise)
        .all()
    ):
        Voucher = _VoucherOf(Number)
        if Voucher:
            Out[Voucher] += int(Discount or 0)
    return Out


def _DemoIds(db: Session) -> set[str]:
    try:
        from app.services.demo_students import AllDemoStudentIds

        return set(AllDemoStudentIds(db))
    except Exception:  # pragma: no cover - older schema without demo accounts
        return set()


def _Check(db: Session, Data: TopupData, Students: dict[str, Student], Demo: set[str], ExpectedDuePaise: int, Touched: set[str], Out: list[str], Problems: list[str]) -> dict[str, Any]:
    from app.services.payments.receipts_service import InvoiceBalance

    if ExpectedDuePaise != Data.dues_total:
        Problems.append(f"old-dues.csv adds up to {FormatIndianRupees(Data.dues_total)} (without the test records), not the {FormatIndianRupees(ExpectedDuePaise)} given; the file may be incomplete.")

    TouchedVouchers = {_VoucherOf(Row.invoice_number) for Row in db.query(PaymentInvoice).filter(PaymentInvoice.id.in_(list(Touched) or ["-"])).all()}
    if TouchedVouchers:
        Out.append(f"Left out of the comparison (acted on by the new platform since): {len(Touched)} old invoice(s)")
    OldDue: dict[str, int] = defaultdict(int)
    OldTotal = 0
    for Line in Data.dues:
        if Line.voucher in TouchedVouchers:
            continue
        OldTotal += Line.amount
        StudentRow = Students.get(Line.old_id)
        if StudentRow is not None:
            OldDue[StudentRow.id] += Line.amount
    HereDue: dict[str, int] = defaultdict(int)
    for Invoice in db.query(PaymentInvoice).filter(PaymentInvoice.source == LEGACY, PaymentInvoice.status.in_(("PENDING", "PART_PAID"))).all():
        if Invoice.student_id in Demo or Invoice.id in Touched:
            continue
        HereDue[Invoice.student_id] += InvoiceBalance(Invoice)
    Codes = {Row.id: Row.student_code for Row in db.query(Student).filter(Student.id.in_(list(set(OldDue) | set(HereDue)) or ["-"])).all()}
    Different = sorted(StudentId for StudentId in set(OldDue) | set(HereDue) if OldDue.get(StudentId, 0) != HereDue.get(StudentId, 0))
    for StudentId in Different:
        Problems.append(f"{Codes.get(StudentId, StudentId)}: due {FormatIndianRupees(HereDue.get(StudentId, 0))} here, {FormatIndianRupees(OldDue.get(StudentId, 0))} on the old platform.")
    Total = sum(HereDue.values())
    Out.append(f"Old-platform dues here: {FormatIndianRupees(Total)} across {sum(1 for Value in HereDue.values() if Value)} students; old platform: {FormatIndianRupees(Data.dues_total)}")
    Out.append(f"Students whose due matches the old platform: {len(set(OldDue) | set(HereDue)) - len(Different)} of {len(set(OldDue) | set(HereDue))}")
    if Total != OldTotal and not Different:
        Problems.append(f"Dues here {FormatIndianRupees(Total)} differ from the old platform's {FormatIndianRupees(OldTotal)}.")
    return {"duePaise": Total, "studentsDifferent": len(Different)}
