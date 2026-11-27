"""Billing Release 2 (2026-11-27, Shailesh): stock of books and kit at each
centre (client document §8, answers G1-G9).

  * A balance per item and centre, changed only together with a movement
    row: OPENING, INWARD (supplier, bill number, unit cost), ISSUE (a line
    of an invoice), CANCEL_RETURN (that invoice cancelled), TRANSFER_OUT /
    TRANSFER_IN, WRITE_OFF (with a reason). Movements are never edited or
    deleted; the ledger always adds up to the balance.
  * Balances are locked (SELECT ... FOR UPDATE, in item-then-centre order)
    before they change, so two sales can never take the last one and the
    balance never goes below zero (UAT 5 and 12).
  * Tracking switch: off when this is deployed. While it is off nothing is
    counted and nothing is blocked, so invoicing works exactly as before
    until the opening stock has been entered and tracking is switched on.
  * Which centre a student's stock comes from: their centre if it holds
    stock, else the centre that supplies it (Online -> Rajarhat), else the
    default stock centre.
  * Returns from parents are not taken (G8); only a cancelled invoice puts
    its stock back.
"""
from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import FeeItem, InventorySettings, PaymentCentre, PaymentInvoice, PaymentInvoiceLine, StockBalance, StockMovement, Student, User
from app.services.payments.articles_service import EnsureInventorySettings, KindOf
from app.services.payments.audit import WritePaymentAudit
from app.services.payments.money import FormatIndianRupees, ParseRupeesToPaise

MOVEMENT_TYPES = {
    "OPENING": "Opening stock",
    "INWARD": "Stock received",
    "ISSUE": "Issued on invoice",
    "CANCEL_RETURN": "Returned: invoice cancelled",
    "TRANSFER_OUT": "Sent to another centre",
    "TRANSFER_IN": "Received from another centre",
    "WRITE_OFF": "Written off",
}
MAX_QUANTITY = 100000
MAX_LINES = 50


def _Today() -> date:
    from app.services.payments.invoices_service import TodayInIndia

    return TodayInIndia()


def _Clean(Value: Any, Limit: int) -> str | None:
    Text = re.sub(r"\s+", " ", str(Value or "")).strip()
    return Text[:Limit] or None


def _Quantity(Value: Any, Label: str = "Quantity", *, AllowZero: bool = False) -> int:
    try:
        Number = int(str(Value).strip())
    except (TypeError, ValueError):
        api_error(422, "QUANTITY_INVALID", f"{Label} must be a whole number.")
    if Number < 0 or (Number == 0 and not AllowZero):
        api_error(422, "QUANTITY_INVALID", f"{Label} must be {'0 or more' if AllowZero else 'at least 1'}.")
    if Number > MAX_QUANTITY:
        api_error(422, "QUANTITY_INVALID", f"{Label} can be at most {MAX_QUANTITY:,}.")
    return Number


def TrackingOn(db: Session) -> bool:
    Row = db.get(InventorySettings, "default")
    return bool(Row and Row.stock_tracking_enabled)


def StockCentreId(db: Session, CentreId: str | None) -> str | None:
    """Where a student at CentreId is supplied from."""
    Settings = EnsureInventorySettings(db)
    Centre = db.get(PaymentCentre, CentreId) if CentreId else None
    if Centre and Centre.holds_stock and Centre.is_active:
        return Centre.id
    if Centre and Centre.stock_from_centre_id:
        Supplier = db.get(PaymentCentre, Centre.stock_from_centre_id)
        if Supplier and Supplier.holds_stock:
            return Supplier.id
    Default = db.get(PaymentCentre, Settings.default_stock_centre_id) if Settings.default_stock_centre_id else None
    if Default and Default.holds_stock:
        return Default.id
    Any_ = db.query(PaymentCentre).filter(PaymentCentre.holds_stock == True, PaymentCentre.is_active == True).order_by(PaymentCentre.display_order.asc()).first()  # noqa: E712
    return Any_.id if Any_ else None


def _StockCentre(db: Session, CentreId: Any) -> PaymentCentre:
    Centre = db.get(PaymentCentre, str(CentreId or "")) if CentreId else None
    if not Centre:
        api_error(422, "CENTRE_REQUIRED", "Choose the centre.")
    if not Centre.holds_stock:
        api_error(422, "CENTRE_HOLDS_NO_STOCK", f"{Centre.name} does not keep stock. Choose a centre that does, or switch on Keeps Stock for it.")
    return Centre


def _StockItem(db: Session, FeeItemId: Any) -> FeeItem:
    Item = db.get(FeeItem, str(FeeItemId or "")) if FeeItemId else None
    if not Item:
        api_error(422, "FEE_ITEM_NOT_FOUND", "Choose an item.")
    if not Item.is_stock:
        api_error(422, "NOT_A_STOCK_ITEM", f"Stock is not counted for {Item.name}. Switch on Count Stock for it in Fee Setup first.")
    return Item


def LockBalances(db: Session, Pairs: list[tuple[str, str]]) -> dict[tuple[str, str], StockBalance]:
    """Locks (and makes, at 0, when missing) the balance rows, always in the
    same order so two requests can never deadlock."""
    Result: dict[tuple[str, str], StockBalance] = {}
    for ItemId, CentreId in sorted(set(Pairs)):
        Row = db.query(StockBalance).filter(StockBalance.fee_item_id == ItemId, StockBalance.centre_id == CentreId).with_for_update().first()
        if not Row:
            try:
                with db.begin_nested():
                    db.add(StockBalance(fee_item_id=ItemId, centre_id=CentreId, quantity=0))
                    db.flush()
            except IntegrityError:
                pass
            Row = db.query(StockBalance).filter(StockBalance.fee_item_id == ItemId, StockBalance.centre_id == CentreId).with_for_update().one()
        db.refresh(Row)
        Result[(ItemId, CentreId)] = Row
    return Result


def _Move(
    db: Session,
    Balance: StockBalance,
    *,
    Type: str,
    Quantity: int,
    Day: date,
    Actor: User | None,
    **Fields: Any,
) -> StockMovement:
    After = Balance.quantity + Quantity
    if After < 0:
        Item = db.get(FeeItem, Balance.fee_item_id)
        Centre = db.get(PaymentCentre, Balance.centre_id)
        api_error(
            409, "OUT_OF_STOCK",
            f"Only {Balance.quantity} of {Item.name if Item else 'this item'} {'is' if Balance.quantity == 1 else 'are'} in stock at {Centre.name if Centre else 'the centre'}; {-Quantity} needed.",
        )
    Balance.quantity = After
    Row = StockMovement(
        fee_item_id=Balance.fee_item_id,
        centre_id=Balance.centre_id,
        movement_type=Type,
        quantity=Quantity,
        balance_after=After,
        movement_date=Day,
        actor_user_id=Actor.id if Actor else None,
        actor_name=Actor.full_name if Actor else None,
        **Fields,
    )
    db.add(Row)
    db.flush()
    return Row


# --------------------------------------------------------------------------
# Invoices: issue on raise, return on cancel
# --------------------------------------------------------------------------

def CheckAvailable(db: Session, Needs: dict[tuple[str, str], int], *, Lock: bool) -> list[dict[str, Any]]:
    """What is short for these needs (item, centre) -> quantity. Empty when
    tracking is off."""
    if not TrackingOn(db) or not Needs:
        return []
    if Lock:
        Balances = LockBalances(db, list(Needs))
        Held = {Key: Row.quantity for Key, Row in Balances.items()}
    else:
        Held = {}
        for (ItemId, CentreId) in Needs:
            Row = db.query(StockBalance).filter(StockBalance.fee_item_id == ItemId, StockBalance.centre_id == CentreId).first()
            Held[(ItemId, CentreId)] = Row.quantity if Row else 0
    Short = []
    for (ItemId, CentreId), Quantity in sorted(Needs.items()):
        if Held.get((ItemId, CentreId), 0) < Quantity:
            Item = db.get(FeeItem, ItemId)
            Centre = db.get(PaymentCentre, CentreId)
            Short.append({
                "feeItemId": ItemId,
                "name": Item.name if Item else ItemId,
                "centreId": CentreId,
                "centreName": Centre.name if Centre else CentreId,
                "inStock": Held.get((ItemId, CentreId), 0),
                "needed": Quantity,
            })
    return Short


def ShortMessage(Short: list[dict[str, Any]]) -> str:
    Parts = [f"{Row['name']}: {Row['inStock']} in stock at {Row['centreName']}, {Row['needed']} needed" for Row in Short]
    return "Not enough stock. " + "; ".join(Parts) + "."


def IssueForInvoice(db: Session, Invoice: PaymentInvoice, Lines: list[PaymentInvoiceLine], Actor: User | None) -> int:
    """Takes the invoice's stock lines out of stock. Raises OUT_OF_STOCK
    (and the caller's transaction is rolled back) when any is short.
    Returns how many movements were written."""
    if not TrackingOn(db):
        return 0
    Needs: dict[tuple[str, str], int] = {}
    for Line in Lines:
        if Line.is_stock and Line.fee_item_id and Line.stock_centre_id and Line.quantity > 0:
            Key = (Line.fee_item_id, Line.stock_centre_id)
            Needs[Key] = Needs.get(Key, 0) + Line.quantity
    if not Needs:
        return 0
    Balances = LockBalances(db, list(Needs))
    Short = []
    for Key, Quantity in Needs.items():
        if Balances[Key].quantity < Quantity:
            Item = db.get(FeeItem, Key[0])
            Centre = db.get(PaymentCentre, Key[1])
            Short.append({"name": Item.name if Item else Key[0], "centreName": Centre.name if Centre else Key[1], "inStock": Balances[Key].quantity, "needed": Quantity})
    if Short:
        api_error(409, "OUT_OF_STOCK", ShortMessage(Short))
    Count = 0
    for Line in Lines:
        if Line.is_stock and Line.fee_item_id and Line.stock_centre_id and Line.quantity > 0:
            _Move(
                db, Balances[(Line.fee_item_id, Line.stock_centre_id)], Type="ISSUE", Quantity=-Line.quantity, Day=Invoice.invoice_date,
                Actor=Actor, invoice_id=Invoice.id, invoice_line_id=Line.id, student_id=Invoice.student_id,
            )
            Count += 1
    return Count


def ReturnForInvoice(db: Session, Invoice: PaymentInvoice, Actor: User | None) -> int:
    """Puts back what the invoice took out (it is being cancelled). Works
    even if tracking has since been switched off, so the ledger always
    balances (client answer I10)."""
    Issued = db.query(StockMovement).filter(StockMovement.invoice_id == Invoice.id).all()
    Net: dict[tuple[str, str, str | None], int] = {}
    for Row in Issued:
        if Row.movement_type in ("ISSUE", "CANCEL_RETURN"):
            Key = (Row.fee_item_id, Row.centre_id, Row.invoice_line_id)
            Net[Key] = Net.get(Key, 0) + Row.quantity
    Owed = {Key: -Quantity for Key, Quantity in Net.items() if Quantity < 0}
    if not Owed:
        return 0
    Balances = LockBalances(db, [(ItemId, CentreId) for ItemId, CentreId, _ in Owed])
    for (ItemId, CentreId, LineId), Quantity in sorted(Owed.items(), key=lambda Pair: (Pair[0][0], Pair[0][1], Pair[0][2] or "")):
        _Move(
            db, Balances[(ItemId, CentreId)], Type="CANCEL_RETURN", Quantity=Quantity, Day=_Today(), Actor=Actor,
            invoice_id=Invoice.id, invoice_line_id=LineId, student_id=Invoice.student_id, reason=Invoice.cancel_reason,
        )
    return len(Owed)


# --------------------------------------------------------------------------
# Stock in, transfers, write-offs, opening stock
# --------------------------------------------------------------------------

def _ParseDay(Value: Any) -> date:
    from app.services.payments.invoices_service import _ParseDate

    Day = _ParseDate(Value, "Date") or _Today()
    if Day > _Today():
        api_error(422, "DATE_IN_FUTURE", "The date cannot be in the future.")
    if Day < date(2020, 1, 1):
        api_error(422, "DATE_INVALID", "The date looks wrong. Please check the year.")
    return Day


def _Lines(Request: dict[str, Any]) -> list[dict[str, Any]]:
    Lines = [Line for Line in (Request.get("lines") or []) if Line and Line.get("feeItemId")]
    if not Lines:
        api_error(422, "LINES_REQUIRED", "Add at least one item.")
    if len(Lines) > MAX_LINES:
        api_error(422, "TOO_MANY_LINES", f"Add at most {MAX_LINES} items at a time.")
    return Lines


def RecordInward(db: Session, *, Request: dict[str, Any], Actor: User | None) -> dict[str, Any]:
    """Stock received from a supplier (or printed in-house)."""
    Centre = _StockCentre(db, Request.get("centreId"))
    Day = _ParseDay(Request.get("date"))
    Supplier = _Clean(Request.get("supplier"), 150)
    Bill = _Clean(Request.get("billNumber"), 80)
    Note = _Clean(Request.get("note"), 300)
    Parsed = []
    for Line in _Lines(Request):
        Item = _StockItem(db, Line.get("feeItemId"))
        Quantity = _Quantity(Line.get("quantity"))
        Raw = Line.get("unitCost")
        Cost = None if Raw in (None, "") else ParseRupeesToPaise(Raw, FieldLabel=f"Cost of {Item.name}", AllowZero=True)
        Parsed.append((Item, Quantity, Cost))
    Balances = LockBalances(db, [(Item.id, Centre.id) for Item, _, _ in Parsed])
    Moves = []
    for Item, Quantity, Cost in Parsed:
        Moves.append(_Move(db, Balances[(Item.id, Centre.id)], Type="INWARD", Quantity=Quantity, Day=Day, Actor=Actor,
                           unit_cost_paise=Cost, supplier=Supplier, bill_number=Bill, reason=Note))
        if Cost is not None:
            Item.cost_paise = Cost
    WritePaymentAudit(db, EntityType="STOCK", EntityId=Centre.id, Action="INWARD", Actor=Actor, After={
        "centre": Centre.name, "date": Day.isoformat(), "supplier": Supplier, "billNumber": Bill,
        "items": [{"item": Item.name, "quantity": Quantity} for Item, Quantity, _ in Parsed],
    }, Reason=Note)
    db.commit()
    return {"recorded": len(Moves), "summary": StockSummary(db)}


def RecordOpening(db: Session, *, Request: dict[str, Any], Actor: User | None) -> dict[str, Any]:
    """Opening stock at a centre (G1): sets each item's count. Each line
    becomes an OPENING movement of the difference, so the ledger still adds
    up if it is entered twice."""
    Centre = _StockCentre(db, Request.get("centreId"))
    Day = _ParseDay(Request.get("date"))
    Parsed = [(_StockItem(db, Line.get("feeItemId")), _Quantity(Line.get("quantity"), AllowZero=True)) for Line in _Lines(Request)]
    Balances = LockBalances(db, [(Item.id, Centre.id) for Item, _ in Parsed])
    Changed = []
    for Item, Count in Parsed:
        Row = Balances[(Item.id, Centre.id)]
        Difference = Count - Row.quantity
        if Difference:
            _Move(db, Row, Type="OPENING", Quantity=Difference, Day=Day, Actor=Actor, reason="Opening stock count")
            Changed.append({"item": Item.name, "count": Count})
    if Changed:
        WritePaymentAudit(db, EntityType="STOCK", EntityId=Centre.id, Action="OPENING", Actor=Actor, After={"centre": Centre.name, "date": Day.isoformat(), "items": Changed})
    db.commit()
    return {"recorded": len(Changed), "summary": StockSummary(db)}


def RecordTransfer(db: Session, *, Request: dict[str, Any], Actor: User | None) -> dict[str, Any]:
    From = _StockCentre(db, Request.get("fromCentreId"))
    To = _StockCentre(db, Request.get("toCentreId"))
    if From.id == To.id:
        api_error(422, "SAME_CENTRE", "Choose two different centres.")
    Day = _ParseDay(Request.get("date"))
    Note = _Clean(Request.get("note"), 300)
    Parsed = [(_StockItem(db, Line.get("feeItemId")), _Quantity(Line.get("quantity"))) for Line in _Lines(Request)]
    Balances = LockBalances(db, [(Item.id, From.id) for Item, _ in Parsed] + [(Item.id, To.id) for Item, _ in Parsed])
    TransferId = str(uuid.uuid4())
    for Item, Quantity in Parsed:
        _Move(db, Balances[(Item.id, From.id)], Type="TRANSFER_OUT", Quantity=-Quantity, Day=Day, Actor=Actor, transfer_id=TransferId, reason=Note or f"To {To.name}")
        _Move(db, Balances[(Item.id, To.id)], Type="TRANSFER_IN", Quantity=Quantity, Day=Day, Actor=Actor, transfer_id=TransferId, reason=Note or f"From {From.name}")
    WritePaymentAudit(db, EntityType="STOCK", EntityId=TransferId, Action="TRANSFER", Actor=Actor, After={
        "from": From.name, "to": To.name, "date": Day.isoformat(), "items": [{"item": Item.name, "quantity": Quantity} for Item, Quantity in Parsed],
    }, Reason=Note)
    db.commit()
    return {"recorded": len(Parsed), "summary": StockSummary(db)}


def RecordWriteOff(db: Session, *, Request: dict[str, Any], Actor: User | None) -> dict[str, Any]:
    Centre = _StockCentre(db, Request.get("centreId"))
    Day = _ParseDay(Request.get("date"))
    Reason = _Clean(Request.get("reason"), 300)
    if not Reason:
        api_error(422, "REASON_REQUIRED", "Please say why the stock is being written off (damaged, lost ...).")
    Parsed = [(_StockItem(db, Line.get("feeItemId")), _Quantity(Line.get("quantity"))) for Line in _Lines(Request)]
    Balances = LockBalances(db, [(Item.id, Centre.id) for Item, _ in Parsed])
    for Item, Quantity in Parsed:
        _Move(db, Balances[(Item.id, Centre.id)], Type="WRITE_OFF", Quantity=-Quantity, Day=Day, Actor=Actor, reason=Reason)
    WritePaymentAudit(db, EntityType="STOCK", EntityId=Centre.id, Action="WRITE_OFF", Actor=Actor, After={
        "centre": Centre.name, "date": Day.isoformat(), "items": [{"item": Item.name, "quantity": Quantity} for Item, Quantity in Parsed],
    }, Reason=Reason)
    db.commit()
    return {"recorded": len(Parsed), "summary": StockSummary(db)}


# --------------------------------------------------------------------------
# Settings
# --------------------------------------------------------------------------

def InventorySettingsPayload(db: Session) -> dict[str, Any]:
    Settings = EnsureInventorySettings(db)
    Centres = db.query(PaymentCentre).order_by(PaymentCentre.display_order.asc(), PaymentCentre.name.asc()).all()
    Names = {Row.id: Row.name for Row in Centres}
    StockItems = db.query(FeeItem).filter(FeeItem.is_stock == True).count()  # noqa: E712
    Movements = db.query(StockMovement).count()
    return {
        "stockTrackingEnabled": bool(Settings.stock_tracking_enabled),
        "trackingStartedAt": Settings.tracking_started_at.isoformat() if Settings.tracking_started_at else None,
        "lowStockThreshold": Settings.low_stock_threshold,
        "defaultStockCentreId": Settings.default_stock_centre_id,
        "defaultStockCentreName": Names.get(Settings.default_stock_centre_id),
        "autoBookInvoices": bool(Settings.auto_book_invoices),
        "stockItemCount": StockItems,
        "movementCount": Movements,
        "centres": [
            {
                "centreId": Row.id,
                "name": Row.name,
                "isActive": bool(Row.is_active),
                "holdsStock": bool(Row.holds_stock),
                "stockFromCentreId": Row.stock_from_centre_id,
                "stockFromCentreName": Names.get(Row.stock_from_centre_id),
            }
            for Row in Centres
        ],
    }


def UpdateInventorySettings(db: Session, *, Request: dict[str, Any], Actor: User | None) -> dict[str, Any]:
    Settings = db.query(InventorySettings).filter(InventorySettings.id == EnsureInventorySettings(db).id).with_for_update().one()
    Before = {
        "stockTrackingEnabled": bool(Settings.stock_tracking_enabled),
        "lowStockThreshold": Settings.low_stock_threshold,
        "defaultStockCentreId": Settings.default_stock_centre_id,
        "autoBookInvoices": bool(Settings.auto_book_invoices),
    }
    if "lowStockThreshold" in Request and Request["lowStockThreshold"] is not None:
        Settings.low_stock_threshold = _Quantity(Request["lowStockThreshold"], "Low stock level", AllowZero=True)
    if Request.get("defaultStockCentreId"):
        Settings.default_stock_centre_id = _StockCentre(db, Request["defaultStockCentreId"]).id
    if "autoBookInvoices" in Request and Request["autoBookInvoices"] is not None:
        Settings.auto_book_invoices = bool(Request["autoBookInvoices"])
    if "stockTrackingEnabled" in Request and Request["stockTrackingEnabled"] is not None:
        On = bool(Request["stockTrackingEnabled"])
        if On and not Settings.stock_tracking_enabled:
            if not db.query(PaymentCentre).filter(PaymentCentre.holds_stock == True).count():  # noqa: E712
                api_error(422, "NO_STOCK_CENTRE", "No centre keeps stock yet. Switch on Keeps Stock for a centre first.")
            Settings.tracking_started_at = datetime.now(timezone.utc)
        if not On and Settings.stock_tracking_enabled and not _Clean(Request.get("reason"), 300):
            api_error(422, "REASON_REQUIRED", "Please give a reason for switching stock tracking off.")
        Settings.stock_tracking_enabled = On
    for Row in Request.get("centres") or []:
        Centre = db.get(PaymentCentre, str((Row or {}).get("centreId") or ""))
        if not Centre:
            api_error(404, "CENTRE_NOT_FOUND", "One of the centres was not found. Refresh and try again.")
        if "holdsStock" in Row and Row["holdsStock"] is not None:
            Holds = bool(Row["holdsStock"])
            if not Holds and Centre.holds_stock:
                Held = db.query(func.coalesce(func.sum(StockBalance.quantity), 0)).filter(StockBalance.centre_id == Centre.id).scalar() or 0
                if Held:
                    api_error(409, "STOCK_HELD", f"{Centre.name} still holds {Held} items. Transfer or write them off first.")
            Centre.holds_stock = Holds
        if "stockFromCentreId" in Row:
            Supplier = str(Row.get("stockFromCentreId") or "") or None
            if Supplier:
                if Supplier == Centre.id:
                    api_error(422, "SAME_CENTRE", f"{Centre.name} cannot be supplied from itself.")
                _StockCentre(db, Supplier)
            Centre.stock_from_centre_id = Supplier
    db.flush()
    After = {
        "stockTrackingEnabled": bool(Settings.stock_tracking_enabled),
        "lowStockThreshold": Settings.low_stock_threshold,
        "defaultStockCentreId": Settings.default_stock_centre_id,
        "autoBookInvoices": bool(Settings.auto_book_invoices),
    }
    Settings.updated_by_user_id = Actor.id if Actor else None
    WritePaymentAudit(db, EntityType="INVENTORY_SETTINGS", EntityId="default", Action="UPDATE", Actor=Actor, Before=Before, After=After, Reason=_Clean(Request.get("reason"), 300))
    db.commit()
    return InventorySettingsPayload(db)


# --------------------------------------------------------------------------
# Reading: summary and ledger
# --------------------------------------------------------------------------

def StockSummary(db: Session) -> dict[str, Any]:
    Settings = EnsureInventorySettings(db)
    Threshold = Settings.low_stock_threshold
    Centres = db.query(PaymentCentre).filter(PaymentCentre.holds_stock == True).order_by(PaymentCentre.display_order.asc(), PaymentCentre.name.asc()).all()  # noqa: E712
    Items = db.query(FeeItem).filter(FeeItem.is_stock == True).order_by(FeeItem.is_active.desc(), FeeItem.display_order.asc(), FeeItem.name.asc()).all()  # noqa: E712
    Balances = {(Row.fee_item_id, Row.centre_id): Row.quantity for Row in db.query(StockBalance).all()}
    Flows: dict[tuple[str, str], dict[str, int]] = {}
    for ItemId, CentreId, Type, Total in (
        db.query(StockMovement.fee_item_id, StockMovement.centre_id, StockMovement.movement_type, func.sum(StockMovement.quantity))
        .group_by(StockMovement.fee_item_id, StockMovement.centre_id, StockMovement.movement_type)
        .all()
    ):
        Flows.setdefault((ItemId, CentreId), {})[Type] = int(Total or 0)
    Rows = []
    LowCount = 0
    for Item in Items:
        PerCentre = []
        for Centre in Centres:
            Quantity = Balances.get((Item.id, Centre.id), 0)
            Flow = Flows.get((Item.id, Centre.id), {})
            Ledger = sum(Flow.values())
            # Low only where the item is actually kept: a centre that has
            # never had it is not "low", it simply does not stock it.
            Low = Item.is_active and bool(Flow) and Quantity <= Threshold
            LowCount += 1 if Low else 0
            PerCentre.append({
                "centreId": Centre.id,
                "centreName": Centre.name,
                "quantity": Quantity,
                "isLow": bool(Low),
                "opening": Flow.get("OPENING", 0),
                "received": Flow.get("INWARD", 0),
                "issued": -Flow.get("ISSUE", 0),
                "returned": Flow.get("CANCEL_RETURN", 0),
                "transferredIn": Flow.get("TRANSFER_IN", 0),
                "transferredOut": -Flow.get("TRANSFER_OUT", 0),
                "writtenOff": -Flow.get("WRITE_OFF", 0),
                "ledgerMatches": Ledger == Quantity,
            })
        Total = sum(Row["quantity"] for Row in PerCentre)
        Rows.append({
            "feeItemId": Item.id,
            "name": Item.name,
            "sku": Item.sku,
            "kind": KindOf(Item),
            "levelCode": Item.level_code,
            "unit": Item.unit,
            "inKit": bool(Item.in_kit),
            "isActive": bool(Item.is_active),
            "priceDisplay": FormatIndianRupees(Item.amount_paise),
            "costDisplay": FormatIndianRupees(Item.cost_paise) if Item.cost_paise is not None else None,
            "valuePaise": (Item.cost_paise or 0) * Total,
            "valueDisplay": FormatIndianRupees((Item.cost_paise or 0) * Total) if Item.cost_paise is not None else None,
            "total": Total,
            "centres": PerCentre,
        })
    return {
        "trackingEnabled": bool(Settings.stock_tracking_enabled),
        "lowStockThreshold": Threshold,
        "lowCount": LowCount,
        "centres": [{"centreId": Row.id, "name": Row.name} for Row in Centres],
        "items": Rows,
        "ledgerMatches": all(Centre["ledgerMatches"] for Row in Rows for Centre in Row["centres"]),
    }


def _MovementQuery(db: Session, Filters: dict[str, Any]):
    from app.services.payments.invoices_service import _ParseDate

    Query = db.query(StockMovement)
    if Filters.get("feeItemId"):
        Query = Query.filter(StockMovement.fee_item_id == Filters["feeItemId"])
    if Filters.get("centreId"):
        Query = Query.filter(StockMovement.centre_id == Filters["centreId"])
    if Filters.get("type"):
        Query = Query.filter(StockMovement.movement_type == str(Filters["type"]).upper())
    if Filters.get("studentId"):
        Query = Query.filter(StockMovement.student_id == Filters["studentId"])
    From = _ParseDate(Filters.get("dateFrom"), "From date")
    To = _ParseDate(Filters.get("dateTo"), "To date")
    if From:
        Query = Query.filter(StockMovement.movement_date >= From)
    if To:
        Query = Query.filter(StockMovement.movement_date <= To)
    return Query


def MovementPayloads(db: Session, Rows: list[StockMovement]) -> list[dict[str, Any]]:
    Items = {Row.id: Row for Row in db.query(FeeItem).filter(FeeItem.id.in_({Row.fee_item_id for Row in Rows})).all()} if Rows else {}
    Centres = {Row.id: Row.name for Row in db.query(PaymentCentre).all()}
    InvoiceIds = {Row.invoice_id for Row in Rows if Row.invoice_id}
    Invoices = {Row.id: Row for Row in db.query(PaymentInvoice).filter(PaymentInvoice.id.in_(InvoiceIds)).all()} if InvoiceIds else {}
    StudentIds = {Row.student_id for Row in Rows if Row.student_id}
    Students = {}
    if StudentIds:
        for StudentRow, UserRow in db.query(Student, User).join(User, Student.user_id == User.id).filter(Student.id.in_(StudentIds)).all():
            Students[StudentRow.id] = (UserRow.full_name, StudentRow.student_code)
    Out = []
    for Row in Rows:
        Item = Items.get(Row.fee_item_id)
        Invoice = Invoices.get(Row.invoice_id)
        Name, Code = Students.get(Row.student_id, (None, None))
        Out.append({
            "movementId": Row.id,
            "date": Row.movement_date.isoformat(),
            "type": Row.movement_type,
            "typeLabel": MOVEMENT_TYPES.get(Row.movement_type, Row.movement_type),
            "feeItemId": Row.fee_item_id,
            "itemName": Item.name if Item else "",
            "sku": Item.sku if Item else None,
            "centreId": Row.centre_id,
            "centreName": Centres.get(Row.centre_id, ""),
            "quantity": Row.quantity,
            "balanceAfter": Row.balance_after,
            "unitCostDisplay": FormatIndianRupees(Row.unit_cost_paise) if Row.unit_cost_paise is not None else None,
            "supplier": Row.supplier,
            "billNumber": Row.bill_number,
            "reason": Row.reason,
            "invoiceId": Row.invoice_id,
            "invoiceNumber": Invoice.invoice_number if Invoice else None,
            "studentId": Row.student_id,
            "studentName": Name,
            "studentCode": Code,
            "actorName": Row.actor_name,
            "createdAt": Row.created_at.isoformat() if Row.created_at else None,
        })
    return Out


def ListMovements(db: Session, *, Filters: dict[str, Any], Page: int = 1, PageSize: int = 50) -> dict[str, Any]:
    Page = max(1, int(Page or 1))
    PageSize = max(1, min(int(PageSize or 50), 200))
    Query = _MovementQuery(db, Filters)
    Total = Query.count()
    Rows = Query.order_by(StockMovement.movement_date.desc(), StockMovement.created_at.desc(), StockMovement.id.desc()).offset((Page - 1) * PageSize).limit(PageSize).all()
    return {"page": Page, "pageSize": PageSize, "totalCount": Total, "movements": MovementPayloads(db, Rows)}


def MovementsForExport(db: Session, *, Filters: dict[str, Any]) -> list[dict[str, Any]]:
    Rows = _MovementQuery(db, Filters).order_by(StockMovement.movement_date.asc(), StockMovement.created_at.asc(), StockMovement.id.asc()).all()
    return MovementPayloads(db, Rows)


def AvailabilityFor(db: Session, *, CentreId: str | None) -> dict[str, Any]:
    """For the New Invoice screen: each stock item's count where this
    student is supplied from."""
    Settings = EnsureInventorySettings(db)
    Stock = StockCentreId(db, CentreId)
    Rows = db.query(StockBalance).filter(StockBalance.centre_id == Stock).all() if Stock else []
    Centre = db.get(PaymentCentre, Stock) if Stock else None
    return {
        "trackingEnabled": bool(Settings.stock_tracking_enabled),
        "stockCentreId": Stock,
        "stockCentreName": Centre.name if Centre else None,
        "lowStockThreshold": Settings.low_stock_threshold,
        "quantities": {Row.fee_item_id: Row.quantity for Row in Rows},
    }
