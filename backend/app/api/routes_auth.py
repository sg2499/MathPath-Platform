import re
import shutil
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.core.security import hash_password, verify_password
from app.database import get_db
from app.dependencies import get_current_user
from app.models import Student, Teacher, User
from app.services.auth_service import login, user_payload

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
def login_route(payload: LoginRequest, db: Session = Depends(get_db)):
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
    FileName = safe_profile_photo_name(upload.filename or "profile.png", prefix)
    TargetPath = folder / FileName
    with TargetPath.open("wb") as Buffer:
        shutil.copyfileobj(upload.file, Buffer)
    return f"{public_root}/{FileName}"


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
    return {"updated": True, "photoUrl": PhotoUrl, "user": user_payload(db, user)}


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

    user.password_hash = hash_password(NewPassword)
    db.commit()
    return {"updated": True, "message": "Password updated successfully."}
