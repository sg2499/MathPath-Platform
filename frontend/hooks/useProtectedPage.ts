"use client";

import { getStoredUser, getStoredUserForRole, getToken, getTokenForRole, setActiveRole } from "@/lib/auth";
import type { UserRole } from "@/types/auth";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const LAST_ROUTE_PREFIX = "mathpath_last_route_";

function normalizeRole(Role?: UserRole | null): UserRole | null {
  if (Role === "SUPER_ADMIN") return "ADMIN";
  if (Role === "ADMIN" || Role === "TEACHER" || Role === "STUDENT") return Role;
  return null;
}

function roleFromPath(Pathname?: string | null): UserRole | null {
  if (!Pathname) return null;
  if (Pathname.startsWith("/admin")) return "ADMIN";
  if (Pathname.startsWith("/teacher")) return "TEACHER";
  if (Pathname.startsWith("/student")) return "STUDENT";
  return null;
}

function rolesMatch(CurrentRole?: UserRole | null, AllowedRoles: UserRole[] = []) {
  const NormalizedCurrent = normalizeRole(CurrentRole);
  return AllowedRoles.some((AllowedRole) => normalizeRole(AllowedRole) === NormalizedCurrent);
}

function defaultRouteForRole(Role: UserRole): string {
  const NormalizedRole = normalizeRole(Role);
  if (NormalizedRole === "STUDENT") return "/student/dashboard";
  if (NormalizedRole === "TEACHER") return "/teacher/dashboard";
  return "/admin/dashboard";
}

function currentFullRoute(Pathname?: string | null) {
  if (typeof window === "undefined") return Pathname || "";
  return `${Pathname || window.location.pathname}${window.location.search || ""}`;
}

function persistCurrentRoute(Role: UserRole, Pathname: string) {
  if (typeof window === "undefined") return;
  const FullRoute = currentFullRoute(Pathname);
  if (!FullRoute || FullRoute === "/login") return;
  const NormalizedRole = normalizeRole(Role);
  if (!NormalizedRole) return;
  localStorage.setItem(`${LAST_ROUTE_PREFIX}${NormalizedRole.toLowerCase()}`, FullRoute);
}

export function useProtectedPage(allowedRoles: UserRole[]) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const roleKey = useMemo(() => allowedRoles.join("|"), [allowedRoles]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const PathRole = roleFromPath(pathname);
    const CandidateRoles = PathRole ? [PathRole] : allowedRoles;

    for (const CandidateRole of CandidateRoles) {
      const Token = getTokenForRole(CandidateRole) || getToken();
      const User = getStoredUserForRole(CandidateRole) || getStoredUser();

      if (Token && User && rolesMatch(User.role, allowedRoles) && rolesMatch(CandidateRole, allowedRoles)) {
        setActiveRole(CandidateRole);
        if (pathname) persistCurrentRoute(CandidateRole, pathname);
        setReady(true);
        return;
      }
    }

    for (const AllowedRole of allowedRoles) {
      const NormalizedAllowedRole = normalizeRole(AllowedRole);
      if (!NormalizedAllowedRole) continue;
      const Token = getTokenForRole(NormalizedAllowedRole);
      const User = getStoredUserForRole(NormalizedAllowedRole);
      if (Token && User && rolesMatch(User.role, allowedRoles)) {
        setActiveRole(NormalizedAllowedRole);
        const TargetRoute = PathRole && rolesMatch(PathRole, allowedRoles) ? currentFullRoute(pathname) || defaultRouteForRole(NormalizedAllowedRole) : defaultRouteForRole(NormalizedAllowedRole);
        if (TargetRoute.split("?")[0] !== pathname || (typeof window !== "undefined" && TargetRoute !== currentFullRoute(pathname))) router.replace(TargetRoute);
        else setReady(true);
        return;
      }
    }

    setReady(false);
    router.replace("/login");
  }, [router, pathname, roleKey]);

  return ready;
}
