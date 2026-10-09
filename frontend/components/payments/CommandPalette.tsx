"use client";

// 2026-10-09 (Payments revamp R1): ⌘K / Ctrl+K search for the Payments
// pages. One box for students (name, ID, parent, mobile), invoice and
// receipt numbers, payment references and Razorpay ids, plus shortcuts to
// the common jobs. Arrow keys move, Enter opens, Esc closes.

import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarCheck,
  CreditCard,
  FilePlus2,
  FileText,
  HandCoins,
  Loader2,
  ReceiptText,
  Search,
  Settings,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useQuickPay } from "@/components/payments/QuickPay";
import { AccountHref, useStudentPanel } from "@/components/payments/StudentPanel";
import { searchPayments } from "@/lib/api/payments";

import "./payments-r1.css";

type Item = {
  key: string;
  group: string;
  icon: LucideIcon;
  title: string;
  detail?: string;
  side?: string;
  sideTone?: "amber" | "emerald" | "slate" | "rose";
  run: () => void;
};

const SHORTCUTS: { title: string; detail: string; href: string; icon: LucideIcon; words: string; quickPay?: boolean }[] = [
  { title: "Record a payment", detail: "Quick Pay", href: "/admin/payments/collections?tab=student-fees", icon: HandCoins, words: "record payment receive collect cash upi counter quick pay", quickPay: true },
  { title: "Close the day", detail: "Collections › Day Close", href: "/admin/payments/collections?tab=day-close", icon: CalendarCheck, words: "day close cash count drawer end of day today" },
  { title: "Bill this month", detail: "Invoices › Monthly Billing", href: "/admin/payments/invoices?tab=monthly", icon: CalendarCheck, words: "bill month monthly fee drafts release billing january february march april may june july august september october november december" },
  { title: "Generate invoices", detail: "Invoices › Generate (one-time items)", href: "/admin/payments/invoices?tab=generate", icon: FilePlus2, words: "generate invoices bill one time registration book bag raise" },
  { title: "Collections report", detail: "Reports › Collections", href: "/admin/payments/reports?tab=collections", icon: BarChart3, words: "today collection report method staff" },
  { title: "Dues", detail: "Reports › Dues", href: "/admin/payments/reports?tab=dues", icon: Wallet, words: "dues pending unpaid overdue outstanding" },
  { title: "Online payments", detail: "Collections › Online Payments", href: "/admin/payments/collections?tab=online", icon: CreditCard, words: "online razorpay failed attention pay link" },
  { title: "All invoices", detail: "Invoices", href: "/admin/payments/invoices?tab=all", icon: FileText, words: "invoices list all" },
  { title: "All payments", detail: "Collections › Payments", href: "/admin/payments/collections?tab=payments", icon: ReceiptText, words: "payments receipts list all" },
  { title: "Add an expense", detail: "Expenses", href: "/admin/payments/expenses?tab=expenses", icon: BarChart3, words: "expense spend bill add" },
  { title: "Payment settings", detail: "Business details, numbering, fees, online", href: "/admin/payments/settings", icon: Settings, words: "settings numbering business centres fee setup online razorpay" },
];

function useDebounced<T>(value: T, delay = 180): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function PaymentsSearchButton({ onOpen, block = false }: { onOpen: () => void; block?: boolean }) {
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)), []);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`math-focus-ring inline-flex h-11 min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white/90 px-3.5 text-sm font-bold text-slate-500 shadow-sm transition hover:border-cyan-300 hover:text-slate-700 dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-400 dark:hover:border-cyan-700 dark:hover:text-slate-200 ${block ? "w-full" : "w-full sm:w-auto sm:min-w-[300px]"}`}
      aria-label="Search payments"
      aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
    >
      <Search size={16} />
      <span className="min-w-0 flex-1 truncate text-left"><span className="sm:hidden">Search student, invoice, receipt</span><span className="hidden sm:inline">Search a student, invoice or receipt…</span></span>
      <kbd className="hidden rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-black text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 sm:inline">{mac ? "⌘K" : "Ctrl K"}</kbd>
    </button>
  );
}

/** Opens on ⌘K / Ctrl+K anywhere on the page. */
export function useCommandPaletteShortcut(open: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const panel = useStudentPanel();
  const quickPay = useQuickPay();
  const [mounted, setMounted] = useState(false);
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const query = useDebounced(text.trim());
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (open) {
      setText("");
      setActive(0);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const results = useQuery({
    queryKey: ["admin", "payments", "search", query],
    queryFn: () => searchPayments(query),
    enabled: open && query.length >= 2,
    staleTime: 10_000,
  });

  const go = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  const items: Item[] = useMemo(() => {
    const needle = text.trim().toLowerCase();
    const list: Item[] = [];
    const shortcuts = SHORTCUTS.filter((item) => !needle || `${item.title} ${item.words}`.toLowerCase().includes(needle));
    const data = query.length >= 2 ? results.data : undefined;
    for (const student of data?.students ?? []) {
      list.push({
        key: `s-${student.studentId}`,
        group: "Students",
        icon: UserRound,
        title: `${student.name}${student.isActive ? "" : " (inactive)"}`,
        detail: [student.studentCode, student.parentName, student.mobile, student.centreName].filter(Boolean).join(" · "),
        side: student.due.paise > 0 ? `${student.due.display} due` : student.advance.paise > 0 ? `${student.advance.display} advance` : "Nothing due",
        sideTone: student.due.paise > 0 ? "amber" : "emerald",
        run: () => {
          if (panel) {
            onClose();
            panel.open(student.studentId);
          } else go(AccountHref(student.studentId));
        },
      });
    }
    // 2026-10-09 (revamp R2): "Record payment for <top student>".
    const top = data?.students?.[0];
    if (top && quickPay) {
      list.push({
        key: `qp-${top.studentId}`,
        group: "Actions",
        icon: HandCoins,
        title: `Record payment for ${top.name}`,
        detail: "Quick Pay",
        side: top.due.paise > 0 ? `${top.due.display} due` : undefined,
        sideTone: "amber",
        run: () => {
          onClose();
          quickPay.open(top.studentId);
        },
      });
    }
    for (const invoice of data?.invoices ?? []) {
      list.push({
        key: `i-${invoice.invoiceId}`,
        group: "Invoices",
        icon: FileText,
        title: invoice.invoiceNumber,
        detail: `${invoice.studentName} · ${invoice.feeName}${invoice.periodLabel ? ` · ${invoice.periodLabel}` : ""}`,
        side: invoice.status === "PAID" || invoice.status === "CANCELLED" ? invoice.statusLabel : `${invoice.balanceDisplay} due`,
        sideTone: invoice.status === "PAID" ? "emerald" : invoice.status === "CANCELLED" ? "slate" : invoice.isOverdue ? "rose" : "amber",
        run: () => go(`/admin/payments/invoices?tab=all&search=${encodeURIComponent(invoice.invoiceNumber)}&open=${encodeURIComponent(invoice.invoiceId)}`),
      });
    }
    for (const receipt of data?.receipts ?? []) {
      list.push({
        key: `r-${receipt.paymentId}`,
        group: "Receipts",
        icon: ReceiptText,
        title: receipt.receiptNumber,
        detail: `${receipt.studentName} · ${receipt.channel === "ONLINE" ? "Online" : "Counter"}${receipt.references.length ? ` · ${receipt.references.join(", ")}` : ""}`,
        side: receipt.status === "CANCELLED" ? "Cancelled" : receipt.amountDisplay,
        sideTone: receipt.status === "CANCELLED" ? "slate" : "emerald",
        run: () => go(`/admin/payments/collections?tab=payments&open=${encodeURIComponent(receipt.paymentId)}`),
      });
    }
    for (const order of data?.online ?? []) {
      list.push({
        key: `o-${order.orderRef}`,
        group: "Online payments",
        icon: CreditCard,
        title: order.razorpayPaymentId ?? order.razorpayOrderId,
        detail: `${order.studentName} · ${order.amountDisplay}${order.receiptNumber ? ` · ${order.receiptNumber}` : ""}`,
        side: order.statusLabel,
        sideTone: order.status === "PAID" ? "emerald" : order.status === "ATTENTION" ? "rose" : "slate",
        run: () => go(`/admin/payments/collections?tab=online&order=${encodeURIComponent(order.orderRef)}`),
      });
    }
    for (const item of shortcuts) {
      list.push({
        key: `a-${item.href}`, group: "Go to", icon: item.icon, title: item.title, detail: item.detail,
        run: () => {
          if (item.quickPay && quickPay) {
            onClose();
            quickPay.open();
          } else go(item.href);
        },
      });
    }
    return list;
  }, [text, query, results.data, panel, quickPay, onClose, go]);

  useEffect(() => setActive(0), [items.length, query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!mounted || !open) return null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(items.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      items[active]?.run();
    }
  };

  const searching = query.length >= 2 && results.isFetching && !results.data;
  const nothing = query.length >= 2 && results.data && !results.data.students.length && !results.data.invoices.length && !results.data.receipts.length && !results.data.online.length;
  let lastGroup = "";
  const toneClass = {
    amber: "text-amber-700 dark:text-amber-300",
    emerald: "text-emerald-700 dark:text-emerald-300",
    rose: "text-rose-700 dark:text-rose-300",
    slate: "text-slate-500 dark:text-slate-400",
  };

  return createPortal(
    <div className="fixed inset-0 z-[99995] flex items-start justify-center bg-slate-950/40 px-4 pt-[10vh] backdrop-blur-[2px] mp-fade-in" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search payments"
        className="mp-drop-in mp-panel-head flex max-h-[75vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 shadow-[0_30px_90px_-20px_rgba(15,23,42,0.55)] dark:border-slate-800"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 dark:border-slate-800">
          {searching ? <Loader2 size={18} className="shrink-0 animate-spin text-slate-400" /> : <Search size={18} className="shrink-0 text-slate-400" />}
          <input
            ref={inputRef}
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Search a student, mobile, invoice, receipt or Razorpay id…"
            className="h-14 min-w-0 flex-1 bg-transparent text-base font-semibold text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
            role="combobox"
            aria-label="Search payments"
            aria-expanded="true"
            aria-controls="mp-palette-list"
            aria-activedescendant={items[active] ? `mp-palette-${items[active].key}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-black text-slate-400 dark:border-slate-700 sm:inline">Esc</kbd>
        </div>
        <div ref={listRef} id="mp-palette-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-2">
          {nothing ? <p className="px-3 py-3 text-sm font-semibold text-slate-500">Nothing found for “{query}”. Try a name, a student ID, the last digits of a mobile, or a number such as 631.</p> : null}
          {query.length === 1 ? <p className="px-3 py-2 text-xs font-semibold text-slate-400">Keep typing…</p> : null}
          {items.map((item, index) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            const Icon = item.icon;
            return (
              <div key={item.key}>
                {header ? <p className="px-3 pb-1 pt-3 text-xs font-black text-slate-400 dark:text-slate-500">{header}</p> : null}
                <button
                  type="button"
                  id={`mp-palette-${item.key}`}
                  role="option"
                  aria-selected={index === active}
                  data-index={index}
                  onMouseMove={() => setActive(index)}
                  onClick={() => item.run()}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${index === active ? "bg-cyan-50 dark:bg-cyan-950/40" : ""}`}
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${index === active ? "bg-white text-cyan-700 shadow-sm dark:bg-slate-900 dark:text-cyan-300" : "bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400"}`}>
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black text-slate-900 dark:text-white">{item.title}</span>
                    {item.detail ? <span className="block truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{item.detail}</span> : null}
                  </span>
                  {item.side ? <span className={`shrink-0 text-xs font-black tabular-nums ${toneClass[item.sideTone ?? "slate"]}`}>{item.side}</span> : null}
                </button>
              </div>
            );
          })}
        </div>
        <div className="hidden items-center gap-4 border-t border-slate-100 px-5 py-2.5 text-[11px] font-bold text-slate-400 dark:border-slate-800 sm:flex">
          <span><kbd className="font-black">↑↓</kbd> move</span>
          <span><kbd className="font-black">Enter</kbd> open</span>
          <span><kbd className="font-black">Esc</kbd> close</span>
          <span className="ml-auto">Students open in a side panel</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Set by PaymentsChrome: opens the search. */
export const PaymentsSearchContext = createContext<() => void>(() => undefined);

/** The search bar inside a Payments page's hero, under the title, left-aligned. */
export function HeroSearch() {
  const open = useContext(PaymentsSearchContext);
  return (
    <div className="mt-5 w-full max-w-xl">
      <PaymentsSearchButton onOpen={open} block />
    </div>
  );
}
