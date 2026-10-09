"use client";

// 2026-10-09 (Payments revamp R2): Quick Pay, the 15-second counter payment.
// Pick the student (or arrive with one from the side panel, search or Dues):
// their unpaid invoices are ticked oldest first, the amount is filled in, and
// the method is the one you used last. Paying less covers the oldest invoices
// first; paying more keeps the extra as the student's advance (said plainly
// before you press Record). Split methods, a discount, a different receiver or
// a note are under "More options", which opens the full Record Payment form.
// After saving, the success screen offers the receipt.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, CheckCircle2, Download, Eye, HandCoins, Loader2, PiggyBank, Search, SlidersHorizontal, UserRound } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { PaymentForm } from "@/components/payments/PaymentForm";
import { InlineError, PaymentsDialog } from "@/components/payments/PaymentsUi";
import {
  COUNTER_METHODS,
  downloadReceiptPdf,
  getQuickPayDefaults,
  getStudentAccount,
  recordPayment,
  saveBlob,
  searchPayments,
  type Invoice,
  type Payment,
  type PaymentMethodCode,
  type StudentAccount,
} from "@/lib/api/payments";
import { FormatDate } from "@/lib/paymentsDates";
import { FormatRupees } from "@/lib/paymentsMoney";

type QuickPayContextValue = { open: (studentId?: string | null) => void };
const QuickPayContext = createContext<QuickPayContextValue | null>(null);

export function useQuickPay() {
  return useContext(QuickPayContext);
}

export function QuickPayProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; studentId: string | null; nonce: number }>({ open: false, studentId: null, nonce: 0 });
  const open = useCallback((studentId?: string | null) => setState((current) => ({ open: true, studentId: studentId ?? null, nonce: current.nonce + 1 })), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <QuickPayContext.Provider value={value}>
      {children}
      {state.open ? <QuickPaySheet key={state.nonce} initialStudentId={state.studentId} onClose={() => setState((current) => ({ ...current, open: false }))} /> : null}
    </QuickPayContext.Provider>
  );
}

function TodayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function NewKey(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    // fall through
  }
  return `qp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** "" -> 0; "1,100.5" -> 110050; invalid -> null. */
function ParsePaise(raw: string): number | null {
  const text = raw.replace(/[,₹\s]/g, "");
  if (!text) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const paise = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return paise > 10_00_000 * 100 ? null : paise;
}

function ToRupees(paise: number): string {
  if (!paise) return "";
  return paise % 100 ? (paise / 100).toFixed(2) : String(paise / 100);
}

// Six one-tap methods (an even 3 x 2 / 2 x 3 grid); "Others" and split
// methods are in More options.
const METHOD_CHIPS = COUNTER_METHODS.filter((item) => item.value !== "OTHERS");

function QuickPaySheet({ initialStudentId, onClose }: { initialStudentId: string | null; onClose: () => void }) {
  const [studentId, setStudentId] = useState<string | null>(initialStudentId);
  const [done, setDone] = useState<{ payment: Payment; dueAfter: number; studentName: string } | null>(null);
  const [fullForm, setFullForm] = useState<{ account: StudentAccount; invoiceIds: string[] } | null>(null);
  const queryClient = useQueryClient();

  const afterSave = (payment: Payment, account: StudentAccount, applied: number) => {
    queryClient.invalidateQueries({ queryKey: ["admin", "payments"] });
    setFullForm(null);
    setDone({ payment, dueAfter: Math.max(0, account.totals.duePaise - applied - payment.discountPaise), studentName: account.student.name });
  };

  if (fullForm) {
    return (
      <PaymentForm
        open
        account={fullForm.account}
        preselectInvoiceIds={fullForm.invoiceIds}
        onClose={() => setFullForm(null)}
        onSaved={(payment) => afterSave(payment, fullForm.account, payment.amountPaise - payment.advancePaise)}
      />
    );
  }

  if (done) {
    return (
      <QuickPayDone
        payment={done.payment}
        studentName={done.studentName}
        dueAfter={done.dueAfter}
        onNext={() => { setDone(null); setStudentId(null); }}
        onClose={onClose}
      />
    );
  }

  if (!studentId) return <StudentPicker onPick={setStudentId} onClose={onClose} />;
  return (
    <QuickPayForm
      studentId={studentId}
      onBack={initialStudentId ? null : () => setStudentId(null)}
      onClose={onClose}
      onMore={(account, invoiceIds) => setFullForm({ account, invoiceIds })}
      onSaved={afterSave}
    />
  );
}

function useDebounced<T>(value: T, delay = 180): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function StudentPicker({ onPick, onClose }: { onPick: (studentId: string) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const query = useDebounced(text.trim());
  const results = useQuery({ queryKey: ["admin", "payments", "search", query], queryFn: () => searchPayments(query), enabled: query.length >= 2, staleTime: 15_000 });
  const students = query.length >= 2 ? results.data?.students ?? [] : [];
  useEffect(() => setActive(0), [query]);

  return (
    <PaymentsDialog open kicker="Quick Pay" title="Who is paying?" onClose={onClose}>
      <div className="grid gap-3">
        <label className="relative block">
          <span className="sr-only">Find the student</span>
          <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            className="math-input pl-11"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => Math.min(index + 1, Math.max(students.length - 1, 0))); }
              if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); }
              if (event.key === "Enter" && students[active]) { event.preventDefault(); onPick(students[active].studentId); }
            }}
            placeholder="Name, student ID, parent or mobile"
            aria-label="Find the student"
          />
        </label>
        {query.length < 2 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">Type at least 2 letters or digits.</p>
        ) : results.isLoading ? (
          <p className="flex items-center justify-center gap-2 px-4 py-6 text-sm font-semibold text-slate-500"><Loader2 size={16} className="animate-spin" />Searching…</p>
        ) : students.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">No student matches “{query}”.</p>
        ) : (
          <ul className="grid gap-2" role="listbox" aria-label="Students">
            {students.map((student, index) => (
              <li key={student.studentId}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => onPick(student.studentId)}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${index === active ? "border-cyan-300 bg-cyan-50 dark:border-cyan-800 dark:bg-cyan-950/30" : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/60"}`}
                >
                  <UserRound size={17} className="shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-black text-slate-900 dark:text-white">{student.name}</span>
                    <span className="block truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{[student.studentCode, student.parentName, student.mobile].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className={`shrink-0 text-right text-sm font-black tabular-nums ${student.due.paise ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}>
                    {student.due.paise ? `${student.due.display} due` : "Nothing due"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PaymentsDialog>
  );
}

function QuickPayForm({
  studentId,
  onBack,
  onClose,
  onMore,
  onSaved,
}: {
  studentId: string;
  onBack: (() => void) | null;
  onClose: () => void;
  onMore: (account: StudentAccount, invoiceIds: string[]) => void;
  onSaved: (payment: Payment, account: StudentAccount, applied: number) => void;
}) {
  const today = TodayInIndia();
  const accountQuery = useQuery({ queryKey: ["admin", "payments", "account", studentId], queryFn: () => getStudentAccount(studentId) });
  const defaultsQuery = useQuery({ queryKey: ["admin", "payments", "quick-pay-defaults"], queryFn: getQuickPayDefaults, staleTime: 60_000 });
  const account = accountQuery.data;

  const invoices = useMemo<Invoice[]>(
    () => [...(account?.unpaidInvoices ?? [])].sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.invoiceNumber.localeCompare(b.invoiceNumber)),
    [account]
  );
  const [ticked, setTicked] = useState<Set<string> | null>(null);
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [method, setMethod] = useState<PaymentMethodCode | null>(null);
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(today);
  const [changeDate, setChangeDate] = useState(false);
  const [tried, setTried] = useState(false);
  const [key] = useState(NewKey);

  // Defaults once the account arrives: every unpaid invoice ticked.
  useEffect(() => {
    if (account && ticked === null) setTicked(new Set(invoices.map((row) => row.invoiceId)));
  }, [account, invoices, ticked]);
  useEffect(() => {
    if (method === null && defaultsQuery.isFetched) setMethod(defaultsQuery.data?.lastMethod && METHOD_CHIPS.some((chip) => chip.value === defaultsQuery.data?.lastMethod) ? defaultsQuery.data.lastMethod : "CASH");
  }, [defaultsQuery.isFetched, defaultsQuery.data, method]);

  const chosen = invoices.filter((row) => ticked?.has(row.invoiceId));
  const tickedTotal = chosen.reduce((sum, row) => sum + row.balancePaise, 0);
  useEffect(() => {
    if (!amountTouched) setAmount(ToRupees(tickedTotal));
  }, [tickedTotal, amountTouched]);

  const received = ParsePaise(amount);
  // Oldest first: what each ticked invoice gets from the amount.
  const plan = useMemo(() => {
    let left = received ?? 0;
    return chosen.map((row) => {
      const pay = Math.min(left, row.balancePaise);
      left -= pay;
      return { invoice: row, pay };
    });
  }, [chosen, received]);
  const applied = plan.reduce((sum, line) => sum + line.pay, 0);
  const extra = Math.max(0, (received ?? 0) - applied);
  const chip = METHOD_CHIPS.find((item) => item.value === method);

  const problems: string[] = [];
  if (received === null) problems.push("Enter a valid amount, like 1100 or 1100.50.");
  else if (!received) problems.push("Enter the amount received.");
  if (chip?.needsReference && !reference.trim()) problems.push(`Enter the ${chip.label} reference number.`);
  if (!paymentDate || paymentDate > today) problems.push("The payment date cannot be in the future.");

  const save = useMutation({
    mutationFn: () =>
      recordPayment({
        studentId,
        idempotencyKey: key,
        paymentDate,
        payBy: account?.student.parentName ?? null,
        allocations: plan.filter((line) => line.pay > 0).map((line) => ({ invoiceId: line.invoice.invoiceId, amountPaise: line.pay, discountPaise: 0 })),
        methods: [{ method: method ?? "CASH", amountPaise: received ?? 0, reference: reference.trim() || null }],
        keepAdvance: extra > 0,
      }),
    onSuccess: (payment) => account && onSaved(payment, account, applied),
  });

  const submit = () => {
    setTried(true);
    if (problems.length || save.isPending || !account) return;
    save.mutate();
  };

  const title = account?.student.name ?? "Quick Pay";
  const numberingReady = account?.receiptNumbering.numberingReady ?? true;

  return (
    <PaymentsDialog
      open
      kicker="Quick Pay"
      title={title}
      onClose={() => { if (!save.isPending) onClose(); }}
      footer={
        <>
          {account ? (
            <button type="button" className="math-button-secondary mr-auto" disabled={save.isPending} onClick={() => onMore(account, chosen.map((row) => row.invoiceId))}>
              <SlidersHorizontal size={16} />More options
            </button>
          ) : null}
          <button type="submit" form="quick-pay-form" className="math-button-primary" disabled={save.isPending || !account || !numberingReady}>
            {save.isPending ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
            {received ? `Record ${FormatRupees(received)}` : "Record payment"}
          </button>
        </>
      }
    >
      {accountQuery.isLoading || !account ? (
        accountQuery.error ? <InlineError error={accountQuery.error} /> : <p className="flex items-center justify-center gap-2 py-10 text-sm font-semibold text-slate-500"><Loader2 size={16} className="animate-spin" />Loading the account…</p>
      ) : (
        <form id="quick-pay-form" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <div className="-mt-2 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="min-w-0 text-sm font-semibold text-slate-500 dark:text-slate-400">
              {[account.student.studentCode, account.student.levelCode, account.student.centreName, account.student.parentName].filter(Boolean).join(" · ")}
            </p>
            {onBack ? <button type="button" className="inline-flex items-center gap-1 text-xs font-black text-cyan-700 hover:underline dark:text-cyan-300" disabled={save.isPending} onClick={onBack}><ArrowLeft size={13} />Change student</button> : null}
          </div>
          {!numberingReady ? (
            <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
              The starting receipt number is not set yet. Set it in Payment Settings → Document Numbering first.
            </div>
          ) : null}

          <section className="grid grid-cols-[minmax(0,1fr)] gap-2" aria-label="Invoices being paid">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Paying for</h3>
              {invoices.length ? <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{FormatRupees(account.totals.duePaise)} due in all</span> : null}
            </div>
            {invoices.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">
                Nothing is due. Money received now is kept as advance for this student&apos;s next invoices.
              </p>
            ) : (
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
                {invoices.map((row) => {
                  const isTicked = Boolean(ticked?.has(row.invoiceId));
                  const pay = plan.find((line) => line.invoice.invoiceId === row.invoiceId)?.pay ?? 0;
                  const part = isTicked && pay < row.balancePaise;
                  return (
                    <li key={row.invoiceId}>
                      <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition ${isTicked ? "border-cyan-200 bg-cyan-50/60 dark:border-cyan-900/60 dark:bg-cyan-950/20" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/60"}`}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 accent-cyan-600"
                          checked={isTicked}
                          onChange={() => setTicked((current) => {
                            const next = new Set(current ?? []);
                            if (next.has(row.invoiceId)) next.delete(row.invoiceId);
                            else next.add(row.invoiceId);
                            return next;
                          })}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-black leading-snug text-slate-900 dark:text-white">{row.feeName}{row.periodLabel ? ` · ${row.periodLabel}` : ""}</span>
                          <span className={`block text-xs font-semibold leading-snug ${row.isOverdue ? "text-rose-600 dark:text-rose-300" : "text-slate-500 dark:text-slate-400"}`}>
                            {row.invoiceNumber} · {row.isOverdue ? "overdue" : row.dueDate ? `due ${FormatDate(row.dueDate)}` : FormatDate(row.invoiceDate)}
                          </span>
                        </span>
                        <span className="shrink-0 text-right tabular-nums">
                          <span className="block text-sm font-black text-slate-900 dark:text-white">{row.balanceDisplay}</span>
                          {part ? <span className="block text-xs font-bold text-amber-700 dark:text-amber-300">{pay ? `${FormatRupees(pay)} now` : "not covered"}</span> : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="grid grid-cols-[minmax(0,1fr)] gap-2" aria-label="Amount and method">
            <label className="grid gap-1.5">
              <span className="text-sm font-black text-slate-900 dark:text-white">Amount received (₹)</span>
              <input
                className="math-input text-lg font-black tabular-nums"
                inputMode="decimal"
                value={amount}
                onChange={(event) => { setAmount(event.target.value); setAmountTouched(true); }}
                aria-invalid={tried && (received === null || !received)}
              />
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="How it was paid">
              {METHOD_CHIPS.map((item) => {
                const selected = method === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setMethod(item.value)}
                    className={`rounded-2xl border px-3 py-2.5 text-sm font-black transition ${selected ? "border-transparent bg-gradient-to-r from-slate-900 to-indigo-700 text-white shadow-sm dark:from-cyan-500 dark:to-indigo-500" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200"}`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            {chip?.needsReference ? (
              <label className="grid gap-1.5">
                <span className="text-sm font-black text-slate-900 dark:text-white">{chip.label} reference</span>
                <input className="math-input" value={reference} onChange={(event) => setReference(event.target.value)} placeholder={method === "UPI" ? "UPI transaction ID" : method === "CHEQUE" ? "Cheque number" : "Reference number"} aria-invalid={tried && !reference.trim()} />
              </label>
            ) : null}
          </section>

          <div className="grid gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-900/60">
            <div className="flex items-center justify-between gap-3">
              <span className="font-bold text-slate-600 dark:text-slate-300">Applied to invoices</span>
              <span className="font-black tabular-nums text-slate-900 dark:text-white">{FormatRupees(applied)}</span>
            </div>
            {extra > 0 ? (
              <div className="flex items-center justify-between gap-3 text-violet-800 dark:text-violet-200">
                <span className="flex items-center gap-1.5 font-bold"><PiggyBank size={15} />Kept as advance</span>
                <span className="font-black tabular-nums">{FormatRupees(extra)}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-2 dark:border-slate-800">
              <span className="font-bold text-slate-600 dark:text-slate-300">Still due after this</span>
              <span className="font-black tabular-nums text-slate-900 dark:text-white">{FormatRupees(Math.max(0, account.totals.duePaise - applied))}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2 dark:border-slate-800">
              <span className="flex items-center gap-1.5 font-bold text-slate-600 dark:text-slate-300"><CalendarDays size={15} />{paymentDate === today ? "Today" : FormatDate(paymentDate)}</span>
              {changeDate ? (
                <input type="date" className="math-input h-9 w-auto px-3 py-1 text-sm" value={paymentDate} max={today} onChange={(event) => setPaymentDate(event.target.value)} aria-label="Payment date" />
              ) : (
                <button type="button" className="text-xs font-black text-cyan-700 hover:underline dark:text-cyan-300" onClick={() => setChangeDate(true)}>Change date</button>
              )}
            </div>
          </div>

          {tried && problems.length ? (
            <ul role="alert" className="grid gap-1 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
              {problems.map((problem) => <li key={problem}>{problem}</li>)}
            </ul>
          ) : null}
          {save.error ? <InlineError error={save.error} /> : null}
        </form>
      )}
    </PaymentsDialog>
  );
}

function QuickPayDone({ payment, studentName, dueAfter, onNext, onClose }: { payment: Payment; studentName: string; dueAfter: number; onNext: () => void; onClose: () => void }) {
  const download = useMutation({
    mutationFn: () => downloadReceiptPdf(payment.paymentId),
    onSuccess: (blob) => saveBlob(blob, `${payment.receiptNumber}.pdf`),
  });
  return (
    <PaymentsDialog
      open
      kicker="Payment recorded"
      title={`${payment.amountDisplay} from ${studentName}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="math-button-secondary mr-auto" onClick={onNext}><HandCoins size={16} />Next payment</button>
          <button type="button" className="math-button-primary" onClick={onClose}>Done</button>
        </>
      }
    >
      <div className="grid gap-5">
        <div className="flex items-center gap-4 rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white mp-drop-in"><CheckCircle2 size={26} /></span>
          <div className="min-w-0">
            <p className="text-lg font-black text-emerald-900 dark:text-emerald-100">Receipt {payment.receiptNumber}</p>
            <p className="text-sm font-semibold text-emerald-800/90 dark:text-emerald-200/90">
              {payment.methodSummary}{payment.invoiceNumbers.length ? ` · for ${payment.invoiceNumbers.join(", ")}` : ""}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
            <dt className="font-bold text-slate-500 dark:text-slate-400">Still due</dt>
            <dd className="mt-1 text-lg font-black tabular-nums text-slate-900 dark:text-white">{FormatRupees(dueAfter)}</dd>
          </div>
          <div className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
            <dt className="font-bold text-slate-500 dark:text-slate-400">Kept as advance</dt>
            <dd className="mt-1 text-lg font-black tabular-nums text-slate-900 dark:text-white">{payment.advanceDisplay}</dd>
          </div>
        </dl>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" className="math-button-secondary justify-center" disabled={download.isPending} onClick={() => download.mutate()}>
            {download.isPending ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}Download receipt
          </button>
          <Link href={`/admin/payments/collections?tab=payments&open=${encodeURIComponent(payment.paymentId)}`} onClick={onClose} className="math-button-secondary justify-center">
            <Eye size={17} />View receipt
          </Link>
        </div>
        {download.error ? <InlineError error={download.error} /> : null}
      </div>
    </PaymentsDialog>
  );
}

/** "Record Payment": opens Quick Pay (or Student Fees outside Payments). */
export function RecordPaymentButton({ className, studentId }: { className: string; studentId?: string }) {
  const quickPay = useQuickPay();
  if (!quickPay) {
    return <Link href={`/admin/payments/collections?tab=student-fees${studentId ? `&studentId=${encodeURIComponent(studentId)}` : ""}`} className={className}><HandCoins size={17} />Record Payment</Link>;
  }
  return <button type="button" className={className} onClick={() => quickPay.open(studentId)}><HandCoins size={17} />Record Payment</button>;
}
