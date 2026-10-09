"""Payments revamp R3 (2026-10-09): monthly billing -- billing modes, the
automatic drafts on the 1st, drop / restore, and Release."""

from datetime import date

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Notification, PaymentAllocation, PaymentAuditLog, PaymentBillingSettings, PaymentInvoice, PaymentInvoiceDraft, User
from app.services.payments import billing_service as bill
from app.services.payments import invoices_service as inv
from app.services.payments import numbering, online_service as online, receipts_service as rec
from app.services.payments import setup_service as setup
from tests.test_payments_phase2_invoices import _code, _req, _session, _world

TODAY = {"value": date(2026, 10, 20)}


@pytest.fixture(autouse=True)
def _today(monkeypatch):
    TODAY["value"] = date(2026, 10, 20)
    monkeypatch.setattr(inv, "TodayInIndia", lambda: TODAY["value"])


def _setup(intl=True, fees_on=True):
    db = _session()
    admin, monthly, bag = _world(db)
    intl_id = None
    if intl:
        intl_id = setup.CreateFeeItem(db, Name="Monthly Fee International", Amount="2200", BillingType="MONTHLY", Actor=admin)["feeItemId"]
        db.commit()
    numbering.SetStartingNumber(db, Key="RECEIPT", NextNumber=631, Actor=admin)
    online.UpdateOnlineSettings(db, Fields={"studentFeesEnabled": fees_on}, Actor=admin)
    db.commit()
    bill.BillingSettings(db)  # first opened in October 2026
    db.commit()
    return db, admin, monthly, intl_id, bag


def test_settings_guess_the_fees_and_start_automatic_drafts_next_month():
    db, admin, monthly, intl, bag = _setup()
    settings = bill.BillingSettings(db)
    assert settings["indiaFee"]["feeItemId"] == monthly and settings["indiaFee"]["display"] == "₹1,100.00"
    assert settings["internationalFee"]["feeItemId"] == intl and settings["internationalFee"]["display"] == "₹2,200.00"
    assert settings["autoDraftsEnabled"] is True and settings["autoFromPeriod"] == "2026-11" and settings["nextAutoLabel"] == "November 2026"
    assert settings["counts"] == {"INDIA": 2, "INTERNATIONAL": 0} and settings["problems"] == []

    with pytest.raises(HTTPException) as one_time:
        bill.UpdateBillingSettings(db, Request={"internationalFeeItemId": bag}, Actor=admin)
    assert _code(one_time) == "FEE_ITEM_NOT_MONTHLY"
    with pytest.raises(HTTPException) as same:
        bill.UpdateBillingSettings(db, Request={"internationalFeeItemId": monthly}, Actor=admin)
    assert _code(same) == "SAME_FEE_FOR_BOTH"
    db.rollback()

    result = bill.SetStudentModes(db, StudentIds=["s2"], Mode="international", Actor=admin)
    assert result["studentsChanged"] == 1 and result["modeLabel"] == "International"
    assert bill.BillingSettings(db)["counts"] == {"INDIA": 1, "INTERNATIONAL": 1}
    unset = bill.UpdateBillingSettings(db, Request={"internationalFeeItemId": None}, Actor=admin)
    assert unset["problems"] == ["Choose the monthly fee for International students (1 student)."]
    off = bill.UpdateBillingSettings(db, Request={"autoDraftsEnabled": False}, Actor=admin)
    assert off["autoDraftsEnabled"] is False and off["nextAutoLabel"] is None
    TODAY["value"] = date(2026, 12, 5)
    on = bill.UpdateBillingSettings(db, Request={"autoDraftsEnabled": True}, Actor=admin)
    assert on["autoFromPeriod"] == "2027-01"  # switched back on: from next month


def test_automatic_drafts_run_once_on_the_first_and_are_not_invoices():
    db, admin, monthly, intl, bag = _setup()
    assert bill.EnsureMonthlyDrafts(db) == 0  # October: before the first automatic month
    TODAY["value"] = date(2026, 11, 1)
    assert bill.EnsureMonthlyDrafts(db) == 2  # s1 and s2; s3 is inactive
    assert bill.EnsureMonthlyDrafts(db) == 0  # once a month
    drafts = db.query(PaymentInvoiceDraft).all()
    assert {(d.student_id, d.period_key, d.status, d.source) for d in drafts} == {("s1", "2026-11", "DRAFT", "AUTO"), ("s2", "2026-11", "DRAFT", "AUTO")}
    assert db.query(PaymentInvoice).count() == 0 and db.query(Notification).count() == 0
    assert db.get(PaymentBillingSettings, "default").last_auto_period == "2026-11"
    TODAY["value"] = date(2026, 12, 3)  # the server was down on the 1st
    assert bill.EnsureMonthlyDrafts(db) == 2


def test_month_view_drop_restore_and_release():
    db, admin, monthly, intl, bag = _setup()
    bill.SetStudentModes(db, StudentIds=["s2"], Mode="INTERNATIONAL", Actor=admin)
    TODAY["value"] = date(2026, 11, 1)
    bill.EnsureMonthlyDrafts(db)
    # s1 holds ₹500 advance.
    rec.RecordPayment(db, StudentId="s1", Request={"paymentDate": "2026-11-01", "allocations": [], "methods": [{"method": "CASH", "amountPaise": 50000}], "keepAdvance": True}, IdempotencyKey="adv-000001", Actor=admin)
    month = bill.MonthBilling(db, "2026-11")
    assert month["periodLabel"] == "November 2026" and month["counts"]["ready"] == 2 and month["counts"]["notBilled"] == 0
    by = {row["studentId"]: row for row in month["drafts"]}
    assert by["s1"]["fee"]["display"] == "₹1,100.00" and by["s1"]["advanceToApply"]["display"] == "₹500.00" and by["s1"]["dueAfterAdvance"]["display"] == "₹600.00"
    assert by["s2"]["fee"]["display"] == "₹2,200.00" and by["s2"]["billingModeLabel"] == "International"
    assert month["readyTotal"]["display"] == "₹3,300.00" and month["readyAdvance"]["display"] == "₹500.00"
    assert month["problems"] == []

    with pytest.raises(HTTPException) as no_reason:
        bill.DropDraft(db, DraftId=by["s2"]["draftId"], Reason="  ", Actor=admin)
    assert _code(no_reason) == "REASON_REQUIRED"
    dropped = bill.DropDraft(db, DraftId=by["s2"]["draftId"], Reason="Left in October", Actor=admin)
    assert {r["studentId"]: r["status"] for r in dropped["drafts"]}["s2"] == "DROPPED"
    restored = bill.RestoreDraft(db, DraftId=by["s2"]["draftId"], Actor=admin)
    assert {r["studentId"]: r["status"] for r in restored["drafts"]}["s2"] == "DRAFT"

    TODAY["value"] = date(2026, 11, 3)
    result = bill.ReleaseDrafts(db, PeriodValue="2026-11", DraftIds=[by["s1"]["draftId"], by["s2"]["draftId"]], IdempotencyKey="release-0001", Actor=admin)
    assert result["released"] == 2 and result["notReleased"] == []
    invoices = {i.student_id: i for i in db.query(PaymentInvoice).all()}
    assert invoices["s1"].fee_name == "Monthly Fee" and invoices["s1"].amount_paise == 110000
    assert invoices["s2"].fee_name == "Monthly Fee International" and invoices["s2"].amount_paise == 220000
    assert invoices["s1"].invoice_date == date(2026, 11, 3) and invoices["s1"].due_date == date(2026, 11, 13)
    assert {i.period_key for i in invoices.values()} == {"2026-11"} and sorted(i.invoice_number for i in invoices.values()) == ["MP-INV-001037", "MP-INV-001038"]
    advance = db.query(PaymentAllocation).filter_by(invoice_id=invoices["s1"].id, kind="ADVANCE").one()
    assert advance.amount_paise == 50000  # the advance was applied on release
    drafts = {d.student_id: d for d in db.query(PaymentInvoiceDraft).all()}
    assert drafts["s1"].status == "RELEASED" and drafts["s1"].released_invoice_id == invoices["s1"].id
    notes = db.query(Notification).filter_by(type="FEES_INVOICE_RAISED").all()
    assert len(notes) == 2  # the bell, while the Fees tab is on
    again = bill.ReleaseDrafts(db, PeriodValue="2026-11", DraftIds=[by["s1"]["draftId"]], IdempotencyKey="release-0002", Actor=admin)
    assert again["replayed"] is True and db.query(PaymentInvoice).count() == 2
    assert [a.action for a in db.query(PaymentAuditLog).filter_by(entity_type="BILLING", entity_id="2026-11").all()] == ["AUTO_DRAFT", "RELEASE"]


def test_already_invoiced_students_are_skipped_and_not_drafted():
    db, admin, monthly, intl, bag = _setup()
    TODAY["value"] = date(2026, 11, 1)
    bill.EnsureMonthlyDrafts(db)
    # s1 was billed by hand meanwhile (Invoices > Generate).
    inv.GenerateInvoices(db, Request=_req([monthly], students=("s1",)), IdempotencyKey="gen-hand-01", Actor=admin)
    month = bill.MonthBilling(db, "2026-11")
    by = {row["studentId"]: row for row in month["drafts"]}
    assert by["s1"]["issue"].startswith("Already has Monthly Fee for November 2026 (MP-INV-001037)")
    result = bill.ReleaseDrafts(db, PeriodValue="2026-11", DraftIds=[by["s1"]["draftId"], by["s2"]["draftId"]], IdempotencyKey="release-0003", Actor=admin)
    assert result["released"] == 1 and result["notReleased"][0]["reason"].startswith("Already has Monthly Fee for November 2026")
    drafts = {d.student_id: d for d in db.query(PaymentInvoiceDraft).all()}
    assert drafts["s1"].status == "DROPPED" and drafts["s1"].drop_reason.startswith("Not released: Already has")
    assert db.query(PaymentInvoice).filter_by(student_id="s1").count() == 1

    # Only s1 left: everything already billed -> drafts closed, nothing raised.
    bill.RestoreDraft(db, DraftId=drafts["s1"].id, Actor=admin)
    none = bill.ReleaseDrafts(db, PeriodValue="2026-11", DraftIds=[drafts["s1"].id], IdempotencyKey="release-0004", Actor=admin)
    assert none["released"] == 0 and db.query(PaymentInvoice).count() == 2
    # A manual "Create drafts" skips students already invoiced.
    assert bill.CreateDrafts(db, PeriodValue="2026-12", StudentIds=None, Actor=admin)["draftsCreated"] == 2
    assert bill.CreateDrafts(db, PeriodValue="2026-11", StudentIds=None, Actor=admin)["draftsCreated"] == 0
    with pytest.raises(HTTPException) as far:
        bill.CreateDrafts(db, PeriodValue="2027-01", StudentIds=None, Actor=admin)
    assert _code(far) == "PERIOD_INVALID"


def test_release_needs_a_fee_for_every_mode_and_home_counts():
    db, admin, monthly, intl, bag = _setup(intl=False)
    bill.SetStudentModes(db, StudentIds=["s2"], Mode="INTERNATIONAL", Actor=admin)
    TODAY["value"] = date(2026, 11, 2)
    bill.EnsureMonthlyDrafts(db)
    month = bill.MonthBilling(db)
    assert month["period"] == "2026-11" and "Choose the monthly fee for International students (1 student)." in month["problems"]
    by = {row["studentId"]: row for row in month["drafts"]}
    assert by["s2"]["issue"] == "No monthly fee chosen for International students"
    with pytest.raises(HTTPException) as missing:
        bill.ReleaseDrafts(db, PeriodValue="2026-11", DraftIds=[by["s2"]["draftId"]], IdempotencyKey="release-0005", Actor=admin)
    assert _code(missing) == "BILLING_FEE_NOT_SET"
    home = bill.HomeBilling(db)
    assert home["waiting"] == 2 and home["notBilled"] == 0 and home["periodLabel"] == "November 2026"
    assert bill.StudentBilling(db, "s2")["state"] == "DRAFT" and bill.StudentBilling(db, "s2")["billingModeLabel"] == "International"


def test_billing_api_is_admin_only():
    from app.main import app

    db, admin, monthly, intl, bag = _setup()
    app.dependency_overrides[get_db] = lambda: db
    try:
        app.dependency_overrides[get_current_user] = lambda: db.get(User, "user-s1")
        client = TestClient(app)
        assert client.get("/api/admin/payments/billing/month").status_code == 403
        assert client.post("/api/admin/payments/billing/students/mode", json={"studentIds": ["s1"], "mode": "INDIA"}).status_code == 403
        app.dependency_overrides[get_current_user] = lambda: admin
        assert client.get("/api/admin/payments/billing/settings").json()["indiaFee"]["feeItemId"] == monthly
        assert len(client.get("/api/admin/payments/billing/students").json()["students"]) == 3
        assert client.post("/api/admin/payments/billing/students/mode", json={"studentIds": ["s2"], "mode": "INTERNATIONAL"}).json()["studentsChanged"] == 1
        made = client.post("/api/admin/payments/billing/month/2026-10/drafts", json={})
        assert made.status_code == 200 and made.json()["draftsCreated"] == 2
        month = client.get("/api/admin/payments/billing/month", params={"period": "2026-10"}).json()
        ids = [row["draftId"] for row in month["drafts"]]
        released = client.post("/api/admin/payments/billing/month/2026-10/release", json={"draftIds": ids, "idempotencyKey": "release-api-01"})
        assert released.status_code == 200 and released.json()["released"] == 2
        assert client.get("/api/admin/payments/billing/students/s1").json()["state"] == "INVOICED"
        assert client.get("/api/admin/payments/home").json()["billing"]["periodLabel"] == "October 2026"
    finally:
        app.dependency_overrides.clear()


def test_international_competition_slot_students_start_as_international():
    from datetime import datetime, timezone

    from app.models import CompetitionEvent, CompetitionEventAssignment, CompetitionEventSlot

    db = _session()
    admin, monthly, bag = _world(db)
    event = CompetitionEvent(id="ev-1", name="Annual 2026", competition_date=datetime(2026, 10, 11, tzinfo=timezone.utc))
    db.add(event)
    db.flush()
    start = datetime(2026, 10, 11, 15, tzinfo=timezone.utc)
    db.add_all([
        CompetitionEventSlot(id="slot-in", event_id="ev-1", mode="ONLINE_INDIA", scheduled_start_at=start, scheduled_end_at=start),
        CompetitionEventSlot(id="slot-intl", event_id="ev-1", mode="ONLINE_INTL", scheduled_start_at=start, scheduled_end_at=start),
    ])
    db.flush()
    db.add_all([
        CompetitionEventAssignment(event_id="ev-1", student_id="s1", assigned_level_code="IM-L3", slot_id="slot-in"),
        CompetitionEventAssignment(event_id="ev-1", student_id="s2", assigned_level_code="IM-L3", slot_id="slot-intl"),
    ])
    db.commit()
    settings = bill.BillingSettings(db)
    assert settings["counts"] == {"INDIA": 1, "INTERNATIONAL": 1}
    modes = {row["studentId"]: row["billingMode"] for row in bill.ListStudentModes(db)}
    assert modes == {"s1": "INDIA", "s2": "INTERNATIONAL", "s3": "INDIA"}
    # Only once: an admin's later change is never overwritten.
    bill.SetStudentModes(db, StudentIds=["s2"], Mode="INDIA", Actor=admin)
    assert bill.BillingSettings(db)["counts"] == {"INDIA": 2, "INTERNATIONAL": 0}
