"""Payments revamp R2: payment_day_closes (end-of-day cash count)

Revision ID: a9d4e7c2b1f3
Revises: f6c1d8a3b5e2
Create Date: 2026-10-09 17:30:00.000000

2026-10-09 (Shailesh, Payments revamp R2): one row per closed day. Production
creates it at startup (Base.metadata.create_all); this does the same for an
Alembic-managed database and is skipped when the table already exists.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a9d4e7c2b1f3"
down_revision: Union[str, Sequence[str], None] = "f6c1d8a3b5e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if "payment_day_closes" in set(sa.inspect(op.get_bind()).get_table_names()):
        return
    op.create_table(
        "payment_day_closes",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("close_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="CLOSED"),
        sa.Column("expected_json", sa.Text(), nullable=False),
        sa.Column("expected_cash_paise", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("counted_cash_paise", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("difference_paise", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("close_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("closed_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("closed_by_name", sa.String(150), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reopened_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reopened_by_name", sa.String(150), nullable=True),
        sa.Column("reopened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reopen_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_payment_day_closes_close_date", "payment_day_closes", ["close_date"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_payment_day_closes_close_date", table_name="payment_day_closes")
    op.drop_table("payment_day_closes")
