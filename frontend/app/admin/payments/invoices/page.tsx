"use client";

// 2026-10-08 (Payments Phase 4): Invoices section.
import { GenerateInvoicesPanel } from "@/components/payments/panels/GenerateInvoicesPanel";
import { InvoicesPanel } from "@/components/payments/panels/InvoicesPanel";
import { PaymentsSection } from "@/components/payments/PaymentsSection";
import { FilePlus2, FileText } from "lucide-react";

type Tab = "all" | "generate";

export default function InvoicesSectionPage() {
  return (
    <PaymentsSection<Tab>
      title="Invoices"
      label="Invoices sections"
      fallback="all"
      tabs={[
        { key: "all", label: "All Invoices", icon: <FileText size={16} /> },
        { key: "generate", label: "Generate Invoices", short: "Generate", icon: <FilePlus2 size={16} /> },
      ]}
      render={(tab) => (tab === "generate" ? <GenerateInvoicesPanel /> : <InvoicesPanel />)}
    />
  );
}
