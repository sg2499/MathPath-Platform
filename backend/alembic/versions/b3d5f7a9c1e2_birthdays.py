"""Birthdays: the wish set and each student's yearly greeting

Revision ID: b3d5f7a9c1e2
Revises: f1a2c3d4e5b6
Create Date: 2026-10-18 13:30:00.000000

2026-10-18 (Shailesh): replaces the old portal's Birthday Students page.
birthday_wishes holds the warm wishes (seeded at startup, then edited by
admins); birthday_greetings keeps one row per student per year with the
wish as the student read it. Production creates both at startup
(Base.metadata.create_all); this does the same for an Alembic-managed
database.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b3d5f7a9c1e2"
down_revision: Union[str, Sequence[str], None] = "f1a2c3d4e5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "birthday_wishes" not in tables:
        op.create_table(
            "birthday_wishes",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("seed_key", sa.String(length=40), nullable=True, unique=True),
            sa.Column("text", sa.Text(), nullable=False),
            sa.Column("style", sa.String(length=20), nullable=False),
            sa.Column("age_band", sa.String(length=20), nullable=False),
            sa.Column("needs_level", sa.Boolean(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_by_user_id", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        )
    if "birthday_greetings" not in tables:
        op.create_table(
            "birthday_greetings",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("student_id", sa.String(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
            sa.Column("year", sa.Integer(), nullable=False),
            sa.Column("birthday_date", sa.Date(), nullable=False),
            sa.Column("wish_id", sa.String(), sa.ForeignKey("birthday_wishes.id", ondelete="SET NULL"), nullable=True),
            sa.Column("rendered_text", sa.Text(), nullable=False),
            sa.Column("age", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("notified_student_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("notified_teacher_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("seen_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("dismissed_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint("student_id", "year", name="uq_birthday_greeting_student_year"),
        )
        op.create_index("ix_birthday_greetings_student_id", "birthday_greetings", ["student_id"])
        op.create_index("ix_birthday_greetings_birthday_date", "birthday_greetings", ["birthday_date"])
        op.create_index("ix_birthday_greetings_wish_id", "birthday_greetings", ["wish_id"])


def downgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "birthday_greetings" in tables:
        op.drop_table("birthday_greetings")
    if "birthday_wishes" in tables:
        op.drop_table("birthday_wishes")
