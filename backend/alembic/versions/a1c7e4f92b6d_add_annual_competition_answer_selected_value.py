"""Add Annual Competition attempt answer typed-value column (Package 8)

Revision ID: a1c7e4f92b6d
Revises: 584eee85ebf0
Create Date: 2026-09-08 00:00:00.000000

Point 8 (Shailesh, 2026-09-08): the Annual Competition attempt screen now
matches DPS's typed-answer-box layout instead of MCQ picks. Grading now
compares this typed value against CompetitionMockQuestion.correct_answer via
the same answers_match() function DPS already uses (app/services/
answer_matching.py) -- see that module's own docstring for why value
equality there is exact (no rounding/tolerance) while formatting noise
(whitespace, leading zeros, unicode minus, decimal padding) is forgiven.

`selected_option_id` is deliberately left in place (nullable, simply never
written by the new save path) rather than dropped -- the underlying
question bank still generates MCQ options for Competition Mock Practice's
own (unchanged) MCQ flow, and CompetitionMockQuestionOption rows are shared
infrastructure, not something this migration touches.

Named `selected_value` to match `competition_mock_attempt_answers.
selected_value`'s existing naming convention on the sibling table, not a
new one.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1c7e4f92b6d'
down_revision: Union[str, Sequence[str], None] = '584eee85ebf0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('competition_event_attempt_answers', sa.Column('selected_value', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('competition_event_attempt_answers', 'selected_value')
