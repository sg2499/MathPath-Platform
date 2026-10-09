"use client";

// 2026-10-09 (Payments Phase 5): the parent pay link on a student's account
// (Collections > Student Fees). One live link per student; it works for 30
// days, shows what is due at the moment it is opened, and can be switched
// off. Sending it (WhatsApp) comes later; for now it is copied.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, Link2, Loader2, Plus, Settings, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { InlineError } from "@/components/payments/PaymentsUi";
import { createStudentPayLink, getStudentPayLink, revokePayLink } from "@/lib/api/payments";
import { FormatDate } from "@/lib/paymentsDates";

export function PayLinkCard({ studentId, studentName }: { studentId: string; studentName: string }) {
  const queryClient = useQueryClient();
  const key = ["admin", "payments", "pay-link", studentId];
  const query = useQuery({ queryKey: key, queryFn: () => getStudentPayLink(studentId) });
  const [copied, setCopied] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  useEffect(() => setConfirmOff(false), [studentId]);

  const done = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ["admin", "payments", "audit"] });
  };
  const create = useMutation({ mutationFn: () => createStudentPayLink(studentId), onSuccess: done });
  const revoke = useMutation({ mutationFn: (linkId: string) => revokePayLink(linkId), onSuccess: () => { setConfirmOff(false); done(); } });

  if (query.isLoading || !query.data) return null;
  const { link, onlinePaymentsLive } = query.data;
  const url = link ? `${origin}${link.path}` : "";

  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-200"><Link2 size={18} /></span>
          <div className="min-w-0">
            <p className="font-black text-slate-950 dark:text-white">Pay link for parents</p>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              {link
                ? `Opened ${link.openCount} time${link.openCount === 1 ? "" : "s"} · works until ${FormatDate(link.expiresAt?.slice(0, 10))}. Shows what is due when it is opened.`
                : onlinePaymentsLive
                  ? `A link ${studentName.split(" ")[0]}'s parent can open to see the dues and pay online, without logging in. Works for 30 days.`
                  : "Switch on online payments to create pay links."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {!link && onlinePaymentsLive ? (
            <button type="button" className="math-button-primary h-10 whitespace-nowrap" disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}Create pay link
            </button>
          ) : null}
          {!link && !onlinePaymentsLive ? (
            <Link href="/admin/payments/settings?tab=online" className="math-button-secondary h-10 whitespace-nowrap"><Settings size={16} />Online Payments settings</Link>
          ) : null}
          {link ? (
            <>
              <button
                type="button"
                className="math-button-primary h-10 whitespace-nowrap"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy link"}
              </button>
              {confirmOff ? (
                <>
                  <button type="button" className="math-role-action-button h-10 whitespace-nowrap px-3 text-xs !text-rose-700 dark:!text-rose-300" disabled={revoke.isPending} onClick={() => revoke.mutate(link.linkId)}>
                    {revoke.isPending ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}Yes, switch it off
                  </button>
                  <button type="button" className="math-role-action-button h-10 whitespace-nowrap px-3 text-xs" onClick={() => setConfirmOff(false)}>Keep it</button>
                </>
              ) : (
                <button type="button" className="math-role-action-button h-10 whitespace-nowrap px-3 text-xs" onClick={() => setConfirmOff(true)}><XCircle size={15} />Switch off</button>
              )}
            </>
          ) : null}
        </div>
      </div>
      {link ? (
        <code className="mt-3 block overflow-x-auto whitespace-nowrap rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 dark:bg-slate-900 dark:text-slate-200">{url}</code>
      ) : null}
      {confirmOff ? <p className="mt-2 text-xs font-bold text-rose-700 dark:text-rose-300">The link stops working at once. You can make a new one afterwards.</p> : null}
      {create.error || revoke.error ? <div className="mt-3"><InlineError error={create.error || revoke.error} /></div> : null}
    </div>
  );
}
