"""Payments Phase 5 (2026-10-09): the student Fees tab, online payments
with Razorpay, parent pay links and the Online Payments log.

How a payment flows:
  1. CreateOrder -- the student (or a parent on a pay link) picks unpaid
     invoices. The server works out the amount from those invoices' balances
     (the browser never sends an amount) and makes a Razorpay order.
  2. Razorpay Checkout takes the money in the browser.
  3. VerifyCheckout -- the browser sends back Razorpay's payment id and
     signature. The signature is checked, the payment is fetched from
     Razorpay, captured if it is only authorised, and recorded as a money
     receipt (RecordOnlinePayment).
  4. HandleWebhook -- Razorpay also tells this site directly. This is the
     safety net when the parent closes the tab after paying: the payment is
     still recorded.

Recording is idempotent per Razorpay payment id (the receipt's
idempotency key is "rzp-<payment id>"), and every recording locks the
student's row first, so the browser and the webhook arriving together
record the payment once. Orders this site did not make (the old
platform's, on the same Razorpay account) are ignored.
"""
from __future__ import annotations

import json
import re
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import (
    Level,
    OnlinePaymentEvent,
    OnlinePaymentOrder,
    PaymentBusinessProfile,
    PaymentCentre,
    PaymentInvoice,
    PaymentLink,
    PaymentMethodLine,
    PaymentOnlineSettings,
    PaymentReceipt,
    Student,
    User,
)
from app.services.payments import razorpay_client as rzp
from app.services.payments.audit import WritePaymentAudit
from app.services.payments.money import FormatIndianRupees, PaiseToRupeesString

MIN_ORDER_PAISE = 100  # Razorpay's smallest payment is ₹1
REUSE_ORDER_MINUTES = 30
OPEN_ORDER_MINUTES = 30
PAY_LINK_DAYS = 30
SYSTEM_ACTOR = "Razorpay"
SOURCE_LABELS = {"STUDENT": "Student login", "PAY_LINK": "Pay link"}
ORDER_STATUS_LABELS = {
    "CREATED": "Awaiting payment",
    "ABANDONED": "Not completed",
    "FAILED": "Failed",
    "PAID": "Paid",
    "ATTENTION": "Needs attention",
}
EVENT_LABELS = {
    "ORDER_CREATED": "Order created",
    "CHECKOUT_DISMISSED": "Pop-up closed without paying",
    "CHECKOUT_FAILED": "Payment failed in the pop-up",
    "SIGNATURE_INVALID": "Signature did not match",
    "PAYMENT_RECORDED": "Payment recorded",
    "ALREADY_RECORDED": "Already recorded",
    "PAYMENT_CAPTURED": "Payment captured",
    "PAYMENT_FAILED": "Payment failed",
    "NOT_RECORDED": "Money received, not recorded",
    "NO_PAYMENT": "No payment yet",
    "PAYMENT_PENDING": "Payment pending",
}


def _Now() -> datetime:
    return datetime.now(timezone.utc)


def _Aware(Value: datetime | None) -> datetime | None:
    if Value is None:
        return None
    return Value if Value.tzinfo else Value.replace(tzinfo=timezone.utc)


def _Iso(Value: datetime | None) -> str | None:
    """Always with its time zone (SQLite hands back naive UTC times)."""
    return _Aware(Value).isoformat() if Value else None


def _Clean(Value: Any, Limit: int) -> str | None:
    Text = re.sub(r"\s+", " ", str(Value or "")).strip()
    return Text[:Limit] or None


# ----------------------------------------------------------------------------
# Settings and readiness
# ----------------------------------------------------------------------------

def GetOnlineSettingsRow(db: Session) -> PaymentOnlineSettings:
    Row = db.get(PaymentOnlineSettings, "default")
    if Row is None:
        Row = PaymentOnlineSettings(id="default", student_fees_enabled=False, online_payments_enabled=False)
        db.add(Row)
        try:
            db.flush()
        except IntegrityError:  # a parallel request made it a moment ago
            db.rollback()
            Row = db.get(PaymentOnlineSettings, "default")
    return Row


def _ReceiptNumberingReady(db: Session) -> bool:
    from app.services.payments.receipts_service import _ReceiptNumberingReady as Ready

    return bool(Ready(db)["numberingReady"])


def StudentFeesEnabled(db: Session) -> bool:
    Row = db.get(PaymentOnlineSettings, "default")
    return bool(Row and Row.student_fees_enabled)


def OnlineProblems(db: Session) -> list[str]:
    """What stops online payments from working right now (empty = ready)."""
    Problems = []
    if not rzp.KeyId():
        Problems.append("The Razorpay key id (RAZORPAY_KEY_ID) is not set on the server.")
    elif not rzp.KeyMode():
        Problems.append("RAZORPAY_KEY_ID on the server is not a Razorpay key (it should start rzp_test_ or rzp_live_).")
    if not rzp.KeysReady() and rzp.KeyMode():
        Problems.append("The Razorpay key secret (RAZORPAY_KEY_SECRET) is not set on the server.")
    if not rzp.WebhookSecretSet():
        Problems.append("The webhook secret (RAZORPAY_WEBHOOK_SECRET) is not set on the server, so a payment would not be recorded if the parent closes the page straight after paying.")
    if not _ReceiptNumberingReady(db):
        Problems.append("The starting receipt number is not set (Payment Settings > Document Numbering).")
    return Problems


def OnlinePaymentsLive(db: Session) -> bool:
    Row = db.get(PaymentOnlineSettings, "default")
    return bool(Row and Row.online_payments_enabled) and not OnlineProblems(db)


def OnlineSettingsPayload(db: Session) -> dict[str, Any]:
    Row = GetOnlineSettingsRow(db)
    Problems = OnlineProblems(db)
    return {
        "studentFeesEnabled": bool(Row.student_fees_enabled),
        "onlinePaymentsEnabled": bool(Row.online_payments_enabled),
        "onlinePaymentsLive": bool(Row.online_payments_enabled) and not Problems,
        "keyMode": rzp.KeyMode(),
        "keyIdMasked": rzp.MaskedKeyId(),
        "keysReady": rzp.KeysReady(),
        "webhookSecretSet": rzp.WebhookSecretSet(),
        "receiptNumberingReady": _ReceiptNumberingReady(db),
        "problems": Problems,
        "webhookPath": "/api/payments/razorpay/webhook",
        "webhookEvents": ["payment.authorized", "payment.captured", "payment.failed", "order.paid"],
        "updatedAt": _Iso(Row.updated_at),
    }


def UpdateOnlineSettings(db: Session, *, Fields: dict[str, Any], Actor: User | None) -> dict[str, Any]:
    Row = GetOnlineSettingsRow(db)
    Before = {"studentFeesEnabled": bool(Row.student_fees_enabled), "onlinePaymentsEnabled": bool(Row.online_payments_enabled)}
    if "studentFeesEnabled" in Fields and Fields["studentFeesEnabled"] is not None:
        Row.student_fees_enabled = bool(Fields["studentFeesEnabled"])
    if "onlinePaymentsEnabled" in Fields and Fields["onlinePaymentsEnabled"] is not None:
        Wanted = bool(Fields["onlinePaymentsEnabled"])
        if Wanted and not Row.online_payments_enabled:
            Problems = OnlineProblems(db)
            if Problems:
                api_error(409, "ONLINE_NOT_READY", "Online payments cannot be switched on yet. " + " ".join(Problems))
        Row.online_payments_enabled = Wanted
    Row.updated_by_user_id = Actor.id if Actor else None
    After = {"studentFeesEnabled": bool(Row.student_fees_enabled), "onlinePaymentsEnabled": bool(Row.online_payments_enabled)}
    if After != Before:
        WritePaymentAudit(db, EntityType="ONLINE_SETTINGS", EntityId="default", Action="UPDATE", Actor=Actor, Before=Before, After=After)
    db.commit()
    return OnlineSettingsPayload(db)


# ----------------------------------------------------------------------------
# Notifications to the student
# ----------------------------------------------------------------------------

def NotifyStudent(db: Session, StudentRow: Student, *, Type: str, Title: str, Message: str, Tone: str, Metadata: dict[str, Any] | None = None) -> None:
    """A FEES notification to the student, only while the Fees tab is on.
    Written in the caller's transaction."""
    if not StudentFeesEnabled(db) or not StudentRow or not StudentRow.user_id:
        return
    from app.services.notification_service import CreateNotification

    CreateNotification(
        db,
        recipient_user_id=StudentRow.user_id,
        recipient_role="STUDENT",
        type=Type,
        category="FEES",
        title=Title,
        message=Message,
        student_id=StudentRow.id,
        target_route="/student/fees",
        color_variant=Tone,
        metadata=Metadata or {},
    )


def NotifyInvoicesRaised(db: Session, InvoiceIdsByStudent: dict[str, list[str]]) -> None:
    if not StudentFeesEnabled(db):
        return
    for StudentId in sorted(InvoiceIdsByStudent):
        StudentRow = db.get(Student, StudentId)
        Invoices = db.query(PaymentInvoice).filter(PaymentInvoice.id.in_(InvoiceIdsByStudent[StudentId])).order_by(PaymentInvoice.invoice_number).all()
        if not StudentRow or not Invoices:
            continue
        from app.services.payments.receipts_service import InvoiceBalance

        Due = sum(InvoiceBalance(Row) for Row in Invoices)
        Names = ", ".join(dict.fromkeys(Row.fee_name for Row in Invoices))
        if Due > 0:
            Message = f"{Names}: {FormatIndianRupees(Due)} to pay. Open Fees to see the invoice."
        else:
            Message = f"{Names}: already settled from your advance. Open Fees to see the invoice."
        NotifyStudent(
            db, StudentRow, Type="FEES_INVOICE_RAISED", Tone="BLUE",
            Title="New invoice" if len(Invoices) == 1 else f"{len(Invoices)} new invoices",
            Message=Message,
            Metadata={"invoiceIds": [Row.id for Row in Invoices]},
        )


def NotifyPaymentReceived(db: Session, Payment: PaymentReceipt) -> None:
    StudentRow = db.get(Student, Payment.student_id)
    How = "online" if Payment.channel == "ONLINE" else "at the centre"
    NotifyStudent(
        db, StudentRow, Type="FEES_PAYMENT_RECEIVED", Tone="GREEN",
        Title="Payment received",
        Message=f"{FormatIndianRupees(Payment.amount_paise)} received {How}. Receipt {Payment.receipt_number}.",
        Metadata={"paymentId": Payment.id},
    )


def _NotifyOnlineFailed(db: Session, Order: OnlinePaymentOrder) -> None:
    # Once per order: a parent retrying three times gets one message.
    Already = db.query(OnlinePaymentEvent.id).filter(
        OnlinePaymentEvent.order_id == Order.id,
        OnlinePaymentEvent.event_type.in_(("CHECKOUT_FAILED", "PAYMENT_FAILED")),
    ).first()
    if Already:
        return
    NotifyStudent(
        db, db.get(Student, Order.student_id), Type="FEES_ONLINE_FAILED", Tone="RED",
        Title="Online payment did not go through",
        Message=f"A payment of {FormatIndianRupees(Order.amount_paise)} did not complete, and nothing was recorded. If money left the account, it is returned by the bank. You can try again from Fees.",
        Metadata={"orderId": Order.id},
    )


# ----------------------------------------------------------------------------
# Events
# ----------------------------------------------------------------------------

_SAFE_PAYMENT_KEYS = (
    "id", "order_id", "amount", "currency", "status", "method", "bank", "wallet", "captured",
    "error_code", "error_description", "error_reason", "error_source", "error_step", "created_at",
)


def _SafeEntity(Entity: dict[str, Any] | None) -> dict[str, Any] | None:
    """The parts of a Razorpay payment worth keeping: never the payer's
    email, phone, UPI id or card details."""
    if not Entity:
        return None
    Safe = {Key: Entity.get(Key) for Key in _SAFE_PAYMENT_KEYS if Entity.get(Key) is not None}
    Network = (Entity.get("card") or {}).get("network") if isinstance(Entity.get("card"), dict) else None
    if Network:
        Safe["card_network"] = Network
    return Safe


def _AddEvent(
    db: Session,
    *,
    Order: OnlinePaymentOrder | None,
    Source: str,
    Type: str,
    Detail: str | None = None,
    PaymentId: str | None = None,
    RazorpayOrderId: str | None = None,
    EventId: str | None = None,
    Payload: dict[str, Any] | None = None,
) -> OnlinePaymentEvent:
    Event = OnlinePaymentEvent(
        order_id=Order.id if Order else None,
        razorpay_order_id=(Order.razorpay_order_id if Order else RazorpayOrderId),
        razorpay_payment_id=PaymentId,
        razorpay_event_id=EventId,
        source=Source,
        event_type=Type,
        detail=_Clean(Detail, 500),
        payload_json=json.dumps(Payload, sort_keys=True, default=str) if Payload else None,
        created_at=_Now(),
    )
    db.add(Event)
    db.flush()
    return Event


def _MethodDetail(Entity: dict[str, Any]) -> str | None:
    Method = str(Entity.get("method") or "").lower()
    if not Method:
        return None
    if Method == "upi":
        return "UPI"
    if Method == "card":
        Network = (Entity.get("card") or {}).get("network") if isinstance(Entity.get("card"), dict) else None
        return f"Card ({Network})" if Network else "Card"
    if Method == "netbanking":
        return f"Net Banking ({Entity['bank']})" if Entity.get("bank") else "Net Banking"
    if Method == "wallet":
        return f"Wallet ({Entity['wallet']})" if Entity.get("wallet") else "Wallet"
    return Method.replace("_", " ").title()


def _PaymentDate(Entity: dict[str, Any]) -> date:
    from app.services.payments.invoices_service import INDIA, TodayInIndia

    try:
        Stamp = int(Entity.get("created_at"))
        return datetime.fromtimestamp(Stamp, INDIA).date()
    except (TypeError, ValueError, OverflowError, OSError):
        return TodayInIndia()


# ----------------------------------------------------------------------------
# Unpaid invoices and orders
# ----------------------------------------------------------------------------

def _UnpaidInvoices(db: Session, StudentId: str, *, Lock: bool = False) -> list[PaymentInvoice]:
    from app.services.payments.receipts_service import InvoiceBalance

    Query = db.query(PaymentInvoice).filter(
        PaymentInvoice.student_id == StudentId, PaymentInvoice.status.in_(("PENDING", "PART_PAID"))
    ).order_by(PaymentInvoice.invoice_date.asc(), PaymentInvoice.invoice_number.asc())
    if Lock:
        Query = Query.with_for_update()
    return [Row for Row in Query.all() if InvoiceBalance(Row) > 0]


def _OrderInvoices(Order: OnlinePaymentOrder) -> list[dict[str, Any]]:
    try:
        return list(json.loads(Order.invoices_json) or [])
    except ValueError:
        return []


def _BusinessName(db: Session) -> str:
    Profile = db.get(PaymentBusinessProfile, "default")
    if not Profile:
        return "Math Path"
    return Profile.brand_name or Profile.legal_name or "Math Path"


def _Mobile(Value: str | None) -> str | None:
    Digits = re.sub(r"\D", "", Value or "")
    if len(Digits) == 12 and Digits.startswith("91"):
        Digits = Digits[2:]
    return Digits if len(Digits) == 10 and Digits[0] in "6789" else None


def CheckoutPayload(db: Session, Order: OnlinePaymentOrder, *, Prefill: bool) -> dict[str, Any]:
    StudentRow = db.get(Student, Order.student_id)
    UserRow = db.get(User, StudentRow.user_id) if StudentRow else None
    Invoices = _OrderInvoices(Order)
    Data = {
        "orderRef": Order.id,
        "razorpayOrderId": Order.razorpay_order_id,
        "keyId": rzp.KeyId(),
        "keyMode": Order.key_mode,
        "amountPaise": Order.amount_paise,
        "amountDisplay": FormatIndianRupees(Order.amount_paise),
        "currency": Order.currency,
        "businessName": _BusinessName(db),
        "description": f"Fees for {UserRow.full_name if UserRow else 'student'}" + (f" · {len(Invoices)} invoices" if len(Invoices) != 1 else f" · {Invoices[0]['invoiceNumber']}" if Invoices else ""),
        "invoiceNumbers": [Line["invoiceNumber"] for Line in Invoices],
        "prefill": {},
    }
    if Prefill and StudentRow:
        Data["prefill"] = {
            "name": StudentRow.father_name or StudentRow.mother_name or (UserRow.full_name if UserRow else None),
            "email": StudentRow.father_email or StudentRow.mother_email or None,
            "contact": _Mobile(StudentRow.father_mobile or StudentRow.mother_mobile or StudentRow.parent_contact),
        }
    return Data


def CreateOrder(
    db: Session,
    *,
    StudentId: str,
    InvoiceIds: list[str] | None,
    Source: str,
    PayLink: PaymentLink | None = None,
    Actor: User | None = None,
) -> dict[str, Any]:
    """Makes (or reuses) a Razorpay order for whole unpaid invoices."""
    from app.services.payments.receipts_service import InvoiceBalance, _LockStudent

    if not OnlinePaymentsLive(db):
        api_error(409, "ONLINE_PAYMENTS_OFF", "Online payment is not available right now. Please pay at the centre, or try again later.")
    # The student stays locked through the Razorpay call (15 s at most): it is
    # what makes six quick taps on Pay give one order, not six.
    _LockStudent(db, StudentId)
    Unpaid = _UnpaidInvoices(db, StudentId, Lock=True)
    if InvoiceIds is not None:
        Wanted = [str(Id) for Id in dict.fromkeys(InvoiceIds) if Id]
        if not Wanted:
            api_error(422, "NO_INVOICES_CHOSEN", "Choose at least one invoice to pay.")
        ById = {Row.id: Row for Row in Unpaid}
        Missing = [Id for Id in Wanted if Id not in ById]
        if Missing:
            api_error(409, "INVOICES_CHANGED", "One of the chosen invoices is already paid or was changed. Refresh the page and try again.")
        Chosen = [Row for Row in Unpaid if Row.id in set(Wanted)]
    else:
        Chosen = Unpaid
    if not Chosen:
        api_error(409, "NOTHING_DUE", "There is nothing to pay right now.")
    Lines = [{"invoiceId": Row.id, "invoiceNumber": Row.invoice_number, "amountPaise": InvoiceBalance(Row)} for Row in Chosen]
    Amount = sum(Line["amountPaise"] for Line in Lines)
    if Amount < MIN_ORDER_PAISE:
        api_error(422, "AMOUNT_TOO_SMALL", "The amount is too small to pay online (the minimum is ₹1).")
    InvoicesJson = json.dumps(Lines, sort_keys=True)

    # A double click, or Pay pressed again after closing the pop-up, reuses
    # the same order instead of making a new one each time.
    Since = _Now() - timedelta(minutes=REUSE_ORDER_MINUTES)
    Reusable = (
        db.query(OnlinePaymentOrder)
        .filter(
            OnlinePaymentOrder.student_id == StudentId,
            OnlinePaymentOrder.source == Source,
            OnlinePaymentOrder.status.in_(("CREATED", "FAILED")),
            OnlinePaymentOrder.razorpay_payment_id.is_(None),
            OnlinePaymentOrder.invoices_json == InvoicesJson,
            OnlinePaymentOrder.key_mode == rzp.KeyMode(),
            OnlinePaymentOrder.created_at >= Since,
        )
        .order_by(OnlinePaymentOrder.created_at.desc())
        .first()
    )
    if Reusable and (PayLink is None or Reusable.pay_link_id == PayLink.id):
        db.commit()
        return {**CheckoutPayload(db, Reusable, Prefill=Source == "STUDENT"), "reused": True}

    StudentRow = db.get(Student, StudentId)
    OrderId = str(uuid.uuid4())
    try:
        Created = rzp.GetRazorpayClient().CreateOrder(
            AmountPaise=Amount,
            Receipt=f"MPO-{OrderId.replace('-', '')[:16]}",
            Notes={
                "platform": "mathpath-new",
                "mp_order": OrderId,
                "student_code": StudentRow.student_code or "",
                "invoices": ", ".join(Line["invoiceNumber"] for Line in Lines)[:250],
            },
        )
    except rzp.RazorpayError as Error:
        db.rollback()
        api_error(502, "RAZORPAY_UNAVAILABLE", f"Razorpay could not start the payment: {Error}")
    RazorpayOrderId = str((Created or {}).get("id") or "")
    if not RazorpayOrderId.startswith("order_") or int((Created or {}).get("amount") or 0) != Amount:
        db.rollback()
        api_error(502, "RAZORPAY_UNAVAILABLE", "Razorpay could not start the payment. Please try again.")
    Order = OnlinePaymentOrder(
        id=OrderId,
        razorpay_order_id=RazorpayOrderId,
        student_id=StudentId,
        amount_paise=Amount,
        currency="INR",
        invoices_json=InvoicesJson,
        source=Source,
        pay_link_id=PayLink.id if PayLink else None,
        key_mode=rzp.KeyMode() or "TEST",
        status="CREATED",
        created_by_user_id=Actor.id if Actor else None,
        created_at=_Now(),
    )
    db.add(Order)
    db.flush()
    _AddEvent(db, Order=Order, Source="CHECKOUT", Type="ORDER_CREATED", Detail=f"{FormatIndianRupees(Amount)} for {', '.join(Line['invoiceNumber'] for Line in Lines)}")
    db.commit()
    return {**CheckoutPayload(db, Order, Prefill=Source == "STUDENT"), "reused": False}


# ----------------------------------------------------------------------------
# Recording a payment
# ----------------------------------------------------------------------------

def _ReceiptForPayment(db: Session, PaymentId: str) -> PaymentReceipt | None:
    return db.query(PaymentReceipt).filter(PaymentReceipt.idempotency_key == f"rzp-{PaymentId}").first()


def _ResultPayload(db: Session, Order: OnlinePaymentOrder, Receipt: PaymentReceipt | None) -> dict[str, Any]:
    return {
        "orderRef": Order.id,
        "status": Order.status,
        "statusLabel": _OrderStatusLabel(Order),
        "amountDisplay": FormatIndianRupees(Order.amount_paise),
        "paymentId": Receipt.id if Receipt else None,
        "receiptNumber": Receipt.receipt_number if Receipt else None,
        "receiptAmountDisplay": FormatIndianRupees(Receipt.amount_paise) if Receipt else None,
        "paymentDate": Receipt.payment_date.isoformat() if Receipt else None,
        "message": (
            "We have your payment and the office is confirming it. Its receipt will show soon. Please do not pay again."
            if Order.status == "ATTENTION" else Order.last_error if Order.status == "FAILED" else None
        ),
    }


def RecordOnlinePayment(db: Session, *, OrderRef: str, Entity: dict[str, Any], Source: str) -> dict[str, Any]:
    """Records a captured Razorpay payment as a money receipt. Safe to call
    any number of times for the same payment. Commits."""
    from app.services.payments.receipts_service import (
        ApplyAdvance,
        InvoiceBalance,
        RecomputeInvoice,
        _AuditShape,
        _LockStudent,
        _Snapshot,
    )
    from app.services.payments.numbering import TakeNextNumber

    PaymentId = str(Entity.get("id") or "")
    Amount = int(Entity.get("amount") or 0)
    Peek = db.get(OnlinePaymentOrder, OrderRef)
    if not Peek:
        api_error(404, "ORDER_NOT_FOUND", "That payment was not found.")
    StudentRow = _LockStudent(db, Peek.student_id)
    Order = db.query(OnlinePaymentOrder).filter(OnlinePaymentOrder.id == OrderRef).with_for_update().one()
    db.refresh(Order)

    Existing = _ReceiptForPayment(db, PaymentId)
    if Existing:
        if Order.payment_receipt_id is None and Order.razorpay_payment_id in (None, PaymentId):
            Order.payment_receipt_id = Existing.id
            Order.razorpay_payment_id = PaymentId
            Order.status = "PAID"
        _AddEvent(db, Order=Order, Source=Source, Type="ALREADY_RECORDED", Detail=f"Receipt {Existing.receipt_number}", PaymentId=PaymentId)
        db.commit()
        return _ResultPayload(db, Order, Existing)

    Problem = None
    if Entity.get("order_id") != Order.razorpay_order_id:
        Problem = "Razorpay says this payment belongs to a different order."
    elif str(Entity.get("currency") or "INR") != "INR" or Amount <= 0:
        Problem = "The payment amount from Razorpay is not valid."
    elif not _ReceiptNumberingReady(db):
        Problem = "The starting receipt number is not set, so the receipt could not be made. Set it in Payment Settings, then press Check with Razorpay."
    if Problem:
        if Order.status != "PAID":
            Order.status = "ATTENTION"
            if Entity.get("order_id") == Order.razorpay_order_id:
                Order.razorpay_payment_id = Order.razorpay_payment_id or PaymentId
        Order.last_error = Problem
        _AddEvent(db, Order=Order, Source=Source, Type="NOT_RECORDED", Detail=Problem, PaymentId=PaymentId, Payload=_SafeEntity(Entity))
        db.commit()
        return _ResultPayload(db, Order, None)

    SecondPayment = Order.status == "PAID" and Order.razorpay_payment_id not in (None, PaymentId)
    MethodDetail = _MethodDetail(Entity)
    Receipt = PaymentReceipt(
        receipt_number=TakeNextNumber(db, "RECEIPT"),
        student_id=StudentRow.id,
        payment_date=_PaymentDate(Entity),
        pay_by=None,
        received_by_user_id=None,
        received_by_name="Online (Razorpay)",
        amount_paise=Amount,
        discount_paise=0,
        discount_reason=None,
        note=("Paid online" + (f" by {MethodDetail}" if MethodDetail else "") + (" with a pay link" if Order.source == "PAY_LINK" else " from the student login")
              + (". Razorpay test mode: no real money moved" if Order.key_mode == "TEST" else "")
              + (". A second payment on an order that was already paid: check whether to refund it." if SecondPayment else "")),
        channel="ONLINE",
        status="RECORDED",
        centre_id=StudentRow.centre_id,
        snapshot_json=json.dumps(_Snapshot(db, StudentRow), sort_keys=True),
        idempotency_key=f"rzp-{PaymentId}",
        source=Order.source,
        created_by_user_id=None,
    )
    db.add(Receipt)
    db.flush()
    db.add(PaymentMethodLine(payment_id=Receipt.id, method="RAZORPAY", amount_paise=Amount, reference=PaymentId, line_order=0))

    # The order's invoices first, oldest first, never beyond what each still
    # owes (one may have been paid at the counter meanwhile). Anything left
    # is the student's advance and goes to their other unpaid invoices.
    from app.models import PaymentAllocation

    Left = Amount
    Planned = [Line["invoiceId"] for Line in _OrderInvoices(Order)]
    if Planned and not SecondPayment:
        Rows = {Row.id: Row for Row in db.query(PaymentInvoice).filter(PaymentInvoice.id.in_(Planned)).order_by(PaymentInvoice.id).with_for_update().all()}
        for InvoiceId in Planned:
            Invoice = Rows.get(InvoiceId)
            if Left <= 0 or not Invoice or Invoice.student_id != StudentRow.id or Invoice.status == "CANCELLED":
                continue
            RecomputeInvoice(db, Invoice)
            Take = min(InvoiceBalance(Invoice), Left)
            if Take <= 0:
                continue
            db.add(PaymentAllocation(payment_id=Receipt.id, invoice_id=Invoice.id, amount_paise=Take, discount_paise=0, kind="DIRECT"))
            db.flush()
            RecomputeInvoice(db, Invoice)
            Left -= Take
    if Left > 0:
        ApplyAdvance(db, StudentId=StudentRow.id, Actor=None, LockStudent=False)

    if not SecondPayment:
        Order.status = "PAID"
        Order.razorpay_payment_id = PaymentId
        Order.payment_receipt_id = Receipt.id
        Order.method_detail = MethodDetail
        Order.paid_at = _Now()
        Order.last_error = None
    _AddEvent(
        db, Order=Order, Source=Source, Type="PAYMENT_RECORDED", PaymentId=PaymentId, Payload=_SafeEntity(Entity),
        Detail=f"Receipt {Receipt.receipt_number}, {FormatIndianRupees(Amount)}" + (" (a second payment on this order; check whether to refund it)" if SecondPayment else ""),
    )
    WritePaymentAudit(db, EntityType="PAYMENT", EntityId=Receipt.id, Action="CREATE", Actor=None, ActorName=SYSTEM_ACTOR,
                      After={**_AuditShape(db, Receipt), "channel": "ONLINE", "razorpayPaymentId": PaymentId, "razorpayOrderId": Order.razorpay_order_id})
    NotifyPaymentReceived(db, Receipt)
    db.commit()
    return _ResultPayload(db, Order, Receipt)


def _LockOrder(db: Session, Order: OnlinePaymentOrder) -> None:
    """Student row first, then the order: the lock order every payment path
    uses (recording also inserts rows that reference the student)."""
    from app.services.payments.receipts_service import _LockStudent

    _LockStudent(db, Order.student_id)
    db.query(OnlinePaymentOrder).filter(OnlinePaymentOrder.id == Order.id).with_for_update().one()
    db.refresh(Order)


def _MarkFailed(db: Session, Order: OnlinePaymentOrder, *, Source: str, Type: str, Detail: str | None, PaymentId: str | None, Payload: dict[str, Any] | None) -> None:
    # Re-read under a lock: a successful retry being recorded at this very
    # moment must never be turned back into "Failed". The student is locked
    # first, the same order as recording, so the two can never deadlock.
    _LockOrder(db, Order)
    if Order.status in ("CREATED", "FAILED") and Order.razorpay_payment_id is None:
        _NotifyOnlineFailed(db, Order)
        Order.status = "FAILED"
        Order.last_error = _Clean(Detail, 500) or "The payment failed."
    _AddEvent(db, Order=Order, Source=Source, Type=Type, Detail=Detail, PaymentId=PaymentId, Payload=Payload)


def _Pending(db: Session, Order: OnlinePaymentOrder, PaymentId: str, Detail: str, *, Source: str, Payload: dict[str, Any] | None = None) -> dict[str, Any]:
    """Razorpay has a payment for this order that is not captured yet (or
    could not be checked). The order keeps the payment id, so it shows as
    "Confirming" (never "Not completed") until it is recorded."""
    _LockOrder(db, Order)
    if Order.status in ("CREATED", "FAILED") and Order.razorpay_payment_id is None and re.fullmatch(r"pay_[A-Za-z0-9]{6,30}", PaymentId or ""):
        Taken = db.query(OnlinePaymentOrder.id).filter(OnlinePaymentOrder.razorpay_payment_id == PaymentId).first()
        if not Taken:
            Order.razorpay_payment_id = PaymentId
    _AddEvent(db, Order=Order, Source=Source, Type="PAYMENT_PENDING", Detail=Detail, PaymentId=PaymentId or None, Payload=Payload)
    db.commit()
    return {**_ResultPayload(db, Order, None), "status": "PENDING", "statusLabel": "Confirming"}


def _SettleEntity(db: Session, Order: OnlinePaymentOrder, Entity: dict[str, Any], *, Source: str) -> dict[str, Any]:
    """Takes a Razorpay payment (fetched from the API, or from a signed
    webhook) to its end: captured and recorded, failed, or still pending."""
    PaymentId = str(Entity.get("id") or "")
    if Entity.get("order_id") != Order.razorpay_order_id:
        _AddEvent(db, Order=Order, Source=Source, Type="NOT_RECORDED", Detail="The payment belongs to a different order.", PaymentId=PaymentId, Payload=_SafeEntity(Entity))
        db.commit()
        return _ResultPayload(db, Order, None)
    Status = str(Entity.get("status") or "")
    if Status == "authorized":
        try:
            Entity = rzp.GetRazorpayClient().CapturePayment(PaymentId, int(Entity.get("amount") or 0))
        except rzp.RazorpayError as Error:
            # Captured a moment ago by the webhook (or auto-capture)? Ask again.
            try:
                Entity = rzp.GetRazorpayClient().FetchPayment(PaymentId)
            except rzp.RazorpayError:
                Entity = {**Entity}
            if str(Entity.get("status") or "") != "captured":
                return _Pending(db, Order, PaymentId, f"Could not capture yet: {Error}", Source=Source)
        else:
            _AddEvent(db, Order=Order, Source=Source, Type="PAYMENT_CAPTURED", PaymentId=PaymentId)
        Status = str(Entity.get("status") or "")
    if Status == "captured":
        return RecordOnlinePayment(db, OrderRef=Order.id, Entity=Entity, Source=Source)
    if Status == "failed":
        _MarkFailed(db, Order, Source=Source, Type="PAYMENT_FAILED", Detail=Entity.get("error_description") or "The payment failed.", PaymentId=PaymentId, Payload=_SafeEntity(Entity))
        db.commit()
        return _ResultPayload(db, Order, None)
    return _Pending(db, Order, PaymentId, f"Razorpay status: {Status or 'unknown'}", Source=Source, Payload=_SafeEntity(Entity))


def VerifyCheckout(db: Session, *, Order: OnlinePaymentOrder, RazorpayOrderId: Any, RazorpayPaymentId: Any, Signature: Any) -> dict[str, Any]:
    PaymentId = str(RazorpayPaymentId or "").strip()
    if not re.fullmatch(r"pay_[A-Za-z0-9]{6,30}", PaymentId) or str(RazorpayOrderId or "").strip() != Order.razorpay_order_id:
        _AddEvent(db, Order=Order, Source="VERIFY", Type="SIGNATURE_INVALID", Detail="The payment details sent back did not match this order.", PaymentId=PaymentId[:40] or None)
        db.commit()
        api_error(400, "PAYMENT_NOT_VERIFIED", "The payment could not be confirmed. If money left the account, it will show here within a few minutes, or it is returned by the bank.")
    if not rzp.PaymentSignatureIsValid(Order.razorpay_order_id, PaymentId, str(Signature or "")):
        _AddEvent(db, Order=Order, Source="VERIFY", Type="SIGNATURE_INVALID", Detail="The Razorpay signature did not match.", PaymentId=PaymentId)
        db.commit()
        api_error(400, "PAYMENT_NOT_VERIFIED", "The payment could not be confirmed. If money left the account, it will show here within a few minutes, or it is returned by the bank.")
    Existing = _ReceiptForPayment(db, PaymentId)
    if Existing:
        return _ResultPayload(db, Order, Existing)
    try:
        Entity = rzp.GetRazorpayClient().FetchPayment(PaymentId)
    except rzp.RazorpayError as Error:
        return _Pending(db, Order, PaymentId, f"Could not reach Razorpay to confirm: {Error}", Source="VERIFY")
    return _SettleEntity(db, Order, Entity, Source="VERIFY")


def LogCheckoutEvent(db: Session, *, Order: OnlinePaymentOrder, Type: Any, Detail: Any, PaymentId: Any) -> dict[str, Any]:
    Kind = str(Type or "").upper()
    if Kind not in ("DISMISSED", "FAILED"):
        api_error(422, "EVENT_INVALID", "Unknown event.")
    PaymentId = _Clean(PaymentId, 40)
    if PaymentId and not re.fullmatch(r"pay_[A-Za-z0-9]{6,30}", PaymentId):
        PaymentId = None
    if Kind == "FAILED":
        _MarkFailed(db, Order, Source="CHECKOUT", Type="CHECKOUT_FAILED", Detail=_Clean(Detail, 300) or "The payment failed.", PaymentId=PaymentId, Payload=None)
    else:
        _AddEvent(db, Order=Order, Source="CHECKOUT", Type="CHECKOUT_DISMISSED", Detail=_Clean(Detail, 300))
    db.commit()
    return {"ok": True}


def StudentOrder(db: Session, *, OrderRef: str, StudentId: str) -> OnlinePaymentOrder:
    Order = db.get(OnlinePaymentOrder, OrderRef)
    if not Order or Order.student_id != StudentId or Order.source != "STUDENT":
        api_error(404, "ORDER_NOT_FOUND", "That payment was not found.")
    return Order


def PayLinkOrder(db: Session, *, OrderRef: str, Link: PaymentLink) -> OnlinePaymentOrder:
    Order = db.get(OnlinePaymentOrder, OrderRef)
    if not Order or Order.pay_link_id != Link.id:
        api_error(404, "ORDER_NOT_FOUND", "That payment was not found.")
    return Order


def OrderResult(db: Session, Order: OnlinePaymentOrder) -> dict[str, Any]:
    Receipt = db.get(PaymentReceipt, Order.payment_receipt_id) if Order.payment_receipt_id else None
    return _ResultPayload(db, Order, Receipt)


# ----------------------------------------------------------------------------
# Webhook
# ----------------------------------------------------------------------------

def HandleWebhook(db: Session, *, Body: bytes, Signature: str | None, EventId: str | None) -> tuple[int, dict[str, Any]]:
    """Returns (HTTP status, body). Razorpay retries anything not 2xx."""
    if not rzp.WebhookSecretSet():
        return 503, {"status": "not_configured"}
    if not rzp.WebhookSignatureIsValid(Body, Signature or ""):
        return 400, {"status": "invalid_signature"}
    try:
        Data = json.loads(Body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return 400, {"status": "invalid_body"}
    Event = str(Data.get("event") or "")
    Payload = Data.get("payload") or {}
    Entity = ((Payload.get("payment") or {}).get("entity")) or {}
    OrderEntity = ((Payload.get("order") or {}).get("entity")) or {}
    RazorpayOrderId = Entity.get("order_id") or OrderEntity.get("id")
    EventId = _Clean(EventId, 80)
    if not RazorpayOrderId:
        return 200, {"status": "ignored"}
    Order = db.query(OnlinePaymentOrder).filter(OnlinePaymentOrder.razorpay_order_id == str(RazorpayOrderId)).first()
    if not Order:
        # Not made by this site (the old platform shares the account).
        return 200, {"status": "ignored"}
    if EventId and db.query(OnlinePaymentEvent.id).filter(OnlinePaymentEvent.razorpay_event_id == EventId).first():
        return 200, {"status": "duplicate"}

    PaymentId = Entity.get("id")
    if Event in ("payment.captured", "payment.authorized", "order.paid") and PaymentId:
        Result = _SettleEntity(db, Order, Entity, Source="WEBHOOK")
        Outcome = Result.get("status")
        if Outcome == "PENDING":
            # Not recorded yet: ask Razorpay to send this again later.
            return 503, {"status": "pending"}
    elif Event == "payment.failed" and PaymentId:
        _MarkFailed(db, Order, Source="WEBHOOK", Type="PAYMENT_FAILED", Detail=Entity.get("error_description") or "The payment failed.", PaymentId=PaymentId, Payload=_SafeEntity(Entity))
        db.commit()
        Outcome = "FAILED"
    else:
        Outcome = "noted"
    # The webhook's own record, written last: a webhook that failed half way
    # is processed again when Razorpay retries it.
    try:
        _AddEvent(db, Order=Order, Source="WEBHOOK", Type=f"WEBHOOK_{Event.upper().replace('.', '_')}"[:60], PaymentId=PaymentId, EventId=EventId,
                  Detail=f"Razorpay sent {Event}", Payload=_SafeEntity(Entity) if Entity else None)
        db.commit()
    except IntegrityError:
        db.rollback()  # the same event, handled by a parallel delivery
    return 200, {"status": "ok", "outcome": Outcome}


# ----------------------------------------------------------------------------
# Admin: Online Payments log
# ----------------------------------------------------------------------------

def _OrderStatusLabel(Order: OnlinePaymentOrder) -> str:
    if Order.status in ("CREATED", "FAILED") and Order.razorpay_payment_id:
        return "Confirming"
    if Order.status == "CREATED" and _Aware(Order.created_at) and _Aware(Order.created_at) < _Now() - timedelta(minutes=OPEN_ORDER_MINUTES):
        return ORDER_STATUS_LABELS["ABANDONED"]
    return ORDER_STATUS_LABELS.get(Order.status, Order.status)


def _DisplayStatus(Order: OnlinePaymentOrder) -> str:
    if Order.status in ("CREATED", "FAILED") and Order.razorpay_payment_id:
        return "CREATED"
    if Order.status == "CREATED" and _Aware(Order.created_at) and _Aware(Order.created_at) < _Now() - timedelta(minutes=OPEN_ORDER_MINUTES):
        return "ABANDONED"
    return Order.status


def OrderPayload(db: Session, Order: OnlinePaymentOrder, *, Names: dict[str, str] | None = None, Detailed: bool = False) -> dict[str, Any]:
    StudentRow = db.get(Student, Order.student_id)
    UserRow = db.get(User, StudentRow.user_id) if StudentRow else None
    Receipt = db.get(PaymentReceipt, Order.payment_receipt_id) if Order.payment_receipt_id else None
    Payload = {
        "orderRef": Order.id,
        "razorpayOrderId": Order.razorpay_order_id,
        "razorpayPaymentId": Order.razorpay_payment_id,
        "studentId": Order.student_id,
        "studentName": UserRow.full_name if UserRow else "",
        "studentCode": StudentRow.student_code if StudentRow else None,
        "amountPaise": Order.amount_paise,
        "amountDisplay": FormatIndianRupees(Order.amount_paise),
        "invoices": _OrderInvoices(Order),
        "source": Order.source,
        "sourceLabel": SOURCE_LABELS.get(Order.source, Order.source),
        "keyMode": Order.key_mode,
        "status": _DisplayStatus(Order),
        "statusLabel": _OrderStatusLabel(Order),
        "methodDetail": Order.method_detail,
        "lastError": Order.last_error,
        "paymentId": Receipt.id if Receipt else None,
        "receiptNumber": Receipt.receipt_number if Receipt else None,
        "receiptStatus": Receipt.status if Receipt else None,
        "createdAt": _Iso(Order.created_at),
        "paidAt": _Iso(Order.paid_at),
    }
    for Line in Payload["invoices"]:
        Line["amountDisplay"] = FormatIndianRupees(int(Line.get("amountPaise") or 0))
    if Detailed:
        Events = db.query(OnlinePaymentEvent).filter(OnlinePaymentEvent.order_id == Order.id).order_by(OnlinePaymentEvent.created_at.asc(), OnlinePaymentEvent.id.asc()).all()
        Payload["events"] = [
            {
                "eventId": Row.id,
                "source": Row.source,
                "type": Row.event_type,
                "label": EVENT_LABELS.get(Row.event_type) or ("Razorpay webhook" if Row.event_type.startswith("WEBHOOK_") else Row.event_type.replace("_", " ").capitalize()),
                "detail": Row.detail,
                "razorpayPaymentId": Row.razorpay_payment_id,
                "createdAt": _Iso(Row.created_at),
            }
            for Row in Events
        ]
    return Payload


def _FilteredOrders(db: Session, Filters: dict[str, Any]):
    from app.services.payments.invoices_service import INDIA, _ParseDate

    Query = db.query(OnlinePaymentOrder).join(Student, OnlinePaymentOrder.student_id == Student.id).join(User, Student.user_id == User.id)
    Status = str(Filters.get("status") or "ALL").upper()
    Stale = _Now() - timedelta(minutes=OPEN_ORDER_MINUTES)
    Confirming = and_(OnlinePaymentOrder.status.in_(("CREATED", "FAILED")), OnlinePaymentOrder.razorpay_payment_id.isnot(None))
    if Status == "ABANDONED":
        Query = Query.filter(OnlinePaymentOrder.status == "CREATED", OnlinePaymentOrder.created_at < Stale, OnlinePaymentOrder.razorpay_payment_id.is_(None))
    elif Status == "CREATED":
        Query = Query.filter(or_(and_(OnlinePaymentOrder.status == "CREATED", OnlinePaymentOrder.created_at >= Stale), Confirming))
    elif Status == "FAILED":
        Query = Query.filter(OnlinePaymentOrder.status == "FAILED", OnlinePaymentOrder.razorpay_payment_id.is_(None))
    elif Status in ("PAID", "ATTENTION"):
        Query = Query.filter(OnlinePaymentOrder.status == Status)
    Source = str(Filters.get("source") or "").upper()
    if Source in SOURCE_LABELS:
        Query = Query.filter(OnlinePaymentOrder.source == Source)
    DateFrom = _ParseDate(Filters.get("dateFrom"), "From date")
    DateTo = _ParseDate(Filters.get("dateTo"), "To date")
    if DateFrom:
        Query = Query.filter(OnlinePaymentOrder.created_at >= datetime.combine(DateFrom, datetime.min.time(), INDIA))
    if DateTo:
        Query = Query.filter(OnlinePaymentOrder.created_at < datetime.combine(DateTo + timedelta(days=1), datetime.min.time(), INDIA))
    if Filters.get("studentId"):
        Query = Query.filter(OnlinePaymentOrder.student_id == Filters["studentId"])
    Search = str(Filters.get("search") or "").strip()
    if Search:
        Like = f"%{Search.lower()}%"
        Query = Query.filter(
            or_(
                func.lower(User.full_name).like(Like),
                func.lower(Student.student_code).like(Like),
                func.lower(func.coalesce(Student.custom_id, "")).like(Like),
                func.lower(OnlinePaymentOrder.razorpay_order_id).like(Like),
                func.lower(func.coalesce(OnlinePaymentOrder.razorpay_payment_id, "")).like(Like),
                OnlinePaymentOrder.id.in_(db.query(OnlinePaymentEvent.order_id).filter(func.lower(func.coalesce(OnlinePaymentEvent.razorpay_payment_id, "")).like(Like))),
                OnlinePaymentOrder.payment_receipt_id.in_(db.query(PaymentReceipt.id).filter(func.lower(PaymentReceipt.receipt_number).like(Like))),
            )
        )
    return Query


def ListOnlineOrders(db: Session, *, Filters: dict[str, Any], Page: int = 1, PageSize: int = 50) -> dict[str, Any]:
    Page = max(1, int(Page or 1))
    PageSize = max(1, min(int(PageSize or 50), 200))
    Query = _FilteredOrders(db, Filters)
    TotalCount = Query.count()
    Counts = {"PAID": 0, "FAILED": 0, "ATTENTION": 0, "CREATED": 0, "ABANDONED": 0}
    Stale = _Now() - timedelta(minutes=OPEN_ORDER_MINUTES)
    Rows = Query.with_entities(OnlinePaymentOrder.status, OnlinePaymentOrder.created_at, OnlinePaymentOrder.razorpay_payment_id).all()
    for Status, CreatedAt, PaymentId in Rows:
        if Status in ("CREATED", "FAILED") and PaymentId:
            Key = "CREATED"
        elif Status == "CREATED" and _Aware(CreatedAt) and _Aware(CreatedAt) < Stale:
            Key = "ABANDONED"
        else:
            Key = Status
        Counts[Key] = Counts.get(Key, 0) + 1
    PaidTotal = Query.filter(OnlinePaymentOrder.status == "PAID").with_entities(func.coalesce(func.sum(OnlinePaymentOrder.amount_paise), 0)).scalar()
    Rows = Query.order_by(OnlinePaymentOrder.created_at.desc(), OnlinePaymentOrder.id.desc()).offset((Page - 1) * PageSize).limit(PageSize).all()
    return {
        "page": Page,
        "pageSize": PageSize,
        "totalCount": TotalCount,
        "counts": Counts,
        "paidDisplay": FormatIndianRupees(int(PaidTotal or 0)),
        "orders": [OrderPayload(db, Row) for Row in Rows],
        "settings": OnlineSettingsPayload(db),
    }


def GetOnlineOrder(db: Session, OrderRef: str) -> dict[str, Any]:
    Order = db.get(OnlinePaymentOrder, OrderRef)
    if not Order:
        api_error(404, "ORDER_NOT_FOUND", "That online payment was not found.")
    return OrderPayload(db, Order, Detailed=True)


def CheckOrderWithRazorpay(db: Session, *, OrderRef: str, Actor: User | None) -> dict[str, Any]:
    """Asks Razorpay what happened to an order and brings this site up to
    date: a payment that went through is recorded (once)."""
    Order = db.get(OnlinePaymentOrder, OrderRef)
    if not Order:
        api_error(404, "ORDER_NOT_FOUND", "That online payment was not found.")
    if not rzp.KeysReady():
        api_error(409, "RAZORPAY_KEYS_MISSING", "The Razorpay keys are not set on the server.")
    try:
        Payments = rzp.GetRazorpayClient().FetchOrderPayments(Order.razorpay_order_id)
    except rzp.RazorpayError as Error:
        api_error(502, "RAZORPAY_UNAVAILABLE", f"Razorpay could not be reached: {Error}")
    Who = Actor.full_name if Actor else "an admin"
    if not Payments:
        _AddEvent(db, Order=Order, Source="ADMIN_CHECK", Type="NO_PAYMENT", Detail=f"Checked by {Who}: Razorpay has no payment for this order.")
        db.commit()
    else:
        # Successful payments first, so a failed try never hides a good one.
        Rank = {"captured": 0, "authorized": 1, "failed": 3}
        for Entity in sorted(Payments, key=lambda Row: Rank.get(str(Row.get("status")), 2)):
            db.refresh(Order)
            _SettleEntity(db, Order, Entity, Source="ADMIN_CHECK")
    db.refresh(Order)
    return OrderPayload(db, Order, Detailed=True)


# ----------------------------------------------------------------------------
# Student Fees tab
# ----------------------------------------------------------------------------

def _StudentInvoice(Invoice: PaymentInvoice, Today: date) -> dict[str, Any]:
    from app.services.payments.invoices_service import InvoicePayload

    Full = InvoicePayload(Invoice, Today=Today)
    Keys = (
        "invoiceId", "invoiceNumber", "feeName", "periodLabel", "description", "invoiceDate", "dueDate",
        "amountPaise", "amountDisplay", "paidPaise", "paidDisplay", "discountPaise", "discountDisplay",
        "balancePaise", "balanceDisplay", "status", "statusLabel", "isOverdue",
    )
    return {Key: Full[Key] for Key in Keys}


def _StudentPayment(db: Session, Payment: PaymentReceipt) -> dict[str, Any]:
    from app.services.payments.receipts_service import PaymentPayload

    Full = PaymentPayload(db, Payment, Names={}, Detailed=False)
    Keys = ("paymentId", "receiptNumber", "paymentDate", "amountPaise", "amountDisplay", "discountDisplay", "discountPaise", "advancePaise", "advanceDisplay", "methodSummary", "channel", "invoiceNumbers")
    return {Key: Full[Key] for Key in Keys}


def StudentFeesSummary(db: Session, StudentRow: Student) -> dict[str, Any]:
    """The small version, for the menu badge and the dashboard card."""
    if not StudentFeesEnabled(db):
        return {"enabled": False}
    from app.services.payments.invoices_service import TodayInIndia
    from app.services.payments.receipts_service import InvoiceBalance

    Today = TodayInIndia()
    Unpaid = _UnpaidInvoices(db, StudentRow.id)
    Due = sum(InvoiceBalance(Row) for Row in Unpaid)
    Overdue = [Row for Row in Unpaid if Row.due_date and Row.due_date < Today]
    NextDue = min((Row.due_date for Row in Unpaid if Row.due_date and Row.due_date >= Today), default=None)
    return {
        "enabled": True,
        "unpaidCount": len(Unpaid),
        "duePaise": Due,
        "dueDisplay": FormatIndianRupees(Due),
        "overdueCount": len(Overdue),
        "overduePaise": sum(InvoiceBalance(Row) for Row in Overdue),
        "overdueDisplay": FormatIndianRupees(sum(InvoiceBalance(Row) for Row in Overdue)),
        "nextDueDate": NextDue.isoformat() if NextDue else None,
        "onlinePaymentsLive": OnlinePaymentsLive(db),
    }


def RequireStudentFees(db: Session) -> None:
    if not StudentFeesEnabled(db):
        api_error(403, "FEES_NOT_ENABLED", "Fees are not shown here yet.")


def StudentFees(db: Session, StudentRow: Student) -> dict[str, Any]:
    from app.services.payments.invoices_service import TodayInIndia
    from app.services.payments.receipts_service import StudentAdvanceBalance

    RequireStudentFees(db)
    Today = TodayInIndia()
    UserRow = db.get(User, StudentRow.user_id)
    LevelRow = db.get(Level, StudentRow.current_level_id) if StudentRow.current_level_id else None
    Centre = db.get(PaymentCentre, StudentRow.centre_id) if StudentRow.centre_id else None
    Invoices = (
        db.query(PaymentInvoice)
        .filter(PaymentInvoice.student_id == StudentRow.id, PaymentInvoice.status != "CANCELLED")
        .order_by(PaymentInvoice.invoice_date.desc(), PaymentInvoice.invoice_number.desc())
        .all()
    )
    Payments = (
        db.query(PaymentReceipt)
        .filter(PaymentReceipt.student_id == StudentRow.id, PaymentReceipt.status == "RECORDED")
        .order_by(PaymentReceipt.payment_date.desc(), PaymentReceipt.receipt_number.desc())
        .all()
    )
    # A payment Razorpay took that is still being confirmed (or needs the
    # office): shown so a parent is never left wondering.
    Confirming = (
        db.query(OnlinePaymentOrder)
        .filter(
            OnlinePaymentOrder.student_id == StudentRow.id,
            or_(OnlinePaymentOrder.status == "ATTENTION", and_(OnlinePaymentOrder.status.in_(("CREATED", "FAILED")), OnlinePaymentOrder.razorpay_payment_id.isnot(None))),
        )
        .order_by(OnlinePaymentOrder.created_at.desc())
        .all()
    )
    Summary = StudentFeesSummary(db, StudentRow)
    Unpaid = sorted([Row for Row in Invoices if Row.status in ("PENDING", "PART_PAID")], key=lambda Row: (Row.invoice_date, Row.invoice_number))
    from app.services.payments.receipts_service import InvoiceBalance

    Unpaid = [Row for Row in Unpaid if InvoiceBalance(Row) > 0]
    Advance = StudentAdvanceBalance(db, StudentRow.id)
    PaidTotal = sum(Row.amount_paise for Row in Payments)
    return {
        "student": {
            "name": UserRow.full_name if UserRow else "",
            "studentCode": StudentRow.student_code,
            "levelCode": LevelRow.level_code if LevelRow else None,
            "centreName": Centre.name if Centre else None,
        },
        "totals": {
            "duePaise": Summary["duePaise"],
            "dueDisplay": Summary["dueDisplay"],
            "overduePaise": Summary["overduePaise"],
            "overdueDisplay": Summary["overdueDisplay"],
            "overdueCount": Summary["overdueCount"],
            "unpaidCount": Summary["unpaidCount"],
            "nextDueDate": Summary["nextDueDate"],
            "advancePaise": Advance,
            "advanceDisplay": FormatIndianRupees(Advance),
            "paidPaise": PaidTotal,
            "paidDisplay": FormatIndianRupees(PaidTotal),
        },
        "unpaidInvoices": [_StudentInvoice(Row, Today) for Row in Unpaid],
        "invoices": [_StudentInvoice(Row, Today) for Row in Invoices],
        "payments": [_StudentPayment(db, Row) for Row in Payments],
        "confirming": [{"orderRef": Row.id, "amountDisplay": FormatIndianRupees(Row.amount_paise), "createdAt": _Iso(Row.created_at)} for Row in Confirming],
        "online": {"live": Summary["onlinePaymentsLive"], "businessName": _BusinessName(db)},
    }


def StudentInvoiceForPdf(db: Session, *, StudentRow: Student, InvoiceId: str) -> PaymentInvoice:
    RequireStudentFees(db)
    Invoice = db.get(PaymentInvoice, InvoiceId)
    if not Invoice or Invoice.student_id != StudentRow.id or Invoice.status == "CANCELLED":
        api_error(404, "INVOICE_NOT_FOUND", "That invoice was not found.")
    return Invoice


def StudentReceiptForPdf(db: Session, *, StudentRow: Student, PaymentId: str) -> PaymentReceipt:
    RequireStudentFees(db)
    Payment = db.get(PaymentReceipt, PaymentId)
    if not Payment or Payment.student_id != StudentRow.id or Payment.status != "RECORDED":
        api_error(404, "PAYMENT_NOT_FOUND", "That receipt was not found.")
    return Payment


# ----------------------------------------------------------------------------
# Pay links
# ----------------------------------------------------------------------------

def _LinkLive(Link: PaymentLink) -> bool:
    return Link.status == "ACTIVE" and (_Aware(Link.expires_at) or _Now()) > _Now()


def PayLinkPayload(Link: PaymentLink | None) -> dict[str, Any] | None:
    if not Link:
        return None
    return {
        "linkId": Link.id,
        "token": Link.token,
        "path": f"/pay/{Link.token}",
        "status": Link.status if Link.status != "ACTIVE" or _LinkLive(Link) else "EXPIRED",
        "expiresAt": _Iso(Link.expires_at),
        "openCount": Link.open_count or 0,
        "lastOpenedAt": _Iso(Link.last_opened_at),
        "createdAt": _Iso(Link.created_at),
    }


def CurrentPayLink(db: Session, StudentId: str) -> PaymentLink | None:
    Rows = (
        db.query(PaymentLink)
        .filter(PaymentLink.student_id == StudentId, PaymentLink.status == "ACTIVE")
        .order_by(PaymentLink.created_at.desc())
        .all()
    )
    return next((Row for Row in Rows if _LinkLive(Row)), None)


def StudentPayLink(db: Session, StudentId: str) -> dict[str, Any]:
    if not db.get(Student, StudentId):
        api_error(404, "STUDENT_NOT_FOUND", "That student was not found.")
    return {"link": PayLinkPayload(CurrentPayLink(db, StudentId)), "onlinePaymentsLive": OnlinePaymentsLive(db)}


def CreatePayLink(db: Session, *, StudentId: str, Actor: User | None) -> dict[str, Any]:
    from app.services.payments.receipts_service import _LockStudent

    if not OnlinePaymentsLive(db):
        api_error(409, "ONLINE_PAYMENTS_OFF", "Switch on online payments in Payment Settings > Online Payments first.")
    StudentRow = _LockStudent(db, StudentId)
    Existing = CurrentPayLink(db, StudentId)
    if Existing:
        db.commit()
        return {"link": PayLinkPayload(Existing), "onlinePaymentsLive": True}
    Link = PaymentLink(
        token=secrets.token_urlsafe(24),
        student_id=StudentRow.id,
        status="ACTIVE",
        expires_at=_Now() + timedelta(days=PAY_LINK_DAYS),
        open_count=0,
        created_by_user_id=Actor.id if Actor else None,
        created_at=_Now(),
    )
    db.add(Link)
    db.flush()
    WritePaymentAudit(db, EntityType="PAY_LINK", EntityId=Link.id, Action="CREATE", Actor=Actor,
                      After={"student": db.get(User, StudentRow.user_id).full_name if StudentRow.user_id else None, "expiresAt": Link.expires_at.isoformat()})
    db.commit()
    return {"link": PayLinkPayload(Link), "onlinePaymentsLive": True}


def RevokePayLink(db: Session, *, LinkId: str, Actor: User | None) -> dict[str, Any]:
    Link = db.query(PaymentLink).filter(PaymentLink.id == LinkId).with_for_update().first()
    if not Link:
        api_error(404, "PAY_LINK_NOT_FOUND", "That pay link was not found.")
    if Link.status == "REVOKED":
        api_error(409, "PAY_LINK_ALREADY_REVOKED", "That pay link is already switched off.")
    Link.status = "REVOKED"
    Link.revoked_at = _Now()
    Link.revoked_by_user_id = Actor.id if Actor else None
    WritePaymentAudit(db, EntityType="PAY_LINK", EntityId=Link.id, Action="REVOKE", Actor=Actor, Before={"status": "ACTIVE"}, After={"status": "REVOKED"})
    db.commit()
    return {"link": PayLinkPayload(Link)}


def ResolvePayLink(db: Session, Token: str) -> PaymentLink:
    Token = str(Token or "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{20,64}", Token):
        api_error(404, "PAY_LINK_NOT_FOUND", "This pay link is not valid. Please ask Math Path for a new one.")
    Link = db.query(PaymentLink).filter(PaymentLink.token == Token).first()
    if not Link:
        api_error(404, "PAY_LINK_NOT_FOUND", "This pay link is not valid. Please ask Math Path for a new one.")
    if Link.status != "ACTIVE":
        api_error(410, "PAY_LINK_REVOKED", "This pay link has been switched off. Please ask Math Path for a new one.")
    if not _LinkLive(Link):
        api_error(410, "PAY_LINK_EXPIRED", "This pay link has expired. Please ask Math Path for a new one.")
    StudentRow = db.get(Student, Link.student_id)
    if not StudentRow:
        api_error(404, "PAY_LINK_NOT_FOUND", "This pay link is not valid. Please ask Math Path for a new one.")
    return Link


def PublicPayPage(db: Session, Link: PaymentLink, *, CountOpen: bool) -> dict[str, Any]:
    from app.services.payments.invoices_service import TodayInIndia
    from app.services.payments.receipts_service import InvoiceBalance

    if CountOpen:
        Link.open_count = (Link.open_count or 0) + 1
        Link.last_opened_at = _Now()
        db.commit()
    StudentRow = db.get(Student, Link.student_id)
    UserRow = db.get(User, StudentRow.user_id)
    LevelRow = db.get(Level, StudentRow.current_level_id) if StudentRow.current_level_id else None
    Centre = db.get(PaymentCentre, StudentRow.centre_id) if StudentRow.centre_id else None
    Profile = db.get(PaymentBusinessProfile, "default")
    Today = TodayInIndia()
    Unpaid = _UnpaidInvoices(db, StudentRow.id)
    Paid = (
        db.query(OnlinePaymentOrder, PaymentReceipt)
        .join(PaymentReceipt, OnlinePaymentOrder.payment_receipt_id == PaymentReceipt.id)
        .filter(OnlinePaymentOrder.pay_link_id == Link.id, PaymentReceipt.status == "RECORDED")
        .order_by(PaymentReceipt.payment_date.desc(), PaymentReceipt.receipt_number.desc())
        .all()
    )
    Due = sum(InvoiceBalance(Row) for Row in Unpaid)
    return {
        "business": {
            "name": _BusinessName(db),
            "legalName": Profile.legal_name if Profile else None,
            "phone": Profile.phone if Profile else None,
            "email": Profile.email if Profile else None,
        },
        "student": {
            "name": UserRow.full_name if UserRow else "",
            "studentCode": StudentRow.student_code,
            "levelCode": LevelRow.level_code if LevelRow else None,
            "centreName": Centre.name if Centre else None,
        },
        "unpaidInvoices": [_StudentInvoice(Row, Today) for Row in Unpaid],
        "duePaise": Due,
        "dueDisplay": FormatIndianRupees(Due),
        "onlinePaymentsLive": OnlinePaymentsLive(db),
        "expiresAt": _Iso(Link.expires_at),
        "paidWithThisLink": [
            {"paymentId": Receipt.id, "receiptNumber": Receipt.receipt_number, "paymentDate": Receipt.payment_date.isoformat(), "amountDisplay": FormatIndianRupees(Receipt.amount_paise)}
            for _, Receipt in Paid
        ],
    }


def PayLinkReceiptForPdf(db: Session, *, Link: PaymentLink, PaymentId: str) -> PaymentReceipt:
    Row = (
        db.query(PaymentReceipt)
        .join(OnlinePaymentOrder, OnlinePaymentOrder.payment_receipt_id == PaymentReceipt.id)
        .filter(PaymentReceipt.id == PaymentId, OnlinePaymentOrder.pay_link_id == Link.id, PaymentReceipt.status == "RECORDED")
        .first()
    )
    if not Row:
        api_error(404, "PAYMENT_NOT_FOUND", "That receipt was not found.")
    return Row


__all__ = [
    "PAY_LINK_DAYS",
    "CheckOrderWithRazorpay",
    "CreateOrder",
    "CreatePayLink",
    "GetOnlineOrder",
    "HandleWebhook",
    "ListOnlineOrders",
    "LogCheckoutEvent",
    "NotifyInvoicesRaised",
    "NotifyPaymentReceived",
    "OnlineSettingsPayload",
    "OrderResult",
    "PayLinkOrder",
    "PayLinkReceiptForPdf",
    "PublicPayPage",
    "RecordOnlinePayment",
    "ResolvePayLink",
    "RevokePayLink",
    "StudentFees",
    "StudentFeesSummary",
    "StudentInvoiceForPdf",
    "StudentOrder",
    "StudentPayLink",
    "StudentReceiptForPdf",
    "UpdateOnlineSettings",
    "VerifyCheckout",
]
