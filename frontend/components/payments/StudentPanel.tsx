"use client";

// 2026-10-09 (Payments revamp R1): the student side panel. Any student name
// in Payments opens it: what they owe, their advance, unpaid invoices, last
// payments and pay link, with Record Payment and the full account one click
// away, without leaving the page. Ctrl/⌘-click (or middle-click) on a name
// still opens the full account in a new tab.
// R4: opens centred like every other dialog (two columns on a computer, a
// bottom sheet on a phone) instead of sliding in from the right.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, BellRing, HandCoins, Loader2, MessageSquarePlus, Phone, PiggyBank, ReceiptText, UserRound, Wallet, X } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { InlineError } from "@/components/payments/PaymentsUi";
import { PayLinkCard } from "@/components/payments/PayLinkCard";
import { LastContactText, PromisePill, useFollowUp } from "@/components/payments/FollowUp";
import { useQuickPay } from "@/components/payments/QuickPay";
import { addFollowUpNote, getStudentAccount, getStudentBilling, getStudentFollowUp } from "@/lib/api/payments";
import "./payments-r1.css";
import { FormatDate } from "@/lib/paymentsDates";

type PanelContext = { open: (studentId: string) => void };

const StudentPanelContext = createContext<PanelContext | null>(null);

export function AccountHref(studentId: string, pay?: string) {
  return `/admin/payments/collections?tab=student-fees&studentId=${encodeURIComponent(studentId)}${pay ? `&pay=${encodeURIComponent(pay)}` : ""}`;
}

export function StudentPanelProvider({ children }: { children: ReactNode }) {
  const [studentId, setStudentId] = useState<string | null>(null);
  const open = useCallback((id: string) => setStudentId(id), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <StudentPanelContext.Provider value={value}>
      {children}
      <StudentPanel studentId={studentId} onClose={() => setStudentId(null)} />
    </StudentPanelContext.Provider>
  );
}

export function useStudentPanel() {
  return useContext(StudentPanelContext);
}

/** A student's name that opens the side panel (or the full account with a modifier key). */
export function StudentLink({ studentId, children, className }: { studentId: string; children: ReactNode; className?: string }) {
  const panel = useStudentPanel();
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!panel || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    panel.open(studentId);
  };
  return (
    <Link href={AccountHref(studentId)} onClick={onClick} className={className ?? "font-black text-slate-900 hover:underline dark:text-white"}>
      {children}
    </Link>
  );
}

function Money({ label, value, tone, icon }: { label: string; value: string; tone: "amber" | "rose" | "violet" | "slate" | "emerald"; icon: ReactNode }) {
  const toneClass = {
    amber: "text-amber-700 dark:text-amber-300",
    rose: "text-rose-700 dark:text-rose-300",
    violet: "text-violet-700 dark:text-violet-300",
    emerald: "text-emerald-700 dark:text-emerald-300",
    slate: "text-slate-500 dark:text-slate-400",
  }[tone];
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/70">
      <p className={`flex items-center gap-1.5 text-xs font-black ${toneClass}`}>{icon}{label}</p>
      <p className="mp-money-value mt-0.5 whitespace-nowrap font-black tabular-nums text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}

function StudentPanel({ studentId, onClose }: { studentId: string | null; onClose: () => void }) {
  const quickPay = useQuickPay();
  const [mounted, setMounted] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => setMounted(true), []);
  const query = useQuery({ queryKey: ["admin", "payments", "account", studentId], queryFn: () => getStudentAccount(studentId!), enabled: Boolean(studentId) });
  const billing = useQuery({ queryKey: ["admin", "payments", "billing", "student", studentId], queryFn: () => getStudentBilling(studentId!), enabled: Boolean(studentId) });

  useEffect(() => {
    if (!studentId) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const timer = window.setTimeout(() => closeRef.current?.focus(), 30);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
      returnFocus.current?.focus?.();
    };
  }, [studentId, onClose]);

  if (!mounted || !studentId) return null;
  const account = query.data;
  const totals = account?.totals;
  const unpaid = account?.unpaidInvoices ?? [];
  const payments = (account?.payments ?? []).filter((row) => row.status === "RECORDED").slice(0, 3);

  return createPortal(
    <div className="fixed inset-0 z-[99990] flex items-end justify-center sm:items-center sm:p-4" role="presentation">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm mp-fade-in" onMouseDown={onClose} aria-hidden />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={account ? `${account.student.name}: fees` : "Student fees"}
        className="mp-panel-surface math-pop-in relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[28px] border border-slate-200 shadow-[0_0_80px_rgba(15,23,42,0.35)] dark:border-slate-800 sm:max-w-xl sm:rounded-[32px] lg:max-w-[940px]"
      >
        <header className="mp-panel-head flex items-start gap-3 border-b border-slate-200 px-5 pb-4 pt-5 dark:border-slate-800 sm:px-6">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200"><UserRound size={20} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-black text-slate-950 dark:text-white">{account?.student.name ?? "Loading…"}{account && !account.student.isActive ? " (inactive)" : ""}</h2>
            {account ? (
              <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                {[account.student.studentCode, account.student.levelCode, account.student.centreName ?? "No centre"].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            {account && (account.student.parentName || account.student.mobile) ? (
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                {account.student.parentName ? <span>{account.student.parentName}</span> : null}
                {account.student.mobile ? <span className="inline-flex items-center gap-1 tabular-nums"><Phone size={12} />{account.student.mobile}</span> : null}
              </p>
            ) : null}
            {billing.data ? (
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{billing.data.billingModeLabel} fee</span>
                <Link href={`/admin/payments/invoices?tab=monthly&period=${billing.data.period}`} onClick={onClose} className={`hover:underline ${billing.data.state === "INVOICED" ? "text-emerald-700 dark:text-emerald-300" : billing.data.state === "DROPPED" ? "text-slate-500 dark:text-slate-400" : "text-amber-700 dark:text-amber-300"}`}>
                  {billing.data.state === "INVOICED"
                    ? `${billing.data.periodLabel} invoiced (${billing.data.invoiceNumber})`
                    : billing.data.state === "DRAFT"
                      ? `${billing.data.periodLabel} draft waiting to be released`
                      : billing.data.state === "DROPPED"
                        ? `Not billed for ${billing.data.periodLabel}${billing.data.dropReason ? `: ${billing.data.dropReason}` : ""}`
                        : `${billing.data.periodLabel} not billed yet`}
                </Link>
              </p>
            ) : null}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="math-focus-ring rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-5 sm:px-6">
          {query.isLoading ? (
            <div className="flex items-center gap-2 py-10 text-sm font-bold text-slate-500"><Loader2 size={16} className="animate-spin" />Loading…</div>
          ) : query.error || !account || !totals ? (
            <InlineError error={query.error ?? new Error("This student's account could not be loaded.")} />
          ) : (
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-6">
             <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
              <div className="grid grid-cols-3 gap-2">
                <Money label="Due" value={totals.dueDisplay} tone={totals.duePaise ? "amber" : "emerald"} icon={<Wallet size={13} />} />
                <Money label="Overdue" value={totals.overdueDisplay} tone={totals.overduePaise ? "rose" : "slate"} icon={<AlertTriangle size={13} />} />
                <Money label="Advance" value={totals.advanceDisplay} tone={totals.advancePaise ? "violet" : "slate"} icon={<PiggyBank size={13} />} />
              </div>

              <section aria-labelledby="sp-unpaid">
                <h3 id="sp-unpaid" className="text-sm font-black text-slate-900 dark:text-white">Unpaid invoices <span className="font-bold text-slate-400">({unpaid.length})</span></h3>
                {unpaid.length ? (
                  <ul className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-1.5">
                    {unpaid.slice(0, 6).map((invoice) => (
                      <li key={invoice.invoiceId}>
                        <Link
                          href={AccountHref(account.student.studentId, invoice.invoiceId)}
                          onClick={onClose}
                          className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 transition hover:border-cyan-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-cyan-700"
                          title={`Record a payment for ${invoice.invoiceNumber}`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-black text-slate-900 dark:text-white">{invoice.feeName}{invoice.periodLabel ? <span className="font-bold text-slate-500 dark:text-slate-400"> · {invoice.periodLabel}</span> : null}</span>
                            <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                              <span className="tabular-nums">{invoice.invoiceNumber}</span>
                              {invoice.isOverdue ? <span className="font-black text-rose-600 dark:text-rose-300">Overdue since {FormatDate(invoice.dueDate)}</span> : invoice.dueDate ? <span>Due {FormatDate(invoice.dueDate)}</span> : null}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm font-black tabular-nums text-slate-950 dark:text-white">{invoice.balanceDisplay}</span>
                          <HandCoins size={15} className="shrink-0 text-slate-300 transition group-hover:text-cyan-600" aria-hidden />
                        </Link>
                      </li>
                    ))}
                    {unpaid.length > 6 ? <li className="px-1 text-xs font-bold text-slate-500">+{unpaid.length - 6} more in the full account</li> : null}
                  </ul>
                ) : (
                  <p className="mt-2 rounded-2xl border border-dashed border-slate-200 px-3 py-3 text-sm font-semibold text-slate-500 dark:border-slate-800">Nothing unpaid.</p>
                )}
              </section>

              <section aria-labelledby="sp-payments">
                <h3 id="sp-payments" className="text-sm font-black text-slate-900 dark:text-white">Last payments</h3>
                {payments.length ? (
                  <ul className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-1.5">
                    {payments.map((payment) => (
                      <li key={payment.paymentId} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5 dark:bg-slate-900/70">
                        <ReceiptText size={15} className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-black tabular-nums text-slate-900 dark:text-white">{payment.receiptNumber} <span className="font-bold text-slate-500 dark:text-slate-400">· {FormatDate(payment.paymentDate)}</span></span>
                          <span className="block truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{payment.methodSummary}</span>
                        </span>
                        <span className="shrink-0 text-sm font-black tabular-nums text-emerald-700 dark:text-emerald-300">{payment.amountDisplay}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 rounded-2xl border border-dashed border-slate-200 px-3 py-3 text-sm font-semibold text-slate-500 dark:border-slate-800">No payments yet.</p>
                )}
              </section>

             </div>
             <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
              <PanelFollowUp studentId={account.student.studentId} studentName={account.student.name} owes={totals.duePaise > 0} onLeave={onClose} />
              <PayLinkCard studentId={account.student.studentId} studentName={account.student.name} compact />
             </div>
            </div>
          )}
        </div>

        {account ? (
          <footer className="mp-panel-head flex flex-wrap gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800 sm:justify-end sm:px-6">
            {quickPay ? (
              <button type="button" onClick={() => { onClose(); quickPay.open(account.student.studentId); }} className="math-button-primary flex-1 justify-center whitespace-nowrap sm:flex-none"><HandCoins size={17} />Record Payment</button>
            ) : (
              <Link href={AccountHref(account.student.studentId, "new")} onClick={onClose} className="math-button-primary flex-1 justify-center whitespace-nowrap sm:flex-none"><HandCoins size={17} />Record Payment</Link>
            )}
            <Link href={AccountHref(account.student.studentId)} onClick={onClose} className="math-button-secondary flex-1 justify-center whitespace-nowrap sm:flex-none">Full account<ArrowRight size={16} /></Link>
          </footer>
        ) : null}
      </section>
    </div>,
    document.body,
  );
}


// The panel is rendered on document.body, outside the admin role styles, so
// its small buttons carry their own light and dark colours.
const PANEL_BUTTON = "inline-flex h-9 items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm transition hover:border-cyan-300 hover:text-cyan-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-cyan-700 dark:hover:text-cyan-200";

// 2026-10-09 (revamp R4): follow-ups in the side panel -- last contact, any
// promise, the latest notes, and Log contact / Reminder / Call / Add note.
function PanelFollowUp({ studentId, studentName, owes, onLeave }: { studentId: string; studentName: string; owes: boolean; onLeave: () => void }) {
  const followUp = useFollowUp();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "payments", "followups", "student", studentId], queryFn: () => getStudentFollowUp(studentId) });
  const [note, setNote] = useState("");
  const add = useMutation({
    mutationFn: () => addFollowUpNote(studentId, note.trim()),
    onSuccess: (next) => { queryClient.setQueryData(["admin", "payments", "followups", "student", studentId], next); queryClient.invalidateQueries({ queryKey: ["admin", "payments", "followups", "list"] }); setNote(""); },
  });
  const data = query.data;
  if (!data || (!owes && data.entries.length === 0)) return null;
  const target = { studentId, studentName, suggestedTemplate: data.suggestedTemplate };
  return (
    <section aria-labelledby="sp-followup" className="rounded-2xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="sp-followup" className="text-sm font-black text-slate-900 dark:text-white">Follow-up</h3>
        <PromisePill state={data} />
      </div>
      <p className="mt-1 text-xs font-semibold"><LastContactText state={data} /></p>
      {data.entries.length ? (
        <ul className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-1.5 border-l-2 border-slate-200 pl-3 dark:border-slate-700">
          {data.entries.slice(0, 3).map((entry) => (
            <li key={entry.id} className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              <span className="font-black text-slate-800 dark:text-slate-100">{entry.kind === "NOTE" ? "Note" : entry.kind === "REMINDER" ? `${entry.templateTitle ?? ""} reminder` : entry.channelLabel}</span>
              {entry.at ? ` · ${new Date(entry.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })}` : ""}
              {entry.byName ? ` · ${entry.byName}` : ""}
              {entry.note && entry.kind !== "REMINDER" ? <span className="block text-slate-600 dark:text-slate-300">{entry.note}</span> : null}
              {entry.promiseDate ? <span className="block text-sky-700 dark:text-sky-300">Promised for {FormatDate(entry.promiseDate)}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <form className="mt-2 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (note.trim() && !add.isPending) add.mutate(); }}>
        <input className="math-input h-9 min-w-0 flex-1 px-3 text-xs" value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="Add a note" aria-label="Add a follow-up note" />
        <button type="submit" className={`${PANEL_BUTTON} shrink-0`} disabled={!note.trim() || add.isPending}>Add</button>
      </form>
      {add.error ? <div className="mt-2"><InlineError error={add.error} /></div> : null}
      {followUp && owes ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={PANEL_BUTTON} onClick={() => { onLeave(); followUp.logContact([target]); }}><MessageSquarePlus size={13} />Log contact</button>
          <button type="button" className={PANEL_BUTTON} onClick={() => { onLeave(); followUp.reminder(target, data.inAppAvailable); }}><BellRing size={13} />Reminder</button>
          {data.mobile ? <a href={`tel:${data.mobile.replace(/[^\d+]/g, "")}`} className={PANEL_BUTTON}><Phone size={13} />Call</a> : null}
        </div>
      ) : null}
    </section>
  );
}
