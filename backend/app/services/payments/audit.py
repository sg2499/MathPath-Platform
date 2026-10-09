"""Audit history for the payments area: who changed what, when, before and
after, and why. Written in the caller's transaction (never commits), so a
change and its history are saved together or not at all."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models import PaymentAuditLog, User


def WritePaymentAudit(
    db: Session,
    *,
    EntityType: str,
    EntityId: str,
    Action: str,
    Actor: User | None,
    Before: dict[str, Any] | None = None,
    After: dict[str, Any] | None = None,
    Reason: str | None = None,
    ActorName: str | None = None,
) -> PaymentAuditLog:
    Entry = PaymentAuditLog(
        entity_type=EntityType,
        entity_id=EntityId,
        action=Action,
        actor_user_id=Actor.id if Actor else None,
        # ActorName names a system actor (for example "Razorpay") when no
        # person made the change.
        actor_name=(Actor.full_name if Actor else ActorName),
        reason=(Reason or "").strip() or None,
        before_json=json.dumps(Before, sort_keys=True, default=str) if Before is not None else None,
        after_json=json.dumps(After, sort_keys=True, default=str) if After is not None else None,
        # Set here, to the microsecond: the database's now() is the same for
        # every row in one transaction, which would scramble the order.
        created_at=datetime.now(timezone.utc),
    )
    db.add(Entry)
    db.flush()
    return Entry


def ListPaymentAudit(db: Session, *, EntityType: str | None = None, EntityId: str | None = None, Limit: int = 100) -> list[dict[str, Any]]:
    Query = db.query(PaymentAuditLog)
    if EntityType:
        Query = Query.filter(PaymentAuditLog.entity_type == EntityType)
    if EntityId:
        Query = Query.filter(PaymentAuditLog.entity_id == EntityId)
    Rows = Query.order_by(PaymentAuditLog.created_at.desc(), PaymentAuditLog.id.desc()).limit(max(1, min(Limit, 500))).all()
    return [
        {
            "id": Row.id,
            "entityType": Row.entity_type,
            "entityId": Row.entity_id,
            "action": Row.action,
            "actorName": Row.actor_name,
            "reason": Row.reason,
            "before": json.loads(Row.before_json) if Row.before_json else None,
            "after": json.loads(Row.after_json) if Row.after_json else None,
            "createdAt": Row.created_at.isoformat() if Row.created_at else None,
        }
        for Row in Rows
    ]
