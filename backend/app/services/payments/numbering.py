"""Invoice and receipt numbers (2026-10-08).

  INVOICE  -> MP-INV-000314   (6-digit padding, as the old platform)
  RECEIPT  -> MP-MRCPT-631    (no padding, as the old platform)

TakeNextNumber locks the sequence row (SELECT ... FOR UPDATE on Postgres)
inside the caller's transaction, so two admins saving at the same moment get
different numbers, and a rolled-back save never burns a number another save
already used. Numbers are never reused, including for cancelled documents.

Nothing can be numbered until a starting number is set (by the migration of
the old platform's history, or by an admin), so new numbers can never collide
with old ones.
"""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import Expense, PaymentInvoice, PaymentNumberSequence, PaymentReceipt, User
from app.services.payments.audit import WritePaymentAudit

SEQUENCE_DEFAULTS: dict[str, dict[str, Any]] = {
    "INVOICE": {"prefix": "MP-INV-", "pad_width": 6, "label": "Invoice"},
    "RECEIPT": {"prefix": "MP-MRCPT-", "pad_width": 0, "label": "Money receipt"},
    # 2026-10-08 (Phase 4): expenses are new (the old platform had none), so
    # this one is ready from the start at MP-EXP-0001.
    "EXPENSE": {"prefix": "MP-EXP-", "pad_width": 4, "label": "Expense", "configured": True},
}
MAX_SEQUENCE_NUMBER = 99_999_999

# 2026-11-27: where each series' numbers live. Carried-over documents (the old
# platform's history) were never issued by TakeNextNumber, so the sequence's
# own last_issued_number does not know them; these columns do.
DOCUMENT_COLUMNS = {
    "INVOICE": (PaymentInvoice, "invoice_number"),
    "RECEIPT": (PaymentReceipt, "receipt_number"),
    "EXPENSE": (Expense, "expense_number"),
}


def FormatDocumentNumber(Prefix: str, PadWidth: int, Number: int) -> str:
    return f"{Prefix}{str(int(Number)).zfill(int(PadWidth or 0))}"


def EnsureNumberSequences(db: Session) -> None:
    """Creates the two sequence rows if missing. Safe to call any number of
    times and from two workers at once."""
    for Key, Defaults in SEQUENCE_DEFAULTS.items():
        if db.get(PaymentNumberSequence, Key):
            continue
        try:
            with db.begin_nested():
                db.add(PaymentNumberSequence(key=Key, prefix=Defaults["prefix"], pad_width=Defaults["pad_width"], next_number=1, is_configured=bool(Defaults.get("configured", False))))
        except IntegrityError:
            pass
    db.flush()


def _LockedSequence(db: Session, Key: str) -> PaymentNumberSequence:
    if Key not in SEQUENCE_DEFAULTS:
        api_error(404, "PAYMENT_SEQUENCE_NOT_FOUND", "Unknown document number sequence.")
    EnsureNumberSequences(db)
    Sequence = (
        db.query(PaymentNumberSequence)
        .filter(PaymentNumberSequence.key == Key)
        .with_for_update()
        .one()
    )
    return Sequence


def LockSequence(db: Session, Key: str) -> PaymentNumberSequence:
    """Holds the sequence row lock until the caller's transaction ends. Used
    to run a whole check-then-create step one at a time (e.g. two admins
    pressing Generate Invoices together), not only the numbering."""
    return _LockedSequence(db, Key)


def _NumberOf(Prefix: str, Value: str | None) -> int | None:
    Match = re.fullmatch(re.escape(Prefix) + r"(\d+)", (Value or "").strip())
    return int(Match.group(1)) if Match else None


def HighestUsedNumber(db: Session, Sequence: PaymentNumberSequence) -> int:
    """The highest number in this series that any document already carries,
    whether it was issued here or carried over from the old platform, and
    whatever its padding (MP-INV-000977 and MP-INV-0001226 are 977 and 1226).
    Renamed test documents (TEST-...) and old split lines (...-B) are not
    numbers in the series."""
    Model, ColumnName = DOCUMENT_COLUMNS[Sequence.key]
    Column = getattr(Model, ColumnName)
    Highest = int(Sequence.last_issued_number or 0)
    for (Value,) in db.query(Column).filter(Column.like(f"{Sequence.prefix}%")).all():
        Number = _NumberOf(Sequence.prefix, Value)
        if Number is not None and Number > Highest:
            Highest = Number
    return Highest


def _NumberInUse(db: Session, Sequence: PaymentNumberSequence, Number: int) -> str | None:
    """The document number already carrying this number, if any (any padding)."""
    Model, ColumnName = DOCUMENT_COLUMNS[Sequence.key]
    Column = getattr(Model, ColumnName)
    for (Value,) in db.query(Column).filter(Column.like(f"{Sequence.prefix}%{Number}")).all():
        if _NumberOf(Sequence.prefix, Value) == Number:
            return Value
    return None


def SequencePayload(Sequence: PaymentNumberSequence, HighestUsed: int | None = None) -> dict[str, Any]:
    Label = SEQUENCE_DEFAULTS.get(Sequence.key, {}).get("label", Sequence.key)
    return {
        "key": Sequence.key,
        "label": Label,
        "prefix": Sequence.prefix,
        "padWidth": Sequence.pad_width,
        "isConfigured": bool(Sequence.is_configured),
        "nextNumber": Sequence.next_number,
        "nextFormatted": FormatDocumentNumber(Sequence.prefix, Sequence.pad_width, Sequence.next_number),
        "lastIssuedNumber": Sequence.last_issued_number,
        "lastIssuedFormatted": (
            FormatDocumentNumber(Sequence.prefix, Sequence.pad_width, Sequence.last_issued_number)
            if Sequence.last_issued_number
            else None
        ),
        # The highest number any document carries (issued here or carried over).
        "highestUsedNumber": HighestUsed or None,
        "highestUsedFormatted": FormatDocumentNumber(Sequence.prefix, Sequence.pad_width, HighestUsed) if HighestUsed else None,
    }


def ListNumberSequences(db: Session) -> list[dict[str, Any]]:
    EnsureNumberSequences(db)
    Rows = [db.get(PaymentNumberSequence, Key) for Key in SEQUENCE_DEFAULTS]
    return [SequencePayload(Row, HighestUsedNumber(db, Row)) for Row in Rows]


def TakeNextNumber(db: Session, Key: str) -> str:
    """The next document number, formatted. Never commits: the number is
    only spent if the caller's transaction commits."""
    Sequence = _LockedSequence(db, Key)
    if not Sequence.is_configured:
        Label = SEQUENCE_DEFAULTS[Key]["label"].lower()
        api_error(
            409,
            "PAYMENT_NUMBERING_NOT_SET",
            f"The starting {Label} number has not been set yet. Set it in Payments > Settings first.",
        )
    Number = Sequence.next_number
    Taken = _NumberInUse(db, Sequence, Number)
    if Taken:
        # Never let the unique constraint turn this into "Something went wrong":
        # say what happened and where to fix it.
        api_error(
            409,
            "PAYMENT_NUMBER_TAKEN",
            f"{Taken} already exists, so the next {SEQUENCE_DEFAULTS[Key]['label'].lower()} cannot be numbered. "
            "Set the next number in Payment Settings › Document Numbering.",
        )
    Sequence.last_issued_number = Number
    Sequence.next_number = Number + 1
    db.flush()
    return FormatDocumentNumber(Sequence.prefix, Sequence.pad_width, Number)


def SetStartingNumber(db: Session, *, Key: str, NextNumber: int, Actor: User | None, Reason: str | None = None, AllowGap: bool = False) -> dict[str, Any]:
    """Sets the next number to issue.

    2026-11-27: it must be above every number any document already carries,
    including those carried over from the old platform, so no number is ever
    used twice. And it must follow straight on from the highest one, so the
    series never breaks, unless the admin says the gap is wanted."""
    try:
        NextNumber = int(NextNumber)
    except (TypeError, ValueError):
        api_error(422, "PAYMENT_SEQUENCE_INVALID", "The next number must be a whole number.")
    if NextNumber < 1 or NextNumber > MAX_SEQUENCE_NUMBER:
        api_error(422, "PAYMENT_SEQUENCE_INVALID", "The next number must be between 1 and 99,999,999.")
    Sequence = _LockedSequence(db, Key)
    Highest = HighestUsedNumber(db, Sequence)
    if Highest and NextNumber <= Highest:
        api_error(
            422,
            "PAYMENT_SEQUENCE_BACKWARDS",
            f"{FormatDocumentNumber(Sequence.prefix, Sequence.pad_width, Highest)} has already been used. "
            f"The next number must be {Highest + 1} or higher.",
        )
    if Highest and NextNumber > Highest + 1 and not AllowGap:
        Skipped = NextNumber - Highest - 1
        First = FormatDocumentNumber(Sequence.prefix, Sequence.pad_width, Highest + 1)
        Last = FormatDocumentNumber(Sequence.prefix, Sequence.pad_width, NextNumber - 1)
        api_error(
            422,
            "PAYMENT_SEQUENCE_GAP",
            f"This would skip {Skipped} number{'s' if Skipped != 1 else ''} ({First if Skipped == 1 else f'{First} to {Last}'}) and break the series. "
            f"The series continues at {Highest + 1}.",
        )
    Before = SequencePayload(Sequence, Highest)
    if not Sequence.is_configured:
        # Nothing was ever set: do not show the placeholder 1 as "before".
        Before["nextFormatted"] = None
    Sequence.next_number = NextNumber
    Sequence.is_configured = True
    Sequence.updated_by_user_id = Actor.id if Actor else None
    db.flush()
    After = SequencePayload(Sequence, Highest)
    WritePaymentAudit(db, EntityType="NUMBER_SEQUENCE", EntityId=Key, Action="SET_NEXT_NUMBER", Actor=Actor, Before=Before, After=After, Reason=Reason)
    return After
