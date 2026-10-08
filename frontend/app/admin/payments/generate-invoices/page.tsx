"use client";

// 2026-10-08 (Payments Phase 4): this page is now a tab of a Payments
// section. The old address keeps working: it opens that tab, keeping any
// other parameters (studentId, pay, batchId ...).
import { RedirectToTab } from "@/components/payments/PaymentsSection";

export default function RedirectPage() {
  return <RedirectToTab path="/admin/payments/invoices" tab="generate" />;
}
