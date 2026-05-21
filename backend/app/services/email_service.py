from __future__ import annotations

import socket
import smtplib
from email.message import EmailMessage
from email.utils import formataddr
from typing import Iterable, TypedDict

from app.core.config import (
    SMTP_FROM_EMAIL,
    SMTP_FROM_NAME,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_TIMEOUT_SECONDS,
    SMTP_USERNAME,
    SMTP_USE_SSL,
    SMTP_USE_TLS,
)


class EmailConfigurationError(RuntimeError):
    pass


class EmailSendError(RuntimeError):
    pass


class EmailSendResult(TypedDict, total=False):
    provider: str
    providerMessageId: str | None
    providerResponse: str
    recipientCount: int



def _ConfiguredValue(Value: str | None) -> str:
    return str(Value or "").strip()


def EnsureEmailConfigured() -> None:
    Missing = []
    if not _ConfiguredValue(SMTP_HOST):
        Missing.append("SMTP_HOST")
    if not _ConfiguredValue(SMTP_USERNAME):
        Missing.append("SMTP_USERNAME")
    if not _ConfiguredValue(SMTP_PASSWORD):
        Missing.append("SMTP_PASSWORD")
    if not _ConfiguredValue(SMTP_FROM_EMAIL):
        Missing.append("SMTP_FROM_EMAIL")
    if Missing:
        raise EmailConfigurationError(
            "Email service is not configured. Please configure SMTP settings before sending parent reports."
        )


def SendEmailWithAttachment(
    *,
    Recipients: Iterable[str],
    Subject: str,
    Body: str,
    AttachmentBytes: bytes,
    AttachmentFileName: str,
    AttachmentMimeSubtype: str = "pdf",
) -> EmailSendResult:
    EnsureEmailConfigured()
    CleanRecipients = [str(Recipient).strip() for Recipient in Recipients if str(Recipient or "").strip()]
    if not CleanRecipients:
        raise EmailSendError("No recipient email address was provided.")

    Message = EmailMessage()
    Message["Subject"] = Subject
    Message["From"] = formataddr((_ConfiguredValue(SMTP_FROM_NAME) or "MathPath Team", _ConfiguredValue(SMTP_FROM_EMAIL)))
    Message["To"] = ", ".join(CleanRecipients)
    Message.set_content(Body)
    Message.add_attachment(
        AttachmentBytes,
        maintype="application",
        subtype=AttachmentMimeSubtype,
        filename=AttachmentFileName,
    )

    TimeoutSeconds = max(5, min(int(SMTP_TIMEOUT_SECONDS or 20), 45))

    try:
        PreviousTimeout = socket.getdefaulttimeout()
        socket.setdefaulttimeout(TimeoutSeconds)
        try:
            ServerClass = smtplib.SMTP_SSL if SMTP_USE_SSL else smtplib.SMTP
            with ServerClass(_ConfiguredValue(SMTP_HOST), int(SMTP_PORT or 587), timeout=TimeoutSeconds) as Server:
                Server.ehlo()
                if SMTP_USE_TLS and not SMTP_USE_SSL:
                    Server.starttls()
                    Server.ehlo()
                Server.login(_ConfiguredValue(SMTP_USERNAME), _ConfiguredValue(SMTP_PASSWORD))
                SendResult = Server.send_message(Message)
                ProviderResponse = "SMTP accepted message" if not SendResult else f"SMTP accepted with recipient notes: {SendResult}"
                return {
                    "provider": "SMTP",
                    "providerMessageId": Message.get("Message-ID"),
                    "providerResponse": ProviderResponse,
                    "recipientCount": len(CleanRecipients),
                }
        finally:
            socket.setdefaulttimeout(PreviousTimeout)
    except EmailConfigurationError:
        raise
    except Exception as Error:
        raise EmailSendError(f"Report email could not be sent: {Error}") from Error
