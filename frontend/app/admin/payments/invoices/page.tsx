"use client";

// 2026-10-08 (Payments Phase 4): Invoices section.
// 2026-10-09 (revamp R3): the Monthly Billing tab.
import { GenerateInvoicesPanel } from "@/components/payments/panels/GenerateInvoicesPanel";
import { InvoicesPanel } from "@/components/payments/panels/InvoicesPanel";
import { MonthlyBillingPanel } from "@/components/payments/panels/MonthlyBillingPanel";
import { PaymentsSection, useBillingFlag } from "@/components/payments/PaymentsSection";
import { CalendarClock, FilePlus2, FileText } from "lucide-react";

type Tab = "all" | "monthly" | "generate";

export default function InvoicesSectionPage() {
  const flags = { billing: useBillingFlag() };
  return (
    <PaymentsSection<Tab>
      title="Invoices"
      label="Invoices sections"
      fallback="all"
      tabs={[
        { key: "all", label: "All Invoices", icon: <FileText size={16} /> },
        { key: "monthly", label: "Monthly Billing", short: "Monthly", icon: <CalendarClock size={16} />, flag: flags.billing },
        { key: "generate", label: "Generate Invoices", short: "Generate", icon: <FilePlus2 size={16} /> },
      ]}
      render={(tab) => (tab === "generate" ? <GenerateInvoicesPanel /> : tab === "monthly" ? <MonthlyBillingPanel /> : <InvoicesPanel />)}
    />
  );
}
