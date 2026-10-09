"use client";

// 2026-10-08 (Payments Phase 4): Collections section.
// 2026-10-09 (Phase 5): the Online Payments tab.
// 2026-10-09 (revamp R2): the Day Close tab.
// 2026-10-09 (revamp R4): the Follow-ups tab.
import { DayClosePanel } from "@/components/payments/panels/DayClosePanel";
import { FollowUpsPanel } from "@/components/payments/panels/FollowUpsPanel";
import { OnlinePaymentsPanel } from "@/components/payments/panels/OnlinePaymentsPanel";
import { PaymentsPanel } from "@/components/payments/panels/PaymentsPanel";
import { StudentFeesPanel } from "@/components/payments/panels/StudentFeesPanel";
import { PaymentsSection } from "@/components/payments/PaymentsSection";
import { CalendarCheck, CreditCard, HandCoins, PhoneCall, UserRound } from "lucide-react";

type Tab = "student-fees" | "payments" | "follow-ups" | "online" | "day-close";

export default function CollectionsSectionPage() {
  return (
    <PaymentsSection<Tab>
      title="Collections"
      label="Collections sections"
      fallback="student-fees"
      tabs={[
        { key: "student-fees", label: "Student Fees", icon: <UserRound size={16} /> },
        { key: "payments", label: "Payments", icon: <HandCoins size={16} /> },
        { key: "follow-ups", label: "Follow-ups", icon: <PhoneCall size={16} /> },
        { key: "online", label: "Online Payments", short: "Online", icon: <CreditCard size={16} /> },
        { key: "day-close", label: "Day Close", icon: <CalendarCheck size={16} /> },
      ]}
      render={(tab) => (tab === "payments" ? <PaymentsPanel /> : tab === "online" ? <OnlinePaymentsPanel /> : tab === "day-close" ? <DayClosePanel /> : tab === "follow-ups" ? <FollowUpsPanel /> : <StudentFeesPanel />)}
    />
  );
}
