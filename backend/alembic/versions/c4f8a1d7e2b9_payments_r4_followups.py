"""Payments revamp R4: follow-ups (payment_follow_ups, payment_reminder_templates)

Revision ID: c4f8a1d7e2b9
Revises: b7e2f4a9c3d6
Create Date: 2026-10-09 19:15:00.000000

2026-10-09 (Shailesh, Payments revamp R4). Production creates the tables at
startup (Base.metadata.create_all); this does the same for an
Alembic-managed database. Each step is skipped when the table exists.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4f8a1d7e2b9"
down_revision: Union[str, Sequence[str], None] = "b7e2f4a9c3d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "payment_follow_ups" not in tables:
        op.create_table(
            "payment_follow_ups",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("student_id", sa.String(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
            sa.Column("kind", sa.String(20), nullable=False),
            sa.Column("channel", sa.String(20), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("promise_date", sa.Date(), nullable=True),
            sa.Column("template_key", sa.String(20), nullable=True),
            sa.Column("created_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_by_name", sa.String(150), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_payment_follow_ups_student_id", "payment_follow_ups", ["student_id"])
        op.create_index("ix_payment_follow_ups_created_at", "payment_follow_ups", ["created_at"])
    if "payment_reminder_templates" not in tables:
        op.create_table(
            "payment_reminder_templates",
            sa.Column("key", sa.String(20), primary_key=True),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("updated_by_user_id", sa.String(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )


def downgrade() -> None:
    op.drop_table("payment_reminder_templates")
    op.drop_table("payment_follow_ups")
