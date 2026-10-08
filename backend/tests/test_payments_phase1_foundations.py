"""Payments Phase 1 (2026-10-08): money and GST rules, numbering, fee setup,
business details, centres, student centres, audit history and admin-only
access."""

import json
import random

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.dependencies import get_current_user
from app.models import (
    FeeItem,
    Level,
    Module,
    PaymentAuditLog,
    PaymentBusinessProfile,
    PaymentCentre,
    PaymentNumberSequence,
    Student,
    User,
)
from app.services.payments import money, numbering
from app.services.payments import setup_service as setup


def _session():
    engine = create_engine("sqlite://", future=True, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)()


def _admin(db, uid="admin-1"):
    user = User(id=uid, full_name="Admin One", email=f"{uid}@example.test", password_hash="x", role="ADMIN", is_active=True)
    db.add(user)
    db.commit()
    return user


def _student(db, sid, name="Student", active=True):
    user = User(id=f"user-{sid}", full_name=name, email=f"{sid}@example.test", password_hash="x", role="STUDENT", is_active=active)
    db.add(user)
    db.flush()
    row = Student(id=sid, user_id=user.id, student_code=f"MP-{sid}", is_active=active)
    db.add(row)
    db.commit()
    return row


def _code(excinfo):
    return excinfo.value.detail["code"]


# --- money ---------------------------------------------------------------------

@pytest.mark.parametrize(
    "value,paise",
    [("1100", 110000), ("1,100.50", 110050), (1100, 110000), (1100.1, 110010), ("₹ 2", 200), ("0.01", 1), ("10,00,000", 100000000)],
)
def test_amounts_are_read_exactly_into_paise(value, paise):
    assert money.ParseRupeesToPaise(value) == paise


@pytest.mark.parametrize(
    "value,code",
    [("", "AMOUNT_REQUIRED"), (None, "AMOUNT_REQUIRED"), ("abc", "AMOUNT_INVALID"), ("-5", "AMOUNT_NEGATIVE"),
     ("1.234", "AMOUNT_TOO_PRECISE"), ("0", "AMOUNT_ZERO"), ("1000000.01", "AMOUNT_TOO_LARGE"), (True, "AMOUNT_INVALID"), ("NaN", "AMOUNT_INVALID")],
)
def test_bad_amounts_are_refused_with_a_clear_reason(value, code):
    with pytest.raises(HTTPException) as excinfo:
        money.ParseRupeesToPaise(value)
    assert _code(excinfo) == code


def test_indian_rupee_formatting():
    assert money.FormatIndianRupees(110000) == "₹1,100.00"
    assert money.FormatIndianRupees(10670200) == "₹1,06,702.00"
    assert money.FormatIndianRupees(100000000) == "₹10,00,000.00"
    assert money.FormatIndianRupees(5) == "₹0.05"
    assert money.PaiseToRupeesString(110050) == "1100.50"


def test_gst_split_matches_the_old_invoices_where_they_added_up():
    # Old receipt MP-MRCPT-159: ₹3.00 -> 2.54 + 0.23 + 0.23.
    assert money.SplitInclusiveGst(300) == {"totalPaise": 300, "taxablePaise": 254, "gstPaise": 46, "cgstPaise": 23, "sgstPaise": 23, "rateBps": 1800}
    # Monthly fee ₹1,100 -> 932.20 + 83.90 + 83.90.
    split = money.SplitInclusiveGst(110000)
    assert (split["taxablePaise"], split["cgstPaise"], split["sgstPaise"]) == (93220, 8390, 8390)


def test_gst_split_always_adds_up_to_the_paisa():
    # The old platform printed ₹2.00 as 1.69 + 0.15 + 0.15 = 1.99. Never here.
    split = money.SplitInclusiveGst(200)
    assert split["taxablePaise"] + split["cgstPaise"] + split["sgstPaise"] == 200
    rng = random.Random(8102026)
    amounts = list(range(0, 20001)) + [rng.randint(1, money.MAX_AMOUNT_PAISE) for _ in range(20000)]
    for total in amounts:
        s = money.SplitInclusiveGst(total)
        assert s["taxablePaise"] + s["gstPaise"] == total
        assert s["cgstPaise"] + s["sgstPaise"] == s["gstPaise"]
        assert 0 <= s["sgstPaise"] <= s["cgstPaise"] <= s["sgstPaise"] + 1
        # Taxable is the nearest paisa to total / 1.18.
        assert abs(s["taxablePaise"] * 118 - total * 100) <= 59


def test_gst_off_means_no_tax_lines():
    assert money.SplitInclusiveGst(110000, GstIncluded=False) == {"totalPaise": 110000, "taxablePaise": 110000, "gstPaise": 0, "cgstPaise": 0, "sgstPaise": 0, "rateBps": 0}


# --- GSTIN / PAN ---------------------------------------------------------------

def test_gstin_check_character():
    assert setup.GstinChecksumIsValid("19AALPG9427A1ZQ")  # the business's GSTIN on the old invoices
    assert not setup.GstinChecksumIsValid("19AALPG9427A1ZR")
    with pytest.raises(HTTPException) as excinfo:
        setup.ValidateGstin("19AALPG9427A1ZR")
    assert _code(excinfo) == "GSTIN_INVALID"
    assert setup.ValidateGstin(" 19aalpg9427a1zq ") == "19AALPG9427A1ZQ"
    assert setup.ValidateGstin("") is None


# --- numbering -----------------------------------------------------------------

def test_nothing_is_numbered_until_a_starting_number_is_set():
    db = _session()
    admin = _admin(db)
    numbering.EnsureNumberSequences(db)
    with pytest.raises(HTTPException) as excinfo:
        numbering.TakeNextNumber(db, "INVOICE")
    assert _code(excinfo) == "PAYMENT_NUMBERING_NOT_SET"

    numbering.SetStartingNumber(db, Key="INVOICE", NextNumber=1037, Actor=admin, Reason="continue from the old platform")
    numbering.SetStartingNumber(db, Key="RECEIPT", NextNumber=631, Actor=admin)
    db.commit()
    assert numbering.TakeNextNumber(db, "INVOICE") == "MP-INV-001037"
    assert numbering.TakeNextNumber(db, "INVOICE") == "MP-INV-001038"
    assert numbering.TakeNextNumber(db, "RECEIPT") == "MP-MRCPT-631"
    db.commit()

    # Never backwards past a number already issued.
    with pytest.raises(HTTPException) as excinfo:
        numbering.SetStartingNumber(db, Key="INVOICE", NextNumber=1038, Actor=admin)
    assert _code(excinfo) == "PAYMENT_SEQUENCE_BACKWARDS"
    numbering.SetStartingNumber(db, Key="INVOICE", NextNumber=2000, Actor=admin)
    assert numbering.TakeNextNumber(db, "INVOICE") == "MP-INV-002000"

    audit = db.query(PaymentAuditLog).filter_by(entity_type="NUMBER_SEQUENCE").all()
    assert len(audit) == 3
    first = min(audit, key=lambda row: row.created_at)
    assert json.loads(first.before_json)["nextFormatted"] is None  # nothing was set before
    assert any(row.reason == "continue from the old platform" for row in audit)


def test_a_rolled_back_save_does_not_spend_a_number():
    db = _session()
    admin = _admin(db)
    numbering.SetStartingNumber(db, Key="INVOICE", NextNumber=10, Actor=admin)
    db.commit()
    assert numbering.TakeNextNumber(db, "INVOICE") == "MP-INV-000010"
    db.rollback()
    assert numbering.TakeNextNumber(db, "INVOICE") == "MP-INV-000010"


@pytest.mark.parametrize("bad", [0, -1, 100_000_000, "x"])
def test_starting_number_must_be_sensible(bad):
    db = _session()
    with pytest.raises(HTTPException) as excinfo:
        numbering.SetStartingNumber(db, Key="RECEIPT", NextNumber=bad, Actor=None)
    assert _code(excinfo) == "PAYMENT_SEQUENCE_INVALID"


# --- defaults --------------------------------------------------------------------

def test_defaults_are_created_once_and_never_overwrite_edits():
    db = _session()
    admin = _admin(db)
    settings = setup.GetPaymentSettings(db)
    assert [c["name"] for c in settings["centres"]] == ["Rajarhat", "Laketown", "Online"]
    assert settings["business"]["legalName"] == "BGM Enterprise"
    assert settings["business"]["gstin"] == "19AALPG9427A1ZQ"
    assert [s["key"] for s in settings["numbering"]] == ["INVOICE", "RECEIPT"]
    assert all(not s["isConfigured"] for s in settings["numbering"])

    setup.UpdateBusinessProfile(db, Fields={"legalName": "BGM Enterprise Pvt"}, Actor=admin)
    setup.EnsurePaymentDefaults(db)
    setup.EnsurePaymentDefaults(db)
    db.commit()
    assert db.query(PaymentCentre).count() == 3
    assert db.get(PaymentBusinessProfile, "default").legal_name == "BGM Enterprise Pvt"
    assert db.query(PaymentNumberSequence).count() == 2


# --- fee items -------------------------------------------------------------------

def test_fee_item_lifecycle_with_history():
    db = _session()
    admin = _admin(db)
    monthly = setup.CreateFeeItem(db, Name="  Monthly   Fee ", Amount="1100", BillingType="monthly", Actor=admin)
    assert monthly["name"] == "Monthly Fee"
    assert monthly["amountPaise"] == 110000 and monthly["amountDisplay"] == "₹1,100.00"
    assert monthly["billingType"] == "MONTHLY" and monthly["gstIncluded"] is True
    assert monthly["taxableDisplay"] == "₹932.20" and monthly["gstDisplay"] == "₹167.80"
    bag = setup.CreateFeeItem(db, Name="MathPath Bag", Amount=350, GstIncluded=False, Actor=admin)
    assert bag["displayOrder"] == monthly["displayOrder"] + 1

    # Names are unique, ignoring case and spacing.
    with pytest.raises(HTTPException) as excinfo:
        setup.CreateFeeItem(db, Name="monthly fee", Amount="1", Actor=admin)
    assert _code(excinfo) == "FEE_ITEM_NAME_TAKEN"

    updated = setup.UpdateFeeItem(db, FeeItemId=monthly["feeItemId"], Amount="1200", Reason="new session price", Actor=admin)
    assert updated["amountPaise"] == 120000

    # Deactivating needs a reason, and nothing is deleted.
    with pytest.raises(HTTPException) as excinfo:
        setup.SetFeeItemActive(db, FeeItemId=bag["feeItemId"], IsActive=False, Actor=admin)
    assert _code(excinfo) == "REASON_REQUIRED"
    off = setup.SetFeeItemActive(db, FeeItemId=bag["feeItemId"], IsActive=False, Reason="no longer sold", Actor=admin)
    assert off["isActive"] is False
    assert db.query(FeeItem).count() == 2
    listed = setup.ListFeeItems(db)
    assert [i["name"] for i in listed] == ["Monthly Fee", "MathPath Bag"]  # active first

    history = db.query(PaymentAuditLog).filter_by(entity_type="FEE_ITEM").order_by(PaymentAuditLog.created_at).all()
    actions = sorted(row.action for row in history)
    assert actions == ["CREATE", "CREATE", "DEACTIVATE", "UPDATE"]
    update_row = next(row for row in history if row.action == "UPDATE")
    assert json.loads(update_row.before_json)["amount"] == "1100.00"
    assert json.loads(update_row.after_json)["amount"] == "1200.00"
    assert update_row.reason == "new session price" and update_row.actor_name == "Admin One"


def test_an_edit_that_changes_nothing_writes_no_history():
    db = _session()
    admin = _admin(db)
    item = setup.CreateFeeItem(db, Name="Timer", Amount="200", Actor=admin)
    setup.UpdateFeeItem(db, FeeItemId=item["feeItemId"], Amount="200.00", Name="Timer", Actor=admin)
    assert db.query(PaymentAuditLog).filter_by(action="UPDATE").count() == 0


def test_fee_item_validation():
    db = _session()
    admin = _admin(db)
    with pytest.raises(HTTPException) as excinfo:
        setup.CreateFeeItem(db, Name="  ", Amount="10", Actor=admin)
    assert _code(excinfo) == "FEE_ITEM_NAME_REQUIRED"
    with pytest.raises(HTTPException) as excinfo:
        setup.CreateFeeItem(db, Name="X", Amount="10", BillingType="WEEKLY", Actor=admin)
    assert _code(excinfo) == "FEE_ITEM_BILLING_TYPE_INVALID"
    with pytest.raises(HTTPException) as excinfo:
        setup.CreateFeeItem(db, Name="X", Amount="-10", Actor=admin)
    assert _code(excinfo) == "AMOUNT_NEGATIVE"
    with pytest.raises(HTTPException) as excinfo:
        setup.UpdateFeeItem(db, FeeItemId="missing", Amount="1", Actor=admin)
    assert _code(excinfo) == "FEE_ITEM_NOT_FOUND"


def test_reorder_and_stale_reorder():
    db = _session()
    admin = _admin(db)
    a = setup.CreateFeeItem(db, Name="A", Amount="1", Actor=admin)
    b = setup.CreateFeeItem(db, Name="B", Amount="1", Actor=admin)
    c = setup.CreateFeeItem(db, Name="C", Amount="1", Actor=admin)
    result = setup.ReorderFeeItems(db, OrderedIds=[c["feeItemId"], a["feeItemId"], b["feeItemId"]], Actor=admin)
    assert [i["name"] for i in result] == ["C", "A", "B"]
    with pytest.raises(HTTPException) as excinfo:
        setup.ReorderFeeItems(db, OrderedIds=[c["feeItemId"], a["feeItemId"]], Actor=admin)
    assert _code(excinfo) == "FEE_ITEM_ORDER_STALE"
    with pytest.raises(HTTPException) as excinfo:
        setup.ReorderFeeItems(db, OrderedIds=[c["feeItemId"], c["feeItemId"], a["feeItemId"]], Actor=admin)
    assert _code(excinfo) == "FEE_ITEM_ORDER_INVALID"
    # Reactivating puts an item at the end.
    setup.SetFeeItemActive(db, FeeItemId=c["feeItemId"], IsActive=False, Reason="test", Actor=admin)
    back = setup.SetFeeItemActive(db, FeeItemId=c["feeItemId"], IsActive=True, Actor=admin)
    assert back["displayOrder"] > max(i["displayOrder"] for i in setup.ListFeeItems(db) if i["name"] != "C")


# --- business details --------------------------------------------------------------

def test_business_details_validation():
    db = _session()
    admin = _admin(db)
    setup.GetPaymentSettings(db)
    with pytest.raises(HTTPException) as excinfo:
        setup.UpdateBusinessProfile(db, Fields={"legalName": "  "}, Actor=admin)
    assert _code(excinfo) == "LEGAL_NAME_REQUIRED"
    db.rollback()
    with pytest.raises(HTTPException) as excinfo:
        setup.UpdateBusinessProfile(db, Fields={"pan": "ABCDE1234F"}, Actor=admin)
    assert _code(excinfo) == "PAN_GSTIN_MISMATCH"
    db.rollback()
    with pytest.raises(HTTPException) as excinfo:
        setup.UpdateBusinessProfile(db, Fields={"email": "not-an-email"}, Actor=admin)
    assert _code(excinfo) == "EMAIL_INVALID"
    db.rollback()
    saved = setup.UpdateBusinessProfile(db, Fields={"pan": "aalpg9427a", "registeredAddress": "Line 1\n\n  Line 2  "}, Actor=admin)
    assert saved["pan"] == "AALPG9427A"
    assert saved["registeredAddress"] == "Line 1\nLine 2"
    # Fields not sent are left alone.
    assert saved["gstin"] == "19AALPG9427A1ZQ"
    assert db.query(PaymentAuditLog).filter_by(entity_type="BUSINESS_PROFILE").count() == 1


# --- centres and student centres -------------------------------------------------------

def test_centres_and_assigning_students():
    db = _session()
    admin = _admin(db)
    settings = setup.GetPaymentSettings(db)
    laketown = next(c for c in settings["centres"] if c["name"] == "Laketown")
    _student(db, "s1", "Asha")
    _student(db, "s2", "Bina")
    _student(db, "s3", "Charu", active=False)

    result = setup.AssignStudentsToCentre(db, StudentIds=["s1", "s2", "s1"], CentreId=laketown["centreId"], Actor=admin)
    assert result == {"studentsSelected": 2, "studentsChanged": 2, "centreName": "Laketown"}
    again = setup.AssignStudentsToCentre(db, StudentIds=["s1"], CentreId=laketown["centreId"], Actor=admin)
    assert again["studentsChanged"] == 0
    counts = {c["name"]: c["studentCount"] for c in setup.ListCentres(db)}
    assert counts["Laketown"] == 2
    assert setup.GetPaymentSettings(db)["activeStudentsWithoutCentre"] == 0

    cleared = setup.AssignStudentsToCentre(db, StudentIds=["s2"], CentreId="", Actor=admin)
    assert cleared["centreName"] is None and db.get(Student, "s2").centre_id is None
    assert db.query(PaymentAuditLog).filter_by(entity_type="STUDENT_CENTRE").count() == 3
    named = db.query(PaymentAuditLog).filter_by(entity_type="STUDENT_CENTRE", entity_id="s2").all()
    assert all(json.loads(row.after_json)["student"] == "Bina" for row in named)

    rows = {r["studentId"]: r for r in setup.ListStudentsForCentreAssignment(db)}
    assert rows["s1"]["centreName"] == "Laketown" and rows["s3"]["isActive"] is False

    with pytest.raises(HTTPException) as excinfo:
        setup.AssignStudentsToCentre(db, StudentIds=[], CentreId=laketown["centreId"], Actor=admin)
    assert _code(excinfo) == "NO_STUDENTS_SELECTED"
    with pytest.raises(HTTPException) as excinfo:
        setup.AssignStudentsToCentre(db, StudentIds=["nope"], CentreId=laketown["centreId"], Actor=admin)
    assert _code(excinfo) == "STUDENT_NOT_FOUND"

    # A switched-off centre cannot be given to students.
    setup.UpdateCentre(db, CentreId=laketown["centreId"], Fields={"isActive": False}, Actor=admin)
    with pytest.raises(HTTPException) as excinfo:
        setup.AssignStudentsToCentre(db, StudentIds=["s2"], CentreId=laketown["centreId"], Actor=admin)
    assert _code(excinfo) == "CENTRE_INACTIVE"


def test_centre_names_are_unique():
    db = _session()
    admin = _admin(db)
    setup.GetPaymentSettings(db)
    with pytest.raises(HTTPException) as excinfo:
        setup.CreateCentre(db, Name="  laketown ", Actor=admin)
    assert _code(excinfo) == "CENTRE_NAME_TAKEN"
    salt_lake = setup.CreateCentre(db, Name="Salt Lake", Address="Sector V", Actor=admin)
    assert salt_lake["code"] == "SALT_LAKE" and salt_lake["isActive"] is True


def test_student_form_saves_and_shows_the_centre():
    from app.api import routes_admin

    db = _session()
    admin = _admin(db)
    setup.GetPaymentSettings(db)
    module = Module(id="m1", module_code="IM", module_name="Intermediate", is_active=True)
    db.add(module)
    db.flush()
    level = Level(id="l1", module_id="m1", level_code="IM-L3", level_name="IM 3", is_active=True)
    db.add(level)
    row = _student(db, "s1", "Asha")
    rajarhat = db.query(PaymentCentre).filter_by(code="RAJARHAT").one()

    payload = routes_admin.StudentUpdateRequest(centreId=rajarhat.id)
    routes_admin.apply_student_fields(row, payload, module, level, db)
    db.commit()
    shown = routes_admin.student_payload(db, row)
    assert shown["centreId"] == rajarhat.id and shown["centreName"] == "Rajarhat"

    # Not sending the field leaves it alone; "" clears it.
    routes_admin.apply_student_fields(row, routes_admin.StudentUpdateRequest(), module, level, db)
    assert row.centre_id == rajarhat.id
    # A centre switched off later does not block saving the rest of the profile.
    rajarhat.is_active = False
    db.commit()
    routes_admin.apply_student_fields(row, routes_admin.StudentUpdateRequest(centreId=rajarhat.id, schoolName="New School"), module, level, db)
    assert row.centre_id == rajarhat.id and row.school_name == "New School"
    laketown = db.query(PaymentCentre).filter_by(code="LAKETOWN").one()
    laketown.is_active = False
    db.commit()
    with pytest.raises(HTTPException) as excinfo:
        routes_admin.apply_student_fields(row, routes_admin.StudentUpdateRequest(centreId=laketown.id), module, level, db)
    assert _code(excinfo) == "CENTRE_INACTIVE"
    routes_admin.apply_student_fields(row, routes_admin.StudentUpdateRequest(centreId=""), module, level, db)
    assert row.centre_id is None


# --- access ------------------------------------------------------------------------------

def _client_as(role):
    from app.main import app

    db = _session()
    user = User(id=f"u-{role}", full_name=role.title(), email=f"{role}@example.test", password_hash="x", role=role, is_active=True)
    db.add(user)
    db.commit()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app), app


@pytest.mark.parametrize("role", ["STUDENT", "TEACHER"])
def test_every_payments_admin_route_refuses_students_and_teachers(role):
    from app.api.routes_admin_payments import router

    client, app = _client_as(role)
    try:
        checked = 0
        for route in router.routes:
            path = route.path.replace("{fee_item_id}", "x").replace("{invoice_id}", "x").replace("{payment_id}", "x").replace("{student_id}", "x").replace("{centre_id}", "x").replace("{sequence_key}", "INVOICE")
            for method in route.methods:
                response = client.request(method, path, json={})
                assert response.status_code == 403, (method, path, response.status_code)
                checked += 1
        assert checked >= 13
    finally:
        app.dependency_overrides.clear()


def test_admin_can_use_the_routes_end_to_end():
    client, app = _client_as("ADMIN")
    try:
        settings = client.get("/api/admin/payments/settings").json()
        assert settings["business"]["legalName"] == "BGM Enterprise"
        created = client.post("/api/admin/payments/fee-items", json={"name": "Registration Charges", "amount": "1800", "billingType": "ONE_TIME"})
        assert created.status_code == 200, created.text
        item_id = created.json()["feeItemId"]
        patched = client.patch(f"/api/admin/payments/fee-items/{item_id}", json={"description": "Charged once at joining"})
        assert patched.json()["description"] == "Charged once at joining"
        assert patched.json()["amountPaise"] == 180000
        cleared = client.patch(f"/api/admin/payments/fee-items/{item_id}", json={"clearDescription": True})
        assert cleared.json()["description"] is None
        bad = client.post("/api/admin/payments/fee-items", json={"name": "X", "amount": "1.999"})
        assert bad.status_code == 422 and bad.json()["detail"]["code"] == "AMOUNT_TOO_PRECISE"
        seq = client.put("/api/admin/payments/numbering/invoice", json={"nextNumber": 1037, "reason": "continue"})
        assert seq.status_code == 200 and seq.json()["nextFormatted"] == "MP-INV-001037"
        history = client.get(f"/api/admin/payments/audit?entityType=FEE_ITEM&entityId={item_id}").json()["entries"]
        assert [h["action"] for h in history] == ["UPDATE", "UPDATE", "CREATE"]
    finally:
        app.dependency_overrides.clear()
