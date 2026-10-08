"""Payments Phase 4 (2026-10-08): expenses and expense categories.

  * Expense: date, category, item, vendor, bill number, details, amount paid
    in one or more methods (with optional references), centre, note.
    Numbered MP-EXP-0001. Edit with a reason; cancel with a reason; nothing
    is deleted, and every change is in the history.
  * Categories: a managed list (Rent, Salaries, Electricity ...). Renaming
    one never changes past expenses (each keeps its category name).
"""
from __future__ import annotations

import re
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import Expense, ExpenseCategory, ExpenseMethodLine, PaymentCentre, User
from app.services.payments.audit import WritePaymentAudit
from app.services.payments.money import MAX_AMOUNT_PAISE, FormatIndianRupees, PaiseToRupeesString
from app.services.payments.numbering import TakeNextNumber
from app.services.payments.receipts_service import COUNTER_METHODS, METHOD_LABELS, _Clean, _Paise

DEFAULT_CATEGORIES = [
    "Rent", "Salaries", "Electricity", "Internet & Phone", "Stationery", "Printing",
    "Books & Material", "Marketing", "Maintenance", "Refreshments", "Travel", "Others",
]
STATUS_LABELS = {"RECORDED": "Recorded", "CANCELLED": "Cancelled"}
MAX_METHOD_LINES = 6


def _Key(Name: str) -> str:
    return re.sub(r"\s+", " ", Name).strip().lower()


def _Today() -> date:
    from app.services.payments.invoices_service import TodayInIndia

    return TodayInIndia()


# ----------------------------------------------------------------------------
# Categories
# ----------------------------------------------------------------------------

def EnsureExpenseCategories(db: Session) -> None:
    """Fills in the starting list once (when there are no categories)."""
    if db.query(ExpenseCategory).count():
        return
    for Index, Name in enumerate(DEFAULT_CATEGORIES):
        try:
            with db.begin_nested():
                db.add(ExpenseCategory(name=Name, name_key=_Key(Name), display_order=Index, is_active=True))
        except IntegrityError:
            pass
    db.flush()


def CategoryPayload(Row: ExpenseCategory, Counts: dict[str, int] | None = None) -> dict[str, Any]:
    return {
        "categoryId": Row.id,
        "name": Row.name,
        "displayOrder": Row.display_order,
        "isActive": bool(Row.is_active),
        "expenseCount": (Counts or {}).get(Row.id, 0),
    }


def ListCategories(db: Session) -> list[dict[str, Any]]:
    EnsureExpenseCategories(db)
    Counts = dict(
        db.query(Expense.category_id, func.count(Expense.id)).filter(Expense.status == "RECORDED").group_by(Expense.category_id).all()
    )
    Rows = db.query(ExpenseCategory).order_by(ExpenseCategory.display_order.asc(), ExpenseCategory.name.asc()).all()
    return [CategoryPayload(Row, Counts) for Row in Rows]


def _CheckedCategoryName(db: Session, Name: Any, ExcludeId: str | None = None) -> tuple[str, str]:
    Clean = re.sub(r"\s+", " ", str(Name or "")).strip()
    if not Clean:
        api_error(422, "NAME_REQUIRED", "Please enter a name for the category.")
    if len(Clean) > 80:
        api_error(422, "NAME_TOO_LONG", "Keep the category name under 80 characters.")
    Key = _Key(Clean)
    Clash = db.query(ExpenseCategory).filter(ExpenseCategory.name_key == Key)
    if ExcludeId:
        Clash = Clash.filter(ExpenseCategory.id != ExcludeId)
    Existing = Clash.first()
    if Existing:
        api_error(409, "CATEGORY_EXISTS", f"There is already a category called {Existing.name}.")
    return Clean, Key


def CreateCategory(db: Session, *, Name: Any, Actor: User | None) -> dict[str, Any]:
    EnsureExpenseCategories(db)
    Clean, Key = _CheckedCategoryName(db, Name)
    Last = db.query(func.max(ExpenseCategory.display_order)).scalar() or 0
    Row = ExpenseCategory(name=Clean, name_key=Key, display_order=Last + 1, is_active=True)
    db.add(Row)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        api_error(409, "CATEGORY_EXISTS", f"There is already a category called {Clean}.")
    WritePaymentAudit(db, EntityType="EXPENSE_CATEGORY", EntityId=Row.id, Action="CREATE", Actor=Actor, After={"name": Clean})
    db.commit()
    return CategoryPayload(Row)


def UpdateCategory(db: Session, *, CategoryId: str, Name: Any = None, IsActive: bool | None = None, Reason: Any = None, Actor: User | None) -> dict[str, Any]:
    Row = db.get(ExpenseCategory, CategoryId)
    if not Row:
        api_error(404, "CATEGORY_NOT_FOUND", "That category was not found.")
    Before = {"name": Row.name, "isActive": bool(Row.is_active)}
    if Name is not None:
        Clean, Key = _CheckedCategoryName(db, Name, ExcludeId=Row.id)
        Row.name, Row.name_key = Clean, Key
    if IsActive is not None and bool(IsActive) != bool(Row.is_active):
        if not IsActive and not _Clean(Reason, 300):
            api_error(422, "REASON_REQUIRED", "Please give a reason for switching this category off.")
        Row.is_active = bool(IsActive)
    After = {"name": Row.name, "isActive": bool(Row.is_active)}
    if After == Before:
        return CategoryPayload(Row)
    db.flush()
    Action = "UPDATE" if Before["isActive"] == After["isActive"] else ("ACTIVATE" if After["isActive"] else "DEACTIVATE")
    WritePaymentAudit(db, EntityType="EXPENSE_CATEGORY", EntityId=Row.id, Action=Action, Actor=Actor, Before=Before, After=After, Reason=_Clean(Reason, 300))
    db.commit()
    return CategoryPayload(Row)


# ----------------------------------------------------------------------------
# Expenses
# ----------------------------------------------------------------------------

def _CheckedExpense(db: Session, Request: dict[str, Any], *, Editing: Expense | None = None) -> dict[str, Any]:
    from app.services.payments.invoices_service import _ParseDate

    ExpenseDate = _ParseDate(Request.get("expenseDate"), "Date") or _Today()
    if ExpenseDate > _Today():
        api_error(422, "DATE_IN_FUTURE", "The date cannot be in the future.")
    if ExpenseDate < date(2020, 1, 1):
        api_error(422, "DATE_INVALID", "The date looks wrong. Please check the year.")
    CategoryId = str(Request.get("categoryId") or "").strip()
    if not CategoryId:
        api_error(422, "CATEGORY_REQUIRED", "Choose a category.")
    Category = db.get(ExpenseCategory, CategoryId)
    if not Category:
        api_error(404, "CATEGORY_NOT_FOUND", "That category was not found. Refresh and try again.")
    if not Category.is_active and not (Editing and Editing.category_id == Category.id):
        api_error(422, "CATEGORY_INACTIVE", f"{Category.name} is switched off. Choose another category or switch it on.")
    Item = _Clean(Request.get("item"), 200)
    if not Item:
        api_error(422, "ITEM_REQUIRED", "Say what the money was spent on (for example: October rent).")
    CentreId = str(Request.get("centreId") or "").strip() or None
    if CentreId and not db.get(PaymentCentre, CentreId):
        api_error(404, "CENTRE_NOT_FOUND", "That centre was not found.")

    Methods = []
    for Index, Line in enumerate(Request.get("methods") or []):
        Method = str((Line or {}).get("method") or "").strip().upper()
        if Method not in COUNTER_METHODS:
            api_error(422, "METHOD_INVALID", "Choose how the money was paid for every line.")
        Amount = _Paise((Line or {}).get("amountPaise"), f"{METHOD_LABELS[Method]} amount", AllowZero=False)
        Methods.append({"method": Method, "amountPaise": Amount, "reference": _Clean((Line or {}).get("reference"), 120), "order": Index})
    if not Methods:
        api_error(422, "METHOD_REQUIRED", "Add how the money was paid (for example Cash or UPI).")
    if len(Methods) > MAX_METHOD_LINES:
        api_error(422, "TOO_MANY_METHODS", f"Use at most {MAX_METHOD_LINES} payment methods.")
    Total = sum(Line["amountPaise"] for Line in Methods)
    if Total > MAX_AMOUNT_PAISE:
        api_error(422, "AMOUNT_TOO_LARGE", "The total is too large.")
    return {
        "expenseDate": ExpenseDate,
        "category": Category,
        "item": Item,
        "vendor": _Clean(Request.get("vendor"), 150),
        "billNumber": _Clean(Request.get("billNumber"), 80),
        "details": _Clean(Request.get("details"), 1000),
        "note": _Clean(Request.get("note"), 500),
        "centreId": CentreId,
        "methods": Methods,
        "total": Total,
    }


def _UserNames(db: Session, Ids: set[str | None]) -> dict[str, str]:
    Ids = {Id for Id in Ids if Id}
    if not Ids:
        return {}
    return {Row.id: Row.full_name for Row in db.query(User).filter(User.id.in_(Ids)).all()}


def ExpensePayload(db: Session, Row: Expense, *, Names: dict[str, str] | None = None, Centres: dict[str, str] | None = None) -> dict[str, Any]:
    Lines = db.query(ExpenseMethodLine).filter(ExpenseMethodLine.expense_id == Row.id).order_by(ExpenseMethodLine.line_order).all()
    Names = Names if Names is not None else _UserNames(db, {Row.created_by_user_id, Row.edited_by_user_id, Row.cancelled_by_user_id})
    CentreName = (Centres or {}).get(Row.centre_id) if Centres is not None else (db.get(PaymentCentre, Row.centre_id).name if Row.centre_id and db.get(PaymentCentre, Row.centre_id) else None)
    return {
        "expenseId": Row.id,
        "expenseNumber": Row.expense_number,
        "expenseDate": Row.expense_date.isoformat(),
        "categoryId": Row.category_id,
        "categoryName": Row.category_name,
        "item": Row.item,
        "vendor": Row.vendor,
        "billNumber": Row.bill_number,
        "details": Row.details,
        "note": Row.note,
        "centreId": Row.centre_id,
        "centreName": CentreName,
        "amountPaise": Row.amount_paise,
        "amountDisplay": FormatIndianRupees(Row.amount_paise),
        "methods": [
            {"method": Line.method, "methodLabel": METHOD_LABELS.get(Line.method, Line.method), "amountPaise": Line.amount_paise, "amountDisplay": FormatIndianRupees(Line.amount_paise), "reference": Line.reference}
            for Line in Lines
        ],
        "methodSummary": ", ".join(f"{METHOD_LABELS.get(Line.method, Line.method)} {FormatIndianRupees(Line.amount_paise)}" for Line in Lines),
        "status": Row.status,
        "statusLabel": STATUS_LABELS.get(Row.status, Row.status),
        "createdAt": Row.created_at.isoformat() if Row.created_at else None,
        "createdByName": Names.get(Row.created_by_user_id),
        "editedAt": Row.edited_at.isoformat() if Row.edited_at else None,
        "editedByName": Names.get(Row.edited_by_user_id),
        "cancelledAt": Row.cancelled_at.isoformat() if Row.cancelled_at else None,
        "cancelledByName": Names.get(Row.cancelled_by_user_id),
        "cancelReason": Row.cancel_reason,
    }


def _AuditShape(db: Session, Row: Expense) -> dict[str, Any]:
    Payload = ExpensePayload(db, Row, Names={})
    return {
        "expenseNumber": Row.expense_number,
        "expenseDate": Payload["expenseDate"],
        "category": Row.category_name,
        "item": Row.item,
        "vendor": Row.vendor,
        "billNumber": Row.bill_number,
        "details": Row.details,
        "amount": PaiseToRupeesString(Row.amount_paise),
        "methods": Payload["methodSummary"],
        "centre": Payload["centreName"],
        "note": Row.note,
        "status": Row.status,
    }


def _WriteLines(db: Session, Row: Expense, Methods: list[dict[str, Any]]) -> None:
    for Line in Methods:
        db.add(ExpenseMethodLine(expense_id=Row.id, method=Line["method"], amount_paise=Line["amountPaise"], reference=Line["reference"], line_order=Line["order"]))
    db.flush()


def CreateExpense(db: Session, *, Request: dict[str, Any], IdempotencyKey: str, Actor: User | None) -> dict[str, Any]:
    Key = (IdempotencyKey or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,80}", Key):
        api_error(422, "IDEMPOTENCY_KEY_INVALID", "Refresh the page and try again.")
    Previous = db.query(Expense).filter(Expense.idempotency_key == Key).first()
    if Previous:
        return {**ExpensePayload(db, Previous), "replayed": True}
    Checked = _CheckedExpense(db, Request)
    Number = TakeNextNumber(db, "EXPENSE")
    Row = Expense(
        expense_number=Number,
        expense_date=Checked["expenseDate"],
        category_id=Checked["category"].id,
        category_name=Checked["category"].name,
        item=Checked["item"],
        vendor=Checked["vendor"],
        bill_number=Checked["billNumber"],
        details=Checked["details"],
        amount_paise=Checked["total"],
        centre_id=Checked["centreId"],
        note=Checked["note"],
        status="RECORDED",
        idempotency_key=Key,
        created_by_user_id=Actor.id if Actor else None,
    )
    db.add(Row)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        Previous = db.query(Expense).filter(Expense.idempotency_key == Key).first()
        if Previous:
            return {**ExpensePayload(db, Previous), "replayed": True}
        raise
    _WriteLines(db, Row, Checked["methods"])
    WritePaymentAudit(db, EntityType="EXPENSE", EntityId=Row.id, Action="CREATE", Actor=Actor, After=_AuditShape(db, Row))
    db.commit()
    return {**ExpensePayload(db, Row), "replayed": False}


def _Locked(db: Session, ExpenseId: str) -> Expense:
    Row = db.query(Expense).filter(Expense.id == ExpenseId).with_for_update().first()
    if not Row:
        api_error(404, "EXPENSE_NOT_FOUND", "That expense was not found.")
    return Row


def EditExpense(db: Session, *, ExpenseId: str, Request: dict[str, Any], Reason: Any, Actor: User | None) -> dict[str, Any]:
    CleanReason = _Clean(Reason, 500)
    if not CleanReason:
        api_error(422, "REASON_REQUIRED", "Please give a reason for the change.")
    Row = _Locked(db, ExpenseId)
    if Row.status == "CANCELLED":
        api_error(409, "EXPENSE_CANCELLED", f"{Row.expense_number} is cancelled and cannot be edited.")
    Before = _AuditShape(db, Row)
    Checked = _CheckedExpense(db, Request, Editing=Row)
    for Line in db.query(ExpenseMethodLine).filter(ExpenseMethodLine.expense_id == Row.id).all():
        db.delete(Line)  # part of the expense; before and after are in the history
    db.flush()
    Row.expense_date = Checked["expenseDate"]
    Row.category_id = Checked["category"].id
    Row.category_name = Checked["category"].name
    Row.item = Checked["item"]
    Row.vendor = Checked["vendor"]
    Row.bill_number = Checked["billNumber"]
    Row.details = Checked["details"]
    Row.amount_paise = Checked["total"]
    Row.centre_id = Checked["centreId"]
    Row.note = Checked["note"]
    Row.edited_at = datetime.now(timezone.utc)
    Row.edited_by_user_id = Actor.id if Actor else None
    _WriteLines(db, Row, Checked["methods"])
    After = _AuditShape(db, Row)
    WritePaymentAudit(db, EntityType="EXPENSE", EntityId=Row.id, Action="UPDATE", Actor=Actor, Before=Before, After=After, Reason=CleanReason)
    db.commit()
    return ExpensePayload(db, Row)


def CancelExpense(db: Session, *, ExpenseId: str, Reason: Any, Actor: User | None) -> dict[str, Any]:
    CleanReason = _Clean(Reason, 500)
    if not CleanReason:
        api_error(422, "REASON_REQUIRED", "Please give a reason for cancelling this expense.")
    Row = _Locked(db, ExpenseId)
    if Row.status == "CANCELLED":
        api_error(409, "EXPENSE_ALREADY_CANCELLED", f"{Row.expense_number} is already cancelled.")
    Before = _AuditShape(db, Row)
    Row.status = "CANCELLED"
    Row.cancelled_at = datetime.now(timezone.utc)
    Row.cancelled_by_user_id = Actor.id if Actor else None
    Row.cancel_reason = CleanReason
    db.flush()
    WritePaymentAudit(db, EntityType="EXPENSE", EntityId=Row.id, Action="CANCEL", Actor=Actor, Before=Before, After={**Before, "status": "CANCELLED"}, Reason=CleanReason)
    db.commit()
    return ExpensePayload(db, Row)


def GetExpense(db: Session, ExpenseId: str) -> dict[str, Any]:
    Row = db.get(Expense, ExpenseId)
    if not Row:
        api_error(404, "EXPENSE_NOT_FOUND", "That expense was not found.")
    return ExpensePayload(db, Row)


def _MonthRange(Month: str) -> tuple[date, date] | None:
    if not re.fullmatch(r"\d{4}-\d{2}", Month or ""):
        return None
    Year, MonthNumber = int(Month[:4]), int(Month[5:])
    if not 1 <= MonthNumber <= 12:
        return None
    Start = date(Year, MonthNumber, 1)
    End = date(Year + (MonthNumber == 12), (MonthNumber % 12) + 1, 1)
    return Start, End


def _Filtered(db: Session, Filters: dict[str, Any]):
    from app.services.payments.invoices_service import _ParseDate

    Query = db.query(Expense)
    Status = str(Filters.get("status") or "ALL").upper()
    if Status in STATUS_LABELS:
        Query = Query.filter(Expense.status == Status)
    Range = _MonthRange(str(Filters.get("month") or ""))
    if Range:
        Query = Query.filter(Expense.expense_date >= Range[0], Expense.expense_date < Range[1])
    DateFrom = _ParseDate(Filters.get("dateFrom"), "From date")
    DateTo = _ParseDate(Filters.get("dateTo"), "To date")
    if DateFrom:
        Query = Query.filter(Expense.expense_date >= DateFrom)
    if DateTo:
        Query = Query.filter(Expense.expense_date <= DateTo)
    if Filters.get("categoryId"):
        Query = Query.filter(Expense.category_id == Filters["categoryId"])
    if Filters.get("centreId"):
        Query = Query.filter(Expense.centre_id == Filters["centreId"]) if Filters["centreId"] != "NONE" else Query.filter(Expense.centre_id.is_(None))
    Method = str(Filters.get("method") or "").upper()
    if Method in METHOD_LABELS:
        Query = Query.filter(Expense.id.in_(db.query(ExpenseMethodLine.expense_id).filter(ExpenseMethodLine.method == Method)))
    Search = str(Filters.get("search") or "").strip()
    if Search:
        Like = f"%{Search.lower()}%"
        Query = Query.filter(
            or_(
                func.lower(Expense.item).like(Like),
                func.lower(func.coalesce(Expense.vendor, "")).like(Like),
                func.lower(func.coalesce(Expense.bill_number, "")).like(Like),
                func.lower(func.coalesce(Expense.details, "")).like(Like),
                func.lower(Expense.expense_number).like(Like),
                func.lower(Expense.category_name).like(Like),
            )
        )
    return Query


def ListExpenses(db: Session, *, Filters: dict[str, Any], Page: int = 1, PageSize: int = 50) -> dict[str, Any]:
    Page = max(1, int(Page or 1))
    PageSize = max(1, min(int(PageSize or 50), 200))
    Query = _Filtered(db, Filters)
    TotalCount = Query.count()
    Live = Query.filter(Expense.status == "RECORDED")
    Total = int(Live.with_entities(func.coalesce(func.sum(Expense.amount_paise), 0)).scalar() or 0)
    ByCategory = Live.with_entities(Expense.category_name, func.coalesce(func.sum(Expense.amount_paise), 0), func.count(Expense.id)).group_by(Expense.category_name).all()
    LiveIds = Live.with_entities(Expense.id).subquery()
    ByMethod = (
        db.query(ExpenseMethodLine.method, func.coalesce(func.sum(ExpenseMethodLine.amount_paise), 0))
        .filter(ExpenseMethodLine.expense_id.in_(db.query(LiveIds.c.id)))
        .group_by(ExpenseMethodLine.method)
        .all()
    )
    Rows = Query.order_by(Expense.expense_date.desc(), Expense.expense_number.desc()).offset((Page - 1) * PageSize).limit(PageSize).all()
    Names = _UserNames(db, {Row.created_by_user_id for Row in Rows} | {Row.edited_by_user_id for Row in Rows} | {Row.cancelled_by_user_id for Row in Rows})
    Centres = {Row.id: Row.name for Row in db.query(PaymentCentre).all()}
    return {
        "page": Page,
        "pageSize": PageSize,
        "totalCount": TotalCount,
        "totals": {
            "totalPaise": Total,
            "totalDisplay": FormatIndianRupees(Total),
            "byCategory": [
                {"categoryName": Name, "amountPaise": int(Amount or 0), "amountDisplay": FormatIndianRupees(int(Amount or 0)), "count": int(Count or 0)}
                for Name, Amount, Count in sorted(ByCategory, key=lambda Row: -int(Row[1] or 0))
            ],
            "byMethod": [
                {"method": Method, "methodLabel": METHOD_LABELS.get(Method, Method), "amountPaise": int(Amount or 0), "amountDisplay": FormatIndianRupees(int(Amount or 0))}
                for Method, Amount in sorted(ByMethod, key=lambda Row: -int(Row[1] or 0))
            ],
        },
        "expenses": [ExpensePayload(db, Row, Names=Names, Centres=Centres) for Row in Rows],
    }


def ExpensesForExport(db: Session, *, Filters: dict[str, Any]) -> list[dict[str, Any]]:
    Centres = {Row.id: Row.name for Row in db.query(PaymentCentre).all()}
    Rows = _Filtered(db, Filters).order_by(Expense.expense_date.asc(), Expense.expense_number.asc()).all()
    Names = _UserNames(db, {Row.created_by_user_id for Row in Rows})
    return [ExpensePayload(db, Row, Names=Names, Centres=Centres) for Row in Rows]


def ExpensesTotal(db: Session, Start: date, End: date) -> int:
    """Money spent from Start (inclusive) to End (exclusive)."""
    return int(
        db.query(func.coalesce(func.sum(Expense.amount_paise), 0))
        .filter(Expense.status == "RECORDED", Expense.expense_date >= Start, Expense.expense_date < End)
        .scalar()
        or 0
    )
