"use client";

// 2026-10-08 (Payments Phase 4): Reports > Collections -- money received in a
// period, by method, by staff and by day, with every payment, a summary PDF
// (the day-close sheet for a single day) and Excel. Counts the money that
// came in by each method, from payments that are not cancelled.
import { HeroSearch } from "@/components/payments/CommandPalette";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { InlineError, PaymentsMetric, PaymentsLoading } from "@/components/payments/PaymentsUi";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import {
  COUNTER_METHODS,
  downloadCollectionsExcel,
  downloadCollectionsPdf,
  getCollectionsReport,
  getPaymentSettings,
  listPaymentStaff,
  saveBlob,
  type CollectionFilters,
} from "@/lib/api/payments";
import { AddDays, FormatDate, MonthEnd, MonthStart, TodayInIndia, WeekStart } from "@/lib/paymentsDates";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { BarChart3, CalendarDays, Download, FileSpreadsheet, HandCoins, Loader2, Tag, UsersRound } from "lucide-react";
import Link from "next/link";
import { StudentLink } from "@/components/payments/StudentPanel";
import { useMemo, useState } from "react";

type Preset = "today" | "yesterday" | "week" | "month" | "lastMonth" | "custom";

function Range(preset: Preset, today: string): [string, string] {
  switch (preset) {
    case "yesterday":
      return [AddDays(today, -1), AddDays(today, -1)];
    case "week":
      return [WeekStart(today), today];
    case "month":
      return [MonthStart(today), today];
    case "lastMonth": {
      const start = MonthStart(today, 1);
      return [start, MonthEnd(start)];
    }
    default:
      return [today, today];
  }
}

const PRESETS: [Preset, string][] = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["week", "This week"],
  ["month", "This month"],
  ["lastMonth", "Last month"],
  ["custom", "Custom"],
];

export function CollectionsReportPanel() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const today = TodayInIndia();
  const [preset, setPreset] = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [method, setMethod] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [centreId, setCentreId] = useState("");
  const [from, to] = preset === "custom" ? [customFrom, customTo < customFrom ? customFrom : customTo] : Range(preset, today);
  const filters: CollectionFilters = useMemo(() => ({ dateFrom: from, dateTo: to, method, receivedBy, centreId }), [from, to, method, receivedBy, centreId]);

  const query = useQuery({ queryKey: ["admin", "payments", "collections-report", filters], queryFn: () => getCollectionsReport(filters), enabled: ready && Boolean(from && to), placeholderData: keepPreviousData });
  const staffQuery = useQuery({ queryKey: ["admin", "payments", "staff"], queryFn: listPaymentStaff, enabled: ready });
  const settingsQuery = useQuery({ queryKey: ["admin", "payments", "settings"], queryFn: getPaymentSettings, enabled: ready });
  const data = query.data;
  const singleDay = from === to;
  const pdf = useMutation({ mutationFn: () => downloadCollectionsPdf(filters), onSuccess: (blob) => saveBlob(blob, `MathPath-${singleDay ? "Day-Close" : "Collections"}-${from}${singleDay ? "" : `-to-${to}`}.pdf`) });
  const excel = useMutation({ mutationFn: () => downloadCollectionsExcel(filters), onSuccess: (blob) => saveBlob(blob, `MathPath-Collections-${from}${singleDay ? "" : `-to-${to}`}.xlsx`) });

  if (!ready) return null;
  const periodText = singleDay ? FormatDate(from) : `${FormatDate(from)} to ${FormatDate(to)}`;

  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="math-block-header"><BarChart3 size={14} />Reports</p>
            <h1 className="math-title">Collections</h1>
            <p className="math-subtitle">Money received for {periodText}, by method, staff and day. Cancelled payments are left out.</p>
            <HeroSearch />
          </div>
          {data ? (
            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-3 xl:shrink-0">
              <PaymentsMetric label="Received" value={<span className="text-lg sm:text-xl">{data.total.display}</span>} icon={<HandCoins size={14} />} tone="emerald" />
              <PaymentsMetric label="Payments" value={data.paymentCount} icon={<CalendarDays size={14} />} tone="cyan" />
              <PaymentsMetric label="Discount" value={<span className="text-lg sm:text-xl">{data.discount.display}</span>} icon={<Tag size={14} />} />
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-6 math-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div role="tablist" aria-label="Period" className="flex flex-wrap gap-2">
            {PRESETS.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={preset === key} onClick={() => setPreset(key)} className={`math-role-tab-button math-admin-tab-force rounded-2xl px-4 py-2 text-sm font-black transition ${preset === key ? "is-active math-admin-tab-force-selected" : ""}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="math-button-primary whitespace-nowrap" disabled={pdf.isPending || !data} onClick={() => pdf.mutate()}>
              {pdf.isPending ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}{singleDay ? "Day-close PDF" : "Summary PDF"}
            </button>
            <button type="button" className="math-button-secondary whitespace-nowrap" disabled={excel.isPending || !data?.paymentCount} onClick={() => excel.mutate()}>
              {excel.isPending ? <Loader2 size={17} className="animate-spin" /> : <FileSpreadsheet size={17} />}Excel
            </button>
          </div>
        </div>

        <div className="mt-4 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {preset === "custom" ? (
            <fieldset className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1">
              <legend className="mb-1 block text-xs font-black text-slate-500 dark:text-slate-400">From / to</legend>
              <input type="date" className="math-input px-3" value={customFrom} max={today} onChange={(event) => setCustomFrom(event.target.value || today)} aria-label="From" />
              <input type="date" className="math-input px-3" value={customTo} min={customFrom} max={today} onChange={(event) => setCustomTo(event.target.value || today)} aria-label="To" />
            </fieldset>
          ) : null}
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500 dark:text-slate-400">Method</span>
            <select className="math-input" value={method} onChange={(event) => setMethod(event.target.value)}>
              <option value="">All methods</option>
              {COUNTER_METHODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              <option value="RAZORPAY">Razorpay</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500 dark:text-slate-400">Received by</span>
            <select className="math-input" value={receivedBy} onChange={(event) => setReceivedBy(event.target.value)}>
              <option value="">Anyone</option>
              {(staffQuery.data?.staff ?? []).map((person) => <option key={person.userId} value={person.userId}>{person.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500 dark:text-slate-400">Centre</span>
            <select className="math-input" value={centreId} onChange={(event) => setCentreId(event.target.value)}>
              <option value="">All centres</option>
              {(settingsQuery.data?.centres ?? []).map((centre) => <option key={centre.centreId} value={centre.centreId}>{centre.name}</option>)}
              <option value="NONE">No centre set</option>
            </select>
          </label>
        </div>
        {pdf.error || excel.error ? <div className="mt-4"><InlineError error={pdf.error || excel.error} /></div> : null}
      </section>

      {query.isLoading ? (
        <div className="mt-6"><PaymentsLoading label="Loading collections..." variant="cards" /></div>
      ) : query.error ? (
        <div className="mt-6"><InlineError error={query.error} /></div>
      ) : !data ? (
        <div className="mt-6"><ErrorState message="Collections could not be loaded." /></div>
      ) : !data.paymentCount ? (
        <div className="mt-6"><EmptyState title="Nothing received" description={`No payments for ${periodText}${method || receivedBy || centreId ? " with these filters" : ""}.`} /></div>
      ) : (
        <>
          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {data.byMethod.map((row) => (
              <div key={row.method} className="math-card p-4">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{row.methodLabel}</p>
                <p className="mt-1 text-xl font-black tabular-nums text-slate-950 dark:text-white">{row.display}</p>
              </div>
            ))}
            <div className="math-card p-4 ring-2 ring-emerald-400/50">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">Total</p>
              <p className="mt-1 text-xl font-black tabular-nums text-slate-950 dark:text-white">{data.total.display}</p>
            </div>
          </section>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <section className="math-card p-5 sm:p-6">
              <p className="math-block-header"><UsersRound size={14} />By staff</p>
              <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
                {data.byStaff.map((row) => (
                  <li key={row.userId ?? row.name} className="py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-black text-slate-900 dark:text-white">{row.name}</span>
                      <span className="font-black tabular-nums text-slate-950 dark:text-white">{row.display}</span>
                    </div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {row.paymentCount} {row.paymentCount === 1 ? "payment" : "payments"} · {row.byMethod.map((m) => `${m.methodLabel} ${m.display}`).join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
            {!singleDay ? (
              <section className="math-card p-5 sm:p-6">
                <p className="math-block-header"><CalendarDays size={14} />By day</p>
                <div className="mt-2 max-h-80 overflow-y-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                        <th className="px-2 py-2">Date</th>
                        <th className="px-2 py-2 text-right">Payments</th>
                        <th className="px-2 py-2 text-right">Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byDay.map((row) => (
                        <tr key={row.date} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="px-2 py-2 font-bold text-slate-800 dark:text-slate-100">{FormatDate(row.date)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{row.paymentCount}</td>
                          <td className="px-2 py-2 text-right font-black tabular-nums">{row.display}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </div>

          <section className="mt-6 math-card p-5 sm:p-6">
            <p className="math-block-header"><HandCoins size={14} />Payments</p>
            {data.paymentsTruncated ? <p className="text-xs font-bold text-amber-700 dark:text-amber-300">Showing the latest 1,000. The Excel has every payment.</p> : null}
            <ul className="mt-2 grid gap-2 md:hidden">
              {data.payments.map((payment) => (
                <li key={payment.paymentId} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex items-baseline justify-between gap-3">
                    <StudentLink studentId={payment.studentId} className="min-w-0 truncate font-black text-slate-900 dark:text-white">{payment.studentName}</StudentLink>
                    <span className="shrink-0 font-black tabular-nums">{payment.inFilterDisplay}</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-500">{payment.receiptNumber} · {FormatDate(payment.paymentDate)} · {payment.methodSummary}</p>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Receipt</th>
                    <th className="px-2 py-2">Student</th>
                    <th className="px-2 py-2">Paid with</th>
                    <th className="px-2 py-2">Received by</th>
                    <th className="px-2 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((payment) => (
                    <tr key={payment.paymentId} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="whitespace-nowrap px-2 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300">{FormatDate(payment.paymentDate)}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 font-black tabular-nums">{payment.receiptNumber}</td>
                      <td className="max-w-[220px] truncate px-2 py-2.5">
                        <StudentLink studentId={payment.studentId} className="font-bold text-slate-900 hover:underline dark:text-white">{payment.studentName}</StudentLink>
                      </td>
                      <td className="px-2 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300">{payment.methodSummary}</td>
                      <td className="px-2 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300">{payment.receivedByName ?? "—"}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right font-black tabular-nums">{payment.inFilterDisplay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
