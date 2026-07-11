"""Add gamification_processed_at to competition_mock_attempts

Revision ID: a1c9de3f7b21
Revises: f3bf01f94077
Create Date: 2026-07-11 00:00:00.000000

Tracks whether a mock attempt's completion side-effects (student/teacher/
admin notifications, XP + coin award via EconomyService, badge evaluation
via AchievementEngine) have already run. Nullable/additive only.

Background: prior to this change, those side-effects only fired from
SubmitCompetitionMockAttemptForStudent(), but grading itself could also be
triggered from two other, hook-less code paths (a lazy auto-submit on GET
when the timer had already expired server-side, and a defensive summary
repair when viewing results). Once an attempt's status flipped to
completed via either of those paths, the side-effects would never run for
it -- silently costing the student XP, coins, and badges, and skipping the
submission notifications to the student, their teacher, and all admins.

This column lets the grading function guard the side-effects so they run
exactly once, atomically, regardless of which code path first completes
the attempt.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1c9de3f7b21'
down_revision: Union[str, Sequence[str], None] = 'f3bf01f94077'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'competition_mock_attempts',
        sa.Column('gamification_processed_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('competition_mock_attempts', 'gamification_processed_at')
