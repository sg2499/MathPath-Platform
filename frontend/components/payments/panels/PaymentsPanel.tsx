"use client";

// Moved into a panel 2026-10-08 (Phase 4): shown as a tab of its Payments
// section; the page wrapper (menu, sub-tabs) is the section page.
// 2026-10-08 (Payments Phase 3): Payments -- every payment received, with
// filters, totals by method, money receipt PDFs, Excel, and a detail view
// where a payment can be edited or cancelled.
import { HeroSearch } from "@/components/payments/CommandPalette";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PaymentDetailDialog, PaymentStatusChip } from "@/components/payments/PaymentDetail";
import { PaymentForm } from "@/components/payments/PaymentForm";
import { InlineError, PaymentsMetric } from "@/components/payments/PaymentsUi";
import { ReplaceAddressKeepingTab } from "@/components/payments/PaymentsSection";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import {
  COUNTER_METHODS,
  downloadPaymentsExcel,
  downloadReceiptPdf,
  downloadReceiptsPdf,
  getPaymentSettings,
  getStudentAccount,
  listPaymentStaff,
  listPayments,
  saveBlob,
  type Payment,
  type PaymentFilters,
  type StudentAccount,
} from "@/lib/api/payments";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Eye, FileSpreadsheet, HandCoins, Loader2, Printer, Search, Tag, Wallet, X } from "lucide-react";
import Link from "next/link";
import { StudentLink } from "@/components/payments/StudentPanel";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 50;

function FormatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function PaymentsPanel() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("ALL");
  const [method, setMethod] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [centreId, setCentreId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ payment: Payment; account: StudentAccount } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const debouncedSearch = useDebounced(search);

  // ?studentId= from a student, ?open=<payment id> from the ⌘K search.
  const searchParams = useSearchParams();
  useEffect(() => {
    setStudentId(searchParams.get("studentId") ?? "");
    const open = searchParams.get("open");
    if (open) setViewing(open);
  }, [searchParams]);

  const filters: PaymentFilters = useMemo(
    () => ({ status, method, receivedBy, centreId, dateFrom, dateTo, search: debouncedSearch.trim(), studentId }),
    [status, method, receivedBy, centreId, dateFrom, dateTo, debouncedSearch, studentId]
  );
  useEffect(() => setPage(1), [filters]);

  const listQuery = useQuery({ queryKey: ["admin", "payments", "receipts", filters, page], queryFn: () => listPayments(filters, page, PAGE_SIZE), enabled: ready, placeholderData: keepPreviousData });
  const staffQuery = useQuery({ queryKey: ["admin", "payments", "staff"], queryFn: listPaymentStaff, enabled: ready });
  const settingsQuery = useQuery({ queryKey: ["admin", "payments", "settings"], queryFn: getPaymentSettings, enabled: ready });
  const data = listQuery.data;
  const payments = data?.payments ?? [];
  const pageCount = data ? Math.max(1, Math.ceil(data.totalCount / data.pageSize)) : 1;
  const filtersOn = Boolean(status !== "ALL" || method || receivedBy || centreId || dateFrom || dateTo || search.trim() || studentId);
  const tooManyForPdf = (data?.totalCount ?? 0) > 500;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "payments"] });
  };

  const pdfOne = useMutation({ mutationFn: (payment: Payment) => downloadReceiptPdf(payment.paymentId), onSuccess: (blob, payment) => saveBlob(blob, `${payment.receiptNumber}.pdf`) });
  const pdfAll = useMutation({ mutationFn: () => downloadReceiptsPdf({ filters }), onSuccess: (blob) => saveBlob(blob, `MathPath-Receipts-${new Date().toISOString().slice(0, 10)}.pdf`) });
  const excel = useMutation({ mutationFn: () => downloadPaymentsExcel(filters), onSuccess: (blob) => saveBlob(blob, `MathPath-Payments-${new Date().toISOString().slice(0, 10)}.xlsx`) });
  const openEdit = useMutation({
    mutationFn: async (payment: Payment) => ({ payment, account: await getStudentAccount(payment.studentId) }),
    onSuccess: (value) => {
      setViewing(null);
      setEditing(value);
    },
  });

  const clearFilters = () => {
    setStatus("ALL");
    setMethod("");
    setReceivedBy("");
    setCentreId("");
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setStudentId("");
    ReplaceAddressKeepingTab({});
  };

  if (!ready) return null;

  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="math-block-header"><Wallet size={14} />Collections</p>
            <h1 className="math-title">Payments</h1>
            <p className="math-subtitle">Every payment received, with its money receipt. Totals follow your filters and leave out cancelled payments.</p>
            <HeroSearch />
          </div>
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-3 xl:shrink-0">
            <PaymentsMetric label="Payments" value={data ? data.totalCount.toLocaleString("en-IN") : "—"} icon={<HandCoins size={14} />} tone="cyan" />
            <PaymentsMetric label="Received" value={<span className="text-lg sm:text-xl">{data?.totals.receivedDisplay ?? "—"}</span>} icon={<Wallet size={14} />} tone="emerald" />
            <PaymentsMetric label="Discount" value={<span className="text-lg sm:text-xl">{data?.totals.discountDisplay ?? "—"}</span>} icon={<Tag size={14} />} />
          </div>
        </div>
      </section>

      <section className="mt-6 math-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div role="tablist" aria-label="Payment status" className="flex flex-wrap gap-2">
            {[["ALL", "All"], ["RECORDED", "Received"], ["CANCELLED", "Cancelled"]].map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={status === key} onClick={() => setStatus(key)} className={`math-role-tab-button math-admin-tab-force rounded-2xl px-4 py-2 text-sm font-black transition ${status === key ? "is-active math-admin-tab-force-selected" : ""}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/payments/collections?tab=student-fees" className="math-button-primary whitespace-nowrap"><HandCoins size={17} />Record Payment</Link>
            <button type="button" className="math-button-secondary whitespace-nowrap" disabled={!data?.totalCount || excel.isPending} onClick={() => excel.mutate()}>
              {excel.isPending ? <Loader2 size={17} className="animate-spin" /> : <FileSpreadsheet size={17} />}Excel
            </button>
            <button type="button" className="math-button-secondary whitespace-nowrap" disabled={!data?.totalCount || tooManyForPdf || pdfAll.isPending} title={tooManyForPdf ? "More than 500 payments: narrow the filters to print" : undefined} onClick={() => pdfAll.mutate()}>
              {pdfAll.isPending ? <Loader2 size={17} className="animate-spin" /> : <Printer size={17} />}Receipts PDF
            </button>
          </div>
        </div>

        <div className="mt-4 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6">
          <div className="relative sm:col-span-2 lg:col-span-4 2xl:col-span-2">
            <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="math-input pl-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Student, receipt number, paid by or reference" aria-label="Search payments" />
          </div>
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
          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="mb-1 block text-xs font-black text-slate-500 dark:text-slate-400">Paid from / to</legend>
            <input type="date" className="math-input px-3" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="Paid from" />
            <input type="date" className="math-input px-3" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} aria-label="Paid to" />
          </fieldset>
        </div>

        {data?.totals.byMethod.length ? (
          <div className="mt-4 flex flex-wrap gap-2" aria-label="Received by method">
            {data.totals.byMethod.map((row) => (
              <span key={row.method} className="inline-flex items-baseline gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                {row.methodLabel}<span className="tabular-nums text-slate-950 dark:text-white">{row.amountDisplay}</span>
              </span>
            ))}
          </div>
        ) : null}

        {filtersOn ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
            {studentId ? <span className="rounded-full bg-cyan-50 px-3 py-1 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200">Showing one student</span> : null}
            <button type="button" className="inline-flex items-center gap-1 underline" onClick={clearFilters}><X size={12} />Clear filters</button>
          </div>
        ) : null}
        {notice ? (
          <div role="status" className="mt-4 flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
            <span>{notice}</span>
            <button type="button" className="text-xs font-black underline" onClick={() => setNotice(null)}>Dismiss</button>
          </div>
        ) : null}
        {excel.error || pdfAll.error || pdfOne.error || openEdit.error ? <div className="mt-4"><InlineError error={excel.error || pdfAll.error || pdfOne.error || openEdit.error} /></div> : null}

        <div className="mt-5">
          {listQuery.isLoading ? (
            <LoadingState label="Loading payments..." />
          ) : listQuery.error ? (
            <ErrorState message="Payments could not be loaded. Refresh the page to try again." />
          ) : !payments.length ? (
            filtersOn ? (
              <EmptyState title="No payments match" description="Try different filters, or clear them." />
            ) : (
              <EmptyState title="No payments yet" description="Record a payment from Student Fees. The old platform's payments will appear here after the history migration." />
            )
          ) : (
            <>
              <ul className="grid gap-3 md:hidden">
                {payments.map((payment) => (
                  <li key={payment.paymentId} className={`rounded-3xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-950/60 ${payment.status === "CANCELLED" ? "opacity-70" : ""}`}>
                    <button type="button" className="block w-full text-left" onClick={() => setViewing(payment.paymentId)}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-black text-slate-900 dark:text-white">{payment.studentName}</p>
                          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{payment.receiptNumber} · {FormatDate(payment.paymentDate)}</p>
                        </div>
                        <p className="shrink-0 text-lg font-black tabular-nums text-slate-950 dark:text-white">{payment.amountDisplay}</p>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">{payment.methodSummary}</p>
                      <div className="mt-2"><PaymentStatusChip payment={payment} /></div>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead>
                    <tr className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                      <th className="px-2 py-2">Receipt</th>
                      <th className="px-2 py-2">Student</th>
                      <th className="px-2 py-2">Paid with</th>
                      <th className="px-2 py-2">For</th>
                      <th className="px-2 py-2 text-right">Amount</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.paymentId} className={`border-t border-slate-100 dark:border-slate-800 ${payment.status === "CANCELLED" ? "opacity-70" : ""}`}>
                        <td className="whitespace-nowrap px-2 py-3">
                          <div className="font-black tabular-nums text-slate-900 dark:text-white">{payment.receiptNumber}</div>
                          <div className="text-xs font-semibold text-slate-500">{FormatDate(payment.paymentDate)}</div>
                        </td>
                        <td className="max-w-[220px] px-2 py-3">
                          <StudentLink studentId={payment.studentId} className="block truncate font-black text-slate-900 hover:underline dark:text-white">{payment.studentName}</StudentLink>
                          <div className="truncate text-xs font-semibold text-slate-500">{[payment.studentCode, payment.centreName, payment.receivedByName ? `by ${payment.receivedByName}` : null].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td className="max-w-[220px] px-2 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200">{payment.methodSummary}</td>
                        <td className="max-w-[200px] px-2 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {payment.invoiceNumbers.length ? payment.invoiceNumbers.join(", ") : "Advance"}
                          {payment.advancePaise && payment.invoiceNumbers.length ? <span className="block text-violet-700 dark:text-violet-300">+ {payment.advanceDisplay} advance</span> : null}
                        </td>
                        <td className="whitespace-nowrap px-2 py-3 text-right font-black tabular-nums text-slate-950 dark:text-white">
                          {payment.amountDisplay}
                          {payment.discountPaise ? <span className="block text-xs font-semibold text-slate-500">discount {payment.discountDisplay}</span> : null}
                        </td>
                        <td className="px-2 py-3"><PaymentStatusChip payment={payment} /></td>
                        <td className="px-2 py-3">
                          <div className="flex justify-end gap-2">
                            <button type="button" className="math-role-action-button h-9 px-3 text-xs" disabled={pdfOne.isPending && pdfOne.variables?.paymentId === payment.paymentId} onClick={() => pdfOne.mutate(payment)} aria-label={`Download receipt ${payment.receiptNumber}`}>
                              {pdfOne.isPending && pdfOne.variables?.paymentId === payment.paymentId ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}Receipt
                            </button>
                            <button type="button" className="math-role-action-button h-9 px-3 text-xs" onClick={() => setViewing(payment.paymentId)}><Eye size={13} />View</button>
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

      <PaymentDetailDialog
        paymentId={viewing}
        onClose={() => setViewing(null)}
        onEdit={(payment) => openEdit.mutate(payment)}
        onChanged={(message) => {
          setNotice(message);
          refresh();
        }}
      />
      {editing ? (
        <PaymentForm
          open
          onClose={() => setEditing(null)}
          account={editing.account}
          editing={editing.payment}
          onSaved={(payment) => {
            setEditing(null);
            setNotice(`${payment.receiptNumber} saved.`);
            refresh();
          }}
        />
      ) : null}
    </>
  );
}
