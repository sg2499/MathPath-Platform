"use client";

import { ArrowDownAZ, ArrowUpAZ } from "lucide-react";
import { NATURAL_SORT_KEY, type NaturalSortKey, type SortDirection, type SortFieldOption } from "@/lib/sortable";

/**
 * Field-select + direction-toggle pair that drives the same sort state a
 * table's clickable column-header arrows use (components/common/SortableHeader.tsx
 * + lib/sortable.ts's useSortableTable hook). Picking a field here defaults
 * to ascending, exactly like clicking that column's header for the first
 * time; the toggle button flips direction without changing the field.
 */
export function SortByDropdown<Key extends string>({
  fields,
  sortKey,
  direction,
  onChange,
  naturalLabel = "Default Order",
  className = "",
}: {
  fields: SortFieldOption<Key>[];
  sortKey: Key | NaturalSortKey;
  direction: SortDirection;
  onChange: (key: Key | NaturalSortKey, direction: SortDirection) => void;
  naturalLabel?: string;
  className?: string;
}) {
  const isNatural = sortKey === NATURAL_SORT_KEY;

  return (
    <div className={`flex items-stretch gap-2 ${className}`}>
      <select
        className="math-select flex-1"
        value={isNatural ? NATURAL_SORT_KEY : sortKey}
        onChange={(event) => {
          const nextKey = event.target.value as Key | NaturalSortKey;
          onChange(nextKey, "asc");
        }}
        aria-label="Sort by"
      >
        <option value={NATURAL_SORT_KEY}>{naturalLabel}</option>
        {fields.map((field) => (
          <option key={field.key} value={field.key}>
            Sort by {field.label}
          </option>
        ))}
      </select>
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
