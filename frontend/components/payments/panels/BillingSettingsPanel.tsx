"use client";

// 2026-10-09 (Payments revamp R3): Payment Settings > Billing.
// Which monthly fee each billing mode is charged (India ₹1,100,
// International ₹2,200 from Fee Setup), the automatic drafts on the 1st, and
// each student's billing mode (India or International), set for many
// students at once.
// 2026-11-26 (billing Release 1): each mode has two fees, one for students
// admitted before the cut-off (1 Dec 2026) and one for students admitted
// from it. Each student's fee group follows their admission date, or is set
// by hand with a reason.

import { formatMathPathDateTime } from "@/lib/date";
import { DemoTag } from "@/components/common/DemoAccounts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Ban, CalendarClock, CalendarDays, CheckCircle2, Globe2, IndianRupee, Loader2, Search, Settings2, Sparkles, UsersRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { ErrorState } from "@/components/common/ErrorState";
import { HeroSearch } from "@/components/payments/CommandPalette";
import { InlineError, PaymentsMetric, PaymentsLoading } from "@/components/payments/PaymentsUi";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import {
  BILLING_MODE_LABELS,
  getBillingSettings,
  listBillingStudents,
  setBillingModes,
  setBillingRateGroups,
  updateBillingSettings,
  type BillingMode,
  type BillingSettings,
  type RateGroup,
  type RateGroupSource,
} from "@/lib/api/payments";

function When(iso: string | null): string {
  if (!iso) return "";
  return formatMathPathDateTime(iso);
}

function Card({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="math-card flex h-full min-w-0 flex-col p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-950 dark:text-white">{icon}{title}</h2>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

export function ModePill({ mode }: { mode: BillingMode }) {
  if (mode === "EXEMPT") {
    return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-slate-200 px-2.5 py-1 text-xs font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200"><Ban size={12} />No Monthly Fee</span>;
  }
  return mode === "INTERNATIONAL" ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-violet-100 px-2.5 py-1 text-xs font-black text-violet-800 dark:bg-violet-950/40 dark:text-violet-200"><Globe2 size={12} />International</span>
  ) : (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sky-100 px-2.5 py-1 text-xs font-black text-sky-800 dark:bg-sky-950/40 dark:text-sky-200"><IndianRupee size={12} />India</span>
  );
}

export function RateGroupPill({ group, source }: { group: RateGroup; source?: RateGroupSource }) {
  const title = source === "SET_BY_ADMIN" ? "Set by an admin" : source === "ADDED_ON" ? "No admission date: follows the day the student was added" : "Follows the admission date";
  return group === "NEW" ? (
    <span title={title} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><Sparkles size={12} />New Fee</span>
  ) : (
    <span title={title} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"><CheckCircle2 size={12} />Existing Fee</span>
  );
}

function ShortDate(iso: string | null): string {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function BillingSettingsPanel() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const query = useQuery({ queryKey: ["admin", "payments", "billing", "settings"], queryFn: getBillingSettings, enabled: ready });
  const data = query.data;
  if (!ready) return null;
  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="math-block-header"><Settings2 size={14} />Payment Settings</p>
            <h1 className="math-title">Billing</h1>
            <p className="math-subtitle">The monthly fee for India and International students, by admission date, the automatic drafts on the 1st, and each student&apos;s billing mode and fee group. Students set to No monthly fee never get a monthly bill.</p>
            <HeroSearch />
          </div>
          {data ? (
            <div className="grid grid-cols-2 gap-3 min-[480px]:grid-cols-4 xl:shrink-0">
              <PaymentsMetric label="India" value={data.counts.INDIA} icon={<IndianRupee size={14} />} tone="cyan" />
              <PaymentsMetric label="International" value={data.counts.INTERNATIONAL} icon={<Globe2 size={14} />} tone="cyan" />
              <PaymentsMetric label="No Monthly Fee" value={data.counts.EXEMPT ?? 0} icon={<Ban size={14} />} tone="slate" />
              <PaymentsMetric label="Next Drafts" value={<span className="text-lg sm:text-xl">{data.nextAutoLabel ?? "Off"}</span>} icon={<CalendarClock size={14} />} tone={data.autoDraftsEnabled ? "emerald" : "amber"} />
            </div>
          ) : null}
        </div>
      </section>

      {query.isLoading ? (
        <div className="mt-6"><PaymentsLoading label="Loading billing settings…" variant="cards" /></div>
      ) : query.error || !data ? (
        <div className="mt-6"><ErrorState message="Billing settings could not be loaded. Refresh the page to try again." /></div>
      ) : (
        <>
          {data.problems.length ? (
            <ul role="alert" className="mt-6 grid gap-1 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
              {data.problems.map((problem) => <li key={problem} className="flex items-start gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{problem}</li>)}
            </ul>
          ) : null}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <FeesCard data={data} key={`${data.indiaFee?.feeItemId}-${data.internationalFee?.feeItemId}-${data.indiaNewFee?.feeItemId}-${data.internationalNewFee?.feeItemId}-${data.newRateFrom}`} />
            <AutoCard data={data} />
          </div>
          <StudentModes newRateFromLabel={data.newRateFromLabel} />
        </>
      )}
    </>
  );
}

function FeesCard({ data }: { data: BillingSettings }) {
  const queryClient = useQueryClient();
  const [india, setIndia] = useState(data.indiaFee?.feeItemId ?? "");
  const [indiaNew, setIndiaNew] = useState(data.indiaNewFee?.feeItemId ?? "");
  const [intl, setIntl] = useState(data.internationalFee?.feeItemId ?? "");
  const [intlNew, setIntlNew] = useState(data.internationalNewFee?.feeItemId ?? "");
  const [cutoff, setCutoff] = useState(data.newRateFrom);
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () => updateBillingSettings({
      indiaFeeItemId: india || null,
      indiaNewFeeItemId: indiaNew || null,
      internationalFeeItemId: intl || null,
      internationalNewFeeItemId: intlNew || null,
      newRateFrom: cutoff,
    }),
    onSuccess: (next) => { queryClient.setQueryData(["admin", "payments", "billing", "settings"], next); queryClient.invalidateQueries({ queryKey: ["admin", "payments"] }); setSaved(true); },
  });
  const options = data.monthlyFeeItems.filter((item) => item.isActive);
  const changed =
    india !== (data.indiaFee?.feeItemId ?? "") ||
    indiaNew !== (data.indiaNewFee?.feeItemId ?? "") ||
    intl !== (data.internationalFee?.feeItemId ?? "") ||
    intlNew !== (data.internationalNewFee?.feeItemId ?? "") ||
    cutoff !== data.newRateFrom;
  const cutoffLabel = ShortDate(cutoff) || data.newRateFromLabel;
  const modes = [
    {
      key: "INDIA" as const,
      title: "India Students",
      icon: <IndianRupee size={15} className="text-sky-600 dark:text-sky-400" />,
      rows: [
        { label: `Admitted before ${cutoffLabel}`, value: india, set: setIndia, count: data.groupCounts.INDIA.EXISTING },
        { label: `Admitted from ${cutoffLabel}`, value: indiaNew, set: setIndiaNew, count: data.groupCounts.INDIA.NEW },
      ],
    },
    {
      key: "INTERNATIONAL" as const,
      title: "International Students",
      icon: <Globe2 size={15} className="text-violet-600 dark:text-violet-400" />,
      rows: [
        { label: `Admitted before ${cutoffLabel}`, value: intl, set: setIntl, count: data.groupCounts.INTERNATIONAL.EXISTING },
        { label: `Admitted from ${cutoffLabel}`, value: intlNew, set: setIntlNew, count: data.groupCounts.INTERNATIONAL.NEW },
      ],
    },
  ];
  return (
    <Card title="Monthly Fee By Mode" icon={<IndianRupee size={18} className="text-cyan-600 dark:text-cyan-400" />}>
      <div className="grid gap-5">
        {modes.map((mode) => (
          <fieldset key={mode.key} className="grid gap-3">
            <legend className="mb-2 flex items-center gap-1.5 text-sm font-black text-slate-900 dark:text-white">{mode.icon}{mode.title}</legend>
            {mode.rows.map((row) => (
              <label key={row.label} className="grid gap-1.5">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-bold text-slate-600 dark:text-slate-300">
                  <span>{row.label}</span>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{row.count} active {row.count === 1 ? "student" : "students"}</span>
                </span>
                <select className="math-select" value={row.value} onChange={(event) => { row.set(event.target.value); setSaved(false); }}>
                  <option value="">Not Chosen</option>
                  {options.map((item) => <option key={item.feeItemId} value={item.feeItemId}>{item.name} · {item.display}</option>)}
                </select>
              </label>
            ))}
          </fieldset>
        ))}
        <label className="grid gap-1.5">
          <span className="flex items-center gap-1.5 text-sm font-black text-slate-900 dark:text-white"><CalendarDays size={15} className="text-amber-600 dark:text-amber-400" />New Fee From</span>
          <input type="date" className="math-input" value={cutoff} onChange={(event) => { setCutoff(event.target.value); setSaved(false); }} required />
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Students admitted on or after this date pay the new fee for good. Students admitted before it keep the existing fee. A student with no admission date follows the day they were added.
          </span>
        </label>
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
          Prices come from <Link href="/admin/payments/settings?tab=fees" className="font-black text-cyan-700 hover:underline dark:text-cyan-300">Fee Setup</Link>. A price change there is used by every draft not yet released.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="math-button-primary" disabled={!changed || !cutoff || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}Save Fees
          </button>
          {saved && !changed ? <span role="status" className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Saved.</span> : null}
        </div>
        {save.error ? <InlineError error={save.error} /> : null}
      </div>
    </Card>
  );
}

function AutoCard({ data }: { data: BillingSettings }) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => updateBillingSettings({ autoDraftsEnabled: enabled }),
    onSuccess: (next) => { queryClient.setQueryData(["admin", "payments", "billing", "settings"], next); queryClient.invalidateQueries({ queryKey: ["admin", "payments"] }); },
  });
  return (
    <Card title="Automatic Drafts" icon={<CalendarClock size={18} className="text-emerald-600 dark:text-emerald-400" />}>
      <div className="grid gap-4">
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
          <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-emerald-600" checked={data.autoDraftsEnabled} disabled={toggle.isPending} onChange={(event) => toggle.mutate(event.target.checked)} />
          <span className="min-w-0">
            <span className="block text-sm font-black text-slate-900 dark:text-white">Draft the monthly fee on the 1st of every month</span>
            <span className="block text-sm font-semibold text-slate-500 dark:text-slate-400">
              For every active student who has no invoice for the month. Drafts have no number, are not seen by students and send nothing until you release them.
            </span>
          </span>
        </label>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900/60">
            <dt className="font-bold text-slate-500 dark:text-slate-400">Next Drafts</dt>
            <dd className="mt-1 font-black text-slate-900 dark:text-white">{data.nextAutoLabel ? `1 ${data.nextAutoLabel}` : "Switched off"}</dd>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900/60">
            <dt className="font-bold text-slate-500 dark:text-slate-400">Last Drafted</dt>
            <dd className="mt-1 font-black text-slate-900 dark:text-white">{data.lastAutoLabel ? `${data.lastAutoLabel}` : "Not yet"}</dd>
            {data.lastAutoAt ? <dd className="text-xs font-semibold text-slate-500">{When(data.lastAutoAt)}</dd> : null}
          </div>
        </dl>
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
          Review and release them in <Link href="/admin/payments/invoices?tab=monthly" className="font-black text-cyan-700 hover:underline dark:text-cyan-300">Invoices › Monthly Billing</Link>. Invoice date is the day you release; due 10 days later.
        </p>
        {toggle.error ? <InlineError error={toggle.error} /> : null}
      </div>
    </Card>
  );
}

function StudentModes({ newRateFromLabel }: { newRateFromLabel: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "payments", "billing", "students"], queryFn: listBillingStudents });
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"ALL" | BillingMode>("ALL");
  const [group, setGroup] = useState<"ALL" | RateGroup>("ALL");
  // The fee group set by hand needs a reason (kept in the payments history).
  const [groupTarget, setGroupTarget] = useState<RateGroup | "AUTO" | null>(null);
  const [groupReason, setGroupReason] = useState("");
  const [level, setLevel] = useState("ALL");
  const [activeOnly, setActiveOnly] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<string | null>(null);
  const students = useMemo(() => query.data ?? [], [query.data]);
  const levels = useMemo(() => Array.from(new Set(students.map((row) => row.levelCode).filter(Boolean) as string[])).sort(), [students]);
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return students.filter((row) => (!activeOnly || row.isActive) && (mode === "ALL" || row.billingMode === mode) && (group === "ALL" || row.rateGroup === group) && (level === "ALL" || row.levelCode === level) && (!needle || `${row.studentName} ${row.studentCode}`.toLowerCase().includes(needle)));
  }, [students, search, mode, group, level, activeOnly]);
  useEffect(() => setResult(null), [search, mode, group, level, activeOnly]);
  const allShown = shown.length > 0 && shown.every((row) => selected.has(row.studentId));
  const apply = useMutation({
    mutationFn: (target: BillingMode) => setBillingModes({ studentIds: Array.from(selected), mode: target }),
    onSuccess: (outcome) => {
      setResult(`${outcome.studentsSelected} student${outcome.studentsSelected === 1 ? "" : "s"} set to ${outcome.modeLabel}${outcome.studentsChanged !== outcome.studentsSelected ? ` (${outcome.studentsChanged} changed)` : ""}.`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["admin", "payments", "billing"] });
    },
  });
  const applyGroup = useMutation({
    mutationFn: () => setBillingRateGroups({ studentIds: Array.from(selected), group: groupTarget ?? "AUTO", reason: groupReason.trim() }),
    onSuccess: (outcome) => {
      const target = outcome.group === "AUTO" ? "follow their admission date" : `pay the ${outcome.groupLabel.toLowerCase()} fee`;
      setResult(`${outcome.studentsSelected} student${outcome.studentsSelected === 1 ? "" : "s"} set to ${target}${outcome.studentsChanged !== outcome.studentsSelected ? ` (${outcome.studentsChanged} changed)` : ""}.`);
      setSelected(new Set());
      setGroupTarget(null);
      setGroupReason("");
      queryClient.invalidateQueries({ queryKey: ["admin", "payments", "billing"] });
    },
  });
  const busy = apply.isPending || applyGroup.isPending;
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <section className="math-card mt-6 p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-black text-slate-950 dark:text-white"><UsersRound size={18} className="text-violet-600 dark:text-violet-400" />Students&apos; Billing Mode</h2>
        <span className="text-sm font-bold text-slate-500 dark:text-slate-400">Everyone is India unless set to International. The fee group follows the admission date: the new fee from {newRateFromLabel}.</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <label className="relative sm:col-span-2 xl:col-span-1">
          <span className="sr-only">Search Students</span>
          <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="math-input pl-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or student ID" />
        </label>
        <select className="math-select" value={mode} onChange={(event) => setMode(event.target.value as "ALL" | BillingMode)} aria-label="Filter By Mode">
          <option value="ALL">Every Mode</option>
          <option value="INDIA">India Only</option>
          <option value="INTERNATIONAL">International Only</option>
          <option value="EXEMPT">No Monthly Fee Only</option>
        </select>
        <select className="math-select" value={group} onChange={(event) => setGroup(event.target.value as "ALL" | RateGroup)} aria-label="Filter By Fee Group">
          <option value="ALL">Every Fee Group</option>
          <option value="EXISTING">Existing Fee Only</option>
          <option value="NEW">New Fee Only</option>
        </select>
        <select className="math-select" value={level} onChange={(event) => setLevel(event.target.value)} aria-label="Filter By Level">
          <option value="ALL">All Levels</option>
          {levels.map((code) => <option key={code} value={code}>{code}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
          <input type="checkbox" className="h-4 w-4" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} />
          Active Students Only
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900/60">
        <span className="mr-auto text-sm font-black text-slate-700 dark:text-slate-200">{selected.size} selected</span>
        <button type="button" className="math-button-secondary" disabled={!selected.size || busy} onClick={() => apply.mutate("INDIA")}><IndianRupee size={16} />Set India</button>
        <button type="button" className="math-button-secondary" disabled={!selected.size || busy} onClick={() => apply.mutate("INTERNATIONAL")}><Globe2 size={16} />Set International</button>
        <button type="button" className="math-button-secondary" disabled={!selected.size || busy} onClick={() => apply.mutate("EXEMPT")} title="Never billed the monthly fee: test accounts, staff children, scholarships"><Ban size={16} />Set No Monthly Fee</button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900/60">
        <span className="mr-auto text-sm font-black text-slate-700 dark:text-slate-200">Fee group</span>
        <button type="button" className="math-button-secondary" disabled={!selected.size || busy} aria-pressed={groupTarget === "EXISTING"} onClick={() => { setGroupTarget("EXISTING"); applyGroup.reset(); }}><CheckCircle2 size={16} />Set Existing Fee</button>
        <button type="button" className="math-button-secondary" disabled={!selected.size || busy} aria-pressed={groupTarget === "NEW"} onClick={() => { setGroupTarget("NEW"); applyGroup.reset(); }}><Sparkles size={16} />Set New Fee</button>
        <button type="button" className="math-button-secondary" disabled={!selected.size || busy} aria-pressed={groupTarget === "AUTO"} onClick={() => { setGroupTarget("AUTO"); applyGroup.reset(); }} title="Undo a group set by hand: the admission date decides again"><CalendarDays size={16} />Follow Admission Date</button>
      </div>
      {groupTarget && selected.size ? (
        <form
          className="mt-3 grid gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-900/60 dark:bg-amber-950/30"
          onSubmit={(event) => { event.preventDefault(); if (groupReason.trim()) applyGroup.mutate(); }}
          data-rate-group-form
        >
          <label className="grid gap-1.5">
            <span className="text-sm font-black text-amber-950 dark:text-amber-100">
              {groupTarget === "AUTO"
                ? `Let the admission date decide the fee for ${selected.size} ${selected.size === 1 ? "student" : "students"}`
                : `Set ${selected.size} ${selected.size === 1 ? "student" : "students"} to the ${groupTarget === "NEW" ? "new" : "existing"} fee`}
              <span className="text-red-500"> *</span>
            </span>
            <input className="math-input" value={groupReason} onChange={(event) => setGroupReason(event.target.value)} maxLength={300} placeholder="Reason, for example: rejoined, admitted in October" autoFocus />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="math-button-primary" disabled={!groupReason.trim() || applyGroup.isPending}>
              {applyGroup.isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}Save Fee Group
            </button>
            <button type="button" className="math-button-secondary" disabled={applyGroup.isPending} onClick={() => { setGroupTarget(null); setGroupReason(""); }}>Cancel</button>
          </div>
          {applyGroup.error ? <InlineError error={applyGroup.error} /> : null}
        </form>
      ) : null}
      {result ? <div role="status" className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">{result}</div> : null}
      {apply.error ? <div className="mt-3"><InlineError error={apply.error} /></div> : null}

      {query.isLoading ? (
        <div className="mt-4"><PaymentsLoading label="Loading students…" /></div>
      ) : query.error ? (
        <div className="mt-4"><InlineError error={query.error} /></div>
      ) : (
        <div className="mt-4 max-h-[560px] overflow-auto rounded-2xl border border-slate-100 dark:border-slate-800">
          <table className="ad-cards w-full min-w-[720px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="w-10 px-3 py-2.5">
                  <input type="checkbox" className="h-4 w-4" checked={allShown} onChange={() => setSelected((current) => {
                    const next = new Set(current);
                    shown.forEach((row) => (allShown ? next.delete(row.studentId) : next.add(row.studentId)));
                    return next;
                  })} aria-label="Select All Shown" />
                </th>
                <th className="px-3 py-2.5">Student</th>
                <th className="px-3 py-2.5">Level</th>
                <th className="px-3 py-2.5">Centre</th>
                <th className="px-3 py-2.5">Mode</th>
                <th className="px-3 py-2.5">Fee Group</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.studentId} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/50" onClick={() => toggle(row.studentId)}>
                  <td className="ad-card-check px-3 py-2.5"><input type="checkbox" className="h-4 w-4" checked={selected.has(row.studentId)} onChange={() => toggle(row.studentId)} onClick={(event) => event.stopPropagation()} aria-label={`Select ${row.studentName}`} /></td>
                  <td className="ad-card-title px-3 py-2.5">
                    <span className="block font-black text-slate-900 dark:text-white">{row.studentName}{row.isActive ? "" : " (inactive)"}<DemoTag studentId={row.studentId} /></span>
                    <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">{row.studentCode}</span>
                  </td>
                  <td data-label="Level" className="px-3 py-2.5 font-semibold text-slate-600 dark:text-slate-300">{row.levelCode ?? "—"}</td>
                  <td data-label="Centre" className="px-3 py-2.5 font-semibold text-slate-600 dark:text-slate-300">{row.centreName ?? "—"}</td>
                  <td data-label="Mode" className="px-3 py-2.5"><ModePill mode={row.billingMode} /></td>
                  <td data-label="Fee Group" className="px-3 py-2.5">
                    <RateGroupPill group={row.rateGroup} source={row.rateGroupSource} />
                    <span className="mt-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {row.rateGroupSource === "SET_BY_ADMIN" ? "Set by an admin" : row.admissionDate ? `Admitted ${ShortDate(row.admissionDate)}` : "No admission date"}
                    </span>
                  </td>
                </tr>
              ))}
              {shown.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center font-semibold text-slate-500">No students match.</td></tr> : null}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">{BILLING_MODE_LABELS.INTERNATIONAL} was set first for students in an online international Annual Competition slot. Check and change as needed.</p>
    </section>
  );
}
