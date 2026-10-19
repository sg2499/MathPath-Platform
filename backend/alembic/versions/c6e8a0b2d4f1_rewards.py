"""Rewards: the catalogue, each unlock, and each student's goal

Revision ID: c6e8a0b2d4f1
Revises: b3d5f7a9c1e2
Create Date: 2026-10-18 15:30:00.000000

2026-10-18 (Shailesh): the rewards marketplace. reward_items is the
catalogue; reward_orders is one row per unlock (keeping the item as it was,
the pickup code, and who prepared and handed it over); reward_goals is the
reward a student has pinned. Production creates them at startup
(Base.metadata.create_all); this does the same for an Alembic-managed
database.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c6e8a0b2d4f1"
down_revision: Union[str, Sequence[str], None] = "b3d5f7a9c1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "reward_items" not in tables:
        op.create_table(
            "reward_items",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("seed_key", sa.String(length=40), nullable=True, unique=True),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("image_url", sa.Text(), nullable=True),
            sa.Column("price_coins", sa.Integer(), nullable=False),
            sa.Column("stock", sa.Integer(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_by_user_id", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        )
    if "reward_orders" not in tables:
        op.create_table(
            "reward_orders",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("student_id", sa.String(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("item_id", sa.String(), sa.ForeignKey("reward_items.id", ondelete="SET NULL"), nullable=True),
            sa.Column("item_name", sa.String(length=120), nullable=False),
            sa.Column("item_image_url", sa.Text(), nullable=True),
            sa.Column("price_coins", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("pickup_code", sa.String(length=12), nullable=False, unique=True),
            sa.Column("request_key", sa.String(length=64), nullable=True),
            sa.Column("spend_transaction_id", sa.String(), nullable=True),
            sa.Column("refund_transaction_id", sa.String(), nullable=True),
            sa.Column("unlocked_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("ready_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("ready_by_user_id", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("collected_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("collected_by_user_id", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("closed_by_user_id", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("close_reason", sa.Text(), nullable=True),
            sa.UniqueConstraint("user_id", "request_key", name="uq_reward_order_request"),
        )
        op.create_index("ix_reward_orders_student_id", "reward_orders", ["student_id"])
        op.create_index("ix_reward_orders_user_id", "reward_orders", ["user_id"])
        op.create_index("ix_reward_orders_item_id", "reward_orders", ["item_id"])
        op.create_index("ix_reward_orders_status", "reward_orders", ["status"])
    if "reward_goals" not in tables:
        op.create_table(
            "reward_goals",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("student_id", sa.String(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False, unique=True),
            sa.Column("item_id", sa.String(), sa.ForeignKey("reward_items.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )


def downgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    for name in ("reward_goals", "reward_orders", "reward_items"):
        if name in tables:
            op.drop_table(name)
