"""Add assessment_blueprint_sections, make assessment_questions.lesson_id nullable

Revision ID: e5a2c9f14b7d
Revises: d4a1b8e6f723
Create Date: 2026-07-22 12:00:00.000000

2026-07-22, Shailesh: assessments move from a lesson-wise question
distribution to a section-wise one (mirroring each level's competition
mock exam sections) for IM and MM. YLM keeps the old lesson-wise table
(assessment_blueprint_lessons) untouched -- this migration is additive,
not a replacement.

assessment_questions.lesson_id becomes nullable because a section-generated
question (e.g. from "MM_MULTIPLICATION") spans several lessons' worth of
concepts and has no single owning Lesson row; legacy lesson-wise questions
keep a real lesson_id as before.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'e5a2c9f14b7d'
down_revision: Union[str, None] = 'd4a1b8e6f723'
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.create_table(
        'assessment_blueprint_sections',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('blueprint_id', sa.String(), nullable=False),
        sa.Column('section_key', sa.String(length=100), nullable=False),
        sa.Column('question_count', sa.Integer(), nullable=False),
        sa.Column('display_order', sa.Integer(), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['blueprint_id'], ['assessment_blueprints.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('blueprint_id', 'section_key', name='uq_assessment_blueprint_section'),
    )
    op.create_index(
        op.f('ix_assessment_blueprint_sections_blueprint_id'),
        'assessment_blueprint_sections',
        ['blueprint_id'],
        unique=False,
    )

    with op.batch_alter_table('assessment_questions', schema=None) as batch_op:
        batch_op.alter_column('lesson_id', existing_type=sa.String(), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table('assessment_questions', schema=None) as batch_op:
        batch_op.alter_column('lesson_id', existing_type=sa.String(), nullable=False)

    op.drop_index(op.f('ix_assessment_blueprint_sections_blueprint_id'), table_name='assessment_blueprint_sections')
    op.drop_table('assessment_blueprint_sections')
