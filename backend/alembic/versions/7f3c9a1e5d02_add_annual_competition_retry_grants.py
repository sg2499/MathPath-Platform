"""Add Annual Competition attempt retry grants table (+ backfill answers table)

Revision ID: 7f3c9a1e5d02
Revises: 3025bba70ab3
Create Date: 2026-09-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7f3c9a1e5d02'
down_revision: Union[str, Sequence[str], None] = '3025bba70ab3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    Two things, both discovered/needed while building the REQUIREMENTS.md
    item 6 "technical issue" admin retry override:

    1. `competition_event_attempt_retry_grants` -- the new table this
       feature actually needs. Mirrors `assignment_reattempt_permissions`'
       own shape and lifecycle exactly (APPROVED -> USED, checked at
       attempt-start time, consumed the moment the resulting fresh attempt
       is created) -- see annual_competition_attempt_service.py's own
       docstring for the full rationale on why this mirrors that existing
       precedent rather than inventing a new pattern.

    2. `competition_event_attempt_answers` (Package 5, 2026-09-05) -- a
       backfill for a genuine pre-existing gap found while adding table
       #1: this table has a SQLAlchemy model
       (`app.models.models.CompetitionEventAttemptAnswer`) and Packages
       5/6 both depend on it at runtime (answer capture, and the "first
       mistake" tie-break), but it was never actually added to either an
       Alembic migration OR `ensure_annual_competition_tables()`'s raw-SQL
       startup safety net in `app/services/schema_migration.py` -- only
       ever created implicitly by `Base.metadata.create_all()` in tests.
       On a real deploy that relies on the safety net (this codebase's own
       comments note `alembic upgrade head` has not always been run
       reliably), this table would simply not exist and Package 5/6 would
       fail at runtime with "no such table" the first time a student saved
       an answer. Included here rather than filed as a separate follow-up
       since it is the same kind of table, in the same schema area, being
       touched for the same underlying reason (this migration existing at
       all). See `app/services/schema_migration.py`'s own
       `ensure_annual_competition_tables()` for the matching raw-SQL
       backfill.
    """
    op.create_table('competition_event_attempt_answers',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('attempt_id', sa.String(), nullable=False),
    sa.Column('mock_question_id', sa.String(), nullable=False),
    sa.Column('selected_option_id', sa.String(), nullable=True),
    sa.Column('is_correct', sa.Boolean(), nullable=True),
    sa.Column('answered_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.ForeignKeyConstraint(['attempt_id'], ['competition_event_attempts.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['mock_question_id'], ['competition_mock_questions.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['selected_option_id'], ['competition_mock_question_options.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('attempt_id', 'mock_question_id', name='uq_competition_event_attempt_question_answer')
    )
    op.create_index(op.f('ix_competition_event_attempt_answers_attempt_id'), 'competition_event_attempt_answers', ['attempt_id'], unique=False)
    op.create_index(op.f('ix_competition_event_attempt_answers_mock_question_id'), 'competition_event_attempt_answers', ['mock_question_id'], unique=False)
    op.create_index(op.f('ix_competition_event_attempt_answers_selected_option_id'), 'competition_event_attempt_answers', ['selected_option_id'], unique=False)

    op.create_table('competition_event_attempt_retry_grants',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('event_id', sa.String(), nullable=False),
    sa.Column('assignment_id', sa.String(), nullable=False),
    sa.Column('student_id', sa.String(), nullable=False),
    sa.Column('granted_by_user_id', sa.String(), nullable=True),
    sa.Column('reason', sa.Text(), nullable=False),
    sa.Column('status', sa.String(length=30), nullable=False),
    sa.Column('used_attempt_id', sa.String(), nullable=True),
    sa.Column('granted_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['assignment_id'], ['competition_event_assignments.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['event_id'], ['competition_events.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['granted_by_user_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['used_attempt_id'], ['competition_event_attempts.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_competition_event_attempt_retry_grants_assignment_id'), 'competition_event_attempt_retry_grants', ['assignment_id'], unique=False)
    op.create_index(op.f('ix_competition_event_attempt_retry_grants_event_id'), 'competition_event_attempt_retry_grants', ['event_id'], unique=False)
    op.create_index(op.f('ix_competition_event_attempt_retry_grants_granted_by_user_id'), 'competition_event_attempt_retry_grants', ['granted_by_user_id'], unique=False)
    op.create_index(op.f('ix_competition_event_attempt_retry_grants_student_id'), 'competition_event_attempt_retry_grants', ['student_id'], unique=False)
    op.create_index(op.f('ix_competition_event_attempt_retry_grants_used_attempt_id'), 'competition_event_attempt_retry_grants', ['used_attempt_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_competition_event_attempt_retry_grants_used_attempt_id'), table_name='competition_event_attempt_retry_grants')
    op.drop_index(op.f('ix_competition_event_attempt_retry_grants_student_id'), table_name='competition_event_attempt_retry_grants')
    op.drop_index(op.f('ix_competition_event_attempt_retry_grants_granted_by_user_id'), table_name='competition_event_attempt_retry_grants')
    op.drop_index(op.f('ix_competition_event_attempt_retry_grants_event_id'), table_name='competition_event_attempt_retry_grants')
    op.drop_index(op.f('ix_competition_event_attempt_retry_grants_assignment_id'), table_name='competition_event_attempt_retry_grants')
    op.drop_table('competition_event_attempt_retry_grants')

    op.drop_index(op.f('ix_competition_event_attempt_answers_selected_option_id'), table_name='competition_event_attempt_answers')
    op.drop_index(op.f('ix_competition_event_attempt_answers_mock_question_id'), table_name='competition_event_attempt_answers')
    op.drop_index(op.f('ix_competition_event_attempt_answers_attempt_id'), table_name='competition_event_attempt_answers')
    op.drop_table('competition_event_attempt_answers')
