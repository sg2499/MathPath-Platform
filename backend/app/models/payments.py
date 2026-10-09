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


class ExpenseCategory(Base):
    """What an expense was for (Rent, Salaries, Electricity ...). Phase 4,
    2026-10-08. Switched off, never deleted."""

    __tablename__ = "expense_categories"
    id = Column(String, primary_key=True, default=uuid_str)
    name = Column(String(80), nullable=False)
    name_key = Column(String(80), unique=True, nullable=False)
    display_order = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Expense(Base):
    """Money spent (Phase 4, 2026-10-08), numbered MP-EXP-0001. The category
    name is copied onto the expense, so renaming a category later never
    changes a past expense. Cancelled with a reason, never deleted."""

    __tablename__ = "expenses"
    id = Column(String, primary_key=True, default=uuid_str)
    expense_number = Column(String(40), unique=True, nullable=False)
    expense_date = Column(Date, nullable=False, index=True)
    category_id = Column(String, ForeignKey("expense_categories.id"), nullable=True, index=True)
    category_name = Column(String(80), nullable=False)
    item = Column(String(200), nullable=False)
    vendor = Column(String(150), nullable=True)
    bill_number = Column(String(80), nullable=True)
    details = Column(Text, nullable=True)
    amount_paise = Column(Integer, nullable=False)
    centre_id = Column(String, nullable=True, index=True)
    note = Column(Text, nullable=True)
    # RECORDED | CANCELLED
    status = Column(String(20), nullable=False, default="RECORDED", index=True)
    idempotency_key = Column(String(80), unique=True, nullable=True)
    edited_at = Column(DateTime(timezone=True), nullable=True)
    edited_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    cancel_reason = Column(Text, nullable=True)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ExpenseMethodLine(Base):
    """How an expense was paid (Cash ₹500 + UPI ₹700 ...)."""

    __tablename__ = "expense_method_lines"
    id = Column(String, primary_key=True, default=uuid_str)
    expense_id = Column(String, ForeignKey("expenses.id"), nullable=False, index=True)
    method = Column(String(20), nullable=False)
    amount_paise = Column(Integer, nullable=False)
    reference = Column(String(120), nullable=True)
    line_order = Column(Integer, nullable=False, default=0)


class PaymentOnlineSettings(Base):
    """The two switches for Phase 5 (2026-10-09). One row, id "default".

    student_fees_enabled: students see a Fees tab with their invoices,
    payments and PDFs (and get fee notifications).
    online_payments_enabled: Pay Now on that tab, and parent pay links,
    take money through Razorpay. It only works when the Razorpay keys are
    set on the server and receipt numbering is configured."""

    __tablename__ = "payment_online_settings"
    id = Column(String, primary_key=True, default="default")
    student_fees_enabled = Column(Boolean, default=False, nullable=False)
    online_payments_enabled = Column(Boolean, default=False, nullable=False)
    updated_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PaymentLink(Base):
    """A pay link an admin shares with a parent (Phase 5): anyone holding
    the link sees that student's unpaid invoices and can pay them online.
    One live link per student; it can be revoked, and it expires."""

    __tablename__ = "payment_links"
    id = Column(String, primary_key=True, default=uuid_str)
    token = Column(String(64), unique=True, nullable=False)
    student_id = Column(String, ForeignKey("students.id"), nullable=False, index=True)
    # ACTIVE | REVOKED (an expired link stays ACTIVE with expires_at passed)
    status = Column(String(20), nullable=False, default="ACTIVE", index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    open_count = Column(Integer, nullable=False, default=0)
    last_opened_at = Column(DateTime(timezone=True), nullable=True)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    revoked_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)


class OnlinePaymentOrder(Base):
    """One Razorpay order made by this site (Phase 5). The amount is worked
    out on the server from whole unpaid invoices; the browser never sends
    it. Razorpay events for orders not in this table (the old platform's)
    are ignored.

    status: CREATED (waiting for payment) | FAILED (the last try failed; it
    can still be paid) | PAID (money received and the receipt recorded) |
    ATTENTION (money received but it could not be recorded; "Check with
    Razorpay" in the Online Payments tab tries again)."""

    __tablename__ = "online_payment_orders"
    id = Column(String, primary_key=True, default=uuid_str)
    razorpay_order_id = Column(String(40), unique=True, nullable=False)
    student_id = Column(String, ForeignKey("students.id"), nullable=False, index=True)
    amount_paise = Column(Integer, nullable=False)
    currency = Column(String(3), nullable=False, default="INR")
    # [{"invoiceId", "invoiceNumber", "amountPaise"}], oldest first.
    invoices_json = Column(Text, nullable=False)
    # STUDENT (the student's Fees tab) | PAY_LINK
    source = Column(String(20), nullable=False, default="STUDENT")
    pay_link_id = Column(String, ForeignKey("payment_links.id"), nullable=True, index=True)
    key_mode = Column(String(10), nullable=False, default="TEST")  # TEST | LIVE
    status = Column(String(20), nullable=False, default="CREATED", index=True)
    razorpay_payment_id = Column(String(40), unique=True, nullable=True)
    payment_receipt_id = Column(String, ForeignKey("payment_receipts.id"), nullable=True, index=True)
    method_detail = Column(String(120), nullable=True)
    last_error = Column(Text, nullable=True)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class OnlinePaymentEvent(Base):
    """Everything that happened to an online payment: the checkout pop-up
    closed or failed, the payment verified, each Razorpay webhook, each
    "Check with Razorpay". Kept for "money cut but not showing" questions.
    A webhook's event id is unique, so a webhook sent twice is handled once."""

    __tablename__ = "online_payment_events"
    id = Column(String, primary_key=True, default=uuid_str)
    order_id = Column(String, ForeignKey("online_payment_orders.id"), nullable=True, index=True)
    razorpay_order_id = Column(String(40), nullable=True, index=True)
    razorpay_payment_id = Column(String(40), nullable=True, index=True)
    razorpay_event_id = Column(String(80), unique=True, nullable=True)
    # CHECKOUT | WEBHOOK | VERIFY | ADMIN_CHECK
    source = Column(String(20), nullable=False)
    event_type = Column(String(60), nullable=False)
    detail = Column(Text, nullable=True)
    payload_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)



class PaymentBillingSettings(Base):
    """Monthly billing (revamp R3, 2026-10-09). One row, id "default".

    Which monthly fee item each billing mode is charged (India ₹1,100,
    International ₹2,200, as set in Fee Setup), whether the platform drafts
    the month's invoices by itself on the 1st, and the first month it may do
    that for (the month after automatic drafts were switched on, so an
    already-billed month is never drafted again)."""

    __tablename__ = "payment_billing_settings"
    id = Column(String, primary_key=True, default="default")
    india_fee_item_id = Column(String, ForeignKey("fee_items.id"), nullable=True)
    international_fee_item_id = Column(String, ForeignKey("fee_items.id"), nullable=True)
    auto_drafts_enabled = Column(Boolean, default=False, nullable=False)
    # "YYYY-MM": the first month automatic drafts may be made for.
    auto_from_period = Column(String(7), nullable=True)
    # "YYYY-MM": the last month automatic drafts were made for.
    last_auto_period = Column(String(7), nullable=True)
    last_auto_at = Column(DateTime(timezone=True), nullable=True)
    modes_prefilled = Column(Boolean, default=False, nullable=False)
    updated_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PaymentStudentBilling(Base):
    """A student's billing mode (revamp R3): INDIA or INTERNATIONAL. A
    student with no row is billed as INDIA."""

    __tablename__ = "payment_student_billing"
    student_id = Column(String, ForeignKey("students.id", ondelete="CASCADE"), primary_key=True)
    billing_mode = Column(String(20), nullable=False, default="INDIA")
    updated_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PaymentInvoiceDraft(Base):
    """A monthly-fee invoice waiting to be released (revamp R3).

    No number, not shown to the student, no notification. The fee is not
    stored: it follows the student's billing mode and the fee item's price
    at the moment of release. Release turns it into a real invoice (status
    RELEASED, released_invoice_id); Drop keeps it with a reason (DROPPED)
    and Restore puts it back. One draft per student per month."""

    __tablename__ = "payment_invoice_drafts"
    __table_args__ = (Index("ux_payment_invoice_drafts_student_period", "student_id", "period_key", unique=True),)
    id = Column(String, primary_key=True, default=uuid_str)
    student_id = Column(String, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    billing_month = Column(Integer, nullable=False)
    billing_year = Column(Integer, nullable=False)
    period_key = Column(String(7), nullable=False, index=True)
    # DRAFT | RELEASED | DROPPED
    status = Column(String(20), nullable=False, default="DRAFT", index=True)
    # AUTO (made on the 1st) | ADMIN (Create drafts on the billing screen)
    source = Column(String(20), nullable=False, default="AUTO")
    released_invoice_id = Column(String, ForeignKey("payment_invoices.id"), nullable=True)
    released_at = Column(DateTime(timezone=True), nullable=True)
    released_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    drop_reason = Column(Text, nullable=True)
    dropped_at = Column(DateTime(timezone=True), nullable=True)
    dropped_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PaymentFollowUp(Base):
    """One follow-up entry for a student who owes money (revamp R4,
    2026-10-09): a contact (call, in person, message, other), an in-app
    reminder, or a note. Optionally a promise-to-pay date. Never edited or
    deleted: the follow-up history of a student is these rows in order."""

    __tablename__ = "payment_follow_ups"
    id = Column(String, primary_key=True, default=uuid_str)
    student_id = Column(String, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    # CONTACT | REMINDER | NOTE
    kind = Column(String(20), nullable=False)
    # CALL | IN_PERSON | MESSAGE | OTHER | IN_APP (reminders)
    channel = Column(String(20), nullable=True)
    note = Column(Text, nullable=True)
    promise_date = Column(Date, nullable=True)
    # GENTLE | FIRM | FINAL (reminders)
    template_key = Column(String(20), nullable=True)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_by_name = Column(String(150), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)


class PaymentReminderTemplate(Base):
    """The three reminder messages (revamp R4): GENTLE, FIRM, FINAL. The
    admin edits the wording; {placeholders} are filled per student."""

    __tablename__ = "payment_reminder_templates"
    key = Column(String(20), primary_key=True)
    body = Column(Text, nullable=False)
    updated_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

__all__ = [
    "PaymentOnlineSettings",
    "PaymentLink",
    "OnlinePaymentOrder",
    "OnlinePaymentEvent",
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
    "ExpenseCategory",
    "Expense",
    "ExpenseMethodLine",
    "PaymentDayClose",
    "PaymentBillingSettings",
    "PaymentStudentBilling",
    "PaymentInvoiceDraft",
    "PaymentFollowUp",
    "PaymentReminderTemplate",
]


class PaymentDayClose(Base):
    """The end-of-day cash count (revamp R2, 2026-10-09). One row per day.

    Closing records what the platform expected (every method, plus cash
    received minus cash spent), the cash actually counted, the difference
    and a note, and who closed it. Reopening keeps the row (status REOPENED,
    with the reason); closing again overwrites the figures. Every close and
    reopen is also in payment_audit_log, so the full history is kept.
    `fingerprint` is a hash of the day's payments and expenses at close
    time; if it no longer matches, the day changed after it was closed."""

    __tablename__ = "payment_day_closes"
    id = Column(String, primary_key=True, default=uuid_str)
    close_date = Column(Date, unique=True, nullable=False, index=True)
    # CLOSED | REOPENED
    status = Column(String(20), nullable=False, default="CLOSED")
    expected_json = Column(Text, nullable=False)
    expected_cash_paise = Column(Integer, nullable=False, default=0)
    counted_cash_paise = Column(Integer, nullable=False, default=0)
    difference_paise = Column(Integer, nullable=False, default=0)
    note = Column(Text, nullable=True)
    fingerprint = Column(String(64), nullable=False)
    close_count = Column(Integer, nullable=False, default=1)
    closed_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    closed_by_name = Column(String(150), nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    reopened_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    reopened_by_name = Column(String(150), nullable=True)
    reopened_at = Column(DateTime(timezone=True), nullable=True)
    reopen_reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
