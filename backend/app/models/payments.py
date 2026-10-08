"""Payments -- Phase 1 foundations (2026-10-08, Shailesh).

The fee setup, business details, centres, document numbering and the audit
history every later payments phase builds on. Plan:
`claude/mathpath-payments-build-plan.md` in the project.

Ground rules that every table here follows:
  * Money is stored in whole paise (Integer), never as a float.
  * Nothing is deleted: rows are deactivated, and every change is written to
    payment_audit_log (who, when, before/after, reason).
"""
from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.sql import func

from app.database import Base
from app.models.models import uuid_str


class PaymentCentre(Base):
    """A MathPath centre (Rajarhat, Laketown, Online). Printed on a student's
    invoices and receipts under the business header."""

    __tablename__ = "payment_centres"
    id = Column(String, primary_key=True, default=uuid_str)
    code = Column(String(40), unique=True, nullable=False)
    name = Column(String(120), nullable=False)
    address = Column(Text, nullable=True)
    phone = Column(String(60), nullable=True)
    display_order = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PaymentBusinessProfile(Base):
    """The business details printed at the top of every invoice and receipt.
    One row, id "default"."""

    __tablename__ = "payment_business_profile"
    id = Column(String, primary_key=True, default="default")
    legal_name = Column(String(200), nullable=False)
    brand_name = Column(String(200), nullable=True)
    gstin = Column(String(15), nullable=True)
    pan = Column(String(10), nullable=True)
    registered_address = Column(Text, nullable=True)
    email = Column(String(150), nullable=True)
    phone = Column(String(80), nullable=True)
    logo_url = Column(Text, nullable=True)
    invoice_footer = Column(Text, nullable=True)
    updated_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class FeeItem(Base):
    """One thing a student can be invoiced for (Monthly Fee, Registration
    Charges, IM-3 Content Charges, MathPath Bag ...). Replaces the old
    platform's Groups + Components + Group Maps. Changing an amount never
    changes an invoice already issued: invoices keep their own copy."""

    __tablename__ = "fee_items"
    id = Column(String, primary_key=True, default=uuid_str)
    name = Column(String(150), nullable=False)
    # Lower-cased, single-spaced name: two items can never share a name.
    name_key = Column(String(150), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    amount_paise = Column(Integer, nullable=False)
    gst_included = Column(Boolean, default=True, nullable=False)
    # Basis points: 1800 = 18%. Fixed at 18% today, stored so a later change
    # never needs a schema change.
    gst_rate_bps = Column(Integer, default=1800, nullable=False)
    # MONTHLY (billed for a month and year) or ONE_TIME.
    billing_type = Column(String(20), default="ONE_TIME", nullable=False)
    display_order = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    # JSON list of the old platform's group/component names this item stands
    # for (filled by the migration in Phase 6).
    legacy_names_json = Column(Text, nullable=True)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PaymentNumberSequence(Base):
    """The counter behind invoice (MP-INV-000314) and receipt (MP-MRCPT-631)
    numbers. A number is taken inside the caller's transaction with a row
    lock, so two admins can never get the same one, and a number is never
    reused. `is_configured` stays False until the starting number is set
    (by the migration, or by hand) -- nothing can be numbered before that,
    so new numbers can never collide with the old platform's."""

    __tablename__ = "payment_number_sequences"
    key = Column(String(20), primary_key=True)  # INVOICE | RECEIPT
    prefix = Column(String(20), nullable=False)
    pad_width = Column(Integer, default=0, nullable=False)
    next_number = Column(Integer, default=1, nullable=False)
    last_issued_number = Column(Integer, nullable=True)
    is_configured = Column(Boolean, default=False, nullable=False)
    updated_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PaymentAuditLog(Base):
    """Every create / edit / deactivate / cancel in the payments area."""

    __tablename__ = "payment_audit_log"
    id = Column(String, primary_key=True, default=uuid_str)
    entity_type = Column(String(40), nullable=False, index=True)
    entity_id = Column(String, nullable=False, index=True)
    action = Column(String(40), nullable=False)
    actor_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    actor_name = Column(String(150), nullable=True)
    reason = Column(Text, nullable=True)
    before_json = Column(Text, nullable=True)
    after_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)


class PaymentInvoiceBatch(Base):
    """One press of "Generate Invoices". The idempotency key makes a double
    click or a retried request return the same batch instead of a second set
    of invoices."""

    __tablename__ = "payment_invoice_batches"
    id = Column(String, primary_key=True, default=uuid_str)
    idempotency_key = Column(String(80), unique=True, nullable=False)
    params_json = Column(Text, nullable=True)
    invoice_count = Column(Integer, default=0, nullable=False)
    skipped_count = Column(Integer, default=0, nullable=False)
    total_paise = Column(Integer, default=0, nullable=False)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PaymentInvoice(Base):
    """A tax invoice for one student and one fee item (Phase 2, 2026-10-08).

    Everything printed is copied onto the invoice when it is issued (student
    and parent details, level, centre, business details, price and GST
    split), so a later edit to a price, a student or the business details
    never changes an invoice already issued."""

    __tablename__ = "payment_invoices"
    id = Column(String, primary_key=True, default=uuid_str)
    invoice_number = Column(String(40), unique=True, nullable=False)
    student_id = Column(String, ForeignKey("students.id"), nullable=False, index=True)
    fee_item_id = Column(String, ForeignKey("fee_items.id"), nullable=True, index=True)
    batch_id = Column(String, ForeignKey("payment_invoice_batches.id"), nullable=True, index=True)
    fee_name = Column(String(150), nullable=False)
    billing_type = Column(String(20), nullable=False, default="ONE_TIME")
    billing_month = Column(Integer, nullable=True)
    billing_year = Column(Integer, nullable=True)
    # "2026-11" for a monthly fee, NULL for a one-time item. Together with the
    # partial unique index below, a student can never hold two live invoices
    # for the same monthly fee and month.
    period_key = Column(String(7), nullable=True)
    description = Column(Text, nullable=False)
    invoice_date = Column(Date, nullable=False, index=True)
    due_date = Column(Date, nullable=True, index=True)
    amount_paise = Column(Integer, nullable=False)
    taxable_paise = Column(Integer, nullable=False)
    cgst_paise = Column(Integer, nullable=False, default=0)
    sgst_paise = Column(Integer, nullable=False, default=0)
    gst_rate_bps = Column(Integer, nullable=False, default=1800)
    gst_included = Column(Boolean, nullable=False, default=True)
    # Filled by payments (Phase 3): the sum of the live allocations' money and
    # discount. paid_paise + discount_paise is never more than amount_paise.
    paid_paise = Column(Integer, nullable=False, default=0)
    discount_paise = Column(Integer, nullable=False, default=0, server_default="0")
    # PENDING | PART_PAID | PAID | CANCELLED
    status = Column(String(20), nullable=False, default="PENDING", index=True)
    level_code = Column(String(40), nullable=True)
    centre_id = Column(String, nullable=True, index=True)
    snapshot_json = Column(Text, nullable=False)
    source = Column(String(20), nullable=False, default="ADMIN")
    legacy_id = Column(String(80), nullable=True, index=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    cancel_reason = Column(Text, nullable=True)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index(
            "uq_payment_invoices_live_monthly",
            "student_id",
            "fee_item_id",
            "period_key",
            unique=True,
            postgresql_where=text("status <> 'CANCELLED' AND period_key IS NOT NULL"),
            sqlite_where=text("status <> 'CANCELLED' AND period_key IS NOT NULL"),
        ),
    )


class PaymentReceipt(Base):
    """A payment received from a student (Phase 3, 2026-10-08), with its
    money receipt number (MP-MRCPT-631).

    amount_paise is the money received (the sum of the method lines). Money
    not applied to an invoice is the student's advance: it is the payment's
    amount minus its live allocations, and is applied to later invoices.
    Nothing is deleted: a cancelled payment stays, marked Cancelled."""

    __tablename__ = "payment_receipts"
    id = Column(String, primary_key=True, default=uuid_str)
    receipt_number = Column(String(40), unique=True, nullable=False)
    student_id = Column(String, ForeignKey("students.id"), nullable=False, index=True)
    payment_date = Column(Date, nullable=False, index=True)
    pay_by = Column(String(150), nullable=True)
    received_by_user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    received_by_name = Column(String(150), nullable=True)
    amount_paise = Column(Integer, nullable=False)
    discount_paise = Column(Integer, nullable=False, default=0)
    discount_reason = Column(Text, nullable=True)
    note = Column(Text, nullable=True)
    # COUNTER (recorded by an admin) | ONLINE (Razorpay, Phase 5)
    channel = Column(String(20), nullable=False, default="COUNTER")
    # RECORDED | CANCELLED
    status = Column(String(20), nullable=False, default="RECORDED", index=True)
    centre_id = Column(String, nullable=True, index=True)
    snapshot_json = Column(Text, nullable=False)
    idempotency_key = Column(String(80), unique=True, nullable=True)
    source = Column(String(20), nullable=False, default="ADMIN")
    legacy_id = Column(String(80), nullable=True, index=True)
    edited_at = Column(DateTime(timezone=True), nullable=True)
    edited_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    cancel_reason = Column(Text, nullable=True)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PaymentAllocation(Base):
    """How much of a payment (and of its discount) went to one invoice.

    kind DIRECT: chosen when the payment was recorded or edited.
    kind ADVANCE: the payment's advance applied to a later invoice.
    A released allocation (payment edited or cancelled, invoice cancelled)
    stays for the record and no longer counts."""

    __tablename__ = "payment_allocations"
    id = Column(String, primary_key=True, default=uuid_str)
    payment_id = Column(String, ForeignKey("payment_receipts.id"), nullable=False, index=True)
    invoice_id = Column(String, ForeignKey("payment_invoices.id"), nullable=False, index=True)
    amount_paise = Column(Integer, nullable=False, default=0)
    discount_paise = Column(Integer, nullable=False, default=0)
    kind = Column(String(20), nullable=False, default="DIRECT")
    released_at = Column(DateTime(timezone=True), nullable=True)
    release_reason = Column(String(200), nullable=True)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PaymentMethodLine(Base):
    """One way the money came in (Cash ₹500 + UPI ₹600 ref 4312...)."""

    __tablename__ = "payment_method_lines"
    id = Column(String, primary_key=True, default=uuid_str)
    payment_id = Column(String, ForeignKey("payment_receipts.id"), nullable=False, index=True)
    # CASH | UPI | CHEQUE | NET_BANKING | CREDIT_CARD | DEBIT_CARD | RAZORPAY | OTHERS
    method = Column(String(20), nullable=False)
    amount_paise = Column(Integer, nullable=False)
    reference = Column(String(120), nullable=True)
    line_order = Column(Integer, nullable=False, default=0)


__all__ = [
    "PaymentCentre",
    "PaymentBusinessProfile",
    "FeeItem",
    "PaymentNumberSequence",
    "PaymentAuditLog",
    "PaymentInvoiceBatch",
    "PaymentInvoice",
    "PaymentReceipt",
    "PaymentAllocation",
    "PaymentMethodLine",
]
