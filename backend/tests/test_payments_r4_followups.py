"""Payments revamp R4 (2026-10-09): follow-ups -- the priority list, logging
contacts and promises, in-app reminders (single and bulk), templates."""

from datetime import date

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Notification, PaymentFollowUp, User
from app.services.payments import followups_service as fu
from app.services.payments import invoices_service as inv
from app.services.payments import numbering, online_service as online, receipts_service as rec
from tests.test_payments_phase2_invoices import _code, _req, _session, _world

TODAY = {"value": date(2026, 11, 20)}


@pytest.fixture(autouse=True)
def _today(monkeypatch):
    from datetime import datetime, timedelta, timezone

    TODAY["value"] = date(2026, 11, 20)
    monkeypatch.setattr(inv, "TodayInIndia", lambda: TODAY["value"])
    ticks = iter(range(1, 10**6))
    # The follow-up clock follows the test's "today" (noon in India).
    monkeypatch.setattr(fu, "_Now", lambda: datetime(TODAY["value"].year, TODAY["value"].month, TODAY["value"].day, 6, 30, tzinfo=timezone.utc) + timedelta(seconds=next(ticks)))


def _setup(fees_on=True):
    """s1 and s2 each owe Monthly Fee 1,100 + Bag 350, due 11 Nov (9 days overdue)."""
    db = _session()
    admin, monthly, bag = _world(db)
    numbering.SetStartingNumber(db, Key="RECEIPT", NextNumber=631, Actor=admin)
    online.UpdateOnlineSettings(db, Fields={"studentFeesEnabled": fees_on}, Actor=admin)
    db.commit()
    inv.GenerateInvoices(db, Request=_req([monthly, bag], students=("s1", "s2")), IdempotencyKey="gen-r4-00001", Actor=admin)
    return db, admin


def _pay(db, admin, student, amount, key):
    bag = next(i for i in inv.ListInvoices(db, Filters={"studentId": student}, PageSize=50)["invoices"] if i["feeName"] == "MathPath Bag")
    return rec.RecordPayment(db, StudentId=student, Request={"paymentDate": TODAY["value"].isoformat(), "allocations": [{"invoiceId": bag["invoiceId"], "amountPaise": amount}], "methods": [{"method": "CASH", "amountPaise": amount}]}, IdempotencyKey=key, Actor=admin)


def test_list_is_most_urgent_first_with_views():
    db, admin = _setup()
    _pay(db, admin, "s1", 35000, "pay-r4-0001")  # s1 now owes 1,100, s2 1,450
    data = fu.FollowUps(db)
    assert [row["studentId"] for row in data["students"]] == ["s2", "s1"]
    s2 = data["students"][0]
    assert s2["dueDisplay"] == "₹1,450.00" and s2["maxDaysOverdue"] == 9 and s2["suggestedTemplate"] == "GENTLE"
    assert s2["followUp"]["lastContact"] is None and s2["followUp"]["promise"] is None
    counts = {view["key"]: view["count"] for view in data["views"]}
    assert counts == {"ALL": 2, "OVERDUE": 2, "TODAY": 0, "MISSED": 0, "NEVER": 2, "RECENT": 0}
    assert data["inAppAvailable"] is True
    assert fu.SuggestedTemplate(45) == "FIRM" and fu.SuggestedTemplate(61) == "FINAL"
    assert [row["studentId"] for row in fu.FollowUps(db, Search="bina")["students"]] == ["s2"]


def test_contacts_and_promises_today_missed_kept():
    db, admin = _setup()
    with pytest.raises(HTTPException) as bad:
        fu.LogContact(db, StudentIds=["s1"], Channel="WHATSAPP", Note=None, PromiseDate=None, Actor=admin)
    assert _code(bad) == "CHANNEL_INVALID"
    with pytest.raises(HTTPException) as past:
        fu.LogContact(db, StudentIds=["s1"], Channel="CALL", Note=None, PromiseDate="2026-11-19", Actor=admin)
    assert _code(past) == "PROMISE_DATE_INVALID"

    fu.LogContact(db, StudentIds=["s1", "s2"], Channel="CALL", Note="No answer", PromiseDate=None, Actor=admin)
    result = fu.LogContact(db, StudentIds=["s1"], Channel="CALL", Note="Will pay Saturday", PromiseDate="2026-11-21", Actor=admin)
    assert result["logged"] == 1 and result["promiseDate"] == "2026-11-21"
    data = fu.FollowUps(db)
    s1 = next(row for row in data["students"] if row["studentId"] == "s1")
    assert s1["followUp"]["lastContact"]["note"] == "Will pay Saturday" and s1["followUp"]["promise"]["state"] == "UPCOMING"
    assert {v["key"]: v["count"] for v in data["views"]}["RECENT"] == 2

    TODAY["value"] = date(2026, 11, 21)
    assert [row["studentId"] for row in fu.FollowUps(db, View="TODAY")["students"]] == ["s1"]
    TODAY["value"] = date(2026, 11, 22)
    assert [row["studentId"] for row in fu.FollowUps(db, View="MISSED")["students"]] == ["s1"]
    assert fu.HomeFollowUps(db)["promiseMissed"] == 1
    _pay(db, admin, "s1", 35000, "pay-r4-0002")
    assert fu.StudentFollowUp(db, "s1")["promise"]["state"] == "KEPT"
    assert fu.FollowUps(db, View="MISSED")["students"] == []

    note = fu.AddNote(db, StudentId="s2", Note="Father travels; call the mother", Actor=admin)
    assert note["entries"][0]["kind"] == "NOTE" and note["entries"][0]["byName"] == "Admin One"
    assert [e["kind"] for e in note["entries"]] == ["NOTE", "CONTACT"]


def test_in_app_reminders_single_bulk_and_once_a_day():
    db, admin = _setup()
    _pay(db, admin, "s1", 35000, "pay-r4-0003")
    sent = fu.RemindInApp(db, StudentIds=["s1", "s2", "s3"], TemplateKey="firm", Origin="https://mock.mathpath.in", Actor=admin)
    assert sent["sent"] == 2 and [s["reason"] for s in sent["skipped"]] == ["Owes nothing"]  # s3 has no invoices
    notes = db.query(Notification).filter_by(type="FEES_REMINDER").all()
    assert len(notes) == 2 and {n.title for n in notes} == {"Fees overdue"}
    s2_note = next(n for n in notes if n.student_id == "s2")
    assert "₹1,450.00 is overdue for Bina Roy (MP-S2)" in s2_note.message and "MathPath Bag" in s2_note.message
    assert "the Fees page in the MathPath app" in s2_note.message  # no pay link yet
    entries = db.query(PaymentFollowUp).filter_by(kind="REMINDER").all()
    assert len(entries) == 2 and {e.channel for e in entries} == {"IN_APP"} and {e.template_key for e in entries} == {"FIRM"}
    again = fu.RemindInApp(db, StudentIds=["s2"], TemplateKey="GENTLE", Origin=None, Actor=admin)
    assert again["sent"] == 0 and again["skipped"][0]["reason"] == "Already reminded in the app in the last 24 hours"
    assert fu.StudentFollowUp(db, "s2")["remindedRecently"] is True

    off = _setup(fees_on=False)[0]
    with pytest.raises(HTTPException) as tab_off:
        fu.RemindInApp(off, StudentIds=["s1"], TemplateKey="GENTLE", Origin=None, Actor=admin)
    assert _code(tab_off) == "FEES_TAB_OFF"


def test_templates_edit_render_and_pay_link():
    db, admin = _setup()
    templates = fu.ListTemplates(db)
    assert [t["key"] for t in templates["templates"]] == ["GENTLE", "FIRM", "FINAL"] and all(t["isDefault"] for t in templates["templates"])
    with pytest.raises(HTTPException) as unknown:
        fu.UpdateTemplate(db, Key="GENTLE", Body="Hello {name}", Actor=admin)
    assert _code(unknown) == "TEMPLATE_UNKNOWN_PLACEHOLDER"
    fu.UpdateTemplate(db, Key="GENTLE", Body="Hi {parent}, {amount_due} due for {student}.\nPay: {pay_link}", Actor=admin)
    preview = fu.ReminderPreview(db, StudentId="s2", TemplateKey="GENTLE", Origin="https://mock.mathpath.in")
    assert preview["text"] == "Hi Parent Bina, ₹1,450.00 due for Bina Roy."  # the pay-link line is left out: no link
    from datetime import datetime, timedelta, timezone

    from app.models import PaymentLink

    db.add(PaymentLink(token="tok-r4-test-000000000001", student_id="s2", status="ACTIVE", expires_at=datetime.now(timezone.utc) + timedelta(days=30)))
    db.commit()
    with_link = fu.ReminderPreview(db, StudentId="s2", TemplateKey="GENTLE", Origin="https://mock.mathpath.in")["text"]
    assert with_link.startswith("Hi Parent Bina") and "Pay: https://mock.mathpath.in/pay/tok-r4-test-000000000001" in with_link
    bad_origin = fu.ReminderPreview(db, StudentId="s2", TemplateKey="GENTLE", Origin="javascript:alert(1)")["text"]
    assert "Pay:" not in bad_origin
    reset = fu.ResetTemplate(db, Key="GENTLE", Actor=admin)
    assert reset["templates"][0]["isDefault"] is True
    with pytest.raises(HTTPException) as nothing:
        fu.ReminderPreview(db, StudentId="s3", TemplateKey="GENTLE", Origin=None)
    assert _code(nothing) == "NOTHING_DUE"


def test_followups_api_is_admin_only():
    from app.main import app

    db, admin = _setup()
    app.dependency_overrides[get_db] = lambda: db
    try:
        app.dependency_overrides[get_current_user] = lambda: db.get(User, "user-s1")
        client = TestClient(app)
        assert client.get("/api/admin/payments/followups").status_code == 403
        assert client.post("/api/admin/payments/followups/remind", json={"studentIds": ["s1"], "template": "GENTLE"}).status_code == 403
        app.dependency_overrides[get_current_user] = lambda: admin
        assert len(client.get("/api/admin/payments/followups").json()["students"]) == 2
        logged = client.post("/api/admin/payments/followups/contacts", json={"studentIds": ["s1"], "channel": "IN_PERSON", "note": "Met at the centre", "promiseDate": "2026-11-20"})
        assert logged.status_code == 200 and logged.json()["channelLabel"] == "In person"
        assert client.get("/api/admin/payments/home").json()["followUps"]["promisedToday"] == 1
        assert client.get("/api/admin/payments/followups/students/s1").json()["promise"]["state"] == "TODAY"
        assert client.get("/api/admin/payments/followups/students/s1/reminder", params={"template": "FINAL"}).json()["text"].startswith("Dear Parent Aarav")
        assert client.put("/api/admin/payments/followups/templates/FIRM", json={"body": "Pay {amount_due}"}).json()["templates"][1]["body"] == "Pay {amount_due}"
        assert client.post("/api/admin/payments/followups/remind", json={"studentIds": ["s1"], "template": "FIRM"}).json()["sent"] == 1
    finally:
        app.dependency_overrides.clear()
