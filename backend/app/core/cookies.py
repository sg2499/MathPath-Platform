"""httpOnly session cookies + double-submit CSRF token.

2026-07-22 security hardening: replaces raw JWT access tokens living in
frontend localStorage (readable by any XSS payload) with httpOnly cookies
(invisible to page JS entirely). This only works because the frontend now
proxies /api/* through its own domain (see frontend/next.config.mjs's
rewrites()) -- without that, the cookie would be cross-site between
math-path-platform.vercel.app and the Render backend, which Safari/iOS
block by default. Do not point these cookies at the Render origin directly;
they must be set via a same-origin (proxied) response so the browser treats
them as first-party.

Multi-role sessions: the app has always supported being logged into
admin/teacher/student simultaneously in different browser tabs (see the old
per-role localStorage keys in lib/auth.ts). A single shared cookie name
would break that -- one login would silently kick out the others. Instead
each role gets its own cookie name, scoped to Path=/api so all of them ride
along on every API request, and the frontend sends a non-secret
X-Auth-Role header (read_session_token() below) telling the backend which
one applies to a given request. Tampering with that header client-side
gains nothing -- it only *selects* which cookie to check, it never
substitutes for one; the actual authorization is always the cookie's JWT
value, validated exactly like the old Authorization header was.
"""
import secrets
from fastapi import Request, Response
from app.core.config import ACCESS_TOKEN_EXPIRE_MINUTES, COOKIE_SECURE

SESSION_COOKIE_NAMES = {
    "ADMIN": "mp_admin_sess",
    "SUPER_ADMIN": "mp_admin_sess",
    "TEACHER": "mp_teacher_sess",
    "STUDENT": "mp_student_sess",
}
CSRF_COOKIE_NAME = "mp_csrf"
CSRF_HEADER_NAME = "x-csrf-token"
ROLE_HEADER_NAME = "x-auth-role"
SESSION_COOKIE_PATH = "/api"
_COOKIE_MAX_AGE_SECONDS = ACCESS_TOKEN_EXPIRE_MINUTES * 60


def _cookie_name_for_role(role: str) -> str:
    return SESSION_COOKIE_NAMES.get((role or "").upper(), SESSION_COOKIE_NAMES["STUDENT"])


def set_session_cookie(response: Response, role: str, token: str) -> None:
    response.set_cookie(
        key=_cookie_name_for_role(role),
        value=token,
        max_age=_COOKIE_MAX_AGE_SECONDS,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        path=SESSION_COOKIE_PATH,
    )


def set_csrf_cookie(response: Response) -> str:
    """Issue the double-submit CSRF cookie. Deliberately NOT httpOnly -- the
    frontend reads its value and echoes it back as the X-CSRF-Token header
    on every mutating request. A cross-site page can make the browser send
    the session cookie automatically, but it cannot read this cookie's
    value (blocked by same-origin policy) to also produce a matching
    header, so get_current_user() rejects the forged request.
    """
    token = secrets.token_urlsafe(32)
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=token,
        max_age=_COOKIE_MAX_AGE_SECONDS,
        httponly=False,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )
    return token


def touch_csrf_cookie(request: Request, response: Response) -> None:
    """Keep the CSRF cookie alive for as long as the session itself is
    active. Bug found 2026-07-22, day after the httpOnly cookie migration
    shipped: the CSRF cookie's Max-Age was only ever set once, at login.
    The session cookie, by contrast, slides forward indefinitely for an
    active user (see the >50%-lifetime refresh in get_current_user()). An
    admin who stayed logged in and active past the CSRF cookie's original
    Max-Age ended up with a browser that still had a perfectly valid
    session cookie but no CSRF cookie at all -- every mutating request then
    failed CSRF_VALIDATION_FAILED, permanently, with no way to recover
    short of logging out and back in (the frontend only auto-clears the
    session on a 401, never on a CSRF 403, so nothing prompted a re-login
    either). Fix: re-issue the CSRF cookie (same value, fresh Max-Age) on
    every cookie-authenticated request, not just mutating ones, so it
    slides forward in lockstep with actual usage exactly like the session
    cookie does. If the cookie is already missing there's nothing to slide
    -- that gets handled by the frontend's CSRF-403 self-heal instead (see
    api.ts's response interceptor).
    """
    existing = request.cookies.get(CSRF_COOKIE_NAME)
    if not existing:
        return
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=existing,
        max_age=_COOKIE_MAX_AGE_SECONDS,
        httponly=False,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response, role: str) -> None:
    response.delete_cookie(_cookie_name_for_role(role), path=SESSION_COOKIE_PATH)


def clear_all_session_cookies(response: Response) -> None:
    for cookie_name in set(SESSION_COOKIE_NAMES.values()):
        response.delete_cookie(cookie_name, path=SESSION_COOKIE_PATH)
    response.delete_cookie(CSRF_COOKIE_NAME, path="/")


def read_session_token(request: Request) -> str | None:
    role_hint = (request.headers.get(ROLE_HEADER_NAME) or "").upper()
    hinted_cookie = SESSION_COOKIE_NAMES.get(role_hint)
    if hinted_cookie:
        token = request.cookies.get(hinted_cookie)
        if token:
            return token

    # No/unrecognized hint (or the hinted cookie wasn't present) -- fall
    # back to whichever session cookie does exist, so a single-role session
    # never breaks just because a caller forgot the header.
    for cookie_name in dict.fromkeys(SESSION_COOKIE_NAMES.values()):
        token = request.cookies.get(cookie_name)
        if token:
            return token
    return None
