"use client";

// 2026-10-09 (Payments Phase 5): the student's Fees tab. What is due, Pay
// now (Razorpay), every invoice and receipt with its PDF. Shown only while
// Payment Settings > Online Payments > "Show fees to students" is on.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, Download, FileText, IndianRupee, Loader2, PiggyBank, ReceiptText, Wallet } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { DueLine, FeeInvoicePicker, PayFlowDialog, usePayFlow, type PayFlowApi } from "@/components/fees/PayFlow";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorDetail, apiErrorMessage } from "@/lib/api";
import {
  createStudentOrder,
  downloadStudentInvoicePdf,
  downloadStudentReceiptPdf,
  getStudentFees,
  getStudentOrder,
  logStudentCheckoutEvent,
  verifyStudentOrder,
  type FeeInvoice,
  type FeePayment,
} from "@/lib/api/fees";
import { saveBlob } from "@/lib/api/payments";
import { FormatDate } from "@/lib/paymentsDates";

const STUDENT_PAY_API: PayFlowApi = {
  createOrder: createStudentOrder,
  verify: verifyStudentOrder,
  status: getStudentOrder,
  logEvent: logStudentCheckoutEvent,
};

function FeesMetric({ label, value, icon, note, tone = "plain" }: { label: string; value: string; icon: ReactNode; note?: string | null; tone?: "plain" | "alert" | "good" }) {
  const ValueTone = tone === "alert" ? "text-rose-700 dark:text-rose-300" : tone === "good" ? "text-emerald-700 dark:text-emerald-300" : "text-slate-950 dark:text-white";
  return (
    <div className="math-student-metric-card relative overflow-hidden">
      <div className="math-student-icon-chip relative z-10">{icon}</div>
      <p className="relative z-10 mt-3 text-xs font-black text-slate-800 dark:text-slate-100">{label}</p>
      <p className={`relative z-10 mt-1 whitespace-nowrap text-2xl font-black tabular-nums sm:text-3xl ${ValueTone}`}>{value}</p>
      {note ? <p className="relative z-10 mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">{note}</p> : null}
    </div>
  );
}

function StatusChip({ invoice }: { invoice: FeeInvoice }) {
  const Tone =
    invoice.status === "PAID"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200"
      : invoice.isOverdue
        ? "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-200"
        : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black ${Tone}`}>{invoice.isOverdue && invoice.status !== "PAID" ? "Overdue" : invoice.statusLabel}</span>;
}

function DownloadButton({ busy, onClick, label }: { busy: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" className="fees-btn fees-btn-quiet fees-btn-small" disabled={busy} onClick={onClick} aria-label={label} title={label}>
      {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
      <span>PDF</span>
    </button>
  );
}

export default function StudentFeesPage() {
  const Ready = useProtectedPage(["STUDENT"]);
  const QueryClient = useQueryClient();
  const Fees = useQuery({ queryKey: ["student-fees"], queryFn: getStudentFees, enabled: Ready, retry: (Count, Error) => apiErrorDetail(Error)?.code !== "FEES_NOT_ENABLED" && Count < 1 });
  const [Tab, SetTab] = useState<"invoices" | "receipts">("invoices");
  const [Downloading, SetDownloading] = useState<string | null>(null);
  const [DownloadError, SetDownloadError] = useState<string | null>(null);
  const [LastPick, SetLastPick] = useState<string[]>([]);

  const Refresh = useCallback(() => {
    void QueryClient.invalidateQueries({ queryKey: ["student-fees"] });
    void QueryClient.invalidateQueries({ queryKey: ["student-fees-summary"] });
    void QueryClient.invalidateQueries({ queryKey: ["notifications"] });
  }, [QueryClient]);
  const Flow = usePayFlow(STUDENT_PAY_API, Refresh);
  const Busy = ["starting", "checkout", "confirming"].includes(Flow.State.stage);

  const SaveFile = useCallback(async (Key: string, Fetch: () => Promise<Blob>, FileName: string) => {
    SetDownloading(Key);
    SetDownloadError(null);
    try {
      saveBlob(await Fetch(), FileName);
    } catch (Problem) {
      SetDownloadError(apiErrorMessage(Problem));
    } finally {
      SetDownloading(null);
    }
  }, []);

  const Data = Fees.data;

  if (!Ready || Fees.isLoading) return <LoadingState label="Loading fees..." />;
  if (Fees.isError) {
    if (apiErrorDetail(Fees.error)?.code === "FEES_NOT_ENABLED") {
      return (
        <AppShell title="Fees">
          <section className="math-hero">
            <h1 className="math-title">Fees</h1>
            <p className="math-subtitle">Fees are not shown here yet. Please ask at the centre for your fee details.</p>
            <Link href="/student/dashboard" className="fees-btn fees-btn-quiet mt-4 w-fit">Back to the dashboard</Link>
          </section>
        </AppShell>
      );
    }
    return <ErrorState message={apiErrorMessage(Fees.error)} />;
  }
  if (!Data) return null;

  const Due = Data.totals.duePaise > 0;

  return (
    <AppShell title="Fees">
      <section className="w-full space-y-5">
        <div className="math-hero">
          <div>
            <div className="math-block-header mb-2"><Wallet size={14} /> Fees</div>
            <h1 className="math-title">My Fees</h1>
            <p className="math-subtitle">
              {Due ? "What is due, and every invoice and receipt. Pay online in a minute, or at the centre." : "You are all paid up. Your invoices and receipts are below."}
            </p>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <FeesMetric label="To pay" value={Data.totals.dueDisplay} icon={<IndianRupee size={14} />} tone={Data.totals.overduePaise ? "alert" : Due ? "plain" : "good"} note={Data.totals.nextDueDate ? `Due ${FormatDate(Data.totals.nextDueDate)}` : Due ? "Due now" : "All paid"} />
            <FeesMetric label="Overdue" value={Data.totals.overdueDisplay} icon={<Clock3 size={14} />} tone={Data.totals.overduePaise ? "alert" : "plain"} note={Data.totals.overdueCount ? `${Data.totals.overdueCount} invoice${Data.totals.overdueCount === 1 ? "" : "s"}` : "None overdue"} />
            <FeesMetric label="Paid so far" value={Data.totals.paidDisplay} icon={<ReceiptText size={14} />} note={`${Data.payments.length} receipt${Data.payments.length === 1 ? "" : "s"}`} />
            <FeesMetric label="Advance" value={Data.totals.advanceDisplay} icon={<PiggyBank size={14} />} note={Data.totals.advancePaise ? "For next invoices" : "None held"} />
          </div>
        </div>

        {Data.confirming.length ? (
          <div className="flex items-start gap-3 rounded-[24px] border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100" role="status">
            <Clock3 size={20} className="mt-0.5 shrink-0" />
            <p className="text-sm font-bold">
              We have your online payment of {Data.confirming.map((Row) => Row.amountDisplay).join(", ")} and the office is confirming it. Its receipt will show here soon. Please do not pay again.
            </p>
          </div>
        ) : null}

        {Due ? (
          <section className="rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 sm:p-6" aria-labelledby="fees-pay-heading">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="fees-pay-heading" className="text-xl font-black text-slate-950 dark:text-white">Pay now</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">{Data.totals.unpaidCount} unpaid invoice{Data.totals.unpaidCount === 1 ? "" : "s"}</p>
              </div>
            </div>
            <FeeInvoicePicker
              invoices={Data.unpaidInvoices}
              onlineLive={Data.online.live}
              busy={Busy}
              onPay={(Ids) => {
                SetLastPick(Ids);
                void Flow.Pay(Ids);
              }}
              offlineNote="Online payment is not available right now. Please pay at the centre; your receipt will show here."
            />
          </section>
        ) : (
          <section className="flex items-center gap-4 rounded-[28px] border border-emerald-200 bg-emerald-50/80 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-300"><CheckCircle2 size={26} /></span>
            <div>
              <h2 className="text-lg font-black text-emerald-900 dark:text-emerald-100">Nothing to pay</h2>
              <p className="text-sm font-semibold text-emerald-800/80 dark:text-emerald-200/80">New invoices will show here, and you will get a notification.</p>
            </div>
          </section>
        )}

        <section className="rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="tablist" aria-label="Fee records" className="flex gap-1 rounded-full bg-slate-100 p-1 dark:bg-slate-900">
              <button type="button" role="tab" aria-selected={Tab === "invoices"} className="fees-tab" onClick={() => SetTab("invoices")}>Invoices ({Data.invoices.length})</button>
              <button type="button" role="tab" aria-selected={Tab === "receipts"} className="fees-tab" onClick={() => SetTab("receipts")}>Receipts ({Data.payments.length})</button>
            </div>
          </div>
          {DownloadError ? <p className="mt-3 text-sm font-bold text-rose-700 dark:text-rose-300" role="alert">{DownloadError}</p> : null}

          {Tab === "invoices" ? (
            Data.invoices.length ? (
              <ul className="mt-4 grid gap-2">
                {Data.invoices.map((Row) => (
                  <li key={Row.invoiceId} className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60 sm:flex-row sm:items-center">
                    <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-slate-500 shadow-sm dark:bg-slate-950 dark:text-slate-300 sm:grid"><FileText size={18} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-slate-950 dark:text-white">
                        {Row.feeName}
                        {Row.periodLabel ? <span className="font-bold text-slate-500 dark:text-slate-400"> · {Row.periodLabel}</span> : null}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        <span className="tabular-nums">{Row.invoiceNumber} · {FormatDate(Row.invoiceDate)}</span>
                        {Row.status !== "PAID" ? <DueLine invoice={Row} /> : null}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <div className="text-left sm:text-right">
                        <p className="font-black tabular-nums text-slate-950 dark:text-white">{Row.amountDisplay}</p>
                        {Row.status !== "PAID" && Row.balancePaise !== Row.amountPaise ? <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{Row.balanceDisplay} left</p> : null}
                      </div>
                      <StatusChip invoice={Row} />
                      <DownloadButton busy={Downloading === Row.invoiceId} label={`Download invoice ${Row.invoiceNumber}`} onClick={() => void SaveFile(Row.invoiceId, () => downloadStudentInvoicePdf(Row.invoiceId), `${Row.invoiceNumber}.pdf`)} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-6 text-sm font-semibold text-slate-500 dark:text-slate-400">No invoices yet.</p>
            )
          ) : Data.payments.length ? (
            <ul className="mt-4 grid gap-2">
              {Data.payments.map((Row: FeePayment) => (
                <li key={Row.paymentId} className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60 sm:flex-row sm:items-center">
                  <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 shadow-sm dark:bg-emerald-950/50 dark:text-emerald-300 sm:grid"><ReceiptText size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-slate-950 dark:text-white">
                      {Row.receiptNumber}
                      <span className="font-bold text-slate-500 dark:text-slate-400"> · {FormatDate(Row.paymentDate)}</span>
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {Row.channel === "ONLINE" ? "Paid online" : "Paid at the centre"}
                      {Row.invoiceNumbers.length ? ` · for ${Row.invoiceNumbers.join(", ")}` : ""}
                      {Row.advancePaise ? ` · ${Row.advanceDisplay} kept as advance` : ""}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <p className="font-black tabular-nums text-emerald-700 dark:text-emerald-300">{Row.amountDisplay}</p>
                    <DownloadButton busy={Downloading === Row.paymentId} label={`Download receipt ${Row.receiptNumber}`} onClick={() => void SaveFile(Row.paymentId, () => downloadStudentReceiptPdf(Row.paymentId), `${Row.receiptNumber}.pdf`)} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-sm font-semibold text-slate-500 dark:text-slate-400">No payments yet.</p>
          )}
        </section>
      </section>

      <PayFlowDialog
        state={Flow.State}
        onClose={Flow.Reset}
        onRetry={() => {
          Flow.Reset();
          if (LastPick.length) void Flow.Pay(LastPick);
        }}
        downloading={Downloading !== null}
        onDownloadReceipt={(PaymentId, ReceiptNumber) => void SaveFile(PaymentId, () => downloadStudentReceiptPdf(PaymentId), `${ReceiptNumber}.pdf`)}
      />
    </AppShell>
  );
}
