"""Add notification_processed_at to assessment_attempts

Revision ID: a1e6838c5ea3
Revises: bfa28b9fc380
Create Date: 2026-07-13 00:00:01.000000

Tracks whether an assessment attempt's completion notification has already
run, and doubles as the idempotency guard for the new lazy-auto-submit
safety net being added to assessment attempts in the same change. Nullable/
additive only.

Background: unlike competition mock attempts and practice/DPS attempts,
assessment attempts had NO server-side fallback at all if the frontend's
timer-driven auto-submit call never reached the server (tab closed right at
time-up, browser crash, network drop, etc.) -- the attempt would simply stay
IN_PROGRESS forever, with no scheduled sweep anywhere to catch it. This
migration is paired with adding the same kind of lazy-completion path
mock/practice attempts already have, gated by this column so it can never
double-process or race with an explicit submit/auto-submit call.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1e6838c5ea3'
down_revision: Union[str, Sequence[str], None] = 'bfa28b9fc380'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'assessment_attempts',
        sa.Column('notification_processed_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('assessment_attempts', 'notification_processed_at')
