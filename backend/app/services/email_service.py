from __future__ import annotations

import socket
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from typing import Iterable, TypedDict

from app.core.config import (
    SMTP_FROM_EMAIL,
    SMTP_FORCE_IPV4,
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



def _CreateIpv4Socket(Host: str, Port: int, TimeoutSeconds: int, SourceAddress=None) -> socket.socket:
    LastError: OSError | None = None
    AddressInfo = socket.getaddrinfo(Host, Port, socket.AF_INET, socket.SOCK_STREAM)
    for Family, SockType, Proto, _, SocketAddress in AddressInfo:
        SocketValue = socket.socket(Family, SockType, Proto)
        try:
            SocketValue.settimeout(TimeoutSeconds)
            if SourceAddress:
                SocketValue.bind(SourceAddress)
            SocketValue.connect(SocketAddress)
            return SocketValue
        except OSError as ErrorValue:
            LastError = ErrorValue
            SocketValue.close()
    if LastError:
        raise LastError
    raise OSError(f"Could not resolve an IPv4 SMTP address for {Host}:{Port}.")


class _IPv4SMTP(smtplib.SMTP):
    def _get_socket(self, host, port, timeout):  # noqa: N802 - smtplib override
        return _CreateIpv4Socket(host, int(port), int(timeout or SMTP_TIMEOUT_SECONDS or 15), self.source_address)


class _IPv4SMTPSSL(smtplib.SMTP_SSL):
    def _get_socket(self, host, port, timeout):  # noqa: N802 - smtplib override
        RawSocket = _CreateIpv4Socket(host, int(port), int(timeout or SMTP_TIMEOUT_SECONDS or 15), self.source_address)
        ContextValue = self.context or ssl.create_default_context()
        return ContextValue.wrap_socket(RawSocket, server_hostname=host)



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

    TimeoutSeconds = max(5, min(int(SMTP_TIMEOUT_SECONDS or 15), 30))

    try:
        PreviousTimeout = socket.getdefaulttimeout()
        socket.setdefaulttimeout(TimeoutSeconds)
        try:
            if SMTP_FORCE_IPV4:
                ServerClass = _IPv4SMTPSSL if SMTP_USE_SSL else _IPv4SMTP
            else:
                ServerClass = smtplib.SMTP_SSL if SMTP_USE_SSL else smtplib.SMTP
            with ServerClass(_ConfiguredValue(SMTP_HOST), int(SMTP_PORT or 587), timeout=TimeoutSeconds) as Server:
                Server.ehlo()
                if SMTP_USE_TLS and not SMTP_USE_SSL:
                    Server.starttls(context=ssl.create_default_context())
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
    except OSError as Error:
        ErrorText = str(Error)
        if getattr(Error, "errno", None) == 101 or "network is unreachable" in ErrorText.lower():
            raise EmailSendError(
                "SMTP network connection failed. Please verify Render outbound SMTP access, SMTP host, port, and TLS/SSL settings."
            ) from Error
        raise EmailSendError(f"Report email could not be sent: {Error}") from Error
    except Exception as Error:
        raise EmailSendError(f"Report email could not be sent: {Error}") from Error
