"""Billing Release 1 (2026-11-26, Shailesh): four tuition rates by admission
date, the rate group, one monthly fee per student per month whichever item,
admission dates as real dates with a reason and an audit when they change,
and the new-admission fee items made once at startup."""

from datetime import date, datetime, timezone

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.dependencies import get_current_user
from app.models import FeeItem, PaymentAuditLog, PaymentBillingSettings, PaymentInvoice, PaymentInvoiceDraft, Student, User
from app.services.payments import billing_service as bill
from app.services.payments import invoices_service as inv
from app.services.payments import insights_service as insights
from app.services.payments import setup_service as setup
from tests.test_payments_phase2_invoices import ADDED_BEFORE_CUTOFF, _code, _req, _session, _world

TODAY = {"value": date(2026, 11, 26)}


@pytest.fixture(autouse=True)
def _today(monkeypatch):
    TODAY["value"] = date(2026, 11, 26)
    monkeypatch.setattr(inv, "TodayInIndia", lambda: TODAY["value"])


def _add_student(db, sid, name, *, admission=None, added=ADDED_BEFORE_CUTOFF, active=True):
    user = User(id=f"user-{sid}", full_name=name, email=f"{sid}@example.test", password_hash="x", role="STUDENT", is_active=active, created_at=added)
    db.add(user)
    db.flush()
    db.add(Student(id=sid, user_id=user.id, student_code=f"MP-{sid.upper()}", is_active=active, admission_date=admission,
                   current_level_id="lvl-im3", current_module_id="mod-im", father_mobile="9800000000"))
    db.commit()


def _setup():
    """s1, s2 (from the shared world, no admission date, added in October),
    plus: s4 admitted 30 Nov 2026, s5 admitted 1 Dec 2026, s6 added in
    December with no admission date. Fee items as on live: ₹1,100 and
    ₹2,200, then the startup seeding adds ₹1,200 and ₹2,400."""
    db = _session()
    admin, monthly, bag = _world(db)
    intl = setup.CreateFeeItem(db, Name="Monthly Fee International", Amount="2200", BillingType="MONTHLY", Actor=admin)["feeItemId"]
    _add_student(db, "s4", "Diya Sen", admission="2026-11-30")
    _add_student(db, "s5", "Esha Paul", admission="2026-12-01")
    _add_student(db, "s6", "Farhan Ali", added=datetime(2026, 12, 2, 5, 0, tzinfo=timezone.utc))
    bill.BillingSettings(db)
    db.commit()
    assert bill.SeedNewAdmissionRates(db) == 2
    db.commit()
    items = {row.name: row.id for row in db.query(FeeItem).all()}
    return db, admin, {"india": monthly, "intl": intl, "indiaNew": items["Monthly Fee New Admission"], "intlNew": items["Monthly Fee International New Admission"], "bag": bag}


def test_rate_group_follows_the_admission_date_then_the_day_added():
    db, admin, fees = _setup()
    groups = bill.RateGroupsFor(db)
    assert {sid: (g["group"], g["source"]) for sid, g in groups.items()} == {
        "s1": ("EXISTING", "ADDED_ON"),
        "s2": ("EXISTING", "ADDED_ON"),
        "s3": ("EXISTING", "ADDED_ON"),
        "s4": ("EXISTING", "ADMISSION_DATE"),  # 30 Nov: the day before the cut-off
        "s5": ("NEW", "ADMISSION_DATE"),  # 1 Dec: the cut-off itself pays the new fee
        "s6": ("NEW", "ADDED_ON"),  # no admission date, added in December
    }
    assert groups["s5"]["admissionDate"] == "2026-12-01"
    # Other ways a date is written are read as the same day.
    assert bill.ParseAdmissionDate("01/12/2026") == date(2026, 12, 1) and bill.ParseAdmissionDate("1-12-2026") == date(2026, 12, 1)
    assert bill.ParseAdmissionDate("31/02/2026") is None and bill.ParseAdmissionDate("soon") is None


def test_seeding_adds_the_new_fees_once_and_never_bills():
    db, admin, fees = _setup()
    settings = db.get(PaymentBillingSettings, "default")
    assert settings.new_rate_from == "2026-12-01" and settings.new_rates_seeded is True
    assert settings.india_new_fee_item_id == fees["indiaNew"] and settings.international_new_fee_item_id == fees["intlNew"]
    new_india = db.get(FeeItem, fees["indiaNew"])
    assert (new_india.amount_paise, new_india.billing_type, new_india.gst_included) == (120000, "MONTHLY", True)
    assert db.get(FeeItem, fees["intlNew"]).amount_paise == 240000
    assert bill.SeedNewAdmissionRates(db) == 0  # once only
    assert db.query(FeeItem).filter(FeeItem.billing_type == "MONTHLY").count() == 4
    # Seeding never chooses the India fee, so nothing is drafted on the 1st.
    settings.india_fee_item_id = None
    settings.international_fee_item_id = None
    db.commit()
    TODAY["value"] = date(2026, 12, 1)
    assert bill.EnsureMonthlyDrafts(db) == 0
    assert db.query(PaymentInvoiceDraft).count() == 0
    audit = db.query(PaymentAuditLog).filter_by(entity_type="FEE_ITEM", action="CREATE", actor_name="MathPath").count()
    assert audit == 2


def test_seeding_skips_a_site_without_the_old_monthly_fees():
    db = _session()
    _world(db)  # ₹1,100 Monthly Fee only, no International fee
    bill.BillingSettings(db)
    db.commit()
    assert bill.SeedNewAdmissionRates(db) == 1
    assert db.query(FeeItem).filter_by(name="Monthly Fee International New Admission").count() == 0
    settings = db.get(PaymentBillingSettings, "default")
    assert settings.international_new_fee_item_id is None and settings.india_new_fee_item_id


def test_settings_show_four_rates_and_the_problems_for_groups_in_use():
    db, admin, fees = _setup()
    data = bill.BillingSettings(db)
    assert data["indiaFee"]["display"] == "₹1,100.00" and data["indiaNewFee"]["display"] == "₹1,200.00"
    assert data["internationalFee"]["display"] == "₹2,200.00" and data["internationalNewFee"]["display"] == "₹2,400.00"
    assert data["newRateFrom"] == "2026-12-01" and data["newRateFromLabel"] == "1 December 2026"
    assert data["groupCounts"] == {"INDIA": {"EXISTING": 3, "NEW": 2}, "INTERNATIONAL": {"EXISTING": 0, "NEW": 0}}
    assert data["problems"] == []

    unset = bill.UpdateBillingSettings(db, Request={"indiaNewFeeItemId": None}, Actor=admin)
    assert unset["problems"] == ["Choose the monthly fee for new India students, admitted from 1 December 2026 (2 students)."]
    with pytest.raises(HTTPException) as same:
        bill.UpdateBillingSettings(db, Request={"indiaNewFeeItemId": fees["intlNew"]}, Actor=admin)
    assert _code(same) == "SAME_FEE_FOR_BOTH"
    db.rollback()
    with pytest.raises(HTTPException) as bad_day:
        bill.UpdateBillingSettings(db, Request={"newRateFrom": "31-02-2026"}, Actor=admin)
    assert _code(bad_day) == "NEW_RATE_FROM_INVALID"
    db.rollback()
    moved = bill.UpdateBillingSettings(db, Request={"newRateFrom": "2027-01-01", "indiaNewFeeItemId": fees["indiaNew"]}, Actor=admin)
    assert moved["groupCounts"]["INDIA"] == {"EXISTING": 5, "NEW": 0} and moved["newRateFromLabel"] == "1 January 2027"
    entry = db.query(PaymentAuditLog).filter_by(entity_type="BILLING", entity_id="settings").order_by(PaymentAuditLog.created_at.desc()).first()
    assert '"newRateFrom": "2027-01-01"' in entry.after_json


def test_release_charges_each_student_the_rate_for_their_mode_and_group():
    db, admin, fees = _setup()
    bill.SetStudentModes(db, StudentIds=["s2", "s5"], Mode="INTERNATIONAL", Actor=admin)
    TODAY["value"] = date(2026, 12, 1)
    bill.CreateDrafts(db, PeriodValue="2026-12", StudentIds=None, Actor=admin)
    month = bill.MonthBilling(db, "2026-12")
    by = {row["studentId"]: row for row in month["drafts"]}
    assert {sid: (row["billingMode"], row["rateGroup"], row["fee"]["display"]) for sid, row in by.items()} == {
        "s1": ("INDIA", "EXISTING", "₹1,100.00"),
        "s2": ("INTERNATIONAL", "EXISTING", "₹2,200.00"),
        "s4": ("INDIA", "EXISTING", "₹1,100.00"),
        "s5": ("INTERNATIONAL", "NEW", "₹2,400.00"),
        "s6": ("INDIA", "NEW", "₹1,200.00"),
    }
    assert month["readyTotal"]["display"] == "₹8,000.00" and month["problems"] == []
    result = bill.ReleaseDrafts(db, PeriodValue="2026-12", DraftIds=[row["draftId"] for row in by.values()], IdempotencyKey="release-r1-0001", Actor=admin)
    assert result["released"] == 5
    invoices = {i.student_id: (i.fee_name, i.amount_paise, i.period_key) for i in db.query(PaymentInvoice).all()}
    assert invoices == {
        "s1": ("Monthly Fee", 110000, "2026-12"),
        "s2": ("Monthly Fee International", 220000, "2026-12"),
        "s4": ("Monthly Fee", 110000, "2026-12"),
        "s5": ("Monthly Fee International New Admission", 240000, "2026-12"),
        "s6": ("Monthly Fee New Admission", 120000, "2026-12"),
    }


def test_release_stops_when_a_group_in_the_drafts_has_no_fee():
    db, admin, fees = _setup()
    bill.UpdateBillingSettings(db, Request={"indiaNewFeeItemId": None}, Actor=admin)
    TODAY["value"] = date(2026, 12, 1)
    bill.CreateDrafts(db, PeriodValue="2026-12", StudentIds=None, Actor=admin)
    month = bill.MonthBilling(db, "2026-12")
    issues = {row["studentId"]: row["issue"] for row in month["drafts"]}
    assert issues["s5"] == "No monthly fee chosen for new India students" and issues["s1"] is None
    with pytest.raises(HTTPException) as missing:
        bill.ReleaseDrafts(db, PeriodValue="2026-12", DraftIds=[row["draftId"] for row in month["drafts"]], IdempotencyKey="release-r1-0002", Actor=admin)
    assert _code(missing) == "BILLING_FEE_NOT_SET" and "2 new India students" in missing.value.detail["message"]
    assert db.query(PaymentInvoice).count() == 0


def test_one_monthly_fee_a_month_whichever_item():
    db, admin, fees = _setup()
    first = inv.GenerateInvoices(db, Request=_req([fees["india"]], students=("s1",), month=12), IdempotencyKey="manual-0000001", Actor=admin)
    assert first["invoiceCount"] == 1
    # The new-admission fee for the same month is skipped: s1 already has December.
    preview = inv.PreviewInvoices(db, Request=_req([fees["indiaNew"]], students=("s1", "s2"), month=12))
    assert preview["invoiceCount"] == 1 and preview["skipped"][0]["studentId"] == "s1"
    assert preview["skipped"][0]["reason"].startswith("Already has Monthly Fee for December 2026")
    # Two monthly fees chosen in one run: each student gets only the first.
    both = inv.PreviewInvoices(db, Request=_req([fees["india"], fees["indiaNew"]], students=("s2",), month=12))
    assert both["invoiceCount"] == 1
    assert both["skipped"][0]["reason"] == "Only one monthly fee a month: Monthly Fee for December 2026 is in this run"
    # A different month is fine.
    assert inv.PreviewInvoices(db, Request=_req([fees["indiaNew"]], students=("s1",), month=1, year=2027))["invoiceCount"] == 1
    # Drafting December leaves s1 out; the database refuses a second one.
    TODAY["value"] = date(2026, 12, 1)
    bill.CreateDrafts(db, PeriodValue="2026-12", StudentIds=["s1", "s2"], Actor=admin)
    assert {d.student_id for d in db.query(PaymentInvoiceDraft).all()} == {"s2"}
    existing = db.query(PaymentInvoice).filter_by(student_id="s1").one()
    db.add(PaymentInvoice(
        invoice_number="MP-INV-TEST-2", student_id="s1", fee_item_id=fees["indiaNew"], fee_name="Monthly Fee New Admission",
        billing_type="MONTHLY", billing_month=12, billing_year=2026, period_key="2026-12", invoice_date=existing.invoice_date,
        due_date=existing.due_date, amount_paise=120000, taxable_paise=0, cgst_paise=0, sgst_paise=0, paid_paise=0, status="PENDING",
        description="Monthly Fee New Admission · December 2026", snapshot_json="{}",
    ))
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


def test_old_platform_months_count_as_billed():
    db, admin, fees = _setup()
    db.add(PaymentInvoice(
        invoice_number="MP-INV-0001223", student_id="s1", fee_item_id=fees["india"], fee_name="Monthly Fee",
        billing_type="MONTHLY", billing_month=12, billing_year=2026, period_key="2026-12", invoice_date=date(2026, 11, 21),
        due_date=date(2026, 12, 1), amount_paise=110000, taxable_paise=0, cgst_paise=0, sgst_paise=0, paid_paise=110000, status="PAID", source="LEGACY",
        description="Math Path Abacus · Monthly Fee · December 2026 · old platform", snapshot_json="{}",
    ))
    db.commit()
    TODAY["value"] = date(2026, 12, 1)
    bill.CreateDrafts(db, PeriodValue="2026-12", StudentIds=None, Actor=admin)
    assert "s1" not in {d.student_id for d in db.query(PaymentInvoiceDraft).all()}
    skipped = inv.PreviewInvoices(db, Request=_req([fees["indiaNew"]], students=("s1",), month=12))["skipped"]
    assert skipped[0]["reason"] == "Already has Monthly Fee for December 2026 (MP-INV-0001223)"


def test_rate_group_set_by_hand_needs_a_reason_and_is_audited():
    db, admin, fees = _setup()
    with pytest.raises(HTTPException) as no_reason:
        bill.SetStudentRateGroups(db, StudentIds=["s6"], Group="EXISTING", Reason=" ", Actor=admin)
    assert _code(no_reason) == "REASON_REQUIRED"
    with pytest.raises(HTTPException) as bad:
        bill.SetStudentRateGroups(db, StudentIds=["s6"], Group="CHEAP", Reason="x", Actor=admin)
    assert _code(bad) == "RATE_GROUP_INVALID"
    result = bill.SetStudentRateGroups(db, StudentIds=["s6", "s1"], Group="existing", Reason="Rejoined; old student since 2024", Actor=admin)
    assert result == {"studentsSelected": 2, "studentsChanged": 1, "group": "EXISTING", "groupLabel": "Existing"}
    groups = bill.RateGroupsFor(db, ["s6", "s1"])
    assert groups["s6"] == {"group": "EXISTING", "source": "SET_BY_ADMIN", "admissionDate": None}
    entry = db.query(PaymentAuditLog).filter_by(action="SET_RATE_GROUP").one()
    assert entry.reason == "Rejoined; old student since 2024" and '"from": "NEW"' in entry.after_json
    assert insights._Describe(entry)["text"] == "Set 1 student to the existing fee"
    back = bill.SetStudentRateGroups(db, StudentIds=["s6"], Group="AUTO", Reason="Set by mistake", Actor=admin)
    assert back["studentsChanged"] == 1 and bill.RateGroupsFor(db, ["s6"])["s6"]["source"] == "ADDED_ON"
    listed = {row["studentId"]: row for row in bill.ListStudentModes(db)}
    assert listed["s5"]["rateGroup"] == "NEW" and listed["s5"]["rateGroupSourceLabel"] == "Admission date" and listed["s5"]["admissionDate"] == "2026-12-01"


def _client(db, user):
    from app.main import app

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    return app, TestClient(app)


def test_admission_date_changes_need_a_reason_and_are_audited():
    db, admin, fees = _setup()
    app, client = _client(db, db.get(User, "admin-1"))
    try:
        bad = client.patch("/api/admin/students/s4", json={"admissionDate": "2026-13-01", "admissionDateReason": "x"})
        assert bad.status_code == 422 and bad.json()["detail"]["code"] == "ADMISSION_DATE_INVALID"
        # The same day written another way is not a change and needs no reason.
        same = client.patch("/api/admin/students/s4", json={"admissionDate": "30/11/2026"})
        assert same.status_code == 200 and db.get(Student, "s4").admission_date == "2026-11-30"
        no_reason = client.patch("/api/admin/students/s4", json={"admissionDate": "2026-12-03"})
        assert no_reason.status_code == 422 and no_reason.json()["detail"]["code"] == "ADMISSION_DATE_REASON_REQUIRED"
        assert db.get(Student, "s4").admission_date == "2026-11-30"
        changed = client.patch("/api/admin/students/s4", json={"admissionDate": "2026-12-03", "admissionDateReason": "Joined on 3 Dec, typed wrongly"})
        assert changed.status_code == 200 and changed.json()["student"]["admissionDate"] == "2026-12-03"
        entry = db.query(PaymentAuditLog).filter_by(entity_type="STUDENT", action="ADMISSION_DATE").one()
        assert entry.reason == "Joined on 3 Dec, typed wrongly"
        assert '"rateGroup": "Existing"' in entry.before_json and '"rateGroup": "New"' in entry.after_json
        assert insights._Describe(entry)["text"] == "Changed Diya Sen's admission date to 2026-12-03 (Existing fee to New fee)"
        assert bill.RateGroupsFor(db, ["s4"])["s4"]["group"] == "NEW"
        # Other fields still save without a reason when the date is unchanged.
        other = client.patch("/api/admin/students/s4", json={"admissionDate": "2026-12-03", "schoolName": "Salt Lake School"})
        assert other.status_code == 200
        far = client.patch("/api/admin/students/s4", json={"admissionDate": "1990-01-01", "admissionDateReason": "x"})
        assert far.status_code == 422 and far.json()["detail"]["code"] == "ADMISSION_DATE_INVALID"
    finally:
        app.dependency_overrides.clear()


def test_rate_group_endpoint_and_settings_endpoint():
    db, admin, fees = _setup()
    app, client = _client(db, db.get(User, "admin-1"))
    try:
        res = client.post("/api/admin/payments/billing/students/rate-group", json={"studentIds": ["s5"], "group": "EXISTING", "reason": "Sibling discount agreed at admission"})
        assert res.status_code == 200 and res.json()["studentsChanged"] == 1
        settings = client.get("/api/admin/payments/billing/settings").json()
        assert settings["groupCounts"]["INDIA"] == {"EXISTING": 4, "NEW": 1}
        put = client.put("/api/admin/payments/billing/settings", json={"newRateFrom": "2026-12-15"})
        assert put.status_code == 200 and put.json()["newRateFromLabel"] == "15 December 2026"
        # s6 was added on 2 Dec, before the new 15 Dec cut-off.
        one = client.get("/api/admin/payments/billing/students/s6").json()
        assert one["rateGroup"] == "EXISTING" and one["fee"]["display"] == "₹1,100.00" and one["rateGroupSource"] == "ADDED_ON"
    finally:
        app.dependency_overrides.clear()
    teacher = User(id="teacher-1", full_name="T", email="t@example.test", password_hash="x", role="TEACHER", is_active=True)
    db.add(teacher)
    db.commit()
    app, client = _client(db, teacher)
    try:
        assert client.post("/api/admin/payments/billing/students/rate-group", json={"studentIds": ["s5"], "group": "NEW", "reason": "x"}).status_code == 403
    finally:
        app.dependency_overrides.clear()
