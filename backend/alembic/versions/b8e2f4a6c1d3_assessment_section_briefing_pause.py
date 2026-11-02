"""Assessment attempts: section-slide pauses

Revision ID: b8e2f4a6c1d3
Revises: a7d3e9c1f2b4
Create Date: 2026-11-02 16:00:00.000000

2026-11-02 (Shailesh): the upcoming-section slide pauses the assessment's
overall timer. Each section's pause is recorded once and credited by moving
expires_at on. Production adds the column at startup
(ensure_assessment_attempt_gamification_processed_column); this does the same
for an Alembic-managed database.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b8e2f4a6c1d3"
down_revision: Union[str, Sequence[str], None] = "a7d3e9c1f2b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "assessment_attempts" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("assessment_attempts")}
    if "section_briefings_json" not in existing:
        op.add_column("assessment_attempts", sa.Column("section_briefings_json", sa.Text(), nullable=True))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "assessment_attempts" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("assessment_attempts")}
    if "section_briefings_json" in existing:
        op.drop_column("assessment_attempts", "section_briefings_json")
