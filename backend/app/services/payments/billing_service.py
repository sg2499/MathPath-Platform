"""Payments revamp R3 (2026-10-09, Shailesh): monthly billing.

  * Every student has a billing mode: INDIA (the default), INTERNATIONAL, or
    EXEMPT ("No monthly fee": test accounts, staff children, scholarships). EXEMPT
    students never get a monthly draft; one-time invoices still work.
    Payment Settings > Billing says which monthly fee item each mode is
    charged (India ₹1,100, International ₹2,200 in Fee Setup).
  * On the 1st of every month the platform drafts that month's monthly-fee
    invoice for every active student who has none. Drafts have no number,
    are not shown to students and send no notification. If the server was
    down on the 1st, the drafts are made as soon as it is back (a background
    check every 30 minutes, plus whenever Payments Home is opened).
  * The admin reviews the drafts (Invoices > Monthly Billing), drops any
    that should not go out (with a reason) and presses Release. Release
    raises the invoices through the normal invoice generator: invoice date =
    the release date, due date = invoice date + 10 days, numbers, advance
    applied, and the student's bell notification (while the Fees tab is on).
  * One-time items stay manual (Invoices > Generate).

The fee is not stored on a draft: it follows the student's billing mode and
the fee item's price at release, so a price change in Fee Setup is used by
every draft not yet released.

Billing Release 1 (2026-11-26, Shailesh): four tuition rates. Every student
is in a rate group:
  * EXISTING -- admitted before the cut-off (1 Dec 2026): ₹1,100 a month, or
    ₹2,200 International, for good;
  * NEW -- admitted on or after the cut-off: ₹1,200, or ₹2,400 International.
The group follows the admission date. A student with no admission date
follows the day they were added to the platform, so everyone already here on
launch is EXISTING. An admin can set a student's group by hand, with a
reason (kept in the payments audit). Payment Settings > Billing says which
fee item each mode and group is charged, and the cut-off date.
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import (
    CompetitionEventAssignment,
    CompetitionEventSlot,
    FeeItem,
    Level,
    PaymentBillingSettings,
    PaymentCentre,
    PaymentInvoice,
    PaymentInvoiceDraft,
    PaymentStudentBilling,
    Student,
    User,
)
from app.services.payments.audit import WritePaymentAudit
from app.services.payments.money import FormatIndianRupees

MODES = {"INDIA": "India", "INTERNATIONAL": "International", "EXEMPT": "No monthly fee"}
GROUPS = {"EXISTING": "Existing", "NEW": "New"}
GROUP_SOURCES = {"SET_BY_ADMIN": "Set by an admin", "ADMISSION_DATE": "Admission date", "ADDED_ON": "Added to MathPath"}
DEFAULT_NEW_RATE_FROM = "2026-12-01"
# (mode, existing-rate paise, new-rate name, new-rate paise)
NEW_RATE_ITEMS = (
    ("INDIA", 110000, "Monthly Fee New Admission", 120000),
    ("INTERNATIONAL", 220000, "Monthly Fee International New Admission", 240000),
)
EXEMPT_REASON = "Not released: set to No monthly fee in Payment Settings › Billing"
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def _Today() -> date:
    from app.services.payments.invoices_service import TodayInIndia

    return TodayInIndia()


def _Money(Paise: int) -> dict[str, Any]:
    return {"paise": int(Paise), "display": FormatIndianRupees(int(Paise))}


def _Iso(Value: datetime | None) -> str | None:
    if not Value:
        return None
    return (Value if Value.tzinfo else Value.replace(tzinfo=timezone.utc)).isoformat()


def PeriodOf(Day: date) -> str:
    return f"{Day.year:04d}-{Day.month:02d}"


def NextPeriod(Period: str) -> str:
    Year, Month = int(Period[:4]), int(Period[5:])
    return f"{Year + (Month == 12):04d}-{Month % 12 + 1:02d}"


def PeriodLabel(Period: str) -> str:
    return f"{MONTHS[int(Period[5:]) - 1]} {Period[:4]}"


def _ParsePeriod(Value: Any) -> str:
    Text = str(Value or "").strip() or PeriodOf(_Today())
    if not re.fullmatch(r"\d{4}-\d{2}", Text) or not 1 <= int(Text[5:]) <= 12:
        api_error(422, "PERIOD_INVALID", "Choose a month, like 2026-11.")
    if Text < "2020-01" or Text > NextPeriod(PeriodOf(_Today())):
        api_error(422, "PERIOD_INVALID", "Monthly billing can be done up to next month.")
    return Text


def _Clean(Value: Any, Limit: int) -> str | None:
    Text = re.sub(r"\s+", " ", str(Value or "")).strip()
    return Text[:Limit] or None


# ----------------------------------------------------------------------------
# Admission dates and rate groups (billing Release 1)
# ----------------------------------------------------------------------------

def ParseAdmissionDate(Value: Any) -> date | None:
    """A stored or typed admission date: 2026-12-01, 01-12-2026 or
    01/12/2026. None when blank or not a real date."""
    Text = str(Value or "").strip()
    if not Text:
        return None
    for Pattern, Order in ((r"(\d{4})-(\d{1,2})-(\d{1,2})", "YMD"), (r"(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})", "DMY")):
        Found = re.fullmatch(Pattern, Text[:10] if Order == "YMD" else Text)
        if Found:
            A, B, C = (int(Part) for Part in Found.groups())
            Year, Month, Day = (A, B, C) if Order == "YMD" else (C, B, A)
            try:
                return date(Year, Month, Day)
            except ValueError:
                return None
    return None


def NormaliseAdmissionDate(Value: Any) -> str | None:
    """The admission date to store: '' or None clears it; anything else must
    be a real date between 2000 and 60 days from today, kept as YYYY-MM-DD."""
    if Value is None or not str(Value).strip():
        return None
    Parsed = ParseAdmissionDate(Value)
    if Parsed is None:
        api_error(422, "ADMISSION_DATE_INVALID", "The admission date must be a real date, like 2026-12-01.")
    if Parsed < date(2000, 1, 1) or Parsed.toordinal() > _Today().toordinal() + 60:
        api_error(422, "ADMISSION_DATE_INVALID", "The admission date looks wrong. Please check the year.")
    return Parsed.isoformat()


def NewRateFrom(Settings: PaymentBillingSettings | None) -> date:
    return ParseAdmissionDate(getattr(Settings, "new_rate_from", None)) or date.fromisoformat(DEFAULT_NEW_RATE_FROM)


def _DayLabel(Day: date) -> str:
    return f"{Day.day} {MONTHS[Day.month - 1]} {Day.year}"


def _AddedOn(Value: datetime | None) -> date | None:
    if not Value:
        return None
    from app.services.payments.invoices_service import INDIA

    return (Value if Value.tzinfo else Value.replace(tzinfo=timezone.utc)).astimezone(INDIA).date()


def RateGroupsFor(db: Session, StudentIds: list[str] | None = None, Settings: PaymentBillingSettings | None = None) -> dict[str, dict[str, Any]]:
    """Each student's rate group: {"group", "source", "admissionDate"}.

    Set by an admin first; otherwise the admission date against the cut-off;
    with no usable admission date, the day the student was added."""
    if StudentIds is not None and not StudentIds:
        return {}
    Cutoff = NewRateFrom(Settings or EnsureBillingSettings(db))
    Query = db.query(Student.id, Student.admission_date, User.created_at).join(User, Student.user_id == User.id)
    Overrides = db.query(PaymentStudentBilling.student_id, PaymentStudentBilling.rate_group).filter(PaymentStudentBilling.rate_group.isnot(None))
    if StudentIds is not None:
        Query = Query.filter(Student.id.in_(StudentIds))
        Overrides = Overrides.filter(PaymentStudentBilling.student_id.in_(StudentIds))
    SetByAdmin = {StudentId: Group for StudentId, Group in Overrides.all() if Group in GROUPS}
    Result: dict[str, dict[str, Any]] = {}
    for StudentId, Admission, CreatedAt in Query.all():
        Admitted = ParseAdmissionDate(Admission)
        if StudentId in SetByAdmin:
            Group, Source = SetByAdmin[StudentId], "SET_BY_ADMIN"
        elif Admitted:
            Group, Source = ("NEW" if Admitted >= Cutoff else "EXISTING"), "ADMISSION_DATE"
        else:
            Added = _AddedOn(CreatedAt)
            Group, Source = ("NEW" if Added and Added >= Cutoff else "EXISTING"), "ADDED_ON"
        Result[StudentId] = {"group": Group, "source": Source, "admissionDate": Admitted.isoformat() if Admitted else None}
    return Result


def _GroupPayload(Info: dict[str, Any] | None) -> dict[str, Any]:
    Info = Info or {"group": "EXISTING", "source": "ADDED_ON", "admissionDate": None}
    return {
        "rateGroup": Info["group"],
        "rateGroupLabel": GROUPS[Info["group"]],
        "rateGroupSource": Info["source"],
        "rateGroupSourceLabel": GROUP_SOURCES[Info["source"]],
        "admissionDate": Info["admissionDate"],
    }


def SeedNewAdmissionRates(db: Session) -> int:
    """Once, at startup: on a site that bills ₹1,100 (India) or ₹2,200
    (International) a month, add the new-admission monthly fees (₹1,200 /
    ₹2,400) in Fee Setup and choose them for new students in Billing. The
    cut-off is set to 1 Dec 2026 if it is empty. Nothing is billed by this:
    monthly drafts still wait for the India fee to be chosen."""
    Settings = db.get(PaymentBillingSettings, "default")
    if not Settings:
        return 0
    if not Settings.new_rate_from:
        Settings.new_rate_from = DEFAULT_NEW_RATE_FROM
    if Settings.new_rates_seeded:
        db.flush()
        return 0
    from app.services.payments.setup_service import DEFAULT_GST_RATE_BPS, NameKey

    Made = 0
    Columns = {"INDIA": "india_new_fee_item_id", "INTERNATIONAL": "international_new_fee_item_id"}
    for Mode, OldPaise, Name, NewPaise in NEW_RATE_ITEMS:
        Monthly = db.query(FeeItem).filter(FeeItem.billing_type == "MONTHLY", FeeItem.is_active == True).all()  # noqa: E712
        Intl = [Row for Row in Monthly if re.search(r"international|intl", Row.name, re.I)]
        Pool = Intl if Mode == "INTERNATIONAL" else [Row for Row in Monthly if Row not in Intl]
        Old = next((Row for Row in Pool if Row.amount_paise == OldPaise), None)
        if not Old:
            continue
        Item = db.query(FeeItem).filter(FeeItem.name_key == NameKey(Name)).first()
        if not Item:
            LastOrder = db.query(FeeItem.display_order).order_by(FeeItem.display_order.desc()).first()
            Item = FeeItem(
                name=Name,
                name_key=NameKey(Name),
                description=None,
                amount_paise=NewPaise,
                gst_included=bool(Old.gst_included),
                gst_rate_bps=Old.gst_rate_bps or DEFAULT_GST_RATE_BPS,
                billing_type="MONTHLY",
                display_order=(LastOrder[0] + 1) if LastOrder else 1,
                is_active=True,
            )
            db.add(Item)
            db.flush()
            WritePaymentAudit(db, EntityType="FEE_ITEM", EntityId=Item.id, Action="CREATE", Actor=None, ActorName="MathPath",
                              After={"name": Item.name, "amountPaise": Item.amount_paise, "billingType": "MONTHLY"},
                              Reason=f"Monthly fee for students admitted from {_DayLabel(NewRateFrom(Settings))}")
            Made += 1
        if Item.billing_type == "MONTHLY" and not getattr(Settings, Columns[Mode]):
            setattr(Settings, Columns[Mode], Item.id)
    Settings.new_rates_seeded = True
    db.flush()
    return Made


# ----------------------------------------------------------------------------
# Settings and billing modes
# ----------------------------------------------------------------------------

def _GuessFeeItems(db: Session) -> tuple[str | None, str | None]:
    """First-time suggestion: the monthly fee item named International (or
    Intl) for International, and the other monthly fee item for India."""
    Monthly = db.query(FeeItem).filter(FeeItem.billing_type == "MONTHLY", FeeItem.is_active == True).all()  # noqa: E712
    Intl = [Row for Row in Monthly if re.search(r"international|intl", Row.name, re.I)]
    Rest = [Row for Row in Monthly if Row not in Intl]
    India = Rest[0] if len(Rest) == 1 else next((Row for Row in Rest if Row.amount_paise == 110000), None)
    return (India.id if India else None), (Intl[0].id if len(Intl) == 1 else None)


def EnsureBillingSettings(db: Session) -> PaymentBillingSettings:
    Row = db.get(PaymentBillingSettings, "default")
    if Row:
        return Row
    India, Intl = _GuessFeeItems(db)
    Row = PaymentBillingSettings(
        id="default",
        india_fee_item_id=India,
        international_fee_item_id=Intl,
        # Shailesh, 9 Oct: automatic drafts on. The first automatic month is
        # next month, so a month already billed is never drafted again.
        auto_drafts_enabled=True,
        auto_from_period=NextPeriod(PeriodOf(_Today())),
        modes_prefilled=False,
        new_rate_from=DEFAULT_NEW_RATE_FROM,
    )
    db.add(Row)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        return db.get(PaymentBillingSettings, "default")
    _PrefillModes(db, Row)
    return Row


def _PrefillModes(db: Session, Settings: PaymentBillingSettings) -> None:
    """Once: students whose Annual Competition slot is online international
    start as INTERNATIONAL (for the admin to check)."""
    if Settings.modes_prefilled:
        return
    Ids = {
        StudentId
        for (StudentId,) in db.query(CompetitionEventAssignment.student_id)
        .join(CompetitionEventSlot, CompetitionEventAssignment.slot_id == CompetitionEventSlot.id)
        .filter(CompetitionEventAssignment.is_active == True, CompetitionEventSlot.mode == "ONLINE_INTL")  # noqa: E712
        .all()
    }
    Existing = {Row.student_id for Row in db.query(PaymentStudentBilling).filter(PaymentStudentBilling.student_id.in_(Ids)).all()} if Ids else set()
    for StudentId in sorted(Ids - Existing):
        db.add(PaymentStudentBilling(student_id=StudentId, billing_mode="INTERNATIONAL"))
    Settings.modes_prefilled = True
    if Ids - Existing:
        WritePaymentAudit(db, EntityType="BILLING", EntityId="modes", Action="PREFILL", Actor=None, ActorName="MathPath",
                          After={"international": len(Ids - Existing)}, Reason="Students in an online international Annual Competition slot")


def ModesFor(db: Session, StudentIds: list[str] | None = None) -> dict[str, str]:
    Query = db.query(PaymentStudentBilling)
    if StudentIds is not None:
        if not StudentIds:
            return {}
        Query = Query.filter(PaymentStudentBilling.student_id.in_(StudentIds))
    return {Row.student_id: Row.billing_mode for Row in Query.all()}


FEE_COLUMNS = {
    ("INDIA", "EXISTING"): "india_fee_item_id",
    ("INDIA", "NEW"): "india_new_fee_item_id",
    ("INTERNATIONAL", "EXISTING"): "international_fee_item_id",
    ("INTERNATIONAL", "NEW"): "international_new_fee_item_id",
}
FEE_KEYS = {
    "indiaFeeItemId": ("INDIA", "EXISTING"),
    "indiaNewFeeItemId": ("INDIA", "NEW"),
    "internationalFeeItemId": ("INTERNATIONAL", "EXISTING"),
    "internationalNewFeeItemId": ("INTERNATIONAL", "NEW"),
}


def _FeeItems(db: Session, Settings: PaymentBillingSettings) -> dict[tuple[str, str], FeeItem | None]:
    """The monthly fee item for each billing mode and rate group."""
    Result: dict[tuple[str, str], FeeItem | None] = {}
    for Key, Column in FEE_COLUMNS.items():
        ItemId = getattr(Settings, Column, None)
        Result[Key] = db.get(FeeItem, ItemId) if ItemId else None
    return Result


def _FeeFor(Fees: dict[tuple[str, str], FeeItem | None], Mode: str, Group: str) -> FeeItem | None:
    return Fees.get((Mode, Group)) if Mode in ("INDIA", "INTERNATIONAL") else None


def _RateLabel(Mode: str, Group: str) -> str:
    return f"{'new ' if Group == 'NEW' else ''}{MODES[Mode]}"


def _FeePayload(Item: FeeItem | None) -> dict[str, Any] | None:
    if not Item:
        return None
    return {"feeItemId": Item.id, "name": Item.name, "isActive": bool(Item.is_active), **_Money(Item.amount_paise)}


def _ActiveStudents(db: Session) -> list[tuple[Student, User]]:
    # Demo accounts are never billed (app/services/demo_students.py): no
    # monthly drafts, and not listed as "not billed".
    from app.services.demo_students import RealStudents

    return (
        RealStudents(db.query(Student, User))
        .join(User, Student.user_id == User.id)
        .filter(Student.is_active == True, User.is_active == True)  # noqa: E712
        .order_by(User.full_name.asc(), Student.student_code.asc())
        .all()
    )


def _Problems(db: Session, Settings: PaymentBillingSettings, Fees: dict[tuple[str, str], FeeItem | None], Counts: dict[tuple[str, str], int]) -> list[str]:
    """What stops the month being billed. Counts: active students per
    (mode, group). The India fee for existing students is always needed (it
    switches the automatic drafts on); the others only when someone pays it."""
    Problems = []
    Cutoff = _DayLabel(NewRateFrom(Settings))
    for Mode, Group in FEE_COLUMNS:
        Count = Counts.get((Mode, Group), 0)
        Fee = Fees.get((Mode, Group))
        Who = f"{Count} student{'s' if Count != 1 else ''}"
        if Group == "EXISTING" and Mode == "INDIA":
            if not Fee:
                Problems.append("Choose the monthly fee for India students.")
            elif not Fee.is_active:
                Problems.append(f"{Fee.name} (India) is switched off in Fee Setup.")
            continue
        if not Count:
            continue
        Label = "International students" if Group == "EXISTING" else f"new {MODES[Mode]} students, admitted from {Cutoff}"
        if not Fee:
            Problems.append(f"Choose the monthly fee for {Label} ({Who}).")
        elif not Fee.is_active:
            Problems.append(f"{Fee.name} ({_RateLabel(Mode, Group)}) is switched off in Fee Setup.")
    return Problems


def _ActiveCounts(db: Session, Settings: PaymentBillingSettings, ActiveIds: list[str]) -> tuple[dict[str, str], dict[str, dict[str, Any]], dict[tuple[str, str], int]]:
    Modes = ModesFor(db, ActiveIds)
    Groups = RateGroupsFor(db, ActiveIds, Settings)
    Counts: dict[tuple[str, str], int] = defaultdict(int)
    for StudentId in ActiveIds:
        Mode = Modes.get(StudentId, "INDIA")
        if Mode != "EXEMPT":
            Counts[(Mode, Groups.get(StudentId, {}).get("group", "EXISTING"))] += 1
    return Modes, Groups, Counts


def _NextAutoPeriod(Settings: PaymentBillingSettings) -> str:
    """The next month automatic drafts will be made for."""
    Current = PeriodOf(_Today())
    Candidate = NextPeriod(Current) if Settings.last_auto_period == Current else Current
    return max(Candidate, Settings.auto_from_period or Candidate)


def BillingSettings(db: Session) -> dict[str, Any]:
    Settings = EnsureBillingSettings(db)
    Fees = _FeeItems(db, Settings)
    Active = _ActiveStudents(db)
    Modes, _, GroupCounts = _ActiveCounts(db, Settings, [Row.id for Row, _ in Active])
    Counts = {"INDIA": 0, "INTERNATIONAL": 0, "EXEMPT": 0}
    for Row, _ in Active:
        Counts[Modes.get(Row.id, "INDIA")] += 1
    Monthly = db.query(FeeItem).filter(FeeItem.billing_type == "MONTHLY").order_by(FeeItem.display_order.asc(), FeeItem.name.asc()).all()
    Cutoff = NewRateFrom(Settings)
    return {
        "indiaFee": _FeePayload(Fees[("INDIA", "EXISTING")]),
        "internationalFee": _FeePayload(Fees[("INTERNATIONAL", "EXISTING")]),
        "indiaNewFee": _FeePayload(Fees[("INDIA", "NEW")]),
        "internationalNewFee": _FeePayload(Fees[("INTERNATIONAL", "NEW")]),
        "newRateFrom": Cutoff.isoformat(),
        "newRateFromLabel": _DayLabel(Cutoff),
        "groupCounts": {Mode: {Group: GroupCounts.get((Mode, Group), 0) for Group in GROUPS} for Mode in ("INDIA", "INTERNATIONAL")},
        "autoDraftsEnabled": bool(Settings.auto_drafts_enabled),
        "autoFromPeriod": Settings.auto_from_period,
        "autoFromLabel": PeriodLabel(Settings.auto_from_period) if Settings.auto_from_period else None,
        "nextAutoLabel": PeriodLabel(_NextAutoPeriod(Settings)) if Settings.auto_drafts_enabled else None,
        "lastAutoPeriod": Settings.last_auto_period,
        "lastAutoLabel": PeriodLabel(Settings.last_auto_period) if Settings.last_auto_period else None,
        "lastAutoAt": _Iso(Settings.last_auto_at),
        "monthlyFeeItems": [_FeePayload(Row) for Row in Monthly],
        "counts": Counts,
        "problems": _Problems(db, Settings, Fees, GroupCounts),
    }


def UpdateBillingSettings(db: Session, *, Request: dict[str, Any], Actor: User | None) -> dict[str, Any]:
    Settings = db.query(PaymentBillingSettings).filter(PaymentBillingSettings.id == "default").with_for_update().first() or EnsureBillingSettings(db)

    def _Shape() -> dict[str, Any]:
        return {**{Key: getattr(Settings, FEE_COLUMNS[Pair]) for Key, Pair in FEE_KEYS.items()}, "newRateFrom": NewRateFrom(Settings).isoformat(), "autoDraftsEnabled": Settings.auto_drafts_enabled}

    Before = _Shape()
    for Key, Pair in FEE_KEYS.items():
        Column = FEE_COLUMNS[Pair]
        if Key not in Request:
            continue
        Value = str(Request.get(Key) or "").strip() or None
        if Value:
            Item = db.get(FeeItem, Value)
            if not Item:
                api_error(404, "FEE_ITEM_NOT_FOUND", "That fee item was not found. Refresh and try again.")
            if Item.billing_type != "MONTHLY":
                api_error(422, "FEE_ITEM_NOT_MONTHLY", f"{Item.name} is a one-time item. Choose a monthly fee.")
            if not Item.is_active:
                api_error(422, "FEE_ITEM_INACTIVE", f"{Item.name} is switched off. Switch it on in Fee Setup first.")
        setattr(Settings, Column, Value)
    IndiaItems = {Settings.india_fee_item_id, Settings.india_new_fee_item_id} - {None}
    if IndiaItems & ({Settings.international_fee_item_id, Settings.international_new_fee_item_id} - {None}):
        api_error(422, "SAME_FEE_FOR_BOTH", "India and International need different monthly fee items.")
    if "newRateFrom" in Request:
        Cutoff = ParseAdmissionDate(Request.get("newRateFrom"))
        if Cutoff is None or not date(2020, 1, 1) <= Cutoff <= date(2100, 12, 31):
            api_error(422, "NEW_RATE_FROM_INVALID", "Choose the first admission date that pays the new fee, like 2026-12-01.")
        Settings.new_rate_from = Cutoff.isoformat()
    if "autoDraftsEnabled" in Request:
        Enabled = bool(Request.get("autoDraftsEnabled"))
        if Enabled and not Settings.auto_drafts_enabled:
            # Switched (back) on: start from next month.
            Settings.auto_from_period = NextPeriod(PeriodOf(_Today()))
        Settings.auto_drafts_enabled = Enabled
    Settings.updated_by_user_id = Actor.id if Actor else None
    WritePaymentAudit(db, EntityType="BILLING", EntityId="settings", Action="UPDATE", Actor=Actor, Before=Before, After=_Shape())
    db.commit()
    return BillingSettings(db)


def ListStudentModes(db: Session) -> list[dict[str, Any]]:
    EnsureBillingSettings(db)
    from app.services.demo_students import RealStudents

    Rows = RealStudents(db.query(Student, User)).join(User, Student.user_id == User.id).order_by(User.full_name.asc()).all()
    Modes = ModesFor(db)
    Groups = RateGroupsFor(db)
    Levels = {Row.id: Row.level_code for Row in db.query(Level).all()}
    Centres = {Row.id: Row.name for Row in db.query(PaymentCentre).all()}
    return [
        {
            "studentId": Row.id,
            "studentName": UserRow.full_name,
            "studentCode": Row.student_code,
            "levelCode": Levels.get(Row.current_level_id),
            "centreName": Centres.get(Row.centre_id) if Row.centre_id else None,
            "isActive": bool(Row.is_active and UserRow.is_active),
            "billingMode": Modes.get(Row.id, "INDIA"),
            **_GroupPayload(Groups.get(Row.id)),
        }
        for Row, UserRow in Rows
    ]


def SetStudentModes(db: Session, *, StudentIds: list[str], Mode: Any, Actor: User | None) -> dict[str, Any]:
    ModeText = str(Mode or "").upper()
    if ModeText not in MODES:
        api_error(422, "MODE_INVALID", "Choose India, International or No monthly fee.")
    Ids = [Id for Id in dict.fromkeys(str(Id).strip() for Id in StudentIds or []) if Id]
    if not Ids:
        api_error(422, "NO_STUDENTS_SELECTED", "Choose at least one student.")
    if len(Ids) > 2000:
        api_error(422, "TOO_MANY_STUDENTS", "Choose at most 2,000 students at a time.")
    Found = {Row.id for Row in db.query(Student.id).filter(Student.id.in_(Ids)).all()}
    if len(Found) != len(Ids):
        api_error(404, "STUDENT_NOT_FOUND", "Some of the chosen students were not found. Refresh and try again.")
    Existing = {Row.student_id: Row for Row in db.query(PaymentStudentBilling).filter(PaymentStudentBilling.student_id.in_(Ids)).all()}
    Changed = 0
    for StudentId in Ids:
        Row = Existing.get(StudentId)
        if Row:
            if Row.billing_mode != ModeText:
                Row.billing_mode = ModeText
                Row.updated_by_user_id = Actor.id if Actor else None
                Changed += 1
        else:
            db.add(PaymentStudentBilling(student_id=StudentId, billing_mode=ModeText, updated_by_user_id=Actor.id if Actor else None))
            Changed += ModeText != "INDIA"
    WritePaymentAudit(db, EntityType="BILLING", EntityId="modes", Action="SET_MODE", Actor=Actor, After={"mode": ModeText, "students": len(Ids), "changed": Changed})
    db.commit()
    return {"studentsSelected": len(Ids), "studentsChanged": Changed, "mode": ModeText, "modeLabel": MODES[ModeText]}


def SetStudentRateGroups(db: Session, *, StudentIds: list[str], Group: Any, Reason: Any, Actor: User | None) -> dict[str, Any]:
    """Set the rate group by hand (EXISTING or NEW), or AUTO to follow the
    admission date again. A reason is always needed; it goes in the payments
    audit with the students' groups before and after."""
    GroupText = str(Group or "").strip().upper()
    if GroupText not in (*GROUPS, "AUTO"):
        api_error(422, "RATE_GROUP_INVALID", "Choose Existing, New, or Follow Admission Date.")
    ReasonText = _Clean(Reason, 300)
    if not ReasonText:
        api_error(422, "REASON_REQUIRED", "Say why the fee group is being changed.")
    Ids = [Id for Id in dict.fromkeys(str(Id).strip() for Id in StudentIds or []) if Id]
    if not Ids:
        api_error(422, "NO_STUDENTS_SELECTED", "Choose at least one student.")
    if len(Ids) > 2000:
        api_error(422, "TOO_MANY_STUDENTS", "Choose at most 2,000 students at a time.")
    Found = {Row.id for Row in db.query(Student.id).filter(Student.id.in_(Ids)).all()}
    if len(Found) != len(Ids):
        api_error(404, "STUDENT_NOT_FOUND", "Some of the chosen students were not found. Refresh and try again.")
    Settings = EnsureBillingSettings(db)
    Before = RateGroupsFor(db, Ids, Settings)
    Existing = {Row.student_id: Row for Row in db.query(PaymentStudentBilling).filter(PaymentStudentBilling.student_id.in_(Ids)).all()}
    Target = None if GroupText == "AUTO" else GroupText
    for StudentId in Ids:
        Row = Existing.get(StudentId)
        if Row:
            if Row.rate_group != Target:
                Row.rate_group = Target
                Row.updated_by_user_id = Actor.id if Actor else None
        elif Target:
            db.add(PaymentStudentBilling(student_id=StudentId, billing_mode="INDIA", rate_group=Target, updated_by_user_id=Actor.id if Actor else None))
    db.flush()
    After = RateGroupsFor(db, Ids, Settings)
    Changed = [Id for Id in Ids if Before[Id]["group"] != After[Id]["group"]]
    Codes = {Row.id: Row.student_code for Row in db.query(Student).filter(Student.id.in_(Changed)).all()} if Changed else {}
    WritePaymentAudit(
        db, EntityType="BILLING", EntityId="rate-groups", Action="SET_RATE_GROUP", Actor=Actor, Reason=ReasonText,
        Before={"students": len(Ids)},
        After={"group": GroupText, "students": len(Ids), "changed": len(Changed),
               "changes": [{"studentCode": Codes.get(Id), "from": Before[Id]["group"], "to": After[Id]["group"]} for Id in Changed[:200]]},
    )
    db.commit()
    Label = "Follow Admission Date" if GroupText == "AUTO" else GROUPS[GroupText]
    return {"studentsSelected": len(Ids), "studentsChanged": len(Changed), "group": GroupText, "groupLabel": Label}


# ----------------------------------------------------------------------------
# A month's billing
# ----------------------------------------------------------------------------

def _LiveMonthly(db: Session, Period: str, StudentIds: list[str] | None = None) -> dict[str, PaymentInvoice]:
    Query = db.query(PaymentInvoice).filter(PaymentInvoice.billing_type == "MONTHLY", PaymentInvoice.period_key == Period, PaymentInvoice.status != "CANCELLED")
    if StudentIds is not None:
        Query = Query.filter(PaymentInvoice.student_id.in_(StudentIds))
    Result: dict[str, PaymentInvoice] = {}
    for Row in Query.order_by(PaymentInvoice.invoice_number.asc()).all():
        Result.setdefault(Row.student_id, Row)
    return Result


def MonthBilling(db: Session, PeriodValue: Any = None) -> dict[str, Any]:
    from app.services.payments.invoices_service import _InvoiceNumbering
    from app.services.payments.receipts_service import AdvanceBalances

    Period = _ParsePeriod(PeriodValue)
    Settings = EnsureBillingSettings(db)
    Fees = _FeeItems(db, Settings)
    Active = _ActiveStudents(db)
    ActiveIds = {Row.id for Row, _ in Active}
    Drafts = db.query(PaymentInvoiceDraft).filter(PaymentInvoiceDraft.period_key == Period).all()
    DraftIds = {Row.student_id for Row in Drafts}
    People = {Row.id: (Row, UserRow) for Row, UserRow in db.query(Student, User).join(User, Student.user_id == User.id).filter(Student.id.in_(list(DraftIds | ActiveIds))).all()} if (DraftIds or ActiveIds) else {}
    Modes = ModesFor(db, list(People))
    Groups = RateGroupsFor(db, list(People), Settings)
    Invoiced = _LiveMonthly(db, Period, list(People))
    Levels = {Row.id: Row.level_code for Row in db.query(Level).all()}
    Centres = {Row.id: Row.name for Row in db.query(PaymentCentre).all()}
    Waiting = [Row for Row in Drafts if Row.status == "DRAFT"]
    Advances = AdvanceBalances(db, sorted({Row.student_id for Row in Waiting}))
    UserNames = {Row.id: Row.full_name for Row in db.query(User).filter(User.id.in_({Id for Row in Drafts for Id in (Row.released_by_user_id, Row.dropped_by_user_id) if Id})).all()} if Drafts else {}

    def _Student(StudentId: str) -> dict[str, Any]:
        Row, UserRow = People[StudentId]
        Mode = Modes.get(StudentId, "INDIA")
        Group = Groups.get(StudentId)
        Fee = _FeeFor(Fees, Mode, (Group or {}).get("group", "EXISTING"))
        return {
            "studentId": StudentId,
            "studentName": UserRow.full_name,
            "studentCode": Row.student_code,
            "levelCode": Levels.get(Row.current_level_id),
            "centreName": Centres.get(Row.centre_id) if Row.centre_id else None,
            "isActive": StudentId in ActiveIds,
            "billingMode": Mode,
            "billingModeLabel": MODES[Mode],
            **_GroupPayload(Group),
            "fee": _FeePayload(Fee),
        }

    Rows = []
    for Draft in sorted(Drafts, key=lambda Item: ((People[Item.student_id][1].full_name or "").lower() if Item.student_id in People else "", Item.student_id)):
        if Draft.student_id not in People:
            continue
        Base = _Student(Draft.student_id)
        Issue = None
        if Draft.status == "DRAFT":
            if Draft.student_id in Invoiced:
                Issue = f"Already has {Invoiced[Draft.student_id].fee_name} for {PeriodLabel(Period)} ({Invoiced[Draft.student_id].invoice_number})"
            elif not Base["isActive"]:
                Issue = "Student is inactive"
            elif Base["billingMode"] == "EXEMPT":
                Issue = "Set to No monthly fee in Payment Settings › Billing"
            elif not Base["fee"]:
                Issue = f"No monthly fee chosen for {_RateLabel(Base['billingMode'], Base['rateGroup'])} students"
        Advance = Advances.get(Draft.student_id, 0) if Draft.status == "DRAFT" else 0
        Amount = Base["fee"]["paise"] if Base["fee"] else 0
        Released = db.get(PaymentInvoice, Draft.released_invoice_id) if Draft.released_invoice_id else None
        Rows.append({
            **Base,
            "draftId": Draft.id,
            "status": Draft.status,
            "source": Draft.source,
            "issue": Issue,
            "advanceToApply": _Money(min(Advance, Amount)),
            "dueAfterAdvance": _Money(max(0, Amount - Advance)),
            "releasedInvoiceId": Draft.released_invoice_id,
            "releasedInvoiceNumber": Released.invoice_number if Released else None,
            "releasedAt": _Iso(Draft.released_at),
            "releasedByName": UserNames.get(Draft.released_by_user_id or ""),
            "dropReason": Draft.drop_reason,
            "droppedAt": _Iso(Draft.dropped_at),
            "droppedByName": UserNames.get(Draft.dropped_by_user_id or ""),
            "createdAt": _Iso(Draft.created_at),
        })
    Exempt = {Id for Id in ActiveIds if Modes.get(Id, "INDIA") == "EXEMPT"}
    ByName = lambda Id: ((People[Id][1].full_name or "").lower(), Id)  # noqa: E731
    NotBilled = [_Student(StudentId) for StudentId in sorted(ActiveIds - DraftIds - set(Invoiced) - Exempt, key=ByName)]
    NeverBilled = [_Student(StudentId) for StudentId in sorted(Exempt - set(Invoiced) - DraftIds, key=ByName)]
    Ready = [Row for Row in Rows if Row["status"] == "DRAFT" and not Row["issue"]]
    GroupCounts: dict[tuple[str, str], int] = defaultdict(int)
    for Id in ActiveIds:
        if Modes.get(Id, "INDIA") != "EXEMPT":
            GroupCounts[(Modes.get(Id, "INDIA"), Groups.get(Id, {}).get("group", "EXISTING"))] += 1
    Problems = _Problems(db, Settings, Fees, GroupCounts)
    Numbering = _InvoiceNumbering(db)
    if not Numbering["numberingReady"]:
        Problems.append("Set the starting invoice number (Payment Settings › Document Numbering) before releasing.")
    Today = _Today()
    return {
        "period": Period,
        "periodLabel": PeriodLabel(Period),
        "isCurrent": Period == PeriodOf(Today),
        "previousPeriod": f"{int(Period[:4]) - (Period[5:] == '01'):04d}-{(int(Period[5:]) - 2) % 12 + 1:02d}",
        "nextPeriod": NextPeriod(Period) if Period < NextPeriod(PeriodOf(Today)) else None,
        "invoiceDate": Today.isoformat(),
        "dueDate": date.fromordinal(Today.toordinal() + 10).isoformat(),
        "settings": {
            "indiaFee": _FeePayload(Fees[("INDIA", "EXISTING")]),
            "internationalFee": _FeePayload(Fees[("INTERNATIONAL", "EXISTING")]),
            "indiaNewFee": _FeePayload(Fees[("INDIA", "NEW")]),
            "internationalNewFee": _FeePayload(Fees[("INTERNATIONAL", "NEW")]),
            "newRateFromLabel": _DayLabel(NewRateFrom(Settings)),
            "autoDraftsEnabled": bool(Settings.auto_drafts_enabled),
            "autoFromLabel": PeriodLabel(Settings.auto_from_period) if Settings.auto_from_period else None,
        },
        "problems": Problems,
        "counts": {
            "waiting": sum(1 for Row in Rows if Row["status"] == "DRAFT"),
            "ready": len(Ready),
            "withIssue": sum(1 for Row in Rows if Row["status"] == "DRAFT" and Row["issue"]),
            "released": sum(1 for Row in Rows if Row["status"] == "RELEASED"),
            "dropped": sum(1 for Row in Rows if Row["status"] == "DROPPED"),
            "invoiced": len(Invoiced),
            "notBilled": len(NotBilled),
            "exempt": len(NeverBilled),
            "activeStudents": len(ActiveIds),
        },
        "readyTotal": _Money(sum(Row["fee"]["paise"] for Row in Ready)),
        "readyAdvance": _Money(sum(Row["advanceToApply"]["paise"] for Row in Ready)),
        "drafts": Rows,
        "notBilled": NotBilled,
        "exempt": NeverBilled,
    }


def _LockSettings(db: Session) -> PaymentBillingSettings:
    EnsureBillingSettings(db)
    return db.query(PaymentBillingSettings).filter(PaymentBillingSettings.id == "default").with_for_update().one()


def _CreateDrafts(db: Session, Period: str, StudentIds: list[str] | None, Source: str, Actor: User | None) -> int:
    """Drafts for active students with no draft and no live monthly invoice
    for the month. Caller holds the settings lock and commits."""
    Active = {Row.id for Row, _ in _ActiveStudents(db)}
    if Source == "AUTO":
        # The automatic run on the 1st never drafts demo accounts, whatever
        # the switch says (app/services/demo_students.py).
        from app.services.demo_students import AllDemoStudentIds

        Active -= AllDemoStudentIds(db)
    Targets = Active if StudentIds is None else (Active & set(StudentIds))
    Targets -= {Id for Id, Mode in ModesFor(db, sorted(Targets)).items() if Mode == "EXEMPT"}
    if not Targets:
        return 0
    Have = {Row.student_id for Row in db.query(PaymentInvoiceDraft.student_id).filter(PaymentInvoiceDraft.period_key == Period).all()}
    Invoiced = set(_LiveMonthly(db, Period, sorted(Targets)))
    Made = 0
    for StudentId in sorted(Targets - Have - Invoiced):
        db.add(PaymentInvoiceDraft(
            student_id=StudentId, billing_month=int(Period[5:]), billing_year=int(Period[:4]), period_key=Period,
            status="DRAFT", source=Source, created_by_user_id=Actor.id if Actor else None,
        ))
        Made += 1
    db.flush()
    return Made


def CreateDrafts(db: Session, *, PeriodValue: Any, StudentIds: list[str] | None, Actor: User | None) -> dict[str, Any]:
    Period = _ParsePeriod(PeriodValue)
    _LockSettings(db)
    Made = _CreateDrafts(db, Period, [str(Id) for Id in StudentIds] if StudentIds else None, "ADMIN", Actor)
    if Made:
        WritePaymentAudit(db, EntityType="BILLING", EntityId=Period, Action="DRAFT", Actor=Actor, After={"drafts": Made})
    db.commit()
    return {"draftsCreated": Made, "month": MonthBilling(db, Period)}


def EnsureMonthlyDrafts(db: Session) -> int:
    """The automatic run: this month's drafts, once, from the first allowed
    month. Safe to call any number of times, from any number of workers."""
    Settings = EnsureBillingSettings(db)
    db.commit()
    Period = PeriodOf(_Today())
    if not Settings.auto_drafts_enabled or not Settings.india_fee_item_id or Settings.last_auto_period == Period:
        return 0
    if Settings.auto_from_period and Period < Settings.auto_from_period:
        return 0
    Settings = _LockSettings(db)
    if not Settings.auto_drafts_enabled or Settings.last_auto_period == Period:
        db.rollback()
        return 0
    Made = _CreateDrafts(db, Period, None, "AUTO", None)
    Settings.last_auto_period = Period
    Settings.last_auto_at = datetime.now(timezone.utc)
    WritePaymentAudit(db, EntityType="BILLING", EntityId=Period, Action="AUTO_DRAFT", Actor=None, ActorName="MathPath", After={"drafts": Made})
    db.commit()
    return Made


def _LockDraft(db: Session, DraftId: str) -> PaymentInvoiceDraft:
    Row = db.query(PaymentInvoiceDraft).filter(PaymentInvoiceDraft.id == DraftId).with_for_update().first()
    if not Row:
        api_error(404, "DRAFT_NOT_FOUND", "That draft was not found. Refresh and try again.")
    return Row


def DropDraft(db: Session, *, DraftId: str, Reason: Any, Actor: User | None) -> dict[str, Any]:
    ReasonText = _Clean(Reason, 300)
    if not ReasonText:
        api_error(422, "REASON_REQUIRED", "Say why this student should not be billed this month.")
    Row = _LockDraft(db, DraftId)
    if Row.status != "DRAFT":
        api_error(409, "DRAFT_NOT_WAITING", "Only a draft waiting to be released can be dropped.")
    Row.status = "DROPPED"
    Row.drop_reason = ReasonText
    Row.dropped_at = datetime.now(timezone.utc)
    Row.dropped_by_user_id = Actor.id if Actor else None
    WritePaymentAudit(db, EntityType="INVOICE_DRAFT", EntityId=Row.id, Action="DROP", Actor=Actor, Reason=ReasonText, After={"studentId": Row.student_id, "period": Row.period_key})
    db.commit()
    return MonthBilling(db, Row.period_key)


def RestoreDraft(db: Session, *, DraftId: str, Actor: User | None) -> dict[str, Any]:
    Row = _LockDraft(db, DraftId)
    if Row.status != "DROPPED":
        api_error(409, "DRAFT_NOT_DROPPED", "Only a dropped draft can be put back.")
    Row.status = "DRAFT"
    WritePaymentAudit(db, EntityType="INVOICE_DRAFT", EntityId=Row.id, Action="RESTORE", Actor=Actor, Before={"dropReason": Row.drop_reason}, After={"studentId": Row.student_id, "period": Row.period_key})
    Row.drop_reason = None
    Row.dropped_at = None
    Row.dropped_by_user_id = None
    db.commit()
    return MonthBilling(db, Row.period_key)


def ReleaseDrafts(db: Session, *, PeriodValue: Any, DraftIds: list[str], IdempotencyKey: str, Actor: User | None) -> dict[str, Any]:
    from app.services.payments.invoices_service import GenerateInvoices, PreviewInvoices

    Period = _ParsePeriod(PeriodValue)
    Ids = [Id for Id in dict.fromkeys(str(Id).strip() for Id in DraftIds or []) if Id]
    if not Ids:
        api_error(422, "NO_DRAFTS_SELECTED", "Choose at least one draft to release.")
    if len(Ids) > 1000:
        api_error(422, "TOO_MANY_DRAFTS", "Release at most 1,000 drafts at a time.")
    Settings = EnsureBillingSettings(db)
    db.commit()
    Drafts = db.query(PaymentInvoiceDraft).filter(PaymentInvoiceDraft.id.in_(Ids), PaymentInvoiceDraft.period_key == Period).order_by(PaymentInvoiceDraft.id).with_for_update().all()
    Waiting = [Row for Row in Drafts if Row.status == "DRAFT"]
    if not Waiting:
        db.rollback()
        # A double press: the first press released them.
        if Drafts and all(Row.status == "RELEASED" for Row in Drafts):
            return {"released": len(Drafts), "notReleased": [], "replayed": True, "month": MonthBilling(db, Period)}
        api_error(409, "NOTHING_TO_RELEASE", "None of the chosen drafts are waiting to be released. Refresh to see the latest.")
    Fees = _FeeItems(db, Settings)
    Modes = ModesFor(db, [Row.student_id for Row in Waiting])
    Groups = RateGroupsFor(db, [Row.student_id for Row in Waiting], Settings)
    Now = datetime.now(timezone.utc)
    # A draft made before the student was set to No monthly fee is closed, never raised.
    ExemptDrafts = [Row for Row in Waiting if Modes.get(Row.student_id) == "EXEMPT"]
    for Row in ExemptDrafts:
        Row.status = "DROPPED"
        Row.drop_reason = EXEMPT_REASON
        Row.dropped_at = Now
        Row.dropped_by_user_id = Actor.id if Actor else None
    Waiting = [Row for Row in Waiting if Modes.get(Row.student_id) != "EXEMPT"]
    if not Waiting:
        db.commit()
        return {"released": 0, "notReleased": [], "replayed": False, "batch": None, "month": MonthBilling(db, Period)}
    StudentFeeItems: dict[str, str] = {}
    Missing: dict[str, int] = defaultdict(int)
    for Row in Waiting:
        Mode = Modes.get(Row.student_id, "INDIA")
        Group = Groups.get(Row.student_id, {}).get("group", "EXISTING")
        Fee = _FeeFor(Fees, Mode, Group)
        if not Fee or not Fee.is_active:
            Missing[_RateLabel(Mode, Group)] += 1
            continue
        StudentFeeItems[Row.student_id] = Fee.id
    if Missing:
        db.rollback()
        Text = ", ".join(f"{Count} {Mode}" for Mode, Count in Missing.items())
        api_error(422, "BILLING_FEE_NOT_SET", f"Choose an active monthly fee for every billing mode in Payment Settings › Billing first ({Text} student{'s' if sum(Missing.values()) != 1 else ''}).")
    ByStudent = {Row.student_id: Row for Row in Waiting}
    Request = {
        "feeItemIds": sorted(set(StudentFeeItems.values())),
        "billingMonth": int(Period[5:]),
        "billingYear": int(Period[:4]),
        "studentIds": sorted(StudentFeeItems),
        "studentFeeItems": StudentFeeItems,
    }

    def _Settle(CreatedByStudent: dict[str, list[str]], Skips: list[dict[str, Any]]) -> None:
        for StudentId, InvoiceIds in CreatedByStudent.items():
            Row = ByStudent[StudentId]
            Row.status = "RELEASED"
            Row.released_invoice_id = InvoiceIds[0]
            Row.released_at = Now
            Row.released_by_user_id = Actor.id if Actor else None
        for Skip in Skips:
            Row = ByStudent.get(Skip["studentId"])
            if Row and Row.status == "DRAFT":
                Row.status = "DROPPED"
                Row.drop_reason = f"Not released: {Skip['reason']}"
                Row.dropped_at = Now
                Row.dropped_by_user_id = Actor.id if Actor else None
        WritePaymentAudit(db, EntityType="BILLING", EntityId=Period, Action="RELEASE", Actor=Actor, After={"released": len(CreatedByStudent), "notReleased": len(Skips)})

    try:
        Result = GenerateInvoices(db, Request=Request, IdempotencyKey=IdempotencyKey, Actor=Actor, BeforeCommit=_Settle)
    except HTTPException as Error:
        Detail = Error.detail if isinstance(Error.detail, dict) else {}
        if Detail.get("code") != "NOTHING_TO_INVOICE":
            raise
        # Every chosen student already has this month's invoice: the drafts
        # are closed with the reason, and nothing is raised.
        Preview = PreviewInvoices(db, Request=Request)
        Drafts = db.query(PaymentInvoiceDraft).filter(PaymentInvoiceDraft.id.in_([Row.id for Row in Waiting])).with_for_update().all()
        ByStudent = {Row.student_id: Row for Row in Drafts}
        _Settle({}, Preview["skipped"])
        db.commit()
        return {"released": 0, "notReleased": [{"studentName": Skip["studentName"], "reason": Skip["reason"]} for Skip in Preview["skipped"]], "replayed": False, "batch": None, "month": MonthBilling(db, Period)}
    return {
        "released": Result["invoiceCount"],
        "notReleased": [{"studentName": Skip["studentName"], "reason": Skip["reason"]} for Skip in Result["skipped"]],
        "replayed": Result["replayed"],
        "batch": Result,
        "month": MonthBilling(db, Period),
    }


# ----------------------------------------------------------------------------
# Home and the side panel
# ----------------------------------------------------------------------------

def HomeBilling(db: Session) -> dict[str, Any]:
    Settings = EnsureBillingSettings(db)
    Period = PeriodOf(_Today())
    Waiting = db.query(PaymentInvoiceDraft).filter(PaymentInvoiceDraft.period_key == Period, PaymentInvoiceDraft.status == "DRAFT").count()
    Active = {Row.id for Row, _ in _ActiveStudents(db)}
    Drafted = {Row.student_id for Row in db.query(PaymentInvoiceDraft.student_id).filter(PaymentInvoiceDraft.period_key == Period).all()}
    Invoiced = set(_LiveMonthly(db, Period, sorted(Active))) if Active else set()
    # Before automatic drafts start (the first automatic month), the month
    # is billed by hand, so "not billed" is only flagged from then on.
    Watching = bool(Settings.auto_from_period and Period >= Settings.auto_from_period) or bool(Drafted)
    return {
        "period": Period,
        "periodLabel": PeriodLabel(Period),
        "waiting": Waiting,
        "notBilled": len(Active - Drafted - Invoiced - {Id for Id, Mode in ModesFor(db, sorted(Active)).items() if Mode == "EXEMPT"}) if Watching else 0,
        "feesReady": bool(Settings.india_fee_item_id),
        "autoDraftsEnabled": bool(Settings.auto_drafts_enabled),
        "autoFromLabel": PeriodLabel(Settings.auto_from_period) if Settings.auto_from_period else None,
    }


def StudentBilling(db: Session, StudentId: str) -> dict[str, Any]:
    EnsureBillingSettings(db)
    Period = PeriodOf(_Today())
    Settings = EnsureBillingSettings(db)
    Mode = ModesFor(db, [StudentId]).get(StudentId, "INDIA")
    Group = RateGroupsFor(db, [StudentId], Settings).get(StudentId)
    Fee = _FeeFor(_FeeItems(db, Settings), Mode, (Group or {}).get("group", "EXISTING"))
    Invoice = _LiveMonthly(db, Period, [StudentId]).get(StudentId)
    Draft = db.query(PaymentInvoiceDraft).filter(PaymentInvoiceDraft.student_id == StudentId, PaymentInvoiceDraft.period_key == Period).first()
    State = "INVOICED" if Invoice else ("DRAFT" if Draft and Draft.status == "DRAFT" else "DROPPED" if Draft and Draft.status == "DROPPED" else "EXEMPT" if Mode == "EXEMPT" else "NOT_BILLED")
    return {
        "billingMode": Mode,
        "billingModeLabel": MODES[Mode],
        **_GroupPayload(Group),
        "fee": _FeePayload(Fee),
        "period": Period,
        "periodLabel": PeriodLabel(Period),
        "state": State,
        "invoiceNumber": Invoice.invoice_number if Invoice else None,
        "dropReason": Draft.drop_reason if Draft and Draft.status == "DROPPED" else None,
    }
