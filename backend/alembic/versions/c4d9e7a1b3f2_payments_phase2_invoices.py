"""Payments Phase 2: invoices and invoice batches

Revision ID: c4d9e7a1b3f2
Revises: b8e41c2d7f90
Create Date: 2026-10-08 20:00:00.000000

2026-10-08 (Shailesh, Payments): payment_invoice_batches (one row per press
of Generate Invoices, with its idempotency key) and payment_invoices.
Production creates both at startup (Base.metadata.create_all); this does the
same for an Alembic-managed database. Every step is skipped when the table
already exists. Additive only.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4d9e7a1b3f2"
down_revision: Union[str, Sequence[str], None] = "b8e41c2d7f90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

LIVE_MONTHLY = "status <> 'CANCELLED' AND period_key IS NOT NULL"


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    tables = _tables()
    if "payment_invoice_batches" not in tables:
        op.create_table(
            "payment_invoice_batches",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("idempotency_key", sa.String(80), nullable=False, unique=True),
            sa.Column("params_json", sa.Text(), nullable=True),
            sa.Column("invoice_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("skipped_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("total_paise", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    if "payment_invoices" not in tables:
        op.create_table(
            "payment_invoices",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("invoice_number", sa.String(40), nullable=False, unique=True),
            sa.Column("student_id", sa.String(), sa.ForeignKey("students.id"), nullable=False),
            sa.Column("fee_item_id", sa.String(), sa.ForeignKey("fee_items.id"), nullable=True),
            sa.Column("batch_id", sa.String(), sa.ForeignKey("payment_invoice_batches.id"), nullable=True),
            sa.Column("fee_name", sa.String(150), nullable=False),
            sa.Column("billing_type", sa.String(20), nullable=False, server_default="ONE_TIME"),
            sa.Column("billing_month", sa.Integer(), nullable=True),
            sa.Column("billing_year", sa.Integer(), nullable=True),
            sa.Column("period_key", sa.String(7), nullable=True),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("invoice_date", sa.Date(), nullable=False),
            sa.Column("due_date", sa.Date(), nullable=True),
            sa.Column("amount_paise", sa.Integer(), nullable=False),
            sa.Column("taxable_paise", sa.Integer(), nullable=False),
            sa.Column("cgst_paise", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("sgst_paise", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("gst_rate_bps", sa.Integer(), nullable=False, server_default="1800"),
            sa.Column("gst_included", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("paid_paise", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
            sa.Column("level_code", sa.String(40), nullable=True),
            sa.Column("centre_id", sa.String(), nullable=True),
            sa.Column("snapshot_json", sa.Text(), nullable=False),
            sa.Column("source", sa.String(20), nullable=False, server_default="ADMIN"),
            sa.Column("legacy_id", sa.String(80), nullable=True),
            sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("cancelled_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("cancel_reason", sa.Text(), nullable=True),
            sa.Column("created_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        for column in ["student_id", "fee_item_id", "batch_id", "invoice_date", "due_date", "status", "centre_id", "legacy_id"]:
            op.create_index(f"ix_payment_invoices_{column}", "payment_invoices", [column])
        op.create_index(
            "uq_payment_invoices_live_monthly",
            "payment_invoices",
            ["student_id", "fee_item_id", "period_key"],
            unique=True,
            postgresql_where=sa.text(LIVE_MONTHLY),
            sqlite_where=sa.text(LIVE_MONTHLY),
        )


def downgrade() -> None:
    tables = _tables()
    for table in ["payment_invoices", "payment_invoice_batches"]:
        if table in tables:
            op.drop_table(table)
