"use client";

// 2026-10-08 (Payments Phase 4): Reports section.
import { CollectionsReportPanel } from "@/components/payments/panels/CollectionsReportPanel";
import { DuesPanel } from "@/components/payments/panels/DuesPanel";
import { OverviewPanel } from "@/components/payments/panels/OverviewPanel";
import { PaymentsSection } from "@/components/payments/PaymentsSection";
import { AlertTriangle, BarChart3, HandCoins } from "lucide-react";

type Tab = "overview" | "collections" | "dues";

export default function ReportsSectionPage() {
  return (
    <PaymentsSection<Tab>
      title="Reports"
      label="Reports sections"
      fallback="overview"
      tabs={[
        { key: "overview", label: "Overview", icon: <BarChart3 size={16} /> },
        { key: "collections", label: "Collections", icon: <HandCoins size={16} /> },
        { key: "dues", label: "Dues", icon: <AlertTriangle size={16} /> },
      ]}
      render={(tab) => (tab === "collections" ? <CollectionsReportPanel /> : tab === "dues" ? <DuesPanel /> : <OverviewPanel />)}
    />
  );
}
