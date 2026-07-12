"""Add gamification_processed_at to attempts

Revision ID: c2f7a9d3e451
Revises: a1e6838c5ea3
Create Date: 2026-07-13 12:00:00.000000

Tracks whether a practice/DPS attempt's XP + coin award has already run.
Nullable/additive only. Separate column from notification_processed_at
(added in bfa28b9fc380) so the notification claim and the gamification
claim can never interfere with or block each other -- an attempt can have
its notification sent and its economy award processed independently, each
exactly once, regardless of which code path first completes the attempt
(manual submit, explicit auto-submit, or the lazy GET-triggered fallback).

Background: prior to this change, practice/DPS attempt completion never
awarded XP or coins at all -- EconomyService.award_xp_and_coins() was only
ever called from the competition mock exam completion path. This migration
is paired with wiring the same (now duration-based, activity-weighted)
economy formula into practice/DPS completion so all three activity types
-- DPS sheets, assessments, and mock exams -- earn XP and coins under one
consistent, auditable rule.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c2f7a9d3e451'
down_revision: Union[str, Sequence[str], None] = 'a1e6838c5ea3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'attempts',
        sa.Column('gamification_processed_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('attempts', 'gamification_processed_at')
