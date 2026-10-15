"""Monthly billing readiness (Phase 2 part 6, 2026-10-15): the two monthly
fees chosen where none is, International billing from each student's latest
monthly invoice (a hand-chosen mode is never overwritten), demo accounts left
alone, and the students the old platform did not bill listed."""

from datetime import date

from app.models import PaymentBillingSettings, PaymentInvoice, PaymentStudentBilling, Student, User
from app.services.payments import setup_service as setup
from app.services.payments.billing_readiness import PrepareMonthlyBilling
from tests.test_payments_phase2_invoices import _session, _world


def _invoice(db, number, student, item, period, status="PAID"):
    db.add(PaymentInvoice(
        invoice_number=number, student_id=student, fee_item_id=item.id, fee_name=item.name, billing_type="MONTHLY",
        billing_month=int(period[5:]), billing_year=int(period[:4]), period_key=period, description=item.name,
        invoice_date=date(int(period[:4]), int(period[5:]), 1), amount_paise=item.amount_paise, taxable_paise=item.amount_paise,
        paid_paise=item.amount_paise if status == "PAID" else 0, status=status, snapshot_json="{}", source="LEGACY",
    ))


def _setup():
    db = _session()
    admin, monthly_id, _ = _world(db)
    intl = setup.CreateFeeItem(db, Name="Monthly Fee International", Amount="2200", BillingType="MONTHLY", Actor=admin)
    db.commit()
    from app.models import FeeItem

    monthly, international = db.get(FeeItem, monthly_id), db.get(FeeItem, intl["feeItemId"])
    # Live on 15 Oct: no monthly fee chosen yet.
    settings = db.get(PaymentBillingSettings, "default")
    if settings is None:
        db.add(PaymentBillingSettings(id="default", auto_drafts_enabled=True, auto_from_period="2026-11", modes_prefilled=True))
    else:
        settings.india_fee_item_id = None
        settings.international_fee_item_id = None
    # s1 pays the international fee on the old platform, s2 the India fee
    # (and set to International by hand), s3 is inactive; a demo account too.
    _invoice(db, "MP-INV-0001", "s1", international, "2026-09")
    _invoice(db, "MP-INV-0002", "s1", international, "2026-10")
    _invoice(db, "MP-INV-0003", "s2", monthly, "2026-10")
    _invoice(db, "MP-INV-0004", "s1", monthly, "2026-11")  # one month paid ahead must not change the billed month
    db.add(PaymentStudentBilling(student_id="s2", billing_mode="INTERNATIONAL"))
    user = User(id="user-d", full_name="Demo Kid", email="d@example.test", password_hash="x", role="STUDENT", is_active=True)
    db.add(user)
    db.flush()
    db.add(Student(id="d1", user_id=user.id, student_code="MP-ST-001", is_active=True, is_demo=True, current_level_id="lvl-im3", current_module_id="mod-im"))
    _invoice(db, "MP-INV-0005", "d1", international, "2026-10")
    user4 = User(id="user-s4", full_name="Dev New", email="s4@example.test", password_hash="x", role="STUDENT", is_active=True)
    db.add(user4)
    db.flush()
    db.add(Student(id="s4", user_id=user4.id, student_code="MP-S4", is_active=True, current_level_id="lvl-im3", current_module_id="mod-im"))
    db.commit()
    return db, monthly, international


def test_prepares_fees_and_international_billing():
    db, monthly, international = _setup()
    result = PrepareMonthlyBilling(db)
    db.commit()
    settings = db.get(PaymentBillingSettings, "default")
    assert (settings.india_fee_item_id, settings.international_fee_item_id) == (monthly.id, international.id)
    modes = {row.student_id: row.billing_mode for row in db.query(PaymentStudentBilling).all()}
    # s1's latest monthly invoice is November's India fee (paid ahead), so it
    # is not switched; the international history alone does not decide.
    assert modes.get("s1", "INDIA") == "INDIA"
    # s2 was set to International by hand: kept, and flagged.
    assert modes["s2"] == "INTERNATIONAL"
    assert any("MP-S2" in line and "India fee" in line for line in result.to_decide)
    # Demo accounts are left alone.
    assert "d1" not in modes
    # The billed month is October (not the one student's November); s4 had no October invoice.
    assert any("October 2026" in line and "MP-S4 Dev New" in line for line in result.to_decide)
    assert not any("MP-S1 " in line for line in result.to_decide if "no monthly invoice" in line)


def test_switches_a_student_whose_latest_monthly_invoice_is_international():
    db, monthly, international = _setup()
    db.query(PaymentInvoice).filter(PaymentInvoice.invoice_number == "MP-INV-0004").delete()
    db.commit()
    result = PrepareMonthlyBilling(db)
    db.commit()
    modes = {row.student_id: row.billing_mode for row in db.query(PaymentStudentBilling).all()}
    assert modes["s1"] == "INTERNATIONAL"
    assert any("Set to International billing (1): MP-S1 Aarav Sen" in line for line in result.lines)
    # Running it again changes nothing more.
    again = PrepareMonthlyBilling(db)
    assert any("Set to International billing (0): none needed" in line for line in again.lines)
    assert "(already chosen)" in again.lines[0]


def test_a_mode_saved_by_hand_is_never_changed():
    db, monthly, international = _setup()
    db.query(PaymentInvoice).filter(PaymentInvoice.invoice_number == "MP-INV-0004").delete()
    db.add(PaymentStudentBilling(student_id="s1", billing_mode="INDIA"))
    db.commit()
    result = PrepareMonthlyBilling(db)
    db.commit()
    assert db.get(PaymentStudentBilling, "s1").billing_mode == "INDIA"
    assert any("MP-S1" in line and "set to India by hand" in line for line in result.to_decide)
