"use client";

// 2026-10-08 (Payments Phase 3): Student Fees -- one student's account: what
// is due and overdue, their advance, a statement with a running balance,
// their payments and invoices, and Record Payment.
// ?studentId=... opens a student; &pay=<invoiceId> also opens Record Payment
// with that invoice ticked.
import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PaymentDetailDialog, PaymentStatusChip } from "@/components/payments/PaymentDetail";
import { PaymentForm } from "@/components/payments/PaymentForm";
import { InlineError, PaymentsMetric } from "@/components/payments/PaymentsUi";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import {
  applyStudentAdvance,
  downloadInvoicePdf,
  downloadReceiptPdf,
  getStudentAccount,
  listInvoiceStudentOptions,
  saveBlob,
  type Invoice,
  type Payment,
} from "@/lib/api/payments";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FilePlus2,
  HandCoins,
  Loader2,
  PiggyBank,
  Search,
  Sparkles,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Tab = "unpaid" | "statement" | "payments" | "invoices";

function FormatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function InvoiceChip({ invoice }: { invoice: Invoice }) {
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

export default function StudentFeesPage() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const queryClient = useQueryClient();
  const [studentId, setStudentId] = useState("");
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("unpaid");
  const [formOpen, setFormOpen] = useState(false);
  const [preselect, setPreselect] = useState<string[]>([]);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ payment: Payment; wasEdit: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pendingPay = useRef<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("studentId");
    if (id) setStudentId(id);
    pendingPay.current = params.get("pay");
  }, []);

  const optionsQuery = useQuery({ queryKey: ["admin", "payments", "invoice-students"], queryFn: listInvoiceStudentOptions, enabled: ready });
  const accountQuery = useQuery({ queryKey: ["admin", "payments", "account", studentId], queryFn: () => getStudentAccount(studentId), enabled: ready && Boolean(studentId) });
  const account = accountQuery.data;

  // Opened from an invoice's "Record Payment": open the form once loaded.
  useEffect(() => {
    if (account && pendingPay.current) {
      const invoiceId = pendingPay.current;
      pendingPay.current = null;
      if (account.unpaidInvoices.some((row) => row.invoiceId === invoiceId)) {
        setPreselect([invoiceId]);
        setEditing(null);
        setFormOpen(true);
      }
    }
  }, [account]);

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return [];
    return (optionsQuery.data ?? [])
      .filter((row) => [row.studentName, row.studentCode, row.customId ?? ""].some((value) => value.toLowerCase().includes(needle)))
      .slice(0, 8);
  }, [optionsQuery.data, search]);

  const choose = (id: string) => {
    setStudentId(id);
    setSearch("");
    setPickerOpen(false);
    setTab("unpaid");
    setSaved(null);
    setNotice(null);
    const url = new URL(window.location.href);
    url.search = `?studentId=${encodeURIComponent(id)}`;
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "account", studentId] });
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "invoices"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "receipts"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "receipt"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "audit"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "settings"] });
  };

  const advanceMutation = useMutation({
    mutationFn: () => applyStudentAdvance(studentId),
    onSuccess: (result) => {
      setNotice(`${result.appliedDisplay} of advance applied to unpaid invoices, oldest first.`);
      refresh();
    },
  });
  const receiptPdf = useMutation({
    mutationFn: (payment: Payment) => downloadReceiptPdf(payment.paymentId),
    onSuccess: (blob, payment) => saveBlob(blob, `${payment.receiptNumber}.pdf`),
  });
  const invoicePdf = useMutation({
    mutationFn: (invoice: Invoice) => downloadInvoicePdf(invoice.invoiceId),
    onSuccess: (blob, invoice) => saveBlob(blob, `${invoice.invoiceNumber}.pdf`),
  });

  const openRecord = (invoiceIds: string[]) => {
    setPreselect(invoiceIds);
    setEditing(null);
    setSaved(null);
    setFormOpen(true);
  };

  if (!ready) return null;
  const totals = account?.totals;

  return (
    <AppShell title="Student Fees">
      <section className="math-hero math-slide-up">
        <div className="relative z-10 flex flex-col gap-5">
          <div>
            <p className="math-block-header"><Wallet size={14} />Payments</p>
            <h1 className="math-title">Student Fees</h1>
            <p className="math-subtitle">One student&apos;s account: what is due, their advance, every invoice and payment, and Record Payment.</p>
          </div>
          {/* The results list sits in the flow (not floating): the hero clips overflow. */}
          <div className="max-w-2xl">
           <div className="relative">
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="math-input pl-11"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPickerOpen(true); }}
              onFocus={() => setPickerOpen(true)}
              onKeyDown={(event) => { if (event.key === "Enter" && matches[0]) choose(matches[0].studentId); if (event.key === "Escape") setPickerOpen(false); }}
              placeholder={account ? "Find another student by name or student ID" : "Find a student by name or student ID"}
              aria-label="Find a student"
              role="combobox"
              aria-expanded={pickerOpen && matches.length > 0}
              aria-controls="student-fees-matches"
            />
           </div>
            {pickerOpen && matches.length ? (
              <ul id="student-fees-matches" role="listbox" className="mt-2 max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-slate-950">
                {matches.map((row) => (
                  <li key={row.studentId} role="option" aria-selected={false}>
                    <button type="button" className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-900" onClick={() => choose(row.studentId)}>
                      <span className="min-w-0">
                        <span className="block truncate font-black text-slate-900 dark:text-white">{row.studentName}{row.isActive ? "" : " (inactive)"}</span>
                        <span className="block truncate text-xs font-semibold text-slate-500">{[row.studentCode, row.levelCode, row.centreName].filter(Boolean).join(" · ")}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {pickerOpen && search.trim() && !matches.length && optionsQuery.data ? (
              <p className="mt-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950">No student matches “{search.trim()}”.</p>
            ) : null}
          </div>
        </div>
      </section>

      {!studentId ? (
        <div className="mt-6"><EmptyState title="Choose a student" description="Search above by name or student ID. You can also open a student from the Invoices list or the Students page." /></div>
      ) : accountQuery.isLoading ? (
        <div className="mt-6"><LoadingState label="Loading the student's account..." /></div>
      ) : accountQuery.error || !account || !totals ? (
        <div className="mt-6"><ErrorState message="This student's account could not be loaded. Refresh the page or choose the student again." /></div>
      ) : (
        <>
          <section className="mt-6 math-card p-5 sm:p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200"><UserRound size={22} /></span>
                <div className="min-w-0">
                  <h2 className="text-2xl font-black text-slate-950 dark:text-white">{account.student.name}{account.student.isActive ? "" : " (inactive)"}</h2>
                  <p className="mt-0.5 text-sm font-semibold text-slate-600 dark:text-slate-300">
                    {[account.student.studentCode, account.student.levelCode, account.student.centreName ?? "No centre", account.student.parentName, account.student.mobile].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="math-button-primary whitespace-nowrap" onClick={() => openRecord(account.unpaidInvoices.length === 1 ? [account.unpaidInvoices[0].invoiceId] : [])}><HandCoins size={17} />Record Payment</button>
                <Link href={`/admin/payments/generate-invoices?studentId=${encodeURIComponent(account.student.studentId)}`} className="math-button-secondary whitespace-nowrap"><FilePlus2 size={17} />Create Invoice</Link>
                {totals.advancePaise > 0 && totals.duePaise > 0 ? (
                  <button type="button" className="math-button-secondary whitespace-nowrap" disabled={advanceMutation.isPending} onClick={() => advanceMutation.mutate()}>
                    {advanceMutation.isPending ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}Apply advance to dues
                  </button>
                ) : null}
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <PaymentsMetric label="Due" value={<span className="text-xl">{totals.dueDisplay}</span>} icon={<Wallet size={14} />} tone={totals.duePaise ? "amber" : "emerald"} />
              <PaymentsMetric label="Overdue" value={<span className="text-xl">{totals.overdueDisplay}</span>} icon={<AlertTriangle size={14} />} tone={totals.overduePaise ? "amber" : "slate"} />
              <PaymentsMetric label="Advance" value={<span className="text-xl">{totals.advanceDisplay}</span>} icon={<PiggyBank size={14} />} tone="cyan" />
              <PaymentsMetric label="Received" value={<span className="text-xl">{totals.receivedDisplay}</span>} icon={<HandCoins size={14} />} tone="emerald" />
              <PaymentsMetric label="Invoiced" value={<span className="text-xl">{totals.invoicedDisplay}</span>} icon={<FilePlus2 size={14} />} />
            </div>

            {saved ? (
              <div role="status" className="mt-5 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex items-start gap-2">
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                  {saved.wasEdit
                    ? `${saved.payment.receiptNumber} saved.`
                    : `${saved.payment.amountDisplay} received · receipt ${saved.payment.receiptNumber}${saved.payment.advancePaise ? ` · ${saved.payment.advanceDisplay} kept as advance` : ""}.`}
                </span>
                <span className="flex flex-wrap gap-2">
                  <button type="button" className="math-button-secondary h-10 whitespace-nowrap" disabled={receiptPdf.isPending} onClick={() => receiptPdf.mutate(saved.payment)}>
                    {receiptPdf.isPending ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}Download receipt
                  </button>
                  <button type="button" className="math-focus-ring rounded-full p-2" onClick={() => setSaved(null)} aria-label="Dismiss"><X size={16} /></button>
                </span>
              </div>
            ) : null}
            {notice ? (
              <div role="status" className="mt-5 flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                <span>{notice}</span>
                <button type="button" className="text-xs font-black underline" onClick={() => setNotice(null)}>Dismiss</button>
              </div>
            ) : null}
            {advanceMutation.error || receiptPdf.error || invoicePdf.error ? <div className="mt-4"><InlineError error={advanceMutation.error || receiptPdf.error || invoicePdf.error} /></div> : null}
          </section>

          <section className="mt-6 math-card p-5 sm:p-6">
            <div role="tablist" aria-label="Account sections" className="flex flex-wrap gap-2">
              {([
                ["unpaid", `Unpaid (${account.unpaidInvoices.length})`],
                ["statement", "Statement"],
                ["payments", `Payments (${account.payments.length})`],
                ["invoices", `All invoices (${account.invoices.length})`],
              ] as [Tab, string][]).map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`math-role-tab-button math-admin-tab-force rounded-2xl px-4 py-2 text-sm font-black transition ${tab === key ? "is-active math-admin-tab-force-selected" : ""}`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-5" role="tabpanel">
              {tab === "unpaid" ? (
                account.unpaidInvoices.length ? (
                  <ul className="grid gap-3">
                    {account.unpaidInvoices.map((invoice) => (
                      <li key={invoice.invoiceId} className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-950/50 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-black text-slate-900 dark:text-white">{invoice.feeName}{invoice.periodLabel ? ` · ${invoice.periodLabel}` : ""}</p>
                          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{invoice.invoiceNumber} · {FormatDate(invoice.invoiceDate)} · due by {FormatDate(invoice.dueDate)}</p>
                          <div className="mt-1.5"><InvoiceChip invoice={invoice} /></div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                          <div className="text-right">
                            <p className="text-lg font-black tabular-nums text-slate-950 dark:text-white">{invoice.balanceDisplay}</p>
                            {invoice.balancePaise !== invoice.amountPaise ? <p className="text-xs font-semibold text-slate-500">of {invoice.amountDisplay}</p> : null}
                          </div>
                          <button type="button" className="math-role-action-button h-9 px-3 text-xs" onClick={() => openRecord([invoice.invoiceId])}><HandCoins size={13} />Record Payment</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="Nothing due" description={totals.advancePaise ? `All paid. ${totals.advanceDisplay} is held as advance for the next invoices.` : "All of this student's invoices are paid."} />
                )
              ) : null}

              {tab === "statement" ? (
                account.statement.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead>
                        <tr className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                          <th className="px-2 py-2">Date</th>
                          <th className="px-2 py-2">Document</th>
                          <th className="px-2 py-2">Details</th>
                          <th className="px-2 py-2 text-right">Charged</th>
                          <th className="px-2 py-2 text-right">Paid</th>
                          <th className="px-2 py-2 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {account.statement.map((entry) => (
                          <tr key={`${entry.type}-${entry.id}`} className={`border-t border-slate-100 dark:border-slate-800 ${entry.cancelled ? "opacity-50" : ""}`}>
                            <td className="whitespace-nowrap px-2 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300">{FormatDate(entry.date)}</td>
                            <td className="whitespace-nowrap px-2 py-3 font-black tabular-nums text-slate-900 dark:text-white">
                              {entry.number}
                              <span className="block text-xs font-semibold text-slate-500">{entry.type === "INVOICE" ? "Invoice" : "Payment"}{entry.cancelled ? " · cancelled" : ""}</span>
                            </td>
                            <td className="max-w-[280px] px-2 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{entry.description}</td>
                            <td className="whitespace-nowrap px-2 py-3 text-right font-bold tabular-nums">{entry.cancelled ? <span className="line-through">{entry.type === "INVOICE" ? entry.amountDisplay : ""}</span> : entry.chargeDisplay ?? ""}</td>
                            <td className="whitespace-nowrap px-2 py-3 text-right font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{entry.cancelled ? <span className="line-through">{entry.type === "PAYMENT" ? entry.amountDisplay : ""}</span> : entry.creditDisplay ?? ""}</td>
                            <td className={`whitespace-nowrap px-2 py-3 text-right font-black tabular-nums ${entry.balancePaise < 0 ? "text-violet-700 dark:text-violet-300" : "text-slate-950 dark:text-white"}`}>{entry.balanceDisplay}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-3 text-xs font-semibold text-slate-500">Newest first. Balance is what the student owes after each entry; “advance” means they are in credit. Discounts count as paid.</p>
                  </div>
                ) : (
                  <EmptyState title="No activity yet" description="Invoices and payments for this student will appear here." />
                )
              ) : null}

              {tab === "payments" ? (
                account.payments.length ? (
                  <ul className="grid gap-3">
                    {account.payments.map((payment) => (
                      <li key={payment.paymentId} className={`flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-950/50 sm:flex-row sm:items-center sm:justify-between ${payment.status === "CANCELLED" ? "opacity-70" : ""}`}>
                        <div className="min-w-0">
                          <p className="font-black text-slate-900 dark:text-white">{payment.receiptNumber} · {FormatDate(payment.paymentDate)}</p>
                          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{payment.methodSummary}{payment.invoiceNumbers.length ? ` · ${payment.invoiceNumbers.join(", ")}` : ""}</p>
                          <div className="mt-1.5"><PaymentStatusChip payment={payment} /></div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                          <div className="text-right">
                            <p className="text-lg font-black tabular-nums text-slate-950 dark:text-white">{payment.amountDisplay}</p>
                            {payment.advancePaise ? <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">{payment.advanceDisplay} advance left</p> : null}
                          </div>
                          <button type="button" className="math-role-action-button h-9 px-3 text-xs" disabled={receiptPdf.isPending && receiptPdf.variables?.paymentId === payment.paymentId} onClick={() => receiptPdf.mutate(payment)}><Download size={13} />Receipt</button>
                          <button type="button" className="math-role-action-button h-9 px-3 text-xs" onClick={() => setViewing(payment.paymentId)}><Eye size={13} />View</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="No payments yet" description="Use Record Payment when this student pays." />
                )
              ) : null}

              {tab === "invoices" ? (
                account.invoices.length ? (
                  <ul className="grid gap-3">
                    {account.invoices.map((invoice) => (
                      <li key={invoice.invoiceId} className={`flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-950/50 sm:flex-row sm:items-center sm:justify-between ${invoice.status === "CANCELLED" ? "opacity-70" : ""}`}>
                        <div className="min-w-0">
                          <p className="font-black text-slate-900 dark:text-white">{invoice.feeName}{invoice.periodLabel ? ` · ${invoice.periodLabel}` : ""}</p>
                          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{invoice.invoiceNumber} · {FormatDate(invoice.invoiceDate)}{invoice.discountPaise ? ` · discount ${invoice.discountDisplay}` : ""}</p>
                          <div className="mt-1.5"><InvoiceChip invoice={invoice} /></div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                          <div className="text-right">
                            <p className="text-lg font-black tabular-nums text-slate-950 dark:text-white">{invoice.amountDisplay}</p>
                            {invoice.status !== "CANCELLED" ? <p className="text-xs font-semibold text-slate-500">paid {invoice.paidDisplay} · due {invoice.balanceDisplay}</p> : null}
                          </div>
                          <button type="button" className="math-role-action-button h-9 px-3 text-xs" disabled={invoicePdf.isPending && invoicePdf.variables?.invoiceId === invoice.invoiceId} onClick={() => invoicePdf.mutate(invoice)}><Download size={13} />PDF</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="No invoices yet" description="Use Create Invoice to invoice this student." />
                )
              ) : null}
            </div>
          </section>

          <PaymentForm
            open={formOpen}
            onClose={() => setFormOpen(false)}
            account={account}
            editing={editing}
            preselectInvoiceIds={preselect}
            onSaved={(payment, wasEdit) => {
              setFormOpen(false);
              setEditing(null);
              setViewing(null);
              setSaved({ payment, wasEdit });
              setNotice(null);
              refresh();
            }}
          />
        </>
      )}

      <PaymentDetailDialog
        paymentId={viewing}
        onClose={() => setViewing(null)}
        onEdit={(payment) => {
          setViewing(null);
          setEditing(payment);
          setFormOpen(true);
        }}
        onChanged={(message) => {
          setNotice(message);
          setSaved(null);
          refresh();
        }}
      />
    </AppShell>
  );
}
