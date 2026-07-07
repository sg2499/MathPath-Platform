import { CollectorVaultWorkspace } from "@/components/gamification/CollectorVaultWorkspace";
import { AppShell } from "@/components/common/AppShell";

export const metadata = {
  title: "Collector's Vault | MathPath",
  description: "View and open your collected gamification items",
};

export default function CollectorVaultPage() {
  return (
    <AppShell>
      <CollectorVaultWorkspace />
    </AppShell>
  );
}
