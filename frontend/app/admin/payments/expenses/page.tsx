"use client";

// 2026-10-08 (Payments Phase 4): Expenses section.
import { ExpenseCategoriesPanel } from "@/components/payments/panels/ExpenseCategoriesPanel";
import { ExpensesPanel } from "@/components/payments/panels/ExpensesPanel";
import { PaymentsSection } from "@/components/payments/PaymentsSection";
import { ReceiptText, Tags } from "lucide-react";

type Tab = "expenses" | "categories";

export default function ExpensesSectionPage() {
  return (
    <PaymentsSection<Tab>
      title="Expenses"
      label="Expenses sections"
      fallback="expenses"
      tabs={[
        { key: "expenses", label: "Expenses", icon: <ReceiptText size={16} /> },
        { key: "categories", label: "Categories", icon: <Tags size={16} /> },
      ]}
      render={(tab) => (tab === "categories" ? <ExpenseCategoriesPanel /> : <ExpensesPanel />)}
    />
  );
}
