"""Student > Fees API (Payments Phase 5, 2026-10-09).

A student only ever sees their own invoices, payments and PDFs: every route
takes the student from the session (get_current_student), never from the
address, and each record is checked to belong to that student. Everything
except /summary is closed while the Fees tab is switched off in Payment
Settings > Online Payments."""
# No "from __future__ import annotations" here: with it, FastAPI cannot
# see the request bodies through the rate limiter's wrapper.
import json

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.rate_limit import limiter
from app.database import get_db
from app.dependencies import get_current_student
from app.models import Student
from app.services.payments.invoice_pdf import RenderInvoicesPdf, RenderReceiptsPdf, SafeFileName
from app.services.payments.online_service import (
    CreateOrder,
    LogCheckoutEvent,
    OrderResult,
    RequireStudentFees,
    StudentFees,
    StudentFeesSummary,
    StudentInvoiceForPdf,
    StudentOrder,
    StudentReceiptForPdf,
    VerifyCheckout,
)
from app.services.payments.receipts_service import PaymentPayload

router = APIRouter(prefix="/api/student/fees", tags=["student-fees"])


class OrderCreateRequest(BaseModel):
    invoiceIds: list[str] | None = None


class OrderVerifyRequest(BaseModel):
    razorpay_order_id: str | None = None
    razorpay_payment_id: str | None = None
    razorpay_signature: str | None = None


class CheckoutEventRequest(BaseModel):
    type: str
    detail: str | None = None
    razorpay_payment_id: str | None = None


def PdfResponse(Content: bytes, FileName: str) -> Response:
    return Response(
        content=Content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{SafeFileName(FileName)}"', "Cache-Control": "no-store"},
    )


def ReceiptPdf(db: Session, Payment) -> bytes:
    return RenderReceiptsPdf([(json.loads(Payment.snapshot_json), PaymentPayload(db, Payment, Names={}))])


@router.get("/summary")
def student_fees_summary(db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    return StudentFeesSummary(db, student)


@router.get("")
def student_fees(db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    return StudentFees(db, student)


@router.get("/invoices/{invoice_id}/pdf")
def student_invoice_pdf(invoice_id: str, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    Invoice = StudentInvoiceForPdf(db, StudentRow=student, InvoiceId=invoice_id)
    return PdfResponse(RenderInvoicesPdf([Invoice], Title=f"Tax Invoice {Invoice.invoice_number}"), f"{Invoice.invoice_number}.pdf")


@router.get("/receipts/{payment_id}/pdf")
def student_receipt_pdf(payment_id: str, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    Payment = StudentReceiptForPdf(db, StudentRow=student, PaymentId=payment_id)
    return PdfResponse(ReceiptPdf(db, Payment), f"{Payment.receipt_number}.pdf")


@router.post("/orders")
@limiter.limit("10/minute")
def student_create_order(request: Request, payload: OrderCreateRequest, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    RequireStudentFees(db)
    return CreateOrder(db, StudentId=student.id, InvoiceIds=payload.invoiceIds, Source="STUDENT", Actor=None)


@router.get("/orders/{order_ref}")
def student_order_status(order_ref: str, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    return OrderResult(db, StudentOrder(db, OrderRef=order_ref, StudentId=student.id))


@router.post("/orders/{order_ref}/verify")
@limiter.limit("20/minute")
def student_verify_order(request: Request, order_ref: str, payload: OrderVerifyRequest, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    Order = StudentOrder(db, OrderRef=order_ref, StudentId=student.id)
    return VerifyCheckout(db, Order=Order, RazorpayOrderId=payload.razorpay_order_id, RazorpayPaymentId=payload.razorpay_payment_id, Signature=payload.razorpay_signature)


@router.post("/orders/{order_ref}/events")
@limiter.limit("30/minute")
def student_checkout_event(request: Request, order_ref: str, payload: CheckoutEventRequest, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    Order = StudentOrder(db, OrderRef=order_ref, StudentId=student.id)
    return LogCheckoutEvent(db, Order=Order, Type=payload.type, Detail=payload.detail, PaymentId=payload.razorpay_payment_id)
