from __future__ import annotations

import socket
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from time import monotonic, sleep
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


class EmailDiagnosticResult(TypedDict, total=False):
    configured: bool
    ok: bool
    host: str
    port: int
    useTls: bool
    useSsl: bool
    forceIpv4: bool
    usernamePresent: bool
    fromEmailPresent: bool
    passwordPresent: bool
    attempts: list[dict[str, object]]
    message: str


def _ConfiguredValue(Value: str | None) -> str:
    return str(Value or "").strip()


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
            "Email service is not configured. Missing: " + ", ".join(Missing)
        )


def _TimeoutSeconds() -> int:
    return max(20, min(int(SMTP_TIMEOUT_SECONDS or 60), 90))


def _CandidateTransports() -> list[dict[str, object]]:
    Host = _ConfiguredValue(SMTP_HOST)
    Port = int(SMTP_PORT or 587)
    Primary = {"host": Host, "port": Port, "useSsl": bool(SMTP_USE_SSL), "useTls": bool(SMTP_USE_TLS and not SMTP_USE_SSL), "label": "configured"}
    Candidates = [Primary]

    # Gmail supports both STARTTLS/587 and SSL/465. Render/Gmail networking can be
    # more reliable on one path than the other depending on runtime egress. Try the
    # alternate Gmail transport only after the configured path fails.
    LowerHost = Host.lower()
    if "gmail" in LowerHost or LowerHost == "smtp.gmail.com":
        Alternate = {"host": Host, "port": 465 if Port != 465 else 587, "useSsl": Port != 465, "useTls": Port == 465, "label": "gmail-fallback"}
        if not any(Item["port"] == Alternate["port"] and Item["useSsl"] == Alternate["useSsl"] for Item in Candidates):
            Candidates.append(Alternate)
    return Candidates


def _ServerClass(UseSsl: bool):
    if SMTP_FORCE_IPV4:
        return _IPv4SMTPSSL if UseSsl else _IPv4SMTP
    return smtplib.SMTP_SSL if UseSsl else smtplib.SMTP


def _OpenAndAuthenticate(*, Host: str, Port: int, UseSsl: bool, UseTls: bool, TimeoutSeconds: int):
    ServerClass = _ServerClass(UseSsl)
    Server = ServerClass(Host, Port, timeout=TimeoutSeconds)
    try:
        Server.ehlo()
        if UseTls and not UseSsl:
            Server.starttls(context=ssl.create_default_context())
            Server.ehlo()
        Server.login(_ConfiguredValue(SMTP_USERNAME), _ConfiguredValue(SMTP_PASSWORD))
        return Server
    except Exception:
        try:
            Server.quit()
        except Exception:
            pass
        raise


def _CleanSendException(Error: Exception, *, Stage: str, TransportLabel: str) -> EmailSendError:
    ErrorText = str(Error)
    LowerText = ErrorText.lower()
    Prefix = f"SMTP {Stage} failed on {TransportLabel} transport."
    if isinstance(Error, smtplib.SMTPAuthenticationError) or "authentication" in LowerText or "535" in LowerText:
        return EmailSendError(f"{Prefix} Gmail rejected authentication. Check SMTP_USERNAME and Gmail App Password.")
    if isinstance(Error, smtplib.SMTPRecipientsRefused):
        return EmailSendError(f"{Prefix} Recipient address was rejected. Check the parent email address.")
    if isinstance(Error, (TimeoutError, socket.timeout)) or "timed out" in LowerText or "timeout" in LowerText:
        return EmailSendError(f"{Prefix} Connection timed out. Verify Render outbound SMTP access and try the Gmail fallback port 465/587.")
    if "network is unreachable" in LowerText or "connection refused" in LowerText or "no route" in LowerText:
        return EmailSendError(f"{Prefix} Network connection failed. Verify Render outbound SMTP access, host, port, TLS/SSL settings.")
    return EmailSendError(f"{Prefix} {ErrorText}")


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
    Message["Message-ID"] = make_msgid(domain="mathpath.local")
    Message.set_content(Body)
    Message.add_attachment(
        AttachmentBytes,
        maintype="application",
        subtype=AttachmentMimeSubtype,
        filename=AttachmentFileName,
    )

    TimeoutSeconds = _TimeoutSeconds()
    LastError: EmailSendError | None = None

    for Transport in _CandidateTransports():
        Host = str(Transport["host"])
        Port = int(Transport["port"])
        UseSsl = bool(Transport["useSsl"])
        UseTls = bool(Transport["useTls"])
        Label = str(Transport["label"])
        for AttemptIndex in range(2):
            try:
                PreviousTimeout = socket.getdefaulttimeout()
                socket.setdefaulttimeout(TimeoutSeconds)
                try:
                    with _OpenAndAuthenticate(Host=Host, Port=Port, UseSsl=UseSsl, UseTls=UseTls, TimeoutSeconds=TimeoutSeconds) as Server:
                        SendResult = Server.send_message(Message)
                        ProviderResponse = "SMTP accepted message" if not SendResult else f"SMTP accepted with recipient notes: {SendResult}"
                        return {
                            "provider": f"SMTP:{Label}:{Port}",
                            "providerMessageId": Message.get("Message-ID"),
                            "providerResponse": ProviderResponse,
                            "recipientCount": len(CleanRecipients),
                        }
                finally:
                    socket.setdefaulttimeout(PreviousTimeout)
            except EmailConfigurationError:
                raise
            except Exception as Error:
                LastError = _CleanSendException(Error, Stage="delivery", TransportLabel=f"{Label}:{Port}")
                if AttemptIndex == 0:
                    sleep(1.0)
                    continue
                break

    raise LastError or EmailSendError("Report email could not be sent by any configured SMTP transport.")


def DiagnoseSmtpConfiguration() -> EmailDiagnosticResult:
    Result: EmailDiagnosticResult = {
        "configured": False,
        "ok": False,
        "host": _ConfiguredValue(SMTP_HOST),
        "port": int(SMTP_PORT or 587),
        "useTls": bool(SMTP_USE_TLS),
        "useSsl": bool(SMTP_USE_SSL),
        "forceIpv4": bool(SMTP_FORCE_IPV4),
        "usernamePresent": bool(_ConfiguredValue(SMTP_USERNAME)),
        "fromEmailPresent": bool(_ConfiguredValue(SMTP_FROM_EMAIL)),
        "passwordPresent": bool(_ConfiguredValue(SMTP_PASSWORD)),
        "attempts": [],
        "message": "SMTP diagnostic has not run.",
    }
    try:
        EnsureEmailConfigured()
    except EmailConfigurationError as Error:
        Result["message"] = str(Error)
        return Result

    Result["configured"] = True
    TimeoutSeconds = min(_TimeoutSeconds(), 30)
    for Transport in _CandidateTransports():
        Host = str(Transport["host"])
        Port = int(Transport["port"])
        UseSsl = bool(Transport["useSsl"])
        UseTls = bool(Transport["useTls"])
        Label = str(Transport["label"])
        Started = monotonic()
        AttemptPayload: dict[str, object] = {
            "label": Label,
            "host": Host,
            "port": Port,
            "useSsl": UseSsl,
            "useTls": UseTls,
            "ok": False,
        }
        try:
            PreviousTimeout = socket.getdefaulttimeout()
            socket.setdefaulttimeout(TimeoutSeconds)
            try:
                with _OpenAndAuthenticate(Host=Host, Port=Port, UseSsl=UseSsl, UseTls=UseTls, TimeoutSeconds=TimeoutSeconds) as Server:
                    Server.noop()
                AttemptPayload["ok"] = True
                AttemptPayload["message"] = "SMTP connection and authentication succeeded."
                Result["ok"] = True
                Result["message"] = "SMTP is reachable and authenticated from this backend runtime."
            finally:
                socket.setdefaulttimeout(PreviousTimeout)
        except Exception as Error:
            AttemptPayload["message"] = str(_CleanSendException(Error, Stage="diagnostic", TransportLabel=f"{Label}:{Port}"))
        finally:
            AttemptPayload["durationSeconds"] = round(monotonic() - Started, 2)
            Result["attempts"].append(AttemptPayload)
        if Result["ok"]:
            break
    if not Result["ok"] and Result["attempts"]:
        Result["message"] = str(Result["attempts"][-1].get("message") or "SMTP diagnostic failed.")
    return Result
