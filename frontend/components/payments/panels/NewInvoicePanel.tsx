"use client";

// 2026-11-27 (billing Release 2, Shailesh): New Invoice and New Admission.
//
// New Invoice: one student, any fee items, each with a quantity and an
// optional discount (₹ or %), an optional discount on the whole invoice
// (a reason and who approved it are kept), and optionally the payment taken
// at the counter. Books and kit are checked against stock while stock is
// counted.
// New Admission: the same screen, starting from the admission package
// (Registration + first month's tuition + the level's book + the free kit
// at ₹0). It is raised only with a payment (part payment is fine) and only
// once per student; the invoice date becomes the admission date.
//
// The totals come from the server's preview, so what is shown is exactly
// what will be raised.
import { HeroSearch } from "@/components/payments/CommandPalette";
import { FieldLabel, InlineError, PaymentsLoading } from "@/components/payments/PaymentsUi";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import {
  ARTICLE_KIND_LABELS,
  createNewInvoice,
  getAdmissionTemplate,
  getStockAvailability,
  NewKey,
  previewNewInvoice,
  type ArticleFeeItem,
  type CreatedInvoice,
  type DiscountType,
  type DraftLine,
  type InvoiceDraft,
} from "@/lib/api/billing";
import {
  COUNTER_METHODS,
  downloadInvoicePdf,
  downloadReceiptPdf,
  listFeeItems,
  listInvoiceStudentOptions,
  listPaymentStaff,
  saveBlob,
  type InvoiceStudentOption,
  type PaymentMethodCode,
} from "@/lib/api/payments";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FilePlus2,
  GraduationCap,
  Loader2,
  Package,
  Plus,
  Search,
  Trash2,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Mode = "invoice" | "admission";

type LineRow = {
  key: string;
  feeItemId: string;
  quantity: string;
  discountType: "" | DiscountType;
  discountValue: string;
  isKit: boolean;
  included: boolean;
  month: string;
};

type MethodRow = { key: string; method: PaymentMethodCode; amount: string; reference: string };

function TodayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function ParsePaise(raw: string): number | null {
  const text = raw.replace(/[,₹\s]/g, "");
  if (!text) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
}

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

let RowCounter = 0;
function RowKey(): string {
  RowCounter += 1;
  return `row-${RowCounter}`;
}

function EmptyLine(month: string): LineRow {
  return { key: RowKey(), feeItemId: "", quantity: "1", discountType: "", discountValue: "", isKit: false, included: true, month };
}

function KindChip({ kind }: { kind: string | undefined }) {
  if (!kind) return null;
  const tone: Record<string, string> = {
    TUITION: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200",
    REGISTRATION: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200",
    BOOK: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    MERCH: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-200",
  };
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-black ${tone[kind] ?? "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300"}`}>{ARTICLE_KIND_LABELS[kind as keyof typeof ARTICLE_KIND_LABELS] ?? kind}</span>;
}

function StudentChooser({ students, onPick }: { students: InvoiceStudentOption[]; onPick: (student: InvoiceStudentOption) => void }) {
  const [text, setText] = useState("");
  const needle = text.trim().toLowerCase();
  const matches = useMemo(() => {
    if (needle.length < 2) return [];
    return students
      .filter((row) => row.isActive)
      .filter((row) => [row.studentName, row.studentCode, row.customId ?? ""].some((value) => value.toLowerCase().includes(needle)))
      .slice(0, 8);
  }, [students, needle]);
  return (
    <div className="grid gap-3">
      <label className="relative block">
        <span className="sr-only">Find The Student</span>
        <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="math-input pl-11" value={text} onChange={(event) => setText(event.target.value)} placeholder="Student name or student ID" aria-label="Find The Student" autoFocus />
      </label>
      {needle.length < 2 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">Type at least 2 letters or digits.</p>
      ) : matches.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">No active student matches “{text.trim()}”.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {matches.map((row) => (
            <li key={row.studentId}>
              <button type="button" onClick={() => onPick(row)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-cyan-300 hover:bg-cyan-50 dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-cyan-800 dark:hover:bg-cyan-950/30">
                <UserRound size={17} className="shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-black text-slate-900 dark:text-white">{row.studentName}</span>
                  <span className="block truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{[row.studentCode, row.levelCode, row.centreName ?? "No centre"].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NewInvoicePanel({ mode }: { mode: Mode }) {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const queryClient = useQueryClient();
  const admission = mode === "admission";
  const today = TodayInIndia();
  const thisMonth = today.slice(0, 7);

  const [student, setStudent] = useState<InvoiceStudentOption | null>(null);
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [lines, setLines] = useState<LineRow[]>([EmptyLine(thisMonth)]);
  const [invoiceDiscountType, setInvoiceDiscountType] = useState<"" | DiscountType>("");
  const [invoiceDiscountValue, setInvoiceDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [takePayment, setTakePayment] = useState(admission);
  const [methods, setMethods] = useState<MethodRow[]>([{ key: RowKey(), method: "CASH", amount: "", reference: "" }]);
  const [paymentDate, setPaymentDate] = useState(today);
  const [payBy, setPayBy] = useState("");
  const [keepAdvance, setKeepAdvance] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(NewKey);
  const [done, setDone] = useState<CreatedInvoice | null>(null);
  const [touched, setTouched] = useState(false);

  const studentsQuery = useQuery({ queryKey: ["admin", "payments", "invoice-students"], queryFn: listInvoiceStudentOptions, enabled: ready });
  const feeQuery = useQuery({ queryKey: ["admin", "payments", "fee-items"], queryFn: listFeeItems, enabled: ready });
  const staffQuery = useQuery({ queryKey: ["admin", "payments", "staff"], queryFn: listPaymentStaff, enabled: ready });
  const templateQuery = useQuery({
    queryKey: ["admin", "payments", "admission-template", student?.studentId, invoiceDate],
    queryFn: () => getAdmissionTemplate(student!.studentId, invoiceDate),
    enabled: ready && admission && Boolean(student),
  });
  const stockQuery = useQuery({
    queryKey: ["admin", "payments", "stock-availability", student?.studentId],
    queryFn: () => getStockAvailability(student!.studentId),
    enabled: ready && Boolean(student),
  });

  const fees = (feeQuery.data ?? []) as ArticleFeeItem[];
  const feeById = useMemo(() => new Map(fees.map((item) => [item.feeItemId, item])), [fees]);
  const offered = fees.filter((item) => item.isActive && item.articleKind !== "LATE_FEE" && (admission || item.articleKind !== "REGISTRATION"));

  // The admission package, once per student (and when the date changes the
  // month's tuition follows it).
  const template = templateQuery.data;
  useEffect(() => {
    if (!admission || !template) return;
    setLines(
      template.lines.length
        ? template.lines.map((line) => ({
            key: RowKey(),
            feeItemId: line.feeItemId,
            quantity: String(line.quantity ?? 1),
            discountType: "",
            discountValue: "",
            isKit: Boolean(line.isKit),
            included: line.included !== false,
            month: line.billingMonth && line.billingYear ? `${line.billingYear}-${String(line.billingMonth).padStart(2, "0")}` : invoiceDate.slice(0, 7),
          }))
        : [EmptyLine(invoiceDate.slice(0, 7))]
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template]);

  const draftLines: DraftLine[] = lines
    .filter((row) => row.feeItemId && row.included)
    .map((row) => {
      const item = feeById.get(row.feeItemId);
      const monthly = item?.billingType === "MONTHLY";
      return {
        feeItemId: row.feeItemId,
        quantity: Math.max(1, Number.parseInt(row.quantity, 10) || 1),
        discountType: row.isKit || !row.discountType || !row.discountValue.trim() ? null : row.discountType,
        discountValue: row.isKit || !row.discountType || !row.discountValue.trim() ? null : row.discountValue.trim(),
        isKit: row.isKit,
        billingMonth: monthly && row.month ? Number(row.month.slice(5, 7)) : null,
        billingYear: monthly && row.month ? Number(row.month.slice(0, 4)) : null,
      };
    });

  const methodTotal = methods.reduce((sum, row) => sum + (ParsePaise(row.amount) ?? 0), 0);
  const methodsValid = methods.every((row) => ParsePaise(row.amount) !== null);
  const draft: InvoiceDraft | null = student
    ? {
        studentId: student.studentId,
        invoiceDate,
        dueDate: dueDate || null,
        lines: draftLines,
        invoiceDiscount: invoiceDiscountType && invoiceDiscountValue.trim() ? { type: invoiceDiscountType, value: invoiceDiscountValue.trim() } : null,
        discountReason: discountReason.trim() || null,
        approvedByUserId: approvedBy || null,
        payment:
          takePayment && methodTotal > 0
            ? {
                paymentDate,
                payBy: payBy.trim() || null,
                methods: methods.filter((row) => (ParsePaise(row.amount) ?? 0) > 0).map((row) => ({ method: row.method, amountPaise: ParsePaise(row.amount) ?? 0, reference: row.reference.trim() || null })),
                keepAdvance,
              }
            : null,
      }
    : null;
  const previewInput = useDebounced(draft && draftLines.length ? JSON.stringify({ ...draft, payment: null }) : "");
  const previewQuery = useQuery({
    queryKey: ["admin", "payments", "new-invoice-preview", mode, previewInput],
    queryFn: () => previewNewInvoice(JSON.parse(previewInput) as InvoiceDraft, admission),
    enabled: ready && Boolean(previewInput),
    retry: false,
  });
  const preview = previewInput ? previewQuery.data : undefined;

  const createMutation = useMutation({
    mutationFn: () => createNewInvoice({ ...(draft as InvoiceDraft), idempotencyKey }, admission),
    onSuccess: (result) => {
      setDone(result);
      queryClient.invalidateQueries({ queryKey: ["admin", "payments"] });
    },
  });
  const pdfMutation = useMutation({
    mutationFn: async (kind: "invoice" | "receipt") => {
      if (!done) return;
      if (kind === "invoice") saveBlob(await downloadInvoicePdf(done.invoice.invoiceId), `${done.invoice.invoiceNumber}.pdf`);
      else if (done.payment) saveBlob(await downloadReceiptPdf(done.payment.paymentId), `${done.payment.receiptNumber}.pdf`);
    },
  });

  const reset = (keepStudent = false) => {
    setDone(null);
    if (!keepStudent) setStudent(null);
    setLines([EmptyLine(thisMonth)]);
    setInvoiceDiscountType("");
    setInvoiceDiscountValue("");
    setDiscountReason("");
    setApprovedBy("");
    setMethods([{ key: RowKey(), method: "CASH", amount: "", reference: "" }]);
    setPayBy("");
    setKeepAdvance(false);
    setTakePayment(admission);
    setIdempotencyKey(NewKey());
    setTouched(false);
    createMutation.reset();
  };

  if (!ready) return null;

  const update = (key: string, patch: Partial<LineRow>) => setLines((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const stock = stockQuery.data;
  const needsReason = Boolean(preview?.hasDiscount);
  const paymentShort = admission && preview && preview.totalPaise > 0 && methodTotal <= 0;
  const blocked = Boolean(preview?.problems.length);
  const canCreate = Boolean(draft && draftLines.length && preview && !blocked && methodsValid && (!needsReason || discountReason.trim()) && !paymentShort && !createMutation.isPending);
  const existing = admission ? template?.existingAdmission : null;

  const submit = () => {
    setTouched(true);
    if (!canCreate) return;
    createMutation.mutate();
  };

  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="math-block-header">{admission ? <GraduationCap size={14} /> : <FilePlus2 size={14} />}Invoices</p>
            <h1 className="math-title">{admission ? "New Admission" : "New Invoice"}</h1>
            <p className="math-subtitle">
              {admission
                ? "Registration, the first month's fee, the level's book and the free kit, raised when the payment is received. The invoice date becomes the admission date."
                : "One student, any items, with quantities and discounts. Books and kit are checked against stock when stock is counted."}
            </p>
            <HeroSearch />
          </div>
        </div>
      </section>

      {done ? (
        <section className="mt-6 math-card p-5 sm:p-6" role="status">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={28} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
              <div>
                <h2 className="text-2xl font-black text-slate-950 dark:text-white">{done.invoice.invoiceNumber} raised for {done.invoice.studentName}</h2>
                <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {done.invoice.amountDisplay} · {done.invoice.statusLabel}
                  {done.invoice.balancePaise ? ` · ${done.invoice.balanceDisplay} still due` : ""}
                  {done.payment ? ` · receipt ${done.payment.receiptNumber} for ${done.payment.amountDisplay}` : ""}
                </p>
                {done.replayed ? <p className="mt-1 text-xs font-bold text-amber-700 dark:text-amber-300">This was already saved; nothing new was raised.</p> : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="math-button-secondary" disabled={pdfMutation.isPending} onClick={() => pdfMutation.mutate("invoice")}><Download size={16} />Invoice PDF</button>
              {done.payment ? <button type="button" className="math-button-secondary" disabled={pdfMutation.isPending} onClick={() => pdfMutation.mutate("receipt")}><Download size={16} />Receipt PDF</button> : null}
              <Link className="math-button-secondary" href={`/admin/payments/invoices?tab=all&search=${encodeURIComponent(done.invoice.invoiceNumber)}&open=${encodeURIComponent(done.invoice.invoiceId)}`}>Open Invoice</Link>
              <button type="button" className="math-button-primary" onClick={() => reset(false)}><Plus size={16} />{admission ? "Another Admission" : "Another Invoice"}</button>
            </div>
          </div>
          <div className="mt-3"><InlineError error={pdfMutation.error} /></div>
        </section>
      ) : (
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid min-w-0 gap-6">
            <section className="math-card p-5 sm:p-6">
              <p className="math-block-header"><UserRound size={14} />Student</p>
              {student ? (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xl font-black text-slate-950 dark:text-white">{student.studentName}</p>
                    <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{[student.studentCode, student.levelCode, student.centreName ?? "No centre"].filter(Boolean).join(" · ")}</p>
                    {stock?.trackingEnabled ? <p className="mt-1 text-xs font-bold text-slate-500">Books and kit come from {stock.stockCentreName ?? "no stock centre"}.</p> : null}
                  </div>
                  <button type="button" className="math-button-secondary" onClick={() => reset(false)}><X size={16} />Change Student</button>
                </div>
              ) : studentsQuery.isLoading ? (
                <PaymentsLoading label="Loading students…" rows={2} />
              ) : (
                <div className="mt-3"><StudentChooser students={studentsQuery.data ?? []} onPick={(row) => { setStudent(row); setIdempotencyKey(NewKey()); }} /></div>
              )}
              {admission && existing ? (
                <p className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                  <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                  <span>This student already has an admission invoice, <Link className="underline" href={`/admin/payments/invoices?tab=all&search=${encodeURIComponent(existing.invoiceNumber)}&open=${encodeURIComponent(existing.invoiceId)}`}>{existing.invoiceNumber}</Link>. Use New Invoice for anything else.</span>
                </p>
              ) : null}
              {admission && template?.notes.length ? (
                <ul className="mt-4 grid gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {template.notes.map((note) => <li key={note} className="flex gap-2"><span aria-hidden="true">•</span><span>{note}</span></li>)}
                </ul>
              ) : null}
            </section>

            {student ? (
              <section className="math-card p-5 sm:p-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="math-block-header"><Package size={14} />Items</p>
                    <h2 className="text-xl font-black text-slate-950 dark:text-white">What is being billed</h2>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <label className="block">
                      <FieldLabel>Invoice Date</FieldLabel>
                      <input type="date" className="math-input" value={invoiceDate} max={admission ? today : undefined} onChange={(event) => setInvoiceDate(event.target.value || today)} />
                    </label>
                    <label className="block">
                      <FieldLabel hint="optional">Due Date</FieldLabel>
                      <input type="date" className="math-input" value={dueDate} min={invoiceDate} onChange={(event) => setDueDate(event.target.value)} />
                    </label>
                  </div>
                </div>

                <ul className="mt-5 grid gap-3">
                  {lines.map((row) => {
                    const item = feeById.get(row.feeItemId);
                    const priced = preview?.lines.find((line) => line.feeItemId === row.feeItemId && line.isKit === row.isKit);
                    const held = item?.isStock && stock?.trackingEnabled ? stock.quantities[item.feeItemId] ?? 0 : null;
                    return (
                      <li key={row.key} className={`rounded-3xl border p-4 ${row.included ? "border-slate-200 bg-white/80 dark:border-slate-800 dark:bg-slate-950/60" : "border-dashed border-slate-200 opacity-60 dark:border-slate-800"}`}>
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_90px_auto] md:items-end">
                          <label className="block min-w-0">
                            <FieldLabel hint={item ? <KindChip kind={item.articleKind} /> : undefined}>{row.isKit ? "Free Kit Item" : "Item"}</FieldLabel>
                            <select className="math-input" value={row.feeItemId} disabled={row.isKit} onChange={(event) => update(row.key, { feeItemId: event.target.value })}>
                              <option value="">Choose an item</option>
                              {offered.map((fee) => <option key={fee.feeItemId} value={fee.feeItemId}>{fee.name} · {fee.amountDisplay}</option>)}
                            </select>
                          </label>
                          <label className="block">
                            <FieldLabel>Qty</FieldLabel>
                            <input className="math-input tabular-nums" inputMode="numeric" value={row.quantity} disabled={row.isKit || item?.billingType === "MONTHLY"} onChange={(event) => update(row.key, { quantity: event.target.value.replace(/\D/g, "").slice(0, 3) })} />
                          </label>
                          <div className="flex items-center justify-end gap-2">
                            {row.isKit ? (
                              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
                                <input type="checkbox" className="h-4 w-4" checked={row.included} onChange={(event) => update(row.key, { included: event.target.checked })} />
                                Include
                              </label>
                            ) : (
                              <button type="button" className="math-role-action-button h-10 w-10 justify-center px-0" onClick={() => setLines((rows) => (rows.length > 1 ? rows.filter((other) => other.key !== row.key) : [EmptyLine(thisMonth)]))} aria-label="Remove this line"><Trash2 size={15} /></button>
                            )}
                          </div>
                        </div>
                        {item && !row.isKit ? (
                          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {item.billingType === "MONTHLY" ? (
                              <label className="block">
                                <FieldLabel>Month</FieldLabel>
                                <input type="month" className="math-input" value={row.month} onChange={(event) => update(row.key, { month: event.target.value })} />
                              </label>
                            ) : null}
                            <label className="block">
                              <FieldLabel hint="optional">Discount</FieldLabel>
                              <div className="flex gap-2">
                                <select className="math-input w-24 shrink-0" value={row.discountType} onChange={(event) => update(row.key, { discountType: event.target.value as LineRow["discountType"] })} aria-label="Discount type">
                                  <option value="">None</option>
                                  <option value="FIXED">₹</option>
                                  <option value="PERCENT">%</option>
                                </select>
                                <input className="math-input min-w-0 tabular-nums" inputMode="decimal" disabled={!row.discountType} value={row.discountValue} onChange={(event) => update(row.key, { discountValue: event.target.value })} placeholder={row.discountType === "PERCENT" ? "e.g. 10" : "e.g. 100"} aria-label="Discount amount" />
                              </div>
                            </label>
                          </div>
                        ) : null}
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                          <span>
                            {held !== null ? (
                              <span className={held < (Number.parseInt(row.quantity, 10) || 1) ? "text-rose-600 dark:text-rose-300" : held <= (stock?.lowStockThreshold ?? 5) ? "text-amber-700 dark:text-amber-300" : ""}>
                                {held} in stock at {stock?.stockCentreName}
                              </span>
                            ) : null}
                          </span>
                          {priced && row.included ? (
                            <span className="tabular-nums text-sm text-slate-800 dark:text-slate-100">
                              {priced.quantity} × {priced.unitDisplay}
                              {priced.discountPaise ? ` − ${priced.discountDisplay}` : ""} = <b>{priced.netDisplay}</b>
                            </span>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <button type="button" className="math-button-secondary mt-4" onClick={() => setLines((rows) => [...rows, EmptyLine(invoiceDate.slice(0, 7))])}><Plus size={16} />Add Item</button>

                <div className="mt-6 grid gap-3 border-t border-slate-100 pt-5 dark:border-slate-800 sm:grid-cols-2">
                  <label className="block">
                    <FieldLabel hint="optional">Discount On The Whole Invoice</FieldLabel>
                    <div className="flex gap-2">
                      <select className="math-input w-24 shrink-0" value={invoiceDiscountType} onChange={(event) => setInvoiceDiscountType(event.target.value as "" | DiscountType)} aria-label="Invoice discount type">
                        <option value="">None</option>
                        <option value="FIXED">₹</option>
                        <option value="PERCENT">%</option>
                      </select>
                      <input className="math-input min-w-0 tabular-nums" inputMode="decimal" disabled={!invoiceDiscountType} value={invoiceDiscountValue} onChange={(event) => setInvoiceDiscountValue(event.target.value)} aria-label="Invoice discount amount" />
                    </div>
                  </label>
                  {needsReason ? (
                    <>
                      <label className="block">
                        <FieldLabel hint="required, kept in the history">Reason For The Discount</FieldLabel>
                        <input className="math-input" value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} placeholder="e.g. sibling offer" />
                        {touched && !discountReason.trim() ? <p className="mt-1.5 text-xs font-bold text-rose-600 dark:text-rose-300">Please give a reason for the discount.</p> : null}
                      </label>
                      <label className="block">
                        <FieldLabel>Approved By</FieldLabel>
                        <select className="math-input" value={approvedBy || staffQuery.data?.currentUserId || ""} onChange={(event) => setApprovedBy(event.target.value)}>
                          {(staffQuery.data?.staff ?? []).map((person) => <option key={person.userId} value={person.userId}>{person.name}</option>)}
                        </select>
                      </label>
                    </>
                  ) : null}
                </div>
              </section>
            ) : null}

            {student ? (
              <section className="math-card p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="math-block-header"><Wallet size={14} />Payment</p>
                    <h2 className="text-xl font-black text-slate-950 dark:text-white">{admission ? "Payment received" : "Take the payment now"}</h2>
                  </div>
                  {!admission ? (
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
                      <input type="checkbox" className="h-4 w-4" checked={takePayment} onChange={(event) => setTakePayment(event.target.checked)} />
                      Record a payment with this invoice
                    </label>
                  ) : null}
                </div>
                {takePayment ? (
                  <div className="mt-4 grid gap-3">
                    {methods.map((row) => {
                      const needsRef = COUNTER_METHODS.find((method) => method.value === row.method)?.needsReference;
                      return (
                        <div key={row.key} className="grid gap-2 sm:grid-cols-[150px_140px_minmax(0,1fr)_auto] sm:items-end">
                          <label className="block">
                            <FieldLabel>Method</FieldLabel>
                            <select className="math-input" value={row.method} onChange={(event) => setMethods((rows) => rows.map((other) => (other.key === row.key ? { ...other, method: event.target.value as PaymentMethodCode } : other)))}>
                              {COUNTER_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                            </select>
                          </label>
                          <label className="block">
                            <FieldLabel>Amount (₹)</FieldLabel>
                            <input className="math-input tabular-nums" inputMode="decimal" value={row.amount} onChange={(event) => setMethods((rows) => rows.map((other) => (other.key === row.key ? { ...other, amount: event.target.value } : other)))} />
                          </label>
                          <label className="block min-w-0">
                            <FieldLabel hint={needsRef ? "required" : "optional"}>Reference</FieldLabel>
                            <input className="math-input" value={row.reference} onChange={(event) => setMethods((rows) => rows.map((other) => (other.key === row.key ? { ...other, reference: event.target.value } : other)))} placeholder={needsRef ? "UPI / cheque / transfer number" : ""} />
                          </label>
                          <button type="button" className="math-role-action-button h-10 w-10 justify-center px-0" disabled={methods.length === 1} onClick={() => setMethods((rows) => rows.filter((other) => other.key !== row.key))} aria-label="Remove this method"><Trash2 size={15} /></button>
                        </div>
                      );
                    })}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="math-button-secondary" onClick={() => setMethods((rows) => [...rows, { key: RowKey(), method: "UPI", amount: "", reference: "" }])}><Plus size={16} />Split The Payment</button>
                      {preview ? <button type="button" className="math-button-secondary" onClick={() => setMethods((rows) => rows.map((row, index) => (index === 0 ? { ...row, amount: (preview.totalPaise / 100).toFixed(2).replace(/\.00$/, "") } : { ...row, amount: "" })))}>Pay In Full ({preview.totalDisplay})</button> : null}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <FieldLabel>Payment Date</FieldLabel>
                        <input type="date" className="math-input" value={paymentDate} max={today} onChange={(event) => setPaymentDate(event.target.value || today)} />
                      </label>
                      <label className="block">
                        <FieldLabel hint="optional">Paid By</FieldLabel>
                        <input className="math-input" value={payBy} onChange={(event) => setPayBy(event.target.value)} placeholder="e.g. mother" />
                      </label>
                    </div>
                    {preview && methodTotal > preview.totalPaise ? (
                      <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
                        <input type="checkbox" className="h-4 w-4" checked={keepAdvance} onChange={(event) => setKeepAdvance(event.target.checked)} />
                        Keep the extra as the student&apos;s advance
                      </label>
                    ) : null}
                    {touched && paymentShort ? <p className="text-xs font-bold text-rose-600 dark:text-rose-300">An admission is raised when the payment is received. Enter the amount paid.</p> : null}
                  </div>
                ) : (
                  <p className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">The invoice is raised unpaid. Any advance the student holds is used on it.</p>
                )}
              </section>
            ) : null}
          </div>

          <aside className="min-w-0">
            <section className="math-card p-5 sm:p-6 xl:sticky xl:top-24">
              <p className="math-block-header"><FilePlus2 size={14} />Summary</p>
              {!student || !draftLines.length ? (
                <p className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Choose the student and the items to see the invoice.</p>
              ) : previewQuery.isFetching && !preview ? (
                <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-500"><Loader2 size={16} className="animate-spin" />Working it out…</p>
              ) : previewQuery.error ? (
                <div className="mt-3"><InlineError error={previewQuery.error} /></div>
              ) : preview ? (
                <>
                  <ul className="mt-3 grid gap-2 text-sm">
                    {preview.lines.map((line) => (
                      <li key={`${line.lineNo}-${line.feeItemId}`} className="flex items-start justify-between gap-3">
                        <span className="min-w-0 font-semibold text-slate-700 dark:text-slate-200">{line.quantity > 1 ? `${line.quantity} × ` : ""}{line.name}{line.isKit ? <span className="ml-1 text-xs font-bold text-violet-600 dark:text-violet-300">(free kit)</span> : null}</span>
                        <span className="shrink-0 font-black tabular-nums">{line.netDisplay}</span>
                      </li>
                    ))}
                  </ul>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-sm tabular-nums dark:border-slate-800">
                    {preview.invoiceDiscountPaise ? (
                      <>
                        <dt className="font-semibold text-slate-600 dark:text-slate-300">Subtotal</dt><dd className="text-right font-bold">{preview.subtotalDisplay}</dd>
                        <dt className="font-semibold text-slate-600 dark:text-slate-300">Invoice discount</dt><dd className="text-right font-bold">− {preview.invoiceDiscountDisplay}</dd>
                      </>
                    ) : null}
                    <dt className="font-semibold text-slate-600 dark:text-slate-300">Taxable</dt><dd className="text-right font-bold">{preview.taxableDisplay}</dd>
                    <dt className="font-semibold text-slate-600 dark:text-slate-300">CGST {preview.gstRatePercent / 2}%</dt><dd className="text-right font-bold">{preview.cgstDisplay}</dd>
                    <dt className="font-semibold text-slate-600 dark:text-slate-300">SGST {preview.gstRatePercent / 2}%</dt><dd className="text-right font-bold">{preview.sgstDisplay}</dd>
                    <dt className="mt-1 border-t border-slate-200 pt-1 text-base font-black text-slate-950 dark:border-slate-700 dark:text-white">Total</dt>
                    <dd className="mt-1 border-t border-slate-200 pt-1 text-right text-base font-black text-slate-950 dark:border-slate-700 dark:text-white">{preview.totalDisplay}</dd>
                    {takePayment && methodTotal > 0 ? (
                      <>
                        <dt className="font-semibold text-slate-600 dark:text-slate-300">Paying now</dt><dd className="text-right font-bold">₹{(methodTotal / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</dd>
                        <dt className="font-semibold text-slate-600 dark:text-slate-300">Still due</dt><dd className="text-right font-bold">₹{(Math.max(0, preview.totalPaise - methodTotal) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</dd>
                      </>
                    ) : null}
                  </dl>
                  {preview.problems.length ? (
                    <ul className="mt-4 grid gap-2">
                      {preview.problems.map((problem) => (
                        <li key={problem} className="flex gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{problem}</li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : null}
              <div className="mt-4"><InlineError error={createMutation.error} /></div>
              <button type="button" className="math-button-primary mt-4 w-full justify-center" disabled={!student || !draftLines.length || createMutation.isPending || Boolean(existing)} onClick={submit}>
                {createMutation.isPending ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
                {admission ? "Raise Admission Invoice" : takePayment && methodTotal > 0 ? "Raise Invoice And Record Payment" : "Raise Invoice"}
              </button>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
