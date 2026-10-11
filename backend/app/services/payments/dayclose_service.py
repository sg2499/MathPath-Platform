"""Payments revamp R2 (2026-10-09, Shailesh): Day Close with a cash count.

A day's figures come from the same place as the Collections report: payment
method lines of payments that are not cancelled, by payment date. Expected
cash in hand is the cash received that day minus the cash paid out for
expenses that day.

2026-10-11 (live review): the drawer carries over. A day opens with what was
kept in the drawer at the last close (counted minus what was handed over or
banked at that close), plus the net cash of any days in between that were
never closed. Expected cash in hand = opening + cash received - cash spent.
At close the admin records the cash counted and any cash taken out (banked or
handed over, and to whom); the rest is the next day's opening.

Closing records those figures, the cash actually counted, the difference and
a note (a note is needed when the count does not match), and who closed it.
A closed day can be reopened with a reason and closed again; every close and
reopen is in the payment audit history. Payments can still be recorded or
changed for a closed day (the desk must never be blocked), but the day then
shows "changed after closing" until it is reopened and closed again.
"""
from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import (
    Expense,
    ExpenseMethodLine,
    PaymentCentre,
    PaymentDayClose,
    PaymentMethodLine,
    PaymentReceipt,
    User,
)
from app.services.payments.audit import ListPaymentAudit, WritePaymentAudit
from app.services.payments.money import FormatIndianRupees
from app.services.payments.receipts_service import METHOD_LABELS

MAX_COUNT_PAISE = 10_00_00_000_00  # ₹10 crore: anything above is a typing slip.
RECENT_DAYS = 30


def _Today() -> date:
    from app.services.payments.invoices_service import TodayInIndia

    return TodayInIndia()


def _Money(Paise: int) -> dict[str, Any]:
    return {"paise": int(Paise), "display": FormatIndianRupees(int(Paise))}


def _Day(Value: Any) -> date:
    from app.services.payments.invoices_service import _ParseDate

    Day = _ParseDate(Value, "Date") if Value else _Today()
    if Day > _Today():
        api_error(422, "DATE_IN_FUTURE", "A day in the future cannot be closed.")
    return Day


def _Iso(Value: datetime | None) -> str | None:
    """Always with its time zone (SQLite hands back naive UTC times)."""
    if not Value:
        return None
    return (Value if Value.tzinfo else Value.replace(tzinfo=timezone.utc)).isoformat()


def _Clean(Value: Any, Limit: int) -> str | None:
    Text = str(Value or "").strip()
    return Text[:Limit] if Text else None


# ----------------------------------------------------------------------------
# The day's figures
# ----------------------------------------------------------------------------

def _NotOldHistory():
    """Payments brought in from the old platform (source LEGACY) were counted
    there; Day Close here starts with this site's own money (2026-10-10)."""
    return or_(PaymentReceipt.source.is_(None), PaymentReceipt.source != "LEGACY")


def _NetCashByDay(db: Session, Start: date, End: date) -> dict[date, int]:
    """Cash received minus cash spent on expenses, per day, Start..End inclusive."""
    Net: dict[date, int] = defaultdict(int)
    if End < Start:
        return Net
    for Amount, Day in (
        db.query(PaymentMethodLine.amount_paise, PaymentReceipt.payment_date)
        .join(PaymentReceipt, PaymentMethodLine.payment_id == PaymentReceipt.id)
        .filter(PaymentReceipt.status == "RECORDED", PaymentMethodLine.method == "CASH", PaymentReceipt.payment_date >= Start, PaymentReceipt.payment_date <= End, _NotOldHistory())
        .all()
    ):
        Net[Day] += Amount
    for Amount, Day in (
        db.query(ExpenseMethodLine.amount_paise, Expense.expense_date)
        .join(Expense, ExpenseMethodLine.expense_id == Expense.id)
        .filter(Expense.status == "RECORDED", ExpenseMethodLine.method == "CASH", Expense.expense_date >= Start, Expense.expense_date <= End)
        .all()
    ):
        Net[Day] -= Amount
    return Net


def _Kept(Row: PaymentDayClose) -> int:
    """What a close left in the drawer. Closes made before the drawer carried
    over (2026-10-11, no opening recorded) are treated as emptying it."""
    if Row.opening_cash_paise is None:
        return 0
    return (Row.counted_cash_paise or 0) - (Row.handed_over_paise or 0)


def _LastCloseBefore(db: Session, Day: date) -> PaymentDayClose | None:
    return (
        db.query(PaymentDayClose)
        .filter(PaymentDayClose.close_date < Day, PaymentDayClose.status == "CLOSED")
        .order_by(PaymentDayClose.close_date.desc())
        .first()
    )


def Opening(db: Session, Day: date) -> dict[str, Any]:
    """The drawer at the start of Day: kept at the last close before it, plus
    the cash of days since then that were not closed (or were reopened)."""
    Last = _LastCloseBefore(db, Day)
    if not Last:
        return {"paise": 0, "kept": 0, "lastCloseDate": None, "unclosed": 0, "unclosedDays": []}
    Kept = _Kept(Last)
    Between = _NetCashByDay(db, Last.close_date + timedelta(days=1), Day - timedelta(days=1))
    Days = sorted(Key for Key, Value in Between.items() if Value)
    Unclosed = sum(Between.values())
    return {"paise": Kept + Unclosed, "kept": Kept, "lastCloseDate": Last.close_date.isoformat(), "unclosed": Unclosed, "unclosedDays": [Key.isoformat() for Key in Days]}


def DayFigures(db: Session, Day: date, OpeningValue: dict[str, Any] | None = None) -> dict[str, Any]:
    """What the platform says came in (and went out in cash) on one day. The
    fingerprint covers the day's own payments and expenses only; a change in
    the opening is compared separately (see _ClosePayload)."""
    Lines = (
        db.query(PaymentMethodLine, PaymentReceipt)
        .join(PaymentReceipt, PaymentMethodLine.payment_id == PaymentReceipt.id)
        .filter(PaymentReceipt.status == "RECORDED", PaymentReceipt.payment_date == Day, _NotOldHistory())
        .order_by(PaymentReceipt.receipt_number.asc(), PaymentMethodLine.line_order.asc())
        .all()
    )
    ByMethod: dict[str, int] = defaultdict(int)
    ByStaff: dict[str, dict[str, Any]] = {}
    ByCentre: dict[str, dict[str, Any]] = {}
    Payments: set[str] = set()
    Print: list[str] = []
    CentreNames = {Row.id: Row.name for Row in db.query(PaymentCentre).all()}
    for Line, Payment in Lines:
        ByMethod[Line.method] += Line.amount_paise
        Staff = ByStaff.setdefault(Payment.received_by_user_id or "-", {"name": Payment.received_by_name or "Not recorded", "total": 0, "cash": 0, "payments": set()})
        Staff["total"] += Line.amount_paise
        Staff["cash"] += Line.amount_paise if Line.method == "CASH" else 0
        Staff["payments"].add(Payment.id)
        CentreKey = Payment.centre_id or "-"
        Centre = ByCentre.setdefault(CentreKey, {"name": CentreNames.get(Payment.centre_id or "", "No centre"), "total": 0, "cash": 0, "payments": set()})
        Centre["total"] += Line.amount_paise
        Centre["cash"] += Line.amount_paise if Line.method == "CASH" else 0
        Centre["payments"].add(Payment.id)
        Payments.add(Payment.id)
        Print.append(f"P|{Payment.id}|{Line.method}|{Line.amount_paise}")

    ExpenseLines = (
        db.query(ExpenseMethodLine, Expense)
        .join(Expense, ExpenseMethodLine.expense_id == Expense.id)
        .filter(Expense.status == "RECORDED", Expense.expense_date == Day)
        .all()
    )
    CashSpent = 0
    ExpenseIds: set[str] = set()
    for Line, Row in ExpenseLines:
        ExpenseIds.add(Row.id)
        if Line.method == "CASH":
            CashSpent += Line.amount_paise
        Print.append(f"E|{Row.id}|{Line.method}|{Line.amount_paise}")

    Total = sum(ByMethod.values())
    CashReceived = ByMethod.get("CASH", 0)
    Start = OpeningValue if OpeningValue is not None else Opening(db, Day)
    Order = sorted(ByMethod, key=lambda Method: (Method != "CASH", -ByMethod[Method]))
    return {
        "date": Day.isoformat(),
        "paymentCount": len(Payments),
        "total": _Money(Total),
        "byMethod": [{"method": Method, "methodLabel": METHOD_LABELS.get(Method, Method), **_Money(ByMethod[Method])} for Method in Order],
        "cashReceived": _Money(CashReceived),
        "cashSpent": _Money(CashSpent),
        "expenseCount": len(ExpenseIds),
        "openingCash": _Money(Start["paise"]),
        "opening": {"kept": _Money(Start["kept"]), "lastCloseDate": Start["lastCloseDate"], "unclosed": _Money(Start["unclosed"]), "unclosedDays": Start["unclosedDays"]},
        "cashMovement": _Money(CashReceived - CashSpent),
        "expectedCash": _Money(Start["paise"] + CashReceived - CashSpent),
        "byStaff": [
            {"name": Value["name"], "paymentCount": len(Value["payments"]), **_Money(Value["total"]), "cash": _Money(Value["cash"])}
            for _, Value in sorted(ByStaff.items(), key=lambda Item: -Item[1]["total"])
        ],
        "byCentre": [
            {"name": Value["name"], "paymentCount": len(Value["payments"]), **_Money(Value["total"]), "cash": _Money(Value["cash"])}
            for _, Value in sorted(ByCentre.items(), key=lambda Item: -Item[1]["total"])
        ],
        "fingerprint": hashlib.sha256("\n".join(sorted(Print)).encode()).hexdigest(),
    }


def _ClosePayload(Row: PaymentDayClose | None, Live: dict[str, Any]) -> dict[str, Any] | None:
    if not Row:
        return None
    Expected = json.loads(Row.expected_json or "{}")
    OpeningChanged = _OpeningChanged(Row, Live)
    Changed = Row.status == "CLOSED" and (Row.fingerprint != Live["fingerprint"] or OpeningChanged)
    return {
        "closeId": Row.id,
        "status": Row.status,
        "expected": Expected,
        "expectedCash": _Money(Row.expected_cash_paise),
        "countedCash": _Money(Row.counted_cash_paise),
        "difference": _Money(Row.difference_paise),
        "openingCash": _Money(Row.opening_cash_paise or 0),
        "handedOver": _Money(Row.handed_over_paise or 0),
        "handoverTo": Row.handover_to,
        "keptInDrawer": _Money((Row.counted_cash_paise or 0) - (Row.handed_over_paise or 0)),
        "note": Row.note,
        "closeCount": Row.close_count,
        "closedByName": Row.closed_by_name,
        "closedAt": _Iso(Row.closed_at),
        "reopenedByName": Row.reopened_by_name,
        "reopenedAt": _Iso(Row.reopened_at),
        "reopenReason": Row.reopen_reason,
        "changedAfterClose": Changed,
        "changes": {
            "totalAtClose": Expected.get("total"),
            "totalNow": Live["total"],
            "cashAtClose": _Money(Row.expected_cash_paise),
            "cashNow": Live["expectedCash"],
            "openingChanged": OpeningChanged,
            "openingAtClose": _Money(Row.opening_cash_paise or 0),
            "openingNow": Live["openingCash"],
        } if Changed else None,
    }


def _OpeningChanged(Row: PaymentDayClose, Live: dict[str, Any]) -> bool:
    """An earlier day was closed again with a different count or hand-over, so
    the drawer this day started with is not what it was counted against."""
    return Row.status == "CLOSED" and Row.opening_cash_paise is not None and Row.opening_cash_paise != Live["openingCash"]["paise"]


def DaySummary(db: Session, DayValue: Any = None) -> dict[str, Any]:
    Day = _Day(DayValue)
    Live = DayFigures(db, Day)
    Row = db.query(PaymentDayClose).filter(PaymentDayClose.close_date == Day).first()
    return {
        "date": Day.isoformat(),
        "isToday": Day == _Today(),
        "figures": {Key: Value for Key, Value in Live.items() if Key != "fingerprint"},
        "close": _ClosePayload(Row, Live),
        "state": "OPEN" if not Row else Row.status,
        "history": [
            {**Entry, "createdAt": Entry["createdAt"] if not Entry["createdAt"] or "+" in Entry["createdAt"][10:] or Entry["createdAt"].endswith("Z") else Entry["createdAt"] + "+00:00"}
            for Entry in ListPaymentAudit(db, EntityType="DAY_CLOSE", EntityId=Day.isoformat(), Limit=50)
        ],
    }


# ----------------------------------------------------------------------------
# Close and reopen
# ----------------------------------------------------------------------------

def _Counted(Value: Any) -> int:
    try:
        Paise = int(Value)
    except (TypeError, ValueError):
        api_error(422, "COUNT_INVALID", "Enter the cash you counted, in rupees.")
    if Paise < 0:
        api_error(422, "COUNT_INVALID", "The cash counted cannot be below zero.")
    if Paise > MAX_COUNT_PAISE:
        api_error(422, "COUNT_TOO_LARGE", "That amount looks too large. Please check it.")
    return Paise


def CloseDay(db: Session, *, DayValue: Any, CountedPaise: Any, Note: Any, Actor: User | None, HandedOverPaise: Any = 0, HandoverTo: Any = None) -> dict[str, Any]:
    Day = _Day(DayValue)
    Counted = _Counted(CountedPaise)
    NoteText = _Clean(Note, 500)
    HandedOver = _Counted(HandedOverPaise or 0)
    HandoverText = _Clean(HandoverTo, 200)
    if HandedOver > Counted:
        api_error(422, "HANDOVER_TOO_LARGE", "The cash taken out cannot be more than the cash counted.")
    if HandedOver and not HandoverText:
        api_error(422, "HANDOVER_TO_REQUIRED", "Say where the cash went: banked (which account) or handed to whom.")
    if not HandedOver:
        HandoverText = None
    Row = db.query(PaymentDayClose).filter(PaymentDayClose.close_date == Day).with_for_update().first()
    if Row and Row.status == "CLOSED":
        api_error(409, "DAY_ALREADY_CLOSED", f"{Day.strftime('%d %b %Y')} is already closed. Reopen it first to close it again.")
    Live = DayFigures(db, Day)
    Expected = Live["expectedCash"]["paise"]
    Difference = Counted - Expected
    if Difference and not NoteText:
        Word = "more" if Difference > 0 else "less"
        api_error(422, "NOTE_REQUIRED", f"The cash counted is {FormatIndianRupees(abs(Difference))} {Word} than expected. Add a note saying why.")
    Snapshot = {Key: Value for Key, Value in Live.items() if Key != "fingerprint"}
    Now = datetime.now(timezone.utc)
    Before = None
    if not Row:
        Row = PaymentDayClose(close_date=Day, close_count=1)
        db.add(Row)
    else:
        Before = {"status": Row.status, "countedCashPaise": Row.counted_cash_paise, "expectedCashPaise": Row.expected_cash_paise}
        Row.close_count = (Row.close_count or 0) + 1
    Row.status = "CLOSED"
    Row.expected_json = json.dumps(Snapshot, sort_keys=True)
    Row.expected_cash_paise = Expected
    Row.counted_cash_paise = Counted
    Row.difference_paise = Difference
    Row.opening_cash_paise = Live["openingCash"]["paise"]
    Row.handed_over_paise = HandedOver
    Row.handover_to = HandoverText
    Row.note = NoteText
    Row.fingerprint = Live["fingerprint"]
    Row.closed_by_user_id = Actor.id if Actor else None
    Row.closed_by_name = Actor.full_name if Actor else None
    Row.closed_at = Now
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        api_error(409, "DAY_ALREADY_CLOSED", f"{Day.strftime('%d %b %Y')} was just closed by someone else. Refresh to see it.")
    WritePaymentAudit(
        db, EntityType="DAY_CLOSE", EntityId=Day.isoformat(), Action="CLOSE", Actor=Actor, Before=Before,
        After={"expectedCashPaise": Expected, "countedCashPaise": Counted, "differencePaise": Difference, "openingCashPaise": Live["openingCash"]["paise"], "handedOverPaise": HandedOver, "handoverTo": HandoverText, "totalPaise": Live["total"]["paise"], "paymentCount": Live["paymentCount"]},
        Reason=NoteText,
    )
    db.commit()
    return DaySummary(db, Day)


def ReopenDay(db: Session, *, DayValue: Any, Reason: Any, Actor: User | None) -> dict[str, Any]:
    Day = _Day(DayValue)
    ReasonText = _Clean(Reason, 300)
    if not ReasonText:
        api_error(422, "REASON_REQUIRED", "Say why the day is being reopened.")
    Row = db.query(PaymentDayClose).filter(PaymentDayClose.close_date == Day).with_for_update().first()
    if not Row or Row.status != "CLOSED":
        api_error(409, "DAY_NOT_CLOSED", f"{Day.strftime('%d %b %Y')} is not closed.")
    Row.status = "REOPENED"
    Row.reopened_by_user_id = Actor.id if Actor else None
    Row.reopened_by_name = Actor.full_name if Actor else None
    Row.reopened_at = datetime.now(timezone.utc)
    Row.reopen_reason = ReasonText
    WritePaymentAudit(
        db, EntityType="DAY_CLOSE", EntityId=Day.isoformat(), Action="REOPEN", Actor=Actor,
        Before={"status": "CLOSED", "countedCashPaise": Row.counted_cash_paise}, After={"status": "REOPENED"}, Reason=ReasonText,
    )
    db.commit()
    return DaySummary(db, Day)


# ----------------------------------------------------------------------------
# Recent days (the list on the Day Close tab) and Home
# ----------------------------------------------------------------------------

def RecentDays(db: Session, *, Days: int = RECENT_DAYS) -> dict[str, Any]:
    """Each of the last `Days` days that had money in or out, or a close."""
    Today = _Today()
    Start = Today - timedelta(days=Days - 1)
    Totals: dict[date, dict[str, Any]] = defaultdict(lambda: {"total": 0, "cash": 0, "payments": set(), "cashSpent": 0})
    for Line, Payment in (
        db.query(PaymentMethodLine, PaymentReceipt)
        .join(PaymentReceipt, PaymentMethodLine.payment_id == PaymentReceipt.id)
        .filter(PaymentReceipt.status == "RECORDED", PaymentReceipt.payment_date >= Start, PaymentReceipt.payment_date <= Today, _NotOldHistory())
        .all()
    ):
        Entry = Totals[Payment.payment_date]
        Entry["total"] += Line.amount_paise
        Entry["cash"] += Line.amount_paise if Line.method == "CASH" else 0
        Entry["payments"].add(Payment.id)
    for Line, Row in (
        db.query(ExpenseMethodLine, Expense)
        .join(Expense, ExpenseMethodLine.expense_id == Expense.id)
        .filter(Expense.status == "RECORDED", Expense.expense_date >= Start, Expense.expense_date <= Today, ExpenseMethodLine.method == "CASH")
        .all()
    ):
        Totals[Row.expense_date]["cashSpent"] += Line.amount_paise
    Closes = {Row.close_date: Row for Row in db.query(PaymentDayClose).filter(PaymentDayClose.close_date >= Start, PaymentDayClose.close_date <= Today).all()}
    Openings = _Openings(db, Start, Today, Closes)
    Dates = sorted(set(Totals) | set(Closes) | {Today}, reverse=True)
    Rows = []
    for Day in Dates:
        Entry = Totals[Day]
        Close = Closes.get(Day)
        Changed = False
        if Close and Close.status == "CLOSED":
            Figures = DayFigures(db, Day, OpeningValue=Openings[Day])
            Changed = Close.fingerprint != Figures["fingerprint"] or _OpeningChanged(Close, Figures)
        Expected = Openings[Day]["paise"] + Entry["cash"] - Entry["cashSpent"]
        Rows.append({
            "date": Day.isoformat(),
            "isToday": Day == Today,
            "paymentCount": len(Entry["payments"]),
            "total": _Money(Entry["total"]),
            "expectedCash": _Money(Expected),
            "cashMovement": _Money(Entry["cash"] - Entry["cashSpent"]),
            "state": Close.status if Close else "OPEN",
            "countedCash": _Money(Close.counted_cash_paise) if Close else None,
            "difference": _Money(Close.difference_paise) if Close else None,
            "handedOver": _Money(Close.handed_over_paise or 0) if Close else None,
            "closedByName": Close.closed_by_name if Close else None,
            "closedAt": _Iso(Close.closed_at) if Close else None,
            "changedAfterClose": Changed,
        })
    return {"today": Today.isoformat(), "days": Rows}


def _Openings(db: Session, Start: date, End: date, Closes: dict[date, PaymentDayClose]) -> dict[date, dict[str, Any]]:
    """Opening for every day Start..End in one pass (same rule as Opening)."""
    Last = _LastCloseBefore(db, Start)
    Carry = _Kept(Last) if Last else 0
    LastDate = Last.close_date if Last else None
    Net = _NetCashByDay(db, (Last.close_date + timedelta(days=1)) if Last else Start, End)
    Unclosed: list[date] = []
    if Last:
        for Offset in range((Start - Last.close_date).days - 1):
            Day = Last.close_date + timedelta(days=Offset + 1)
            Carry += Net.get(Day, 0)
            if Net.get(Day):
                Unclosed.append(Day)
    Kept = _Kept(Last) if Last else 0
    Result: dict[date, dict[str, Any]] = {}
    Day = Start
    while Day <= End:
        Result[Day] = {"paise": Carry if LastDate else 0, "kept": Kept, "lastCloseDate": LastDate.isoformat() if LastDate else None,
                       "unclosed": (Carry - Kept) if LastDate else 0, "unclosedDays": [Item.isoformat() for Item in Unclosed]}
        Close = Closes.get(Day)
        if Close and Close.status == "CLOSED":
            Kept = _Kept(Close)
            Carry = Kept
            LastDate = Day
            Unclosed = []
        elif LastDate:
            Carry += Net.get(Day, 0)
            if Net.get(Day):
                Unclosed.append(Day)
        Day += timedelta(days=1)
    return Result


def HomeDayClose(db: Session) -> dict[str, Any]:
    """Today's close state, and the latest earlier day (last 7) that took
    money but was never closed or changed after closing."""
    Today = _Today()
    Recent = RecentDays(db, Days=8)["days"]
    TodayRow = next((Row for Row in Recent if Row["isToday"]), None)
    Pending = [
        Row for Row in Recent
        if not Row["isToday"] and (Row["changedAfterClose"] or (Row["state"] != "CLOSED" and (Row["paymentCount"] or Row["cashMovement"]["paise"])))
    ]
    return {
        "today": Today.isoformat(),
        "todayState": TodayRow["state"] if TodayRow else "OPEN",
        "todayChangedAfterClose": bool(TodayRow and TodayRow["changedAfterClose"]),
        "expectedCash": TodayRow["expectedCash"] if TodayRow else _Money(0),
        "pendingDays": [{"date": Row["date"], "state": Row["state"], "changedAfterClose": Row["changedAfterClose"], "total": Row["total"]} for Row in Pending],
    }


# ----------------------------------------------------------------------------
# Quick Pay default
# ----------------------------------------------------------------------------

def LastUsedMethod(db: Session, Actor: User | None) -> str | None:
    """The method on the last counter payment this person recorded."""
    if not Actor:
        return None
    Payment = (
        db.query(PaymentReceipt)
        .filter(PaymentReceipt.created_by_user_id == Actor.id, PaymentReceipt.channel == "COUNTER")
        .order_by(PaymentReceipt.created_at.desc(), PaymentReceipt.receipt_number.desc())
        .first()
    )
    if not Payment:
        return None
    Line = (
        db.query(PaymentMethodLine)
        .filter(PaymentMethodLine.payment_id == Payment.id)
        .order_by(PaymentMethodLine.amount_paise.desc(), PaymentMethodLine.line_order.asc())
        .first()
    )
    return Line.method if Line else None
