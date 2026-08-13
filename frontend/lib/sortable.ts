"use client";

/**
 * Shared sorting engine used by every sortable table across admin, teacher,
 * and student areas (2026-08-12 consolidation). Before this, six to eight
 * separate pages each reimplemented their own "click a header to sort"
 * logic, with inconsistent 3rd-click behavior (some reset to natural order,
 * some didn't, some had dead/unreachable sort keys). This file is the single
 * source of truth going forward: one comparator, one 3-state cycle
 * (ascending -> descending -> natural), used via useSortableTable() plus the
 * shared <SortableHeader> (components/common/SortableHeader.tsx) and
 * <SortByDropdown> (components/common/SortByDropdown.tsx) components.
 */
import { useMemo, useState } from "react";
import { usePersistentUiState } from "@/lib/persistedUiState";

export type SortDirection = "asc" | "desc";

/** Sentinel sort key meaning "not sorted by any field -- use naturalOrder()." */
export const NATURAL_SORT_KEY = "__natural__" as const;
export type NaturalSortKey = typeof NATURAL_SORT_KEY;

export interface SortFieldOption<Key extends string> {
  key: Key;
  label: string;
}

function normalizeSortValue(value: unknown): string | number {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const text = String(value).trim();
  if (text === "") return "";

  // Only treat a string as a date if it actually looks like one (ISO date,
  // or d/m/y-ish) -- the previous per-page implementations ran Date.parse()
  // on every string, which risked misreading things like student codes.
  if (/^\d{4}-\d{2}-\d{2}([T ]|$)/.test(text) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(text)) {
    const parsed = Date.parse(text);
    if (!Number.isNaN(parsed)) return parsed;
  }

  if (/^-?\d+(\.\d+)?$/.test(text)) {
    const numeric = Number(text);
    if (!Number.isNaN(numeric)) return numeric;
  }

  return text.toLowerCase();
}

export function compareSortValues(a: unknown, b: unknown): number {
  const av = normalizeSortValue(a);
  const bv = normalizeSortValue(b);
  if (typeof av === "number" && typeof bv === "number") return av - bv;
  return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
}

export interface SortState<Key extends string> {
  key: Key | NaturalSortKey;
  direction: SortDirection;
}

export interface UseSortableTableOptions<Row, Key extends string> {
  rows: Row[];
  valueFor: (row: Row, key: Key) => unknown;
  /**
   * Defines what "natural order" means for this table. Defaults to the raw
   * array order already returned by the API/caller. Pass a custom function
   * to preserve a table's existing meaningful default (e.g. chronological
   * by assigned date, or priority-based) -- the 3rd header click and the
   * dropdown's "Default Order" option both resolve to this.
   */
  naturalOrder?: (rows: Row[]) => Row[];
  /** Persist sort choice across visits, same as any other filter/search state. */
  storageKey?: string;
}

export interface UseSortableTableResult<Row, Key extends string> {
  sortKey: Key | NaturalSortKey;
  sortDirection: SortDirection;
  sortedRows: Row[];
  /** Wire directly to a <SortableHeader onClick={() => toggleSort("field")}>. */
  toggleSort: (key: Key) => void;
  /** Wire directly to <SortByDropdown onChange={setSort}>. */
  setSort: (key: Key | NaturalSortKey, direction?: SortDirection) => void;
}

/**
 * Plain-function equivalents of the hook's cycle + sort logic, for the rare
 * case a table can't call useSortableTable directly (e.g. rows are grouped
 * and rendered inside a .map(), so the row count -- and therefore how many
 * "instances" of a table exist -- varies per render, which rules hooks
 * don't allow). One useState({key, direction}) at the parent level plus
 * these two functions reproduces the exact same natural -> asc -> desc ->
 * natural cycle as useSortableTable.
 */
export function nextSortState<Key extends string>(current: SortState<Key>, key: Key): SortState<Key> {
  if (current.key !== key) return { key, direction: "asc" };
  if (current.direction === "asc") return { key, direction: "desc" };
  return { key: NATURAL_SORT_KEY, direction: "asc" };
}

export function sortRowsWithState<Row, Key extends string>(
  rows: Row[],
  state: SortState<Key>,
  valueFor: (row: Row, key: Key) => unknown,
  naturalOrder?: (rows: Row[]) => Row[],
): Row[] {
  if (state.key === NATURAL_SORT_KEY) {
    return naturalOrder ? naturalOrder(rows) : rows.slice();
  }
  const key = state.key as Key;
  return rows.slice().sort((a, b) => {
    const result = compareSortValues(valueFor(a, key), valueFor(b, key));
    return state.direction === "asc" ? result : -result;
  });
}

export function useSortableTable<Row, Key extends string>({
  rows,
  valueFor,
  naturalOrder,
  storageKey,
}: UseSortableTableOptions<Row, Key>): UseSortableTableResult<Row, Key> {
  const initial: SortState<Key> = { key: NATURAL_SORT_KEY, direction: "asc" };
  const plainState = useState<SortState<Key>>(initial);
  const persistentState = usePersistentUiState<SortState<Key>>(storageKey ?? "__unused__", initial);
  const [state, setState] = storageKey ? persistentState : plainState;

  function toggleSort(key: Key) {
    setState((current) => {
      if (current.key !== key) return { key, direction: "asc" };
      if (current.direction === "asc") return { key, direction: "desc" };
      return { key: NATURAL_SORT_KEY, direction: "asc" };
    });
  }

  function setSort(key: Key | NaturalSortKey, direction: SortDirection = "asc") {
    setState({ key, direction });
  }

  const sortedRows = useMemo(() => {
    if (state.key === NATURAL_SORT_KEY) {
      return naturalOrder ? naturalOrder(rows) : rows.slice();
    }
    const key = state.key as Key;
    return rows.slice().sort((a, b) => {
      const result = compareSortValues(valueFor(a, key), valueFor(b, key));
      return state.direction === "asc" ? result : -result;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, state.key, state.direction]);

  return { sortKey: state.key, sortDirection: state.direction, sortedRows, toggleSort, setSort };
}
