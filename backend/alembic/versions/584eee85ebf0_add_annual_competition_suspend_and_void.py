"""Add Annual Competition event-suspend and result-void columns (Package 10)

Revision ID: 584eee85ebf0
Revises: 7f3c9a1e5d02
Create Date: 2026-09-07 00:00:00.000000

Package 10 (go-live checklist + rollback plan) needed two real, previously
missing admin safety actions before 11 Oct 2026, per Shailesh's explicit
go-ahead: an emergency stop for the whole student-facing attempt flow on
one event, and a way to exclude one specific result from ranking/
visibility/certificates without touching anything else for that event.
Both additive, nullable (or default-false), zero-risk to any existing row.

1. `competition_events.attempts_suspended_at` / `suspension_reason` /
   `suspended_by_user_id` -- checked by StartCompetitionEventAttempt (blocks
   both a new attempt and resuming one) and GetCompetitionEventInstructions.
   See CompetitionEvent's own docstring in app/models/models.py for why this
   is a separate field from `status`, not a new status value.

2. `competition_event_results.is_voided` / `voided_reason` / `voided_at` /
   `voided_by_user_id` -- checked by ranking (_RankResultsForLevel),
   release (ReleaseCompetitionEventResults), the student-facing read
   (GetCompetitionEventResultForStudent, treated the same as unreleased),
   and both certificate entry points. See VoidCompetitionEventResult's own
   docstring in annual_competition_scoring_service.py.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '584eee85ebf0'
down_revision: Union[str, Sequence[str], None] = '7f3c9a1e5d02'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('competition_events', sa.Column('attempts_suspended_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('competition_events', sa.Column('suspension_reason', sa.Text(), nullable=True))
    op.add_column('competition_events', sa.Column('suspended_by_user_id', sa.String(), nullable=True))
    op.create_index(op.f('ix_competition_events_suspended_by_user_id'), 'competition_events', ['suspended_by_user_id'], unique=False)

    op.add_column('competition_event_results', sa.Column('is_voided', sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column('competition_event_results', sa.Column('voided_reason', sa.Text(), nullable=True))
    op.add_column('competition_event_results', sa.Column('voided_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('competition_event_results', sa.Column('voided_by_user_id', sa.String(), nullable=True))
    op.create_index(op.f('ix_competition_event_results_voided_by_user_id'), 'competition_event_results', ['voided_by_user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_competition_event_results_voided_by_user_id'), table_name='competition_event_results')
    op.drop_column('competition_event_results', 'voided_by_user_id')
    op.drop_column('competition_event_results', 'voided_at')
    op.drop_column('competition_event_results', 'voided_reason')
    op.drop_column('competition_event_results', 'is_voided')

    op.drop_index(op.f('ix_competition_events_suspended_by_user_id'), table_name='competition_events')
    op.drop_column('competition_events', 'suspended_by_user_id')
    op.drop_column('competition_events', 'suspension_reason')
    op.drop_column('competition_events', 'attempts_suspended_at')
