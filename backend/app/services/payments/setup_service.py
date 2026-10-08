"""Payments setup (Phase 1, 2026-10-08): fee items, business details,
centres and each student's centre. Every change is written to the audit
history in the same transaction."""
from __future__ import annotations

import json
import re
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import FeeItem, PaymentBusinessProfile, PaymentCentre, Student, User
from app.services.payments.audit import WritePaymentAudit
from app.services.payments.money import (
    DEFAULT_GST_RATE_BPS,
    FormatIndianRupees,
    PaiseToRupeesString,
    ParseRupeesToPaise,
    SplitInclusiveGst,
)
from app.services.payments.numbering import EnsureNumberSequences, ListNumberSequences

BILLING_TYPES = {"MONTHLY": "Monthly", "ONE_TIME": "One-time"}
MAX_NAME_LENGTH = 150

# The three centres and business details as printed on the old platform's
# invoices (8 Oct 2026). Created once if missing; editable in Settings.
DEFAULT_CENTRES = [
    {"code": "RAJARHAT", "name": "Rajarhat", "address": "Laxmi Apartment, 1st Floor, Dashadrone, Rajarhat Main Road, Kolkata - 700136", "order": 1},
    {"code": "LAKETOWN", "name": "Laketown", "address": "240 Block A, 1st Floor, Laketown, Kolkata - 700089", "order": 2},
    {"code": "ONLINE", "name": "Online", "address": None, "order": 3},
]
DEFAULT_BUSINESS = {
    "legal_name": "BGM Enterprise",
    "brand_name": "Math Path - Ace with Abacus",
    "gstin": "19AALPG9427A1ZQ",
    "registered_address": None,
    "email": "bgmenterprisekol@gmail.com",
    "phone": "7980918759 / 9831684229",
    "invoice_footer": "This is a computer-generated Tax Invoice for Math Path - Ace with Abacus.",
}

_GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
_GSTIN_PATTERN = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
_PAN_PATTERN = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------

def _Clean(Value: Any) -> str | None:
    if Value is None:
        return None
    Text = re.sub(r"\s+", " ", str(Value)).strip()
    return Text or None


def _CleanMultiline(Value: Any) -> str | None:
    if Value is None:
        return None
    Lines = [re.sub(r"[ \t]+", " ", Line).strip() for Line in str(Value).splitlines()]
    Text = "\n".join(Line for Line in Lines if Line)
    return Text or None


def NameKey(Name: str) -> str:
    return re.sub(r"\s+", " ", Name).strip().lower()


def GstinChecksumIsValid(Gstin: str) -> bool:
    """The 15th character of a GSTIN is a check character over the first 14."""
    if not _GSTIN_PATTERN.match(Gstin):
        return False
    Total = 0
    for Index, Char in enumerate(Gstin[:14]):
        Product = _GSTIN_CHARS.index(Char) * (1 if Index % 2 == 0 else 2)
        Total += Product // 36 + Product % 36
    return _GSTIN_CHARS[(36 - Total % 36) % 36] == Gstin[14]


def ValidateGstin(Value: Any) -> str | None:
    Gstin = (_Clean(Value) or "").upper().replace(" ", "")
    if not Gstin:
        return None
    if not _GSTIN_PATTERN.match(Gstin):
        api_error(422, "GSTIN_INVALID", "GSTIN must be 15 characters, like 19AALPG9427A1ZQ.")
    if not GstinChecksumIsValid(Gstin):
        api_error(422, "GSTIN_INVALID", "This GSTIN's last character does not match. Please check it for a typing mistake.")
    return Gstin


def ValidatePan(Value: Any) -> str | None:
    Pan = (_Clean(Value) or "").upper().replace(" ", "")
    if not Pan:
        return None
    if not _PAN_PATTERN.match(Pan):
        api_error(422, "PAN_INVALID", "PAN must be 10 characters, like AALPG9427A.")
    return Pan


def ValidateEmail(Value: Any) -> str | None:
    Email = _Clean(Value)
    if not Email:
        return None
    if not _EMAIL_PATTERN.match(Email):
        api_error(422, "EMAIL_INVALID", "Please enter a valid email address.")
    return Email


# --------------------------------------------------------------------------
# Defaults (run at startup and before every settings read)
# --------------------------------------------------------------------------

def EnsurePaymentDefaults(db: Session) -> None:
    """Creates the default centres, business details and number sequences
    once. Never overwrites anything an admin has edited."""
    if db.query(PaymentCentre).count() == 0:
        for Centre in DEFAULT_CENTRES:
            try:
                with db.begin_nested():
                    db.add(PaymentCentre(code=Centre["code"], name=Centre["name"], address=Centre["address"], display_order=Centre["order"], is_active=True))
            except IntegrityError:
                pass
    if not db.get(PaymentBusinessProfile, "default"):
        try:
            with db.begin_nested():
                db.add(PaymentBusinessProfile(id="default", **DEFAULT_BUSINESS))
        except IntegrityError:
            pass
    EnsureNumberSequences(db)
    # 2026-10-08 (Phase 4): the starting list of expense categories.
    from app.services.payments.expenses_service import EnsureExpenseCategories

    EnsureExpenseCategories(db)
    db.flush()


# --------------------------------------------------------------------------
# Fee items
# --------------------------------------------------------------------------

def FeeItemPayload(Item: FeeItem) -> dict[str, Any]:
    Split = SplitInclusiveGst(Item.amount_paise, Item.gst_rate_bps, GstIncluded=Item.gst_included)
    return {
        "feeItemId": Item.id,
        "name": Item.name,
        "description": Item.description,
        "amountPaise": Item.amount_paise,
        "amount": PaiseToRupeesString(Item.amount_paise),
        "amountDisplay": FormatIndianRupees(Item.amount_paise),
        "gstIncluded": bool(Item.gst_included),
        "gstRatePercent": Item.gst_rate_bps / 100,
        "taxableDisplay": FormatIndianRupees(Split["taxablePaise"]),
        "gstDisplay": FormatIndianRupees(Split["gstPaise"]),
        "billingType": Item.billing_type,
        "billingTypeLabel": BILLING_TYPES.get(Item.billing_type, Item.billing_type),
        "displayOrder": Item.display_order,
        "isActive": bool(Item.is_active),
        "legacyNames": json.loads(Item.legacy_names_json) if Item.legacy_names_json else [],
        "updatedAt": Item.updated_at.isoformat() if Item.updated_at else None,
    }


def _AuditShape(Item: FeeItem) -> dict[str, Any]:
    return {
        "name": Item.name,
        "description": Item.description,
        "amount": PaiseToRupeesString(Item.amount_paise),
        "gstIncluded": bool(Item.gst_included),
        "billingType": Item.billing_type,
        "displayOrder": Item.display_order,
        "isActive": bool(Item.is_active),
    }


def ListFeeItems(db: Session, *, IncludeInactive: bool = True) -> list[dict[str, Any]]:
    Query = db.query(FeeItem)
    if not IncludeInactive:
        Query = Query.filter(FeeItem.is_active == True)  # noqa: E712
    Items = Query.order_by(FeeItem.is_active.desc(), FeeItem.display_order.asc(), FeeItem.name.asc()).all()
    return [FeeItemPayload(Item) for Item in Items]


def _ValidatedName(db: Session, Name: Any, *, ExceptId: str | None = None) -> tuple[str, str]:
    Clean = _Clean(Name)
    if not Clean:
        api_error(422, "FEE_ITEM_NAME_REQUIRED", "Please enter a name for the fee item.")
    if len(Clean) > MAX_NAME_LENGTH:
        api_error(422, "FEE_ITEM_NAME_TOO_LONG", f"The name can be at most {MAX_NAME_LENGTH} characters.")
    Key = NameKey(Clean)
    Clash = db.query(FeeItem).filter(FeeItem.name_key == Key).first()
    if Clash and Clash.id != ExceptId:
        State = "an active" if Clash.is_active else "an inactive"
        api_error(409, "FEE_ITEM_NAME_TAKEN", f"There is already {State} fee item called \"{Clash.name}\". Use a different name, or edit that item.")
    return Clean, Key


def _ValidatedBillingType(Value: Any) -> str:
    BillingType = (str(Value or "").strip().upper()) or "ONE_TIME"
    if BillingType not in BILLING_TYPES:
        api_error(422, "FEE_ITEM_BILLING_TYPE_INVALID", "Billing type must be Monthly or One-time.")
    return BillingType


def CreateFeeItem(db: Session, *, Name: Any, Amount: Any, GstIncluded: bool = True, BillingType: Any = "ONE_TIME", Description: Any = None, Actor: User | None) -> dict[str, Any]:
    Clean, Key = _ValidatedName(db, Name)
    Paise = ParseRupeesToPaise(Amount, FieldLabel="Amount")
    LastOrder = db.query(FeeItem.display_order).order_by(FeeItem.display_order.desc()).first()
    Item = FeeItem(
        name=Clean,
        name_key=Key,
        description=_CleanMultiline(Description),
        amount_paise=Paise,
        gst_included=bool(GstIncluded),
        gst_rate_bps=DEFAULT_GST_RATE_BPS,
        billing_type=_ValidatedBillingType(BillingType),
        display_order=(LastOrder[0] + 1) if LastOrder else 1,
        is_active=True,
        created_by_user_id=Actor.id if Actor else None,
    )
    db.add(Item)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        api_error(409, "FEE_ITEM_NAME_TAKEN", f"There is already a fee item called \"{Clean}\".")
    WritePaymentAudit(db, EntityType="FEE_ITEM", EntityId=Item.id, Action="CREATE", Actor=Actor, After=_AuditShape(Item))
    db.commit()
    db.refresh(Item)
    return FeeItemPayload(Item)


def _GetFeeItem(db: Session, FeeItemId: str) -> FeeItem:
    Item = db.get(FeeItem, FeeItemId)
    if not Item:
        api_error(404, "FEE_ITEM_NOT_FOUND", "That fee item was not found.")
    return Item


def UpdateFeeItem(
    db: Session,
    *,
    FeeItemId: str,
    Name: Any = None,
    Amount: Any = None,
    GstIncluded: bool | None = None,
    BillingType: Any = None,
    Description: Any = "__UNSET__",
    Reason: Any = None,
    Actor: User | None,
) -> dict[str, Any]:
    Item = _GetFeeItem(db, FeeItemId)
    Before = _AuditShape(Item)
    if Name is not None:
        Item.name, Item.name_key = _ValidatedName(db, Name, ExceptId=Item.id)
    if Amount is not None:
        Item.amount_paise = ParseRupeesToPaise(Amount, FieldLabel="Amount")
    if GstIncluded is not None:
        Item.gst_included = bool(GstIncluded)
    if BillingType is not None:
        Item.billing_type = _ValidatedBillingType(BillingType)
    if Description != "__UNSET__":
        Item.description = _CleanMultiline(Description)
    After = _AuditShape(Item)
    if After == Before:
        return FeeItemPayload(Item)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        api_error(409, "FEE_ITEM_NAME_TAKEN", "Another fee item already has that name.")
    WritePaymentAudit(db, EntityType="FEE_ITEM", EntityId=Item.id, Action="UPDATE", Actor=Actor, Before=Before, After=After, Reason=_Clean(Reason))
    db.commit()
    db.refresh(Item)
    return FeeItemPayload(Item)


def SetFeeItemActive(db: Session, *, FeeItemId: str, IsActive: bool, Reason: Any = None, Actor: User | None) -> dict[str, Any]:
    Item = _GetFeeItem(db, FeeItemId)
    if bool(Item.is_active) == bool(IsActive):
        return FeeItemPayload(Item)
    CleanReason = _Clean(Reason)
    if not IsActive and not CleanReason:
        api_error(422, "REASON_REQUIRED", "Please give a reason for deactivating this fee item.")
    Before = _AuditShape(Item)
    Item.is_active = bool(IsActive)
    if IsActive:
        LastOrder = db.query(FeeItem.display_order).filter(FeeItem.is_active == True).order_by(FeeItem.display_order.desc()).first()  # noqa: E712
        Item.display_order = (LastOrder[0] + 1) if LastOrder else 1
    db.flush()
    WritePaymentAudit(db, EntityType="FEE_ITEM", EntityId=Item.id, Action="ACTIVATE" if IsActive else "DEACTIVATE", Actor=Actor, Before=Before, After=_AuditShape(Item), Reason=CleanReason)
    db.commit()
    db.refresh(Item)
    return FeeItemPayload(Item)


def ReorderFeeItems(db: Session, *, OrderedIds: list[str], Actor: User | None) -> list[dict[str, Any]]:
    Ids = [str(Id) for Id in OrderedIds or []]
    if len(Ids) != len(set(Ids)):
        api_error(422, "FEE_ITEM_ORDER_INVALID", "Each fee item can appear only once in the new order.")
    Active = db.query(FeeItem).filter(FeeItem.is_active == True).all()  # noqa: E712
    ActiveById = {Item.id: Item for Item in Active}
    if set(Ids) != set(ActiveById):
        api_error(409, "FEE_ITEM_ORDER_STALE", "The list changed while you were reordering. Refresh and try again.")
    BeforeOrder = [Item.id for Item in sorted(Active, key=lambda Item: (Item.display_order, Item.name))]
    if BeforeOrder == Ids:
        return ListFeeItems(db)
    for Position, Id in enumerate(Ids, start=1):
        ActiveById[Id].display_order = Position
    db.flush()
    WritePaymentAudit(
        db,
        EntityType="FEE_ITEM",
        EntityId="*",
        Action="REORDER",
        Actor=Actor,
        Before={"order": [ActiveById[Id].name for Id in BeforeOrder]},
        After={"order": [ActiveById[Id].name for Id in Ids]},
    )
    db.commit()
    return ListFeeItems(db)


# --------------------------------------------------------------------------
# Business details and centres
# --------------------------------------------------------------------------

def BusinessPayload(Profile: PaymentBusinessProfile) -> dict[str, Any]:
    return {
        "legalName": Profile.legal_name,
        "brandName": Profile.brand_name,
        "gstin": Profile.gstin,
        "pan": Profile.pan,
        "registeredAddress": Profile.registered_address,
        "email": Profile.email,
        "phone": Profile.phone,
        "logoUrl": Profile.logo_url,
        "invoiceFooter": Profile.invoice_footer,
        "updatedAt": Profile.updated_at.isoformat() if Profile.updated_at else None,
    }


def CentrePayload(Centre: PaymentCentre, StudentCount: int = 0) -> dict[str, Any]:
    return {
        "centreId": Centre.id,
        "code": Centre.code,
        "name": Centre.name,
        "address": Centre.address,
        "phone": Centre.phone,
        "displayOrder": Centre.display_order,
        "isActive": bool(Centre.is_active),
        "studentCount": StudentCount,
    }


def _CentreStudentCounts(db: Session) -> dict[str, int]:
    from sqlalchemy import func

    Rows = db.query(Student.centre_id, func.count(Student.id)).filter(Student.centre_id.isnot(None)).group_by(Student.centre_id).all()
    return {CentreId: Count for CentreId, Count in Rows}


def ListCentres(db: Session) -> list[dict[str, Any]]:
    Counts = _CentreStudentCounts(db)
    Centres = db.query(PaymentCentre).order_by(PaymentCentre.is_active.desc(), PaymentCentre.display_order.asc(), PaymentCentre.name.asc()).all()
    return [CentrePayload(Centre, Counts.get(Centre.id, 0)) for Centre in Centres]


def GetPaymentSettings(db: Session) -> dict[str, Any]:
    EnsurePaymentDefaults(db)
    db.commit()
    Profile = db.get(PaymentBusinessProfile, "default")
    StudentsWithoutCentre = db.query(Student).filter(Student.centre_id.is_(None), Student.is_active == True).count()  # noqa: E712
    return {
        "business": BusinessPayload(Profile),
        "centres": ListCentres(db),
        "numbering": ListNumberSequences(db),
        "activeStudentsWithoutCentre": StudentsWithoutCentre,
    }


def UpdateBusinessProfile(db: Session, *, Fields: dict[str, Any], Actor: User | None) -> dict[str, Any]:
    EnsurePaymentDefaults(db)
    Profile = db.get(PaymentBusinessProfile, "default")
    Before = BusinessPayload(Profile)
    if "legalName" in Fields:
        LegalName = _Clean(Fields.get("legalName"))
        if not LegalName:
            api_error(422, "LEGAL_NAME_REQUIRED", "The legal business name is required. It is printed on every invoice.")
        Profile.legal_name = LegalName[:200]
    if "brandName" in Fields:
        Profile.brand_name = (_Clean(Fields.get("brandName")) or None)
    if "gstin" in Fields:
        Profile.gstin = ValidateGstin(Fields.get("gstin"))
    if "pan" in Fields:
        Profile.pan = ValidatePan(Fields.get("pan"))
    if Profile.gstin and Profile.pan and Profile.gstin[2:12] != Profile.pan:
        api_error(422, "PAN_GSTIN_MISMATCH", "The PAN does not match the GSTIN (characters 3 to 12 of a GSTIN are the PAN).")
    if "registeredAddress" in Fields:
        Profile.registered_address = _CleanMultiline(Fields.get("registeredAddress"))
    if "email" in Fields:
        Profile.email = ValidateEmail(Fields.get("email"))
    if "phone" in Fields:
        Profile.phone = _Clean(Fields.get("phone"))
    if "logoUrl" in Fields:
        Profile.logo_url = _Clean(Fields.get("logoUrl"))
    if "invoiceFooter" in Fields:
        Profile.invoice_footer = _CleanMultiline(Fields.get("invoiceFooter"))
    Profile.updated_by_user_id = Actor.id if Actor else None
    db.flush()
    After = BusinessPayload(Profile)
    Before.pop("updatedAt", None)
    AfterForAudit = dict(After)
    AfterForAudit.pop("updatedAt", None)
    if AfterForAudit != Before:
        WritePaymentAudit(db, EntityType="BUSINESS_PROFILE", EntityId="default", Action="UPDATE", Actor=Actor, Before=Before, After=AfterForAudit)
    db.commit()
    db.refresh(Profile)
    return BusinessPayload(Profile)


def _CentreAuditShape(Centre: PaymentCentre) -> dict[str, Any]:
    return {"name": Centre.name, "address": Centre.address, "phone": Centre.phone, "isActive": bool(Centre.is_active)}


def _ValidatedCentreName(db: Session, Name: Any, *, ExceptId: str | None = None) -> str:
    Clean = _Clean(Name)
    if not Clean:
        api_error(422, "CENTRE_NAME_REQUIRED", "Please enter the centre's name.")
    for Centre in db.query(PaymentCentre).all():
        if Centre.id != ExceptId and NameKey(Centre.name) == NameKey(Clean):
            api_error(409, "CENTRE_NAME_TAKEN", f"There is already a centre called \"{Centre.name}\".")
    return Clean[:120]


def CreateCentre(db: Session, *, Name: Any, Address: Any = None, Phone: Any = None, Actor: User | None) -> dict[str, Any]:
    Clean = _ValidatedCentreName(db, Name)
    Code = re.sub(r"[^A-Z0-9]+", "_", Clean.upper()).strip("_")[:40] or "CENTRE"
    BaseCode, Suffix = Code, 2
    while db.query(PaymentCentre).filter(PaymentCentre.code == Code).first():
        Code = f"{BaseCode[:36]}_{Suffix}"
        Suffix += 1
    LastOrder = db.query(PaymentCentre.display_order).order_by(PaymentCentre.display_order.desc()).first()
    Centre = PaymentCentre(code=Code, name=Clean, address=_CleanMultiline(Address), phone=_Clean(Phone), display_order=(LastOrder[0] + 1) if LastOrder else 1, is_active=True)
    db.add(Centre)
    db.flush()
    WritePaymentAudit(db, EntityType="CENTRE", EntityId=Centre.id, Action="CREATE", Actor=Actor, After=_CentreAuditShape(Centre))
    db.commit()
    return CentrePayload(Centre)


def UpdateCentre(db: Session, *, CentreId: str, Fields: dict[str, Any], Actor: User | None) -> dict[str, Any]:
    Centre = db.get(PaymentCentre, CentreId)
    if not Centre:
        api_error(404, "CENTRE_NOT_FOUND", "That centre was not found.")
    Before = _CentreAuditShape(Centre)
    if "name" in Fields:
        Centre.name = _ValidatedCentreName(db, Fields.get("name"), ExceptId=Centre.id)
    if "address" in Fields:
        Centre.address = _CleanMultiline(Fields.get("address"))
    if "phone" in Fields:
        Centre.phone = _Clean(Fields.get("phone"))
    if "isActive" in Fields and Fields.get("isActive") is not None:
        Centre.is_active = bool(Fields.get("isActive"))
    After = _CentreAuditShape(Centre)
    if After != Before:
        db.flush()
        WritePaymentAudit(db, EntityType="CENTRE", EntityId=Centre.id, Action="UPDATE", Actor=Actor, Before=Before, After=After, Reason=_Clean(Fields.get("reason")))
        db.commit()
    Counts = _CentreStudentCounts(db)
    return CentrePayload(Centre, Counts.get(Centre.id, 0))


# --------------------------------------------------------------------------
# Student centres
# --------------------------------------------------------------------------

def ResolveCentreId(db: Session, CentreId: Any) -> str | None:
    """'' or None clears the centre; otherwise the id must be an active centre."""
    if CentreId is None or str(CentreId).strip() == "":
        return None
    Centre = db.get(PaymentCentre, str(CentreId).strip())
    if not Centre:
        api_error(404, "CENTRE_NOT_FOUND", "That centre was not found.")
    if not Centre.is_active:
        api_error(422, "CENTRE_INACTIVE", f"{Centre.name} is switched off. Switch it on in Payments > Settings first.")
    return Centre.id


def AssignStudentsToCentre(db: Session, *, StudentIds: list[str], CentreId: Any, Actor: User | None) -> dict[str, Any]:
    Ids = [Id for Id in dict.fromkeys(str(Id).strip() for Id in (StudentIds or [])) if Id]
    if not Ids:
        api_error(422, "NO_STUDENTS_SELECTED", "Select at least one student.")
    if len(Ids) > 2000:
        api_error(422, "TOO_MANY_STUDENTS", "Select at most 2,000 students at a time.")
    TargetId = ResolveCentreId(db, CentreId)
    Target = db.get(PaymentCentre, TargetId) if TargetId else None
    Students = db.query(Student).filter(Student.id.in_(Ids)).all()
    NamesByUserId = {UserRow.id: UserRow.full_name for UserRow in db.query(User).filter(User.id.in_([Row.user_id for Row in Students])).all()} if Students else {}
    Found = {Row.id for Row in Students}
    Missing = [Id for Id in Ids if Id not in Found]
    if Missing:
        api_error(404, "STUDENT_NOT_FOUND", f"{len(Missing)} of the selected students were not found. Refresh and try again.")
    CentreNames = {Centre.id: Centre.name for Centre in db.query(PaymentCentre).all()}
    Changed = 0
    for Row in Students:
        if Row.centre_id == TargetId:
            continue
        WritePaymentAudit(
            db,
            EntityType="STUDENT_CENTRE",
            EntityId=Row.id,
            Action="SET_CENTRE",
            Actor=Actor,
            Before={"student": NamesByUserId.get(Row.user_id), "centre": CentreNames.get(Row.centre_id) if Row.centre_id else None},
            After={"student": NamesByUserId.get(Row.user_id), "centre": Target.name if Target else None},
        )
        Row.centre_id = TargetId
        Changed += 1
    db.commit()
    return {"studentsSelected": len(Ids), "studentsChanged": Changed, "centreName": Target.name if Target else None}


def ListStudentsForCentreAssignment(db: Session) -> list[dict[str, Any]]:
    from app.models import Level, Module, Teacher

    Rows = (
        db.query(Student, User)
        .join(User, Student.user_id == User.id)
        .order_by(User.full_name.asc())
        .all()
    )
    Levels = {Level_.id: Level_ for Level_ in db.query(Level).all()}
    Modules = {Module_.id: Module_ for Module_ in db.query(Module).all()}
    TeacherNames: dict[str, str] = {}
    for Teacher_, TeacherUser in db.query(Teacher, User).join(User, Teacher.user_id == User.id).all():
        TeacherNames[Teacher_.id] = TeacherUser.full_name
    Centres = {Centre.id: Centre.name for Centre in db.query(PaymentCentre).all()}
    Result = []
    for Row, UserRow in Rows:
        Level_ = Levels.get(Row.current_level_id)
        Module_ = Modules.get(Row.current_module_id)
        Result.append(
            {
                "studentId": Row.id,
                "studentName": UserRow.full_name,
                "studentCode": Row.student_code,
                "customId": Row.custom_id,
                "levelCode": Level_.level_code if Level_ else None,
                "moduleCode": Module_.module_code if Module_ else None,
                "teacherName": TeacherNames.get(Row.teacher_id) or Row.teacher,
                "isActive": bool(Row.is_active and UserRow.is_active),
                "centreId": Row.centre_id,
                "centreName": Centres.get(Row.centre_id) if Row.centre_id else None,
            }
        )
    return Result
