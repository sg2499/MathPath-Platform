"""Several authenticator apps on one admin login

Revision ID: a8d3f1c6e2b4
Revises: e7a1c3f5b2d8
Create Date: 2026-11-28 20:00:00.000000

2026-11-28 (Shailesh): the admins share one admin login; each person adds
their own phone, and a code from any of them completes the 2FA step.
Production does the same at startup (create_all); this does it for an
Alembic-managed database. The account's existing authenticator is copied in
as its first phone the first time it is needed (see two_factor_devices.py).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a8d3f1c6e2b4"
down_revision: Union[str, Sequence[str], None] = "e7a1c3f5b2d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "user_totp_devices" in inspector.get_table_names():
        return
    op.create_table(
        "user_totp_devices",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("label", sa.String(80), nullable=False),
        sa.Column("secret", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_user_totp_devices_user_id", "user_totp_devices", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_user_totp_devices_user_id", table_name="user_totp_devices")
    op.drop_table("user_totp_devices")
