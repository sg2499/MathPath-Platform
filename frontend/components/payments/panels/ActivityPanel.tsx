"use client";

// 2026-10-09 (Payments revamp R6): Reports > Activity. Everything that
// happened in Payments -- payments, invoices, expenses, cancellations,
// day closes, settings -- who did it and when, newest first, by day. Runs
// of the same action (a batch of invoices) are one line. Filter by kind
// and by person; "Show more" goes further back.

import { useInfiniteQuery } from "@tanstack/react-query";
import { Ban, FileText, HandCoins, History, Loader2, Receipt, Settings2, Users } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { ErrorState } from "@/components/common/ErrorState";
import { ActivityDayKey, ActivityDayLabel, ActivityRow } from "@/components/payments/Activity";
import { HeroSearch } from "@/components/payments/CommandPalette";
import { ReplaceAddressKeepingTab } from "@/components/payments/PaymentsSection";
import { PaymentsLoading } from "@/components/payments/PaymentsUi";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { getPaymentsActivity, type ActivityItem, type ActivityType } from "@/lib/api/payments";

const TYPES: { key: ActivityType; label: string; icon: typeof History }[] = [
  { key: "ALL", label: "Everything", icon: History },
  { key: "PAYMENTS", label: "Payments", icon: HandCoins },
  { key: "INVOICES", label: "Invoices", icon: FileText },
  { key: "EXPENSES", label: "Expenses", icon: Receipt },
  { key: "CANCELLATIONS", label: "Cancellations", icon: Ban },
  { key: "SETTINGS", label: "Settings", icon: Settings2 },
];

export function ActivityPanel() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const params = useSearchParams();
  const fromUrl = (params.get("type") || "ALL").toUpperCase() as ActivityType;
  const [type, setType] = useState<ActivityType>(TYPES.some((item) => item.key === fromUrl) ? fromUrl : "ALL");
  const [person, setPerson] = useState<string>(params.get("person") || "");
  const query = useInfiniteQuery({
    queryKey: ["admin", "payments", "activity", type, person],
    queryFn: ({ pageParam }) => getPaymentsActivity({ type, person: person || null, before: pageParam, limit: 40 }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextBefore,
    enabled: ready,
  });
  const items = useMemo(() => (query.data?.pages ?? []).flatMap((page) => page.items), [query.data]);
  const people = query.data?.pages[0]?.people ?? [];
  const days = useMemo(() => {
    const groups: { key: string; items: ActivityItem[] }[] = [];
    for (const item of items) {
      const key = ActivityDayKey(item.at);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(item);
      else groups.push({ key, items: [item] });
    }
    return groups;
  }, [items]);

  const choose = (next: ActivityType, nextPerson = person) => {
    setType(next);
    setPerson(nextPerson);
    ReplaceAddressKeepingTab({ type: next === "ALL" ? null : next.toLowerCase(), person: nextPerson || null });
  };

  if (!ready) return null;
  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="relative z-10 min-w-0">
          <p className="math-block-header"><History size={14} />Reports</p>
          <h1 className="math-title">Activity</h1>
          <p className="math-subtitle">Everything that happened in Payments: who did what, and when. Newest first.</p>
          <HeroSearch />
        </div>
      </section>

      <section className="math-card mt-6 p-5 sm:p-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div role="tablist" aria-label="Kind of activity" className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {TYPES.map((item) => {
              const Icon = item.icon;
              const active = type === item.key;
              return (
                <button key={item.key} type="button" role="tab" aria-selected={active} onClick={() => choose(item.key)}
                  className={`math-role-tab-button math-admin-tab-force inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-black transition ${active ? "is-active math-admin-tab-force-selected" : ""}`}>
                  <Icon size={15} className="shrink-0" /><span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
          <label className="flex min-w-0 items-center gap-2 xl:w-64 xl:shrink-0">
            <Users size={16} className="shrink-0 text-slate-400" />
            <span className="sr-only">Person</span>
            <select className="math-input min-w-0 flex-1" value={person} onChange={(event) => choose(type, event.target.value)}>
              <option value="">Everyone</option>
              {people.map((row) => <option key={row.userId} value={row.userId}>{row.name}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-5">
          {query.isLoading ? (
            <PaymentsLoading label="Loading activity…" rows={6} />
          ) : query.error ? (
            <ErrorState message="Activity could not be loaded. Refresh the page to try again." />
          ) : !items.length ? (
            <p className="grid min-h-[120px] place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">
              {type === "ALL" && !person ? "Nothing has happened in Payments yet." : "Nothing matches these filters."}
            </p>
          ) : (
            <div className="grid gap-5">
              {days.map((day) => (
                <section key={day.key} aria-label={ActivityDayLabel(day.key)}>
                  <h2 className="mb-1 px-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{ActivityDayLabel(day.key)}</h2>
                  <ul className="grid grid-cols-[minmax(0,1fr)] divide-y divide-slate-100 dark:divide-slate-800/70">
                    {day.items.map((item) => <li key={item.id}><ActivityRow item={item} /></li>)}
                  </ul>
                </section>
              ))}
              {query.hasNextPage ? (
                <button type="button" className="math-button-secondary justify-self-center" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
                  {query.isFetchingNextPage ? <Loader2 size={16} className="animate-spin" /> : null}Show more
                </button>
              ) : (
                <p className="text-center text-xs font-semibold text-slate-400">That is everything{type !== "ALL" || person ? " for these filters" : ""}.</p>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
