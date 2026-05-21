"use client";

import { BellRing, ExternalLink, Target, X } from "lucide-react";
import type { ReactNode } from "react";

type NotificationTargetBannerProps = {
  title: string;
  description: string;
  label?: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  icon?: ReactNode;
  tone?: "blue" | "teal" | "purple" | "amber" | "green" | "slate";
  className?: string;
};

const ToneClasses = {
  blue: "border-blue-200/80 bg-blue-50/82 text-blue-700 shadow-[0_12px_36px_rgba(37,99,235,0.10)] dark:border-blue-400/25 dark:bg-blue-400/10 dark:text-blue-200",
  teal: "border-teal-200/80 bg-teal-50/82 text-teal-700 shadow-[0_12px_36px_rgba(13,148,136,0.10)] dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-200",
  purple:
    "border-violet-200/80 bg-violet-50/82 text-violet-700 shadow-[0_12px_36px_rgba(124,58,237,0.10)] dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-200",
  amber:
    "border-amber-200/80 bg-amber-50/82 text-amber-700 shadow-[0_12px_36px_rgba(217,119,6,0.10)] dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200",
  green:
    "border-emerald-200/80 bg-emerald-50/82 text-emerald-700 shadow-[0_12px_36px_rgba(5,150,105,0.10)] dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-200",
  slate:
    "border-slate-200/80 bg-white/86 text-slate-700 shadow-[0_12px_36px_rgba(15,23,42,0.08)] dark:border-slate-700/70 dark:bg-slate-950/72 dark:text-slate-200",
};

export function NotificationTargetBanner({
  title,
  description,
  label = "Notification",
  actionLabel,
  onAction,
  onDismiss,
  icon,
  tone = "blue",
  className = "",
}: NotificationTargetBannerProps) {
  return (
    <section
      className={`math-notification-target overflow-hidden rounded-[26px] border p-[1px] backdrop-blur-xl ${ToneClasses[tone]} ${className}`}
    >
      <div className="flex flex-col gap-4 rounded-[25px] bg-white/72 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:bg-slate-950/56">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/86 shadow-sm ring-1 ring-white/80 dark:bg-slate-900/80 dark:ring-slate-700/70">
            {icon || <BellRing size={18} />}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] opacity-80">
              {label}
            </p>
            <h3 className="mt-1 text-base font-black leading-tight text-slate-950 dark:text-white sm:text-lg">
              {title}
            </h3>
            <p className="mt-1 text-sm font-bold leading-5 text-slate-600 dark:text-slate-300">
              {description}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:justify-end">
          {actionLabel && onAction ? (
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-xs font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              onClick={onAction}
            >
              <Target size={15} />
              {actionLabel}
              <ExternalLink size={14} />
            </button>
          ) : null}
          {onDismiss ? (
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/82 text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900 dark:bg-slate-900/80 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
              onClick={onDismiss}
              aria-label="Dismiss notification target banner"
              title="Dismiss notification target banner"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
