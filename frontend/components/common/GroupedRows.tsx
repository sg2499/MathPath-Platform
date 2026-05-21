"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export function GroupHeader({
  open,
  onToggle,
  title,
  subtitle,
  stats,
  right,
}: {
  open: boolean;
  onToggle: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  stats?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-4 border-b px-4 py-4 text-left transition hover:bg-blue-50/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15 dark:hover:bg-cyan-400/5 dark:focus-visible:ring-cyan-300/15"
      style={{ background: "var(--surface)", borderColor: "var(--line)" }}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-1 flex h-9 w-9 items-center justify-center math-icon-shell">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        <div className="min-w-0">
          <div className="font-black text-slate-950 dark:text-white">{title}</div>
          {subtitle ? <div className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{subtitle}</div> : null}
          {stats ? <div className="mt-2 flex flex-wrap gap-2">{stats}</div> : null}
        </div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </button>
  );
}

export function SmallPill({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "red" | "blue" | "amber" | "purple" }) {
  const ToneClass =
    tone === "green" ? "math-tone-success" :
    tone === "red" ? "math-tone-danger" :
    tone === "blue" ? "math-tone-info" :
    tone === "amber" ? "math-tone-warning" :
    tone === "purple" ? "math-tone-purple" :
    "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200";
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${ToneClass}`}>{children}</span>;
}
