"use client";

// Moved into a panel 2026-10-08 (Phase 4): shown as a tab of its Payments
// section; the page wrapper (menu, sub-tabs) is the section page.
// 2026-10-08 (Payments Phase 2): Generate Invoices. Pick the fee items (and
// the month, for a monthly fee), pick the students, preview exactly what will
// be created and what will be skipped (and why), then confirm. The server
// re-checks everything on confirm, and the same confirm press can never
// create a second set (idempotency key per preview).
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { FieldLabel, InlineError, PaymentsDialog, PaymentsMetric } from "@/components/payments/PaymentsUi";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import {
  downloadInvoicesPdf,
  generateInvoices,
  getPaymentSettings,
  listFeeItems,
  listInvoiceStudentOptions,
  previewInvoices,
  saveBlob,
  type InvoiceBatchResult,
  type InvoicePreview,
  type InvoiceRunRequest,
} from "@/lib/api/payments";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Download,
  FilePlus2,
  FileText,
  Loader2,
  Search,
  Tag,
  UsersRound,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function TodayInIndia(): string {
  // en-CA gives YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function AddDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

function NewKey(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    // fall through
  }
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function FormatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function GenerateInvoicesPanel() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const queryClient = useQueryClient();
  const today = TodayInIndia();
  const [thisYear, thisMonth] = today.split("-").map(Number);

  const [feeIds, setFeeIds] = useState<string[]>([]);
  const [month, setMonth] = useState<number>(thisMonth);
  const [year, setYear] = useState<number>(thisYear);
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState(AddDays(today, 10));
  const [dueTouched, setDueTouched] = useState(false);
  const [allowRepeat, setAllowRepeat] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [centre, setCentre] = useState("ALL");
  const [moduleCode, setModuleCode] = useState("ALL");
  const [levelCode, setLevelCode] = useState("ALL");
  const [teacher, setTeacher] = useState("ALL");
  const [batch, setBatch] = useState("ALL");
  const [showInactive, setShowInactive] = useState(false);

  const [preview, setPreview] = useState<InvoicePreview | null>(null);
  const [previewKey, setPreviewKey] = useState<string>("");
  const [result, setResult] = useState<InvoiceBatchResult | null>(null);

  const feeQuery = useQuery({ queryKey: ["admin", "payments", "fee-items"], queryFn: listFeeItems, enabled: ready });
  const studentsQuery = useQuery({ queryKey: ["admin", "payments", "invoice-students"], queryFn: listInvoiceStudentOptions, enabled: ready });
  const settingsQuery = useQuery({ queryKey: ["admin", "payments", "settings"], queryFn: getPaymentSettings, enabled: ready });

  const activeFees = (feeQuery.data ?? []).filter((item) => item.isActive);
  const chosenFees = activeFees.filter((item) => feeIds.includes(item.feeItemId));
  const hasMonthly = chosenFees.some((item) => item.billingType === "MONTHLY");
  const hasOneTime = chosenFees.some((item) => item.billingType === "ONE_TIME");
  const students = useMemo(() => studentsQuery.data ?? [], [studentsQuery.data]);
  const invoiceNumbering = settingsQuery.data?.numbering.find((row) => row.key === "INVOICE");

  // A link from a student's page can preselect them: ?studentId=...
  useEffect(() => {
    if (!students.length) return;
    const studentId = new URLSearchParams(window.location.search).get("studentId");
    if (studentId && students.some((row) => row.studentId === studentId)) {
      setSelected(new Set([studentId]));
      setShowInactive(true);
    }
  }, [students]);

  useEffect(() => {
    if (!dueTouched && /^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) setDueDate(AddDays(invoiceDate, 10));
  }, [invoiceDate, dueTouched]);

  const options = useMemo(() => {
    const unique = (values: (string | null | undefined)[]) => Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
    const batches = new Map<string, string>();
    students.forEach((row) => row.batches.forEach((item) => batches.set(item.batchId, item.batchName)));
    const centres = new Map<string, string>();
    students.forEach((row) => row.centreId && row.centreName && centres.set(row.centreId, row.centreName));
    return {
      modules: unique(students.map((row) => row.moduleCode)),
      levels: unique(students.filter((row) => moduleCode === "ALL" || row.moduleCode === moduleCode).map((row) => row.levelCode)),
      teachers: unique(students.map((row) => row.teacherName)),
      batches: Array.from(batches.entries()).sort((a, b) => a[1].localeCompare(b[1])),
      centres: Array.from(centres.entries()).sort((a, b) => a[1].localeCompare(b[1])),
    };
  }, [students, moduleCode]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return students.filter((row) => {
      if (!showInactive && !row.isActive) return false;
      if (centre === "NONE" ? row.centreId : centre !== "ALL" && row.centreId !== centre) return false;
      if (moduleCode !== "ALL" && row.moduleCode !== moduleCode) return false;
      if (levelCode !== "ALL" && row.levelCode !== levelCode) return false;
      if (teacher !== "ALL" && row.teacherName !== teacher) return false;
      if (batch !== "ALL" && !row.batches.some((item) => item.batchId === batch)) return false;
      if (needle && ![row.studentName, row.studentCode, row.customId ?? ""].some((value) => value.toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [students, search, centre, moduleCode, levelCode, teacher, batch, showInactive]);

  const allVisibleSelected = visible.length > 0 && visible.every((row) => selected.has(row.studentId));
  const toggleVisible = () => {
    const next = new Set(selected);
    if (allVisibleSelected) visible.forEach((row) => next.delete(row.studentId));
    else visible.forEach((row) => next.add(row.studentId));
    setSelected(next);
  };
  const toggleOne = (studentId: string) => {
    const next = new Set(selected);
    if (next.has(studentId)) next.delete(studentId);
    else next.add(studentId);
    setSelected(next);
  };

  const request: InvoiceRunRequest = {
    feeItemIds: feeIds,
    studentIds: Array.from(selected),
    billingMonth: hasMonthly ? month : null,
    billingYear: hasMonthly ? year : null,
    invoiceDate,
    dueDate,
    allowRepeatOneTime: allowRepeat,
  };

  const problems: string[] = [];
  if (!feeIds.length) problems.push("Choose at least one fee item.");
  if (!selected.size) problems.push("Choose at least one student.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) problems.push("Enter the invoice date.");
  if (dueDate && dueDate < invoiceDate) problems.push("The due date cannot be before the invoice date.");

  const previewMutation = useMutation({
    mutationFn: () => previewInvoices(request),
    onSuccess: (data) => {
      setPreviewKey(NewKey());
      setPreview(data);
      generateMutation.reset();
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => generateInvoices({ ...request, idempotencyKey: previewKey }),
    onSuccess: (data) => {
      // A double click sends the same key twice: the second answer is a
      // replay of the first, so keep the first (it has the skipped list).
      setResult((previous) => (data.replayed && previous?.batchId === data.batchId ? previous : data));
      setPreview(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "payments", "invoices"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "payments", "settings"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "payments", "audit"] });
    },
  });

  const pdfMutation = useMutation({
    mutationFn: (batchId: string) => downloadInvoicesPdf({ filters: { batchId } }),
    onSuccess: (blob) => saveBlob(blob, `MathPath-Invoices-${result?.firstNumber ?? "batch"}.pdf`),
  });

  const startAgain = () => {
    setResult(null);
    setSelected(new Set());
    pdfMutation.reset();
  };

  if (!ready) return null;
  const loading = feeQuery.isLoading || studentsQuery.isLoading;
  const failed = feeQuery.error || studentsQuery.error;
  const years = [thisYear - 1, thisYear, thisYear + 1];

  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="math-block-header"><Wallet size={14} />Payments</p>
            <h1 className="math-title">Generate Invoices</h1>
            <p className="math-subtitle">One invoice per student for each fee you choose. You will see exactly what is created, and what is skipped, before anything is saved.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:shrink-0">
            <PaymentsMetric label="Students" value={selected.size} icon={<UsersRound size={14} />} tone="cyan" />
            <PaymentsMetric label="Fee items" value={feeIds.length} icon={<FilePlus2 size={14} />} tone="emerald" />
          </div>
        </div>
      </section>

      {invoiceNumbering && !invoiceNumbering.isConfigured ? (
        <div role="alert" className="mt-6 flex flex-col gap-3 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-start gap-2"><AlertTriangle size={18} className="mt-0.5 shrink-0" />The starting invoice number is not set yet, so invoices cannot be created. Set it once in Payment Settings (it continues the old platform&apos;s numbers).</span>
          <Link href="/admin/payments/settings?tab=numbering" className="math-button-secondary whitespace-nowrap">Open Payment Settings</Link>
        </div>
      ) : null}

      {result ? (
        <section className="mt-6 math-card p-5 sm:p-6" aria-live="polite">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={28} className="shrink-0 text-emerald-600 dark:text-emerald-300" />
            <div className="min-w-0">
              <h2 className="text-2xl font-black text-slate-950 dark:text-white">
                {result.invoiceCount} {result.invoiceCount === 1 ? "invoice" : "invoices"} created
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
                {result.firstNumber === result.lastNumber ? result.firstNumber : `${result.firstNumber} to ${result.lastNumber}`} · total {result.totalDisplay}
                {result.skippedCount ? ` · ${result.skippedCount} skipped` : ""}
                {result.replayed ? " · these were already created by this same confirm" : ""}
                {result.advanceAppliedPaise ? ` · ${result.advanceAppliedDisplay} of advance applied` : ""}
              </p>
            </div>
          </div>
          {result.skipped.length ? (
            <details className="mt-4 rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
              <summary className="cursor-pointer text-sm font-black text-slate-700 dark:text-slate-200">Skipped ({result.skipped.length})</summary>
              <ul className="mt-2 grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                {result.skipped.map((line) => (
                  <li key={`${line.studentId}-${line.feeItemId}`}>{line.studentName} · {line.feeName}: {line.reason}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href={`/admin/payments/invoices?tab=all&batchId=${encodeURIComponent(result.batchId)}`} className="math-button-primary"><FileText size={17} />View these invoices</Link>
            <button type="button" className="math-button-secondary" disabled={pdfMutation.isPending} onClick={() => pdfMutation.mutate(result.batchId)}>
              {pdfMutation.isPending ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}Download all as PDF
            </button>
            <button type="button" className="math-button-secondary" onClick={startAgain}><FilePlus2 size={17} />Generate more</button>
          </div>
          {pdfMutation.error ? <div className="mt-3"><InlineError error={pdfMutation.error} /></div> : null}
        </section>
      ) : loading ? (
        <div className="mt-6"><LoadingState label="Loading fee items and students..." /></div>
      ) : failed ? (
        <div className="mt-6"><ErrorState message="Fee items or students could not be loaded. Refresh the page to try again." /></div>
      ) : (
        <>
          <section className="mt-6 math-card p-5 sm:p-6">
            <p className="math-block-header"><FilePlus2 size={14} />Step 1</p>
            <h2 className="text-2xl font-black text-slate-950 dark:text-white">What to invoice</h2>
            {!activeFees.length ? (
              <div className="mt-4">
                <EmptyState title="No fee items yet" description="Add fee items in Fee Setup first, then come back here." />
              </div>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {activeFees.map((item) => {
                  const checked = feeIds.includes(item.feeItemId);
                  return (
                    <label
                      key={item.feeItemId}
                      className={`flex cursor-pointer items-start gap-3 rounded-3xl border px-4 py-3 transition ${checked ? "border-cyan-400 bg-cyan-50/70 dark:border-cyan-600 dark:bg-cyan-950/30" : "border-slate-200 bg-white/70 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/50"}`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0"
                        checked={checked}
                        onChange={() => setFeeIds(checked ? feeIds.filter((id) => id !== item.feeItemId) : [...feeIds, item.feeItemId])}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="font-black text-slate-900 dark:text-white">{item.name}</span>
                          <span className="shrink-0 font-black tabular-nums text-slate-950 dark:text-white">{item.amountDisplay}</span>
                        </span>
                        <span className="mt-1 flex items-center gap-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                          {item.billingType === "MONTHLY" ? <><CalendarClock size={12} />Monthly</> : <><Tag size={12} />One-time</>}
                          {item.gstIncluded ? " · 18% GST included" : " · No GST"}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {hasMonthly ? (
                <div className="grid grid-cols-2 gap-3 sm:col-span-2 xl:col-span-2">
                  <label className="block">
                    <FieldLabel>Month (monthly fee)</FieldLabel>
                    <select className="math-input" value={month} onChange={(event) => setMonth(Number(event.target.value))}>
                      {MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <FieldLabel>Year</FieldLabel>
                    <select className="math-input" value={year} onChange={(event) => setYear(Number(event.target.value))}>
                      {years.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                </div>
              ) : null}
              <label className="block">
                <FieldLabel>Invoice date</FieldLabel>
                <input type="date" className="math-input" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} />
              </label>
              <label className="block">
                <FieldLabel hint="10 days by default">Due date</FieldLabel>
                <input type="date" className="math-input" value={dueDate} min={invoiceDate} onChange={(event) => { setDueTouched(true); setDueDate(event.target.value); }} />
              </label>
            </div>
            {hasOneTime ? (
              <label className="mt-4 inline-flex cursor-pointer items-start gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={allowRepeat} onChange={(event) => setAllowRepeat(event.target.checked)} />
                <span>Allow a second invoice for one-time items a student already has<span className="block text-xs font-semibold text-slate-500">e.g. a replacement bag. Leave off to skip students who already have it.</span></span>
              </label>
            ) : null}
          </section>

          <section className="mt-6 math-card p-5 sm:p-6">
            <div className="flex flex-col gap-1">
              <p className="math-block-header"><UsersRound size={14} />Step 2</p>
              <h2 className="text-2xl font-black text-slate-950 dark:text-white">Who to invoice</h2>
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{selected.size} selected of {students.filter((row) => row.isActive).length} active students.</p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 2xl:grid-cols-6">
              <div className="relative sm:col-span-2 lg:col-span-5 2xl:col-span-1">
                <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className="math-input pl-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or student ID" aria-label="Search students" />
              </div>
              <select className="math-input" value={centre} onChange={(event) => setCentre(event.target.value)} aria-label="Centre">
                <option value="ALL">All centres</option>
                {options.centres.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                <option value="NONE">No centre set</option>
              </select>
              <select className="math-input" value={moduleCode} onChange={(event) => { setModuleCode(event.target.value); setLevelCode("ALL"); }} aria-label="Module">
                <option value="ALL">All modules</option>
                {options.modules.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <select className="math-input" value={levelCode} onChange={(event) => setLevelCode(event.target.value)} aria-label="Level">
                <option value="ALL">All levels</option>
                {options.levels.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <select className="math-input" value={teacher} onChange={(event) => setTeacher(event.target.value)} aria-label="Teacher">
                <option value="ALL">All teachers</option>
                {options.teachers.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <select className="math-input" value={batch} onChange={(event) => setBatch(event.target.value)} aria-label="Batch">
                <option value="ALL">All batches</option>
                {options.batches.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" className="math-role-action-button h-9 px-3 text-xs" onClick={toggleVisible} disabled={!visible.length}>
                {allVisibleSelected ? "Unselect shown" : `Select all shown (${visible.length})`}
              </button>
              {selected.size ? <button type="button" className="math-role-action-button h-9 px-3 text-xs" onClick={() => setSelected(new Set())}>Clear selection</button> : null}
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
                <input type="checkbox" className="h-4 w-4" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
                Show inactive students
              </label>
            </div>

            <div className="mt-4 max-h-[560px] overflow-y-auto rounded-3xl border border-slate-200 dark:border-slate-800">
              {!visible.length ? (
                <p className="px-4 py-8 text-center text-sm font-semibold text-slate-500">No students match these filters.</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visible.map((row) => (
                    <li key={row.studentId}>
                      <label className={`flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-900/60 ${row.isActive ? "" : "opacity-60"}`}>
                        <input type="checkbox" className="h-4 w-4 shrink-0" checked={selected.has(row.studentId)} onChange={() => toggleOne(row.studentId)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-black text-slate-900 dark:text-white">{row.studentName}{row.isActive ? "" : " (inactive)"}</span>
                          <span className="block truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {[row.studentCode, row.levelCode, row.centreName ?? "No centre", row.teacherName].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="sticky bottom-3 z-20 mt-6 math-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {problems.length ? problems[0] : `${selected.size} ${selected.size === 1 ? "student" : "students"} × ${feeIds.length} ${feeIds.length === 1 ? "fee item" : "fee items"}${hasMonthly ? ` for ${MONTHS[month - 1]} ${year}` : ""}`}
            </div>
            <button type="button" className="math-button-primary whitespace-nowrap" disabled={Boolean(problems.length) || previewMutation.isPending} onClick={() => previewMutation.mutate()}>
              {previewMutation.isPending ? <Loader2 size={17} className="animate-spin" /> : <FileText size={17} />}Preview invoices
            </button>
          </section>
          {previewMutation.error ? <div className="mt-3"><InlineError error={previewMutation.error} /></div> : null}
        </>
      )}

      <PaymentsDialog
        open={Boolean(preview)}
        wide
        kicker="Preview"
        title={preview ? (preview.invoiceCount ? `Create ${preview.invoiceCount} ${preview.invoiceCount === 1 ? "invoice" : "invoices"}?` : "Nothing new to invoice") : ""}
        onClose={() => { if (!generateMutation.isPending) setPreview(null); }}
        footer={
          <>
            <button type="button" className="math-button-secondary" disabled={generateMutation.isPending} onClick={() => setPreview(null)}>Back</button>
            <button
              type="button"
              className="math-button-primary"
              disabled={!preview?.invoiceCount || !preview?.numberingReady || generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
            >
              {generateMutation.isPending ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
              {preview?.invoiceCount ? `Create ${preview.invoiceCount} ${preview.invoiceCount === 1 ? "invoice" : "invoices"}` : "Create"}
            </button>
          </>
        }
      >
        {preview ? (
          <div className="grid gap-4">
            {!preview.numberingReady ? (
              <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                The starting invoice number is not set yet. <Link href="/admin/payments/settings?tab=numbering" className="underline">Set it in Payment Settings</Link>, then preview again.
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <PaymentsMetric label="Invoices" value={preview.invoiceCount} icon={<FileText size={14} />} tone="emerald" />
              <PaymentsMetric label="Students" value={preview.studentsInvoiced} icon={<UsersRound size={14} />} tone="cyan" />
              <PaymentsMetric label="Skipped" value={preview.skippedCount} icon={<AlertTriangle size={14} />} tone="amber" />
              <PaymentsMetric label="Total" value={<span className="text-lg sm:text-xl">{preview.totalDisplay}</span>} icon={<Wallet size={14} />} />
            </div>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              Dated {FormatDate(preview.invoiceDate)}, due {FormatDate(preview.dueDate)}
              {preview.periodLabel ? ` · monthly fee for ${preview.periodLabel}` : ""}
              {preview.nextNumber && preview.invoiceCount ? ` · numbers from ${preview.nextNumber}` : ""}.
            </p>
            {preview.advanceAppliedPaise ? (
              <p className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-900 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-100">
                {preview.advanceAppliedDisplay} of advance held by {preview.advanceStudents} {preview.advanceStudents === 1 ? "student" : "students"} will be applied to these invoices straight away.
              </p>
            ) : null}
            {preview.skipped.length ? (
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">Skipped ({preview.skipped.length})</h3>
                <ul className="mt-2 grid max-h-48 gap-1 overflow-y-auto rounded-2xl bg-amber-50/70 px-4 py-3 text-xs font-semibold text-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
                  {preview.skipped.map((line) => (
                    <li key={`${line.studentId}-${line.feeItemId}`}><span className="font-black">{line.studentName}</span> · {line.feeName}: {line.reason}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {preview.invoices.length ? (
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">To be created ({preview.invoices.length})</h3>
                <ul className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                  {preview.invoices.map((line) => (
                    <li key={`${line.studentId}-${line.feeItemId}`} className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="font-black text-slate-900 dark:text-white">{line.studentName}</span>
                        <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">{line.feeName}{line.periodLabel ? ` · ${line.periodLabel}` : ""}</span>
                      </span>
                      <span className="shrink-0 text-right font-black tabular-nums text-slate-900 dark:text-white">
                        {line.amountDisplay}
                        {line.advanceDisplay ? <span className="block text-xs font-semibold text-violet-700 dark:text-violet-300">{line.advanceDisplay} from advance</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <InlineError error={generateMutation.error} />
          </div>
        ) : null}
      </PaymentsDialog>
    </>
  );
}
