"""Payments Phase 5: online payment switches, pay links, Razorpay orders and events

Revision ID: f6c1d8a3b5e2
Revises: e3b8f2a6c9d1
Create Date: 2026-10-09 13:30:00.000000

2026-10-09 (Shailesh, Payments): payment_online_settings, payment_links,
online_payment_orders and online_payment_events. Production creates them at
startup (Base.metadata.create_all); this does the same for an
Alembic-managed database. Every step is skipped when the table already
exists.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f6c1d8a3b5e2"
down_revision: Union[str, Sequence[str], None] = "e3b8f2a6c9d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    tables = _tables()
    if "payment_online_settings" not in tables:
        op.create_table(
            "payment_online_settings",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("student_fees_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("online_payments_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("updated_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    if "payment_links" not in tables:
        op.create_table(
            "payment_links",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("token", sa.String(64), nullable=False, unique=True),
            sa.Column("student_id", sa.String(), sa.ForeignKey("students.id"), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="ACTIVE"),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("open_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("last_opened_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("revoked_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
        )
        op.create_index("ix_payment_links_student_id", "payment_links", ["student_id"])
        op.create_index("ix_payment_links_status", "payment_links", ["status"])
    if "online_payment_orders" not in tables:
        op.create_table(
            "online_payment_orders",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("razorpay_order_id", sa.String(40), nullable=False, unique=True),
            sa.Column("student_id", sa.String(), sa.ForeignKey("students.id"), nullable=False),
            sa.Column("amount_paise", sa.Integer(), nullable=False),
            sa.Column("currency", sa.String(3), nullable=False, server_default="INR"),
            sa.Column("invoices_json", sa.Text(), nullable=False),
            sa.Column("source", sa.String(20), nullable=False, server_default="STUDENT"),
            sa.Column("pay_link_id", sa.String(), sa.ForeignKey("payment_links.id"), nullable=True),
            sa.Column("key_mode", sa.String(10), nullable=False, server_default="TEST"),
            sa.Column("status", sa.String(20), nullable=False, server_default="CREATED"),
            sa.Column("razorpay_payment_id", sa.String(40), nullable=True, unique=True),
            sa.Column("payment_receipt_id", sa.String(), sa.ForeignKey("payment_receipts.id"), nullable=True),
            sa.Column("method_detail", sa.String(120), nullable=True),
            sa.Column("last_error", sa.Text(), nullable=True),
            sa.Column("created_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        for column in ["student_id", "pay_link_id", "status", "payment_receipt_id", "created_at"]:
            op.create_index(f"ix_online_payment_orders_{column}", "online_payment_orders", [column])
    if "online_payment_events" not in tables:
        op.create_table(
            "online_payment_events",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("order_id", sa.String(), sa.ForeignKey("online_payment_orders.id"), nullable=True),
            sa.Column("razorpay_order_id", sa.String(40), nullable=True),
            sa.Column("razorpay_payment_id", sa.String(40), nullable=True),
            sa.Column("razorpay_event_id", sa.String(80), nullable=True, unique=True),
            sa.Column("source", sa.String(20), nullable=False),
            sa.Column("event_type", sa.String(60), nullable=False),
            sa.Column("detail", sa.Text(), nullable=True),
            sa.Column("payload_json", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        for column in ["order_id", "razorpay_order_id", "razorpay_payment_id", "created_at"]:
            op.create_index(f"ix_online_payment_events_{column}", "online_payment_events", [column])


def downgrade() -> None:
    tables = _tables()
    for table in ["online_payment_events", "online_payment_orders", "payment_links", "payment_online_settings"]:
        if table in tables:
            op.drop_table(table)
