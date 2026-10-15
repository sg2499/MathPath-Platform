"""Old platform top-up (Phase 2 part 6, 2026-10-15): newer receipts (a
back-dated one and a 'PreviousDue' one), new old invoices (unpaid from the
Dues report, paid from old-invoices.csv), invoices removed on the old
platform cancelled, numbering moved on, every student's due checked, and a
second run changing nothing."""

from datetime import date

import pytest

from app.models import PaymentAllocation, PaymentInvoice, PaymentMethodLine, PaymentNumberSequence, PaymentReceipt, Student
from app.services.payments import history_import as hi
from app.services.payments import history_topup as ht
from app.services.payments import insights_service as insights
from app.services.payments.numbering import FormatDocumentNumber
from tests.test_payments_history_import import PAYMENT_COLUMNS, _db, _pay_row, _write, old_folder  # noqa: F401

COLLECTIONS = ["payment_id", "invoice_no", "date", "student", "cash", "razorpay", "upi", "net_banking", "grand_total", "trans_ref", "pg_payment_id", "order_id", "updated_by"]
DUES = ["invoice_no", "date", "student", "father", "mobile", "due_group", "total_due"]
STUDENTS = ["old_id", "name", "father", "mobile", "status"]
INVOICES = ["invoice_no", "date", "old_id", "fee_group", "amount", "discount"]

OLD_REPORT = [
    {"payment_id": "700", "invoice_no": "1001", "date": "2026-10-05", "student": "1101 | Aarav Sen", "cash": "1000", "razorpay": "2", "upi": "400", "net_banking": "0", "grand_total": "1402"},
    {"payment_id": "700", "invoice_no": "", "date": "2026-09-08", "student": "1132 | Anwesha Mustafi", "cash": "0", "razorpay": "1100", "upi": "0", "net_banking": "0", "grand_total": "1100"},
    {"payment_id": "650", "invoice_no": "", "date": "2026-09-01", "student": "6 | ST5", "cash": "350", "razorpay": "0", "upi": "0", "net_banking": "0", "grand_total": "350"},
    {"payment_id": "702", "invoice_no": "1002", "date": "2026-10-10", "student": "1102 | Bina Ray", "cash": "0", "razorpay": "0", "upi": "600", "net_banking": "0", "grand_total": "600"},
]
NEW_REPORT = [
    # Bina pays the rest of 1002.
    {"payment_id": "703", "invoice_no": "1002", "date": "2026-10-11", "student": "1102 | Bina Ray", "cash": "0", "razorpay": "0", "upi": "500", "net_banking": "0", "grand_total": "500", "trans_ref": "6283", "updated_by": "Admin"},
    # Aarav pays a new old invoice (1007) that is already paid, so only old-invoices.csv knows it.
    {"payment_id": "704", "invoice_no": "1007", "date": "2026-10-12", "student": "1101 | Aarav Sen", "cash": "0", "razorpay": "300", "upi": "0", "net_banking": "0", "grand_total": "300", "trans_ref": "1310", "pg_payment_id": "pay_NEW", "order_id": "order_NEW"},
    # Back-dated, recorded against 'PreviousDue' (no invoice): pays Aarav's oldest unpaid (1004, Sep).
    {"payment_id": "705", "invoice_no": "None", "date": "2026-09-20", "student": "1101 | Aarav Sen", "cash": "1100", "razorpay": "0", "upi": "0", "net_banking": "0", "grand_total": "1100", "updated_by": "Admin"},
]


@pytest.fixture()
def base(old_folder, monkeypatch):  # noqa: F811
    """The 10 Oct import, with two more unpaid September invoices: Aarav
    1004 and Bina 1005."""
    monkeypatch.setattr(hi, "CREATE_STUDENTS", {"32": "IM-L4"})
    monkeypatch.setattr(hi, "TEACHER_OVERRIDES", {})
    import csv

    rows = list(csv.DictReader((old_folder / "payments.csv").open()))
    rows += [
        _pay_row(id="16", st_id="1", group_id="9", group_name="Monthly Fees - Sep", total_amount="1100", total_pay_amount="0", total_due_amount="1100", group_amount="1100", date="2026-09-01", group_due_amount="1100", voucher_id="1004", pay_by="system", received_by="system"),
        _pay_row(id="17", st_id="2", group_id="9", group_name="Monthly Fees - Sep", total_amount="1100", total_pay_amount="0", total_due_amount="1100", group_amount="1100", date="2026-09-01", group_due_amount="1100", voucher_id="1005", pay_by="system", received_by="system"),
    ]
    _write(old_folder / "payments.csv", PAYMENT_COLUMNS, rows)
    db = _db()
    result = hi.RunImport(db, hi.LoadOldData(old_folder), ExpectedDuePaise=270000)
    assert result.problems == []
    db.commit()
    return db


def _topup_folder(tmp_path, *, report=None, dues=None, students=None, invoices=None):
    folder = tmp_path / "topup"
    folder.mkdir(exist_ok=True)
    _write(folder / "old-collections.csv", COLLECTIONS, (OLD_REPORT + NEW_REPORT if report is None else report) + [{"payment_id": "Total"}])
    rows = dues if dues is not None else [
        {"invoice_no": "1006", "date": "2026-10-14", "student": "1101 | Aarav Sen", "father": "Parent Aarav", "mobile": "9800000000", "due_group": "Master Module Content Charges-1500", "total_due": "₹ 1500"},
        {"invoice_no": "288", "date": "2026-06-01", "student": "1 | Dummy", "due_group": "Monthly Fees - Jun-1100", "total_due": "₹ 1100"},
    ]
    total = sum(int(str(row["total_due"]).replace("₹", "").strip()) for row in rows)
    _write(folder / "old-dues.csv", DUES, rows + [{"invoice_no": f"TOTAL DUE : ₹ {total}.00"}])
    _write(folder / "old-students.csv", STUDENTS, students if students is not None else [
        {"old_id": "1101", "name": "Aarav Sen", "father": "Parent Aarav", "mobile": "9800000000", "status": "Active"},
        {"old_id": "1102", "name": "Bina Ray", "father": "Parent Bina", "mobile": "9800000000", "status": "Active"},
        {"old_id": "1132", "name": "Anwesha Mustafi", "father": "Mr Mustafi", "mobile": "9111111111", "status": "Inactive"},
        # A new admission on the old platform with no money yet: listed, not added.
        {"old_id": "1199", "name": "Navya New", "father": "Mr New", "mobile": "9777777777", "status": "Active"},
        # Inactive with no payments: ignored.
        {"old_id": "1150", "name": "Gone Away", "father": "Mr Gone", "mobile": "9666666666", "status": "Inactive"},
    ])
    _write(folder / "old-invoices.csv", INVOICES, invoices if invoices is not None else [
        # Rs 350 with Rs 50 off on the old platform; Rs 300 paid (like MP-INV-0001074).
        {"invoice_no": "1007", "date": "2026-10-12", "old_id": "1101", "fee_group": "Abacus Kit", "amount": "350", "discount": "50"},
    ])
    return folder


def _next(db, key):
    row = db.get(PaymentNumberSequence, key)
    return FormatDocumentNumber(row.prefix, row.pad_width, row.next_number)


def test_topup_brings_everything_across_and_balances(base, tmp_path):
    db = base
    result = ht.RunTopup(db, ht.LoadTopupData(_topup_folder(tmp_path)), ExpectedDuePaise=150000, Today=date(2026, 10, 15))
    assert result.problems == [], "\n".join(result.problems + result.lines)
    db.commit()
    assert result.summary["receiptsAdded"] == 3 and result.summary["collectedPaise"] == 190000
    assert result.summary["invoicesAdded"] == 2 and result.summary["invoicesCancelled"] == 1
    assert result.summary["duePaise"] == 150000 and result.summary["studentsDifferent"] == 0

    invoices = {row.invoice_number: row for row in db.query(PaymentInvoice).all()}
    # Bina's 1002 is paid off; Aarav's back-dated PreviousDue payment pays his Sep 1004.
    assert invoices["MP-INV-0001002"].status == "PAID"
    assert invoices["MP-INV-0001004"].status == "PAID"
    # New old invoices: the unpaid one from the Dues report, the paid one from old-invoices.csv.
    content = invoices["MP-INV-0001006"]
    assert (content.fee_name, content.amount_paise, content.status, content.source, content.invoice_date) == ("Master Module Content Charges", 150000, "PENDING", "LEGACY", date(2026, 10, 14))
    kit = invoices["MP-INV-0001007"]
    assert (kit.fee_name, kit.status, kit.student_id, kit.amount_paise, kit.paid_paise, kit.discount_paise) == ("Abacus Kit", "PAID", "s1", 35000, 30000, 5000)
    # Removed on the old platform and never paid: cancelled with the reason.
    removed = invoices["MP-INV-0001005"]
    assert removed.status == "CANCELLED" and removed.cancel_reason.startswith("Removed on the old platform")

    receipts = {row.receipt_number: row for row in db.query(PaymentReceipt).all()}
    online = receipts["MP-MRCPT-704"]
    lines = db.query(PaymentMethodLine).filter(PaymentMethodLine.payment_id == online.id).all()
    assert [(line.method, line.amount_paise, line.reference) for line in lines] == [("RAZORPAY", 30000, "1310 · pay_NEW order_NEW")]
    assert (online.channel, online.received_by_name, online.source) == ("ONLINE", "Razorpay", "LEGACY")
    assert (online.amount_paise, online.discount_paise, online.discount_reason) == (30000, 5000, "Discount given on the old platform.")
    back_dated = receipts["MP-MRCPT-705"]
    assert back_dated.payment_date == date(2026, 9, 20)
    paid = db.query(PaymentAllocation).filter(PaymentAllocation.payment_id == back_dated.id).one()
    assert paid.invoice_id == invoices["MP-INV-0001004"].id and paid.amount_paise == 110000

    # Numbering past the old platform's highest.
    assert _next(db, "INVOICE") == "MP-INV-0001008" and _next(db, "RECEIPT") == "MP-MRCPT-706"

    # The run lists the new admission, ignores the inactive one with no money,
    # and leaves the test record out.
    text = "\n".join(result.lines)
    assert "Navya New (old id 1199)" in text and "Gone Away" not in text
    assert "test record Dummy" in text

    # Activity line.
    texts = [row.get("text") or "" for row in insights.Activity(db)["items"]]
    assert any("Brought across the old platform's newer payments: 3 payments and 2 invoices, 1 invoices removed there cancelled" in text for text in texts), texts

    # Money only: nobody's active/inactive status changed.
    assert {row.id: row.is_active for row in db.query(Student).all()}["s3"] is False

    # A second run with the same files changes nothing and still balances.
    again = ht.RunTopup(db, ht.LoadTopupData(_topup_folder(tmp_path)), ExpectedDuePaise=150000, Today=date(2026, 10, 16))
    assert again.problems == []
    assert (again.summary["receiptsAdded"], again.summary["invoicesAdded"], again.summary["invoicesCancelled"]) == (0, 0, 0)
    assert "nothing new to bring across" in again.lines[0]


def test_wrong_expected_due_or_a_mismatch_stops_it(base, tmp_path):
    db = base
    result = ht.RunTopup(db, ht.LoadTopupData(_topup_folder(tmp_path)), ExpectedDuePaise=160000)
    assert any("not the ₹1,600.00 given" in problem for problem in result.problems)
    db.rollback()

    # The old platform says Aarav owes Rs 1,000 on 1006, not 1,500: the per-student check catches it.
    dues = [{"invoice_no": "1006", "date": "2026-10-14", "student": "1101 | Aarav Sen", "due_group": "Master Module Content Charges-1500", "total_due": "1500"},
            {"invoice_no": "1004", "date": "2026-09-01", "student": "1101 | Aarav Sen", "due_group": "Monthly Fees - Sep-1100", "total_due": "1100"}]
    result = ht.RunTopup(db, ht.LoadTopupData(_topup_folder(tmp_path, dues=dues)), ExpectedDuePaise=260000)
    assert any(problem.startswith("MP-") and "due" in problem for problem in result.problems)
    db.rollback()


def test_a_paid_new_invoice_without_details_asks_for_them(base, tmp_path):
    db = base
    result = ht.RunTopup(db, ht.LoadTopupData(_topup_folder(tmp_path, invoices=[])), ExpectedDuePaise=150000)
    assert any("Old invoice 1007 is new and already paid" in problem for problem in result.problems)
    db.rollback()
    assert db.query(PaymentReceipt).filter(PaymentReceipt.receipt_number == "MP-MRCPT-703").count() == 0


def test_money_for_a_student_not_here_stops_it(base, tmp_path):
    db = base
    report = OLD_REPORT + [{"payment_id": "706", "invoice_no": "1010", "date": "2026-10-13", "student": "1199 | Navya New", "cash": "1100", "razorpay": "0", "upi": "0", "net_banking": "0", "grand_total": "1100"}]
    dues = [{"invoice_no": "1006", "date": "2026-10-14", "student": "1101 | Aarav Sen", "due_group": "Master Module Content Charges-1500", "total_due": "1500"},
            {"invoice_no": "1004", "date": "2026-09-01", "student": "1101 | Aarav Sen", "due_group": "Monthly Fees - Sep-1100", "total_due": "1100"},
            {"invoice_no": "1002", "date": "2026-10-01", "student": "1102 | Bina Ray", "due_group": "Monthly Fees - Oct-500", "total_due": "500"},
            {"invoice_no": "1005", "date": "2026-09-01", "student": "1102 | Bina Ray", "due_group": "Monthly Fees - Sep-1100", "total_due": "1100"}]
    result = ht.RunTopup(db, ht.LoadTopupData(_topup_folder(tmp_path, report=report, dues=dues, invoices=[{"invoice_no": "1010", "date": "2026-10-13", "old_id": "1199", "fee_group": "Monthly Fees - Oct", "amount": "1100"}])), ExpectedDuePaise=420000)
    assert any("Navya New" in problem and "not on this site" in problem for problem in result.problems)
    db.rollback()


def test_a_receipt_for_an_invoice_already_paid_here_stops_it(base, tmp_path):
    db = base
    report = OLD_REPORT + [{"payment_id": "707", "invoice_no": "1001", "date": "2026-10-13", "student": "1101 | Aarav Sen", "cash": "1100", "razorpay": "0", "upi": "0", "net_banking": "0", "grand_total": "1100"}]
    dues = [{"invoice_no": "1004", "date": "2026-09-01", "student": "1101 | Aarav Sen", "due_group": "Monthly Fees - Sep-1100", "total_due": "1100"},
            {"invoice_no": "1002", "date": "2026-10-01", "student": "1102 | Bina Ray", "due_group": "Monthly Fees - Oct-500", "total_due": "500"},
            {"invoice_no": "1005", "date": "2026-09-01", "student": "1102 | Bina Ray", "due_group": "Monthly Fees - Sep-1100", "total_due": "1100"}]
    result = ht.RunTopup(db, ht.LoadTopupData(_topup_folder(tmp_path, report=report, dues=dues, invoices=[])), ExpectedDuePaise=270000)
    assert any("MP-INV-0001001" in problem and "already paid here" in problem for problem in result.problems)
    db.rollback()


def test_a_reused_receipt_number_stops_it(base, tmp_path):
    db = base
    report = OLD_REPORT + [{"payment_id": "702", "invoice_no": "1002", "date": "2026-10-13", "student": "1102 | Bina Ray", "cash": "500", "razorpay": "0", "upi": "0", "net_banking": "0", "grand_total": "500"}]
    result = ht.RunTopup(db, ht.LoadTopupData(_topup_folder(tmp_path, report=report, invoices=[])), ExpectedDuePaise=150000)
    assert any("Receipt 702" in problem and "reused" in problem for problem in result.problems)
    db.rollback()


def test_it_needs_the_10_oct_import_first(tmp_path):
    db = _db()
    with pytest.raises(hi.ImportProblem, match="10 Oct history import"):
        ht.RunTopup(db, ht.LoadTopupData(_topup_folder(tmp_path)), ExpectedDuePaise=150000)


def test_reading_the_dues_report_groups():
    assert ht._Groups("Monthly Fees - Sep-1100 Monthly Fees - Oct-1100") == [("Monthly Fees - Sep", 110000), ("Monthly Fees - Oct", 110000)]
    assert ht._Groups("Monthly Tution Fees - International - Oct-2200") == [("Monthly Tution Fees - International - Oct", 220000)]
    assert ht._Groups("test group-1-2") == [("test group-1", 200)]
    assert ht._Numbers("763,1015") == ["763", "1015"] and ht._Numbers("None") == []


def test_a_missing_discount_is_caught_by_the_balance_check(base, tmp_path):
    db = base
    folder = _topup_folder(tmp_path, invoices=[{"invoice_no": "1007", "date": "2026-10-12", "old_id": "1101", "fee_group": "Abacus Kit", "amount": "350"}])
    result = ht.RunTopup(db, ht.LoadTopupData(folder), ExpectedDuePaise=150000)
    assert any("due ₹1,550.00 here, ₹1,500.00 on the old platform" in problem for problem in result.problems), result.problems
    assert any("MP-INV-0001007: part-paid here but no longer due" in problem for problem in result.problems)
    db.rollback()


def test_an_unused_discount_is_reported(base, tmp_path):
    db = base
    folder = _topup_folder(tmp_path, invoices=[
        {"invoice_no": "1007", "date": "2026-10-12", "old_id": "1101", "fee_group": "Abacus Kit", "amount": "300"},
        {"invoice_no": "1001", "date": "2026-10-01", "old_id": "1101", "fee_group": "Monthly Fees - Oct", "amount": "1100", "discount": "100"},
    ])
    result = ht.RunTopup(db, ht.LoadTopupData(folder), ExpectedDuePaise=150000)
    assert any("not used by any new receipt: invoice 1001" in problem for problem in result.problems), result.problems
    db.rollback()


def test_a_dues_file_that_does_not_add_up_to_its_total_stops_it(tmp_path):
    folder = _topup_folder(tmp_path)
    text = (folder / "old-dues.csv").read_text().replace("TOTAL DUE : ₹ 2600.00", "TOTAL DUE : ₹ 3700.00")
    (folder / "old-dues.csv").write_text(text)
    with pytest.raises(hi.ImportProblem, match="the file is incomplete"):
        ht.LoadTopupData(folder)


# --- Regressions from the independent review (15 Oct) --------------------------

DUES_1006 = [{"invoice_no": "1006", "date": "2026-10-14", "student": "1101 | Aarav Sen", "due_group": "Master Module Content Charges-1500", "total_due": "1500"}]


def test_a_new_platform_receipt_with_the_same_number_is_never_mistaken_for_the_old_one(base, tmp_path):
    db = base
    # The new platform has already numbered a receipt MP-MRCPT-706.
    db.add(PaymentReceipt(receipt_number="MP-MRCPT-706", student_id="s1", payment_date=date(2026, 11, 1), amount_paise=100, snapshot_json="{}", source="ADMIN"))
    db.commit()
    # The old platform's own 706 pays Bina's Sep 1005: it must not be skipped
    # (and 1005 must not then be cancelled as "removed").
    report = OLD_REPORT + NEW_REPORT + [{"payment_id": "706", "invoice_no": "1005", "date": "2026-10-20", "student": "1102 | Bina Ray", "cash": "1100", "razorpay": "0", "upi": "0", "net_banking": "0", "grand_total": "1100"}]
    result = ht.RunTopup(db, ht.LoadTopupData(_topup_folder(tmp_path, report=report)), ExpectedDuePaise=150000, Today=date(2026, 11, 2))
    assert any("MP-MRCPT-706 is already used here by a new-platform receipt" in problem for problem in result.problems), result.problems
    db.rollback()


def test_a_discount_is_not_applied_again_on_a_later_run(base, tmp_path):
    db = base
    # Run 1: Bina pays Rs 200 on 1002 (Rs 500 left) with Rs 100 off; Rs 200 still due.
    run1 = OLD_REPORT + [{"payment_id": "703", "invoice_no": "1002", "date": "2026-10-11", "student": "1102 | Bina Ray", "cash": "200", "razorpay": "0", "upi": "0", "net_banking": "0", "grand_total": "200"}]
    dues1 = DUES_1006 + [
        {"invoice_no": "1002", "date": "2026-10-01", "student": "1102 | Bina Ray", "due_group": "Monthly Fees - Oct-200", "total_due": "200"},
        {"invoice_no": "1004", "date": "2026-09-01", "student": "1101 | Aarav Sen", "due_group": "Monthly Fees - Sep-1100", "total_due": "1100"},
        {"invoice_no": "1005", "date": "2026-09-01", "student": "1102 | Bina Ray", "due_group": "Monthly Fees - Sep-1100", "total_due": "1100"},
    ]
    discounts = [{"invoice_no": "1002", "date": "2026-10-01", "old_id": "1102", "fee_group": "Monthly Fees - Oct", "amount": "1100", "discount": "100"}]
    first = ht.RunTopup(db, ht.LoadTopupData(_topup_folder(tmp_path, report=run1, dues=dues1, invoices=discounts)), ExpectedDuePaise=390000)
    assert first.problems == [], first.problems
    db.commit()
    # Run 2 a week later with the same old-invoices.csv: Bina pays the last Rs 200.
    run2 = run1 + [{"payment_id": "709", "invoice_no": "1002", "date": "2026-10-18", "student": "1102 | Bina Ray", "cash": "200", "razorpay": "0", "upi": "0", "net_banking": "0", "grand_total": "200"}]
    second = ht.RunTopup(db, ht.LoadTopupData(_topup_folder(tmp_path, report=run2, dues=[row for row in dues1 if row["invoice_no"] != "1002"], invoices=discounts)), ExpectedDuePaise=370000)
    assert second.problems == [], second.problems
    db.commit()
    invoice = db.query(PaymentInvoice).filter_by(invoice_number="MP-INV-0001002").one()
    receipt = db.query(PaymentReceipt).filter_by(receipt_number="MP-MRCPT-709").one()
    assert (invoice.discount_paise, invoice.status, receipt.discount_paise, second.summary["advancePaise"]) == (10000, "PAID", 0, 0)


def test_a_new_part_paid_invoice_takes_its_fee_from_old_invoices_csv(base, tmp_path):
    db = base
    # New old invoice 1008 (Rs 1,000), part-paid Rs 600 by receipt 710; the Dues report shows the Rs 400 left.
    report = OLD_REPORT + NEW_REPORT + [{"payment_id": "710", "invoice_no": "1008", "date": "2026-10-13", "student": "1101 | Aarav Sen", "cash": "600", "razorpay": "0", "upi": "0", "net_banking": "0", "grand_total": "600"}]
    dues = DUES_1006 + [{"invoice_no": "1008", "date": "2026-10-13", "student": "1101 | Aarav Sen", "due_group": "Abacus Kit-400", "total_due": "400"}]
    invoices = [
        {"invoice_no": "1007", "date": "2026-10-12", "old_id": "1101", "fee_group": "Abacus Kit", "amount": "350", "discount": "50"},
        {"invoice_no": "1008", "date": "2026-10-13", "old_id": "1101", "fee_group": "Abacus Kit", "amount": "1000"},
    ]
    result = ht.RunTopup(db, ht.LoadTopupData(_topup_folder(tmp_path, report=report, dues=dues, invoices=invoices)), ExpectedDuePaise=190000)
    assert result.problems == [], result.problems
    invoice = db.query(PaymentInvoice).filter_by(invoice_number="MP-INV-0001008").one()
    assert (invoice.amount_paise, invoice.paid_paise, invoice.status) == (100000, 60000, "PART_PAID")
    db.rollback()


def test_old_invoices_the_new_platform_has_acted_on_are_left_alone(base, tmp_path):
    db = base
    from app.models import PaymentAllocation

    db.commit()
    # In November the new platform takes Rs 1,100 against Bina's old Sep 1005;
    # the old Dues report (frozen) still shows 1005 as due.
    invoice = db.query(PaymentInvoice).filter_by(invoice_number="MP-INV-0001005").one()
    receipt = PaymentReceipt(receipt_number="MP-MRCPT-900", student_id="s2", payment_date=date(2026, 11, 3), amount_paise=110000, snapshot_json="{}", source="ADMIN", status="RECORDED")
    db.add(receipt)
    db.flush()
    db.add(PaymentAllocation(payment_id=receipt.id, invoice_id=invoice.id, amount_paise=110000, discount_paise=0, kind="DIRECT"))
    db.flush()
    from app.services.payments.receipts_service import RecomputeInvoice

    RecomputeInvoice(db, invoice)
    db.commit()
    dues = DUES_1006 + [{"invoice_no": "1005", "date": "2026-09-01", "student": "1102 | Bina Ray", "due_group": "Monthly Fees - Sep-1100", "total_due": "1100"}]
    result = ht.RunTopup(db, ht.LoadTopupData(_topup_folder(tmp_path, dues=dues)), ExpectedDuePaise=260000)
    assert result.problems == [], result.problems
    assert any("acted on by the new platform" in line for line in result.lines)
    assert db.query(PaymentInvoice).filter_by(invoice_number="MP-INV-0001005").one().status == "PAID"
    db.rollback()


def test_a_later_file_with_a_smaller_discount_stops_it(base, tmp_path):
    db = base
    run1 = OLD_REPORT + [{"payment_id": "703", "invoice_no": "1002", "date": "2026-10-11", "student": "1102 | Bina Ray", "cash": "200", "razorpay": "0", "upi": "0", "net_banking": "0", "grand_total": "200"}]
    dues1 = DUES_1006 + [
        {"invoice_no": "1002", "date": "2026-10-01", "student": "1102 | Bina Ray", "due_group": "Monthly Fees - Oct-200", "total_due": "200"},
        {"invoice_no": "1004", "date": "2026-09-01", "student": "1101 | Aarav Sen", "due_group": "Monthly Fees - Sep-1100", "total_due": "1100"},
        {"invoice_no": "1005", "date": "2026-09-01", "student": "1102 | Bina Ray", "due_group": "Monthly Fees - Sep-1100", "total_due": "1100"},
    ]
    first = ht.RunTopup(db, ht.LoadTopupData(_topup_folder(tmp_path, report=run1, dues=dues1, invoices=[
        {"invoice_no": "1002", "date": "2026-10-01", "old_id": "1102", "fee_group": "Monthly Fees - Oct", "amount": "1100", "discount": "100"}])), ExpectedDuePaise=390000)
    assert first.problems == []
    db.commit()
    run2 = run1 + [{"payment_id": "709", "invoice_no": "1002", "date": "2026-10-18", "student": "1102 | Bina Ray", "cash": "300", "razorpay": "0", "upi": "0", "net_banking": "0", "grand_total": "300"}]
    second = ht.RunTopup(db, ht.LoadTopupData(_topup_folder(tmp_path, report=run2, dues=[row for row in dues1 if row["invoice_no"] != "1002"], invoices=[
        {"invoice_no": "1002", "date": "2026-10-01", "old_id": "1102", "fee_group": "Monthly Fees - Oct", "amount": "1100", "discount": ""}])), ExpectedDuePaise=370000)
    assert any("an earlier top-up already gave ₹100.00" in problem for problem in second.problems), second.problems
    assert all(row.discount_paise >= 0 for row in db.query(PaymentAllocation).all())
    db.rollback()
