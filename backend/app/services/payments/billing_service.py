"""Payments revamp R3 (2026-10-09, Shailesh): monthly billing.

  * Every student has a billing mode: INDIA (the default) or INTERNATIONAL.
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

MODES = {"INDIA": "India", "INTERNATIONAL": "International"}
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


def _FeeItems(db: Session, Settings: PaymentBillingSettings) -> dict[str, FeeItem | None]:
    return {
        "INDIA": db.get(FeeItem, Settings.india_fee_item_id) if Settings.india_fee_item_id else None,
        "INTERNATIONAL": db.get(FeeItem, Settings.international_fee_item_id) if Settings.international_fee_item_id else None,
    }


def _FeePayload(Item: FeeItem | None) -> dict[str, Any] | None:
    if not Item:
        return None
    return {"feeItemId": Item.id, "name": Item.name, "isActive": bool(Item.is_active), **_Money(Item.amount_paise)}


def _ActiveStudents(db: Session) -> list[tuple[Student, User]]:
    return (
        db.query(Student, User)
        .join(User, Student.user_id == User.id)
        .filter(Student.is_active == True, User.is_active == True)  # noqa: E712
        .order_by(User.full_name.asc(), Student.student_code.asc())
        .all()
    )


def _Problems(db: Session, Settings: PaymentBillingSettings, Fees: dict[str, FeeItem | None], InternationalCount: int) -> list[str]:
    Problems = []
    if not Fees["INDIA"]:
        Problems.append("Choose the monthly fee for India students.")
    elif not Fees["INDIA"].is_active:
        Problems.append(f"{Fees['INDIA'].name} (India) is switched off in Fee Setup.")
    if InternationalCount and not Fees["INTERNATIONAL"]:
        Problems.append(f"Choose the monthly fee for International students ({InternationalCount} student{'s' if InternationalCount != 1 else ''}).")
    elif InternationalCount and not Fees["INTERNATIONAL"].is_active:
        Problems.append(f"{Fees['INTERNATIONAL'].name} (International) is switched off in Fee Setup.")
    return Problems


def _NextAutoPeriod(Settings: PaymentBillingSettings) -> str:
    """The next month automatic drafts will be made for."""
    Current = PeriodOf(_Today())
    Candidate = NextPeriod(Current) if Settings.last_auto_period == Current else Current
    return max(Candidate, Settings.auto_from_period or Candidate)


def BillingSettings(db: Session) -> dict[str, Any]:
    Settings = EnsureBillingSettings(db)
    Fees = _FeeItems(db, Settings)
    Active = _ActiveStudents(db)
    Modes = ModesFor(db, [Row.id for Row, _ in Active])
    Counts = {"INDIA": 0, "INTERNATIONAL": 0}
    for Row, _ in Active:
        Counts[Modes.get(Row.id, "INDIA")] += 1
    Monthly = db.query(FeeItem).filter(FeeItem.billing_type == "MONTHLY").order_by(FeeItem.display_order.asc(), FeeItem.name.asc()).all()
    return {
        "indiaFee": _FeePayload(Fees["INDIA"]),
        "internationalFee": _FeePayload(Fees["INTERNATIONAL"]),
        "autoDraftsEnabled": bool(Settings.auto_drafts_enabled),
        "autoFromPeriod": Settings.auto_from_period,
        "autoFromLabel": PeriodLabel(Settings.auto_from_period) if Settings.auto_from_period else None,
        "nextAutoLabel": PeriodLabel(_NextAutoPeriod(Settings)) if Settings.auto_drafts_enabled else None,
        "lastAutoPeriod": Settings.last_auto_period,
        "lastAutoLabel": PeriodLabel(Settings.last_auto_period) if Settings.last_auto_period else None,
        "lastAutoAt": _Iso(Settings.last_auto_at),
        "monthlyFeeItems": [_FeePayload(Row) for Row in Monthly],
        "counts": Counts,
        "problems": _Problems(db, Settings, Fees, Counts["INTERNATIONAL"]),
    }


def UpdateBillingSettings(db: Session, *, Request: dict[str, Any], Actor: User | None) -> dict[str, Any]:
    Settings = db.query(PaymentBillingSettings).filter(PaymentBillingSettings.id == "default").with_for_update().first() or EnsureBillingSettings(db)
    Before = {"indiaFeeItemId": Settings.india_fee_item_id, "internationalFeeItemId": Settings.international_fee_item_id, "autoDraftsEnabled": Settings.auto_drafts_enabled}
    for Key, Column in (("indiaFeeItemId", "india_fee_item_id"), ("internationalFeeItemId", "international_fee_item_id")):
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
    if Settings.india_fee_item_id and Settings.india_fee_item_id == Settings.international_fee_item_id:
        api_error(422, "SAME_FEE_FOR_BOTH", "India and International need different monthly fee items.")
    if "autoDraftsEnabled" in Request:
        Enabled = bool(Request.get("autoDraftsEnabled"))
        if Enabled and not Settings.auto_drafts_enabled:
            # Switched (back) on: start from next month.
            Settings.auto_from_period = NextPeriod(PeriodOf(_Today()))
        Settings.auto_drafts_enabled = Enabled
    Settings.updated_by_user_id = Actor.id if Actor else None
    WritePaymentAudit(db, EntityType="BILLING", EntityId="settings", Action="UPDATE", Actor=Actor, Before=Before,
                      After={"indiaFeeItemId": Settings.india_fee_item_id, "internationalFeeItemId": Settings.international_fee_item_id, "autoDraftsEnabled": Settings.auto_drafts_enabled})
    db.commit()
    return BillingSettings(db)


def ListStudentModes(db: Session) -> list[dict[str, Any]]:
    EnsureBillingSettings(db)
    Rows = db.query(Student, User).join(User, Student.user_id == User.id).order_by(User.full_name.asc()).all()
    Modes = ModesFor(db)
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
        }
        for Row, UserRow in Rows
    ]


def SetStudentModes(db: Session, *, StudentIds: list[str], Mode: Any, Actor: User | None) -> dict[str, Any]:
    ModeText = str(Mode or "").upper()
    if ModeText not in MODES:
        api_error(422, "MODE_INVALID", "Choose India or International.")
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
    Invoiced = _LiveMonthly(db, Period, list(People))
    Levels = {Row.id: Row.level_code for Row in db.query(Level).all()}
    Centres = {Row.id: Row.name for Row in db.query(PaymentCentre).all()}
    Waiting = [Row for Row in Drafts if Row.status == "DRAFT"]
    Advances = AdvanceBalances(db, sorted({Row.student_id for Row in Waiting}))
    UserNames = {Row.id: Row.full_name for Row in db.query(User).filter(User.id.in_({Id for Row in Drafts for Id in (Row.released_by_user_id, Row.dropped_by_user_id) if Id})).all()} if Drafts else {}

    def _Student(StudentId: str) -> dict[str, Any]:
        Row, UserRow = People[StudentId]
        Mode = Modes.get(StudentId, "INDIA")
        Fee = Fees[Mode]
        return {
            "studentId": StudentId,
            "studentName": UserRow.full_name,
            "studentCode": Row.student_code,
            "levelCode": Levels.get(Row.current_level_id),
            "centreName": Centres.get(Row.centre_id) if Row.centre_id else None,
            "isActive": StudentId in ActiveIds,
            "billingMode": Mode,
            "billingModeLabel": MODES[Mode],
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
            elif not Base["fee"]:
                Issue = f"No monthly fee chosen for {Base['billingModeLabel']} students"
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
    NotBilled = [_Student(StudentId) for StudentId in sorted(ActiveIds - DraftIds - set(Invoiced), key=lambda Id: ((People[Id][1].full_name or "").lower(), Id))]
    Ready = [Row for Row in Rows if Row["status"] == "DRAFT" and not Row["issue"]]
    InternationalCount = sum(1 for Id in ActiveIds if Modes.get(Id, "INDIA") == "INTERNATIONAL")
    Problems = _Problems(db, Settings, Fees, InternationalCount)
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
        "settings": {"indiaFee": _FeePayload(Fees["INDIA"]), "internationalFee": _FeePayload(Fees["INTERNATIONAL"]), "autoDraftsEnabled": bool(Settings.auto_drafts_enabled), "autoFromLabel": PeriodLabel(Settings.auto_from_period) if Settings.auto_from_period else None},
        "problems": Problems,
        "counts": {
            "waiting": sum(1 for Row in Rows if Row["status"] == "DRAFT"),
            "ready": len(Ready),
            "withIssue": sum(1 for Row in Rows if Row["status"] == "DRAFT" and Row["issue"]),
            "released": sum(1 for Row in Rows if Row["status"] == "RELEASED"),
            "dropped": sum(1 for Row in Rows if Row["status"] == "DROPPED"),
            "invoiced": len(Invoiced),
            "notBilled": len(NotBilled),
            "activeStudents": len(ActiveIds),
        },
        "readyTotal": _Money(sum(Row["fee"]["paise"] for Row in Ready)),
        "readyAdvance": _Money(sum(Row["advanceToApply"]["paise"] for Row in Ready)),
        "drafts": Rows,
        "notBilled": NotBilled,
    }


def _LockSettings(db: Session) -> PaymentBillingSettings:
    EnsureBillingSettings(db)
    return db.query(PaymentBillingSettings).filter(PaymentBillingSettings.id == "default").with_for_update().one()


def _CreateDrafts(db: Session, Period: str, StudentIds: list[str] | None, Source: str, Actor: User | None) -> int:
    """Drafts for active students with no draft and no live monthly invoice
    for the month. Caller holds the settings lock and commits."""
    Active = {Row.id for Row, _ in _ActiveStudents(db)}
    Targets = Active if StudentIds is None else (Active & set(StudentIds))
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
    StudentFeeItems: dict[str, str] = {}
    Missing: dict[str, int] = defaultdict(int)
    for Row in Waiting:
        Mode = Modes.get(Row.student_id, "INDIA")
        Fee = Fees[Mode]
        if not Fee or not Fee.is_active:
            Missing[MODES[Mode]] += 1
            continue
        StudentFeeItems[Row.student_id] = Fee.id
    if Missing:
        db.rollback()
        Text = ", ".join(f"{Count} {Mode}" for Mode, Count in Missing.items())
        api_error(422, "BILLING_FEE_NOT_SET", f"Choose an active monthly fee for every billing mode in Payment Settings › Billing first ({Text} student{'s' if sum(Missing.values()) != 1 else ''}).")
    ByStudent = {Row.student_id: Row for Row in Waiting}
    Now = datetime.now(timezone.utc)
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
        "notBilled": len(Active - Drafted - Invoiced) if Watching else 0,
        "feesReady": bool(Settings.india_fee_item_id),
        "autoDraftsEnabled": bool(Settings.auto_drafts_enabled),
        "autoFromLabel": PeriodLabel(Settings.auto_from_period) if Settings.auto_from_period else None,
    }


def StudentBilling(db: Session, StudentId: str) -> dict[str, Any]:
    EnsureBillingSettings(db)
    Period = PeriodOf(_Today())
    Mode = ModesFor(db, [StudentId]).get(StudentId, "INDIA")
    Invoice = _LiveMonthly(db, Period, [StudentId]).get(StudentId)
    Draft = db.query(PaymentInvoiceDraft).filter(PaymentInvoiceDraft.student_id == StudentId, PaymentInvoiceDraft.period_key == Period).first()
    State = "INVOICED" if Invoice else ("DRAFT" if Draft and Draft.status == "DRAFT" else "DROPPED" if Draft and Draft.status == "DROPPED" else "NOT_BILLED")
    return {
        "billingMode": Mode,
        "billingModeLabel": MODES[Mode],
        "period": Period,
        "periodLabel": PeriodLabel(Period),
        "state": State,
        "invoiceNumber": Invoice.invoice_number if Invoice else None,
        "dropReason": Draft.drop_reason if Draft and Draft.status == "DROPPED" else None,
    }
