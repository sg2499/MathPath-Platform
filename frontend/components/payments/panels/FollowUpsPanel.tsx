"use client";

// 2026-10-09 (Payments revamp R4): Collections > Follow-ups. Everyone who
// owes money, most urgent first (overdue amount weighted by days overdue),
// with when they were last contacted, any promise to pay, and the reminder
// that fits. Log a contact or promise, copy or send a reminder in the app,
// call -- for one student, or tick several and do it for all of them.

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BellRing, CalendarCheck, CalendarX, Check, Clock3, MessageSquarePlus, Phone, Search, UserRoundX, Users, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ErrorState } from "@/components/common/ErrorState";
import { HeroSearch } from "@/components/payments/CommandPalette";
import { LastContactText, PromisePill, useFollowUp, type FollowUpTarget } from "@/components/payments/FollowUp";
import { ReplaceAddressKeepingTab } from "@/components/payments/PaymentsSection";
import { PaymentsMetric, PaymentsLoading } from "@/components/payments/PaymentsUi";
import { StudentLink } from "@/components/payments/StudentPanel";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { getFollowUps, type FollowUpStudent } from "@/lib/api/payments";

const VIEW_ICONS: Record<string, typeof Users> = { ALL: Users, OVERDUE: AlertTriangle, TODAY: CalendarCheck, MISSED: CalendarX, NEVER: UserRoundX, RECENT: Clock3 };

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function AgePill({ row }: { row: FollowUpStudent }) {
  if (row.maxDaysOverdue <= 0) return <span className="inline-flex whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">Not yet due</span>;
  const tone = row.maxDaysOverdue > 60 ? "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200" : row.maxDaysOverdue > 30 ? "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200" : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200";
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-black ${tone}`}>{row.maxDaysOverdue} day{row.maxDaysOverdue === 1 ? "" : "s"} overdue</span>;
}

function Target(row: FollowUpStudent): FollowUpTarget {
  return { studentId: row.studentId, studentName: row.studentName, suggestedTemplate: row.suggestedTemplate };
}

export function FollowUpsPanel() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const params = useSearchParams();
  const [view, setView] = useState((params.get("view") || "ALL").toUpperCase());
  const [text, setText] = useState("");
  const search = useDebounced(text.trim());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const followUp = useFollowUp();
  const query = useQuery({ queryKey: ["admin", "payments", "followups", "list", view, search], queryFn: () => getFollowUps({ view, search }), enabled: ready });
  const data = query.data;
  const rows = useMemo(() => data?.students ?? [], [data]);
  useEffect(() => setSelected(new Set()), [view, search]);
  const chooseView = (next: string) => {
    setView(next);
    ReplaceAddressKeepingTab({ view: next === "ALL" ? null : next.toLowerCase() });
  };
  const chosen = rows.filter((row) => selected.has(row.studentId));
  const allTicked = rows.length > 0 && rows.every((row) => selected.has(row.studentId));
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const counts = Object.fromEntries((data?.views ?? []).map((item) => [item.key, item.count]));

  if (!ready) return null;
  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="math-block-header"><Users size={14} />Collections</p>
            <h1 className="math-title">Follow-ups</h1>
            <p className="math-subtitle">Everyone who owes money, most urgent first. Log calls and promises, and send reminders in the app.</p>
            <HeroSearch />
          </div>
          {data ? (
            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-3 xl:shrink-0">
              <PaymentsMetric label="Owing" value={counts.ALL ?? 0} icon={<Users size={14} />} tone="cyan" />
              <PaymentsMetric label="Promised today" value={counts.TODAY ?? 0} icon={<CalendarCheck size={14} />} tone={counts.TODAY ? "amber" : "slate"} />
              <PaymentsMetric label="Missed" value={counts.MISSED ?? 0} icon={<CalendarX size={14} />} tone={counts.MISSED ? "amber" : "slate"} />
            </div>
          ) : null}
        </div>
      </section>

      <section className="math-card mt-6 p-5 sm:p-6">
        <div role="tablist" aria-label="Follow-up views" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {(data?.views ?? []).map((item) => {
            const Icon = VIEW_ICONS[item.key] ?? Users;
            const active = view === item.key;
            return (
              <button key={item.key} type="button" role="tab" aria-selected={active} onClick={() => chooseView(item.key)}
                className={`math-role-tab-button math-admin-tab-force flex min-h-[3.25rem] min-w-0 flex-col items-start justify-center rounded-2xl px-3 py-2 text-left text-[13px] font-black leading-tight transition sm:px-4 sm:text-sm ${active ? "is-active math-admin-tab-force-selected" : ""}`}>
                <span className="flex min-w-0 items-center gap-2"><Icon size={14} className="shrink-0" /><span className="min-w-0">{item.label}</span></span>
                <span className="mt-0.5 pl-[22px] text-xs tabular-nums opacity-80">{item.count}</span>
              </button>
            );
          })}
        </div>

        <label className="relative mt-4 block">
          <span className="sr-only">Search follow-ups</span>
          <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="math-input pl-11" value={text} onChange={(event) => setText(event.target.value)} placeholder="Student, parent or mobile" />
        </label>

        <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900/60 sm:flex-row sm:items-center">
          <label className="inline-flex items-center gap-2 text-sm font-black text-slate-700 dark:text-slate-200 sm:mr-auto">
            <input type="checkbox" className="h-4 w-4 accent-cyan-600" checked={allTicked} disabled={!rows.length} onChange={() => setSelected(allTicked ? new Set() : new Set(rows.map((row) => row.studentId)))} />
            {selected.size ? `${selected.size} selected` : "Select all shown"}
            {selected.size ? <button type="button" className="ml-1 inline-flex items-center gap-1 text-xs font-black text-slate-500 hover:underline" onClick={() => setSelected(new Set())}><X size={12} />Clear</button> : null}
          </label>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button type="button" className="math-button-secondary justify-center" disabled={!chosen.length || !followUp} onClick={() => followUp?.logContact(chosen.map(Target))}><MessageSquarePlus size={16} />Log contact</button>
            <button type="button" className="math-button-primary justify-center" disabled={!chosen.length || !followUp || !data?.inAppAvailable} onClick={() => followUp?.remindMany(chosen.map(Target))}><BellRing size={16} />Remind in app</button>
          </div>
        </div>
        {data && !data.inAppAvailable ? <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Remind in app needs &quot;Show fees to students&quot; switched on (Payment Settings › Online Payments).</p> : null}

        {query.isLoading ? (
          <div className="mt-4"><PaymentsLoading label="Loading follow-ups…" /></div>
        ) : query.error || !data ? (
          <div className="mt-4"><ErrorState message="Follow-ups could not be loaded. Refresh the page to try again." /></div>
        ) : rows.length === 0 ? (
          <p className="mt-4 grid min-h-[120px] place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">
            {view === "ALL" && !search ? "Nobody owes anything. Nothing to follow up." : "Nobody here right now."}
          </p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {rows.map((row) => (
              <li key={row.studentId} className={`rounded-3xl border p-4 transition ${selected.has(row.studentId) ? "border-cyan-300 bg-cyan-50/50 dark:border-cyan-800 dark:bg-cyan-950/20" : "border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-950/50"}`}>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-cyan-600" checked={selected.has(row.studentId)} onChange={() => toggle(row.studentId)} aria-label={`Select ${row.studentName}`} />
                    <div className="min-w-0">
                      <StudentLink studentId={row.studentId} className="font-black text-slate-900 hover:underline dark:text-white">{row.studentName}</StudentLink>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{[row.studentCode, row.levelCode, row.centreName, row.parentName, row.mobile].filter(Boolean).join(" · ")}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <AgePill row={row} />
                        <PromisePill state={row.followUp} />
                        {row.followUp.remindedRecently ? <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-violet-100 px-2.5 py-1 text-xs font-black text-violet-800 dark:bg-violet-950/40 dark:text-violet-200"><Check size={12} />Reminded today</span> : null}
                      </div>
                      <p className="mt-1.5 text-xs font-semibold"><LastContactText state={row.followUp} /></p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-7 xl:shrink-0 xl:flex-nowrap xl:justify-end xl:pl-0">
                    <span className="mr-1 text-right">
                      <span className="block text-xl font-black tabular-nums text-slate-950 dark:text-white">{row.dueDisplay}</span>
                      {row.overduePaise && row.overduePaise !== row.duePaise ? <span className="block text-xs font-bold tabular-nums text-rose-700 dark:text-rose-300">{row.overdueDisplay} overdue</span> : null}
                    </span>
                    <button type="button" className="math-role-action-button h-9 px-3 text-xs" onClick={() => followUp?.logContact([Target(row)])}><MessageSquarePlus size={13} />Log</button>
                    <button type="button" className="math-role-action-button h-9 px-3 text-xs" onClick={() => followUp?.reminder(Target(row), data.inAppAvailable)}><BellRing size={13} />Reminder</button>
                    {row.mobile ? <a href={`tel:${row.mobile.replace(/[^\d+]/g, "")}`} className="math-role-action-button h-9 px-3 text-xs"><Phone size={13} />Call</a> : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
