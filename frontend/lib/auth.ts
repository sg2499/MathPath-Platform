import type { CurrentUser, UserRole } from "@/types/auth";

// 2026-07-22 security hardening: the actual session now lives entirely in
// an httpOnly cookie (see backend/app/core/cookies.py) that page JS cannot
// read at all -- that's the whole point, it closes off the XSS-reads-
// localStorage token-theft path. Everything stored here is non-secret: the
// user's own profile (for display) and a "which role is this tab acting
// as" hint used purely for client-side routing UX and to tell the shared
// axios client which cookie the backend should check for a given request
// (see lib/api.ts's X-Auth-Role header and cookies.py's
// read_session_token()). None of it grants access on its own -- forging any
// of these values client-side gets you a UI shell at best; every real API
// call is still authorized server-side against the httpOnly cookie.
const LEGACY_USER_KEY = "mathpath_user";
const ACTIVE_ROLE_KEY = "mathpath_active_role";
const CSRF_COOKIE_NAME = "mp_csrf";

function roleFromPath(): UserRole | null {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname;
  if (path.startsWith("/admin")) return "ADMIN";
  if (path.startsWith("/teacher")) return "TEACHER";
  if (path.startsWith("/student")) return "STUDENT";
  return null;
}

function normalizeRole(role?: string | null): UserRole | null {
  if (role === "SUPER_ADMIN") return "ADMIN";
  if (role === "ADMIN" || role === "TEACHER" || role === "STUDENT") return role;
  return null;
}

function activeRole(): UserRole | null {
  if (typeof window === "undefined") return null;
  const pathRole = roleFromPath();
  if (pathRole) return pathRole;
  const stored = normalizeRole(localStorage.getItem(ACTIVE_ROLE_KEY));
  return stored;
}

export function setActiveRole(role: UserRole): void {
  if (typeof window === "undefined") return;
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return;
  const ExistingRole = localStorage.getItem(ACTIVE_ROLE_KEY);
  if (ExistingRole === normalizedRole) return;
  localStorage.setItem(ACTIVE_ROLE_KEY, normalizedRole);
  window.dispatchEvent(new Event("mathpath-auth-changed"));
}

/** Non-secret role hint attached as the X-Auth-Role header by lib/api.ts's
 * axios interceptor -- lets the backend pick the right session cookie when
 * more than one role is logged in in different tabs. See the file-level
 * comment above: this selects a cookie, it never substitutes for one.
 */
export function getActiveRoleHeaderValue(): string | null {
  return activeRole();
}

/** Reads the non-httpOnly CSRF cookie's value so it can be echoed back as
 * the X-CSRF-Token header (double-submit pattern, see dependencies.py).
 */
export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const Match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE_NAME}=([^;]*)`));
  return Match ? decodeURIComponent(Match[1]) : null;
}

function userKey(role: UserRole) {
  return `mathpath_${role.toLowerCase()}_user`;
}

function stripLargeInlinePhotos(user: CurrentUser): CurrentUser {
  const IsDataUrl = (Value?: string | null) => Boolean(Value && Value.startsWith("data:"));
  return {
    ...user,
    profilePhotoUrl: IsDataUrl(user.profilePhotoUrl) ? null : user.profilePhotoUrl,
    student: user.student
      ? {
          ...user.student,
          photoUrl: IsDataUrl(user.student.photoUrl) ? null : user.student.photoUrl,
          signatureUrl: IsDataUrl(user.student.signatureUrl) ? null : user.student.signatureUrl,
        }
      : user.student,
    teacher: user.teacher
      ? {
          ...user.teacher,
          photoUrl: IsDataUrl(user.teacher.photoUrl) ? null : user.teacher.photoUrl,
          signatureUrl: IsDataUrl(user.teacher.signatureUrl) ? null : user.teacher.signatureUrl,
        }
      : user.teacher,
  };
}

function safeSetJson(StorageKey: string, Value: CurrentUser): void {
  try {
    localStorage.setItem(StorageKey, JSON.stringify(stripLargeInlinePhotos(Value)));
  } catch {
    localStorage.removeItem(StorageKey);
    localStorage.setItem(StorageKey, JSON.stringify(stripLargeInlinePhotos({ ...Value, profilePhotoUrl: null })));
  }
}

export function getStoredUserForRole(role: UserRole): CurrentUser | null {
  if (typeof window === "undefined") return null;
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return null;
  const raw = localStorage.getItem(userKey(normalizedRole));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CurrentUser;
  } catch {
    return null;
  }
}

/** Persists the logged-in user's own profile (display only, non-secret) and
 * marks this role as active. Called once per successful login/2FA-verify;
 * the real session was already established server-side via the httpOnly
 * cookie the login response set before this runs.
 */
export function setSession(user: CurrentUser): void {
  const role = normalizeRole(user.role) || "STUDENT";
  safeSetJson(userKey(role), user);
  localStorage.setItem(ACTIVE_ROLE_KEY, role);
  safeSetJson(LEGACY_USER_KEY, user);
  window.dispatchEvent(new Event("mathpath-auth-changed"));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  const role = activeRole();
  if (role) {
    localStorage.removeItem(userKey(role));
  }
  localStorage.removeItem(LEGACY_USER_KEY);
  window.dispatchEvent(new Event("mathpath-auth-changed"));
}

export function updateStoredUser(user: CurrentUser): void {
  if (typeof window === "undefined") return;
  const role = normalizeRole(user.role) || activeRole() || "STUDENT";
  safeSetJson(userKey(role), user);
  localStorage.setItem(ACTIVE_ROLE_KEY, role);
  safeSetJson(LEGACY_USER_KEY, user);
}

export function getStoredUser(): CurrentUser | null {
  if (typeof window === "undefined") return null;
  const role = activeRole();
  const raw = role ? localStorage.getItem(userKey(role)) : localStorage.getItem(LEGACY_USER_KEY);
  const fallback = localStorage.getItem(LEGACY_USER_KEY);
  const value = raw || fallback;
  if (!value) return null;
  try {
    const ParsedUser = JSON.parse(value) as CurrentUser;
    const SanitizedUser = stripLargeInlinePhotos(ParsedUser);
    if (JSON.stringify(ParsedUser) !== JSON.stringify(SanitizedUser)) {
      const normalizedRole = normalizeRole(SanitizedUser.role) || role || "STUDENT";
      safeSetJson(userKey(normalizedRole), SanitizedUser);
      safeSetJson(LEGACY_USER_KEY, SanitizedUser);
    }
    return SanitizedUser;
  } catch {
    return null;
  }
}

export function defaultRouteForRole(role: UserRole): string {
  if (role === "STUDENT") return "/student/dashboard";
  if (role === "TEACHER") return "/teacher/dashboard";
  return "/admin/dashboard";
}
