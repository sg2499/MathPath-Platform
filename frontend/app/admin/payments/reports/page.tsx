"use client";

// 2026-10-08 (Payments Phase 4): Reports section.
// 2026-10-09 (revamp R6): Insights and Activity tabs.
import { ActivityPanel } from "@/components/payments/panels/ActivityPanel";
import { CollectionsReportPanel } from "@/components/payments/panels/CollectionsReportPanel";
import { DuesPanel } from "@/components/payments/panels/DuesPanel";
import { InsightsPanel } from "@/components/payments/panels/InsightsPanel";
import { OverviewPanel } from "@/components/payments/panels/OverviewPanel";
import { PaymentsSection, useReportsFlags } from "@/components/payments/PaymentsSection";
import { AlertTriangle, BarChart3, HandCoins, History, Lightbulb } from "lucide-react";

type Tab = "overview" | "insights" | "collections" | "dues" | "activity";

export default function ReportsSectionPage() {
  const flags = useReportsFlags();
  return (
    <PaymentsSection<Tab>
      title="Reports"
      label="Reports sections"
      fallback="overview"
      tabs={[
        { key: "overview", label: "Overview", icon: <BarChart3 size={16} /> },
        { key: "insights", label: "Insights", icon: <Lightbulb size={16} />, flag: flags.unusual },
        { key: "collections", label: "Collections", icon: <HandCoins size={16} /> },
        { key: "dues", label: "Dues", icon: <AlertTriangle size={16} /> },
        { key: "activity", label: "Activity", icon: <History size={16} /> },
      ]}
      render={(tab) => (tab === "collections" ? <CollectionsReportPanel /> : tab === "dues" ? <DuesPanel /> : tab === "insights" ? <InsightsPanel /> : tab === "activity" ? <ActivityPanel /> : <OverviewPanel />)}
    />
  );
}
