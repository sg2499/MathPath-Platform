"""Billing Release 2 (2026-11-27, Shailesh): fee items as articles, and
prices that change from a chosen date.

  * Article fields on a fee item: kind (TUITION, REGISTRATION, BOOK, MERCH,
    LATE_FEE, OTHER), code (SKU), whether stock is counted, the level a book
    is for, unit, cost to MathPath, and whether it is in the free admission
    kit (Bag, T-shirt, Abacus).
  * PriceOn(item, day): the price an invoice dated `day` charges. A price
    change made "from" a later date waits in fee_item_prices until then
    (client answer F6); a change from today applies at once.
  * SeedArticles: once, at startup, fills the article fields in from the
    fee items' names, marks the centres that hold stock (Rajarhat,
    Laketown; Online is supplied from Rajarhat), adds a ₹100 Late Fee item
    and gives every existing invoice its type. Stock tracking stays off.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import FeeItem, FeeItemPrice, InventorySettings, PaymentCentre, PaymentInvoice, User
from app.services.payments.audit import WritePaymentAudit
from app.services.payments.money import DEFAULT_GST_RATE_BPS, FormatIndianRupees, PaiseToRupeesString, ParseRupeesToPaise

ARTICLE_KINDS = {
    "TUITION": "Tuition",
    "REGISTRATION": "Registration",
    "BOOK": "Book / study material",
    "MERCH": "Merchandise / kit",
    "LATE_FEE": "Late fee",
    "OTHER": "Other",
}
INVOICE_TYPES = {
    "ADMISSION": "Admission",
    "MONTHLY_TUITION": "Monthly tuition",
    "STUDY_MATERIAL": "Study material",
    "SALE": "Sale",
    "LATE_FEE": "Late fee",
    "OTHER": "Other",
}
LATE_FEE_NAME = "Late Fee"
LATE_FEE_PAISE = 10000
MAX_SKU = 40
MAX_UNIT = 20


def _Today() -> date:
    from app.services.payments.invoices_service import TodayInIndia

    return TodayInIndia()


def EnsureInventorySettings(db: Session) -> InventorySettings:
    Row = db.get(InventorySettings, "default")
    if not Row:
        Row = InventorySettings(id="default", stock_tracking_enabled=False, low_stock_threshold=5, auto_book_invoices=False, articles_seeded=False)
        db.add(Row)
        db.flush()
    return Row


def KindOf(Item: FeeItem | None) -> str:
    if not Item:
        return "OTHER"
    if Item.article_kind in ARTICLE_KINDS:
        return Item.article_kind
    return "TUITION" if Item.billing_type == "MONTHLY" else "OTHER"


def InvoiceTypeForKinds(Kinds: list[str]) -> str:
    Set = set(Kinds)
    if not Set:
        return "OTHER"
    if "REGISTRATION" in Set:
        return "ADMISSION"
    if Set == {"TUITION"}:
        return "MONTHLY_TUITION"
    if Set == {"BOOK"}:
        return "STUDY_MATERIAL"
    if Set == {"LATE_FEE"}:
        return "LATE_FEE"
    if Set <= {"BOOK", "MERCH"}:
        return "SALE"
    return "OTHER"


# --------------------------------------------------------------------------
# Guessing the article fields from a fee item's name (once, at startup)
# --------------------------------------------------------------------------

_LEVEL_PATTERNS = (
    (re.compile(r"young\s+learner", re.I), lambda Match: "YLM-L1"),
    (re.compile(r"preparatory\s+level\s*(\d)", re.I), lambda Match: f"PM-L{Match.group(1)}"),
    (re.compile(r"intermediate\s+level\s*(\d)", re.I), lambda Match: f"IM-L{Match.group(1)}"),
    (re.compile(r"bridge", re.I), lambda Match: "BM-L1"),
    (re.compile(r"master\s+module", re.I), lambda Match: "MM-L1"),
)


def GuessArticle(Name: str, BillingType: str) -> dict[str, Any]:
    Text = Name or ""
    Lower = Text.lower()
    if BillingType == "MONTHLY" or "monthly fee" in Lower or "tuition" in Lower:
        return {"kind": "TUITION", "isStock": False, "levelCode": None, "inKit": False, "unit": "month"}
    if "registration" in Lower:
        return {"kind": "REGISTRATION", "isStock": False, "levelCode": None, "inKit": False, "unit": None}
    if "late fee" in Lower:
        return {"kind": "LATE_FEE", "isStock": False, "levelCode": None, "inKit": False, "unit": None}
    if "content charge" in Lower or "book" in Lower or "study material" in Lower:
        Level = None
        for Pattern, Make in _LEVEL_PATTERNS:
            Match = Pattern.search(Text)
            if Match:
                Level = Make(Match)
                break
        return {"kind": "BOOK", "isStock": True, "levelCode": Level, "inKit": False, "unit": "set"}
    if re.search(r"\bbag\b|t-?shirt|abacus", Lower):
        return {"kind": "MERCH", "isStock": True, "levelCode": None, "inKit": True, "unit": "pc"}
    if "timer" in Lower:
        return {"kind": "MERCH", "isStock": True, "levelCode": None, "inKit": False, "unit": "pc"}
    return {"kind": "OTHER", "isStock": False, "levelCode": None, "inKit": False, "unit": None}


def SeedArticles(db: Session) -> bool:
    """Once. Returns True when it ran."""
    Settings = EnsureInventorySettings(db)
    Settings = db.query(InventorySettings).filter(InventorySettings.id == "default").with_for_update().one()
    if Settings.articles_seeded:
        return False
    Items = db.query(FeeItem).all()
    for Item in Items:
        if Item.article_kind:
            continue
        Guess = GuessArticle(Item.name, Item.billing_type)
        Item.article_kind = Guess["kind"]
        Item.is_stock = Guess["isStock"]
        Item.level_code = Item.level_code or Guess["levelCode"]
        Item.in_kit = Guess["inKit"]
        Item.unit = Item.unit or Guess["unit"]
    # A Late Fee item (client answer D3: ₹100 after the 25th, added by hand),
    # only on a site that already has its fee items.
    if Items and not any(KindOf(Item) == "LATE_FEE" for Item in Items):
        from app.services.payments.setup_service import NameKey

        if not db.query(FeeItem).filter(FeeItem.name_key == NameKey(LATE_FEE_NAME)).first():
            Last = max((Item.display_order or 0) for Item in Items)
            db.add(FeeItem(
                name=LATE_FEE_NAME, name_key=NameKey(LATE_FEE_NAME), amount_paise=LATE_FEE_PAISE, gst_included=True,
                gst_rate_bps=DEFAULT_GST_RATE_BPS, billing_type="ONE_TIME", display_order=Last + 1, is_active=True,
                article_kind="LATE_FEE", is_stock=False, in_kit=False,
                description="Added by hand to a monthly fee paid after the 25th.",
            ))
    # Centres: Rajarhat and Laketown keep stock; Online is supplied from
    # Rajarhat, which is also where stock comes from for a student with no
    # centre (client answers G1, G2).
    Centres = db.query(PaymentCentre).all()
    ByCode = {Row.code: Row for Row in Centres}
    for Code in ("RAJARHAT", "LAKETOWN"):
        if Code in ByCode:
            ByCode[Code].holds_stock = True
    Main = ByCode.get("RAJARHAT") or next((Row for Row in Centres if Row.holds_stock), None)
    if Main:
        for Row in Centres:
            if not Row.holds_stock and not Row.stock_from_centre_id:
                Row.stock_from_centre_id = Main.id
        Settings.default_stock_centre_id = Settings.default_stock_centre_id or Main.id
    db.flush()
    # Each existing invoice's type, from what it is for.
    Kinds = {Item.id: KindOf(Item) for Item in db.query(FeeItem).all()}
    for Invoice in db.query(PaymentInvoice).filter(PaymentInvoice.invoice_type.is_(None)).all():
        Kind = Kinds.get(Invoice.fee_item_id) or ("TUITION" if Invoice.billing_type == "MONTHLY" else "OTHER")
        Invoice.invoice_type = InvoiceTypeForKinds([Kind])
    Settings.articles_seeded = True
    db.flush()
    return True


# --------------------------------------------------------------------------
# Prices from a date
# --------------------------------------------------------------------------

def PriceOn(db: Session, Item: FeeItem, Day: date | None = None) -> int:
    """What an invoice dated `Day` charges for the item."""
    Day = Day or _Today()
    Row = (
        db.query(FeeItemPrice)
        .filter(FeeItemPrice.fee_item_id == Item.id, FeeItemPrice.effective_from <= Day)
        .order_by(FeeItemPrice.effective_from.desc(), FeeItemPrice.created_at.desc())
        .first()
    )
    return Row.amount_paise if Row else Item.amount_paise


def UpcomingPrices(db: Session, ItemIds: list[str] | None = None) -> dict[str, list[dict[str, Any]]]:
    Today = _Today()
    Query = db.query(FeeItemPrice).filter(FeeItemPrice.effective_from > Today)
    if ItemIds is not None:
        if not ItemIds:
            return {}
        Query = Query.filter(FeeItemPrice.fee_item_id.in_(ItemIds))
    Result: dict[str, list[dict[str, Any]]] = {}
    for Row in Query.order_by(FeeItemPrice.effective_from.asc()).all():
        Result.setdefault(Row.fee_item_id, []).append({
            "priceId": Row.id,
            "amountPaise": Row.amount_paise,
            "amount": PaiseToRupeesString(Row.amount_paise),
            "amountDisplay": FormatIndianRupees(Row.amount_paise),
            "effectiveFrom": Row.effective_from.isoformat(),
            "reason": Row.reason,
        })
    return Result


def ApplyDuePrices(db: Session) -> int:
    """Brings each item's own amount up to the price in force today, so
    every screen that reads amount_paise shows today's price. Safe to call
    any time; returns how many items changed."""
    Today = _Today()
    Changed = 0
    Due = db.query(FeeItemPrice).filter(FeeItemPrice.effective_from <= Today).all()
    ItemIds = {Row.fee_item_id for Row in Due}
    for ItemId in ItemIds:
        Item = db.get(FeeItem, ItemId)
        if not Item:
            continue
        Price = PriceOn(db, Item, Today)
        if Price != Item.amount_paise:
            Item.amount_paise = Price
            Changed += 1
    if Changed:
        db.flush()
    return Changed


def SchedulePrice(db: Session, *, FeeItemId: str, Amount: Any, EffectiveFrom: Any, Reason: Any, Actor: User | None) -> dict[str, Any]:
    from app.services.payments.invoices_service import _ParseDate
    from app.services.payments.setup_service import FeeItemPayload, _AuditShape

    Item = db.get(FeeItem, FeeItemId)
    if not Item:
        api_error(404, "FEE_ITEM_NOT_FOUND", "That fee item was not found.")
    Paise = ParseRupeesToPaise(Amount, FieldLabel="New price", AllowZero=True)
    From = _ParseDate(EffectiveFrom, "From date") or _Today()
    if From < date(2020, 1, 1):
        api_error(422, "DATE_INVALID", "The date looks wrong. Please check the year.")
    CleanReason = re.sub(r"\s+", " ", str(Reason or "")).strip()[:300] or None
    Before = _AuditShape(Item)
    if From < _Today():
        api_error(422, "DATE_IN_PAST", "A new price can start today or later; an invoice already raised keeps its price.")
    # One price per item per day: a second change for the same day replaces it.
    db.query(FeeItemPrice).filter(FeeItemPrice.fee_item_id == Item.id, FeeItemPrice.effective_from == From).delete(synchronize_session=False)
    if From == _Today() and not db.query(FeeItemPrice).filter(FeeItemPrice.fee_item_id == Item.id, FeeItemPrice.effective_from < From).count():
        # Nothing dated earlier: the item's own amount is the price until today.
        db.add(FeeItemPrice(fee_item_id=Item.id, amount_paise=Item.amount_paise, effective_from=date(2020, 1, 1), reason="Price before the first dated change", created_by_user_id=Actor.id if Actor else None))
    elif From > _Today() and not db.query(FeeItemPrice).filter(FeeItemPrice.fee_item_id == Item.id, FeeItemPrice.effective_from <= _Today()).count():
        # Keep today's price for invoices dated before the change.
        db.add(FeeItemPrice(fee_item_id=Item.id, amount_paise=Item.amount_paise, effective_from=date(2020, 1, 1), reason="Price before the first dated change", created_by_user_id=Actor.id if Actor else None))
    db.add(FeeItemPrice(fee_item_id=Item.id, amount_paise=Paise, effective_from=From, reason=CleanReason, created_by_user_id=Actor.id if Actor else None))
    db.flush()
    if From <= _Today():
        Item.amount_paise = PriceOn(db, Item, _Today())
    db.flush()
    WritePaymentAudit(
        db, EntityType="FEE_ITEM", EntityId=Item.id, Action="SET_PRICE", Actor=Actor, Before=Before,
        After={**_AuditShape(Item), "newPrice": PaiseToRupeesString(Paise), "from": From.isoformat()}, Reason=CleanReason,
    )
    db.commit()
    db.refresh(Item)
    return FeeItemPayload(Item, db=db)


def CancelScheduledPrice(db: Session, *, PriceId: str, Actor: User | None) -> dict[str, Any]:
    from app.services.payments.setup_service import FeeItemPayload

    Row = db.get(FeeItemPrice, PriceId)
    if not Row:
        api_error(404, "PRICE_NOT_FOUND", "That price change was not found.")
    if Row.effective_from <= _Today():
        api_error(409, "PRICE_ALREADY_APPLIES", "That price is already in force. Set a new price instead.")
    Item = db.get(FeeItem, Row.fee_item_id)
    WritePaymentAudit(
        db, EntityType="FEE_ITEM", EntityId=Row.fee_item_id, Action="CANCEL_PRICE", Actor=Actor,
        Before={"newPrice": PaiseToRupeesString(Row.amount_paise), "from": Row.effective_from.isoformat()},
    )
    db.delete(Row)
    db.commit()
    return FeeItemPayload(Item, db=db)


def UpdateArticle(db: Session, *, FeeItemId: str, Fields: dict[str, Any], Actor: User | None) -> dict[str, Any]:
    """The article fields of a fee item (Fee Setup > item > Article)."""
    from app.services.payments.setup_service import FeeItemPayload

    Item = db.get(FeeItem, FeeItemId)
    if not Item:
        api_error(404, "FEE_ITEM_NOT_FOUND", "That fee item was not found.")
    Before = ArticleAuditShape(Item)
    if "articleKind" in Fields:
        Kind = str(Fields.get("articleKind") or "").strip().upper()
        if Kind not in ARTICLE_KINDS:
            api_error(422, "ARTICLE_KIND_INVALID", "Choose what kind of item this is.")
        if Kind == "TUITION" and Item.billing_type != "MONTHLY":
            api_error(422, "ARTICLE_KIND_INVALID", "Only a monthly fee item can be tuition.")
        if Kind != "TUITION" and Item.billing_type == "MONTHLY":
            api_error(422, "ARTICLE_KIND_INVALID", "A monthly fee item is always tuition.")
        Item.article_kind = Kind
    if "sku" in Fields:
        Sku = re.sub(r"\s+", "", str(Fields.get("sku") or "")).upper()[:MAX_SKU] or None
        if Sku:
            Clash = db.query(FeeItem).filter(FeeItem.sku == Sku, FeeItem.id != Item.id).first()
            if Clash:
                api_error(409, "SKU_TAKEN", f"{Clash.name} already has the code {Sku}.")
        Item.sku = Sku
    if "isStock" in Fields:
        IsStock = bool(Fields.get("isStock"))
        if IsStock and KindOf(Item) in ("TUITION", "REGISTRATION", "LATE_FEE"):
            api_error(422, "NOT_A_STOCK_ITEM", "Stock is only counted for books, kit and other things handed over.")
        if not IsStock and Item.is_stock:
            from app.models import StockBalance

            Held = sum(Row.quantity for Row in db.query(StockBalance).filter(StockBalance.fee_item_id == Item.id).all())
            if Held:
                api_error(409, "STOCK_HELD", f"{Held} of {Item.name} are still in stock. Write them off first, then stop counting stock for it.")
        Item.is_stock = IsStock
    if "levelCode" in Fields:
        Level = re.sub(r"\s+", "", str(Fields.get("levelCode") or "")).upper()[:40] or None
        if Level and KindOf(Item) != "BOOK":
            api_error(422, "LEVEL_FOR_BOOKS", "Only a book can be set for a level.")
        if Level:
            Clash = db.query(FeeItem).filter(FeeItem.level_code == Level, FeeItem.id != Item.id, FeeItem.is_active == True).first()  # noqa: E712
            if Clash:
                api_error(409, "LEVEL_BOOK_TAKEN", f"{Clash.name} is already the book for {Level}.")
        Item.level_code = Level
    if "unit" in Fields:
        Item.unit = re.sub(r"\s+", " ", str(Fields.get("unit") or "")).strip()[:MAX_UNIT] or None
    if "cost" in Fields:
        Raw = Fields.get("cost")
        Item.cost_paise = None if Raw in (None, "") else ParseRupeesToPaise(Raw, FieldLabel="Cost", AllowZero=True)
    if "inKit" in Fields:
        InKit = bool(Fields.get("inKit"))
        if InKit and KindOf(Item) != "MERCH":
            api_error(422, "KIT_IS_MERCH", "Only merchandise (bag, T-shirt, abacus) can be in the admission kit.")
        Item.in_kit = InKit
    After = ArticleAuditShape(Item)
    if After != Before:
        db.flush()
        WritePaymentAudit(db, EntityType="FEE_ITEM", EntityId=Item.id, Action="UPDATE_ARTICLE", Actor=Actor, Before=Before, After=After)
        db.commit()
        db.refresh(Item)
    return FeeItemPayload(Item, db=db)


def ArticleAuditShape(Item: FeeItem) -> dict[str, Any]:
    return {
        "kind": KindOf(Item),
        "sku": Item.sku,
        "isStock": bool(Item.is_stock),
        "levelCode": Item.level_code,
        "unit": Item.unit,
        "cost": PaiseToRupeesString(Item.cost_paise) if Item.cost_paise is not None else None,
        "inKit": bool(Item.in_kit),
    }


def BookForLevel(db: Session, LevelCode: str | None) -> FeeItem | None:
    if not LevelCode:
        return None
    return (
        db.query(FeeItem)
        .filter(FeeItem.level_code == LevelCode, FeeItem.is_active == True)  # noqa: E712
        .order_by(FeeItem.display_order.asc())
        .first()
    )


def LateFeeItem(db: Session) -> FeeItem:
    """The Late Fee item, made the first time it is needed on a site that has
    none."""
    from app.services.payments.setup_service import NameKey

    Item = (
        db.query(FeeItem)
        .filter(FeeItem.article_kind == "LATE_FEE", FeeItem.is_active == True)  # noqa: E712
        .order_by(FeeItem.display_order.asc())
        .first()
    )
    if Item:
        return Item
    Item = db.query(FeeItem).filter(FeeItem.name_key == NameKey(LATE_FEE_NAME)).first()
    if Item:
        if not Item.is_active:
            api_error(409, "LATE_FEE_OFF", "The Late Fee item is switched off in Fee Setup.")
        Item.article_kind = "LATE_FEE"
        db.flush()
        return Item
    Last = db.query(FeeItem.display_order).order_by(FeeItem.display_order.desc()).first()
    Item = FeeItem(
        name=LATE_FEE_NAME, name_key=NameKey(LATE_FEE_NAME), amount_paise=LATE_FEE_PAISE, gst_included=True,
        gst_rate_bps=DEFAULT_GST_RATE_BPS, billing_type="ONE_TIME", display_order=(Last[0] + 1) if Last else 1,
        is_active=True, article_kind="LATE_FEE", is_stock=False, in_kit=False,
        description="Added by hand to a monthly fee paid after the 25th.",
    )
    db.add(Item)
    db.flush()
    return Item
