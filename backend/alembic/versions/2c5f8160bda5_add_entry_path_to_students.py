"""Add entry_path to students

Revision ID: 2c5f8160bda5
Revises: e5a2c9f14b7d
Create Date: 2026-07-30 00:00:00.000000

Nullable/additive only -- zero risk to existing rows or existing code paths.

Background: the curriculum has 3 fixed entry paths (see
docs/project-memory/PRODUCT_RULES.md, "Curriculum Progression Paths"):
  PATH_1_YLM -- starts YLM-L1, later enters PM at PM-L2 (PM-L1 skipped)
  PATH_2_PM  -- starts PM-L1, does the full PM module
  PATH_3_BM  -- starts BM-L1 (BM is single-level)
All 3 converge before IM and share the same IM -> MM tail.

This matters for Level Mastery badge visibility: a badge for a level that
was never actually assigned to a given student (behind their entry point,
or -- uniquely for Path 1 -- PM-L1 specifically) is permanently unearnable
and should not be shown. Most of that is derivable at read-time from a
student's current module/level and their real mock-attempt history (see
AchievementEngine/_level_mastery_reachability in achievements.py), with one
genuine, irreducible ambiguity: a student who already has real-world/offline
progress that predates this platform (bulk-imported directly into PM-L2+,
IM, or MM with no in-app history for earlier levels) cannot be distinguished
between "Path 1, legitimately skipped PM-L1" and "Path 2, did PM-L1 for real
but before this platform existed" from data alone.

This column exists to hold that answer once a human (admin/teacher) provides
it. Left NULL, the read-time reachability logic falls back to a conservative
default (hides the ambiguous levels rather than guessing) -- see
achievements.py for the full resolution order. Nothing downstream requires
this column to be populated; it only sharpens an already-safe default.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2c5f8160bda5'
down_revision: Union[str, Sequence[str], None] = 'e5a2c9f14b7d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'students',
        sa.Column('entry_path', sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('students', 'entry_path')
