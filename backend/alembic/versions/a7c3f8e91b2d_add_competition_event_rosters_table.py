"""Add competition_event_rosters table (per-event roster)

Revision ID: a7c3f8e91b2d
Revises: 2f4c54cc28da
Create Date: 2026-09-29 00:00:00.000000

2026-09-29 (Shailesh, "the real student accounts are also getting [assigned
a slot] when i have never assigned that ... officially"): new table backing
CompetitionEventRoster -- the explicit, admin-maintained list of students
eligible for a given event. See that model's own docstring in
app/models/models.py for the full rationale (this is what closes the gap
where an unscoped "Run Assignment Engine (All Students)" could assign every
active student on the platform into an event, not just its intended
roster). No existing data touched -- purely additive, brand new table, no
rows until an admin explicitly adds students to an event's roster.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7c3f8e91b2d'
down_revision: Union[str, Sequence[str], None] = '2f4c54cc28da'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'competition_event_rosters',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('event_id', sa.String(), nullable=False),
        sa.Column('student_id', sa.String(), nullable=False),
        sa.Column('added_by_user_id', sa.String(), nullable=True),
        sa.Column('added_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.ForeignKeyConstraint(['event_id'], ['competition_events.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['added_by_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('event_id', 'student_id', name='uq_competition_event_roster_student'),
    )
    op.create_index(op.f('ix_competition_event_rosters_event_id'), 'competition_event_rosters', ['event_id'], unique=False)
    op.create_index(op.f('ix_competition_event_rosters_student_id'), 'competition_event_rosters', ['student_id'], unique=False)
    op.create_index(op.f('ix_competition_event_rosters_added_by_user_id'), 'competition_event_rosters', ['added_by_user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_competition_event_rosters_added_by_user_id'), table_name='competition_event_rosters')
    op.drop_index(op.f('ix_competition_event_rosters_student_id'), table_name='competition_event_rosters')
    op.drop_index(op.f('ix_competition_event_rosters_event_id'), table_name='competition_event_rosters')
    op.drop_table('competition_event_rosters')
