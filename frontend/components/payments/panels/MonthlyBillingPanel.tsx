"use client";

// 2026-10-09 (Payments revamp R3): Invoices > Monthly Billing ("Bill
// November"). The month's monthly-fee drafts, made on the 1st (or with
// Create drafts): 1 Who -- tick who is billed, drop anyone who should not be
// (with a reason); 2 Review -- totals, advance used, dates; 3 Release --
// the invoices are raised with numbers, the advance is applied, and students
// see them in Fees with a notification under the bell.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, FilePlus2, Loader2, RotateCcw, Send, UserX, Wallet } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { ErrorState } from "@/components/common/ErrorState";
import { HeroSearch } from "@/components/payments/CommandPalette";
import { ModePill } from "@/components/payments/panels/BillingSettingsPanel";
import { ReplaceAddressKeepingTab } from "@/components/payments/PaymentsSection";
import { InlineError, PaymentsDialog, PaymentsMetric, PaymentsLoading } from "@/components/payments/PaymentsUi";
import { StudentLink } from "@/components/payments/StudentPanel";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import {
  createBillingDrafts,
  dropBillingDraft,
  getBillingMonth,
  releaseBillingDrafts,
  restoreBillingDraft,
  type BillingDraft,
  type BillingMonth,
  type BillingReleaseResult,
} from "@/lib/api/payments";
import { FormatDate } from "@/lib/paymentsDates";
import { FormatRupees } from "@/lib/paymentsMoney";

function NewKey(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    // fall through
  }
  return `bill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function Steps({ step, compact = false }: { step: 1 | 2 | 3; compact?: boolean }) {
  const items = ["Who is billed", "Review", "Release"];
  const short = ["Who", "Review", "Release"];
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Steps">
      {items.map((label, index) => {
        const number = (index + 1) as 1 | 2 | 3;
        const state = number < step ? "done" : number === step ? "now" : "next";
        return (
          <li key={label} className={`flex min-w-0 items-center gap-1.5 rounded-2xl border px-2 py-2 text-xs font-black sm:gap-2 sm:px-3 sm:text-sm ${state === "now" ? "border-cyan-300 bg-cyan-50 text-cyan-900 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-100" : state === "done" ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400"}`} aria-current={state === "now" ? "step" : undefined}>
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${state === "now" ? "bg-cyan-600 text-white" : state === "done" ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{state === "done" ? "✓" : number}</span>
            <span className="min-w-0 truncate">{compact ? short[index] : <><span className="hidden sm:inline">{label}</span><span className="sm:hidden">{short[index]}</span></>}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Card({ title, icon, action, children }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="math-card mt-6 min-w-0 p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-black text-slate-950 dark:text-white">{icon}{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function MonthlyBillingPanel() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const params = useSearchParams();
  const fromUrl = params.get("period");
  const [period, setPeriod] = useState<string | undefined>(fromUrl && /^\d{4}-\d{2}$/.test(fromUrl) ? fromUrl : undefined);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "payments", "billing", "month", period ?? "current"], queryFn: () => getBillingMonth(period), enabled: ready });
  const data = query.data;
  const choose = (next: string) => {
    setPeriod(next);
    ReplaceAddressKeepingTab({ period: next });
  };
  const store = (month: BillingMonth) => {
    queryClient.setQueryData(["admin", "payments", "billing", "month", period ?? "current"], month);
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "home"] });
  };

  if (!ready) return null;
  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="math-block-header"><FilePlus2 size={14} />Invoices</p>
            <h1 className="math-title">{data ? `Bill ${data.periodLabel}` : "Monthly Billing"}</h1>
            <p className="math-subtitle">The month&apos;s fee drafts: check who is billed, drop anyone who should not be, then release. Nothing is sent before you release.</p>
            <HeroSearch />
          </div>
          {data ? (
            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-3 xl:shrink-0">
              <PaymentsMetric label="Waiting" value={data.counts.waiting} icon={<FilePlus2 size={14} />} tone={data.counts.waiting ? "amber" : "slate"} />
              <PaymentsMetric label="Invoiced" value={data.counts.invoiced} icon={<CheckCircle2 size={14} />} tone="emerald" />
              <PaymentsMetric label="Not billed" value={data.counts.notBilled} icon={<UserX size={14} />} tone={data.counts.notBilled ? "amber" : "slate"} />
            </div>
          ) : null}
        </div>
      </section>

      {query.isLoading ? (
        <div className="mt-6"><PaymentsLoading label="Loading the month…" variant="cards" /></div>
      ) : query.error || !data ? (
        <div className="mt-6"><ErrorState message="Monthly billing could not be loaded. Refresh the page to try again." /></div>
      ) : (
        <MonthBody data={data} onPeriod={choose} onMonth={store} />
      )}
    </>
  );
}

function MonthBody({ data, onPeriod, onMonth }: { data: BillingMonth; onPeriod: (period: string) => void; onMonth: (month: BillingMonth) => void }) {
  const waiting = useMemo(() => data.drafts.filter((row) => row.status === "DRAFT"), [data]);
  const releasable = useMemo(() => waiting.filter((row) => !row.issue), [waiting]);
  const released = data.drafts.filter((row) => row.status === "RELEASED");
  const dropped = data.drafts.filter((row) => row.status === "DROPPED");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(releasable.map((row) => row.draftId)));
  const [dropping, setDropping] = useState<BillingDraft | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [outcome, setOutcome] = useState<BillingReleaseResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // A new month (or new drafts): everything that can be released is ticked.
  useEffect(() => {
    setSelected(new Set(releasable.map((row) => row.draftId)));
  }, [data.period, releasable.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = releasable.filter((row) => selected.has(row.draftId));
  const total = chosen.reduce((sum, row) => sum + (row.fee?.paise ?? 0), 0);
  const advance = chosen.reduce((sum, row) => sum + row.advanceToApply.paise, 0);
  const blocked = data.problems.length > 0;

  const create = useMutation({
    mutationFn: (studentIds?: string[]) => createBillingDrafts(data.period, studentIds),
    onSuccess: (result) => { onMonth(result.month); setMessage(result.draftsCreated ? `${result.draftsCreated} draft${result.draftsCreated === 1 ? "" : "s"} added for ${data.periodLabel}.` : "Every active student already has a draft or an invoice for this month."); },
  });
  const restore = useMutation({ mutationFn: (draftId: string) => restoreBillingDraft(draftId), onSuccess: onMonth });
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const allTicked = releasable.length > 0 && releasable.every((row) => selected.has(row.draftId));

  return (
    <>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex items-center gap-2">
          <button type="button" className="math-button-secondary !h-11 !w-11 shrink-0 !justify-center !px-0" onClick={() => onPeriod(data.previousPeriod)} aria-label="Previous month"><ChevronLeft size={17} /></button>
          <span className="min-w-[10rem] flex-1 text-center text-base font-black text-slate-900 dark:text-white sm:flex-none">{data.periodLabel}</span>
          <button type="button" className="math-button-secondary !h-11 !w-11 shrink-0 !justify-center !px-0" disabled={!data.nextPeriod} onClick={() => data.nextPeriod && onPeriod(data.nextPeriod)} aria-label="Next month"><ChevronRight size={17} /></button>
        </div>
        <span className="text-sm font-semibold text-slate-500 dark:text-slate-400 sm:ml-1">
          {data.settings.autoDraftsEnabled ? `Drafts are made automatically on the 1st${data.settings.autoFromLabel ? `, from ${data.settings.autoFromLabel}` : ""}.` : "Automatic drafts are off."}{" "}
          <Link href="/admin/payments/settings?tab=billing" className="font-black text-cyan-700 hover:underline dark:text-cyan-300">Billing settings</Link>
        </span>
      </div>

      {data.problems.length ? (
        <ul role="alert" className="mt-4 grid gap-1 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          {data.problems.map((problem) => <li key={problem} className="flex items-start gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{problem}</li>)}
        </ul>
      ) : null}
      {message ? <div role="status" className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">{message}</div> : null}
      {create.error ? <div className="mt-4"><InlineError error={create.error} /></div> : null}

      <div className="mt-6"><Steps step={1} /></div>

      <Card
        title={`Waiting to be released (${waiting.length})`}
        icon={<FilePlus2 size={18} className="text-amber-600 dark:text-amber-400" />}
        action={releasable.length ? <button type="button" className="text-sm font-black text-cyan-700 hover:underline dark:text-cyan-300" onClick={() => setSelected(allTicked ? new Set() : new Set(releasable.map((row) => row.draftId)))}>{allTicked ? "Untick all" : "Tick all"}</button> : null}
      >
        {waiting.length === 0 ? (
          <p className="grid min-h-[96px] place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">
            {data.counts.notBilled ? `No drafts waiting. ${data.counts.notBilled} active student${data.counts.notBilled === 1 ? " has" : "s have"} no draft or invoice for ${data.periodLabel} yet (below).` : `Nothing waiting for ${data.periodLabel}.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm [&_th]:!bg-transparent">
              <thead className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="w-10 py-2 pr-3" />
                  <th className="py-2 pr-3">Student</th>
                  <th className="py-2 pr-3">Mode</th>
                  <th className="py-2 pr-3 text-right">Fee</th>
                  <th className="py-2 pr-3 text-right">From advance</th>
                  <th className="py-2 pr-3 text-right">To pay</th>
                  <th className="py-2 text-right" />
                </tr>
              </thead>
              <tbody>
                {waiting.map((row) => (
                  <tr key={row.draftId} className="border-b border-slate-100 align-top dark:border-slate-800/70">
                    <td className="py-3 pr-3">
                      <input type="checkbox" className="h-4 w-4 accent-cyan-600" disabled={Boolean(row.issue)} checked={!row.issue && selected.has(row.draftId)} onChange={() => toggle(row.draftId)} aria-label={`Bill ${row.studentName}`} />
                    </td>
                    <td className="py-3 pr-3">
                      <StudentLink studentId={row.studentId} className="block font-black text-slate-900 hover:underline dark:text-white">{row.studentName}</StudentLink>
                      <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">{[row.studentCode, row.levelCode, row.centreName].filter(Boolean).join(" · ")}</span>
                      {row.issue ? <span className="mt-1 flex items-start gap-1 text-xs font-bold text-amber-700 dark:text-amber-300"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{row.issue}</span> : null}
                    </td>
                    <td className="py-3 pr-3"><ModePill mode={row.billingMode} /></td>
                    <td className="py-3 pr-3 text-right font-black tabular-nums text-slate-900 dark:text-white">{row.fee?.display ?? "—"}<span className="block text-xs font-semibold text-slate-500">{row.fee?.name}</span></td>
                    <td className="py-3 pr-3 text-right tabular-nums text-violet-700 dark:text-violet-300">{row.advanceToApply.paise ? row.advanceToApply.display : "—"}</td>
                    <td className="py-3 pr-3 text-right font-black tabular-nums text-slate-900 dark:text-white">{row.fee ? row.dueAfterAdvance.display : "—"}</td>
                    <td className="py-3 text-right">
                      <button type="button" className="math-role-action-button h-9 px-3 text-xs" onClick={() => setDropping(row)}><UserX size={13} />Don&apos;t bill</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {waiting.length ? (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900/60 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {chosen.length} of {waiting.length} ticked · <span className="tabular-nums">{FormatRupees(total)}</span>
              {advance ? <span className="text-violet-700 dark:text-violet-300"> · {FormatRupees(advance)} from advance</span> : null}
            </p>
            <button type="button" className="math-button-primary" disabled={!chosen.length || blocked} onClick={() => setReviewing(true)}>
              <Send size={17} />Review and release {chosen.length || ""}
            </button>
          </div>
        ) : null}
      </Card>

      <Card
        title={`Not billed yet (${data.notBilled.length})`}
        icon={<UserX size={18} className="text-rose-600 dark:text-rose-400" />}
        action={data.notBilled.length ? (
          <button type="button" className="math-button-secondary" disabled={create.isPending} onClick={() => create.mutate(undefined)}>
            {create.isPending ? <Loader2 size={16} className="animate-spin" /> : <CalendarPlus size={16} />}Add drafts for all {data.notBilled.length}
          </button>
        ) : null}
      >
        {data.notBilled.length === 0 ? (
          <p className="grid min-h-[72px] place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">Every active student has a draft or an invoice for {data.periodLabel}.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {data.notBilled.map((row) => (
              <li key={row.studentId} className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                <span className="min-w-0 flex-1">
                  <StudentLink studentId={row.studentId} className="block truncate font-black text-slate-900 hover:underline dark:text-white">{row.studentName}</StudentLink>
                  <span className="block truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{row.studentCode} · {row.billingModeLabel} · {row.fee?.display ?? "no fee chosen"}</span>
                </span>
                <button type="button" className="math-role-action-button h-9 shrink-0 px-3 text-xs" disabled={create.isPending} onClick={() => create.mutate([row.studentId])}><CalendarPlus size={13} />Add</button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {released.length || dropped.length ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="math-card flex h-full min-w-0 flex-col p-5 sm:p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-950 dark:text-white"><CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />Released ({released.length})</h2>
            {released.length ? (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {released.map((row) => (
                  <li key={row.draftId} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <StudentLink studentId={row.studentId} className="block truncate font-black text-slate-900 hover:underline dark:text-white">{row.studentName}</StudentLink>
                      <span className="block truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{row.releasedInvoiceNumber}{row.releasedAt ? ` · ${FormatDate(row.releasedAt.slice(0, 10))}` : ""}</span>
                    </span>
                    {row.releasedInvoiceId ? <Link href={`/admin/payments/invoices?tab=all&search=${encodeURIComponent(row.releasedInvoiceNumber ?? "")}&open=${encodeURIComponent(row.releasedInvoiceId)}`} className="text-sm font-black text-cyan-700 hover:underline dark:text-cyan-300">Invoice</Link> : null}
                  </li>
                ))}
              </ul>
            ) : <p className="grid min-h-[72px] flex-1 place-items-center rounded-2xl border border-dashed border-slate-200 text-sm font-semibold text-slate-500 dark:border-slate-800">None yet.</p>}
          </section>
          <section className="math-card flex h-full min-w-0 flex-col p-5 sm:p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-950 dark:text-white"><UserX size={18} className="text-slate-500" />Not billed this month ({dropped.length})</h2>
            {dropped.length ? (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {dropped.map((row) => (
                  <li key={row.draftId} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <StudentLink studentId={row.studentId} className="block truncate font-black text-slate-900 hover:underline dark:text-white">{row.studentName}</StudentLink>
                      <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">{row.dropReason}{row.droppedByName ? ` · ${row.droppedByName}` : ""}</span>
                    </span>
                    <button type="button" className="math-role-action-button h-9 shrink-0 px-3 text-xs" disabled={restore.isPending} onClick={() => restore.mutate(row.draftId)}><RotateCcw size={13} />Put back</button>
                  </li>
                ))}
              </ul>
            ) : <p className="grid min-h-[72px] flex-1 place-items-center rounded-2xl border border-dashed border-slate-200 text-sm font-semibold text-slate-500 dark:border-slate-800">Nobody dropped.</p>}
            {restore.error ? <div className="mt-3"><InlineError error={restore.error} /></div> : null}
          </section>
        </div>
      ) : null}

      {dropping ? <DropDialog row={dropping} periodLabel={data.periodLabel} onClose={() => setDropping(null)} onDone={(month) => { onMonth(month); setDropping(null); }} /> : null}
      {reviewing ? (
        <ReleaseDialog
          data={data}
          chosen={chosen}
          total={total}
          advance={advance}
          onClose={() => setReviewing(false)}
          onDone={(result) => { onMonth(result.month); setOutcome(result); setReviewing(false); }}
        />
      ) : null}
      {outcome ? <ReleasedDialog result={outcome} periodLabel={data.periodLabel} onClose={() => setOutcome(null)} /> : null}
    </>
  );
}

function DropDialog({ row, periodLabel, onClose, onDone }: { row: BillingDraft; periodLabel: string; onClose: () => void; onDone: (month: BillingMonth) => void }) {
  const [reason, setReason] = useState("");
  const drop = useMutation({ mutationFn: () => dropBillingDraft(row.draftId, reason.trim()), onSuccess: onDone });
  return (
    <PaymentsDialog
      open
      kicker={`Don't bill for ${periodLabel}`}
      title={row.studentName}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="math-button-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="drop-draft-form" className="math-button-primary" disabled={!reason.trim() || drop.isPending}>{drop.isPending ? <Loader2 size={17} className="animate-spin" /> : <UserX size={17} />}Don&apos;t bill</button>
        </>
      }
    >
      <form id="drop-draft-form" className="grid gap-3" onSubmit={(event) => { event.preventDefault(); if (reason.trim()) drop.mutate(); }}>
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No invoice is raised for {row.studentName} for {periodLabel}. You can put the draft back later.</p>
        <label className="grid gap-1.5">
          <span className="text-sm font-black text-slate-900 dark:text-white">Reason</span>
          <input autoFocus className="math-input" maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: left in September, on a break this month" />
        </label>
        {drop.error ? <InlineError error={drop.error} /> : null}
      </form>
    </PaymentsDialog>
  );
}

function ReleaseDialog({ data, chosen, total, advance, onClose, onDone }: { data: BillingMonth; chosen: BillingDraft[]; total: number; advance: number; onClose: () => void; onDone: (result: BillingReleaseResult) => void }) {
  const [key] = useState(NewKey);
  const release = useMutation({ mutationFn: () => releaseBillingDrafts(data.period, { draftIds: chosen.map((row) => row.draftId), idempotencyKey: key }), onSuccess: onDone });
  const byMode = chosen.reduce<Record<string, { count: number; fee: string }>>((acc, row) => {
    const label = row.billingModeLabel;
    acc[label] = { count: (acc[label]?.count ?? 0) + 1, fee: row.fee?.display ?? "" };
    return acc;
  }, {});
  return (
    <PaymentsDialog
      open
      kicker={`Bill ${data.periodLabel}`}
      title={`Release ${chosen.length} invoice${chosen.length === 1 ? "" : "s"}?`}
      onClose={() => { if (!release.isPending) onClose(); }}
      footer={
        <>
          <button type="button" className="math-button-secondary" disabled={release.isPending} onClick={onClose}>Back</button>
          <button type="button" className="math-button-primary" disabled={release.isPending} onClick={() => release.mutate()}>
            {release.isPending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}Release {chosen.length}
          </button>
        </>
      }
    >
      <div className="grid gap-4">
        <Steps step={2} compact />
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {[
            ["Invoices", String(chosen.length)],
            ["Total billed", FormatRupees(total)],
            ["Invoice date", FormatDate(data.invoiceDate)],
            ["Due date", FormatDate(data.dueDate)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
              <dt className="font-bold text-slate-500 dark:text-slate-400">{label}</dt>
              <dd className="mt-1 text-lg font-black tabular-nums text-slate-900 dark:text-white">{value}</dd>
            </div>
          ))}
        </dl>
        <ul className="grid gap-1.5 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
          {Object.entries(byMode).map(([mode, info]) => <li key={mode}>{info.count} {mode} student{info.count === 1 ? "" : "s"} at {info.fee}</li>)}
          {advance ? <li className="text-violet-800 dark:text-violet-200"><Wallet size={14} className="mr-1 inline" />{FormatRupees(advance)} of students&apos; advance is used on these invoices</li> : null}
          <li>Each invoice gets its number now. Students see it in Fees, with a notification under the bell (while the Fees tab is on).</li>
        </ul>
        {release.error ? <InlineError error={release.error} /> : null}
      </div>
    </PaymentsDialog>
  );
}

function ReleasedDialog({ result, periodLabel, onClose }: { result: BillingReleaseResult; periodLabel: string; onClose: () => void }) {
  const batch = result.batch;
  return (
    <PaymentsDialog open kicker={`${periodLabel} released`} title={result.released ? `${result.released} invoice${result.released === 1 ? "" : "s"} raised` : "Nothing new to raise"} onClose={onClose} footer={<button type="button" className="math-button-primary" onClick={onClose}>Done</button>}>
      <div className="grid gap-4">
        {result.released && batch ? (
          <div className="flex items-center gap-4 rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white"><CheckCircle2 size={26} /></span>
            <div className="min-w-0">
              <p className="text-lg font-black text-emerald-900 dark:text-emerald-100">{batch.firstNumber === batch.lastNumber ? batch.firstNumber : `${batch.firstNumber} to ${batch.lastNumber}`}</p>
              <p className="text-sm font-semibold text-emerald-800/90 dark:text-emerald-200/90">{batch.totalDisplay} billed{batch.advanceAppliedPaise ? ` · ${batch.advanceAppliedDisplay} from advance` : ""}</p>
            </div>
          </div>
        ) : null}
        {result.notReleased.length ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="font-black">Not released ({result.notReleased.length})</p>
            <ul className="mt-1 grid gap-0.5">{result.notReleased.map((row) => <li key={`${row.studentName}-${row.reason}`}>{row.studentName}: {row.reason}</li>)}</ul>
          </div>
        ) : null}
        <Link href="/admin/payments/invoices?tab=all" onClick={onClose} className="math-button-secondary justify-center">See all invoices</Link>
      </div>
    </PaymentsDialog>
  );
}
