"use client";

// 2026-10-09 (Payments revamp R6): Payment Settings > Insights. What counts
// as unusual activity in Reports > Insights.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Settings2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ErrorState } from "@/components/common/ErrorState";
import { HeroSearch } from "@/components/payments/CommandPalette";
import { usePaymentsToast } from "@/components/payments/PaymentsToast";
import { InlineError, PaymentsLoading } from "@/components/payments/PaymentsUi";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { getInsightSettings, updateInsightSettings, type InsightSettings } from "@/lib/api/payments";

type Form = { discountAmount: string; discountPercent: string; cancellationsPerDay: string; backdatedDays: string };

function ToForm(settings: InsightSettings): Form {
  return {
    discountAmount: String(Math.round(settings.discountAmount.paise / 100)),
    discountPercent: String(settings.discountPercent),
    cancellationsPerDay: String(settings.cancellationsPerDay),
    backdatedDays: String(settings.backdatedDays),
  };
}

function NumberField({ id, label, hint, value, onChange, prefix, suffix }: { id: string; label: string; hint: string; value: string; onChange: (value: string) => void; prefix?: string; suffix: string }) {
  return (
    <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-950/50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
      <div className="min-w-0">
        <label htmlFor={id} className="block font-black text-slate-900 dark:text-white">{label}</label>
        <p className="mt-0.5 text-sm font-semibold text-slate-500 dark:text-slate-400">{hint}</p>
      </div>
      <div className="flex items-center gap-2">
        {prefix ? <span className="text-sm font-black text-slate-500">{prefix}</span> : null}
        <input id={id} className="math-input w-28 text-right tabular-nums" inputMode="numeric" value={value} onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ""))} />
        <span className="w-16 text-sm font-bold text-slate-600 dark:text-slate-300">{suffix}</span>
      </div>
    </div>
  );
}

export function InsightSettingsPanel() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const queryClient = useQueryClient();
  const toast = usePaymentsToast();
  const query = useQuery({ queryKey: ["admin", "payments", "insights", "settings"], queryFn: getInsightSettings, enabled: ready });
  const [form, setForm] = useState<Form | null>(null);
  useEffect(() => {
    if (query.data && !form) setForm(ToForm(query.data));
  }, [query.data, form]);
  const save = useMutation({
    mutationFn: () => updateInsightSettings(form!),
    onSuccess: (saved) => {
      queryClient.setQueryData(["admin", "payments", "insights", "settings"], saved);
      queryClient.invalidateQueries({ queryKey: ["admin", "payments", "insights"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "payments", "home"] });
      setForm(ToForm(saved));
      toast?.({ text: "Limits saved. Insights now uses them.", href: "/admin/payments/reports?tab=insights#unusual", hrefLabel: "Insights" });
    },
  });
  if (!ready) return null;
  const changed = Boolean(form && query.data && JSON.stringify(form) !== JSON.stringify(ToForm(query.data)));
  const set = (key: keyof Form) => (value: string) => setForm((current) => (current ? { ...current, [key]: value } : current));
  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="relative z-10 min-w-0">
          <p className="math-block-header"><Settings2 size={14} />Payment Settings</p>
          <h1 className="math-title">Insights</h1>
          <p className="math-subtitle">What counts as unusual activity. Anything over these limits is listed in Reports › Insights for someone to look at.</p>
          <HeroSearch />
        </div>
      </section>
      {query.isLoading || !form ? (
        query.error ? <div className="mt-6"><ErrorState message="The limits could not be loaded. Refresh the page to try again." /></div> : <div className="mt-6"><PaymentsLoading label="Loading the limits…" rows={4} /></div>
      ) : (
        <section className="math-card mt-6 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-950 dark:text-white"><ShieldAlert size={18} className="text-violet-600 dark:text-violet-400" />Unusual activity</h2>
          <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); if (changed) save.mutate(); }}>
            <NumberField id="ins-discount-amount" label="A large discount" hint="A discount on one payment above this amount." prefix="₹" suffix="" value={form.discountAmount} onChange={set("discountAmount")} />
            <NumberField id="ins-discount-percent" label="Or a large share" hint="A discount above this share of what the payment settled (paid + discount)." suffix="%" value={form.discountPercent} onChange={set("discountPercent")} />
            <NumberField id="ins-cancellations" label="Many cancellations" hint="This many or more payments, invoices or expenses cancelled by one person in one day." suffix="in a day" value={form.cancellationsPerDay} onChange={set("cancellationsPerDay")} />
            <NumberField id="ins-backdated" label="A backdated payment" hint="A counter payment dated more than this many days before it was entered (or last edited)." suffix="days" value={form.backdatedDays} onChange={set("backdatedDays")} />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button type="submit" className="math-button-primary" disabled={!changed || save.isPending}>{save.isPending ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}Save</button>
              {changed ? <button type="button" className="math-button-secondary" onClick={() => query.data && setForm(ToForm(query.data))}>Undo changes</button> : null}
              <Link href="/admin/payments/reports?tab=insights#unusual" className="text-sm font-black text-cyan-700 hover:underline dark:text-cyan-300">See Insights</Link>
            </div>
            {save.error ? <InlineError error={save.error} /> : null}
          </form>
        </section>
      )}
    </>
  );
}
