"""Assessment assignments: the teacher-set date and time

Revision ID: a7d3e9c1f2b4
Revises: c6e8a0b2d4f1
Create Date: 2026-11-02 13:30:00.000000

2026-11-02 (Shailesh): level assessments follow the Annual Competition's
date-and-time flow. The teacher sets a date and time for each student; the
instructions open 10 minutes before it and Start opens at it. Production adds
the column at startup (ensure_assessment_reattempt_columns); this does the
same for an Alembic-managed database.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7d3e9c1f2b4"
down_revision: Union[str, Sequence[str], None] = "c6e8a0b2d4f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "assessment_assignments" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("assessment_assignments")}
    if "scheduled_start_at" not in existing:
        op.add_column("assessment_assignments", sa.Column("scheduled_start_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "assessment_assignments" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("assessment_assignments")}
    if "scheduled_start_at" in existing:
        op.drop_column("assessment_assignments", "scheduled_start_at")
