"use client";

// 2026-10-08 (Payments Phase 1): Fee Setup -- the one list of things a student
// can be invoiced for. Replaces the old platform's Groups, Components and
// Group Maps screens. Nothing is deleted: items are switched off with a reason.
import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import {
  FieldError,
  FieldLabel,
  InlineError,
  PaymentsDialog,
  PaymentsHistoryList,
  PaymentsMetric,
  StatusPill,
} from "@/components/payments/PaymentsUi";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import {
  createFeeItem,
  listFeeItems,
  reorderFeeItems,
  setFeeItemActive,
  updateFeeItem,
  type BillingType,
  type FeeItem,
} from "@/lib/api/payments";
import { CheckRupeeAmount, FormatRupees, SplitInclusiveGst } from "@/lib/paymentsMoney";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CircleSlash,
  History,
  Pencil,
  Plus,
  ReceiptText,
  RotateCcw,
  Search,
  Tag,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";

type FormState = {
  name: string;
  amount: string;
  billingType: BillingType;
  gstIncluded: boolean;
  description: string;
  reason: string;
};

const EMPTY_FORM: FormState = { name: "", amount: "", billingType: "MONTHLY", gstIncluded: true, description: "", reason: "" };

function BillingChip({ type }: { type: BillingType }) {
  return type === "MONTHLY" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-black text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200">
      <CalendarClock size={12} /> Monthly
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-black text-violet-700 dark:bg-violet-950/40 dark:text-violet-200">
      <Tag size={12} /> One-time
    </span>
  );
}

export default function FeeSetupPage() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<FeeItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [touched, setTouched] = useState(false);
  const [switchOff, setSwitchOff] = useState<FeeItem | null>(null);
  const [switchOffReason, setSwitchOffReason] = useState("");
  const [historyFor, setHistoryFor] = useState<FeeItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const itemsQuery = useQuery({ queryKey: ["admin", "payments", "fee-items"], queryFn: listFeeItems, enabled: ready });
  const items = itemsQuery.data ?? [];
  const activeItems = items.filter((item) => item.isActive);
  const inactiveItems = items.filter((item) => !item.isActive);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => (showInactive || item.isActive) && (!needle || item.name.toLowerCase().includes(needle) || (item.description ?? "").toLowerCase().includes(needle)));
  }, [items, search, showInactive]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "fee-items"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "audit"] });
  };

  const amountCheck = CheckRupeeAmount(form.amount);
  const nameMissing = !form.name.trim();
  const preview = amountCheck.ok ? SplitInclusiveGst(amountCheck.paise, 1800, form.gstIncluded) : null;
  const amountChanged = editing && amountCheck.ok && amountCheck.paise !== editing.amountPaise;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        return updateFeeItem(editing.feeItemId, {
          name: form.name,
          amount: form.amount,
          billingType: form.billingType,
          gstIncluded: form.gstIncluded,
          ...(form.description.trim() ? { description: form.description } : { clearDescription: true }),
          reason: form.reason.trim() || null,
        });
      }
      return createFeeItem({ name: form.name, amount: form.amount, billingType: form.billingType, gstIncluded: form.gstIncluded, description: form.description.trim() || null });
    },
    onSuccess: (saved) => {
      setNotice(editing ? `Saved changes to ${saved.name}.` : `Added ${saved.name} (${saved.amountDisplay}).`);
      setFormOpen(false);
      setEditing(null);
      refresh();
    },
  });

  const activeMutation = useMutation({
    mutationFn: (vars: { item: FeeItem; isActive: boolean; reason?: string }) => setFeeItemActive(vars.item.feeItemId, { isActive: vars.isActive, reason: vars.reason ?? null }),
    onSuccess: (saved) => {
      setNotice(saved.isActive ? `${saved.name} is switched on again.` : `${saved.name} is switched off. It stays on invoices already issued.`);
      setSwitchOff(null);
      setSwitchOffReason("");
      refresh();
    },
  });

  const reorderMutation = useMutation({
    mutationFn: reorderFeeItems,
    onSuccess: (list) => queryClient.setQueryData(["admin", "payments", "fee-items"], list),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin", "payments", "audit"] }),
  });

  const move = (item: FeeItem, direction: -1 | 1) => {
    const order = activeItems.map((row) => row.feeItemId);
    const index = order.indexOf(item.feeItemId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    reorderMutation.mutate(order);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setTouched(false);
    saveMutation.reset();
    setFormOpen(true);
  };

  const openEdit = (item: FeeItem) => {
    setEditing(item);
    setForm({ name: item.name, amount: item.amount.replace(/\.00$/, ""), billingType: item.billingType, gstIncluded: item.gstIncluded, description: item.description ?? "", reason: "" });
    setTouched(false);
    saveMutation.reset();
    setFormOpen(true);
  };

  const submit = () => {
    setTouched(true);
    if (nameMissing || !amountCheck.ok) return;
    saveMutation.mutate();
  };

  if (!ready) return null;
  const canReorder = !search.trim() && !reorderMutation.isPending;

  return (
    <AppShell title="Fee Setup">
      <section className="math-hero math-slide-up">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="math-block-header"><Wallet size={14} />Payments</p>
            <h1 className="math-title">Fee Setup</h1>
            <p className="math-subtitle">The fees students can be invoiced for. Changing a price only affects new invoices, never ones already issued.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:shrink-0">
            <PaymentsMetric label="Active" value={activeItems.length} icon={<ReceiptText size={14} />} tone="emerald" />
            <PaymentsMetric label="Monthly" value={activeItems.filter((item) => item.billingType === "MONTHLY").length} icon={<CalendarClock size={14} />} tone="cyan" />
            <PaymentsMetric label="One-time" value={activeItems.filter((item) => item.billingType === "ONE_TIME").length} icon={<Tag size={14} />} />
            <PaymentsMetric label="Off" value={inactiveItems.length} icon={<CircleSlash size={14} />} tone="amber" />
          </div>
        </div>
      </section>

      <section className="mt-6 math-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="math-block-header"><ReceiptText size={14} />Fee Items</p>
            <h2 className="text-2xl font-black text-slate-950 dark:text-white">What students pay for</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">Prices include 18% GST unless switched off. Use the arrows to set the order items appear in on invoices.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative sm:w-72">
              <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="math-input pl-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search fee items" aria-label="Search fee items" />
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm font-bold text-slate-600 dark:text-slate-300">
              <input type="checkbox" className="h-4 w-4" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
              Show switched-off ({inactiveItems.length})
            </label>
            <button type="button" className="math-button-primary whitespace-nowrap" onClick={openCreate}>
              <Plus size={17} /> Add Fee Item
            </button>
          </div>
        </div>

        {notice ? (
          <div role="status" className="mt-4 flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
            <span>{notice}</span>
            <button type="button" className="text-xs font-black underline" onClick={() => setNotice(null)}>Dismiss</button>
          </div>
        ) : null}
        {reorderMutation.error ? <div className="mt-4"><InlineError error={reorderMutation.error} /></div> : null}

        <div className="mt-5">
          {itemsQuery.isLoading ? (
            <LoadingState label="Loading fee items..." />
          ) : itemsQuery.error ? (
            <ErrorState message="Fee items could not be loaded. Refresh the page to try again." />
          ) : !items.length ? (
            <EmptyState
              title="No fee items yet"
              description="Add the fees students pay, like Monthly Fee or Registration Charges. The old platform's fee list will also arrive with the payment history migration."
            />
          ) : !visible.length ? (
            <EmptyState title="No fee items match" description="Try a different search, or show switched-off items." />
          ) : (
            <>
            {/* Phones: one card per fee item. */}
            <ul className="grid gap-3 md:hidden">
              {visible.map((item) => {
                const position = activeItems.findIndex((row) => row.feeItemId === item.feeItemId);
                return (
                  <li key={item.feeItemId} className={`rounded-3xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-950/60 ${item.isActive ? "" : "opacity-60"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black text-slate-900 dark:text-white">{item.name}</p>
                        {item.description ? <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{item.description}</p> : null}
                      </div>
                      <p className="shrink-0 text-lg font-black tabular-nums text-slate-950 dark:text-white">{item.amountDisplay}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <BillingChip type={item.billingType} />
                      <StatusPill active={item.isActive} inactiveLabel="Switched off" />
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{item.gstIncluded ? `18% GST included (${item.gstDisplay})` : "No GST"}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {item.isActive ? (
                        <>
                          <button type="button" className="math-role-action-button h-9 w-9 justify-center px-0" disabled={!canReorder || position <= 0} onClick={() => move(item, -1)} aria-label={`Move ${item.name} up`}><ArrowUp size={14} /></button>
                          <button type="button" className="math-role-action-button h-9 w-9 justify-center px-0" disabled={!canReorder || position >= activeItems.length - 1} onClick={() => move(item, 1)} aria-label={`Move ${item.name} down`}><ArrowDown size={14} /></button>
                        </>
                      ) : null}
                      <button type="button" className="math-role-action-button h-9 px-3 text-xs" onClick={() => openEdit(item)}><Pencil size={13} />Edit</button>
                      <button type="button" className="math-role-action-button h-9 px-3 text-xs" onClick={() => setHistoryFor(item)}><History size={13} />History</button>
                      {item.isActive ? (
                        <button type="button" className="math-role-action-button h-9 px-3 text-xs" onClick={() => { setSwitchOff(item); setSwitchOffReason(""); activeMutation.reset(); }}><CircleSlash size={13} />Switch Off</button>
                      ) : (
                        <button type="button" className="math-role-action-button h-9 px-3 text-xs" disabled={activeMutation.isPending} onClick={() => activeMutation.mutate({ item, isActive: true })}><RotateCcw size={13} />Switch On</button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                    <th className="w-20 px-2 py-2">Order</th>
                    <th className="px-2 py-2">Fee Item</th>
                    <th className="px-2 py-2">Billing</th>
                    <th className="px-2 py-2 text-right">Amount</th>
                    <th className="px-2 py-2">GST</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => {
                    const position = activeItems.findIndex((row) => row.feeItemId === item.feeItemId);
                    return (
                      <tr key={item.feeItemId} className={`border-t border-slate-100 dark:border-slate-800 ${item.isActive ? "" : "opacity-60"}`}>
                        <td className="px-2 py-3">
                          {item.isActive ? (
                            <div className="flex items-center gap-1">
                              <button type="button" className="math-focus-ring rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-900" disabled={!canReorder || position <= 0} onClick={() => move(item, -1)} aria-label={`Move ${item.name} up`}>
                                <ArrowUp size={15} />
                              </button>
                              <button type="button" className="math-focus-ring rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-900" disabled={!canReorder || position >= activeItems.length - 1} onClick={() => move(item, 1)} aria-label={`Move ${item.name} down`}>
                                <ArrowDown size={15} />
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs font-semibold text-slate-400">—</span>
                          )}
                        </td>
                        <td className="max-w-[320px] px-2 py-3">
                          <div className="font-black text-slate-900 dark:text-white">{item.name}</div>
                          {item.description ? <div className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{item.description}</div> : null}
                        </td>
                        <td className="px-2 py-3"><BillingChip type={item.billingType} /></td>
                        <td className="whitespace-nowrap px-2 py-3 text-right text-base font-black tabular-nums text-slate-950 dark:text-white">{item.amountDisplay}</td>
                        <td className="whitespace-nowrap px-2 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {item.gstIncluded ? <>18% included<br />({item.gstDisplay})</> : "No GST"}
                        </td>
                        <td className="px-2 py-3"><StatusPill active={item.isActive} inactiveLabel="Switched off" /></td>
                        <td className="px-2 py-3">
                          <div className="flex justify-end gap-2">
                            <button type="button" className="math-role-action-button h-9 px-3 text-xs" onClick={() => openEdit(item)}><Pencil size={13} />Edit</button>
                            <button type="button" className="math-role-action-button h-9 px-3 text-xs" onClick={() => setHistoryFor(item)}><History size={13} />History</button>
                            {item.isActive ? (
                              <button type="button" className="math-role-action-button h-9 px-3 text-xs" onClick={() => { setSwitchOff(item); setSwitchOffReason(""); activeMutation.reset(); }}><CircleSlash size={13} />Switch Off</button>
                            ) : (
                              <button type="button" className="math-role-action-button h-9 px-3 text-xs" disabled={activeMutation.isPending} onClick={() => activeMutation.mutate({ item, isActive: true })}><RotateCcw size={13} />Switch On</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      </section>

      <PaymentsDialog
        open={formOpen}
        kicker={editing ? "Edit Fee Item" : "New Fee Item"}
        title={editing ? editing.name : "Add a fee item"}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <button type="button" className="math-button-secondary" onClick={() => setFormOpen(false)}>Cancel</button>
            <button type="button" className="math-button-primary" disabled={saveMutation.isPending} onClick={submit}>
              {saveMutation.isPending ? "Saving..." : editing ? "Save Changes" : "Add Fee Item"}
            </button>
          </>
        }
      >
        <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <label className="block">
            <FieldLabel>Name</FieldLabel>
            <input className="math-input" value={form.name} maxLength={150} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Monthly Fee" />
            <FieldError message={touched && nameMissing ? "Please enter a name." : null} />
          </label>

          <label className="block">
            <FieldLabel hint={form.gstIncluded ? "includes GST" : "no GST"}>Amount (₹)</FieldLabel>
            <input className="math-input tabular-nums" inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="e.g. 1100" />
            <FieldError message={touched && !amountCheck.ok ? amountCheck.message : null} />
          </label>

          <fieldset>
            <FieldLabel>Billing</FieldLabel>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Billing">
              {(["MONTHLY", "ONE_TIME"] as BillingType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={form.billingType === type}
                  onClick={() => setForm({ ...form, billingType: type })}
                  className={`math-focus-ring rounded-2xl border px-3 py-2.5 text-left text-sm font-black transition ${form.billingType === type ? "border-cyan-500 bg-cyan-50 text-cyan-800 dark:border-cyan-400 dark:bg-cyan-950/40 dark:text-cyan-100" : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:text-slate-300"}`}
                >
                  {type === "MONTHLY" ? "Monthly" : "One-time"}
                  <span className="mt-0.5 block text-xs font-semibold opacity-80">{type === "MONTHLY" ? "Billed for a month and year" : "Billed once, e.g. a kit"}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={form.gstIncluded} onChange={(event) => setForm({ ...form, gstIncluded: event.target.checked })} />
            <span>
              <span className="block text-sm font-black text-slate-800 dark:text-slate-100">18% GST is included in this price</span>
              <span className="block text-xs font-semibold text-slate-500">The invoice shows the taxable amount, CGST 9% and SGST 9%.</span>
            </span>
          </label>

          {preview ? (
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-900/60">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">On the invoice</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
                <dt className="font-semibold text-slate-600 dark:text-slate-300">Taxable amount</dt><dd className="text-right font-black">{FormatRupees(preview.taxable)}</dd>
                <dt className="font-semibold text-slate-600 dark:text-slate-300">CGST 9%</dt><dd className="text-right font-black">{FormatRupees(preview.cgst)}</dd>
                <dt className="font-semibold text-slate-600 dark:text-slate-300">SGST 9%</dt><dd className="text-right font-black">{FormatRupees(preview.sgst)}</dd>
                <dt className="border-t border-slate-200 pt-1 font-black text-slate-900 dark:border-slate-700 dark:text-white">Total</dt><dd className="border-t border-slate-200 pt-1 text-right font-black text-slate-900 dark:border-slate-700 dark:text-white">{amountCheck.ok ? FormatRupees(amountCheck.paise) : ""}</dd>
              </dl>
            </div>
          ) : null}

          <label className="block">
            <FieldLabel hint="optional">Description</FieldLabel>
            <textarea className="math-input min-h-[72px]" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="A short note for admins, e.g. charged once at joining" />
          </label>

          {editing ? (
            <>
              {amountChanged ? (
                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                  The new price applies to invoices created from now on. Invoices already issued keep {editing.amountDisplay}.
                </p>
              ) : null}
              <label className="block">
                <FieldLabel hint="optional, kept in the history">Reason for the change</FieldLabel>
                <input className="math-input" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="e.g. new session price" />
              </label>
            </>
          ) : null}
          <InlineError error={saveMutation.error} />
          <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
        </form>
      </PaymentsDialog>

      <PaymentsDialog
        open={Boolean(switchOff)}
        kicker="Switch Off"
        title={switchOff ? `Switch off ${switchOff.name}?` : ""}
        onClose={() => setSwitchOff(null)}
        footer={
          <>
            <button type="button" className="math-button-secondary" onClick={() => setSwitchOff(null)}>Cancel</button>
            <button
              type="button"
              className="math-button-primary"
              disabled={!switchOffReason.trim() || activeMutation.isPending}
              onClick={() => switchOff && activeMutation.mutate({ item: switchOff, isActive: false, reason: switchOffReason })}
            >
              {activeMutation.isPending ? "Switching off..." : "Switch Off"}
            </button>
          </>
        }
      >
        <p className="text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
          It will no longer be offered for new invoices. Invoices already issued for it are not changed, and you can switch it on again at any time.
        </p>
        <label className="mt-4 block">
          <FieldLabel>Reason</FieldLabel>
          <input className="math-input" value={switchOffReason} onChange={(event) => setSwitchOffReason(event.target.value)} placeholder="e.g. no longer sold" />
        </label>
        <div className="mt-3"><InlineError error={activeMutation.error} /></div>
      </PaymentsDialog>

      <PaymentsDialog open={Boolean(historyFor)} kicker="Change History" title={historyFor?.name ?? ""} onClose={() => setHistoryFor(null)} wide>
        {historyFor ? <PaymentsHistoryList entityType="FEE_ITEM" entityId={historyFor.feeItemId} /> : null}
      </PaymentsDialog>
    </AppShell>
  );
}
