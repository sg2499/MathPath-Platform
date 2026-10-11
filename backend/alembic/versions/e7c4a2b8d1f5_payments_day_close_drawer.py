"""Payments review: Day Close carries the cash drawer over

Revision ID: e7c4a2b8d1f5
Revises: d9b3e6f1a4c7
Create Date: 2026-10-11 12:30:00.000000

2026-10-11 (Shailesh, live review). Production adds these columns at startup
(ensure_payments_foundation); this does the same for an Alembic-managed
database. Each column is skipped when it exists.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e7c4a2b8d1f5"
down_revision: Union[str, Sequence[str], None] = "d9b3e6f1a4c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNS = (
    ("opening_cash_paise", lambda: sa.Column("opening_cash_paise", sa.Integer(), nullable=True)),
    ("handed_over_paise", lambda: sa.Column("handed_over_paise", sa.Integer(), nullable=False, server_default="0")),
    ("handover_to", lambda: sa.Column("handover_to", sa.String(200), nullable=True)),
)


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "payment_day_closes" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("payment_day_closes")}
    for name, make in COLUMNS:
        if name not in existing:
            op.add_column("payment_day_closes", make())


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "payment_day_closes" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("payment_day_closes")}
    for name, _ in reversed(COLUMNS):
        if name in existing:
            op.drop_column("payment_day_closes", name)
