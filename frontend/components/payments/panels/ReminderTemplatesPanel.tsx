"use client";

// 2026-10-09 (Payments revamp R4): Payment Settings > Reminders. The three
// reminder messages (Gentle, Firm, Final) in your own words. {placeholders}
// are filled for each student when a reminder is copied or sent in the app.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CheckCircle2, Loader2, RotateCcw, Settings2 } from "lucide-react";
import { useRef, useState } from "react";

import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { HeroSearch } from "@/components/payments/CommandPalette";
import { InlineError } from "@/components/payments/PaymentsUi";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { getReminderTemplates, resetReminderTemplate, updateReminderTemplate, type ReminderTemplateKey, type ReminderTemplates } from "@/lib/api/payments";

const WHEN: Record<ReminderTemplateKey, string> = {
  GENTLE: "Suggested up to 30 days overdue.",
  FIRM: "Suggested for 31–60 days overdue.",
  FINAL: "Suggested after 60 days overdue.",
};

export function ReminderTemplatesPanel() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const query = useQuery({ queryKey: ["admin", "payments", "followups", "templates"], queryFn: getReminderTemplates, enabled: ready });
  if (!ready) return null;
  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="relative z-10 min-w-0">
          <p className="math-block-header"><Settings2 size={14} />Payment Settings</p>
          <h1 className="math-title">Reminders</h1>
          <p className="math-subtitle">The three reminder messages, in your words. Each is filled in for the student when you copy it or send it in the app.</p>
          <HeroSearch />
        </div>
      </section>
      {query.isLoading ? (
        <div className="mt-6"><LoadingState label="Loading reminders…" /></div>
      ) : query.error || !query.data ? (
        <div className="mt-6"><ErrorState message="Reminders could not be loaded. Refresh the page to try again." /></div>
      ) : (
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          {query.data.templates.map((template) => <TemplateCard key={template.key} data={query.data} templateKey={template.key} />)}
        </div>
      )}
    </>
  );
}

function TemplateCard({ data, templateKey }: { data: ReminderTemplates; templateKey: ReminderTemplateKey }) {
  const queryClient = useQueryClient();
  const template = data.templates.find((row) => row.key === templateKey)!;
  const [body, setBody] = useState(template.body);
  const [saved, setSaved] = useState(false);
  const box = useRef<HTMLTextAreaElement | null>(null);
  const store = (next: ReminderTemplates) => {
    queryClient.setQueryData(["admin", "payments", "followups", "templates"], next);
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "followups", "reminder"] });
    setBody(next.templates.find((row) => row.key === templateKey)?.body ?? body);
    setSaved(true);
  };
  const save = useMutation({ mutationFn: () => updateReminderTemplate(templateKey, body), onSuccess: store });
  const reset = useMutation({ mutationFn: () => resetReminderTemplate(templateKey), onSuccess: store });
  const insert = (key: string) => {
    const el = box.current;
    const token = `{${key}}`;
    if (!el) return setBody((current) => current + token);
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    setSaved(false);
    window.setTimeout(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); }, 0);
  };
  const changed = body !== template.body;
  return (
    <section className="math-card flex h-full min-w-0 flex-col p-5 sm:p-6">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-black text-slate-950 dark:text-white"><BellRing size={18} className={templateKey === "GENTLE" ? "text-sky-600" : templateKey === "FIRM" ? "text-amber-600" : "text-rose-600"} />{template.title}</h2>
        {template.isDefault ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">Default wording</span> : <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-xs font-black text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200">Your wording</span>}
      </div>
      <p className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">{WHEN[templateKey]}</p>
      <textarea ref={box} className="math-input min-h-[260px] flex-1 text-sm leading-relaxed" maxLength={1500} value={body} onChange={(event) => { setBody(event.target.value); setSaved(false); }} aria-label={`${template.title} reminder`} />
      <div className="mt-3">
        <p className="mb-1.5 text-xs font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Insert</p>
        <div className="flex flex-wrap gap-1.5">
          {data.placeholders.map((item) => (
            <button key={item.key} type="button" title={item.label} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-mono text-[11px] font-bold text-slate-700 hover:border-cyan-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" onClick={() => insert(item.key)}>
              {`{${item.key}}`}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className="math-button-primary" disabled={!changed || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}Save</button>
        {!template.isDefault ? <button type="button" className="math-button-secondary" disabled={reset.isPending} onClick={() => reset.mutate()}><RotateCcw size={16} />Default wording</button> : null}
        {saved && !changed ? <span role="status" className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Saved.</span> : null}
      </div>
      {save.error ? <div className="mt-3"><InlineError error={save.error} /></div> : null}
      {reset.error ? <div className="mt-3"><InlineError error={reset.error} /></div> : null}
    </section>
  );
}
