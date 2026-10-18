"""Rewards marketplace (2026-10-18). Plan: `claude/mathpath-rewards-plan-oct18.md`.

A student unlocks a reward with MathCoins, an admin gets it ready, and it is
handed over at the centre:

    UNLOCKED --(admin: Mark Ready)--> READY --(admin: Mark Collected)--> COLLECTED
       |  \\__(student: Cancel) -> CANCELLED            |
       \\______________(admin: Reject, with a reason) -> REJECTED

Coins move only through EconomyService (SPEND when unlocked, REFUND when
cancelled or rejected), always with the student's wallet row locked, so a
balance can never go below zero and nothing is ever spent twice. The order
keeps the item as it was at the moment of unlocking."""
from __future__ import annotations

import secrets
from datetime import datetime, timezone

from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    EconomyTransaction,
    Level,
    RewardGoal,
    RewardItem,
    RewardOrder,
    Student,
    User,
    UserEconomy,
)
from app.services.economy_service import EconomyService

OPEN = ("UNLOCKED", "READY")
STATUSES = ("UNLOCKED", "READY", "COLLECTED", "CANCELLED", "REJECTED")
CODE_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I/L
MAX_PRICE = 1_000_000
MAX_STOCK = 100_000


class RewardError(Exception):
    def __init__(self, Status: int, Code: str, Message: str):
        super().__init__(Message)
        self.status, self.code, self.message = Status, Code, Message


def _Now() -> datetime:
    return datetime.now(timezone.utc)


def _Iso(Value: datetime | None) -> str | None:
    if Value is None:
        return None
    if Value.tzinfo is None:
        Value = Value.replace(tzinfo=timezone.utc)
    return Value.isoformat()


def NewPickupCode(Db: Session) -> str:
    """Six characters, shown as K7Q-3MX: no letters that look alike."""
    for _ in range(50):
        Raw = "".join(secrets.choice(CODE_LETTERS) for _ in range(6))
        Code = f"{Raw[:3]}-{Raw[3:]}"
        if not Db.query(RewardOrder.id).filter(RewardOrder.pickup_code == Code).first():
            return Code
    raise RewardError(500, "CODE_FAILED", "Could not make a pickup code. Please try again.")


def NormaliseCode(Value: str | None) -> str:
    """'k7q 3mx', 'K7Q3MX' and 'K7Q-3MX' all find the same code."""
    Clean = "".join(Ch for Ch in (Value or "").upper() if Ch.isalnum())
    return f"{Clean[:3]}-{Clean[3:6]}" if len(Clean) == 6 else Clean


# ---------- catalogue ---------------------------------------------------------

def _CheckPrice(Value) -> int:
    try:
        Price = int(Value)
    except (TypeError, ValueError):
        raise RewardError(400, "VALIDATION_ERROR", "Price must be a whole number of coins.")
    if Price < 1 or Price > MAX_PRICE:
        raise RewardError(400, "VALIDATION_ERROR", f"Price must be between 1 and {MAX_PRICE:,} coins.")
    return Price


def _CheckStock(Value) -> int | None:
    if Value is None or Value == "":
        return None
    try:
        Stock = int(Value)
    except (TypeError, ValueError):
        raise RewardError(400, "VALIDATION_ERROR", "Stock must be a whole number, or left blank for unlimited.")
    if Stock < 0 or Stock > MAX_STOCK:
        raise RewardError(400, "VALIDATION_ERROR", f"Stock must be between 0 and {MAX_STOCK:,}.")
    return Stock


def _CheckName(Value) -> str:
    Name = " ".join(str(Value or "").split())
    if not Name:
        raise RewardError(400, "VALIDATION_ERROR", "Give the reward a name.")
    if len(Name) > 120:
        raise RewardError(400, "VALIDATION_ERROR", "Keep the name to 120 characters.")
    return Name


def _CheckDescription(Value) -> str | None:
    Text = " ".join(str(Value or "").split())
    if len(Text) > 400:
        raise RewardError(400, "VALIDATION_ERROR", "Keep the description to 400 characters.")
    return Text or None


def CreateItem(Db: Session, *, Name, Price, Description=None, Stock=None, IsActive=True, UserId: str | None = None) -> RewardItem:
    Last = Db.query(func.max(RewardItem.sort_order)).scalar() or 0
    Item = RewardItem(
        name=_CheckName(Name),
        description=_CheckDescription(Description),
        price_coins=_CheckPrice(Price),
        stock=_CheckStock(Stock),
        is_active=bool(IsActive),
        sort_order=Last + 10,
        updated_by_user_id=UserId,
    )
    Db.add(Item)
    Db.commit()
    Db.refresh(Item)
    return Item


_UNSET = object()


def UpdateItem(Db: Session, ItemId: str, *, Name=_UNSET, Price=_UNSET, Description=_UNSET, Stock=_UNSET, IsActive=_UNSET, UserId: str | None = None) -> RewardItem:
    """Edits never touch an order already unlocked (orders keep their own
    name, photo and price)."""
    Item = Db.query(RewardItem).filter(RewardItem.id == ItemId).with_for_update().first()
    if Item is None:
        raise RewardError(404, "NOT_FOUND", "Reward not found.")
    if Name is not _UNSET:
        Item.name = _CheckName(Name)
    if Price is not _UNSET:
        Item.price_coins = _CheckPrice(Price)
    if Description is not _UNSET:
        Item.description = _CheckDescription(Description)
    if Stock is not _UNSET:
        Item.stock = _CheckStock(Stock)
    if IsActive is not _UNSET:
        Item.is_active = bool(IsActive)
    Item.updated_by_user_id = UserId
    Item.updated_at = _Now()
    Db.commit()
    Db.refresh(Item)
    return Item


def SetItemImage(Db: Session, ItemId: str, ImageUrl: str, UserId: str | None = None) -> RewardItem:
    Item = Db.get(RewardItem, ItemId)
    if Item is None:
        raise RewardError(404, "NOT_FOUND", "Reward not found.")
    Item.image_url = ImageUrl
    Item.updated_by_user_id = UserId
    Item.updated_at = _Now()
    Db.commit()
    Db.refresh(Item)
    return Item


def ReorderItems(Db: Session, ItemIds: list[str]) -> None:
    Items = {Item.id: Item for Item in Db.query(RewardItem).all()}
    Seen = [Id for Id in dict.fromkeys(ItemIds) if Id in Items]
    Rest = sorted((Item for Id, Item in Items.items() if Id not in Seen), key=lambda Item: (Item.sort_order, Item.price_coins))
    for Index, Item in enumerate([Items[Id] for Id in Seen] + Rest):
        Item.sort_order = (Index + 1) * 10
    Db.commit()


def _ItemCounts(Db: Session) -> dict[str, dict[str, int]]:
    Rows = Db.query(RewardOrder.item_id, RewardOrder.status, func.count(RewardOrder.id)).group_by(RewardOrder.item_id, RewardOrder.status).all()
    Counts: dict[str, dict[str, int]] = {}
    for ItemId, Status, Count in Rows:
        if ItemId:
            Counts.setdefault(ItemId, {})[Status] = int(Count)
    return Counts


def ItemPayload(Item: RewardItem, Counts: dict | None = None) -> dict:
    Mine = (Counts or {}).get(Item.id, {})
    return {
        "id": Item.id,
        "name": Item.name,
        "description": Item.description,
        "imageUrl": Item.image_url,
        "price": Item.price_coins,
        "stock": Item.stock,
        "inStock": Item.stock is None or Item.stock > 0,
        "isActive": bool(Item.is_active),
        "isStarter": Item.seed_key is not None,
        "sortOrder": Item.sort_order,
        "unlocked": sum(Mine.get(S, 0) for S in ("UNLOCKED", "READY", "COLLECTED")),
        "waiting": Mine.get("UNLOCKED", 0),
        "ready": Mine.get("READY", 0),
        "collected": Mine.get("COLLECTED", 0),
        "updatedAt": _Iso(Item.updated_at),
    }


def ListItems(Db: Session, *, ActiveOnly: bool = False) -> list[RewardItem]:
    Query = Db.query(RewardItem)
    if ActiveOnly:
        Query = Query.filter(RewardItem.is_active == True)
    return Query.order_by(RewardItem.sort_order.asc(), RewardItem.price_coins.asc(), RewardItem.name.asc()).all()


def AdminCatalogue(Db: Session) -> dict:
    Counts = _ItemCounts(Db)
    return {"items": [ItemPayload(Item, Counts) for Item in ListItems(Db)]}


# ---------- orders -------------------------------------------------------------

def OrderPayload(Order: RewardOrder) -> dict:
    return {
        "id": Order.id,
        "itemId": Order.item_id,
        "itemName": Order.item_name,
        "imageUrl": Order.item_image_url,
        "price": Order.price_coins,
        "status": Order.status,
        "pickupCode": Order.pickup_code,
        "unlockedAt": _Iso(Order.unlocked_at),
        "readyAt": _Iso(Order.ready_at),
        "collectedAt": _Iso(Order.collected_at),
        "closedAt": _Iso(Order.closed_at),
        "closeReason": Order.close_reason,
        "canCancel": Order.status == "UNLOCKED",
    }


def UnlockReward(Db: Session, StudentRow: Student, ItemId: str, RequestKey: str | None = None) -> tuple[RewardOrder, bool]:
    """Spend the coins and create the order, all in one transaction with the
    wallet (then the item) locked. Returns (order, created). The same
    RequestKey from the same student returns the first order instead of
    unlocking again (a double tap, a second tab, a retry)."""
    Key = (RequestKey or "").strip()[:64] or None
    UserId = StudentRow.user_id

    def _Earlier() -> RewardOrder | None:
        if not Key:
            return None
        return Db.query(RewardOrder).filter(RewardOrder.user_id == UserId, RewardOrder.request_key == Key).first()

    Found = _Earlier()
    if Found is not None:
        return Found, False

    Wallet = EconomyService.lock_wallet(Db, UserId)
    Found = _Earlier()  # a twin request may have finished while we waited for the lock
    if Found is not None:
        Db.rollback()
        return Found, False

    Item = Db.query(RewardItem).filter(RewardItem.id == ItemId).with_for_update().populate_existing().first()
    if Item is None or not Item.is_active:
        Db.rollback()
        raise RewardError(404, "NOT_FOUND", "This reward isn't in the store any more.")
    if Item.stock is not None and Item.stock <= 0:
        Db.rollback()
        raise RewardError(409, "OUT_OF_STOCK", "This reward is not available right now.")
    Price = int(Item.price_coins)
    if Wallet.coin_balance < Price:
        Short = Price - Wallet.coin_balance
        Db.rollback()
        raise RewardError(409, "NOT_ENOUGH_COINS", f"You need {Short:,} more coins to unlock this reward.")

    Order = RewardOrder(
        student_id=StudentRow.id,
        user_id=UserId,
        item_id=Item.id,
        item_name=Item.name,
        item_image_url=Item.image_url,
        price_coins=Price,
        status="UNLOCKED",
        pickup_code=NewPickupCode(Db),
        request_key=Key,
        unlocked_at=_Now(),
    )
    Db.add(Order)
    Db.flush()
    Spend = EconomyService.spend_coins(Db, Wallet, Price, "REWARD_UNLOCK", Order.id)
    Order.spend_transaction_id = Spend.id
    if Item.stock is not None:
        Item.stock -= 1
    try:
        Db.commit()
    except IntegrityError:
        # the same request key landed twice at once: keep the first
        Db.rollback()
        Found = _Earlier()
        if Found is not None:
            return Found, False
        raise
    Db.refresh(Order)
    from app.services.reward_notifications import NotifyUnlocked

    NotifyUnlocked(Db, Order)
    Db.refresh(Order)
    return Order, True


def _Close(Db: Session, Order: RewardOrder, Status: str, UserId: str | None, Reason: str | None) -> RewardOrder:
    """Cancel or reject: the coins and the stock go back. Expects the wallet
    and the order to be locked by the caller."""
    Wallet = EconomyService.lock_wallet(Db, Order.user_id)
    Refund = EconomyService.refund_coins(Db, Wallet, Order.price_coins, "REWARD_REFUND", Order.id)
    Order.refund_transaction_id = Refund.id
    Order.status = Status
    Order.closed_at = _Now()
    Order.closed_by_user_id = UserId
    Order.close_reason = Reason
    if Order.item_id:
        Item = Db.query(RewardItem).filter(RewardItem.id == Order.item_id).with_for_update().first()
        if Item is not None and Item.stock is not None:
            Item.stock += 1
    Db.commit()
    Db.refresh(Order)
    return Order


def _LockOrder(Db: Session, OrderId: str) -> RewardOrder | None:
    Probe = Db.query(RewardOrder.user_id).filter(RewardOrder.id == OrderId).first()
    if Probe is None:
        return None
    EconomyService.lock_wallet(Db, Probe.user_id)  # always wallet first, then the order
    return Db.query(RewardOrder).filter(RewardOrder.id == OrderId).with_for_update().populate_existing().first()


def CancelOrder(Db: Session, StudentRow: Student, OrderId: str) -> RewardOrder:
    """The student changed their mind: allowed until an admin marks it Ready."""
    Order = _LockOrder(Db, OrderId)
    if Order is None or Order.student_id != StudentRow.id:
        Db.rollback()
        raise RewardError(404, "NOT_FOUND", "Reward not found.")
    if Order.status != "UNLOCKED":
        Db.rollback()
        Message = {
            "READY": "This reward is already waiting for you at the centre, so it can't be cancelled here. Ask at the centre.",
            "COLLECTED": "You've already collected this reward.",
        }.get(Order.status, "This reward has already been cancelled.")
        raise RewardError(409, "CANNOT_CANCEL", Message)
    from app.services.reward_notifications import BalanceOf, NotifyGoalIfReached

    Before = BalanceOf(Db, Order.user_id)
    Order = _Close(Db, Order, "CANCELLED", StudentRow.user_id, None)
    NotifyGoalIfReached(Db, Order.user_id, Before, BalanceOf(Db, Order.user_id))
    Db.refresh(Order)
    return Order


def RejectOrder(Db: Session, OrderId: str, Reason: str | None, UserId: str | None) -> RewardOrder:
    Clean = " ".join(str(Reason or "").split())
    if not Clean:
        raise RewardError(400, "VALIDATION_ERROR", "Give a reason, so the student knows why.")
    if len(Clean) > 300:
        raise RewardError(400, "VALIDATION_ERROR", "Keep the reason to 300 characters.")
    Order = _LockOrder(Db, OrderId)
    if Order is None:
        Db.rollback()
        raise RewardError(404, "NOT_FOUND", "Order not found.")
    if Order.status not in OPEN:
        Db.rollback()
        raise RewardError(409, "ALREADY_CLOSED", f"This order is already {Order.status.lower()}.")
    from app.services.reward_notifications import BalanceOf, NotifyGoalIfReached, NotifyRejected

    Before = BalanceOf(Db, Order.user_id)
    Order = _Close(Db, Order, "REJECTED", UserId, Clean)
    NotifyRejected(Db, Order)
    NotifyGoalIfReached(Db, Order.user_id, Before, BalanceOf(Db, Order.user_id))
    Db.refresh(Order)
    return Order


def MarkReady(Db: Session, OrderIds: list[str], UserId: str | None) -> list[RewardOrder]:
    """Only UNLOCKED orders move; anything else is left as it is."""
    Ids = list(dict.fromkeys(OrderIds or []))
    if not Ids:
        return []
    Orders = Db.query(RewardOrder).filter(RewardOrder.id.in_(Ids)).with_for_update().all()
    Moved = []
    for Order in Orders:
        if Order.status == "UNLOCKED":
            Order.status = "READY"
            Order.ready_at = _Now()
            Order.ready_by_user_id = UserId
            Moved.append(Order)
    Db.commit()
    for Order in Moved:
        Db.refresh(Order)
    if Moved:
        from app.services.reward_notifications import NotifyReady

        NotifyReady(Db, Moved)
        for Order in Moved:
            Db.refresh(Order)
    return Moved


def MarkCollected(Db: Session, OrderId: str, UserId: str | None) -> RewardOrder:
    """Handed over at the centre. Allowed from READY, or straight from
    UNLOCKED when the item is already at the desk."""
    Order = Db.query(RewardOrder).filter(RewardOrder.id == OrderId).with_for_update().first()
    if Order is None:
        Db.rollback()
        raise RewardError(404, "NOT_FOUND", "Order not found.")
    if Order.status not in OPEN:
        Db.rollback()
        raise RewardError(409, "ALREADY_CLOSED", f"This order is already {Order.status.lower()}.")
    Now = _Now()
    if Order.ready_at is None:
        Order.ready_at = Now
        Order.ready_by_user_id = UserId
    Order.status = "COLLECTED"
    Order.collected_at = Now
    Order.collected_by_user_id = UserId
    Db.commit()
    Db.refresh(Order)
    from app.services.reward_notifications import NotifyCollected

    NotifyCollected(Db, Order)
    Db.refresh(Order)
    return Order


# ---------- goal ---------------------------------------------------------------

def SetGoal(Db: Session, StudentRow: Student, ItemId: str | None) -> RewardGoal | None:
    Goal = Db.query(RewardGoal).filter(RewardGoal.student_id == StudentRow.id).first()
    if not ItemId:
        if Goal is not None:
            Db.delete(Goal)
            Db.commit()
        return None
    Item = Db.get(RewardItem, ItemId)
    if Item is None or not Item.is_active:
        raise RewardError(404, "NOT_FOUND", "This reward isn't in the store any more.")
    if Goal is None:
        Goal = RewardGoal(student_id=StudentRow.id, item_id=Item.id)
        Db.add(Goal)
    else:
        Goal.item_id = Item.id
        Goal.created_at = _Now()
    Db.commit()
    Db.refresh(Goal)
    return Goal


# ---------- the student's store -------------------------------------------------

def StorePayload(Db: Session, StudentRow: Student) -> dict:
    Wallet = EconomyService.get_user_economy(Db, StudentRow.user_id)
    Balance = int(Wallet.coin_balance or 0)
    Goal = Db.query(RewardGoal).filter(RewardGoal.student_id == StudentRow.id).first()
    Items = []
    for Item in ListItems(Db, ActiveOnly=True):
        Payload = ItemPayload(Item)
        for Key in ("unlocked", "waiting", "ready", "collected", "isStarter", "sortOrder", "isActive", "updatedAt"):
            Payload.pop(Key, None)
        Payload["stock"] = None  # students see in stock / not available, not the count
        Payload["coinsToGo"] = max(0, Item.price_coins - Balance)
        Payload["progress"] = round(min(1.0, Balance / Item.price_coins), 4) if Item.price_coins else 1.0
        Payload["canUnlock"] = Payload["inStock"] and Balance >= Item.price_coins
        Payload["isGoal"] = Goal is not None and Goal.item_id == Item.id
        Items.append(Payload)
    Orders = (
        Db.query(RewardOrder)
        .filter(RewardOrder.student_id == StudentRow.id)
        .order_by(RewardOrder.unlocked_at.desc())
        .all()
    )
    GoalItem = next((Item for Item in Items if Item["isGoal"]), None)
    return {
        "balance": Balance,
        "lifetimeEarned": int(Wallet.lifetime_coins_earned or 0),
        "spent": -int(Db.query(func.coalesce(func.sum(EconomyTransaction.amount_coins), 0)).filter(EconomyTransaction.user_id == StudentRow.user_id, EconomyTransaction.transaction_type == "SPEND").scalar() or 0),
        "items": Items,
        "goal": GoalItem,
        "orders": [OrderPayload(Order) for Order in Orders],
        "counts": {
            "unlocked": sum(1 for Order in Orders if Order.status == "UNLOCKED"),
            "ready": sum(1 for Order in Orders if Order.status == "READY"),
            "collected": sum(1 for Order in Orders if Order.status == "COLLECTED"),
        },
    }


_SOURCE_LABELS = {
    "DPS_COMPLETION": "DPS Sheet",
    "DPS_COMPLETION_CORRECTION": "DPS Sheet (Score Corrected)",
    "MOCK_COMPLETION": "Mock Exam",
    "ASSESSMENT_COMPLETION": "Assessment",
}


def _ActivityNames(Db: Session, Rows: list) -> dict[str, str]:
    """What each coin was earned for, in the student's words:
    "DPS Sheet · IM-L2 · Lesson 7 · Sheet 3", "Mock Exam · Abacus Sprint 4",
    "Assessment · IM Level 2". Anything not found keeps the plain label."""
    from app.models import DPS, AssessmentAssignment, AssessmentAttempt, AssessmentBlueprint, Attempt, CompetitionMockAssignment, CompetitionMockExam, Lesson

    Names: dict[str, str] = {}
    Dps = {Row.reference_id for Row in Rows if Row.source_action.startswith("DPS_COMPLETION") and Row.reference_id}
    if Dps:
        for AttemptId, Number, LessonNumber, LevelCode in (
            Db.query(Attempt.id, DPS.dps_number, Lesson.lesson_number, Level.level_code)
            .join(DPS, DPS.id == Attempt.dps_id)
            .join(Lesson, Lesson.id == DPS.lesson_id)
            .outerjoin(Level, Level.id == Lesson.level_id)
            .filter(Attempt.id.in_(Dps))
            .all()
        ):
            Names[AttemptId] = " · ".join(Part for Part in (LevelCode, f"Lesson {LessonNumber}", f"Sheet {Number}") if Part)
    Mocks = {Row.reference_id for Row in Rows if Row.source_action == "MOCK_COMPLETION" and Row.reference_id}
    if Mocks:
        for AssignmentId, Title in (
            Db.query(CompetitionMockAssignment.id, CompetitionMockExam.title)
            .join(CompetitionMockExam, CompetitionMockExam.id == CompetitionMockAssignment.mock_exam_id)
            .filter(CompetitionMockAssignment.id.in_(Mocks))
            .all()
        ):
            Names[AssignmentId] = Title
    Assessments = {Row.reference_id for Row in Rows if Row.source_action == "ASSESSMENT_COMPLETION" and Row.reference_id}
    if Assessments:
        for AttemptId, Title in (
            Db.query(AssessmentAttempt.id, AssessmentBlueprint.title)
            .join(AssessmentAssignment, AssessmentAssignment.id == AssessmentAttempt.assessment_assignment_id)
            .join(AssessmentBlueprint, AssessmentBlueprint.id == AssessmentAssignment.blueprint_id)
            .filter(AssessmentAttempt.id.in_(Assessments))
            .all()
        ):
            Names[AttemptId] = Title
    return Names


def CoinHistory(Db: Session, UserId: str, Limit: int = 100, Before: str | None = None) -> dict:
    """Earned, spent and returned coins, newest first, in plain words."""
    Query = Db.query(EconomyTransaction).filter(EconomyTransaction.user_id == UserId, EconomyTransaction.amount_coins != 0)
    if Before:
        try:
            Cursor = datetime.fromisoformat(Before)
            Query = Query.filter(EconomyTransaction.created_at < Cursor)
        except ValueError:
            pass
    Rows = Query.order_by(EconomyTransaction.created_at.desc(), EconomyTransaction.id.desc()).limit(max(1, min(Limit, 200)) + 1).all()
    More = len(Rows) > Limit
    Rows = Rows[:Limit]
    OrderIds = [Row.reference_id for Row in Rows if Row.source_action in ("REWARD_UNLOCK", "REWARD_REFUND") and Row.reference_id]
    Names = dict(Db.query(RewardOrder.id, RewardOrder.item_name).filter(RewardOrder.id.in_(OrderIds)).all()) if OrderIds else {}
    try:
        Activities = _ActivityNames(Db, Rows)
    except Exception:  # noqa: BLE001 -- a label must never break the history
        Db.rollback()
        Activities = {}
    Entries = []
    for Row in Rows:
        if Row.source_action == "REWARD_UNLOCK":
            Label = f"Unlocked {Names.get(Row.reference_id, 'a reward')}"
        elif Row.source_action == "REWARD_REFUND":
            Label = f"Coins returned for {Names.get(Row.reference_id, 'a reward')}"
        else:
            Label = _SOURCE_LABELS.get(Row.source_action) or ("Mock Exam" if Row.source_action.startswith("MOCK") else "Coins Spent" if Row.amount_coins < 0 else "Coins Earned")
            if Activities.get(Row.reference_id):
                Label = f"{Label} · {Activities[Row.reference_id]}"
        Entries.append({"id": Row.id, "at": _Iso(Row.created_at), "type": Row.transaction_type, "coins": int(Row.amount_coins), "label": Label, "source": Row.source_action})
    return {"entries": Entries, "more": More, "next": Entries[-1]["at"] if More and Entries else None}


# ---------- admin lists ----------------------------------------------------------

def _People(Db: Session, StudentIds: set[str]) -> dict[str, dict]:
    if not StudentIds:
        return {}
    Rows = (
        Db.query(Student, User, Level.level_code)
        .join(User, User.id == Student.user_id)
        .outerjoin(Level, Level.id == Student.current_level_id)
        .filter(Student.id.in_(StudentIds))
        .all()
    )
    return {
        StudentRow.id: {
            "studentId": StudentRow.id,
            "studentCode": StudentRow.student_code,
            "name": UserRow.full_name,
            "photoUrl": StudentRow.photo_url or UserRow.photo_url,
            "levelCode": LevelCode,
            "isDemo": bool(StudentRow.is_demo),
            "isActive": bool(StudentRow.is_active),
        }
        for StudentRow, UserRow, LevelCode in Rows
    }


def _UserNames(Db: Session, Ids: set[str]) -> dict[str, str]:
    Ids = {Id for Id in Ids if Id}
    return dict(Db.query(User.id, User.full_name).filter(User.id.in_(Ids)).all()) if Ids else {}


def AdminOrders(Db: Session, *, Status: str | None = None, Search: str | None = None, Start: datetime | None = None, End: datetime | None = None, Limit: int = 500) -> list[dict]:
    from app.services.demo_students import RealStudentsClause

    Query = Db.query(RewardOrder).join(Student, Student.id == RewardOrder.student_id).join(User, User.id == Student.user_id).filter(RealStudentsClause(Db))
    if Status == "OPEN":
        Query = Query.filter(RewardOrder.status.in_(OPEN))
    elif Status in STATUSES:
        Query = Query.filter(RewardOrder.status == Status)
    if Search:
        Like = f"%{Search.strip()}%"
        Code = NormaliseCode(Search)
        Query = Query.filter(or_(User.full_name.ilike(Like), Student.student_code.ilike(Like), RewardOrder.item_name.ilike(Like), RewardOrder.pickup_code == Code))
    if Start is not None:
        Query = Query.filter(RewardOrder.unlocked_at >= Start)
    if End is not None:
        Query = Query.filter(RewardOrder.unlocked_at < End)
    Orders = Query.order_by(RewardOrder.unlocked_at.desc()).limit(max(1, min(Limit, 2000))).all()
    People = _People(Db, {Order.student_id for Order in Orders})
    Staff = _UserNames(Db, {Id for Order in Orders for Id in (Order.ready_by_user_id, Order.collected_by_user_id, Order.closed_by_user_id)})
    Out = []
    for Order in Orders:
        Payload = OrderPayload(Order)
        Payload.pop("canCancel", None)
        Payload["student"] = People.get(Order.student_id)
        Payload["readyBy"] = Staff.get(Order.ready_by_user_id)
        Payload["collectedBy"] = Staff.get(Order.collected_by_user_id)
        Payload["closedBy"] = "The student" if Order.status == "CANCELLED" else Staff.get(Order.closed_by_user_id)
        Out.append(Payload)
    return Out


def ShoppingList(Db: Session) -> list[dict]:
    """What to buy: every unlocked order not yet ready, per item (real
    students only, whatever the Show Demo switch says)."""
    Rows = (
        Db.query(RewardOrder.item_id, RewardOrder.item_name, func.count(RewardOrder.id), func.min(RewardOrder.unlocked_at))
        .join(Student, Student.id == RewardOrder.student_id)
        .filter(RewardOrder.status == "UNLOCKED", Student.is_demo == False)
        .group_by(RewardOrder.item_id, RewardOrder.item_name)
        .all()
    )
    Images = dict(Db.query(RewardItem.id, RewardItem.image_url).filter(RewardItem.id.in_([Row[0] for Row in Rows if Row[0]])).all()) if Rows else {}
    Out = [{"itemId": ItemId, "itemName": Name, "imageUrl": Images.get(ItemId), "count": int(Count), "oldest": _Iso(Oldest)} for ItemId, Name, Count, Oldest in Rows]
    return sorted(Out, key=lambda Row: (-Row["count"], Row["itemName"]))


def FindByCode(Db: Session, Code: str) -> dict | None:
    Clean = NormaliseCode(Code)
    Order = Db.query(RewardOrder).filter(RewardOrder.pickup_code == Clean).first()
    if Order is None:
        return None
    People = _People(Db, {Order.student_id})
    Open = (
        Db.query(RewardOrder)
        .filter(RewardOrder.student_id == Order.student_id, RewardOrder.status.in_(OPEN))
        .order_by(RewardOrder.unlocked_at.asc())
        .all()
    )
    return {"match": OrderPayload(Order), "student": People.get(Order.student_id), "open": [OrderPayload(Item) for Item in Open]}


def AdminCoins(Db: Session, *, Search: str | None = None, LevelId: str | None = None) -> list[dict]:
    """Every active student's coins: balance, earned, spent, open rewards."""
    from app.services.demo_students import RealStudentsClause

    Query = (
        Db.query(Student, User, UserEconomy, Level.level_code)
        .join(User, User.id == Student.user_id)
        .outerjoin(UserEconomy, UserEconomy.user_id == Student.user_id)
        .outerjoin(Level, Level.id == Student.current_level_id)
        .filter(Student.is_active == True, RealStudentsClause(Db))
    )
    if LevelId:
        Query = Query.filter(Student.current_level_id == LevelId)
    if Search:
        Like = f"%{Search.strip()}%"
        Query = Query.filter(or_(User.full_name.ilike(Like), Student.student_code.ilike(Like)))
    Rows = Query.all()
    UserIds = [UserRow.id for _, UserRow, _, _ in Rows]
    Spent = dict(
        Db.query(EconomyTransaction.user_id, func.sum(EconomyTransaction.amount_coins))
        .filter(EconomyTransaction.user_id.in_(UserIds), EconomyTransaction.transaction_type.in_(("SPEND", "REFUND")))
        .group_by(EconomyTransaction.user_id)
        .all()
    ) if UserIds else {}
    OpenCounts = dict(
        Db.query(RewardOrder.user_id, func.count(RewardOrder.id))
        .filter(RewardOrder.user_id.in_(UserIds), RewardOrder.status.in_(OPEN))
        .group_by(RewardOrder.user_id)
        .all()
    ) if UserIds else {}
    Out = []
    for StudentRow, UserRow, Wallet, LevelCode in Rows:
        Out.append({
            "studentId": StudentRow.id,
            "studentCode": StudentRow.student_code,
            "name": UserRow.full_name,
            "photoUrl": StudentRow.photo_url or UserRow.photo_url,
            "levelCode": LevelCode,
            "isDemo": bool(StudentRow.is_demo),
            "balance": int(Wallet.coin_balance) if Wallet else 0,
            "earned": int(Wallet.lifetime_coins_earned) if Wallet else 0,
            "spent": -int(Spent.get(UserRow.id) or 0),
            "openRewards": int(OpenCounts.get(UserRow.id) or 0),
        })
    return sorted(Out, key=lambda Row: (-Row["balance"], Row["name"] or ""))


def LedgerMismatches(Db: Session) -> list[dict]:
    """Wallets whose balance is not the sum of their ledger (should be none
    for anyone whose coins were all earned through the ledger)."""
    Sums = dict(Db.query(EconomyTransaction.user_id, func.sum(EconomyTransaction.amount_coins)).group_by(EconomyTransaction.user_id).all())
    Out = []
    for Wallet in Db.query(UserEconomy).all():
        Ledger = int(Sums.get(Wallet.user_id) or 0)
        if Ledger != int(Wallet.coin_balance or 0):
            Out.append({"userId": Wallet.user_id, "balance": int(Wallet.coin_balance or 0), "ledger": Ledger})
    return Out


def AdminSummary(Db: Session) -> dict:
    """The tiles at the top of the admin page (real students only, whatever
    the Show Demo switch says), and what's in the catalogue."""
    from app.services.birthday_service import TodayIndia, INDIA

    Real = Db.query(RewardOrder.status, func.count(RewardOrder.id)).join(Student, Student.id == RewardOrder.student_id).filter(Student.is_demo == False)  # noqa: E712
    ByStatus = dict(Real.group_by(RewardOrder.status).all())
    First = TodayIndia().replace(day=1)
    MonthStart = datetime(First.year, First.month, 1, tzinfo=INDIA)
    Collected = (
        Db.query(func.count(RewardOrder.id))
        .join(Student, Student.id == RewardOrder.student_id)
        .filter(Student.is_demo == False, RewardOrder.status == "COLLECTED", RewardOrder.collected_at >= MonthStart)  # noqa: E712
        .scalar()
    )
    Wallets = (
        Db.query(func.coalesce(func.sum(UserEconomy.coin_balance), 0))
        .join(Student, Student.user_id == UserEconomy.user_id)
        .filter(Student.is_demo == False, Student.is_active == True)  # noqa: E712
        .scalar()
    )
    Items = Db.query(RewardItem).all()
    return {
        "toPrepare": int(ByStatus.get("UNLOCKED", 0)),
        "ready": int(ByStatus.get("READY", 0)),
        "collectedThisMonth": int(Collected or 0),
        "coinsWithStudents": int(Wallets or 0),
        "items": {
            "active": sum(1 for Item in Items if Item.is_active),
            "off": sum(1 for Item in Items if not Item.is_active),
            "outOfStock": sum(1 for Item in Items if Item.is_active and Item.stock is not None and Item.stock <= 0),
        },
    }


def CoinLevels(Db: Session) -> list[dict]:
    """Levels that active (real) students are on, for the Student Coins filter."""
    from app.services.demo_students import RealStudentsClause

    Rows = (
        Db.query(Level.id, Level.level_code)
        .join(Student, Student.current_level_id == Level.id)
        .filter(Student.is_active == True, RealStudentsClause(Db))  # noqa: E712
        .distinct()
        .all()
    )
    return [{"id": Id, "code": Code} for Id, Code in sorted(Rows, key=lambda Row: Row[1] or "")]
