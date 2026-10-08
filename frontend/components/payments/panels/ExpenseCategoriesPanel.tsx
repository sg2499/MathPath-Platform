"use client";

// 2026-10-08 (Payments Phase 4): Expenses > Categories -- the list an expense
// is filed under. Add, rename, switch off (with a reason) or on. Renaming
// never changes past expenses; a switched-off category stays on them.
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { FieldLabel, InlineError, PaymentsDialog, PaymentsHistoryList, PaymentsMetric, StatusPill } from "@/components/payments/PaymentsUi";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { createExpenseCategory, listExpenseCategories, updateExpenseCategory, type ExpenseCategory } from "@/lib/api/payments";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleSlash, History, Pencil, Plus, RotateCcw, Tags } from "lucide-react";
import { useState } from "react";

export function ExpenseCategoriesPanel() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "payments", "expense-categories"], queryFn: listExpenseCategories, enabled: ready });
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [switchOff, setSwitchOff] = useState<ExpenseCategory | null>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const categories = query.data ?? [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "expense-categories"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "audit"] });
  };
  const save = useMutation({
    mutationFn: () => (editing ? updateExpenseCategory(editing.categoryId, { name }) : createExpenseCategory(name)),
    onSuccess: (row) => {
      setNotice(editing ? `Renamed to ${row.name}. Past expenses keep the name they were saved with.` : `Added ${row.name}.`);
      setEditing(null);
      setAdding(false);
      refresh();
    },
  });
  const active = useMutation({
    mutationFn: (vars: { row: ExpenseCategory; isActive: boolean }) => updateExpenseCategory(vars.row.categoryId, { isActive: vars.isActive, reason: vars.isActive ? null : reason }),
    onSuccess: (row) => {
      setNotice(row.isActive ? `${row.name} is switched on again.` : `${row.name} is switched off. Past expenses keep it.`);
      setSwitchOff(null);
      setReason("");
      refresh();
    },
  });

  if (!ready) return null;
  const open = adding || Boolean(editing);

  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="math-block-header"><Tags size={14} />Expenses</p>
            <h1 className="math-title">Categories</h1>
            <p className="math-subtitle">What each expense is filed under, so you can see where the money goes. Renaming one never changes past expenses.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:shrink-0">
            <PaymentsMetric label="In use" value={categories.filter((row) => row.isActive).length} icon={<Tags size={14} />} tone="emerald" />
            <PaymentsMetric label="Off" value={categories.filter((row) => !row.isActive).length} icon={<CircleSlash size={14} />} tone="amber" />
          </div>
        </div>
      </section>

      <section className="mt-6 math-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-black text-slate-950 dark:text-white">Expense categories</h2>
          <button type="button" className="math-button-primary" onClick={() => { setAdding(true); setEditing(null); setName(""); save.reset(); }}><Plus size={17} />Add Category</button>
        </div>
        {notice ? (
          <div role="status" className="mt-4 flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
            <span>{notice}</span>
            <button type="button" className="text-xs font-black underline" onClick={() => setNotice(null)}>Dismiss</button>
          </div>
        ) : null}
        {active.error ? <div className="mt-4"><InlineError error={active.error} /></div> : null}
        <div className="mt-5">
          {query.isLoading ? (
            <LoadingState label="Loading categories..." />
          ) : query.error ? (
            <ErrorState message="Categories could not be loaded. Refresh the page to try again." />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {categories.map((row) => (
                <li key={row.categoryId} className={`flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50 ${row.isActive ? "" : "opacity-60"}`}>
                  <div className="min-w-0">
                    <p className="truncate font-black text-slate-900 dark:text-white">{row.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <StatusPill active={row.isActive} activeLabel="In use" inactiveLabel="Switched off" />
                      <span className="text-xs font-semibold text-slate-500">{row.expenseCount} {row.expenseCount === 1 ? "expense" : "expenses"}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" className="math-role-action-button h-9 w-9 justify-center px-0" onClick={() => { setEditing(row); setAdding(false); setName(row.name); save.reset(); }} aria-label={`Rename ${row.name}`} title="Rename"><Pencil size={14} /></button>
                    {row.isActive ? (
                      <button type="button" className="math-role-action-button h-9 w-9 justify-center px-0" onClick={() => { setSwitchOff(row); setReason(""); active.reset(); }} aria-label={`Switch off ${row.name}`} title="Switch off"><CircleSlash size={14} /></button>
                    ) : (
                      <button type="button" className="math-role-action-button h-9 w-9 justify-center px-0" disabled={active.isPending} onClick={() => active.mutate({ row, isActive: true })} aria-label={`Switch on ${row.name}`} title="Switch on"><RotateCcw size={14} /></button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-6 math-card p-5 sm:p-6">
        <p className="math-block-header"><History size={14} />History</p>
        <div className="mt-3"><PaymentsHistoryList entityType="EXPENSE_CATEGORY" limit={30} /></div>
      </section>

      <PaymentsDialog
        open={open}
        kicker={editing ? "Rename" : "Add Category"}
        title={editing ? editing.name : "New category"}
        onClose={() => { if (!save.isPending) { setAdding(false); setEditing(null); } }}
        footer={
          <>
            <button type="button" className="math-button-secondary" disabled={save.isPending} onClick={() => { setAdding(false); setEditing(null); }}>Cancel</button>
            <button type="button" className="math-button-primary" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>{editing ? "Save" : "Add Category"}</button>
          </>
        }
      >
        <form onSubmit={(event) => { event.preventDefault(); if (name.trim()) save.mutate(); }} className="grid gap-3">
          <label className="block">
            <FieldLabel>Name</FieldLabel>
            <input className="math-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Exam Fees" maxLength={80} />
          </label>
          <InlineError error={save.error} />
        </form>
      </PaymentsDialog>

      <PaymentsDialog
        open={Boolean(switchOff)}
        kicker="Switch Off"
        title={switchOff?.name ?? ""}
        onClose={() => { if (!active.isPending) setSwitchOff(null); }}
        footer={
          <>
            <button type="button" className="math-button-secondary" disabled={active.isPending} onClick={() => setSwitchOff(null)}>Keep it on</button>
            <button type="button" className="math-button-primary" disabled={!reason.trim() || active.isPending || !switchOff} onClick={() => switchOff && active.mutate({ row: switchOff, isActive: false })}>Switch Off</button>
          </>
        }
      >
        <div className="grid gap-3">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">It will no longer be offered for new expenses. Past expenses keep it.</p>
          <label className="block">
            <FieldLabel hint="required, kept in the history">Reason</FieldLabel>
            <input className="math-input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. merged into Maintenance" />
          </label>
          <InlineError error={active.error} />
        </div>
      </PaymentsDialog>
    </>
  );
}
