"""Payments revamp R2 (2026-10-09): Day Close with a cash count, and the
Quick Pay default method."""

import io
from datetime import date

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pypdf import PdfReader

from app.database import get_db
from app.dependencies import get_current_user
from app.models import ExpenseCategory, PaymentAuditLog, User
from app.services.payments import dayclose_service as dc
from app.services.payments import expenses_service as exp
from app.services.payments import home_service as home
from app.services.payments import invoices_service as inv
from app.services.payments import receipts_service as rec
from tests.test_payments_phase3_receipts import _invoice, _pay, _setup

TODAY = date(2026, 11, 20)


@pytest.fixture(autouse=True)
def _fixed_today(monkeypatch):
    monkeypatch.setattr(inv, "TodayInIndia", lambda: TODAY)


def _day(db, admin):
    """Today: cash 1,100 (s1 monthly), UPI 350 (s1 bag), and a cash expense of 200."""
    monthly = _invoice(db, "s1", "Monthly Fee")
    bag = _invoice(db, "s1", "MathPath Bag")
    _pay(db, admin, allocations=[(monthly.id, 110000, 0)], methods=[("CASH", 110000, None)], paymentDate=TODAY.isoformat())
    _pay(db, admin, allocations=[(bag.id, 35000, 0)], methods=[("UPI", 35000, "UTR-1")], paymentDate=TODAY.isoformat())
    exp.EnsureExpenseCategories(db)
    db.commit()
    category = db.query(ExpenseCategory).first()
    exp.CreateExpense(db, Request={"expenseDate": TODAY.isoformat(), "categoryId": category.id, "item": "Tea", "methods": [{"method": "CASH", "amountPaise": 20000}]}, IdempotencyKey="exp-r2-000001", Actor=admin)


def test_day_figures_expected_cash_and_close_with_matching_count():
    db, admin, monthly, bag = _setup()
    _day(db, admin)
    summary = dc.DaySummary(db)
    figures = summary["figures"]
    assert summary["state"] == "OPEN" and summary["close"] is None
    assert figures["total"]["display"] == "₹1,450.00" and figures["paymentCount"] == 2
    assert [m["method"] for m in figures["byMethod"]] == ["CASH", "UPI"]  # cash first
    assert figures["cashReceived"]["paise"] == 110000 and figures["cashSpent"]["paise"] == 20000
    assert figures["expectedCash"]["display"] == "₹900.00"

    closed = dc.CloseDay(db, DayValue=None, CountedPaise=90000, Note=None, Actor=admin)
    assert closed["state"] == "CLOSED"
    close = closed["close"]
    assert close["countedCash"]["paise"] == 90000 and close["difference"]["paise"] == 0
    assert close["closedByName"] == admin.full_name and close["changedAfterClose"] is False
    assert closed["history"][0]["action"] == "CLOSE"
    with pytest.raises(HTTPException) as again:
        dc.CloseDay(db, DayValue=None, CountedPaise=90000, Note=None, Actor=admin)
    assert again.value.status_code == 409


def test_a_difference_needs_a_note_and_is_recorded():
    db, admin, *_ = _setup()
    _day(db, admin)
    with pytest.raises(HTTPException) as missing:
        dc.CloseDay(db, DayValue=TODAY.isoformat(), CountedPaise=85000, Note="  ", Actor=admin)
    assert missing.value.status_code == 422 and "₹50.00 less" in missing.value.detail["message"]
    closed = dc.CloseDay(db, DayValue=TODAY.isoformat(), CountedPaise=85000, Note="Gave ₹50 change from the drawer", Actor=admin)
    assert closed["close"]["difference"]["paise"] == -5000 and closed["close"]["note"].startswith("Gave")
    with pytest.raises(HTTPException) as future:
        dc.CloseDay(db, DayValue="2026-11-21", CountedPaise=0, Note=None, Actor=admin)
    assert future.value.status_code == 422
    with pytest.raises(HTTPException):
        dc.CloseDay(db, DayValue=None, CountedPaise=-1, Note="x", Actor=admin)


def test_changes_after_close_are_flagged_and_reopen_needs_a_reason():
    db, admin, *_ = _setup()
    _day(db, admin)
    dc.CloseDay(db, DayValue=None, CountedPaise=90000, Note=None, Actor=admin)
    # A late cash payment for the closed day.
    monthly2 = _invoice(db, "s2", "Monthly Fee")
    late = _pay(db, admin, student="s2", allocations=[(monthly2.id, 50000, 0)], methods=[("CASH", 50000, None)], paymentDate=TODAY.isoformat())
    summary = dc.DaySummary(db)
    assert summary["close"]["changedAfterClose"] is True
    assert summary["close"]["changes"]["cashNow"]["display"] == "₹1,400.00" and summary["close"]["changes"]["cashAtClose"]["display"] == "₹900.00"
    assert dc.RecentDays(db)["days"][0]["changedAfterClose"] is True
    # Cancelling it puts the day back as it was closed.
    rec.CancelPayment(db, PaymentId=late["paymentId"], Reason="Entered twice", Actor=admin)
    assert dc.DaySummary(db)["close"]["changedAfterClose"] is False

    with pytest.raises(HTTPException) as no_reason:
        dc.ReopenDay(db, DayValue=TODAY.isoformat(), Reason=" ", Actor=admin)
    assert no_reason.value.status_code == 422
    reopened = dc.ReopenDay(db, DayValue=TODAY.isoformat(), Reason="Recount", Actor=admin)
    assert reopened["state"] == "REOPENED" and reopened["close"]["reopenReason"] == "Recount"
    again = dc.CloseDay(db, DayValue=None, CountedPaise=90000, Note=None, Actor=admin)
    assert again["state"] == "CLOSED" and again["close"]["closeCount"] == 2
    actions = [row.action for row in db.query(PaymentAuditLog).filter_by(entity_type="DAY_CLOSE").order_by(PaymentAuditLog.created_at).all()]
    assert actions == ["CLOSE", "REOPEN", "CLOSE"]
    with pytest.raises(HTTPException) as not_closed:
        dc.ReopenDay(db, DayValue="2026-11-19", Reason="x", Actor=admin)
    assert not_closed.value.status_code == 409


def test_home_lists_unclosed_earlier_days_and_today_state():
    db, admin, *_ = _setup()
    monthly = _invoice(db, "s1", "Monthly Fee")
    _pay(db, admin, allocations=[(monthly.id, 110000, 0)], methods=[("CASH", 110000, None)], paymentDate="2026-11-18")
    state = home.PaymentsHome(db)["dayClose"]
    assert state["todayState"] == "OPEN" and [row["date"] for row in state["pendingDays"]] == ["2026-11-18"]
    dc.CloseDay(db, DayValue="2026-11-18", CountedPaise=110000, Note=None, Actor=admin)
    assert dc.HomeDayClose(db)["pendingDays"] == []
    days = dc.RecentDays(db)["days"]
    assert days[0]["date"] == "2026-11-20" and days[0]["isToday"] and days[1]["state"] == "CLOSED"


def test_last_used_method_and_pdf_and_api():
    from app.main import app

    db, admin, *_ = _setup()
    assert dc.LastUsedMethod(db, admin) is None
    _day(db, admin)
    assert dc.LastUsedMethod(db, admin) == "UPI"  # the latest counter payment
    dc.CloseDay(db, DayValue=None, CountedPaise=90000, Note=None, Actor=admin)

    app.dependency_overrides[get_db] = lambda: db
    try:
        app.dependency_overrides[get_current_user] = lambda: db.get(User, "user-s1")
        client = TestClient(app)
        assert client.get("/api/admin/payments/day-close").status_code == 403
        assert client.post("/api/admin/payments/day-close", json={"countedCashPaise": 1}).status_code == 403
        app.dependency_overrides[get_current_user] = lambda: admin
        assert client.get("/api/admin/payments/quick-pay/defaults").json() == {"lastMethod": "UPI"}
        assert client.get("/api/admin/payments/day-close").json()["state"] == "CLOSED"
        assert client.get("/api/admin/payments/day-close/recent").json()["days"][0]["state"] == "CLOSED"
        assert client.post("/api/admin/payments/day-close", json={"countedCashPaise": 1}).status_code == 409
        pdf = client.get(f"/api/admin/payments/day-close/{TODAY.isoformat()}/pdf")
        assert pdf.status_code == 200 and pdf.headers["content-type"] == "application/pdf"
        text = "".join(page.extract_text() for page in PdfReader(io.BytesIO(pdf.content)).pages)
        assert "CASH COUNT" in text and "Expected cash in hand" in text and "Cash counted" in text and "Closed by" in text
        reopened = client.post(f"/api/admin/payments/day-close/{TODAY.isoformat()}/reopen", json={"reason": "Recount"})
        assert reopened.status_code == 200 and reopened.json()["state"] == "REOPENED"
        text = "".join(page.extract_text() for page in PdfReader(io.BytesIO(client.get(f"/api/admin/payments/day-close/{TODAY.isoformat()}/pdf").content)).pages)
        assert "reopened" in text and "Cash counted by" in text
    finally:
        app.dependency_overrides.clear()
