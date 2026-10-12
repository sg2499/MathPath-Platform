"""Users: last real interaction, for the 20-minute idle sign-out

Revision ID: f1a2c3d4e5b6
Revises: e7c4a2b8d1f5
Create Date: 2026-10-12 11:00:00.000000

2026-10-12 (Shailesh): teacher and student sessions end after 20 minutes
with no activity. last_active_at already exists but is touched by every
request, including background polling, so the idle check needs its own
column that only real interaction moves. Production adds it at startup
(ensure_user_columns); this does the same for an Alembic-managed database.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f1a2c3d4e5b6"
down_revision: Union[str, Sequence[str], None] = "e7c4a2b8d1f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "users" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("users")}
    if "last_interaction_at" not in existing:
        op.add_column("users", sa.Column("last_interaction_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "users" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("users")}
    if "last_interaction_at" in existing:
        op.drop_column("users", "last_interaction_at")
