"use client";

// 2026-10-08 (Payments Phase 4): Payment Settings section.
// 2026-10-09 (Phase 5): the Online Payments tab.
// 2026-10-09 (revamp R3): the Billing tab.
// 2026-10-09 (revamp R4): the Reminders tab.
import { BillingSettingsPanel } from "@/components/payments/panels/BillingSettingsPanel";
import { FeeSetupPanel } from "@/components/payments/panels/FeeSetupPanel";
import { OnlineSettingsPanel } from "@/components/payments/panels/OnlineSettingsPanel";
import { ReminderTemplatesPanel } from "@/components/payments/panels/ReminderTemplatesPanel";
import { SettingsPanel } from "@/components/payments/panels/SettingsPanel";
import { PaymentsSection, useSettingsFlags } from "@/components/payments/PaymentsSection";
import { BellRing, Building2, CalendarClock, CreditCard, FileDigit, History, MapPin, ReceiptText } from "lucide-react";

type Tab = "business" | "centres" | "numbering" | "fees" | "billing" | "reminders" | "online" | "history";

export default function PaymentSettingsSectionPage() {
  const flags = useSettingsFlags();
  return (
    <PaymentsSection<Tab>
      title="Payment Settings"
      label="Payment settings sections"
      fallback="business"
      tabs={[
        { key: "business", label: "Business Details", short: "Business", icon: <Building2 size={16} />, flag: flags.business },
        { key: "centres", label: "Centres", icon: <MapPin size={16} />, flag: flags.centres },
        { key: "numbering", label: "Document Numbering", short: "Numbering", icon: <FileDigit size={16} />, flag: flags.numbering },
        { key: "fees", label: "Fee Setup", icon: <ReceiptText size={16} /> },
        { key: "billing", label: "Billing", icon: <CalendarClock size={16} />, flag: flags.billing },
        { key: "reminders", label: "Reminders", icon: <BellRing size={16} /> },
        { key: "online", label: "Online Payments", short: "Online", icon: <CreditCard size={16} />, flag: flags.online },
        { key: "history", label: "History", icon: <History size={16} /> },
      ]}
      render={(tab) => (tab === "fees" ? <FeeSetupPanel /> : tab === "billing" ? <BillingSettingsPanel /> : tab === "reminders" ? <ReminderTemplatesPanel /> : tab === "online" ? <OnlineSettingsPanel /> : <SettingsPanel tab={tab} />)}
    />
  );
}
