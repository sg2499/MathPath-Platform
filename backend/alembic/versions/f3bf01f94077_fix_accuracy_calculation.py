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
    # Use SQLAlchemy core/text for data migration to be safe
    from sqlalchemy import text
    bind = op.get_bind()
    
    # 1. Update CompetitionMockAttempt
    # We update accuracy_percentage = round((correct_count / total_questions) * 100)
    # If total_questions is missing, fallback to attempted_count + unanswered_count
    bind.execute(text("""
        UPDATE competition_mock_attempts
        SET accuracy_percentage = ROUND((CAST(correct_count AS FLOAT) / 
            CASE 
                WHEN total_questions > 0 THEN total_questions 
                WHEN (COALESCE(attempted_count, 0) + COALESCE(unanswered_count, 0)) > 0 THEN (COALESCE(attempted_count, 0) + COALESCE(unanswered_count, 0))
                ELSE 100 
            END) * 100)
        WHERE correct_count IS NOT NULL
    """))
    
    # 2. Update CompetitionMockResultSummary
    # This just syncs to the mock_attempt
    bind.execute(text("""
        UPDATE competition_mock_result_summaries
        SET accuracy_percentage = (
            SELECT accuracy_percentage 
            FROM competition_mock_attempts 
            WHERE competition_mock_attempts.id = competition_mock_result_summaries.mock_attempt_id
        )
        WHERE mock_attempt_id IS NOT NULL
    """))


def downgrade() -> None:
    # We won't reverse this data fix
    pass
