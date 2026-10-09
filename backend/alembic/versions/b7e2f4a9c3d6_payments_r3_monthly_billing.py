"""Payments revamp R3: monthly billing (billing settings, student billing modes, invoice drafts)

Revision ID: b7e2f4a9c3d6
Revises: a9d4e7c2b1f3
Create Date: 2026-10-09 18:30:00.000000

2026-10-09 (Shailesh, Payments revamp R3): payment_billing_settings,
payment_student_billing and payment_invoice_drafts. Production creates them
at startup (Base.metadata.create_all); this does the same for an
Alembic-managed database. Each step is skipped when the table exists.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7e2f4a9c3d6"
down_revision: Union[str, Sequence[str], None] = "a9d4e7c2b1f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "payment_billing_settings" not in tables:
        op.create_table(
            "payment_billing_settings",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("india_fee_item_id", sa.String(), sa.ForeignKey("fee_items.id"), nullable=True),
            sa.Column("international_fee_item_id", sa.String(), sa.ForeignKey("fee_items.id"), nullable=True),
            sa.Column("auto_drafts_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("auto_from_period", sa.String(7), nullable=True),
            sa.Column("last_auto_period", sa.String(7), nullable=True),
            sa.Column("last_auto_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("modes_prefilled", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("updated_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    if "payment_student_billing" not in tables:
        op.create_table(
            "payment_student_billing",
            sa.Column("student_id", sa.String(), sa.ForeignKey("students.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("billing_mode", sa.String(20), nullable=False, server_default="INDIA"),
            sa.Column("updated_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    if "payment_invoice_drafts" not in tables:
        op.create_table(
            "payment_invoice_drafts",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("student_id", sa.String(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
            sa.Column("billing_month", sa.Integer(), nullable=False),
            sa.Column("billing_year", sa.Integer(), nullable=False),
            sa.Column("period_key", sa.String(7), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="DRAFT"),
            sa.Column("source", sa.String(20), nullable=False, server_default="AUTO"),
            sa.Column("released_invoice_id", sa.String(), sa.ForeignKey("payment_invoices.id"), nullable=True),
            sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("released_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("drop_reason", sa.Text(), nullable=True),
            sa.Column("dropped_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("dropped_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_payment_invoice_drafts_student_id", "payment_invoice_drafts", ["student_id"])
        op.create_index("ix_payment_invoice_drafts_period_key", "payment_invoice_drafts", ["period_key"])
        op.create_index("ix_payment_invoice_drafts_status", "payment_invoice_drafts", ["status"])
        op.create_index("ux_payment_invoice_drafts_student_period", "payment_invoice_drafts", ["student_id", "period_key"], unique=True)


def downgrade() -> None:
    op.drop_table("payment_invoice_drafts")
    op.drop_table("payment_student_billing")
    op.drop_table("payment_billing_settings")
