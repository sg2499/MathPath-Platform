"""Payments: bring in the old platform's payment history (2026-10-10,
Shailesh). One-off, run from scripts/import_old_payments.py on the server.

Sources (a folder of CSV files, never committed to the repository):
  * students.csv, payments.csv, payment_groups.csv -- the old site team's
    table export (9 Oct). The students file also carries login names and
    password hashes: those two columns are dropped as the file is read and
    never used.
  * old-site-collections-*.csv -- the old site's Collections report (every
    payment with its method split, reference and Razorpay ids), exported
    from the old admin and checked cell by cell against the page.

What it does, all in one transaction (a dry run rolls it back):
  1. Matches each old student with fee records to a student on this site by
     name and a parent's mobile (this site does not keep the old ID). Old
     test records are left out. The old site's former students who are not
     on this site (12, all inactive) are added as INACTIVE students, after
     the last student code, in their old order, with every detail the old
     site has and no usable login.
  2. Fee items from the old groups, with clean names: the twelve "Monthly
     Fees - <month>" groups are one "Monthly Fee" (monthly), the
     international ones one "Monthly Fee International", the rest as they
     are (one-time). The old names are kept on the item.
  3. Invoices: one per old invoice line, with the old number (MP-INV-000 +
     the old voucher id). An old invoice with several lines keeps its number
     on the first line; the others get -B, -C. A payment the old site took
     without an invoice gets one numbered after its receipt (MP-INV-R<n>).
     Monthly fees carry their month, so Monthly Billing sees them as billed.
     Invoice dates: exact for unpaid invoices; for paid ones the old site
     does not keep the date, so it is the 1st of the month for monthly fees,
     otherwise the nearest earlier known invoice date, never after the first
     payment (marked approximate on the invoice).
  4. Payments: one per old receipt, with the old number (MP-MRCPT-<n>; a
     number the old site used twice gets -B), the old date, the method
     split, references and Razorpay ids from the Collections report, the
     discount, and who received it. The small extra Razorpay amounts the
     old report shows on 7 payments (Rs 51 in all) are left out: each
     payment is the fee actually paid (Shailesh, 10 Oct). Money paid beyond
     the invoices stays on the student as advance, as it does for any
     payment here.
  5. Numbering continues after the old site's highest numbers.
  6. Nothing is sent to students, nothing is written to the activity feed
     line by line (one summary line), and everything is marked as old-site
     history (source LEGACY), so Day Close and unusual-activity checks leave
     it alone.

Then it reconciles: totals, every student's due against the old site, and
collections by month and method against the old report.
"""
from __future__ import annotations

import csv
import json
import re
import secrets
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, InvalidOperation
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    FeeItem,
    Level,
    Module,
    PaymentAllocation,
    PaymentCentre,
    PaymentInvoice,
    PaymentMethodLine,
    PaymentNumberSequence,
    PaymentReceipt,
    Student,
    Teacher,
    User,
)
from app.services.payments.audit import WritePaymentAudit
from app.services.payments.money import FormatIndianRupees, SplitInclusiveGst

LEGACY = "LEGACY"
INDIA_OFFSET = timezone(timedelta(hours=5, minutes=30))
DUE_DAYS = 10
DROPPED_STUDENT_COLUMNS = ("password", "user_name")

# Old test records (Shailesh, 10 Oct): left out.
EXCLUDED_STUDENTS = {"13": "test record ST5", "81": "test record Dummy"}
# The old site's former students who are not on this site: added inactive
# (Shailesh, 10 Oct 13:30 and 13:37). Old student id -> level on this site.
# Levels from their last old receipt; Aarya Aggroya and Subhro Biswas are
# YLM-L1, and Aarya's teacher is Ashalatha Gupta.
CREATE_STUDENTS = {
    "32": "IM-L4", "55": "IM-L4", "64": "IM-L1", "75": "IM-L1", "76": "PM-L4", "85": "IM-L1",
    "89": "PM-L4", "100": "PM-L3", "106": "PM-L4", "142": "YLM-L1", "164": "YLM-L1", "193": "BM-L1",
}
TEACHER_OVERRIDES = {"142": "Ashalatha Gupta"}

MONTHS = {name: number for number, name in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}
METHOD_COLUMNS = (("cash", "CASH"), ("razorpay", "RAZORPAY"), ("upi", "UPI"), ("net_banking", "NET_BANKING"))
LETTERS = "BCDEFGHIJKLMNOPQRSTUVWXYZ"


class ImportProblem(Exception):
    """Something in the data that stops the import; the message says what."""


def _Paise(Value: Any) -> int:
    Text = str(Value or "").strip().replace(",", "")
    if Text in ("", "-", "None"):
        return 0
    try:
        return int((Decimal(Text) * 100).to_integral_value())
    except InvalidOperation as Error:
        raise ImportProblem(f"Not an amount: {Value!r}") from Error


def _Text(Value: Any) -> str | None:
    Text = " ".join(str(Value or "").split())
    return None if Text in ("", "None", "none", "-", "null") else Text


def _Digits(Value: Any) -> str:
    Digits = re.sub(r"\D", "", str(Value or ""))
    return Digits[-10:] if len(Digits) >= 10 else ""


def _NameKey(Value: Any) -> str:
    return re.sub(r"[^a-z]", "", str(Value or "").lower())


def _Date(Value: Any) -> date | None:
    Text = str(Value or "").strip()[:10]
    if not Text or Text == "None":
        return None
    for Format in ("%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(Text, Format).date()
        except ValueError:
            continue
    return None


def _OldTime(Value: Any) -> datetime | None:
    """An old-site timestamp (India time, no zone) as an aware time."""
    Text = str(Value or "").strip()
    for Format in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%d-%m-%Y %H:%M"):
        try:
            return datetime.strptime(Text, Format).replace(tzinfo=INDIA_OFFSET).astimezone(timezone.utc)
        except ValueError:
            continue
    return None


# ----------------------------------------------------------------------------
# Reading the files
# ----------------------------------------------------------------------------

def _ReadCsv(PathValue: Path, *, Drop: tuple[str, ...] = ()) -> list[dict[str, str]]:
    with PathValue.open(newline="", encoding="utf-8-sig") as Handle:
        Rows = []
        for Row in csv.DictReader(Handle):
            for Key in Drop:
                Row.pop(Key, None)
            Rows.append(Row)
    return Rows


@dataclass
class OldData:
    students: dict[str, dict[str, str]]
    rows: list[dict[str, str]]
    groups: dict[str, dict[str, str]]
    report: list[dict[str, str]]
    excluded: list[str] = field(default_factory=list)


def LoadOldData(Folder: Path) -> OldData:
    Folder = Path(Folder)
    Needed = {"students.csv", "payments.csv", "payment_groups.csv"}
    Missing = sorted(Name for Name in Needed if not (Folder / Name).exists())
    Reports = sorted(Folder.glob("old-site-collections-*.csv"))
    if Missing or not Reports:
        raise ImportProblem(f"Missing in {Folder}: {', '.join(Missing + ([] if Reports else ['old-site-collections-<date>.csv']))}")
    Students = {Row["id"]: Row for Row in _ReadCsv(Folder / "students.csv", Drop=DROPPED_STUDENT_COLUMNS)}
    Groups = {Row["id"]: Row for Row in _ReadCsv(Folder / "payment_groups.csv")}
    Report = _ReadCsv(Reports[-1])
    Excluded: list[str] = []
    Rows = []
    for Row in _ReadCsv(Folder / "payments.csv"):
        StudentRow = Students.get(Row["st_id"])
        if Row.get("is_deleted") == "1":
            continue
        if not StudentRow or StudentRow.get("is_deleted") == "1":
            continue
        if Row["st_id"] in EXCLUDED_STUDENTS:
            Excluded.append(f"{EXCLUDED_STUDENTS[Row['st_id']]}: {Row['group_name']} {Row['total_amount']}")
            continue
        if str(Row.get("group_name") or "").lower().startswith("test group"):
            Excluded.append(f"test group row {Row['id']}: {Row['group_name']}")
            continue
        Rows.append(Row)
    return OldData(students=Students, rows=Rows, groups=Groups, report=Report, excluded=Excluded)


# ----------------------------------------------------------------------------
# Fee items
# ----------------------------------------------------------------------------

@dataclass
class FeeSpec:
    name: str
    billing: str  # MONTHLY | ONE_TIME
    amount: int
    month: int | None
    old_names: set[str] = field(default_factory=set)


def _CleanGroupName(Name: str) -> str:
    Clean = " ".join(Name.split())
    Clean = re.sub(r"\btution\b", "Tuition", Clean, flags=re.I)
    return Clean


def FeeSpecFor(GroupName: str, Amount: int) -> FeeSpec:
    Name = _CleanGroupName(GroupName)
    Low = Name.lower()
    International = re.match(r"^monthly tuition fees\s*-\s*international(?:\s*-\s*([a-z]+))?$", Low)
    if International:
        Month = MONTHS.get((International.group(1) or "")[:3])
        return FeeSpec("Monthly Fee International", "MONTHLY", 220000, Month, {GroupName.strip()})
    Monthly = re.match(r"^monthly fees\s*-\s*([a-z]+)$", Low)
    if Monthly and Monthly.group(1)[:3] in MONTHS:
        return FeeSpec("Monthly Fee", "MONTHLY", 110000, MONTHS[Monthly.group(1)[:3]], {GroupName.strip()})
    return FeeSpec(Name, "ONE_TIME", Amount, None, {GroupName.strip()})


def _PeriodFor(Month: int, Near: date) -> tuple[int, int]:
    """The year for a month name, as the one closest to the date the old
    site recorded (so 'Monthly Fees - Jan' paid in December is next year's)."""
    Best = None
    for Year in (Near.year - 1, Near.year, Near.year + 1):
        Distance = abs((Year * 12 + Month) - (Near.year * 12 + Near.month))
        if Best is None or Distance < Best[0]:
            Best = (Distance, Year)
    return Best[1], Month


# ----------------------------------------------------------------------------
# Matching students
# ----------------------------------------------------------------------------

def _NewMobiles(StudentRow: Student) -> set[str]:
    return {Digits for Digits in (_Digits(StudentRow.father_mobile), _Digits(StudentRow.mother_mobile), _Digits(StudentRow.father_whatsapp), _Digits(StudentRow.mother_whatsapp), _Digits(StudentRow.parent_contact)) if Digits}


def _OldMobiles(Old: dict[str, str]) -> set[str]:
    return {Digits for Digits in (_Digits(Old.get("f_mobile")), _Digits(Old.get("m_mobile")), _Digits(Old.get("f_whatsapp")), _Digits(Old.get("m_whatsapp"))) if Digits}


def MatchStudents(db: Session, Data: OldData) -> tuple[dict[str, Student], list[str], list[str]]:
    """Old student id -> this site's student. A match needs the same name
    and a shared parent mobile; failing that, a shared mobile and a name
    that is nearly the same (one student only). Returns the matches, notes
    on near-name matches, and the old ids with no match."""
    New = db.query(Student, User).join(User, Student.user_id == User.id).all()
    ByName: dict[str, list[Student]] = defaultdict(list)
    ByMobile: dict[str, list[tuple[Student, User]]] = defaultdict(list)
    for StudentRow, UserRow in New:
        ByName[_NameKey(UserRow.full_name)].append(StudentRow)
        for Mobile in _NewMobiles(StudentRow):
            ByMobile[Mobile].append((StudentRow, UserRow))
    Needed = sorted({Row["st_id"] for Row in Data.rows}, key=int)
    Matches: dict[str, Student] = {}
    Notes: list[str] = []
    Missing: list[str] = []
    Taken: dict[str, str] = {}
    for OldId in Needed:
        Old = Data.students[OldId]
        Mobiles = _OldMobiles(Old)
        Named = [Row for Row in ByName.get(_NameKey(Old["st_name"]), []) if _NewMobiles(Row) & Mobiles]
        Choice = None
        if len(Named) == 1:
            Choice = Named[0]
        elif not Named:
            Near = {}
            for Mobile in Mobiles:
                for StudentRow, UserRow in ByMobile.get(Mobile, []):
                    if SequenceMatcher(None, _NameKey(UserRow.full_name), _NameKey(Old["st_name"])).ratio() >= 0.85:
                        Near[StudentRow.id] = (StudentRow, UserRow)
            if len(Near) == 1:
                Choice, UserRow = next(iter(Near.values()))
                Notes.append(f"old '{Old['st_name']}' = '{UserRow.full_name}' ({Choice.student_code}): same parent mobile, spelling differs")
        if Choice is None:
            Missing.append(OldId)
            continue
        if Choice.id in Taken:
            raise ImportProblem(f"Two old students match {Choice.student_code}: old ids {Taken[Choice.id]} and {OldId}")
        Taken[Choice.id] = OldId
        Matches[OldId] = Choice
    return Matches, Notes, Missing


def _NextStudentNumber(db: Session) -> int:
    Highest = 0
    for (Code,) in db.query(Student.student_code).all():
        Found = re.match(r"^MP-ST-(\d+)$", Code or "")
        if Found:
            Highest = max(Highest, int(Found.group(1)))
    return Highest + 1


def _Teacher(db: Session, Name: str | None) -> Teacher | None:
    if not Name:
        return None
    return db.query(Teacher).join(User, Teacher.user_id == User.id).filter(User.full_name == Name).first()


def CreateFormerStudents(db: Session, Data: OldData, Missing: list[str]) -> tuple[dict[str, Student], list[str]]:
    """Adds the listed former students as inactive, after the last student
    code, in their old order. Anyone else without a match stops the import."""
    Unknown = [OldId for OldId in Missing if OldId not in CREATE_STUDENTS]
    if Unknown:
        Names = ", ".join(f"{OldId} {Data.students[OldId]['st_name']}" for OldId in Unknown)
        raise ImportProblem(f"Old students with fee records and no student on this site: {Names}. Add them, or tell Claude what to do.")
    Created: dict[str, Student] = {}
    Lines: list[str] = []
    Number = _NextStudentNumber(db)
    Levels = {Row.level_code: Row for Row in db.query(Level).all()}
    for OldId in sorted(Missing, key=int):
        Old = Data.students[OldId]
        LevelRow = Levels.get(CREATE_STUDENTS[OldId])
        if not LevelRow:
            raise ImportProblem(f"Level {CREATE_STUDENTS[OldId]} does not exist on this site.")
        TeacherName = TEACHER_OVERRIDES.get(OldId) or _Text(Old.get("employee_name"))
        TeacherRow = _Teacher(db, TeacherName)
        Code = f"MP-ST-{Number:04d}"
        CustomId = f"MP-2026-{Number:04d}"
        if db.query(Student).filter((Student.student_code == Code) | (Student.custom_id == CustomId)).first():
            raise ImportProblem(f"{Code} / {CustomId} is already taken.")
        from app.core.security import hash_password

        UserRow = User(
            full_name=_Text(Old["st_name"]),
            email=None,
            phone=None,
            # No usable login: a random secret nobody knows.
            password_hash=hash_password(secrets.token_urlsafe(32)),
            role="STUDENT",
            is_active=False,
        )
        db.add(UserRow)
        db.flush()
        Admission = _Date(Old.get("admission_date"))
        Dob = _Date(Old.get("dob"))
        StudentRow = Student(
            user_id=UserRow.id,
            student_code=Code,
            custom_id=CustomId,
            is_active=False,
            current_module_id=LevelRow.module_id,
            current_level_id=LevelRow.id,
            teacher=TeacherName,
            teacher_id=TeacherRow.id if TeacherRow else None,
            admission_date=Admission.isoformat() if Admission else None,
            dob=Dob.isoformat() if Dob else None,
            gender=_Text(Old.get("gender")),
            blood_group=_Text(Old.get("blood")),
            interest=_Text(Old.get("interest")),
            present_address=_Text(Old.get("present_address")),
            permanent_address=_Text(Old.get("permanent_address")),
            school_name=_Text(Old.get("school_name")),
            school_area=_Text(Old.get("school_area")),
            class_name=_Text(Old.get("class")),
            section=_Text(Old.get("section")),
            father_name=_Text(Old.get("f_name")),
            father_occupation=_Text(Old.get("f_occupation")),
            father_mobile=_Text(Old.get("f_mobile")),
            father_email=_Text(Old.get("f_email")),
            father_whatsapp=_Text(Old.get("f_whatsapp")),
            mother_name=_Text(Old.get("m_name")),
            mother_occupation=_Text(Old.get("m_occupation")),
            mother_mobile=_Text(Old.get("m_mobile")),
            mother_email=_Text(Old.get("m_email")),
            mother_whatsapp=_Text(Old.get("m_whatsapp")),
        )
        db.add(StudentRow)
        db.flush()
        Created[OldId] = StudentRow
        Lines.append(f"{Code} / {CustomId}  {UserRow.full_name}  {LevelRow.level_code}  teacher {TeacherName or '-'}{'' if TeacherRow or not TeacherName else ' (not found on this site)'}  inactive")
        Number += 1
    return Created, Lines


# ----------------------------------------------------------------------------
# The plan: invoices and payments from the old rows
# ----------------------------------------------------------------------------

@dataclass
class InvoiceLine:
    key: str
    old_student: str
    number: str
    voucher: str | None
    group_name: str
    amount: int
    spec: FeeSpec
    invoice_date: date | None = None
    approximate: bool = False
    period: tuple[int, int] | None = None
    reference_date: date | None = None
    unpaid_due: int | None = None
    row_ids: list[str] = field(default_factory=list)


@dataclass
class PaymentPlan:
    number: str
    old_student: str
    trans: str | None
    payment_date: date
    amount: int
    discount: int
    lines: list[tuple[str, int, str | None]]
    channel: str
    pay_by: str | None
    received_by: str | None
    created_at: datetime | None
    invoice_keys: list[str]
    note: str
    dropped_extra: int = 0


def _ReportKey(Row: dict[str, str]) -> tuple[str, str]:
    return Row["payment_id"], Row["student"].split(" | ")[0].strip()


def BuildPlan(Data: OldData) -> tuple[dict[str, InvoiceLine], list[PaymentPlan], list[str]]:
    Notes: list[str] = []
    Students = Data.students
    Rows = sorted(Data.rows, key=lambda Row: int(Row["id"]))

    # Known invoice dates (unpaid rows carry the invoice date).
    Known: dict[int, date] = {}
    for Row in Rows:
        if not Row["trans_id"] and Row["voucher_id"]:
            Known[int(Row["voucher_id"])] = _Date(Row["date"])
    KnownIds = sorted(Known)

    # Payments (old transactions) and their first date, for invoice dates.
    Trans: dict[str, list[dict[str, str]]] = defaultdict(list)
    for Row in Rows:
        if Row["trans_id"]:
            Trans[Row["trans_id"]].append(Row)

    # Invoice lines.
    Invoices: dict[str, InvoiceLine] = {}
    VoucherLines: dict[str, list[str]] = defaultdict(list)
    for Row in Rows:
        if not Row["group_id"]:
            continue  # "PreviousDue" bookkeeping rows carry no money of their own
        Amount = _Paise(Row["group_amount"])
        Spec = FeeSpecFor(Row["group_name"], Amount)
        if Row["voucher_id"]:
            Key = f"V{Row['voucher_id']}:G{Row['group_id']}"
            if Key in Invoices:
                Invoices[Key].row_ids.append(Row["id"])
                continue
            VoucherLines[Row["voucher_id"]].append(Key)
            Invoices[Key] = InvoiceLine(Key, Row["st_id"], "", Row["voucher_id"], Row["group_name"], Amount, Spec, row_ids=[Row["id"]])
        else:
            Key = f"T{Row['trans_id']}:G{Row['group_id']}"
            Invoices[Key] = InvoiceLine(Key, Row["st_id"], "", None, Row["group_name"], Amount, Spec, row_ids=[Row["id"]])
        Line = Invoices[Key]
        if not Row["trans_id"]:
            Line.unpaid_due = _Paise(Row["group_due_amount"])
            Line.invoice_date = _Date(Row["date"])
        Line.reference_date = min(filter(None, [Line.reference_date, _Date(Row["date"])]))

    # Numbers: MP-INV-000<voucher>, -B/-C for further lines of the same invoice.
    for Voucher, Keys in VoucherLines.items():
        for Index, Key in enumerate(Keys):
            Invoices[Key].number = f"MP-INV-000{Voucher}" + ("" if Index == 0 else f"-{LETTERS[Index - 1]}")

    # Receipt numbers (a number the old site used twice gets -B).
    ByNumber: dict[str, list[str]] = defaultdict(list)
    for TransId, TransRows in Trans.items():
        ByNumber[TransRows[0]["payment_custom_id"]].append(TransId)
    ReceiptNumber: dict[str, str] = {}
    for Number, TransIds in ByNumber.items():
        for Index, TransId in enumerate(sorted(TransIds, key=int)):
            ReceiptNumber[TransId] = f"MP-MRCPT-{Number}" + ("" if Index == 0 else f"-{LETTERS[Index - 1]}")
            if Index:
                Notes.append(f"Receipt MP-MRCPT-{Number} was used twice on the old site: the second ({Students[Trans[TransId][0]['st_id']]['st_name']}) is MP-MRCPT-{Number}-{LETTERS[Index - 1]}.")

    for Key, Line in Invoices.items():
        if Line.voucher is None:
            TransId = Key.split(":")[0][1:]
            Line.number = "MP-INV-R" + ReceiptNumber[TransId].removeprefix("MP-MRCPT-")
            Line.invoice_date = _Date(Trans[TransId][0]["date"])
            Line.approximate = True
            Notes.append(f"{Line.number}: {Students[Line.old_student]['st_name']}, {Line.group_name} was paid on the old site without an invoice; this invoice records it.")

    # Report rows by receipt number + old student ID.
    Report: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    for Row in Data.report:
        if Row["payment_id"] in ("Total", ""):
            continue
        Report[_ReportKey(Row)].append(Row)

    # Payments.
    Payments: list[PaymentPlan] = []
    UsedReport: set[int] = set()
    for TransId, TransRows in sorted(Trans.items(), key=lambda Item: int(Item[0])):
        First = TransRows[0]
        Old = Students[First["st_id"]]
        Candidates = Report.get((First["payment_custom_id"], Old["st_custom_id"]), [])
        if len(Candidates) != 1:
            raise ImportProblem(f"Receipt {First['payment_custom_id']} for {Old['st_name']}: {len(Candidates)} rows in the Collections report (expected 1).")
        ReportRow = Candidates[0]
        UsedReport.add(id(ReportRow))
        Amount = _Paise(First["total_pay_amount"])
        Discount = max(0, _Paise(First["total_disc_amount"]))
        Lines, Dropped = _MethodLines(ReportRow, Amount)
        if Dropped:
            Notes.append(f"{ReceiptNumber[TransId]} ({Old['st_name']}): left out the extra {FormatIndianRupees(Dropped)} the old report shows on top of the {FormatIndianRupees(Amount)} paid.")
        PayDate = _Date(ReportRow["date"]) or _Date(First["date"])
        Keys = []
        for Row in TransRows:
            if not Row["group_id"]:
                continue
            Key = f"V{Row['voucher_id']}:G{Row['group_id']}" if Row["voucher_id"] else f"T{TransId}:G{Row['group_id']}"
            Keys.append(Key)
        # Online only when Razorpay carried the payment itself (on 7 old
        # payments it carried just the small extra that is left out).
        Online = any(Method == "RAZORPAY" for Method, _, _ in Lines)
        Payments.append(PaymentPlan(
            number=ReceiptNumber[TransId],
            old_student=First["st_id"],
            trans=TransId,
            payment_date=PayDate,
            amount=Amount,
            discount=Discount,
            lines=Lines,
            channel="ONLINE" if Online else "COUNTER",
            pay_by=_Text(First.get("pay_by")) if _Text(First.get("pay_by")) != "system" else None,
            received_by=("Razorpay" if Online else (_Text(First.get("received_by")) or None)),
            created_at=_OldTime(First.get("created_at")),
            invoice_keys=Keys,
            note=f"From the old platform (receipt {ReceiptNumber[TransId]}).",
            dropped_extra=Dropped,
        ))

    # Payments in the report that are newer than the table export.
    ByOldCode = {Row["st_custom_id"]: Row["id"] for Row in Students.values() if Row.get("is_deleted") != "1"}
    for Row in Data.report:
        if Row["payment_id"] in ("Total", "") or id(Row) in UsedReport:
            continue
        OldCode = Row["student"].split(" | ")[0].strip()
        OldId = ByOldCode.get(OldCode)
        if OldId in EXCLUDED_STUDENTS:
            continue  # old test records, left out
        if not OldId:
            raise ImportProblem(f"Collections report payment {Row['payment_id']} ({Row['student']}): student not in the export.")
        Amount = _Paise(Row["grand_total"])
        Lines, _ = _MethodLines(Row, Amount)
        Keys = []
        for Voucher in re.split(r"[,\s]+", Row["invoice_no"] or ""):
            if Voucher.isdigit():
                Keys.extend(Key for Key, Line in Invoices.items() if Line.voucher == Voucher and Line.old_student == OldId)
        Online = any(Method == "RAZORPAY" for Method, _, _ in Lines)
        Number = f"MP-MRCPT-{Row['payment_id']}"
        if any(Payment.number == Number for Payment in Payments):
            raise ImportProblem(f"{Number} appears both in the export and as a newer report row.")
        Payments.append(PaymentPlan(
            number=Number, old_student=OldId, trans=None, payment_date=_Date(Row["date"]), amount=Amount, discount=0, lines=Lines,
            channel="ONLINE" if Online else "COUNTER", pay_by=None, received_by="Razorpay" if Online else _Text(Row.get("updated_by")),
            created_at=None, invoice_keys=Keys, note=f"From the old platform (receipt {Number}; after the table export).",
        ))
        Notes.append(f"{Number} ({Students[OldId]['st_name']}, {Row['date']}, {FormatIndianRupees(Amount)}) is newer than the table export: taken from the Collections report.")

    # Invoice dates and periods.
    FirstPaid: dict[str, date] = {}
    for Payment in Payments:
        for Key in Payment.invoice_keys:
            if Key not in FirstPaid or Payment.payment_date < FirstPaid[Key]:
                FirstPaid[Key] = Payment.payment_date
    import bisect

    for Key, Line in Invoices.items():
        Reference = Line.invoice_date or FirstPaid.get(Key) or Line.reference_date
        if Line.spec.month:
            Line.period = _PeriodFor(Line.spec.month, Reference)
        if Line.invoice_date is None:
            Line.approximate = True
            Cap = FirstPaid.get(Key) or Line.reference_date
            if Line.period:
                Guess = date(Line.period[0], Line.period[1], 1)
            else:
                Position = bisect.bisect_right(KnownIds, int(Line.voucher)) - 1 if Line.voucher else -1
                Guess = Known[KnownIds[Position]] if Position >= 0 else Cap
            Line.invoice_date = min(Guess, Cap) if Cap else Guess
    return Invoices, Payments, Notes


def _MethodLines(Row: dict[str, str], Amount: int) -> tuple[list[tuple[str, int, str | None]], int]:
    Lines = [(Method, _Paise(Row[Column])) for Column, Method in METHOD_COLUMNS if _Paise(Row[Column])]
    Total = sum(Value for _, Value in Lines)
    Dropped = 0
    if Total > Amount:
        Extra = Total - Amount
        Index = next((Position for Position, (_, Value) in enumerate(Lines) if Value == Extra), None)
        if Index is None:
            raise ImportProblem(f"Receipt {Row['payment_id']}: the methods add up to {FormatIndianRupees(Total)} but {FormatIndianRupees(Amount)} was paid.")
        Lines.pop(Index)
        Dropped = Extra
    elif Total < Amount:
        raise ImportProblem(f"Receipt {Row['payment_id']}: the methods add up to {FormatIndianRupees(Total)} but {FormatIndianRupees(Amount)} was paid.")
    Reference = _Text(Row.get("trans_ref"))
    Pg = _Text(Row.get("pg_payment_id"))
    Order = _Text(Row.get("order_id"))
    Out: list[tuple[str, int, str | None]] = []
    Given = False
    for Method, Value in Lines:
        Text = None
        if Method != "CASH" and not Given:
            Parts = [Reference] if Reference else []
            if Method == "RAZORPAY" and Pg:
                Parts.append(f"{Pg} {Order or ''}".strip())
            Text = " · ".join(Parts)[:120] or None
            Given = True
        Out.append((Method, Value, Text))
    return Out, Dropped


# ----------------------------------------------------------------------------
# Writing
# ----------------------------------------------------------------------------

@dataclass
class ImportResult:
    lines: list[str]
    problems: list[str]
    summary: dict[str, Any]


def _FeeItems(db: Session, Invoices: dict[str, InvoiceLine]) -> dict[str, FeeItem]:
    from app.services.payments.setup_service import NameKey

    Specs: dict[str, FeeSpec] = {}
    for Line in Invoices.values():
        Spec = Specs.setdefault(Line.spec.name, FeeSpec(Line.spec.name, Line.spec.billing, Line.spec.amount, None, set()))
        Spec.old_names |= Line.spec.old_names
        if Line.spec.billing == "ONE_TIME":
            Spec.amount = max(Spec.amount, Line.amount)
    Items: dict[str, FeeItem] = {}
    LastOrder = (db.query(func.max(FeeItem.display_order)).scalar() or 0)
    for Name, Spec in sorted(Specs.items(), key=lambda Item: (Item[1].billing != "MONTHLY", Item[0])):
        Existing = db.query(FeeItem).filter(FeeItem.name_key == NameKey(Name)).first()
        if Existing:
            Items[Name] = Existing
            continue
        LastOrder += 1
        Item = FeeItem(
            name=Name,
            name_key=NameKey(Name),
            description="From the old platform.",
            amount_paise=Spec.amount,
            gst_included=True,
            gst_rate_bps=1800,
            billing_type=Spec.billing,
            display_order=LastOrder,
            is_active=True,
            legacy_names_json=json.dumps(sorted(Spec.old_names)),
        )
        db.add(Item)
        db.flush()
        Items[Name] = Item
    return Items


def RunImport(db: Session, Data: OldData, *, ExpectedDuePaise: int | None = None) -> ImportResult:
    """Everything, in the caller's transaction. The caller commits (apply) or
    rolls back (dry run)."""
    from app.services.payments.invoices_service import PeriodLabel, _BusinessSnapshot, _CentreSnapshot, _StudentSnapshot
    from app.services.payments.receipts_service import RecomputeInvoice

    Out: list[str] = []
    Problems: list[str] = []
    if db.query(PaymentInvoice).filter(PaymentInvoice.source == LEGACY).first() or db.query(PaymentReceipt).filter(PaymentReceipt.source == LEGACY).first():
        raise ImportProblem("The old history is already here (records marked LEGACY exist). Nothing was done.")

    # 1. Students.
    Matches, MatchNotes, Missing = MatchStudents(db, Data)
    Created, CreatedLines = CreateFormerStudents(db, Data, Missing)
    Students = {**Matches, **Created}
    Out.append(f"Students with old fee records: {len(Students)} ({len(Matches)} matched on this site, {len(Created)} former students added inactive)")
    Out += [f"  added: {Line}" for Line in CreatedLines]
    Out += [f"  note: {Note}" for Note in MatchNotes]
    Out += [f"  left out: {Line}" for Line in Data.excluded]

    # 2. Plan, fee items.
    Invoices, Payments, Notes = BuildPlan(Data)
    Items = _FeeItems(db, Invoices)
    ItemLabels = [f"{Name} ({Item.billing_type.lower().replace('_', '-')})" for Name, Item in Items.items()]
    Out.append("Fee items: " + ", ".join(ItemLabels))

    # Numbers already used here would clash.
    Numbers = [Line.number for Line in Invoices.values()]
    if len(Numbers) != len(set(Numbers)):
        raise ImportProblem("Two old invoices would get the same number.")
    Clash = db.query(PaymentInvoice.invoice_number).filter(PaymentInvoice.invoice_number.in_(Numbers)).first()
    if Clash:
        raise ImportProblem(f"Invoice number {Clash[0]} is already used on this site.")
    Receipts = [Payment.number for Payment in Payments]
    Clash = db.query(PaymentReceipt.receipt_number).filter(PaymentReceipt.receipt_number.in_(Receipts)).first()
    if Clash:
        raise ImportProblem(f"Receipt number {Clash[0]} is already used on this site.")

    # 3. Invoices.
    Business = _BusinessSnapshot(db)
    Centres = db.query(PaymentCentre).order_by(PaymentCentre.display_order.asc(), PaymentCentre.name.asc()).all()
    Levels = {Row.id: Row for Row in db.query(Level).all()}
    Users = {Row.id: Row for Row in db.query(User).filter(User.id.in_([Row.user_id for Row in Students.values()])).all()}
    Snapshots: dict[str, dict[str, Any]] = {}
    for OldId, StudentRow in Students.items():
        Snapshots[OldId] = {
            "business": Business,
            "centre": _CentreSnapshot(db, StudentRow.centre_id, Centres),
            "student": _StudentSnapshot(StudentRow, Users[StudentRow.user_id], Levels.get(StudentRow.current_level_id)),
        }
    Made: dict[str, PaymentInvoice] = {}
    SeenPeriods: set[tuple[str, str, str]] = set()
    for Key, Line in sorted(Invoices.items(), key=lambda Item: (Item[1].invoice_date, Item[1].number)):
        StudentRow = Students[Line.old_student]
        Item = Items[Line.spec.name]
        PeriodKey = f"{Line.period[0]:04d}-{Line.period[1]:02d}" if Line.period else None
        if PeriodKey:
            Guard = (StudentRow.id, Item.id, PeriodKey)
            if Guard in SeenPeriods:
                Notes.append(f"{Line.number}: a second {Item.name} for {PeriodLabel(Line.period[1], Line.period[0])} for {Data.students[Line.old_student]['st_name']}; kept, without the month link.")
                PeriodKey = None
            else:
                SeenPeriods.add(Guard)
        Split = SplitInclusiveGst(Line.amount, 1800, GstIncluded=True)
        Label = PeriodLabel(Line.period[1], Line.period[0]) if Line.period else None
        Snapshot = dict(Snapshots[Line.old_student])
        Snapshot["legacy"] = {"oldInvoice": Line.number, "oldGroup": Line.group_name, "dateApproximate": Line.approximate}
        Invoice = PaymentInvoice(
            invoice_number=Line.number,
            student_id=StudentRow.id,
            fee_item_id=Item.id,
            fee_name=Item.name,
            billing_type=Item.billing_type,
            billing_month=Line.period[1] if PeriodKey else None,
            billing_year=Line.period[0] if PeriodKey else None,
            period_key=PeriodKey,
            description=" · ".join(Part for Part in ["Math Path Abacus", Item.name, Label, "old platform"] if Part),
            invoice_date=Line.invoice_date,
            due_date=Line.invoice_date + timedelta(days=DUE_DAYS),
            amount_paise=Line.amount,
            taxable_paise=Split["taxablePaise"],
            cgst_paise=Split["cgstPaise"],
            sgst_paise=Split["sgstPaise"],
            gst_rate_bps=1800,
            gst_included=True,
            paid_paise=0,
            discount_paise=0,
            status="PENDING",
            level_code=Snapshot["student"].get("levelCode"),
            centre_id=StudentRow.centre_id,
            snapshot_json=json.dumps(Snapshot, sort_keys=True),
            source=LEGACY,
            legacy_id=f"old:{Key}",
            created_at=datetime.combine(Line.invoice_date, time(9, 0), INDIA_OFFSET).astimezone(timezone.utc),
        )
        db.add(Invoice)
        Made[Key] = Invoice
    db.flush()

    # 4. Payments, method lines, allocations.
    Advance: dict[str, int] = defaultdict(int)
    for Payment in sorted(Payments, key=lambda Item: (Item.payment_date, Item.number)):
        StudentRow = Students[Payment.old_student]
        Receipt = PaymentReceipt(
            receipt_number=Payment.number,
            student_id=StudentRow.id,
            payment_date=Payment.payment_date,
            pay_by=Payment.pay_by,
            received_by_user_id=None,
            received_by_name=Payment.received_by,
            amount_paise=Payment.amount,
            discount_paise=Payment.discount,
            discount_reason="Discount given on the old platform." if Payment.discount else None,
            note=Payment.note,
            channel=Payment.channel,
            status="RECORDED",
            centre_id=StudentRow.centre_id,
            snapshot_json=json.dumps(Snapshots[Payment.old_student], sort_keys=True),
            source=LEGACY,
            legacy_id=f"old:trans:{Payment.trans}" if Payment.trans else f"old:report:{Payment.number}",
            created_at=Payment.created_at or datetime.combine(Payment.payment_date, time(12, 0), INDIA_OFFSET).astimezone(timezone.utc),
        )
        db.add(Receipt)
        db.flush()
        for Order, (Method, Value, Reference) in enumerate(Payment.lines):
            db.add(PaymentMethodLine(payment_id=Receipt.id, method=Method, amount_paise=Value, reference=Reference, line_order=Order))
        Money, Discount = Payment.amount, Payment.discount
        Settled: dict[str, int] = {}
        for Key in Payment.invoice_keys:
            Invoice = Made[Key]
            Already = sum(Row.amount_paise + Row.discount_paise for Row in db.query(PaymentAllocation).filter(PaymentAllocation.invoice_id == Invoice.id).all())
            Need = Invoice.amount_paise - Already - Settled.get(Key, 0)
            if Need <= 0:
                continue
            Pay = min(Need, Money)
            Off = min(Need - Pay, Discount)
            if Pay or Off:
                db.add(PaymentAllocation(payment_id=Receipt.id, invoice_id=Invoice.id, amount_paise=Pay, discount_paise=Off, kind="DIRECT"))
                Money -= Pay
                Discount -= Off
                Settled[Key] = Settled.get(Key, 0) + Pay + Off
        if Discount:
            Problems.append(f"{Payment.number}: discount {FormatIndianRupees(Discount)} could not be placed on an invoice.")
            Receipt.discount_paise -= Discount
        if Money:
            Advance[Payment.old_student] += Money
            Notes.append(f"{Payment.number} ({Data.students[Payment.old_student]['st_name']}): {FormatIndianRupees(Money)} more than the invoices it paid; kept as advance.")
        db.flush()
        for Key in Settled:
            RecomputeInvoice(db, Made[Key])

    # 5. Numbering after the old site's highest numbers.
    HighestInvoice = max(int(Line.voucher) for Line in Invoices.values() if Line.voucher)
    HighestReceipt = max(int(re.match(r"MP-MRCPT-(\d+)", Payment.number).group(1)) for Payment in Payments)
    for SequenceKey, Next, Pad in (("INVOICE", HighestInvoice + 1, 7), ("RECEIPT", HighestReceipt + 1, 0)):
        Sequence = db.get(PaymentNumberSequence, SequenceKey)
        if Sequence is None:
            from app.services.payments.numbering import EnsureNumberSequences

            EnsureNumberSequences(db)
            Sequence = db.get(PaymentNumberSequence, SequenceKey)
        if Sequence.last_issued_number:
            raise ImportProblem(f"{SequenceKey} numbers have already been issued on this site; set the next number by hand.")
        Sequence.next_number = max(Sequence.next_number if Sequence.is_configured else 0, Next)
        Sequence.pad_width = Pad
        Sequence.is_configured = True
    db.flush()
    from app.services.payments.numbering import FormatDocumentNumber

    Out.append(
        "Next numbers: "
        + ", ".join(f"{Row.key} {FormatDocumentNumber(Row.prefix, Row.pad_width, Row.next_number)}" for Row in db.query(PaymentNumberSequence).filter(PaymentNumberSequence.key.in_(("INVOICE", "RECEIPT"))).order_by(PaymentNumberSequence.key).all())
    )

    # 6. Reconciliation.
    Summary = _Reconcile(db, Data, Students, Invoices, Payments, Made, ExpectedDuePaise, Out, Problems)
    Out += [f"  note: {Note}" for Note in Notes]
    AdvanceLabels = [Data.students[OldId]["st_name"] + " " + FormatIndianRupees(Value) for OldId, Value in Advance.items()]
    Out.append(f"Advance held after the import: {FormatIndianRupees(sum(Advance.values()))}" + (" (" + ", ".join(AdvanceLabels) + ")" if AdvanceLabels else ""))

    WritePaymentAudit(
        db, EntityType="HISTORY_IMPORT", EntityId="old-platform", Action="IMPORT", Actor=None, ActorName="MathPath",
        After={"invoices": len(Made), "payments": len(Payments), "studentsAdded": len(Created), "collectedPaise": Summary["collectedPaise"], "duePaise": Summary["duePaise"]},
    )
    db.flush()
    return ImportResult(lines=Out, problems=Problems, summary=Summary)


def _Reconcile(db, Data, Students, Invoices, Payments, Made, ExpectedDuePaise, Out, Problems) -> dict[str, Any]:
    from app.services.payments.receipts_service import InvoiceBalance

    Invoiced = sum(Invoice.amount_paise for Invoice in Made.values())
    Collected = sum(Payment.amount for Payment in Payments)
    Discount = sum(Invoice.discount_paise for Invoice in Made.values())
    Due = sum(InvoiceBalance(Invoice) for Invoice in Made.values())
    Out.append(f"Invoices: {len(Made)}, {FormatIndianRupees(Invoiced)} (unpaid or part-paid: {sum(1 for Invoice in Made.values() if InvoiceBalance(Invoice))})")
    Out.append(f"Payments: {len(Payments)}, collected {FormatIndianRupees(Collected)}, discount {FormatIndianRupees(Discount)}")
    Out.append(f"Due now: {FormatIndianRupees(Due)}" + (f" (old site, without its test records: {FormatIndianRupees(ExpectedDuePaise)})" if ExpectedDuePaise is not None else ""))
    if ExpectedDuePaise is not None and ExpectedDuePaise != Due:
        Problems.append(f"Due {FormatIndianRupees(Due)} does not match the old site's {FormatIndianRupees(ExpectedDuePaise)}.")

    # Each student's due against the old rows (unpaid lines less newer payments).
    OldDue: dict[str, int] = defaultdict(int)
    for Line in Invoices.values():
        if Line.unpaid_due:
            OldDue[Line.old_student] += Line.unpaid_due
    for Payment in Payments:
        if Payment.trans is None:
            OldDue[Payment.old_student] -= Payment.amount
    NewDue: dict[str, int] = defaultdict(int)
    for Key, Invoice in Made.items():
        NewDue[Invoices[Key].old_student] += InvoiceBalance(Invoice)
    Different = [OldId for OldId in set(OldDue) | set(NewDue) if OldDue.get(OldId, 0) != NewDue.get(OldId, 0)]
    for OldId in Different:
        Problems.append(f"{Data.students[OldId]['st_name']}: due {FormatIndianRupees(NewDue.get(OldId, 0))} here, {FormatIndianRupees(OldDue.get(OldId, 0))} on the old site.")
    Out.append(f"Students whose due matches the old site: {len(set(OldDue) | set(NewDue)) - len(Different)} of {len(set(OldDue) | set(NewDue))}")

    # Collections by month and method against the old report (less what was
    # left out on purpose).
    Mine: dict[tuple[str, str], int] = defaultdict(int)
    for Payment in Payments:
        for Method, Value, _ in Payment.lines:
            Mine[(Payment.payment_date.strftime("%Y-%m"), Method)] += Value
    Theirs: dict[tuple[str, str], int] = defaultdict(int)
    Excluded = {Row["st_custom_id"] for OldId, Row in Data.students.items() if OldId in EXCLUDED_STUDENTS}
    Dropped = sum(Payment.dropped_extra for Payment in Payments)
    for Row in Data.report:
        if Row["payment_id"] in ("Total", "") or Row["student"].split(" | ")[0].strip() in Excluded:
            continue
        Month = (_Date(Row["date"]) or date(1970, 1, 1)).strftime("%Y-%m")
        for Column, Method in METHOD_COLUMNS:
            Theirs[(Month, Method)] += _Paise(Row[Column])
    Out.append("Collections by month (here / old report less test records):")
    for Month in sorted({Key[0] for Key in Mine} | {Key[0] for Key in Theirs}):
        Here = sum(Value for (M, _), Value in Mine.items() if M == Month)
        There = sum(Value for (M, _), Value in Theirs.items() if M == Month)
        Methods = ", ".join(f"{Method.title().replace('_', ' ')} {FormatIndianRupees(Mine.get((Month, Method), 0))}" for _, Method in METHOD_COLUMNS if Mine.get((Month, Method)) or Theirs.get((Month, Method)))
        Out.append(f"  {Month}: {FormatIndianRupees(Here)} / {FormatIndianRupees(There)}{'' if Here == There else '  <-- differs by ' + FormatIndianRupees(There - Here)}  ({Methods})")
    TotalMine, TotalTheirs = sum(Mine.values()), sum(Theirs.values())
    Out.append(f"  total: {FormatIndianRupees(TotalMine)} / {FormatIndianRupees(TotalTheirs)}; difference {FormatIndianRupees(TotalTheirs - TotalMine)} = the small extra Razorpay amounts left out ({FormatIndianRupees(Dropped)})")
    if TotalTheirs - TotalMine != Dropped:
        Problems.append(f"Collections differ from the old report by {FormatIndianRupees(TotalTheirs - TotalMine)}, not just the {FormatIndianRupees(Dropped)} left out.")
    return {"invoices": len(Made), "payments": len(Payments), "invoicedPaise": Invoiced, "collectedPaise": Collected, "discountPaise": Discount, "duePaise": Due, "studentsDifferent": len(Different)}
