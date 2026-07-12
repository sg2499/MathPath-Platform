"""Add notification_processed_at to attempts

Revision ID: bfa28b9fc380
Revises: a1c9de3f7b21
Create Date: 2026-07-13 00:00:00.000000

Tracks whether a practice/DPS attempt's completion notification (and its
retry-assignment notification, if one gets created) has already run.
Nullable/additive only.

Background: same bug class as gamification_processed_at on
competition_mock_attempts (migration a1c9de3f7b21), found during a full
student-portal audit the day after that fix shipped. submit_attempt() in
attempt_service.py grades and completes an attempt from three different
callers -- the explicit /attempts/{id}/submit and /attempts/{id}/auto-submit
routes, and ensure_active_or_auto_submit() (a lazy fallback triggered by a
plain GET once the timer's already expired server-side). The notification
call (NotifyPracticeAttemptSubmitted) only ever lived in the two explicit
route handlers, never inside submit_attempt() itself -- so any attempt
completed via the lazy path got graded correctly but the student, teacher,
and admin were never notified, and a resulting auto-retry assignment (which
DOES get created correctly, since that logic already lives inside
submit_attempt()) never got its own notification either.

This column lets the notification logic move into submit_attempt() itself,
guarded so it runs exactly once, atomically, regardless of which code path
first completes the attempt -- the same fix shape as round 9's mock exam fix.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bfa28b9fc380'
down_revision: Union[str, Sequence[str], None] = 'a1c9de3f7b21'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'attempts',
        sa.Column('notification_processed_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('attempts', 'notification_processed_at')
