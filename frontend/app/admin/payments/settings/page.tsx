"use client";

// 2026-10-08 (Payments Phase 4): Payment Settings section.
import { FeeSetupPanel } from "@/components/payments/panels/FeeSetupPanel";
import { SettingsPanel } from "@/components/payments/panels/SettingsPanel";
import { PaymentsSection, useSettingsFlags } from "@/components/payments/PaymentsSection";
import { Building2, FileDigit, History, MapPin, ReceiptText } from "lucide-react";

type Tab = "business" | "centres" | "numbering" | "fees" | "history";

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
        { key: "history", label: "History", icon: <History size={16} /> },
      ]}
      render={(tab) => (tab === "fees" ? <FeeSetupPanel /> : <SettingsPanel tab={tab} />)}
    />
  );
}
