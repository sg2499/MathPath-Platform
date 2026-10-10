"use client";

// 2026-10-09 (Payments revamp R6): Reports > Insights. How this month's
// billing is coming in and what is still to come, how long invoices take
// to be paid, anything unusual (large discounts, many cancellations by one
// person in a day, backdated payments) to review, six months of billing,
// collection and overdue, and the biggest dues.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, BarChart3, CalendarClock, Check, CheckCircle2, Clock3, ExternalLink, Loader2, RotateCcw, Settings2, ShieldAlert, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ErrorState } from "@/components/common/ErrorState";
import { ActivityTime } from "@/components/payments/Activity";
import { HeroSearch } from "@/components/payments/CommandPalette";
import { CompactRupees, useIsDarkMode } from "@/components/payments/panels/OverviewPanel";
import { usePaymentsToast } from "@/components/payments/PaymentsToast";
import { InlineError, PaymentsLoading, PaymentsMetric } from "@/components/payments/PaymentsUi";
import { StudentLink } from "@/components/payments/StudentPanel";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { getPaymentsInsights, getUnusualActivity, markUnusualReviewed, undoUnusualReviewed, type PaymentsInsights, type UnusualActivity, type UnusualItem, type UnusualKind } from "@/lib/api/payments";
import { FormatDate } from "@/lib/paymentsDates";

// The app's chart palette (see OverviewPanel): blue for money in; slate for
// what was billed; red for overdue; amber for what falls due this month.
const COLOURS = {
  billed: { light: "#94a3b8", dark: "#64748b" },
  collected: { light: "#2563eb", dark: "#3987e5" },
  overdue: { light: "#d03b3b", dark: "#f87171" },
  dueSoon: { light: "#f59e0b", dark: "#d97706" },
  later: { light: "#cbd5e1", dark: "#475569" },
};

const KIND_STYLE: Record<UnusualKind, string> = {
  DISCOUNT: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200",
  CANCELLATIONS: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200",
  BACKDATED: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
};

function Card({ title, icon, action, children, id }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="math-card flex h-full min-w-0 flex-col p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-black text-slate-950 dark:text-white">{icon}{title}</h2>
        {action}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

function Percent(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

export function InsightsPanel() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const query = useQuery({ queryKey: ["admin", "payments", "insights"], queryFn: () => getPaymentsInsights(), enabled: ready, refetchInterval: 120_000 });
  const data = query.data;
  if (!ready) return null;
  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="math-block-header"><BarChart3 size={14} />Reports</p>
            <h1 className="math-title">Insights</h1>
            <p className="math-subtitle">How this month&apos;s money is coming in, how long invoices take to be paid, and anything unusual to look at.</p>
            <HeroSearch />
          </div>
          {data ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:shrink-0">
              <PaymentsMetric label="Collected" value={<span className="text-lg sm:text-xl">{Percent(data.collection.rate)}</span>} icon={<TrendingUp size={14} />} tone="cyan" />
              <PaymentsMetric label="Days to pay" value={<span className="text-lg sm:text-xl">{data.collection.averageDaysToPay ?? "—"}</span>} icon={<Clock3 size={14} />} />
              <PaymentsMetric label="Overdue" value={<span className="text-lg sm:text-xl">{data.overdueNow.display}</span>} icon={<AlertTriangle size={14} />} tone={data.overdueNow.paise ? "amber" : "emerald"} />
              <PaymentsMetric label="To review" value={<span className="text-lg sm:text-xl">{data.unusual.openCount}</span>} icon={<ShieldAlert size={14} />} tone={data.unusual.openCount ? "amber" : "emerald"} />
            </div>
          ) : null}
        </div>
      </section>
      {query.isLoading ? (
        <div className="mt-6"><PaymentsLoading label="Loading insights…" variant="cards" /></div>
      ) : query.error || !data ? (
        <div className="mt-6"><ErrorState message="Insights could not be loaded. Refresh the page to try again." /></div>
      ) : (
        <InsightsBody data={data} />
      )}
    </>
  );
}

function InsightsBody({ data }: { data: PaymentsInsights }) {
  const dark = useIsDarkMode();
  const pick = (colour: { light: string; dark: string }) => (dark ? colour.dark : colour.light);
  const forecast = data.forecast;
  const parts = [
    { key: "collected", label: "Collected", value: forecast.collected, colour: pick(COLOURS.collected) },
    { key: "overdue", label: "Overdue", value: forecast.overdue, colour: pick(COLOURS.overdue) },
    { key: "soon", label: `Due by ${FormatDate(forecast.monthEnd).replace(/ \d{4}$/, "")}`, value: forecast.dueByMonthEnd, colour: pick(COLOURS.dueSoon) },
    { key: "later", label: "Due later", value: forecast.dueLater, colour: pick(COLOURS.later) },
  ];
  const whole = Math.max(1, parts.reduce((sum, part) => sum + part.value.paise, 0));
  const collection = data.collection;
  const chartData = data.months.map((month) => ({
    label: month.label,
    Billed: month.billed.paise / 100,
    Collected: month.collected.paise / 100,
    "Overdue at month end": month.overdue.paise / 100,
  }));
  const grid = dark ? "#334155" : "#e2e8f0";
  const axis = dark ? "#cbd5e1" : "#475569";
  const maxDue = Math.max(1, ...data.topDues.map((row) => row.due.paise));

  return (
    <>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title={`${data.thisMonthLabel} so far`} icon={<CalendarClock size={18} className="text-cyan-600 dark:text-cyan-400" />}>
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Still to come from this month&apos;s billing</p>
          <p className="mt-1 text-3xl font-black tabular-nums text-slate-950 dark:text-white">{forecast.stillToCome.display}</p>
          <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label={parts.map((part) => `${part.label} ${part.value.display}`).join(", ")}>
            {parts.map((part) => (part.value.paise ? <span key={part.key} className="h-full" style={{ width: `${(part.value.paise / whole) * 100}%`, background: part.colour }} /> : null))}
          </div>
          <ul className="mt-4 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            {parts.map((part) => (
              <li key={part.key} className="flex min-w-0 items-baseline gap-2 text-sm">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 self-start rounded-full" style={{ background: part.colour }} aria-hidden />
                <span className="min-w-0 flex-1 truncate font-bold text-slate-600 dark:text-slate-300">{part.label}</span>
                <span className="shrink-0 font-black tabular-nums text-slate-950 dark:text-white">{part.value.display}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
            Billed {forecast.billed.display} on {forecast.invoiceCount} invoice{forecast.invoiceCount === 1 ? "" : "s"} this month, after discounts. All money in this month, older dues included: {forecast.moneyInThisMonth.display}.
          </p>
        </Card>

        <Card title="Paying on time" icon={<Clock3 size={18} className="text-emerald-600 dark:text-emerald-400" />}>
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Average days from invoice to paid</p>
          <p className="mt-1 text-3xl font-black tabular-nums text-slate-950 dark:text-white">{collection.averageDaysToPay === null ? "—" : `${collection.averageDaysToPay} day${collection.averageDaysToPay === 1 ? "" : "s"}`}</p>
          <dl className="mt-4 grid gap-2.5 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="font-bold text-slate-600 dark:text-slate-300">Half are paid within</dt>
              <dd className="font-black tabular-nums text-slate-950 dark:text-white">{collection.medianDaysToPay === null ? "—" : `${collection.medianDaysToPay} day${collection.medianDaysToPay === 1 ? "" : "s"}`}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="font-bold text-slate-600 dark:text-slate-300">Paid by the due date</dt>
              <dd className="font-black tabular-nums text-slate-950 dark:text-white">{Percent(collection.onTimePercent)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-slate-200 pt-2.5 dark:border-slate-700">
              <dt className="font-bold text-slate-600 dark:text-slate-300">{data.thisMonthLabel} billing collected</dt>
              <dd className="font-black tabular-nums text-slate-950 dark:text-white">{Percent(collection.rate)}</dd>
            </div>
            {collection.previousLabel ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="font-bold text-slate-600 dark:text-slate-300">{collection.previousLabel} billing collected</dt>
                <dd className="font-black tabular-nums text-slate-950 dark:text-white">{Percent(collection.previousRate)}</dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-4 text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
            From the {collection.paidInvoices} invoice{collection.paidInvoices === 1 ? "" : "s"} fully paid in the last {collection.windowDays} days. Collected is the share of a month&apos;s billing (after discounts) that has been paid so far.
          </p>
        </Card>
      </div>

      <UnusualCard initial={data.unusual} />

      <div className="mt-6">
        <Card title="Last six months" icon={<BarChart3 size={18} className="text-cyan-600 dark:text-cyan-400" />}>
          <p className="-mt-2 mb-3 text-sm font-semibold text-slate-600 dark:text-slate-300">What each month billed, how much of it has come in, and how much was overdue at the end of the month.</p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: axis, fontSize: 12, fontWeight: 700 }} axisLine={{ stroke: grid }} tickLine={false} />
                <YAxis tick={{ fill: axis, fontSize: 12 }} axisLine={false} tickLine={false} width={56} tickFormatter={(value: number) => CompactRupees(value * 100)} />
                <Tooltip
                  cursor={{ fill: dark ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.05)" }}
                  contentStyle={{ background: dark ? "#0f172a" : "#ffffff", border: `1px solid ${grid}`, borderRadius: 12, color: dark ? "#f8fafc" : "#0f172a", fontWeight: 700 }}
                  formatter={(value) => `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                />
                <Legend wrapperStyle={{ color: axis, fontWeight: 700, fontSize: 12 }} />
                <Bar dataKey="Billed" fill={pick(COLOURS.billed)} radius={[6, 6, 0, 0]} maxBarSize={30} />
                <Bar dataKey="Collected" fill={pick(COLOURS.collected)} radius={[6, 6, 0, 0]} maxBarSize={30} />
                <Line type="monotone" dataKey="Overdue at month end" stroke={pick(COLOURS.overdue)} strokeWidth={2.5} dot={{ r: 3.5, fill: pick(COLOURS.overdue) }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] whitespace-nowrap text-sm">
              <thead>
                <tr className="text-left text-xs font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-3">Month</th>
                  <th className="py-2 pr-3 text-right">Billed</th>
                  <th className="py-2 pr-3 text-right">Collected</th>
                  <th className="py-2 pr-3 text-right">Rate</th>
                  <th className="py-2 pr-3 text-right">Days to pay</th>
                  <th className="py-2 text-right">Overdue at month end</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {[...data.months].reverse().map((month) => (
                  <tr key={month.month} className="tabular-nums">
                    <td className="py-2 pr-3 font-black text-slate-900 dark:text-white">{month.longLabel}</td>
                    <td className="py-2 pr-3 text-right font-semibold text-slate-700 dark:text-slate-200">{month.billed.display}</td>
                    <td className="py-2 pr-3 text-right font-semibold text-slate-700 dark:text-slate-200">{month.collected.display}</td>
                    <td className="py-2 pr-3 text-right font-black text-slate-900 dark:text-white">{Percent(month.rate)}</td>
                    <td className="py-2 pr-3 text-right font-semibold text-slate-700 dark:text-slate-200">{month.averageDaysToPay ?? "—"}</td>
                    <td className={`py-2 text-right font-black ${month.overdue.paise ? "text-rose-700 dark:text-rose-300" : "text-slate-500"}`}>{month.overdue.display}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <Card
          title="Biggest dues"
          icon={<Wallet size={18} className="text-rose-600 dark:text-rose-400" />}
          action={<Link href="/admin/payments/collections?tab=follow-ups" className="inline-flex items-center gap-1 text-sm font-black text-cyan-700 hover:underline dark:text-cyan-300">Follow-ups<ArrowRight size={14} /></Link>}
        >
          {data.topDues.length ? (
            <>
              <p className="-mt-2 mb-3 text-sm font-semibold text-slate-600 dark:text-slate-300">
                These {data.topDues.length} student{data.topDues.length === 1 ? " owes" : "s owe"} {data.topDuesShare ?? 0}% of everything due ({data.dueNow.display} from {data.studentsWithDues} student{data.studentsWithDues === 1 ? "" : "s"}).
              </p>
              <ol className="grid grid-cols-[minmax(0,1fr)] gap-x-8 xl:grid-cols-2">
                {data.topDues.map((row, index) => (
                  <li key={row.studentId} className="flex items-center gap-3 border-b border-slate-100 py-2.5 dark:border-slate-800">
                    <span className="w-5 shrink-0 text-right text-xs font-black tabular-nums text-slate-400">{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <StudentLink studentId={row.studentId} className="block truncate font-black text-slate-900 hover:underline dark:text-white">{row.studentName}{row.isActive ? "" : " (inactive)"}</StudentLink>
                      <span className="block truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {[row.studentCode, row.centreName, row.maxDaysOverdue ? `${row.maxDaysOverdue} day${row.maxDaysOverdue === 1 ? "" : "s"} overdue` : "Not yet due"].filter(Boolean).join(" · ")}
                      </span>
                      <span className="mt-1.5 block h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
                        <span className="block h-1.5 rounded-full" style={{ width: `${Math.max(3, (row.due.paise / maxDue) * 100)}%`, background: row.overdue.paise ? pick(COLOURS.overdue) : pick(COLOURS.dueSoon) }} />
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-black tabular-nums text-slate-950 dark:text-white">{row.due.display}</span>
                      {row.overdue.paise && row.overdue.paise !== row.due.paise ? <span className="block text-xs font-bold tabular-nums text-rose-700 dark:text-rose-300">{row.overdue.display} overdue</span> : null}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="grid min-h-[96px] place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">Nobody owes anything.</p>
          )}
        </Card>
      </div>
    </>
  );
}

function UnusualCard({ initial }: { initial: UnusualActivity }) {
  const [days, setDays] = useState(initial.days);
  const [view, setView] = useState<"OPEN" | "REVIEWED">("OPEN");
  const query = useQuery({
    queryKey: ["admin", "payments", "insights", "unusual", days],
    queryFn: () => getUnusualActivity(days),
    initialData: days === initial.days ? initial : undefined,
  });
  const data = query.data;
  const settings = (data ?? initial).settings;
  const items = (data?.items ?? []).filter((item) => (view === "OPEN" ? !item.reviewed : Boolean(item.reviewed)));
  return (
    <div className="mt-6" id="unusual">
      <Card
        title="Unusual activity"
        icon={<ShieldAlert size={18} className="text-violet-600 dark:text-violet-400" />}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Period" className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
              {initial.windows.map((value) => (
                <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-black transition ${days === value ? "bg-slate-900 text-white dark:bg-cyan-500 dark:text-slate-950" : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"}`}>
                  {value} days
                </button>
              ))}
            </div>
            <Link href="/admin/payments/settings?tab=insights" className="inline-flex items-center gap-1 rounded-2xl px-2 py-1.5 text-xs font-black text-cyan-700 hover:underline dark:text-cyan-300"><Settings2 size={13} />Limits</Link>
          </div>
        }
      >
        <p className="-mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
          Flagged: a discount over {settings.discountAmount.display} or {settings.discountPercent}% on one payment; {settings.cancellationsPerDay} or more cancellations by one person in a day; a payment dated more than {settings.backdatedDays} days before it was entered.
        </p>
        <div role="tablist" aria-label="Unusual activity" className="mt-4 grid grid-cols-2 gap-2 sm:inline-grid sm:grid-cols-[auto_auto]">
          {(["OPEN", "REVIEWED"] as const).map((key) => {
            const count = key === "OPEN" ? data?.openCount ?? 0 : data?.reviewedCount ?? 0;
            const active = view === key;
            return (
              <button key={key} type="button" role="tab" aria-selected={active} onClick={() => setView(key)}
                className={`math-role-tab-button math-admin-tab-force inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-black transition ${active ? "is-active math-admin-tab-force-selected" : ""}`}>
                {key === "OPEN" ? "To review" : "Reviewed"}<span className="tabular-nums opacity-80">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4">
          {query.isLoading && !data ? (
            <PaymentsLoading label="Loading unusual activity…" rows={3} />
          ) : query.error ? (
            <InlineError error={query.error} />
          ) : !items.length ? (
            <p className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
              <CheckCircle2 size={16} className="shrink-0" />
              {view === "OPEN" ? `Nothing unusual to review in the last ${days} days.` : `Nothing marked as reviewed in the last ${days} days.`}
            </p>
          ) : (
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">
              {items.map((item) => <UnusualRow key={item.key} item={item} />)}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

function UnusualRow({ item }: { item: UnusualItem }) {
  const queryClient = useQueryClient();
  const toast = usePaymentsToast();
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState("");
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "insights"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "home"] });
  };
  const undo = useMutation({ mutationFn: () => undoUnusualReviewed(item.key), onSuccess: refresh });
  const review = useMutation({
    mutationFn: () => markUnusualReviewed(item.key, note.trim() || null),
    onSuccess: () => {
      setNoting(false);
      setNote("");
      refresh();
      toast?.({ text: "Marked as reviewed. It stays under Reviewed.", action: { label: "Undo", run: () => undo.mutate() } });
    },
  });
  return (
    <li className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-black ${KIND_STYLE[item.kind]}`}>{item.kindLabel}</span>
          <p className="mt-1.5 font-black leading-snug text-slate-900 dark:text-white">{item.title}</p>
          <p className="mt-0.5 break-words text-sm font-semibold text-slate-600 dark:text-slate-300">{item.detail}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{item.actorName} · {ActivityTime(item.at, true)}</p>
          {item.reviewed ? (
            <p className="mt-2 inline-flex flex-wrap items-center gap-1 rounded-xl bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              <Check size={12} />Reviewed by {item.reviewed.byName ?? "someone"}{item.reviewed.at ? ` on ${ActivityTime(item.reviewed.at, true)}` : ""}{item.reviewed.note ? `: “${item.reviewed.note}”` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 lg:shrink-0 lg:justify-end">
          {item.href ? <Link href={item.href} className="math-button-secondary !px-3 !py-2 text-sm"><ExternalLink size={14} />Open</Link> : null}
          {item.reviewed ? (
            <button type="button" className="math-button-secondary !px-3 !py-2 text-sm" disabled={undo.isPending} onClick={() => undo.mutate()}>
              {undo.isPending ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}Back to review
            </button>
          ) : !noting ? (
            <button type="button" className="math-button-primary !px-3 !py-2 text-sm" onClick={() => setNoting(true)}><Check size={14} />Mark reviewed</button>
          ) : null}
        </div>
      </div>
      {noting && !item.reviewed ? (
        <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); review.mutate(); }}>
          <input className="math-input min-w-0 flex-1" value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} placeholder="Note (optional), e.g. sibling discount agreed" aria-label="Review note" autoFocus />
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button type="button" className="math-button-secondary justify-center" onClick={() => { setNoting(false); setNote(""); }}>Cancel</button>
            <button type="submit" className="math-button-primary justify-center" disabled={review.isPending}>{review.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}Save</button>
          </div>
        </form>
      ) : null}
      {review.error ? <div className="mt-2"><InlineError error={review.error} /></div> : null}
      {undo.error ? <div className="mt-2"><InlineError error={undo.error} /></div> : null}
    </li>
  );
}
