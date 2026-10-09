"""Razorpay: the keys, signature checks and the few API calls this site
makes (Payments Phase 5, 2026-10-09).

The keys come from backend/.env on the server (RAZORPAY_KEY_ID,
RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET); nothing here is ever sent to
a browser except the key id, which Razorpay Checkout needs and which is
public by design.

Tests replace the client with SetRazorpayClient(FakeClient()), so no test
ever reaches Razorpay.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
from typing import Any, Protocol

import httpx

from app.core import config

logger = logging.getLogger(__name__)

API_BASE = "https://api.razorpay.com/v1"
TIMEOUT_SECONDS = 15.0


class RazorpayError(Exception):
    """Razorpay could not be reached or refused the request."""

    def __init__(self, Message: str, *, Status: int | None = None, Code: str | None = None):
        super().__init__(Message)
        self.status = Status
        self.code = Code


def KeyId() -> str:
    return (config.RAZORPAY_KEY_ID or "").strip()


def _KeySecret() -> str:
    return (config.RAZORPAY_KEY_SECRET or "").strip()


def _WebhookSecret() -> str:
    return (config.RAZORPAY_WEBHOOK_SECRET or "").strip()


def KeyMode() -> str | None:
    """TEST, LIVE, or None when no key is set (or it is not a Razorpay key)."""
    Key = KeyId()
    if Key.startswith("rzp_test_"):
        return "TEST"
    if Key.startswith("rzp_live_"):
        return "LIVE"
    return None


def KeysReady() -> bool:
    return bool(KeyMode() and _KeySecret())


def WebhookSecretSet() -> bool:
    return bool(_WebhookSecret())


def MaskedKeyId() -> str | None:
    Key = KeyId()
    if not Key:
        return None
    return Key[:9] + "…" + Key[-4:] if len(Key) > 14 else Key[:9] + "…"


def _Hmac(Secret: str, Message: bytes) -> str:
    return hmac.new(Secret.encode("utf-8"), Message, hashlib.sha256).hexdigest()


def PaymentSignatureIsValid(OrderId: str, PaymentId: str, Signature: str, *, Secret: str | None = None) -> bool:
    """Checkout's success signature: HMAC-SHA256 of "order_id|payment_id"
    with the key secret."""
    Secret = Secret if Secret is not None else _KeySecret()
    if not (Secret and OrderId and PaymentId and Signature):
        return False
    Expected = _Hmac(Secret, f"{OrderId}|{PaymentId}".encode("utf-8"))
    # Bytes, so a junk (non-ASCII) signature is a clean "no", not an error.
    return hmac.compare_digest(Expected.encode(), str(Signature).strip().lower().encode("utf-8", "replace"))


def WebhookSignatureIsValid(Body: bytes, Signature: str, *, Secret: str | None = None) -> bool:
    """X-Razorpay-Signature: HMAC-SHA256 of the raw request body with the
    webhook secret."""
    Secret = Secret if Secret is not None else _WebhookSecret()
    if not (Secret and Signature):
        return False
    return hmac.compare_digest(_Hmac(Secret, Body).encode(), str(Signature).strip().lower().encode("utf-8", "replace"))


class RazorpayClient(Protocol):
    def CreateOrder(self, *, AmountPaise: int, Receipt: str, Notes: dict[str, str]) -> dict[str, Any]: ...
    def FetchPayment(self, PaymentId: str) -> dict[str, Any]: ...
    def CapturePayment(self, PaymentId: str, AmountPaise: int) -> dict[str, Any]: ...
    def FetchOrderPayments(self, OrderId: str) -> list[dict[str, Any]]: ...


class HttpRazorpayClient:
    """The real client: Razorpay's REST API with the key id and secret."""

    def _Request(self, Method: str, Path: str, Json: dict[str, Any] | None = None) -> Any:
        if not KeysReady():
            raise RazorpayError("Razorpay keys are not set on the server.", Code="KEYS_MISSING")
        try:
            with httpx.Client(base_url=API_BASE, auth=(KeyId(), _KeySecret()), timeout=TIMEOUT_SECONDS) as Client:
                Response = Client.request(Method, Path, json=Json)
        except httpx.HTTPError as Error:
            logger.warning("Razorpay %s %s failed: %s", Method, Path, type(Error).__name__)
            raise RazorpayError("Razorpay could not be reached. Please try again in a moment.", Code="UNREACHABLE") from Error
        if Response.status_code >= 400:
            Description = None
            Code = None
            try:
                Body = Response.json()
                Description = (Body.get("error") or {}).get("description")
                Code = (Body.get("error") or {}).get("code")
            except ValueError:
                pass
            logger.warning("Razorpay %s %s returned %s: %s", Method, Path, Response.status_code, Description)
            raise RazorpayError(Description or "Razorpay refused the request.", Status=Response.status_code, Code=Code)
        return Response.json()

    def CreateOrder(self, *, AmountPaise: int, Receipt: str, Notes: dict[str, str]) -> dict[str, Any]:
        return self._Request("POST", "/orders", {"amount": AmountPaise, "currency": "INR", "receipt": Receipt[:40], "notes": Notes, "payment_capture": 1})

    def FetchPayment(self, PaymentId: str) -> dict[str, Any]:
        return self._Request("GET", f"/payments/{PaymentId}")

    def CapturePayment(self, PaymentId: str, AmountPaise: int) -> dict[str, Any]:
        return self._Request("POST", f"/payments/{PaymentId}/capture", {"amount": AmountPaise, "currency": "INR"})

    def FetchOrderPayments(self, OrderId: str) -> list[dict[str, Any]]:
        Body = self._Request("GET", f"/orders/{OrderId}/payments")
        return list((Body or {}).get("items") or [])


_Client: RazorpayClient | None = None


def GetRazorpayClient() -> RazorpayClient:
    return _Client or HttpRazorpayClient()


def SetRazorpayClient(Client: RazorpayClient | None) -> None:
    """Tests only: use a fake client (None puts the real one back)."""
    global _Client
    _Client = Client
