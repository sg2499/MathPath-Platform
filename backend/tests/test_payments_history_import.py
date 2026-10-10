"""Old platform payment history import (2026-10-10): matching students,
adding former students, old numbers, method lines, discounts, advance,
numbering, the checks, and that Day Close leaves the history alone."""

import csv
from datetime import date

import pytest

from app.models import Level, PaymentInvoice, PaymentMethodLine, PaymentNumberSequence, PaymentReceipt, Student, User
from app.services.payments import dayclose_service as dc
from app.services.payments import history_import as hi
from app.services.payments.numbering import FormatDocumentNumber
from tests.test_payments_phase2_invoices import _session, _world

STUDENT_COLUMNS = ["id", "st_custom_id", "admission_date", "st_name", "dob", "gender", "f_name", "f_mobile", "m_mobile", "f_whatsapp", "m_whatsapp", "employee_name", "is_deleted", "user_name", "password"]
PAYMENT_COLUMNS = ["id", "payment_custom_id", "st_id", "trans_id", "group_id", "group_name", "total_amount", "total_disc_amount", "total_pay_amount", "total_due_amount", "pay_by", "received_by", "is_deleted", "created_at", "group_amount", "date", "group_pay_amount", "group_due_amount", "voucher_id"]
REPORT_COLUMNS = ["payment_id", "invoice_no", "date", "student", "cash", "razorpay", "upi", "net_banking", "grand_total", "trans_ref", "pg_payment_id", "order_id", "updated_by"]


def _write(path, columns, rows):
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in columns})


def _pay_row(**values):
    row = {"is_deleted": "0", "pay_by": "Parent", "received_by": "Front Desk", "created_at": "2026-10-05 11:00:00", "total_disc_amount": "0"}
    row.update(values)
    return row


@pytest.fixture()
def old_folder(tmp_path):
    _write(tmp_path / "students.csv", STUDENT_COLUMNS, [
        {"id": "1", "st_custom_id": "1101", "st_name": "Aarav Sen", "f_mobile": "9800000000", "is_deleted": "0", "user_name": "aarav", "password": "$2y$old-hash"},
        # Spelt differently here; same parent mobile.
        {"id": "2", "st_custom_id": "1102", "st_name": "Bina Ray", "f_mobile": "+91 98000 00000", "is_deleted": "0"},
        {"id": "13", "st_custom_id": "6", "st_name": "ST5", "f_mobile": "1", "is_deleted": "0"},
        # A former student who is not on this site.
        {"id": "32", "st_custom_id": "1132", "st_name": "Anwesha Mustafi", "admission_date": "2021-04-01", "dob": "2013-02-27", "gender": "Female",
         "f_name": "Mr Mustafi", "f_mobile": "9111111111", "is_deleted": "0"},
    ])
    _write(tmp_path / "payment_groups.csv", ["id", "group_name"], [{"id": "7", "group_name": "Monthly Fees - Oct"}, {"id": "8", "group_name": "MathPath Bag"}, {"id": "9", "group_name": "Monthly Fees - Sep"}])
    _write(tmp_path / "payments.csv", PAYMENT_COLUMNS, [
        # Old invoice 1001 (two lines) paid by receipt 700 with a 50 discount.
        _pay_row(id="10", payment_custom_id="700", st_id="1", trans_id="11", group_id="7", group_name="Monthly Fees - Oct", total_amount="1450", total_disc_amount="50", total_pay_amount="1400", total_due_amount="0", group_amount="1100", date="2026-10-05", voucher_id="1001"),
        _pay_row(id="11", payment_custom_id="700", st_id="1", trans_id="11", group_id="8", group_name="MathPath Bag", total_amount="1450", total_disc_amount="50", total_pay_amount="1400", total_due_amount="0", group_amount="350", date="2026-10-05", voucher_id="1001"),
        # Old invoice 1002, unpaid in the export.
        _pay_row(id="12", st_id="2", group_id="7", group_name="Monthly Fees - Oct", total_amount="1100", total_pay_amount="0", total_due_amount="1100", group_amount="1100", date="2026-10-01", group_due_amount="1100", voucher_id="1002", pay_by="system", received_by="system"),
        # Paid without an invoice, and the old site used receipt 700 twice.
        _pay_row(id="13", payment_custom_id="700", st_id="32", trans_id="12", group_id="9", group_name="Monthly Fees - Sep", total_amount="1100", total_pay_amount="1100", total_due_amount="0", group_amount="1100", date="2026-09-08", pay_by="system", received_by="system"),
        # Old test record.
        _pay_row(id="14", payment_custom_id="650", st_id="13", trans_id="9", group_id="8", group_name="MathPath Bag", total_amount="350", total_pay_amount="350", group_amount="350", date="2026-09-01"),
        # Deleted row.
        _pay_row(id="15", st_id="1", group_id="8", group_name="MathPath Bag", total_amount="350", group_amount="350", date="2026-09-01", is_deleted="1", voucher_id="999"),
    ])
    _write(tmp_path / "old-site-collections-2026-10-10.csv", REPORT_COLUMNS, [
        {"payment_id": "700", "invoice_no": "1001", "date": "2026-10-05", "student": "1101 | Aarav Sen", "cash": "1000", "razorpay": "2", "upi": "400", "net_banking": "0", "grand_total": "1402", "trans_ref": "UPI123", "pg_payment_id": "pay_SMALL"},
        {"payment_id": "700", "invoice_no": "", "date": "2026-09-08", "student": "1132 | Anwesha Mustafi", "cash": "0", "razorpay": "1100", "upi": "0", "net_banking": "0", "grand_total": "1100", "pg_payment_id": "pay_ABC", "order_id": "order_XYZ"},
        {"payment_id": "650", "invoice_no": "", "date": "2026-09-01", "student": "6 | ST5", "cash": "350", "razorpay": "0", "upi": "0", "net_banking": "0", "grand_total": "350"},
        # Newer than the table export: part of invoice 1002.
        {"payment_id": "702", "invoice_no": "1002", "date": "2026-10-10", "student": "1102 | Bina Ray", "cash": "0", "razorpay": "0", "upi": "600", "net_banking": "0", "grand_total": "600", "trans_ref": "UPI999", "updated_by": "Front Desk"},
        {"payment_id": "Total", "grand_total": "3452"},
    ])
    return tmp_path


def _db():
    db = _session()
    _world(db, numbering_set=False)
    # The site's last student code, and the level the former student gets.
    db.get(Student, "s3").student_code = "MP-ST-0154"
    module_id = db.get(Level, "lvl-im3").module_id
    db.add(Level(id="lvl-im4", module_id=module_id, level_code="IM-L4", level_name="Intermediate Level 4"))
    db.commit()
    return db


def test_import_old_history(old_folder, monkeypatch):
    monkeypatch.setattr(hi, "CREATE_STUDENTS", {"32": "IM-L4"})
    monkeypatch.setattr(hi, "TEACHER_OVERRIDES", {})
    db = _db()
    data = hi.LoadOldData(old_folder)
    assert "password" not in data.students["1"] and "user_name" not in data.students["1"]

    result = hi.RunImport(db, data, ExpectedDuePaise=50000)
    db.commit()
    assert result.problems == []
    assert result.summary["duePaise"] == 50000 and result.summary["collectedPaise"] == 310000

    # The former student: next code, inactive, no usable login.
    added = db.query(Student).filter(Student.student_code == "MP-ST-0155").one()
    user = db.get(User, added.user_id)
    assert (added.custom_id, added.is_active, user.is_active, user.full_name) == ("MP-2026-0155", False, False, "Anwesha Mustafi")
    assert (added.admission_date, added.dob, added.father_mobile) == ("2021-04-01", "2013-02-27", "9111111111")
    assert db.get(Level, added.current_level_id).level_code == "IM-L4"

    invoices = {row.invoice_number: row for row in db.query(PaymentInvoice).all()}
    assert set(invoices) == {"MP-INV-0001001", "MP-INV-0001001-B", "MP-INV-0001002", "MP-INV-R700-B"}
    assert all(row.source == "LEGACY" for row in invoices.values())
    monthly = invoices["MP-INV-0001001"]
    assert (monthly.fee_name, monthly.period_key, monthly.status) == ("Monthly Fee", "2026-10", "PAID")
    bag = invoices["MP-INV-0001001-B"]
    assert (bag.fee_name, bag.paid_paise, bag.discount_paise, bag.status) == ("MathPath Bag", 30000, 5000, "PAID")
    assert (invoices["MP-INV-0001002"].invoice_date, invoices["MP-INV-0001002"].paid_paise, invoices["MP-INV-0001002"].status) == (date(2026, 10, 1), 60000, "PART_PAID")
    assert invoices["MP-INV-R700-B"].student_id == added.id and invoices["MP-INV-R700-B"].period_key == "2026-09"

    receipts = {row.receipt_number: row for row in db.query(PaymentReceipt).all()}
    assert set(receipts) == {"MP-MRCPT-700", "MP-MRCPT-700-B", "MP-MRCPT-702"}
    first = receipts["MP-MRCPT-700"]
    lines = db.query(PaymentMethodLine).filter(PaymentMethodLine.payment_id == first.id).order_by(PaymentMethodLine.line_order).all()
    assert [(line.method, line.amount_paise, line.reference) for line in lines] == [("CASH", 100000, None), ("UPI", 40000, "UPI123")]
    assert (first.discount_paise, first.received_by_name, first.channel) == (5000, "Front Desk", "COUNTER")
    online = receipts["MP-MRCPT-700-B"]
    lines = db.query(PaymentMethodLine).filter(PaymentMethodLine.payment_id == online.id).all()
    assert [(line.method, line.amount_paise, line.reference) for line in lines] == [("RAZORPAY", 110000, "pay_ABC order_XYZ")]
    assert (online.amount_paise, online.channel, online.received_by_name) == (110000, "ONLINE", "Razorpay")
    assert receipts["MP-MRCPT-702"].payment_date == date(2026, 10, 10)
    # The small Razorpay extra on the old report is left out; the payment
    # itself was at the counter.
    assert any("MP-MRCPT-700 (Aarav Sen): left out the extra ₹2.00" in line for line in result.lines)

    # Numbering continues after the old site's.
    sequences = {row.key: row for row in db.query(PaymentNumberSequence).all()}
    assert FormatDocumentNumber(sequences["INVOICE"].prefix, sequences["INVOICE"].pad_width, sequences["INVOICE"].next_number) == "MP-INV-0001003"
    assert FormatDocumentNumber(sequences["RECEIPT"].prefix, sequences["RECEIPT"].pad_width, sequences["RECEIPT"].next_number) == "MP-MRCPT-703"
    assert sequences["INVOICE"].is_configured and sequences["RECEIPT"].is_configured

    # Day Close starts with this site's own money.
    assert dc.DayFigures(db, date(2026, 10, 10))["paymentCount"] == 0
    monkeypatch.setattr(dc, "_Today", lambda: date(2026, 10, 10))
    assert all(day["paymentCount"] == 0 for day in dc.RecentDays(db)["days"])

    # A second run changes nothing.
    with pytest.raises(hi.ImportProblem):
        hi.RunImport(db, hi.LoadOldData(old_folder))


def test_import_stops_on_an_unknown_student(old_folder, monkeypatch):
    monkeypatch.setattr(hi, "CREATE_STUDENTS", {})
    db = _db()
    with pytest.raises(hi.ImportProblem, match="Anwesha Mustafi"):
        hi.RunImport(db, hi.LoadOldData(old_folder))


def test_due_mismatch_is_reported(old_folder, monkeypatch):
    monkeypatch.setattr(hi, "CREATE_STUDENTS", {"32": "IM-L4"})
    monkeypatch.setattr(hi, "TEACHER_OVERRIDES", {})
    db = _db()
    result = hi.RunImport(db, hi.LoadOldData(old_folder), ExpectedDuePaise=60000)
    assert any("does not match" in problem for problem in result.problems)


def test_fee_names():
    assert (hi.FeeSpecFor("Monthly Fees - Jan", 110000).name, hi.FeeSpecFor("Monthly Fees - Jan", 110000).month) == ("Monthly Fee", 1)
    assert hi.FeeSpecFor("Monthly Tution Fees - International - Aug", 220000).name == "Monthly Fee International"
    assert hi.FeeSpecFor("Young Learner Book  Charges", 50000).billing == "ONE_TIME"
    assert hi._PeriodFor(1, date(2025, 12, 20)) == (2026, 1)
