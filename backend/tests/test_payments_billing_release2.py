"""Billing Release 2 (2026-11-27, Shailesh): invoices with several lines,
admission packages, stock, the book queue, late fees, handover, dated
prices and the reports. The client's 12-point UAT checklist (document §13)
is covered by the tests named test_uat_01 ... test_uat_12."""

import io
import json
from datetime import date
from itertools import count
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from openpyxl import load_workbook
from pypdf import PdfReader

from app.dependencies import get_current_user
from app.models import (
    AssessmentBlueprint,
    BookInvoiceTask,
    FeeItem,
    FeeItemPrice,
    InventorySettings,
    Level,
    Module,
    PaymentAuditLog,
    PaymentCentre,
    PaymentInvoice,
    PaymentInvoiceLine,
    PaymentReceipt,
    StockBalance,
    StockMovement,
    Student,
    User,
)
from app.services.payments import articles_service as art
from app.services.payments import billing_service as bill
from app.services.payments import book_invoices as books
from app.services.payments import insights_service as insights
from app.services.payments import inventory_service as stock
from app.services.payments import invoice_builder as builder
from app.services.payments import invoice_pdf
from app.services.payments import invoices_service as inv
from app.services.payments import ledger_reports as reports
from app.services.payments import numbering
from app.services.payments import receipts_service as rec
from app.services.payments import setup_service as setup
from tests.test_payments_phase2_invoices import ADDED_BEFORE_CUTOFF, _code, _session

TODAY = {"value": date(2026, 12, 1)}
KEY = (f"r2-key-{n:08d}" for n in count(1))


@pytest.fixture(autouse=True)
def _today(monkeypatch):
    TODAY["value"] = date(2026, 12, 1)
    monkeypatch.setattr(inv, "TodayInIndia", lambda: TODAY["value"])


def _student(db, sid, name, level_id, module_id, centre_id=None):
    user = User(id=f"user-{sid}", full_name=name, email=f"{sid}@example.test", password_hash="x", role="STUDENT", is_active=True, created_at=ADDED_BEFORE_CUTOFF)
    db.add(user)
    db.flush()
    db.add(Student(id=sid, user_id=user.id, student_code=f"MP-{sid.upper()}", is_active=True, centre_id=centre_id,
                   current_level_id=level_id, current_module_id=module_id, father_name=f"Parent {name.split()[0]}", father_mobile="9800000000"))
    db.commit()


def _world():
    """The live fee items (prices as on the site), levels YLM-L1 -> PM-L1 ->
    PM-L2 and BM-L1, students at each, Rajarhat / Laketown / Online."""
    db = _session()
    admin = User(id="admin-1", full_name="Admin One", email="admin@example.test", password_hash="x", role="ADMIN", is_active=True)
    second = User(id="admin-2", full_name="Admin Two", email="admin2@example.test", password_hash="x", role="ADMIN", is_active=True)
    db.add_all([admin, second])
    for mid, code in (("mod-yl", "YLM"), ("mod-pm", "PM"), ("mod-bm", "BM")):
        db.add(Module(id=mid, module_code=code, module_name=code))
    db.flush()
    db.add_all([
        Level(id="lvl-yl1", module_id="mod-yl", level_code="YLM-L1", level_name="Young Learners Level 1"),
        Level(id="lvl-pm1", module_id="mod-pm", level_code="PM-L1", level_name="Preparatory Level 1"),
        Level(id="lvl-pm2", module_id="mod-pm", level_code="PM-L2", level_name="Preparatory Level 2"),
        Level(id="lvl-bm1", module_id="mod-bm", level_code="BM-L1", level_name="Bridge Level 1"),
    ])
    db.flush()
    db.get(Level, "lvl-yl1").next_level_id = "lvl-pm1"
    db.get(Level, "lvl-pm1").next_level_id = "lvl-pm2"
    db.commit()
    setup.EnsurePaymentDefaults(db)
    db.commit()
    centres = {row.code: row.id for row in db.query(PaymentCentre).all()}
    _student(db, "yl", "Yash Lal", "lvl-yl1", "mod-yl", centres["RAJARHAT"])
    _student(db, "pl", "Priya Laha", "lvl-pm1", "mod-pm", centres["LAKETOWN"])
    _student(db, "br", "Bodhi Roy", "lvl-bm1", "mod-bm", centres["ONLINE"])
    _student(db, "nc", "Nila Chow", "lvl-pm1", "mod-pm", None)
    items = {}
    for name, amount, billing in (
        ("Monthly Fee", "1100", "MONTHLY"),
        ("Monthly Fee International", "2200", "MONTHLY"),
        ("Registration Charges", "1800", "ONE_TIME"),
        ("Young Learner Book Charges", "1500", "ONE_TIME"),
        ("Preparatory Level 1 Content Charges", "500", "ONE_TIME"),
        ("Preparatory Level 2 Content Charges", "500", "ONE_TIME"),
        ("Bridge Course Content Charges", "1500", "ONE_TIME"),
        ("MathPath Bag", "350", "ONE_TIME"),
        ("MathPath Tshirt", "400", "ONE_TIME"),
        ("Abacus Tool", "250", "ONE_TIME"),
        ("Timer", "200", "ONE_TIME"),
    ):
        items[name] = setup.CreateFeeItem(db, Name=name, Amount=amount, BillingType=billing, Actor=admin)["feeItemId"]
    numbering.SetStartingNumber(db, Key="INVOICE", NextNumber=1227, Actor=admin)
    numbering.SetStartingNumber(db, Key="RECEIPT", NextNumber=1042, Actor=admin)
    db.commit()
    settings = bill.EnsureBillingSettings(db)
    settings.india_fee_item_id = items["Monthly Fee"]
    settings.international_fee_item_id = items["Monthly Fee International"]
    db.commit()
    assert bill.SeedNewAdmissionRates(db) == 2
    db.commit()
    # Fee items made before Release 2 had no article fields: the startup
    # seeding fills them in from the names.
    db.query(FeeItem).update({FeeItem.article_kind: None, FeeItem.is_stock: False, FeeItem.level_code: None, FeeItem.in_kit: False})
    db.commit()
    assert art.SeedArticles(db) is True
    db.commit()
    items.update({row.name: row.id for row in db.query(FeeItem).all()})
    return db, admin, second, items, centres


def _track(db, admin, on=True):
    stock.UpdateInventorySettings(db, Request={"stockTrackingEnabled": on, "reason": "test"}, Actor=admin)


def _opening(db, admin, centre, counts):
    stock.RecordOpening(db, Request={"centreId": centre, "date": "2026-11-30", "lines": [{"feeItemId": i, "quantity": q} for i, q in counts.items()]}, Actor=admin)


def _cash(amount, method="CASH", reference=None):
    return {"method": method, "amountPaise": amount, "reference": reference}


def _admit(db, admin, sid, *, pay=None, drop=(), **extra):
    template = builder.AdmissionTemplate(db, StudentId=sid)
    lines = [line for line in template["lines"] if line.get("included", True) and line["feeItemId"] not in drop]
    total = builder.PreviewInvoice(db, Request={"studentId": sid, "lines": lines}, Admission=True)["totalPaise"]
    payment = {"methods": [_cash(pay if pay is not None else total)]}
    return builder.CreateInvoice(db, Request={"studentId": sid, "lines": lines, "payment": payment, **extra}, IdempotencyKey=next(KEY), Actor=admin, Admission=True)


def _balance(db, item, centre):
    row = db.query(StockBalance).filter_by(fee_item_id=item, centre_id=centre).first()
    return row.quantity if row else 0


# --- seeding -------------------------------------------------------------------

def test_seeding_reads_the_article_fields_from_the_names():
    db, admin, second, items, centres = _world()
    got = {row.name: (row.article_kind, row.is_stock, row.level_code, row.in_kit) for row in db.query(FeeItem).all()}
    assert got["Monthly Fee"] == ("TUITION", False, None, False)
    assert got["Registration Charges"] == ("REGISTRATION", False, None, False)
    assert got["Young Learner Book Charges"] == ("BOOK", True, "YLM-L1", False)
    assert got["Preparatory Level 2 Content Charges"] == ("BOOK", True, "PM-L2", False)
    assert got["Bridge Course Content Charges"] == ("BOOK", True, "BM-L1", False)
    assert got["MathPath Bag"] == ("MERCH", True, None, True)
    assert got["MathPath Tshirt"][3] is True and got["Abacus Tool"][3] is True
    assert got["Timer"] == ("MERCH", True, None, False)
    assert got["Late Fee"] == ("LATE_FEE", False, None, False)
    assert db.get(FeeItem, items["Late Fee"]).amount_paise == 10000
    centre_rows = {row.code: row for row in db.query(PaymentCentre).all()}
    assert centre_rows["RAJARHAT"].holds_stock and centre_rows["LAKETOWN"].holds_stock and not centre_rows["ONLINE"].holds_stock
    assert centre_rows["ONLINE"].stock_from_centre_id == centres["RAJARHAT"]
    settings = db.get(InventorySettings, "default")
    assert settings.stock_tracking_enabled is False and settings.auto_book_invoices is False and settings.low_stock_threshold == 5
    assert settings.default_stock_centre_id == centres["RAJARHAT"]
    assert art.SeedArticles(db) is False  # once only


def test_existing_invoices_get_their_type_at_seeding():
    db, admin, second, items, centres = _world()
    inv.GenerateInvoices(db, Request={"feeItemIds": [items["Monthly Fee"], items["Timer"]], "studentIds": ["yl"], "billingMonth": 11, "billingYear": 2026, "invoiceDate": "2026-11-01"}, IdempotencyKey=next(KEY), Actor=admin)
    types = {row.fee_name: row.invoice_type for row in db.query(PaymentInvoice).all()}
    assert types == {"Monthly Fee": "MONTHLY_TUITION", "Timer": "SALE"}
    db.query(PaymentInvoice).update({PaymentInvoice.invoice_type: None})
    settings = db.get(InventorySettings, "default")
    settings.articles_seeded = False
    db.commit()
    art.SeedArticles(db)
    db.commit()
    assert {row.fee_name: row.invoice_type for row in db.query(PaymentInvoice).all()} == types


# --- UAT 1, 2, 3, 7: admission packages ------------------------------------------

def test_uat_01_admission_packages_total_4500_3500_4500():
    db, admin, second, items, centres = _world()
    totals = {}
    for sid in ("yl", "pl", "br"):
        result = _admit(db, admin, sid)
        invoice = result["invoice"]
        totals[sid] = invoice["amountPaise"]
        assert invoice["invoiceType"] == "ADMISSION" and invoice["feeName"] == "Admission Package"
        assert invoice["status"] == "PAID" and result["payment"]["receiptNumber"].startswith("MP-MRCPT-")
    assert totals == {"yl": 450000, "pl": 350000, "br": 450000}
    yl = db.query(PaymentInvoice).filter_by(student_id="yl").one()
    names = [(row.name, row.final_paise, row.is_kit) for row in db.query(PaymentInvoiceLine).filter_by(invoice_id=yl.id).order_by(PaymentInvoiceLine.line_no)]
    assert names == [
        ("Registration Charges", 180000, False),
        ("Monthly Fee New Admission", 120000, False),
        ("Young Learner Book Charges", 150000, False),
        ("MathPath Bag", 0, True),
        ("MathPath Tshirt", 0, True),
        ("Abacus Tool", 0, True),
    ]
    # GST on the total, once (answer H8).
    assert (yl.taxable_paise, yl.cgst_paise, yl.sgst_paise) == (381356, 34322, 34322)
    assert yl.taxable_paise + yl.cgst_paise + yl.sgst_paise == 450000


def test_uat_02_a_1_december_admission_pays_1200_and_is_not_billed_again_in_december():
    db, admin, second, items, centres = _world()
    _admit(db, admin, "pl")
    student = db.get(Student, "pl")
    assert student.admission_date == "2026-12-01"
    admission = db.query(PaymentInvoice).filter_by(student_id="pl").one()
    assert (admission.billing_type, admission.period_key, admission.fee_item_id) == ("MONTHLY", "2026-12", items["Monthly Fee New Admission"])
    # The December run skips them: the month's tuition is on the admission invoice.
    preview = inv.PreviewInvoices(db, Request={"feeItemIds": [items["Monthly Fee New Admission"]], "studentIds": ["pl"], "billingMonth": 12, "billingYear": 2026})
    assert preview["invoiceCount"] == 0 and preview["skipped"][0]["reason"].startswith("Already has Admission Package for December 2026")
    # January: drafted and released at the new rate, ₹1,200.
    TODAY["value"] = date(2027, 1, 1)
    bill.CreateDrafts(db, PeriodValue="2027-01", StudentIds=["pl"], Actor=admin)
    month = bill.MonthBilling(db, "2027-01")
    draft = next(row for row in month["drafts"] if row["studentId"] == "pl")
    released = bill.ReleaseDrafts(db, PeriodValue="2027-01", DraftIds=[draft["draftId"]], IdempotencyKey=next(KEY), Actor=admin)
    assert released["released"] == 1
    january = db.query(PaymentInvoice).filter_by(student_id="pl", period_key="2027-01").one()
    assert (january.fee_name, january.amount_paise) == ("Monthly Fee New Admission", 120000)
    # The admission date change is in the history, with the fee group.
    audit = db.query(PaymentAuditLog).filter_by(entity_type="STUDENT", action="ADMISSION_DATE").one()
    assert audit.reason.startswith("Admission invoice MP-INV-") and json.loads(audit.after_json)["rateGroup"] == "New"


def test_uat_03_the_december_run_bills_1100_existing_and_1200_new_and_international_its_own():
    db, admin, second, items, centres = _world()
    _admit(db, admin, "pl")  # admitted 1 Dec: December is on the admission
    bill.SetStudentModes(db, StudentIds=["br"], Mode="INTERNATIONAL", Actor=admin)
    bill.CreateDrafts(db, PeriodValue="2026-12", StudentIds=None, Actor=admin)
    month = bill.MonthBilling(db, "2026-12")
    waiting = [row["draftId"] for row in month["drafts"] if row["status"] == "DRAFT"]
    bill.ReleaseDrafts(db, PeriodValue="2026-12", DraftIds=waiting, IdempotencyKey=next(KEY), Actor=admin)
    december = {row.student_id: (row.fee_name, row.amount_paise) for row in db.query(PaymentInvoice).filter_by(period_key="2026-12").all()}
    assert december["yl"] == ("Monthly Fee", 110000) and december["nc"] == ("Monthly Fee", 110000)
    assert december["br"] == ("Monthly Fee International", 220000)
    assert december["pl"] == ("Admission Package", 350000)  # not billed a second time
    assert db.query(PaymentInvoice).filter_by(student_id="pl", period_key="2026-12").count() == 1


def test_international_admission_leaves_the_kit_out_unless_wanted():
    db, admin, second, items, centres = _world()
    bill.SetStudentModes(db, StudentIds=["br"], Mode="INTERNATIONAL", Actor=admin)
    template = builder.AdmissionTemplate(db, StudentId="br")
    kit = [line for line in template["lines"] if line.get("isKit")]
    assert len(kit) == 3 and all(line["included"] is False for line in kit)
    assert any("International student" in note for note in template["notes"])
    tuition = next(line for line in template["lines"] if line.get("billingMonth"))
    assert tuition["feeItemId"] == items["Monthly Fee International New Admission"]
    result = _admit(db, admin, "br")
    assert result["invoice"]["amountPaise"] == 180000 + 240000 + 150000  # books at domestic rates (B3)


def test_uat_07_kit_lines_are_zero_take_one_each_and_leave_the_total_alone():
    db, admin, second, items, centres = _world()
    raj = centres["RAJARHAT"]
    kit = [items["MathPath Bag"], items["MathPath Tshirt"], items["Abacus Tool"]]
    _opening(db, admin, raj, {**{item: 10 for item in kit}, items["Young Learner Book Charges"]: 4})
    _track(db, admin)
    result = _admit(db, admin, "yl")
    assert result["invoice"]["amountPaise"] == 450000
    assert [line["finalPaise"] for line in result["invoice"]["lines"] if line["isKit"]] == [0, 0, 0]
    assert [_balance(db, item, raj) for item in kit] == [9, 9, 9]
    assert _balance(db, items["Young Learner Book Charges"], raj) == 3
    issues = db.query(StockMovement).filter_by(movement_type="ISSUE").all()
    assert sorted(row.quantity for row in issues) == [-1, -1, -1, -1] and {row.student_id for row in issues} == {"yl"}


def test_admission_needs_a_payment_and_happens_once():
    db, admin, second, items, centres = _world()
    template = builder.AdmissionTemplate(db, StudentId="pl")
    with pytest.raises(HTTPException) as unpaid:
        builder.CreateInvoice(db, Request={"studentId": "pl", "lines": template["lines"]}, IdempotencyKey=next(KEY), Actor=admin, Admission=True)
    assert _code(unpaid) == "ADMISSION_PAYMENT_REQUIRED"
    assert db.query(PaymentInvoice).count() == 0
    # Part payment at the admin's discretion (C4).
    part = _admit(db, admin, "pl", pay=200000)
    assert part["invoice"]["status"] == "PART_PAID" and part["invoice"]["balancePaise"] == 150000
    with pytest.raises(HTTPException) as again:
        _admit(db, admin, "pl")
    assert _code(again) in ("ALREADY_RAISED", "MONTH_ALREADY_BILLED")
    assert builder.AdmissionTemplate(db, StudentId="pl")["existingAdmission"]["invoiceNumber"] == part["invoice"]["invoiceNumber"]
    # Registration is only charged on an admission.
    with pytest.raises(HTTPException) as reg:
        builder.CreateInvoice(db, Request={"studentId": "yl", "lines": [{"feeItemId": items["Registration Charges"]}]}, IdempotencyKey=next(KEY), Actor=admin)
    assert _code(reg) == "REGISTRATION_ON_ADMISSION"


def test_an_admission_cannot_be_dated_ahead_and_the_same_key_replays():
    db, admin, second, items, centres = _world()
    template = builder.AdmissionTemplate(db, StudentId="pl")
    with pytest.raises(HTTPException) as ahead:
        builder.CreateInvoice(db, Request={"studentId": "pl", "lines": template["lines"], "invoiceDate": "2026-12-05", "payment": {"methods": [_cash(100)]}}, IdempotencyKey=next(KEY), Actor=admin, Admission=True)
    assert _code(ahead) == "DATE_IN_FUTURE"
    key = next(KEY)
    request = {"studentId": "pl", "lines": [line for line in template["lines"] if line.get("included", True)], "payment": {"methods": [_cash(350000)]}}
    first = builder.CreateInvoice(db, Request=request, IdempotencyKey=key, Actor=admin, Admission=True)
    second_press = builder.CreateInvoice(db, Request=request, IdempotencyKey=key, Actor=admin, Admission=True)
    assert second_press["replayed"] is True and second_press["invoice"]["invoiceId"] == first["invoice"]["invoiceId"]
    assert second_press["payment"]["paymentId"] == first["payment"]["paymentId"]
    assert db.query(PaymentInvoice).count() == 1 and db.query(PaymentReceipt).count() == 1


# --- UAT 5, 6, 12: stock ----------------------------------------------------------

def test_uat_05_a_sale_of_two_with_one_in_stock_is_refused_and_nothing_changes():
    db, admin, second, items, centres = _world()
    raj = centres["RAJARHAT"]
    _opening(db, admin, raj, {items["Timer"]: 1})
    _track(db, admin)
    before_number = db.get(numbering.PaymentNumberSequence, "INVOICE").next_number
    preview = builder.PreviewInvoice(db, Request={"studentId": "yl", "lines": [{"feeItemId": items["Timer"], "quantity": 2}]})
    assert preview["short"] and "1 in stock at Rajarhat, 2 needed" in preview["problems"][0]
    with pytest.raises(HTTPException) as short:
        builder.CreateInvoice(db, Request={"studentId": "yl", "lines": [{"feeItemId": items["Timer"], "quantity": 2}]}, IdempotencyKey=next(KEY), Actor=admin)
    assert _code(short) == "OUT_OF_STOCK"
    db.rollback()
    assert _balance(db, items["Timer"], raj) == 1
    assert db.query(PaymentInvoice).count() == 0 and db.query(StockMovement).filter_by(movement_type="ISSUE").count() == 0
    assert db.get(numbering.PaymentNumberSequence, "INVOICE").next_number == before_number


def test_uat_06_inward_adds_a_sale_takes_and_the_ledger_adds_up_to_the_summary():
    db, admin, second, items, centres = _world()
    raj, lake = centres["RAJARHAT"], centres["LAKETOWN"]
    book = items["Preparatory Level 1 Content Charges"]
    _opening(db, admin, raj, {book: 3})
    stock.RecordInward(db, Request={"centreId": raj, "date": "2026-12-01", "supplier": "Sharma Printers", "billNumber": "SP-88", "lines": [{"feeItemId": book, "quantity": 20, "unitCost": "180"}]}, Actor=admin)
    stock.RecordTransfer(db, Request={"fromCentreId": raj, "toCentreId": lake, "lines": [{"feeItemId": book, "quantity": 5}]}, Actor=admin)
    stock.RecordWriteOff(db, Request={"centreId": raj, "reason": "Water damage", "lines": [{"feeItemId": book, "quantity": 1}]}, Actor=admin)
    _track(db, admin)
    builder.CreateInvoice(db, Request={"studentId": "pl", "lines": [{"feeItemId": book, "quantity": 2}]}, IdempotencyKey=next(KEY), Actor=admin)  # Laketown
    builder.CreateInvoice(db, Request={"studentId": "nc", "lines": [{"feeItemId": book, "quantity": 1}]}, IdempotencyKey=next(KEY), Actor=admin)  # no centre: Rajarhat
    assert _balance(db, book, raj) == 3 + 20 - 5 - 1 - 1 and _balance(db, book, lake) == 5 - 2
    summary = stock.StockSummary(db)
    row = next(item for item in summary["items"] if item["feeItemId"] == book)
    raj_row = next(centre for centre in row["centres"] if centre["centreId"] == raj)
    assert (raj_row["opening"], raj_row["received"], raj_row["transferredOut"], raj_row["writtenOff"], raj_row["issued"], raj_row["quantity"]) == (3, 20, 5, 1, 1, 16)
    assert summary["ledgerMatches"] is True
    assert db.get(FeeItem, book).cost_paise == 18000 and row["valueDisplay"] == "₹3,420.00"
    moves = stock.ListMovements(db, Filters={"feeItemId": book, "centreId": raj})["movements"]
    assert moves[0]["balanceAfter"] == 16 and {move["type"] for move in moves} == {"OPENING", "INWARD", "TRANSFER_OUT", "WRITE_OFF", "ISSUE"}
    # Low stock: at or under the threshold (5) shows as low.
    lake_row = next(centre for centre in row["centres"] if centre["centreId"] == lake)
    assert lake_row["isLow"] is True and raj_row["isLow"] is False
    with pytest.raises(HTTPException) as too_many:
        stock.RecordWriteOff(db, Request={"centreId": lake, "reason": "Lost", "lines": [{"feeItemId": book, "quantity": 4}]}, Actor=admin)
    assert _code(too_many) == "OUT_OF_STOCK"


def test_uat_12_repeated_jobs_never_duplicate_invoices_or_kits_and_stock_never_goes_below_zero():
    db, admin, second, items, centres = _world()
    raj = centres["RAJARHAT"]
    kit = [items["MathPath Bag"], items["MathPath Tshirt"], items["Abacus Tool"]]
    _opening(db, admin, raj, {**{item: 1 for item in kit}, items["Young Learner Book Charges"]: 1})
    _track(db, admin)
    template = builder.AdmissionTemplate(db, StudentId="yl")
    request = {"studentId": "yl", "lines": template["lines"], "payment": {"methods": [_cash(450000)]}}
    key = next(KEY)
    builder.CreateInvoice(db, Request=request, IdempotencyKey=key, Actor=admin, Admission=True)
    builder.CreateInvoice(db, Request=request, IdempotencyKey=key, Actor=admin, Admission=True)  # double press
    with pytest.raises(HTTPException):
        builder.CreateInvoice(db, Request=request, IdempotencyKey=next(KEY), Actor=admin, Admission=True)  # a second admission
    db.rollback()
    assert db.query(PaymentInvoice).count() == 1
    assert [_balance(db, item, raj) for item in kit] == [0, 0, 0]
    assert db.query(StockMovement).filter_by(movement_type="ISSUE").count() == 4
    # The last one cannot be taken twice: the next sale is refused.
    with pytest.raises(HTTPException) as gone:
        builder.CreateInvoice(db, Request={"studentId": "nc", "lines": [{"feeItemId": items["MathPath Bag"]}]}, IdempotencyKey=next(KEY), Actor=admin)
    assert _code(gone) == "OUT_OF_STOCK"
    db.rollback()
    assert db.query(StockBalance).filter(StockBalance.quantity < 0).count() == 0
    # The database itself holds one live admission per student.
    first = db.query(PaymentInvoice).one()
    clone = PaymentInvoice(invoice_number="X-1", student_id="yl", fee_name="x", billing_type="ONE_TIME", description="x", invoice_date=date(2026, 12, 1),
                           amount_paise=1, taxable_paise=1, snapshot_json="{}", source_key=first.source_key)
    db.add(clone)
    with pytest.raises(Exception):
        db.flush()
    db.rollback()


def test_with_tracking_off_nothing_is_counted_or_blocked():
    db, admin, second, items, centres = _world()
    result = builder.CreateInvoice(db, Request={"studentId": "yl", "lines": [{"feeItemId": items["Timer"], "quantity": 3}]}, IdempotencyKey=next(KEY), Actor=admin)
    assert result["invoice"]["amountPaise"] == 60000
    assert db.query(StockMovement).count() == 0
    # Bulk Generate keeps working for stock items while tracking is off ...
    inv.GenerateInvoices(db, Request={"feeItemIds": [items["Timer"]], "studentIds": ["pl"], "invoiceDate": "2026-12-01"}, IdempotencyKey=next(KEY), Actor=admin)
    # ... and refuses them once it is on.
    _track(db, admin)
    with pytest.raises(HTTPException) as bulk:
        inv.PreviewInvoices(db, Request={"feeItemIds": [items["Timer"]], "studentIds": ["nc"], "invoiceDate": "2026-12-01"})
    assert _code(bulk) == "STOCK_ITEM_IN_BULK"
    with pytest.raises(HTTPException) as no_reason:
        stock.UpdateInventorySettings(db, Request={"stockTrackingEnabled": False}, Actor=admin)
    assert _code(no_reason) == "REASON_REQUIRED"


def test_a_centre_with_stock_cannot_stop_keeping_it_and_online_is_supplied_from_rajarhat():
    db, admin, second, items, centres = _world()
    assert stock.StockCentreId(db, centres["ONLINE"]) == centres["RAJARHAT"]
    assert stock.StockCentreId(db, None) == centres["RAJARHAT"]
    assert stock.StockCentreId(db, centres["LAKETOWN"]) == centres["LAKETOWN"]
    _opening(db, admin, centres["LAKETOWN"], {items["Timer"]: 2})
    with pytest.raises(HTTPException) as held:
        stock.UpdateInventorySettings(db, Request={"centres": [{"centreId": centres["LAKETOWN"], "holdsStock": False}]}, Actor=admin)
    assert _code(held) == "STOCK_HELD"
    with pytest.raises(HTTPException) as not_stock:
        stock.RecordInward(db, Request={"centreId": centres["RAJARHAT"], "lines": [{"feeItemId": items["Monthly Fee"], "quantity": 1}]}, Actor=admin)
    assert _code(not_stock) == "NOT_A_STOCK_ITEM"
    with pytest.raises(HTTPException) as online:
        stock.RecordInward(db, Request={"centreId": centres["ONLINE"], "lines": [{"feeItemId": items["Timer"], "quantity": 1}]}, Actor=admin)
    assert _code(online) == "CENTRE_HOLDS_NO_STOCK"


# --- UAT 8, 9, 10: discounts, payments, cancelling -------------------------------

def test_uat_08_fixed_and_percent_discounts_are_exact_and_record_the_approver():
    db, admin, second, items, centres = _world()
    with pytest.raises(HTTPException) as reason:
        builder.CreateInvoice(db, Request={"studentId": "yl", "lines": [{"feeItemId": items["Timer"], "discountType": "FIXED", "discountValue": "50"}]}, IdempotencyKey=next(KEY), Actor=admin)
    assert _code(reason) == "DISCOUNT_REASON_REQUIRED"
    result = builder.CreateInvoice(db, Request={
        "studentId": "yl",
        "lines": [
            {"feeItemId": items["Timer"], "quantity": 3, "discountType": "FIXED", "discountValue": "50"},  # 600 - 50
            {"feeItemId": items["MathPath Bag"], "discountType": "PERCENT", "discountValue": "10"},  # 350 - 35
        ],
        "invoiceDiscount": {"type": "PERCENT", "value": "12.5"},  # of 865 = 108.13
        "discountReason": "Sibling offer",
        "approvedByUserId": "admin-2",
    }, IdempotencyKey=next(KEY), Actor=admin)["invoice"]
    assert result["grossPaise"] == 86500 and result["invoiceDiscountPaise"] == 10813 and result["amountPaise"] == 75687
    lines = result["lines"]
    assert [(line["discountPaise"], line["netPaise"]) for line in lines] == [(5000, 55000), (3500, 31500)]
    assert [line["discountText"] for line in lines] == ["₹50.00", "10%"]
    assert sum(line["finalPaise"] for line in lines) == 75687
    assert result["discountApprovedByName"] == "Admin Two" and result["invoiceDiscountReason"] == "Sibling offer"
    assert result["taxablePaise"] + result["cgstPaise"] + result["sgstPaise"] == 75687
    audit = db.query(PaymentAuditLog).filter_by(entity_type="INVOICE", action="CREATE").one()
    assert json.loads(audit.after_json)["approvedBy"] == "Admin Two"
    with pytest.raises(HTTPException) as too_big:
        builder.PriceLines([{"item": db.get(FeeItem, items["Timer"]), "quantity": 1, "unitPaise": 20000, "discount": {"type": "FIXED", "value": "250"}}], None)
    assert _code(too_big) == "DISCOUNT_TOO_LARGE"
    with pytest.raises(HTTPException) as bad:
        builder.PriceLines([{"item": db.get(FeeItem, items["Timer"]), "quantity": 1, "unitPaise": 20000, "discount": {"type": "PERCENT", "value": "101"}}], None)
    assert _code(bad) == "DISCOUNT_INVALID"


def test_uat_09_part_cash_then_bank_gives_two_receipts_and_the_right_balance():
    db, admin, second, items, centres = _world()
    first = builder.CreateInvoice(db, Request={"studentId": "yl", "lines": [{"feeItemId": items["Timer"], "quantity": 4}], "payment": {"methods": [_cash(30000)]}}, IdempotencyKey=next(KEY), Actor=admin)
    invoice = first["invoice"]
    assert invoice["status"] == "PART_PAID" and invoice["balancePaise"] == 50000
    rec.RecordPayment(db, StudentId="yl", Request={"allocations": [{"invoiceId": invoice["invoiceId"], "amountPaise": 50000}], "methods": [_cash(50000, "NET_BANKING", "NEFT123")]}, IdempotencyKey=next(KEY), Actor=admin)
    receipts = db.query(PaymentReceipt).filter_by(student_id="yl").order_by(PaymentReceipt.receipt_number).all()
    assert len(receipts) == 2 and receipts[0].receipt_number != receipts[1].receipt_number
    assert inv.GetInvoice(db, invoice["invoiceId"])["balancePaise"] == 0
    # The same split in one payment: one receipt with two method lines.
    one = builder.CreateInvoice(db, Request={"studentId": "pl", "lines": [{"feeItemId": items["Timer"], "quantity": 4}], "payment": {"methods": [_cash(30000), _cash(50000, "UPI", "UPI-77")]}}, IdempotencyKey=next(KEY), Actor=admin)
    assert one["invoice"]["status"] == "PAID" and one["payment"]["amountPaise"] == 80000


def test_uat_10_cancelling_puts_stock_back_and_money_to_advance_with_the_history():
    db, admin, second, items, centres = _world()
    raj = centres["RAJARHAT"]
    kit = [items["MathPath Bag"], items["MathPath Tshirt"], items["Abacus Tool"]]
    _opening(db, admin, raj, {**{item: 5 for item in kit}, items["Young Learner Book Charges"]: 5})
    _track(db, admin)
    invoice = _admit(db, admin, "yl")["invoice"]
    assert _balance(db, items["MathPath Bag"], raj) == 4
    cancelled = inv.CancelInvoice(db, InvoiceId=invoice["invoiceId"], Reason="Admission withdrawn", Actor=admin)
    assert cancelled["status"] == "CANCELLED" and cancelled["movedToAdvancePaise"] == 450000
    assert [_balance(db, item, raj) for item in kit + [items["Young Learner Book Charges"]]] == [5, 5, 5, 5]
    returns = db.query(StockMovement).filter_by(movement_type="CANCEL_RETURN").all()
    assert len(returns) == 4 and all(row.reason == "Admission withdrawn" for row in returns)
    audit = db.query(PaymentAuditLog).filter_by(entity_type="INVOICE", action="CANCEL").one()
    assert json.loads(audit.after_json)["stockReturned"] == 4
    assert "stock put back" in insights._Describe(audit)["text"]
    assert stock.StockSummary(db)["ledgerMatches"] is True
    # Cancelled: the student can be admitted again (the advance pays for it).
    again = _admit(db, admin, "yl", pay=100)
    assert again["invoice"]["invoiceType"] == "ADMISSION"


# --- UAT 4: book after a cleared assessment ----------------------------------------

def _clear(db, sid, level_id, attempt="att-1"):
    blueprint = AssessmentBlueprint(id=f"bp-{level_id}", title="Level test", module_id=db.get(Level, level_id).module_id, level_id=level_id,
                                    total_questions=10, marks_per_question=10, duration_seconds=600)
    if not db.get(AssessmentBlueprint, blueprint.id):
        db.add(blueprint)
        db.commit()
    books.OnLevelAssessmentCleared(db, SimpleNamespace(id=attempt, student_id=sid), SimpleNamespace(blueprint_id=blueprint.id))


def test_uat_04_a_cleared_level_raises_one_book_invoice_for_the_next_level():
    db, admin, second, items, centres = _world()
    stock.UpdateInventorySettings(db, Request={"autoBookInvoices": True}, Actor=admin)
    _clear(db, "yl", "lvl-yl1")
    _clear(db, "yl", "lvl-yl1", attempt="att-2")  # a second clear, or a retake
    invoices = db.query(PaymentInvoice).filter_by(student_id="yl").all()
    assert len(invoices) == 1
    book = invoices[0]
    assert (book.invoice_type, book.fee_name, book.amount_paise, book.source_key) == ("STUDY_MATERIAL", "Preparatory Level 1 Content Charges", 50000, "BOOK:yl:PM-L1")
    task = db.query(BookInvoiceTask).one()
    assert (task.status, task.invoice_id, task.target_level_code) == ("ISSUED", book.id, "PM-L1")
    # The last level has no next level: no book after graduation.
    _clear(db, "br", "lvl-bm1")
    assert db.query(BookInvoiceTask).filter_by(student_id="br").count() == 0


def test_book_queue_waits_while_automatic_is_off_and_for_stock_when_short():
    db, admin, second, items, centres = _world()
    _clear(db, "pl", "lvl-pm1")
    queue = books.ListTasks(db)
    assert queue["openCount"] == 1 and queue["tasks"][0]["status"] == "PENDING" and queue["tasks"][0]["bookName"] == "Preparatory Level 2 Content Charges"
    assert db.query(PaymentInvoice).count() == 0
    _track(db, admin)
    result = books.RaiseTasks(db, TaskIds=[queue["tasks"][0]["taskId"]], Actor=admin)
    assert result["raised"] == 0 and "Not enough stock" in result["notRaised"][0]["reason"]
    assert db.query(BookInvoiceTask).one().status == "WAITING_STOCK"
    _opening(db, admin, centres["LAKETOWN"], {items["Preparatory Level 2 Content Charges"]: 2})
    result = books.RaiseTasks(db, TaskIds=[queue["tasks"][0]["taskId"]], Actor=admin)
    assert result["raised"] == 1 and _balance(db, items["Preparatory Level 2 Content Charges"], centres["LAKETOWN"]) == 1
    task = db.query(BookInvoiceTask).one()
    # Cancelled: back in the queue, and raised again.
    inv.CancelInvoice(db, InvoiceId=task.invoice_id, Reason="Wrong book", Actor=admin)
    assert db.query(BookInvoiceTask).one().status == "CANCELLED"
    assert books.RaiseTasks(db, TaskIds=[task.id], Actor=admin)["raised"] == 1
    assert db.query(PaymentInvoice).filter(PaymentInvoice.status != "CANCELLED").count() == 1


def test_book_queue_skip_needs_a_reason_and_a_book_bought_by_hand_settles_it():
    db, admin, second, items, centres = _world()
    _clear(db, "pl", "lvl-pm1")
    task = db.query(BookInvoiceTask).one()
    with pytest.raises(HTTPException) as no_reason:
        books.SkipTask(db, TaskId=task.id, Reason="", Actor=admin)
    assert _code(no_reason) == "REASON_REQUIRED"
    books.SkipTask(db, TaskId=task.id, Reason="Billed on the old portal", Actor=admin)
    assert db.get(BookInvoiceTask, task.id).status == "SKIPPED"
    books.ReopenTask(db, TaskId=task.id, Actor=admin)
    builder.CreateInvoice(db, Request={"studentId": "pl", "lines": [{"feeItemId": items["Preparatory Level 2 Content Charges"]}]}, IdempotencyKey=next(KEY), Actor=admin)
    assert db.get(BookInvoiceTask, task.id).status == "ISSUED"
    texts = [insights._Describe(row)["text"] for row in db.query(PaymentAuditLog).filter_by(entity_type="BOOK_TASK").all()]
    assert "Chose not to bill Priya Laha for the PM-L2 book" in texts


def test_a_level_without_a_book_is_marked_and_the_hook_never_breaks_an_assessment(monkeypatch):
    db, admin, second, items, centres = _world()
    db.get(FeeItem, items["Preparatory Level 2 Content Charges"]).level_code = None
    db.commit()
    _clear(db, "pl", "lvl-pm1")
    assert db.query(BookInvoiceTask).one().status == "NO_BOOK"

    def boom(*args, **kwargs):
        raise RuntimeError("database went away")

    monkeypatch.setattr(books, "_Queue", boom)
    books.OnLevelAssessmentCleared(db, SimpleNamespace(id="x", student_id="yl"), SimpleNamespace(blueprint_id="bp"))  # no exception


# --- late fee, handover ------------------------------------------------------------

def test_late_fee_after_the_25th_once_per_invoice():
    db, admin, second, items, centres = _world()
    inv.GenerateInvoices(db, Request={"feeItemIds": [items["Monthly Fee"]], "studentIds": ["yl", "nc"], "billingMonth": 12, "billingYear": 2026, "invoiceDate": "2026-12-01"}, IdempotencyKey=next(KEY), Actor=admin)
    fee = db.query(PaymentInvoice).filter_by(student_id="yl").one()
    TODAY["value"] = date(2026, 12, 25)
    with pytest.raises(HTTPException) as early:
        builder.AddLateFee(db, InvoiceId=fee.id, Actor=admin)
    assert _code(early) == "LATE_FEE_NOT_ALLOWED"
    TODAY["value"] = date(2026, 12, 26)
    late = builder.AddLateFee(db, InvoiceId=fee.id, Actor=admin)
    assert (late["invoiceType"], late["amountPaise"], late["parentInvoiceId"]) == ("LATE_FEE", 10000, fee.id)
    with pytest.raises(HTTPException) as twice:
        builder.AddLateFee(db, InvoiceId=fee.id, Actor=admin)
    assert _code(twice) == "LATE_FEE_NOT_ALLOWED"
    assert inv.GetInvoice(db, fee.id)["lateFees"][0]["invoiceNumber"] == late["invoiceNumber"]
    # Paid on the 20th: no late fee; paid on the 27th: allowed.
    other = db.query(PaymentInvoice).filter_by(student_id="nc").one()
    rec.RecordPayment(db, StudentId="nc", Request={"paymentDate": "2026-12-20", "allocations": [{"invoiceId": other.id, "amountPaise": 110000}], "methods": [_cash(110000)]}, IdempotencyKey=next(KEY), Actor=admin)
    assert builder.LateFeeCheck(db, db.get(PaymentInvoice, other.id))["allowed"] is False
    # A Timer sale is not a monthly fee.
    sale = builder.CreateInvoice(db, Request={"studentId": "yl", "lines": [{"feeItemId": items["Timer"]}]}, IdempotencyKey=next(KEY), Actor=admin)["invoice"]
    assert sale["lateFee"]["allowed"] is False
    with pytest.raises(HTTPException) as manual:
        builder.CreateInvoice(db, Request={"studentId": "yl", "lines": [{"feeItemId": items["Late Fee"]}]}, IdempotencyKey=next(KEY), Actor=admin)
    assert _code(manual) == "LATE_FEE_FROM_INVOICE"
    with pytest.raises(HTTPException) as bulk:
        inv.PreviewInvoices(db, Request={"feeItemIds": [items["Late Fee"]], "studentIds": ["yl"], "invoiceDate": "2026-12-26"})
    assert _code(bulk) == "LATE_FEE_FROM_INVOICE"


def test_a_book_is_handed_over_only_once_paid_and_the_date_is_kept():
    db, admin, second, items, centres = _world()
    result = builder.CreateInvoice(db, Request={"studentId": "pl", "lines": [{"feeItemId": items["Preparatory Level 1 Content Charges"]}, {"feeItemId": items["MathPath Bag"]}]}, IdempotencyKey=next(KEY), Actor=admin)["invoice"]
    book_line, bag_line = result["lines"]
    assert book_line["canHandOver"] is False and book_line["handOverBlockedReason"] == "Paid in full first"
    with pytest.raises(HTTPException) as unpaid:
        builder.RecordHandover(db, InvoiceId=result["invoiceId"], LineId=book_line["lineId"], Day=None, Actor=admin)
    assert _code(unpaid) == "BOOK_NOT_PAID"
    builder.RecordHandover(db, InvoiceId=result["invoiceId"], LineId=bag_line["lineId"], Day="2026-12-01", Actor=admin)  # kit: any time
    rec.RecordPayment(db, StudentId="pl", Request={"allocations": [{"invoiceId": result["invoiceId"], "amountPaise": 85000}], "methods": [_cash(85000)]}, IdempotencyKey=next(KEY), Actor=admin)
    after = builder.RecordHandover(db, InvoiceId=result["invoiceId"], LineId=book_line["lineId"], Day="2026-12-01", Actor=admin)
    assert after["lines"][0]["handedOverOn"] == "2026-12-01" and after["lines"][0]["handedOverByName"] == "Admin One"
    with pytest.raises(HTTPException) as twice:
        builder.RecordHandover(db, InvoiceId=result["invoiceId"], LineId=book_line["lineId"], Day=None, Actor=admin)
    assert _code(twice) == "ALREADY_HANDED_OVER"


# --- prices from a date --------------------------------------------------------------

def test_a_price_change_from_a_later_date_applies_from_that_date():
    db, admin, second, items, centres = _world()
    timer = items["Timer"]
    art.SchedulePrice(db, FeeItemId=timer, Amount="250", EffectiveFrom="2027-01-01", Reason="Supplier price up", Actor=admin)
    item = db.get(FeeItem, timer)
    assert item.amount_paise == 20000 and art.PriceOn(db, item, date(2026, 12, 31)) == 20000 and art.PriceOn(db, item, date(2027, 1, 1)) == 25000
    listed = next(row for row in setup.ListFeeItems(db) if row["feeItemId"] == timer)
    assert listed["upcomingPrices"][0]["effectiveFrom"] == "2027-01-01"
    dated = builder.PreviewInvoice(db, Request={"studentId": "yl", "invoiceDate": "2027-01-02", "lines": [{"feeItemId": timer}]})
    assert dated["totalPaise"] == 25000
    TODAY["value"] = date(2027, 1, 1)
    assert next(row for row in setup.ListFeeItems(db) if row["feeItemId"] == timer)["amountPaise"] == 25000
    with pytest.raises(HTTPException) as past:
        art.SchedulePrice(db, FeeItemId=timer, Amount="300", EffectiveFrom="2026-12-01", Reason="x", Actor=admin)
    assert _code(past) == "DATE_IN_PAST"
    # An immediate edit still wins over an older dated price.
    setup.UpdateFeeItem(db, FeeItemId=timer, Amount="275", Reason="Correction", Actor=admin)
    assert art.PriceOn(db, db.get(FeeItem, timer), date(2027, 1, 1)) == 27500
    # A scheduled change can be taken back before its date.
    art.SchedulePrice(db, FeeItemId=timer, Amount="400", EffectiveFrom="2027-03-01", Reason="x", Actor=admin)
    future = db.query(FeeItemPrice).filter(FeeItemPrice.effective_from == date(2027, 3, 1)).one()
    art.CancelScheduledPrice(db, PriceId=future.id, Actor=admin)
    assert art.PriceOn(db, db.get(FeeItem, timer), date(2027, 4, 1)) == 27500
    text = insights._Describe(db.query(PaymentAuditLog).filter_by(action="SET_PRICE").first())["text"]
    assert text == "Set Timer to ₹250.00 from 1 Jan 2027"


def test_article_fields_are_checked():
    db, admin, second, items, centres = _world()
    with pytest.raises(HTTPException) as tuition:
        art.UpdateArticle(db, FeeItemId=items["Monthly Fee"], Fields={"isStock": True}, Actor=admin)
    assert _code(tuition) == "NOT_A_STOCK_ITEM"
    with pytest.raises(HTTPException) as level:
        art.UpdateArticle(db, FeeItemId=items["Bridge Course Content Charges"], Fields={"levelCode": "PM-L1"}, Actor=admin)
    assert _code(level) == "LEVEL_BOOK_TAKEN"
    payload = art.UpdateArticle(db, FeeItemId=items["Timer"], Fields={"sku": " tm 01 ", "unit": "pc", "cost": "120"}, Actor=admin)
    assert (payload["sku"], payload["unit"], payload["costPaise"]) == ("TM01", "pc", 12000)
    with pytest.raises(HTTPException) as sku:
        art.UpdateArticle(db, FeeItemId=items["MathPath Bag"], Fields={"sku": "TM01"}, Actor=admin)
    assert _code(sku) == "SKU_TAKEN"
    _opening(db, admin, centres["RAJARHAT"], {items["Timer"]: 2})
    with pytest.raises(HTTPException) as held:
        art.UpdateArticle(db, FeeItemId=items["Timer"], Fields={"isStock": False}, Actor=admin)
    assert _code(held) == "STOCK_HELD"


# --- UAT 11: history and reports ---------------------------------------------------

def test_uat_11_student_ledger_by_centre_and_dates_and_the_exports():
    db, admin, second, items, centres = _world()
    TODAY["value"] = date(2026, 11, 10)
    inv.GenerateInvoices(db, Request={"feeItemIds": [items["Monthly Fee"]], "studentIds": ["yl", "pl"], "billingMonth": 11, "billingYear": 2026, "invoiceDate": "2026-11-01"}, IdempotencyKey=next(KEY), Actor=admin)
    TODAY["value"] = date(2026, 12, 1)
    nov = db.query(PaymentInvoice).filter_by(student_id="yl").one()
    rec.RecordPayment(db, StudentId="yl", Request={"paymentDate": "2026-12-01", "allocations": [{"invoiceId": nov.id, "amountPaise": 60000}], "methods": [_cash(60000)]}, IdempotencyKey=next(KEY), Actor=admin)
    builder.CreateInvoice(db, Request={"studentId": "yl", "lines": [{"feeItemId": items["Timer"]}]}, IdempotencyKey=next(KEY), Actor=admin)
    one = reports.StudentLedger(db, Filters={"studentId": "yl", "dateFrom": "2026-12-01"})
    assert one["students"][0]["openingPaise"] == 110000
    assert [(row["kind"], row["debitPaise"], row["creditPaise"], row["balancePaise"]) for row in one["rows"]] == [
        ("Brought forward", 0, 0, 110000), ("Invoice", 20000, 0, 130000), ("Payment", 0, 60000, 70000),
    ]
    laketown = reports.StudentLedger(db, Filters={"centreId": centres["LAKETOWN"]})
    assert [row["studentName"] for row in laketown["students"]] == ["Priya Laha"]
    workbook = load_workbook(io.BytesIO(reports.BuildLedgerWorkbook(one)))
    assert workbook.sheetnames == ["Summary", "Ledger"] and workbook["Ledger"].max_row == 4
    register = reports.InvoiceRegister(db, Filters={"dateFrom": "2026-11-01", "dateTo": "2026-12-31"})
    assert len(register) == 3
    assert load_workbook(io.BytesIO(reports.BuildRegisterWorkbook(register)))["Invoice register"].max_row == 6
    tuition = reports.MonthlyTuition(db, Period="2026-11")
    assert (tuition["billedCount"], tuition["billedPaise"], tuition["collectedPaise"], tuition["unpaidPaise"]) == (2, 220000, 60000, 160000)
    assert load_workbook(io.BytesIO(reports.BuildTuitionWorkbook(tuition))).sheetnames == ["Summary", "Tuition 2026-11"]
    account = rec.StudentAccount(db, "yl")
    assert account["student"]["studentCode"] == "MP-YL"


def test_monthly_tuition_counts_the_tuition_share_of_an_admission():
    db, admin, second, items, centres = _world()
    _admit(db, admin, "pl", pay=175000)  # half of ₹3,500
    tuition = reports.MonthlyTuition(db, Period="2026-12")
    row = tuition["rows"][0]
    assert (row["type"], row["feePaise"], row["paidPaise"], row["unpaidPaise"]) == ("Admission", 120000, 60000, 60000)


def test_the_pdf_lists_every_line_and_gst_on_the_total():
    db, admin, second, items, centres = _world()
    invoice = _admit(db, admin, "yl")["invoice"]
    row = db.get(PaymentInvoice, invoice["invoiceId"])
    text = PdfReader(io.BytesIO(invoice_pdf.RenderInvoicesPdf([row]))).pages[0].extract_text()
    for expected in ("Registration Charges", "Monthly Fee New Admission", "Young Learner Book Charges", "Free kit item", "RATE", "DISCOUNT", "Subtotal"):
        assert expected in text, expected
    assert "4,500.00" in text and "3,813.56" in text


def test_history_wording_is_singular_for_one_and_counts_each_centre():
    db, admin, second, items, centres = _world()
    setup.AssignStudentsToCentre(db, StudentIds=["nc"], CentreId=centres["LAKETOWN"], Actor=admin)
    setup.AssignStudentsToCentre(db, StudentIds=["yl"], CentreId=None, Actor=admin)
    run = db.query(PaymentAuditLog).filter_by(entity_type="STUDENT_CENTRE").order_by(PaymentAuditLog.created_at).all()
    assert insights._DescribeRun(run)["text"] == "Moved 2 students: 1 to Laketown, 1 to no centre"
    assert insights._DescribeRun(run[:1])["text"] == "Moved 1 student to Laketown"
    result = bill.SetStudentModes(db, StudentIds=["br"], Mode="INTERNATIONAL", Actor=admin)
    assert result
    entry = db.query(PaymentAuditLog).filter_by(entity_type="BILLING", action="SET_MODE").one()
    assert insights._Describe(entry)["text"] == "Set 1 student to International billing"


# --- API -----------------------------------------------------------------------------

def test_release2_api_end_to_end_and_admin_only():
    from tests.test_payments_phase2_invoices import _api

    db, admin, second, items, centres = _world()
    client, app = _api(db, admin)
    base = "/api/admin/payments"
    try:
        template = client.get(f"{base}/admission/template", params={"studentId": "pl"}).json()
        lines = [line for line in template["lines"] if line.get("included", True)]
        preview = client.post(f"{base}/admission/preview", json={"studentId": "pl", "lines": lines})
        assert preview.status_code == 200 and preview.json()["totalDisplay"] == "₹3,500.00"
        made = client.post(f"{base}/admission", json={"studentId": "pl", "lines": lines, "payment": {"methods": [_cash(350000)]}, "idempotencyKey": "api-adm-0001"})
        assert made.status_code == 200 and made.json()["invoice"]["status"] == "PAID"
        sale = client.post(f"{base}/invoices/create", json={"studentId": "yl", "lines": [{"feeItemId": items["Timer"], "quantity": 2}], "idempotencyKey": "api-new-0001"})
        assert sale.status_code == 200 and sale.json()["invoice"]["amountPaise"] == 40000
        invoice_id = made.json()["invoice"]["invoiceId"]
        detail = client.get(f"{base}/invoices/{invoice_id}").json()
        assert len(detail["lines"]) == 6 and detail["invoiceTypeLabel"] == "Admission"
        line_id = detail["lines"][2]["lineId"]
        handed = client.post(f"{base}/invoices/{invoice_id}/lines/{line_id}/handover", json={"date": "2026-12-01"})
        assert handed.status_code == 200 and handed.json()["lines"][2]["handedOverOn"] == "2026-12-01"
        assert client.post(f"{base}/invoices/{invoice_id}/late-fee").status_code == 409
        assert client.patch(f"{base}/fee-items/{items['Timer']}/article", json={"sku": "TIMER"}).json()["sku"] == "TIMER"
        assert client.post(f"{base}/fee-items/{items['Timer']}/prices", json={"amount": "220", "effectiveFrom": "2027-01-01"}).status_code == 200
        assert client.post(f"{base}/inventory/opening", json={"centreId": centres["RAJARHAT"], "lines": [{"feeItemId": items["Timer"], "quantity": 5}]}).status_code == 200
        assert client.post(f"{base}/inventory/inward", json={"centreId": centres["RAJARHAT"], "lines": [{"feeItemId": items["Timer"], "quantity": 5}]}).status_code == 200
        summary = client.get(f"{base}/inventory/summary").json()
        assert next(row for row in summary["items"] if row["feeItemId"] == items["Timer"])["total"] == 10
        assert client.get(f"{base}/inventory/movements").json()["totalCount"] == 2
        settings = client.put(f"{base}/inventory/settings", json={"stockTrackingEnabled": True, "lowStockThreshold": 3})
        assert settings.status_code == 200 and settings.json()["stockTrackingEnabled"] is True
        assert client.get(f"{base}/inventory/availability", params={"studentId": "br"}).json()["stockCentreId"] == centres["RAJARHAT"]
        assert client.get(f"{base}/books/queue").json()["openCount"] == 0
        for path in ("/inventory/export", "/books/export", "/reports/ledger/export", "/reports/register/export", "/reports/tuition/export"):
            response = client.get(base + path, params={"period": "2026-12"} if "tuition" in path else None)
            assert response.status_code == 200 and response.content[:2] == b"PK", path
        assert client.get(f"{base}/reports/tuition", params={"period": "2026-12"}).json()["billedCount"] == 1
        assert client.get(f"{base}/reports/ledger", params={"studentId": "pl"}).json()["rows"]
        assert client.get(f"{base}/invoices", params={"invoiceType": "ADMISSION"}).status_code == 200
        student = db.get(User, "user-yl")
        app.dependency_overrides[get_current_user] = lambda: student
        assert client.get(f"{base}/inventory/summary").status_code == 403
        assert client.post(f"{base}/invoices/create", json={"studentId": "yl", "lines": [], "idempotencyKey": "api-new-0002"}).status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_two_months_of_tuition_are_refused_in_the_preview_too():
    db, admin, second, items, centres = _world()
    lines = [{"feeItemId": items["Monthly Fee"], "billingMonth": 12, "billingYear": 2026}, {"feeItemId": items["Monthly Fee New Admission"], "billingMonth": 1, "billingYear": 2027}]
    with pytest.raises(HTTPException) as preview:
        builder.PreviewInvoice(db, Request={"studentId": "yl", "lines": lines})
    assert _code(preview) == "ONE_MONTH_ONLY"
