"""fix_accuracy_calculation

Revision ID: f3bf01f94077
Revises: 6a820867f848
Create Date: 2026-07-10 13:34:02.115861

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3bf01f94077'
down_revision: Union[str, Sequence[str], None] = '6a820867f848'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from sqlalchemy import text
    bind = op.get_bind()
    
    # 1. Update CompetitionMockResultSummary accuracy_percentage
    # We join with competition_mock_attempts to get correct_count and total_questions.
    bind.execute(text("""
        UPDATE competition_mock_result_summaries
        SET accuracy_percentage = (
            SELECT ROUND((CAST(cma.correct_count AS FLOAT) / 
                CASE 
                    WHEN cma.total_questions > 0 THEN cma.total_questions 
                    WHEN (COALESCE(cma.attempted_count, 0) + COALESCE(cma.unanswered_count, 0)) > 0 THEN (COALESCE(cma.attempted_count, 0) + COALESCE(cma.unanswered_count, 0))
                    ELSE 100 
                END) * 100)
            FROM competition_mock_attempts cma
            WHERE cma.id = competition_mock_result_summaries.mock_attempt_id
        )
        WHERE EXISTS (
            SELECT 1 FROM competition_mock_attempts cma WHERE cma.id = competition_mock_result_summaries.mock_attempt_id AND cma.correct_count IS NOT NULL
        )
    """))

def downgrade() -> None:
    pass
