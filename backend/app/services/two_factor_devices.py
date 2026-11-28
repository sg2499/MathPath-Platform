"""Several authenticator apps on one admin login (2026-11-28, Shailesh).

The admins share one admin login, and its 2FA codes used to come only from
Shailesh's phone. Now each person adds their own phone once, and a code from
any active phone (or a backup code) completes the login.

Rules:
- Adding or removing a phone needs the account password, so a session alone
  (a forgotten open laptop) cannot add a stranger's phone.
- A phone only counts once a code from it has been entered.
- The last phone cannot be removed; turning 2FA off is a separate step.
- users.totp_secret keeps the secret of an active phone at all times, so an
  older build of the platform still accepts a code.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.core.security import verify_password
from app.core.totp import generate_totp_secret, totp_provisioning_uri, totp_qr_code_data_url, verify_totp_code
from app.models import User, UserTotpDevice

FIRST_DEVICE_LABEL = "First authenticator"
MAX_LABEL = 60
MAX_DEVICES = 12
PENDING_LIFETIME = timedelta(minutes=30)


def _Now() -> datetime:
    return datetime.now(timezone.utc)


def _Aware(Value: datetime | None) -> datetime | None:
    if Value is None:
        return None
    return Value if Value.tzinfo else Value.replace(tzinfo=timezone.utc)


def _ActiveQuery(db: Session, User_: User):
    return (
        db.query(UserTotpDevice)
        .filter(UserTotpDevice.user_id == User_.id, UserTotpDevice.confirmed_at.isnot(None), UserTotpDevice.removed_at.is_(None))
        .order_by(UserTotpDevice.confirmed_at, UserTotpDevice.created_at)
    )


def EnsureFirstDevice(db: Session, User_: User) -> None:
    """The account's original authenticator becomes the first phone in the
    list the first time the list is needed. Nothing happens without 2FA."""
    if not User_.totp_enabled or not User_.totp_secret:
        return
    Exists = db.query(UserTotpDevice.id).filter(UserTotpDevice.user_id == User_.id).first()
    if Exists:
        return
    Now = _Now()
    db.add(UserTotpDevice(user_id=User_.id, label=FIRST_DEVICE_LABEL, secret=User_.totp_secret, created_at=Now, confirmed_at=Now))
    db.flush()


def BackfillFirstDevices(db: Session) -> int:
    """At startup: every account with 2FA on gets its first phone row."""
    Count = 0
    for User_ in db.query(User).filter(User.totp_enabled.is_(True), User.totp_secret.isnot(None)).all():
        Before = db.query(UserTotpDevice.id).filter(UserTotpDevice.user_id == User_.id).first()
        if Before is None:
            EnsureFirstDevice(db, User_)
            Count += 1
    db.commit()
    return Count


def ActiveDevices(db: Session, User_: User) -> list[UserTotpDevice]:
    EnsureFirstDevice(db, User_)
    return _ActiveQuery(db, User_).all()


def DevicePayload(Device: UserTotpDevice) -> dict[str, Any]:
    return {
        "deviceId": Device.id,
        "label": Device.label,
        "addedAt": _Aware(Device.confirmed_at or Device.created_at).isoformat() if (Device.confirmed_at or Device.created_at) else None,
        "lastUsedAt": _Aware(Device.last_used_at).isoformat() if Device.last_used_at else None,
    }


def ListDevices(db: Session, User_: User) -> dict[str, Any]:
    Devices = ActiveDevices(db, User_)
    db.commit()
    return {"enabled": bool(User_.totp_enabled), "devices": [DevicePayload(Device) for Device in Devices]}


def VerifyLoginCode(db: Session, User_: User, Code: str) -> UserTotpDevice | None:
    """The phone whose current code this is, or None. Marks it as used."""
    for Device in ActiveDevices(db, User_):
        if verify_totp_code(Device.secret, Code):
            Device.last_used_at = _Now()
            db.flush()
            return Device
    return None


def _RequirePassword(User_: User, Password: str | None) -> None:
    if not verify_password(Password or "", User_.password_hash):
        api_error(400, "INVALID_PASSWORD", "Password is incorrect.")


def _RequireEnabled(User_: User) -> None:
    if not User_.totp_enabled:
        api_error(400, "TWO_FACTOR_OFF", "Turn on two-factor authentication first.")


def _CleanLabel(db: Session, User_: User, Label: str | None, *, Except: str | None = None) -> str:
    Clean = " ".join((Label or "").split())
    if not Clean:
        api_error(422, "DEVICE_LABEL_REQUIRED", "Give the phone a name, for example \"Riya's phone\".")
    if len(Clean) > MAX_LABEL:
        api_error(422, "DEVICE_LABEL_TOO_LONG", f"Keep the name to {MAX_LABEL} characters.")
    for Device in ActiveDevices(db, User_):
        if Device.id != Except and Device.label.casefold() == Clean.casefold():
            api_error(409, "DEVICE_LABEL_TAKEN", f"A phone called \"{Clean}\" is already added. Use another name.")
    return Clean


def StartAddDevice(db: Session, User_: User, *, Label: str | None, Password: str | None) -> dict[str, Any]:
    _RequireEnabled(User_)
    _RequirePassword(User_, Password)
    Clean = _CleanLabel(db, User_, Label)
    if len(ActiveDevices(db, User_)) >= MAX_DEVICES:
        api_error(409, "TOO_MANY_DEVICES", f"Up to {MAX_DEVICES} phones can be added. Remove one that is no longer used first.")
    # Unfinished additions are dropped: only the newest QR code can be confirmed.
    db.query(UserTotpDevice).filter(UserTotpDevice.user_id == User_.id, UserTotpDevice.confirmed_at.is_(None)).delete(synchronize_session=False)
    Secret = generate_totp_secret()
    Device = UserTotpDevice(user_id=User_.id, label=Clean, secret=Secret, created_at=_Now())
    db.add(Device)
    db.commit()
    AccountLabel = f"{User_.email or User_.phone or User_.full_name} ({Clean})"
    Uri = totp_provisioning_uri(Secret, AccountLabel)
    return {"deviceId": Device.id, "label": Clean, "secret": Secret, "qrCodeDataUrl": totp_qr_code_data_url(Uri), "otpauthUri": Uri}


def ConfirmAddDevice(db: Session, User_: User, *, DeviceId: str, Code: str | None) -> dict[str, Any]:
    _RequireEnabled(User_)
    Device = db.get(UserTotpDevice, DeviceId)
    if not Device or Device.user_id != User_.id or Device.removed_at is not None:
        api_error(404, "DEVICE_NOT_FOUND", "This phone is no longer waiting to be added. Start again.")
    if Device.confirmed_at is not None:
        return {"device": DevicePayload(Device), **ListDevices(db, User_)}
    if _Now() - _Aware(Device.created_at) > PENDING_LIFETIME:
        api_error(410, "DEVICE_SETUP_EXPIRED", "This QR code has expired. Start again to get a new one.")
    if not verify_totp_code(Device.secret, Code or ""):
        api_error(400, "INVALID_CODE", "That code didn't match. Enter the 6-digit code shown on the new phone.")
    Device.confirmed_at = _Now()
    db.commit()
    return {"device": DevicePayload(Device), **ListDevices(db, User_)}


def RenameDevice(db: Session, User_: User, *, DeviceId: str, Label: str | None) -> dict[str, Any]:
    _RequireEnabled(User_)
    Device = next((Row for Row in ActiveDevices(db, User_) if Row.id == DeviceId), None)
    if not Device:
        api_error(404, "DEVICE_NOT_FOUND", "That phone is not on this account.")
    Device.label = _CleanLabel(db, User_, Label, Except=Device.id)
    db.commit()
    return ListDevices(db, User_)


def RemoveDevice(db: Session, User_: User, *, DeviceId: str, Password: str | None) -> dict[str, Any]:
    _RequireEnabled(User_)
    _RequirePassword(User_, Password)
    Devices = ActiveDevices(db, User_)
    Device = next((Row for Row in Devices if Row.id == DeviceId), None)
    if not Device:
        api_error(404, "DEVICE_NOT_FOUND", "That phone is not on this account.")
    if len(Devices) == 1:
        api_error(409, "LAST_DEVICE", "This is the only phone left. Add another phone first, or turn two-factor authentication off.")
    Device.removed_at = _Now()
    if User_.totp_secret == Device.secret:
        User_.totp_secret = next(Row.secret for Row in Devices if Row.id != Device.id)
    db.commit()
    return ListDevices(db, User_)


def OnTwoFactorEnabled(db: Session, User_: User) -> None:
    """First setup: the confirmed secret becomes the first phone."""
    Now = _Now()
    db.query(UserTotpDevice).filter(UserTotpDevice.user_id == User_.id, UserTotpDevice.removed_at.is_(None)).update({"removed_at": Now}, synchronize_session=False)
    db.add(UserTotpDevice(user_id=User_.id, label=FIRST_DEVICE_LABEL, secret=User_.totp_secret, created_at=Now, confirmed_at=Now))


def OnTwoFactorDisabled(db: Session, User_: User) -> None:
    db.query(UserTotpDevice).filter(UserTotpDevice.user_id == User_.id, UserTotpDevice.removed_at.is_(None)).update({"removed_at": _Now()}, synchronize_session=False)
