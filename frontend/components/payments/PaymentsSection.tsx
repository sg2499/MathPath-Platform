"use client";

// 2026-10-08 (Payments Phase 4, Shailesh: "group them under one umbrella tab
// with sub tabs"): the Payments menu has five sections, each with its own
// sub-tabs, drawn here above the active tab's own content.
//
//   Payment Settings  Business Details · Centres · Document Numbering · Fee Setup · History
//   Invoices          All Invoices · Generate Invoices
//   Collections       Student Fees · Payments
//   Reports           Overview · Collections · Dues
//   Expenses          Expenses · Categories
//
// The tab is kept in the address (?tab=...), so refresh, back and shared
// links land on the same tab. Switching tabs gives a clean address (only
// ?tab=), so filters from one tab never leak into another.
import { AppShell } from "@/components/common/AppShell";
import { LoadingState } from "@/components/common/LoadingState";
import { getPaymentSettings } from "@/lib/api/payments";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, type ReactNode } from "react";

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
      <nav className="mb-6" aria-label={label}>
        <div role="tablist" aria-label={label} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
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
    </AppShell>
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
  return {
    business: Boolean(settings && !settings.business.registeredAddress),
    centres: Boolean(settings && settings.activeStudentsWithoutCentre > 0),
    numbering: Boolean(settings && settings.numbering.some((sequence) => !sequence.isConfigured)),
  };
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
