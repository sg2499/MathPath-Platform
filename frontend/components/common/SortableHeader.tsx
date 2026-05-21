"use client";

import type { ReactNode } from "react";

export type SortDirection = "asc" | "desc";

export function SortableHeader({
  active,
  direction,
  onClick,
  children,
  align = "left",
}: {
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  children: ReactNode;
  align?: "left" | "center" | "right";
}) {
  const Justify = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";

  return (
    <button
      type="button"
      onClick={onClick}
      title="Sort This Column"
      className={`math-sortable-header group inline-flex w-full items-center gap-1.5 ${Justify} text-left font-black uppercase tracking-[0.14em] text-slate-500 transition hover:text-slate-700 focus-visible:outline-none focus-visible:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 dark:focus-visible:text-slate-200`}
    >
      <span className="math-sortable-header-label min-w-0 leading-[1.16]">{children}</span>
      <span className={`math-sortable-header-icon text-[10px] transition ${active ? "opacity-100" : "opacity-30 group-hover:opacity-70"}`}>
        {active ? (direction === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </button>
  );
}
