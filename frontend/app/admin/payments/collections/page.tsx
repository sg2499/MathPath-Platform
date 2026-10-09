"use client";

// 2026-10-08 (Payments Phase 4): Collections section.
// 2026-10-09 (Phase 5): the Online Payments tab.
import { OnlinePaymentsPanel } from "@/components/payments/panels/OnlinePaymentsPanel";
import { PaymentsPanel } from "@/components/payments/panels/PaymentsPanel";
import { StudentFeesPanel } from "@/components/payments/panels/StudentFeesPanel";
import { PaymentsSection } from "@/components/payments/PaymentsSection";
import { CreditCard, HandCoins, UserRound } from "lucide-react";

type Tab = "student-fees" | "payments" | "online";

export default function CollectionsSectionPage() {
  return (
    <PaymentsSection<Tab>
      title="Collections"
      label="Collections sections"
      fallback="student-fees"
      tabs={[
        { key: "student-fees", label: "Student Fees", icon: <UserRound size={16} /> },
        { key: "payments", label: "Payments", icon: <HandCoins size={16} /> },
        { key: "online", label: "Online Payments", short: "Online", icon: <CreditCard size={16} /> },
      ]}
      render={(tab) => (tab === "payments" ? <PaymentsPanel /> : tab === "online" ? <OnlinePaymentsPanel /> : <StudentFeesPanel />)}
    />
  );
}
