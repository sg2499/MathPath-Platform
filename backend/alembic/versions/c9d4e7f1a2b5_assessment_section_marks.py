"""Assessment sections: admin-set marks per question

Revision ID: c9d4e7f1a2b5
Revises: b8e2f4a6c1d3
Create Date: 2026-11-02 19:40:00.000000

2026-11-02 (Shailesh): when building an assessment the admin sets, for each
section, how many questions and how many whole marks each question is worth
(still totalling 100), and may leave a section out. The structure keeps the
marks (assessment_blueprint_sections.marks_per_question); each generated
question keeps its own (assessment_questions.marks). Production adds both at
startup (ensure_assessment_section_marks_columns).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c9d4e7f1a2b5"
down_revision: Union[str, Sequence[str], None] = "b8e2f4a6c1d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    ("assessment_blueprint_sections", "marks_per_question", sa.Integer()),
    ("assessment_questions", "marks", sa.Float()),
)


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    for table, column, kind in _COLUMNS:
        if table in tables and column not in {item["name"] for item in inspector.get_columns(table)}:
            op.add_column(table, sa.Column(column, kind, nullable=True))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    for table, column, _ in _COLUMNS:
        if table in tables and column in {item["name"] for item in inspector.get_columns(table)}:
            op.drop_column(table, column)
