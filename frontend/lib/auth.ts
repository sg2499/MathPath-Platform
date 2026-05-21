import type { CurrentUser, UserRole } from "@/types/auth";

const LEGACY_TOKEN_KEY = "mathpath_access_token";
const LEGACY_USER_KEY = "mathpath_user";
const ACTIVE_ROLE_KEY = "mathpath_active_role";

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

function tokenKey(role: UserRole) {
  return `mathpath_${role.toLowerCase()}_access_token`;
}

function userKey(role: UserRole) {
  return `mathpath_${role.toLowerCase()}_user`;
}

export function getTokenForRole(role: UserRole): string | null {
  if (typeof window === "undefined") return null;
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return null;
  return localStorage.getItem(tokenKey(normalizedRole));
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

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const role = activeRole();
  if (role) {
    const token = localStorage.getItem(tokenKey(role));
    if (token) return token;
  }
  return localStorage.getItem(LEGACY_TOKEN_KEY);
}

export function setAuth(token: string, user: CurrentUser): void {
  const role = normalizeRole(user.role) || "STUDENT";
  localStorage.setItem(tokenKey(role), token);
  localStorage.setItem(userKey(role), JSON.stringify(user));
  localStorage.setItem(ACTIVE_ROLE_KEY, role);

  // Keep legacy keys for login page compatibility only.
  localStorage.setItem(LEGACY_TOKEN_KEY, token);
  localStorage.setItem(LEGACY_USER_KEY, JSON.stringify(user));
}

export function clearAuth(): void {
  if (typeof window === "undefined") return;
  const role = activeRole();
  if (role) {
    localStorage.removeItem(tokenKey(role));
    localStorage.removeItem(userKey(role));
  }
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_USER_KEY);
}


export function updateStoredUser(user: CurrentUser): void {
  if (typeof window === "undefined") return;
  const role = normalizeRole(user.role) || activeRole() || "STUDENT";
  localStorage.setItem(userKey(role), JSON.stringify(user));
  localStorage.setItem(ACTIVE_ROLE_KEY, role);
  localStorage.setItem(LEGACY_USER_KEY, JSON.stringify(user));
}

export function getStoredUser(): CurrentUser | null {
  if (typeof window === "undefined") return null;
  const role = activeRole();
  const raw = role ? localStorage.getItem(userKey(role)) : localStorage.getItem(LEGACY_USER_KEY);
  const fallback = localStorage.getItem(LEGACY_USER_KEY);
  const value = raw || fallback;
  if (!value) return null;
  try {
    return JSON.parse(value) as CurrentUser;
  } catch {
    return null;
  }
}

export function defaultRouteForRole(role: UserRole): string {
  if (role === "STUDENT") return "/student/dashboard";
  if (role === "TEACHER") return "/teacher/dashboard";
  return "/admin/dashboard";
}
