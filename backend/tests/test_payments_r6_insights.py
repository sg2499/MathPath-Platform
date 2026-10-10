"""Payments revamp R6 (2026-10-09): insights (collection rate, days to pay,
overdue trend, forecast, top dues), unusual activity with editable limits
and review marks, the activity feed, expense search and the statement PDF."""

from datetime import date, datetime, timezone

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.database import get_db
from app.dependencies import get_current_user
from app.models import ExpenseCategory, PaymentAuditLog, PaymentReceipt, User
from app.services.payments import expenses_service as exp
from app.services.payments import home_service as home
from app.services.payments import insights_service as ins
from app.services.payments import invoices_service as inv
from app.services.payments import numbering, receipts_service as rec
from tests.test_payments_phase2_invoices import _code, _req, _session, _world

TODAY = {"value": date(2026, 11, 20)}


@pytest.fixture(autouse=True)
def _today(monkeypatch):
    TODAY["value"] = date(2026, 11, 20)
    monkeypatch.setattr(inv, "TodayInIndia", lambda: TODAY["value"])


def _noon(day: date) -> datetime:
    """Midday in India on that day, as stored (UTC)."""
    return datetime(day.year, day.month, day.day, 6, 30, tzinfo=timezone.utc)


def _setup():
    """s1 and s2 each owe Monthly Fee 1,100 + Bag 350 (invoiced 1 Nov, due 11 Nov)."""
    db = _session()
    admin, monthly, bag = _world(db)
    numbering.SetStartingNumber(db, Key="RECEIPT", NextNumber=631, Actor=admin)
    db.commit()
    inv.GenerateInvoices(db, Request=_req([monthly, bag], students=("s1", "s2")), IdempotencyKey="gen-r6-00001", Actor=admin)
    return db, admin


def _invoice(db, student, fee):
    return next(i for i in inv.ListInvoices(db, Filters={"studentId": student}, PageSize=50)["invoices"] if i["feeName"] == fee)


def _pay(db, admin, student, fee, amount, key, *, discount=0, paid_on=None, reason=None):
    invoice = _invoice(db, student, fee)
    request = {
        "paymentDate": (paid_on or TODAY["value"]).isoformat(),
        "allocations": [{"invoiceId": invoice["invoiceId"], "amountPaise": amount, "discountPaise": discount}],
        "methods": [{"method": "CASH", "amountPaise": amount}],
    }
    if reason:
        request["discountReason"] = reason
    result = rec.RecordPayment(db, StudentId=student, Request=request, IdempotencyKey=key, Actor=admin)
    # Entered "today" by the test clock.
    row = db.get(PaymentReceipt, result["paymentId"])
    row.created_at = _noon(TODAY["value"])
    db.commit()
    return result


def test_collection_rate_days_to_pay_forecast_and_top_dues():
    db, admin = _setup()
    _pay(db, admin, "s1", "MathPath Bag", 35000, "pay-r6-0001")
    data = ins.Insights(db)
    november = data["months"][-1]
    assert [m["month"] for m in data["months"]] == ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]
    assert november["billed"]["display"] == "₹2,900.00" and november["collected"]["display"] == "₹350.00" and november["rate"] == 12
    assert data["months"][-2]["rate"] is None and data["months"][-2]["overdue"]["paise"] == 0
    # The overdue at "today" is the same as the Dues report's.
    assert november["overdue"]["paise"] == data["overdueNow"]["paise"] == 255000 and november["overdueInvoices"] == 3
    collection = data["collection"]
    assert collection["rate"] == 12 and collection["averageDaysToPay"] == 19 and collection["paidInvoices"] == 1
    assert collection["onTimePercent"] == 0  # paid on 20 Nov, due 11 Nov
    forecast = data["forecast"]
    assert forecast["billed"]["display"] == "₹2,900.00" and forecast["stillToCome"]["display"] == "₹2,550.00"
    assert forecast["overdue"]["display"] == "₹2,550.00" and forecast["dueByMonthEnd"]["paise"] == 0 and forecast["dueLater"]["paise"] == 0
    assert [row["studentId"] for row in data["topDues"]] == ["s2", "s1"] and data["topDues"][0]["due"]["display"] == "₹1,450.00"
    assert data["topDuesShare"] == 100

    # A month later: November's month-end overdue is kept as it was, and a
    # payment dated in December only lowers December's.
    TODAY["value"] = date(2026, 12, 15)
    _pay(db, admin, "s2", "MathPath Bag", 35000, "pay-r6-0002", paid_on=date(2026, 12, 5))
    later = ins.Insights(db)
    assert later["months"][-2]["month"] == "2026-11" and later["months"][-2]["overdueAt"] == "2026-11-30"
    assert later["months"][-2]["overdue"]["display"] == "₹2,550.00"
    assert later["months"][-1]["overdue"]["display"] == "₹2,200.00" == later["overdueNow"]["display"]
    assert later["collection"]["averageDaysToPay"] == 26  # two paid: 19 and 34 days
    assert later["months"][-2]["rate"] == 24  # 700 of 2,900 billed in November has come in


def test_unusual_activity_limits_and_reviews():
    db, admin = _setup()
    # 300 off 1,100 = 27%: over the 20% share, under the 500 amount.
    _pay(db, admin, "s1", "Monthly Fee", 80000, "pay-r6-0003", discount=30000, reason="Sibling")
    # Dated 5 Nov, entered 20 Nov: 15 days back.
    _pay(db, admin, "s2", "MathPath Bag", 35000, "pay-r6-0004", paid_on=date(2026, 11, 5))
    # Three cancellations by one person in one day.
    for key in ("pay-r6-0005", "pay-r6-0006"):
        made = _pay(db, admin, "s2", "Monthly Fee", 10000, key)
        rec.CancelPayment(db, PaymentId=made["paymentId"], Reason="Entered twice", Actor=admin)
    inv.CancelInvoice(db, InvoiceId=_invoice(db, "s1", "MathPath Bag")["invoiceId"], Reason="Bag not given", Actor=admin)
    db.query(PaymentAuditLog).filter(PaymentAuditLog.action == "CANCEL").update({"created_at": _noon(TODAY["value"])})
    db.commit()

    unusual = ins.Unusual(db)
    kinds = sorted(item["kind"] for item in unusual["items"])
    assert kinds == ["BACKDATED", "CANCELLATIONS", "DISCOUNT"] and unusual["openCount"] == 3
    discount = next(i for i in unusual["items"] if i["kind"] == "DISCOUNT")
    assert discount["title"].startswith("₹300.00 discount on MP-MRCPT-") and "(27% of what it settled)" in discount["title"]
    assert "Reason: Sibling" in discount["detail"] and discount["actorName"] == "Admin One"
    backdated = next(i for i in unusual["items"] if i["kind"] == "BACKDATED")
    assert "dated 5 Nov, entered 20 Nov (15 days later)" in backdated["title"]
    cancels = next(i for i in unusual["items"] if i["kind"] == "CANCELLATIONS")
    assert cancels["title"] == "3 cancellations by Admin One on 20 Nov (2 payments, 1 invoice)"

    # Review one; it stays listed, marked, and leaves the open count.
    ins.MarkReviewed(db, Key=discount["key"], Note="Sibling discount agreed", Actor=admin)
    after = ins.Unusual(db)
    assert after["openCount"] == 2 and after["reviewedCount"] == 1
    assert next(i for i in after["items"] if i["kind"] == "DISCOUNT")["reviewed"]["note"] == "Sibling discount agreed"
    assert len(ins.Unusual(db, IncludeReviewed=False)["items"]) == 2
    ins.UndoReviewed(db, Key=discount["key"], Actor=admin)
    assert ins.Unusual(db)["openCount"] == 3
    with pytest.raises(HTTPException) as bad:
        ins.MarkReviewed(db, Key="DROP TABLE", Note=None, Actor=admin)
    assert _code(bad) == "INSIGHT_KEY_INVALID"

    # Raise the limits: the 27% discount and the 15-day gap stop counting.
    with pytest.raises(HTTPException) as invalid:
        ins.UpdateSettings(db, Fields={"discountPercent": 0}, Actor=admin)
    assert _code(invalid) == "INSIGHT_SETTING_INVALID"
    saved = ins.UpdateSettings(db, Fields={"discountPercent": "30", "backdatedDays": 20, "cancellationsPerDay": 4}, Actor=admin)
    assert (saved["discountPercent"], saved["backdatedDays"], saved["cancellationsPerDay"]) == (30, 20, 4)
    assert ins.Unusual(db)["items"] == []
    assert ins.HomeInsights(db)["unusualOpen"] == 0
    # Outside the window (7 days) nothing from before shows.
    ins.UpdateSettings(db, Fields={"discountPercent": 20, "backdatedDays": 7, "cancellationsPerDay": 3}, Actor=admin)
    TODAY["value"] = date(2026, 12, 15)
    assert ins.Unusual(db, Days=7)["items"] == [] and ins.Unusual(db, Days=30)["openCount"] == 3


def test_activity_feed_groups_runs_and_pages():
    db, admin = _setup()
    _pay(db, admin, "s1", "MathPath Bag", 35000, "pay-r6-0007")
    feed = ins.Activity(db)
    assert [item["icon"] for item in feed["items"][:2]] == ["payment", "invoice"]
    assert feed["items"][0]["text"].startswith("Recorded MP-MRCPT-631: ₹350.00 from Aarav Sen (Cash")
    assert feed["items"][0]["href"].startswith("/admin/payments/collections?tab=payments&open=")
    raised = feed["items"][1]
    assert raised["count"] == 4 and raised["text"] == "Raised 4 invoices (MP-INV-001037 to MP-INV-001040), ₹2,900.00"
    assert feed["items"][0]["actorName"] == "Admin One" and {"userId": "admin-1", "name": "Admin One"} in feed["people"]
    assert [item["icon"] for item in ins.Activity(db, Type="payments")["items"]] == ["payment"]
    assert all(item["entityType"] in ("FEE_ITEM", "CENTRE", "BUSINESS_PROFILE", "NUMBER_SEQUENCE") for item in ins.Activity(db, Type="SETTINGS")["items"])
    first = ins.Activity(db, Limit=1)
    assert len(first["items"]) == 1 and first["nextBefore"]
    second = ins.Activity(db, Limit=1, Before=first["nextBefore"])
    assert second["items"][0]["count"] == 4  # the folded invoices come next
    assert ins.Activity(db, Type="CANCELLATIONS")["items"] == []


def test_search_finds_expenses_and_api_routes():
    from app.main import app

    db, admin = _setup()
    rent = db.query(ExpenseCategory).filter_by(name="Rent").one().id
    made = exp.CreateExpense(db, Request={"expenseDate": "2026-11-05", "categoryId": rent, "item": "November rent", "vendor": "Salt Lake Estates", "billNumber": "SLE-4471", "methods": [{"method": "UPI", "amountPaise": 3000000}]}, IdempotencyKey="exp-r6-00001", Actor=admin)
    found = home.Search(db, "sle-4471")["expenses"]
    assert [row["expenseNumber"] for row in found] == [made["expenseNumber"]] and found[0]["amountDisplay"] == "₹30,000.00"
    assert home.Search(db, made["expenseNumber"].lower())["expenses"][0]["expenseId"] == made["expenseId"]

    app.dependency_overrides[get_db] = lambda: db
    try:
        app.dependency_overrides[get_current_user] = lambda: db.get(User, "user-s1")
        client = TestClient(app)
        for path in ("/api/admin/payments/insights", "/api/admin/payments/activity", "/api/admin/payments/students/s1/statement/pdf"):
            assert client.get(path).status_code == 403
        app.dependency_overrides[get_current_user] = lambda: admin
        insights = client.get("/api/admin/payments/insights", params={"days": 7}).json()
        assert insights["unusual"]["days"] == 7 and insights["forecast"]["billed"]["display"] == "₹2,900.00"
        assert client.get("/api/admin/payments/insights/settings").json()["discountAmount"]["display"] == "₹500.00"
        assert client.put("/api/admin/payments/insights/settings", json={"discountAmount": "750"}).json()["discountAmount"]["display"] == "₹750.00"
        assert client.put("/api/admin/payments/insights/settings", json={"backdatedDays": 0}).status_code == 422
        home_data = client.get("/api/admin/payments/home").json()
        assert home_data["insights"]["rate"] == 0 and home_data["insights"]["monthLabel"] == "November 2026"
        assert home_data["activity"][0]["text"] == "Changed the unusual-activity limits" and len(home_data["activity"]) <= 8
        assert home_data["activity"][1]["text"].startswith("Added expense MP-EXP-") and home_data["activity"][1]["text"].endswith("November rent, ₹30,000.00")
        feed = client.get("/api/admin/payments/activity", params={"type": "EXPENSES"}).json()
        assert [item["entityType"] for item in feed["items"]] == ["EXPENSE"]
        pdf = client.get("/api/admin/payments/students/s1/statement/pdf")
        assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF" and "Statement-MP-S1-2026-11-20.pdf" in pdf.headers["content-disposition"]
        assert client.get("/api/admin/payments/students/nobody/statement/pdf").status_code == 404
        assert client.post("/api/admin/payments/insights/reviews", json={"key": "nonsense"}).status_code == 422
    finally:
        app.dependency_overrides.clear()
