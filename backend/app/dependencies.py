import secrets
import threading
from fastapi import Depends, BackgroundTasks, Response, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from sqlalchemy import update
from app.database import get_db, SessionLocal
from app.core.security import decode_token, create_access_token
from app.core.config import ACCESS_TOKEN_EXPIRE_MINUTES
from app.core.errors import api_error
from app.core.cookies import read_session_token, set_session_cookie, touch_csrf_cookie, CSRF_COOKIE_NAME, CSRF_HEADER_NAME
from app.models import User, Student, Teacher
from cachetools import TTLCache
from datetime import datetime, timezone

bearer_scheme = HTTPBearer(auto_error=False)

# How often one signed-in user's last_active_at is written, at most. 2026-10-06
# (Shailesh, admin Live Radar: "it should only show the live students who are
# actually active"): was 120 seconds, with a 5-minute "live" window on the
# radar, so a student stayed listed for up to 5 minutes after leaving. The
# page heartbeat (frontend/hooks/useHeartbeat.ts) now pings every 60 seconds;
# 50 here (just under that) means every heartbeat lands as a write, so a
# student who is really there is never more than about a minute stale and the
# radar's window (routes_admin.py: LIVE_STUDENT_WINDOW_SECONDS) can be short.
# Cost: one single-row UPDATE per signed-in user per minute, in the
# background.
ACTIVITY_WRITE_DEBOUNCE_SECONDS = 50
active_users_cache = TTLCache(maxsize=10000, ttl=ACTIVITY_WRITE_DEBOUNCE_SECONDS)
# 2026-10-14: TTLCache is not thread-safe, and this dependency runs in
# FastAPI's thread pool, so several requests from one user arriving together
# could hit it at the same moment while the entry was expiring. cachetools
# then raised KeyError(<user id>) and all those requests failed with a 500
# (server log, 11 Oct 11:52 UTC: five at once). Every read and write now goes
# through this lock.
_active_users_cache_lock = threading.Lock()


def _should_record_activity(user_id: str) -> bool:
    """True at most once per debounce window per user (per worker)."""
    with _active_users_cache_lock:
        try:
            if user_id in active_users_cache:
                return False
            active_users_cache[user_id] = True
            return True
        except KeyError:
            # An entry expiring underneath us; recording again is harmless.
            return True


def _as_aware_utc(value: datetime) -> datetime:
    """Normalize a DB-read timestamp to timezone-aware UTC, floored to whole
    seconds, before comparing it against a JWT's `iat`.

    Two independent precision mismatches were found and fixed here while
    testing the 2026-07-21 security audit Phase 2 force-logout feature:

    1. SQLite (used locally/in CI) silently drops tzinfo on read-back even
       for a DateTime(timezone=True) column populated with an aware UTC
       value -- every value this app ever writes to password_changed_at/
       session_invalidated_at is UTC, so a naive value read back is always
       implicitly UTC too. Comparing it against the always-aware
       `iat`-derived datetime without this normalization raises
       "can't compare offset-naive and offset-aware datetimes". Postgres
       (production) preserves tzinfo correctly, so this half of the fix is a
       no-op there, but it's applied unconditionally so correctness never
       depends on which database is running underneath it.
    2. A JWT's `iat` claim is a whole-number Unix timestamp (sub-second
       precision is truncated at encode time), but session_invalidated_at/
       password_changed_at are stored with microsecond precision. A user who
       force-logs-out and immediately re-authenticates in the same wall-clock
       second could get a brand new token whose truncated `iat` still
       compares as "before" the microsecond-precise revocation timestamp,
       incorrectly rejecting a token that was issued after the revocation in
       real time. Flooring to whole seconds here matches the JWT's own
       precision and removes the race entirely.
    """
    Aware = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return Aware.replace(microsecond=0)

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

IDLE_SIGN_OUT_SECONDS = 20 * 60
# A request reaching the server a little after the browser's own 20-minute
# sign-out (slow network, a timer that fired late) is not refused for that.
IDLE_SIGN_OUT_GRACE_SECONDS = 90
IDLE_SIGN_OUT_ROLES = {"STUDENT", "TEACHER"}
INTERACTION_WRITE_DEBOUNCE_SECONDS = 30
interaction_cache = TTLCache(maxsize=10000, ttl=INTERACTION_WRITE_DEBOUNCE_SECONDS)


def _update_user_interaction(user_id: str):
    db = SessionLocal()
    try:
        db.execute(update(User).where(User.id == user_id).values(last_interaction_at=datetime.now(timezone.utc)))
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def _enforce_idle_sign_out(request: Request, user: User) -> None:
    if user.role not in IDLE_SIGN_OUT_ROLES:
        return
    # Only enforced for the current app, which reports activity. A tab still
    # running the app from before this release can't, so it is left alone
    # (it updates itself on the next page load).
    if not request.headers.get("X-MP-Client"):
        return
    # Signing out must always work (it clears the session cookie), even for
    # a session that has already gone idle.
    RequestPath = getattr(getattr(request, "url", None), "path", "") or ""
    if RequestPath.endswith("/auth/logout"):
        return
    # A student on a test screen is never signed out (a tablet that slept
    # mid-paper must still be able to save and submit), and it counts as
    # activity.
    OnTestScreen = request.headers.get("X-MP-Test") == "1"
    Interacted = OnTestScreen or request.headers.get("X-MP-Active") == "1" or request.method in {"POST", "PUT", "PATCH", "DELETE"}
    LastInteraction = user.last_interaction_at
    IsIdle = False
    if LastInteraction is not None:
        try:
            IdleSeconds = (datetime.now(timezone.utc) - _as_aware_utc(LastInteraction)).total_seconds()
            IsIdle = IdleSeconds > IDLE_SIGN_OUT_SECONDS + IDLE_SIGN_OUT_GRACE_SECONDS
        except Exception:
            IsIdle = False
    if IsIdle and not OnTestScreen:
        api_error(401, "SESSION_IDLE", "You were signed out after 20 minutes of no activity. Please sign in again.")
    # First request after this release (no record yet) or real interaction:
    # record it, at most once every 30 seconds per user.
    if (LastInteraction is None or Interacted) and user.id not in interaction_cache:
        interaction_cache[user.id] = True
        _update_user_interaction(user.id)


def get_current_user(
    background_tasks: BackgroundTasks,
    request: Request,
    response: Response,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    # Two supported credential sources, checked in this order:
    #  1. Authorization: Bearer <token> -- unchanged from before. Kept alive
    #     deliberately for scripts/admin tooling/potential future non-browser
    #     clients that explicitly obtain and hold a token; it is not exposed
    #     to any web page's JS execution context, so it isn't the thing the
    #     2026-07-22 cookie migration is defending against.
    #  2. The httpOnly session cookie (see app/core/cookies.py) -- what the
    #     browser frontend uses as of this round. A request authenticated
    #     this way is subject to the CSRF check below, since the cookie is
    #     sent automatically by the browser and a bearer header is not.
    token = None
    used_cookie_auth = False
    if credentials is not None and credentials.scheme.lower() == "bearer":
        token = credentials.credentials
    if not token:
        token = read_session_token(request)
        used_cookie_auth = token is not None

    if not token:
        api_error(401, "UNAUTHORIZED", "Missing or invalid authorization header.")

    payload = decode_token(token)
    if not payload:
        api_error(401, "UNAUTHORIZED", "Invalid or expired token.")

    # Special-purpose tokens (e.g. the short-lived 2FA login-challenge token
    # issued mid-login, before the second factor is verified) carry a
    # "purpose" claim and must never be usable as a normal bearer token --
    # otherwise a leaked challenge token would grant full account access
    # without ever passing the second factor, defeating the point of 2FA.
    if payload.get("purpose"):
        api_error(401, "UNAUTHORIZED", "Invalid or expired token.")

    # Slide the CSRF cookie's Max-Age forward on every cookie-authenticated
    # request (GET included), not just mutating ones -- otherwise it dies on
    # its own fixed schedule even while the session cookie below keeps
    # renewing indefinitely for an active user. See touch_csrf_cookie()'s
    # docstring for the full incident writeup.
    if used_cookie_auth:
        touch_csrf_cookie(request, response)

    # CSRF check (double-submit cookie pattern): only applies when the
    # cookie is doing the authenticating, and only for methods that change
    # state. A forged cross-site request can make the browser attach the
    # session cookie automatically, but the attacker's page cannot read
    # the separate, non-httpOnly CSRF cookie (blocked by same-origin
    # policy) to also produce a matching header -- so the two won't match.
    if used_cookie_auth and request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        csrf_cookie = request.cookies.get(CSRF_COOKIE_NAME)
        csrf_header = request.headers.get(CSRF_HEADER_NAME)
        if not csrf_cookie or not csrf_header or not secrets.compare_digest(csrf_cookie, csrf_header):
            api_error(403, "CSRF_VALIDATION_FAILED", "Request could not be verified. Please refresh and try again.")

    user = db.get(User, payload.get("sub"))
    if not user or not user.is_active:
        api_error(401, "UNAUTHORIZED", "User not found or inactive.")

    # NOTE: api_error() raises HTTPException, which is itself an Exception --
    # it must never be called from inside a `try/except Exception` block that
    # is meant to guard against malformed timestamp data, or the raised 401
    # gets silently swallowed and the check becomes dead code. This bit both
    # checks below during this Phase 2 round: the comparison is computed
    # inside try/except (protecting against bad data), but api_error() is
    # only ever called after the try block has already completed.
    iat = payload.get("iat")
    if iat and user.password_changed_at:
        IsStaleAfterPasswordChange = False
        try:
            IsStaleAfterPasswordChange = datetime.fromtimestamp(iat, tz=timezone.utc) < _as_aware_utc(user.password_changed_at)
        except Exception:
            IsStaleAfterPasswordChange = False
        if IsStaleAfterPasswordChange:
            api_error(401, "UNAUTHORIZED", "Session expired due to password change.")

    # Lightweight session-revocation check (2026-07-21 security audit, Phase
    # 2): any token issued before a force-logout timestamp is rejected, the
    # same mechanism as the password-change check above. Lets an admin (or
    # the user themselves, via /api/auth/logout-all-sessions) kill every
    # active session on demand without requiring a password reset.
    if iat and user.session_invalidated_at:
        IsRevoked = False
        try:
            IsRevoked = datetime.fromtimestamp(iat, tz=timezone.utc) < _as_aware_utc(user.session_invalidated_at)
        except Exception:
            IsRevoked = False
        if IsRevoked:
            api_error(401, "UNAUTHORIZED", "Session was signed out remotely. Please log in again.")

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
                new_token = create_access_token(user.id, user.role)
                # Bearer-header callers (scripts) still read this response
                # header the same way they always have. Cookie-authenticated
                # browser requests instead get a fresh Set-Cookie -- the
                # browser applies it to its cookie jar automatically with no
                # JS involved, which is simpler than the old header-read
                # dance AND keeps the token out of JS's reach the whole time.
                response.headers["X-New-Access-Token"] = new_token
                if used_cookie_auth:
                    set_session_cookie(response, user.role, new_token)
        except Exception:
            pass

    # 2026-10-12 (Shailesh): teacher and student sessions end after 20
    # minutes with no real activity (admins are exempt). The browser marks a
    # request that follows recent interaction with X-MP-Active: 1 (and every
    # request from the current app with X-MP-Client); change requests always
    # count. Checked BEFORE recording this request's activity, so coming back
    # to a laptop that slept for an hour still signs the user out.
    _enforce_idle_sign_out(request, user)

    # MAANG-Tier Live Tracking: Debounce via LRU memory cache, update DB in background
    if _should_record_activity(user.id):
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
