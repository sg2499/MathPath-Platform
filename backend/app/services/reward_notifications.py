"""Rewards notifications (2026-10-18, Rewards Part 4).

Students hear about every step of their reward (unlocked with its code,
ready to collect, collected, rejected with the coins returned) and when they
can afford their goal. Admins hear about each unlock by a real student.
Each notification has a fixed id, so a retry never sends it twice, and every
call is wrapped so a notification problem can never undo the reward change
it reports (that change is committed first)."""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.models import Notification, RewardGoal, RewardItem, RewardOrder, Student, User, UserEconomy

log = logging.getLogger(__name__)
MINE = "/student/rewards?tab=mine"


def _Coins(Value: int) -> str:
    return f"{int(Value):,}"


def _Send(Db: Session, *, Id: str, UserId: str, Role: str, Type: str, Title: str, Message: str, Route: str, StudentId: str | None = None, Meta: dict | None = None) -> bool:
    from app.services.notification_service import CreateNotification

    if Db.query(Notification.id).filter(Notification.id == Id).first():
        return False
    CreateNotification(
        Db,
        notification_id=Id,
        recipient_user_id=UserId,
        recipient_role=Role,
        type=Type,
        category="REWARD",
        title=Title,
        message=Message,
        student_id=StudentId,
        target_route=Route,
        color_variant="AMBER",
        metadata=Meta,
    )
    return True


def _Safely(Db: Session, What: str, Work) -> None:
    try:
        Work()
        Db.commit()
    except Exception:  # noqa: BLE001 -- the reward change itself is already saved
        Db.rollback()
        log.exception("Rewards: could not send the %s notification", What)


def _Student(Db: Session, Order: RewardOrder) -> tuple[Student | None, User | None]:
    StudentRow = Db.get(Student, Order.student_id)
    UserRow = Db.get(User, Order.user_id)
    return StudentRow, UserRow


def NotifyUnlocked(Db: Session, Order: RewardOrder) -> None:
    def Work():
        StudentRow, UserRow = _Student(Db, Order)
        if UserRow is None:
            return
        _Send(
            Db,
            Id=f"rw-unlocked-{Order.id}",
            UserId=UserRow.id,
            Role="STUDENT",
            Type="REWARD_UNLOCKED",
            Title=f"Reward Unlocked: {Order.item_name}",
            Message=f"Your pickup code is {Order.pickup_code}. We'll tell you when it's ready to collect at the centre.",
            Route=MINE,
            StudentId=Order.student_id,
            Meta={"orderId": Order.id, "pickupCode": Order.pickup_code},
        )
        if StudentRow is None or StudentRow.is_demo:
            return
        from app.services.notification_service import ActiveAdminUsers

        for Admin in ActiveAdminUsers(Db):
            _Send(
                Db,
                Id=f"rw-new-{Order.id}-{Admin.id}",
                UserId=Admin.id,
                Role=Admin.role,
                Type="REWARD_TO_PREPARE",
                Title=f"{UserRow.full_name} Unlocked {Order.item_name}",
                Message=f"{_Coins(Order.price_coins)} coins · pickup code {Order.pickup_code}. Get it ready in To Prepare.",
                Route="/admin/rewards?tab=prepare",
                StudentId=Order.student_id,
                Meta={"orderId": Order.id},
            )

    _Safely(Db, "unlock", Work)


def NotifyReady(Db: Session, Orders: list[RewardOrder]) -> None:
    def Work():
        for Order in Orders:
            _Send(
                Db,
                Id=f"rw-ready-{Order.id}",
                UserId=Order.user_id,
                Role="STUDENT",
                Type="REWARD_READY",
                Title=f"Ready To Collect: {Order.item_name}",
                Message=f"Your reward is waiting at the centre. Show your pickup code {Order.pickup_code} to collect it.",
                Route=MINE,
                StudentId=Order.student_id,
                Meta={"orderId": Order.id, "pickupCode": Order.pickup_code},
            )

    _Safely(Db, "ready", Work)


def NotifyCollected(Db: Session, Order: RewardOrder) -> None:
    def Work():
        _Send(
            Db,
            Id=f"rw-collected-{Order.id}",
            UserId=Order.user_id,
            Role="STUDENT",
            Type="REWARD_COLLECTED",
            Title=f"Collected: {Order.item_name}",
            Message="Enjoy it! Every DPS sheet you finish brings your next reward closer.",
            Route=MINE,
            StudentId=Order.student_id,
            Meta={"orderId": Order.id},
        )

    _Safely(Db, "collected", Work)


def NotifyRejected(Db: Session, Order: RewardOrder) -> None:
    def Work():
        Reason = f" Reason: {Order.close_reason}" if Order.close_reason else ""
        _Send(
            Db,
            Id=f"rw-rejected-{Order.id}",
            UserId=Order.user_id,
            Role="STUDENT",
            Type="REWARD_REJECTED",
            Title=f"Coins Returned: {Order.item_name}",
            Message=f"This reward couldn't be given this time, so all {_Coins(Order.price_coins)} coins are back in your wallet.{Reason}",
            Route=MINE,
            StudentId=Order.student_id,
            Meta={"orderId": Order.id},
        )

    _Safely(Db, "rejected", Work)


def NotifyGoalIfReached(Db: Session, UserId: str, Before: int, After: int) -> None:
    """When a student's balance crosses their goal's price (an award or a
    refund), tell them once. The id carries how many of that reward they
    already have, so after unlocking it they hear again next time."""
    if After <= Before:
        return

    def Work():
        StudentRow = Db.query(Student).filter(Student.user_id == UserId).first()
        if StudentRow is None:
            return
        Goal = Db.query(RewardGoal).filter(RewardGoal.student_id == StudentRow.id).first()
        if Goal is None:
            return
        Item = Db.get(RewardItem, Goal.item_id)
        if Item is None or not Item.is_active or (Item.stock is not None and Item.stock <= 0):
            return
        if not (Before < Item.price_coins <= After):
            return
        Had = Db.query(RewardOrder.id).filter(RewardOrder.student_id == StudentRow.id, RewardOrder.item_id == Item.id, RewardOrder.status.in_(("UNLOCKED", "READY", "COLLECTED"))).count()
        _Send(
            Db,
            Id=f"rw-goal-{Goal.id}-{Item.id}-{Had}",
            UserId=UserId,
            Role="STUDENT",
            Type="REWARD_GOAL_REACHED",
            Title="You Can Unlock Your Goal!",
            Message=f"You now have {_Coins(After)} MathCoins, enough for {Item.name}. Open the Reward Store to unlock it.",
            Route=f"/student/rewards?item={Item.id}",
            StudentId=StudentRow.id,
            Meta={"itemId": Item.id, "balance": After},
        )

    _Safely(Db, "goal", Work)


def BalanceOf(Db: Session, UserId: str) -> int:
    Value = Db.query(UserEconomy.coin_balance).filter(UserEconomy.user_id == UserId).scalar()
    return int(Value or 0)
