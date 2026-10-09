"use client";

// 2026-10-09 (Payments Phase 5): Payment Settings > Online Payments.
// The two switches (fees shown to students; payments taken online), what
// is still missing before online payments can work, and the webhook
// address to add in the Razorpay dashboard. The Razorpay keys themselves
// live only on the server (backend/.env) and are never shown here.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, CreditCard, Eye, KeyRound, Link2, Loader2, ShieldCheck, Webhook, XCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { InlineError, PaymentsDialog, PaymentsMetric } from "@/components/payments/PaymentsUi";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { getOnlineSettings, updateOnlineSettings, type OnlineSettings } from "@/lib/api/payments";

type SwitchKey = "studentFeesEnabled" | "onlinePaymentsEnabled";

function Switch({ on, disabled, label, onToggle, busy }: { on: boolean; disabled?: boolean; label: string; onToggle: () => void; busy?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled || busy}
      onClick={onToggle}
      className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-blue-900 ${
        on ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-700"
      }`}
    >
      <span className={`inline-grid h-6 w-6 place-items-center rounded-full bg-white shadow transition ${on ? "translate-x-7" : "translate-x-1"}`}>
        {busy ? <Loader2 size={13} className="animate-spin text-slate-500" /> : null}
      </span>
    </button>
  );
}

function Check({ ok, title, children }: { ok: boolean; title: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-950/60">
      {ok ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" /> : <XCircle size={20} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />}
      <div className="min-w-0">
        <p className="font-black text-slate-950 dark:text-white">{title}</p>
        <div className="mt-0.5 text-sm font-semibold text-slate-600 dark:text-slate-300">{children}</div>
      </div>
    </li>
  );
}

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <div className="flex min-w-0 items-stretch gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">{value}</code>
      <button
        type="button"
        className="math-role-action-button h-auto shrink-0 px-3 text-xs"
        aria-label={label}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function OnlineSettingsPanel() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "payments", "online-settings"], queryFn: getOnlineSettings, enabled: ready });
  const [confirming, setConfirming] = useState<{ key: SwitchKey; on: boolean } | null>(null);
  const mutation = useMutation({
    mutationFn: (change: { key: SwitchKey; on: boolean }) => updateOnlineSettings({ [change.key]: change.on }),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin", "payments", "online-settings"], data);
      queryClient.invalidateQueries({ queryKey: ["admin", "payments", "audit"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "payments", "online-orders"] });
      setConfirming(null);
    },
  });
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  if (!ready) return null;
  if (query.isLoading) return <LoadingState label="Loading online payment settings..." />;
  if (query.error || !query.data) return <ErrorState message="Online payment settings could not be loaded. Refresh the page to try again." />;
  const settings: OnlineSettings = query.data;
  const webhookUrl = `${origin}${settings.webhookPath}`;
  const canTurnOnline = settings.problems.length === 0;

  const ask = (key: SwitchKey, on: boolean) => {
    mutation.reset();
    // Switching off is immediate; switching on is confirmed first, because
    // every student (or every parent with a link) sees it at once.
    if (!on) mutation.mutate({ key, on });
    else setConfirming({ key, on });
  };

  return (
    <>
      <section className="math-hero math-slide-up">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="math-block-header"><CreditCard size={14} />Payment Settings</p>
            <h1 className="math-title">Online Payments</h1>
            <p className="math-subtitle">Fees for students in their login, and payments by Razorpay from the student login or a pay link sent to a parent.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:shrink-0">
            <PaymentsMetric label="Online" value={settings.onlinePaymentsLive ? "Live" : "Off"} icon={<CreditCard size={14} />} tone={settings.onlinePaymentsLive ? "emerald" : "slate"} />
            <PaymentsMetric label="Razorpay" value={settings.keyMode === "LIVE" ? "Live keys" : settings.keyMode === "TEST" ? "Test keys" : "No keys"} icon={<KeyRound size={14} />} tone={settings.keyMode === "LIVE" ? "emerald" : settings.keyMode === "TEST" ? "amber" : "slate"} />
            <PaymentsMetric label="Webhook" value={settings.webhookSecretSet ? "Ready" : "Not set"} icon={<Webhook size={14} />} tone={settings.webhookSecretSet ? "emerald" : "amber"} />
          </div>
        </div>
      </section>

      <section className="mt-6 math-card p-5 sm:p-6">
        <p className="math-block-header"><Eye size={14} />Switches</p>
        <h2 className="text-2xl font-black text-slate-950 dark:text-white">What students and parents see</h2>
        <div className="mt-5 grid gap-3">
          <div className="flex items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-white/80 p-5 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="min-w-0">
              <h3 className="text-lg font-black text-slate-950 dark:text-white">Show fees to students</h3>
              <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
                A Fees item in the student menu with their invoices, receipts and PDFs, a line on their dashboard while something is due, and a notification for each new invoice and payment.
              </p>
            </div>
            <Switch label="Show fees to students" on={settings.studentFeesEnabled} busy={mutation.isPending && mutation.variables?.key === "studentFeesEnabled"} onToggle={() => ask("studentFeesEnabled", !settings.studentFeesEnabled)} />
          </div>
          <div className="flex items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-white/80 p-5 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="min-w-0">
              <h3 className="text-lg font-black text-slate-950 dark:text-white">Take payments online</h3>
              <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
                Pay now on the student&apos;s Fees page, and pay links for parents (Collections &gt; Student Fees). Each payment gets its receipt straight away.
              </p>
              {!canTurnOnline && !settings.onlinePaymentsEnabled ? (
                <p className="mt-2 text-sm font-bold text-amber-700 dark:text-amber-300">Can be switched on once the checks below are all ticked.</p>
              ) : null}
              {settings.onlinePaymentsEnabled && !settings.onlinePaymentsLive ? (
                <p className="mt-2 text-sm font-bold text-rose-700 dark:text-rose-300">Switched on, but not working: {settings.problems.join(" ")}</p>
              ) : null}
            </div>
            <Switch
              label="Take payments online"
              on={settings.onlinePaymentsEnabled}
              disabled={!settings.onlinePaymentsEnabled && !canTurnOnline}
              busy={mutation.isPending && mutation.variables?.key === "onlinePaymentsEnabled"}
              onToggle={() => ask("onlinePaymentsEnabled", !settings.onlinePaymentsEnabled)}
            />
          </div>
        </div>
        {!confirming ? <div className="mt-3"><InlineError error={mutation.error} /></div> : null}
      </section>

      <section className="mt-6 math-card p-5 sm:p-6">
        <p className="math-block-header"><ShieldCheck size={14} />Checks</p>
        <h2 className="text-2xl font-black text-slate-950 dark:text-white">Ready for online payments?</h2>
        <ul className="mt-5 grid gap-3 lg:grid-cols-3">
          <Check ok={settings.keysReady} title="Razorpay keys on the server">
            {settings.keysReady ? (
              <>
                <span className="font-black tabular-nums">{settings.keyIdMasked}</span> ({settings.keyMode === "LIVE" ? "live: real money" : "test: no real money"})
              </>
            ) : (
              <>Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to the backend&apos;s .env on the server, then restart the backend.</>
            )}
          </Check>
          <Check ok={settings.webhookSecretSet} title="Webhook secret on the server">
            {settings.webhookSecretSet ? (
              <>Set. Payments are recorded even if a parent closes the page straight after paying.</>
            ) : (
              <>Add RAZORPAY_WEBHOOK_SECRET to the .env. It is needed so a payment is recorded even if the page is closed straight after paying.</>
            )}
          </Check>
          <Check ok={settings.receiptNumberingReady} title="Receipt numbering">
            {settings.receiptNumberingReady ? <>Set. Online payments get the next money receipt number.</> : <>Set the starting receipt number in Document Numbering first.</>}
          </Check>
        </ul>
      </section>

      <section className="mt-6 math-card p-5 sm:p-6">
        <p className="math-block-header"><Link2 size={14} />Razorpay webhook</p>
        <h2 className="text-2xl font-black text-slate-950 dark:text-white">This site&apos;s webhook</h2>
        <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-600 dark:text-slate-300">
          In the Razorpay dashboard, Settings &gt; Webhooks &gt; Add New Webhook. Keep the old platform&apos;s webhook as it is: this is a second one, with its own secret. Payments the old platform starts are ignored here.
        </p>
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <p className="mb-1.5 text-sm font-black text-slate-700 dark:text-slate-200">Webhook URL</p>
            <CopyField value={webhookUrl} label="Copy the webhook URL" />
          </div>
          <div className="min-w-0">
            <p className="mb-1.5 text-sm font-black text-slate-700 dark:text-slate-200">Active events to tick</p>
            <div className="flex flex-wrap gap-2">
              {settings.webhookEvents.map((event) => (
                <code key={event} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-black text-slate-700 dark:bg-slate-900 dark:text-slate-200">{event}</code>
              ))}
            </div>
          </div>
        </div>
      </section>

      <PaymentsDialog
        open={Boolean(confirming)}
        title={confirming?.key === "studentFeesEnabled" ? "Show fees to every student?" : "Take payments online?"}
        onClose={() => setConfirming(null)}
        footer={
          <>
            <button type="button" className="math-button-secondary" onClick={() => setConfirming(null)}>Cancel</button>
            <button type="button" className="math-button-primary" disabled={mutation.isPending} onClick={() => confirming && mutation.mutate(confirming)}>
              {mutation.isPending ? <Loader2 size={17} className="animate-spin" /> : null}Switch on
            </button>
          </>
        }
      >
        <div className="grid gap-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
          {confirming?.key === "studentFeesEnabled" ? (
            <p>Every student sees a Fees item in their menu straight away, with all their invoices and receipts. Check that invoices and payments are correct (for example after the history import) before switching this on.</p>
          ) : (
            <>
              <p>Students see Pay now on their Fees page, and pay links start working.</p>
              {settings.keyMode === "TEST" ? (
                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 font-bold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">The server has Razorpay test keys: no real money moves, and real cards and UPI do not work. Use this for checking only.</p>
              ) : (
                <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">Live keys: payments are real money into the Math Path Razorpay account.</p>
              )}
            </>
          )}
          <InlineError error={mutation.error} />
        </div>
      </PaymentsDialog>
    </>
  );
}
