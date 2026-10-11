"use client";

// 2026-10-11 (Shailesh): Generate Invoices picks fee items from one clean
// dropdown instead of a wall of cards. Items sit under four headings
// (Monthly Fees, Level Content, Kit & Materials, Registration & Events);
// a fee item added later that fits none of them lands under "Other".
// What is picked shows below as small removable tags with the per-student
// total.
import type { FeeItem } from "@/lib/api/payments";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type GroupKey = "MONTHLY" | "LEVEL" | "KIT" | "REGISTRATION" | "OTHER";

const GROUPS: { key: GroupKey; title: string }[] = [
  { key: "MONTHLY", title: "Monthly Fees" },
  { key: "LEVEL", title: "Level Content" },
  { key: "KIT", title: "Kit & Materials" },
  { key: "REGISTRATION", title: "Registration & Events" },
  { key: "OTHER", title: "Other" },
];

export function FeeGroupOf(item: Pick<FeeItem, "name" | "billingType">): GroupKey {
  if (item.billingType === "MONTHLY") return "MONTHLY";
  const name = item.name.toLowerCase();
  if (/content|book|course|module|level|syllabus/.test(name)) return "LEVEL";
  if (/abacus|timer|bag|t-?shirt|kit|material|uniform|stationery|tool/.test(name)) return "KIT";
  if (/registration|admission|enrol|celebration|competition|event|exam|olympiad|annual/.test(name)) return "REGISTRATION";
  return "OTHER";
}

function Rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function FeeItemPicker({
  items,
  value,
  onChange,
  onOpenChange,
}: {
  items: FeeItem[];
  value: string[];
  onChange: (next: string[]) => void;
  // The card holding the picker rises above the cards below it while the
  // list is open, so the list is never drawn underneath them.
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const chosen = items.filter((item) => value.includes(item.feeItemId));
  const totalPaise = chosen.reduce((sum, item) => sum + item.amountPaise, 0);
  const allGst = chosen.length > 0 && chosen.every((item) => item.gstIncluded);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return GROUPS.map((group) => ({
      ...group,
      items: items.filter((item) => FeeGroupOf(item) === group.key && (!needle || item.name.toLowerCase().includes(needle))),
    })).filter((group) => group.items.length > 0);
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    function onPointer(event: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // A new search starts from the top of the list.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [query]);

  useEffect(() => {
    if (!open) setQuery("");
    onOpenChange?.(open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggle(feeItemId: string) {
    onChange(value.includes(feeItemId) ? value.filter((id) => id !== feeItemId) : [...value, feeItemId]);
  }

  const buttonLabel = !chosen.length
    ? "Select Fee Items"
    : chosen.length === 1
      ? chosen[0].name
      : `${chosen.length} Fee Items Selected`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="math-input flex w-full items-center justify-between gap-3 text-left"
      >
        <span className={`min-w-0 truncate ${chosen.length ? "font-bold text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>{buttonLabel}</span>
        <ChevronDown size={18} className={`shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-[#ffffff] shadow-xl dark:border-slate-700 dark:bg-[#0d1526]">
          <div className="border-b border-slate-100 p-2 dark:border-slate-800">
            <div className="flex items-center gap-2 rounded-xl border border-transparent bg-slate-50 px-3 focus-within:border-cyan-400 dark:bg-slate-950/70 dark:focus-within:border-cyan-600">
              <Search size={15} className="shrink-0 text-slate-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Fee Items"
                aria-label="Search fee items"
                className="h-10 w-full min-w-0 appearance-none border-0 bg-transparent p-0 text-sm font-semibold text-slate-900 shadow-none outline-none ring-0 placeholder:text-slate-400 focus:border-0 focus:shadow-none focus:outline-none focus:ring-0 dark:text-white"
                style={{ boxShadow: "none", outline: "none" }}
              />
            </div>
          </div>
          <div ref={listRef} role="listbox" aria-multiselectable="true" aria-label="Fee items" className="max-h-[360px] overflow-y-auto py-1">
            {!groups.length ? (
              <p className="px-4 py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">No fee item matches “{query.trim()}”.</p>
            ) : (
              groups.map((group) => (
                <div key={group.key} className="py-1">
                  <p className="px-4 pb-1 pt-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{group.title}</p>
                  {group.items.map((item) => {
                    const checked = value.includes(item.feeItemId);
                    return (
                      <button
                        key={item.feeItemId}
                        type="button"
                        role="option"
                        aria-selected={checked}
                        onClick={() => toggle(item.feeItemId)}
                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition ${checked ? "bg-cyan-50/80 dark:bg-cyan-950/40" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"}`}
                      >
                        <span
                          className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border ${checked ? "border-cyan-600 bg-cyan-600 text-white dark:border-cyan-400 dark:bg-cyan-500" : "border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-950"}`}
                        >
                          {checked ? <Check size={13} strokeWidth={3} /> : null}
                        </span>
                        <span className="min-w-0 flex-1 font-bold text-slate-800 dark:text-slate-100">{item.name}</span>
                        <span className="shrink-0 font-black tabular-nums text-slate-950 dark:text-white">{item.amountDisplay}</span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{chosen.length ? `${chosen.length} Selected` : "Nothing Selected"}</span>
            <div className="flex items-center gap-2">
              {chosen.length ? (
                <button type="button" onClick={() => onChange([])} className="rounded-lg px-2.5 py-1 text-xs font-black text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                  Clear All
                </button>
              ) : null}
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-black text-white hover:bg-slate-700 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400">
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {chosen.length ? (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-wrap gap-2">
            {chosen.map((item) => (
              <span
                key={item.feeItemId}
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50/80 py-1 pl-3 pr-1 text-xs font-bold text-slate-800 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-slate-100"
              >
                <span className="min-w-0 truncate">{item.name}</span>
                <span className="shrink-0 font-black tabular-nums">{item.amountDisplay}</span>
                <button
                  type="button"
                  onClick={() => toggle(item.feeItemId)}
                  aria-label={`Remove ${item.name}`}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-white hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  <X size={12} strokeWidth={3} />
                </button>
              </span>
            ))}
          </div>
          <p className="shrink-0 text-sm font-bold text-slate-600 dark:text-slate-300 sm:pt-1">
            Per Student: <span className="font-black tabular-nums text-slate-950 dark:text-white">{Rupees(totalPaise)}</span>
            {allGst ? " Incl. GST" : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
