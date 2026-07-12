"""Add gamification_processed_at to assessment_attempts

Revision ID: d4a1b8e6f723
Revises: c2f7a9d3e451
Create Date: 2026-07-13 12:00:01.000000

Tracks whether an assessment attempt's XP + coin award has already run.
Nullable/additive only. Same reasoning as c2f7a9d3e451 (attempts table):
a separate column from notification_processed_at (added in a1e6838c5ea3)
so the two idempotency guards operate independently.

Background: prior to this change, assessment completion never awarded XP
or coins at all -- only competition mock exams did. This migration is
paired with wiring the same duration-based, activity-weighted economy
formula into assessment completion.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4a1b8e6f723'
down_revision: Union[str, Sequence[str], None] = 'c2f7a9d3e451'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'assessment_attempts',
        sa.Column('gamification_processed_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('assessment_attempts', 'gamification_processed_at')
