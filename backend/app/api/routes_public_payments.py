"""Public payments API (Payments Phase 5, 2026-10-09): no login.

  * POST /api/payments/razorpay/webhook -- Razorpay tells this site about a
    payment. Trusted only when the X-Razorpay-Signature over the raw body
    matches the webhook secret. Orders this site did not make are ignored.
  * /api/pay/{token} -- a parent's pay link: the student's unpaid invoices
    and Pay Now. The token is the only key (32 random characters); a link
    can be switched off and expires. Rate limited.
"""
# No "from __future__ import annotations" here: with it, FastAPI cannot
# see the request bodies through the rate limiter's wrapper.
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.api.routes_student_fees import CheckoutEventRequest, OrderCreateRequest, OrderVerifyRequest, PdfResponse, ReceiptPdf
from app.core.rate_limit import limiter
from app.database import get_db
from app.services.payments.online_service import (
    CreateOrder,
    HandleWebhook,
    LogCheckoutEvent,
    OrderResult,
    PayLinkOrder,
    PayLinkReceiptForPdf,
    PublicPayPage,
    ResolvePayLink,
    VerifyCheckout,
)

router = APIRouter(tags=["public-payments"])

MAX_WEBHOOK_BYTES = 256 * 1024


@router.post("/api/payments/razorpay/webhook")
async def razorpay_webhook(request: Request, db: Session = Depends(get_db)):
    Body = await request.body()
    if len(Body) > MAX_WEBHOOK_BYTES:
        return JSONResponse(status_code=413, content={"status": "too_large"})
    # The work (database, and a capture call to Razorpay) runs off the event
    # loop, so a slow Razorpay never holds up other requests.
    Status, Content = await run_in_threadpool(
        HandleWebhook,
        db,
        Body=Body,
        Signature=request.headers.get("x-razorpay-signature"),
        EventId=request.headers.get("x-razorpay-event-id"),
    )
    return JSONResponse(status_code=Status, content=Content)


@router.get("/api/pay/{token}")
@limiter.limit("30/minute")
def pay_link_page(request: Request, token: str, db: Session = Depends(get_db)):
    Link = ResolvePayLink(db, token)
    return PublicPayPage(db, Link, CountOpen=request.query_params.get("refresh") != "1")


@router.post("/api/pay/{token}/orders")
@limiter.limit("10/minute")
def pay_link_create_order(request: Request, token: str, payload: OrderCreateRequest, db: Session = Depends(get_db)):
    Link = ResolvePayLink(db, token)
    return CreateOrder(db, StudentId=Link.student_id, InvoiceIds=payload.invoiceIds, Source="PAY_LINK", PayLink=Link, Actor=None)


@router.get("/api/pay/{token}/orders/{order_ref}")
@limiter.limit("60/minute")
def pay_link_order_status(request: Request, token: str, order_ref: str, db: Session = Depends(get_db)):
    Link = ResolvePayLink(db, token)
    return OrderResult(db, PayLinkOrder(db, OrderRef=order_ref, Link=Link))


@router.post("/api/pay/{token}/orders/{order_ref}/verify")
@limiter.limit("20/minute")
def pay_link_verify_order(request: Request, token: str, order_ref: str, payload: OrderVerifyRequest, db: Session = Depends(get_db)):
    Link = ResolvePayLink(db, token)
    Order = PayLinkOrder(db, OrderRef=order_ref, Link=Link)
    return VerifyCheckout(db, Order=Order, RazorpayOrderId=payload.razorpay_order_id, RazorpayPaymentId=payload.razorpay_payment_id, Signature=payload.razorpay_signature)


@router.post("/api/pay/{token}/orders/{order_ref}/events")
@limiter.limit("30/minute")
def pay_link_checkout_event(request: Request, token: str, order_ref: str, payload: CheckoutEventRequest, db: Session = Depends(get_db)):
    Link = ResolvePayLink(db, token)
    Order = PayLinkOrder(db, OrderRef=order_ref, Link=Link)
    return LogCheckoutEvent(db, Order=Order, Type=payload.type, Detail=payload.detail, PaymentId=payload.razorpay_payment_id)


@router.get("/api/pay/{token}/receipts/{payment_id}/pdf")
@limiter.limit("20/minute")
def pay_link_receipt_pdf(request: Request, token: str, payment_id: str, db: Session = Depends(get_db)):
    Link = ResolvePayLink(db, token)
    Payment = PayLinkReceiptForPdf(db, Link=Link, PaymentId=payment_id)
    return PdfResponse(ReceiptPdf(db, Payment), f"{Payment.receipt_number}.pdf")
