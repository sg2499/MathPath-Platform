"""Ready for the first month billed on the new platform (Phase 2 part 6,
2026-10-15, Shailesh: "the new platform will start receiving payments from
November").

On 15 Oct live had no monthly fee chosen for India students (so the 1
November drafts would not be made at all) and every student on India
billing, although ten pay the international fee on the old platform. This
puts both right from the old platform's own invoices, and lists what needs a
person to decide. Nothing here commits; the script does.

  * Monthly fees: India = "Monthly Fee", International = "Monthly Fee
    International" (the fee items the old-platform history uses), only where
    none is chosen yet.
  * A student on the default India billing whose latest monthly invoice is
    the international fee is set to International. A mode someone chose by
    hand is never overwritten; one that disagrees is listed.
  * Listed for a decision: active students with no monthly invoice for the
    latest month the old platform billed (they will get a draft next
    month).
Demo accounts are left alone (they are never billed).
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.models import FeeItem, PaymentBillingSettings, PaymentInvoice, PaymentStudentBilling, Student, User
from app.services.payments.audit import WritePaymentAudit

INDIA_NAME = "Monthly Fee"
INTERNATIONAL_NAME = "Monthly Fee International"


@dataclass
class ReadinessResult:
    lines: list[str]
    to_decide: list[str]
    summary: dict[str, Any]


def _MonthlyItem(db: Session, Name: str) -> FeeItem | None:
    from app.services.payments.setup_service import NameKey

    Item = db.query(FeeItem).filter(FeeItem.name_key == NameKey(Name)).first()
    if Item and Item.billing_type == "MONTHLY" and Item.is_active:
        return Item
    return None


def PrepareMonthlyBilling(db: Session) -> ReadinessResult:
    from app.services.demo_students import AllDemoStudentIds
    from app.services.payments.billing_service import EnsureBillingSettings, MODES, PeriodLabel

    Lines: list[str] = []
    Decide: list[str] = []
    Settings: PaymentBillingSettings = EnsureBillingSettings(db)
    db.flush()

    # 1. The two monthly fees.
    India = db.get(FeeItem, Settings.india_fee_item_id) if Settings.india_fee_item_id else None
    International = db.get(FeeItem, Settings.international_fee_item_id) if Settings.international_fee_item_id else None
    SetFees = {}
    if India is None:
        India = _MonthlyItem(db, INDIA_NAME)
        if India is None:
            Decide.append(f"No active monthly fee item named '{INDIA_NAME}': choose the India monthly fee in Payment Settings > Billing.")
        else:
            Settings.india_fee_item_id = India.id
            SetFees["india"] = India.name
    if International is None:
        International = _MonthlyItem(db, INTERNATIONAL_NAME)
        if International is not None and (India is None or International.id != India.id):
            Settings.international_fee_item_id = International.id
            SetFees["international"] = International.name
    Lines.append(
        "Monthly fees: India " + (f"{India.name} {India.amount_paise // 100}" if India else "NOT SET")
        + ", International " + (f"{International.name} {International.amount_paise // 100}" if International else "not set")
        + (f"  (set now: {', '.join(f'{Key} = {Value}' for Key, Value in SetFees.items())})" if SetFees else "  (already chosen)")
    )

    # 2. Billing modes from each student's latest monthly invoice.
    Demo = set(AllDemoStudentIds(db))
    People = {Row.id: (Row, UserRow) for Row, UserRow in db.query(Student, User).join(User, Student.user_id == User.id).all() if Row.id not in Demo}
    Modes = {Row.student_id: Row for Row in db.query(PaymentStudentBilling).all()}
    Latest: dict[str, PaymentInvoice] = {}
    Periods: dict[str, set[str]] = defaultdict(set)
    for Invoice in (
        db.query(PaymentInvoice)
        .filter(PaymentInvoice.billing_type == "MONTHLY", PaymentInvoice.status != "CANCELLED", PaymentInvoice.period_key.isnot(None))
        .all()
    ):
        Periods[Invoice.period_key].add(Invoice.student_id)
        Current = Latest.get(Invoice.student_id)
        if Current is None or (Invoice.period_key, Invoice.invoice_number) > (Current.period_key, Current.invoice_number):
            Latest[Invoice.student_id] = Invoice
    MadeInternational = []
    for StudentId, Invoice in sorted(Latest.items(), key=lambda Item: People.get(Item[0], (None, None))[0].student_code if Item[0] in People else ""):
        if StudentId not in People or International is None:
            continue
        Row, UserRow = People[StudentId]
        # Only students still on the default (no billing row at all) are
        # switched: a mode someone saved, India included, is never changed.
        Chosen = Modes[StudentId].billing_mode if StudentId in Modes else None
        IsInternational = Invoice.fee_item_id == International.id
        IsIndia = India is not None and Invoice.fee_item_id == India.id
        if IsInternational and Chosen is None:
            db.add(PaymentStudentBilling(student_id=StudentId, billing_mode="INTERNATIONAL"))
            MadeInternational.append(f"{Row.student_code} {UserRow.full_name}{'' if Row.is_active else ' (inactive)'}")
        elif IsInternational and Chosen == "INDIA":
            Decide.append(f"{Row.student_code} {UserRow.full_name}: set to India by hand, but their latest monthly invoice ({Invoice.invoice_number}) is the international fee. Check Payment Settings > Billing.")
        elif IsIndia and Chosen == "INTERNATIONAL":
            Decide.append(f"{Row.student_code} {UserRow.full_name}: set to International, but their latest monthly invoice ({Invoice.invoice_number}) is the India fee. Check Payment Settings > Billing.")
    db.flush()
    Lines.append(f"Set to International billing ({len(MadeInternational)}): " + (", ".join(MadeInternational) if MadeInternational else "none needed"))
    Counts: dict[str, int] = defaultdict(int)
    for StudentId, (Row, UserRow) in People.items():
        if Row.is_active and UserRow.is_active:
            Counts[db.query(PaymentStudentBilling.billing_mode).filter(PaymentStudentBilling.student_id == StudentId).scalar() or "INDIA"] += 1
    Lines.append("Active students by billing: " + ", ".join(f"{MODES[Key]} {Value}" for Key, Value in sorted(Counts.items())))

    # 3. Active students the old platform did not bill in its latest month.
    # The latest month the old platform billed broadly (a student who paid a
    # month ahead must not make next month look like the billed month).
    Biggest = max((len(Ids) for Ids in Periods.values()), default=0)
    LatestPeriod = max((Period for Period, Ids in Periods.items() if len(Ids) * 2 >= Biggest), default=None)
    if LatestPeriod:
        Missing = sorted(
            (f"{Row.student_code} {UserRow.full_name}" for StudentId, (Row, UserRow) in People.items() if Row.is_active and UserRow.is_active and StudentId not in Periods[LatestPeriod]),
        )
        if Missing:
            Decide.append(f"Active here but no monthly invoice for {PeriodLabel(LatestPeriod)} ({len(Missing)}); they will get a monthly draft next month unless dropped or set to No monthly fee: " + ", ".join(Missing))

    if SetFees or MadeInternational:
        WritePaymentAudit(db, EntityType="BILLING", EntityId="settings", Action="PREPARE", Actor=None, ActorName="MathPath",
                          After={"fees": SetFees, "international": len(MadeInternational)})
    db.flush()
    return ReadinessResult(Lines, Decide, {"feesSet": SetFees, "madeInternational": len(MadeInternational), "activeByMode": dict(Counts)})
