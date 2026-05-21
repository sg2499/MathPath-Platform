from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.security import decode_token
from app.core.errors import api_error
from app.models import User, Student, Teacher

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        api_error(401, "UNAUTHORIZED", "Missing or invalid authorization header.")

    payload = decode_token(credentials.credentials)
    if not payload:
        api_error(401, "UNAUTHORIZED", "Invalid or expired token.")

    user = db.get(User, payload.get("sub"))
    if not user or not user.is_active:
        api_error(401, "UNAUTHORIZED", "User not found or inactive.")

    return user


def require_roles(*roles: str):
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            api_error(403, "FORBIDDEN", "You do not have permission for this action.")
        return user
    return dependency


def get_current_student(
    user: User = Depends(require_roles("STUDENT")),
    db: Session = Depends(get_db),
) -> Student:
    student = db.query(Student).filter(Student.user_id == user.id).first()
    if not student:
        api_error(404, "NOT_FOUND", "Student profile not found.")
    return student


def get_current_teacher(
    user: User = Depends(require_roles("TEACHER")),
    db: Session = Depends(get_db),
) -> Teacher:
    teacher = db.query(Teacher).filter(Teacher.user_id == user.id).first()
    if not teacher:
        api_error(404, "NOT_FOUND", "Teacher profile not found.")
    if not teacher.is_active:
        api_error(403, "ACCOUNT_INACTIVE", "Teacher account is inactive.")
    return teacher
