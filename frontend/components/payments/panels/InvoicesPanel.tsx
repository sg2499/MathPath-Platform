"use client";

// Moved into a panel 2026-10-08 (Phase 4): shown as a tab of its Payments
// section; the page wrapper (menu, sub-tabs) is the section page.
// 2026-10-08 (Payments Phase 2): Invoices -- every invoice, with filters,
// totals, Excel export, a bulk PDF for printing, and a detail view where an
// invoice can be downloaded or cancelled (with a reason; it stays on record).
import { HeroSearch } from "@/components/payments/CommandPalette";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { FieldLabel, InlineError, PaymentsDialog, PaymentsHistoryList, PaymentsMetric } from "@/components/payments/PaymentsUi";
import { ReplaceAddressKeepingTab } from "@/components/payments/PaymentsSection";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import {
  cancelInvoice,
  downloadInvoicePdf,
  downloadInvoicesExcel,
  downloadInvoicesPdf,
  getPaymentSettings,
  listFeeItems,
  listInvoices,
  saveBlob,
  type Invoice,
  type InvoiceFilters,
} from "@/lib/api/payments";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  HandCoins,
  Loader2,
  Printer,
  Search,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { StudentLink } from "@/components/payments/StudentPanel";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 50;
const STATUS_TABS: { key: string; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "UNPAID", label: "Unpaid" },
  { key: "OVERDUE", label: "Overdue" },
  { key: "PART_PAID", label: "Part-paid" },
  { key: "PAID", label: "Paid" },
  { key: "CANCELLED", label: "Cancelled" },
];

function FormatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function InvoiceStatusChip({ invoice }: { invoice: Invoice }) {
  const tone =
    invoice.status === "PAID"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
      : invoice.status === "CANCELLED"
        ? "bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400"
        : invoice.status === "PART_PAID"
          ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
          : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200";
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-black ${tone}`}>{invoice.statusLabel}</span>
      {invoice.isOverdue ? <span className="inline-flex whitespace-nowrap rounded-full bg-rose-100 px-2.5 py-1 text-xs font-black text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">Overdue</span> : null}
    </span>
  );
}

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function InvoicesPanel() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("ALL");
  const [feeItemId, setFeeItemId] = useState("");
  const [period, setPeriod] = useState("");
  const [centreId, setCentreId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [batchId, setBatchId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const debouncedSearch = useDebounced(search);

  // Links from Generate Invoices (?batchId=), a student (?studentId=), or
  // the ⌘K search (?search=<number>&open=<invoice id>). Watched, so a search
  // while this tab is open still lands.
  const searchParams = useSearchParams();
  useEffect(() => {
    setBatchId(searchParams.get("batchId") ?? "");
    setStudentId(searchParams.get("studentId") ?? "");
    const wanted = searchParams.get("search");
    if (wanted) setSearch(wanted);
    const open = searchParams.get("open");
    if (open) setOpenId(open);
  }, [searchParams]);

  const filters: InvoiceFilters = useMemo(
    () => ({ status, feeItemId, period, centreId, dateFrom, dateTo, search: debouncedSearch.trim(), batchId, studentId }),
    [status, feeItemId, period, centreId, dateFrom, dateTo, debouncedSearch, batchId, studentId]
  );
  useEffect(() => setPage(1), [filters]);

  const listQuery = useQuery({
    queryKey: ["admin", "payments", "invoices", filters, page],
    queryFn: () => listInvoices(filters, page, PAGE_SIZE),
    enabled: ready,
    placeholderData: keepPreviousData,
  });
  const feeQuery = useQuery({ queryKey: ["admin", "payments", "fee-items"], queryFn: listFeeItems, enabled: ready });
  const settingsQuery = useQuery({ queryKey: ["admin", "payments", "settings"], queryFn: getPaymentSettings, enabled: ready });

  const data = listQuery.data;
  const invoices = data?.invoices ?? [];
  const opened = invoices.find((row) => row.invoiceId === openId) ?? null;
  const pageCount = data ? Math.max(1, Math.ceil(data.totalCount / data.pageSize)) : 1;
  const filtersOn = Boolean(status !== "ALL" || feeItemId || period || centreId || dateFrom || dateTo || search.trim() || batchId || studentId);

  const clearFilters = () => {
    setStatus("ALL");
    setFeeItemId("");
    setPeriod("");
    setCentreId("");
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setBatchId("");
    setStudentId("");
    ReplaceAddressKeepingTab({});
  };

  const pdfOne = useMutation({
    mutationFn: (invoice: Invoice) => downloadInvoicePdf(invoice.invoiceId),
    onSuccess: (blob, invoice) => saveBlob(blob, `${invoice.invoiceNumber}.pdf`),
  });
  const pdfAll = useMutation({
    mutationFn: () => downloadInvoicesPdf({ filters }),
    onSuccess: (blob) => saveBlob(blob, `MathPath-Invoices-${new Date().toISOString().slice(0, 10)}.pdf`),
  });
  const excel = useMutation({
    mutationFn: () => downloadInvoicesExcel(filters),
    onSuccess: (blob) => saveBlob(blob, `MathPath-Invoices-${new Date().toISOString().slice(0, 10)}.xlsx`),
  });
  const cancelMutation = useMutation({
    mutationFn: (invoice: Invoice) => cancelInvoice(invoice.invoiceId, cancelReason),
    onSuccess: (saved) => {
      setNotice(
        `${saved.invoiceNumber} is cancelled. It stays on record, and its number is not reused.` +
          (saved.movedToAdvancePaise ? ` ${saved.movedToAdvanceDisplay} paid on it is now the student's advance.` : "")
      );
      setCancelling(false);
      setCancelReason("");
      queryClient.invalidateQueries({ queryKey: ["admin", "payments", "invoices"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "payments", "audit"] });
    },
  });

  const openInvoice = (invoice: Invoice) => {
    setOpenId(invoice.invoiceId);
    setCancelling(false);
    setCancelReason("");
    cancelMutation.reset();
    pdfOne.reset();
  };

  if (!ready) return null;
  const centres = settingsQuery.data?.centres ?? [];
  const fees = feeQuery.data ?? [];
  const tooManyForPdf = (data?.totalCount ?? 0) > 500;

  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="math-block-header"><Wallet size={14} />Invoices</p>
            <h1 className="math-title">Invoices</h1>
            <p className="math-subtitle">Every invoice issued. Totals below follow your filters and leave out cancelled invoices.</p>
            <HeroSearch />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:shrink-0">
            <PaymentsMetric label="Invoices" value={data ? data.totalCount.toLocaleString("en-IN") : "—"} icon={<FileText size={14} />} tone="cyan" />
            <PaymentsMetric label="Billed" value={<span className="text-lg sm:text-xl">{data?.totals.amountDisplay ?? "—"}</span>} icon={<Wallet size={14} />} />
            <PaymentsMetric label="Received" value={<span className="text-lg sm:text-xl">{data?.totals.paidDisplay ?? "—"}</span>} icon={<Wallet size={14} />} tone="emerald" />
            <PaymentsMetric label="Due" value={<span className="text-lg sm:text-xl">{data?.totals.balanceDisplay ?? "—"}</span>} icon={<AlertTriangle size={14} />} tone="amber" />
          </div>
        </div>
      </section>

      <section className="mt-6 math-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div role="tablist" aria-label="Invoice status" className="flex flex-wrap gap-2">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={status === tab.key}
                onClick={() => setStatus(tab.key)}
                className={`math-role-tab-button math-admin-tab-force rounded-2xl px-4 py-2 text-sm font-black transition ${status === tab.key ? "is-active math-admin-tab-force-selected" : ""}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/payments/invoices?tab=generate" className="math-button-primary whitespace-nowrap"><FilePlus2 size={17} />Generate Invoices</Link>
            <button type="button" className="math-button-secondary whitespace-nowrap" disabled={!data?.totalCount || excel.isPending} onClick={() => excel.mutate()}>
              {excel.isPending ? <Loader2 size={17} className="animate-spin" /> : <FileSpreadsheet size={17} />}Excel
            </button>
            <button
              type="button"
              className="math-button-secondary whitespace-nowrap"
              disabled={!data?.totalCount || tooManyForPdf || pdfAll.isPending}
              title={tooManyForPdf ? "More than 500 invoices: narrow the filters to print" : undefined}
              onClick={() => pdfAll.mutate()}
            >
              {pdfAll.isPending ? <Loader2 size={17} className="animate-spin" /> : <Printer size={17} />}PDF of these
            </button>
          </div>
        </div>

        <div className="mt-4 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6">
          <div className="relative sm:col-span-2 lg:col-span-4 2xl:col-span-2">
            <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="math-input pl-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Student, student ID or invoice number" aria-label="Search invoices" />
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500 dark:text-slate-400">Fee item</span>
            <select className="math-input" value={feeItemId} onChange={(event) => setFeeItemId(event.target.value)}>
              <option value="">All fee items</option>
              {fees.map((item) => <option key={item.feeItemId} value={item.feeItemId}>{item.name}{item.isActive ? "" : " (off)"}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500 dark:text-slate-400">Month billed (monthly fee)</span>
            <input type="month" className="math-input" value={period} onChange={(event) => setPeriod(event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500 dark:text-slate-400">Centre</span>
            <select className="math-input" value={centreId} onChange={(event) => setCentreId(event.target.value)}>
              <option value="">All centres</option>
              {centres.map((centre) => <option key={centre.centreId} value={centre.centreId}>{centre.name}</option>)}
              <option value="NONE">No centre set</option>
            </select>
          </label>
          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="mb-1 block text-xs font-black text-slate-500 dark:text-slate-400">Invoice date from / to</legend>
            <input type="date" className="math-input px-3" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="Invoice date from" />
            <input type="date" className="math-input px-3" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} aria-label="Invoice date to" />
          </fieldset>
        </div>

        {filtersOn ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
            {batchId ? <span className="rounded-full bg-cyan-50 px-3 py-1 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200">Showing one Generate run</span> : null}
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
        {excel.error || pdfAll.error ? <div className="mt-4"><InlineError error={excel.error || pdfAll.error} /></div> : null}

        <div className="mt-5">
          {listQuery.isLoading ? (
            <LoadingState label="Loading invoices..." />
          ) : listQuery.error ? (
            <ErrorState message="Invoices could not be loaded. Refresh the page to try again." />
          ) : !invoices.length ? (
            filtersOn ? (
              <EmptyState title="No invoices match" description="Try different filters, or clear them." />
            ) : (
              <EmptyState title="No invoices yet" description="Use Generate Invoices to invoice students for a fee. The old platform's invoices will appear here after the history migration." />
            )
          ) : (
            <>
              <ul className="grid gap-3 md:hidden">
                {invoices.map((invoice) => (
                  <li key={invoice.invoiceId} className={`rounded-3xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-950/60 ${invoice.status === "CANCELLED" ? "opacity-70" : ""}`}>
                    <button type="button" className="block w-full text-left" onClick={() => openInvoice(invoice)}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-black text-slate-900 dark:text-white">{invoice.studentName}</p>
                          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{invoice.invoiceNumber} · {FormatDate(invoice.invoiceDate)}</p>
                        </div>
                        <p className="shrink-0 text-lg font-black tabular-nums text-slate-950 dark:text-white">{invoice.amountDisplay}</p>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">{invoice.feeName}{invoice.periodLabel ? ` · ${invoice.periodLabel}` : ""}</p>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <InvoiceStatusChip invoice={invoice} />
                        {invoice.balancePaise ? <span className="text-xs font-bold text-slate-500">Due {invoice.balanceDisplay} by {FormatDate(invoice.dueDate)}</span> : null}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead>
                    <tr className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                      <th className="px-2 py-2">Invoice</th>
                      <th className="px-2 py-2">Student</th>
                      <th className="px-2 py-2">Fee</th>
                      <th className="px-2 py-2 text-right">Amount</th>
                      <th className="px-2 py-2 text-right">Balance</th>
                      <th className="px-2 py-2">Due</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => (
                      <tr key={invoice.invoiceId} className={`border-t border-slate-100 dark:border-slate-800 ${invoice.status === "CANCELLED" ? "opacity-70" : ""}`}>
                        <td className="whitespace-nowrap px-2 py-3">
                          <div className="font-black tabular-nums text-slate-900 dark:text-white">{invoice.invoiceNumber}</div>
                          <div className="text-xs font-semibold text-slate-500">{FormatDate(invoice.invoiceDate)}</div>
                        </td>
                        <td className="max-w-[240px] px-2 py-3">
                          <StudentLink studentId={invoice.studentId} className="block truncate font-black text-slate-900 hover:underline dark:text-white">{invoice.studentName}</StudentLink>
                          <div className="truncate text-xs font-semibold text-slate-500">{[invoice.studentCode, invoice.levelCode, invoice.centreName].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td className="max-w-[220px] px-2 py-3">
                          <div className="truncate font-bold text-slate-800 dark:text-slate-100">{invoice.feeName}</div>
                          {invoice.periodLabel ? <div className="text-xs font-semibold text-slate-500">{invoice.periodLabel}</div> : null}
                        </td>
                        <td className="whitespace-nowrap px-2 py-3 text-right font-black tabular-nums text-slate-950 dark:text-white">{invoice.amountDisplay}</td>
                        <td className="whitespace-nowrap px-2 py-3 text-right font-bold tabular-nums text-slate-700 dark:text-slate-200">{invoice.status === "CANCELLED" ? "—" : invoice.balanceDisplay}</td>
                        <td className="whitespace-nowrap px-2 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300">{FormatDate(invoice.dueDate)}</td>
                        <td className="px-2 py-3"><InvoiceStatusChip invoice={invoice} /></td>
                        <td className="px-2 py-3">
                          <div className="flex justify-end gap-2">
                            <button type="button" className="math-role-action-button h-9 px-3 text-xs" disabled={pdfOne.isPending && pdfOne.variables?.invoiceId === invoice.invoiceId} onClick={() => pdfOne.mutate(invoice)} aria-label={`Download ${invoice.invoiceNumber} as PDF`}>
                              {pdfOne.isPending && pdfOne.variables?.invoiceId === invoice.invoiceId ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}PDF
                            </button>
                            {invoice.balancePaise > 0 ? (
                              <Link href={`/admin/payments/collections?tab=student-fees&studentId=${encodeURIComponent(invoice.studentId)}&pay=${encodeURIComponent(invoice.invoiceId)}`} className="math-role-action-button h-9 px-3 text-xs" aria-label={`Record a payment for ${invoice.invoiceNumber}`}><HandCoins size={13} />Pay</Link>
                            ) : null}
                            <button type="button" className="math-role-action-button h-9 px-3 text-xs" onClick={() => openInvoice(invoice)}><Eye size={13} />View</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pdfOne.error && !opened ? <div className="mt-3"><InlineError error={pdfOne.error} /></div> : null}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm font-bold text-slate-600 dark:text-slate-300">
                <span>
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data?.totalCount ?? 0)} of {data?.totalCount.toLocaleString("en-IN")}
                </span>
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

      <PaymentsDialog
        open={Boolean(opened)}
        wide
        kicker={opened ? opened.invoiceNumber : "Invoice"}
        title={opened ? `${opened.studentName} · ${opened.feeName}${opened.periodLabel ? ` · ${opened.periodLabel}` : ""}` : ""}
        onClose={() => { if (!cancelMutation.isPending) setOpenId(null); }}
        footer={
          opened ? (
            cancelling ? (
              <>
                <button type="button" className="math-button-secondary" disabled={cancelMutation.isPending} onClick={() => setCancelling(false)}>Keep invoice</button>
                <button type="button" className="math-button-primary !bg-rose-600 hover:!bg-rose-700" disabled={!cancelReason.trim() || cancelMutation.isPending} onClick={() => cancelMutation.mutate(opened)}>
                  {cancelMutation.isPending ? <Loader2 size={17} className="animate-spin" /> : <Ban size={17} />}Cancel {opened.invoiceNumber}
                </button>
              </>
            ) : (
              <>
                {opened.status !== "CANCELLED" ? (
                  <button type="button" className="math-button-secondary" onClick={() => { setCancelling(true); cancelMutation.reset(); }}><Ban size={17} />Cancel invoice</button>
                ) : null}
                {opened.balancePaise > 0 ? (
                  <Link href={`/admin/payments/collections?tab=student-fees&studentId=${encodeURIComponent(opened.studentId)}&pay=${encodeURIComponent(opened.invoiceId)}`} className="math-button-secondary"><HandCoins size={17} />Record Payment</Link>
                ) : null}
                <button type="button" className="math-button-primary" disabled={pdfOne.isPending} onClick={() => pdfOne.mutate(opened)}>
                  {pdfOne.isPending ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}Download PDF
                </button>
              </>
            )
          ) : null
        }
      >
        {opened ? (
          <div className="grid gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <InvoiceStatusChip invoice={opened} />
              {opened.source === "MIGRATED" ? <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-black text-violet-700 dark:bg-violet-950/40 dark:text-violet-200">From old platform</span> : null}
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              {[
                ["Invoice date", FormatDate(opened.invoiceDate)],
                ["Due date", FormatDate(opened.dueDate)],
                ["Student ID", opened.studentCode],
                ["Level", opened.levelCode ?? "—"],
                ["Centre", opened.centreName ?? "Not set"],
                ["Issued by", opened.createdByName ?? "—"],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">{label}</dt>
                  <dd className="mt-0.5 break-words font-bold text-slate-900 dark:text-white">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900/60">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{opened.description}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums sm:max-w-sm sm:ml-auto">
                <dt className="font-semibold text-slate-600 dark:text-slate-300">Taxable amount</dt><dd className="text-right font-bold">{opened.taxableDisplay}</dd>
                <dt className="font-semibold text-slate-600 dark:text-slate-300">CGST</dt><dd className="text-right font-bold">{opened.cgstDisplay}</dd>
                <dt className="font-semibold text-slate-600 dark:text-slate-300">SGST</dt><dd className="text-right font-bold">{opened.sgstDisplay}</dd>
                <div className="col-span-2 my-0.5 border-t border-slate-200 dark:border-slate-700" aria-hidden="true" />
                <dt className="font-black text-slate-900 dark:text-white">Total</dt><dd className="text-right font-black text-slate-900 dark:text-white">{opened.amountDisplay}</dd>
                <dt className="font-semibold text-slate-600 dark:text-slate-300">Paid</dt><dd className="text-right font-bold">{opened.paidDisplay}</dd>
                {opened.discountPaise ? (<><dt className="font-semibold text-slate-600 dark:text-slate-300">Discount</dt><dd className="text-right font-bold">{opened.discountDisplay}</dd></>) : null}
                <dt className="font-black text-slate-900 dark:text-white">Balance due</dt><dd className="text-right font-black text-slate-900 dark:text-white">{opened.balanceDisplay}</dd>
              </dl>
            </div>
            {opened.status === "CANCELLED" ? (
              <p className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300">
                Cancelled {opened.cancelledAt ? new Date(opened.cancelledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : ""}
                {opened.cancelledByName ? ` by ${opened.cancelledByName}` : ""}. Reason: {opened.cancelReason}
              </p>
            ) : null}

            {cancelling ? (
              <label className="block">
                <FieldLabel hint="required, kept in the history">Why is it being cancelled?</FieldLabel>
                <input className="math-input" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="e.g. invoiced for the wrong month" autoFocus />
                <span className="mt-1.5 block text-xs font-semibold text-slate-500">
                  The invoice stays on record marked Cancelled, and {opened.invoiceNumber} is never reused.
                  {opened.paidPaise > 0 ? ` The ${opened.paidDisplay} paid on it becomes the student's advance, applied to their next invoices.` : ""}
                </span>
              </label>
            ) : null}
            <InlineError error={cancelMutation.error || pdfOne.error} />
            <div>
              <h3 className="mb-2 text-sm font-black text-slate-800 dark:text-slate-100">History</h3>
              <PaymentsHistoryList entityType="INVOICE" entityId={opened.invoiceId} limit={20} />
            </div>
          </div>
        ) : null}
      </PaymentsDialog>
    </>
  );
}
