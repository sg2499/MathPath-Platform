"""Billing Release 1: tuition rates by admission date, one monthly fee a month

Revision ID: d2e6a8c4f1b9
Revises: c9d4e7f1a2b5
Create Date: 2026-11-26 20:30:00.000000

2026-11-26 (Shailesh): students admitted before 1 Dec 2026 keep ₹1,100 a month
(International ₹2,200); students admitted from then pay ₹1,200 (₹2,400).
Adds the two new-rate fee columns, the cut-off date and a student's rate
group, and the rule of one live monthly invoice per student per month,
whichever monthly fee item it is. Production does the same at startup
(ensure_billing_rates_columns); this does it for an Alembic-managed database.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d2e6a8c4f1b9"
down_revision: Union[str, Sequence[str], None] = "c9d4e7f1a2b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

LIVE_MONTH = "billing_type = 'MONTHLY' AND status <> 'CANCELLED' AND period_key IS NOT NULL"


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    if "payment_billing_settings" in tables:
        existing = {column["name"] for column in inspector.get_columns("payment_billing_settings")}
        for name, column in (
            ("india_new_fee_item_id", sa.Column("india_new_fee_item_id", sa.String(), nullable=True)),
            ("international_new_fee_item_id", sa.Column("international_new_fee_item_id", sa.String(), nullable=True)),
            ("new_rate_from", sa.Column("new_rate_from", sa.String(10), nullable=True)),
            ("new_rates_seeded", sa.Column("new_rates_seeded", sa.Boolean(), nullable=False, server_default=sa.false())),
        ):
            if name not in existing:
                op.add_column("payment_billing_settings", column)
    if "payment_student_billing" in tables:
        existing = {column["name"] for column in inspector.get_columns("payment_student_billing")}
        if "rate_group" not in existing:
            op.add_column("payment_student_billing", sa.Column("rate_group", sa.String(20), nullable=True))
    if "payment_invoices" in tables:
        indexes = {index["name"] for index in inspector.get_indexes("payment_invoices")}
        if "uq_payment_invoices_live_month" not in indexes:
            op.create_index(
                "uq_payment_invoices_live_month",
                "payment_invoices",
                ["student_id", "period_key"],
                unique=True,
                postgresql_where=sa.text(LIVE_MONTH),
                sqlite_where=sa.text(LIVE_MONTH),
            )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    if "payment_invoices" in tables:
        indexes = {index["name"] for index in inspector.get_indexes("payment_invoices")}
        if "uq_payment_invoices_live_month" in indexes:
            op.drop_index("uq_payment_invoices_live_month", table_name="payment_invoices")
    if "payment_student_billing" in tables:
        existing = {column["name"] for column in inspector.get_columns("payment_student_billing")}
        if "rate_group" in existing:
            op.drop_column("payment_student_billing", "rate_group")
    if "payment_billing_settings" in tables:
        existing = {column["name"] for column in inspector.get_columns("payment_billing_settings")}
        for name in ("new_rates_seeded", "new_rate_from", "international_new_fee_item_id", "india_new_fee_item_id"):
            if name in existing:
                op.drop_column("payment_billing_settings", name)
