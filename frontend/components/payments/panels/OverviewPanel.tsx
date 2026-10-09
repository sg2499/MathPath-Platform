"use client";

// 2026-10-08 (Payments Phase 4): Reports > Overview -- money in today and
// this month, money spent, what is due and how old it is, advance held,
// six months of collections against spending, and the latest payments.
import { HeroSearch } from "@/components/payments/CommandPalette";
import { RecordPaymentButton } from "@/components/payments/QuickPay";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PaymentStatusChip } from "@/components/payments/PaymentDetail";
import { InlineError, PaymentsMetric } from "@/components/payments/PaymentsUi";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { downloadCollectionsPdf, getPaymentsOverview, saveBlob, type DuesBucketKey } from "@/lib/api/payments";
import { FormatDate } from "@/lib/paymentsDates";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, CalendarDays, Download, FilePlus2, HandCoins, Loader2, PiggyBank, ReceiptText, Wallet } from "lucide-react";
import Link from "next/link";
import { StudentLink } from "@/components/payments/StudentPanel";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// The app's chart palette (validated for colour-blind separation, see
// AnnualCompetitionAnalyticsCharts.tsx): blue for money in, amber for spent.
const IN_COLOUR = { light: "#2563eb", dark: "#3987e5" };
const OUT_COLOUR = { light: "#f59e0b", dark: "#d97706" };
export const BUCKET_COLOURS: Record<DuesBucketKey, string> = {
  NOT_DUE: "#94a3b8",
  D0_30: "#fab219",
  D31_60: "#ec835a",
  D61_90: "#d03b3b",
  D90_PLUS: "#9f1239",
};

function useIsDarkMode(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () => setDark(document.documentElement.classList.contains("dark"));
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

function CompactRupees(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 1_00_00_000) return `₹${(rupees / 1_00_00_000).toFixed(1)}Cr`;
  if (rupees >= 1_00_000) return `₹${(rupees / 1_00_000).toFixed(1)}L`;
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(rupees >= 10_000 ? 0 : 1)}k`;
  return `₹${Math.round(rupees)}`;
}

export function OverviewPanel() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const dark = useIsDarkMode();
  const query = useQuery({ queryKey: ["admin", "payments", "overview"], queryFn: getPaymentsOverview, enabled: ready, refetchInterval: 60_000 });
  const data = query.data;
  const dayClose = useMutation({
    mutationFn: (day: string) => downloadCollectionsPdf({ dateFrom: day, dateTo: day }),
    onSuccess: (blob, day) => saveBlob(blob, `MathPath-Day-Close-${day}.pdf`),
  });

  if (!ready) return null;
  const maxBucket = Math.max(1, ...(data?.buckets ?? []).map((row) => row.paise));
  const change = data && data.lastMonthCollected.paise ? Math.round(((data.thisMonthCollected.paise - data.lastMonthCollected.paise) / data.lastMonthCollected.paise) * 100) : null;
  const chartData = (data?.series ?? []).map((row) => ({ label: row.label, Collected: row.collected.paise / 100, Spent: row.spent.paise / 100 }));
  const grid = dark ? "#334155" : "#e2e8f0";
  const axis = dark ? "#cbd5e1" : "#475569";

  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="math-block-header"><BarChart3 size={14} />Reports</p>
            <h1 className="math-title">Overview</h1>
            <p className="math-subtitle">Money in, money out, and what is still due{data ? `, as of ${FormatDate(data.today)}` : ""}.</p>
            <HeroSearch />
          </div>
          {data ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:shrink-0">
              <PaymentsMetric label="Today" value={<span className="text-lg sm:text-xl">{data.todayCollected.display}</span>} icon={<HandCoins size={14} />} tone="emerald" />
              <PaymentsMetric label="This month" value={<span className="text-lg sm:text-xl">{data.thisMonthCollected.display}</span>} icon={<CalendarDays size={14} />} tone="cyan" />
              <PaymentsMetric label="Due" value={<span className="text-lg sm:text-xl">{data.due.display}</span>} icon={<Wallet size={14} />} tone={data.due.paise ? "amber" : "emerald"} />
              <PaymentsMetric label="Advance held" value={<span className="text-lg sm:text-xl">{data.advanceHeld.display}</span>} icon={<PiggyBank size={14} />} />
            </div>
          ) : null}
        </div>
      </section>

      {query.isLoading ? (
        <div className="mt-6"><LoadingState label="Loading the overview..." /></div>
      ) : query.error || !data ? (
        <div className="mt-6"><ErrorState message="The overview could not be loaded. Refresh the page to try again." /></div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-2">
            <RecordPaymentButton className="math-button-primary" />
            <Link href="/admin/payments/invoices?tab=generate" className="math-button-secondary"><FilePlus2 size={17} />Generate Invoices</Link>
            <Link href="/admin/payments/reports?tab=dues" className="math-button-secondary"><AlertTriangle size={17} />Dues</Link>
            <Link href="/admin/payments/expenses?tab=expenses&add=1" className="math-button-secondary"><ReceiptText size={17} />Add Expense</Link>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <section className="math-card p-5 sm:p-6">
              <p className="math-block-header"><HandCoins size={14} />Today</p>
              <h2 className="text-3xl font-black tabular-nums text-slate-950 dark:text-white">{data.todayCollected.display}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">{data.todayPaymentCount} {data.todayPaymentCount === 1 ? "payment" : "payments"} received</p>
              {data.todayByMethod.length ? (
                <ul className="mt-4 grid gap-2">
                  {data.todayByMethod.map((row) => (
                    <li key={row.method} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-bold text-slate-700 dark:text-slate-200">{row.methodLabel}</span>
                      <span className="font-black tabular-nums text-slate-950 dark:text-white">{row.display}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm font-semibold text-slate-500">Nothing received yet today.</p>
              )}
              <button type="button" className="math-button-secondary mt-5 w-full justify-center" disabled={dayClose.isPending} onClick={() => dayClose.mutate(data.today)}>
                {dayClose.isPending ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}Day-close PDF
              </button>
              <InlineError error={dayClose.error} />
            </section>

            <section className="math-card p-5 sm:p-6">
              <p className="math-block-header"><CalendarDays size={14} />{data.thisMonthLabel}</p>
              <dl className="grid gap-3 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="font-bold text-slate-700 dark:text-slate-200">Collected</dt>
                  <dd className="text-xl font-black tabular-nums text-slate-950 dark:text-white">{data.thisMonthCollected.display}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="font-bold text-slate-700 dark:text-slate-200">Spent</dt>
                  <dd className="text-xl font-black tabular-nums text-slate-950 dark:text-white">{data.thisMonthSpent.display}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-t border-slate-200 pt-3 dark:border-slate-700">
                  <dt className="font-black text-slate-900 dark:text-white">Net</dt>
                  <dd className={`text-xl font-black tabular-nums ${data.thisMonthNet.paise < 0 ? "text-rose-600 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"}`}>{data.thisMonthNet.display}</dd>
                </div>
              </dl>
              <p className="mt-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                {data.lastMonthLabel}: {data.lastMonthCollected.display} collected
                {change !== null ? ` · this month so far is ${change >= 0 ? `${change}% ahead` : `${Math.abs(change)}% behind`}` : ""}.
              </p>
            </section>

            <section className="math-card p-5 sm:p-6">
              <p className="math-block-header"><AlertTriangle size={14} />Dues by age</p>
              <h2 className="text-3xl font-black tabular-nums text-slate-950 dark:text-white">{data.due.display}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">{data.studentsWithDues} {data.studentsWithDues === 1 ? "student" : "students"} · {data.unpaidInvoices} unpaid {data.unpaidInvoices === 1 ? "invoice" : "invoices"} · {data.overdue.display} overdue</p>
              <ul className="mt-4 grid gap-2.5">
                {data.buckets.map((row) => (
                  <li key={row.bucket}>
                    <Link href={`/admin/payments/reports?tab=dues&bucket=${row.bucket}`} className="block rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900/60">
                      <div className="flex items-baseline justify-between gap-3 text-xs font-bold text-slate-600 dark:text-slate-300">
                        <span>{row.label}</span>
                        <span className="tabular-nums text-slate-900 dark:text-white">{row.display}</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-2 rounded-full" style={{ width: `${row.paise ? Math.max(3, (row.paise / maxBucket) * 100) : 0}%`, background: BUCKET_COLOURS[row.bucket] }} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="mt-6 math-card p-5 sm:p-6">
            <p className="math-block-header"><BarChart3 size={14} />Last six months</p>
            <h2 className="text-2xl font-black text-slate-950 dark:text-white">Collected and spent each month</h2>
            <div className="mt-4 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: axis, fontSize: 12, fontWeight: 700 }} axisLine={{ stroke: grid }} tickLine={false} />
                  <YAxis tick={{ fill: axis, fontSize: 12 }} axisLine={false} tickLine={false} width={56} tickFormatter={(value: number) => CompactRupees(value * 100)} />
                  <Tooltip
                    cursor={{ fill: dark ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.05)" }}
                    contentStyle={{ background: dark ? "#0f172a" : "#ffffff", border: `1px solid ${grid}`, borderRadius: 12, color: dark ? "#f8fafc" : "#0f172a", fontWeight: 700 }}
                    formatter={(value) => `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  />
                  <Legend wrapperStyle={{ color: axis, fontWeight: 700, fontSize: 12 }} />
                  <Bar dataKey="Collected" fill={dark ? IN_COLOUR.dark : IN_COLOUR.light} radius={[6, 6, 0, 0]} maxBarSize={36} />
                  <Bar dataKey="Spent" fill={dark ? OUT_COLOUR.dark : OUT_COLOUR.light} radius={[6, 6, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="mt-6 math-card p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="math-block-header"><HandCoins size={14} />Latest</p>
                <h2 className="text-2xl font-black text-slate-950 dark:text-white">Recent payments</h2>
              </div>
              <Link href="/admin/payments/collections?tab=payments" className="text-sm font-black text-cyan-700 underline dark:text-cyan-300">See all payments</Link>
            </div>
            {data.recentPayments.length ? (
              <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                {data.recentPayments.map((payment) => (
                  <li key={payment.paymentId} className={`flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between ${payment.status === "CANCELLED" ? "opacity-60" : ""}`}>
                    <div className="min-w-0">
                      <StudentLink studentId={payment.studentId} className="font-black text-slate-900 hover:underline dark:text-white">{payment.studentName}</StudentLink>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{payment.receiptNumber} · {FormatDate(payment.paymentDate)} · {payment.methodSummary}</p>
                    </div>
                    <div className="flex items-center gap-3 sm:justify-end">
                      <PaymentStatusChip payment={payment} />
                      <span className="font-black tabular-nums text-slate-950 dark:text-white">{payment.amountDisplay}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm font-semibold text-slate-500">No payments recorded yet.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}
