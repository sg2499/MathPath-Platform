"use client";

// 2026-10-08 (Payments Phase 4): Collections section.
import { PaymentsPanel } from "@/components/payments/panels/PaymentsPanel";
import { StudentFeesPanel } from "@/components/payments/panels/StudentFeesPanel";
import { PaymentsSection } from "@/components/payments/PaymentsSection";
import { HandCoins, UserRound } from "lucide-react";

type Tab = "student-fees" | "payments";

export default function CollectionsSectionPage() {
  return (
    <PaymentsSection<Tab>
      title="Collections"
      label="Collections sections"
      fallback="student-fees"
      tabs={[
        { key: "student-fees", label: "Student Fees", icon: <UserRound size={16} /> },
        { key: "payments", label: "Payments", icon: <HandCoins size={16} /> },
      ]}
      render={(tab) => (tab === "payments" ? <PaymentsPanel /> : <StudentFeesPanel />)}
    />
  );
}
