"use client";

// 2026-10-08 (Payments Phase 3): one payment -- what it paid, how it was
// paid, its advance, its history -- with Download receipt, Edit and Cancel.
import { InlineError, PaymentsDialog, PaymentsHistoryList, FieldLabel } from "@/components/payments/PaymentsUi";
import { cancelPayment, downloadReceiptPdf, getPayment, saveBlob, type Payment } from "@/lib/api/payments";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ban, Download, Loader2, Pencil } from "lucide-react";
import { useEffect, useState } from "react";

function FormatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function PaymentStatusChip({ payment }: { payment: Pick<Payment, "status" | "statusLabel" | "advancePaise" | "editedAt"> }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-black ${payment.status === "CANCELLED" ? "bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"}`}>
        {payment.statusLabel}
      </span>
      {payment.status === "RECORDED" && payment.advancePaise > 0 ? (
        <span className="inline-flex whitespace-nowrap rounded-full bg-violet-100 px-2.5 py-1 text-xs font-black text-violet-700 dark:bg-violet-950/40 dark:text-violet-200">Advance</span>
      ) : null}
      {payment.editedAt && payment.status === "RECORDED" ? (
        <span className="inline-flex whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600 dark:bg-slate-900 dark:text-slate-300">Edited</span>
      ) : null}
    </span>
  );
}

export function PaymentDetailDialog({
  paymentId,
  onClose,
  onEdit,
  onChanged,
}: {
  paymentId: string | null;
  onClose: () => void;
  onEdit: (payment: Payment) => void;
  onChanged: (message: string) => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const query = useQuery({ queryKey: ["admin", "payments", "receipt", paymentId], queryFn: () => getPayment(paymentId as string), enabled: Boolean(paymentId) });
  const payment = query.data;

  useEffect(() => {
    setCancelling(false);
    setReason("");
  }, [paymentId]);

  const pdf = useMutation({
    mutationFn: (row: Payment) => downloadReceiptPdf(row.paymentId),
    onSuccess: (blob, row) => saveBlob(blob, `${row.receiptNumber}.pdf`),
  });
  const cancel = useMutation({
    mutationFn: (row: Payment) => cancelPayment(row.paymentId, reason),
    onSuccess: (saved) => {
      setCancelling(false);
      setReason("");
      query.refetch();
      onChanged(`${saved.receiptNumber} is cancelled. It stays on record, and its invoices are open again.`);
    },
  });
  const advanceUsed = (payment?.allocations ?? []).some((row) => !row.released && row.kind === "ADVANCE");
  // What counts now; for a cancelled payment, what it paid until it was
  // cancelled. Earlier versions of an edited payment stay in the history.
  const shown = (payment?.allocations ?? []).filter((row) =>
    payment?.status === "CANCELLED" ? row.releaseReason === "Payment cancelled" : !row.released
  );

  return (
    <PaymentsDialog
      open={Boolean(paymentId)}
      wide
      kicker={payment ? payment.receiptNumber : "Payment"}
      title={payment ? `${payment.studentName} · ${payment.amountDisplay}` : "Loading…"}
      onClose={() => { if (!cancel.isPending) onClose(); }}
      footer={
        payment ? (
          cancelling ? (
            <>
              <button type="button" className="math-button-secondary" disabled={cancel.isPending} onClick={() => setCancelling(false)}>Keep payment</button>
              <button type="button" className="math-button-primary !bg-rose-600 hover:!bg-rose-700" disabled={!reason.trim() || cancel.isPending} onClick={() => cancel.mutate(payment)}>
                {cancel.isPending ? <Loader2 size={17} className="animate-spin" /> : <Ban size={17} />}Cancel {payment.receiptNumber}
              </button>
            </>
          ) : (
            <>
              {payment.status === "RECORDED" ? (
                <>
                  <button type="button" className="math-button-secondary" onClick={() => { setCancelling(true); cancel.reset(); }}><Ban size={17} />Cancel payment</button>
                  <button type="button" className="math-button-secondary" onClick={() => onEdit(payment)}><Pencil size={17} />Edit</button>
                </>
              ) : null}
              <button type="button" className="math-button-primary" disabled={pdf.isPending} onClick={() => pdf.mutate(payment)}>
                {pdf.isPending ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}Download receipt
              </button>
            </>
          )
        ) : null
      }
    >
      {query.isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm font-bold text-slate-500"><Loader2 size={16} className="animate-spin" />Loading payment…</div>
      ) : query.error ? (
        <InlineError error={query.error} />
      ) : payment ? (
        <div className="grid gap-5">
          <PaymentStatusChip payment={payment} />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            {[
              ["Date", FormatDate(payment.paymentDate)],
              ["Student ID", payment.studentCode],
              ["Centre", payment.centreName ?? "Not set"],
              ["Paid by", payment.payBy ?? "—"],
              ["Received by", payment.receivedByName ?? "—"],
              ["Recorded by", payment.createdByName ?? "—"],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">{label}</dt>
                <dd className="mt-0.5 break-words font-bold text-slate-900 dark:text-white">{value}</dd>
              </div>
            ))}
          </dl>

          <div>
            <h3 className="mb-2 text-sm font-black text-slate-800 dark:text-slate-100">How it was paid</h3>
            <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {payment.methods.map((line, index) => (
                <li key={index} className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0 font-bold text-slate-800 dark:text-slate-100">{line.methodLabel}{line.reference ? <span className="ml-2 break-all text-xs font-semibold text-slate-500">{line.reference}</span> : null}</span>
                  <span className="shrink-0 font-black tabular-nums">{line.amountDisplay}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-black text-slate-800 dark:text-slate-100">Applied to</h3>
            {shown.length ? (
              <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {shown.map((row) => (
                  <li key={row.allocationId} className={`flex items-baseline justify-between gap-3 px-4 py-2 text-sm ${row.released ? "opacity-60" : ""}`}>
                    <span className="min-w-0">
                      <span className="font-bold text-slate-900 dark:text-white">{row.invoiceNumber}</span>
                      <span className="block text-xs font-semibold text-slate-500">
                        {row.feeName}{row.periodLabel ? ` · ${row.periodLabel}` : ""}{row.kind === "ADVANCE" ? " · from advance" : ""}

                      </span>
                    </span>
                    <span className="shrink-0 text-right font-black tabular-nums">
                      {row.amountDisplay}
                      {row.discountPaise ? <span className="block text-xs font-semibold text-slate-500">+ discount {row.discountDisplay}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm font-semibold text-slate-500">Not applied to any invoice yet.</p>
            )}
          </div>

          <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900/60">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums sm:ml-auto sm:max-w-sm">
              <dt className="font-semibold text-slate-600 dark:text-slate-300">Received</dt><dd className="text-right font-black">{payment.amountDisplay}</dd>
              {payment.discountPaise ? (<><dt className="font-semibold text-slate-600 dark:text-slate-300">Discount</dt><dd className="text-right font-bold">{payment.discountDisplay}</dd></>) : null}
              <dt className="font-semibold text-violet-700 dark:text-violet-300">Advance left</dt><dd className="text-right font-bold text-violet-700 dark:text-violet-300">{payment.advanceDisplay}</dd>
            </dl>
            {payment.discountReason && payment.discountPaise ? <p className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">Discount reason: {payment.discountReason}</p> : null}
            {payment.note ? <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Note: {payment.note}</p> : null}
          </div>

          {payment.status === "CANCELLED" ? (
            <p className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300">
              Cancelled {payment.cancelledAt ? new Date(payment.cancelledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : ""}
              {payment.cancelledByName ? ` by ${payment.cancelledByName}` : ""}. Reason: {payment.cancelReason}
            </p>
          ) : null}

          {cancelling ? (
            <label className="block">
              <FieldLabel hint="required, kept in the history">Why is it being cancelled?</FieldLabel>
              <input className="math-input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. cheque bounced" autoFocus />
              <span className="mt-1.5 block text-xs font-semibold text-slate-500">
                {advanceUsed
                  ? "Part of this payment's advance is already used on later invoices, so it cannot be cancelled until those invoices are cancelled. Edit it instead if only details are wrong."
                  : `The receipt stays on record marked Cancelled, ${payment.receiptNumber} is never reused, and the invoices it paid become due again.`}
              </span>
            </label>
          ) : null}
          <InlineError error={cancel.error || pdf.error} />
          <div>
            <h3 className="mb-2 text-sm font-black text-slate-800 dark:text-slate-100">History</h3>
            <PaymentsHistoryList entityType="PAYMENT" entityId={payment.paymentId} limit={20} />
          </div>
        </div>
      ) : null}
    </PaymentsDialog>
  );
}
