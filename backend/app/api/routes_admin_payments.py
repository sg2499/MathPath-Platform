"""Admin > Payments API (Phase 1, 2026-10-08): fee setup, business details,
centres, document numbering, student centres and the audit history.

Admin only (SUPER_ADMIN / ADMIN). Students and teachers get 403 on every
route here."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_roles
from app.models import User
from app.services.payments.audit import ListPaymentAudit
from app.services.payments.numbering import SetStartingNumber
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
