"""Add Competition Practice bank columns (Phase A data model)

Revision ID: ba2ef4da0cf9
Revises: a1c7e4f92b6d
Create Date: 2026-09-11 00:00:00.000000

2026-09-11 (Shailesh, Competition Practice feature, Phase A): lays the data
model for a new "Practice" mode alongside the existing "Official" Annual
Competition flow -- students get an admin-assigned bank of freshly
generated practice papers (batch-assigned in multiples of 5/10/15), attempt
them with zero retakes once submitted, and see every submitted practice
paper's Answer Sheet/Scorecard as permanent history. No existing behavior
changes: every new column is nullable or carries a server_default of
"OFFICIAL" so every pre-existing row is auto-backfilled and reads exactly
as it did before this migration.

Three changes:

1. `competition_event_level_papers` gets `paper_kind` (OFFICIAL/PRACTICE,
   default OFFICIAL) plus `assigned_student_id` / `assigned_by_user_id` /
   `assigned_at` / `consumed_at` (all nullable, only ever populated for
   PRACTICE rows -- see the batch-assignment service that will populate
   them in a later phase). Its `uq_competition_event_level_paper`
   UniqueConstraint (one row per event+level) is dropped: a practice bank
   needs many PRACTICE-kind rows per event+level. The equivalent guarantee
   for OFFICIAL papers is now enforced in the service layer, inside
   `_GetOrCreateLevelPaper` (annual_competition_studio_service.py), scoped
   to `paper_kind == "OFFICIAL"` -- shipped in the same commit as this
   migration so there is no regression window where official papers could
   duplicate.

2. `competition_event_attempts` gets `attempt_type` (OFFICIAL/PRACTICE,
   default OFFICIAL) and `assignment_id` becomes nullable -- a PRACTICE
   attempt has no CompetitionEventAssignment (practice access is granted
   via the bank above, not the permanent per-student-per-event OFFICIAL
   enrollment that FK was built for).

3. `competition_event_results` gets the same `attempt_type` (denormalized
   here so every official-flow-protection filter added in a later phase --
   ranking, release, admin/teacher results lists -- can filter on the
   result row directly) and `assignment_id` becomes nullable for the same
   reason as (2).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ba2ef4da0cf9'
down_revision: Union[str, Sequence[str], None] = 'a1c7e4f92b6d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('competition_event_level_papers', schema=None) as batch_op:
        batch_op.add_column(sa.Column('paper_kind', sa.String(length=20), nullable=False, server_default='OFFICIAL'))
        batch_op.add_column(sa.Column('assigned_student_id', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('assigned_by_user_id', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('assigned_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('consumed_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.create_index(
            op.f('ix_competition_event_level_papers_assigned_student_id'),
            ['assigned_student_id'],
            unique=False,
        )
        batch_op.create_index(
            op.f('ix_competition_event_level_papers_assigned_by_user_id'),
            ['assigned_by_user_id'],
            unique=False,
        )
        batch_op.create_foreign_key(
            'fk_competition_event_level_papers_assigned_student_id',
            'students',
            ['assigned_student_id'],
            ['id'],
            ondelete='CASCADE',
        )
        batch_op.create_foreign_key(
            'fk_competition_event_level_papers_assigned_by_user_id',
            'users',
            ['assigned_by_user_id'],
            ['id'],
        )
        batch_op.drop_constraint('uq_competition_event_level_paper', type_='unique')

    with op.batch_alter_table('competition_event_attempts', schema=None) as batch_op:
        batch_op.add_column(sa.Column('attempt_type', sa.String(length=20), nullable=False, server_default='OFFICIAL'))
        batch_op.alter_column('assignment_id', existing_type=sa.String(), nullable=True)

    with op.batch_alter_table('competition_event_results', schema=None) as batch_op:
        batch_op.add_column(sa.Column('attempt_type', sa.String(length=20), nullable=False, server_default='OFFICIAL'))
        batch_op.alter_column('assignment_id', existing_type=sa.String(), nullable=True)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('competition_event_results', schema=None) as batch_op:
        batch_op.alter_column('assignment_id', existing_type=sa.String(), nullable=False)
        batch_op.drop_column('attempt_type')

    with op.batch_alter_table('competition_event_attempts', schema=None) as batch_op:
        batch_op.alter_column('assignment_id', existing_type=sa.String(), nullable=False)
        batch_op.drop_column('attempt_type')

    with op.batch_alter_table('competition_event_level_papers', schema=None) as batch_op:
        batch_op.create_unique_constraint(
            'uq_competition_event_level_paper',
            ['event_id', 'competition_level_code'],
        )
        batch_op.drop_constraint('fk_competition_event_level_papers_assigned_by_user_id', type_='foreignkey')
        batch_op.drop_constraint('fk_competition_event_level_papers_assigned_student_id', type_='foreignkey')
        batch_op.drop_index(op.f('ix_competition_event_level_papers_assigned_by_user_id'))
        batch_op.drop_index(op.f('ix_competition_event_level_papers_assigned_student_id'))
        batch_op.drop_column('consumed_at')
        batch_op.drop_column('assigned_at')
        batch_op.drop_column('assigned_by_user_id')
        batch_op.drop_column('assigned_student_id')
        batch_op.drop_column('paper_kind')
