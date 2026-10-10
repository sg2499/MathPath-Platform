"use client";

// 2026-10-08 (Payments Phase 4): Expenses -- money spent, numbered
// MP-EXP-0001, by category. Add, view, edit (with a reason) and cancel
// (with a reason; it stays on record). Month totals by category and by
// method, and Excel. ?add=1 opens the Add form (from the Overview);
// ?open=<id> opens one expense (revamp R6: search and the activity feed).
import { HeroSearch } from "@/components/payments/CommandPalette";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { FieldLabel, InlineError, PaymentsDialog, PaymentsHistoryList, PaymentsMetric, PaymentsLoading } from "@/components/payments/PaymentsUi";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import {
  getExpense,
  cancelExpense,
  COUNTER_METHODS,
  createExpense,
  downloadExpensesExcel,
  editExpense,
  getPaymentSettings,
  listExpenseCategories,
  listExpenses,
  saveBlob,
  type Expense,
  type ExpenseFilters,
  type PaymentMethodCode,
} from "@/lib/api/payments";
import { FormatRupees } from "@/lib/paymentsMoney";
import { FormatDate, MonthLabel, NewKey, ParsePaise, TodayInIndia, ToRupees } from "@/lib/paymentsDates";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CheckCircle2, ChevronLeft, ChevronRight, Eye, FileSpreadsheet, Loader2, Pencil, Plus, ReceiptText, Search, Tags, Trash2, Wallet, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const PAGE_SIZE = 50;

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

type FormState = {
  expenseDate: string;
  categoryId: string;
  item: string;
  vendor: string;
  billNumber: string;
  details: string;
  note: string;
  centreId: string;
  methods: { method: PaymentMethodCode; amount: string; reference: string }[];
  reason: string;
};

function EmptyForm(today: string): FormState {
  return { expenseDate: today, categoryId: "", item: "", vendor: "", billNumber: "", details: "", note: "", centreId: "", methods: [{ method: "CASH", amount: "", reference: "" }], reason: "" };
}

function ExpenseForm({ open, editing, onClose, onSaved }: { open: boolean; editing: Expense | null; onClose: () => void; onSaved: (expense: Expense, wasEdit: boolean) => void }) {
  const today = TodayInIndia();
  const categoriesQuery = useQuery({ queryKey: ["admin", "payments", "expense-categories"], queryFn: listExpenseCategories, enabled: open });
  const settingsQuery = useQuery({ queryKey: ["admin", "payments", "settings"], queryFn: getPaymentSettings, enabled: open });
  const [form, setForm] = useState<FormState>(EmptyForm(today));
  const [key, setKey] = useState("");
  const [tried, setTried] = useState(false);
  const problemsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            expenseDate: editing.expenseDate,
            categoryId: editing.categoryId ?? "",
            item: editing.item,
            vendor: editing.vendor ?? "",
            billNumber: editing.billNumber ?? "",
            details: editing.details ?? "",
            note: editing.note ?? "",
            centreId: editing.centreId ?? "",
            methods: editing.methods.map((line) => ({ method: line.method, amount: ToRupees(line.amountPaise), reference: line.reference ?? "" })),
            reason: "",
          }
        : EmptyForm(today)
    );
    setKey(NewKey());
    setTried(false);
    save.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.expenseId]);

  const categories = (categoriesQuery.data ?? []).filter((row) => row.isActive || row.categoryId === editing?.categoryId);
  const amounts = form.methods.map((line) => ParsePaise(line.amount));
  const total = amounts.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const problems: string[] = [];
  if (!form.categoryId) problems.push("Choose a category.");
  if (!form.item.trim()) problems.push("Say what the money was spent on.");
  if (!form.expenseDate || form.expenseDate > today) problems.push("The date cannot be in the future.");
  form.methods.forEach((line, index) => {
    const label = COUNTER_METHODS.find((item) => item.value === line.method)?.label ?? line.method;
    if (amounts[index] === null) problems.push(`${label}: enter a valid amount, like 1200 or 1200.50.`);
    else if (!amounts[index]) problems.push(`${label}: enter the amount, or remove this line.`);
  });
  if (editing && !form.reason.trim()) problems.push("Give a reason for the change.");

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        expenseDate: form.expenseDate,
        categoryId: form.categoryId,
        item: form.item.trim(),
        vendor: form.vendor.trim() || null,
        billNumber: form.billNumber.trim() || null,
        details: form.details.trim() || null,
        note: form.note.trim() || null,
        centreId: form.centreId || null,
        methods: form.methods.map((line, index) => ({ method: line.method, amountPaise: amounts[index] ?? 0, reference: line.reference.trim() || null })),
      };
      if (editing) return { expense: await editExpense(editing.expenseId, { ...payload, reason: form.reason.trim() }), wasEdit: true };
      return { expense: await createExpense({ ...payload, idempotencyKey: key }), wasEdit: false };
    },
    onSuccess: ({ expense, wasEdit }) => onSaved(expense, wasEdit),
  });

  const submit = () => {
    setTried(true);
    if (problems.length) {
      window.setTimeout(() => problemsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
      return;
    }
    if (!save.isPending) save.mutate();
  };

  const set = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));

  return (
    <PaymentsDialog
      open={open}
      wide
      kicker={editing ? `Edit ${editing.expenseNumber}` : "Add Expense"}
      title={editing ? editing.item : "Money spent"}
      onClose={() => { if (!save.isPending) onClose(); }}
      footer={
        <>
          {tried && problems.length ? <span className="mr-auto self-center text-xs font-bold text-rose-600 dark:text-rose-300">{problems.length === 1 ? "1 thing to fix, shown above" : `${problems.length} things to fix, shown above`}</span> : null}
          <button type="button" className="math-button-secondary" disabled={save.isPending} onClick={onClose}>Cancel</button>
          <button type="button" className="math-button-primary" disabled={save.isPending} onClick={submit}>
            {save.isPending ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
            {editing ? "Save changes" : total ? `Save ${FormatRupees(total)}` : "Save expense"}
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <FieldLabel>Date</FieldLabel>
          <input type="date" className="math-input" value={form.expenseDate} max={today} onChange={(event) => set({ expenseDate: event.target.value })} />
        </label>
        <label className="block">
          <FieldLabel>Category</FieldLabel>
          <select className="math-input" value={form.categoryId} onChange={(event) => set({ categoryId: event.target.value })}>
            <option value="">Choose…</option>
            {categories.map((row) => <option key={row.categoryId} value={row.categoryId}>{row.name}{row.isActive ? "" : " (switched off)"}</option>)}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <FieldLabel>What was it for?</FieldLabel>
          <input className="math-input" value={form.item} onChange={(event) => set({ item: event.target.value })} placeholder="e.g. October rent, Rajarhat" />
        </label>
        <label className="block">
          <FieldLabel hint="optional">Paid to (vendor or shop)</FieldLabel>
          <input className="math-input" value={form.vendor} onChange={(event) => set({ vendor: event.target.value })} />
        </label>
        <label className="block">
          <FieldLabel hint="optional">Bill number</FieldLabel>
          <input className="math-input" value={form.billNumber} onChange={(event) => set({ billNumber: event.target.value })} />
        </label>
        <label className="block">
          <FieldLabel hint="optional">Centre</FieldLabel>
          <select className="math-input" value={form.centreId} onChange={(event) => set({ centreId: event.target.value })}>
            <option value="">Not for one centre</option>
            {(settingsQuery.data?.centres ?? []).filter((centre) => centre.isActive || centre.centreId === form.centreId).map((centre) => <option key={centre.centreId} value={centre.centreId}>{centre.name}</option>)}
          </select>
        </label>
        <label className="block">
          <FieldLabel hint="optional">Details</FieldLabel>
          <input className="math-input" value={form.details} onChange={(event) => set({ details: event.target.value })} placeholder="e.g. 200 A4 worksheets" />
        </label>

        <section className="sm:col-span-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">How it was paid</h3>
            {form.methods.length < 6 ? (
              <button type="button" className="inline-flex items-center gap-1 text-xs font-black text-cyan-700 underline dark:text-cyan-300" onClick={() => set({ methods: [...form.methods, { method: "UPI", amount: "", reference: "" }] })}>
                <Plus size={13} />Split across methods
              </button>
            ) : null}
          </div>
          <ul className="mt-2 grid gap-2">
            {form.methods.map((line, index) => {
              const label = COUNTER_METHODS.find((item) => item.value === line.method)?.label ?? line.method;
              return (
                <li key={index} className="grid grid-cols-2 gap-2 sm:grid-cols-[160px_150px_1fr_auto] sm:items-end">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-black text-slate-500">Method</span>
                    <select className="math-input" value={line.method} onChange={(event) => set({ methods: form.methods.map((item, at) => (at === index ? { ...item, method: event.target.value as PaymentMethodCode } : item)) })}>
                      {COUNTER_METHODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-black text-slate-500">Amount (₹)</span>
                    <input className="math-input text-right tabular-nums" inputMode="decimal" value={line.amount} onChange={(event) => set({ methods: form.methods.map((item, at) => (at === index ? { ...item, amount: event.target.value } : item)) })} aria-label={`${label} amount`} />
                  </label>
                  <label className="col-span-2 block sm:col-span-1">
                    <span className="mb-1 block text-[11px] font-black text-slate-500">Reference (optional)</span>
                    <input className="math-input" value={line.reference} onChange={(event) => set({ methods: form.methods.map((item, at) => (at === index ? { ...item, reference: event.target.value } : item)) })} aria-label={`${label} reference`} />
                  </label>
                  {form.methods.length > 1 ? (
                    <button type="button" className="math-focus-ring col-span-2 justify-self-end rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 sm:col-span-1 dark:hover:bg-slate-900" onClick={() => set({ methods: form.methods.filter((_, at) => at !== index) })} aria-label="Remove this method">
                      <Trash2 size={16} />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-right text-sm font-black tabular-nums text-slate-900 dark:text-white">Total {FormatRupees(total)}</p>
        </section>

        <label className="block sm:col-span-2">
          <FieldLabel hint="optional">Note</FieldLabel>
          <input className="math-input" value={form.note} onChange={(event) => set({ note: event.target.value })} />
        </label>
        {editing ? (
          <label className="block sm:col-span-2">
            <FieldLabel hint="required, kept in the history">Reason for the change</FieldLabel>
            <input className="math-input" value={form.reason} onChange={(event) => set({ reason: event.target.value })} placeholder="e.g. bill amount corrected" />
          </label>
        ) : null}
        {tried && problems.length ? (
          <div ref={problemsRef} role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200 sm:col-span-2">
            <ul className="grid gap-1">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
          </div>
        ) : null}
        <div className="sm:col-span-2"><InlineError error={save.error} /></div>
      </div>
    </PaymentsDialog>
  );
}

export function ExpensesPanel() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const queryClient = useQueryClient();
  const today = TodayInIndia();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [status, setStatus] = useState("ALL");
  const [categoryId, setCategoryId] = useState("");
  const [centreId, setCentreId] = useState("");
  const [method, setMethod] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [viewing, setViewing] = useState<Expense | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const debounced = useDebounced(search);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("add") === "1") setFormOpen(true);
    // Revamp R6: ?open=<expense id> (from search or the activity feed)
    // opens that expense.
    const openId = params.get("open");
    if (openId) {
      getExpense(openId)
        .then((expense) => {
          setMonth(expense.expenseDate.slice(0, 7));
          setViewing(expense);
        })
        .catch(() => setNotice("That expense could not be opened. It may have been removed from this list."));
    }
  }, []);

  const filters: ExpenseFilters = useMemo(() => ({ month, status, categoryId, centreId, method, search: debounced.trim() }), [month, status, categoryId, centreId, method, debounced]);
  useEffect(() => setPage(1), [filters]);
  const query = useQuery({ queryKey: ["admin", "payments", "expenses", filters, page], queryFn: () => listExpenses(filters, page, PAGE_SIZE), enabled: ready, placeholderData: keepPreviousData });
  const categoriesQuery = useQuery({ queryKey: ["admin", "payments", "expense-categories"], queryFn: listExpenseCategories, enabled: ready });
  const settingsQuery = useQuery({ queryKey: ["admin", "payments", "settings"], queryFn: getPaymentSettings, enabled: ready });
  const data = query.data;
  const pageCount = data ? Math.max(1, Math.ceil(data.totalCount / data.pageSize)) : 1;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "expenses"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "expense-categories"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "overview"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "audit"] });
  };
  const excel = useMutation({ mutationFn: () => downloadExpensesExcel(filters), onSuccess: (blob) => saveBlob(blob, `MathPath-Expenses-${month || today}.xlsx`) });
  const cancel = useMutation({
    mutationFn: (expense: Expense) => cancelExpense(expense.expenseId, cancelReason),
    onSuccess: (saved) => {
      setNotice(`${saved.expenseNumber} is cancelled. It stays on record and its number is not reused.`);
      setViewing(saved);
      setCancelling(false);
      setCancelReason("");
      refresh();
    },
  });

  if (!ready) return null;
  const top = data?.totals.byCategory[0];

  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="math-block-header"><ReceiptText size={14} />Expenses</p>
            <h1 className="math-title">Expenses</h1>
            <p className="math-subtitle">Money spent{month ? ` in ${MonthLabel(month)}` : ""}. Totals leave out cancelled expenses.</p>
            <HeroSearch />
          </div>
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-3 xl:shrink-0">
            <PaymentsMetric label="Spent" value={<span className="text-lg sm:text-xl">{data?.totals.totalDisplay ?? "—"}</span>} icon={<Wallet size={14} />} tone="amber" />
            <PaymentsMetric label="Expenses" value={data ? data.totalCount : "—"} icon={<ReceiptText size={14} />} tone="cyan" />
            <PaymentsMetric label="Biggest" value={<span className="text-base">{top ? top.categoryName : "—"}</span>} icon={<Tags size={14} />} />
          </div>
        </div>
      </section>

      <section className="mt-6 math-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div role="tablist" aria-label="Expense status" className="flex flex-wrap gap-2">
            {[["ALL", "All"], ["RECORDED", "Recorded"], ["CANCELLED", "Cancelled"]].map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={status === key} onClick={() => setStatus(key)} className={`math-role-tab-button math-admin-tab-force rounded-2xl px-4 py-2 text-sm font-black transition ${status === key ? "is-active math-admin-tab-force-selected" : ""}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="math-button-primary whitespace-nowrap" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={17} />Add Expense</button>
            <button type="button" className="math-button-secondary whitespace-nowrap" disabled={excel.isPending || !data?.totalCount} onClick={() => excel.mutate()}>
              {excel.isPending ? <Loader2 size={17} className="animate-spin" /> : <FileSpreadsheet size={17} />}Excel
            </button>
          </div>
        </div>

        <div className="mt-4 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="math-input pl-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Item, vendor or bill no." aria-label="Search expenses" />
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500 dark:text-slate-400">Month</span>
            <input type="month" className="math-input" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500 dark:text-slate-400">Category</span>
            <select className="math-input" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">All categories</option>
              {(categoriesQuery.data ?? []).map((row) => <option key={row.categoryId} value={row.categoryId}>{row.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500 dark:text-slate-400">Centre</span>
            <select className="math-input" value={centreId} onChange={(event) => setCentreId(event.target.value)}>
              <option value="">All centres</option>
              {(settingsQuery.data?.centres ?? []).map((centre) => <option key={centre.centreId} value={centre.centreId}>{centre.name}</option>)}
              <option value="NONE">Not for one centre</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500 dark:text-slate-400">Method</span>
            <select className="math-input" value={method} onChange={(event) => setMethod(event.target.value)}>
              <option value="">All methods</option>
              {COUNTER_METHODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </div>
        {month ? (
          <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-slate-500 underline" onClick={() => setMonth("")}><X size={12} />Show every month</button>
        ) : null}

        {data?.totals.byCategory.length ? (
          <div className="mt-4 flex flex-wrap gap-2" aria-label="Spent by category">
            {data.totals.byCategory.map((row) => (
              <span key={row.categoryName} className="inline-flex items-baseline gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                {row.categoryName}<span className="tabular-nums text-slate-950 dark:text-white">{row.amountDisplay}</span>
              </span>
            ))}
          </div>
        ) : null}
        {notice ? (
          <div role="status" className="mt-4 flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
            <span>{notice}</span>
            <button type="button" className="text-xs font-black underline" onClick={() => setNotice(null)}>Dismiss</button>
          </div>
        ) : null}
        {excel.error ? <div className="mt-4"><InlineError error={excel.error} /></div> : null}

        <div className="mt-5">
          {query.isLoading ? (
            <PaymentsLoading label="Loading expenses..." />
          ) : query.error ? (
            <ErrorState message="Expenses could not be loaded. Refresh the page to try again." />
          ) : !data?.expenses.length ? (
            <EmptyState title="No expenses" description={month ? `Nothing recorded for ${MonthLabel(month)}${categoryId || centreId || method || search ? " with these filters" : ""}. Use Add Expense to record one.` : "Use Add Expense to record money spent."} />
          ) : (
            <>
              <ul className="grid gap-3 md:hidden">
                {data.expenses.map((row) => (
                  <li key={row.expenseId} className={`rounded-3xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-950/60 ${row.status === "CANCELLED" ? "opacity-60" : ""}`}>
                    <button type="button" className="block w-full text-left" onClick={() => { setViewing(row); setCancelling(false); cancel.reset(); }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-black text-slate-900 dark:text-white">{row.item}</p>
                          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{row.expenseNumber} · {FormatDate(row.expenseDate)} · {row.categoryName}</p>
                        </div>
                        <p className="shrink-0 text-lg font-black tabular-nums text-slate-950 dark:text-white">{row.amountDisplay}</p>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{row.methodSummary}{row.status === "CANCELLED" ? " · cancelled" : ""}</p>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead>
                    <tr className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                      <th className="px-2 py-2">Expense</th>
                      <th className="px-2 py-2">Category</th>
                      <th className="px-2 py-2">For</th>
                      <th className="px-2 py-2">Paid with</th>
                      <th className="px-2 py-2 text-right">Amount</th>
                      <th className="px-2 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.expenses.map((row) => (
                      <tr key={row.expenseId} className={`border-t border-slate-100 dark:border-slate-800 ${row.status === "CANCELLED" ? "opacity-60" : ""}`}>
                        <td className="whitespace-nowrap px-2 py-3">
                          <div className="font-black tabular-nums text-slate-900 dark:text-white">{row.expenseNumber}</div>
                          <div className="text-xs font-semibold text-slate-500">{FormatDate(row.expenseDate)}{row.status === "CANCELLED" ? " · cancelled" : ""}</div>
                        </td>
                        <td className="px-2 py-3 font-bold text-slate-700 dark:text-slate-200">{row.categoryName}</td>
                        <td className="max-w-[260px] px-2 py-3">
                          <div className="truncate font-bold text-slate-900 dark:text-white">{row.item}</div>
                          <div className="truncate text-xs font-semibold text-slate-500">{[row.vendor, row.billNumber ? `Bill ${row.billNumber}` : null, row.centreName].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td className="px-2 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300">{row.methodSummary}</td>
                        <td className="whitespace-nowrap px-2 py-3 text-right font-black tabular-nums text-slate-950 dark:text-white">{row.amountDisplay}</td>
                        <td className="px-2 py-3">
                          <div className="flex justify-end gap-2">
                            {row.status === "RECORDED" ? <button type="button" className="math-role-action-button h-9 px-3 text-xs" onClick={() => { setEditing(row); setFormOpen(true); }}><Pencil size={13} />Edit</button> : null}
                            <button type="button" className="math-role-action-button h-9 px-3 text-xs" onClick={() => { setViewing(row); setCancelling(false); cancel.reset(); }}><Eye size={13} />View</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm font-bold text-slate-600 dark:text-slate-300">
                <span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.totalCount)} of {data.totalCount.toLocaleString("en-IN")}</span>
                <div className="flex items-center gap-2">
                  <button type="button" className="math-role-action-button h-9 px-3 text-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} />Previous</button>
                  <span className="tabular-nums">Page {page} of {pageCount}</span>
                  <button type="button" className="math-role-action-button h-9 px-3 text-xs" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Next<ChevronRight size={14} /></button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <ExpenseForm
        open={formOpen}
        editing={editing}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSaved={(expense, wasEdit) => {
          setFormOpen(false);
          setEditing(null);
          setViewing(null);
          setNotice(wasEdit ? `${expense.expenseNumber} saved.` : `${expense.expenseNumber} saved: ${expense.amountDisplay} for ${expense.item}.`);
          if (!wasEdit && expense.expenseDate.slice(0, 7) !== month && month) setMonth(expense.expenseDate.slice(0, 7));
          refresh();
        }}
      />

      <PaymentsDialog
        open={Boolean(viewing)}
        wide
        kicker={viewing?.expenseNumber ?? "Expense"}
        title={viewing ? `${viewing.item} · ${viewing.amountDisplay}` : ""}
        onClose={() => { if (!cancel.isPending) setViewing(null); }}
        footer={
          viewing ? (
            cancelling ? (
              <>
                <button type="button" className="math-button-secondary" disabled={cancel.isPending} onClick={() => setCancelling(false)}>Keep expense</button>
                <button type="button" className="math-button-primary !bg-rose-600 hover:!bg-rose-700" disabled={!cancelReason.trim() || cancel.isPending} onClick={() => cancel.mutate(viewing)}>
                  {cancel.isPending ? <Loader2 size={17} className="animate-spin" /> : <Ban size={17} />}Cancel {viewing.expenseNumber}
                </button>
              </>
            ) : viewing.status === "RECORDED" ? (
              <>
                <button type="button" className="math-button-secondary" onClick={() => { setCancelling(true); cancel.reset(); }}><Ban size={17} />Cancel expense</button>
                <button type="button" className="math-button-primary" onClick={() => { setEditing(viewing); setViewing(null); setFormOpen(true); }}><Pencil size={17} />Edit</button>
              </>
            ) : null
          ) : null
        }
      >
        {viewing ? (
          <div className="grid gap-5">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              {[
                ["Date", FormatDate(viewing.expenseDate)],
                ["Category", viewing.categoryName],
                ["Status", viewing.statusLabel],
                ["Paid to", viewing.vendor ?? "—"],
                ["Bill number", viewing.billNumber ?? "—"],
                ["Centre", viewing.centreName ?? "Not for one centre"],
                ["Details", viewing.details ?? "—"],
                ["Note", viewing.note ?? "—"],
                ["Recorded by", viewing.createdByName ?? "—"],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">{label}</dt>
                  <dd className="mt-0.5 break-words font-bold text-slate-900 dark:text-white">{value}</dd>
                </div>
              ))}
            </dl>
            <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {viewing.methods.map((line, index) => (
                <li key={index} className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm">
                  <span className="font-bold">{line.methodLabel}{line.reference ? <span className="ml-2 break-all text-xs font-semibold text-slate-500">{line.reference}</span> : null}</span>
                  <span className="font-black tabular-nums">{line.amountDisplay}</span>
                </li>
              ))}
            </ul>
            {viewing.status === "CANCELLED" ? (
              <p className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300">
                Cancelled{viewing.cancelledByName ? ` by ${viewing.cancelledByName}` : ""}. Reason: {viewing.cancelReason}
              </p>
            ) : null}
            {cancelling ? (
              <label className="block">
                <FieldLabel hint="required, kept in the history">Why is it being cancelled?</FieldLabel>
                <input className="math-input" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="e.g. entered twice" autoFocus />
              </label>
            ) : null}
            <InlineError error={cancel.error} />
            <div>
              <h3 className="mb-2 text-sm font-black text-slate-800 dark:text-slate-100">History</h3>
              <PaymentsHistoryList entityType="EXPENSE" entityId={viewing.expenseId} limit={20} />
            </div>
          </div>
        ) : null}
      </PaymentsDialog>
    </>
  );
}
