"use client";

// 2026-10-09 (Payments revamp R1): /admin/payments opens Payments Home.
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { PaymentsLoading } from "@/components/payments/PaymentsUi";

export default function PaymentsIndexPage() {
  const router = useRouter();
  useEffect(() => router.replace("/admin/payments/home"), [router]);
  return <PaymentsLoading label="Opening Payments…" variant="page" />;
}
