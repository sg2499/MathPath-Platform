"use client";

import { getStoredUser, getToken } from "@/lib/auth";
import type { UserRole } from "@/types/auth";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export function useProtectedPage(allowedRoles: UserRole[]) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const roleKey = useMemo(() => allowedRoles.join("|"), [allowedRoles]);

  useEffect(() => {
    const token = getToken();
    const user = getStoredUser();
    if (!token || !user || !allowedRoles.includes(user.role)) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router, roleKey]);

  return ready;
}
