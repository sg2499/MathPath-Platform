"use client";

// 2026-10-09 (Payments revamp R4): the follow-up dialogs, shared by the
// Follow-ups list, the student side panel and Dues:
//   * Log contact -- how (call, in person, message, other), a note, and an
//     optional promise-to-pay date. For one student or many at once.
//   * Reminder -- a student's reminder from the chosen template (Gentle,
//     Firm, Final): copy it, or send it in the app (under the student's bell).
//   * Remind in app for many -- each gets their own reminder; anyone
//     reminded in the last 24 hours is skipped.
// No WhatsApp: it comes with the official integration, built last.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CalendarCheck, Check, CheckCircle2, Copy, Loader2, MessageSquarePlus } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { InlineError, PaymentsDialog } from "@/components/payments/PaymentsUi";
import {
  CONTACT_CHANNELS,
  REMINDER_TEMPLATES,
  getReminderText,
  logFollowUpContact,
  remindInApp,
  type ContactChannel,
  type FollowUpState,
  type RemindResult,
  type ReminderTemplateKey,
} from "@/lib/api/payments";

import { FormatDate } from "@/lib/paymentsDates";

function Ago(days: number | null): string {
  if (days === null) return "";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function LastContactText({ state }: { state: FollowUpState }) {
  const last = state.lastContact;
  if (!last) return <span className="text-slate-500 dark:text-slate-400">Never contacted</span>;
  const how = last.kind === "REMINDER" ? `${last.templateTitle ?? ""} in-app reminder`.trim() : last.channelLabel ?? "Contacted";
  return (
    <span className="text-slate-600 dark:text-slate-300">
      {how} {Ago(state.daysSinceContact)}{last.byName ? ` · ${last.byName}` : ""}{last.kind === "CONTACT" && last.note ? `: “${last.note}”` : ""}
    </span>
  );
}

export function PromisePill({ state }: { state: FollowUpState }) {
  const promise = state.promise;
  if (!promise || promise.state === "KEPT") return null;
  const label = promise.state === "TODAY" ? "Promised for today" : promise.state === "MISSED" ? `Promise missed (${FormatDate(promise.date)})` : `Promised ${FormatDate(promise.date)}`;
  const tone = promise.state === "MISSED" ? "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200" : promise.state === "TODAY" ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" : "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200";
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-black ${tone}`}><CalendarCheck size={12} />{label}</span>;
}

export type FollowUpTarget = { studentId: string; studentName: string; suggestedTemplate?: ReminderTemplateKey };

type Open =
  | { kind: "log"; students: FollowUpTarget[] }
  | { kind: "reminder"; student: FollowUpTarget; inAppAvailable: boolean }
  | { kind: "bulk-remind"; students: FollowUpTarget[] };

type FollowUpContextValue = {
  logContact: (students: FollowUpTarget[]) => void;
  reminder: (student: FollowUpTarget, inAppAvailable?: boolean) => void;
  remindMany: (students: FollowUpTarget[]) => void;
};

const FollowUpContext = createContext<FollowUpContextValue | null>(null);

export function useFollowUp() {
  return useContext(FollowUpContext);
}

export async function CopyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const box = document.createElement("textarea");
    box.value = text;
    box.style.position = "fixed";
    box.style.opacity = "0";
    document.body.appendChild(box);
    box.select();
    let done = false;
    try {
      done = document.execCommand("copy");
    } catch {
      done = false;
    }
    box.remove();
    return done;
  }
}

function TodayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function AddDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function FollowUpProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null);
  const logContact = useCallback((students: FollowUpTarget[]) => setOpen({ kind: "log", students }), []);
  const reminder = useCallback((student: FollowUpTarget, inAppAvailable = true) => setOpen({ kind: "reminder", student, inAppAvailable }), []);
  const remindMany = useCallback((students: FollowUpTarget[]) => setOpen({ kind: "bulk-remind", students }), []);
  const value = useMemo(() => ({ logContact, reminder, remindMany }), [logContact, reminder, remindMany]);
  const close = () => setOpen(null);
  return (
    <FollowUpContext.Provider value={value}>
      {children}
      {open?.kind === "log" ? <LogContactDialog students={open.students} onClose={close} /> : null}
      {open?.kind === "reminder" ? <ReminderDialog student={open.student} inAppAvailable={open.inAppAvailable} onClose={close} onLog={() => setOpen({ kind: "log", students: [open.student] })} /> : null}
      {open?.kind === "bulk-remind" ? <BulkRemindDialog students={open.students} onClose={close} /> : null}
    </FollowUpContext.Provider>
  );
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "followups"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "home"] });
  };
}

function Names({ students }: { students: FollowUpTarget[] }) {
  const shown = students.slice(0, 4).map((row) => row.studentName).join(", ");
  return <>{students.length > 4 ? `${shown} and ${students.length - 4} more` : shown}</>;
}

function LogContactDialog({ students, onClose }: { students: FollowUpTarget[]; onClose: () => void }) {
  const refresh = useRefresh();
  const today = TodayInIndia();
  const [channel, setChannel] = useState<ContactChannel>("CALL");
  const [note, setNote] = useState("");
  const [promise, setPromise] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => logFollowUpContact({ studentIds: students.map((row) => row.studentId), channel, note: note.trim() || null, promiseDate: promise || null }),
    onSuccess: (result) => {
      refresh();
      setDone(`${result.channelLabel} logged for ${result.logged} student${result.logged === 1 ? "" : "s"}${result.promiseDate ? `, promised for ${new Date(result.promiseDate + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}.`);
    },
  });
  const many = students.length > 1;
  return (
    <PaymentsDialog
      open
      kicker={many ? `Log contact · ${students.length} students` : "Log contact"}
      title={many ? "Same entry for each" : students[0].studentName}
      onClose={() => { if (!save.isPending) onClose(); }}
      footer={done ? <button type="button" className="math-button-primary" onClick={onClose}>Done</button> : (
        <>
          <button type="button" className="math-button-secondary" disabled={save.isPending} onClick={onClose}>Cancel</button>
          <button type="submit" form="log-contact-form" className="math-button-primary" disabled={save.isPending}>{save.isPending ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}Log contact</button>
        </>
      )}
    >
      {done ? (
        <div role="status" className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"><CheckCircle2 size={18} className="shrink-0" />{done}</div>
      ) : (
        <form id="log-contact-form" className="grid grid-cols-[minmax(0,1fr)] gap-4" onSubmit={(event) => { event.preventDefault(); if (!save.isPending) save.mutate(); }}>
          {many ? <p className="text-sm font-semibold text-slate-600 dark:text-slate-300"><Names students={students} /></p> : null}
          <div className="grid gap-1.5">
            <span className="text-sm font-black text-slate-900 dark:text-white">How</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="How you contacted them">
              {CONTACT_CHANNELS.map((item) => (
                <button key={item.value} type="button" role="radio" aria-checked={channel === item.value} onClick={() => setChannel(item.value)}
                  className={`rounded-2xl border px-3 py-2.5 text-sm font-black transition ${channel === item.value ? "border-transparent bg-gradient-to-r from-slate-900 to-indigo-700 text-white dark:from-cyan-500 dark:to-indigo-500" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200"}`}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <label className="grid gap-1.5">
            <span className="text-sm font-black text-slate-900 dark:text-white">What happened <span className="font-semibold text-slate-500">(optional)</span></span>
            <textarea className="math-input min-h-[76px]" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="For example: no answer; spoke to the mother, will pay on Saturday" />
          </label>
          <div className="grid gap-1.5">
            <span className="text-sm font-black text-slate-900 dark:text-white">Promised to pay on <span className="font-semibold text-slate-500">(optional)</span></span>
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" className="math-input h-11 w-auto px-3" min={today} max={AddDays(today, 90)} value={promise} onChange={(event) => setPromise(event.target.value)} aria-label="Promise date" />
              {[["Today", 0], ["Tomorrow", 1], ["In 3 days", 3], ["In a week", 7]].map(([label, days]) => (
                <button key={label} type="button" className="math-role-action-button h-9 px-3 text-xs" onClick={() => setPromise(AddDays(today, days as number))}>{label}</button>
              ))}
              {promise ? <button type="button" className="text-xs font-black text-slate-500 hover:underline" onClick={() => setPromise("")}>Clear</button> : null}
            </div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">On that day they come back to the top under &quot;Promised for today&quot;; if nothing is paid, they show as a missed promise.</span>
          </div>
          {save.error ? <InlineError error={save.error} /> : null}
        </form>
      )}
    </PaymentsDialog>
  );
}

function TemplatePicker({ value, onChange, suggested }: { value: ReminderTemplateKey; onChange: (key: ReminderTemplateKey) => void; suggested?: ReminderTemplateKey }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Reminder">
      {REMINDER_TEMPLATES.map((item) => (
        <button key={item.value} type="button" role="radio" aria-checked={value === item.value} onClick={() => onChange(item.value)}
          className={`rounded-2xl border px-3 py-2 text-sm font-black transition ${value === item.value ? "border-transparent bg-gradient-to-r from-slate-900 to-indigo-700 text-white dark:from-cyan-500 dark:to-indigo-500" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200"}`}>
          {item.label}{suggested === item.value ? <span className="block text-[11px] font-bold opacity-80">suggested</span> : null}
        </button>
      ))}
    </div>
  );
}

function ReminderDialog({ student, inAppAvailable, onClose, onLog }: { student: FollowUpTarget; inAppAvailable: boolean; onClose: () => void; onLog: () => void }) {
  const refresh = useRefresh();
  const [template, setTemplate] = useState<ReminderTemplateKey>(student.suggestedTemplate ?? "GENTLE");
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  const [sent, setSent] = useState<RemindResult | null>(null);
  const text = useQuery({ queryKey: ["admin", "payments", "followups", "reminder", student.studentId, template], queryFn: () => getReminderText(student.studentId, template) });
  const send = useMutation({ mutationFn: () => remindInApp({ studentIds: [student.studentId], template }), onSuccess: (result) => { refresh(); setSent(result); } });
  const copy = async () => {
    if (!text.data) return;
    setCopied((await CopyText(text.data.text)) ? "yes" : "no");
  };
  return (
    <PaymentsDialog
      open
      kicker="Reminder"
      title={student.studentName}
      onClose={() => { if (!send.isPending) onClose(); }}
      footer={
        <div className="grid w-full grid-cols-2 gap-3">
          <button type="button" className="math-button-secondary justify-center" onClick={onLog}><MessageSquarePlus size={16} />Log contact</button>
          <button type="button" className="math-button-secondary justify-center" disabled={!text.data} onClick={copy}>{copied === "yes" ? <Check size={16} /> : <Copy size={16} />}{copied === "yes" ? "Copied" : "Copy"}</button>
          <button type="button" className="math-button-primary col-span-2 justify-center" disabled={!inAppAvailable || !text.data || send.isPending || Boolean(sent?.sent)} onClick={() => send.mutate()}>
            {send.isPending ? <Loader2 size={17} className="animate-spin" /> : <BellRing size={17} />}{sent?.sent ? "Sent in the app" : "Remind in app"}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <TemplatePicker value={template} onChange={(key) => { setTemplate(key); setCopied(null); }} suggested={student.suggestedTemplate} />
        {text.isLoading ? (
          <p className="flex items-center gap-2 py-6 text-sm font-semibold text-slate-500"><Loader2 size={16} className="animate-spin" />Filling in the reminder…</p>
        ) : text.error ? (
          <InlineError error={text.error} />
        ) : (
          <textarea readOnly className="math-input min-h-[220px] text-sm leading-relaxed" value={text.data?.text ?? ""} onFocus={(event) => event.currentTarget.select()} aria-label="Reminder message" />
        )}
        {copied === "no" ? <p className="text-sm font-bold text-amber-700 dark:text-amber-300">This browser blocked copying. Select the text above and copy it.</p> : null}
        {copied === "yes" ? <p role="status" className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Copied. After you send it, use Log contact to keep a record.</p> : null}
        {!inAppAvailable ? <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Remind in app needs &quot;Show fees to students&quot; switched on (Payment Settings › Online Payments).</p> : null}
        {sent ? (
          sent.sent ? (
            <div role="status" className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"><CheckCircle2 size={18} className="shrink-0" />{sent.templateTitle} reminder sent under {student.studentName}&apos;s bell, and logged.</div>
          ) : (
            <p role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">Not sent: {sent.skipped[0]?.reason}.</p>
          )
        ) : null}
        {send.error ? <InlineError error={send.error} /> : null}
      </div>
    </PaymentsDialog>
  );
}

function BulkRemindDialog({ students, onClose }: { students: FollowUpTarget[]; onClose: () => void }) {
  const refresh = useRefresh();
  const [template, setTemplate] = useState<ReminderTemplateKey>(students[0]?.suggestedTemplate ?? "GENTLE");
  const [result, setResult] = useState<RemindResult | null>(null);
  const sample = students[0];
  const preview = useQuery({ queryKey: ["admin", "payments", "followups", "reminder", sample?.studentId, template], queryFn: () => getReminderText(sample.studentId, template), enabled: Boolean(sample) });
  const send = useMutation({ mutationFn: () => remindInApp({ studentIds: students.map((row) => row.studentId), template }), onSuccess: (outcome) => { refresh(); setResult(outcome); } });
  return (
    <PaymentsDialog
      open
      kicker={`Remind in app · ${students.length} students`}
      title={result ? `${result.sent} reminder${result.sent === 1 ? "" : "s"} sent` : "Each gets their own reminder"}
      onClose={() => { if (!send.isPending) onClose(); }}
      footer={result ? <button type="button" className="math-button-primary" onClick={onClose}>Done</button> : (
        <>
          <button type="button" className="math-button-secondary" disabled={send.isPending} onClick={onClose}>Cancel</button>
          <button type="button" className="math-button-primary" disabled={send.isPending} onClick={() => send.mutate()}>{send.isPending ? <Loader2 size={17} className="animate-spin" /> : <BellRing size={17} />}Send {students.length}</button>
        </>
      )}
    >
      {result ? (
        <div className="grid gap-3">
          {result.sent ? <div role="status" className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"><CheckCircle2 size={18} className="shrink-0" />{result.templateTitle} reminder sent to {result.sent} student{result.sent === 1 ? "" : "s"}, each with their own amount, and logged.</div> : null}
          {result.skipped.length ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="font-black">Skipped ({result.skipped.length})</p>
              <ul className="mt-1 grid gap-0.5">{result.skipped.map((row) => <li key={row.studentId}>{row.studentName}: {row.reason}</li>)}</ul>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300"><Names students={students} /></p>
          <TemplatePicker value={template} onChange={setTemplate} />
          <div className="grid gap-1.5">
            <span className="text-sm font-black text-slate-900 dark:text-white">What {sample?.studentName ?? "a student"} will see</span>
            {preview.isLoading ? <p className="flex items-center gap-2 py-4 text-sm font-semibold text-slate-500"><Loader2 size={16} className="animate-spin" />Filling in…</p> : preview.error ? <InlineError error={preview.error} /> : (
              <textarea readOnly className="math-input min-h-[180px] text-sm leading-relaxed" value={preview.data?.text ?? ""} aria-label="Sample reminder" />
            )}
          </div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Sent under each student&apos;s bell in the app, with their own amount and invoices. Anyone reminded in the app in the last 24 hours is skipped.</p>
          {send.error ? <InlineError error={send.error} /> : null}
        </div>
      )}
    </PaymentsDialog>
  );
}
