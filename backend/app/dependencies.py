from fastapi import Depends, BackgroundTasks
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from sqlalchemy import update
from app.database import get_db, SessionLocal
from app.core.security import decode_token
from app.core.errors import api_error
from app.models import User, Student, Teacher
from cachetools import TTLCache
from datetime import datetime, timezone

bearer_scheme = HTTPBearer(auto_error=False)

active_users_cache = TTLCache(maxsize=10000, ttl=120)

def _update_user_activity(user_id: str):
    db = SessionLocal()
    try:
        db.execute(
            update(User).where(User.id == user_id).values(last_active_at=datetime.now(timezone.utc))
        )
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()

def get_current_user(
    background_tasks: BackgroundTasks,
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

    iat = payload.get("iat")
    if iat and user.password_changed_at:
        try:
            if datetime.fromtimestamp(iat, tz=timezone.utc) < user.password_changed_at:
                api_error(401, "UNAUTHORIZED", "Session expired due to password change.")
        except Exception:
            pass

    # MAANG-Tier Live Tracking: Debounce via LRU memory cache, update DB in background
    if user.id not in active_users_cache:
        active_users_cache[user.id] = True
        background_tasks.add_task(_update_user_activity, user.id)

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
