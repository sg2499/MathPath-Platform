"use client";

// 2026-10-08 (Payments Phase 4): Reports > Dues -- every student who owes
// money, with each unpaid invoice, how overdue it is (aged 1-30 / 31-60 /
// 61-90 / 90+ days), a ready-to-paste reminder message, Record Payment, and
// Excel. Opened with ?bucket=D31_60 from the Overview, it starts filtered.
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { BUCKET_COLOURS } from "@/components/payments/panels/OverviewPanel";
import { InlineError, PaymentsMetric } from "@/components/payments/PaymentsUi";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import {
  downloadDuesExcel,
  getDuesReport,
  getPaymentSettings,
  listFeeItems,
  listInvoiceStudentOptions,
  saveBlob,
  type DuesFilters,
  type DuesStudent,
} from "@/lib/api/payments";
import { FormatDate } from "@/lib/paymentsDates";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, Check, ChevronDown, ChevronUp, Copy, FileSpreadsheet, FileText, HandCoins, Loader2, Search, UsersRound, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function ReminderText(row: DuesStudent, brand: string): string {
  const lines = row.invoices.map((invoice) => `• ${invoice.feeName}${invoice.periodLabel ? ` (${invoice.periodLabel})` : ""}: ${invoice.balanceDisplay}${invoice.dueDate ? `, due ${FormatDate(invoice.dueDate)}` : ""}`);
  return [
    `Dear ${row.parentName || "Parent"},`,
    "",
    `This is a gentle reminder from ${brand} that ${row.dueDisplay} is due for ${row.studentName} (${row.studentCode}):`,
    ...lines,
    "",
    "Please pay at the centre or let us know if you have already paid. Thank you.",
  ].join("\n");
}

async function CopyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / insecure context: copy through a hidden text box.
    const box = document.createElement("textarea");
    box.value = text;
    box.style.position = "fixed";
    box.style.opacity = "0";
    document.body.appendChild(box);
    box.select();
    let done = false;
    try {
      done = document.execCommand("copy");
    } catch {
      done = false;
    }
    box.remove();
    return done;
  }
}

function AgeChip({ days, label, bucket }: { days: number; label: string; bucket: keyof typeof BUCKET_COLOURS }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700 dark:bg-slate-900 dark:text-slate-200">
      <span className="h-2 w-2 rounded-full" style={{ background: BUCKET_COLOURS[bucket] }} aria-hidden="true" />
      {days > 0 ? `${days} ${days === 1 ? "day" : "days"} overdue` : label}
    </span>
  );
}

export function DuesPanel() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const [bucket, setBucket] = useState("");
  const [search, setSearch] = useState("");
  const [centreId, setCentreId] = useState("");
  const [levelCode, setLevelCode] = useState("");
  const [feeItemId, setFeeItemId] = useState("");
  const [sort, setSort] = useState("due");
  const [activeOnly, setActiveOnly] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState<string | null>(null);
  const debounced = useDebounced(search);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("bucket");
    if (fromUrl) setBucket(fromUrl);
  }, []);

  const filters: DuesFilters = useMemo(
    () => ({ bucket, search: debounced.trim(), centreId, levelCode, feeItemId, sort, activeOnly: activeOnly ? "true" : "" }),
    [bucket, debounced, centreId, levelCode, feeItemId, sort, activeOnly]
  );
  const query = useQuery({ queryKey: ["admin", "payments", "dues", filters], queryFn: () => getDuesReport(filters), enabled: ready, placeholderData: keepPreviousData });
  const settingsQuery = useQuery({ queryKey: ["admin", "payments", "settings"], queryFn: getPaymentSettings, enabled: ready });
  const feeQuery = useQuery({ queryKey: ["admin", "payments", "fee-items"], queryFn: listFeeItems, enabled: ready });
  const studentsQuery = useQuery({ queryKey: ["admin", "payments", "invoice-students"], queryFn: listInvoiceStudentOptions, enabled: ready });
  const excel = useMutation({ mutationFn: () => downloadDuesExcel(filters), onSuccess: (blob) => saveBlob(blob, `MathPath-Dues-${query.data?.asOf ?? "today"}.xlsx`) });
  const data = query.data;
  const brand = settingsQuery.data?.business.brandName || settingsQuery.data?.business.legalName || "MathPath";
  const levels = useMemo(() => Array.from(new Set((studentsQuery.data ?? []).map((row) => row.levelCode).filter((value): value is string => Boolean(value)))).sort(), [studentsQuery.data]);

  const toggle = (studentId: string) => {
    const next = new Set(open);
    if (next.has(studentId)) next.delete(studentId);
    else next.add(studentId);
    setOpen(next);
  };
  const copy = async (row: DuesStudent) => {
    const ok = await CopyText(ReminderText(row, brand));
    setCopied(ok ? row.studentId : null);
    setCopyFailed(ok ? null : row.studentId);
    if (ok) window.setTimeout(() => setCopied((current) => (current === row.studentId ? null : current)), 2500);
  };

  if (!ready) return null;

  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="math-block-header"><BarChart3 size={14} />Reports</p>
            <h1 className="math-title">Dues</h1>
            <p className="math-subtitle">Every student who owes money, and how overdue it is{data ? `, as of ${FormatDate(data.asOf)}` : ""}.</p>
          </div>
          {data ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:shrink-0">
              <PaymentsMetric label="Due" value={<span className="text-lg sm:text-xl">{data.total.display}</span>} icon={<Wallet size={14} />} tone="amber" />
              <PaymentsMetric label="Overdue" value={<span className="text-lg sm:text-xl">{data.overdue.display}</span>} icon={<AlertTriangle size={14} />} tone="amber" />
              <PaymentsMetric label="Students" value={data.studentCount} icon={<UsersRound size={14} />} tone="cyan" />
              <PaymentsMetric label="Invoices" value={data.invoiceCount} icon={<FileText size={14} />} />
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-6 math-card p-5 sm:p-6">
        <div role="tablist" aria-label="Age" className="flex gap-2 overflow-x-auto pb-1">
          {[{ bucket: "", label: "All", display: data && !bucket ? data.total.display : "" }, ...(data?.buckets ?? [])].map((row) => {
            const selected = bucket === row.bucket;
            return (
              <button key={row.bucket || "ALL"} type="button" role="tab" aria-selected={selected} onClick={() => setBucket(row.bucket)} className={`math-role-tab-button math-admin-tab-force inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl px-4 py-2 text-sm font-black transition ${selected ? "is-active math-admin-tab-force-selected" : ""}`}>
                {row.bucket ? <span className="h-2 w-2 rounded-full" style={{ background: BUCKET_COLOURS[row.bucket as keyof typeof BUCKET_COLOURS] }} aria-hidden="true" /> : null}
                {row.label}
                {row.bucket && !bucket ? <span className="tabular-nums opacity-80">{row.display}</span> : null}
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="math-input pl-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Student, parent or mobile" aria-label="Search dues" />
          </div>
          <select className="math-input" value={centreId} onChange={(event) => setCentreId(event.target.value)} aria-label="Centre">
            <option value="">All centres</option>
            {(settingsQuery.data?.centres ?? []).map((centre) => <option key={centre.centreId} value={centre.centreId}>{centre.name}</option>)}
            <option value="NONE">No centre set</option>
          </select>
          <select className="math-input" value={levelCode} onChange={(event) => setLevelCode(event.target.value)} aria-label="Level">
            <option value="">All levels</option>
            {levels.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select className="math-input" value={feeItemId} onChange={(event) => setFeeItemId(event.target.value)} aria-label="Fee item">
            <option value="">All fee items</option>
            {(feeQuery.data ?? []).map((item) => <option key={item.feeItemId} value={item.feeItemId}>{item.name}</option>)}
          </select>
          <select className="math-input" value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort by">
            <option value="due">Most due first</option>
            <option value="overdue">Longest overdue first</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
            <input type="checkbox" className="h-4 w-4" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} />
            Active students only
          </label>
          <button type="button" className="math-button-secondary whitespace-nowrap" disabled={excel.isPending || !data?.studentCount} onClick={() => excel.mutate()}>
            {excel.isPending ? <Loader2 size={17} className="animate-spin" /> : <FileSpreadsheet size={17} />}Excel
          </button>
        </div>
        {excel.error ? <div className="mt-3"><InlineError error={excel.error} /></div> : null}

        <div className="mt-5">
          {query.isLoading ? (
            <LoadingState label="Loading dues..." />
          ) : query.error ? (
            <InlineError error={query.error} />
          ) : !data?.students.length ? (
            <EmptyState title="Nothing due" description={bucket || search || centreId || levelCode || feeItemId ? "No dues match these filters." : "Every invoice is paid."} />
          ) : (
            <ul className="grid gap-3">
              {data.students.map((row) => {
                const expanded = open.has(row.studentId);
                return (
                  <li key={row.studentId} className="rounded-3xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <Link href={`/admin/payments/collections?tab=student-fees&studentId=${encodeURIComponent(row.studentId)}`} className="font-black text-slate-900 hover:underline dark:text-white">
                          {row.studentName}{row.isActive ? "" : " (inactive)"}
                        </Link>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {[row.studentCode, row.levelCode, row.centreName ?? "No centre", row.parentName, row.mobile].filter(Boolean).join(" · ")}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <AgeChip days={row.maxDaysOverdue} label={row.bucketLabel} bucket={row.bucket} />
                          <span className="text-xs font-semibold text-slate-500">{row.invoices.length} {row.invoices.length === 1 ? "invoice" : "invoices"}{row.oldestDueDate ? ` · oldest due ${FormatDate(row.oldestDueDate)}` : ""}</span>
                          {row.advancePaise ? <span className="text-xs font-bold text-violet-700 dark:text-violet-300">{row.advanceDisplay} advance held</span> : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <span className="mr-1 text-xl font-black tabular-nums text-slate-950 dark:text-white">{row.dueDisplay}</span>
                        <button type="button" className="math-role-action-button h-9 px-3 text-xs" onClick={() => toggle(row.studentId)} aria-expanded={expanded}>
                          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}Invoices
                        </button>
                        <button type="button" className="math-role-action-button h-9 px-3 text-xs" onClick={() => copy(row)}>
                          {copied === row.studentId ? <Check size={13} /> : <Copy size={13} />}{copied === row.studentId ? "Copied" : "Copy reminder"}
                        </button>
                        <Link href={`/admin/payments/collections?tab=student-fees&studentId=${encodeURIComponent(row.studentId)}${row.invoices.length === 1 ? `&pay=${encodeURIComponent(row.invoices[0].invoiceId)}` : ""}`} className="math-role-action-button h-9 px-3 text-xs">
                          <HandCoins size={13} />Record Payment
                        </Link>
                      </div>
                    </div>
                    {copyFailed === row.studentId ? (
                      <div className="mt-3">
                        <p className="mb-1 text-xs font-bold text-amber-700 dark:text-amber-300">This browser blocked copying. Select the text below and copy it.</p>
                        <textarea readOnly className="math-input min-h-[140px] text-xs" value={ReminderText(row, brand)} onFocus={(event) => event.currentTarget.select()} />
                      </div>
                    ) : null}
                    {expanded ? (
                      <ul className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                        {row.invoices.map((invoice) => (
                          <li key={invoice.invoiceId} className="flex flex-col gap-1 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                            <span className="min-w-0">
                              <span className="font-bold text-slate-900 dark:text-white">{invoice.feeName}{invoice.periodLabel ? ` · ${invoice.periodLabel}` : ""}</span>
                              <span className="block text-xs font-semibold text-slate-500">{invoice.invoiceNumber} · due {FormatDate(invoice.dueDate)}</span>
                            </span>
                            <span className="flex items-center gap-3">
                              <AgeChip days={invoice.daysOverdue} label={invoice.bucketLabel} bucket={invoice.bucket} />
                              <span className="font-black tabular-nums">{invoice.balanceDisplay}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
