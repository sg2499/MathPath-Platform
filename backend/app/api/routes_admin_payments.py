"""Admin > Payments API (Phase 1, 2026-10-08): fee setup, business details,
centres, document numbering, student centres and the audit history.
Phase 2 (2026-10-08): invoices -- preview, generate, list, PDF, Excel, cancel.
Phase 3 (2026-10-08): payments -- record, edit, cancel, receipts, advances
and each student's account.
Phase 4 (2026-10-08): reports (overview, collections, dues) and expenses.
Phase 5 (2026-10-09): online payments -- the switches, the Online Payments
log with "Check with Razorpay", and parent pay links.

Admin only (SUPER_ADMIN / ADMIN). Students and teachers get 403 on every
route here."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_roles
from app.models import User
from app.services.payments.audit import ListPaymentAudit
from app.services.payments.expenses_service import (
    CancelExpense,
    CreateCategory,
    CreateExpense,
    EditExpense,
    ExpensesForExport,
    GetExpense,
    ListCategories,
    ListExpenses,
    UpdateCategory,
)
from app.services.payments.invoice_export import (
    BuildCollectionsWorkbook,
    BuildDuesWorkbook,
    BuildExpensesWorkbook,
    BuildInvoicesWorkbook,
    BuildPaymentsWorkbook,
)
from app.services.payments.invoice_pdf import RenderCollectionSummaryPdf, RenderInvoicesPdf, RenderReceiptsPdf, SafeFileName
from app.services.payments.reports_service import CollectionLinesForExport, CollectionsReport, DuesReport, Overview
from app.services.payments.receipts_service import (
    ApplyAdvanceNow,
    CancelPayment,
    EditPayment,
    GetPayment,
    ListPayments,
    ListStaff,
    PaymentPayload,
    PaymentsForExport,
    PaymentsForPdf,
    RecordPayment,
    StudentAccount,
)
from app.services.payments.invoices_service import (
    CancelInvoice,
    GenerateInvoices,
    GetInvoice,
    InvoicesForExport,
    InvoicesForPdf,
    ListInvoices,
    ListStudentsForInvoicing,
    PreviewInvoices,
    TodayInIndia,
)
from app.services.payments.home_service import PaymentsHome, Search as PaymentsSearch
from app.services.payments.numbering import SetStartingNumber
from app.services.payments.online_service import (
    CheckOrderWithRazorpay,
    CreatePayLink,
    GetOnlineOrder,
    ListOnlineOrders,
    OnlineSettingsPayload,
    RevokePayLink,
    StudentPayLink,
    UpdateOnlineSettings,
)
from app.services.payments.setup_service import (
    AssignStudentsToCentre,
    CreateCentre,
    CreateFeeItem,
    EnsurePaymentDefaults,
    GetPaymentSettings,
    ListFeeItems,
    ListStudentsForCentreAssignment,
    ReorderFeeItems,
    SetFeeItemActive,
    UpdateBusinessProfile,
    UpdateCentre,
    UpdateFeeItem,
)

router = APIRouter(prefix="/api/admin/payments", tags=["admin-payments"])
admin_dep = require_roles("SUPER_ADMIN", "ADMIN")


class FeeItemCreateRequest(BaseModel):
    name: str
    amount: str | float | int
    gstIncluded: bool = True
    billingType: str = "ONE_TIME"
    description: str | None = None


class FeeItemUpdateRequest(BaseModel):
    name: str | None = None
    amount: str | float | int | None = None
    gstIncluded: bool | None = None
    billingType: str | None = None
    description: str | None = None
    clearDescription: bool = False
    reason: str | None = None


class FeeItemActiveRequest(BaseModel):
    isActive: bool
    reason: str | None = None


class FeeItemReorderRequest(BaseModel):
    orderedIds: list[str]


class BusinessUpdateRequest(BaseModel):
    legalName: str | None = None
    brandName: str | None = None
    gstin: str | None = None
    pan: str | None = None
    registeredAddress: str | None = None
    email: str | None = None
    phone: str | None = None
    logoUrl: str | None = None
    invoiceFooter: str | None = None


class CentreCreateRequest(BaseModel):
    name: str
    address: str | None = None
    phone: str | None = None


class CentreUpdateRequest(BaseModel):
    name: str | None = None
    address: str | None = None
    phone: str | None = None
    isActive: bool | None = None
    reason: str | None = None


class AssignCentreRequest(BaseModel):
    studentIds: list[str]
    centreId: str | None = None


class SequenceUpdateRequest(BaseModel):
    nextNumber: int
    reason: str | None = None


class InvoiceRunRequest(BaseModel):
    feeItemIds: list[str] = Field(default_factory=list)
    studentIds: list[str] = Field(default_factory=list)
    billingMonth: int | None = None
    billingYear: int | None = None
    invoiceDate: str | None = None
    dueDate: str | None = None
    allowRepeatOneTime: bool = False


class InvoiceGenerateRequest(InvoiceRunRequest):
    idempotencyKey: str


class InvoiceCancelRequest(BaseModel):
    reason: str | None = None


class InvoiceFilters(BaseModel):
    status: str | None = None
    feeItemId: str | None = None
    period: str | None = None
    centreId: str | None = None
    studentId: str | None = None
    batchId: str | None = None
    dateFrom: str | None = None
    dateTo: str | None = None
    search: str | None = None


class InvoicePdfRequest(BaseModel):
    invoiceIds: list[str] | None = None
    filters: InvoiceFilters | None = None


class PaymentAllocationLine(BaseModel):
    invoiceId: str
    amountPaise: int = 0
    discountPaise: int = 0


class PaymentMethodInput(BaseModel):
    method: str
    amountPaise: int
    reference: str | None = None


class PaymentInput(BaseModel):
    paymentDate: str | None = None
    payBy: str | None = None
    receivedByUserId: str | None = None
    note: str | None = None
    allocations: list[PaymentAllocationLine] = Field(default_factory=list)
    methods: list[PaymentMethodInput] = Field(default_factory=list)
    discountReason: str | None = None
    keepAdvance: bool = False


class PaymentRecordRequest(PaymentInput):
    studentId: str
    idempotencyKey: str


class PaymentEditRequest(PaymentInput):
    reason: str | None = None


class PaymentCancelRequest(BaseModel):
    reason: str | None = None


class PaymentFilters(BaseModel):
    status: str | None = None
    method: str | None = None
    receivedBy: str | None = None
    centreId: str | None = None
    studentId: str | None = None
    dateFrom: str | None = None
    dateTo: str | None = None
    search: str | None = None


class PaymentPdfRequest(BaseModel):
    paymentIds: list[str] | None = None
    filters: PaymentFilters | None = None


class ExpenseMethodInput(BaseModel):
    method: str
    amountPaise: int
    reference: str | None = None


class ExpenseInput(BaseModel):
    expenseDate: str | None = None
    categoryId: str | None = None
    item: str | None = None
    vendor: str | None = None
    billNumber: str | None = None
    details: str | None = None
    note: str | None = None
    centreId: str | None = None
    methods: list[ExpenseMethodInput] = Field(default_factory=list)


class ExpenseCreateRequest(ExpenseInput):
    idempotencyKey: str


class ExpenseEditRequest(ExpenseInput):
    reason: str | None = None


class ExpenseCancelRequest(BaseModel):
    reason: str | None = None


class CategoryCreateRequest(BaseModel):
    name: str


class CategoryUpdateRequest(BaseModel):
    name: str | None = None
    isActive: bool | None = None
    reason: str | None = None


def _SentFields(Payload: BaseModel) -> dict[str, Any]:
    """Only the fields the client actually sent (so 'not sent' never wipes a
    value, while an explicit empty string still clears it)."""
    return Payload.model_dump(exclude_unset=True)


# --- Fee setup ---------------------------------------------------------------

@router.get("/fee-items")
def admin_list_fee_items(db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return {"feeItems": ListFeeItems(db)}


@router.post("/fee-items")
def admin_create_fee_item(payload: FeeItemCreateRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return CreateFeeItem(
        db,
        Name=payload.name,
        Amount=payload.amount,
        GstIncluded=payload.gstIncluded,
        BillingType=payload.billingType,
        Description=payload.description,
        Actor=user,
    )


@router.patch("/fee-items/{fee_item_id}")
def admin_update_fee_item(fee_item_id: str, payload: FeeItemUpdateRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    Sent = _SentFields(payload)
    return UpdateFeeItem(
        db,
        FeeItemId=fee_item_id,
        Name=payload.name,
        Amount=payload.amount,
        GstIncluded=payload.gstIncluded,
        BillingType=payload.billingType,
        Description=(None if payload.clearDescription else payload.description) if ("description" in Sent or payload.clearDescription) else "__UNSET__",
        Reason=payload.reason,
        Actor=user,
    )


@router.post("/fee-items/{fee_item_id}/active")
def admin_set_fee_item_active(fee_item_id: str, payload: FeeItemActiveRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return SetFeeItemActive(db, FeeItemId=fee_item_id, IsActive=payload.isActive, Reason=payload.reason, Actor=user)


@router.post("/fee-items/reorder")
def admin_reorder_fee_items(payload: FeeItemReorderRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return {"feeItems": ReorderFeeItems(db, OrderedIds=payload.orderedIds, Actor=user)}


# --- Settings ------------------------------------------------------------------

@router.get("/settings")
def admin_get_payment_settings(db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return GetPaymentSettings(db)


@router.put("/settings/business")
def admin_update_business(payload: BusinessUpdateRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return UpdateBusinessProfile(db, Fields=_SentFields(payload), Actor=user)


@router.post("/centres")
def admin_create_centre(payload: CentreCreateRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    EnsurePaymentDefaults(db)
    return CreateCentre(db, Name=payload.name, Address=payload.address, Phone=payload.phone, Actor=user)


@router.patch("/centres/{centre_id}")
def admin_update_centre(centre_id: str, payload: CentreUpdateRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return UpdateCentre(db, CentreId=centre_id, Fields=_SentFields(payload), Actor=user)


@router.get("/centres/students")
def admin_list_students_for_centres(db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return {"students": ListStudentsForCentreAssignment(db)}


@router.post("/centres/assign")
def admin_assign_students_to_centre(payload: AssignCentreRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return AssignStudentsToCentre(db, StudentIds=payload.studentIds, CentreId=payload.centreId, Actor=user)


@router.put("/numbering/{sequence_key}")
def admin_set_starting_number(sequence_key: str, payload: SequenceUpdateRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    Result = SetStartingNumber(db, Key=sequence_key.upper(), NextNumber=payload.nextNumber, Actor=user, Reason=payload.reason)
    db.commit()
    return Result


# --- History -------------------------------------------------------------------

@router.get("/audit")
def admin_list_payment_audit(entityType: str | None = None, entityId: str | None = None, limit: int = 100, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return {"entries": ListPaymentAudit(db, EntityType=entityType, EntityId=entityId, Limit=limit)}


# --- Invoices (Phase 2) ------------------------------------------------------
# Fixed paths are declared before /invoices/{invoice_id}.

def _FilterDict(status, feeItemId, period, centreId, studentId, batchId, dateFrom, dateTo, search) -> dict[str, Any]:
    return {
        "status": status, "feeItemId": feeItemId, "period": period, "centreId": centreId, "studentId": studentId,
        "batchId": batchId, "dateFrom": dateFrom, "dateTo": dateTo, "search": search,
    }


def _PdfResponse(Content: bytes, FileName: str) -> Response:
    return Response(
        content=Content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{SafeFileName(FileName)}"', "Cache-Control": "no-store"},
    )


@router.get("/invoices/student-options")
def admin_invoice_student_options(db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return {"students": ListStudentsForInvoicing(db)}


@router.post("/invoices/preview")
def admin_preview_invoices(payload: InvoiceRunRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return PreviewInvoices(db, Request=payload.model_dump())


@router.post("/invoices/generate")
def admin_generate_invoices(payload: InvoiceGenerateRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    Request = payload.model_dump()
    Key = Request.pop("idempotencyKey")
    return GenerateInvoices(db, Request=Request, IdempotencyKey=Key, Actor=user)


@router.get("/invoices")
def admin_list_invoices(
    status: str | None = None,
    feeItemId: str | None = None,
    period: str | None = None,
    centreId: str | None = None,
    studentId: str | None = None,
    batchId: str | None = None,
    dateFrom: str | None = None,
    dateTo: str | None = None,
    search: str | None = None,
    page: int = 1,
    pageSize: int = 50,
    db: Session = Depends(get_db),
    user: User = Depends(admin_dep),
):
    Filters = _FilterDict(status, feeItemId, period, centreId, studentId, batchId, dateFrom, dateTo, search)
    return ListInvoices(db, Filters=Filters, Page=page, PageSize=pageSize)


@router.get("/invoices/export")
def admin_export_invoices(
    status: str | None = None,
    feeItemId: str | None = None,
    period: str | None = None,
    centreId: str | None = None,
    studentId: str | None = None,
    batchId: str | None = None,
    dateFrom: str | None = None,
    dateTo: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(admin_dep),
):
    Filters = _FilterDict(status, feeItemId, period, centreId, studentId, batchId, dateFrom, dateTo, search)
    Content = BuildInvoicesWorkbook(InvoicesForExport(db, Filters=Filters))
    FileName = f"MathPath-Invoices-{TodayInIndia().isoformat()}.xlsx"
    return Response(
        content=Content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{FileName}"', "Cache-Control": "no-store"},
    )


@router.post("/invoices/pdf")
def admin_invoices_bulk_pdf(payload: InvoicePdfRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    Rows = InvoicesForPdf(
        db,
        InvoiceIds=payload.invoiceIds,
        Filters=payload.filters.model_dump() if payload.filters else None,
    )
    Name = f"{Rows[0].invoice_number}.pdf" if len(Rows) == 1 else f"MathPath-Invoices-{TodayInIndia().isoformat()}-{len(Rows)}.pdf"
    return _PdfResponse(RenderInvoicesPdf(Rows, Title="MathPath invoices"), Name)


@router.get("/invoices/{invoice_id}")
def admin_get_invoice(invoice_id: str, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return GetInvoice(db, invoice_id)


@router.get("/invoices/{invoice_id}/pdf")
def admin_invoice_pdf(invoice_id: str, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    Rows = InvoicesForPdf(db, InvoiceIds=[invoice_id])
    return _PdfResponse(RenderInvoicesPdf(Rows, Title=f"Tax Invoice {Rows[0].invoice_number}"), f"{Rows[0].invoice_number}.pdf")


@router.post("/invoices/{invoice_id}/cancel")
def admin_cancel_invoice(invoice_id: str, payload: InvoiceCancelRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return CancelInvoice(db, InvoiceId=invoice_id, Reason=payload.reason, Actor=user)


# --- Payments and receipts (Phase 3) -----------------------------------------
# Fixed paths are declared before /receipts/{payment_id}.

def _PaymentFilterDict(status, method, receivedBy, centreId, studentId, dateFrom, dateTo, search) -> dict[str, Any]:
    return {
        "status": status, "method": method, "receivedBy": receivedBy, "centreId": centreId,
        "studentId": studentId, "dateFrom": dateFrom, "dateTo": dateTo, "search": search,
    }


def _ReceiptsPdf(db: Session, Rows) -> bytes:
    import json as _json

    return RenderReceiptsPdf([(_json.loads(Row.snapshot_json), PaymentPayload(db, Row, Names={})) for Row in Rows])


@router.get("/staff")
def admin_payment_staff(db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return {"staff": ListStaff(db), "currentUserId": user.id}


@router.get("/students/{student_id}/account")
def admin_student_account(student_id: str, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return StudentAccount(db, student_id)


@router.post("/students/{student_id}/apply-advance")
def admin_apply_advance(student_id: str, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return ApplyAdvanceNow(db, StudentId=student_id, Actor=user)


@router.post("/receipts")
def admin_record_payment(payload: PaymentRecordRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    Request = payload.model_dump()
    StudentId = Request.pop("studentId")
    Key = Request.pop("idempotencyKey")
    return RecordPayment(db, StudentId=StudentId, Request=Request, IdempotencyKey=Key, Actor=user)


@router.get("/receipts")
def admin_list_payments(
    status: str | None = None,
    method: str | None = None,
    receivedBy: str | None = None,
    centreId: str | None = None,
    studentId: str | None = None,
    dateFrom: str | None = None,
    dateTo: str | None = None,
    search: str | None = None,
    page: int = 1,
    pageSize: int = 50,
    db: Session = Depends(get_db),
    user: User = Depends(admin_dep),
):
    Filters = _PaymentFilterDict(status, method, receivedBy, centreId, studentId, dateFrom, dateTo, search)
    return ListPayments(db, Filters=Filters, Page=page, PageSize=pageSize)


@router.get("/receipts/export")
def admin_export_payments(
    status: str | None = None,
    method: str | None = None,
    receivedBy: str | None = None,
    centreId: str | None = None,
    studentId: str | None = None,
    dateFrom: str | None = None,
    dateTo: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(admin_dep),
):
    Filters = _PaymentFilterDict(status, method, receivedBy, centreId, studentId, dateFrom, dateTo, search)
    Content = BuildPaymentsWorkbook(PaymentsForExport(db, Filters=Filters))
    FileName = f"MathPath-Payments-{TodayInIndia().isoformat()}.xlsx"
    return Response(
        content=Content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{FileName}"', "Cache-Control": "no-store"},
    )


@router.post("/receipts/pdf")
def admin_receipts_bulk_pdf(payload: PaymentPdfRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    Rows = PaymentsForPdf(db, PaymentIds=payload.paymentIds, Filters=payload.filters.model_dump() if payload.filters else None)
    Name = f"{Rows[0].receipt_number}.pdf" if len(Rows) == 1 else f"MathPath-Receipts-{TodayInIndia().isoformat()}-{len(Rows)}.pdf"
    return _PdfResponse(_ReceiptsPdf(db, Rows), Name)


@router.get("/receipts/{payment_id}")
def admin_get_payment(payment_id: str, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return GetPayment(db, payment_id)


@router.put("/receipts/{payment_id}")
def admin_edit_payment(payment_id: str, payload: PaymentEditRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    Request = payload.model_dump()
    Reason = Request.pop("reason")
    return EditPayment(db, PaymentId=payment_id, Request=Request, Reason=Reason, Actor=user)


@router.post("/receipts/{payment_id}/cancel")
def admin_cancel_payment(payment_id: str, payload: PaymentCancelRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return CancelPayment(db, PaymentId=payment_id, Reason=payload.reason, Actor=user)


@router.get("/receipts/{payment_id}/pdf")
def admin_receipt_pdf(payment_id: str, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    Rows = PaymentsForPdf(db, PaymentIds=[payment_id])
    return _PdfResponse(_ReceiptsPdf(db, Rows), f"{Rows[0].receipt_number}.pdf")


# --- Reports (Phase 4) ---------------------------------------------------------

def _Excel(Content: bytes, FileName: str) -> Response:
    return Response(
        content=Content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{SafeFileName(FileName)}"', "Cache-Control": "no-store"},
    )


@router.get("/reports/overview")
def admin_payments_overview(db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return Overview(db)


@router.get("/reports/collections")
def admin_collections_report(dateFrom: str | None = None, dateTo: str | None = None, method: str | None = None, receivedBy: str | None = None, centreId: str | None = None, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return CollectionsReport(db, Filters={"dateFrom": dateFrom, "dateTo": dateTo, "method": method, "receivedBy": receivedBy, "centreId": centreId})


@router.get("/reports/collections/export")
def admin_collections_export(dateFrom: str | None = None, dateTo: str | None = None, method: str | None = None, receivedBy: str | None = None, centreId: str | None = None, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    Report, Lines = CollectionLinesForExport(db, Filters={"dateFrom": dateFrom, "dateTo": dateTo, "method": method, "receivedBy": receivedBy, "centreId": centreId})
    Name = f"MathPath-Collections-{Report['dateFrom']}" + (f"-to-{Report['dateTo']}" if Report["dateTo"] != Report["dateFrom"] else "") + ".xlsx"
    return _Excel(BuildCollectionsWorkbook(Report, Lines), Name)


@router.get("/reports/collections/pdf")
def admin_collections_pdf(dateFrom: str | None = None, dateTo: str | None = None, method: str | None = None, receivedBy: str | None = None, centreId: str | None = None, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.models import PaymentCentre
    from app.services.payments.invoices_service import _BusinessSnapshot
    from app.services.payments.receipts_service import METHOD_LABELS

    Filters = {"dateFrom": dateFrom, "dateTo": dateTo, "method": method, "receivedBy": receivedBy, "centreId": centreId}
    Report = CollectionsReport(db, Filters=Filters)
    Parts = []
    if method and method.upper() in METHOD_LABELS:
        Parts.append(METHOD_LABELS[method.upper()] + " only")
    if receivedBy:
        Receiver = db.get(User, receivedBy)
        Parts.append(f"Received by {Receiver.full_name if Receiver else 'unknown'}")
    if centreId:
        Centre = db.get(PaymentCentre, centreId) if centreId != "NONE" else None
        Parts.append(f"Centre: {Centre.name if Centre else 'not set'}")
    Name = f"MathPath-Collections-{Report['dateFrom']}" + (f"-to-{Report['dateTo']}" if Report["dateTo"] != Report["dateFrom"] else "") + ".pdf"
    return _PdfResponse(RenderCollectionSummaryPdf(_BusinessSnapshot(db), Report, FilterText=" · ".join(Parts)), Name)


@router.get("/reports/dues")
def admin_dues_report(centreId: str | None = None, levelCode: str | None = None, feeItemId: str | None = None, bucket: str | None = None, search: str | None = None, activeOnly: str | None = None, sort: str | None = None, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return DuesReport(db, Filters={"centreId": centreId, "levelCode": levelCode, "feeItemId": feeItemId, "bucket": bucket, "search": search, "activeOnly": activeOnly, "sort": sort})


@router.get("/reports/dues/export")
def admin_dues_export(centreId: str | None = None, levelCode: str | None = None, feeItemId: str | None = None, bucket: str | None = None, search: str | None = None, activeOnly: str | None = None, sort: str | None = None, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    Report = DuesReport(db, Filters={"centreId": centreId, "levelCode": levelCode, "feeItemId": feeItemId, "bucket": bucket, "search": search, "activeOnly": activeOnly, "sort": sort})
    return _Excel(BuildDuesWorkbook(Report), f"MathPath-Dues-{Report['asOf']}.xlsx")


# --- Expenses (Phase 4) --------------------------------------------------------
# Fixed paths are declared before /expenses/{expense_id}.

@router.get("/expense-categories")
def admin_list_expense_categories(db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    Result = ListCategories(db)
    db.commit()
    return {"categories": Result}


@router.post("/expense-categories")
def admin_create_expense_category(payload: CategoryCreateRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return CreateCategory(db, Name=payload.name, Actor=user)


@router.patch("/expense-categories/{category_id}")
def admin_update_expense_category(category_id: str, payload: CategoryUpdateRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return UpdateCategory(db, CategoryId=category_id, Name=payload.name, IsActive=payload.isActive, Reason=payload.reason, Actor=user)


def _ExpenseFilterDict(status, month, dateFrom, dateTo, categoryId, centreId, method, search) -> dict[str, Any]:
    return {"status": status, "month": month, "dateFrom": dateFrom, "dateTo": dateTo, "categoryId": categoryId, "centreId": centreId, "method": method, "search": search}


@router.get("/expenses")
def admin_list_expenses(
    status: str | None = None, month: str | None = None, dateFrom: str | None = None, dateTo: str | None = None,
    categoryId: str | None = None, centreId: str | None = None, method: str | None = None, search: str | None = None,
    page: int = 1, pageSize: int = 50, db: Session = Depends(get_db), user: User = Depends(admin_dep),
):
    return ListExpenses(db, Filters=_ExpenseFilterDict(status, month, dateFrom, dateTo, categoryId, centreId, method, search), Page=page, PageSize=pageSize)


@router.post("/expenses")
def admin_create_expense(payload: ExpenseCreateRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    Request = payload.model_dump()
    Key = Request.pop("idempotencyKey")
    return CreateExpense(db, Request=Request, IdempotencyKey=Key, Actor=user)


@router.get("/expenses/export")
def admin_export_expenses(
    status: str | None = None, month: str | None = None, dateFrom: str | None = None, dateTo: str | None = None,
    categoryId: str | None = None, centreId: str | None = None, method: str | None = None, search: str | None = None,
    db: Session = Depends(get_db), user: User = Depends(admin_dep),
):
    Rows = ExpensesForExport(db, Filters=_ExpenseFilterDict(status, month, dateFrom, dateTo, categoryId, centreId, method, search))
    return _Excel(BuildExpensesWorkbook(Rows), f"MathPath-Expenses-{month or TodayInIndia().isoformat()}.xlsx")


@router.get("/expenses/{expense_id}")
def admin_get_expense(expense_id: str, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return GetExpense(db, expense_id)


@router.put("/expenses/{expense_id}")
def admin_edit_expense(expense_id: str, payload: ExpenseEditRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    Request = payload.model_dump()
    Reason = Request.pop("reason")
    return EditExpense(db, ExpenseId=expense_id, Request=Request, Reason=Reason, Actor=user)


@router.post("/expenses/{expense_id}/cancel")
def admin_cancel_expense(expense_id: str, payload: ExpenseCancelRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return CancelExpense(db, ExpenseId=expense_id, Reason=payload.reason, Actor=user)


# --- Online payments (Phase 5) -------------------------------------------------

class OnlineSettingsRequest(BaseModel):
    studentFeesEnabled: bool | None = None
    onlinePaymentsEnabled: bool | None = None


@router.get("/online/settings")
def admin_online_settings(db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    Payload = OnlineSettingsPayload(db)
    db.commit()
    return Payload


@router.put("/online/settings")
def admin_update_online_settings(payload: OnlineSettingsRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return UpdateOnlineSettings(db, Fields=_SentFields(payload), Actor=user)


@router.get("/online/orders")
def admin_list_online_orders(
    status: str | None = None,
    source: str | None = None,
    studentId: str | None = None,
    dateFrom: str | None = None,
    dateTo: str | None = None,
    search: str | None = None,
    page: int = 1,
    pageSize: int = 50,
    db: Session = Depends(get_db),
    user: User = Depends(admin_dep),
):
    Filters = {"status": status, "source": source, "studentId": studentId, "dateFrom": dateFrom, "dateTo": dateTo, "search": search}
    Result = ListOnlineOrders(db, Filters=Filters, Page=page, PageSize=pageSize)
    db.commit()
    return Result


@router.get("/online/orders/{order_ref}")
def admin_get_online_order(order_ref: str, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return GetOnlineOrder(db, order_ref)


@router.post("/online/orders/{order_ref}/check")
def admin_check_online_order(order_ref: str, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return CheckOrderWithRazorpay(db, OrderRef=order_ref, Actor=user)


@router.get("/students/{student_id}/pay-link")
def admin_student_pay_link(student_id: str, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return StudentPayLink(db, student_id)


@router.post("/students/{student_id}/pay-link")
def admin_create_pay_link(student_id: str, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return CreatePayLink(db, StudentId=student_id, Actor=user)


@router.post("/pay-links/{link_id}/revoke")
def admin_revoke_pay_link(link_id: str, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return RevokePayLink(db, LinkId=link_id, Actor=user)


# --- Home and search (revamp R1) -------------------------------------------------

@router.get("/home")
def admin_payments_home(db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    Result = PaymentsHome(db)
    db.commit()
    return Result


@router.get("/search")
def admin_payments_search(q: str = "", db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    return PaymentsSearch(db, q)


# --- Quick Pay and Day Close (revamp R2) -------------------------------------------

class DayCloseRequest(BaseModel):
    date: str | None = None
    countedCashPaise: int = Field(ge=0)
    note: str | None = Field(default=None, max_length=500)


class DayReopenRequest(BaseModel):
    reason: str = Field(max_length=300)


@router.get("/quick-pay/defaults")
def admin_quick_pay_defaults(db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.dayclose_service import LastUsedMethod

    return {"lastMethod": LastUsedMethod(db, user)}


@router.get("/day-close/recent")
def admin_day_close_recent(db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.dayclose_service import RecentDays

    return RecentDays(db)


@router.get("/day-close")
def admin_day_close(date: str | None = None, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.dayclose_service import DaySummary

    return DaySummary(db, date)


@router.post("/day-close")
def admin_close_day(payload: DayCloseRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.dayclose_service import CloseDay

    return CloseDay(db, DayValue=payload.date, CountedPaise=payload.countedCashPaise, Note=payload.note, Actor=user)


@router.post("/day-close/{day}/reopen")
def admin_reopen_day(day: str, payload: DayReopenRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.dayclose_service import ReopenDay

    return ReopenDay(db, DayValue=day, Reason=payload.reason, Actor=user)


@router.get("/day-close/{day}/pdf")
def admin_day_close_pdf(day: str, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.dayclose_service import DaySummary
    from app.services.payments.invoices_service import _BusinessSnapshot

    Summary = DaySummary(db, day)
    Report = CollectionsReport(db, Filters={"dateFrom": Summary["date"], "dateTo": Summary["date"]})
    return _PdfResponse(RenderCollectionSummaryPdf(_BusinessSnapshot(db), Report, DayClose=Summary), f"MathPath-Day-Close-{Summary['date']}.pdf")



# --- Monthly billing (revamp R3) ---------------------------------------------------

class BillingSettingsRequest(BaseModel):
    indiaFeeItemId: str | None = None
    internationalFeeItemId: str | None = None
    autoDraftsEnabled: bool | None = None


class BillingModesRequest(BaseModel):
    studentIds: list[str] = Field(max_length=2000)
    mode: str


class BillingDraftsRequest(BaseModel):
    studentIds: list[str] | None = Field(default=None, max_length=2000)


class BillingReleaseRequest(BaseModel):
    draftIds: list[str] = Field(max_length=1000)
    idempotencyKey: str = Field(max_length=80)


class BillingDropRequest(BaseModel):
    reason: str = Field(max_length=300)


@router.get("/billing/settings")
def admin_billing_settings(db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.billing_service import BillingSettings

    Result = BillingSettings(db)
    db.commit()
    return Result


@router.put("/billing/settings")
def admin_update_billing_settings(payload: BillingSettingsRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.billing_service import UpdateBillingSettings

    return UpdateBillingSettings(db, Request=payload.model_dump(exclude_unset=True), Actor=user)


@router.get("/billing/students")
def admin_billing_students(db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.billing_service import ListStudentModes

    Result = ListStudentModes(db)
    db.commit()
    return {"students": Result}


@router.post("/billing/students/mode")
def admin_billing_set_modes(payload: BillingModesRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.billing_service import SetStudentModes

    return SetStudentModes(db, StudentIds=payload.studentIds, Mode=payload.mode, Actor=user)


@router.get("/billing/students/{student_id}")
def admin_billing_student(student_id: str, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.billing_service import StudentBilling

    Result = StudentBilling(db, student_id)
    db.commit()
    return Result


@router.get("/billing/month")
def admin_billing_month(period: str | None = None, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.billing_service import EnsureMonthlyDrafts, MonthBilling

    try:
        EnsureMonthlyDrafts(db)
    except Exception:
        db.rollback()
    Result = MonthBilling(db, period)
    db.commit()
    return Result


@router.post("/billing/month/{period}/drafts")
def admin_billing_create_drafts(period: str, payload: BillingDraftsRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.billing_service import CreateDrafts

    return CreateDrafts(db, PeriodValue=period, StudentIds=payload.studentIds, Actor=user)


@router.post("/billing/month/{period}/release")
def admin_billing_release(period: str, payload: BillingReleaseRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.billing_service import ReleaseDrafts

    return ReleaseDrafts(db, PeriodValue=period, DraftIds=payload.draftIds, IdempotencyKey=payload.idempotencyKey, Actor=user)


@router.post("/billing/drafts/{draft_id}/drop")
def admin_billing_drop(draft_id: str, payload: BillingDropRequest, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.billing_service import DropDraft

    return DropDraft(db, DraftId=draft_id, Reason=payload.reason, Actor=user)


@router.post("/billing/drafts/{draft_id}/restore")
def admin_billing_restore(draft_id: str, db: Session = Depends(get_db), user: User = Depends(admin_dep)):
    from app.services.payments.billing_service import RestoreDraft

    return RestoreDraft(db, DraftId=draft_id, Actor=user)
