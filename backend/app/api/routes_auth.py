import base64
import re
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, UploadFile, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.core.security import hash_password, verify_password
from app.database import get_db
from app.dependencies import get_current_user
from app.models import Student, Teacher, User
from app.services.auth_service import login, user_payload
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
def get_profile_photo(user_id: str, db: Session = Depends(get_db)):
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
def change_password(
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
    if len(NewPassword) < 6:
        api_error(400, "VALIDATION_ERROR", "New password must be at least 6 characters.")
    if not verify_password(CurrentPassword, user.password_hash):
        api_error(400, "INVALID_PASSWORD", "Current password is incorrect.")

    from sqlalchemy.sql import func
    user.password_hash = hash_password(NewPassword)
    user.password_changed_at = func.now()
    db.commit()
    return {"updated": True, "message": "Password updated successfully."}
