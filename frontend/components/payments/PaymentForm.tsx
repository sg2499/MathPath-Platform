"use client";

// 2026-10-08 (Payments Phase 3): Record Payment / Edit Payment.
// Tick the invoices being paid (the amount fills in, oldest first, and can be
// changed for a part-payment), add how the money came in (split methods with
// references), an optional discount with a reason, and optionally keep money
// beyond what is due as the student's advance. The live summary shows the
// due before and after. The server re-checks everything.
import { FieldLabel, InlineError, PaymentsDialog } from "@/components/payments/PaymentsUi";
import {
  COUNTER_METHODS,
  editPayment,
  listPaymentStaff,
  recordPayment,
  type Invoice,
  type Payment,
  type PaymentMethodCode,
  type StudentAccount,
} from "@/lib/api/payments";
import { FormatRupees } from "@/lib/paymentsMoney";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Row = { checked: boolean; pay: string; discount: string };
type MethodRow = { method: PaymentMethodCode; amount: string; reference: string };

function TodayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function NewKey(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    // fall through
  }
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
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

function FormatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function PaymentForm({
  open,
  onClose,
  account,
  editing,
  preselectInvoiceIds,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  account: StudentAccount;
  editing?: Payment | null;
  preselectInvoiceIds?: string[];
  onSaved: (payment: Payment, wasEdit: boolean) => void;
}) {
  const staffQuery = useQuery({ queryKey: ["admin", "payments", "staff"], queryFn: listPaymentStaff, enabled: open });
  const today = TodayInIndia();

  // What this payment already covers, when editing.
  const ownDirect = useMemo(() => {
    const map = new Map<string, { amount: number; discount: number }>();
    (editing?.allocations ?? []).filter((row) => !row.released && row.kind === "DIRECT").forEach((row) => {
      const current = map.get(row.invoiceId) ?? { amount: 0, discount: 0 };
      map.set(row.invoiceId, { amount: current.amount + row.amountPaise, discount: current.discount + row.discountPaise });
    });
    return map;
  }, [editing]);
  const ownAdvanceUsed = useMemo(
    () => (editing?.allocations ?? []).filter((row) => !row.released && row.kind === "ADVANCE").reduce((sum, row) => sum + row.amountPaise, 0),
    [editing]
  );

  // Invoices that can be paid: unpaid ones, plus (when editing) the ones this
  // payment already pays. Oldest first.
  const choices = useMemo(() => {
    const byId = new Map<string, Invoice>();
    account.unpaidInvoices.forEach((row) => byId.set(row.invoiceId, row));
    ownDirect.forEach((_, invoiceId) => {
      const row = account.invoices.find((item) => item.invoiceId === invoiceId);
      if (row && row.status !== "CANCELLED") byId.set(invoiceId, row);
    });
    return Array.from(byId.values())
      .map((row) => {
        const own = ownDirect.get(row.invoiceId);
        return { invoice: row, open: row.balancePaise + (own ? own.amount + own.discount : 0) };
      })
      .sort((a, b) => a.invoice.invoiceDate.localeCompare(b.invoice.invoiceDate) || a.invoice.invoiceNumber.localeCompare(b.invoice.invoiceNumber));
  }, [account, ownDirect]);

  const [rows, setRows] = useState<Record<string, Row>>({});
  const [methods, setMethods] = useState<MethodRow[]>([{ method: "CASH", amount: "", reference: "" }]);
  // 2026-10-09 (Phase 5): a payment made online keeps its Razorpay line:
  // Razorpay holds the amount, so only where it is applied can change.
  const isOnline = editing?.channel === "ONLINE";
  const [methodTouched, setMethodTouched] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountReason, setDiscountReason] = useState("");
  const [keepAdvance, setKeepAdvance] = useState(false);
  const [paymentDate, setPaymentDate] = useState(today);
  const [payBy, setPayBy] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [key, setKey] = useState("");
  const [tried, setTried] = useState(false);
  const problemsRef = useRef<HTMLDivElement | null>(null);

  // Fresh form every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const next: Record<string, Row> = {};
    choices.forEach(({ invoice, open: due }) => {
      const own = ownDirect.get(invoice.invoiceId);
      if (editing) {
        next[invoice.invoiceId] = own
          ? { checked: true, pay: ToRupees(own.amount), discount: ToRupees(own.discount) }
          : { checked: false, pay: "", discount: "" };
      } else {
        const pick = (preselectInvoiceIds ?? []).includes(invoice.invoiceId);
        next[invoice.invoiceId] = { checked: pick, pay: pick ? ToRupees(due) : "", discount: "" };
      }
    });
    setRows(next);
    if (editing) {
      setMethods(editing.methods.map((line) => ({ method: line.method, amount: ToRupees(line.amountPaise), reference: line.reference ?? "" })));
      setMethodTouched(true);
      setShowDiscount(editing.discountPaise > 0);
      setDiscountReason(editing.discountReason ?? "");
      setKeepAdvance(editing.advancePaise > 0 || ownAdvanceUsed > 0);
      setPaymentDate(editing.paymentDate);
      setPayBy(editing.payBy ?? "");
      setReceivedBy(editing.receivedByUserId ?? "");
      setNote(editing.note ?? "");
    } else {
      setMethods([{ method: "CASH", amount: "", reference: "" }]);
      setMethodTouched(false);
      setShowDiscount(false);
      setDiscountReason("");
      setKeepAdvance(false);
      setPaymentDate(today);
      setPayBy(account.student.parentName ?? "");
      setReceivedBy("");
      setNote("");
    }
    setReason("");
    setTried(false);
    setKey(NewKey());
    saveMutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.paymentId]);

  useEffect(() => {
    if (!receivedBy && !isOnline && staffQuery.data?.currentUserId) setReceivedBy(staffQuery.data.currentUserId);
  }, [staffQuery.data, receivedBy, isOnline]);

  const lines = choices.map(({ invoice, open: due }) => {
    const row = rows[invoice.invoiceId] ?? { checked: false, pay: "", discount: "" };
    const pay = row.checked ? ParsePaise(row.pay) : 0;
    const discount = row.checked && showDiscount ? ParsePaise(row.discount) : 0;
    const problem =
      pay === null || discount === null
        ? "Enter a valid amount, like 1100 or 1100.50."
        : (pay ?? 0) + (discount ?? 0) > due
          ? `Only ${FormatRupees(due)} is due on this invoice.`
          : null;
    return { invoice, due, row, pay: pay ?? 0, discount: discount ?? 0, problem };
  });
  const applied = lines.reduce((sum, line) => sum + line.pay, 0);
  const discountTotal = lines.reduce((sum, line) => sum + line.discount, 0);
  const methodValues = methods.map((line) => ParsePaise(line.amount));
  const received = methodValues.reduce<number>((sum, value) => sum + (value ?? 0), 0);

  // Until the admin types an amount, a single method line follows the total.
  useEffect(() => {
    if (!methodTouched && methods.length === 1) {
      const wanted = ToRupees(applied);
      if (methods[0].amount !== wanted) setMethods([{ ...methods[0], amount: wanted }]);
    }
  }, [applied, methodTouched, methods]);

  const extra = received - applied - ownAdvanceUsed;
  const ownSettled = Array.from(ownDirect.values()).reduce((sum, value) => sum + value.amount + value.discount, 0);
  const dueBefore = account.totals.duePaise;
  const dueAfter = Math.max(0, dueBefore + ownSettled - applied - discountTotal);

  const problems: string[] = [];
  lines.forEach((line) => line.problem && problems.push(`${line.invoice.invoiceNumber}: ${line.problem}`));
  methods.forEach((line, index) => {
    const value = methodValues[index];
    const label = COUNTER_METHODS.find((item) => item.value === line.method)?.label ?? line.method;
    if (value === null) problems.push(`${label}: enter a valid amount.`);
    else if (value === 0) problems.push(`${label}: enter the amount, or remove this line.`);
    if (COUNTER_METHODS.find((item) => item.value === line.method)?.needsReference && !line.reference.trim()) problems.push(`Enter the ${label} reference number.`);
  });
  if (!received) problems.push("Enter the amount received.");
  if (extra < 0) {
    problems.push(
      ownAdvanceUsed
        ? `${FormatRupees(ownAdvanceUsed)} of this payment's advance is already used on later invoices, so at least ${FormatRupees(applied + ownAdvanceUsed)} must be received.`
        : `The methods add up to ${FormatRupees(received)}, but ${FormatRupees(applied)} is applied to invoices.`
    );
  }
  if (extra > 0 && !keepAdvance) problems.push(`${FormatRupees(extra)} is more than is applied to invoices. Tick “Keep the extra as advance”, or correct the amounts.`);
  if (discountTotal > 0 && !discountReason.trim()) problems.push("Give a reason for the discount.");
  if (!paymentDate || paymentDate > today) problems.push("The payment date cannot be in the future.");
  if (editing && !reason.trim()) problems.push("Give a reason for the change.");

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        paymentDate,
        payBy: payBy.trim() || null,
        receivedByUserId: isOnline ? null : receivedBy || null,
        note: note.trim() || null,
        allocations: lines.filter((line) => line.row.checked && line.pay + line.discount > 0).map((line) => ({ invoiceId: line.invoice.invoiceId, amountPaise: line.pay, discountPaise: line.discount })),
        methods: methods.map((line, index) => ({ method: line.method, amountPaise: methodValues[index] ?? 0, reference: line.reference.trim() || null })),
        discountReason: discountTotal ? discountReason.trim() : null,
        keepAdvance: extra > 0 ? keepAdvance : false,
      };
      if (editing) return { payment: await editPayment(editing.paymentId, { ...payload, reason: reason.trim() }), wasEdit: true };
      return { payment: await recordPayment({ ...payload, studentId: account.student.studentId, idempotencyKey: key }), wasEdit: false };
    },
    onSuccess: ({ payment, wasEdit }) => onSaved(payment, wasEdit),
  });

  const setRow = (invoiceId: string, patch: Partial<Row>) => setRows((current) => ({ ...current, [invoiceId]: { ...(current[invoiceId] ?? { checked: false, pay: "", discount: "" }), ...patch } }));
  const toggle = (invoiceId: string, due: number) => {
    const row = rows[invoiceId];
    if (row?.checked) setRow(invoiceId, { checked: false, pay: "", discount: "" });
    else setRow(invoiceId, { checked: true, pay: ToRupees(due) });
  };
  const allChecked = choices.length > 0 && choices.every(({ invoice }) => rows[invoice.invoiceId]?.checked);
  const toggleAll = () => {
    const next: Record<string, Row> = {};
    choices.forEach(({ invoice, open: due }) => {
      next[invoice.invoiceId] = allChecked ? { checked: false, pay: "", discount: "" } : { checked: true, pay: rows[invoice.invoiceId]?.checked ? rows[invoice.invoiceId].pay : ToRupees(due), discount: rows[invoice.invoiceId]?.discount ?? "" };
    });
    setRows(next);
  };

  const submit = () => {
    setTried(true);
    if (problems.length) {
      // Bring the list of what to fix into view (it sits at the end of the form).
      window.setTimeout(() => problemsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
      return;
    }
    if (saveMutation.isPending) return;
    saveMutation.mutate();
  };

  const numbering = account.receiptNumbering;
  const saveLabel = editing ? "Save changes" : received ? `Record ${FormatRupees(received)}` : "Record payment";

  return (
    <PaymentsDialog
      open={open}
      wide
      kicker={editing ? `Edit ${editing.receiptNumber}` : "Record Payment"}
      title={account.student.name}
      onClose={() => { if (!saveMutation.isPending) onClose(); }}
      footer={
        <>
          {tried && problems.length ? (
            <span className="mr-auto self-center text-xs font-bold text-rose-600 dark:text-rose-300">{problems.length === 1 ? "1 thing to fix, shown above" : `${problems.length} things to fix, shown above`}</span>
          ) : null}
          <button type="button" className="math-button-secondary" disabled={saveMutation.isPending} onClick={onClose}>Cancel</button>
          <button type="button" className="math-button-primary" disabled={saveMutation.isPending || (!editing && !numbering.numberingReady)} onClick={submit}>
            {saveMutation.isPending ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
            {saveLabel}
          </button>
        </>
      }
    >
      <div className="grid gap-5">
        {!editing && !numbering.numberingReady ? (
          <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            The starting receipt number is not set yet. Set it in Payment Settings → Document Numbering first.
          </div>
        ) : null}

        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">Invoices being paid</h3>
            <div className="flex flex-wrap items-center gap-3">
              {choices.length > 1 ? <button type="button" className="text-xs font-black text-cyan-700 underline dark:text-cyan-300" onClick={toggleAll}>{allChecked ? "Untick all" : "Tick all"}</button> : null}
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-black text-slate-600 dark:text-slate-300">
                <input type="checkbox" className="h-4 w-4" checked={showDiscount} onChange={(event) => setShowDiscount(event.target.checked)} />
                Give a discount
              </label>
            </div>
          </div>
          {!choices.length ? (
            <p className="mt-2 rounded-2xl border border-dashed border-slate-200 px-4 py-3 text-sm font-semibold text-slate-500 dark:border-slate-800">
              No unpaid invoices. Money received now is kept as advance and applied to this student&apos;s next invoices.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {lines.map((line) => (
                <li key={line.invoice.invoiceId} className={`px-4 py-3 ${line.row.checked ? "bg-cyan-50/50 dark:bg-cyan-950/20" : ""}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                      <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={line.row.checked} onChange={() => toggle(line.invoice.invoiceId, line.due)} />
                      <span className="min-w-0">
                        <span className="block font-black text-slate-900 dark:text-white">{line.invoice.feeName}{line.invoice.periodLabel ? ` · ${line.invoice.periodLabel}` : ""}</span>
                        <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {line.invoice.invoiceNumber} · {FormatDate(line.invoice.invoiceDate)} · due {FormatRupees(line.due)}{line.invoice.isOverdue ? " · overdue" : ""}
                        </span>
                      </span>
                    </label>
                    {line.row.checked ? (
                      <div className={`grid gap-2 sm:w-auto ${showDiscount ? "grid-cols-2 sm:w-[260px]" : "grid-cols-1 sm:w-[140px]"}`}>
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-black text-slate-500">Pay (₹)</span>
                          <input className="math-input px-3 text-right tabular-nums" inputMode="decimal" value={line.row.pay} onChange={(event) => setRow(line.invoice.invoiceId, { pay: event.target.value })} aria-label={`Amount paid on ${line.invoice.invoiceNumber}`} />
                        </label>
                        {showDiscount ? (
                          <label className="block">
                            <span className="mb-1 block text-[11px] font-black text-slate-500">Discount (₹)</span>
                            <input className="math-input px-3 text-right tabular-nums" inputMode="decimal" value={line.row.discount} onChange={(event) => setRow(line.invoice.invoiceId, { discount: event.target.value })} aria-label={`Discount on ${line.invoice.invoiceNumber}`} />
                          </label>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {tried && line.problem ? <p className="mt-1.5 text-xs font-bold text-rose-600 dark:text-rose-300">{line.problem}</p> : null}
                </li>
              ))}
            </ul>
          )}
          {showDiscount && discountTotal > 0 ? (
            <label className="mt-3 block">
              <FieldLabel hint="required, printed on the receipt">Reason for the discount</FieldLabel>
              <input className="math-input" value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} placeholder="e.g. sibling concession" />
            </label>
          ) : null}
        </section>

        <section>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">How it was paid</h3>
            {methods.length < 6 && !isOnline ? (
              <button type="button" className="inline-flex items-center gap-1 text-xs font-black text-cyan-700 underline dark:text-cyan-300" onClick={() => { setMethodTouched(true); setMethods([...methods, { method: "UPI", amount: "", reference: "" }]); }}>
                <Plus size={13} />Split across methods
              </button>
            ) : null}
          </div>
          {isOnline ? (
            <p className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
              {methods.map((line, index) => `Razorpay ${FormatRupees(methodValues[index] ?? 0)}${line.reference ? ` · ${line.reference}` : ""}`).join(", ")}
              <span className="mt-0.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">Paid online, so the amount stays as Razorpay received it. To return money, refund it in Razorpay and cancel this payment.</span>
            </p>
          ) : null}
          <ul className={`mt-2 grid gap-2 ${isOnline ? "hidden" : ""}`}>
            {methods.map((line, index) => {
              const info = COUNTER_METHODS.find((item) => item.value === line.method);
              return (
                <li key={index} className="grid grid-cols-[1fr_1fr] gap-2 sm:grid-cols-[160px_150px_1fr_auto] sm:items-end">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-black text-slate-500">Method</span>
                    <select className="math-input" value={line.method} onChange={(event) => setMethods(methods.map((item, at) => (at === index ? { ...item, method: event.target.value as PaymentMethodCode } : item)))}>
                      {COUNTER_METHODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-black text-slate-500">Amount (₹)</span>
                    <input className="math-input text-right tabular-nums" inputMode="decimal" value={line.amount} onChange={(event) => { setMethodTouched(true); setMethods(methods.map((item, at) => (at === index ? { ...item, amount: event.target.value } : item))); }} aria-label={`${info?.label ?? "Method"} amount`} />
                  </label>
                  <label className="col-span-2 block sm:col-span-1">
                    <span className="mb-1 block text-[11px] font-black text-slate-500">Reference {info?.needsReference ? "(required)" : "(optional)"}</span>
                    <input className="math-input" value={line.reference} onChange={(event) => setMethods(methods.map((item, at) => (at === index ? { ...item, reference: event.target.value } : item)))} placeholder={line.method === "UPI" ? "UTR / transaction ID" : line.method === "CHEQUE" ? "Cheque number" : ""} aria-label={`${info?.label ?? "Method"} reference`} />
                  </label>
                  {methods.length > 1 ? (
                    <button type="button" className="math-focus-ring col-span-2 justify-self-end rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 sm:col-span-1 dark:hover:bg-slate-900" onClick={() => setMethods(methods.filter((_, at) => at !== index))} aria-label="Remove this method">
                      <Trash2 size={16} />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {extra > 0 ? (
            <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-900 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-100">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={keepAdvance} onChange={(event) => setKeepAdvance(event.target.checked)} />
              <span>
                Keep the extra {FormatRupees(extra)} as advance
                <span className="block text-xs font-semibold opacity-80">It is applied automatically to this student&apos;s next invoices, oldest first.</span>
              </span>
            </label>
          ) : null}
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <FieldLabel>Payment date</FieldLabel>
            <input type="date" className="math-input" value={paymentDate} max={today} onChange={(event) => setPaymentDate(event.target.value)} />
          </label>
          <label className="block">
            <FieldLabel hint="optional">Paid by</FieldLabel>
            <input className="math-input" value={payBy} onChange={(event) => setPayBy(event.target.value)} placeholder="e.g. father's name" />
          </label>
          <label className="block">
            <FieldLabel>Received by</FieldLabel>
            {isOnline ? <p className="math-input flex items-center text-slate-600 dark:text-slate-300">{editing?.receivedByName ?? "Online (Razorpay)"}</p> : null}
            <select className={`math-input ${isOnline ? "hidden" : ""}`} value={receivedBy} onChange={(event) => setReceivedBy(event.target.value)}>
              {(staffQuery.data?.staff ?? []).map((person) => <option key={person.userId} value={person.userId}>{person.name}</option>)}
              {editing && editing.receivedByUserId && !(staffQuery.data?.staff ?? []).some((person) => person.userId === editing.receivedByUserId) ? (
                <option value={editing.receivedByUserId}>{editing.receivedByName}</option>
              ) : null}
            </select>
          </label>
          <label className="block sm:col-span-3">
            <FieldLabel hint="optional, printed on the receipt">Note</FieldLabel>
            <input className="math-input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. paid at Rajarhat front desk" />
          </label>
          {editing ? (
            <label className="block sm:col-span-3">
              <FieldLabel hint="required, kept in the history">Reason for the change</FieldLabel>
              <input className="math-input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. wrong amount entered" />
            </label>
          ) : null}
        </section>

        <section className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900/60" aria-live="polite">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums sm:grid-cols-[1fr_auto]">
            <dt className="font-semibold text-slate-600 dark:text-slate-300">Due before</dt><dd className="text-right font-bold">{FormatRupees(dueBefore)}</dd>
            <dt className="font-semibold text-slate-600 dark:text-slate-300">Received now</dt><dd className="text-right font-bold">{FormatRupees(received)}</dd>
            <dt className="font-semibold text-slate-600 dark:text-slate-300">Applied to invoices</dt><dd className="text-right font-bold">{FormatRupees(applied)}</dd>
            {discountTotal ? (<><dt className="font-semibold text-slate-600 dark:text-slate-300">Discount</dt><dd className="text-right font-bold">{FormatRupees(discountTotal)}</dd></>) : null}
            {extra > 0 ? (<><dt className="font-semibold text-violet-700 dark:text-violet-300">Kept as advance</dt><dd className="text-right font-bold text-violet-700 dark:text-violet-300">{keepAdvance ? FormatRupees(extra) : "—"}</dd></>) : null}
            <div className="col-span-2 my-0.5 border-t border-slate-200 dark:border-slate-700" aria-hidden="true" />
            <dt className="font-black text-slate-900 dark:text-white">Due after</dt><dd className="text-right font-black text-slate-900 dark:text-white">{FormatRupees(dueAfter)}</dd>
          </dl>
        </section>

        {tried && problems.length ? (
          <div ref={problemsRef} role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
            <ul className="grid gap-1">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
          </div>
        ) : null}
        <InlineError error={saveMutation.error} />
      </div>
    </PaymentsDialog>
  );
}
