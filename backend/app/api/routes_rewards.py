"""Rewards API (2026-10-18). Plan: `claude/mathpath-rewards-plan-oct18.md`.

Student: the store (their balance, every reward and how close they are,
their goal and their rewards), unlock, cancel, goal, coin history. The
student always comes from the session, never from the address.

Admin: the catalogue (add, edit, photo, order, on/off), the orders (to
prepare, shopping list, mark ready, hand over by pickup code, reject with a
reason), and every student's coins. Demo accounts follow the Show Demo
switch. Teachers have no Rewards routes."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.database import get_db
from app.dependencies import get_current_student, require_roles
from app.models import Student, User
from app.services import reward_service as R
from app.services.birthday_service import INDIA
from app.services.reward_export import BuildRewardsWorkbook
from app.services.reward_images import RewardImageError, SaveRewardImage


def _Fail(Error: R.RewardError):
    api_error(Error.status, Error.code, Error.message)


# ---------- student ---------------------------------------------------------------

student_router = APIRouter(prefix="/api/student/rewards", tags=["student-rewards"])


class UnlockBody(BaseModel):
    itemId: str
    requestKey: str | None = None


class GoalBody(BaseModel):
    itemId: str | None = None


@student_router.get("")
def student_store(db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    return R.StorePayload(db, student)


@student_router.post("/unlock")
def student_unlock(body: UnlockBody, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    try:
        Order, Created = R.UnlockReward(db, student, body.itemId, body.requestKey)
    except R.RewardError as Error:
        _Fail(Error)
    return {"order": R.OrderPayload(Order), "created": Created, "store": R.StorePayload(db, student)}


@student_router.post("/orders/{order_id}/cancel")
def student_cancel(order_id: str, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    try:
        Order = R.CancelOrder(db, student, order_id)
    except R.RewardError as Error:
        _Fail(Error)
    return {"order": R.OrderPayload(Order), "store": R.StorePayload(db, student)}


@student_router.put("/goal")
def student_goal(body: GoalBody, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    try:
        R.SetGoal(db, student, body.itemId)
    except R.RewardError as Error:
        _Fail(Error)
    return R.StorePayload(db, student)


@student_router.get("/history")
def student_history(limit: int = Query(default=50, ge=1, le=200), before: str | None = None, db: Session = Depends(get_db), student: Student = Depends(get_current_student)):
    return R.CoinHistory(db, student.user_id, limit, before)


# ---------- admin -----------------------------------------------------------------

admin_router = APIRouter(prefix="/api/admin/rewards", tags=["admin-rewards"])
admin_dep = require_roles("SUPER_ADMIN", "ADMIN")


class ItemBody(BaseModel):
    name: str | None = None
    description: str | None = None
    price: int | None = None
    stock: int | None = None
    isActive: bool | None = None


class ReorderBody(BaseModel):
    itemIds: list[str]


class ReadyBody(BaseModel):
    orderIds: list[str]


class RejectBody(BaseModel):
    reason: str | None = None


@admin_router.get("/items")
def admin_items(db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return R.AdminCatalogue(db)


@admin_router.post("/items")
def admin_create_item(body: ItemBody, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    try:
        Item = R.CreateItem(db, Name=body.name, Price=body.price, Description=body.description, Stock=body.stock, IsActive=True if body.isActive is None else body.isActive, UserId=user.id)
    except R.RewardError as Error:
        _Fail(Error)
    return {"item": R.ItemPayload(Item), **R.AdminCatalogue(db)}


@admin_router.patch("/items/{item_id}")
def admin_update_item(item_id: str, body: ItemBody, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    Sent = body.model_dump(exclude_unset=True)
    Fields = {}
    for Key, Arg in (("name", "Name"), ("description", "Description"), ("price", "Price"), ("stock", "Stock"), ("isActive", "IsActive")):
        if Key in Sent:
            Fields[Arg] = Sent[Key]
    try:
        Item = R.UpdateItem(db, item_id, UserId=user.id, **Fields)
    except R.RewardError as Error:
        _Fail(Error)
    return {"item": R.ItemPayload(Item), **R.AdminCatalogue(db)}


@admin_router.post("/items/{item_id}/image")
async def admin_item_image(item_id: str, file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    Data = await file.read(5 * 1024 * 1024 + 1)  # one byte over the limit is enough to refuse it
    try:
        Url = SaveRewardImage(Data, item_id[:8])
    except RewardImageError as Error:
        api_error(400, "INVALID_FILE", str(Error))
    try:
        Item = R.SetItemImage(db, item_id, Url, user.id)
    except R.RewardError as Error:
        _Fail(Error)
    return {"item": R.ItemPayload(Item)}


@admin_router.post("/items/reorder")
def admin_reorder(body: ReorderBody, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    R.ReorderItems(db, body.itemIds)
    return R.AdminCatalogue(db)


def _Day(Value: str | None, Name: str):
    if not Value:
        return None
    try:
        return datetime.fromisoformat(Value).replace(tzinfo=INDIA) if len(Value) <= 10 else datetime.fromisoformat(Value)
    except ValueError:
        api_error(400, "VALIDATION_ERROR", f"{Name} must be a date like 2026-10-18.")


@admin_router.get("/orders")
def admin_orders(
    status: str | None = None,
    q: str | None = None,
    start: str | None = None,
    end: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(admin_dep),
):
    Start = _Day(start, "Start")
    End = _Day(end, "End")
    if End is not None and end and len(end) <= 10:
        End = End + timedelta(days=1)  # the whole of the end day
    return {"orders": R.AdminOrders(db, Status=(status or "").upper() or None, Search=q, Start=Start, End=End)}


@admin_router.get("/summary")
def admin_summary(db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return R.AdminSummary(db)


@admin_router.get("/orders/export")
def admin_orders_export(
    status: str | None = None,
    q: str | None = None,
    start: str | None = None,
    end: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(admin_dep),
):
    Start = _Day(start, "Start")
    End = _Day(end, "End")
    if End is not None and end and len(end) <= 10:
        End = End + timedelta(days=1)
    Orders = R.AdminOrders(db, Status=(status or "").upper() or None, Search=q, Start=Start, End=End, Limit=2000)
    return Response(
        content=BuildRewardsWorkbook(Orders),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="MathPath Rewards.xlsx"', "Cache-Control": "no-store"},
    )


@admin_router.get("/shopping-list")
def admin_shopping_list(db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return {"items": R.ShoppingList(db)}


@admin_router.get("/orders/by-code/{code}")
def admin_find_code(code: str, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    Found = R.FindByCode(db, code)
    if Found is None:
        api_error(404, "NOT_FOUND", "No reward has that pickup code. Check the letters and try again.")
    return Found


@admin_router.post("/orders/ready")
def admin_mark_ready(body: ReadyBody, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    Moved = R.MarkReady(db, body.orderIds, user.id)
    return {"moved": [R.OrderPayload(Order) for Order in Moved]}


@admin_router.post("/orders/{order_id}/collect")
def admin_collect(order_id: str, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    try:
        Order = R.MarkCollected(db, order_id, user.id)
    except R.RewardError as Error:
        _Fail(Error)
    return {"order": R.OrderPayload(Order)}


@admin_router.post("/orders/{order_id}/reject")
def admin_reject(order_id: str, body: RejectBody, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    try:
        Order = R.RejectOrder(db, order_id, body.reason, user.id)
    except R.RewardError as Error:
        _Fail(Error)
    return {"order": R.OrderPayload(Order)}


@admin_router.get("/coins")
def admin_coins(q: str | None = None, levelId: str | None = None, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return {"students": R.AdminCoins(db, Search=q, LevelId=levelId), "levels": R.CoinLevels(db)}


@admin_router.get("/coins/{student_id}/history")
def admin_coin_history(student_id: str, limit: int = Query(default=100, ge=1, le=200), before: str | None = None, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    StudentRow = db.get(Student, student_id)
    if StudentRow is None:
        api_error(404, "NOT_FOUND", "Student not found.")
    return R.CoinHistory(db, StudentRow.user_id, limit, before)
