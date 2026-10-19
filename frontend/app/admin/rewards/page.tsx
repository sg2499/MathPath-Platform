"use client";

// 2026-10-18 (Rewards, Part 3): Users › Rewards.
import { Suspense } from "react";

import { AppShell } from "@/components/common/AppShell";
import { AdminRewardsPage } from "@/components/rewards/AdminRewards";
import { useProtectedPage } from "@/hooks/useProtectedPage";

function Page() {
  const Ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  if (!Ready) return null;
  return (
    <AppShell title="Rewards">
      <AdminRewardsPage />
    </AppShell>
  );
}

export default function AdminRewardsRoute() {
  return (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  );
}
