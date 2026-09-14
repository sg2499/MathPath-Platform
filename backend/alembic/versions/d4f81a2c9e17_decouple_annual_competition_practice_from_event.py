"""Decouple Annual Competition practice papers/attempts/results from any event

Revision ID: d4f81a2c9e17
Revises: ba2ef4da0cf9
Create Date: 2026-09-12 00:00:00.000000

2026-09-12 (Shailesh, Competition Practice feature): "the practice papers
should not be related to any event whatsoever, its only for practice
leading to the main event. its easier that way because it allows the admin
to just assign papers to all the students and let them practice instead of
creating unnecessary events and creating complexity."

Phase A (ba2ef4da0cf9) gave practice its own paper_kind/attempt_type split
but still required every row -- OFFICIAL and PRACTICE alike -- to carry a
real `event_id`. This migration makes `event_id` nullable on the three
tables that carry it, so a PRACTICE row can genuinely have none:

1. `competition_event_level_papers.event_id`
2. `competition_event_attempts.event_id`
3. `competition_event_results.event_id`

OFFICIAL rows are unaffected -- the service layer still always sets
event_id for them; only the column-level constraint relaxes so a PRACTICE
row (which never has one) doesn't need a placeholder or a schema
workaround. No data is touched: every existing row keeps whatever event_id
it already has.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4f81a2c9e17'
down_revision: Union[str, Sequence[str], None] = 'ba2ef4da0cf9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('competition_event_level_papers', schema=None) as batch_op:
        batch_op.alter_column('event_id', existing_type=sa.String(), nullable=True)

    with op.batch_alter_table('competition_event_attempts', schema=None) as batch_op:
        batch_op.alter_column('event_id', existing_type=sa.String(), nullable=True)

    with op.batch_alter_table('competition_event_results', schema=None) as batch_op:
        batch_op.alter_column('event_id', existing_type=sa.String(), nullable=True)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('competition_event_results', schema=None) as batch_op:
        batch_op.alter_column('event_id', existing_type=sa.String(), nullable=False)

    with op.batch_alter_table('competition_event_attempts', schema=None) as batch_op:
        batch_op.alter_column('event_id', existing_type=sa.String(), nullable=False)

    with op.batch_alter_table('competition_event_level_papers', schema=None) as batch_op:
        batch_op.alter_column('event_id', existing_type=sa.String(), nullable=False)
