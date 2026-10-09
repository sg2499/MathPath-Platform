"""Payments Phase 5 (2026-10-09): the student Fees tab, Razorpay orders,
checkout verification, the webhook, pay links, notifications and the
Online Payments log. Razorpay itself is replaced by FakeRazorpay: no test
reaches the internet."""

import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core import config
from app.core.rate_limit import limiter
from app.database import get_db
from app.dependencies import get_current_user
from app.models import (
    Notification,
    OnlinePaymentEvent,
    OnlinePaymentOrder,
    PaymentInvoice,
    PaymentLink,
    PaymentMethodLine,
    PaymentNumberSequence,
    PaymentReceipt,
    User,
)
from app.services.payments import invoices_service as inv
from app.services.payments import numbering
from app.services.payments import online_service as online
from app.services.payments import razorpay_client as rzp
from app.services.payments import receipts_service as rec
from tests.test_payments_phase2_invoices import _code, _req, _session, _world

KEY_SECRET = "test_key_secret_123"
WEBHOOK_SECRET = "whsec_test_456"
PAID_AT = int(datetime(2026, 11, 20, 4, 30, tzinfo=timezone.utc).timestamp())  # 10:00 IST


class FakeRazorpay:
    """Stands in for Razorpay: orders, payments, capture."""

    def __init__(self):
        self.orders = {}
        self.payments = {}
        self.captures = []
        self.count = 0
        self.fail_create = False

    def CreateOrder(self, *, AmountPaise, Receipt, Notes):
        if self.fail_create:
            raise rzp.RazorpayError("Authentication failed", Status=401)
        self.count += 1
        order_id = f"order_TEST{self.count:010d}"
        self.orders[order_id] = {"id": order_id, "amount": AmountPaise, "receipt": Receipt, "notes": Notes}
        return dict(self.orders[order_id])

    def FetchPayment(self, PaymentId):
        if PaymentId not in self.payments:
            raise rzp.RazorpayError("The id provided does not exist", Status=400)
        return dict(self.payments[PaymentId])

    def CapturePayment(self, PaymentId, AmountPaise):
        payment = self.payments[PaymentId]
        if payment["status"] != "authorized":
            raise rzp.RazorpayError("This payment has already been captured", Status=400)
        payment["status"] = "captured"
        self.captures.append(PaymentId)
        return dict(payment)

    def FetchOrderPayments(self, OrderId):
        return [dict(p) for p in self.payments.values() if p["order_id"] == OrderId]

    def pay(self, order_id, *, status="captured", method="upi", amount=None, n=None):
        payment_id = f"pay_TEST{(n or len(self.payments) + 1):010d}"
        self.payments[payment_id] = {
            "id": payment_id, "entity": "payment", "order_id": order_id, "currency": "INR",
            "amount": amount if amount is not None else self.orders[order_id]["amount"],
            "status": status, "method": method, "created_at": PAID_AT,
            "email": "parent@example.test", "contact": "+919800000000", "vpa": "parent@upi",
            "error_description": "Payment was declined by the bank" if status == "failed" else None,
        }
        return payment_id


def _sign(order_id, payment_id):
    import hashlib
    import hmac

    return hmac.new(KEY_SECRET.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()


def _webhook_signature(body: bytes):
    import hashlib
    import hmac

    return hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()


@pytest.fixture(autouse=True)
def _razorpay(monkeypatch):
    from datetime import date

    monkeypatch.setattr(inv, "TodayInIndia", lambda: date(2026, 11, 20))
    monkeypatch.setattr(config, "RAZORPAY_KEY_ID", "rzp_test_ABCDEFGH1234")
    monkeypatch.setattr(config, "RAZORPAY_KEY_SECRET", KEY_SECRET)
    monkeypatch.setattr(config, "RAZORPAY_WEBHOOK_SECRET", WEBHOOK_SECRET)
    fake = FakeRazorpay()
    rzp.SetRazorpayClient(fake)
    limiter.reset()
    yield fake
    rzp.SetRazorpayClient(None)


def _setup(*, fees=True, online_on=True):
    db = _session()
    admin, monthly, bag = _world(db)
    numbering.SetStartingNumber(db, Key="RECEIPT", NextNumber=631, Actor=admin)
    db.commit()
    online.UpdateOnlineSettings(db, Fields={"studentFeesEnabled": fees, "onlinePaymentsEnabled": online_on}, Actor=admin)
    inv.GenerateInvoices(db, Request=_req([monthly, bag], students=("s1", "s2")), IdempotencyKey="gen-00000001", Actor=admin)
    return db, admin


def _invoices(db, student="s1"):
    return db.query(PaymentInvoice).filter(PaymentInvoice.student_id == student).order_by(PaymentInvoice.invoice_number).all()


def _student(db, sid="s1"):
    from app.models import Student

    return db.get(Student, sid)


def _order(db, student="s1", invoice_ids=None, source="STUDENT", link=None):
    return online.CreateOrder(db, StudentId=student, InvoiceIds=invoice_ids, Source=source, PayLink=link)


# --- Razorpay signatures ---------------------------------------------------------

def test_signatures_match_known_values():
    # Worked out independently with: openssl dgst -sha256 -hmac <secret>
    assert rzp.PaymentSignatureIsValid(
        "order_TEST0000000001", "pay_TEST0000000001",
        "d7dad990c7fdc107335c06c079ed074ca24945da1873c5b45c55bb042f7af531", Secret="test_key_secret_123",
    )
    assert not rzp.PaymentSignatureIsValid(
        "order_TEST0000000001", "pay_TEST0000000002",
        "d7dad990c7fdc107335c06c079ed074ca24945da1873c5b45c55bb042f7af531", Secret="test_key_secret_123",
    )
    assert rzp.WebhookSignatureIsValid(
        b'{"event":"payment.captured"}', "b36eb1e07c2b02ab8628c87b3a344fb20c292255ca81a012a33a3494df9fa5ed", Secret="whsec_test_456",
    )
    assert not rzp.WebhookSignatureIsValid(b'{"event":"payment.captured"} ', "b36eb1e07c2b02ab8628c87b3a344fb20c292255ca81a012a33a3494df9fa5ed", Secret="whsec_test_456")
    assert not rzp.PaymentSignatureIsValid("order_x", "pay_x", "", Secret="s")
    assert not rzp.PaymentSignatureIsValid("order_x", "pay_x", "ü" * 64, Secret="s")  # junk is a clean no
    assert not rzp.WebhookSignatureIsValid(b"{}", "ü" * 64, Secret="s")
    assert not rzp.WebhookSignatureIsValid(b"{}", "abc", Secret="")


def test_key_mode_and_masking(monkeypatch):
    assert rzp.KeyMode() == "TEST" and rzp.MaskedKeyId() == "rzp_test_…1234"
    monkeypatch.setattr(config, "RAZORPAY_KEY_ID", "rzp_live_ZZZZZZZZ9876")
    assert rzp.KeyMode() == "LIVE"
    monkeypatch.setattr(config, "RAZORPAY_KEY_ID", "something_else")
    assert rzp.KeyMode() is None and not rzp.KeysReady()


# --- Settings -------------------------------------------------------------------

def test_online_payments_cannot_be_switched_on_until_ready(monkeypatch):
    db = _session()
    admin, monthly, bag = _world(db)
    monkeypatch.setattr(config, "RAZORPAY_KEY_SECRET", "")
    with pytest.raises(HTTPException) as excinfo:
        online.UpdateOnlineSettings(db, Fields={"onlinePaymentsEnabled": True}, Actor=admin)
    assert _code(excinfo) == "ONLINE_NOT_READY" and "RAZORPAY_KEY_SECRET" in excinfo.value.detail["message"]
    assert "receipt number" in excinfo.value.detail["message"]
    monkeypatch.setattr(config, "RAZORPAY_KEY_SECRET", KEY_SECRET)
    monkeypatch.setattr(config, "RAZORPAY_WEBHOOK_SECRET", "")
    with pytest.raises(HTTPException) as excinfo:
        online.UpdateOnlineSettings(db, Fields={"onlinePaymentsEnabled": True}, Actor=admin)
    assert "RAZORPAY_WEBHOOK_SECRET" in excinfo.value.detail["message"]
    monkeypatch.setattr(config, "RAZORPAY_WEBHOOK_SECRET", WEBHOOK_SECRET)
    numbering.SetStartingNumber(db, Key="RECEIPT", NextNumber=631, Actor=admin)
    db.commit()
    settings = online.UpdateOnlineSettings(db, Fields={"onlinePaymentsEnabled": True, "studentFeesEnabled": True}, Actor=admin)
    assert settings["onlinePaymentsLive"] is True and settings["keyMode"] == "TEST" and settings["problems"] == []
    assert "RAZORPAY" not in json.dumps(settings).replace("RAZORPAY_", "")  # no secret is ever sent
    assert KEY_SECRET not in json.dumps(settings) and WEBHOOK_SECRET not in json.dumps(settings)
    # Keys removed from the server later: switched on, but not live.
    monkeypatch.setattr(config, "RAZORPAY_KEY_ID", "")
    assert online.OnlineSettingsPayload(db)["onlinePaymentsLive"] is False
    assert online.OnlinePaymentsLive(db) is False


def test_the_fees_tab_is_closed_while_switched_off():
    db, admin = _setup(fees=False)
    assert online.StudentFeesSummary(db, _student(db)) == {"enabled": False}
    with pytest.raises(HTTPException) as excinfo:
        online.StudentFees(db, _student(db))
    assert _code(excinfo) == "FEES_NOT_ENABLED"
    # Nobody was notified about the invoices either.
    assert db.query(Notification).filter(Notification.category == "FEES").count() == 0


def test_new_invoices_notify_each_student_once():
    db, admin = _setup()
    notes = db.query(Notification).filter(Notification.category == "FEES").order_by(Notification.recipient_user_id).all()
    assert [(n.recipient_user_id, n.title, n.type) for n in notes] == [
        ("user-s1", "2 new invoices", "FEES_INVOICE_RAISED"), ("user-s2", "2 new invoices", "FEES_INVOICE_RAISED"),
    ]
    assert "₹1,450.00 to pay" in notes[0].message and notes[0].target_route == "/student/fees"


def test_student_fees_shows_only_their_own_dues():
    db, admin = _setup()
    fees = online.StudentFees(db, _student(db))
    assert fees["totals"]["dueDisplay"] == "₹1,450.00" and fees["totals"]["unpaidCount"] == 2
    assert {i["feeName"] for i in fees["unpaidInvoices"]} == {"Monthly Fee", "MathPath Bag"}
    assert all(i["invoiceNumber"] in {r.invoice_number for r in _invoices(db, "s1")} for i in fees["invoices"])
    assert "createdByName" not in fees["invoices"][0] and fees["online"]["live"] is True
    summary = online.StudentFeesSummary(db, _student(db))
    assert summary["enabled"] and summary["unpaidCount"] == 2 and summary["overdueCount"] == 2  # due 11 Nov, today 20 Nov


# --- Orders ---------------------------------------------------------------------

def test_order_amount_is_worked_out_on_the_server(_razorpay):
    db, admin = _setup()
    fee, bag = _invoices(db)
    made = _order(db, invoice_ids=[fee.id])
    assert made["amountPaise"] == 110000 and made["keyId"] == "rzp_test_ABCDEFGH1234" and made["reused"] is False
    assert made["invoiceNumbers"] == [fee.invoice_number] and made["prefill"]["contact"] == "9800000000"
    assert KEY_SECRET not in json.dumps(made)
    sent = _razorpay.orders[made["razorpayOrderId"]]
    assert sent["amount"] == 110000 and sent["notes"]["platform"] == "mathpath-new"
    all_due = _order(db)
    assert all_due["amountPaise"] == 145000 and all_due["razorpayOrderId"] != made["razorpayOrderId"]


def test_pressing_pay_again_reuses_the_order(_razorpay):
    db, admin = _setup()
    first = _order(db)
    second = _order(db)
    assert second["reused"] is True and second["orderRef"] == first["orderRef"] and _razorpay.count == 1


@pytest.mark.parametrize("case,code", [("other-student", "INVOICES_CHANGED"), ("paid", "INVOICES_CHANGED"), ("empty", "NO_INVOICES_CHOSEN"), ("off", "ONLINE_PAYMENTS_OFF")])
def test_orders_are_refused_with_a_clear_reason(case, code):
    db, admin = _setup()
    fee, bag = _invoices(db)
    ids = [fee.id]
    if case == "other-student":
        ids = [_invoices(db, "s2")[0].id]
    elif case == "paid":
        rec.RecordPayment(db, StudentId="s1", Request={"paymentDate": "2026-11-20", "allocations": [{"invoiceId": fee.id, "amountPaise": 110000}], "methods": [{"method": "CASH", "amountPaise": 110000}]}, IdempotencyKey="cash-000001", Actor=admin)
    elif case == "empty":
        ids = []
    elif case == "off":
        online.UpdateOnlineSettings(db, Fields={"onlinePaymentsEnabled": False}, Actor=admin)
    with pytest.raises(HTTPException) as excinfo:
        _order(db, invoice_ids=ids)
    assert _code(excinfo) == code
    db.rollback()
    assert db.query(OnlinePaymentOrder).count() == 0


def test_nothing_due_and_razorpay_down(_razorpay):
    db, admin = _setup()
    _razorpay.fail_create = True
    with pytest.raises(HTTPException) as excinfo:
        _order(db)
    assert _code(excinfo) == "RAZORPAY_UNAVAILABLE" and excinfo.value.status_code == 502
    db.rollback()
    for invoice in _invoices(db):
        inv.CancelInvoice(db, InvoiceId=invoice.id, Reason="test", Actor=admin)
    _razorpay.fail_create = False
    with pytest.raises(HTTPException) as excinfo:
        _order(db)
    assert _code(excinfo) == "NOTHING_DUE"


# --- Verify -----------------------------------------------------------------------

def _verify(db, made, payment_id, signature=None):
    order = db.get(OnlinePaymentOrder, made["orderRef"])
    return online.VerifyCheckout(
        db, Order=order, RazorpayOrderId=made["razorpayOrderId"], RazorpayPaymentId=payment_id,
        Signature=signature if signature is not None else _sign(made["razorpayOrderId"], payment_id),
    )


def test_a_verified_payment_is_recorded_once(_razorpay):
    db, admin = _setup()
    fee, bag = _invoices(db)
    made = _order(db)
    payment_id = _razorpay.pay(made["razorpayOrderId"])
    result = _verify(db, made, payment_id)
    assert result["status"] == "PAID" and result["receiptNumber"] == "MP-MRCPT-631" and result["receiptAmountDisplay"] == "₹1,450.00"
    receipt = db.query(PaymentReceipt).one()
    assert (receipt.channel, receipt.source, receipt.received_by_name, receipt.payment_date.isoformat()) == ("ONLINE", "STUDENT", "Online (Razorpay)", "2026-11-20")
    assert "UPI" in receipt.note
    line = db.query(PaymentMethodLine).one()
    assert (line.method, line.amount_paise, line.reference) == ("RAZORPAY", 145000, payment_id)
    db.refresh(fee)
    db.refresh(bag)
    assert fee.status == bag.status == "PAID"
    order = db.get(OnlinePaymentOrder, made["orderRef"])
    assert (order.status, order.razorpay_payment_id, order.method_detail) == ("PAID", payment_id, "UPI")
    assert db.query(Notification).filter(Notification.type == "FEES_PAYMENT_RECEIVED", Notification.recipient_user_id == "user-s1").count() == 1
    # Pressed again, or the page retried: the same receipt, nothing new.
    again = _verify(db, made, payment_id)
    assert again["receiptNumber"] == "MP-MRCPT-631" and db.query(PaymentReceipt).count() == 1
    assert db.get(PaymentNumberSequence, "RECEIPT").next_number == 632
    # The parent's email, phone and UPI id are never stored.
    for event in db.query(OnlinePaymentEvent).all():
        assert "parent@" not in (event.payload_json or "") and "9800000000" not in (event.payload_json or "")


def test_a_bad_signature_records_nothing(_razorpay):
    db, admin = _setup()
    made = _order(db)
    payment_id = _razorpay.pay(made["razorpayOrderId"])
    with pytest.raises(HTTPException) as excinfo:
        _verify(db, made, payment_id, signature="0" * 64)
    assert _code(excinfo) == "PAYMENT_NOT_VERIFIED"
    with pytest.raises(HTTPException):
        _verify(db, made, "pay_<script>")
    assert db.query(PaymentReceipt).count() == 0
    assert db.query(OnlinePaymentEvent).filter(OnlinePaymentEvent.event_type == "SIGNATURE_INVALID").count() == 2


def test_an_authorised_payment_is_captured_then_recorded(_razorpay):
    db, admin = _setup()
    made = _order(db)
    payment_id = _razorpay.pay(made["razorpayOrderId"], status="authorized", method="card")
    _razorpay.payments[payment_id]["card"] = {"network": "Visa", "last4": "1111"}
    result = _verify(db, made, payment_id)
    assert result["status"] == "PAID" and _razorpay.captures == [payment_id]
    assert db.get(OnlinePaymentOrder, made["orderRef"]).method_detail == "Card (Visa)"
    assert "1111" not in json.dumps([e.payload_json for e in db.query(OnlinePaymentEvent).all()])


def test_paid_at_the_counter_meanwhile_goes_to_advance_then_other_dues(_razorpay):
    db, admin = _setup()
    fee, bag = _invoices(db)
    made = _order(db, invoice_ids=[fee.id])
    rec.RecordPayment(db, StudentId="s1", Request={"paymentDate": "2026-11-20", "allocations": [{"invoiceId": fee.id, "amountPaise": 110000}], "methods": [{"method": "CASH", "amountPaise": 110000}]}, IdempotencyKey="cash-000001", Actor=admin)
    payment_id = _razorpay.pay(made["razorpayOrderId"])
    _verify(db, made, payment_id)
    db.refresh(bag)
    online_receipt = db.query(PaymentReceipt).filter(PaymentReceipt.channel == "ONLINE").one()
    assert bag.status == "PAID"  # ₹350 of the ₹1,100 went to the bag
    assert rec.AdvanceRemaining(db, online_receipt) == 75000 and rec.StudentAdvanceBalance(db, "s1") == 75000


def test_a_failed_payment_is_logged_and_notified_once(_razorpay):
    db, admin = _setup()
    made = _order(db)
    order = db.get(OnlinePaymentOrder, made["orderRef"])
    online.LogCheckoutEvent(db, Order=order, Type="FAILED", Detail="Payment was declined by the bank", PaymentId="pay_TEST0000000009")
    online.LogCheckoutEvent(db, Order=order, Type="FAILED", Detail="Declined again", PaymentId=None)
    online.LogCheckoutEvent(db, Order=order, Type="DISMISSED", Detail=None, PaymentId=None)
    db.refresh(order)
    assert order.status == "FAILED" and order.last_error == "Declined again"
    assert db.query(Notification).filter(Notification.type == "FEES_ONLINE_FAILED").count() == 1
    with pytest.raises(HTTPException):
        online.LogCheckoutEvent(db, Order=order, Type="HACKED", Detail=None, PaymentId=None)
    # A failed try does not stop a later success on the same order.
    payment_id = _razorpay.pay(made["razorpayOrderId"])
    assert _verify(db, made, payment_id)["status"] == "PAID"


def test_receipt_numbering_lost_after_the_order_needs_attention_then_check_fixes_it(_razorpay):
    db, admin = _setup()
    made = _order(db)
    seq = db.get(PaymentNumberSequence, "RECEIPT")
    seq.is_configured = False
    db.commit()
    payment_id = _razorpay.pay(made["razorpayOrderId"])
    result = _verify(db, made, payment_id)
    assert result["status"] == "ATTENTION" and "confirming" in result["message"]
    assert "receipt number" in db.get(OnlinePaymentOrder, made["orderRef"]).last_error  # the office's version
    assert online.StudentFees(db, _student(db))["confirming"][0]["amountDisplay"] == "₹1,450.00"
    seq = db.get(PaymentNumberSequence, "RECEIPT")
    seq.is_configured = True
    db.commit()
    checked = online.CheckOrderWithRazorpay(db, OrderRef=made["orderRef"], Actor=admin)
    assert checked["status"] == "PAID" and checked["receiptNumber"] == "MP-MRCPT-631"
    assert [e["type"] for e in checked["events"]][-1] == "PAYMENT_RECORDED"


def test_check_with_razorpay_when_nothing_was_paid(_razorpay):
    db, admin = _setup()
    made = _order(db)
    checked = online.CheckOrderWithRazorpay(db, OrderRef=made["orderRef"], Actor=admin)
    assert checked["status"] == "CREATED" and checked["events"][-1]["type"] == "NO_PAYMENT"
    assert "Admin One" in checked["events"][-1]["detail"]


# --- Webhook ----------------------------------------------------------------------

def _webhook_body(event, payment):
    return json.dumps({"entity": "event", "event": event, "payload": {"payment": {"entity": payment}}}).encode()


def test_webhook_records_a_payment_when_the_tab_was_closed(_razorpay):
    db, admin = _setup()
    made = _order(db)
    payment_id = _razorpay.pay(made["razorpayOrderId"])
    body = _webhook_body("payment.captured", _razorpay.payments[payment_id])
    status, result = online.HandleWebhook(db, Body=body, Signature=_webhook_signature(body), EventId="evt_0001")
    assert status == 200 and result["outcome"] == "PAID"
    assert db.query(PaymentReceipt).count() == 1
    # The same webhook again, and the browser's verify arriving late: still one.
    status, result = online.HandleWebhook(db, Body=body, Signature=_webhook_signature(body), EventId="evt_0001")
    assert result["status"] == "duplicate"
    body2 = json.dumps({"entity": "event", "event": "order.paid", "payload": {"payment": {"entity": _razorpay.payments[payment_id]}, "order": {"entity": {"id": made["razorpayOrderId"]}}}}).encode()
    assert online.HandleWebhook(db, Body=body2, Signature=_webhook_signature(body2), EventId="evt_0002")[0] == 200
    assert _verify(db, made, payment_id)["receiptNumber"] == "MP-MRCPT-631"
    assert db.query(PaymentReceipt).count() == 1


def test_webhook_refuses_a_bad_signature_and_ignores_other_orders(_razorpay, monkeypatch):
    db, admin = _setup()
    made = _order(db)
    payment_id = _razorpay.pay(made["razorpayOrderId"])
    body = _webhook_body("payment.captured", _razorpay.payments[payment_id])
    assert online.HandleWebhook(db, Body=body, Signature="f" * 64, EventId="evt_x")[0] == 400
    stranger = {**_razorpay.payments[payment_id], "id": "pay_OLDPLATFORM01", "order_id": "order_OLDPLATFORM01"}
    other = _webhook_body("payment.captured", stranger)
    assert online.HandleWebhook(db, Body=other, Signature=_webhook_signature(other), EventId="evt_y") == (200, {"status": "ignored"})
    assert db.query(PaymentReceipt).count() == 0 and db.query(OnlinePaymentEvent).filter(OnlinePaymentEvent.razorpay_event_id.isnot(None)).count() == 0
    monkeypatch.setattr(config, "RAZORPAY_WEBHOOK_SECRET", "")
    assert online.HandleWebhook(db, Body=body, Signature=_webhook_signature(body), EventId="evt_z")[0] == 503


def test_webhook_captures_an_authorised_payment_and_logs_a_failure(_razorpay):
    db, admin = _setup()
    made = _order(db)
    failed = _razorpay.pay(made["razorpayOrderId"], status="failed")
    body = _webhook_body("payment.failed", _razorpay.payments[failed])
    assert online.HandleWebhook(db, Body=body, Signature=_webhook_signature(body), EventId="evt_f")[1]["outcome"] == "FAILED"
    assert db.get(OnlinePaymentOrder, made["orderRef"]).status == "FAILED"
    good = _razorpay.pay(made["razorpayOrderId"], status="authorized")
    body = _webhook_body("payment.authorized", _razorpay.payments[good])
    assert online.HandleWebhook(db, Body=body, Signature=_webhook_signature(body), EventId="evt_a")[1]["outcome"] == "PAID"
    assert _razorpay.captures == [good] and db.get(OnlinePaymentOrder, made["orderRef"]).status == "PAID"
    # A late failure webhook for the earlier try never undoes the payment.
    body = _webhook_body("payment.failed", _razorpay.payments[failed])
    online.HandleWebhook(db, Body=body, Signature=_webhook_signature(body), EventId="evt_f2")
    assert db.get(OnlinePaymentOrder, made["orderRef"]).status == "PAID"


def test_a_second_payment_on_a_paid_order_is_kept_as_advance(_razorpay):
    db, admin = _setup()
    made = _order(db, invoice_ids=[_invoices(db)[0].id])
    first = _razorpay.pay(made["razorpayOrderId"])
    _verify(db, made, first)
    second = _razorpay.pay(made["razorpayOrderId"])
    body = _webhook_body("payment.captured", _razorpay.payments[second])
    online.HandleWebhook(db, Body=body, Signature=_webhook_signature(body), EventId="evt_2")
    receipts = db.query(PaymentReceipt).order_by(PaymentReceipt.receipt_number).all()
    assert len(receipts) == 2 and "refund" in receipts[1].note
    order = db.get(OnlinePaymentOrder, made["orderRef"])
    assert order.razorpay_payment_id == first and order.payment_receipt_id == receipts[0].id


def test_online_payment_amount_cannot_be_edited(_razorpay):
    db, admin = _setup()
    fee, bag = _invoices(db)
    made = _order(db, invoice_ids=[fee.id])
    payment_id = _razorpay.pay(made["razorpayOrderId"])
    receipt_id = _verify(db, made, payment_id)["paymentId"]
    with pytest.raises(HTTPException) as excinfo:
        rec.EditPayment(db, PaymentId=receipt_id, Request={"allocations": [{"invoiceId": fee.id, "amountPaise": 100000}], "methods": [{"method": "RAZORPAY", "amountPaise": 100000, "reference": payment_id}]}, Reason="x", Actor=admin)
    assert _code(excinfo) == "ONLINE_AMOUNT_FIXED"
    db.rollback()
    # Moving where it is applied is allowed.
    edited = rec.EditPayment(db, PaymentId=receipt_id, Request={"allocations": [{"invoiceId": bag.id, "amountPaise": 35000}], "keepAdvance": True, "methods": [{"method": "RAZORPAY", "amountPaise": 110000, "reference": payment_id}]}, Reason="wrong invoice", Actor=admin)
    assert edited["advancePaise"] == 75000


# --- Online Payments log ------------------------------------------------------------

def test_the_log_lists_filters_and_counts(_razorpay):
    db, admin = _setup()
    paid = _order(db, invoice_ids=[_invoices(db)[0].id])
    _verify(db, paid, _razorpay.pay(paid["razorpayOrderId"]))
    failed = _order(db, student="s2")
    online.LogCheckoutEvent(db, Order=db.get(OnlinePaymentOrder, failed["orderRef"]), Type="FAILED", Detail="declined", PaymentId=None)
    log = online.ListOnlineOrders(db, Filters={})
    assert log["totalCount"] == 2 and log["counts"]["PAID"] == 1 and log["counts"]["FAILED"] == 1 and log["paidDisplay"] == "₹1,100.00"
    assert online.ListOnlineOrders(db, Filters={"status": "PAID"})["orders"][0]["receiptNumber"] == "MP-MRCPT-631"
    assert online.ListOnlineOrders(db, Filters={"search": "bina"})["totalCount"] == 1
    assert online.ListOnlineOrders(db, Filters={"search": "MP-MRCPT-631"})["totalCount"] == 1
    assert online.ListOnlineOrders(db, Filters={"search": paid["razorpayOrderId"].lower()})["totalCount"] == 1
    old = db.get(OnlinePaymentOrder, failed["orderRef"])
    old.status = "CREATED"
    old.created_at = datetime.now(timezone.utc) - timedelta(hours=3)
    db.commit()
    assert online.ListOnlineOrders(db, Filters={"status": "ABANDONED"})["orders"][0]["statusLabel"] == "Not completed"
    detail = online.GetOnlineOrder(db, paid["orderRef"])
    assert [e["type"] for e in detail["events"]] == ["ORDER_CREATED", "PAYMENT_RECORDED"]


# --- Pay links ----------------------------------------------------------------------

def test_pay_link_lifecycle(_razorpay):
    db, admin = _setup()
    made = online.CreatePayLink(db, StudentId="s1", Actor=admin)
    token = made["link"]["token"]
    assert len(token) >= 32 and made["link"]["path"] == f"/pay/{token}"
    assert online.CreatePayLink(db, StudentId="s1", Actor=admin)["link"]["token"] == token  # one live link
    link = online.ResolvePayLink(db, token)
    page = online.PublicPayPage(db, link, CountOpen=True)
    assert page["dueDisplay"] == "₹1,450.00" and page["student"]["name"] == "Aarav Sen" and page["onlinePaymentsLive"]
    assert "mobile" not in json.dumps(page["student"]) and db.get(PaymentLink, link.id).open_count == 1
    order = online.CreateOrder(db, StudentId="s1", InvoiceIds=None, Source="PAY_LINK", PayLink=link)
    assert order["prefill"] == {}
    payment_id = _razorpay.pay(order["razorpayOrderId"])
    result = online.VerifyCheckout(db, Order=online.PayLinkOrder(db, OrderRef=order["orderRef"], Link=link), RazorpayOrderId=order["razorpayOrderId"], RazorpayPaymentId=payment_id, Signature=_sign(order["razorpayOrderId"], payment_id))
    assert result["status"] == "PAID"
    page = online.PublicPayPage(db, link, CountOpen=False)
    assert page["duePaise"] == 0 and page["paidWithThisLink"][0]["receiptNumber"] == "MP-MRCPT-631"
    assert online.PayLinkReceiptForPdf(db, Link=link, PaymentId=result["paymentId"]).receipt_number == "MP-MRCPT-631"
    assert db.query(PaymentReceipt).one().source == "PAY_LINK"
    online.RevokePayLink(db, LinkId=link.id, Actor=admin)
    with pytest.raises(HTTPException) as excinfo:
        online.ResolvePayLink(db, token)
    assert excinfo.value.status_code == 410 and _code(excinfo) == "PAY_LINK_REVOKED"


def test_pay_link_expiry_and_scope(_razorpay):
    db, admin = _setup()
    link_one = online.ResolvePayLink(db, online.CreatePayLink(db, StudentId="s1", Actor=admin)["link"]["token"])
    link_two = online.ResolvePayLink(db, online.CreatePayLink(db, StudentId="s2", Actor=admin)["link"]["token"])
    order = online.CreateOrder(db, StudentId="s1", InvoiceIds=None, Source="PAY_LINK", PayLink=link_one)
    with pytest.raises(HTTPException) as excinfo:
        online.PayLinkOrder(db, OrderRef=order["orderRef"], Link=link_two)
    assert excinfo.value.status_code == 404
    counter = rec.RecordPayment(db, StudentId="s1", Request={"paymentDate": "2026-11-20", "allocations": [], "keepAdvance": True, "methods": [{"method": "CASH", "amountPaise": 5000}]}, IdempotencyKey="cash-000009", Actor=admin)
    with pytest.raises(HTTPException):
        online.PayLinkReceiptForPdf(db, Link=link_one, PaymentId=counter["paymentId"])  # not paid with the link
    row = db.get(PaymentLink, link_one.id)
    row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()
    with pytest.raises(HTTPException) as excinfo:
        online.ResolvePayLink(db, row.token)
    assert _code(excinfo) == "PAY_LINK_EXPIRED"
    for bad in ["short", "x" * 40, "../../etc/passwd"]:
        with pytest.raises(HTTPException) as excinfo:
            online.ResolvePayLink(db, bad)
        assert excinfo.value.status_code == 404
    online.UpdateOnlineSettings(db, Fields={"onlinePaymentsEnabled": False}, Actor=admin)
    with pytest.raises(HTTPException) as excinfo:
        online.CreatePayLink(db, StudentId="s1", Actor=admin)
    assert _code(excinfo) == "ONLINE_PAYMENTS_OFF"


# --- API: who can see what ------------------------------------------------------------

def _client(db, user):
    from app.main import app

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db
    return app, TestClient(app)


def test_student_api_end_to_end_and_access_rules(_razorpay):
    db, admin = _setup()
    student_one = db.get(User, "user-s1")
    app, client = _client(db, student_one)
    try:
        summary = client.get("/api/student/fees/summary").json()
        assert summary["enabled"] and summary["unpaidCount"] == 2
        fees = client.get("/api/student/fees").json()
        mine = fees["unpaidInvoices"][0]["invoiceId"]
        theirs = _invoices(db, "s2")[0].id
        assert client.get(f"/api/student/fees/invoices/{mine}/pdf").content.startswith(b"%PDF")
        assert client.get(f"/api/student/fees/invoices/{theirs}/pdf").status_code == 404
        made = client.post("/api/student/fees/orders", json={"invoiceIds": [mine]})
        assert made.status_code == 200 and made.json()["amountPaise"] == 110000
        assert client.post("/api/student/fees/orders", json={"invoiceIds": [theirs]}).status_code == 409
        order = made.json()
        payment_id = _razorpay.pay(order["razorpayOrderId"])
        verify = client.post(f"/api/student/fees/orders/{order['orderRef']}/verify", json={"razorpay_order_id": order["razorpayOrderId"], "razorpay_payment_id": payment_id, "razorpay_signature": _sign(order["razorpayOrderId"], payment_id)})
        assert verify.status_code == 200 and verify.json()["receiptNumber"] == "MP-MRCPT-631"
        assert client.get(f"/api/student/fees/orders/{order['orderRef']}").json()["status"] == "PAID"
        receipt = client.get(f"/api/student/fees/receipts/{verify.json()['paymentId']}/pdf")
        assert receipt.status_code == 200 and receipt.content.startswith(b"%PDF")
        assert client.post(f"/api/student/fees/orders/{order['orderRef']}/events", json={"type": "DISMISSED"}).status_code == 200
        # Admin routes are closed to a student.
        assert client.get("/api/admin/payments/online/orders").status_code == 403
        assert client.post("/api/admin/payments/students/s1/pay-link").status_code == 403
    finally:
        app.dependency_overrides.clear()

    # Another student cannot see, verify or download any of it.
    app, client = _client(db, db.get(User, "user-s2"))
    try:
        assert client.get(f"/api/student/fees/orders/{order['orderRef']}").status_code == 404
        assert client.post(f"/api/student/fees/orders/{order['orderRef']}/verify", json={"razorpay_order_id": order["razorpayOrderId"], "razorpay_payment_id": payment_id, "razorpay_signature": _sign(order["razorpayOrderId"], payment_id)}).status_code == 404
        assert client.get(f"/api/student/fees/receipts/{verify.json()['paymentId']}/pdf").status_code == 404
        assert client.get(f"/api/student/fees/invoices/{mine}/pdf").status_code == 404
    finally:
        app.dependency_overrides.clear()

    # An admin is not a student.
    app, client = _client(db, admin)
    try:
        assert client.get("/api/student/fees").status_code == 403
        log = client.get("/api/admin/payments/online/orders").json()
        assert log["totalCount"] == 1 and log["settings"]["keyMode"] == "TEST"
        assert client.get(f"/api/admin/payments/online/orders/{order['orderRef']}").json()["receiptNumber"] == "MP-MRCPT-631"
        assert client.post(f"/api/admin/payments/online/orders/{order['orderRef']}/check").status_code == 200
        settings = client.put("/api/admin/payments/online/settings", json={"studentFeesEnabled": False})
        assert settings.status_code == 200 and settings.json()["studentFeesEnabled"] is False and settings.json()["onlinePaymentsEnabled"] is True
    finally:
        app.dependency_overrides.clear()


def test_public_pay_link_and_webhook_api(_razorpay):
    from app.main import app

    db, admin = _setup()
    token = online.CreatePayLink(db, StudentId="s2", Actor=admin)["link"]["token"]
    app.dependency_overrides[get_db] = lambda: db
    client = TestClient(app)
    try:
        page = client.get(f"/api/pay/{token}")
        assert page.status_code == 200 and page.json()["dueDisplay"] == "₹1,450.00"
        assert client.get("/api/pay/not-a-real-token-at-all-000000").status_code == 404
        order = client.post(f"/api/pay/{token}/orders", json={}).json()
        payment_id = _razorpay.pay(order["razorpayOrderId"])
        body = _webhook_body("payment.captured", _razorpay.payments[payment_id])
        bad = client.post("/api/payments/razorpay/webhook", content=body, headers={"X-Razorpay-Signature": "0" * 64, "Content-Type": "application/json"})
        assert bad.status_code == 400
        good = client.post("/api/payments/razorpay/webhook", content=body, headers={"X-Razorpay-Signature": _webhook_signature(body), "X-Razorpay-Event-Id": "evt_api_1", "Content-Type": "application/json"})
        assert good.status_code == 200 and good.json()["outcome"] == "PAID"
        status = client.get(f"/api/pay/{token}/orders/{order['orderRef']}").json()
        assert status["status"] == "PAID"
        pdf = client.get(f"/api/pay/{token}/receipts/{status['paymentId']}/pdf")
        assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
        assert client.get(f"/api/pay/{token}?refresh=1").json()["duePaise"] == 0
    finally:
        app.dependency_overrides.clear()


def test_a_payment_razorpay_cannot_confirm_yet_is_retried_and_shown_as_confirming(_razorpay):
    db, admin = _setup()
    made = _order(db)
    payment_id = _razorpay.pay(made["razorpayOrderId"], status="authorized")

    def broken(*args, **kwargs):
        raise rzp.RazorpayError("Razorpay is down")

    _razorpay.CapturePayment = broken
    _razorpay.FetchPayment = broken
    body = _webhook_body("payment.authorized", _razorpay.payments[payment_id])
    status, result = online.HandleWebhook(db, Body=body, Signature=_webhook_signature(body), EventId="evt_pending")
    assert status == 503 and result["status"] == "pending"  # Razorpay sends it again later
    assert db.query(OnlinePaymentEvent).filter(OnlinePaymentEvent.razorpay_event_id == "evt_pending").count() == 0
    order = db.get(OnlinePaymentOrder, made["orderRef"])
    assert order.razorpay_payment_id == payment_id
    listed = online.ListOnlineOrders(db, Filters={})["orders"][0]
    assert listed["statusLabel"] == "Confirming" and listed["status"] == "CREATED"
    order.created_at = datetime.now(timezone.utc) - timedelta(hours=2)
    db.commit()
    assert online.ListOnlineOrders(db, Filters={"status": "ABANDONED"})["totalCount"] == 0  # never "Not completed"
    assert online.StudentFees(db, _student(db))["confirming"][0]["amountDisplay"] == "₹1,450.00"
    # A late failure from the browser does not turn it into "Failed".
    online.LogCheckoutEvent(db, Order=order, Type="FAILED", Detail="timeout", PaymentId=None)
    assert db.get(OnlinePaymentOrder, made["orderRef"]).status == "CREATED"
    # Razorpay is back: the retry records it once.
    del _razorpay.CapturePayment, _razorpay.FetchPayment
    status, result = online.HandleWebhook(db, Body=body, Signature=_webhook_signature(body), EventId="evt_pending")
    assert status == 200 and result["outcome"] == "PAID" and db.query(PaymentReceipt).count() == 1
