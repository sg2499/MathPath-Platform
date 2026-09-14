"""Add index on assignments.assigned_to_id

Revision ID: b7c1e4f0a2d9
Revises: d4f81a2c9e17
Create Date: 2026-09-14 00:00:00.000000

assignments.assigned_to_id is filtered on directly in roughly a dozen
hot-path queries across the student dashboard, teacher rosters, and admin
reporting endpoints (it holds the student_id/class_id/etc. an Assignment
targets, depending on assigned_to_type), but has never carried an index --
every one of those queries does a full table scan of `assignments`, which
is one of the largest and most heavily-written tables in the schema. This
is purely additive (index-only, no column/data change) and safe to run
against a live table.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7c1e4f0a2d9'
down_revision: Union[str, Sequence[str], None] = 'd4f81a2c9e17'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index(op.f('ix_assignments_assigned_to_id'), 'assignments', ['assigned_to_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_assignments_assigned_to_id'), table_name='assignments')
