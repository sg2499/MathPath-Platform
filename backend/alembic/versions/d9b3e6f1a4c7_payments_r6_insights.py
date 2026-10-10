"""Payments revamp R6: insights (payment_insight_settings, payment_insight_reviews)

Revision ID: d9b3e6f1a4c7
Revises: c4f8a1d7e2b9
Create Date: 2026-10-09 20:30:00.000000

2026-10-09 (Shailesh, Payments revamp R6). Production creates the tables at
startup (Base.metadata.create_all); this does the same for an
Alembic-managed database. Each step is skipped when the table exists.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d9b3e6f1a4c7"
down_revision: Union[str, Sequence[str], None] = "c4f8a1d7e2b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "payment_insight_settings" not in tables:
        op.create_table(
            "payment_insight_settings",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("discount_amount_paise", sa.Integer(), nullable=False, server_default="50000"),
            sa.Column("discount_percent", sa.Integer(), nullable=False, server_default="20"),
            sa.Column("cancellations_per_day", sa.Integer(), nullable=False, server_default="3"),
            sa.Column("backdated_days", sa.Integer(), nullable=False, server_default="7"),
            sa.Column("updated_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    if "payment_insight_reviews" not in tables:
        op.create_table(
            "payment_insight_reviews",
            sa.Column("key", sa.String(200), primary_key=True),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("reviewed_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("reviewed_by_name", sa.String(150), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )


def downgrade() -> None:
    op.drop_table("payment_insight_reviews")
    op.drop_table("payment_insight_settings")
