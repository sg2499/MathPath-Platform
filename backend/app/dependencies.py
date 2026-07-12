from fastapi import Depends, BackgroundTasks, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from sqlalchemy import update
from app.database import get_db, SessionLocal
from app.core.security import decode_token, create_access_token
from app.core.config import ACCESS_TOKEN_EXPIRE_MINUTES
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
    response: Response,
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

    # Sliding session: a token more than halfway through its lifetime gets
    # transparently renewed via a response header. This is the permanent fix
    # for "student gets logged out mid-exam because their token happened to
    # expire while they were actively answering questions" -- every answer
    # save, every timer poll, every API call during an active session is a
    # chance to renew, so a genuinely active student can never hit a hard
    # expiry wall. A truly idle session (no requests at all for the back half
    # of the token's lifetime) still expires on schedule, same as before.
    # The frontend's axios response interceptor reads this header and swaps
    # the stored token automatically -- nothing changes for the student.
    exp = payload.get("exp")
    if exp:
        try:
            expires_at = datetime.fromtimestamp(exp, tz=timezone.utc)
            remaining_seconds = (expires_at - datetime.now(timezone.utc)).total_seconds()
            half_lifetime_seconds = (ACCESS_TOKEN_EXPIRE_MINUTES * 60) / 2
            if 0 < remaining_seconds < half_lifetime_seconds:
                response.headers["X-New-Access-Token"] = create_access_token(user.id, user.role)
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
    # Defensive second check, mirroring get_current_teacher() below. student.is_active
    # and the underlying user.is_active are kept in sync by every admin endpoint that
    # currently deactivates a student, so this doesn't fire under normal operation --
    # it exists so a future code path (bulk import, a data-repair script, a new admin
    # feature) can never silently desync the two and leave a "deactivated" student with
    # working login access with nobody the wiser.
    if not student.is_active:
        api_error(403, "ACCOUNT_INACTIVE", "Student account is inactive.")
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
