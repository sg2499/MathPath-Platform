"""Admin > Payments, billing Release 2 (2026-11-27, Shailesh): New Invoice
with several lines, New Admission, late fees, handover, the article fields
and dated prices of fee items, inventory, the book queue, and the ledger,
register and monthly tuition reports.

Admin only (SUPER_ADMIN / ADMIN), like the rest of /api/admin/payments."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.routes_admin_payments import _demo_payments_scope, admin_dep
from app.database import get_db
from app.models import User

router = APIRouter(prefix="/api/admin/payments", tags=["admin-payments-billing"], dependencies=[Depends(_demo_payments_scope)])

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _Excel(Content: bytes, FileName: str) -> Response:
    return Response(content=Content, media_type=XLSX, headers={"Content-Disposition": f'attachment; filename="{FileName}"', "Cache-Control": "no-store"})


def _Today() -> str:
    from app.services.payments.invoices_service import TodayInIndia

    return TodayInIndia().isoformat()


# --- Fee items: article fields and dated prices -------------------------------

class ArticleRequest(BaseModel):
    articleKind: str | None = None
    sku: str | None = None
    isStock: bool | None = None
    levelCode: str | None = None
    unit: str | None = None
    cost: str | float | int | None = None
    inKit: bool | None = None


class PriceRequest(BaseModel):
    amount: str | float | int
    effectiveFrom: str | None = None
    reason: str | None = None


@router.patch("/fee-items/{fee_item_id}/article")
def admin_update_article(fee_item_id: str, payload: ArticleRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.articles_service import UpdateArticle

    return UpdateArticle(db, FeeItemId=fee_item_id, Fields=payload.model_dump(exclude_unset=True), Actor=user)


@router.post("/fee-items/{fee_item_id}/prices")
def admin_schedule_price(fee_item_id: str, payload: PriceRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.articles_service import SchedulePrice

    return SchedulePrice(db, FeeItemId=fee_item_id, Amount=payload.amount, EffectiveFrom=payload.effectiveFrom, Reason=payload.reason, Actor=user)


@router.post("/fee-prices/{price_id}/cancel")
def admin_cancel_price(price_id: str, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.articles_service import CancelScheduledPrice

    return CancelScheduledPrice(db, PriceId=price_id, Actor=user)


# --- New Invoice, New Admission ----------------------------------------------

class LineInput(BaseModel):
    feeItemId: str
    quantity: int | None = 1
    discountType: str | None = None
    discountValue: str | float | int | None = None
    isKit: bool = False
    billingMonth: int | None = None
    billingYear: int | None = None


class DiscountInput(BaseModel):
    type: str | None = None
    value: str | float | int | None = None


class MethodInput(BaseModel):
    method: str
    amountPaise: int
    reference: str | None = None


class PaymentInput(BaseModel):
    paymentDate: str | None = None
    payBy: str | None = None
    receivedByUserId: str | None = None
    note: str | None = None
    methods: list[MethodInput] = Field(default_factory=list)
    keepAdvance: bool = False


class InvoiceDraftRequest(BaseModel):
    studentId: str
    invoiceDate: str | None = None
    dueDate: str | None = None
    lines: list[LineInput] = Field(default_factory=list)
    invoiceDiscount: DiscountInput | None = None
    discountReason: str | None = None
    approvedByUserId: str | None = None
    payment: PaymentInput | None = None


class InvoiceCreateRequest(InvoiceDraftRequest):
    idempotencyKey: str


@router.post("/invoices/create/preview")
def admin_preview_new_invoice(payload: InvoiceDraftRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.invoice_builder import PreviewInvoice

    return PreviewInvoice(db, Request=payload.model_dump())


@router.post("/invoices/create")
def admin_create_invoice(payload: InvoiceCreateRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.invoice_builder import CreateInvoice

    Request = payload.model_dump()
    Key = Request.pop("idempotencyKey")
    return CreateInvoice(db, Request=Request, IdempotencyKey=Key, Actor=user)


@router.get("/admission/template")
def admin_admission_template(studentId: str, invoiceDate: str | None = None, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.invoice_builder import AdmissionTemplate

    return AdmissionTemplate(db, StudentId=studentId, InvoiceDate=invoiceDate)


@router.post("/admission/preview")
def admin_preview_admission(payload: InvoiceDraftRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.invoice_builder import PreviewInvoice

    return PreviewInvoice(db, Request=payload.model_dump(), Admission=True)


@router.post("/admission")
def admin_create_admission(payload: InvoiceCreateRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.invoice_builder import CreateInvoice

    Request = payload.model_dump()
    Key = Request.pop("idempotencyKey")
    return CreateInvoice(db, Request=Request, IdempotencyKey=Key, Actor=user, Admission=True)


class HandoverRequest(BaseModel):
    date: str | None = None


@router.post("/invoices/{invoice_id}/late-fee")
def admin_add_late_fee(invoice_id: str, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.invoice_builder import AddLateFee

    return AddLateFee(db, InvoiceId=invoice_id, Actor=user)


@router.post("/invoices/{invoice_id}/lines/{line_id}/handover")
def admin_record_handover(invoice_id: str, line_id: str, payload: HandoverRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.invoice_builder import RecordHandover

    return RecordHandover(db, InvoiceId=invoice_id, LineId=line_id, Day=payload.date, Actor=user)


# --- Inventory ---------------------------------------------------------------

class StockLine(BaseModel):
    feeItemId: str
    quantity: int | str
    unitCost: str | float | int | None = None


class StockRequest(BaseModel):
    centreId: str | None = None
    fromCentreId: str | None = None
    toCentreId: str | None = None
    date: str | None = None
    supplier: str | None = None
    billNumber: str | None = None
    note: str | None = None
    reason: str | None = None
    lines: list[StockLine] = Field(default_factory=list)


class CentreStockInput(BaseModel):
    centreId: str
    holdsStock: bool | None = None
    stockFromCentreId: str | None = None


class InventorySettingsRequest(BaseModel):
    stockTrackingEnabled: bool | None = None
    lowStockThreshold: int | None = None
    defaultStockCentreId: str | None = None
    autoBookInvoices: bool | None = None
    reason: str | None = None
    centres: list[CentreStockInput] = Field(default_factory=list)


@router.get("/inventory/settings")
def admin_inventory_settings(db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.inventory_service import InventorySettingsPayload

    Result = InventorySettingsPayload(db)
    db.commit()
    return Result


@router.put("/inventory/settings")
def admin_update_inventory_settings(payload: InventorySettingsRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.inventory_service import UpdateInventorySettings

    Request: dict[str, Any] = payload.model_dump(exclude_unset=True)
    Request["centres"] = [Row.model_dump(exclude_unset=True) for Row in payload.centres]
    return UpdateInventorySettings(db, Request=Request, Actor=user)


@router.get("/inventory/summary")
def admin_stock_summary(db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.inventory_service import StockSummary

    Result = StockSummary(db)
    db.commit()
    return Result


@router.get("/inventory/movements")
def admin_stock_movements(
    feeItemId: str | None = None, centreId: str | None = None, type: str | None = None, studentId: str | None = None,
    dateFrom: str | None = None, dateTo: str | None = None, page: int = 1, pageSize: int = 50,
    db: Session = Depends(get_db), user: User = Depends(admin_dep),
):
    from app.services.payments.inventory_service import ListMovements

    Filters = {"feeItemId": feeItemId, "centreId": centreId, "type": type, "studentId": studentId, "dateFrom": dateFrom, "dateTo": dateTo}
    return ListMovements(db, Filters=Filters, Page=page, PageSize=pageSize)


@router.get("/inventory/export")
def admin_stock_export(
    feeItemId: str | None = None, centreId: str | None = None, type: str | None = None, dateFrom: str | None = None, dateTo: str | None = None,
    db: Session = Depends(get_db), user: User = Depends(admin_dep),
):
    from app.services.payments.inventory_service import MovementsForExport, StockSummary
    from app.services.payments.ledger_reports import BuildStockWorkbook

    Filters = {"feeItemId": feeItemId, "centreId": centreId, "type": type, "dateFrom": dateFrom, "dateTo": dateTo}
    Content = BuildStockWorkbook(StockSummary(db), MovementsForExport(db, Filters=Filters))
    db.commit()
    return _Excel(Content, f"MathPath-Stock-{_Today()}.xlsx")


@router.get("/inventory/availability")
def admin_stock_availability(studentId: str, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.models import Student
    from app.services.payments.inventory_service import AvailabilityFor

    StudentRow = db.get(Student, studentId)
    Result = AvailabilityFor(db, CentreId=StudentRow.centre_id if StudentRow else None)
    db.commit()
    return Result


@router.post("/inventory/inward")
def admin_stock_inward(payload: StockRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.inventory_service import RecordInward

    return RecordInward(db, Request=payload.model_dump(), Actor=user)


@router.post("/inventory/opening")
def admin_stock_opening(payload: StockRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.inventory_service import RecordOpening

    return RecordOpening(db, Request=payload.model_dump(), Actor=user)


@router.post("/inventory/transfer")
def admin_stock_transfer(payload: StockRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.inventory_service import RecordTransfer

    return RecordTransfer(db, Request=payload.model_dump(), Actor=user)


@router.post("/inventory/write-off")
def admin_stock_write_off(payload: StockRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.inventory_service import RecordWriteOff

    return RecordWriteOff(db, Request=payload.model_dump(), Actor=user)


# --- Book queue --------------------------------------------------------------

class BookRaiseRequest(BaseModel):
    taskIds: list[str] = Field(default_factory=list)


class BookSkipRequest(BaseModel):
    reason: str | None = None


@router.get("/books/queue")
def admin_book_queue(status: str | None = None, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.book_invoices import ListTasks

    Result = ListTasks(db, Status=status)
    db.commit()
    return Result


@router.get("/books/export")
def admin_book_queue_export(status: str | None = None, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.book_invoices import ListTasks
    from app.services.payments.ledger_reports import BuildBookQueueWorkbook

    Content = BuildBookQueueWorkbook(ListTasks(db, Status=status or "ALL"))
    db.commit()
    return _Excel(Content, f"MathPath-Book-Queue-{_Today()}.xlsx")


@router.post("/books/raise")
def admin_book_raise(payload: BookRaiseRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.book_invoices import RaiseTasks

    return RaiseTasks(db, TaskIds=payload.taskIds, Actor=user)


@router.post("/books/{task_id}/skip")
def admin_book_skip(task_id: str, payload: BookSkipRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.book_invoices import SkipTask

    return SkipTask(db, TaskId=task_id, Reason=payload.reason, Actor=user)


@router.post("/books/{task_id}/reopen")
def admin_book_reopen(task_id: str, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.book_invoices import ReopenTask

    return ReopenTask(db, TaskId=task_id, Actor=user)


# --- Reports -----------------------------------------------------------------

@router.get("/reports/ledger")
def admin_student_ledger(studentId: str | None = None, centreId: str | None = None, dateFrom: str | None = None, dateTo: str | None = None, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.ledger_reports import StudentLedger

    Report = StudentLedger(db, Filters={"studentId": studentId, "centreId": centreId, "dateFrom": dateFrom, "dateTo": dateTo})
    # The screen shows the summary and, for one student, the rows.
    if not studentId:
        Report["rows"] = []
    return Report


@router.get("/reports/ledger/export")
def admin_student_ledger_export(studentId: str | None = None, centreId: str | None = None, dateFrom: str | None = None, dateTo: str | None = None, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.ledger_reports import BuildLedgerWorkbook, StudentLedger

    Report = StudentLedger(db, Filters={"studentId": studentId, "centreId": centreId, "dateFrom": dateFrom, "dateTo": dateTo})
    return _Excel(BuildLedgerWorkbook(Report), f"MathPath-Student-Ledger-{_Today()}.xlsx")


@router.get("/reports/register/export")
def admin_invoice_register_export(
    centreId: str | None = None, dateFrom: str | None = None, dateTo: str | None = None, invoiceType: str | None = None, includeCancelled: bool = False,
    db: Session = Depends(get_db), user: User = Depends(admin_dep),
):
    from app.services.payments.ledger_reports import BuildRegisterWorkbook, InvoiceRegister

    Rows = InvoiceRegister(db, Filters={"centreId": centreId, "dateFrom": dateFrom, "dateTo": dateTo, "invoiceType": invoiceType, "includeCancelled": includeCancelled})
    return _Excel(BuildRegisterWorkbook(Rows), f"MathPath-Invoice-Register-{_Today()}.xlsx")


@router.get("/reports/tuition")
def admin_monthly_tuition(period: str | None = None, centreId: str | None = None, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.ledger_reports import MonthlyTuition

    return MonthlyTuition(db, Period=period or _Today()[:7], CentreId=centreId)


@router.get("/reports/tuition/export")
def admin_monthly_tuition_export(period: str | None = None, centreId: str | None = None, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.ledger_reports import BuildTuitionWorkbook, MonthlyTuition

    Report = MonthlyTuition(db, Period=period or _Today()[:7], CentreId=centreId)
    return _Excel(BuildTuitionWorkbook(Report), f"MathPath-Tuition-{Report['period']}.xlsx")
