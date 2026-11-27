"use client";

// 2026-11-27 (billing Release 2, Shailesh): Reports › Ledgers.
//   Monthly Tuition  who was billed for a month, at what fee, what is
//                    collected and what is unpaid, each with its invoice.
//   Student Ledger   every invoice and payment with a running balance, for
//                    one student or all, by centre and dates.
//   Invoice Register one row per invoice line (Excel).
import { HeroSearch } from "@/components/payments/CommandPalette";
import { EmptyState } from "@/components/common/EmptyState";
import { FieldLabel, InlineError, PaymentsLoading, PaymentsMetric } from "@/components/payments/PaymentsUi";
import { StudentLink } from "@/components/payments/StudentPanel";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import {
  downloadLedgerExcel,
  downloadRegisterExcel,
  downloadTuitionExcel,
  getStudentLedger,
  getTuitionReport,
  INVOICE_TYPE_LABELS,
  type LedgerFilters,
} from "@/lib/api/billing";
import { getPaymentSettings, listInvoiceStudentOptions, saveBlob } from "@/lib/api/payments";
import { FormatRupees } from "@/lib/paymentsMoney";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BookText, CalendarClock, FileSpreadsheet, Loader2, NotebookTabs, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

function TodayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function FormatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function Balance({ paise }: { paise: number }) {
  if (paise < 0) return <span className="text-emerald-700 dark:text-emerald-300">{FormatRupees(-paise)} advance</span>;
  return <span className={paise ? "text-amber-700 dark:text-amber-300" : ""}>{FormatRupees(paise)}</span>;
}

export function LedgersPanel() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const today = TodayInIndia();
  const [period, setPeriod] = useState(today.slice(0, 7));
  const [tuitionCentre, setTuitionCentre] = useState("");
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);
  const [ledger, setLedger] = useState<LedgerFilters>({});
  const [register, setRegister] = useState<{ centreId?: string; dateFrom?: string; dateTo?: string; invoiceType?: string; includeCancelled?: boolean }>({ dateFrom: `${today.slice(0, 7)}-01`, dateTo: today });

  const settings = useQuery({ queryKey: ["admin", "payments", "settings"], queryFn: getPaymentSettings, enabled: ready });
  const students = useQuery({ queryKey: ["admin", "payments", "invoice-students"], queryFn: listInvoiceStudentOptions, enabled: ready });
  const tuition = useQuery({ queryKey: ["admin", "payments", "reports", "tuition", period, tuitionCentre], queryFn: () => getTuitionReport(period, tuitionCentre || undefined), enabled: ready && /^\d{4}-\d{2}$/.test(period), retry: false });
  const ledgerQuery = useQuery({ queryKey: ["admin", "payments", "reports", "ledger", ledger], queryFn: () => getStudentLedger(ledger), enabled: ready });

  const tuitionExcel = useMutation({ mutationFn: () => downloadTuitionExcel(period, tuitionCentre || undefined), onSuccess: (blob) => saveBlob(blob, `MathPath-Tuition-${period}.xlsx`) });
  const ledgerExcel = useMutation({ mutationFn: () => downloadLedgerExcel(ledger), onSuccess: (blob) => saveBlob(blob, `MathPath-Student-Ledger-${today}.xlsx`) });
  const registerExcel = useMutation({ mutationFn: () => downloadRegisterExcel(register), onSuccess: (blob) => saveBlob(blob, `MathPath-Invoice-Register-${today}.xlsx`) });

  if (!ready) return null;
  const centres = settings.data?.centres ?? [];
  const report = tuition.data;
  const rows = (report?.rows ?? []).filter((row) => !onlyUnpaid || row.unpaidPaise > 0);
  const ledgerData = ledgerQuery.data;

  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="math-block-header"><NotebookTabs size={14} />Reports</p>
            <h1 className="math-title">Ledgers</h1>
            <p className="math-subtitle">Monthly tuition, each student&apos;s ledger and the invoice register, filtered by centre and dates, with Excel downloads.</p>
            <HeroSearch />
          </div>
          {report ? (
            <div className="grid grid-cols-3 gap-3 xl:shrink-0">
              <PaymentsMetric label={`Billed ${report.periodLabel.split(" ")[0]}`} value={<span className="text-lg sm:text-xl">{report.billedDisplay}</span>} icon={<Wallet size={14} />} tone="cyan" />
              <PaymentsMetric label="Collected" value={<span className="text-lg sm:text-xl">{report.collectedDisplay}</span>} icon={<Wallet size={14} />} tone="emerald" />
              <PaymentsMetric label="Unpaid" value={<span className="text-lg sm:text-xl">{report.unpaidDisplay}</span>} icon={<Wallet size={14} />} tone="amber" />
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-6 math-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="math-block-header"><CalendarClock size={14} />Monthly Tuition</p>
            <h2 className="text-xl font-black text-slate-950 dark:text-white">{report ? `${report.periodLabel}: ${report.billedCount} billed, ${report.paidCount} paid` : "Monthly tuition"}</h2>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block"><FieldLabel>Month</FieldLabel><input type="month" className="math-input" value={period} onChange={(event) => setPeriod(event.target.value)} /></label>
            <label className="block">
              <FieldLabel>Centre</FieldLabel>
              <select className="math-input" value={tuitionCentre} onChange={(event) => setTuitionCentre(event.target.value)}>
                <option value="">All Centres</option>
                {centres.map((centre) => <option key={centre.centreId} value={centre.centreId}>{centre.name}</option>)}
                <option value="NONE">No Centre Set</option>
              </select>
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 pb-3 text-sm font-bold text-slate-600 dark:text-slate-300"><input type="checkbox" className="h-4 w-4" checked={onlyUnpaid} onChange={(event) => setOnlyUnpaid(event.target.checked)} />Only unpaid</label>
            <button type="button" className="math-button-secondary" disabled={tuitionExcel.isPending || !report} onClick={() => tuitionExcel.mutate()}>{tuitionExcel.isPending ? <Loader2 size={17} className="animate-spin" /> : <FileSpreadsheet size={17} />}Excel</button>
          </div>
        </div>
        <InlineError error={tuition.error || tuitionExcel.error} />
        {report?.byRate.length ? (
          <ul className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
            {report.byRate.map((rate) => <li key={rate.label} className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 dark:bg-slate-900 dark:text-slate-200">{rate.label}: {rate.count} · billed {rate.billedDisplay} · collected {rate.collectedDisplay}</li>)}
          </ul>
        ) : null}
        <div className="mt-4">
          {tuition.isLoading ? (
            <PaymentsLoading label="Loading the month…" />
          ) : !rows.length ? (
            <EmptyState title={onlyUnpaid ? "Nothing Unpaid" : "Nobody Billed"} description="Monthly fees raised for this month show here, with admission invoices that carry the month." />
          ) : (
            <div className="max-h-[480px] overflow-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="sticky top-0 bg-white dark:bg-slate-950">
                  <tr className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                    <th className="px-2 py-2">Student</th>
                    <th className="px-2 py-2">Invoice</th>
                    <th className="px-2 py-2">Fee</th>
                    <th className="px-2 py-2 text-right">Billed</th>
                    <th className="px-2 py-2 text-right">Collected</th>
                    <th className="px-2 py-2 text-right">Unpaid</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.invoiceId} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-2 py-2.5"><StudentLink studentId={row.studentId}><span className="font-bold">{row.studentName}</span></StudentLink><div className="text-xs font-semibold text-slate-500">{[row.studentCode, row.levelCode, row.centreName].filter(Boolean).join(" · ")}</div></td>
                      <td className="px-2 py-2.5"><Link className="font-bold underline" href={`/admin/payments/invoices?tab=all&search=${encodeURIComponent(row.invoiceNumber)}&open=${encodeURIComponent(row.invoiceId)}`}>{row.invoiceNumber}</Link><div className="text-xs font-semibold text-slate-500">{row.type}</div></td>
                      <td className="px-2 py-2.5">{row.feeName}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{row.feeDisplay}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{row.paidDisplay}</td>
                      <td className={`px-2 py-2.5 text-right font-black tabular-nums ${row.unpaidPaise ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}>{row.unpaidPaise ? row.unpaidDisplay : "Paid"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="mt-6 math-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="math-block-header"><BookText size={14} />Student Ledger</p>
            <h2 className="text-xl font-black text-slate-950 dark:text-white">Invoices and payments, with the running balance</h2>
          </div>
          <button type="button" className="math-button-secondary" disabled={ledgerExcel.isPending} onClick={() => ledgerExcel.mutate()}>{ledgerExcel.isPending ? <Loader2 size={17} className="animate-spin" /> : <FileSpreadsheet size={17} />}Excel</button>
        </div>
        <div className="mt-4 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <FieldLabel>Student</FieldLabel>
            <select className="math-input" value={ledger.studentId ?? ""} onChange={(event) => setLedger((current) => ({ ...current, studentId: event.target.value || undefined }))}>
              <option value="">All students</option>
              {(students.data ?? []).map((row) => <option key={row.studentId} value={row.studentId}>{row.studentName} ({row.studentCode})</option>)}
            </select>
          </label>
          <label className="block">
            <FieldLabel>Centre</FieldLabel>
            <select className="math-input" value={ledger.centreId ?? ""} onChange={(event) => setLedger((current) => ({ ...current, centreId: event.target.value || undefined }))}>
              <option value="">All Centres</option>
              {centres.map((centre) => <option key={centre.centreId} value={centre.centreId}>{centre.name}</option>)}
              <option value="NONE">No Centre Set</option>
            </select>
          </label>
          <label className="block"><FieldLabel>From</FieldLabel><input type="date" className="math-input" value={ledger.dateFrom ?? ""} onChange={(event) => setLedger((current) => ({ ...current, dateFrom: event.target.value || undefined }))} /></label>
          <label className="block"><FieldLabel>To</FieldLabel><input type="date" className="math-input" value={ledger.dateTo ?? ""} onChange={(event) => setLedger((current) => ({ ...current, dateTo: event.target.value || undefined }))} /></label>
        </div>
        <InlineError error={ledgerQuery.error || ledgerExcel.error} />
        <div className="mt-4">
          {ledgerQuery.isLoading ? (
            <PaymentsLoading label="Loading the ledger…" />
          ) : !ledgerData?.students.length ? (
            <EmptyState title="Nothing In This Period" description="Invoices and payments for the chosen students and dates show here." />
          ) : ledger.studentId ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                    <th className="px-2 py-2">Date</th><th className="px-2 py-2">Document</th><th className="px-2 py-2">Entry</th><th className="px-2 py-2">Description</th>
                    <th className="px-2 py-2 text-right">Debit</th><th className="px-2 py-2 text-right">Credit</th><th className="px-2 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerData.rows.map((row, index) => (
                    <tr key={`${row.document}-${index}`} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="whitespace-nowrap px-2 py-2.5">{FormatDate(row.date)}</td>
                      <td className="px-2 py-2.5 font-bold">{row.document || "—"}</td>
                      <td className="px-2 py-2.5">{row.kind}{row.type && row.type !== row.kind ? <div className="text-xs font-semibold text-slate-500">{row.type}</div> : null}</td>
                      <td className="px-2 py-2.5">{row.description}{row.note ? <div className="text-xs font-semibold text-slate-500">{row.note}</div> : null}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{row.debitPaise ? FormatRupees(row.debitPaise) : ""}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{row.creditPaise ? FormatRupees(row.creditPaise) : ""}</td>
                      <td className="px-2 py-2.5 text-right font-black tabular-nums"><Balance paise={row.balancePaise} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="max-h-[480px] overflow-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="sticky top-0 bg-white dark:bg-slate-950">
                  <tr className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                    <th className="px-2 py-2">Student</th><th className="px-2 py-2 text-right">Brought Forward</th><th className="px-2 py-2 text-right">Invoiced</th><th className="px-2 py-2 text-right">Paid</th><th className="px-2 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerData.students.map((row) => (
                    <tr key={row.studentId} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-2 py-2.5"><button type="button" className="text-left font-bold underline" onClick={() => setLedger((current) => ({ ...current, studentId: row.studentId }))}>{row.studentName}</button><div className="text-xs font-semibold text-slate-500">{[row.studentCode, row.centreName].filter(Boolean).join(" · ")}</div></td>
                      <td className="px-2 py-2.5 text-right tabular-nums"><Balance paise={row.openingPaise} /></td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{FormatRupees(row.debitPaise)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{FormatRupees(row.creditPaise)}</td>
                      <td className="px-2 py-2.5 text-right font-black tabular-nums"><Balance paise={row.balancePaise} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="mt-6 math-card p-5 sm:p-6">
        <p className="math-block-header"><FileSpreadsheet size={14} />Invoice Register</p>
        <h2 className="text-xl font-black text-slate-950 dark:text-white">Every invoice line, as an Excel sheet</h2>
        <div className="mt-4 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block"><FieldLabel>From</FieldLabel><input type="date" className="math-input" value={register.dateFrom ?? ""} onChange={(event) => setRegister((current) => ({ ...current, dateFrom: event.target.value || undefined }))} /></label>
          <label className="block"><FieldLabel>To</FieldLabel><input type="date" className="math-input" value={register.dateTo ?? ""} onChange={(event) => setRegister((current) => ({ ...current, dateTo: event.target.value || undefined }))} /></label>
          <label className="block">
            <FieldLabel>Centre</FieldLabel>
            <select className="math-input" value={register.centreId ?? ""} onChange={(event) => setRegister((current) => ({ ...current, centreId: event.target.value || undefined }))}>
              <option value="">All Centres</option>
              {centres.map((centre) => <option key={centre.centreId} value={centre.centreId}>{centre.name}</option>)}
              <option value="NONE">No Centre Set</option>
            </select>
          </label>
          <label className="block">
            <FieldLabel>Type</FieldLabel>
            <select className="math-input" value={register.invoiceType ?? ""} onChange={(event) => setRegister((current) => ({ ...current, invoiceType: event.target.value || undefined }))}>
              <option value="">All Types</option>
              {Object.entries(INVOICE_TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <button type="button" className="math-button-primary" disabled={registerExcel.isPending} onClick={() => registerExcel.mutate()}>{registerExcel.isPending ? <Loader2 size={17} className="animate-spin" /> : <FileSpreadsheet size={17} />}Download</button>
        </div>
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300"><input type="checkbox" className="h-4 w-4" checked={Boolean(register.includeCancelled)} onChange={(event) => setRegister((current) => ({ ...current, includeCancelled: event.target.checked }))} />Include cancelled invoices</label>
        <InlineError error={registerExcel.error} />
      </section>
    </>
  );
}
