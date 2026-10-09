import type { Metadata } from "next";
import type { ReactNode } from "react";

// 2026-10-09 (Payments Phase 5): parent pay links. Never indexed by search
// engines, and the address is never sent to other sites.
export const metadata: Metadata = {
  title: "Pay fees · Math Path",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function PayLayout({ children }: { children: ReactNode }) {
  return children;
}
