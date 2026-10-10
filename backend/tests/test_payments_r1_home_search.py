"""Payments revamp R1 (2026-10-09): Payments Home and the ⌘K search."""

from fastapi.testclient import TestClient

from app.database import get_db
from app.dependencies import get_current_user
from app.models import OnlinePaymentOrder, User
from app.services.payments import home_service as home
from app.services.payments import online_service as online
from app.services.payments import receipts_service as rec
from tests.test_payments_phase5_online import _invoices, _order, _razorpay, _setup, _sign  # noqa: F401  (fixture)


def _pay_cash(db, admin, invoice, reference="UTR-778899"):
    return rec.RecordPayment(
        db, StudentId=invoice.student_id,
        Request={"paymentDate": "2026-11-20", "allocations": [{"invoiceId": invoice.id, "amountPaise": invoice.amount_paise}], "methods": [{"method": "UPI", "amountPaise": invoice.amount_paise, "reference": reference}]},
        IdempotencyKey="home-cash-0001", Actor=admin,
    )


def test_home_shows_today_dues_and_what_needs_attention(_razorpay):
    db, admin = _setup()
    fee = _invoices(db, "s1")[0]
    _pay_cash(db, admin, fee)
    made = _order(db, student="s2")
    order = db.get(OnlinePaymentOrder, made["orderRef"])
    order.status = "ATTENTION"
    order.last_error = "Receipt numbering missing"
    db.commit()

    data = home.PaymentsHome(db)
    assert data["todayCollected"]["display"] == "₹1,100.00" and data["todayPaymentCount"] == 1
    assert data["due"]["display"] == "₹1,800.00"  # s1 bag 350 + s2 monthly 1,100 and bag 350
    assert data["studentsWithDues"] == 2 and data["studentsOverdue"] == 2
    assert [row["studentId"] for row in data["attention"]["overdueStudents"]] == ["s2", "s1"]  # biggest overdue first
    assert data["attention"]["online"][0]["status"] == "ATTENTION"
    assert data["recentPayments"][0]["receiptNumber"] == "MP-MRCPT-631"
    assert data["online"]["live"] is True and data["online"]["recent"][0]["orderRef"] == made["orderRef"]
    keys = {item["key"] for item in data["attention"]["setup"]}
    assert "receipt-numbering" not in keys and "centres" in keys  # s2 has no centre


def test_search_finds_students_invoices_receipts_and_razorpay_ids(_razorpay):
    db, admin = _setup()
    fee = _invoices(db, "s1")[0]
    receipt = _pay_cash(db, admin, fee)
    made = _order(db, student="s2")
    payment_id = _razorpay.pay(made["razorpayOrderId"])
    online.VerifyCheckout(db, Order=db.get(OnlinePaymentOrder, made["orderRef"]), RazorpayOrderId=made["razorpayOrderId"], RazorpayPaymentId=payment_id, Signature=_sign(made["razorpayOrderId"], payment_id))

    assert home.Search(db, "a") == {"query": "a", "students": [], "invoices": [], "receipts": [], "online": [], "expenses": []}
    by_name = home.Search(db, "aarav")
    assert [row["studentId"] for row in by_name["students"]] == ["s1"] and by_name["students"][0]["due"]["display"] == "₹350.00"
    assert home.Search(db, "MP-S2")["students"][0]["name"] == "Bina Roy"
    assert home.Search(db, "Parent Bina")["students"][0]["studentId"] == "s2"
    assert {row["studentId"] for row in home.Search(db, "98000 00000")["students"]} == {"s1", "s2", "s3"}  # parent mobile, spaces ignored
    assert home.Search(db, fee.invoice_number.lower())["invoices"][0]["invoiceId"] == fee.id
    assert home.Search(db, "MRCPT-631")["receipts"][0]["paymentId"] == receipt["paymentId"]
    assert home.Search(db, "778899")["receipts"][0]["references"] == ["UTR-778899"]
    found = home.Search(db, payment_id)
    assert found["online"][0]["orderRef"] == made["orderRef"] and found["receipts"][0]["channel"] == "ONLINE"
    assert home.Search(db, made["razorpayOrderId"])["online"][0]["status"] == "PAID"


def test_home_and_search_are_admin_only(_razorpay):
    from app.main import app

    db, admin = _setup()
    app.dependency_overrides[get_db] = lambda: db
    try:
        app.dependency_overrides[get_current_user] = lambda: db.get(User, "user-s1")
        client = TestClient(app)
        assert client.get("/api/admin/payments/home").status_code == 403
        assert client.get("/api/admin/payments/search", params={"q": "aarav"}).status_code == 403
        app.dependency_overrides[get_current_user] = lambda: admin
        assert client.get("/api/admin/payments/home").status_code == 200
        assert client.get("/api/admin/payments/search", params={"q": "aarav"}).json()["students"][0]["studentId"] == "s1"
    finally:
        app.dependency_overrides.clear()
