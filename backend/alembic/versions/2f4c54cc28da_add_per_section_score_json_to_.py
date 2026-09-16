"""Add per_section_score_json to competition_event_results

Revision ID: 2f4c54cc28da
Revises: b7c1e4f0a2d9
Create Date: 2026-09-16 12:00:00.000000

Annual Competition Practice Reports feature, package 1 (Shailesh,
2026-09-16): sibling column to the existing per_section_time_json, storing
the same shape of per-section breakdown but for score/correct/wrong/
unanswered/attempted counts instead of time. Captured unconditionally at
computation time (ComputeAndFinalizeCompetitionEventResult) for both
OFFICIAL and PRACTICE attempts, exactly like per_section_time_json already
is -- see that column's own docstring in models.py.

Nullable/additive only, zero behavior change for any existing row or
caller: a result finalized before this column existed simply reads NULL
(-> [] via _ResultPayload's json.loads guard) until it is recomputed.
RecomputeAnnualCompetitionResults / RecomputeAnnualCompetitionPractice-
Results (both already idempotent, already safe to re-run -- see their own
docstrings in annual_competition_scoring_service.py) backfill it for every
already-finalized attempt without needing a bespoke backfill script, unlike
the two most recent backfills.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2f4c54cc28da'
down_revision: Union[str, Sequence[str], None] = 'b7c1e4f0a2d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'competition_event_results',
        sa.Column('per_section_score_json', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('competition_event_results', 'per_section_score_json')
