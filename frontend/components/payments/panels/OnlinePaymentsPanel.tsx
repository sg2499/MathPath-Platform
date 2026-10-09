"use client";

// 2026-10-09 (Payments Phase 5): Collections > Online Payments. Every
// Razorpay payment started from this site -- paid, failed, not completed or
// needing attention -- with its Razorpay ids and a timeline of what
// happened. "Check with Razorpay" asks Razorpay directly and records a
// payment that went through but did not show (the "money cut but not
// showing" call from a parent).

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, CircleSlash, Clock3, CreditCard, Eye, Loader2, RefreshCw, Search, Settings, X, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { ReplaceAddressKeepingTab } from "@/components/payments/PaymentsSection";
import { InlineError, PaymentsDialog, PaymentsMetric } from "@/components/payments/PaymentsUi";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { checkOnlineOrder, getOnlineOrder, listOnlineOrders, type OnlineOrder, type OnlineOrderFilters, type OnlineOrderStatus } from "@/lib/api/payments";

const PAGE_SIZE = 50;

const STATUS_TABS: [string, string][] = [
  ["ALL", "All"],
  ["PAID", "Paid"],
  ["ATTENTION", "Needs attention"],
  ["FAILED", "Failed"],
  ["ABANDONED", "Not completed"],
  ["CREATED", "In progress"],
];

function When(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function OnlineStatusChip({ status, label }: { status: OnlineOrderStatus; label: string }) {
  const tone: Record<OnlineOrderStatus, string> = {
    PAID: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
    ATTENTION: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200",
    FAILED: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    ABANDONED: "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300",
    CREATED: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200",
  };
  const icon: Record<OnlineOrderStatus, JSX.Element> = {
    PAID: <CheckCircle2 size={12} />,
    ATTENTION: <AlertTriangle size={12} />,
    FAILED: <XCircle size={12} />,
    ABANDONED: <CircleSlash size={12} />,
    CREATED: <Clock3 size={12} />,
  };
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-black ${tone[status]}`}>{icon[status]}{label}</span>;
}

function OrderDialog({ orderRef, onClose, onChanged }: { orderRef: string | null; onClose: () => void; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "payments", "online-order", orderRef], queryFn: () => getOnlineOrder(orderRef!), enabled: Boolean(orderRef) });
  const check = useMutation({
    mutationFn: () => checkOnlineOrder(orderRef!),
    onSuccess: (order) => {
      queryClient.setQueryData(["admin", "payments", "online-order", orderRef], order);
      onChanged();
    },
  });
  useEffect(() => check.reset(), [orderRef]); // eslint-disable-line react-hooks/exhaustive-deps
  const order = query.data;
  return (
    <PaymentsDialog
      open={Boolean(orderRef)}
      wide
      kicker="Online payment"
      title={order ? `${order.studentName} · ${order.amountDisplay}` : "Online payment"}
      onClose={onClose}
      footer={
        order ? (
          <>
            {order.paymentId ? (
              <Link className="math-button-secondary" href={`/admin/payments/collections?tab=payments&studentId=${encodeURIComponent(order.studentId)}`}>Open payments</Link>
            ) : null}
            <button type="button" className="math-button-primary" disabled={check.isPending} onClick={() => check.mutate()}>
              {check.isPending ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}Check with Razorpay
            </button>
          </>
        ) : null
      }
    >
      {query.isLoading ? (
        <LoadingState label="Loading..." />
      ) : query.error || !order ? (
        <InlineError error={query.error} />
      ) : (
        <div className="grid gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <OnlineStatusChip status={order.status} label={order.statusLabel} />
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600 dark:bg-slate-900 dark:text-slate-300">{order.sourceLabel}</span>
            {order.keyMode === "TEST" ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">Test mode</span> : null}
          </div>
          {order.lastError && order.status !== "PAID" ? (
            <p className={`rounded-2xl border px-4 py-3 text-sm font-bold ${order.status === "ATTENTION" ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200" : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"}`}>{order.lastError}</p>
          ) : null}
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {[
              ["Student", `${order.studentName}${order.studentCode ? ` (${order.studentCode})` : ""}`],
              ["Started", When(order.createdAt)],
              ["Receipt", order.receiptNumber ? `${order.receiptNumber}${order.receiptStatus === "CANCELLED" ? " (cancelled)" : ""}` : "—"],
              ["Paid", order.paidAt ? `${When(order.paidAt)}${order.methodDetail ? ` · ${order.methodDetail}` : ""}` : "—"],
              ["Razorpay order", order.razorpayOrderId],
              ["Razorpay payment", order.razorpayPaymentId ?? "—"],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs font-black text-slate-500 dark:text-slate-400">{label}</dt>
                <dd className="mt-0.5 break-all font-black tabular-nums text-slate-900 dark:text-white">{value}</dd>
              </div>
            ))}
          </dl>
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">For</h3>
            <ul className="mt-2 grid gap-1">
              {order.invoices.map((line) => (
                <li key={line.invoiceId} className="flex justify-between gap-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <span className="tabular-nums">{line.invoiceNumber}</span>
                  <span className="font-black tabular-nums">{line.amountDisplay}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">What happened</h3>
            <ol className="mt-3 grid gap-0 border-l-2 border-slate-200 pl-4 dark:border-slate-800">
              {(order.events ?? []).map((event) => (
                <li key={event.eventId} className="relative pb-3 last:pb-0">
                  <span className="absolute -left-[23px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-slate-400 dark:border-slate-950" aria-hidden />
                  <p className="text-sm font-black text-slate-900 dark:text-white">
                    {event.label}
                    <span className="ml-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{When(event.createdAt)}</span>
                  </p>
                  {event.detail ? <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{event.detail}</p> : null}
                  {event.razorpayPaymentId ? <p className="text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400">{event.razorpayPaymentId}</p> : null}
                </li>
              ))}
            </ol>
          </div>
          <InlineError error={check.error} />
          {check.isSuccess ? <p role="status" className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Checked with Razorpay just now.</p> : null}
        </div>
      )}
    </PaymentsDialog>
  );
}

export function OnlinePaymentsPanel() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("ALL");
  const [source, setSource] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<string | null>(null);
  const debouncedSearch = useDebounced(search);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setStudentId(params.get("studentId") ?? "");
    setViewing(params.get("order"));
  }, []);

  const filters: OnlineOrderFilters = useMemo(
    () => ({ status, source, dateFrom, dateTo, search: debouncedSearch.trim(), studentId }),
    [status, source, dateFrom, dateTo, debouncedSearch, studentId],
  );
  useEffect(() => setPage(1), [filters]);

  const listQuery = useQuery({
    queryKey: ["admin", "payments", "online-orders", filters, page],
    queryFn: () => listOnlineOrders(filters, page, PAGE_SIZE),
    enabled: ready,
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  const data = listQuery.data;
  const orders = data?.orders ?? [];
  const pageCount = data ? Math.max(1, Math.ceil(data.totalCount / data.pageSize)) : 1;
  const filtersOn = Boolean(status !== "ALL" || source || dateFrom || dateTo || search.trim() || studentId);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "payments"] });
  const clearFilters = () => {
    setStatus("ALL");
    setSource("");
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setStudentId("");
    ReplaceAddressKeepingTab({});
  };

  if (!ready) return null;
  const settings = data?.settings;

  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="math-block-header"><CreditCard size={14} />Collections</p>
            <h1 className="math-title">Online Payments</h1>
            <p className="math-subtitle">Every Razorpay payment started from the student login or a pay link: paid, failed or not completed, with what happened at each step.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:shrink-0">
            <PaymentsMetric label="Paid" value={data ? data.counts.PAID.toLocaleString("en-IN") : "—"} icon={<CheckCircle2 size={14} />} tone="emerald" />
            <PaymentsMetric label="Received" value={<span className="text-lg sm:text-xl">{data?.paidDisplay ?? "—"}</span>} icon={<CreditCard size={14} />} tone="cyan" />
            <PaymentsMetric label="Attention" value={data ? data.counts.ATTENTION : "—"} icon={<AlertTriangle size={14} />} tone={data?.counts.ATTENTION ? "amber" : "slate"} />
          </div>
        </div>
      </section>

      {settings && !settings.onlinePaymentsLive ? (
        <div className="mt-6 flex flex-col gap-3 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <span>{settings.onlinePaymentsEnabled ? `Online payments are switched on but not working: ${settings.problems.join(" ")}` : "Online payments are switched off. Students and parents cannot pay online."}</span>
          <Link href="/admin/payments/settings?tab=online" className="math-button-secondary whitespace-nowrap"><Settings size={16} />Online Payments settings</Link>
        </div>
      ) : null}

      <section className="mt-6 math-card p-5 sm:p-6">
        <div role="tablist" aria-label="Online payment status" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {STATUS_TABS.map(([key, label]) => {
            const count = key === "ALL" ? null : data?.counts[key as OnlineOrderStatus];
            return (
              <button key={key} type="button" role="tab" aria-selected={status === key} onClick={() => setStatus(key)} className={`math-role-tab-button math-admin-tab-force inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl px-4 py-2 text-sm font-black transition ${status === key ? "is-active math-admin-tab-force-selected" : ""}`}>
                {label}
                {count ? <span className="rounded-full bg-slate-900/10 px-1.5 text-xs tabular-nums dark:bg-white/15">{count}</span> : null}
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2">
            <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="math-input pl-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Student, receipt, or Razorpay order or payment id" aria-label="Search online payments" />
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500 dark:text-slate-400">Paid from</span>
            <select className="math-input" value={source} onChange={(event) => setSource(event.target.value)}>
              <option value="">Anywhere</option>
              <option value="STUDENT">Student login</option>
              <option value="PAY_LINK">Pay link</option>
            </select>
          </label>
          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="mb-1 block text-xs font-black text-slate-500 dark:text-slate-400">Started from / to</legend>
            <input type="date" className="math-input px-3" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="Started from" />
            <input type="date" className="math-input px-3" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} aria-label="Started to" />
          </fieldset>
        </div>
        {filtersOn ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
            {studentId ? <span className="rounded-full bg-cyan-50 px-3 py-1 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200">Showing one student</span> : null}
            <button type="button" className="inline-flex items-center gap-1 underline" onClick={clearFilters}><X size={12} />Clear filters</button>
          </div>
        ) : null}

        <div className="mt-5">
          {listQuery.isLoading ? (
            <LoadingState label="Loading online payments..." />
          ) : listQuery.error ? (
            <ErrorState message="Online payments could not be loaded. Refresh the page to try again." />
          ) : !orders.length ? (
            filtersOn ? (
              <EmptyState title="No online payments match" description="Try different filters, or clear them." />
            ) : (
              <EmptyState title="No online payments yet" description="Payments started from the student login or a pay link appear here, including ones that failed or were not completed." />
            )
          ) : (
            <>
              <ul className="grid gap-3 md:hidden">
                {orders.map((order) => (
                  <li key={order.orderRef}>
                    <button type="button" className="block w-full rounded-3xl border border-slate-200 bg-white/80 p-4 text-left dark:border-slate-800 dark:bg-slate-950/60" onClick={() => setViewing(order.orderRef)}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-black text-slate-900 dark:text-white">{order.studentName}</p>
                          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{When(order.createdAt)} · {order.sourceLabel}</p>
                        </div>
                        <p className="shrink-0 text-lg font-black tabular-nums text-slate-950 dark:text-white">{order.amountDisplay}</p>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <OnlineStatusChip status={order.status} label={order.statusLabel} />
                        {order.receiptNumber ? <span className="text-xs font-black tabular-nums text-slate-600 dark:text-slate-300">{order.receiptNumber}</span> : null}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead>
                    <tr className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                      <th className="px-2 py-2">Started</th>
                      <th className="px-2 py-2">Student</th>
                      <th className="px-2 py-2">For</th>
                      <th className="px-2 py-2 text-right">Amount</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">Receipt</th>
                      <th className="px-2 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order: OnlineOrder) => (
                      <tr key={order.orderRef} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="whitespace-nowrap px-2 py-3">
                          <div className="font-black text-slate-900 dark:text-white">{When(order.createdAt)}</div>
                          <div className="text-xs font-semibold text-slate-500">{order.sourceLabel}{order.keyMode === "TEST" ? " · test" : ""}</div>
                        </td>
                        <td className="max-w-[220px] px-2 py-3">
                          <Link href={`/admin/payments/collections?tab=student-fees&studentId=${encodeURIComponent(order.studentId)}`} className="block truncate font-black text-slate-900 hover:underline dark:text-white">{order.studentName}</Link>
                          <div className="truncate text-xs font-semibold text-slate-500">{order.studentCode}</div>
                        </td>
                        <td className="max-w-[200px] px-2 py-3 text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">{order.invoices.map((line) => line.invoiceNumber).join(", ")}</td>
                        <td className="whitespace-nowrap px-2 py-3 text-right font-black tabular-nums text-slate-950 dark:text-white">{order.amountDisplay}</td>
                        <td className="px-2 py-3">
                          <OnlineStatusChip status={order.status} label={order.statusLabel} />
                          {order.status === "FAILED" && order.lastError ? <p className="mt-1 max-w-[220px] truncate text-xs font-semibold text-slate-500" title={order.lastError}>{order.lastError}</p> : null}
                        </td>
                        <td className="whitespace-nowrap px-2 py-3 text-xs font-black tabular-nums text-slate-700 dark:text-slate-200">
                          {order.receiptNumber ?? "—"}
                          {order.methodDetail ? <span className="block font-semibold text-slate-500">{order.methodDetail}</span> : null}
                        </td>
                        <td className="px-2 py-3">
                          <div className="flex justify-end">
                            <button type="button" className="math-role-action-button h-9 px-3 text-xs" onClick={() => setViewing(order.orderRef)}><Eye size={13} />View</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm font-bold text-slate-600 dark:text-slate-300">
                <span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data?.totalCount ?? 0)} of {data?.totalCount.toLocaleString("en-IN")}</span>
                <div className="flex items-center gap-2">
                  <button type="button" className="math-role-action-button h-9 px-3 text-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} />Previous</button>
                  <span className="tabular-nums">Page {page} of {pageCount}</span>
                  <button type="button" className="math-role-action-button h-9 px-3 text-xs" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Next<ChevronRight size={14} /></button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <OrderDialog orderRef={viewing} onClose={() => setViewing(null)} onChanged={refresh} />
    </>
  );
}
