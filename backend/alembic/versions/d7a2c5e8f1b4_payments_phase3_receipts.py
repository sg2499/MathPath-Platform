"""Payments Phase 3: payments, allocations, method lines; invoice discount

Revision ID: d7a2c5e8f1b4
Revises: c4d9e7a1b3f2
Create Date: 2026-10-08 21:00:00.000000

2026-10-08 (Shailesh, Payments): payment_receipts, payment_allocations,
payment_method_lines and payment_invoices.discount_paise. Production creates
the tables at startup (Base.metadata.create_all) and adds the column in
schema_migration.ensure_payments_foundation; this does the same for an
Alembic-managed database. Every step is skipped when already there.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d7a2c5e8f1b4"
down_revision: Union[str, Sequence[str], None] = "c4d9e7a1b3f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("payment_invoices")}
    if "discount_paise" not in columns:
        op.add_column("payment_invoices", sa.Column("discount_paise", sa.Integer(), nullable=False, server_default="0"))
    tables = _tables()
    if "payment_receipts" not in tables:
        op.create_table(
            "payment_receipts",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("receipt_number", sa.String(40), nullable=False, unique=True),
            sa.Column("student_id", sa.String(), sa.ForeignKey("students.id"), nullable=False),
            sa.Column("payment_date", sa.Date(), nullable=False),
            sa.Column("pay_by", sa.String(150), nullable=True),
            sa.Column("received_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("received_by_name", sa.String(150), nullable=True),
            sa.Column("amount_paise", sa.Integer(), nullable=False),
            sa.Column("discount_paise", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("discount_reason", sa.Text(), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("channel", sa.String(20), nullable=False, server_default="COUNTER"),
            sa.Column("status", sa.String(20), nullable=False, server_default="RECORDED"),
            sa.Column("centre_id", sa.String(), nullable=True),
            sa.Column("snapshot_json", sa.Text(), nullable=False),
            sa.Column("idempotency_key", sa.String(80), nullable=True, unique=True),
            sa.Column("source", sa.String(20), nullable=False, server_default="ADMIN"),
            sa.Column("legacy_id", sa.String(80), nullable=True),
            sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("edited_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("cancelled_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("cancel_reason", sa.Text(), nullable=True),
            sa.Column("created_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        for column in ["student_id", "payment_date", "received_by_user_id", "status", "centre_id", "legacy_id"]:
            op.create_index(f"ix_payment_receipts_{column}", "payment_receipts", [column])
    if "payment_allocations" not in tables:
        op.create_table(
            "payment_allocations",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("payment_id", sa.String(), sa.ForeignKey("payment_receipts.id"), nullable=False),
            sa.Column("invoice_id", sa.String(), sa.ForeignKey("payment_invoices.id"), nullable=False),
            sa.Column("amount_paise", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("discount_paise", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("kind", sa.String(20), nullable=False, server_default="DIRECT"),
            sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("release_reason", sa.String(200), nullable=True),
            sa.Column("created_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_payment_allocations_payment_id", "payment_allocations", ["payment_id"])
        op.create_index("ix_payment_allocations_invoice_id", "payment_allocations", ["invoice_id"])
    if "payment_method_lines" not in tables:
        op.create_table(
            "payment_method_lines",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("payment_id", sa.String(), sa.ForeignKey("payment_receipts.id"), nullable=False),
            sa.Column("method", sa.String(20), nullable=False),
            sa.Column("amount_paise", sa.Integer(), nullable=False),
            sa.Column("reference", sa.String(120), nullable=True),
            sa.Column("line_order", sa.Integer(), nullable=False, server_default="0"),
        )
        op.create_index("ix_payment_method_lines_payment_id", "payment_method_lines", ["payment_id"])


def downgrade() -> None:
    tables = _tables()
    for table in ["payment_method_lines", "payment_allocations", "payment_receipts"]:
        if table in tables:
            op.drop_table(table)
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("payment_invoices")}
    if "discount_paise" in columns:
        op.drop_column("payment_invoices", "discount_paise")
