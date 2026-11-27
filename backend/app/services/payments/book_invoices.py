"""Billing Release 2 (2026-11-27, Shailesh): the next level's book after a
cleared level assessment (client document §4, answers E1-E7, UAT 4).

  * OnLevelAssessmentCleared runs after the assessment result is saved and
    committed. It can never break the assessment: any error is caught,
    rolled back and kept on the queue row.
  * One queue row per student and level (a retake or a second clear never
    makes a second one). A failed assessment makes none. After the last
    level (no next level) there is no book.
  * With "Automatic book invoices" on (Inventory > Setup), the invoice is
    raised at once; with it off (the default while the old portal still
    bills), the row waits as PENDING for an admin to raise or skip.
  * Not enough stock while tracking is on: WAITING_STOCK, raised from the
    queue once stock arrives. No book set up for the level: NO_BOOK.
  * Promotion does not wait for payment (E4); a book is handed over only
    once it is paid (E3, see invoice_builder.RecordHandover).
  * No invoices for demo accounts, and nothing for clears before this was
    deployed.
"""
from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import BookInvoiceTask, FeeItem, Level, PaymentInvoice, PaymentInvoiceLine, Student, User
from app.services.payments.articles_service import BookForLevel, EnsureInventorySettings, PriceOn
from app.services.payments.audit import WritePaymentAudit
from app.services.payments.money import FormatIndianRupees

Log = logging.getLogger(__name__)

STATUS_LABELS = {
    "PENDING": "Waiting for an admin",
    "ISSUED": "Invoiced",
    "WAITING_STOCK": "Waiting for stock",
    "NO_BOOK": "No book set up",
    "ERROR": "Could not invoice",
    "SKIPPED": "Not billed",
    "CANCELLED": "Invoice cancelled",
}
OPEN_STATUSES = ("PENDING", "WAITING_STOCK", "NO_BOOK", "ERROR", "CANCELLED")


def _Today():
    from app.services.payments.invoices_service import TodayInIndia

    return TodayInIndia()


def SourceKeyFor(StudentId: str, LevelCode: str | None, LevelId: str) -> str:
    return f"BOOK:{StudentId}:{LevelCode or LevelId}"


def OnLevelAssessmentCleared(db: Session, Attempt: Any, Assignment: Any) -> None:
    """Called by the assessment engine after a CLEARED result is committed."""
    try:
        _Queue(db, Attempt, Assignment)
    except Exception as Error:  # noqa: BLE001 -- billing must never break an assessment
        db.rollback()
        Log.warning("Book invoice for attempt %s was not queued: %s", getattr(Attempt, "id", "?"), Error)


def _Queue(db: Session, Attempt: Any, Assignment: Any) -> None:
    from app.models import AssessmentBlueprint
    from app.services.assessment_engine_service import NextLevelForLevel
    from app.services.demo_students import IsDemoStudent

    if not Assignment:
        return
    StudentRow = db.get(Student, Attempt.student_id)
    if not StudentRow or IsDemoStudent(StudentRow):
        return
    Blueprint = db.get(AssessmentBlueprint, Assignment.blueprint_id)
    Cleared = db.get(Level, Blueprint.level_id) if Blueprint else None
    Next = NextLevelForLevel(db, Cleared) if Cleared else None
    if not Next:
        return  # the last level: no book after graduation
    if db.query(BookInvoiceTask).filter(BookInvoiceTask.student_id == StudentRow.id, BookInvoiceTask.target_level_id == Next.id).first():
        return
    Book = BookForLevel(db, Next.level_code)
    Task = BookInvoiceTask(
        student_id=StudentRow.id,
        cleared_level_id=Cleared.id,
        target_level_id=Next.id,
        target_level_code=Next.level_code,
        assessment_attempt_id=Attempt.id,
        fee_item_id=Book.id if Book else None,
        status="PENDING" if Book else "NO_BOOK",
    )
    try:
        with db.begin_nested():
            db.add(Task)
            db.flush()
    except IntegrityError:
        db.commit()
        return
    db.commit()
    if Book and EnsureInventorySettings(db).auto_book_invoices:
        _TryRaise(db, Task.id, Actor=None)


def _TryRaise(db: Session, TaskId: str, Actor: User | None) -> BookInvoiceTask:
    """Raises the book invoice for one queue row. Commits. Never raises for
    stock or set-up problems: they are kept on the row."""
    from fastapi import HTTPException

    try:
        Invoice = _Raise(db, TaskId, Actor)
        Task = db.get(BookInvoiceTask, TaskId)
        Task.status, Task.invoice_id, Task.last_error = "ISSUED", Invoice.id, None
        Task.attempts = (Task.attempts or 0) + 1
        Task.resolved_by_user_id = Actor.id if Actor else None
        db.commit()
        return Task
    except HTTPException as Error:
        db.rollback()
        Detail = Error.detail if isinstance(Error.detail, dict) else {"message": str(Error.detail)}
        Code = Detail.get("code")
        Task = db.get(BookInvoiceTask, TaskId)
        if Code == "ALREADY_RAISED":
            Existing = db.query(PaymentInvoice).filter(PaymentInvoice.source_key == SourceKeyFor(Task.student_id, Task.target_level_code, Task.target_level_id), PaymentInvoice.status != "CANCELLED").first()
            Task.status, Task.invoice_id, Task.last_error = ("ISSUED", Existing.id, None) if Existing else ("ERROR", None, Detail.get("message"))
        elif Code == "OUT_OF_STOCK":
            Task.status, Task.last_error = "WAITING_STOCK", Detail.get("message")
        elif Code == "NO_BOOK":
            Task.status, Task.last_error = "NO_BOOK", Detail.get("message")
        else:
            Task.status, Task.last_error = "ERROR", Detail.get("message") or str(Code)
        Task.attempts = (Task.attempts or 0) + 1
        db.commit()
        return Task
    except Exception as Error:  # noqa: BLE001
        db.rollback()
        Task = db.get(BookInvoiceTask, TaskId)
        Task.status, Task.last_error = "ERROR", str(Error)[:500]
        Task.attempts = (Task.attempts or 0) + 1
        db.commit()
        return Task


def _Raise(db: Session, TaskId: str, Actor: User | None) -> PaymentInvoice:
    from app.services.payments.invoice_builder import BuildInvoice, PriceLines, _LineDescription
    from app.services.payments.inventory_service import StockCentreId
    from app.services.payments.invoices_service import DEFAULT_DUE_DAYS
    from app.services.payments.numbering import LockSequence
    from app.services.payments.receipts_service import AdvanceBalances, ApplyAdvance, _LockStudent

    Sequence = LockSequence(db, "INVOICE")
    if not Sequence.is_configured:
        api_error(409, "PAYMENT_NUMBERING_NOT_SET", "The starting invoice number has not been set yet.")
    Task = db.query(BookInvoiceTask).filter(BookInvoiceTask.id == TaskId).with_for_update().one()
    StudentRow = _LockStudent(db, Task.student_id)
    Book = BookForLevel(db, Task.target_level_code)
    if not Book:
        api_error(409, "NO_BOOK", f"No book is set up for {Task.target_level_code}. Set the level on its book in Fee Setup.")
    Task.fee_item_id = Book.id
    Today = _Today()
    Spec = {
        "item": Book,
        "quantity": 1,
        "unitPaise": PriceOn(db, Book, Today),
        "discount": None,
        "isKit": False,
        "periodKey": None,
        "description": _LineDescription(Book, None, None, False),
        "stockCentreId": StockCentreId(db, StudentRow.centre_id) if Book.is_stock else None,
    }
    Invoice, _ = BuildInvoice(
        db, StudentRow=StudentRow, Priced=PriceLines([Spec], None), InvoiceDate=Today, DueDate=Today + timedelta(days=DEFAULT_DUE_DAYS),
        InvoiceType="STUDY_MATERIAL", SourceKey=SourceKeyFor(StudentRow.id, Task.target_level_code, Task.target_level_id), Actor=Actor,
    )
    if AdvanceBalances(db, [StudentRow.id]):
        ApplyAdvance(db, StudentId=StudentRow.id, Actor=Actor, InvoiceIds=[Invoice.id], LockStudent=False)
    from app.services.payments.online_service import NotifyInvoicesRaised

    NotifyInvoicesRaised(db, {StudentRow.id: [Invoice.id]})
    return Invoice


# --------------------------------------------------------------------------
# Admin actions on the queue
# --------------------------------------------------------------------------

def _Task(db: Session, TaskId: str) -> BookInvoiceTask:
    Task = db.get(BookInvoiceTask, TaskId)
    if not Task:
        api_error(404, "BOOK_TASK_NOT_FOUND", "That book was not found in the queue. Refresh and try again.")
    return Task


def _Who(db: Session, Task: BookInvoiceTask) -> str:
    StudentRow = db.get(Student, Task.student_id)
    UserRow = db.get(User, StudentRow.user_id) if StudentRow else None
    return UserRow.full_name if UserRow else "a student"


def RaiseTasks(db: Session, *, TaskIds: list[str], Actor: User | None) -> dict[str, Any]:
    Ids = [Id for Id in dict.fromkeys(str(Id) for Id in TaskIds or []) if Id]
    if not Ids:
        api_error(422, "NOTHING_CHOSEN", "Choose at least one book to invoice.")
    if len(Ids) > 200:
        api_error(422, "TOO_MANY", "Raise at most 200 at a time.")
    Raised, NotRaised = 0, []
    for TaskId in Ids:
        Task = _Task(db, TaskId)
        if Task.status in ("ISSUED", "SKIPPED"):
            continue
        Task = _TryRaise(db, TaskId, Actor)
        if Task.status == "ISSUED":
            Raised += 1
            WritePaymentAudit(db, EntityType="BOOK_TASK", EntityId=Task.id, Action="RAISE", Actor=Actor, After={"student": _Who(db, Task), "level": Task.target_level_code, "invoiceId": Task.invoice_id})
            db.commit()
        else:
            NotRaised.append({"taskId": Task.id, "student": _Who(db, Task), "reason": Task.last_error or STATUS_LABELS.get(Task.status)})
    return {"raised": Raised, "notRaised": NotRaised, "queue": ListTasks(db)}


def SkipTask(db: Session, *, TaskId: str, Reason: Any, Actor: User | None) -> dict[str, Any]:
    import re

    Task = db.query(BookInvoiceTask).filter(BookInvoiceTask.id == TaskId).with_for_update().first()
    if not Task:
        api_error(404, "BOOK_TASK_NOT_FOUND", "That book was not found in the queue.")
    if Task.status == "ISSUED":
        api_error(409, "ALREADY_INVOICED", "This book is already invoiced. Cancel the invoice instead.")
    Text = re.sub(r"\s+", " ", str(Reason or "")).strip()[:300]
    if not Text:
        api_error(422, "REASON_REQUIRED", "Please say why this book is not being billed (e.g. billed on the old portal).")
    Task.status, Task.skip_reason, Task.resolved_by_user_id = "SKIPPED", Text, Actor.id if Actor else None
    WritePaymentAudit(db, EntityType="BOOK_TASK", EntityId=Task.id, Action="SKIP", Actor=Actor, After={"student": _Who(db, Task), "level": Task.target_level_code}, Reason=Text)
    db.commit()
    return ListTasks(db)


def ReopenTask(db: Session, *, TaskId: str, Actor: User | None) -> dict[str, Any]:
    Task = db.query(BookInvoiceTask).filter(BookInvoiceTask.id == TaskId).with_for_update().first()
    if not Task:
        api_error(404, "BOOK_TASK_NOT_FOUND", "That book was not found in the queue.")
    if Task.status != "SKIPPED":
        api_error(409, "NOT_SKIPPED", "Only a book marked Not billed can be put back.")
    Task.status, Task.skip_reason = "PENDING", None
    WritePaymentAudit(db, EntityType="BOOK_TASK", EntityId=Task.id, Action="REOPEN", Actor=Actor, After={"student": _Who(db, Task), "level": Task.target_level_code})
    db.commit()
    return ListTasks(db)


def InvoiceCancelled(db: Session, Invoice: PaymentInvoice) -> None:
    """Its book can be raised again from the queue (called by CancelInvoice,
    inside its transaction)."""
    for Task in db.query(BookInvoiceTask).filter(BookInvoiceTask.invoice_id == Invoice.id).all():
        Task.status, Task.last_error = "CANCELLED", f"{Invoice.invoice_number} was cancelled"
    db.flush()


def BooksInvoicedByHand(db: Session, StudentId: str, Invoice: PaymentInvoice, Lines: list[PaymentInvoiceLine]) -> None:
    """A book put on a New Invoice / New Admission by hand settles that
    level's open queue row, so it is not invoiced twice."""
    Levels = set()
    for Line in Lines:
        if Line.article_kind == "BOOK" and Line.fee_item_id:
            Item = db.get(FeeItem, Line.fee_item_id)
            if Item and Item.level_code:
                Levels.add(Item.level_code)
    if not Levels:
        return
    for Task in db.query(BookInvoiceTask).filter(BookInvoiceTask.student_id == StudentId, BookInvoiceTask.target_level_code.in_(Levels), BookInvoiceTask.status.in_(OPEN_STATUSES)).all():
        Task.status, Task.invoice_id, Task.last_error = "ISSUED", Invoice.id, None
    db.flush()


def ListTasks(db: Session, *, Status: str | None = None) -> dict[str, Any]:
    from app.services.demo_students import RealStudents

    Query = db.query(BookInvoiceTask)
    Wanted = str(Status or "OPEN").upper()
    if Wanted == "OPEN":
        Query = Query.filter(BookInvoiceTask.status.in_(OPEN_STATUSES))
    elif Wanted in STATUS_LABELS:
        Query = Query.filter(BookInvoiceTask.status == Wanted)
    Rows = Query.order_by(BookInvoiceTask.created_at.desc()).limit(500).all()
    StudentIds = {Row.student_id for Row in Rows}
    People = {}
    if StudentIds:
        for StudentRow, UserRow in RealStudents(db.query(Student, User)).join(User, Student.user_id == User.id).filter(Student.id.in_(StudentIds)).all():
            People[StudentRow.id] = (UserRow.full_name, StudentRow.student_code, StudentRow.centre_id)
    Items = {Row.id: Row for Row in db.query(FeeItem).filter(FeeItem.id.in_({Row.fee_item_id for Row in Rows if Row.fee_item_id})).all()} if Rows else {}
    Invoices = {Row.id: Row for Row in db.query(PaymentInvoice).filter(PaymentInvoice.id.in_({Row.invoice_id for Row in Rows if Row.invoice_id})).all()} if Rows else {}
    Counts: dict[str, int] = {}
    for Value, in db.query(BookInvoiceTask.status).all():
        Counts[Value] = Counts.get(Value, 0) + 1
    Settings = EnsureInventorySettings(db)
    Out = []
    for Row in Rows:
        if Row.student_id not in People:
            continue
        Name, Code, _ = People[Row.student_id]
        Item = Items.get(Row.fee_item_id)
        Invoice = Invoices.get(Row.invoice_id)
        Out.append({
            "taskId": Row.id,
            "studentId": Row.student_id,
            "studentName": Name,
            "studentCode": Code,
            "levelCode": Row.target_level_code,
            "bookName": Item.name if Item else None,
            "priceDisplay": FormatIndianRupees(Item.amount_paise) if Item else None,
            "status": Row.status,
            "statusLabel": STATUS_LABELS.get(Row.status, Row.status),
            "lastError": Row.last_error,
            "skipReason": Row.skip_reason,
            "invoiceId": Row.invoice_id,
            "invoiceNumber": Invoice.invoice_number if Invoice else None,
            "invoiceStatus": Invoice.status if Invoice else None,
            "clearedOn": Row.created_at.isoformat() if Row.created_at else None,
            "canRaise": Row.status in OPEN_STATUSES,
        })
    return {
        "autoBookInvoices": bool(Settings.auto_book_invoices),
        "openCount": sum(Counts.get(Key, 0) for Key in OPEN_STATUSES),
        "counts": Counts,
        "tasks": Out,
    }
