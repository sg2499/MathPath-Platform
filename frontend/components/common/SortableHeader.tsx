"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { SortDirection } from "@/lib/sortable";

// Re-exported for backward compatibility -- some pages still import
// SortDirection from here rather than from lib/sortable.ts directly.
export type { SortDirection };

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
  // 2026-09-02 -- swapped the ▲▼↕ text glyphs for real lucide SVG icons,
  // matching the sort-icon convention DetailWorkspaceViews.tsx already
  // uses elsewhere in this app. Unicode triangle glyphs render at
  // noticeably different sizes/weights/baselines across OS and browser
  // font stacks -- part of why this looked "clean on my machine" but
  // inconsistent on others. An SVG renders identically everywhere.
  // lucide icons default to stroke="currentColor", so every existing
  // `color`/`text-*` override across the table-header CSS (dozens of
  // per-table/per-theme blocks in globals.css) still applies unchanged.
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  const NextDirectionLabel = !active ? "ascending" : direction === "asc" ? "descending" : "default order";

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Sort ${typeof children === "string" ? children : "this column"} ${NextDirectionLabel}`}
      aria-label={`Sort ${typeof children === "string" ? children : "this column"} ${NextDirectionLabel}`}
      className={`math-sortable-header group inline-flex w-full min-w-0 items-center gap-1.5 ${Justify} text-left font-black uppercase tracking-[0.14em] text-slate-500 transition hover:text-slate-700 focus-visible:outline-none focus-visible:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 dark:focus-visible:text-slate-200`}
    >
      {/* min-w-0 + truncate is what actually keeps this self-contained on
          any screen size: without it the label can only shrink down to its
          own text's intrinsic width, so on a column that's a bit tight the
          overflowing text renders past its box instead of clipping --
          visually colliding with the icon in a way that looked different
          (and inconsistent) depending on exactly how much overflow there
          was. truncate (overflow:hidden + ellipsis + nowrap) makes the
          label degrade the same clean way everywhere, with no dependency
          on any table-specific `white-space:nowrap` CSS elsewhere. */}
      <span
        className="math-sortable-header-label min-w-0 truncate leading-[1.16]"
        title={typeof children === "string" ? children : undefined}
      >
        {children}
      </span>
      {/* shrink-0 reserves the icon its own fixed slot so it can never be
          squeezed or partially covered by the label -- it always renders
          at full size in a consistent spot, and the label truncates first. */}
      <Icon
        className={`math-sortable-header-icon h-3 w-3 shrink-0 transition ${active ? "opacity-100" : "opacity-30 group-hover:opacity-70"}`}
        aria-hidden="true"
      />
    </button>
  );
}
