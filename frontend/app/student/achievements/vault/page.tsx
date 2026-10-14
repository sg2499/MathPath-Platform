import { CollectorVaultWorkspace } from "@/components/gamification/CollectorVaultWorkspace";
import { BackButton } from "@/components/student/BackButton";
import { AppShell } from "@/components/common/AppShell";
import { Suspense } from "react";

export const metadata = {
  title: "Collector's Vault | MathPath",
  description: "View and open your collected gamification items",
};

export default function CollectorVaultPage() {
  return (
    <AppShell>
      <BackButton href="/student/achievements" />
      <Suspense fallback={null}>
        <CollectorVaultWorkspace />
      </Suspense>
    </AppShell>
  );
}
