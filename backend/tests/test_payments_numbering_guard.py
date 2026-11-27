"""2026-11-27: Document Numbering knows carried-over numbers, never breaks
the series by accident, and a number already in use gives a clear message
instead of "Something went wrong". Also: a receipt says how it was paid
("Paid by UPI", "Paid in cash") instead of "Paid at the centre"."""

import pytest
from fastapi import HTTPException

from app.models import Notification, PaymentNumberSequence, PaymentOnlineSettings, PaymentReceipt
from app.services.payments import invoices_service as inv
from app.services.payments import numbering
from app.services.payments import online_service as online
from app.services.payments import receipts_service as rec
from tests.test_payments_phase3_receipts import _invoice, _pay, _setup


@pytest.fixture(autouse=True)
def _fixed_today(monkeypatch):
    from datetime import date

    monkeypatch.setattr(inv, "TodayInIndia", lambda: date(2026, 11, 20))


def _code(excinfo):
    return excinfo.value.detail["code"]


def _carry_over_receipt(db, number):
    """A receipt brought across from the old platform: it carries a number the
    sequence never issued."""
    original = db.query(PaymentReceipt).first()
    original.receipt_number = number
    db.commit()


def _live_like(db, admin, monthly):
    """The live site on 27 Nov: receipts up to 1046 issued here, 1047 carried
    over afterwards, next number 1048."""
    _pay(db, admin, allocations=((_invoice(db, "s1", "Monthly Fee").id, 110000, 0),))  # MP-MRCPT-631
    _carry_over_receipt(db, "MP-MRCPT-1047")
    sequence = db.get(PaymentNumberSequence, "RECEIPT")
    sequence.last_issued_number = 1046
    sequence.next_number = 1048
    db.commit()


def test_next_number_cannot_land_on_a_carried_over_number():
    db, admin, monthly, _ = _setup()
    _live_like(db, admin, monthly)
    with pytest.raises(HTTPException) as excinfo:
        numbering.SetStartingNumber(db, Key="RECEIPT", NextNumber=1047, Actor=admin)
    assert _code(excinfo) == "PAYMENT_SEQUENCE_BACKWARDS"
    assert "MP-MRCPT-1047 has already been used" in excinfo.value.detail["message"]
    assert "1048 or higher" in excinfo.value.detail["message"]


def test_a_gap_is_refused_unless_wanted():
    db, admin, monthly, _ = _setup()
    _live_like(db, admin, monthly)
    with pytest.raises(HTTPException) as excinfo:
        numbering.SetStartingNumber(db, Key="RECEIPT", NextNumber=1050, Actor=admin)
    assert _code(excinfo) == "PAYMENT_SEQUENCE_GAP"
    assert "skip 2 numbers (MP-MRCPT-1048 to MP-MRCPT-1049)" in excinfo.value.detail["message"]
    with pytest.raises(HTTPException) as excinfo:
        numbering.SetStartingNumber(db, Key="RECEIPT", NextNumber=1049, Actor=admin)
    assert "skip 1 number (MP-MRCPT-1048) and break the series" in excinfo.value.detail["message"]
    # Straight on from the last number used is always fine.
    assert numbering.SetStartingNumber(db, Key="RECEIPT", NextNumber=1048, Actor=admin)["nextFormatted"] == "MP-MRCPT-1048"
    # A wanted gap, ticked by the admin, is allowed and audited like any change.
    assert numbering.SetStartingNumber(db, Key="RECEIPT", NextNumber=1050, Actor=admin, AllowGap=True)["nextFormatted"] == "MP-MRCPT-1050"


def test_highest_used_reads_every_padding_and_ignores_renamed_tests():
    db, admin, _, _ = _setup()
    invoices = db.query(inv.PaymentInvoice).order_by(inv.PaymentInvoice.created_at).all()
    for invoice, number in zip(invoices, ("MP-INV-000977", "MP-INV-0001226", "TEST-INV-1227-RZP", "MP-INV-0001079-B")):
        invoice.invoice_number = number
    sequence = db.get(PaymentNumberSequence, "INVOICE")
    sequence.last_issued_number = None
    db.commit()
    assert numbering.HighestUsedNumber(db, sequence) == 1226
    payload = next(row for row in numbering.ListNumberSequences(db) if row["key"] == "INVOICE")
    assert payload["highestUsedNumber"] == 1226
    assert payload["highestUsedFormatted"].endswith("1226")


def test_a_number_already_in_use_is_a_clear_message_not_a_crash():
    db, admin, monthly, _ = _setup()
    _live_like(db, admin, monthly)
    # Set behind the guard's back (as a bad script could): the next save must
    # say what is wrong and where to fix it, and nothing is half saved.
    sequence = db.get(PaymentNumberSequence, "RECEIPT")
    sequence.next_number = 1047
    db.commit()
    before = db.query(PaymentReceipt).count()
    with pytest.raises(HTTPException) as excinfo:
        _pay(db, admin, student="s2", allocations=((_invoice(db, "s2", "Monthly Fee").id, 110000, 0),))
    assert excinfo.value.status_code == 409
    assert _code(excinfo) == "PAYMENT_NUMBER_TAKEN"
    assert "MP-MRCPT-1047 already exists" in excinfo.value.detail["message"]
    assert "Document Numbering" in excinfo.value.detail["message"]
    db.rollback()
    assert db.query(PaymentReceipt).count() == before
    assert db.get(PaymentNumberSequence, "RECEIPT").next_number == 1047


@pytest.mark.parametrize(
    "channel, methods, expected",
    [
        ("ONLINE", ["RAZORPAY"], "online"),
        ("COUNTER", ["UPI"], "by UPI"),
        ("COUNTER", ["CASH"], "in cash"),
        ("COUNTER", ["CHEQUE"], "by cheque"),
        ("COUNTER", ["NET_BANKING"], "by net banking"),
        ("COUNTER", ["CASH", "UPI"], "in cash and by UPI"),
        ("COUNTER", ["CASH", "UPI", "CHEQUE"], "in cash, by UPI and by cheque"),
        ("COUNTER", ["UPI", "UPI"], "by UPI"),
        ("COUNTER", ["OTHERS"], "at the centre"),
        ("COUNTER", [], "at the centre"),
    ],
)
def test_paid_how_wording(channel, methods, expected):
    assert rec.PaidHow(channel, methods) == expected


def test_student_receipt_and_notification_say_how_it_was_paid():
    db, admin, monthly, _ = _setup()
    db.merge(PaymentOnlineSettings(id="default", student_fees_enabled=True))
    db.commit()
    invoice = _invoice(db, "s1", "Monthly Fee")
    payment = _pay(db, admin, allocations=((invoice.id, 110000, 0),), methods=(("UPI", 110000, "UTR123"),))
    assert payment["paidHow"] == "Paid by UPI"
    row = db.get(PaymentReceipt, payment["paymentId"])
    assert online._StudentPayment(db, row)["paidHow"] == "Paid by UPI"
    note = db.query(Notification).filter(Notification.type == "FEES_PAYMENT_RECEIVED").order_by(Notification.created_at.desc()).first()
    assert note is not None and "received by UPI" in note.message
