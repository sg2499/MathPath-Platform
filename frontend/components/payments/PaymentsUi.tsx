"use client";

// 2026-10-08 (Payments): small building blocks shared by the admin payments
// screens -- a dialog, a metric tile, status chips and the change history.
import { listPaymentAudit, type PaymentAuditEntry } from "@/lib/api/payments";
import { apiErrorMessage } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { History, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function PaymentsDialog({
  open,
  title,
  kicker,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: string;
  kicker?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const first = panelRef.current?.querySelector<HTMLElement>("input, select, textarea, button");
    first?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || !mounted) return null;
  // Rendered on document.body: the page shell creates its own stacking
  // context, which would otherwise trap the dialog under the menu bar.
  return createPortal(
    <div
      className="math-dialog-overlay fixed inset-0 z-[99999] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`math-pop-in flex max-h-[92vh] w-full flex-col rounded-t-[28px] border !border-slate-200 !bg-white !shadow-[0_0_80px_rgba(0,0,0,0.35)] dark:!border-slate-800 dark:!bg-slate-950 sm:rounded-[32px] ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 pb-4 pt-5 dark:border-slate-800 sm:px-6">
          <div className="min-w-0">
            {kicker ? <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">{kicker}</p> : null}
            <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="math-focus-ring rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

export function PaymentsMetric({ label, value, icon, tone = "slate" }: { label: string; value: ReactNode; icon: ReactNode; tone?: "slate" | "emerald" | "amber" | "cyan" }) {
  const toneClass = {
    slate: "text-slate-700 dark:text-slate-200",
    emerald: "text-emerald-700 dark:text-emerald-300",
    amber: "text-amber-700 dark:text-amber-300",
    cyan: "text-cyan-700 dark:text-cyan-300",
  }[tone];
  return (
    <div className="min-w-[132px] rounded-3xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/60">
      <div className={`flex items-center gap-2 whitespace-nowrap text-xs font-black uppercase tracking-[0.12em] ${toneClass}`}>
        {icon}
        {label}
      </div>
      <div className="mt-1 whitespace-nowrap text-2xl font-black tabular-nums text-slate-950 dark:text-white">{value}</div>
    </div>
  );
}

export function StatusPill({ active, activeLabel = "Active", inactiveLabel = "Inactive" }: { active: boolean; activeLabel?: string; inactiveLabel?: string }) {
  return active ? (
    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">{activeLabel}</span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-500 dark:bg-slate-900 dark:text-slate-400">{inactiveLabel}</span>
  );
}

export function FieldLabel({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-black text-slate-700 dark:text-slate-200">
      <span>{children}</span>
      {hint ? <span className="text-xs font-semibold text-slate-400">{hint}</span> : null}
    </span>
  );
}

export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs font-bold text-rose-600 dark:text-rose-300">{message}</p>;
}

export function InlineError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
      {apiErrorMessage(error)}
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Created",
  UPDATE: "Edited",
  ACTIVATE: "Switched on",
  DEACTIVATE: "Switched off",
  REORDER: "Order changed",
  SET_NEXT_NUMBER: "Next number set",
  SET_CENTRE: "Centre changed",
  CANCEL: "Cancelled",
  ADVANCE_APPLIED: "Advance applied",
  REVOKE: "Pay link switched off",
};

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  description: "Description",
  amount: "Amount",
  gstIncluded: "GST included",
  billingType: "Billing",
  displayOrder: "Position",
  isActive: "Active",
  legalName: "Legal name",
  brandName: "Brand name",
  gstin: "GSTIN",
  pan: "PAN",
  registeredAddress: "Registered address",
  email: "Email",
  phone: "Phone",
  logoUrl: "Logo",
  invoiceFooter: "Invoice footer",
  address: "Address",
  centre: "Centre",
  nextFormatted: "Next number",
  order: "Order",
  invoiceNumber: "Invoice",
  feeName: "Fee",
  period: "Period",
  invoiceDate: "Invoice date",
  dueDate: "Due date",
  status: "Status",
  receiptNumber: "Receipt",
  paymentDate: "Date",
  discount: "Discount",
  discountReason: "Discount reason",
  methods: "Paid by method",
  appliedTo: "Applied to",
  advance: "Advance",
  advanceLeft: "Advance left",
  movedToAdvance: "Moved to advance",
  payBy: "Paid by",
  receivedBy: "Received by",
  note: "Note",
  expenseNumber: "Expense",
  expenseDate: "Date",
  category: "Category",
  item: "Item",
  vendor: "Vendor",
  billNumber: "Bill number",
  details: "Details",
  studentFeesEnabled: "Fees shown to students",
  onlinePaymentsEnabled: "Online payments",
  expiresAt: "Pay link works until",
  channel: "Channel",
  razorpayPaymentId: "Razorpay payment",
};

const DATE_KEYS = new Set(["expenseDate", "paymentDate", "invoiceDate", "dueDate", "expiresAt"]);

function ShowValue(value: unknown, key?: string, entityType?: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "expiresAt" && typeof value === "string") value = value.slice(0, 10);
  if (["amount", "discount", "advance", "advanceLeft", "movedToAdvance"].includes(key ?? "") && typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) {
    return `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return value
      .map((item) => (item && typeof item === "object" && "invoiceNumber" in item ? `${(item as { invoiceNumber: string }).invoiceNumber} ₹${Number((item as { amount: string }).amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : String(item)))
      .join(", ");
  }
  if (value === "MONTHLY") return "Monthly";
  if (value === "ONE_TIME") return "One-time";
  if (value === "PENDING") return "Pending";
  if (value === "PART_PAID") return "Part-paid";
  if (value === "PAID") return "Paid";
  if (value === "CANCELLED") return "Cancelled";
  if (value === "ONLINE") return "Online (Razorpay)";
  if (value === "ACTIVE") return "On";
  if (value === "REVOKED") return "Switched off";
  if (value === "RECORDED") return entityType === "PAYMENT" ? "Received" : "Recorded";
  if (key && DATE_KEYS.has(key) && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  }
  return String(value);
}

function Changes({ entry }: { entry: PaymentAuditEntry }) {
  const before = entry.before || {};
  const after = entry.after || {};
  const student = (after.student ?? before.student) as string | undefined;
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter(
    (key) =>
      FIELD_LABELS[key] &&
      key !== "student" &&
      JSON.stringify(before[key]) !== JSON.stringify(after[key]) &&
      // On a "created" entry, only show the fields that were actually filled in.
      (entry.before !== null || (after[key] !== null && after[key] !== "" && key !== "displayOrder"))
  );
  if (!keys.length && !student) return null;
  return (
    <ul className="mt-2 grid gap-1">
      {student ? (
        <li className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span className="font-black text-slate-800 dark:text-slate-100">Student:</span> {student}
        </li>
      ) : null}
      {keys.map((key) => (
        <li key={key} className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span className="font-black text-slate-800 dark:text-slate-100">{FIELD_LABELS[key]}:</span>{" "}
          {entry.before ? (
            <>
              <span className="line-through decoration-slate-400">{ShowValue(before[key], key, entry.entityType)}</span> → {ShowValue(after[key], key, entry.entityType)}
            </>
          ) : (
            ShowValue(after[key], key, entry.entityType)
          )}
        </li>
      ))}
    </ul>
  );
}

export function PaymentsHistoryList({ entityType, entityId, limit = 50 }: { entityType?: string; entityId?: string; limit?: number }) {
  const query = useQuery({
    queryKey: ["admin", "payments", "audit", entityType ?? "ALL", entityId ?? "ALL", limit],
    queryFn: () => listPaymentAudit({ entityType, entityId, limit }),
  });
  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm font-bold text-slate-500">
        <Loader2 size={16} className="animate-spin" /> Loading history…
      </div>
    );
  }
  if (query.error) return <InlineError error={query.error} />;
  const entries = query.data ?? [];
  if (!entries.length) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm font-semibold text-slate-500 dark:border-slate-800">
        <History size={16} /> No changes recorded yet.
      </div>
    );
  }
  return (
    <ol className="grid gap-3">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-black text-slate-900 dark:text-white">{ACTION_LABELS[entry.action] ?? entry.action}</span>
            <span className="text-xs font-semibold text-slate-500">
              {entry.actorName || "System"} · {entry.createdAt ? new Date(entry.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : ""}
            </span>
          </div>
          {entry.reason ? <p className="mt-1 text-xs font-bold text-slate-600 dark:text-slate-300">Reason: {entry.reason}</p> : null}
          <Changes entry={entry} />
        </li>
      ))}
    </ol>
  );
}
