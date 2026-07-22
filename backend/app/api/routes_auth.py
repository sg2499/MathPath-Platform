import base64
import json
import re
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, UploadFile, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.core.security import (
    hash_password,
    verify_password,
    strong_password_issue,
    create_access_token,
    decode_two_factor_challenge_token,
)
from app.core.totp import (
    generate_totp_secret,
    totp_provisioning_uri,
    totp_qr_code_data_url,
    verify_totp_code,
    generate_backup_codes,
)
from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.models import Student, Teacher, User
from app.services.auth_service import login, user_payload, force_logout_user
from app.core.rate_limit import limiter

router = APIRouter(prefix="/api/auth", tags=["auth"])

USER_PHOTO_DIR = Path("uploads/users/photos")
STUDENT_PHOTO_DIR = Path("uploads/students/photos")
TEACHER_PHOTO_DIR = Path("uploads/teachers/photos")
for PhotoDirectory in [USER_PHOTO_DIR, STUDENT_PHOTO_DIR, TEACHER_PHOTO_DIR]:
    PhotoDirectory.mkdir(parents=True, exist_ok=True)


class LoginRequest(BaseModel):
    identifier: str
    password: str


class ChangePasswordRequest(BaseModel):
    currentPassword: str
    newPassword: str


class TwoFactorEnableRequest(BaseModel):
    code: str


class TwoFactorDisableRequest(BaseModel):
    password: str


class TwoFactorVerifyLoginRequest(BaseModel):
    challengeToken: str
    code: str


@router.post("/login")
@limiter.limit("5/minute")
def login_route(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
    return login(db, payload.identifier, payload.password)


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_payload(db, user)


def safe_profile_photo_name(filename: str, prefix: str) -> str:
    suffix = Path(filename or "profile.png").suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
        api_error(400, "INVALID_FILE", "Only JPG, PNG, and WEBP images are allowed.")
    SafePrefix = re.sub(r"[^a-zA-Z0-9_-]", "-", prefix or "profile")[:80]
    Stamp = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
    return f"{SafePrefix}-{Stamp}{suffix}"


def save_profile_photo(upload: UploadFile, folder: Path, prefix: str, public_root: str) -> str:
    """Persist the profile image in the database, but never expose the data URL to localStorage.

    Render/Vercel runtime filesystems are ephemeral, so the raw image is stored as a data URL in
    the existing DB text column. The API returns a lightweight public image endpoint URL to the
    frontend, preventing browser localStorage quota failures.
    """
    FileName = safe_profile_photo_name(upload.filename or "profile.png", prefix)
    Suffix = Path(FileName).suffix.lower().lstrip(".")
    MimeType = "image/jpeg" if Suffix in {"jpg", "jpeg"} else f"image/{Suffix or 'png'}"
    Content = upload.file.read()
    if not Content:
        api_error(400, "INVALID_FILE", "Profile photo file is empty.")
    if len(Content) > 350_000:
        api_error(400, "FILE_TOO_LARGE", "Profile photo must be under 350 KB after compression.")
    Encoded = base64.b64encode(Content).decode("ascii")
    return f"data:{MimeType};base64,{Encoded}"


def _stored_photo_for_user(db: Session, TargetUser: User) -> str | None:
    if TargetUser.role == "STUDENT":
        StudentProfile = db.query(Student).filter(Student.user_id == TargetUser.id).first()
        return (StudentProfile.photo_url if StudentProfile else None) or TargetUser.photo_url
    if TargetUser.role == "TEACHER":
        TeacherProfile = db.query(Teacher).filter(Teacher.user_id == TargetUser.id).first()
        return (TeacherProfile.photo_url if TeacherProfile else None) or TargetUser.photo_url
    return TargetUser.photo_url


def _decode_data_url(PhotoValue: str) -> tuple[bytes, str]:
    if not PhotoValue or not PhotoValue.startswith("data:") or ";base64," not in PhotoValue:
        api_error(404, "PHOTO_NOT_FOUND", "Profile photo not found.")
    Header, Encoded = PhotoValue.split(",", 1)
    MimeType = Header.replace("data:", "").replace(";base64", "") or "image/png"
    try:
        return base64.b64decode(Encoded), MimeType
    except Exception:
        api_error(404, "PHOTO_NOT_FOUND", "Profile photo not found.")


@router.get("/profile-photo/{user_id}")
def get_profile_photo(user_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    TargetUser = db.query(User).filter(User.id == user_id).first()
    if not TargetUser:
        api_error(404, "PHOTO_NOT_FOUND", "Profile photo not found.")
    PhotoValue = _stored_photo_for_user(db, TargetUser)
    if not PhotoValue:
        api_error(404, "PHOTO_NOT_FOUND", "Profile photo not found.")
    ImageBytes, MimeType = _decode_data_url(PhotoValue)
    return Response(
        content=ImageBytes,
        media_type=MimeType,
        headers={
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/profile-photo")
def upload_profile_photo(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    PhotoUrl: str

    if user.role == "STUDENT":
        StudentProfile = db.query(Student).filter(Student.user_id == user.id).first()
        if not StudentProfile:
            api_error(404, "NOT_FOUND", "Student profile not found.")
        PhotoUrl = save_profile_photo(
            file,
            STUDENT_PHOTO_DIR,
            StudentProfile.student_code,
            "/uploads/students/photos",
        )
        StudentProfile.photo_url = PhotoUrl
    elif user.role == "TEACHER":
        TeacherProfile = db.query(Teacher).filter(Teacher.user_id == user.id).first()
        if not TeacherProfile:
            api_error(404, "NOT_FOUND", "Teacher profile not found.")
        PhotoUrl = save_profile_photo(
            file,
            TEACHER_PHOTO_DIR,
            TeacherProfile.teacher_code,
            "/uploads/teachers/photos",
        )
        TeacherProfile.photo_url = PhotoUrl
    else:
        PhotoUrl = save_profile_photo(
            file,
            USER_PHOTO_DIR,
            user.email or user.phone or user.id,
            "/uploads/users/photos",
        )
        user.photo_url = PhotoUrl

    db.commit()
    db.refresh(user)
    PublicPhotoUrl = f"/api/auth/profile-photo/{user.id}?v={datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"
    UpdatedUser = user_payload(db, user)
    UpdatedUser["profilePhotoUrl"] = PublicPhotoUrl
    return {"updated": True, "photoUrl": PublicPhotoUrl, "user": UpdatedUser}


@router.post("/change-password")
@limiter.limit("5/minute")
def change_password(
    request: Request,
    payload: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    CurrentPassword = (payload.currentPassword or "").strip()
    NewPassword = (payload.newPassword or "").strip()

    if not CurrentPassword:
        api_error(400, "VALIDATION_ERROR", "Current password is required.")
    if not NewPassword:
        api_error(400, "VALIDATION_ERROR", "New password is required.")
    PasswordIssue = strong_password_issue(NewPassword)
    if PasswordIssue:
        api_error(400, "VALIDATION_ERROR", PasswordIssue)
    if not verify_password(CurrentPassword, user.password_hash):
        api_error(400, "INVALID_PASSWORD", "Current password is incorrect.")

    from sqlalchemy.sql import func
    user.password_hash = hash_password(NewPassword)
    user.password_changed_at = func.now()
    db.commit()
    return {"updated": True, "message": "Password updated successfully."}


@router.post("/logout-all-sessions")
@limiter.limit("5/minute")
def logout_all_sessions(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Invalidate every access token already issued to the current user, including this one.

    Self-service equivalent of an admin force-logout -- for a user who
    suspects their own session/device was compromised and wants every
    active login killed immediately without waiting to change their
    password. The caller will need to log in again right after calling this.
    """
    force_logout_user(db, user)
    return {"updated": True, "message": "You have been signed out of all sessions. Please log in again."}


# ---------------------------------------------------------------------------
# Two-factor authentication (TOTP). Setup/enable/disable are gated to
# ADMIN/SUPER_ADMIN for now, per the 2026-07-21 security audit's Phase 2
# scope ("prioritized for the Admin role first") -- the highest-value
# account on the platform gets the strongest protection first. verify-login
# itself is intentionally not role-gated so it keeps working correctly if
# 2FA is ever extended to other roles later.
# ---------------------------------------------------------------------------

@router.post("/2fa/setup")
def two_factor_setup(user: User = Depends(require_roles("ADMIN", "SUPER_ADMIN")), db: Session = Depends(get_db)):
    """Generate a new TOTP secret and return it as a QR code, but do not enable 2FA yet.

    The secret is stored as "pending" until confirmed via a correct code at
    POST /2fa/enable -- this prevents a user from locking themselves into a
    broken 2FA setup (e.g. mis-scanned QR code) with no way back in.
    """
    Secret = generate_totp_secret()
    user.totp_pending_secret = Secret
    db.commit()
    AccountLabel = user.email or user.phone or user.full_name or user.id
    Uri = totp_provisioning_uri(Secret, AccountLabel)
    return {
        "secret": Secret,
        "qrCodeDataUrl": totp_qr_code_data_url(Uri),
        "otpauthUri": Uri,
    }


@router.post("/2fa/enable")
def two_factor_enable(
    payload: TwoFactorEnableRequest,
    user: User = Depends(require_roles("ADMIN", "SUPER_ADMIN")),
    db: Session = Depends(get_db),
):
    if not user.totp_pending_secret:
        api_error(400, "NO_PENDING_SETUP", "Start 2FA setup first by calling /2fa/setup.")
    if not verify_totp_code(user.totp_pending_secret, payload.code):
        api_error(400, "INVALID_CODE", "That code didn't match. Check your authenticator app and try again.")

    BackupCodes = generate_backup_codes()
    user.totp_secret = user.totp_pending_secret
    user.totp_pending_secret = None
    user.totp_enabled = True
    user.totp_backup_codes_json = json.dumps([hash_password(code) for code in BackupCodes])
    db.commit()
    return {
        "updated": True,
        "message": "Two-factor authentication is now enabled.",
        # Shown exactly once -- only the hashes are ever stored, the same
        # trust model as a password. If these are lost, disable and re-enable
        # 2FA to get a fresh set.
        "backupCodes": BackupCodes,
    }


@router.post("/2fa/disable")
def two_factor_disable(
    payload: TwoFactorDisableRequest,
    user: User = Depends(require_roles("ADMIN", "SUPER_ADMIN")),
    db: Session = Depends(get_db),
):
    # Require the current password to disable, not just an active session --
    # otherwise a stolen/leaked session token alone could turn off 2FA and
    # remove the very protection it exists to provide.
    if not verify_password(payload.password or "", user.password_hash):
        api_error(400, "INVALID_PASSWORD", "Password is incorrect.")
    user.totp_secret = None
    user.totp_pending_secret = None
    user.totp_enabled = False
    user.totp_backup_codes_json = None
    db.commit()
    return {"updated": True, "message": "Two-factor authentication has been disabled."}


@router.post("/2fa/verify-login")
@limiter.limit("10/minute")
def two_factor_verify_login(request: Request, payload: TwoFactorVerifyLoginRequest, db: Session = Depends(get_db)):
    UserId = decode_two_factor_challenge_token(payload.challengeToken)
    if not UserId:
        api_error(401, "UNAUTHORIZED", "This verification step has expired. Please log in again.")

    user = db.get(User, UserId)
    if not user or not user.is_active or not user.totp_enabled:
        api_error(401, "UNAUTHORIZED", "This verification step has expired. Please log in again.")

    Code = (payload.code or "").strip()
    if verify_totp_code(user.totp_secret, Code):
        token = create_access_token(user.id, user.role)
        return {"accessToken": token, "tokenType": "Bearer", "user": user_payload(db, user)}

    # Fall back to a one-time backup code -- consumed on use, same as any
    # other single-use recovery credential.
    StoredHashes = json.loads(user.totp_backup_codes_json or "[]")
    for Index, StoredHash in enumerate(StoredHashes):
        if verify_password(Code, StoredHash):
            del StoredHashes[Index]
            user.totp_backup_codes_json = json.dumps(StoredHashes)
            db.commit()
            token = create_access_token(user.id, user.role)
            return {"accessToken": token, "tokenType": "Bearer", "user": user_payload(db, user)}

    api_error(401, "INVALID_CODE", "That code didn't match. Check your authenticator app and try again.")


@router.get("/ping")
def auth_ping(user: User = Depends(get_current_user)):
    """
    Heartbeat endpoint. 
    By depending on get_current_user, it automatically triggers the LRU-debounced 
    last_active_at database update in the background.
    """
    return {"status": "ok", "user_id": user.id}
