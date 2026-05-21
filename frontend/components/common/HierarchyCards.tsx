"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronRight, Maximize2, Minimize2 } from "lucide-react";

export function StatChip({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "blue" | "green" | "red" | "amber" | "purple";
}) {
  const cls =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "red"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : tone === "blue"
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : tone === "amber"
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : tone === "purple"
              ? "border-violet-200 bg-violet-50 text-violet-700"
              : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <span className={`math-chip-motion inline-flex items-center rounded-full border px-3 py-1 text-xs font-black ${cls}`}>
      {children}
    </span>
  );
}

export function HierarchyShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`math-hierarchy-shell space-y-5 ${className}`}>{children}</div>;
}



export function BranchControls({
  onExpand,
  onCollapse,
}: {
  onExpand: () => void;
  onCollapse: () => void;
}) {
  return (
    <div className="flex items-center gap-2" aria-label="Branch controls">
      <button
        type="button"
        title="Expand next branch"
        aria-label="Expand next branch"
        className="math-branch-button inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-blue-700 shadow-sm transition hover:bg-blue-100 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200"
        onClick={(event) => {
          event.stopPropagation();
          onExpand();
        }}
      >
        <ChevronDown size={16} strokeWidth={2.6} />
      </button>
      <button
        type="button"
        title="Collapse next branch"
        aria-label="Collapse next branch"
        className="math-branch-button inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
        onClick={(event) => {
          event.stopPropagation();
          onCollapse();
        }}
      >
        <ChevronUp size={16} strokeWidth={2.6} />
      </button>
    </div>
  );
}

export function TreeControls({
  onExpandBranch,
  onCollapseBranch,
  onExpandTree,
  onCollapseTree,
  branchLabel = "branch",
  treeLabel = "record",
}: {
  onExpandBranch: () => void;
  onCollapseBranch: () => void;
  onExpandTree: () => void;
  onCollapseTree: () => void;
  branchLabel?: string;
  treeLabel?: string;
}) {
  return (
    <div className="math-tree-controls flex items-center gap-2 rounded-[22px] border border-slate-100 bg-white/65 p-1 shadow-sm dark:border-slate-800 dark:bg-slate-950/70" aria-label="Tree controls">
      <button
        type="button"
        title={`Expand ${branchLabel}`}
        aria-label={`Expand ${branchLabel}`}
        className="math-branch-button inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-blue-700 transition hover:bg-blue-100 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200"
        onClick={(event) => {
          event.stopPropagation();
          onExpandBranch();
        }}
      >
        <ChevronDown size={16} strokeWidth={2.6} />
      </button>
      <button
        type="button"
        title={`Collapse ${branchLabel}`}
        aria-label={`Collapse ${branchLabel}`}
        className="math-branch-button inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
        onClick={(event) => {
          event.stopPropagation();
          onCollapseBranch();
        }}
      >
        <ChevronUp size={16} strokeWidth={2.6} />
      </button>

      <span className="mx-1 h-7 w-px bg-slate-200 dark:bg-slate-800" aria-hidden="true" />

      <button
        type="button"
        title={`Expand full ${treeLabel}`}
        aria-label={`Expand full ${treeLabel}`}
        className="math-branch-button inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-cyan-200 bg-cyan-50 text-cyan-700 transition hover:bg-cyan-100 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-cyan-300 dark:border-cyan-900/60 dark:bg-cyan-950/40 dark:text-cyan-200"
        onClick={(event) => {
          event.stopPropagation();
          onExpandTree();
        }}
      >
        <Maximize2 size={15} strokeWidth={2.4} />
      </button>
      <button
        type="button"
        title={`Collapse full ${treeLabel}`}
        aria-label={`Collapse full ${treeLabel}`}
        className="math-branch-button inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-rose-300 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
        onClick={(event) => {
          event.stopPropagation();
          onCollapseTree();
        }}
      >
        <Minimize2 size={15} strokeWidth={2.4} />
      </button>
    </div>
  );
}

export function ExpandCard({
  open,
  onToggle,
  title,
  subtitle,
  meta,
  children,
  defaultOpenBorder = true,
  actions,
}: {
  open: boolean;
  onToggle: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  defaultOpenBorder?: boolean;
  actions?: ReactNode;
}) {
  return (
    <article className={`math-expand-card ${open ? "math-expand-card-open" : ""} overflow-hidden rounded-[30px] border border-slate-200 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80`}>
      <div className="flex w-full flex-col gap-4 p-5 transition hover:bg-blue-50/50 dark:hover:bg-slate-900 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="math-expand-trigger flex min-w-0 flex-1 items-start gap-4 text-left focus:outline-none"
        >
          <span className="math-expand-icon mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200">
            {open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
          </span>
          <div className="min-w-0">
            <div className="text-lg font-black leading-6 text-slate-950 dark:text-white">{title}</div>
            {subtitle ? <div className="mt-1 text-sm font-semibold leading-6 text-slate-500">{subtitle}</div> : null}
            {meta ? <div className="mt-3 flex flex-wrap gap-2">{meta}</div> : null}
          </div>
        </button>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">{actions}</div> : null}
      </div>

      <div className={`math-expand-content ${open ? "math-expand-content-open" : ""}`}>
        <div className={`math-expand-content-inner ${defaultOpenBorder ? "border-t border-slate-100 dark:border-slate-800" : ""} p-4 sm:p-5`}>
          {children}
        </div>
      </div>
    </article>
  );
}

export function LevelStrip({
  kicker,
  title,
  subtitle,
  children,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="math-level-strip rounded-[26px] border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
      {kicker ? <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-600">{kicker}</p> : null}
      <h3 className="mt-1 text-base font-black text-slate-950 dark:text-white">{title}</h3>
      {subtitle ? <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{subtitle}</p> : null}
      {children ? <div className="mt-4 space-y-3">{children}</div> : null}
    </section>
  );
}

export function WorkCard({
  title,
  subtitle,
  chips,
  details,
  actions,
  tone = "default",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  chips?: ReactNode;
  details?: ReactNode;
  actions?: ReactNode;
  tone?: "default" | "danger" | "success" | "warning";
}) {
  const ring =
    tone === "danger"
      ? "border-rose-200 bg-rose-50/60"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50/50"
        : tone === "warning"
          ? "border-amber-200 bg-amber-50/50"
          : "border-slate-200 bg-white/90 dark:border-slate-800 dark:bg-slate-950/80";

  return (
    <div className={`rounded-[24px] border p-4 shadow-sm ${ring}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h4 className="text-base font-black leading-6 text-slate-950 dark:text-white">{title}</h4>
          {subtitle ? <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{subtitle}</p> : null}
          {chips ? <div className="mt-3 flex flex-wrap gap-2">{chips}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      {details ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{details}</div> : null}
    </div>
  );
}

export function DetailTile({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <div className="mt-1 text-sm font-black text-slate-950 dark:text-white">{value}</div>
    </div>
  );
}
