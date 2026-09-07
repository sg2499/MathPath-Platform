"""Add Annual Competition tables

Revision ID: 3025bba70ab3
Revises: 6357865120b5
Create Date: 2026-09-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3025bba70ab3'
down_revision: Union[str, Sequence[str], None] = '6357865120b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    New, isolated tables for the real, single scheduled Annual Competition
    event (11 Oct 2026) -- deliberately parallel to, not built on top of,
    the existing Competition Mock practice tables. See
    docs/project-memory/annual-competition/REQUIREMENTS.md and
    .mathpath/packages/pkg-01-data-model.md.

    Also mirrored, on backend startup, by
    ensure_annual_competition_tables() in app/services/schema_migration.py
    -- a redundant raw-SQL safety net matching the existing
    ensure_competition_mock_tables() precedent, since production deploys
    have not always run `alembic upgrade head` reliably (see that file's
    own comments).
    """
    op.create_table('competition_events',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('status', sa.String(length=30), nullable=False),
    sa.Column('competition_date', sa.DateTime(timezone=True), nullable=False),
    sa.Column('results_release_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_by_user_id', sa.String(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_competition_events_created_by_user_id'), 'competition_events', ['created_by_user_id'], unique=False)

    op.create_table('competition_event_slots',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('event_id', sa.String(), nullable=False),
    sa.Column('mode', sa.String(length=30), nullable=False),
    sa.Column('slot_label', sa.String(length=150), nullable=True),
    sa.Column('scheduled_start_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('scheduled_end_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('applicable_level_codes_json', sa.Text(), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.ForeignKeyConstraint(['event_id'], ['competition_events.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_competition_event_slots_event_id'), 'competition_event_slots', ['event_id'], unique=False)

    op.create_table('competition_event_level_papers',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('event_id', sa.String(), nullable=False),
    sa.Column('competition_level_code', sa.String(length=50), nullable=False),
    sa.Column('mock_exam_id', sa.String(), nullable=True),
    sa.Column('status', sa.String(length=30), nullable=False),
    sa.Column('locked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.ForeignKeyConstraint(['event_id'], ['competition_events.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['mock_exam_id'], ['competition_mock_exams.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('event_id', 'competition_level_code', name='uq_competition_event_level_paper')
    )
    op.create_index(op.f('ix_competition_event_level_papers_event_id'), 'competition_event_level_papers', ['event_id'], unique=False)
    op.create_index(op.f('ix_competition_event_level_papers_mock_exam_id'), 'competition_event_level_papers', ['mock_exam_id'], unique=False)

    op.create_table('competition_event_section_timers',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('level_paper_id', sa.String(), nullable=False),
    sa.Column('section_number', sa.Integer(), nullable=False),
    sa.Column('section_title', sa.String(length=255), nullable=True),
    sa.Column('mode', sa.String(length=30), nullable=True),
    sa.Column('time_limit_seconds', sa.Integer(), nullable=False),
    sa.Column('display_order', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['level_paper_id'], ['competition_event_level_papers.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('level_paper_id', 'section_number', name='uq_competition_event_section_timer')
    )
    op.create_index(op.f('ix_competition_event_section_timers_level_paper_id'), 'competition_event_section_timers', ['level_paper_id'], unique=False)

    op.create_table('competition_event_assignments',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('event_id', sa.String(), nullable=False),
    sa.Column('student_id', sa.String(), nullable=False),
    sa.Column('assigned_level_code', sa.String(length=50), nullable=False),
    sa.Column('slot_id', sa.String(), nullable=True),
    sa.Column('assignment_source', sa.String(length=30), nullable=False),
    sa.Column('overridden_by_user_id', sa.String(), nullable=True),
    sa.Column('computed_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(['event_id'], ['competition_events.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['overridden_by_user_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['slot_id'], ['competition_event_slots.id'], ),
    sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('event_id', 'student_id', name='uq_competition_event_assignment_student')
    )
    op.create_index(op.f('ix_competition_event_assignments_event_id'), 'competition_event_assignments', ['event_id'], unique=False)
    op.create_index(op.f('ix_competition_event_assignments_overridden_by_user_id'), 'competition_event_assignments', ['overridden_by_user_id'], unique=False)
    op.create_index(op.f('ix_competition_event_assignments_slot_id'), 'competition_event_assignments', ['slot_id'], unique=False)
    op.create_index(op.f('ix_competition_event_assignments_student_id'), 'competition_event_assignments', ['student_id'], unique=False)

    op.create_table('competition_event_attempts',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('event_id', sa.String(), nullable=False),
    sa.Column('assignment_id', sa.String(), nullable=False),
    sa.Column('level_paper_id', sa.String(), nullable=False),
    sa.Column('student_id', sa.String(), nullable=False),
    sa.Column('attempt_number', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=30), nullable=False),
    sa.Column('session_token', sa.String(length=100), nullable=True),
    sa.Column('current_section_number', sa.Integer(), nullable=False),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.ForeignKeyConstraint(['assignment_id'], ['competition_event_assignments.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['event_id'], ['competition_events.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['level_paper_id'], ['competition_event_level_papers.id'], ),
    sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('assignment_id', 'attempt_number', name='uq_competition_event_attempt_number')
    )
    op.create_index(op.f('ix_competition_event_attempts_assignment_id'), 'competition_event_attempts', ['assignment_id'], unique=False)
    op.create_index(op.f('ix_competition_event_attempts_event_id'), 'competition_event_attempts', ['event_id'], unique=False)
    op.create_index(op.f('ix_competition_event_attempts_level_paper_id'), 'competition_event_attempts', ['level_paper_id'], unique=False)
    op.create_index(op.f('ix_competition_event_attempts_student_id'), 'competition_event_attempts', ['student_id'], unique=False)

    op.create_table('competition_event_attempt_section_states',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('attempt_id', sa.String(), nullable=False),
    sa.Column('section_number', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=30), nullable=False),
    sa.Column('time_limit_seconds', sa.Integer(), nullable=False),
    sa.Column('remaining_seconds_at_last_heartbeat', sa.Integer(), nullable=True),
    sa.Column('last_heartbeat_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['attempt_id'], ['competition_event_attempts.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('attempt_id', 'section_number', name='uq_competition_event_attempt_section')
    )
    op.create_index(op.f('ix_competition_event_attempt_section_states_attempt_id'), 'competition_event_attempt_section_states', ['attempt_id'], unique=False)

    op.create_table('competition_event_results',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('attempt_id', sa.String(), nullable=False),
    sa.Column('event_id', sa.String(), nullable=False),
    sa.Column('assignment_id', sa.String(), nullable=False),
    sa.Column('student_id', sa.String(), nullable=False),
    sa.Column('competition_level_code', sa.String(length=50), nullable=False),
    sa.Column('score', sa.Float(), nullable=False),
    sa.Column('max_score', sa.Float(), nullable=False),
    sa.Column('percentage', sa.Float(), nullable=False),
    sa.Column('accuracy_percentage', sa.Float(), nullable=False),
    sa.Column('correct_count', sa.Integer(), nullable=False),
    sa.Column('wrong_count', sa.Integer(), nullable=False),
    sa.Column('unanswered_count', sa.Integer(), nullable=False),
    sa.Column('time_taken_seconds', sa.Integer(), nullable=True),
    sa.Column('per_section_time_json', sa.Text(), nullable=True),
    sa.Column('rank', sa.Integer(), nullable=True),
    sa.Column('is_released', sa.Boolean(), nullable=False),
    sa.Column('released_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('released_by_user_id', sa.String(), nullable=True),
    sa.Column('computed_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.ForeignKeyConstraint(['assignment_id'], ['competition_event_assignments.id'], ),
    sa.ForeignKeyConstraint(['attempt_id'], ['competition_event_attempts.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['event_id'], ['competition_events.id'], ),
    sa.ForeignKeyConstraint(['released_by_user_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('attempt_id')
    )
    op.create_index(op.f('ix_competition_event_results_assignment_id'), 'competition_event_results', ['assignment_id'], unique=False)
    op.create_index(op.f('ix_competition_event_results_event_id'), 'competition_event_results', ['event_id'], unique=False)
    op.create_index(op.f('ix_competition_event_results_released_by_user_id'), 'competition_event_results', ['released_by_user_id'], unique=False)
    op.create_index(op.f('ix_competition_event_results_student_id'), 'competition_event_results', ['student_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_competition_event_results_student_id'), table_name='competition_event_results')
    op.drop_index(op.f('ix_competition_event_results_released_by_user_id'), table_name='competition_event_results')
    op.drop_index(op.f('ix_competition_event_results_event_id'), table_name='competition_event_results')
    op.drop_index(op.f('ix_competition_event_results_assignment_id'), table_name='competition_event_results')
    op.drop_table('competition_event_results')

    op.drop_index(op.f('ix_competition_event_attempt_section_states_attempt_id'), table_name='competition_event_attempt_section_states')
    op.drop_table('competition_event_attempt_section_states')

    op.drop_index(op.f('ix_competition_event_attempts_student_id'), table_name='competition_event_attempts')
    op.drop_index(op.f('ix_competition_event_attempts_level_paper_id'), table_name='competition_event_attempts')
    op.drop_index(op.f('ix_competition_event_attempts_event_id'), table_name='competition_event_attempts')
    op.drop_index(op.f('ix_competition_event_attempts_assignment_id'), table_name='competition_event_attempts')
    op.drop_table('competition_event_attempts')

    op.drop_index(op.f('ix_competition_event_assignments_student_id'), table_name='competition_event_assignments')
    op.drop_index(op.f('ix_competition_event_assignments_slot_id'), table_name='competition_event_assignments')
    op.drop_index(op.f('ix_competition_event_assignments_overridden_by_user_id'), table_name='competition_event_assignments')
    op.drop_index(op.f('ix_competition_event_assignments_event_id'), table_name='competition_event_assignments')
    op.drop_table('competition_event_assignments')

    op.drop_index(op.f('ix_competition_event_section_timers_level_paper_id'), table_name='competition_event_section_timers')
    op.drop_table('competition_event_section_timers')

    op.drop_index(op.f('ix_competition_event_level_papers_mock_exam_id'), table_name='competition_event_level_papers')
    op.drop_index(op.f('ix_competition_event_level_papers_event_id'), table_name='competition_event_level_papers')
    op.drop_table('competition_event_level_papers')

    op.drop_index(op.f('ix_competition_event_slots_event_id'), table_name='competition_event_slots')
    op.drop_table('competition_event_slots')

    op.drop_index(op.f('ix_competition_events_created_by_user_id'), table_name='competition_events')
    op.drop_table('competition_events')
