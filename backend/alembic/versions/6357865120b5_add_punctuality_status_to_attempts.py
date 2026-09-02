"""Add punctuality_status to attempts

Revision ID: 6357865120b5
Revises: 621d91efe76f
Create Date: 2026-09-02 12:00:00.000000

Tracks whether a DPS practice attempt was completed on the exact IST
calendar day its scheduled Assignment unlocked ('ON_TIME'), a later day
('LATE'), or wasn't a live question at all ('NOT_SCHEDULED' -- a one-off,
non-scheduled DPS assignment, a reattempt, or no assignment/start_time on
record). Computed once, in attempt_service.py's submit_attempt(), at the
same time accuracy_percentage is finalized, and read from here by both
EconomyService.evaluate_activity_performance() (the DPS punctuality XP/coin
bonus) and leaderboard_service.py's _dps_pooled_query() (the DPS
leaderboard's Punctuality % column) -- one stored fact, never recomputed
differently in two places. Nullable/additive only; existing rows backfill
to NOT_SCHEDULED, which is the correct, harmless answer for every DPS
attempt that predates this feature (none of them have a comparable
"unlock day" concept to have been on time against anyway).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6357865120b5'
down_revision: Union[str, Sequence[str], None] = '621d91efe76f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'attempts',
        sa.Column('punctuality_status', sa.String(length=20), nullable=True, server_default='NOT_SCHEDULED'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('attempts', 'punctuality_status')
