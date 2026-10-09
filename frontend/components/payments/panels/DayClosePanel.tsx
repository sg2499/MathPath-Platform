"use client";

// 2026-10-09 (Payments revamp R2): Collections > Day Close.
// What came in today (by method, centre and staff), the cash expected in hand
// (cash received minus cash spent on expenses), the cash actually counted,
// the difference with a note, and Close the day. A closed day can be
// reopened with a reason; the history is kept. If payments for a closed day
// change later, the day says so. The day-close PDF carries the count and the
// sign-off. The last 30 days are listed below.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarCheck, CheckCircle2, Download, History, Loader2, LockOpen, Scale, Wallet } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { HeroSearch } from "@/components/payments/CommandPalette";
import { ReplaceAddressKeepingTab } from "@/components/payments/PaymentsSection";
import { InlineError, PaymentsMetric } from "@/components/payments/PaymentsUi";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import {
  closeDay,
  downloadDayClosePdf,
  getDaySummary,
  getRecentDays,
  reopenDay,
  saveBlob,
  type DayCloseState,
  type DaySummary,
  type RecentDay,
} from "@/lib/api/payments";
import { FormatDate } from "@/lib/paymentsDates";
import { FormatRupees } from "@/lib/paymentsMoney";

function TodayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function LongDay(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function When(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
}

/** "" -> null; "1,100.5" -> 110050; invalid -> NaN. */
function ParsePaise(raw: string): number | null {
  const text = raw.replace(/[,₹\s]/g, "");
  if (!text) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return Number.NaN;
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
}

function DifferenceText(paise: number): string {
  if (!paise) return "Matches";
  return paise > 0 ? `${FormatRupees(paise)} more than expected` : `${FormatRupees(-paise)} short`;
}

export function StatePill({ state, changed }: { state: DayCloseState; changed?: boolean }) {
  if (state === "CLOSED" && changed) return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"><AlertTriangle size={12} />Changed after closing</span>;
  if (state === "CLOSED") return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"><CheckCircle2 size={12} />Closed</span>;
  if (state === "REOPENED") return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-violet-100 px-2.5 py-1 text-xs font-black text-violet-800 dark:bg-violet-950/40 dark:text-violet-200"><LockOpen size={12} />Reopened</span>;
  return <span className="inline-flex items-center whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">Open</span>;
}

function Card({ title, icon, children, action }: { title: string; icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="math-card flex h-full min-w-0 flex-col p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-black text-slate-950 dark:text-white">{icon}{title}</h2>
        {action}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

function Row({ label, value, strong = false, tone }: { label: ReactNode; value: ReactNode; strong?: boolean; tone?: string }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-2 ${strong ? "border-t border-slate-200 dark:border-slate-800" : ""}`}>
      <span className={`min-w-0 text-sm ${strong ? "font-black text-slate-900 dark:text-white" : "font-semibold text-slate-600 dark:text-slate-300"}`}>{label}</span>
      <span className={`shrink-0 text-right tabular-nums ${strong ? "text-lg font-black" : "text-sm font-black"} ${tone ?? "text-slate-900 dark:text-white"}`}>{value}</span>
    </div>
  );
}

export function DayClosePanel() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const params = useSearchParams();
  const today = TodayInIndia();
  const fromUrl = params.get("date");
  const [day, setDay] = useState(fromUrl && /^\d{4}-\d{2}-\d{2}$/.test(fromUrl) && fromUrl <= today ? fromUrl : today);
  useEffect(() => {
    if (fromUrl && /^\d{4}-\d{2}-\d{2}$/.test(fromUrl) && fromUrl <= today) setDay(fromUrl);
  }, [fromUrl, today]);
  const choose = (next: string) => {
    setDay(next);
    ReplaceAddressKeepingTab({ date: next === today ? null : next });
  };

  const summaryQuery = useQuery({ queryKey: ["admin", "payments", "day-close", day], queryFn: () => getDaySummary(day), enabled: ready });
  const recentQuery = useQuery({ queryKey: ["admin", "payments", "day-close", "recent"], queryFn: getRecentDays, enabled: ready });
  const data = summaryQuery.data;

  if (!ready) return null;
  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="math-block-header"><Wallet size={14} />Collections</p>
            <h1 className="math-title">Day Close</h1>
            <p className="math-subtitle">Count the cash, check it against what was recorded, and close the day.</p>
            <HeroSearch />
          </div>
          {data ? (
            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-3 xl:shrink-0">
              <PaymentsMetric label="Taken" value={<span className="text-lg sm:text-xl">{data.figures.total.display}</span>} icon={<Wallet size={14} />} tone="emerald" />
              <PaymentsMetric label="Cash expected" value={<span className="text-lg sm:text-xl">{data.figures.expectedCash.display}</span>} icon={<Scale size={14} />} tone="cyan" />
              <PaymentsMetric label="Day" value={<span className="text-lg sm:text-xl">{data.state === "CLOSED" ? (data.close?.changedAfterClose ? "Changed" : "Closed") : data.state === "REOPENED" ? "Reopened" : "Open"}</span>} icon={<CalendarCheck size={14} />} tone={data.state === "CLOSED" && !data.close?.changedAfterClose ? "emerald" : "amber"} />
            </div>
          ) : null}
        </div>
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="text-sm font-black text-slate-700 dark:text-slate-200">Day</span>
          <input type="date" className="math-input h-11 w-auto px-3" value={day} max={today} onChange={(event) => event.target.value && choose(event.target.value)} aria-label="Day to close" />
        </label>
        {day !== today ? <button type="button" className="math-button-secondary h-11" onClick={() => choose(today)}>Today</button> : null}
        <span className="text-sm font-bold text-slate-500 dark:text-slate-400">{LongDay(day)}</span>
      </div>

      {summaryQuery.isLoading ? (
        <div className="mt-6"><LoadingState label="Loading the day…" /></div>
      ) : summaryQuery.error || !data ? (
        <div className="mt-6"><ErrorState message="This day could not be loaded. Refresh the page to try again." /></div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <DayFiguresCard data={data} />
          <CountCard data={data} key={`${data.date}-${data.state}-${data.close?.closeCount ?? 0}`} />
        </div>
      )}

      <RecentDays rows={recentQuery.data?.days ?? []} loading={recentQuery.isLoading} selected={day} onPick={choose} />
    </>
  );
}

function DayFiguresCard({ data }: { data: DaySummary }) {
  const f = data.figures;
  return (
    <Card title="What came in" icon={<Wallet size={18} className="text-emerald-600 dark:text-emerald-400" />} action={<span className="text-sm font-bold text-slate-500 dark:text-slate-400">{f.paymentCount} payment{f.paymentCount === 1 ? "" : "s"}</span>}>
      {f.byMethod.length === 0 ? (
        <p className="grid min-h-[96px] place-items-center rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">No payments on this day.</p>
      ) : (
        <div>
          {f.byMethod.map((row) => <Row key={row.method} label={row.methodLabel} value={row.display} />)}
          <Row label="Total taken" value={f.total.display} strong />
        </div>
      )}
      <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-2 dark:bg-slate-900/60">
        <Row label="Cash received" value={f.cashReceived.display} />
        <Row label={`Less cash paid for expenses${f.expenseCount ? ` (${f.expenseCount})` : ""}`} value={f.cashSpent.paise ? `− ${f.cashSpent.display}` : f.cashSpent.display} />
        <Row label="Cash expected in hand" value={f.expectedCash.display} strong />
      </div>
      {f.byCentre.length > 1 || f.byStaff.length > 1 ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {f.byCentre.length > 1 ? (
            <div className="min-w-0">
              <h3 className="mb-1 text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">By centre</h3>
              {f.byCentre.map((row) => <Row key={row.name} label={row.name} value={<>{row.display}<span className="block text-xs font-semibold text-slate-500">cash {row.cash.display}</span></>} />)}
            </div>
          ) : null}
          {f.byStaff.length > 1 ? (
            <div className="min-w-0">
              <h3 className="mb-1 text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">By staff</h3>
              {f.byStaff.map((row) => <Row key={row.name} label={row.name} value={<>{row.display}<span className="block text-xs font-semibold text-slate-500">cash {row.cash.display}</span></>} />)}
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function CountCard({ data }: { data: DaySummary }) {
  const queryClient = useQueryClient();
  const close = data.close;
  const expected = data.figures.expectedCash.paise;
  const [counted, setCounted] = useState(expected > 0 ? "" : "0");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState("");

  const countedPaise = ParsePaise(counted);
  const valid = countedPaise !== null && !Number.isNaN(countedPaise);
  const difference = valid ? (countedPaise as number) - expected : 0;
  const problems: string[] = [];
  if (!valid) problems.push(counted.trim() ? "Enter the cash counted as a number, like 900 or 900.50." : "Enter the cash you counted.");
  if (valid && difference && !note.trim()) problems.push("The count does not match. Add a note saying why.");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "payments"] });
  const closeMutation = useMutation({ mutationFn: () => closeDay({ date: data.date, countedCashPaise: countedPaise as number, note: note.trim() || null }), onSuccess: refresh });
  const reopenMutation = useMutation({ mutationFn: () => reopenDay(data.date, reason.trim()), onSuccess: refresh });
  const pdf = useMutation({ mutationFn: () => downloadDayClosePdf(data.date), onSuccess: (blob) => saveBlob(blob, `MathPath-Day-Close-${data.date}.pdf`) });

  const pdfButton = (
    <button type="button" className="math-button-secondary" disabled={pdf.isPending} onClick={() => pdf.mutate()}>
      {pdf.isPending ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}Day close PDF
    </button>
  );

  if (data.state === "CLOSED" && close) {
    const tone = close.difference.paise === 0 ? "text-emerald-700 dark:text-emerald-300" : close.difference.paise < 0 ? "text-rose-700 dark:text-rose-300" : "text-amber-700 dark:text-amber-300";
    return (
      <Card title="Day closed" icon={<CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />} action={<StatePill state="CLOSED" changed={close.changedAfterClose} />}>
        {close.changedAfterClose && close.changes ? (
          <div role="status" className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            Payments or expenses for this day changed after it was closed. Total taken: {close.changes.totalAtClose.display} then, {close.changes.totalNow.display} now. Cash expected: {close.changes.cashAtClose.display} then, {close.changes.cashNow.display} now. Reopen the day to count and close it again.
          </div>
        ) : null}
        <Row label="Cash expected (at closing)" value={close.expectedCash.display} />
        <Row label="Cash counted" value={close.countedCash.display} />
        <Row label="Difference" value={DifferenceText(close.difference.paise)} strong tone={tone} />
        {close.note ? <p className="mt-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">Note: {close.note}</p> : null}
        <p className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Closed by {close.closedByName ?? "someone"} on {When(close.closedAt)}{close.closeCount > 1 ? ` (closed ${close.closeCount} times)` : ""}.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {pdfButton}
          {!reopening ? <button type="button" className="math-button-secondary" onClick={() => setReopening(true)}><LockOpen size={17} />Reopen day</button> : null}
        </div>
        {reopening ? (
          <form className="mt-4 grid gap-2 rounded-2xl border border-slate-200 p-4 dark:border-slate-800" onSubmit={(event) => { event.preventDefault(); if (reason.trim()) reopenMutation.mutate(); }}>
            <label className="grid gap-1.5">
              <span className="text-sm font-black text-slate-900 dark:text-white">Why reopen this day?</span>
              <input autoFocus className="math-input" value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} placeholder="For example: recount, a late cash payment" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="math-button-primary" disabled={!reason.trim() || reopenMutation.isPending}>{reopenMutation.isPending ? <Loader2 size={17} className="animate-spin" /> : <LockOpen size={17} />}Reopen</button>
              <button type="button" className="math-button-secondary" onClick={() => { setReopening(false); setReason(""); }}>Cancel</button>
            </div>
            {reopenMutation.error ? <InlineError error={reopenMutation.error} /> : null}
          </form>
        ) : null}
        {pdf.error ? <div className="mt-3"><InlineError error={pdf.error} /></div> : null}
        <DayHistory data={data} />
      </Card>
    );
  }

  const differenceTone = !valid ? "text-slate-400" : difference === 0 ? "text-emerald-700 dark:text-emerald-300" : difference < 0 ? "text-rose-700 dark:text-rose-300" : "text-amber-700 dark:text-amber-300";
  return (
    <Card title="Count the cash" icon={<Scale size={18} className="text-cyan-600 dark:text-cyan-400" />} action={<StatePill state={data.state} />}>
      {data.state === "REOPENED" && close ? (
        <p className="mb-4 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-900 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-100">
          Reopened by {close.reopenedByName ?? "someone"} on {When(close.reopenedAt)}: {close.reopenReason}. Count again and close it.
        </p>
      ) : null}
      <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); setTried(true); if (!problems.length && !closeMutation.isPending) closeMutation.mutate(); }}>
        <Row label="Cash expected in hand" value={data.figures.expectedCash.display} />
        <label className="grid gap-1.5">
          <span className="text-sm font-black text-slate-900 dark:text-white">Cash counted (₹)</span>
          <input autoFocus={data.isToday} className="math-input text-lg font-black tabular-nums" inputMode="decimal" value={counted} onChange={(event) => setCounted(event.target.value)} placeholder={data.figures.expectedCash.display.replace("₹", "")} aria-invalid={tried && !valid} />
        </label>
        <Row label="Difference" value={valid ? DifferenceText(difference) : "—"} strong tone={differenceTone} />
        <label className="grid gap-1.5">
          <span className="text-sm font-black text-slate-900 dark:text-white">Note {valid && difference ? <span className="text-rose-600 dark:text-rose-300">(needed: the count does not match)</span> : <span className="font-semibold text-slate-500">(optional)</span>}</span>
          <textarea className="math-input min-h-[76px]" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="For example: ₹50 given as change from the drawer" />
        </label>
        {tried && problems.length ? (
          <ul role="alert" className="grid gap-1 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
            {problems.map((problem) => <li key={problem}>{problem}</li>)}
          </ul>
        ) : null}
        {closeMutation.error ? <InlineError error={closeMutation.error} /> : null}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="math-button-primary" disabled={closeMutation.isPending}>
            {closeMutation.isPending ? <Loader2 size={17} className="animate-spin" /> : <CalendarCheck size={17} />}Close the day
          </button>
          {pdfButton}
        </div>
        {pdf.error ? <InlineError error={pdf.error} /> : null}
      </form>
      <DayHistory data={data} />
    </Card>
  );
}

function DayHistory({ data }: { data: DaySummary }) {
  if (!data.history.length) return null;
  return (
    <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400"><History size={13} />History</h3>
      <ul className="grid gap-1.5">
        {data.history.map((entry) => {
          const after = (entry.after ?? {}) as { countedCashPaise?: number; differencePaise?: number };
          return (
            <li key={entry.id} className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              <span className="font-black text-slate-900 dark:text-white">{entry.action === "CLOSE" ? "Closed" : "Reopened"}</span> by {entry.actorName ?? "someone"}, {When(entry.createdAt)}
              {entry.action === "CLOSE" && typeof after.countedCashPaise === "number" ? ` · counted ${FormatRupees(after.countedCashPaise)}${after.differencePaise ? ` (${DifferenceText(after.differencePaise ?? 0).toLowerCase()})` : ""}` : ""}
              {entry.reason ? ` · ${entry.reason}` : ""}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RecentDays({ rows, loading, selected, onPick }: { rows: RecentDay[]; loading: boolean; selected: string; onPick: (day: string) => void }) {
  return (
    <section className="math-card mt-6 p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-black text-slate-950 dark:text-white"><History size={18} className="text-slate-500" />Last 30 days</h2>
      </div>
      {loading ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-500"><Loader2 size={16} className="animate-spin" />Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm [&_th]:!bg-transparent">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2 pr-3">Day</th>
                <th className="py-2 pr-3 text-right">Payments</th>
                <th className="py-2 pr-3 text-right">Taken</th>
                <th className="py-2 pr-3 text-right">Cash expected</th>
                <th className="py-2 pr-3 text-right">Counted</th>
                <th className="py-2 pr-3 text-right">Difference</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.date} className={`cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-800/70 dark:hover:bg-slate-900/50 ${row.date === selected ? "bg-cyan-50/60 dark:bg-cyan-950/20" : ""}`} onClick={() => onPick(row.date)}>
                  <td className="py-2.5 pr-3 font-black text-slate-900 dark:text-white">
                    <button type="button" className="text-left hover:underline" onClick={(event) => { event.stopPropagation(); onPick(row.date); }}>{row.isToday ? "Today" : FormatDate(row.date)}</button>
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{row.paymentCount}</td>
                  <td className="py-2.5 pr-3 text-right font-black tabular-nums">{row.total.display}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{row.expectedCash.display}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{row.countedCash?.display ?? "—"}</td>
                  <td className={`py-2.5 pr-3 text-right font-bold tabular-nums ${!row.difference ? "text-slate-400" : row.difference.paise === 0 ? "text-emerald-700 dark:text-emerald-300" : row.difference.paise < 0 ? "text-rose-700 dark:text-rose-300" : "text-amber-700 dark:text-amber-300"}`}>
                    {row.difference ? (row.difference.paise === 0 ? "Matches" : row.difference.paise > 0 ? `+${row.difference.display}` : row.difference.display) : "—"}
                  </td>
                  <td className="py-2.5"><StatePill state={row.state} changed={row.changedAfterClose} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
