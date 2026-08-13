"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, ChevronDown } from "lucide-react";
import { NATURAL_SORT_KEY, type NaturalSortKey, type SortDirection, type SortFieldOption } from "@/lib/sortable";

/**
 * "Sort By" menu button paired with a direction toggle, driving the same
 * sort state a table's clickable column-header arrows use
 * (components/common/SortableHeader.tsx + lib/sortable.ts's
 * useSortableTable hook). 2026-08-13: this used to be a native <select>
 * whose closed-state text mirrored the current selection (e.g. "Default
 * Order (Student Code)") with every option prefixed "Sort by ..." -- per
 * explicit direction, the trigger now always reads the fixed label "Sort
 * By" regardless of state, the menu lists only plain field names, and there
 * is no "Default Order" entry at all (natural order is reached only via the
 * 3rd click on a column header, same as before).
 */
export function SortByDropdown<Key extends string>({
  fields,
  sortKey,
  direction,
  onChange,
  className = "",
}: {
  fields: SortFieldOption<Key>[];
  sortKey: Key | NaturalSortKey;
  direction: SortDirection;
  onChange: (key: Key | NaturalSortKey, direction: SortDirection) => void;
  className?: string;
}) {
  const isNatural = sortKey === NATURAL_SORT_KEY;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={`flex items-stretch gap-2 ${className}`}>
      <div className="relative flex-1">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="math-select flex w-full items-center justify-between gap-2"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span>Sort By</span>
          <ChevronDown size={16} className={`shrink-0 transition ${open ? "rotate-180" : ""}`} />
        </button>
        {open ? (
          <ul
            role="listbox"
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          >
            {fields.map((field) => {
              const active = !isNatural && sortKey === field.key;
              return (
                <li key={field.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(field.key, "asc");
                      setOpen(false);
                    }}
                    className={`block w-full px-4 py-2 text-left text-sm font-bold transition ${
                      active
                        ? "bg-blue-600 text-white"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    }`}
                  >
                    {field.label}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      <button
        type="button"
        disabled={isNatural}
        onClick={() => onChange(sortKey, direction === "asc" ? "desc" : "asc")}
        title={direction === "asc" ? "Ascending -- click for descending" : "Descending -- click for ascending"}
        aria-label={direction === "asc" ? "Sort ascending" : "Sort descending"}
        className="math-select inline-flex w-11 shrink-0 items-center justify-center px-0 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {direction === "asc" ? <ArrowUpAZ size={16} /> : <ArrowDownAZ size={16} />}
      </button>
    </div>
  );
}
