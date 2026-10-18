"""Rewards marketplace (2026-10-18, Shailesh).

Replaces the old portal's Reward Charts / Claim Request / Reward Report.
Students spend the MathCoins they earn (user_economy.coin_balance) on real
rewards and collect them at the centre. Plan:
`claude/mathpath-rewards-plan-oct18.md` in the project.

  * reward_items    the catalogue an admin keeps (photo, price, stock).
  * reward_orders   one row per unlock. It keeps the item as it was at the
                    moment of unlocking (name, photo, price), so editing the
                    catalogue later never changes an order. Coins move only
                    through the economy ledger: SPEND when unlocked, REFUND
                    when cancelled or rejected (spend/refund transaction ids
                    are kept here).
  * reward_goals    the one reward a student has pinned as their goal.
"""
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from app.database import Base
from app.models.models import uuid_str


class RewardItem(Base):
    __tablename__ = "reward_items"
    id = Column(String, primary_key=True, default=uuid_str)
    # stable key for the opening catalogue ("writing-kit"), so seeding never
    # adds an item twice and never overwrites an admin's edits
    seed_key = Column(String(40), unique=True, nullable=True)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    image_url = Column(Text, nullable=True)
    price_coins = Column(Integer, nullable=False)
    # None = unlimited; otherwise how many can still be unlocked
    stock = Column(Integer, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    updated_by_user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class RewardOrder(Base):
    """UNLOCKED -> READY -> COLLECTED, or CANCELLED (by the student, while
    UNLOCKED) / REJECTED (by an admin, before COLLECTED)."""

    __tablename__ = "reward_orders"
    id = Column(String, primary_key=True, default=uuid_str)
    student_id = Column(String, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id = Column(String, ForeignKey("reward_items.id", ondelete="SET NULL"), nullable=True, index=True)
    # the item as it was when unlocked
    item_name = Column(String(120), nullable=False)
    item_image_url = Column(Text, nullable=True)
    price_coins = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False, default="UNLOCKED", index=True)
    pickup_code = Column(String(12), nullable=False, unique=True)
    # the key the student's screen sends with an unlock, so a double tap or
    # a retry never unlocks (and spends) twice
    request_key = Column(String(64), nullable=True)
    spend_transaction_id = Column(String, nullable=True)
    refund_transaction_id = Column(String, nullable=True)
    unlocked_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    ready_at = Column(DateTime(timezone=True), nullable=True)
    ready_by_user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    collected_at = Column(DateTime(timezone=True), nullable=True)
    collected_by_user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)  # cancelled or rejected
    closed_by_user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    close_reason = Column(Text, nullable=True)

    __table_args__ = (UniqueConstraint("user_id", "request_key", name="uq_reward_order_request"),)


class RewardGoal(Base):
    __tablename__ = "reward_goals"
    id = Column(String, primary_key=True, default=uuid_str)
    student_id = Column(String, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, unique=True)
    item_id = Column(String, ForeignKey("reward_items.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
