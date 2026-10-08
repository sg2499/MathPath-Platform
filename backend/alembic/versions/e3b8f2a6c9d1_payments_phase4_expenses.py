"""Payments Phase 4: expenses, expense categories and expense method lines

Revision ID: e3b8f2a6c9d1
Revises: d7a2c5e8f1b4
Create Date: 2026-10-08 23:45:00.000000

2026-10-08 (Shailesh, Payments): expense_categories, expenses and
expense_method_lines. Production creates them at startup
(Base.metadata.create_all); this does the same for an Alembic-managed
database. Every step is skipped when the table already exists.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e3b8f2a6c9d1"
down_revision: Union[str, Sequence[str], None] = "d7a2c5e8f1b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    tables = _tables()
    if "expense_categories" not in tables:
        op.create_table(
            "expense_categories",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("name", sa.String(80), nullable=False),
            sa.Column("name_key", sa.String(80), nullable=False, unique=True),
            sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    if "expenses" not in tables:
        op.create_table(
            "expenses",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("expense_number", sa.String(40), nullable=False, unique=True),
            sa.Column("expense_date", sa.Date(), nullable=False),
            sa.Column("category_id", sa.String(), sa.ForeignKey("expense_categories.id"), nullable=True),
            sa.Column("category_name", sa.String(80), nullable=False),
            sa.Column("item", sa.String(200), nullable=False),
            sa.Column("vendor", sa.String(150), nullable=True),
            sa.Column("bill_number", sa.String(80), nullable=True),
            sa.Column("details", sa.Text(), nullable=True),
            sa.Column("amount_paise", sa.Integer(), nullable=False),
            sa.Column("centre_id", sa.String(), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("status", sa.String(20), nullable=False, server_default="RECORDED"),
            sa.Column("idempotency_key", sa.String(80), nullable=True, unique=True),
            sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("edited_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("cancelled_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("cancel_reason", sa.Text(), nullable=True),
            sa.Column("created_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        for column in ["expense_date", "category_id", "centre_id", "status"]:
            op.create_index(f"ix_expenses_{column}", "expenses", [column])
    if "expense_method_lines" not in tables:
        op.create_table(
            "expense_method_lines",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("expense_id", sa.String(), sa.ForeignKey("expenses.id"), nullable=False),
            sa.Column("method", sa.String(20), nullable=False),
            sa.Column("amount_paise", sa.Integer(), nullable=False),
            sa.Column("reference", sa.String(120), nullable=True),
            sa.Column("line_order", sa.Integer(), nullable=False, server_default="0"),
        )
        op.create_index("ix_expense_method_lines_expense_id", "expense_method_lines", ["expense_id"])


def downgrade() -> None:
    tables = _tables()
    for table in ["expense_method_lines", "expenses", "expense_categories"]:
        if table in tables:
            op.drop_table(table)
