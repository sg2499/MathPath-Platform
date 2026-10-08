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

from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import PaymentNumberSequence, User
from app.services.payments.audit import WritePaymentAudit

SEQUENCE_DEFAULTS: dict[str, dict[str, Any]] = {
    "INVOICE": {"prefix": "MP-INV-", "pad_width": 6, "label": "Invoice"},
    "RECEIPT": {"prefix": "MP-MRCPT-", "pad_width": 0, "label": "Money receipt"},
    # 2026-10-08 (Phase 4): expenses are new (the old platform had none), so
    # this one is ready from the start at MP-EXP-0001.
    "EXPENSE": {"prefix": "MP-EXP-", "pad_width": 4, "label": "Expense", "configured": True},
}
MAX_SEQUENCE_NUMBER = 99_999_999


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


def SequencePayload(Sequence: PaymentNumberSequence) -> dict[str, Any]:
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
    }


def ListNumberSequences(db: Session) -> list[dict[str, Any]]:
    EnsureNumberSequences(db)
    return [SequencePayload(db.get(PaymentNumberSequence, Key)) for Key in SEQUENCE_DEFAULTS]


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
    Sequence.last_issued_number = Number
    Sequence.next_number = Number + 1
    db.flush()
    return FormatDocumentNumber(Sequence.prefix, Sequence.pad_width, Number)


def SetStartingNumber(db: Session, *, Key: str, NextNumber: int, Actor: User | None, Reason: str | None = None) -> dict[str, Any]:
    """Sets the next number to issue. Can only move forward past numbers
    already issued here, so no number can ever be issued twice."""
    try:
        NextNumber = int(NextNumber)
    except (TypeError, ValueError):
        api_error(422, "PAYMENT_SEQUENCE_INVALID", "The next number must be a whole number.")
    if NextNumber < 1 or NextNumber > MAX_SEQUENCE_NUMBER:
        api_error(422, "PAYMENT_SEQUENCE_INVALID", "The next number must be between 1 and 99,999,999.")
    Sequence = _LockedSequence(db, Key)
    if Sequence.last_issued_number and NextNumber <= Sequence.last_issued_number:
        api_error(
            422,
            "PAYMENT_SEQUENCE_BACKWARDS",
            f"{FormatDocumentNumber(Sequence.prefix, Sequence.pad_width, Sequence.last_issued_number)} has already been issued. "
            "The next number must be higher than that.",
        )
    Before = SequencePayload(Sequence)
    if not Sequence.is_configured:
        # Nothing was ever set: do not show the placeholder 1 as "before".
        Before["nextFormatted"] = None
    Sequence.next_number = NextNumber
    Sequence.is_configured = True
    Sequence.updated_by_user_id = Actor.id if Actor else None
    db.flush()
    After = SequencePayload(Sequence)
    WritePaymentAudit(db, EntityType="NUMBER_SEQUENCE", EntityId=Key, Action="SET_NEXT_NUMBER", Actor=Actor, Before=Before, After=After, Reason=Reason)
    return After
