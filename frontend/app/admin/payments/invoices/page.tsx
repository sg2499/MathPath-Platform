"use client";

// 2026-10-08 (Payments Phase 4): Invoices section.
// 2026-10-09 (revamp R3): the Monthly Billing tab.
// 2026-11-27 (billing Release 2): New Invoice (several lines, discounts,
// stock, payment) and New Admission.
import { GenerateInvoicesPanel } from "@/components/payments/panels/GenerateInvoicesPanel";
import { InvoicesPanel } from "@/components/payments/panels/InvoicesPanel";
import { MonthlyBillingPanel } from "@/components/payments/panels/MonthlyBillingPanel";
import { NewInvoicePanel } from "@/components/payments/panels/NewInvoicePanel";
import { PaymentsSection, useBillingFlag } from "@/components/payments/PaymentsSection";
import { CalendarClock, FilePlus2, FileText, GraduationCap, Layers } from "lucide-react";

type Tab = "all" | "new" | "admission" | "monthly" | "generate";

export default function InvoicesSectionPage() {
  const flags = { billing: useBillingFlag() };
  return (
    <PaymentsSection<Tab>
      title="Invoices"
      label="Invoices Sections"
      fallback="all"
      tabs={[
        { key: "all", label: "All Invoices", icon: <FileText size={16} /> },
        { key: "new", label: "New Invoice", short: "New", icon: <FilePlus2 size={16} /> },
        { key: "admission", label: "New Admission", short: "Admission", icon: <GraduationCap size={16} /> },
        { key: "monthly", label: "Monthly Billing", short: "Monthly", icon: <CalendarClock size={16} />, flag: flags.billing },
        { key: "generate", label: "Generate Invoices", short: "Generate", icon: <Layers size={16} /> },
      ]}
      render={(tab) =>
        tab === "generate" ? <GenerateInvoicesPanel /> :
        tab === "monthly" ? <MonthlyBillingPanel /> :
        tab === "new" ? <NewInvoicePanel key="new" mode="invoice" /> :
        tab === "admission" ? <NewInvoicePanel key="admission" mode="admission" /> :
        <InvoicesPanel />
      }
    />
  );
}
