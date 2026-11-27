"use client";

// 2026-11-27 (billing Release 2): an invoice's lines in its detail view --
// quantity, rate, discounts, the free kit, where stock came from and when
// each book or kit item was handed over -- plus the late fee on a monthly
// fee paid (or still unpaid) after the 25th.
import { InlineError } from "@/components/payments/PaymentsUi";
import { addLateFee, getInvoiceDetail, recordHandover, type InvoiceDetail, type InvoiceLineView } from "@/lib/api/billing";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, CheckCircle2, HandHelping, Loader2 } from "lucide-react";
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

function InvoiceHref(invoiceId: string, number: string) {
  return `/admin/payments/invoices?tab=all&search=${encodeURIComponent(number)}&open=${encodeURIComponent(invoiceId)}`;
}

function HandoverCell({ invoice, line, onSaved }: { invoice: InvoiceDetail; line: InvoiceLineView; onSaved: (next: InvoiceDetail) => void }) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(TodayInIndia());
  const mutation = useMutation({
    mutationFn: () => recordHandover(invoice.invoiceId, line.lineId as string, day),
    onSuccess: (next) => {
      setOpen(false);
      onSaved(next);
    },
  });
  if (line.handedOverOn) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 size={13} />Handed over {FormatDate(line.handedOverOn)}{line.handedOverByName ? ` by ${line.handedOverByName}` : ""}
      </span>
    );
  }
  if (!line.lineId || !(line.isStock || line.kind === "BOOK" || line.kind === "MERCH") || invoice.status === "CANCELLED") return null;
  if (!line.canHandOver) {
    return <span className="text-xs font-bold text-amber-700 dark:text-amber-300">{line.handOverBlockedReason ? `Hand over once paid in full` : "Not handed over"}</span>;
  }
  return open ? (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input type="date" className="math-input h-9 w-40 py-1 text-xs" value={day} max={TodayInIndia()} min={invoice.invoiceDate} onChange={(event) => setDay(event.target.value)} aria-label={`Handover date for ${line.name}`} />
      <button type="button" className="math-role-action-button h-9 px-3 text-xs" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}Save
      </button>
      <button type="button" className="text-xs font-bold text-slate-500 underline" onClick={() => setOpen(false)}>Cancel</button>
      {mutation.error ? <span className="w-full"><InlineError error={mutation.error} /></span> : null}
    </span>
  ) : (
    <button type="button" className="math-role-action-button h-9 px-3 text-xs" onClick={() => setOpen(true)}><HandHelping size={13} />Mark Handed Over</button>
  );
}

export function InvoiceLinesBlock({ invoiceId }: { invoiceId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "payments", "invoice-detail", invoiceId], queryFn: () => getInvoiceDetail(invoiceId) });
  const late = useMutation({
    mutationFn: () => addLateFee(invoiceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "payments", "invoice-detail", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "payments", "invoices"] });
    },
  });
  const invoice = query.data;
  if (!invoice) return query.isLoading ? <p className="flex items-center gap-2 text-sm font-semibold text-slate-500"><Loader2 size={15} className="animate-spin" />Loading the lines…</p> : null;
  const saved = (next: InvoiceDetail) => {
    queryClient.setQueryData(["admin", "payments", "invoice-detail", invoiceId], next);
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "audit"] });
  };
  const multi = invoice.lines.length > 1 || invoice.lines.some((line) => line.lineId);

  return (
    <div className="grid gap-4">
      {multi ? (
        <div>
          <h3 className="mb-2 text-sm font-black text-slate-800 dark:text-slate-100">Lines</h3>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-black uppercase tracking-[0.1em] text-slate-500 dark:bg-slate-900/60">
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-right">Discount</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((line) => (
                  <tr key={line.lineId ?? line.lineNo} className="border-t border-slate-100 align-top dark:border-slate-800">
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-slate-900 dark:text-white">{line.description || line.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                        <span>{line.kindLabel}</span>
                        {line.isKit ? <span className="rounded-full bg-violet-50 px-2 py-0.5 font-black text-violet-700 dark:bg-violet-950/40 dark:text-violet-200">Free kit</span> : null}
                        {line.stockCentreName ? <span>From {line.stockCentreName}</span> : null}
                      </div>
                      <div className="mt-1.5"><HandoverCell invoice={invoice} line={line} onSaved={saved} /></div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{line.quantity}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{line.unitDisplay}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{line.discountPaise ? `${line.discountDisplay}${line.discountText?.includes("%") ? ` (${line.discountText})` : ""}` : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-black tabular-nums">{line.netDisplay}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {invoice.invoiceDiscountPaise ? (
            <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
              Invoice discount {invoice.invoiceDiscountDisplay}
              {invoice.invoiceDiscountReason ? `: ${invoice.invoiceDiscountReason}` : ""}
              {invoice.discountApprovedByName ? ` (approved by ${invoice.discountApprovedByName})` : ""}
            </p>
          ) : invoice.invoiceDiscountReason ? (
            <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
              Discount reason: {invoice.invoiceDiscountReason}{invoice.discountApprovedByName ? ` (approved by ${invoice.discountApprovedByName})` : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {invoice.parentInvoice ? (
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
          Late fee on <Link className="font-black underline" href={InvoiceHref(invoice.parentInvoice.invoiceId, invoice.parentInvoice.invoiceNumber)}>{invoice.parentInvoice.invoiceNumber}</Link> ({invoice.parentInvoice.feeName}).
        </p>
      ) : null}

      {invoice.billingType === "MONTHLY" && invoice.status !== "CANCELLED" ? (
        <div className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-black text-slate-800 dark:text-slate-100"><AlarmClock size={15} />Late Fee</p>
              <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                {invoice.lateFees.length
                  ? invoice.lateFees.map((row) => `${row.invoiceNumber} (${row.amountDisplay}${row.status === "CANCELLED" ? ", cancelled" : ""})`).join(", ")
                  : invoice.lateFee.reason || "₹100 when the month's fee is paid after the 25th."}
              </p>
            </div>
            {invoice.lateFee.allowed ? (
              <button type="button" className="math-role-action-button h-9 px-3 text-xs" disabled={late.isPending} onClick={() => late.mutate()}>
                {late.isPending ? <Loader2 size={13} className="animate-spin" /> : <AlarmClock size={13} />}Add Late Fee
              </button>
            ) : null}
          </div>
          {invoice.lateFees.length ? (
            <ul className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
              {invoice.lateFees.map((row) => <li key={row.invoiceId}><Link className="underline" href={InvoiceHref(row.invoiceId, row.invoiceNumber)}>Open {row.invoiceNumber}</Link></li>)}
            </ul>
          ) : null}
          <div className="mt-2"><InlineError error={late.error} /></div>
        </div>
      ) : null}
    </div>
  );
}
