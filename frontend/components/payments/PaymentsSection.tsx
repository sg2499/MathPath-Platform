"use client";

// 2026-10-08 (Payments Phase 4, Shailesh: "group them under one umbrella tab
// with sub tabs"): the Payments menu has five sections, each with its own
// sub-tabs, drawn here above the active tab's own content.
//
//   Payment Settings  Business Details · Centres · Document Numbering · Fee Setup · Online Payments · History
//   Invoices          All Invoices · Generate Invoices
//   Collections       Student Fees · Payments · Online Payments
//   Reports           Overview · Collections · Dues
//   Expenses          Expenses · Categories
//
// The tab is kept in the address (?tab=...), so refresh, back and shared
// links land on the same tab. Switching tabs gives a clean address (only
// ?tab=), so filters from one tab never leak into another.
import { AppShell } from "@/components/common/AppShell";
import { LoadingState } from "@/components/common/LoadingState";
import { getBillingSettings, getOnlineSettings, getPaymentSettings } from "@/lib/api/payments";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";

import { CommandPalette, PaymentsSearchContext, useCommandPaletteShortcut } from "@/components/payments/CommandPalette";
import { FollowUpProvider } from "@/components/payments/FollowUp";
import { QuickPayProvider } from "@/components/payments/QuickPay";
import { StudentPanelProvider } from "@/components/payments/StudentPanel";

export type SectionTab<T extends string> = {
  key: T;
  label: string;
  short?: string;
  icon: ReactNode;
  flag?: boolean;
};

/** Keeps ?tab= when a tab changes other parts of the address. */
export function ReplaceAddressKeepingTab(params: Record<string, string | null | undefined>) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const tab = url.searchParams.get("tab");
  const next = new URLSearchParams();
  if (tab) next.set("tab", tab);
  Object.entries(params).forEach(([key, value]) => {
    if (value) next.set(key, value);
  });
  const query = next.toString();
  window.history.replaceState(null, "", `${url.pathname}${query ? `?${query}` : ""}`);
}

function SectionInner<T extends string>({
  title,
  label,
  tabs,
  fallback,
  render,
}: {
  title: string;
  label: string;
  tabs: SectionTab<T>[];
  fallback: T;
  render: (tab: T) => ReactNode;
}) {
  const searchParams = useSearchParams();
  const fromUrl = searchParams.get("tab");
  const tab = (tabs.some((item) => item.key === fromUrl) ? fromUrl : fallback) as T;

  const choose = useCallback((key: T) => {
    if (typeof window === "undefined") return;
    window.history.replaceState(null, "", `${window.location.pathname}?tab=${encodeURIComponent(key)}`);
  }, []);

  return (
    <AppShell title={title}>
      <PaymentsChrome>
      <nav className="mb-6" aria-label={label}>
        <div role="tablist" aria-label={label} className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
          {tabs.map((item) => {
            const selected = item.key === tab;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                id={`payments-tab-${item.key}`}
                aria-selected={selected}
                aria-controls="payments-tab-panel"
                onClick={() => choose(item.key)}
                className={`math-role-tab-button math-admin-tab-force inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-black transition ${selected ? "is-active math-admin-tab-force-selected" : ""}`}
              >
                {item.icon}
                {item.short ? (
                  <>
                    <span className="sm:hidden">{item.short}</span>
                    <span className="hidden sm:inline">{item.label}</span>
                  </>
                ) : (
                  <span>{item.label}</span>
                )}
                {item.flag ? <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-label="needs attention" /> : null}
              </button>
            );
          })}
        </div>
      </nav>
      {/* Keyed by tab: a tab's own address parameters (studentId, batchId ...)
          are read when it opens. */}
      <div role="tabpanel" id="payments-tab-panel" aria-labelledby={`payments-tab-${tab}`} key={tab}>
        {render(tab)}
      </div>
      </PaymentsChrome>
    </AppShell>
  );
}

// 2026-10-09 (revamp R1): every Payments page gets the student side panel
// and ⌘K search. The search bar sits inside each page's hero, under the
// title (Shailesh, 9 Oct: the page starts with its hero, search left-aligned).

export function PaymentsChrome({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  useCommandPaletteShortcut(show);
  return (
    <QuickPayProvider>
      <FollowUpProvider>
      <StudentPanelProvider>
        <PaymentsSearchContext.Provider value={show}>
          {children}
          <CommandPalette open={open} onClose={() => setOpen(false)} />
        </PaymentsSearchContext.Provider>
      </StudentPanelProvider>
      </FollowUpProvider>
    </QuickPayProvider>
  );
}


export function PaymentsSection<T extends string>(props: {
  title: string;
  label: string;
  tabs: SectionTab<T>[];
  fallback: T;
  render: (tab: T) => ReactNode;
}) {
  return (
    <Suspense fallback={<LoadingState label={`Loading ${props.title.toLowerCase()}...`} />}>
      <SectionInner {...props} />
    </Suspense>
  );
}

/** Amber dots on the Payment Settings tabs that need attention. */
export function useSettingsFlags() {
  const query = useQuery({ queryKey: ["admin", "payments", "settings"], queryFn: getPaymentSettings, staleTime: 30_000 });
  const settings = query.data;
  const online = useQuery({ queryKey: ["admin", "payments", "online-settings"], queryFn: getOnlineSettings, staleTime: 30_000 });
  return {
    // Switched on but not working (keys removed, numbering not set).
    online: Boolean(online.data && online.data.onlinePaymentsEnabled && !online.data.onlinePaymentsLive),
    business: Boolean(settings && !settings.business.registeredAddress),
    centres: Boolean(settings && settings.activeStudentsWithoutCentre > 0),
    numbering: Boolean(settings && settings.numbering.some((sequence) => !sequence.isConfigured)),
    billing: useBillingFlag(),
  };
}

/** Revamp R3: monthly billing needs attention (a fee not chosen for a mode). */
export function useBillingFlag(): boolean {
  const query = useQuery({ queryKey: ["admin", "payments", "billing", "settings"], queryFn: getBillingSettings, staleTime: 30_000 });
  return Boolean(query.data && query.data.problems.length > 0);
}

/** For the old addresses: send to the new section tab, keeping the rest of the address. */
export function RedirectToTab({ path, tab }: { path: string; tab: string }) {
  const router = useRouter();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete("tab");
    const rest = params.toString();
    router.replace(`${path}?tab=${encodeURIComponent(tab)}${rest ? `&${rest}` : ""}`);
  }, [router, path, tab]);
  return <LoadingState label="Opening…" />;
}
