from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone as datetime_timezone
from typing import Iterable

from sqlalchemy.orm import Session

from app.models import ParentReportDeliveryEvent, ParentReportEmailLog
from app.services.email_service import SendEmailWithAttachment

DELIVERY_STATUS_QUEUED = "QUEUED"
DELIVERY_STATUS_PROCESSING = "PROCESSING"
DELIVERY_STATUS_SENT = "SENT"
DELIVERY_STATUS_DELIVERED = "DELIVERED"
DELIVERY_STATUS_FAILED = "FAILED"
DELIVERY_STATUS_BOUNCED = "BOUNCED"
DELIVERY_STATUS_RETRY_PENDING = "RETRY_PENDING"

VISIBLE_STATUS_SENT = "SENT"


@dataclass(frozen=True)
class DeliveryProviderResult:
    provider: str
    provider_message_id: str | None
    provider_response: str
    recipient_count: int


def CurrentUtc() -> datetime:
    return datetime.now(datetime_timezone.utc)


def _SerializeMetadata(Metadata: dict | None) -> str | None:
    if not Metadata:
        return None
    try:
        return json.dumps(Metadata, default=str, sort_keys=True)
    except Exception:
        return json.dumps({"metadataSerializationError": True}, sort_keys=True)


def AddDeliveryEvent(
    db: Session,
    *,
    DeliveryLog: ParentReportEmailLog,
    EventType: str,
    Status: str,
    Provider: str | None = None,
    ProviderMessageId: str | None = None,
    ProviderResponse: str | None = None,
    ErrorMessage: str | None = None,
    Metadata: dict | None = None,
) -> ParentReportDeliveryEvent:
    EventValue = ParentReportDeliveryEvent(
        delivery_log_id=DeliveryLog.id,
        event_type=EventType,
        status=Status,
        provider=Provider,
        provider_message_id=ProviderMessageId,
        provider_response=ProviderResponse,
        error_message=ErrorMessage,
        metadata_json=_SerializeMetadata(Metadata),
    )
    db.add(EventValue)
    return EventValue


def MarkDeliveryQueued(db: Session, Logs: Iterable[ParentReportEmailLog], *, FileName: str | None = None) -> None:
    for LogValue in Logs:
        LogValue.delivery_status = DELIVERY_STATUS_QUEUED
        LogValue.status = "PENDING"
        AddDeliveryEvent(
            db,
            DeliveryLog=LogValue,
            EventType="QUEUED",
            Status=DELIVERY_STATUS_QUEUED,
            Metadata={"fileName": FileName or LogValue.file_name},
        )


def MarkDeliveryProcessing(db: Session, Logs: Iterable[ParentReportEmailLog]) -> None:
    NowValue = CurrentUtc()
    for LogValue in Logs:
        LogValue.delivery_status = DELIVERY_STATUS_PROCESSING
        LogValue.status = "PROCESSING"
        LogValue.last_attempt_at = NowValue
        LogValue.attempt_count = int(LogValue.attempt_count or 0) + 1
        AddDeliveryEvent(
            db,
            DeliveryLog=LogValue,
            EventType="PROCESSING",
            Status=DELIVERY_STATUS_PROCESSING,
            Metadata={"attemptCount": LogValue.attempt_count},
        )


def MarkDeliverySent(db: Session, Logs: Iterable[ParentReportEmailLog], *, Result: DeliveryProviderResult) -> None:
    NowValue = CurrentUtc()
    for LogValue in Logs:
        LogValue.status = VISIBLE_STATUS_SENT
        LogValue.delivery_status = DELIVERY_STATUS_SENT
        LogValue.delivery_provider = Result.provider
        LogValue.provider_message_id = Result.provider_message_id
        LogValue.provider_response = Result.provider_response
        LogValue.sent_at = NowValue
        LogValue.last_attempt_at = NowValue
        LogValue.error_message = None
        AddDeliveryEvent(
            db,
            DeliveryLog=LogValue,
            EventType="SENT",
            Status=DELIVERY_STATUS_SENT,
            Provider=Result.provider,
            ProviderMessageId=Result.provider_message_id,
            ProviderResponse=Result.provider_response,
            Metadata={"recipientCount": Result.recipient_count},
        )


def MarkDeliveryFailed(db: Session, Logs: Iterable[ParentReportEmailLog], *, ErrorMessage: str, RetryPending: bool = False) -> None:
    NowValue = CurrentUtc()
    StatusValue = DELIVERY_STATUS_RETRY_PENDING if RetryPending else DELIVERY_STATUS_FAILED
    for LogValue in Logs:
        LogValue.status = "FAILED"
        LogValue.delivery_status = StatusValue
        LogValue.last_attempt_at = NowValue
        LogValue.error_message = ErrorMessage
        AddDeliveryEvent(
            db,
            DeliveryLog=LogValue,
            EventType="FAILED",
            Status=StatusValue,
            ErrorMessage=ErrorMessage,
            Metadata={"attemptCount": LogValue.attempt_count or 0},
        )


def ValidateDeliveryAttachment(*, AttachmentBytes: bytes | None, AttachmentFileName: str | None) -> None:
    if not AttachmentBytes or len(AttachmentBytes) < 100:
        raise ValueError("Parent report PDF could not be generated. Please generate the report again before sending.")
    if not str(AttachmentFileName or "").strip().lower().endswith(".pdf"):
        raise ValueError("Parent report attachment must be a PDF file.")


def SendTrackedParentReportEmail(
    db: Session,
    *,
    Logs: list[ParentReportEmailLog],
    Recipients: list[str],
    Subject: str,
    Body: str,
    AttachmentBytes: bytes,
    AttachmentFileName: str,
) -> DeliveryProviderResult:
    ValidateDeliveryAttachment(AttachmentBytes=AttachmentBytes, AttachmentFileName=AttachmentFileName)
    MarkDeliveryProcessing(db, Logs)
    db.commit()
    RawResult = SendEmailWithAttachment(
        Recipients=Recipients,
        Subject=Subject,
        Body=Body,
        AttachmentBytes=AttachmentBytes,
        AttachmentFileName=AttachmentFileName,
    )
    Result = DeliveryProviderResult(
        provider=str(RawResult.get("provider") or "SMTP"),
        provider_message_id=RawResult.get("providerMessageId"),
        provider_response=str(RawResult.get("providerResponse") or "SMTP accepted message"),
        recipient_count=int(RawResult.get("recipientCount") or len(Recipients)),
    )
    MarkDeliverySent(db, Logs, Result=Result)
    return Result


def DeliveryLogPayload(LogValue: ParentReportEmailLog) -> dict:
    return {
        "deliveryStatus": LogValue.delivery_status or LogValue.status,
        "deliveryProvider": LogValue.delivery_provider,
        "providerMessageId": LogValue.provider_message_id,
        "providerResponse": LogValue.provider_response,
        "attemptCount": int(LogValue.attempt_count or 0),
        "lastAttemptAt": LogValue.last_attempt_at.isoformat() if LogValue.last_attempt_at else None,
        "deliveredAt": LogValue.delivered_at.isoformat() if LogValue.delivered_at else None,
        "bouncedAt": LogValue.bounced_at.isoformat() if LogValue.bounced_at else None,
        "openedAt": LogValue.opened_at.isoformat() if LogValue.opened_at else None,
    }
