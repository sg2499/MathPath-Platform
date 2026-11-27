"""Billing Release 2: invoice lines, prices from a date, stock, book queue

Revision ID: e7a1c3f5b2d8
Revises: d2e6a8c4f1b9
Create Date: 2026-11-27 12:00:00.000000

2026-11-27 (Shailesh): invoices with several lines (admission package, sales
with quantities and discounts), fee items as articles (code, kind, stock,
book level, kit), prices that change from a chosen date, stock per centre
with every movement kept, and the queue of next-level book invoices.
Production does the same at startup (create_all and
ensure_billing_release2_columns); this does it for an Alembic-managed
database.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e7a1c3f5b2d8"
down_revision: Union[str, Sequence[str], None] = "d2e6a8c4f1b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

LIVE_SOURCE = "status <> 'CANCELLED' AND source_key IS NOT NULL"

COLUMNS = {
    "fee_items": [
        sa.Column("sku", sa.String(40), nullable=True),
        sa.Column("article_kind", sa.String(20), nullable=True),
        sa.Column("is_stock", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("level_code", sa.String(40), nullable=True),
        sa.Column("unit", sa.String(20), nullable=True),
        sa.Column("cost_paise", sa.Integer(), nullable=True),
        sa.Column("in_kit", sa.Boolean(), nullable=False, server_default=sa.false()),
    ],
    "payment_centres": [
        sa.Column("holds_stock", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("stock_from_centre_id", sa.String(), nullable=True),
    ],
    "payment_invoices": [
        sa.Column("invoice_type", sa.String(20), nullable=True),
        sa.Column("gross_paise", sa.Integer(), nullable=True),
        sa.Column("invoice_discount_paise", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("invoice_discount_type", sa.String(10), nullable=True),
        sa.Column("invoice_discount_value", sa.Integer(), nullable=True),
        sa.Column("invoice_discount_reason", sa.Text(), nullable=True),
        sa.Column("discount_approved_by_user_id", sa.String(), nullable=True),
        sa.Column("discount_approved_by_name", sa.String(150), nullable=True),
        sa.Column("source_key", sa.String(120), nullable=True),
        sa.Column("parent_invoice_id", sa.String(), nullable=True),
        sa.Column("stock_centre_id", sa.String(), nullable=True),
        sa.Column("line_count", sa.Integer(), nullable=False, server_default="1"),
    ],
}


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    for table, columns in COLUMNS.items():
        if table not in tables:
            continue
        existing = {column["name"] for column in inspector.get_columns(table)}
        for column in columns:
            if column.name not in existing:
                op.add_column(table, column)
    if "payment_invoices" in tables:
        indexes = {index["name"] for index in inspector.get_indexes("payment_invoices")}
        if "uq_payment_invoices_live_source" not in indexes:
            op.create_index("uq_payment_invoices_live_source", "payment_invoices", ["source_key"], unique=True,
                            postgresql_where=sa.text(LIVE_SOURCE), sqlite_where=sa.text(LIVE_SOURCE))
        if "ix_payment_invoices_invoice_type" not in indexes:
            op.create_index("ix_payment_invoices_invoice_type", "payment_invoices", ["invoice_type"])
        if "ix_payment_invoices_parent_invoice_id" not in indexes:
            op.create_index("ix_payment_invoices_parent_invoice_id", "payment_invoices", ["parent_invoice_id"])

    if "payment_invoice_lines" not in tables:
        op.create_table(
            "payment_invoice_lines",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("invoice_id", sa.String(), sa.ForeignKey("payment_invoices.id"), nullable=False, index=True),
            sa.Column("line_no", sa.Integer(), nullable=False),
            sa.Column("fee_item_id", sa.String(), sa.ForeignKey("fee_items.id"), nullable=True, index=True),
            sa.Column("name", sa.String(150), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("article_kind", sa.String(20), nullable=True),
            sa.Column("quantity", sa.Integer(), nullable=False),
            sa.Column("unit_paise", sa.Integer(), nullable=False),
            sa.Column("gross_paise", sa.Integer(), nullable=False),
            sa.Column("discount_type", sa.String(10), nullable=True),
            sa.Column("discount_value", sa.Integer(), nullable=True),
            sa.Column("discount_paise", sa.Integer(), nullable=False),
            sa.Column("net_paise", sa.Integer(), nullable=False),
            sa.Column("invoice_discount_share_paise", sa.Integer(), nullable=False),
            sa.Column("final_paise", sa.Integer(), nullable=False),
            sa.Column("gst_included", sa.Boolean(), nullable=False),
            sa.Column("gst_rate_bps", sa.Integer(), nullable=False),
            sa.Column("is_stock", sa.Boolean(), nullable=False),
            sa.Column("is_kit", sa.Boolean(), nullable=False),
            sa.Column("period_key", sa.String(7), nullable=True),
            sa.Column("stock_centre_id", sa.String(), nullable=True),
            sa.Column("handed_over_on", sa.Date(), nullable=True),
            sa.Column("handed_over_by_user_id", sa.String(), nullable=True),
            sa.Column("handed_over_by_name", sa.String(150), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    if "fee_item_prices" not in tables:
        op.create_table(
            "fee_item_prices",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("fee_item_id", sa.String(), sa.ForeignKey("fee_items.id"), nullable=False, index=True),
            sa.Column("amount_paise", sa.Integer(), nullable=False),
            sa.Column("effective_from", sa.Date(), nullable=False),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    if "inventory_settings" not in tables:
        op.create_table(
            "inventory_settings",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("stock_tracking_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("tracking_started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("low_stock_threshold", sa.Integer(), nullable=False, server_default="5"),
            sa.Column("default_stock_centre_id", sa.String(), nullable=True),
            sa.Column("auto_book_invoices", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("articles_seeded", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("updated_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    if "stock_balances" not in tables:
        op.create_table(
            "stock_balances",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("fee_item_id", sa.String(), sa.ForeignKey("fee_items.id"), nullable=False, index=True),
            sa.Column("centre_id", sa.String(), nullable=False, index=True),
            sa.Column("quantity", sa.Integer(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ux_stock_balances_item_centre", "stock_balances", ["fee_item_id", "centre_id"], unique=True)
    if "stock_movements" not in tables:
        op.create_table(
            "stock_movements",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("fee_item_id", sa.String(), sa.ForeignKey("fee_items.id"), nullable=False, index=True),
            sa.Column("centre_id", sa.String(), nullable=False, index=True),
            sa.Column("movement_type", sa.String(20), nullable=False, index=True),
            sa.Column("quantity", sa.Integer(), nullable=False),
            sa.Column("balance_after", sa.Integer(), nullable=False),
            sa.Column("movement_date", sa.Date(), nullable=False, index=True),
            sa.Column("unit_cost_paise", sa.Integer(), nullable=True),
            sa.Column("supplier", sa.String(150), nullable=True),
            sa.Column("bill_number", sa.String(80), nullable=True),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.Column("invoice_id", sa.String(), nullable=True, index=True),
            sa.Column("invoice_line_id", sa.String(), nullable=True),
            sa.Column("student_id", sa.String(), nullable=True, index=True),
            sa.Column("transfer_id", sa.String(), nullable=True),
            sa.Column("actor_user_id", sa.String(), nullable=True),
            sa.Column("actor_name", sa.String(150), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        )
    if "book_invoice_tasks" not in tables:
        op.create_table(
            "book_invoice_tasks",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("student_id", sa.String(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("cleared_level_id", sa.String(), nullable=True),
            sa.Column("target_level_id", sa.String(), nullable=False),
            sa.Column("target_level_code", sa.String(40), nullable=True),
            sa.Column("assessment_attempt_id", sa.String(), nullable=True),
            sa.Column("fee_item_id", sa.String(), nullable=True),
            sa.Column("status", sa.String(20), nullable=False, index=True),
            sa.Column("invoice_id", sa.String(), nullable=True),
            sa.Column("last_error", sa.Text(), nullable=True),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("skip_reason", sa.Text(), nullable=True),
            sa.Column("resolved_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ux_book_invoice_tasks_student_level", "book_invoice_tasks", ["student_id", "target_level_id"], unique=True)


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    for table in ("book_invoice_tasks", "stock_movements", "stock_balances", "inventory_settings", "fee_item_prices", "payment_invoice_lines"):
        if table in tables:
            op.drop_table(table)
    if "payment_invoices" in tables:
        indexes = {index["name"] for index in inspector.get_indexes("payment_invoices")}
        for name in ("uq_payment_invoices_live_source", "ix_payment_invoices_invoice_type", "ix_payment_invoices_parent_invoice_id"):
            if name in indexes:
                op.drop_index(name, table_name="payment_invoices")
    for table, columns in COLUMNS.items():
        if table not in tables:
            continue
        existing = {column["name"] for column in inspector.get_columns(table)}
        for column in reversed(columns):
            if column.name in existing:
                op.drop_column(table, column.name)
