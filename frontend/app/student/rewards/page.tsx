"use client";

// 2026-10-18 (Rewards, Part 2): Achievements › Reward Store.
import { Suspense } from "react";

import { AppShell } from "@/components/common/AppShell";
import { RewardStorePage } from "@/components/rewards/RewardStore";
import { useProtectedPage } from "@/hooks/useProtectedPage";

function Page() {
  const Ready = useProtectedPage(["STUDENT"]);
  if (!Ready) return null;
  return (
    <AppShell>
      <RewardStorePage />
    </AppShell>
  );
}

export default function StudentRewardsPage() {
  return (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  );
}
