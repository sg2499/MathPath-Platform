"""Payments live review (2026-10-11, Shailesh): follow-ups default to overdue,
like-for-like month comparison, advance that can pay dues, the Not billed
mode, the Day Close drawer carry-over and hand-over, and small fixes."""

from datetime import date

import pytest
from fastapi import HTTPException

from app.models import ExpenseCategory, PaymentAllocation, PaymentDayClose, PaymentInvoice, PaymentInvoiceDraft, PaymentReceipt
from app.services.payments import billing_service as bill
from app.services.payments import dayclose_service as dc
from app.services.payments import expenses_service as exp
from app.services.payments import followups_service as fu
from app.services.payments import home_service as home
from app.services.payments import invoices_service as inv
from app.services.payments import numbering, online_service as online, receipts_service as rec
from app.services.payments import reports_service as reports
from app.services.payments import setup_service as setup
from tests.test_payments_phase2_invoices import _code, _req, _session, _world

TODAY = {"value": date(2026, 11, 20)}


@pytest.fixture(autouse=True)
def _today(monkeypatch):
    TODAY["value"] = date(2026, 11, 20)
    monkeypatch.setattr(inv, "TodayInIndia", lambda: TODAY["value"])


def _world_with_receipts():
    db = _session()
    admin, monthly, bag = _world(db)
    numbering.SetStartingNumber(db, Key="RECEIPT", NextNumber=631, Actor=admin)
    db.commit()
    return db, admin, monthly, bag


def _cash(db, admin, student, amount, day, key, allocations=(), keep=False):
    return rec.RecordPayment(
        db, StudentId=student,
        Request={"paymentDate": day.isoformat(), "allocations": [{"invoiceId": i, "amountPaise": a} for i, a in allocations], "methods": [{"method": "CASH", "amountPaise": amount}], "keepAdvance": keep},
        IdempotencyKey=key, Actor=admin,
    )


# --- 1. follow-ups ---------------------------------------------------------------

def test_follow_ups_open_on_overdue_and_never_contacted_means_overdue_only():
    db, admin, monthly, bag = _world_with_receipts()
    # s1: due 11 Nov (overdue on the 20th). s2: invoiced today, due 30 Nov (not yet due).
    inv.GenerateInvoices(db, Request=_req([monthly], students=("s1",)), IdempotencyKey="gen-rv-00001", Actor=admin)
    inv.GenerateInvoices(db, Request=_req([bag], students=("s2",), invoiceDate="2026-11-20"), IdempotencyKey="gen-rv-00002", Actor=admin)
    result = fu.FollowUps(db)
    assert result["view"] == "OVERDUE"
    assert [row["studentId"] for row in result["students"]] == ["s1"]
    counts = {view["key"]: view["count"] for view in result["views"]}
    assert counts["ALL"] == 2 and counts["OVERDUE"] == 1 and counts["NEVER"] == 1
    assert [view["key"] for view in result["views"]][0] == "OVERDUE"
    assert {row["studentId"] for row in fu.FollowUps(db, View="ALL")["students"]} == {"s1", "s2"}


# --- 2. like-for-like month comparison --------------------------------------------

def test_overview_compares_the_same_days_of_last_month():
    db, admin, monthly, bag = _world_with_receipts()
    inv.GenerateInvoices(db, Request=_req([monthly, bag], students=("s1", "s2")), IdempotencyKey="gen-rv-00003", Actor=admin)
    _cash(db, admin, "s1", 30000, date(2026, 10, 5), "pay-rv-0001", keep=True)   # within 1-20 Oct
    _cash(db, admin, "s1", 70000, date(2026, 10, 25), "pay-rv-0002", keep=True)  # after the 20th
    overview = reports.Overview(db)
    assert overview["lastMonthCollected"]["paise"] == 100000
    assert overview["lastMonthToDateCollected"]["paise"] == 30000
    assert overview["lastMonthToDateLabel"] == "1–20 Oct"
    TODAY["value"] = date(2026, 12, 31)  # November has 30 days: capped
    assert reports.Overview(db)["lastMonthToDateLabel"] == "1–30 Nov"


# --- 3. advance that can pay dues -----------------------------------------------

def test_advance_held_with_dues_is_flagged_and_applied_for_everyone():
    db, admin, monthly, bag = _world_with_receipts()
    inv.GenerateInvoices(db, Request=_req([monthly], students=("s1", "s2")), IdempotencyKey="gen-rv-00004", Actor=admin)
    _cash(db, admin, "s1", 10000, TODAY["value"], "pay-rv-0003", keep=True)  # ₹100 advance, ₹1,100 due
    rows = rec.AdvanceWithDues(db)
    assert [(row["studentId"], row["usablePaise"]) for row in rows] == [("s1", 10000)]
    attention = home.PaymentsHome(db)["attention"]["advance"]
    assert attention["students"] == 1 and attention["usable"]["paise"] == 10000
    result = rec.ApplyAdvanceForAll(db, Actor=admin)
    assert result["students"] == 1 and result["appliedPaise"] == 10000
    fee = db.query(PaymentInvoice).filter_by(student_id="s1").one()
    assert fee.status == "PART_PAID" and db.query(PaymentAllocation).filter_by(invoice_id=fee.id, kind="ADVANCE").one().amount_paise == 10000
    assert rec.AdvanceWithDues(db) == []
    with pytest.raises(HTTPException) as nothing:
        rec.ApplyAdvanceForAll(db, Actor=admin)
    assert _code(nothing) == "NOTHING_TO_APPLY"


# --- 4. the No monthly fee mode ---------------------------------------------------------

def test_not_billed_students_get_no_monthly_draft_and_stale_drafts_are_closed():
    db = _session()
    admin, monthly, bag = _world(db)
    numbering.SetStartingNumber(db, Key="RECEIPT", NextNumber=631, Actor=admin)
    online.UpdateOnlineSettings(db, Fields={"studentFeesEnabled": True}, Actor=admin)
    db.commit()
    TODAY["value"] = date(2026, 10, 20)
    bill.BillingSettings(db)
    db.commit()
    bill.SetStudentModes(db, StudentIds=["s2"], Mode="EXEMPT", Actor=admin)
    assert bill.BillingSettings(db)["counts"] == {"INDIA": 1, "INTERNATIONAL": 0, "EXEMPT": 1}
    TODAY["value"] = date(2026, 11, 1)
    assert bill.EnsureMonthlyDrafts(db) == 1  # s1 only
    month = bill.MonthBilling(db, "2026-11")
    assert month["counts"]["notBilled"] == 0 and month["counts"]["exempt"] == 1
    assert [row["studentId"] for row in month["exempt"]] == ["s2"]
    assert bill.HomeBilling(db)["notBilled"] == 0
    assert bill.StudentBilling(db, "s2")["state"] == "EXEMPT"
    # Asking for a draft by hand does nothing for a Not billed student.
    assert bill.CreateDrafts(db, PeriodValue="2026-11", StudentIds=["s2"], Actor=admin)["draftsCreated"] == 0

    # A draft made before the student was set to Not billed is closed at release.
    bill.SetStudentModes(db, StudentIds=["s1"], Mode="EXEMPT", Actor=admin)
    draft = db.query(PaymentInvoiceDraft).filter_by(student_id="s1").one()
    assert {row["studentId"]: row["issue"] for row in bill.MonthBilling(db, "2026-11")["drafts"]}["s1"].startswith("Set to No monthly fee")
    result = bill.ReleaseDrafts(db, PeriodValue="2026-11", DraftIds=[draft.id], IdempotencyKey="release-rv-01", Actor=admin)
    assert result["released"] == 0 and db.query(PaymentInvoice).count() == 0
    db.refresh(draft)
    assert draft.status == "DROPPED" and draft.drop_reason.startswith("Not released: set to No monthly fee")
    with pytest.raises(HTTPException) as bad:
        bill.SetStudentModes(db, StudentIds=["s1"], Mode="FREE", Actor=admin)
    assert _code(bad) == "MODE_INVALID"


# --- 5. Day Close: the drawer carries over ------------------------------------------

def test_the_drawer_carries_over_with_cash_taken_out_and_unclosed_days():
    db, admin, monthly, bag = _world_with_receipts()
    day1, day2, day3 = date(2026, 11, 18), date(2026, 11, 19), date(2026, 11, 20)
    _cash(db, admin, "s1", 100000, day1, "pay-rv-0010", keep=True)
    summary = dc.DaySummary(db, day1.isoformat())
    assert summary["figures"]["openingCash"]["paise"] == 0 and summary["figures"]["expectedCash"]["paise"] == 100000

    with pytest.raises(HTTPException) as too_much:
        dc.CloseDay(db, DayValue=day1.isoformat(), CountedPaise=100000, Note=None, Actor=admin, HandedOverPaise=100001, HandoverTo="Bank")
    assert _code(too_much) == "HANDOVER_TOO_LARGE"
    with pytest.raises(HTTPException) as where:
        dc.CloseDay(db, DayValue=day1.isoformat(), CountedPaise=100000, Note=None, Actor=admin, HandedOverPaise=60000, HandoverTo=" ")
    assert _code(where) == "HANDOVER_TO_REQUIRED"
    closed = dc.CloseDay(db, DayValue=day1.isoformat(), CountedPaise=100000, Note=None, Actor=admin, HandedOverPaise=60000, HandoverTo="Deposited in HDFC")
    assert closed["close"]["keptInDrawer"]["paise"] == 40000 and closed["close"]["handoverTo"] == "Deposited in HDFC"

    # Day 2 is never closed: ₹500 cash in, ₹200 cash out.
    _cash(db, admin, "s2", 50000, day2, "pay-rv-0011", keep=True)
    exp.EnsureExpenseCategories(db)
    db.commit()
    category = db.query(ExpenseCategory).first()
    exp.CreateExpense(db, Request={"expenseDate": day2.isoformat(), "categoryId": category.id, "item": "Tea", "methods": [{"method": "CASH", "amountPaise": 20000}]}, IdempotencyKey="exp-rv-000001", Actor=admin)
    assert dc.DaySummary(db, day2.isoformat())["figures"]["expectedCash"]["paise"] == 40000 + 30000

    # Day 3 opens with ₹400 kept + ₹300 from the unclosed day 2.
    figures = dc.DaySummary(db, day3.isoformat())["figures"]
    assert figures["openingCash"]["paise"] == 70000
    assert figures["opening"]["lastCloseDate"] == day1.isoformat() and figures["opening"]["unclosedDays"] == [day2.isoformat()]
    closed3 = dc.CloseDay(db, DayValue=day3.isoformat(), CountedPaise=70000, Note=None, Actor=admin)
    assert closed3["close"]["difference"]["paise"] == 0 and closed3["close"]["openingCash"]["paise"] == 70000

    # Day 2 still waits on Home (money moved and it was never closed); an
    # empty day with only an opening balance does not.
    pending = {row["date"] for row in dc.HomeDayClose(db)["pendingDays"]}
    assert day2.isoformat() in pending and day1.isoformat() not in pending

    # Reopening day 1 with a different hand-over changes day 3's opening:
    # day 3 then shows "changed after closing".
    dc.ReopenDay(db, DayValue=day1.isoformat(), Reason="Recount", Actor=admin)
    dc.CloseDay(db, DayValue=day1.isoformat(), CountedPaise=100000, Note=None, Actor=admin, HandedOverPaise=100000, HandoverTo="Handed to Shailesh")
    assert dc.DaySummary(db, day3.isoformat())["close"]["changedAfterClose"] is True
    assert db.query(PaymentDayClose).filter_by(close_date=day1).one().handed_over_paise == 100000


def test_day_close_sheet_leaves_out_old_site_payments():
    db, admin, monthly, bag = _world_with_receipts()
    inv.GenerateInvoices(db, Request=_req([monthly], students=("s1", "s2")), IdempotencyKey="gen-rv-00005", Actor=admin)
    _cash(db, admin, "s1", 110000, TODAY["value"], "pay-rv-0020", keep=True)
    old = _cash(db, admin, "s2", 110000, TODAY["value"], "pay-rv-0021", keep=True)
    db.get(PaymentReceipt, old["paymentId"]).source = "LEGACY"
    db.commit()
    day = TODAY["value"].isoformat()
    assert reports.CollectionsReport(db, Filters={"dateFrom": day, "dateTo": day})["total"]["paise"] == 220000
    assert reports.CollectionsReport(db, Filters={"dateFrom": day, "dateTo": day, "excludeOldHistory": True})["total"]["paise"] == 110000


# --- 6. dues order -------------------------------------------------------------------

def test_equal_dues_put_the_overdue_student_first():
    db, admin, monthly, bag = _world_with_receipts()
    inv.GenerateInvoices(db, Request=_req([monthly], students=("s2",)), IdempotencyKey="gen-rv-00006", Actor=admin)  # due 11 Nov: overdue
    inv.GenerateInvoices(db, Request=_req([monthly], students=("s1",), invoiceDate="2026-11-20"), IdempotencyKey="gen-rv-00007", Actor=admin)  # not yet due
    order = [row["studentId"] for row in reports.DuesReport(db, Filters={})["students"]]
    assert order == ["s2", "s1"]  # "Aarav Sen" would come first by name alone


def test_closes_from_before_the_drawer_carry_over_are_not_reflagged():
    """A close made by the old code (no opening recorded) counts as emptying the
    drawer, and later closes are not marked changed because of it."""
    db, admin, monthly, bag = _world_with_receipts()
    day1, day2 = date(2026, 11, 19), date(2026, 11, 20)
    _cash(db, admin, "s1", 100000, day1, "pay-rv-0030", keep=True)
    dc.CloseDay(db, DayValue=day1.isoformat(), CountedPaise=100000, Note=None, Actor=admin)
    old = db.query(PaymentDayClose).filter_by(close_date=day1).one()
    old.opening_cash_paise = None  # as the old code left it
    db.commit()
    assert dc.DaySummary(db, day1.isoformat())["close"]["changedAfterClose"] is False
    assert dc.DaySummary(db, day2.isoformat())["figures"]["openingCash"]["paise"] == 0
    _cash(db, admin, "s2", 50000, day2, "pay-rv-0031", keep=True)
    dc.CloseDay(db, DayValue=day2.isoformat(), CountedPaise=50000, Note=None, Actor=admin)
    days = {row["date"]: row for row in dc.RecentDays(db)["days"]}
    assert days[day1.isoformat()]["changedAfterClose"] is False and days[day2.isoformat()]["changedAfterClose"] is False
    assert days[day2.isoformat()]["expectedCash"]["paise"] == 50000


def test_recent_days_openings_match_the_single_day_rule():
    db, admin, monthly, bag = _world_with_receipts()
    d1, d2, d3 = date(2026, 11, 17), date(2026, 11, 18), date(2026, 11, 20)
    _cash(db, admin, "s1", 100000, d1, "pay-rv-0040", keep=True)
    dc.CloseDay(db, DayValue=d1.isoformat(), CountedPaise=100000, Note=None, Actor=admin, HandedOverPaise=30000, HandoverTo="Bank")
    _cash(db, admin, "s2", 20000, d2, "pay-rv-0041", keep=True)  # never closed
    _cash(db, admin, "s1", 5000, d3, "pay-rv-0042", keep=True)
    days = {row["date"]: row for row in dc.RecentDays(db)["days"]}
    for day in (d1, d2, d3):
        assert days[day.isoformat()]["expectedCash"] == dc.DaySummary(db, day.isoformat())["figures"]["expectedCash"]
    assert days[d3.isoformat()]["expectedCash"]["paise"] == 70000 + 20000 + 5000
